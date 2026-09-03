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
import { poserNoteAncreeAction, repondreNoteAction, transitionNoteAction } from '../../notes/actions';
import { executerNoteOtto } from '@/lib/services/notes/otto';
import { joindreAnnexe, annexesDuPapier } from '@/lib/services/workpapers/annexes';
import {
  ajouterColonne, confirmerEtRemplir, annulerColonne, proposerClarification,
  colonnesDuPapier, cellulesDuPapier, CHAMPS_LISIBLES,
} from '@/lib/services/workpapers/colonne';
import { fmtEur } from '@/lib/kernel/canon';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { lireIpe, piecesDisponibles, rapportsDuDossier } from '@/lib/services/ipe';
import { visiter } from '@/lib/services/sections';
import { modeSonde } from '@/lib/core/sonde';
import { tr } from '@/lib/i18n';
import { ipeAction, proposerIpeAction } from './ipe-actions';
import { Repli } from '@/app/repli';

const WP_BADGE: Record<string, string> = { draft: 'gray', in_review: 'blue', reviewed: 'amber', signed: 'green', outdated: 'red' };

export default async function WorkpaperDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string; wid: string }>;
  searchParams: Promise<{
    erreur?: string; propose?: string; nature?: string; evidence_id?: string;
    exhaustivite?: string; exactitude?: string;
  }>;
}) {
  const { id, wid } = await params;
  const sp = await searchParams;
  const { erreur } = sp;
  const membreCourant = await requireMember(id);
  const { user } = membreCourant;
  /* QUI REGARDE, ET CE QU'IL PEUT (1.3, ADR-028) : seul un réviseur de la
     mission clôt une note, et jamais l'auteur. Le panneau latéral n'invente
     pas la règle — il reçoit la réponse du serveur et, quand le geste n'est
     pas offert, il écrit pourquoi. */
  const moi = { id: membreCourant.user.id, peutClore: ['manager', 'partner'].includes(membreCourant.membership.eng_role) };
  const t = await tr();
  const wp = await getWorkpaper(wid);
  if (!wp || wp.engagement_id !== id) return <div className="panel">{t('wp.notFound')}</div>;
  const edits = await listEdits(wid);
  const annexes = await annexesDuPapier(wid);
  const notes = await listNotes(wid);
  const signoffs = await listSignoffs(wid);
  const exports = await listExports(wid);
  const ipe = await lireIpe(wid);
  const pieces = await piecesDisponibles(id);
  const rapports = await rapportsDuDossier(id);
  /* « Recent » se remplit en OUVRANT — le papier est une section du dossier. */
  if (!(await modeSonde())) await visiter(id, 'papier', wid, user.id);
  /* Une rédaction PROPOSÉE arrive par l'URL et remplit les zones : elle n'est
     pas enregistrée tant qu'un humain n'a pas cliqué (plafond L2). */
  const propose = sp.propose === '1';
  const val = {
    utilisee: propose ? true : ipe?.utilisee ?? null,
    nature: propose ? sp.nature ?? '' : ipe?.nature ?? '',
    evidenceId: propose ? sp.evidence_id ?? ''
      : ipe?.importFileId ? `f:${ipe.importFileId}` : ipe?.evidenceId ? `e:${ipe.evidenceId}` : '',
    exhaustivite: propose ? sp.exhaustivite ?? '' : ipe?.exhaustivite ?? '',
    exactitude: propose ? sp.exactitude ?? '' : ipe?.exactitude ?? '',
  };
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
  async function annexeAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/workpapers/${wid}`, async () => {
      const { user } = await requireMember(id);
      const fichier = formData.get('fichier') as File;
      if (!fichier || !fichier.size) throw new Error('annexe : choisissez un fichier — rien n\'a été joint');
      await joindreAnnexe(wid, {
        filename: fichier.name,
        mime: fichier.type || 'application/octet-stream',
        bytes: new Uint8Array(await fichier.arrayBuffer()),
      }, user.id);
      revalidatePath(`/eng/${id}/workpapers/${wid}`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        {/* LA PROVENANCE DU PAPIER : quel run du moteur l'a produit, sur quelle
            empreinte de faits, dans quelle langue. P7 doit rester répondable —
            « d'où vient ce papier ? » n'a plus de réponse à l'écran sans ceci. */}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>
            {wp.title} <span className="badge gray">v{wp.version}</span>{' '}
            <span className={`badge ${WP_BADGE[wp.status]}`}>{wp.status}</span>
            {edits.length > 0 && <span className="mod-flag" style={{ marginLeft: 6 }}>{t('wp.modifiedJustified')}</span>}
          </h2>
          <details>
            <summary className="repli-action">{t('wp.exporterPdfExcel')}</summary>
            <span className="row mt">
              <form action={exportAction}><input type="hidden" name="format" value="pdf" /><button className="btn secondary small">{t('wp.exportPdf')}</button></form>
              <form action={exportAction}><input type="hidden" name="format" value="xlsx" /><button className="btn secondary small">{t('wp.exportExcel')}</button></form>
            </span>
          </details>
        </div>
        {/* ON N'AFFIRME PAS UNE PROVENANCE QU'ON N'A PAS. Un `?? '—'` rendait
            « Performed by OTTO engine run — — facts hash —… » : la phrase
            affirmait l'exécution d'un moteur pour un papier qui n'en porte
            aucune trace (règle 13, corollaire). La branche « pas de run » est
            une phrase à elle, et elle le dit. */}
        <p className="faint">
          {wp.engine_run_id && wp.based_on_hash
            ? t('wp.provenanceMoteur', {
                run: wp.engine_run_id.slice(0, 8),
                h: wp.based_on_hash.slice(0, 16),
                langue: wp.language.toUpperCase(),
              })
            : t('wp.sansProvenanceMoteur', { langue: wp.language.toUpperCase() })}
        </p>
        {/* LES ANNEXES (ADR-106) : un tableur de calcul — ou toute pièce de
            travail — se JOINT au papier pour les cas qui sortent du cadre
            standard. Le fichier passe par le moteur de pièces (empreinte,
            provenance source='auditor', journal), puis se lie ici. */}
        <div className="mt">
          {annexes.length > 0 && (
            <p style={{ margin: '4px 0' }}>
              <span className="faint">{t('wp.annexesJointes')}</span>{' '}
              {annexes.map((a) => (
                <a key={a.id} href={`/api/blob/${a.evidenceId}`} target="_blank" className="mono"
                  title={t('wp.annexeTitre', { h: a.sha256.slice(0, 14), ko: Math.round(a.sizeBytes / 1024), quand: a.joinedAt.slice(0, 16) })}
                  style={{ marginRight: 10 }}>
                  {a.filename}
                </a>
              ))}
            </p>
          )}
          <details>
            <summary className="repli-action">{t('wp.attachAnAppendixSpreadsheetCalculationNo')}</summary>
            <form action={annexeAction} className="row mt">
              <input type="file" name="fichier" style={{ maxWidth: 240 }} />
              <button className="btn secondary small">{t('wp.joindre')}</button>
              <span className="faint">{t('wp.entersTheFileWithHashAnd')}</span>
            </form>
          </details>
        </div>
      </div>

      {/* L'INFORMATION PRODUITE PAR L'ENTITÉ — sur CHAQUE papier, pas dans une
          section à part (revue n°2 §3.1), et depuis 1.8 autour d'UN OBJET : le
          RAPPORT, partagé par les papiers du dossier. Répondre « oui », c'est
          désigner un rapport existant du dossier — ou en créer un, documenté —
          en disant sur quel arrêté ce papier s'appuie : un rapport ne couvre que
          son propre arrêté, et la réutilisation sur un autre est refusée par le
          service, les deux dates côte à côte. Ne pas répondre lève un obstacle
          au visa ; « oui » sans rapport est refusé par la base (ipe_documente). */}
      <div className="panel" id="ipe">
        <h2 style={{ marginTop: 0 }}>
          {t('wp.ipe')}{' '}
          {ipe === null
            ? <span className="badge red">?</span>
            : <span className="badge green">{ipe.utilisee ? t('wp.ipe.yes') : t('wp.ipe.no')}</span>}
        </h2>
        <p>{t('wp.ipe.question')}</p>
        <p className="faint">{t('wp.ipe.rapport.quoi')}</p>
        {ipe?.utilisee && ipe.rapportId && (
          <div className="callout" data-ipe-rapport={ipe.rapportId}>
            <strong>{t('wp.ipe.rapport')} : {ipe.rapportNom}</strong>
            {' · '}{t('wp.ipe.rapport.periode')} {ipe.periodeFin}
            {ipe.systemeSource && <> · {ipe.systemeSource}</>}
            {ipe.evidenceNom && <> · {ipe.evidenceNom}</>}
            {ipe.empreinte && <> · {t('wp.ipe.rapport.empreinte')} <span className="mono">{ipe.empreinte.slice(0, 12)}…</span></>}
            {' · '}<span data-ipe-papiers={ipe.papiers}>{t('wp.ipe.rapport.papiers', { n: ipe.papiers })}</span>
            {ipe.natureRapport && <> · {t(ipe.natureRapport === 'systeme' ? 'wp.ipe.system' : ipe.natureRapport === 'systeme_modifie' ? 'wp.ipe.systemeModifie' : 'wp.ipe.manual')}</>}
            {ipe.parametres && <div className="faint">{t('wp.ipe.rapport.parametres')} : {ipe.parametres}</div>}
            {(ipe.generePar || ipe.genereLe) && <div className="faint">{t('wp.ipe.rapport.genere')} : {ipe.generePar ?? '—'} · {ipe.genereLe ?? '—'}</div>}
            <div className="faint" style={{ marginTop: 4 }}>{ipe.exhaustivite}</div>
            <div className="faint">{ipe.exactitude}</div>
          </div>
        )}
        {propose && (
          <p><span className="badge blue">{t('wp.ipe.proposed')}</span></p>
        )}
        <form action={ipeAction}>
          <input type="hidden" name="workpaper_id" value={wid} />
          <div className="row" style={{ gap: 14 }}>
            <label className="row" style={{ gap: 4 }}>
              <input type="radio" name="utilisee" value="oui" defaultChecked={val.utilisee === true} />
              {t('wp.ipe.yes')}
            </label>
            <label className="row" style={{ gap: 4 }}>
              <input type="radio" name="utilisee" value="non" defaultChecked={val.utilisee === false} />
              {t('wp.ipe.no')}
            </label>
          </div>

          <div className="grid cols-2 mt">
            <label>
              {t('wp.ipe.rapport.existant')}
              {/* LES RAPPORTS DU DOSSIER, par nom et arrêté : désigner, c'est
                  partager — et c'est l'arrêté qui décide si c'est permis. */}
              <select name="rapport_id" defaultValue={ipe?.rapportId ?? ''}>
                <option value="">{t('wp.ipe.rapport.nouveau')}</option>
                {rapports.map((r) => (
                  <option key={r.id} value={r.id}>{r.nom} · {t('wp.ipe.rapport.periode')} {r.periodeFin} · {r.fichierNom ?? ''}</option>
                ))}
              </select>
            </label>
            <label>
              {t('wp.ipe.rapport.arrete')}
              <input name="date_document" defaultValue={ipe?.dateDocument ?? ''} placeholder="AAAA-MM-JJ" />
            </label>
            <label>
              {t('wp.ipe.rapport.nom')}
              <input name="rapport_nom" placeholder={t('wp.exSAlr87012284')} />
            </label>
            <label>
              {t('wp.ipe.nature')}
              <select name="nature" defaultValue={val.nature ?? ''}>
                <option value="">—</option>
                <option value="manuelle">{t('wp.ipe.manual')}</option>
                <option value="systeme">{t('wp.ipe.system')}</option>
                <option value="systeme_modifie">{t('wp.ipe.systemeModifie')}</option>
              </select>
            </label>
            <label>
              {t('wp.ipe.reportCode')}
              <input name="rapport_code" defaultValue={ipe?.rapportCode ?? ''} />
            </label>
            <label>
              {t('wp.ipe.file')}
              {/* LA MÊME PIÈCE que celle reçue au portail ou importée : la
                  liste ne propose que des pièces DU DOSSIER. */}
              <select name="evidence_id" defaultValue={val.evidenceId ?? ''}>
                <option value="">—</option>
                {pieces.map((e) => (
                  <option key={e.cle} value={e.cle}>{e.filename} ({e.source})</option>
                ))}
              </select>
            </label>
            <label>
              {t('wp.ipe.rapport.systeme')}
              <input name="systeme_source" defaultValue={ipe?.systemeSource ?? ''} />
            </label>
            <label>
              {t('wp.ipe.rapport.parametres')}
              <input name="parametres" />
            </label>
          </div>

          <label className="bloc mt">
            {t('wp.ipe.completeness')}
            <textarea name="exhaustivite" rows={3} defaultValue={val.exhaustivite ?? ''} />
          </label>
          <label className="bloc">
            {t('wp.ipe.accuracy')}
            <textarea name="exactitude" rows={3} defaultValue={val.exactitude ?? ''} />
          </label>

          <div className="row mt" style={{ justifyContent: 'space-between' }}>
            <label className="row" style={{ gap: 6 }}>
              {t('wp.ipe.appropriate')}
              <select name="approprie" defaultValue={ipe?.approprie === null || ipe?.approprie === undefined ? '' : (ipe.approprie ? 'oui' : 'non')}>
                <option value="">—</option>
                <option value="oui">{t('wp.ipe.yes')}</option>
                <option value="non">{t('wp.ipe.no')}</option>
              </select>
            </label>
            <span className="row">
              {propose && <input type="hidden" name="redige_par_ia" value="1" />}
              <button className="btn">{t('wp.ipe.record')}</button>
            </span>
          </div>
        </form>

        <form action={proposerIpeAction} className="mt">
          <input type="hidden" name="workpaper_id" value={wid} />
          <input type="hidden" name="nature" value={val.nature ?? ''} />
          <input type="hidden" name="evidence_id" value={val.evidenceId ?? ''} />
          <input type="hidden" name="rapport_code" value={ipe?.rapportCode ?? ''} />
          <button className="btn secondary small">{t('wp.ipe.draft')}</button>
        </form>

        {ipe?.valideParNom && (
          <p className="faint mt">
            {ipe.valideParNom} · {ipe.valideLe?.slice(0, 10)}
            {ipe.redigeParIa && <> · <span className="ai-flag">{t('wp.draftedByTheEngineApprovedBy')}</span></>}
          </p>
        )}
      </div>

      {(wp.sections as WpSection[]).map((s) => (
        <div className="panel" key={s.key}>
          <Annotable moi={moi} repondre={repondreNoteAction} transitionner={transitionNoteAction}
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
                <thead>
                {/* LA DISTINCTION SÉLECTION / TRAVAUX (revue n°2 §3.3), portée
                    par le GABARIT DU CABINET : un réviseur doit voir d'un coup
                    d'œil ce qui a été choisi et ce qui a été contrôlé. */}
                {(() => {
                  const gr = (s.meta as { groupes?: string[] } | undefined)?.groupes;
                  if (!gr) return null;
                  const nSel = gr.filter((g) => g === 'selection').length;
                  const nTra = gr.length - nSel;
                  return (
                    <tr className="groupes">
                      {nSel > 0 && <th colSpan={nSel}>{t('wp.selected')}</th>}
                      {nTra > 0 && <th colSpan={nTra}>{t('wp.work')}</th>}
                      {colonnesRemplies.length > 0 && <th colSpan={colonnesRemplies.length} />}
                    </tr>
                  );
                })()}
                <tr>
                  {s.table.headers.map((h) => <th key={h}>{h}</th>)}
                  {s.key === 'tableau_echantillon' && colonnesRemplies.map((c) => (
                    <th key={c.id}>
                      {c.titre} <span className="mod-flag" title={t('wp.colonneAjouteeTitre', { motif: c.justification })}>{t('wp.added')}</span>
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
                          /* LE LIEN EST SUR LA CELLULE QUI A ÉTÉ LUE SUR LA
                             PIÈCE — pas sur la première venue. Les colonnes du
                             grand livre (pièce, tiers, date, montant) n'en
                             portent pas : les lier laisserait croire qu'elles
                             sortent du justificatif, ce qui est exactement
                             l'erreur qu'un contrôle sur pièces cherche. */
                          const src = r.cellRefs?.[j] ?? null;
                          const contenu = src ? (
                            <span>
                              {String(c)}{' '}
                              <a href={`/api/blob/${src}`} target="_blank" className="lien-piece"
                                title={t('wp.openTheSupportingDocumentThisFigure')}>↗</a>
                            </span>
                          ) : (
                            String(c)
                          );
                          const champ = champsEchantillon[j];
                          if (!ident || !champ) return <td key={j} style={{ maxWidth: 220 }}>{contenu}</td>;
                          return (
                            <td key={j} style={{ maxWidth: 220 }}>
                              <Annotable moi={moi} repondre={repondreNoteAction} transitionner={transitionNoteAction}
                                ancre={{
                                  kind: 'sample_item', aRef: ident.natural_key, field: champ.champ,
                                  label: t('wp.ancreElement', { piece: ident.piece, champ: champ.titre }),
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
                                {t('wp.absentFromTheDocumentsReceived')}
                                {cel.clarification_request_item_id && (
                                  <span className="badge blue" style={{ marginLeft: 4 }}>{t('wp.clarificationProposed')}</span>
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
                                ? <a href={`/api/blob/${cel.evidence_id}`} target="_blank" title={t('wp.theDocumentCarryingTheFigure')}>{affiche}</a>
                                : affiche}
                              {!cel.verifie && <span className="ai-flag" style={{ marginLeft: 4 }}>{t('wp.toCheck')}</span>}
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
              <summary className="repli-action">{t('wp.editThisSectionVisibleFlagJustification')}</summary>
              <form action={editAction}>
                <input type="hidden" name="section" value={s.key} />
                <textarea name="body" defaultValue={s.body} style={{ minHeight: 100 }} />
                <div className="row mt">
                  <input type="text" name="justification" placeholder="Justification (required — rendered in the export)" style={{ flex: 1 }} required />
                  <button className="btn small">{t('wp.saveEdit')}</button>
                </div>
              </form>
            </details>
          )}
        </div>
      ))}

      <div className="panel">
            <h2>{t('wp.columnsAddedToTheTestingTable')} <span className="mod-flag">{t('wp.standardTemplateModified')}</span></h2>
        {colonnesAjoutees.map((c) => (
          <div className={`callout ${c.statut === 'proposee' ? 'warn' : c.statut === 'remplie' ? 'green' : ''}`} key={c.id}>
            <strong>{c.titre}</strong>{' '}
            <span className="badge gray">{c.statut === 'proposee' ? t('wp.interprTationProposEConfirmer')
              : c.statut === 'remplie' ? 'remplie' : c.statut}</span>{' '}
            <span className="faint">{t('wp.justificationDeuxPoints')} {c.justification}</span>
            <p style={{ margin: '6px 0' }}>
              {c.interpretation
                ? <>{t('wp.ottoDit')} {(c.interpretation as { phrase: string }).phrase} »</>
                : <>{t('wp.ottoICouldNotInterpretThis')}</>}
              {' '}<span className="faint">{t('wp.coutRegles', { c: Number(c.cout_usd).toFixed(2) })}</span>
            </p>
            {c.statut === 'proposee' && (
              <div className="row">
                <form action={confirmerColonneAction} className="row">
                  <input type="hidden" name="column_id" value={c.id} />
                  <button className="btn small">{t('wp.confirmOttoSearchesTheDocumentsReceived')}</button>
                </form>
                <form action={confirmerColonneAction} className="row">
                  <input type="hidden" name="column_id" value={c.id} />
                  <select name="champ" defaultValue="" required>
                    <option value="" disabled>{t('wp.correctPickTheField')}</option>
                    {CHAMPS_LISIBLES.map((ch) => <option key={ch.champ} value={ch.champ}>{ch.libelle}</option>)}
                  </select>
                  <button className="btn secondary small">{t('wp.corrigerPuisChercher')}</button>
                </form>
                <form action={annulerColonneAction}>
                  <input type="hidden" name="column_id" value={c.id} />
                  <button className="btn secondary small">{t('col.cancel')}</button>
                </form>
              </div>
            )}
            {c.statut === 'remplie' && (
              <form action={clarifierColonneAction}>
                <input type="hidden" name="column_id" value={c.id} />
                <button className="btn secondary small">{t('wp.proposeAClarificationToTheClient')}</button>
              </form>
            )}
          </div>
        ))}
        {wp.status !== 'signed' && wp.status !== 'outdated' && (
          <details className="mt">
            <summary className="repli-action">{t('wp.addAColumnFlaggedJustified')}</summary>
            <form action={ajouterColonneAction} className="mt">
              <div className="row">
                <input name="titre" placeholder={t('wp.columnTitleFreeTextDeliveryDate')} style={{ flex: 1 }} required />
                <input name="justification" placeholder={t('wp.justificationPlaceholder')} style={{ flex: 1 }} required />
                <button className="btn small">{t('wp.addTheColumn')}</button>
              </div>
            </form>
          </details>
        )}
      </div>

      <div className="grid cols-2">
        <div className="panel">
            <h2>{<>{t('wp.columnsAddedToTheTestingTable')} <span className="mod-flag">{t('wp.standardTemplateModified')}</span></>}</h2>
          {/* data-actions-item : les gestes PAR NOTE sont des actions d'item
              répétées — la mesure de densité (§3.D) les compte comme les
              gestes de ligne d'un tableau, pas comme des actions d'écran. */}
          <div data-actions-item>
          {notes.map((n) => (
            <div key={n.id} className={`callout ${n.status === 'open' ? 'warn' : n.status === 'addressed' ? '' : 'green'}`}>
              <strong>{n.author_name}</strong>{n.assignee_name ? ` → ${n.assignee_name}` : ''} <span className="badge gray">{n.status}</span>{' '}
              <span className={`badge ${NOTE_TYPES[n.note_type as NoteType]?.bloquante ? 'red' : 'gray'}`}>{NOTE_TYPES[n.note_type as NoteType] ? t(NOTE_TYPES[n.note_type as NoteType].libelle) : n.note_type}</span>
              <p style={{ margin: '4px 0 6px' }}>{n.text}</p>
              {n.status === 'open' && (
                <form action={noteTransition}><input type="hidden" name="note_id" value={n.id} /><input type="hidden" name="to" value="addressed" /><button className="btn small secondary">{t('wp.markAddressed')}</button></form>
              )}
              {n.status === 'addressed' && (
                <form action={noteTransition}><input type="hidden" name="note_id" value={n.id} /><input type="hidden" name="to" value="closed" /><button className="btn small secondary">{t('notes.clore')}</button></form>
              )}
            </div>
          ))}
          </div>
          <form action={noteAction} className="mt">
            <textarea name="text" placeholder={t('wp.newReviewNote')} required />
            <div className="row mt">
              <select name="note_type" defaultValue="a_corriger" title={t('wp.onlyBlockingNotesPreventSignOff')}>
                <option value="a_corriger">{t('note.type.a_corriger')}</option>
                <option value="a_documenter">{t('note.type.a_documenter')}</option>
                <option value="question">{t('wp.question')}</option>
                <option value="remarque_n1">{t('note.type.remarque_n1')}</option>
              </select>
              <select name="assignee" defaultValue="">
                <option value="">{t('notes.unassigned')}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="otto">{t('wp.ottoCarryOutTheInstruction')}</option>
              </select>
              <button className="btn small">{t('wp.addNote')}</button>
            </div>
          </form>
        </div>

        <div className="panel">
            <h2>{t('wp.reviewNotesHumanOnly')}</h2>
          <table className="data">
            <thead><tr><th>{t('wp.role')}</th><th>{t('wp.signedBy')}</th><th>{t('col.when')}</th></tr></thead>
            <tbody>
              {(['preparer_validator', 'reviewer', 'partner'] as const).map((role) => {
                const s = signoffs.find((x) => x.sign_role === role);
                return (
                  <tr key={role}>
                    <td>{role}</td>
                    <td>{s ? s.user_name : <span className="faint">—</span>}</td>
                    <td>
                      {s ? s.signed_at.slice(0, 16) : wp.status !== 'outdated' && !signedRoles.has(role) ? (
                        <form action={signAction}><input type="hidden" name="role" value={role} /><button className="btn small">{t('wp.signAs')} {role} ({user.name})</button></form>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h2>{t('wp.exportsTerminalHashStamped')}</h2>
          {exports.length === 0 ? <p className="muted">{t('req.noneYet')}</p> : (
            <table className="data">
              <thead><tr><th>{t('wp.format')}</th><th>{t('mot.sha256')}</th><th>{t('col.when')}</th><th></th></tr></thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.id}>
                    <td>{e.format}{e.supersedes_export_id && <span className="badge amber" style={{ marginLeft: 4 }}>{t('wp.supersedesPrior')}</span>}</td>
                    <td className="mono faint">{e.content_hash.slice(0, 14)}…</td>
                    <td className="faint">{e.exported_at.slice(0, 16)}</td>
                    <td><Link href={`/api/export-file/${e.id}`}>{t('mot.download')}</Link></td>
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
