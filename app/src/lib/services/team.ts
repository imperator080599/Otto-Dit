// Équipe, ancienneté et indépendance.
//
// La règle qui rend tout cela réel, et c'est le seul point qui compte : AUCUN
// TRAVAIL N'EST ATTRIBUÉ à un membre dont la déclaration n'est pas signée. Le
// système refuse ; il ne rappelle pas. Même famille que « on ne clôt pas sa
// propre note » et que l'ordre des visas — une règle qui se contente de
// prévenir n'est pas une règle.
//
// L'ISOLATION PAR CABINET est vérifiée ICI, à chaque écriture, et pas seulement
// par les politiques RLS : en local (PGlite, propriétaire de la table) elles
// sont inertes, et une règle qui ne tient que sur un environnement ne tient
// pas (ADR-007). Le test `team.test.ts` TENTE la fuite plutôt que de la
// supposer absente.
//
// Les rubriques et les seuils ne sont pas dans ce fichier : ce sont du contenu
// de cabinet, dans methodology/independance.json.

import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { assertAccepte } from './acceptance';
import type { Catalogue } from '@/lib/methodology/types';
import { motif, type Motif } from './motif';

export class TeamRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamRuleError';
  }
}

/* ── ancienneté et rotation : ce qui se COMPTE ────────────────────────────
   Les deux seuils étaient déclarés dans `methodology/independance.json` et rien
   ne les calculait. Un paramètre déclaré que personne n'évalue est du silence
   lu comme un succès : le dossier a l'air de contrôler la familiarité, et il ne
   contrôle rien.

   ILS SE COMPTENT, ILS NE SE JUGENT PAS. Le nombre d'exercices consécutifs sur
   la même entité est déterministe : c'est une suite de missions chaînées par
   `period.prior_period_id`. Une rupture d'un an la casse — et c'est voulu :
   revenir après une interruption ne recrée pas l'ancienneté d'avant.          */

export interface Anciennete {
  userId: string;
  name: string;
  /** Exercices CONSÉCUTIFS sur cette entité, celui-ci compris. */
  exercices: number;
  /** Le seuil du cabinet, et ce qu'il déclenche. */
  seuil: number;
  menace: boolean;
}

/**
 * L'ancienneté de chaque membre sur l'entité de la mission.
 *
 * On remonte la chaîne des exercices tant que la personne était affectée. Une
 * année sans elle arrête le compte : l'ancienneté est CONSÉCUTIVE, sinon la
 * menace de familiarité voudrait dire autre chose que ce qu'elle dit.
 */
export async function anciennetes(engagementId: string): Promise<Anciennete[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const seuil = cat.independance.parametres.familiarite_exercices?.valeur ?? 0;
  const equipe = await q<{ user_id: string; name: string }>(
    `select m.user_id, u.name from engagement_member m
     join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null order by u.name`,
    [engagementId],
  );

  /* La chaîne des missions de la même entité et de même nature, de la plus
     récente à la plus ancienne. */
  const chaine = await q<{ id: string; membres: string[] }>(
    `with recursive fil as (
       select e.id, e.period_id, p.prior_period_id, 0 as rang
       from engagement e join period p on p.id = e.period_id
       where e.id = $1
       union all
       select prev.id, prev.period_id, pp.prior_period_id, fil.rang + 1
       from fil
       join engagement cur on cur.id = fil.id
       join engagement prev on prev.entity_id = cur.entity_id
         and prev.period_id = fil.prior_period_id
         and prev.kind = cur.kind and prev.tenant_id = cur.tenant_id
       join period pp on pp.id = prev.period_id
     )
     select fil.id,
            coalesce(array_agg(m.user_id::text) filter (where m.user_id is not null), '{}') as membres
     from fil left join engagement_member m on m.engagement_id = fil.id
     group by fil.id, fil.rang order by fil.rang`,
    [engagementId],
  );

  return equipe.map((u) => {
    let n = 0;
    for (const mission of chaine) {
      if (!mission.membres.includes(u.user_id)) break;   // rupture : le compte s'arrête
      n += 1;
    }
    return { userId: u.user_id, name: u.name, exercices: n, seuil, menace: seuil > 0 && n >= seuil };
  });
}

