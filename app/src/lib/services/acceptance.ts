import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { criteres } from '@/lib/methodology/catalogue';
import { fileDeadlines } from './retention';

/* Le cabinet d'une mission, lu ICI plutôt qu'importé de `team.ts` : celui-ci
   importe `assertAccepte`, et le cycle d'imports qui en résulterait tient
   peut-être aujourd'hui — il tombera le jour où l'ordre d'évaluation change. */
async function cabinetDe(engagementId: string): Promise<{ tenant_id: string }> {
  const row = await q01<{ tenant_id: string }>(
    `select tenant_id from engagement where id = $1`, [engagementId],
  );
  if (!row) throw new AcceptanceRuleError('mission inconnue');
  return row;
}

// ACCEPTATION, MAINTIEN, JALONS — le premier bout de l'arc (point 1).
//
// CE QUI MANQUAIT. Toute démonstration commençait AU MILIEU d'un dossier :
// l'entité, l'exercice et le référentiel étaient là, et rien ne disait comment
// on en arrive là. Or un dossier ne commence pas par un import — il commence
// par une DÉCISION d'accepter ou de maintenir la mission.
//
// LA RÈGLE QUI REFUSE, et c'est elle qui fait de cette tranche autre chose
// qu'un formulaire : AUCUN TRAVAIL NE SE PLANIFIE tant que l'acceptation n'est
// pas décidée. Le système refuse ; il ne rappelle pas. Même famille que
// « aucun travail sans déclaration signée » (ADR-068).

export class AcceptanceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcceptanceRuleError';
  }
}

export interface Reponse { answer: 'oui' | 'non'; detail: string }

export interface Acceptation {
  id: string;
  engagement_id: string;
  kind: 'acceptation' | 'maintien';
  answers: Record<string, Reponse>;
  status: 'open' | 'accepted' | 'declined';
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  methodology_version: string;
}

const COLONNES = `id, engagement_id, kind, answers, status, decision_reason,
                  decided_by, decided_at::text as decided_at, methodology_version`;

/* ── ouvrir ─────────────────────────────────────────────────────────────── */

/**
 * Ouvre la décision d'acceptation ou de maintien.
 *
 * La NATURE n'est pas un choix de confort : première année = acceptation,
 * renouvellement = maintien, et ce ne sont pas les mêmes questions. On la
 * déduit de l'existence d'un exercice précédent plutôt que de la demander —
 * une question dont la réponse est dans le dossier ne se pose pas.
 */
export async function ouvrirAcceptation(engagementId: string, actorUserId: string): Promise<Acceptation> {
  const deja = await currentAcceptation(engagementId);
  if (deja) return deja;

  const eng = await cabinetDe(engagementId);
  const anterieur = await q01<{ id: string }>(
    `select p.prior_period_id as id from engagement e
     join period p on p.id = e.period_id
     where e.id = $1 and p.prior_period_id is not null`,
    [engagementId],
  );
  const kind: 'acceptation' | 'maintien' = anterieur ? 'maintien' : 'acceptation';
  const cat = await catalogueDeLaMission(engagementId);

  const row = await q1<Acceptation>(
    `insert into engagement_acceptance (engagement_id, kind, methodology_version)
     values ($1, $2, $3) returning ${COLONNES}`,
    [engagementId, kind, cat.acceptation.version],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'acceptance.opened', objectType: 'engagement_acceptance', objectId: row.id,
    payload: { kind },
  });
  return row;
}

export async function currentAcceptation(engagementId: string): Promise<Acceptation | null> {
  return q01<Acceptation>(
    `select ${COLONNES} from engagement_acceptance where engagement_id = $1`,
    [engagementId],
  );
}

/* ── répondre ───────────────────────────────────────────────────────────── */

export async function repondreCritere(
  engagementId: string,
  actorUserId: string,
  code: string,
  answer: 'oui' | 'non',
  detail = '',
): Promise<Acceptation> {
  const a = await currentAcceptation(engagementId);
  if (!a) throw new AcceptanceRuleError('la décision d’acceptation n’est pas ouverte');
  if (a.status !== 'open') {
    throw new AcceptanceRuleError(
      'décision déjà prise : elle se révise en la rouvrant, elle ne se réécrit pas',
    );
  }
  const cat = await catalogueDeLaMission(engagementId);
  const posables = criteres(cat, a.kind);
  if (!posables.some((c) => c.code === code)) {
    throw new AcceptanceRuleError(
      `critère « ${code} » inconnu pour une décision de ${a.kind} `
      + `(posés : ${posables.map((c) => c.code).join(', ')})`,
    );
  }
  const answers = { ...a.answers, [code]: { answer, detail } };
  const eng = await cabinetDe(engagementId);
  const row = await q1<Acceptation>(
    `update engagement_acceptance set answers = $2::jsonb where engagement_id = $1
     returning ${COLONNES}`,
    [engagementId, JSON.stringify(answers)],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'acceptance.answered', objectType: 'engagement_acceptance', objectId: a.id,
    payload: { code, answer, hasDetail: detail.trim().length > 0 },
  });
  return row;
}

