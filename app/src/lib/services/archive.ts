import JSZip from 'jszip';
import { q, q1 } from '@/lib/db/client';
import { logEvent, verifyChain } from '@/lib/core/events';
import { sha256 } from '@/lib/core/hash';
import { saveBlob, readBlob } from '@/lib/core/storage';
import { engagementCtx } from './imports';
import { conclusionGate, blockerText } from './evaluation';
import { obstaclesAuVisa } from './obstacles';
import { fileDeadlines } from './retention';
import { renderWorkpaperPdf } from './workpapers/render';
import { traduire } from '@/lib/i18n/catalogue';
import { assertMembre } from '@/lib/core/membre';

// ADR-022 — closing the file.
//
// The database is the living source of truth; closing adds a SEALED, self-contained
// archive whose hash is recorded. Both, not either: the base answers questions, the
// archive survives the platform. Nothing in the archive is authored here — every file is
// regenerated from stored records, so the archive is a projection like any other export.
//
// Deterministic on purpose: entries are sorted, timestamps come from the report date and
// never from the clock, so sealing the same file twice yields the same bytes.

const FIXED_ENTRY_DATE = (reportDate: string) => new Date(`${reportDate}T00:00:00Z`);

export interface SealResult {
  archiveId: string;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
}

/** The archive as a PURE PROJECTION of stored state: no writes, no clock. Given the same
 *  rows it returns the same bytes, which is the property that makes an export disposable —
 *  delete it and it comes back identical. `sealFile` is this plus persistence. */
