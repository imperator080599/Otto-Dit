import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { recordAiRun } from '@/lib/core/airuns';
import { engagementCtx } from './imports';
import { nextSeq } from './requests';
import { raiseFactor } from './questionnaire';
import { lireProcessus, FSLI_DU_CYCLE } from './processus';
import { getAnalyste, normaliserTranscript, type GenreEcart } from './entretiens-analyste';
import { gardeBudget } from './extraction/budget';
import { motif, type Motif } from './motif';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// L'ENTRETIEN DU RESPONSABLE DE PROCESSUS (point 2, ADR-108) — participants,
// date, support, compréhension documentée. PRÉCAUTION JURIDIQUE formalisée
// (docs/14_ENTRETIENS_CONSENTEMENT.md) : enregistrer suppose le consentement
// EXPLICITE de chaque participant, tracé (qui, quand), une durée de
// conservation écrite, et le module FONCTIONNE SANS ENREGISTREMENT — les
// notes saisies à la main sont le mode par défaut. Le transcript ne produit
// jamais de conclusion : des ÉCARTS CANDIDATS (omissions d'abord), statués
// un par un par une personne — question au client, facteur proposé au
// registre, ou écarté avec motif.

export const LIBELLES_ECARTS: Record<GenreEcart, string> = {
  omission_doc: 'décrit à l\'oral, absent de la documentation',
  omission_orale: 'documenté, passé sous silence',
  contradiction: 'le discours contredit la documentation',
};

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface ParticipantEntretien { nom: string; qualite: string; consentement: boolean }

