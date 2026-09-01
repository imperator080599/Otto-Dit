import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { portalSession } from '@/lib/core/auth';
import { portalItems, portalRequestGuard, portalRequests } from '@/lib/services/portal';
import { ingestEvidence, markAllSubmitted, answerExplanation } from '@/lib/services/evidence';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { deuxLangues } from '@/app/portal/deux-langues';
import { traduire, type CleLibelle } from '@/lib/i18n/catalogue';


export default async function PortalRequestPage({
  params, searchParams,
}: {
  params: Promise<{ token: string; rid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { token, rid } = await params;
  const { erreur } = await searchParams;
  const session = await portalSession(token);
  if (!session) return <div className="shell"><div className="panel">{deuxLangues('portal.lienInvalide')}</div></div>;
  if (!(await portalRequestGuard(rid, session.contact.entity_id))) {
    return <div className="shell"><div className="panel">{deuxLangues('req.requestNotFound')}</div></div>;
  }
  const requests = await portalRequests(session.contact.entity_id);
  const request = requests.find((r) => r.id === rid);
  if (!request) return <div className="shell"><div className="panel">{deuxLangues('portal.demandeCloturee')}</div></div>;
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
