import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { recordAiRun } from '@/lib/core/airuns';
import { readBlob } from '@/lib/core/storage';
import { engagementCtx } from '../imports';
import { findEmbeddedFacturx, parseCiiXml } from './facturx-read';
import { classify, parseByType, pdfText, type DocType } from './textlayer';
import { getOcrAdapter, type OcrAdapter } from './adapters';
import { gardeBudget, assertBudgetActifEnBase } from './budget';
import type { ExtractedField } from './fields';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';
import { assertNiveauOuvert, niveauEffectif } from '../automatisation';

// The extraction ladder (ADR-002/ADR-012): XML → text layer → OCR/LLM → human.
// Rungs 1–2 are deterministic (L0/L1, complete immediately, spot-check control covers
// them). Rungs 3–4 ALWAYS queue for item verification (pending_verify) — confidence
// orders the queue, never bypasses it.

export interface ExtractionOutcome {
  extractionId: string;
  rung: 'xml' | 'text_layer' | 'ocr' | 'human';
  status: 'complete' | 'pending_verify' | 'failed';
  docType: DocType;
  fieldCount: number;
}

/** Pure ladder over bytes — no database. The DB path (extractEvidence) and the eval
 *  harness (ADR-018) MUST share this function, so a measured number always describes the
 *  code the app actually runs. Adapter errors propagate: the caller decides whether a
 *  failure is fatal (app) or a counted failure (eval). */
export interface LadderResult {
  rung: 'xml' | 'text_layer' | 'ocr' | 'human';
  status: 'complete' | 'pending_verify';
  docType: DocType;
  classConfidence: number;
  fields: ExtractedField[];
  ai: { adapter: string; model: string; tokensIn: number; tokensOut: number; costUsd: number } | null;
  latencyMs: number;
}

export async function runLadder(
  bytes: Uint8Array,
  filename: string,
  /* PAS DE DÉFAUT `= getOcrAdapter()` ICI — trouvé le 2026-09-13 en écrivant l'audit de
     surface (scripts/audit/ia-vivante.ts) : un paramètre par défaut qui appelle la fabrique
     réelle est un DEUXIÈME chemin vers l'adaptateur réel, hors de la garde IA-BUDGET-01 posée
     dans `extractEvidence` ci-dessous — mort en pratique (le seul appelant de production
     passe toujours `adapter` explicitement), mais un chemin mort reste un chemin. Paramètre
     REQUIS : la dépendance et l'obligation de garde qui va avec restent visibles à chaque
     appelant, y compris un futur test qui appellerait cette fonction directement. */
  adapter: OcrAdapter,
): Promise<LadderResult> {
  const t0 = Date.now();
  let text = '';
  try {
    text = await pdfText(bytes);
  } catch {
    text = '';
  }
  const cls = classify(text, filename);
  const base = { docType: cls.docType, classConfidence: cls.confidence };

  // rung 1: embedded Factur-X XML
  const xml = findEmbeddedFacturx(bytes);
  if (xml) {
    const fields = parseCiiXml(xml);
    if (fields.length >= 4) {
      return { ...base, rung: 'xml', status: 'complete', fields, ai: null, latencyMs: Date.now() - t0 };
    }
  }

  // rung 2: text layer + deterministic parser
  if (text) {
    const fields = parseByType(cls.docType, text);
    if (fields && fields.length >= 3) {
      return { ...base, rung: 'text_layer', status: 'complete', fields, ai: null, latencyMs: Date.now() - t0 };
    }
  }

  // rung 3: OCR/LLM adapter — ALWAYS pending_verify (ADR-012)
  const started = Date.now();
  const result = await adapter.extract(bytes, cls.docType);
  if (result) {
    return {
      ...base,
      rung: 'ocr',
      status: 'pending_verify',
      fields: result.fields,
      ai: {
        adapter: adapter.name,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      },
      latencyMs: Date.now() - started,
    };
  }

  // rung 5: fully human
  return { ...base, rung: 'human', status: 'pending_verify', fields: [], ai: null, latencyMs: Date.now() - t0 };
}

