import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { recordAiRun } from '@/lib/core/airuns';
import { engagementCtx } from './imports';
import { nextSeq } from './requests';
import { ajouterTacheControle } from './sox';
import { getAnalysteWalkthrough, normaliserTranscript, type GenreEcart } from './entretiens-analyste';
import { gardeBudget, assertBudgetActifEnBase } from './extraction/budget';
import { assertMembreDe } from '@/lib/core/membre';

// §4 POINT 3 (mandat du 10 septembre 2026, point 1) — L'ANALYSE DE WALKTHROUGH (R74).
//
// MÊME FORME QUE entretiens.ts (ADR-108) : un transcript déposé, confronté à
// ce qui est DÉJÀ DOCUMENTÉ, produit des ÉCARTS CANDIDATS (omissions
// d'abord), statués un par un par une personne — jamais une conclusion
// automatique. Ici, « déjà documenté » veut dire les tâches du contrôle
// (`control_task.description`, 0148) plutôt qu'un processus : le walkthrough
// est ancré sur `control`, comme sa vidéo (`di_walkthrough_evidence_id`).
//
// TROIS PRÉCONDITIONS DANS L'ORDRE (CLAUDE.md, interdits ; mandat du 9
// septembre §4), câblées ICI POUR LA PREMIÈRE FOIS dans ce dépôt — même
// entretiens.ts (adapter réel déjà construit, ADR-108) n'appelle QUE
// `gardeBudget()` (le plafond de dépense CUMULÉE), jamais
// `assertBudgetActifEnBase()` (IA-BUDGET-01, le DROIT MÊME de tenter une
// lecture payante) : trouvé en traçant le chemin avant d'écrire cette
// tranche, corrigé ICI, pas là-bas (règle 19 — cette tranche ne touche pas
// entretiens.ts, le manque y reste, nommé au backlog).
//   1. `getAnalysteWalkthrough()` — `demoPublique()` coupe déjà tout
//      déploiement public vers le rejeu, inconditionnellement (ADR-109).
//   2. `assertBudgetActifEnBase()` — IA-BUDGET-01 : la garde EN BASE, posée
//      UNIQUEMENT par une écriture SQL directe du fondateur. Refuse si
//      absente, incomplète, ou sans provenance qui/quand.
//   3. `gardeBudget()` — le plafond de dépense CUMULÉE (OTTO_BUDGET_USD),
//      une fois le droit d'essayer déjà établi.
// Les trois se sautent en mode rejeu (`adapter.name === 'mock'`) : aucune
// garde ne coûte quoi que ce soit à la suite de tests, zéro réseau (règle 4).

export const LIBELLES_ECARTS_WALKTHROUGH: Record<GenreEcart, string> = {
  omission_doc: 'décrit dans le walkthrough, absent des tâches documentées',
  omission_orale: 'tâche documentée, jamais évoquée dans le walkthrough',
  contradiction: 'le walkthrough contredit une tâche documentée',
};

/** Le transcript déposé du walkthrough — UN par contrôle (`unique(control_id)`,
 *  0158), remplacé jamais superposé : redéposer avant analyse écrase le
 *  brouillon, après analyse est refusé (les écarts déjà levés citeraient un
 *  texte qui n'existe plus). */
export async function deposerTranscriptWalkthrough(controlId: string, contenu: string, userId: string): Promise<void> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'déposer le transcript d’un walkthrough');
  const c = await q1<{ di_walkthrough_evidence_id: string | null }>(
    `select di_walkthrough_evidence_id from control where id = $1`, [controlId]);
  if (!c.di_walkthrough_evidence_id) {
    throw new Error('walkthrough : aucun enregistrement vidéo attaché — attachez-le avant de déposer un transcript (§2.1.1)');
  }
  const texte = normaliserTranscript(contenu);
  if (!texte) throw new Error('walkthrough : le transcript est vide');
  /* MÊME REFUS QU'entretiens.ts::deposerTranscript, jamais un upsert silencieux (règle 6) : un
     transcript déjà déposé — analysé ou non — ne se remplace pas par un second dépôt. */
  const deposeDeja = await q01<{ id: string }>(`select id from control_walkthrough_transcript where control_id = $1`, [controlId]);
  if (deposeDeja) throw new Error('walkthrough : un transcript est déjà déposé pour ce contrôle');
  await q(
    `insert into control_walkthrough_transcript (engagement_id, control_id, contenu, created_by)
     values ($1,$2,$3,$4)`,
    [engagementId, controlId, texte, userId],
  );
  await logEvent({
    tenantId: (await engagementCtx(engagementId)).tenant_id, engagementId,
    actorKind: 'user', actorId: userId,
    verb: 'walkthrough_transcript_deposited', objectType: 'control', objectId: controlId, payload: {},
  });
}