export interface RotationSignataire {
  userId: string;
  name: string;
  exercices: number;
  plafond: number;
  /** Le mandat est-il dépassé ? Un dépassement est une faute de dossier. */
  depasse: boolean;
}

/**
 * La rotation du signataire : depuis combien d'exercices consécutifs signe-t-il.
 *
 * On compte les membres habilités à signer, pas toute l'équipe : la règle porte
 * sur le signataire, et l'appliquer à un stagiaire la viderait de son sens.
 */
export async function rotationSignataire(engagementId: string): Promise<RotationSignataire[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const plafond = cat.independance.parametres.rotation_signataire_exercices?.valeur ?? 0;
  const anc = await anciennetes(engagementId);
  const signataires = await q<{ user_id: string }>(
    `select user_id from engagement_member where engagement_id = $1 and can_sign = true`,
    [engagementId],
  );
  const habilites = new Set(signataires.map((s) => s.user_id));
  return anc
    .filter((a) => habilites.has(a.userId))
    .map((a) => ({
      userId: a.userId, name: a.name, exercices: a.exercices, plafond,
      depasse: plafond > 0 && a.exercices > plafond,
    }));
}

/* ── contexte : le cabinet d'une mission, et la garde d'isolation ───────── */

export interface EngagementContext {
  engagement_id: string;
  tenant_id: string;
  name: string;
}

export async function engagementContext(engagementId: string): Promise<EngagementContext> {
  const row = await q01<EngagementContext>(
    `select id as engagement_id, tenant_id, name from engagement where id = $1`,
    [engagementId],
  );
  if (!row) throw new TeamRuleError('mission inconnue');
  return row;
}

/**
 * La garde d'isolation. Une personne et une mission appartiennent au même
 * cabinet, ou l'opération n'a pas lieu.
 *
 * Ce n'est pas une politesse défensive : sans elle, rien n'empêche d'attribuer
 * un travail d'un dossier à un collaborateur d'un autre cabinet, et le nom de
 * cette personne apparaîtrait ensuite sur un papier de travail signé.
 */
export async function assertSameFirm(engagementId: string, userId: string): Promise<EngagementContext> {
  const eng = await engagementContext(engagementId);
  const user = await q01<{ id: string; tenant_id: string; name: string }>(
    `select id, tenant_id, name from app_user where id = $1`,
    [userId],
  );
  if (!user) throw new TeamRuleError('personne inconnue');
  if (user.tenant_id !== eng.tenant_id) {
    throw new TeamRuleError(
      'isolation : cette personne appartient à un autre cabinet que la mission — opération refusée',
    );
  }
  return eng;
}

/* ── la déclaration ─────────────────────────────────────────────────────── */

export interface Declaration {
  id: string;
  engagement_id: string;
  user_id: string;
  version: number;
  reason: string;
  answers: Record<string, { answer?: string; detail?: string }>;
  opened_at: string;
  signed_at: string | null;
  signed_by: string | null;
  superseded_by: string | null;
}

/* `select *` rendrait les horodatages en objets Date : on les CASTE en texte au
   bord de la requête, comme partout ailleurs dans le dépôt, pour que le type
   TypeScript dise la vérité. Une colonne oubliée ici se voit tout de suite ;
   une date rendue en Date là où le type dit `string` casse à l'affichage. */
const COLONNES_DECL = `id, engagement_id, user_id, version, reason, answers,
  opened_at::text as opened_at, signed_at::text as signed_at, signed_by, superseded_by`;

/** Toutes les versions, la plus récente d'abord. Une pile, jamais un écrasement. */
export async function declarations(engagementId: string, userId: string): Promise<Declaration[]> {
  return q<Declaration>(
    `select ${COLONNES_DECL} from independence_declaration
     where engagement_id = $1 and user_id = $2 order by version desc`,
    [engagementId, userId],
  );
}

