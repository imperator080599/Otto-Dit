import { q, q1, q01 } from '@/lib/db/client';
import { missionN1 } from './engagement';
import { logEvent } from '@/lib/core/events';
import { motif, type Motif } from './motif';

// LA REPRISE DU DOSSIER PRÉCÉDENT (point 2b).
//
// UN DOSSIER DE DEUXIÈME ANNÉE NE REPART PAS DE ZÉRO. Le périmètre, les
// facteurs de risque, les réponses au questionnaire et les décisions de
// non-significativité de l'an dernier sont le point de départ du raisonnement
// de cette année.
//
// MAIS ON NE REPREND PAS DES CHIFFRES, ON REPREND DES CONCLUSIONS. Les
// ressaisir coûte une journée ; les reprendre AUTOMATIQUEMENT coûte beaucoup
// plus cher — c'est signer cette année une conclusion qu'on n'a pas reprise.
//
// LA RÈGLE : rien n'est repris automatiquement. Tout arrive PROPOSÉ, avec sa
// source nommée, et une proposition non statuée est un OBSTACLE AU VISA.

export class CarryForwardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarryForwardError';
  }
}

export type NatureReprise = 'scoping' | 'risk_factor' | 'question_answer' | 'workpaper';

export interface Reprise {
  id: string;
  engagement_id: string;
  source_engagement_id: string;
  kind: NatureReprise;
  source_ref: string;
  label: string;
  detail: string;
  payload: Record<string, unknown>;
  status: 'proposed' | 'reconfirmed' | 'dismissed';
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

const COLONNES = `id, engagement_id, source_engagement_id, kind, source_ref, label, detail,
                  payload, status, decision_reason, decided_by, decided_at::text as decided_at`;

/**
 * La mission de l'exercice PRÉCÉDENT, sur la même entité et de même nature.
 *
 * Elle se trouve par le chaînage des exercices (`period.prior_period_id`), pas
 * par une date : un exercice de dix-huit mois, ou décalé, casserait toute
 * heuristique de date.
 */
export async function missionPrecedente(engagementId: string): Promise<{ id: string; name: string } | null> {
  /* UNE SEULE DÉFINITION DE N-1 dans le produit : celle de `missionN1`
     (engagement.ts). En avoir deux, c'est en avoir une fausse un jour — et
     c'est arrivé : l'en-tête montrait la mission NEP comme N-1 d'une mission
     SOX pendant que la reprise lisait la bonne (revue hostile n°4). */
  return missionN1(engagementId);
}

/* ── proposer ───────────────────────────────────────────────────────────── */

/**
 * Lit le dossier N-1 et PROPOSE ce qui mérite d'être repris.
 *
 * Idempotent : relancer ne duplique pas et n'écrase aucune décision déjà prise
 * — ce serait le pire des deux mondes, une reprise qui se re-propose après
 * avoir été écartée.
 */
export async function proposerReprise(engagementId: string, actorUserId: string): Promise<Reprise[]> {
  const prev = await missionPrecedente(engagementId);
  if (!prev) {
    throw new CarryForwardError(
      'aucune mission sur l’exercice précédent pour cette entité : il n’y a rien à reprendre. '
      + 'Une première année se planifie, elle ne se reprend pas.',
    );
  }
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);

  const propositions: Omit<Reprise, 'id' | 'engagement_id' | 'source_engagement_id' | 'status' | 'decision_reason' | 'decided_by' | 'decided_at'>[] = [];

  /* 1. LE PÉRIMÈTRE. Une décision de non-significativité de l'an dernier est
        exactement ce qu'un inspecteur regarde en deuxième année : elle a été
        prise sur des chiffres qui ont changé. */
  const scoping = await q<{ code: string; name: string; scoping: string; scoping_basis: string | null; balance: string }>(
    `select code, name, scoping, scoping_basis, balance::text as balance
     from fsli where engagement_id = $1 and scoping <> 'unscoped' order by code`,
    [prev.id],
  );
  for (const f of scoping) {
    propositions.push({
      kind: 'scoping', source_ref: f.code,
      label: `${f.code} — ${f.name} : « ${f.scoping} » l’exercice précédent`,
      detail: f.scoping_basis ?? '',
      payload: { scoping: f.scoping, basis: f.scoping_basis, balancePrecedent: f.balance },
    });
  }

  /* 2. LES FACTEURS DÉCLARÉS ET CONFIRMÉS. Un litige, une migration de
        système, une pression sur le résultat : ils ne s'évaporent pas au
        1er janvier. */
  const facteurs = await q<{ id: string; nature: string; description: string; targets: unknown; source: string }>(
    `select id, nature, description, targets, source
     from risk_factor_declared where engagement_id = $1 and status = 'confirmed'`,
    [prev.id],
  );
  for (const f of facteurs) {
    propositions.push({
      kind: 'risk_factor', source_ref: f.id,
      label: `Facteur retenu l’exercice précédent — ${f.nature}`,
      detail: f.description,
      payload: { nature: f.nature, description: f.description, targets: f.targets, sourcePrecedente: f.source },
    });
  }

