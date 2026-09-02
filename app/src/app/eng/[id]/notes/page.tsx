import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { notesDeLaMission, listReplies, NOTE_TYPES, type NoteAncree, type NoteType } from '@/lib/services/workpapers/lifecycle';
import { BandeauRefus } from '@/app/bandeau-refus';
import { repondreNoteAction, transitionNoteAction, executerNoteOttoAction } from './actions';
import type { CompteRenduOtto } from '@/lib/services/notes/otto';
import { tr } from '@/lib/i18n';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// LA VUE TRANSVERSE DES NOTES DE REVUE (ADR-097). Toutes les notes de la
// mission, leurs ancres RÉSOLUES contre l'état actuel du dossier : une note
// dont l'objet a été retiré (élément sorti de l'échantillon au re-tirage) ne
// disparaît pas — elle remonte ici, marquée « objet retiré », avec son
// histoire. C'est la vue de travail d'un chef de mission.

const STATUT: Record<string, { badge: string; libelle: CleLibelle }> = {
  open: { badge: 'amber', libelle: 'notes.statut.open' },
  addressed: { badge: 'blue', libelle: 'notes.statut.addressed' },
  closed: { badge: 'green', libelle: 'notes.statut.closed' },
};

function ecranPorteur(engId: string, n: NoteAncree): { href: string; libelle: CleLibelle } {
  if (n.workpaper_id) return { href: `/eng/${engId}/workpapers/${n.workpaper_id}`, libelle: 'notes.openTheWorkpaper' };
  switch (n.anchor_kind) {
    case 'questionnaire_answer': return { href: `/eng/${engId}/risk`, libelle: 'notes.openTheRisk' };
    case 'materiality_param': return { href: `/eng/${engId}/materiality`, libelle: 'notes.openTheThresholds' };
    case 'compte': return { href: `/eng/${engId}/poste/${encodeURIComponent((n.anchor_ref ?? '').split('|')[0])}`, libelle: 'notes.openThePoste' };
    default: return { href: `/eng/${engId}/workpapers`, libelle: 'notes.openTheWorkpapers' };
  }
}

export default async function NotesPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
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
    const st = STATUT[n.status];
    const porteur = ecranPorteur(id, n);
    return (
      <div className="panel" key={n.id}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row">
            <span className={`badge ${st?.badge ?? 'gray'}`}>{st ? t(st.libelle) : n.status}</span>
            <span className={`badge ${NOTE_TYPES[n.note_type as NoteType]?.bloquante ? 'red' : 'gray'}`}>
              {NOTE_TYPES[n.note_type as NoteType] ? t(NOTE_TYPES[n.note_type as NoteType].libelle) : n.note_type}
            </span>
            {n.anchor_label && <span className="note-cible" style={{ marginBottom: 0 }}>{n.anchor_label}</span>}
            {n.etat_ancre === 'retire' && (
              <span className="badge amber" title={t('notes.theAnchoredObjectNoLongerExists')}>{t('notes.objetRetire')}</span>
            )}
          </span>
          <span className="faint">{n.created_at.slice(0, 16)}</span>
        </div>
        <p style={{ margin: '8px 0 4px' }}>{n.text}</p>
        <p className="faint" style={{ margin: 0 }}>
          {n.author_name}
          {' → '}
          {n.assignee_kind === 'otto' ? 'OTTO' : (n.assignee_name ?? t('notes.unassigned'))}
          {' · '}
          <Link href={porteur.href}>{t(porteur.libelle)}</Link>
        </p>
        {(reponses.get(n.id) ?? []).map((r) => {
          /* LA RÉPONSE D'OTTO ENTRE AU DOSSIER en trois volets : demandé,
             fait (sur quelles pièces), reste à vérifier — pas une prose. */
          const cr = r.author_kind === 'otto' ? (r.payload as CompteRenduOtto) : null;
          return (
            <div className={`callout${cr?.verdict === 'refuse' ? ' warn' : ''}`} key={r.id} style={{ marginTop: 8 }}>
              <strong>{r.author_kind === 'otto' ? 'OTTO' : r.author_name}</strong>
              {cr?.verdict === 'refuse' && <span className="badge amber" style={{ marginLeft: 6 }}>{t('mot.refusal')}</span>}
              {cr?.verdict === 'execute' && <span className="ai-flag" style={{ marginLeft: 6 }}>{t('notes.executeParOtto')}</span>}
              <p style={{ margin: '4px 0' }}>{r.text}</p>
              {cr && cr.verdict === 'execute' && (
                <ul className="faint" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {cr.fait.map((f, i) => <li key={i}>{f}</li>)}
                  {cr.pieces.length > 0 && (
                    <li>{t('note.documents')} {cr.pieces.map((pi) => pi.filename).join(', ')}</li>
                  )}
                  <li><strong>{t('notes.resteAVerifier')}</strong> : {cr.reste_a_verifier}</li>
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
              <input name="texte" placeholder={t('notes.reponse')} style={{ flex: 1 }} required />
              <button className="btn secondary small">{t('notes.repondre')}</button>
            </form>
            {n.assignee_kind === 'otto' && (
              <form action={executerNoteOttoAction}>
                <input type="hidden" name="engagement_id" value={id} />
                <input type="hidden" name="note_id" value={n.id} />
                <button className="btn secondary small">{t('notes.executer')}</button>
              </form>
            )}
            <form action={transitionNoteAction}>
              <input type="hidden" name="engagement_id" value={id} />
              <input type="hidden" name="note_id" value={n.id} />
              <input type="hidden" name="to" value="closed" />
              <button className="btn small">{t('notes.clore')}</button>
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
        <h2>{t('notes.titreVue')}</h2>
      </div>
      {ouvertes.length === 0 && closes.length === 0 && (
        <div className="panel"><p className="muted">{t('notes.aucuneAide')}</p></div>
      )}
      {ouvertes.map(carte)}
      {closes.length > 0 && (
        <details className="panel">
          <summary>{t('notes.nCloses', { n: closes.length })}</summary>
          {closes.map(carte)}
        </details>
      )}
    </div>
  );
}