export async function currentDeclaration(engagementId: string, userId: string): Promise<Declaration | null> {
  return q01<Declaration>(
    `select ${COLONNES_DECL} from independence_declaration
     where engagement_id = $1 and user_id = $2 order by version desc limit 1`,
    [engagementId, userId],
  );
}

/**
 * Ouvre une déclaration, ou une RÉVISION de la précédente.
 *
 * Une révision exige un motif écrit : sans lui, on ne peut pas distinguer un
 * changement de circonstances d'une erreur de manipulation. Elle laisse la
 * version précédente intacte et signée — c'est ce qui rend l'historique
 * opposable.
 */
export async function openDeclaration(
  engagementId: string,
  userId: string,
  reason = '',
): Promise<Declaration> {
  const eng = await assertSameFirm(engagementId, userId);
  const previous = await currentDeclaration(engagementId, userId);
  if (previous && previous.signed_at === null) return previous; // déjà ouverte, non signée
  const version = (previous?.version ?? 0) + 1;
  if (version > 1 && !reason.trim()) {
    throw new TeamRuleError(
      'une révision de déclaration sans motif écrit est indistinguable d’une erreur de manipulation',
    );
  }
  const row = await q1<Declaration>(
    `insert into independence_declaration (tenant_id, engagement_id, user_id, version, reason)
     values ($1, $2, $3, $4, $5) returning ${COLONNES_DECL}`,
    [eng.tenant_id, engagementId, userId, version, reason.trim()],
  );
  if (previous) {
    await q(`update independence_declaration set superseded_by = $1 where id = $2`, [row.id, previous.id]);
  }
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: userId,
    verb: version === 1 ? 'independence.declaration.opened' : 'independence.declaration.revised',
    objectType: 'independence_declaration',
    objectId: row.id,
    payload: { version, reason: reason.trim() },
  });
  return row;
}

/** Réponse à une rubrique. Un « oui » sans précision écrite ne se signe pas. */
export async function answerRubric(
  declarationId: string,
  actorUserId: string,
  code: string,
  answer: 'oui' | 'non',
  detail = '',
): Promise<Declaration> {
  const d = await q1<Declaration>(`select ${COLONNES_DECL} from independence_declaration where id = $1`, [declarationId]);
  if (d.signed_at) throw new TeamRuleError('déclaration déjà signée : elle se révise, elle ne se réécrit pas');
  if (actorUserId !== d.user_id) throw new TeamRuleError('on remplit sa propre déclaration, pas celle d’un autre');
  const cat = await catalogueDeLaMission(d.engagement_id);
  if (!cat.independance.rubriques.some((r) => r.code === code)) {
    throw new TeamRuleError(`rubrique « ${code} » inconnue de la déclaration du cabinet`);
  }
  const answers = { ...d.answers, [code]: { answer, detail: detail.trim() } };
  return q1<Declaration>(
    `update independence_declaration set answers = $2 where id = $1 returning ${COLONNES_DECL}`,
    [declarationId, JSON.stringify(answers)],
  );
}

/**
 * Ce qui manque pour qu'une déclaration soit signable. LA LISTE EST LA RÈGLE :
 * un formulaire qu'on peut signer vide est un formulaire qui ne dit rien.
 */
export function missingForSignature(cat: Catalogue, d: Declaration | null): string[] {
  if (!d) return ['déclaration non ouverte'];
  if (d.signed_at) return [];
  const missing: string[] = [];
  for (const r of cat.independance.rubriques) {
    const a = d.answers[r.code];
    if (!a || !a.answer) missing.push(`« ${r.libelle} » sans réponse`);
    else if (a.answer === 'oui' && !(a.detail ?? '').trim()) {
      missing.push(`« ${r.libelle} » déclaré, sans précision écrite`);
    }
  }
  return missing;
}

