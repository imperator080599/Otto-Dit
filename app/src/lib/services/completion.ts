import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { currentEvaluation } from './evaluation';
import { jalons } from './acceptance';
import { motif, type Motif } from './motif';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { assertMembre } from '@/lib/core/membre';

// L'ACHÈVEMENT (point 10).
//
// Le dossier savait tester, évaluer, documenter et viser — mais pas ACHEVER.
// Or les travaux d'achèvement sont ceux qu'un inspecteur regarde en premier
// quand une faillite survient trois mois après le rapport.
//
// CE NE SONT PAS DES CASES À COCHER. Chaque nature porte une règle qui REFUSE,
// et ces règles sont des DATES ou des MONTANTS : déterministes, vérifiables,
// et donc autre chose que des rappels.

export class CompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompletionError';
  }
}

export type NatureAchevement =
  | 'evenements_posterieurs' | 'continuite' | 'anomalies_non_corrigees'
  | 'lettre_affirmation' | 'gouvernance';

export const NATURES: { code: NatureAchevement; libelle: CleLibelle; pourquoi: CleLibelle }[] = [
  { code: 'evenements_posterieurs', libelle: 'ach.evenements_posterieurs.titre', pourquoi: 'ach.evenements_posterieurs.pourquoi' },
  { code: 'continuite', libelle: 'ach.continuite.titre', pourquoi: 'ach.continuite.pourquoi' },
  { code: 'anomalies_non_corrigees', libelle: 'ach.anomalies_non_corrigees.titre', pourquoi: 'ach.anomalies_non_corrigees.pourquoi' },
  { code: 'lettre_affirmation', libelle: 'ach.lettre_affirmation.titre', pourquoi: 'ach.lettre_affirmation.pourquoi' },
  { code: 'gouvernance', libelle: 'ach.gouvernance.titre', pourquoi: 'ach.gouvernance.pourquoi' },
];

export interface Achevement {
  id: string;
  nature: NatureAchevement;
  status: 'open' | 'done' | 'na';
  findings: string;
  conclusion: string;
  covered_through: string | null;
  signed_on: string | null;
  evidence_id: string | null;
  na_reason: string | null;
  done_at: string | null;
}

const COLONNES = `id, nature, status, findings, conclusion,
                  covered_through::text as covered_through, signed_on::text as signed_on,
                  evidence_id, na_reason, done_at::text as done_at`;

/** Crée les cinq travaux s'ils n'existent pas. Idempotent. */
export async function assurerAchevement(engagementId: string): Promise<Achevement[]> {
  for (const n of NATURES) {
    await q(
      `insert into completion_item (engagement_id, nature) values ($1,$2)
       on conflict (engagement_id, nature) do nothing`,
      [engagementId, n.code],
    );
  }
  return travaux(engagementId);
}

export async function travaux(engagementId: string): Promise<Achevement[]> {
  return q<Achevement>(
    `select ${COLONNES} from completion_item where engagement_id = $1 order by nature`,
    [engagementId],
  );
}

/** La date de rapport du dossier — c'est elle qui porte les règles de date. */
export async function dateRapport(engagementId: string): Promise<string | null> {
  const j = (await jalons(engagementId)).find((x) => x.code === 'date_rapport');
  if (j?.due_date) return j.due_date.slice(0, 10);
  const e = await q01<{ report_date: string | null }>(
    `select report_date::text as report_date from engagement where id = $1`, [engagementId],
  );
  return e?.report_date?.slice(0, 10) ?? null;
}

/* ── conclure un travail ────────────────────────────────────────────────── */

export interface ConclusionInput {
  findings?: string;
  conclusion: string;
  coveredThrough?: string;
  signedOn?: string;
  evidenceId?: string;
}

/**
 * Conclut un travail d'achèvement — avec la règle de SA nature.
 *
 * Les règles sont des dates et des montants, pas des rappels : elles refusent.
 */
