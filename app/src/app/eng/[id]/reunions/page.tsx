import { requireMember } from '@/lib/core/auth';
import {
  contactsDeLaMission, contactsDisponibles, proposerCreneaux, invitations,
} from '@/lib/services/reunions';
import { BandeauRefus } from '@/app/bandeau-refus';
import { declarerCleAction, declarerDomaineAction, choisirCreneauAction, envoyerAction } from './actions';
import { tr } from '@/lib/i18n';

// LES RÉUNIONS (ADR-101). Tout ce qui s'affiche ici est DÉTERMINISTE et
// local ; la lecture d'agendas et l'envoi sont SIMULÉS, et l'écran le dit —
// ne pas le dire laisserait croire qu'une invitation est réellement partie.

const fr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const heure = (iso: string) => iso.slice(11, 16);

export default async function ReunionsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; de?: string; a?: string; duree?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur, de, a, duree } = await searchParams;
  await requireMember(id);
  const contacts = await contactsDeLaMission(id);
  const disponibles = await contactsDisponibles(id);
  const invs = await invitations(id);
  const cle = contacts.find((c) => c.role === 'cle');

  /* La proposition de créneaux est une LECTURE (libre/occupé seulement) —
     paramétrée par l'URL, donc rejouable. */
  let proposition: Awaited<ReturnType<typeof proposerCreneaux>> | null = null;
  let refusCreneaux = '';
  if (de && a) {
    try {
      proposition = await proposerCreneaux(id, new Date(`${de}T00:00:00Z`), new Date(`${a}T00:00:00Z`), Number(duree ?? 60));
    } catch (e) {
      refusCreneaux = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="callout warn">
        <strong>{t('reun.calendarReadingAndSendingSimulated')}</strong> {t('reun.adaptateurDemo')}
      </div>

      <div className="panel">
        <h2>{t('reun.theEngagementContacts')}</h2>
        {/* LE PARAGRAPHE D'EXPLICATION SORT (règle générale de la revue n°1,
            rappelée par la revue n°2). Les contacts eux-mêmes DÉMÉNAGENT vers
            une section client à la création du dossier (P1) : ils restent ici
            tant que cet écran n'existe pas, parce qu'un contact clé est exigé
            pour envoyer une circularisation — le retirer sans destination
            casserait ce chemin. */}
        {contacts.length === 0
          ? <p className="muted">{t('reun.noContactDeclaredStartWithThe')}</p>
          : (
            <table className="data">
              <thead><tr><th>{t('reun.contact')}</th><th>{t('reun.role')}</th><th>{t('reun.area')}</th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nom} <span className="faint">{c.titre ?? ''}</span></td>
                    <td>{c.role === 'cle' ? <span className="badge green">{t('reun.keyContact')}</span> : <span className="badge gray">{t('col.area')}</span>}</td>
                    <td>{c.domaine ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        <div className="row mt">
          <form action={declarerCleAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <select name="contact" defaultValue="">
              <option value="">{t('reun.keyContact2')}</option>
              {disponibles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <button className="btn small">{t('reun.declareKeyContact')}</button>
          </form>
          <form action={declarerDomaineAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <select name="contact" defaultValue="">
              <option value="">{t('reun.contact2')}</option>
              {disponibles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <input name="domaine" placeholder={t('reun.areaSalesTreasury')} />
            <button className="btn secondary small">{t('reun.declareByArea')}</button>
          </form>
        </div>
      </div>

      <div className="panel">
        <h2>{t('reun.proposeSlots')} <span className="ai-flag">{t('reun.simulatedAvailabilityFreeBusyOnly')}</span></h2>
        <form method="get" className="row">
          <label className="row" style={{ gap: 4 }}>du <input name="de" placeholder="AAAA-MM-JJ" defaultValue={de ?? '2026-03-02'} style={{ width: 110 }} /></label>
          <label className="row" style={{ gap: 4 }}>au <input name="a" placeholder="AAAA-MM-JJ" defaultValue={a ?? '2026-03-06'} style={{ width: 110 }} /></label>
          <label className="row" style={{ gap: 4 }}>{t('reun.durationMin')} <input name="duree" defaultValue={duree ?? '60'} style={{ width: 60 }} /></label>
          <button className="btn secondary small">{t('reun.findTheCommonSlots')}</button>
        </form>
        {refusCreneaux && <div className="callout danger mt">{refusCreneaux}</div>}
        {proposition && (
          <>
            {/* QUI A ÉTÉ LU, PAR QUEL ADAPTATEUR, ET COMBIEN DE CRÉNEAUX EN SORTENT.
                « Simulé » sans dire ce qui a été lu ne se vérifie pas. */}
            <p className="faint mt">
              {t('reun.agendasLus', { adaptateur: proposition.adaptateur, equipe: proposition.equipe.join(', ') })}{' '}
              {t('reun.nCreneaux', { n: proposition.creneaux.length })}
            </p>
            {proposition.creneaux.map((c) => (
              <form action={choisirCreneauAction} className="row" key={c.debut} style={{ marginTop: 6 }}>
                <input type="hidden" name="engagement_id" value={id} />
                <input type="hidden" name="debut" value={c.debut} />
                <input type="hidden" name="fin" value={c.fin} />
                <span style={{ minWidth: 210 }}>{fr(c.debut)} · {heure(c.debut)}–{heure(c.fin)} UTC</span>
                <input name="objet" placeholder={t('reun.subjectOfTheMeeting')} style={{ flex: 1 }} />
                <select name="destinataire" defaultValue={cle?.client_contact_id ?? ''}>
                  <option value="">{t('reun.recipientHuman')}</option>
                  {disponibles.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select>
                <button className="btn small">{t('reun.pickThisSlot')}</button>
              </form>
            ))}
          </>
        )}
      </div>

      <div className="panel">
        <h2>{t('reun.invitations')}</h2>
        {invs.length === 0 ? <p className="muted">{t('reun.noInvitationThePathKeyContact')}</p>
          : invs.map((i) => (
            <div className={`callout ${i.statut === 'envoyee_simulee' ? 'green' : ''}`} key={i.id}>
              <strong>{i.objet}</strong>{' '}
              <span className="badge gray">{i.statut === 'envoyee_simulee' ? t('reun.envoyeeSimulee') : t('reun.chosenToSend')}</span>
              <p style={{ margin: '4px 0' }}>
                {fr(i.debut)} · {heure(i.debut)}–{heure(i.fin)} {t('reun.utcDestinataire')} {i.destinataire}
              </p>
              <p className="faint" style={{ margin: '4px 0' }}>
                {t('reun.copiesInTheComputedOrder')} {i.copies.map((c) => `${c.nom} (${c.titre})`).join(' ; ')}
              </p>
              <details><summary className="faint">{t('reun.theBodyOfTheMessage')}</summary>
                <p style={{ whiteSpace: 'pre-wrap' }}>{i.corps}</p>
              </details>
              <div className="row mt">
                <a className="btn secondary small" href={`/api/reunion-ics/${i.id}`}>{t('reun.downloadTheIcs')}</a>
                {i.statut === 'choisie' && (
                  <form action={envoyerAction}>
                    <input type="hidden" name="engagement_id" value={id} />
                    <input type="hidden" name="invitation_id" value={i.id} />
                    <button className="btn small">{t('reun.sendSimulatedTransport')}</button>
                  </form>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