/** La documentation confrontée au transcript : les tâches DÉJÀ documentées de
 *  ce contrôle, dans l'ordre où l'auditeur les a écrites. Un contrôle sans
 *  AUCUNE tâche rend une chaîne vide — le walkthrough s'y confronte quand
 *  même : tout ce qui y est décrit est alors une omission (`omission_doc`),
 *  exactement le cas que ce prompt sait nommer (SYSTEM_WALKTHROUGH). */
async function documentationDuControle(controlId: string): Promise<string> {
  const taches = await q<{ description: string }>(
    `select description from control_task where control_id = $1 order by seq_no`, [controlId]);
  return taches.map((t, i) => `${i + 1}. ${t.description}`).join('\n');
}

export async function analyserWalkthrough(controlId: string, userId: string): Promise<{ ajoutes: number; coutUsd: number; adapter: string }> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'analyser le transcript d’un walkthrough');
  const c = await q1<{ code: string }>(`select code from control where id = $1`, [controlId]);
  const transcript = await q01<{ contenu: string }>(
    `select contenu from control_walkthrough_transcript where control_id = $1`, [controlId]);
  if (!transcript) throw new Error('walkthrough : aucun transcript déposé — rien à confronter');
  const dejaAnalyse = await q01<{ id: string }>(`select id from control_walkthrough_gap where control_id = $1 limit 1`, [controlId]);
  if (dejaAnalyse) {
    throw new Error('walkthrough : déjà analysé — les écarts se statuent un par un, l’analyse ne se relance pas par-dessus');
  }
  const documentation = await documentationDuControle(controlId);

  const adapter = getAnalysteWalkthrough();
  if (adapter.name !== 'mock') {
    await assertBudgetActifEnBase();   // 1. le droit même de tenter (IA-BUDGET-01)
    await gardeBudget();               // 2. le plafond de dépense cumulée
  }
  const reponse = await adapter.analyser(transcript.contenu, documentation);
  if (!reponse) {
    throw new Error('walkthrough : le rejeu enregistré ne connaît pas ce transcript — déposez celui du jeu de données (dataset/fixtures/walkthroughs.json), ou lancez le mode IA réelle pour analyser un walkthrough jamais vu');
  }
  const ctx = await engagementCtx(engagementId);
  const aiRunId = await recordAiRun({
    tenantId: ctx.tenant_id,
    engagementId,
    purpose: 'walkthrough_gaps',
    adapter: adapter.name,
    model: reponse.model,
    promptId: 'walkthrough-ecarts',
    promptVersion: 'v1',
    input: `${documentation}\n---\n${transcript.contenu}`,
    output: JSON.stringify(reponse.ecarts),
    tokensIn: reponse.tokensIn,
    tokensOut: reponse.tokensOut,
    costUsd: reponse.costUsd,
    latencyMs: reponse.latencyMs,
  });
  for (let i = 0; i < reponse.ecarts.length; i++) {
    const e = reponse.ecarts[i];
    await q(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, citation, description, ai_run_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [engagementId, controlId, i + 1, e.kind, e.citation, e.description, aiRunId],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId,
    actorKind: 'user', actorId: userId,
    verb: 'walkthrough_analyzed', objectType: 'control', objectId: controlId,
    payload: { code: c.code, adapter: adapter.name, model: reponse.model, ecarts: reponse.ecarts.length, coutUsd: reponse.costUsd },
  });
  return { ajoutes: reponse.ecarts.length, coutUsd: reponse.costUsd, adapter: adapter.name };
}

export interface EcartWalkthroughLu {
  id: string; seq: number; kind: GenreEcart; citation: string; description: string;
  status: 'candidate' | 'question' | 'task' | 'dismissed';
  decideur: string | null; decisionReason: string | null; coutUsd: number;
}

export interface WalkthroughDuControle {
  transcriptDepose: boolean;
  ecarts: EcartWalkthroughLu[];
}