export async function creerEntretien(opts: {
  engagementId: string;
  cycle: string;
  date: string;                        // AAAA-MM-JJ (ADR-063 : jamais d'input type=date)
  sujet: string;
  support: 'notes' | 'enregistrement';
  participants: ParticipantEntretien[];
  retentionUntil?: string | null;
  userId: string;
}): Promise<string> {
  await assertMembre(opts.engagementId, opts.userId, 'créer un entretien de processus');
  if (!DATE_ISO.test(opts.date)) throw new Error('entretien : la date s\'écrit AAAA-MM-JJ');
  if (!opts.sujet.trim()) throw new Error('entretien : le sujet est vide — un entretien sans objet ne se relit pas');
  const participants = opts.participants.filter((p) => p.nom.trim());
  if (!participants.length) throw new Error('entretien : aucun participant — qui a parlé ?');
  if (opts.support === 'enregistrement') {
    const sans = participants.filter((p) => !p.consentement);
    if (sans.length) {
      throw new Error(`entretien : enregistrer exige le consentement EXPLICITE de chaque participant — manquant pour ${sans.map((p) => p.nom.trim()).join(', ')}. Sans consentement, le support « notes » fonctionne entièrement.`);
    }
    if (!opts.retentionUntil || !DATE_ISO.test(opts.retentionUntil)) {
      throw new Error('entretien : un enregistrement porte une durée de conservation explicite (AAAA-MM-JJ) — à l\'échéance, le transcript se purge');
    }
    if (opts.retentionUntil <= opts.date) {
      throw new Error('entretien : la conservation se termine après l\'entretien, pas avant');
    }
  }
  const ctx = await engagementCtx(opts.engagementId);
  const itv = await q1<{ id: string }>(
    `insert into process_interview (engagement_id, cycle_ref, date_entretien, sujet, support, retention_until, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [opts.engagementId, opts.cycle, opts.date, opts.sujet.trim(), opts.support,
     opts.support === 'enregistrement' ? opts.retentionUntil : null, opts.userId],
  );
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    await q(
      `insert into interview_participant (interview_id, seq, nom, qualite, consent_recording, consent_at)
       values ($1,$2,$3,$4,$5, case when $5 then now() end)`,
      [itv.id, i + 1, p.nom.trim(), p.qualite.trim(), p.consentement],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId,
    actorKind: 'user', actorId: opts.userId,
    verb: 'interview_created', objectType: 'process_interview', objectId: itv.id,
    payload: { cycle: opts.cycle, support: opts.support, participants: participants.length,
      consentements: participants.filter((p) => p.consentement).length,
      retention: opts.support === 'enregistrement' ? opts.retentionUntil : null },
  });
  return itv.id;
}

export async function consignerComprehension(interviewId: string, texte: string, userId: string): Promise<void> {
  await assertMembreDe('process_interview', interviewId, userId, 'consigner la compréhension d’un entretien');
  if (!texte.trim()) throw new Error('entretien : la compréhension documentée est vide — écrire ce qu\'on a compris est le livrable de l\'entretien');
  const itv = await q1<{ engagement_id: string }>(
    `update process_interview set comprehension = $2 where id = $1 returning engagement_id`,
    [interviewId, texte.trim()],
  );
  const ctx = await engagementCtx(itv.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: itv.engagement_id,
    actorKind: 'user', actorId: userId,
    verb: 'interview_understanding_written', objectType: 'process_interview', objectId: interviewId,
    payload: { longueur: texte.trim().length },
  });
}

export async function deposerTranscript(interviewId: string, contenu: string, userId: string): Promise<void> {
  await assertMembreDe('process_interview', interviewId, userId, 'déposer le transcript d’un entretien');
  const itv = await q1<{ engagement_id: string; support: string }>(
    `select engagement_id, support from process_interview where id = $1`, [interviewId],
  );
  if (itv.support !== 'enregistrement') {
    throw new Error('entretien : cet entretien est au support « notes » — il n\'y a pas d\'enregistrement à transcrire. La compréhension se documente à la main, et le module fonctionne ainsi en entier.');
  }
  const texte = normaliserTranscript(contenu);
  if (!texte) throw new Error('entretien : le transcript est vide');
  const deja = await q01<{ id: string }>(`select id from interview_transcript where interview_id = $1`, [interviewId]);
  if (deja) throw new Error('entretien : un transcript est déjà déposé pour cet entretien');
  await q(
    `insert into interview_transcript (interview_id, contenu, created_by) values ($1,$2,$3)`,
    [interviewId, texte, userId],
  );
  const ctx = await engagementCtx(itv.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: itv.engagement_id,
    actorKind: 'user', actorId: userId,
    verb: 'transcript_deposited', objectType: 'process_interview', objectId: interviewId,
    payload: { longueur: texte.length },
  });
}

/** La documentation contre laquelle le discours se confronte : la version N,
 *  mise à plat en texte stable. */
function digestDocumentation(nom: string, etapes: { code: string; libelle: string; acteur: string; systeme: string; entrees: string; sorties: string }[], controles: { code: string; etape: string; libelle: string; frequence: string; proprietaire: string }[]): string {
  return [
    `PROCESSUS : ${nom}`,
    'ÉTAPES :',
    ...etapes.map((e) => `- ${e.code} ${e.libelle} | acteur : ${e.acteur} | système : ${e.systeme} | entrées : ${e.entrees} | sorties : ${e.sorties}`),
    'CONTRÔLES :',
    ...controles.map((c) => `- ${c.code} (étape ${c.etape}) ${c.libelle} | fréquence : ${c.frequence} | propriétaire : ${c.proprietaire}`),
  ].join('\n');
}

/** Confronter le DISCOURS à la DOCUMENTATION — écarts CANDIDATS, jamais une
 *  conclusion. Rejeu enregistré par défaut ; adaptateur réel = garde de
 *  budget puis ai_run, comme toute lecture payante (ADR-105). */
export async function analyserTranscript(interviewId: string, userId: string): Promise<{ ajoutes: number; coutUsd: number; adapter: string }> {
  await assertMembreDe('process_interview', interviewId, userId, 'analyser le transcript d’un entretien');
  const itv = await q1<{ engagement_id: string; cycle_ref: string; date_entretien: string }>(
    `select engagement_id, cycle_ref, date_entretien::text from process_interview where id = $1`, [interviewId],
  );
  const transcript = await q01<{ contenu: string }>(
    `select contenu from interview_transcript where interview_id = $1`, [interviewId],
  );
  if (!transcript) throw new Error('entretien : aucun transcript déposé — rien à confronter');
  const dejaAnalyse = await q01<{ id: string }>(`select id from transcript_gap where interview_id = $1 limit 1`, [interviewId]);
  if (dejaAnalyse) {
    throw new Error('entretien : ce transcript est déjà analysé — les écarts se statuent un par un, l\'analyse ne se relance pas par-dessus');
  }
  const versions = await lireProcessus(itv.engagement_id, itv.cycle_ref);
  if (!versions.n) {
    throw new Error(`entretien : la version N du processus ${itv.cycle_ref} n'est pas décrite — le discours se confronte à la documentation, pas à rien`);
  }
  const documentation = digestDocumentation(versions.n.nom, versions.n.etapes, versions.n.controles);

  const adapter = getAnalyste();
  if (adapter.name !== 'mock') await gardeBudget();
  const reponse = await adapter.analyser(transcript.contenu, documentation);
  if (!reponse) {
    throw new Error('entretien : le rejeu enregistré ne connaît pas ce transcript — déposez celui du jeu de données (dataset/entretiens/), ou lancez le mode IA réelle (npm run demo:ia) pour analyser un entretien jamais vu');
  }
  const ctx = await engagementCtx(itv.engagement_id);
  const aiRunId = await recordAiRun({
    tenantId: ctx.tenant_id,
    engagementId: itv.engagement_id,
    purpose: 'transcript_gaps',
    adapter: adapter.name,
    model: reponse.model,
    promptId: 'entretien-ecarts',
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
      `insert into transcript_gap (interview_id, seq, kind, citation, description, ai_run_id)
       values ($1,$2,$3,$4,$5,$6)`,
      [interviewId, i + 1, e.kind, e.citation, e.description, aiRunId],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: itv.engagement_id,
    actorKind: 'user', actorId: userId,
    verb: 'transcript_analyzed', objectType: 'process_interview', objectId: interviewId,
    payload: { adapter: adapter.name, model: reponse.model, ecarts: reponse.ecarts.length, coutUsd: reponse.costUsd },
  });
  return { ajoutes: reponse.ecarts.length, coutUsd: reponse.costUsd, adapter: adapter.name };
}

