import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { portalSession } from '@/lib/core/auth';
import { portalItems, portalRequestGuard, portalRequests } from '@/lib/services/portal';
import { ingestEvidence, markAllSubmitted, answerExplanation } from '@/lib/services/evidence';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { deuxLangues } from '@/app/portal/deux-langues';
import { traduire, type CleLibelle } from '@/lib/i18n/catalogue';
import { withJeton } from '@/lib/db/tenant';


async function PortalRequestPageCorps({
  params, searchParams,
}: {
  params: Promise<{ token: string; rid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { token, rid } = await params;
  const { erreur } = await searchParams;
  /* CHAQUE REFUS PORTE UN <h1> ET UN GESTE — trouvé en clôturant l'étape 4 du
     plan d'autonomie (2026-09-06) : depuis que le semeur crée le détail de
     compte AVANT la demande PBC (POP-01), la première demande listée par
     /eng/[id]/requests n'est plus systématiquement celle que le portail sert
     — et `npm run fumee` a exercé pour la première fois ce refus, resté SANS
     titre ET quasi vide (197 caractères, sous le plancher de 200 de la
     sonde). Ce n'est pas un défaut neuf : c'est exactement la même famille
     qu'un refus rendu en page 500 (règle 13, commentaire ci-dessous) — un
     écran sans en-tête ni contenu n'est pas un écran, que son code HTTP soit
     200 ou 500. Le lien de retour n'est pas qu'un supplément de texte : un
     client qui reçoit ce refus doit pouvoir AGIR, pas seulement le lire. */
  const session = await portalSession(token);
  if (!session) {
    return (
      <div className="shell"><div className="panel">
        <h1>{deuxLangues('portal.lienInvalide')}</h1>
        <p className="muted">{deuxLangues('portal.lienInvalideAide')}</p>
      </div></div>
    );
  }
  if (!(await portalRequestGuard(rid, session.contact.entity_id))) {
    return (
      <div className="shell"><div className="panel">
        <h1>{deuxLangues('req.requestNotFound')}</h1>
        <p><Link href={`/portal/${token}`}>{deuxLangues('portal.retour')}</Link></p>
      </div></div>
    );
  }
  const requests = await portalRequests(session.contact.entity_id);
  const request = requests.find((r) => r.id === rid);
  if (!request) {
    return (
      <div className="shell"><div className="panel">
        <h1>{deuxLangues('portal.demandeCloturee')}</h1>
        <p><Link href={`/portal/${token}`}>{deuxLangues('portal.retour')}</Link></p>
      </div></div>
    );
  }
  const lang = (request.language === 'fr' ? 'fr' : 'en') as 'fr' | 'en';
  const t = (cle: CleLibelle, vars?: Record<string, string | number>) => traduire(lang, cle, vars);
  const items = await portalItems(rid);

  async function uploadAction(formData: FormData) {
    'use server';
    return executer(`/portal/${token}/${rid}`, async () => {
      const s = await portalSession(token);
      if (!s || !(await portalRequestGuard(rid, s.contact.entity_id))) throw new Error('unauthorized');
      const file = formData.get('file') as File;
      const itemId = String(formData.get('item_id'));
      await ingestEvidence({
        engagementId: request!.engagement_id,
        requestItemId: itemId,
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        bytes: new Uint8Array(await file.arrayBuffer()),
        source: 'portal',
        uploadedBy: { kind: 'client_contact', id: s.contact.id },
      });
      revalidatePath(`/portal/${token}/${rid}`);
    });
  }

  async function answerAction(formData: FormData) {
    'use server';
    return executer(`/portal/${token}/${rid}`, async () => {
      const s = await portalSession(token);
      if (!s || !(await portalRequestGuard(rid, s.contact.entity_id))) throw new Error('unauthorized');
      await answerExplanation(String(formData.get('item_id')), s.contact.id, String(formData.get('text') ?? ''));
      revalidatePath(`/portal/${token}/${rid}`);
    });
  }

  async function allDoneAction() {
    'use server';
    return executer(`/portal/${token}/${rid}`, async () => {
      const s = await portalSession(token);
      if (!s || !(await portalRequestGuard(rid, s.contact.entity_id))) throw new Error('unauthorized');
      await markAllSubmitted(rid, s.contact.id);
      revalidatePath(`/portal/${token}/${rid}`);
    });
  }

  return (
    <div className="shell" style={{ maxWidth: 860 }}>
      <BandeauRefus erreur={erreur} />
      <p><Link href={`/portal/${token}`}>{t('portal.retour')}</Link></p>
      <h1>R-{String(request.seq_no).padStart(3, '0')} — {request.title}</h1>
      <div className="panel">
        <table className="data">
          <thead><tr><th>{t('portal.elementDemande')}</th><th>{t('portal.statut')}</th><th>{t('portal.action')}</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ maxWidth: 380 }}>{i.description}{Number(i.evidence_count) > 0 && <div className="faint">{i.evidence_count} {t('portal.fichiersTransmis')}</div>}</td>
                <td><span className={`badge ${i.status === 'complete' ? 'green' : i.status === 'uploaded' ? 'blue' : 'gray'}`}>{t(`portal.item.${i.status}` as CleLibelle)}</span></td>
                <td>
                  {i.kind === 'explanation' ? (
                    i.client_note ? <span className="muted">{i.client_note}</span> : (
                      <form action={answerAction} className="row">
                        <input type="hidden" name="item_id" value={i.id} />
                        <input type="text" name="text" placeholder={t('portal.explication')} style={{ width: 220 }} required />
                        <button className="btn small">{t('portal.repondre')}</button>
                      </form>
                    )
                  ) : (
                    <form action={uploadAction} className="row">
                      <input type="hidden" name="item_id" value={i.id} />
                      <input type="file" name="file" required style={{ maxWidth: 210 }} />
                      <button className="btn small">{t('portal.televerser')}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {request.status !== 'submitted' && (
          <form action={allDoneAction} className="mt">
            <button className="btn" style={{ background: 'var(--green)' }}>{t('portal.toutTransmis')}</button>
          </form>
        )}
        {request.status === 'submitted' && <p className="callout green mt">{t('portal.demandeComplete')}</p>}
      </div>
    </div>
  );
}

/* TOUT L'ÉCRAN SOUS LE JETON (migration 0141, mandat du soir 0.2). La revue
   hostile n°9 (constat 20) l'avait mesuré : le jeton était résolu sous
   dérogation, puis le CORPS de la page relisait dehors — sous un rôle sans
   BYPASSRLS, le contact du client recevait une page 500. C'est « un refus rendu
   en page 500 », mot pour mot dans la règle 13. La portée couvre désormais le
   rendu entier. */
export default async function PortalRequestPage(props: { params: Promise<{ token: string; rid?: string }> }) {
  const { token } = await props.params;
  if (!token) return PortalRequestPageCorps(props as never);
  return withJeton(token, () => PortalRequestPageCorps(props as never));
}
