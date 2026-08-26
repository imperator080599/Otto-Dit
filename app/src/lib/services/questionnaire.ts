// Le questionnaire résiduel, et le registre des facteurs déclarés.
//
// POURQUOI LES DEUX ENSEMBLE. Sans le questionnaire, l'évaluation du risque ne
// voit que ce qui se compte : un changement de dirigeant, une pression sur le
// résultat, un litige non provisionné ne sont dans aucun grand livre. Sans le
// registre, une constatation faite dans une section ne se pose nulle part
// ailleurs, et chaque section redécouvre ce que la voisine a déjà vu.
//
// LE QUESTIONNAIRE NE COCHE RIEN. Une réponse « oui » CRÉE un facteur au
// registre, avec sa source, sa nature et le texte écrit par l'auditeur. C'est
// ce qui fait la différence entre une case et une constatation.
//
// TROIS RÈGLES QUI BLOQUENT PAR ELLES-MÊMES :
//   · une question sans réponse est un obstacle au visa ;
//   · un « oui » sans précision écrite est un obstacle au visa ;
//   · un facteur remonté et non statué est un obstacle au visa.
//
// Le contenu — les questions, leur portée, leur nature, la raison pour laquelle
// chacune existe encore — vit dans methodology/questionnaire.json.

import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import type { Catalogue, QuestionResiduelle } from '@/lib/methodology/types';
import { engagementContext } from './team';

export class QuestionnaireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionnaireError';
  }
}

/* ── les questions, par portée ──────────────────────────────────────────── */

export function questionsOfScope(cat: Catalogue, scope: 'entite' | 'section'): QuestionResiduelle[] {
  return cat.questionnaire.questions.filter((x) => x.portee === scope);
}

export interface AnswerRow {
  question_code: string;
  fsli_code: string | null;
  answer: 'oui' | 'non';
  detail: string;
  answered_by: string;
  answered_at: string;
}

export async function answers(engagementId: string, fsliCode: string | null): Promise<AnswerRow[]> {
  return q<AnswerRow>(
    fsliCode === null
      ? `select question_code, fsli_code, answer, detail, answered_by, answered_at::text as answered_at
         from risk_question_answer where engagement_id = $1 and fsli_code is null`
      : `select question_code, fsli_code, answer, detail, answered_by, answered_at::text as answered_at
         from risk_question_answer where engagement_id = $1 and fsli_code = $2`,
    fsliCode === null ? [engagementId] : [engagementId, fsliCode],
  );
}

/**
 * Répondre. Une réponse « oui » crée — ou met à jour — un facteur au registre.
 *
 * On ACCEPTE un « oui » sans précision : on répond d'abord, on rédige ensuite,
 * et refuser la réponse ferait perdre le fait. Mais il devient immédiatement un
 * OBSTACLE AU VISA, ce qui est la vraie sanction : le dossier ne se ferme pas
 * dessus.
 */
