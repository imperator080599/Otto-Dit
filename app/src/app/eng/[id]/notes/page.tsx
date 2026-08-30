import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { notesDeLaMission, listReplies, type NoteAncree } from '@/lib/services/workpapers/lifecycle';
import { BandeauRefus } from '@/app/bandeau-refus';
import { repondreNoteAction, transitionNoteAction, executerNoteOttoAction } from './actions';
import type { CompteRenduOtto } from '@/lib/services/notes/otto';

// LA VUE TRANSVERSE DES NOTES DE REVUE (ADR-097). Toutes les notes de la
// mission, leurs ancres RÉSOLUES contre l'état actuel du dossier : une note
// dont l'objet a été retiré (élément sorti de l'échantillon au re-tirage) ne
// disparaît pas — elle remonte ici, marquée « objet retiré », avec son
// histoire. C'est la vue de travail d'un chef de mission.

const STATUT: Record<string, { badge: string; libelle: string }> = {
  open: { badge: 'amber', libelle: 'ouverte' },
  addressed: { badge: 'blue', libelle: 'adressée' },
  closed: { badge: 'green', libelle: 'close' },
};

function ecranPorteur(engId: string, n: NoteAncree): { href: string; libelle: string } {
  if (n.workpaper_id) return { href: `/eng/${engId}/workpapers/${n.workpaper_id}`, libelle: 'ouvrir le papier' };
  switch (n.anchor_kind) {
    case 'questionnaire_answer': return { href: `/eng/${engId}/risk`, libelle: 'ouvrir le risque' };
    case 'materiality_param': return { href: `/eng/${engId}/materiality`, libelle: 'ouvrir les seuils' };
    default: return { href: `/eng/${engId}/workpapers`, libelle: 'ouvrir les papiers' };
  }
}

export default async function NotesPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  const notes = await notesDeLaMission(id);
  const reponses = new Map<string, Awaited<ReturnType<typeof listReplies>>>();
  for (const n of notes) {
    if (n.reponses > 0) reponses.set(n.id, await listReplies(n.id));
  }
  const ouvertes = notes.filter((n) => n.status !== 'closed');
  const closes = notes.filter((n) => n.status === 'closed');

  const carte = (n: NoteAncree) => {
    const st = STATUT[n.status] ?? { badge: 'gray', libelle: n.status };
    const porteur = ecranPorteur(id, n);
    return (
      <div className="panel" key={n.id}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row">
            <span className={`badge ${st.badge}`}>{st.libelle}</span>
            {n.anchor_label && <span className="note-cible" style={{ marginBottom: 0 }}>{n.anchor_label}</span>}
            {n.etat_ancre === 'retire' && (
              <span className="badge amber" title="l'objet ancré n'existe plus dans l'état actuel du dossier">objet retiré</span>
            )}
          </span>
          <span className="faint">{n.created_at.slice(0, 16)}</span>
        </div>
        <p style={{ margin: '8px 0 4px' }}>{n.text}</p>
        <p className="faint" style={{ margin: 0 }}>
          {n.author_name}
          {' → '}
          {n.assignee_kind === 'otto' ? 'OTTO' : (n.assignee_name ?? 'non attribuée')}
          {' · '}
          <Link href={porteur.href}>{porteur.libelle}</Link>
        </p>
        {(reponses.get(n.id) ?? []).map((r) => {
          /* LA RÉPONSE D'OTTO ENTRE AU DOSSIER en trois volets : demandé,
             fait (sur quelles pièces), reste à vérifier — pas une prose. */
          const cr = r.author_kind === 'otto' ? (r.payload as CompteRenduOtto) : null;
          return (
            <div className={`callout${cr?.verdict === 'refuse' ? ' warn' : ''}`} key={r.id} style={{ marginTop: 8 }}>
              <strong>{r.author_kind === 'otto' ? 'OTTO' : r.author_name}</strong>
              {cr?.verdict === 'refuse' && <span className="badge amber" style={{ marginLeft: 6 }}>refus</span>}
              {cr?.verdict === 'execute' && <span className="ai-flag" style={{ marginLeft: 6 }}>exécuté — un humain clôt</span>}
              <p style={{ margin: '4px 0' }}>{r.text}</p>
              {cr && cr.verdict === 'execute' && (
                <ul className="faint" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {cr.fait.map((f, i) => <li key={i}>{f}</li>)}
                  {cr.pieces.length > 0 && (
                    <li>pièces : {cr.pieces.map((pi) => pi.filename).join(', ')}</li>
                  )}
                  <li><strong>reste à vérifier</strong> : {cr.reste_a_verifier}</li>
                </ul>
              )}
            </div>
          );
        })}
        {n.status !== 'closed' && (
          <div className="row mt">
            <form action={repondreNoteAction} className="row" style={{ flex: 1 }}>
              <input type="hidden" name="engagement_id" value={id} />
              <input type="hidden" name="note_id" value={n.id} />
              <input name="texte" placeholder="Répondre — la réponse entre au dossier." style={{ flex: 1 }} required />
              <button className="btn secondary small">Répondre</button>
            </form>
            {n.assignee_kind === 'otto' && (
              <form action={executerNoteOttoAction}>
                <input type="hidden" name="engagement_id" value={id} />
                <input type="hidden" name="note_id" value={n.id} />
                <button className="btn secondary small">Exécuter (OTTO)</button>
              </form>
            )}
            <form action={transitionNoteAction}>
              <input type="hidden" name="engagement_id" value={id} />
              <input type="hidden" name="note_id" value={n.id} />
              <input type="hidden" name="to" value="closed" />
              <button className="btn small">Clore (auteur)</button>
            </form>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <h2>Notes de revue — la vue transverse</h2>
        <p className="faint">
          Chaque note est ANCRÉE sur un objet métier — un élément d&apos;échantillon, une section de
          papier, une réponse de questionnaire, un paramètre de seuils — jamais sur une position
          d&apos;écran. Une note dont l&apos;objet a disparu (élément sorti de l&apos;échantillon) reste ici,
          marquée « objet retiré ». Une note ouverte bloque le visa du papier qui la porte.
        </p>
      </div>
      {ouvertes.length === 0 && closes.length === 0 && (
        <div className="panel"><p className="muted">Aucune note. Sur un écran porteur : clic droit, appui long, ou la puce ✎ au survol d&apos;un élément.</p></div>
      )}
      {ouvertes.map(carte)}
      {closes.length > 0 && (
        <details className="panel">
          <summary>{closes.length} note(s) close(s)</summary>
          {closes.map(carte)}
        </details>
      )}
    </div>
  );
}
