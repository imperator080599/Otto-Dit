import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { getWorkpaper, editSection, listEdits, listNotes, addReviewNote, transitionNote, signWorkpaper, listSignoffs, NOTE_TYPES, type NoteType } from '@/lib/services/workpapers/lifecycle';
import { exportWorkpaper, listExports } from '@/lib/services/workpapers/render';
import { notesPourEcran } from '@/lib/services/workpapers/lifecycle';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { colonnes } from '@/lib/methodology/catalogue';
import type { WpSection } from '@/lib/services/workpapers/draft';
import { Annotable } from '@/app/annotable';
import { poserNoteAncreeAction } from '../../notes/actions';
import { executerNoteOtto } from '@/lib/services/notes/otto';
import {
  ajouterColonne, confirmerEtRemplir, annulerColonne, proposerClarification,
  colonnesDuPapier, cellulesDuPapier, CHAMPS_LISIBLES,
} from '@/lib/services/workpapers/colonne';
import { fmtEur } from '@/lib/kernel/canon';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const WP_BADGE: Record<string, string> = { draft: 'gray', in_review: 'blue', reviewed: 'amber', signed: 'green', outdated: 'red' };

export default async function WorkpaperDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string; wid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id, wid } = await params;
  const { erreur } = await searchParams;
  const { user } = await requireMember(id);
  const wp = await getWorkpaper(wid);
  if (!wp || wp.engagement_id !== id) return <div className="panel">Not found.</div>;
  const edits = await listEdits(wid);
  const notes = await listNotes(wid);
  const signoffs = await listSignoffs(wid);
  const exports = await listExports(wid);
  const members = await q<{ id: string; name: string }>(
    `select u.id, u.name from engagement_member m join app_user u on u.id = m.user_id where m.engagement_id = $1`,
    [id],
  );
  const signedRoles = new Set(signoffs.map((s) => s.sign_role));

  /* LES ANCRES (ADR-097). Le champ de chaque colonne vient du gabarit du
     cabinet (même source que le papier lui-même) ; l'identité de chaque ligne
     est la natural_key de l'écriture — elle survit aux ré-imports et aux
     re-tirages, contrairement au uuid d'élément d'échantillon. Un papier d'une
     version antérieure dont l'élément n'existe plus ne propose simplement pas
     l'annotation : on n'ancre pas sur un objet disparu. */
  const marques = await notesPourEcran(id);
  const cat = await catalogueDeLaMission(id).catch(() => null);
  const champsEchantillon = cat ? colonnes(cat, 'substantif', 'echantillon') : [];
  const identites = new Map(
    (await q<{ id: string; natural_key: string; piece: string }>(
      `select si.id::text id, g.natural_key, coalesce(g.piece_ref, g.entry_no) piece
       from sample_item si
       join sample sa on sa.id = si.sample_id
       join gl_entry g on g.id = si.unit_id
       where sa.engagement_id = $1 and sa.status = 'drawn' and si.unit_kind = 'gl_entry'`,
      [id],
    )).map((r) => [r.id, r]),
  );
  /* LES COLONNES AJOUTÉES (ADR-099) — suivent le CODE du papier, remplies
     seulement après confirmation humaine de l'interprétation. */
  const colonnesAjoutees = await colonnesDuPapier(id, wp.code);
  const cellulesAjoutees = new Map(
    (await cellulesDuPapier(id, wp.code)).map((c) => [`${c.column_id}|${c.sample_item_id}`, c]),
  );
  const colonnesRemplies = colonnesAjoutees.filter((c) => c.statut === 'remplie');
  const chemin = `/eng/${id}/workpapers/${wid}`;
  const notesHref = `/eng/${id}/notes`;
  const membresNotes = members.map((m) => ({ id: m.id, nom: m.name }));

  async function editAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await editSection(wid, user.id, String(formData.get('section')), String(formData.get('body') ?? ''), String(formData.get('justification') ?? ''));
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function noteAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      const assignee = String(formData.get('assignee') ?? '');
      const noteId = await addReviewNote(
        id, wid, user.id, assignee === 'otto' ? null : assignee || null,
        String(formData.get('text') ?? ''),
        {
          assigneeKind: assignee === 'otto' ? 'otto' : 'user',
          noteType: (String(formData.get('note_type') ?? '') || 'a_corriger') as NoteType,
        },
      );
      if (assignee === 'otto') await executerNoteOtto(noteId);
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function noteTransition(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await transitionNote(String(formData.get('note_id')), user.id, String(formData.get('to')) as 'addressed' | 'closed');
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function signAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await signWorkpaper(wid, user.id, String(formData.get('role')) as 'preparer_validator' | 'reviewer' | 'partner');
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function ajouterColonneAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      const wpx = await getWorkpaper(wid);
      await ajouterColonne(id, wpx!.code, String(formData.get('titre') ?? ''), String(formData.get('justification') ?? ''), user.id);
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function confirmerColonneAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      const champ = String(formData.get('champ') ?? '');
      await confirmerEtRemplir(String(formData.get('column_id')), user.id, champ ? { champ } : undefined);
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function annulerColonneAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await annulerColonne(String(formData.get('column_id')), user.id);
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }
  async function clarifierColonneAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await proposerClarification(String(formData.get('column_id')), user.id);
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
      revalidatePath(`/eng/${id}/requests`);
    });
  }
  async function exportAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      await exportWorkpaper(wid, user.id, String(formData.get('format')) as 'pdf' | 'xlsx');
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>
            {wp.title} <span className="badge gray">v{wp.version}</span>{' '}
            <span className={`badge ${WP_BADGE[wp.status]}`}>{wp.status}</span>
            {edits.length > 0 && <span className="mod-flag" style={{ marginLeft: 6 }}>modified — justified</span>}
          </h2>
          <span className="row">
            <form action={exportAction}><input type="hidden" name="format" value="pdf" /><button className="btn secondary small">Export PDF</button></form>
            <form action={exportAction}><input type="hidden" name="format" value="xlsx" /><button className="btn secondary small">Export Excel</button></form>
          </span>
        </div>
        <p className="faint">
          Performed by OTTO engine run <span className="mono">{wp.engine_run_id?.slice(0, 8)}</span> — facts hash{' '}
          <span className="mono">{wp.based_on_hash?.slice(0, 16)}…</span> — language {wp.language.toUpperCase()}.
          Exports are terminal, hash-stamped and self-contained (ADR-013).
        </p>
      </div>

      {(wp.sections as WpSection[]).map((s) => (
        <div className="panel" key={s.key}>
          <Annotable
            bloc
            ancre={{ kind: 'workpaper_section', aRef: `${wp.code}:${s.key}`, label: `${wp.code} · ${s.title}` }}
            marques={marques[`workpaper_section|${wp.code}:${s.key}`] ?? []}
            membres={membresNotes} engagementId={id} chemin={chemin} notesHref={notesHref}
            workpaperId={wid} action={poserNoteAncreeAction}
          >
            <h2>{s.title}</h2>
            {s.body && <p style={{ whiteSpace: 'pre-wrap' }}>{s.body}</p>}
          </Annotable>
          {s.table && (
            <div className="table-scroll">
              <table className="data">
                <thead><tr>
                  {s.table.headers.map((h) => <th key={h}>{h}</th>)}
                  {s.key === 'tableau_echantillon' && colonnesRemplies.map((c) => (
                    <th key={c.id}>
                      {c.titre} <span className="mod-flag" title={`colonne ajoutée au modèle standard — ${c.justification}`}>ajoutée</span>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {s.table.rows.map((r, i) => {
                    /* La cellule s'ancre par l'identité MÉTIER de sa ligne
                       (natural_key) et le CHAMP de sa colonne (gabarit du
                       cabinet) — jamais « ligne i colonne j » (ADR-097). */
                    const ident = s.key === 'tableau_echantillon' && r.refs?.sampleItemId
                      ? identites.get(r.refs.sampleItemId) : undefined;
                    return (
                      <tr key={i}>
                        {r.cells.map((c, j) => {
                          const contenu = j === 0 && r.refs?.evidenceIds?.length ? (
                            <span>
                              {String(c)}{' '}
                              {r.refs.evidenceIds.map((eid, k) => (
                                <a key={eid} href={`/api/blob/${eid}`} target="_blank" className="faint" title="open evidence">[{k + 1}]</a>
                              ))}
                            </span>
                          ) : (
                            String(c)
                          );
                          const champ = champsEchantillon[j];
                          if (!ident || !champ) return <td key={j} style={{ maxWidth: 220 }}>{contenu}</td>;
                          return (
                            <td key={j} style={{ maxWidth: 220 }}>
                              <Annotable
                                ancre={{
                                  kind: 'sample_item', aRef: ident.natural_key, field: champ.champ,
                                  label: `Élément ${ident.piece} · ${champ.titre}`,
                                }}
                                marques={marques[`sample_item|${r.refs!.sampleItemId}|${champ.champ}`] ?? []}
                                membres={membresNotes} engagementId={id} chemin={chemin} notesHref={notesHref}
                                workpaperId={wid} action={poserNoteAncreeAction}
                              >
                                {contenu}
                              </Annotable>
                            </td>
                          );
                        })}
                        {s.key === 'tableau_echantillon' && colonnesRemplies.map((c) => {
                          const cel = r.refs?.sampleItemId
                            ? cellulesAjoutees.get(`${c.id}|${r.refs.sampleItemId}`) : undefined;
                          if (!cel) return <td key={c.id} className="faint">—</td>;
                          if (cel.outcome === 'introuvable') {
                            return (
                              <td key={c.id} className="faint">
                                absente des pièces reçues
                                {cel.clarification_request_item_id && (
                                  <span className="badge blue" style={{ marginLeft: 4 }}>clarification proposée</span>
                                )}
                              </td>
                            );
                          }
                          const brut = cel.valeur ?? '';
                          const champC = (c.interpretation as { champ?: string } | null)?.champ ?? '';
                          const affiche = champC.endsWith('Cents') && /^-?\d+$/.test(brut)
                            ? fmtEur(Number(brut), 'fr') : brut;
                          return (
                            <td key={c.id}>
                              {cel.evidence_id
                                ? <a href={`/api/blob/${cel.evidence_id}`} target="_blank" title="la pièce qui porte la donnée">{affiche}</a>
                                : affiche}
                              {!cel.verifie && <span className="ai-flag" style={{ marginLeft: 4 }}>à vérifier</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {wp.status !== 'signed' && wp.status !== 'outdated' && s.body !== undefined && (
            <details className="mt">
              <summary className="muted">Edit this section (visible flag + justification)</summary>
              <form action={editAction}>
                <input type="hidden" name="section" value={s.key} />
                <textarea name="body" defaultValue={s.body} style={{ minHeight: 100 }} />
                <div className="row mt">
                  <input type="text" name="justification" placeholder="Justification (required — rendered in the export)" style={{ flex: 1 }} required />
                  <button className="btn small">Save edit</button>
                </div>
              </form>
            </details>
          )}
        </div>
      ))}

      <div className="panel">
        <h2>Colonnes ajoutées au tableau de testing <span className="mod-flag">modèle standard modifié</span></h2>
        <p className="faint">
          Le titre est du texte libre — OTTO PROPOSE son interprétation et n&apos;écrit RIEN avant votre
          confirmation : s&apos;il devinait mal et remplissait quand même, une donnée fausse entrerait dans
          un papier de travail. Chaque cellule a deux issues : trouvée dans une pièce REÇUE (avec sa
          provenance, héritant de la file de vérification), ou introuvable — et alors une demande de
          clarification se propose au lieu d&apos;une case vide muette (ADR-099).
        </p>
        {colonnesAjoutees.map((c) => (
          <div className={`callout ${c.statut === 'proposee' ? 'warn' : c.statut === 'remplie' ? 'green' : ''}`} key={c.id}>
            <strong>{c.titre}</strong>{' '}
            <span className="badge gray">{c.statut === 'proposee' ? 'interprétation proposée — à confirmer'
              : c.statut === 'remplie' ? 'remplie' : c.statut}</span>{' '}
            <span className="faint">justification : {c.justification}</span>
            <p style={{ margin: '6px 0' }}>
              {c.interpretation
                ? <>OTTO : « {(c.interpretation as { phrase: string }).phrase} »</>
                : <>OTTO : « je n&apos;ai pas su interpréter ce titre — choisissez un champ du catalogue, ou annulez. »</>}
              {' '}<span className="faint">coût : {Number(c.cout_usd).toFixed(2)} $ (interprétation par règles, aucun appel payant)</span>
            </p>
            {c.statut === 'proposee' && (
              <div className="row">
                <form action={confirmerColonneAction} className="row">
                  <input type="hidden" name="column_id" value={c.id} />
                  <button className="btn small">Confirmer — OTTO cherche dans les pièces reçues</button>
                </form>
                <form action={confirmerColonneAction} className="row">
                  <input type="hidden" name="column_id" value={c.id} />
                  <select name="champ" defaultValue="" required>
                    <option value="" disabled>— corriger : choisir le champ —</option>
                    {CHAMPS_LISIBLES.map((ch) => <option key={ch.champ} value={ch.champ}>{ch.libelle}</option>)}
                  </select>
                  <button className="btn secondary small">Corriger puis chercher</button>
                </form>
                <form action={annulerColonneAction}>
                  <input type="hidden" name="column_id" value={c.id} />
                  <button className="btn secondary small">Annuler</button>
                </form>
              </div>
            )}
            {c.statut === 'remplie' && (
              <form action={clarifierColonneAction}>
                <input type="hidden" name="column_id" value={c.id} />
                <button className="btn secondary small">Proposer une clarification au client pour les lignes sans donnée</button>
              </form>
            )}
          </div>
        ))}
        {wp.status !== 'signed' && wp.status !== 'outdated' && (
          <form action={ajouterColonneAction} className="mt">
            <div className="row">
              <input name="titre" placeholder="Titre de la colonne (texte libre — « Date livraison », « Qté livrée »…)" style={{ flex: 1 }} required />
              <input name="justification" placeholder="Justification (obligatoire — sort dans l'export)" style={{ flex: 1 }} required />
              <button className="btn small">Ajouter la colonne</button>
            </div>
          </form>
        )}
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>Review notes (human-only)</h2>
          {notes.map((n) => (
            <div key={n.id} className={`callout ${n.status === 'open' ? 'warn' : n.status === 'addressed' ? '' : 'green'}`}>
              <strong>{n.author_name}</strong>{n.assignee_name ? ` → ${n.assignee_name}` : ''} <span className="badge gray">{n.status}</span>{' '}
              <span className={`badge ${NOTE_TYPES[n.note_type as NoteType]?.bloquante ? 'red' : 'gray'}`}>{NOTE_TYPES[n.note_type as NoteType]?.libelle ?? n.note_type}</span>
              <p style={{ margin: '4px 0 6px' }}>{n.text}</p>
              {n.status === 'open' && (
                <form action={noteTransition}><input type="hidden" name="note_id" value={n.id} /><input type="hidden" name="to" value="addressed" /><button className="btn small secondary">Mark addressed</button></form>
              )}
              {n.status === 'addressed' && (
                <form action={noteTransition}><input type="hidden" name="note_id" value={n.id} /><input type="hidden" name="to" value="closed" /><button className="btn small secondary">Close (reviewer — never the author)</button></form>
              )}
            </div>
          ))}
          <form action={noteAction} className="mt">
            <textarea name="text" placeholder="New review note…" required />
            <div className="row mt">
              <select name="note_type" defaultValue="a_corriger" title="seules les bloquantes empêchent le visa (ADR-028)">
                <option value="a_corriger">à corriger (bloquante)</option>
                <option value="a_documenter">à documenter</option>
                <option value="question">question</option>
                <option value="remarque_n1">remarque pour N+1</option>
              </select>
              <select name="assignee" defaultValue="">
                <option value="">unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="otto">OTTO — exécute l&apos;instruction</option>
              </select>
              <button className="btn small">Add note</button>
            </div>
          </form>
        </div>

        <div className="panel">
          <h2>Sign-offs (dated, immutable)</h2>
          <table className="data">
            <thead><tr><th>Role</th><th>Signed by</th><th>When</th></tr></thead>
            <tbody>
              {(['preparer_validator', 'reviewer', 'partner'] as const).map((role) => {
                const s = signoffs.find((x) => x.sign_role === role);
                return (
                  <tr key={role}>
                    <td>{role}</td>
                    <td>{s ? s.user_name : <span className="faint">—</span>}</td>
                    <td>
                      {s ? s.signed_at.slice(0, 16) : wp.status !== 'outdated' && !signedRoles.has(role) ? (
                        <form action={signAction}><input type="hidden" name="role" value={role} /><button className="btn small">Sign as {role} ({user.name})</button></form>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h2>Exports (terminal, hash-stamped)</h2>
          {exports.length === 0 ? <p className="muted">None yet.</p> : (
            <table className="data">
              <thead><tr><th>Format</th><th>sha256</th><th>When</th><th></th></tr></thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.id}>
                    <td>{e.format}{e.supersedes_export_id && <span className="badge amber" style={{ marginLeft: 4 }}>supersedes prior</span>}</td>
                    <td className="mono faint">{e.content_hash.slice(0, 14)}…</td>
                    <td className="faint">{e.exported_at.slice(0, 16)}</td>
                    <td><Link href={`/api/export-file/${e.id}`}>download</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