export async function answerQuestion(input: {
  engagementId: string;
  fsliCode: string | null;
  questionCode: string;
  answer: 'oui' | 'non';
  detail?: string;
  actorUserId: string;
}): Promise<void> {
  const cat = await catalogueDeLaMission(input.engagementId);
  const eng = await engagementContext(input.engagementId);
  const question = cat.questionnaire.questions.find((x) => x.code === input.questionCode);
  if (!question) throw new QuestionnaireError(`question « ${input.questionCode} » inconnue du référentiel du cabinet`);
  if (question.portee === 'entite' && input.fsliCode !== null) {
    throw new QuestionnaireError(`« ${question.code} » est une question d’entité : elle se pose une fois, pas par section`);
  }
  if (question.portee === 'section' && input.fsliCode === null) {
    throw new QuestionnaireError(`« ${question.code} » est une question de section : elle exige un poste`);
  }
  const detail = (input.detail ?? '').trim();

  await q(
    input.fsliCode === null
      ? `insert into risk_question_answer
           (engagement_id, fsli_code, question_code, answer, detail, answered_by, methodology_version)
         values ($1, null, $2, $3, $4, $5, $6)
         on conflict (engagement_id, question_code) where fsli_code is null do update set
           answer = excluded.answer, detail = excluded.detail,
           answered_by = excluded.answered_by, answered_at = now(),
           methodology_version = excluded.methodology_version`
      : `insert into risk_question_answer
           (engagement_id, fsli_code, question_code, answer, detail, answered_by, methodology_version)
         values ($1, $7, $2, $3, $4, $5, $6)
         on conflict (engagement_id, fsli_code, question_code) where fsli_code is not null do update set
           answer = excluded.answer, detail = excluded.detail,
           answered_by = excluded.answered_by, answered_at = now(),
           methodology_version = excluded.methodology_version`,
    input.fsliCode === null
      ? [input.engagementId, input.questionCode, input.answer, detail, input.actorUserId, cat.questionnaire.version]
      : [input.engagementId, input.questionCode, input.answer, detail, input.actorUserId, cat.questionnaire.version, input.fsliCode],
  );

  const ref = `${question.code}${input.fsliCode ? '/' + input.fsliCode : ''}`;
  if (input.answer === 'oui') {
    await upsertQuestionFactor(input.engagementId, question, input.fsliCode, detail, input.actorUserId);
  } else {
    // Passer de « oui » à « non » retire le facteur : il n'a plus de fait
    // derrière lui. On le supprime plutôt que de l'écarter, parce qu'un facteur
    // écarté raconterait une décision qui n'a pas eu lieu.
    await q(
      `delete from risk_factor_declared
       where engagement_id = $1 and source = 'questionnaire' and source_ref = $2`,
      [input.engagementId, ref],
    );
  }
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId: input.engagementId,
    actorKind: 'user',
    actorId: input.actorUserId,
    verb: 'questionnaire.answered',
    objectType: 'risk_question_answer',
    objectId: ref,
    payload: { answer: input.answer, scope: question.portee, has_detail: detail !== '' },
  });
}

/**
 * Le facteur créé par un « oui ». Il naît CONFIRMÉ : la réponse EST la décision
 * humaine — la faire re-statuer reviendrait à demander deux fois la même chose.
 * Une question d'entité vise tous les postes retenus au périmètre.
 */
async function upsertQuestionFactor(
  engagementId: string,
  question: QuestionResiduelle,
  fsliCode: string | null,
  detail: string,
  actorUserId: string,
): Promise<void> {
  const targets = fsliCode
    ? [{ fsli: fsliCode, assertions: [question.assertion] }]
    : (await q<{ code: string }>(
        `select code from fsli where engagement_id = $1
         and scoping in ('in_scope','in_scope_qualitative') order by code`,
        [engagementId],
      )).map((f) => ({ fsli: f.code, assertions: [question.assertion] }));

  const ref = `${question.code}${fsliCode ? '/' + fsliCode : ''}`;
  const description = `${question.question} — répondu OUI.${detail ? ' ' + detail : ''} ${question.effet}`.trim();
  await q(
    `insert into risk_factor_declared
       (engagement_id, source, source_ref, nature, description, targets, status, decided_by, decided_at)
     values ($1, 'questionnaire', $2, $3, $4, $5::jsonb, 'confirmed', $6, now())
     on conflict do nothing`,
    [engagementId, ref, question.nature, description, JSON.stringify(targets), actorUserId],
  );
  await q(
    `update risk_factor_declared set description = $3, targets = $4::jsonb
     where engagement_id = $1 and source = 'questionnaire' and source_ref = $2`,
    [engagementId, ref, description, JSON.stringify(targets)],
  );
}

/* ── le registre ────────────────────────────────────────────────────────── */

export interface DeclaredFactor {
  id: string;
  source: 'questionnaire' | 'procedure' | 'manual';
  source_ref: string | null;
  nature: string;
  description: string;
  targets: { fsli: string; assertions: string[] }[];
  status: 'proposed' | 'confirmed' | 'dismissed';
  decision_reason: string | null;
  decided_by: string | null;
}