/** On signe POUR SOI. La base le refuse aussi (contrainte), et c'est voulu. */
export async function signDeclaration(declarationId: string, actorUserId: string): Promise<Declaration> {
  const d = await q1<Declaration>(`select ${COLONNES_DECL} from independence_declaration where id = $1`, [declarationId]);
  if (d.signed_at) throw new TeamRuleError('déclaration déjà signée');
  if (actorUserId !== d.user_id) {
    throw new TeamRuleError('une déclaration d’indépendance se signe soi-même — personne ne signe pour un autre');
  }
  const cat = await catalogueDeLaMission(d.engagement_id);
  const missing = missingForSignature(cat, d);
  if (missing.length) throw new TeamRuleError('déclaration incomplète : ' + missing.join(' · '));
  const row = await q1<Declaration>(
    `update independence_declaration set signed_at = now(), signed_by = $2 where id = $1
     returning ${COLONNES_DECL}`,
    [declarationId, actorUserId],
  );
  const eng = await engagementContext(d.engagement_id);
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId: d.engagement_id,
    actorKind: 'user',
    actorId: actorUserId,
    verb: 'independence.declaration.signed',
    objectType: 'independence_declaration',
    objectId: row.id,
    payload: { version: row.version },
  });
  return row;
}

/** Une déclaration vaut si elle est signée et n'a pas été remplacée. */
export async function independenceHolds(engagementId: string, userId: string): Promise<boolean> {
  const d = await currentDeclaration(engagementId, userId);
  return !!d && d.signed_at !== null;
}

export interface DeclarationState {
  label: string;
  holds: boolean;
  version: number | null;
}

export async function declarationState(engagementId: string, userId: string): Promise<DeclarationState> {
  const d = await currentDeclaration(engagementId, userId);
  if (!d) return { label: 'aucune déclaration', holds: false, version: null };
  if (d.signed_at) return { label: `signée le ${d.signed_at.slice(0, 10)} (v${d.version})`, holds: true, version: d.version };
  return {
    label: d.version === 1 ? 'ouverte, non signée' : `révision v${d.version} ouverte, non signée — la précédente est caduque`,
    holds: false,
    version: d.version,
  };
}

/* ── l'affectation, et son refus ────────────────────────────────────────── */

export interface AssignInput {
  engagementId: string;
  userId: string;
  engRole: 'partner' | 'manager' | 'senior' | 'staff';
  canSign?: boolean;
  enteredOn?: string | null;
  actorUserId: string;
}

/**
 * Attribue une personne à la mission. REFUSE si sa déclaration n'est pas
 * signée, si elle appartient à un autre cabinet, ou si elle est sortie.
 *
 * Le refus est le produit : un outil qui accepte puis affiche un rappel laisse
 * le travail commencer, et c'est le travail commencé qu'on ne défait pas.
 */
export async function assignMember(input: AssignInput): Promise<{ id: string }> {
  /* L'ORDRE DES REFUS, ET IL A ÉTÉ CORRIGÉ PAR LA SUITE DE TESTS.
     1. L'ISOLATION d'abord. Répondre « faites accepter la mission » à quelqu'un
        qui vise le dossier d'un AUTRE cabinet l'envoie faire précisément ce
        qu'il ne doit jamais faire — et lui apprend au passage que la mission
        existe. Un refus qui égare est pire qu'un refus sec (ADR-069).
     2. L'ACCEPTATION ensuite : un dossier ne commence pas par une affectation,
        il commence par une décision.
     3. Puis la sortie, puis la déclaration — l'ordre établi en ADR-069. */
  const eng = await assertSameFirm(input.engagementId, input.userId);
  await assertAccepte(input.engagementId);
  await assertSameFirm(input.engagementId, input.actorUserId);

  const user = await q1<{ name: string }>(`select name from app_user where id = $1`, [input.userId]);
  const existing = await q01<{ id: string; exited_on: string | null }>(
    `select id, exited_on::text as exited_on from engagement_member
     where engagement_id = $1 and user_id = $2`,
    [input.engagementId, input.userId],
  );
  /* LA SORTIE SE VÉRIFIE AVANT LA DÉCLARATION, et l'ordre n'est pas indifférent.
     Une personne sortie de la mission qui aurait aussi une déclaration à
     réviser s'entendrait dire « signez votre déclaration » : elle signerait,
     et serait refusée quand même. Un motif de refus qui envoie corriger la
     mauvaise chose est pire qu'un refus sec. */
  if (existing?.exited_on) {
    throw new TeamRuleError(
      `${user.name} est sorti de la mission le ${existing.exited_on} — sa réintégration se décide, elle ne se déduit pas d’une réaffectation`,
    );
  }
  if (!(await independenceHolds(input.engagementId, input.userId))) {
    const st = await declarationState(input.engagementId, input.userId);
    throw new TeamRuleError(
      `déclaration d’indépendance de ${user.name} : ${st.label} — aucun travail ne peut lui être attribué`,
    );
  }
  const row = existing
    ? await q1<{ id: string }>(
        `update engagement_member set eng_role = $2, can_sign = $3, entered_on = coalesce($4, entered_on)
         where id = $1 returning id`,
        [existing.id, input.engRole, input.canSign ?? false, input.enteredOn ?? null],
      )
    : await q1<{ id: string }>(
        `insert into engagement_member (engagement_id, user_id, eng_role, can_sign, entered_on)
         values ($1, $2, $3, $4, $5) returning id`,
        [input.engagementId, input.userId, input.engRole, input.canSign ?? false, input.enteredOn ?? null],
      );
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId: input.engagementId,
    actorKind: 'user',
    actorId: input.actorUserId,
    verb: 'team.member.assigned',
    objectType: 'engagement_member',
    objectId: row.id,
    payload: { user: user.name, eng_role: input.engRole, can_sign: input.canSign ?? false },
  });
  return row;
}