export async function extractEvidence(evidenceId: string, userId: string | null): Promise<ExtractionOutcome> {
  await assertMembreDe('evidence', evidenceId, userId, 'extraire une pièce');
  const ev = await q1<{ id: string; engagement_id: string; filename: string; storage_path: string; doc_type: string | null }>(
    `select id, engagement_id, filename, storage_path, doc_type from evidence where id = $1`,
    [evidenceId],
  );
  const ctx = await engagementCtx(ev.engagement_id);
  const bytes = await readBlob(ev.storage_path);

  /* MODE « IA RÉELLE » (ADR-105) : avant qu'une lecture payante puisse partir, IA-BUDGET-01
     (le DROIT même de tenter — mandat du 9 septembre §4) est vérifiée AVANT le plafond de
     dépense CUMULÉE (`gardeBudget`, ADR-105) — même ordre que entretiens.ts et
     walkthrough-analyse.ts. Manquante ici avant le 2026-09-13 (trouvé par l'audit de surface,
     scripts/audit/ia-vivante.ts, en réponse à une question directe du fondateur) : ce chemin
     n'appelait QUE `gardeBudget()`, jamais `assertBudgetActifEnBase()`. En rejeu ('mock'),
     rien ne se dépense et rien n'est gardé. */
  const adapter = getOcrAdapter();
  /* UNE SEULE LECTURE, RÉUTILISÉE (revue hostile du 2026-09-14, voix 1 ET 2) :
     relire le niveau APRÈS l'appel IA réel (potentiellement long) ouvrirait
     une fenêtre où un changement de réglage timbrerait ai_run d'un niveau
     qui n'a jamais accompagné cet appel — voir automatisation.ts. */
  const niveau = await niveauEffectif(ev.engagement_id);
  if (adapter.name !== 'mock') {
    /* AUTO-01 (mandat 2026-09-14, §2.4) au même titre qu'IA-BUDGET-01 juste
       en dessous — deux gardes indépendantes, aucune ne remplace l'autre. */
    await assertNiveauOuvert(ev.engagement_id, niveau);
    await assertBudgetActifEnBase();
    await gardeBudget();
  }
  const res = await runLadder(bytes, ev.filename, adapter);
  await q(`update evidence set doc_type = $2, class_confidence = $3 where id = $1`, [evidenceId, res.docType, res.classConfidence]);

  let aiRunId: string | null = null;
  if (res.ai) {
    aiRunId = await recordAiRun({
      tenantId: ctx.tenant_id,
      engagementId: ev.engagement_id,
      purpose: 'ocr',
      adapter: res.ai.adapter,
      model: res.ai.model,
      promptId: 'ocr-extract',
      promptVersion: 'v1',
      input: ev.storage_path,
      output: JSON.stringify(res.fields),
      tokensIn: res.ai.tokensIn,
      tokensOut: res.ai.tokensOut,
      costUsd: res.ai.costUsd,
      latencyMs: res.latencyMs,
      niveauAutomatisation: niveau,
    });
  }
  const id = await insertExtraction(evidenceId, res.rung, res.status, res.fields, aiRunId);
  await logExtract(ctx.tenant_id, ev.engagement_id, evidenceId, res.rung, res.status, userId);
  if (res.status === 'pending_verify') {
    /* P1-01 (AUD-01) — seule l'extraction qui ATTEND une vérification humaine est une
       proposition (`extraction.status = 'complete'` n'en est pas une, même patron que
       `notifications.ts`). Import différé : `propositions.ts` → `applicateurs.ts` →
       `extraction/ladder.ts` (`verifyExtraction`) — un import statique ici ferait un cycle. */
    const { proposer } = await import('../propositions');
    await proposer({
      engagementId: ev.engagement_id,
      objectType: 'extraction_field',
      objectId: id,
      valeur: { fields: res.fields },
      aiRunId,
    });
  }
  return { extractionId: id, rung: res.rung, status: res.status, docType: res.docType, fieldCount: res.fields.length };
}