/* ── ce qui manque, et ce qui alerte ────────────────────────────────────── */

export interface ManqueAcceptation {
  code: string;
  libelle: string;
  raison: string;
}

/**
 * Ce qui empêche de DÉCIDER, calculé — jamais rédigé à la main.
 *
 * Deux natures de manque, et elles ne se confondent pas : une question sans
 * réponse, et une réponse défavorable sur un critère bloquant sans motif écrit.
 * « Bloquant » ne veut pas dire « interdit d'accepter » : un cabinet peut
 * accepter une mission difficile ; il ne peut pas l'accepter sans le dire.
 */
export async function manquePourDecider(engagementId: string): Promise<ManqueAcceptation[]> {
  const a = await currentAcceptation(engagementId);
  if (!a) return [{ code: '-', libelle: 'décision non ouverte', raison: 'la décision d’acceptation n’a pas été ouverte' }];
  const cat = await catalogueDeLaMission(engagementId);
  const out: ManqueAcceptation[] = [];
  for (const c of criteres(cat, a.kind)) {
    const r = a.answers[c.code];
    if (!r) {
      out.push({ code: c.code, libelle: c.libelle, raison: 'sans réponse' });
      continue;
    }
    if (c.bloquant && r.answer === c.reponse_defavorable && !r.detail.trim()) {
      out.push({
        code: c.code, libelle: c.libelle,
        raison: `réponse défavorable sans précision écrite — ${c.pourquoi}`,
      });
    }
  }
  return out;
}

/* ── décider ────────────────────────────────────────────────────────────── */

export async function decider(
  engagementId: string,
  actorUserId: string,
  status: 'accepted' | 'declined',
  reason: string,
): Promise<Acceptation> {
  const a = await currentAcceptation(engagementId);
  if (!a) throw new AcceptanceRuleError('la décision d’acceptation n’est pas ouverte');
  if (a.status !== 'open') throw new AcceptanceRuleError('décision déjà prise');
  if (!reason.trim()) {
    /* Dans les DEUX SENS : accepter sans motif comme refuser sans motif. C'est
       la pièce qu'un inspecteur demande en premier quand un dossier tourne mal. */
    throw new AcceptanceRuleError(
      'une décision d’acceptation se motive par écrit — accepter sans motif ne se relit pas plus que refuser sans motif',
    );
  }
  const manque = await manquePourDecider(engagementId);
  if (manque.length) {
    throw new AcceptanceRuleError(
      'décision impossible : ' + manque.map((m) => `${m.libelle} (${m.raison})`).join(' · '),
    );
  }
  const eng = await cabinetDe(engagementId);
  const row = await q1<Acceptation>(
    `update engagement_acceptance
     set status = $2, decision_reason = $3, decided_by = $4, decided_at = now()
     where engagement_id = $1 returning ${COLONNES}`,
    [engagementId, status, reason.trim(), actorUserId],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: status === 'accepted' ? 'acceptance.accepted' : 'acceptance.declined',
    objectType: 'engagement_acceptance', objectId: a.id,
    payload: { kind: a.kind, reason: reason.trim() },
  });
  return row;
}

/**
 * LA GARDE. Aucun travail ne se planifie avant la décision.
 *
 * Elle est appelée par les services qui engagent le dossier, pas par l'écran :
 * une règle qui ne tient qu'à l'interface ne tient pas.
 */
export async function assertAccepte(engagementId: string): Promise<void> {
  const a = await currentAcceptation(engagementId);
  if (!a || a.status === 'open') {
    throw new AcceptanceRuleError(
      'la mission n’est pas encore acceptée : aucun travail ne se planifie avant la décision '
      + 'd’acceptation ou de maintien',
    );
  }
  if (a.status === 'declined') {
    throw new AcceptanceRuleError(
      'la mission a été REFUSÉE : aucun travail ne s’y planifie. '
      + `Motif : ${a.decision_reason ?? '—'}`,
    );
  }
}

/* ── les jalons ─────────────────────────────────────────────────────────── */

export interface Jalon {
  code: string;
  label: string;
  due_date: string | null;
  done_at: string | null;
  derived: boolean;
  basis: string | null;
  sort_order: number;
}