export async function register(engagementId: string): Promise<DeclaredFactor[]> {
  return q<DeclaredFactor>(
    `select id, source, source_ref, nature, description, targets, status, decision_reason, decided_by
     from risk_factor_declared where engagement_id = $1 order by created_at`,
    [engagementId],
  );
}

/**
 * Poser une constatation depuis n'importe où — une procédure, un écart, la
 * lecture d'un procès-verbal. Elle arrive PROPOSÉE : ce n'est pas parce qu'un
 * moteur l'a levée qu'elle est retenue, et un facteur non statué bloque le visa.
 */
export async function raiseFactor(input: {
  engagementId: string;
  source: 'procedure' | 'manual';
  sourceRef?: string | null;
  nature: string;
  description: string;
  targets: { fsli: string; assertions: string[] }[];
  actorUserId: string;
}): Promise<{ id: string }> {
  const cat = await catalogueDeLaMission(input.engagementId);
  const eng = await engagementContext(input.engagementId);
  if (!cat.questionnaire.naturesRi[input.nature]) {
    throw new QuestionnaireError(`nature « ${input.nature} » inconnue du référentiel du cabinet`);
  }
  if (!input.description.trim()) throw new QuestionnaireError('un facteur sans description ne se relit pas');
  if (!input.targets.length) throw new QuestionnaireError('un facteur qui ne vise aucune section ne circule pas');
  const row = await q1<{ id: string }>(
    `insert into risk_factor_declared
       (engagement_id, source, source_ref, nature, description, targets, status)
     values ($1,$2,$3,$4,$5,$6::jsonb,'proposed') returning id`,
    [input.engagementId, input.source, input.sourceRef ?? null, input.nature,
     input.description.trim(), JSON.stringify(input.targets)],
  );
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId: input.engagementId,
    actorKind: 'user',
    actorId: input.actorUserId,
    verb: 'risk.factor.raised',
    objectType: 'risk_factor_declared',
    objectId: row.id,
    payload: { source: input.source, nature: input.nature, targets: input.targets },
  });
  return row;
}

/** Statuer. Écarter EXIGE un motif : sans lui, « écarté » et « oublié » se ressemblent. */
export async function decideFactor(
  engagementId: string,
  factorId: string,
  status: 'confirmed' | 'dismissed',
  reason: string,
  actorUserId: string,
): Promise<void> {
  const eng = await engagementContext(engagementId);
  if (status === 'dismissed' && !reason.trim()) {
    throw new QuestionnaireError('écarter un facteur sans motif écrit le rend indistinguable d’un oubli');
  }
  await q(
    `update risk_factor_declared
       set status = $3, decision_reason = $4, decided_by = $5, decided_at = now()
     where id = $2 and engagement_id = $1`,
    [engagementId, factorId, status, reason.trim() || null, actorUserId],
  );
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: actorUserId,
    verb: status === 'confirmed' ? 'risk.factor.confirmed' : 'risk.factor.dismissed',
    objectType: 'risk_factor_declared',
    objectId: factorId,
    payload: { reason: reason.trim() },
  });
}

/**
 * Les facteurs déclarés qui pèsent sur un couple (poste, assertion).
 *
 * C'est ici que la circulation produit son effet plutôt qu'un affichage : ce
 * que cette fonction rend est compté par l'évaluation du risque, au même titre
 * qu'un facteur observé.
 */
export async function declaredFactorsFor(
  engagementId: string,
  fsliCode: string,
): Promise<{ assertion: string; description: string; nature: string; source: string; source_ref: string | null }[]> {
  const rows = await q<DeclaredFactor>(
    `select id, source, source_ref, nature, description, targets, status, decision_reason, decided_by
     from risk_factor_declared where engagement_id = $1 and status = 'confirmed'`,
    [engagementId],
  );
  const out: { assertion: string; description: string; nature: string; source: string; source_ref: string | null }[] = [];
  for (const f of rows) {
    for (const t of f.targets) {
      if (t.fsli !== fsliCode) continue;
      for (const a of t.assertions) {
        out.push({ assertion: a, description: f.description, nature: f.nature, source: f.source, source_ref: f.source_ref });
      }
    }
  }
  return out;
}