async function insertExtraction(
  evidenceId: string,
  rung: string,
  status: string,
  fields: ExtractedField[],
  aiRunId: string | null,
): Promise<string> {
  const overall = fields.length ? Math.min(...fields.map((f) => f.confidence)) : null;
  const row = await q1<{ id: string }>(
    `insert into extraction (evidence_id, rung, status, ai_run_id, fields, overall_confidence)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [evidenceId, rung, status, aiRunId, JSON.stringify(fields), overall],
  );
  return row.id;
}

async function logExtract(tenantId: string, engagementId: string, evidenceId: string, rung: string, status: string, userId: string | null) {
  await logEvent({
    tenantId,
    engagementId,
    actorKind: rung === 'ocr' ? 'ai' : 'system',
    actorId: null,
    verb: 'extraction_completed',
    objectType: 'evidence',
    objectId: evidenceId,
    payload: { rung, status, requestedBy: userId },
  });
}

/** Run the ladder over all unextracted evidence of an engagement.
 *
 *  EXCLUT le détail de compte importé (`account_detail_import.evidence_id`,
 *  plan d'autonomie Partie B étape 2, account-detail.ts) — trouvé en
 *  câblant POP-01 (2026-09-06) : sans cette exclusion, le CSV du
 *  rapprochement rentrait dans l'échelle d'extraction comme n'importe quelle
 *  pièce déposée et se retrouvait « en attente de vérification OCR »,
 *  alors que ses champs sont déjà lus par un parseur déterministe
 *  (`importerDetailDeCompte`) — l'extraire une seconde fois ne serait pas
 *  une preuve de plus, ce serait la même donnée comptée deux fois sous deux
 *  mécanismes différents. */
export async function extractAll(engagementId: string, userId: string | null): Promise<{ processed: number; pendingVerify: number }> {
  await assertMembre(engagementId, userId, 'extraire toutes les pièces');
  const rows = await q<{ id: string }>(
    `select e.id from evidence e
     where e.engagement_id = $1 and e.quarantined = false
       and not exists (select 1 from extraction x where x.evidence_id = e.id and x.status in ('complete','verified','pending_verify'))
       and not exists (select 1 from account_detail_import a where a.evidence_id = e.id)
     order by e.created_at`,
    [engagementId],
  );
  let pendingVerify = 0;
  for (const r of rows) {
    const out = await extractEvidence(r.id, userId);
    if (out.status === 'pending_verify') pendingVerify++;
  }
  return { processed: rows.length, pendingVerify };
}

/** Latest usable extraction per evidence (verified > complete > pending_verify). */
export async function latestExtraction(evidenceId: string) {
  return q01<{ id: string; rung: string; status: string; fields: ExtractedField[]; overall_confidence: number | null; verified_by: string | null }>(
    `select id, rung, status, fields, overall_confidence::float, verified_by from extraction
     where evidence_id = $1
     order by case status when 'verified' then 0 when 'complete' then 1 when 'pending_verify' then 2 else 3 end,
              created_at desc
     limit 1`,
    [evidenceId],
  );
}

export async function pendingVerifications(engagementId: string) {
  /* P1-06 (AUD-10) : `extraction` est append-only depuis 0178 — une ligne vérifiée n'est plus
     mise à jour, une ligne NEUVE la supersède (`supersedes_extraction_id`). Sans l'exclusion
     ci-dessous, une pièce déjà vérifiée réapparaîtrait ICI pour toujours : la ligne d'origine
     garde `status = 'pending_verify'` puisque rien ne la modifie plus jamais. */
  return q<{ id: string; evidence_id: string; rung: string; fields: ExtractedField[]; overall_confidence: number | null; filename: string; doc_type: string | null; item_description: string | null }>(
    `select x.id, x.evidence_id, x.rung, x.fields, x.overall_confidence::float, e.filename, e.doc_type,
            i.description item_description
     from extraction x
     join evidence e on e.id = x.evidence_id
     left join request_item i on i.id = e.request_item_id
     where e.engagement_id = $1 and x.status = 'pending_verify'
       and not exists (select 1 from extraction x2 where x2.supersedes_extraction_id = x.id)
     order by x.overall_confidence asc nulls first`,
    [engagementId],
  );
}

/** L2 verification act (ADR-012): validator sees evidence + fields side-by-side and
 *  attests, correcting fields where needed.
 *
 *  P1-06 (AUD-10) : `extraction` est append-only (0178, forbid_mutation) — vérifier n'édite plus
 *  la ligne d'origine (la valeur BRUTE, avant correction humaine, disparaissait sinon). Une ligne
 *  NEUVE, `status='verified'`, est insérée, `supersedes_extraction_id` pointant vers l'originale.
 *  `latestExtraction()` n'a besoin d'AUCUN changement : son tri (verified > complete
 *  > pending_verify, puis created_at desc) préfère déjà la ligne la plus récente au bon statut —
 *  la nouvelle ligne verified, plus récente, gagne naturellement.
 *
 *  `rung` PORTÉ DEPUIS L'ORIGINALE (revue hostile P1-06, voix 2, CONFIRMÉ MOYENNE — un
 *  premier jet le posait littéralement à `'human'`) : dans l'échelle (`runLadder`), `human`
 *  désigne le CINQUIÈME échelon — une pièce saisie ENTIÈREMENT à la main, sans aucun concours
 *  automatisé — pas « un humain a vérifié ». Une pièce lue par OCR (`rung='ocr'`) puis vérifiée
 *  reste `rung='ocr'` : c'est `status='verified'`/`verified_by` qui porte l'acte de vérification
 *  L2, un axe distinct. Écraser `rung` en 'human' mentait sur la provenance (P7, « d'où vient ce
 *  chiffre ? ») partout où `rung` est lu (atelier.tsx, workpapers/draft.ts, provenance.ts) — et
 *  se contredisait avec `ai_run_id`, porté juste en dessous, sur la même ligne. */
export async function verifyExtraction(extractionId: string, userId: string, corrected?: ExtractedField[]): Promise<void> {
  await assertMembreDe('extraction', extractionId, userId, 'vérifier une extraction');
  const x = await q1<{ id: string; evidence_id: string; rung: string; status: string; fields: ExtractedField[]; ai_run_id: string | null }>(
    `select id, evidence_id, rung, status, fields, ai_run_id from extraction where id = $1`,
    [extractionId],
  );
  /* CORRECTIF DE REVUE HOSTILE (P1-06, voix 1, CONFIRMÉ MOYENNE-BASSE, V1-05) : sans ce refus,
     vérifier deux fois la MÊME ligne d'origine (double clic, deux onglets, un écran resté
     ouvert après qu'un autre auditeur a déjà statué) insérait deux lignes `verified`
     concurrentes qui la supersèdent toutes deux — `latestExtraction()` en gardait une au hasard
     de l'ordre, l'autre restant une correction humaine orpheline, jamais dite.
     `x.status` NE SERT PAS DE GARDE ICI (piège trouvé en écrivant le test de ce chemin, pas
     deviné) : `extraction` est append-only depuis 0178 — la ligne D'ORIGINE garde
     `status = 'pending_verify'` POUR TOUJOURS, qu'elle ait été supersédée ou non. Le seul fait
     qui distingue « déjà vérifiée » de « encore à vérifier » est l'EXISTENCE d'une ligne qui la
     supersède. Le pré-contrôle nomme le cas courant (séquentiel) ; l'index
     `extraction_supersedes_once` (0178) rattrape la vraie COURSE en dessous (23505), au cas où
     deux requêtes passeraient ce SELECT avant que l'une des deux n'écrive — même patron que
     `ajouterColonneGrille` (COL-01, migration 0145). */
  const dejaSuperseedee = await q01<{ id: string }>(`select id from extraction where supersedes_extraction_id = $1`, [extractionId]);
  if (dejaSuperseedee) {
    throw new Error(`cette extraction n'attend plus de vérification — déjà vérifiée par ailleurs.`);
  }
  const ev = await q1<{ engagement_id: string }>(`select engagement_id from evidence where id = $1`, [x.evidence_id]);
  const ctx = await engagementCtx(ev.engagement_id);
  const fields = (corrected ?? x.fields).map((f) => ({ ...f, confidence: 1 }));
  let row: { id: string };
  try {
    row = await q1<{ id: string }>(
      /* `ai_run_id` PORTÉ : la ligne vérifiée reste traçable au run qui l'a produite (P7, « d'où
         vient ce chiffre ? ») — le perdre romprait la provenance d'une extraction humainement
         corrigée. `overall_confidence` à 1 (tous les champs le sont désormais), jamais laissé NULL
         — une confiance non posée se lirait comme non mesurée, alors qu'elle est MAXIMALE ici. */
      `insert into extraction (evidence_id, rung, status, fields, overall_confidence, ai_run_id, verified_by, verified_at, supersedes_extraction_id)
       values ($1,$2,'verified',$3,1,$4,$5,now(),$6) returning id`,
      [x.evidence_id, x.rung, JSON.stringify(fields), x.ai_run_id, userId, extractionId],
    );
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === '23505') throw new Error(`cette extraction vient d'être vérifiée par ailleurs (course concurrente) — rechargez avant de rejouer.`);
    throw e;
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: ev.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'extraction_verified',
    objectType: 'extraction',
    objectId: row.id,
    payload: { corrected: corrected !== undefined, supersedes: extractionId },
  });
  /* P1-01 (AUD-01) — referme la proposition en attente (applicateur OU écran existant, voir le
     commentaire jumeau dans materiality.ts::validate). La proposition a été posée sous l'id
     ORIGINAL (extractionId) — c'est CET id qu'il faut résoudre, jamais le nouveau. Import
     différé : cycle avec `propositions/applicateurs.ts`, qui importe `verifyExtraction`. */
  const { resoudreParObjet } = await import('../propositions');
  await resoudreParObjet(ev.engagement_id, 'extraction_field', extractionId, corrected !== undefined ? 'modifiee' : 'acceptee', userId,
    corrected !== undefined ? { fields } : undefined);
}