/** Une sortie ne supprime pas : les travaux et les visas restent au dossier. */
export async function exitMember(
  engagementId: string,
  userId: string,
  on: string,
  actorUserId: string,
): Promise<void> {
  const eng = await assertSameFirm(engagementId, userId);
  await q(`update engagement_member set exited_on = $3 where engagement_id = $1 and user_id = $2`, [
    engagementId,
    userId,
    on,
  ]);
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: actorUserId,
    verb: 'team.member.exited',
    objectType: 'engagement_member',
    objectId: userId,
    payload: { on },
  });
}

export interface MemberRow {
  user_id: string;
  name: string;
  email: string;
  firm_role: string;
  eng_role: string;
  can_sign: boolean;
  entered_on: string | null;
  exited_on: string | null;
  declaration: DeclarationState;
}

export async function members(engagementId: string): Promise<MemberRow[]> {
  const rows = await q<Omit<MemberRow, 'declaration'>>(
    `select m.user_id, u.name, u.email, u.firm_role, m.eng_role, m.can_sign,
            m.entered_on::text as entered_on, m.exited_on::text as exited_on
     from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 order by u.name`,
    [engagementId],
  );
  const out: MemberRow[] = [];
  for (const r of rows) out.push({ ...r, declaration: await declarationState(engagementId, r.user_id) });
  return out;
}

/**
 * Les obstacles d'indépendance au visa de la mission.
 *
 * Un membre AFFECTÉ dont la déclaration est devenue caduque ne fait pas
 * disparaître le travail qu'il a produit : il le rend invisable tant que la
 * révision n'est pas signée. C'est le prolongement de la règle d'affectation —
 * sans lui, il suffirait d'affecter avant de réviser pour passer au travers.
 */
