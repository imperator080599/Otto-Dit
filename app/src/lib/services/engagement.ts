import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { methodologieCourante } from '@/lib/methodology/depot';

// LA CRÉATION DU DOSSIER — l'autre moitié du point 1.
//
// Un dossier se créait par le peuplement, donc jamais devant personne. Ici il
// se crée par les mêmes règles que le reste : le cabinet est celui de la
// personne, la méthode est celle en vigueur chez elle, et une mission sans
// méthode désignée serait refusée au premier chargement — donc on la désigne
// à la création plutôt que de laisser un dossier naître déjà cassé.

export class EngagementRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngagementRuleError';
  }
}

export interface CreationMission {
  /* IDENTIFIANT IMPOSÉ — et pourquoi il se donne ICI plutôt qu'après coup.
     Un appelant qui veut un identifiant déterministe (le dossier N-1 de la
     démonstration) le réécrivait ensuite : `update engagement set id = …`.
     Ça a marché tant que la création ne reliait la mission à RIEN. Le jour où
     elle y a relié son premier membre, la clé étrangère a refusé — et elle
     avait raison : déplacer une clé primaire déjà référencée est un défaut,
     pas une commodité. L'identifiant se choisit donc AVANT l'insertion. */
  id?: string;
  tenantId: string;
  entityId: string;
  periodId: string;
  kind: 'statutory_audit' | 'sox_component' | 'integrated';
  name: string;
  packs: string[];
  accountingMap: string;
  language: 'fr' | 'en';
  actorUserId: string;
}

export async function creerMission(input: CreationMission): Promise<{ id: string }> {
  /* L'ISOLATION D'ABORD, comme partout : l'entité et la personne appartiennent
     au cabinet, ou l'opération n'a pas lieu. Un dossier créé sur l'entité d'un
     autre cabinet porterait son nom dans nos papiers. */
  const ent = await q01<{ tenant_id: string; name: string }>(
    `select tenant_id, name from entity where id = $1`, [input.entityId],
  );
  if (!ent) throw new EngagementRuleError('entité inconnue');
  if (ent.tenant_id !== input.tenantId) {
    throw new EngagementRuleError('isolation : cette entité appartient à un autre cabinet — création refusée');
  }
  const per = await q01<{ entity_id: string; label: string }>(
    `select entity_id, label from period where id = $1`, [input.periodId],
  );
  if (!per) throw new EngagementRuleError('exercice inconnu');
  if (per.entity_id !== input.entityId) {
    throw new EngagementRuleError('cet exercice n’est pas celui de cette entité');
  }
  if (!input.packs.length) {
    throw new EngagementRuleError('une mission sans référentiel ne sait pas quelles règles appliquer');
  }
  const doublon = await q01<{ id: string }>(
    `select id from engagement where entity_id = $1 and period_id = $2 and kind = $3`,
    [input.entityId, input.periodId, input.kind],
  );
  if (doublon) {
    /* Deux dossiers de même nature sur la même entité et le même exercice
       feraient deux vérités sur les mêmes comptes. */
    throw new EngagementRuleError(
      'une mission de cette nature existe déjà sur cette entité pour cet exercice',
    );
  }

  /* LA MÉTHODE EN VIGUEUR, DÉSIGNÉE À LA CRÉATION. Sans elle, la mission
     naîtrait déjà cassée : le premier chargement de catalogue la refuserait
     (ADR-075), et l'utilisateur ne saurait pas pourquoi. */
  const meth = await methodologieCourante(input.tenantId);
  if (!meth) {
    throw new EngagementRuleError(
      'aucune méthode publiée pour ce cabinet : chargez-la avant de créer un dossier — '
      + 'une mission sans méthodologie désignée ne peut rien planifier',
    );
  }

  const row = await q1<{ id: string }>(
    `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
     values (coalesce($8::uuid, gen_random_uuid()),$1,$2,$3,$4,$5,$6::jsonb,'setup',$7) returning id`,
    [input.tenantId, input.entityId, input.periodId, input.kind, input.name.trim() || `${ent.name} — ${per.label}`,
     JSON.stringify({ assurance_packs: input.packs, accounting_map: input.accountingMap, language: input.language }),
     meth.id, input.id ?? null],
  );
  /* LE PREMIER MEMBRE — ET POURQUOI IL N'EST PAS AJOUTÉ PAR `assignMember`.
     Sans lui, le dossier existe et PERSONNE NE PEUT L'ATTEINDRE : la liste
     d'accueil joint `engagement_member`, et l'écran d'acceptation exige
     l'appartenance. Défaut trouvé en cliquant, pas en testant (ADR-088).
     `assignMember` ne peut pas servir ici : il exige que la mission soit
     ACCEPTÉE, et l'acceptation ne peut être décidée que par quelqu'un capable
     d'ouvrir le dossier. La circularité se casse au seul endroit possible : la
     personne qui crée le dossier y entre, pour pouvoir décider.
     Ce que ça n'affaiblit PAS : elle entre SANS droit de signature, et sa
     déclaration d'indépendance reste exigée comme pour tout autre membre.
     Ouvrir un dossier n'est pas y travailler. */
  await q(
    `insert into engagement_member (engagement_id, user_id, eng_role, can_sign, entered_on)
     values ($1, $2, 'partner', false, current_date)
     on conflict (engagement_id, user_id) do nothing`,
    [row.id, input.actorUserId],
  );
  await logEvent({
    tenantId: input.tenantId, engagementId: row.id, actorKind: 'user', actorId: input.actorUserId,
    verb: 'engagement.created', objectType: 'engagement', objectId: row.id,
    payload: { entity: ent.name, period: per.label, kind: input.kind, methodologyId: meth.id },
  });
  return row;
}

/** Les entités et exercices du cabinet, pour l'écran de création. */
export async function optionsCreation(tenantId: string) {
  const entites = await q<{ id: string; name: string }>(
    `select id, name from entity where tenant_id = $1 order by name`, [tenantId],
  );
  const exercices = await q<{ id: string; entity_id: string; label: string; start_date: string; end_date: string }>(
    `select p.id, p.entity_id, p.label, p.start_date::text as start_date, p.end_date::text as end_date
     from period p join entity e on e.id = p.entity_id
     where e.tenant_id = $1 order by p.end_date desc`, [tenantId],
  );
  return { entites, exercices };
}