/** Crée les jalons du cabinet s'ils n'existent pas. Idempotent. */
export async function assurerJalons(engagementId: string): Promise<Jalon[]> {
  const cat = await catalogueDeLaMission(engagementId);
  for (const j of cat.acceptation.jalons) {
    await q(
      `insert into engagement_milestone (engagement_id, code, label, derived, sort_order)
       values ($1, $2, $3, $4, $5)
       on conflict (engagement_id, code) do nothing`,
      [engagementId, j.code, j.libelle, !!j.derive, j.ordre],
    );
  }
  return jalons(engagementId);
}

export async function jalons(engagementId: string): Promise<Jalon[]> {
  return q<Jalon>(
    `select code, label, due_date::text as due_date, done_at::text as done_at,
            derived, basis, sort_order
     from engagement_milestone where engagement_id = $1 order by sort_order, code`,
    [engagementId],
  );
}

export async function poserJalon(
  engagementId: string, actorUserId: string, code: string, date: string,
): Promise<void> {
  const j = await q01<{ derived: boolean }>(
    `select derived from engagement_milestone where engagement_id = $1 and code = $2`,
    [engagementId, code],
  );
  if (!j) throw new AcceptanceRuleError(`jalon « ${code} » inconnu de la méthode du cabinet`);
  if (j.derived) {
    throw new AcceptanceRuleError(
      `le jalon « ${code} » est DÉRIVÉ de la règle du référentiel : il se recalcule, il ne se saisit pas`,
    );
  }
  const eng = await cabinetDe(engagementId);
  await q(
    `update engagement_milestone set due_date = $3 where engagement_id = $1 and code = $2`,
    [engagementId, code, date],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'milestone.set', objectType: 'engagement_milestone', objectId: null,
    payload: { code, date },
  });
  await recalculerDerives(engagementId);
}

/**
 * Recalcule les jalons DÉRIVÉS depuis le noyau.
 *
 * La méthode NOMME la dérivation, le noyau la CALCULE — même frontière que
 * partout. Un jalon dont la dérivation est nommée mais inconnue resterait
 * SANS DATE, et un jalon sans date ne s'échoit jamais : le dossier serait en
 * retard sans que rien ne le dise. Le validateur l'interdit au chargement ;
 * ici, on lève plutôt que de laisser la date à null.
 *
 * CE QUE LA GARDE SQL PEUT ET NE PEUT PAS. La base ne sait pas qui l'appelle :
 * elle ne peut distinguer une saisie d'une dérivation que par un drapeau que
 * le code pose. C'est donc un GARDE-FOU, pas la règle — la règle est dans
 * `poserJalon`, qui refuse par le nom du jalon. Dit ici pour ne pas laisser
 * croire à une garantie que la base ne donne pas.
 */
export async function recalculerDerives(engagementId: string): Promise<void> {
  const cat = await catalogueDeLaMission(engagementId);
  const poses = await jalons(engagementId);
  const parCode = new Map(poses.map((j) => [j.code, j]));

  for (const j of cat.acceptation.jalons) {
    if (!j.derive) continue;
    const d = cat.acceptation.derivations[j.derive];
    if (!d) {
      throw new AcceptanceRuleError(
        `dérivation « ${j.derive} » inconnue du noyau — le jalon « ${j.code} » resterait sans date`,
      );
    }
    const source = parCode.get(d.depend_de);
    if (!source?.due_date) continue;   // rien à calculer tant que la source n'est pas posée

    const deadlines = await fileDeadlines(engagementId, source.due_date);
    /* LE DRAPEAU EST DE SESSION, PAS DE TRANSACTION. La première version le
       posait en local (`true`) : chaque requête ouvrant sa propre transaction
       implicite, il avait disparu avant que l'UPDATE ne déclenche la garde, et
       le peuplement refusait sa propre dérivation. Le `finally` le remet à
       zéro même si la mise à jour échoue — sans quoi une erreur laisserait la
       garde ouverte pour la suite de la session. */
    await q(`select set_config('otto.derive_milestone', 'on', false)`);
    try {
      await q(
        `update engagement_milestone set due_date = $3, basis = $4
         where engagement_id = $1 and code = $2`,
        [engagementId, j.code, deadlines.completionDue,
         `${d.calcul} — ${deadlines.completion.days} jours${deadlines.anyUnverified ? ' [UNVERIFIED]' : ''}`],
      );
    } finally {
      await q(`select set_config('otto.derive_milestone', 'off', false)`);
    }
  }
}

/** Les jalons échus et non faits. Une liste calculée, pas un rappel rédigé. */
export async function jalonsEnRetard(engagementId: string, aujourdhui: string): Promise<Jalon[]> {
  const tous = await jalons(engagementId);
  return tous.filter((j) => j.due_date && !j.done_at && j.due_date < aujourdhui);
}