export interface EcartLu {
  id: string; seq: number; kind: GenreEcart; citation: string; description: string;
  status: 'candidate' | 'question' | 'factor' | 'dismissed';
  decideur: string | null; decisionReason: string | null; coutUsd: number;
}
export interface EntretienLu {
  id: string; cycle: string; date: string; sujet: string; support: 'notes' | 'enregistrement';
  comprehension: string; retentionUntil: string | null; transcriptDepose: boolean; transcriptPurge: boolean;
  participants: { nom: string; qualite: string; consentement: boolean; quand: string | null }[];
  ecarts: EcartLu[];
}

export async function lireEntretiens(engagementId: string, cycle?: string): Promise<EntretienLu[]> {
  const itvs = await q<{ id: string; cycle_ref: string; date_entretien: string; sujet: string; support: string; comprehension: string; retention_until: string | null }>(
    `select id::text, cycle_ref, date_entretien::text, sujet, support, comprehension, retention_until::text
     from process_interview where engagement_id = $1 ${cycle ? 'and cycle_ref = $2' : ''}
     order by date_entretien, created_at`,
    cycle ? [engagementId, cycle] : [engagementId],
  );
  const out: EntretienLu[] = [];
  for (const i of itvs) {
    const participants = await q<{ nom: string; qualite: string; consent_recording: boolean; consent_at: string | null }>(
      `select nom, qualite, consent_recording, consent_at::text from interview_participant
       where interview_id = $1 order by seq`,
      [i.id],
    );
    const transcript = await q01<{ id: string }>(`select id from interview_transcript where interview_id = $1`, [i.id]);
    const ecarts = await q<{ id: string; seq: number; kind: string; citation: string; description: string; status: string; decideur: string | null; decision_reason: string | null; cost_usd: string | null }>(
      `select g.id::text, g.seq, g.kind, g.citation, g.description, g.status,
              u.name decideur, g.decision_reason, a.cost_usd::text
       from transcript_gap g
       left join app_user u on u.id = g.decided_by
       left join ai_run a on a.id = g.ai_run_id
       where g.interview_id = $1 order by g.seq`,
      [i.id],
    );
    out.push({
      id: i.id, cycle: i.cycle_ref, date: i.date_entretien, sujet: i.sujet,
      support: i.support as EntretienLu['support'],
      comprehension: i.comprehension, retentionUntil: i.retention_until,
      transcriptDepose: Boolean(transcript),
      transcriptPurge: !transcript && ecarts.length > 0 && i.support === 'enregistrement',
      participants: participants.map((p) => ({
        nom: p.nom, qualite: p.qualite, consentement: p.consent_recording, quand: p.consent_at,
      })),
      ecarts: ecarts.map((e) => ({
        id: e.id, seq: e.seq, kind: e.kind as GenreEcart, citation: e.citation,
        description: e.description, status: e.status as EcartLu['status'],
        decideur: e.decideur, decisionReason: e.decision_reason, coutUsd: Number(e.cost_usd ?? 0),
      })),
    });
  }
  return out;
}

/** Statuer UN écart candidat — la confirmation HUMAINE. Question au client
 *  (brouillon L2), facteur PROPOSÉ au registre, ou écarté avec motif. */