export async function conclure(
  engagementId: string, actorUserId: string, nature: NatureAchevement, input: ConclusionInput,
): Promise<void> {
  await assertMembre(engagementId, actorUserId, 'conclure');
  const t = await q01<Achevement>(
    `select ${COLONNES} from completion_item where engagement_id = $1 and nature = $2`,
    [engagementId, nature],
  );
  if (!t) throw new CompletionError('travail d’achèvement inconnu — ouvrez l’achèvement d’abord');
  if (t.status !== 'open') throw new CompletionError('travail déjà statué : il se rouvre, il ne se réécrit pas');
  if (!input.conclusion.trim()) {
    throw new CompletionError(
      'une conclusion d’achèvement s’écrit : une case cochée sans texte ne dit rien à qui relit le dossier dans trois ans',
    );
  }

  const rapport = await dateRapport(engagementId);
  if (!rapport) {
    throw new CompletionError(
      'la date de rapport n’est pas posée : les règles d’achèvement sont des règles de DATE, '
      + 'elles n’ont rien à quoi se comparer',
    );
  }

  if (nature === 'evenements_posterieurs') {
    if (!input.coveredThrough) {
      throw new CompletionError('dites jusqu’à quelle date les travaux vont : sans elle, on ne sait pas ce qui est couvert');
    }
    if (input.coveredThrough < rapport) {
      /* LE TROU. Des travaux qui s'arrêtent avant la date du rapport laissent
         une période non couverte, et personne ne s'en aperçoit à la lecture du
         dossier — c'est exactement ce qu'on cherche après coup. */
      throw new CompletionError(
        `les travaux s’arrêtent au ${input.coveredThrough} alors que le rapport est daté du ${rapport} : `
        + `la période du ${input.coveredThrough} au ${rapport} n’est couverte par aucun travail`,
      );
    }
  }

  if (nature === 'lettre_affirmation') {
    if (!input.signedOn) throw new CompletionError('la lettre porte une date : elle se saisit');
    if (!input.evidenceId) {
      throw new CompletionError('la lettre d’affirmation se clôt avec LA LETTRE : c’est une lettre, pas une conversation');
    }
    if (input.signedOn < rapport) {
      throw new CompletionError(
        `lettre datée du ${input.signedOn}, rapport daté du ${rapport} : une lettre antérieure au rapport `
        + `ne couvre pas la période auditée`,
      );
    }
    const piece = await q01<{ id: string }>(
      `select id from evidence where id = $1 and engagement_id = $2 and quarantined = false`,
      [input.evidenceId, engagementId],
    );
    if (!piece) throw new CompletionError('pièce inconnue de ce dossier, ou en quarantaine');
  }

  if (nature === 'anomalies_non_corrigees') {
    /* Le cumul se CALCULE ; ce qu'on en fait est un jugement. On refuse de
       conclure tant que l'évaluation n'a pas été menée : conclure sur un cumul
       qu'on n'a pas calculé, c'est conclure sur une impression. */
    const ev = await currentEvaluation(engagementId);
    if (!ev) {
      throw new CompletionError(
        'aucune évaluation des anomalies : le cumul n’a pas été calculé, il n’y a rien sur quoi conclure',
      );
    }
  }

  await q(
    `update completion_item
     set status = 'done', findings = $3, conclusion = $4, covered_through = $5,
         signed_on = $6, evidence_id = $7, done_by = $8, done_at = now()
     where engagement_id = $1 and nature = $2`,
    [engagementId, nature, input.findings ?? '', input.conclusion.trim(),
     input.coveredThrough ?? null, input.signedOn ?? null, input.evidenceId ?? null, actorUserId],
  );
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'completion.concluded', objectType: 'completion_item', objectId: t.id,
    payload: { nature, coveredThrough: input.coveredThrough ?? null, signedOn: input.signedOn ?? null },
  });
}

/** Écarte un travail — avec motif. Un travail écarté sans motif est un travail oublié. */
export async function sansObjet(
  engagementId: string, actorUserId: string, nature: NatureAchevement, reason: string,
): Promise<void> {
  await assertMembre(engagementId, actorUserId, 'sansObjet');
  if (!reason.trim()) {
    throw new CompletionError(
      'un travail « sans objet » se motive : sans motif, il est indistinguable d’un travail oublié',
    );
  }
  if (nature === 'lettre_affirmation') {
    /* La seule nature qu'on refuse d'écarter : une mission d'audit sans lettre
       d'affirmation n'est pas une mission d'audit allégée, c'est une mission
       incomplète. */
    throw new CompletionError(
      'la lettre d’affirmation ne se déclare pas sans objet : une mission sans lettre d’affirmation '
      + 'n’est pas allégée, elle est incomplète',
    );
  }
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
  await q(
    `update completion_item set status = 'na', na_reason = $3, done_by = $4, done_at = now()
     where engagement_id = $1 and nature = $2 and status = 'open'`,
    [engagementId, nature, reason.trim(), actorUserId],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'completion.na', objectType: 'engagement', objectId: engagementId,
    payload: { nature, reason: reason.trim() },
  });
}

/** Rouvre un travail conclu — parce qu'un fait nouveau se traite, il ne se cache pas. */
export async function rouvrir(
  engagementId: string, actorUserId: string, nature: NatureAchevement, reason: string,
): Promise<void> {
  await assertMembre(engagementId, actorUserId, 'rouvrir');
  if (!reason.trim()) throw new CompletionError('rouvrir un travail conclu se motive');
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
  await q(
    `update completion_item
     set status = 'open', done_by = null, done_at = null, na_reason = null
     where engagement_id = $1 and nature = $2`,
    [engagementId, nature],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'completion.reopened', objectType: 'engagement', objectId: engagementId,
    payload: { nature, reason: reason.trim() },
  });
}

/* ── ce qui bloque ──────────────────────────────────────────────────────── */

export async function obstaclesAchevement(engagementId: string): Promise<Motif[]> {
  const t = await travaux(engagementId);
  if (t.length === 0) return [motif('obst.achevementNonOuvert')];
  const out: Motif[] = [];
  for (const n of NATURES) {
    const x = t.find((y) => y.nature === n.code);
    if (!x || x.status === 'open') out.push(motif('obst.achevementNonConclu', { nature: { cle: n.libelle } }));
  }
  return out;
}