/* ── ce qui bloque ──────────────────────────────────────────────────────── */

/**
 * Les obstacles au visa produits par le qualitatif.
 *
 * `fsliCode` null = les questions d'entité, qui bloquent le dossier entier.
 * Ces trois règles sont la raison d'être du questionnaire : sans elles, il
 * serait un formulaire qu'on peut laisser vide.
 */
export async function questionnaireObstacles(
  engagementId: string,
  fsliCode: string | null,
): Promise<string[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const scope = fsliCode === null ? 'entite' : 'section';
  const asked = questionsOfScope(cat, scope);
  const given = await answers(engagementId, fsliCode);
  const byCode = new Map(given.map((a) => [a.question_code, a]));

  const unanswered = asked.filter((x) => !byCode.has(x.code));
  const yesWithoutDetail = asked.filter((x) => {
    const a = byCode.get(x.code);
    return a?.answer === 'oui' && a.detail.trim() === '';
  });

  const out: string[] = [];
  if (unanswered.length) {
    out.push(
      `${unanswered.length} question(s) ${scope === 'entite' ? 'd’entité' : 'de section'} sans réponse`,
    );
  }
  if (yesWithoutDetail.length) {
    out.push(`${yesWithoutDetail.length} réponse(s) « oui » sans précision écrite`);
  }
  const pending = await q1<{ n: string }>(
    `select count(*)::text as n from risk_factor_declared
     where engagement_id = $1 and status = 'proposed'`,
    [engagementId],
  );
  if (Number(pending.n) > 0) out.push(`${pending.n} facteur(s) de risque non statué(s)`);
  return out;
}

export interface Share {
  quantitative: number;
  qualitative: number;
  pctQuantitative: number;
}

/**
 * DEUX ratios, et ils ne disent pas la même chose.
 *
 * Le ratio de RÈGLES mesure ce que la méthode peut voir : c'est une propriété
 * du référentiel du cabinet, la même sur tous les dossiers.
 *
 * Le ratio des facteurs LEVÉS mesure ce que l'auditeur a devant les yeux sur CE
 * dossier. C'est celui qui compte pour juger d'une évaluation, et il peut être
 * mauvais alors que le premier est bon — une méthode équilibrée dont personne
 * ne remplit le questionnaire redonne une évaluation à 100 % quantitative.
 */
export function ruleShare(cat: Catalogue): Share {
  const quantitative = cat.risque.facteurs.length;               // règles calculées
  const qualitative = cat.questionnaire.questions.length;        // sources déclarées
  return {
    quantitative,
    qualitative,
    pctQuantitative: (quantitative / (quantitative + qualitative)) * 100,
  };
}

/** Ce que le dossier porte RÉELLEMENT : facteurs observés contre facteurs déclarés retenus. */
export async function raisedShare(engagementId: string): Promise<Share> {
  const obs = await q1<{ n: string }>(
    `select count(*)::text as n from risk_factor_observed where engagement_id = $1`,
    [engagementId],
  );
  const dec = await q1<{ n: string }>(
    `select count(*)::text as n from risk_factor_declared
     where engagement_id = $1 and status = 'confirmed'`,
    [engagementId],
  );
  const quantitative = Number(obs.n);
  const qualitative = Number(dec.n);
  const total = quantitative + qualitative;
  return {
    quantitative,
    qualitative,
    pctQuantitative: total === 0 ? 0 : (quantitative / total) * 100,
  };
}

/** @deprecated conservé le temps que les appelants passent à `ruleShare`. */
export const quantitativeShare = async (cat: Catalogue): Promise<Share> => ruleShare(cat);