export async function buildArchive(engagementId: string, reportDate: string): Promise<{ bytes: Uint8Array; manifest: Record<string, unknown>; fileCount: number }> {
  const ctx = await engagementCtx(engagementId);
  const deadlines = await fileDeadlines(engagementId, reportDate);
  const eng = await q1<{ name: string; entity: string; period: string; framework_set: unknown }>(
    `select e.name, en.name entity, p.label period, e.framework_set
     from engagement e join entity en on en.id = e.entity_id join period p on p.id = e.period_id
     where e.id = $1`,
    [engagementId],
  );

  const zip = new JSZip();
  const files: { path: string; sha256: string; bytes: number }[] = [];
  const add = (p: string, bytes: Uint8Array | string) => {
    const buf = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    // createFolders:false — JSZip otherwise inserts implicit directory entries stamped
    // with `new Date()`, which made the archive hash flap between two identical builds
    zip.file(p, buf, { date: FIXED_ENTRY_DATE(reportDate), createFolders: false });
    files.push({ path: p, sha256: sha256(buf), bytes: buf.length });
  };

  // 1. the workpapers, regenerated from the rows (never copied from a stored file)
  const wps = await q<{ id: string; code: string; version: number; status: string }>(
    `select id, code, version, status from workpaper where engagement_id = $1 order by code, version`,
    [engagementId],
  );
  for (const wp of wps) {
    const pdf = await renderWorkpaperPdf(wp.id);
    add(`workpapers/${wp.code}_v${wp.version}.pdf`, pdf.bytes);
  }

  // 2. the evidence, with the fingerprints the workpapers cite
  const evidence = await q<{ id: string; filename: string; sha256: string; storage_path: string; doc_type: string | null; source: string }>(
    `select id, filename, sha256, storage_path, doc_type, source from evidence
     where engagement_id = $1 and quarantined = false order by filename`,
    [engagementId],
  );
  for (const e of evidence) {
    add(`evidence/${e.filename}`, await readBlob(e.storage_path));
  }

  // 3. the structured record — what a machine (or a successor platform) reads
  // Every dump is TOTALLY ordered, id included: two exceptions can share a taxonomy, a
  // description AND a timestamp (a duplicate booking raises one per side, worded
  // identically, in the same transaction). A tie there makes the archive hash flap.
  const dump = async (name: string, sql: string) => add(`data/${name}.json`, JSON.stringify(await q(sql, [engagementId]), null, 2) + '\n');
  // every dump is TOTALLY ordered: a projection that depends on the storage engine's row
  // order is not a projection, and the archive hash would drift between two identical files
  await dump('exceptions', `select taxonomy_code, status, description, amount_impact::text, client_explanation, resolution, disposition, alternative_procedures, resolved_at::text from exception where engagement_id = $1 order by taxonomy_code, description, created_at, id`);
  await dump('misstatements', `select kind, amount::text, corrected, status, notes from misstatement where engagement_id = $1 order by amount desc, kind, notes, id`);
  await dump('deficiencies', `select severity_proposed, severity_final, status, narrative, magnitude_basis, basis from deficiency where engagement_id = $1 order by narrative, id`);
  await dump('signoffs', `select w.code, s.sign_role, u.name, s.signed_at::text from signoff s join workpaper w on w.id = s.workpaper_id join app_user u on u.id = s.user_id where w.engagement_id = $1 order by w.code, s.signed_at, s.sign_role, s.id`);
  await dump('event_log', `select id, actor_kind, verb, object_type, object_id, payload, prev_hash, hash, created_at::text from event_log where engagement_id = $1 order by id`);

  const chain = await verifyChain(ctx.tenant_id, engagementId);
  const manifest = {
    format: 'otto-sealed-file/v1',
    engagement: { id: engagementId, name: eng.name, entity: eng.entity, period: eng.period, framework_set: eng.framework_set },
    report_date: reportDate,
    completion_due: deadlines.completionDue,
    retention_until: deadlines.retentionUntil,
    legal_basis: {
      rule_set: deadlines.ruleSet,
      completion: { days: deadlines.completion.days, ...deadlines.completion.source },
      retention: { years: deadlines.retention.years, ...deadlines.retention.source },
      any_unverified: deadlines.anyUnverified,
    },
    event_chain: { verified: chain.ok, events: chain.count },
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  add('MANIFEST.json', JSON.stringify(manifest, null, 2) + '\n');
  add('README.html', readmeHtml(manifest));

  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
  return { bytes, manifest: manifest as unknown as Record<string, unknown>, fileCount: files.length };
}

export async function sealFile(engagementId: string, userId: string, reportDate: string): Promise<SealResult> {
  await assertMembre(engagementId, userId, 'sealFile');
  const ctx = await engagementCtx(engagementId);

  /* L'ORDRE DES DEUX VERROUS. Le plus SPÉCIFIQUE d'abord : « le grand livre est
     provisoire » dit quoi faire ; « 40 obstacles » fait chercher. Un refus qui
     compte n'est pas un refus qui explique (ADR-069). */
  const gate = await conclusionGate(engagementId);
  if (!gate.ok) {
    throw new Error(`the file cannot be closed while it is not concluded — ${gate.blockers.map((b) => blockerText(b, 'en')).join(' ; ')}`);
  }

  /* LE BRANCHEMENT DE L'ACHÈVEMENT SUR LA CLÔTURE (point 11).
     La clôture ne vérifiait que la conclusion sur les anomalies. C'était le
     dernier verrou d'une porte à huit serrures : acceptation, indépendance,
     reprise, questionnaire, boucle, pointage, évaluation, achèvement. Sceller
     un dossier dont la lettre d'affirmation manque, ou dont les états
     financiers ne sont pas pointés, produisait une archive complète… d'un
     dossier INCOMPLET — et l'archive, elle, est définitive.
     On demande LA liste (ADR-085), celle-là même que l'écran affiche : deux
     vérités sur ce qui bloque en divergeraient un jour. */
  const obstacles = await obstaclesAuVisa(engagementId);
  if (obstacles.length > 0) {
    throw new Error(
      `le dossier ne se clôt pas tant qu'un obstacle au visa subsiste — ${obstacles.length} obstacle(s) : `
      + obstacles.slice(0, 6).map((o) => traduire('en', o.motif.cle, o.motif.vars)).join(' ; ')
      + (obstacles.length > 6 ? ` … et ${obstacles.length - 6} autre(s)` : ''),
    );
  }
  const deadlines = await fileDeadlines(engagementId, reportDate);
  const { bytes, manifest, fileCount } = await buildArchive(engagementId, reportDate);
  const blob = await saveBlob(bytes);
  const row = await q1<{ id: string }>(
    `insert into file_archive (engagement_id, sealed_by, storage_path, sha256, size_bytes, manifest, retention_until, legal_basis)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [
      engagementId, userId, blob.storagePath, sha256(bytes), bytes.length,
      JSON.stringify(manifest), deadlines.retentionUntil, JSON.stringify((manifest as { legal_basis: unknown }).legal_basis),
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'file_sealed', objectType: 'file_archive', objectId: row.id,
    payload: {
      sha256: sha256(bytes), size_bytes: bytes.length, files: fileCount,
      retention_until: deadlines.retentionUntil, completion_due: deadlines.completionDue,
    },
  });
  return { archiveId: row.id, sha256: sha256(bytes), sizeBytes: bytes.length, fileCount };
}

export async function latestArchive(engagementId: string) {
  return q1<{ id: string; sha256: string; size_bytes: string; sealed_at: string; storage_path: string; retention_until: string }>(
    `select id, sha256, size_bytes::text, sealed_at::text, storage_path, retention_until::text
     from file_archive where engagement_id = $1 order by sealed_at desc limit 1`,
    [engagementId],
  );
}

/** The index an inspector opens. No JavaScript, no network, no platform. */
function readmeHtml(m: {
  engagement: { name: string; entity: string; period: string };
  report_date: string; completion_due: string; retention_until: string;
  legal_basis: { completion: { citation: string; days: number }; retention: { citation: string; years: number }; any_unverified: boolean };
  event_chain: { verified: boolean; events: number };
  files: { path: string; sha256: string; bytes: number }[];
}): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return `<!doctype html>
<html lang="fr"><meta charset="utf-8"><title>Dossier scellé — ${esc(m.engagement.name)}</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#16191d}
 h1{font-size:1.4rem;margin-bottom:.2rem} h2{font-size:1.05rem;margin-top:2rem;border-bottom:1px solid #d8dde3;padding-bottom:.3rem}
 table{border-collapse:collapse;width:100%;font-size:12px} td,th{border-bottom:1px solid #e6e9ee;padding:.35rem .5rem;text-align:left}
 code{font:11px ui-monospace,Menlo,monospace;color:#4a5260} .k{color:#6b7280} .warn{background:#fff5e6;padding:.6rem;border-left:3px solid #d18b18}
</style>
<h1>${esc(m.engagement.entity)} — ${esc(m.engagement.period)}</h1>
<p class="k">${esc(m.engagement.name)} · dossier scellé, lisible sans la plateforme.</p>
<h2>Dates réglementaires</h2>
<table>
 <tr><th>Rapport signé le</th><td>${m.report_date}</td><td class="k"></td></tr>
 <tr><th>Dossier à clôturer avant</th><td>${m.completion_due}</td><td class="k">${esc(m.legal_basis.completion.citation)} (${m.legal_basis.completion.days} j)</td></tr>
 <tr><th>Conservation jusqu’au</th><td>${m.retention_until}</td><td class="k">${esc(m.legal_basis.retention.citation)} (${m.legal_basis.retention.years} ans)</td></tr>
</table>
${m.legal_basis.any_unverified ? '<p class="warn">Au moins une disposition citée n’a pas pu être vérifiée sur son texte primaire lors de la production de ce dossier — voir MANIFEST.json.</p>' : ''}
<h2>Chaîne d’événements</h2>
<p>${m.event_chain.events} événements — chaîne de hachage <strong>${m.event_chain.verified ? 'vérifiée' : 'ROMPUE'}</strong>. Le journal complet est dans <code>data/event_log.json</code>.</p>
<h2>Contenu (${m.files.length} fichiers)</h2>
<table><tr><th>Fichier</th><th>Octets</th><th>sha256</th></tr>
${m.files.map((f) => `<tr><td><a href="${esc(f.path)}">${esc(f.path)}</a></td><td>${f.bytes}</td><td><code>${f.sha256}</code></td></tr>`).join('\n')}
</table>
<p class="k">Chaque empreinte ci-dessus peut être recalculée hors ligne : <code>sha256sum &lt;fichier&gt;</code>.</p>
</html>
`;
}