export async function independenceObstacles(engagementId: string): Promise<Motif[]> {
  const out: Motif[] = [];
  for (const m of await members(engagementId)) {
    if (m.exited_on) continue;
    if (!m.declaration.holds) {
      out.push(motif('obst.declarationNonSignee', { nom: m.name, etat: m.declaration.label }));
    }
  }

  /* LA ROTATION DU SIGNATAIRE — un dépassement est une faute de dossier, pas
     un oubli d'agenda. Le seuil était déclaré dans la méthode et rien ne le
     calculait : le dossier avait l'air de contrôler la rotation. */
  for (const r of await rotationSignataire(engagementId)) {
    if (r.depasse) {
      out.push(motif('obst.rotationDue', { nom: r.name, n: r.exercices, plafond: r.plafond }));
    }
  }

  /* LA FAMILIARITÉ — elle ne BLOQUE pas : elle exige une SAUVEGARDE
     documentée. La traiter comme un empêchement rendrait tout dossier ancien
     impossible ; ne pas la lever du tout la rendrait invisible. Elle apparaît
     donc dans les obstacles tant qu'aucune rubrique de la déclaration ne la
     couvre — c'est-à-dire tant que personne n'a écrit ce qu'on fait. */
  const anc = await anciennetes(engagementId);
  for (const a of anc) {
    if (!a.menace) continue;
    const couvert = await q01<{ id: string }>(
      `select d.id from independence_declaration d
       where d.engagement_id = $1 and d.user_id = $2 and d.signed_at is not null
         and btrim(coalesce(d.answers->'familiarite'->>'detail', '')) <> ''`,
      [engagementId, a.userId],
    );
    if (!couvert) {
      out.push(motif('obst.familiarite', { nom: a.name, n: a.exercices, seuil: a.seuil }));
    }
  }
  return out;
}

/* ── services autres que la certification ──────────────────────────────── */

export interface NonAuditInput {
  engagementId: string;
  nature: string;
  label: string;
  amountCents: number;
  providedOn: string;
  provider: string;
  actorUserId: string;
}

export async function recordNonAuditService(input: NonAuditInput): Promise<{ id: string }> {
  const eng = await assertSameFirm(input.engagementId, input.actorUserId);
  const cat = await catalogueDeLaMission(input.engagementId);
  if (!cat.independance.naturesSacc[input.nature]) {
    throw new TeamRuleError(`nature « ${input.nature} » inconnue du référentiel du cabinet`);
  }
  const row = await q1<{ id: string }>(
    `insert into non_audit_service
       (tenant_id, engagement_id, nature, label, amount_cents, provided_on, provider, recorded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [eng.tenant_id, input.engagementId, input.nature, input.label.trim(), input.amountCents,
     input.providedOn, input.provider.trim(), input.actorUserId],
  );
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId: input.engagementId,
    actorKind: 'user',
    actorId: input.actorUserId,
    verb: 'independence.nas.recorded',
    objectType: 'non_audit_service',
    objectId: row.id,
    payload: { nature: input.nature, amount_cents: input.amountCents },
  });
  return row;
}

export interface FeeRatio {
  auditFeeCents: number | null;
  nonAuditCents: number;
  /** null quand les honoraires d'audit ne sont pas saisis : on ne calcule pas sur une supposition. */
  ratioPct: number | null;
  capPct: number;
  overCap: boolean;
  /** Le plafond n'a pas été confronté à un texte primaire. Toujours vrai aujourd'hui. */
  capUnverified: boolean;
}

/**
 * Le ratio se CALCULE ; il n'est pas une appréciation. Mais tant que les
 * honoraires d'audit ne sont pas saisis, il n'est PAS calculé : un ratio sur un
 * dénominateur supposé serait pire que pas de ratio.
 */
export async function feeRatio(engagementId: string): Promise<FeeRatio> {
  const cat = await catalogueDeLaMission(engagementId);
  const cap = cat.independance.parametres.plafond_sacc_pct;
  const eng = await q1<{ audit_fee_cents: string | null }>(
    `select audit_fee_cents from engagement where id = $1`,
    [engagementId],
  );
  const sum = await q1<{ total: string | null }>(
    `select sum(amount_cents)::text as total from non_audit_service where engagement_id = $1`,
    [engagementId],
  );
  const auditFeeCents = eng.audit_fee_cents === null ? null : Number(eng.audit_fee_cents);
  const nonAuditCents = Number(sum.total ?? 0);
  const ratioPct =
    auditFeeCents && auditFeeCents > 0 ? (nonAuditCents / auditFeeCents) * 100 : null;
  const capUnverified = (cap.sources ?? []).some((s) => !cat.sources[s]?.verifie);
  return {
    auditFeeCents,
    nonAuditCents,
    ratioPct,
    capPct: cap.valeur,
    overCap: ratioPct !== null && ratioPct > cap.valeur,
    capUnverified,
  };
}