export async function walkthroughDuControle(controlId: string): Promise<WalkthroughDuControle> {
  const transcript = await q01<{ id: string }>(`select id from control_walkthrough_transcript where control_id = $1`, [controlId]);
  const ecarts = await q<{ id: string; seq: number; kind: string; citation: string; description: string; status: string; decideur: string | null; decision_reason: string | null; cost_usd: string | null }>(
    `select g.id::text, g.seq, g.kind, g.citation, g.description, g.status,
            u.name decideur, g.decision_reason, a.cost_usd::text
     from control_walkthrough_gap g
     left join app_user u on u.id = g.decided_by
     left join ai_run a on a.id = g.ai_run_id
     where g.control_id = $1 order by g.seq`,
    [controlId],
  );
  return {
    transcriptDepose: Boolean(transcript),
    ecarts: ecarts.map((e) => ({
      id: e.id, seq: e.seq, kind: e.kind as GenreEcart, citation: e.citation,
      description: e.description, status: e.status as EcartWalkthroughLu['status'],
      decideur: e.decideur, decisionReason: e.decision_reason, coutUsd: Number(e.cost_usd ?? 0),
    })),
  };
}

/** Statuer UN écart candidat — la confirmation HUMAINE (plafond L2, permanent).
 *  Question au client (brouillon), NOUVELLE TÂCHE documentée
 *  (`ajouterTacheControle`, sox.ts — réutilisée, jamais une seconde écriture
 *  de `control_task`), ou écarté avec motif écrit. */
export async function statuerEcartWalkthrough(opts: {
  gapId: string; decision: 'question' | 'task' | 'dismissed'; reason?: string; userId: string;
}): Promise<void> {
  const engagementId = await assertMembreDe('control_walkthrough_gap', opts.gapId, opts.userId, 'statuer un écart de walkthrough');
  const g = await q1<{ id: string; control_id: string; seq: number; kind: string; citation: string; description: string; status: string; code: string }>(
    `select g.id::text, g.control_id::text, g.seq, g.kind, g.citation, g.description, g.status, c.code
     from control_walkthrough_gap g join control c on c.id = g.control_id
     where g.id = $1`,
    [opts.gapId],
  );
  if (g.status !== 'candidate') {
    throw new Error('walkthrough : cet écart est déjà statué — une décision se revoit, elle ne s’écrase pas');
  }
  const motif = (opts.reason ?? '').trim();
  if (opts.decision === 'dismissed' && !motif) {
    throw new Error('walkthrough : écarter un écart sans motif écrit ne se relit pas — motif requis');
  }
  const ctx = await engagementCtx(engagementId);
  let requestId: string | null = null;
  let taskId: string | null = null;

  if (opts.decision === 'question') {
    /* Une demande BROUILLON par contrôle : la première question la crée, les
       suivantes s'y ajoutent — le circuit habituel des demandes (L2). */
    const existante = await q01<{ request_id: string }>(
      `select g2.request_id::text from control_walkthrough_gap g2
       join request r on r.id = g2.request_id
       where g2.control_id = $1 and g2.request_id is not null and r.status = 'draft'
       limit 1`,
      [g.control_id],
    );
    if (existante) {
      requestId = existante.request_id;
    } else {
      const seq = await nextSeq(engagementId);
      const r = await q1<{ id: string }>(
        `insert into request (engagement_id, seq_no, title, language, status)
         values ($1,$2,$3,'fr','draft') returning id`,
        [engagementId, seq, `Walkthrough du contrôle ${g.code} — points à préciser`],
      );
      requestId = r.id;
    }
    await q(
      `insert into request_item (request_id, kind, description) values ($1,'explanation',$2)`,
      [requestId, `${g.description}${g.citation ? ` (le walkthrough indique : « ${g.citation} »)` : ''} Pouvez-vous préciser ce point ?`],
    );
  }

  if (opts.decision === 'task') {
    taskId = await ajouterTacheControle(
      g.control_id, opts.userId,
      `${g.description}${g.citation ? ` (walkthrough : « ${g.citation} »)` : ''}`,
    );
  }

  await q(
    `update control_walkthrough_gap set status = $2, decided_by = $3, decided_at = now(),
       decision_reason = $4, request_id = $5, control_task_id = $6 where id = $1`,
    [opts.gapId, opts.decision, opts.userId, motif || null, requestId, taskId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId,
    actorKind: 'user', actorId: opts.userId,
    verb: 'walkthrough_gap_decided', objectType: 'control_walkthrough_gap', objectId: opts.gapId,
    payload: { decision: opts.decision, kind: g.kind, requestId, taskId },
  });
}
