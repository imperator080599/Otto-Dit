import { requireMember } from '@/lib/core/auth';
import {
  contactsDeLaMission, contactsDisponibles, proposerCreneaux, invitations,
} from '@/lib/services/reunions';
import { BandeauRefus } from '@/app/bandeau-refus';
import { declarerCleAction, declarerDomaineAction, choisirCreneauAction, envoyerAction } from './actions';

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
        <strong>Lecture des agendas et envoi : SIMULÉS.</strong> Les disponibilités affichées
        sortent d&apos;un adaptateur de démonstration (libre/occupé seulement — jamais le contenu des
        agendas, qui est la donnée personnelle de l&apos;équipe), et « envoyer » ne fait partir aucune
        invitation réelle. Le branchement d&apos;un agenda d&apos;entreprise (Microsoft 365) est un chantier
        séparé : inscription d&apos;application, consentement de l&apos;administrateur du cabinet,
        permissions déléguées limitées au libre/occupé (ADR-101).
      </div>

      <div className="panel">
        <h2>Les contacts de la mission</h2>
        <p className="faint">
          Le contact CLÉ fait le lien entre nos demandes et les responsables internes ; les contacts
          par domaine répondent chacun de leur sujet. C&apos;est une donnée de la mission, pas de
          l&apos;entité.
        </p>
        {contacts.length === 0
          ? <p className="muted">Aucun contact déclaré — commencez par le contact clé.</p>
          : (
            <table className="data">
              <thead><tr><th>Contact</th><th>Rôle</th><th>Domaine</th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nom} <span className="faint">{c.titre ?? ''}</span></td>
                    <td>{c.role === 'cle' ? <span className="badge green">contact clé</span> : <span className="badge gray">domaine</span>}</td>
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
              <option value="">— contact clé —</option>
              {disponibles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <button className="btn small">Déclarer contact clé</button>
          </form>
          <form action={declarerDomaineAction} className="row">
            <input type="hidden" name="engagement_id" value={id} />
            <select name="contact" defaultValue="">
              <option value="">— contact —</option>
              {disponibles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <input name="domaine" placeholder="domaine (« ventes », « trésorerie »…)" />
            <button className="btn secondary small">Déclarer par domaine</button>
          </form>
        </div>
      </div>

      <div className="panel">
        <h2>Proposer des créneaux <span className="ai-flag">disponibilités simulées — libre/occupé seulement</span></h2>
        <form method="get" className="row">
          <label className="row" style={{ gap: 4 }}>du <input name="de" placeholder="AAAA-MM-JJ" defaultValue={de ?? '2026-03-02'} style={{ width: 110 }} /></label>
          <label className="row" style={{ gap: 4 }}>au <input name="a" placeholder="AAAA-MM-JJ" defaultValue={a ?? '2026-03-06'} style={{ width: 110 }} /></label>
          <label className="row" style={{ gap: 4 }}>durée (min) <input name="duree" defaultValue={duree ?? '60'} style={{ width: 60 }} /></label>
          <button className="btn secondary small">Chercher les créneaux communs</button>
        </form>
        {refusCreneaux && <div className="callout danger mt">{refusCreneaux}</div>}
        {proposition && (
          <>
            <p className="faint mt">
              Agendas lus (adaptateur « {proposition.adaptateur} ») : {proposition.equipe.join(', ')} —
              libre/occupé seulement. {proposition.creneaux.length} créneau(x) commun(s).
              <strong> Le choix du créneau est humain, toujours — rien ne part tout seul.</strong>
            </p>
            {proposition.creneaux.map((c) => (
              <form action={choisirCreneauAction} className="row" key={c.debut} style={{ marginTop: 6 }}>
                <input type="hidden" name="engagement_id" value={id} />
                <input type="hidden" name="debut" value={c.debut} />
                <input type="hidden" name="fin" value={c.fin} />
                <span style={{ minWidth: 210 }}>{fr(c.debut)} · {heure(c.debut)}–{heure(c.fin)} UTC</span>
                <input name="objet" placeholder="objet de la réunion" style={{ flex: 1 }} />
                <select name="destinataire" defaultValue={cle?.client_contact_id ?? ''}>
                  <option value="">— destinataire (humain) —</option>
                  {disponibles.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select>
                <button className="btn small">Choisir ce créneau</button>
              </form>
            ))}
          </>
        )}
      </div>

      <div className="panel">
        <h2>Invitations</h2>
        {invs.length === 0 ? <p className="muted">Aucune invitation. Le chemin : contact clé → créneaux → choix humain → envoi (simulé).</p>
          : invs.map((i) => (
            <div className={`callout ${i.statut === 'envoyee_simulee' ? 'green' : ''}`} key={i.id}>
              <strong>{i.objet}</strong>{' '}
              <span className="badge gray">{i.statut === 'envoyee_simulee' ? 'envoyée (SIMULÉE — rien n\'est parti)' : 'choisie — à envoyer'}</span>
              <p style={{ margin: '4px 0' }}>
                {fr(i.debut)} · {heure(i.debut)}–{heure(i.fin)} UTC · destinataire : {i.destinataire}
              </p>
              <p className="faint" style={{ margin: '4px 0' }}>
                Copies, dans l&apos;ordre calculé : {i.copies.map((c) => `${c.nom} (${c.titre})`).join(' ; ')}
              </p>
              <details><summary className="faint">le corps du message</summary>
                <p style={{ whiteSpace: 'pre-wrap' }}>{i.corps}</p>
              </details>
              <div className="row mt">
                <a className="btn secondary small" href={`/api/reunion-ics/${i.id}`}>Télécharger le .ics</a>
                {i.statut === 'choisie' && (
                  <form action={envoyerAction}>
                    <input type="hidden" name="engagement_id" value={id} />
                    <input type="hidden" name="invitation_id" value={i.id} />
                    <button className="btn small">Envoyer (transport simulé)</button>
                  </form>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