  /* 3. LES RÉPONSES AU QUESTIONNAIRE. Elles arrivent proposées, pas
        pré-remplies : une réponse pré-remplie se relit distraitement. */
  const reponses = await q<{ question_code: string; fsli_code: string | null; answer: string; detail: string }>(
    `select question_code, fsli_code, answer, detail from risk_question_answer where engagement_id = $1`,
    [prev.id],
  );
  for (const r of reponses) {
    propositions.push({
      kind: 'question_answer', source_ref: `${r.question_code}:${r.fsli_code ?? '-'}`,
      label: `Question « ${r.question_code} »${r.fsli_code ? ` (${r.fsli_code})` : ' (entité)'} — « ${r.answer} » l’exercice précédent`,
      detail: r.detail,
      payload: { questionCode: r.question_code, fsliCode: r.fsli_code, answer: r.answer, detail: r.detail },
    });
  }

  /* 4. LES PAPIERS SIGNÉS. Ils ne se recopient pas — ils disent ce qui a été
        fait l'an dernier, donc ce qu'il faut refaire ou justifier de ne pas
        refaire. */
  const papiers = await q<{ code: string; title: string; reference: string | null; version: number }>(
    `select w.code, w.title, w.reference, w.version from workpaper w
     where w.engagement_id = $1 and w.status = 'signed' order by w.code`,
    [prev.id],
  );
  for (const w of papiers) {
    propositions.push({
      kind: 'workpaper', source_ref: w.code,
      label: `${w.reference ?? w.code} — ${w.title} (signé l’exercice précédent)`,
      detail: 'À refaire cette année, ou à justifier de ne pas refaire.',
      payload: { code: w.code, reference: w.reference, version: w.version },
    });
  }

  for (const p of propositions) {
    await q(
      `insert into carry_forward
         (engagement_id, source_engagement_id, kind, source_ref, label, detail, payload)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb)
       on conflict (engagement_id, kind, source_ref) do nothing`,
      [engagementId, prev.id, p.kind, p.source_ref, p.label, p.detail, JSON.stringify(p.payload)],
    );
  }

  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'carry_forward.proposed', objectType: 'engagement', objectId: engagementId,
    payload: { source: prev.id, count: propositions.length },
  });

  return reprises(engagementId);
}

export async function reprises(engagementId: string): Promise<Reprise[]> {
  return q<Reprise>(
    `select ${COLONNES} from carry_forward where engagement_id = $1
     order by case status when 'proposed' then 0 else 1 end, kind, source_ref`,
    [engagementId],
  );
}

/* ── décider ────────────────────────────────────────────────────────────── */

export async function deciderReprise(
  id: string,
  actorUserId: string,
  status: 'reconfirmed' | 'dismissed',
  reason = '',
): Promise<Reprise> {
  const r = await q01<Reprise>(`select ${COLONNES} from carry_forward where id = $1`, [id]);
  if (!r) throw new CarryForwardError('proposition de reprise inconnue');
  if (r.status !== 'proposed') throw new CarryForwardError('proposition déjà statuée');
  if (status === 'dismissed' && !reason.trim()) {
    /* Reconfirmer sans motif est permis : reconfirmer, c'est dire « j'ai
       regardé et c'est toujours vrai ». Écarter sans motif ne l'est pas — sans
       motif, un écart est indistinguable d'un oubli. */
    throw new CarryForwardError(
      'écarter une reprise se motive : sans motif, un écart est indistinguable d’un oubli',
    );
  }
  const eng = await q1<{ tenant_id: string }>(
    `select tenant_id from engagement where id = $1`, [r.engagement_id],
  );
  const row = await q1<Reprise>(
    `update carry_forward set status = $2, decision_reason = $3, decided_by = $4, decided_at = now()
     where id = $1 returning ${COLONNES}`,
    [id, status, reason.trim() || null, actorUserId],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId: r.engagement_id, actorKind: 'user', actorId: actorUserId,
    verb: status === 'reconfirmed' ? 'carry_forward.reconfirmed' : 'carry_forward.dismissed',
    objectType: 'carry_forward', objectId: id,
    payload: { kind: r.kind, sourceRef: r.source_ref, reason: reason.trim() },
  });
  return row;
}

/**
 * LES OBSTACLES AU VISA dus à la reprise.
 *
 * Une proposition non statuée bloque. C'est toute la différence entre une
 * reprise et une recopie : la recopie ne bloque rien, parce qu'elle ne demande
 * rien à personne.
 */
export async function obstaclesReprise(engagementId: string): Promise<Motif[]> {
  const enAttente = await q<{ kind: string; label: string }>(
    `select kind, label from carry_forward where engagement_id = $1 and status = 'proposed'
     order by kind, source_ref`,
    [engagementId],
  );
  return enAttente.map((r) => motif('obst.repriseNonStatuee', { objet: r.label }));
}

/** Ce qui a été repris, pour le dire dans le dossier. */
export async function reprisesRetenues(engagementId: string): Promise<Reprise[]> {
  return q<Reprise>(
    `select ${COLONNES} from carry_forward where engagement_id = $1 and status = 'reconfirmed'
     order by kind, source_ref`,
    [engagementId],
  );
}