export async function statuerEcart(opts: {
  gapId: string; decision: 'question' | 'factor' | 'dismissed'; reason?: string; userId: string;
}): Promise<void> {
  await assertMembreDe('transcript_gap', opts.gapId, opts.userId, 'statuer un écart d’entretien');
  const g = await q1<{ id: string; interview_id: string; seq: number; kind: string; citation: string; description: string; status: string; engagement_id: string; cycle_ref: string; date_entretien: string }>(
    `select g.id::text, g.interview_id::text, g.seq, g.kind, g.citation, g.description, g.status,
            i.engagement_id::text, i.cycle_ref, i.date_entretien::text
     from transcript_gap g join process_interview i on i.id = g.interview_id
     where g.id = $1`,
    [opts.gapId],
  );
  if (g.status !== 'candidate') {
    throw new Error('entretien : cet écart est déjà statué — une décision se revoit, elle ne s\'écrase pas');
  }
  const motif = (opts.reason ?? '').trim();
  if (opts.decision === 'dismissed' && !motif) {
    throw new Error('entretien : écarter un écart sans motif écrit ne se relit pas — motif requis');
  }
  const ctx = await engagementCtx(g.engagement_id);
  let requestId: string | null = null;

  if (opts.decision === 'question') {
    /* Une demande BROUILLON par entretien : la première question la crée, les
       suivantes s'y ajoutent — le circuit habituel des demandes (L2). */
    const existante = await q01<{ request_id: string }>(
      `select g2.request_id::text from transcript_gap g2
       join request r on r.id = g2.request_id
       where g2.interview_id = $1 and g2.request_id is not null and r.status = 'draft'
       limit 1`,
      [g.interview_id],
    );
    if (existante) {
      requestId = existante.request_id;
    } else {
      const seq = await nextSeq(g.engagement_id);
      const r = await q1<{ id: string }>(
        `insert into request (engagement_id, seq_no, title, language, status)
         values ($1,$2,$3,'fr','draft') returning id`,
        [g.engagement_id, seq, `Entretien du ${g.date_entretien} — points à préciser`],
      );
      requestId = r.id;
    }
    await q(
      `insert into request_item (request_id, kind, description) values ($1,'explanation',$2)`,
      [requestId, `${g.description}${g.citation ? ` (l'entretien indique : « ${g.citation} »)` : ''} Pouvez-vous préciser ce point, et indiquer par quel contrôle documenté il est couvert ?`],
    );
  }

  if (opts.decision === 'factor') {
    const cibles = FSLI_DU_CYCLE[g.cycle_ref];
    if (!cibles) throw new Error(`entretien : aucun poste n'est rattaché au cycle « ${g.cycle_ref} »`);
    await raiseFactor({
      engagementId: g.engagement_id,
      source: 'manual',
      sourceRef: `entretien:${g.interview_id}:${g.seq}`,
      nature: 'controle',
      description: `${g.description} (entretien du ${g.date_entretien}${g.citation ? `, « ${g.citation} »` : ''})`,
      targets: cibles,
      actorUserId: opts.userId,
    });
  }

  await q(
    `update transcript_gap set status = $2, decided_by = $3, decided_at = now(),
       decision_reason = $4, request_id = $5 where id = $1`,
    [opts.gapId, opts.decision, opts.userId, motif || null, requestId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: g.engagement_id,
    actorKind: 'user', actorId: opts.userId,
    verb: 'transcript_gap_decided', objectType: 'transcript_gap', objectId: opts.gapId,
    payload: { decision: opts.decision, kind: g.kind, requestId },
  });
}

/** Purger les transcripts dont la conservation est échue. Les ÉCARTS et la
 *  compréhension restent : ce sont les travaux de l'auditeur ; c'est
 *  l'ENREGISTREMENT transcrit qui a une durée de vie. */
export async function purgerTranscriptsEchus(engagementId: string, aujourdHui: string, userId: string): Promise<number> {
  await assertMembre(engagementId, userId, 'purgerTranscriptsEchus');
  if (!DATE_ISO.test(aujourdHui)) throw new Error('purge : la date s\'écrit AAAA-MM-JJ');
  const echus = await q<{ id: string; interview_id: string }>(
    `select t.id::text, t.interview_id::text
     from interview_transcript t join process_interview i on i.id = t.interview_id
     where i.engagement_id = $1 and i.retention_until is not null and i.retention_until < $2`,
    [engagementId, aujourdHui],
  );
  if (!echus.length) return 0;
  const ctx = await engagementCtx(engagementId);
  for (const t of echus) {
    await q(`delete from interview_transcript where id = $1`, [t.id]);
    await logEvent({
      tenantId: ctx.tenant_id, engagementId,
      actorKind: 'user', actorId: userId,
      verb: 'transcript_purged', objectType: 'process_interview', objectId: t.interview_id,
      payload: { raison: 'conservation échue' },
    });
  }
  return echus.length;
}

/** Les obstacles au visa portés par les entretiens : des écarts CANDIDATS
 *  jamais statués — une analyse lancée puis abandonnée ne se scelle pas. */
export async function obstaclesEntretiens(engagementId: string): Promise<Motif[]> {
  const lignes = await q<{ date_entretien: string; n: string }>(
    `select i.date_entretien::text, count(*)::text n
     from transcript_gap g join process_interview i on i.id = g.interview_id
     where i.engagement_id = $1 and g.status = 'candidate'
     group by i.date_entretien order by i.date_entretien`,
    [engagementId],
  );
  return lignes.map((l) => motif('obst.entretienEcartsCandidats', { date: l.date_entretien, n: l.n }));
}
