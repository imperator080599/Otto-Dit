import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { methodologieCourante } from '@/lib/methodology/depot';
import { assurancePacks } from '@/lib/packs';

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
  /** La CLASSE de la mission (0035) : posée, jamais déduite. */
  classe?: Classe;
  /** Le référentiel de seuil PRÉFÉRÉ — une préférence que la proposition de
   *  seuils lit ; la règle du pack décide si elle n'est pas donnée. */
  benchmarkPrefere?: BenchmarkPrefere;
  actorUserId: string;
}

export type Classe = 'eip' | 'cotee' | 'composante' | 'autre';
export const CLASSES: readonly Classe[] = ['eip', 'cotee', 'composante', 'autre'];
export type BenchmarkPrefere = 'auto' | 'pbt' | 'revenue';
export const BENCHMARKS: readonly BenchmarkPrefere[] = ['auto', 'pbt', 'revenue'];

/** jj/mm/aaaa → aaaa-mm-jj, ou null si ce n'est pas une date lisible.
 *  Les dates se saisissent au format français partout (aucun input type=date). */
export function lireDateFr(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  /* Quatre chiffres ne font pas une année plausible : 31/12/1900 devenait un
     exercice valide. Les bornes sont larges, et dites. */
  if (a < 1990 || a > 2100) return null;
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return null;
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/**
 * UN CLIENT NEUF, depuis l'écran. Toujours FICTIF : ce dépôt ne porte que des
 * données synthétiques, et un client créé à la main n'échappe pas à la règle
 * — `registry_type = 'fictional'`, sans numéro d'immatriculation.
 */
export async function creerClient(input: {
  tenantId: string; name: string; country?: string; currency?: string; actorUserId: string;
}): Promise<{ id: string }> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new EngagementRuleError('un client se nomme — au moins deux caractères');
  /* LE DOUBLON SE CHERCHE SUR LA FORME NORMALISÉE — casse, accents, espaces
     internes : « Société Générale (fictif) » et « societe  generale (fictif) »
     sont le même client. Sans index unique en base, deux créations
     simultanées peuvent encore passer toutes les deux : dit au registre
     (BACKLOG_REPORTE), pas caché ici. */
  const noms = await q<{ id: string; name: string }>(
    `select id, name from entity where tenant_id = $1`, [input.tenantId]);
  if (noms.some((n) => normaliser(n.name) === normaliser(name))) {
    throw new EngagementRuleError(`un client « ${name} » existe déjà dans ce cabinet — choisissez-le dans la liste`);
  }
  const country = (input.country ?? 'FR').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new EngagementRuleError(`pays « ${country} » : deux lettres (FR, DE…)`);
  const currency = (input.currency ?? 'EUR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new EngagementRuleError(`devise « ${currency} » : trois lettres (EUR, USD…)`);
  const row = await q1<{ id: string }>(
    `insert into entity (tenant_id, name, country, registry_type, registry_no, currency)
     values ($1, $2, $3, 'fictional', null, $4) returning id`,
    [input.tenantId, name, country, currency],
  );
  await logEvent({
    tenantId: input.tenantId, engagementId: null, actorKind: 'user', actorId: input.actorUserId,
    verb: 'entity.created', objectType: 'entity', objectId: row.id,
    payload: { name, fictional: true },
  });
  return row;
}

/** Un identifiant mal formé est un REFUS nommé, pas une erreur de type uuid en
 *  page 500 (revue hostile n°5) — le formulaire forgé passe par ici aussi. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function identifiant(x: string, refus: string): void {
  if (!UUID.test(x)) throw new EngagementRuleError(refus);
}

/** Le jour d'après / d'avant, en ISO, sans passer par l'heure locale. */
function jourPlus(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * UN EXERCICE NEUF, par sa date de clôture, sur une entité DU CABINET.
 *
 * Douze mois par défaut — comptés depuis le lendemain de la clôture, un an en
 * arrière : une clôture au 29 février donne un début au 1er mars, pas au 2
 * (soustraire l'année sur le 29 février glissait au 1er mars AVANT d'ajouter
 * le jour — trouvé par la revue hostile n°4). Il ne chevauche aucun exercice
 * existant de l'entité.
 *
 * ET IL SE RELIE — DANS LES DEUX SENS, ET SEULEMENT S'IL EST CONTIGU. Le
 * prédécesseur est l'exercice qui finit LA VEILLE du début ; le successeur,
 * celui qui commence LE LENDEMAIN de la fin, s'il n'avait pas encore de
 * prédécesseur. Un exercice créé après deux années absentes n'est PAS relié
 * à celui d'avant le trou : l'ancienneté et l'acceptation liraient ce lien
 * comme une continuité (« maintien »), et ce serait faux. C'est ce chaînage
 * que la reprise N-1, l'ancienneté et l'en-tête lisent — une seule règle,
 * `missionN1`.
 */
export async function creerExercice(input: {
  tenantId: string; entityId: string; endDate: string; startDate?: string; label?: string;
  actorUserId: string;
}): Promise<{ id: string; priorPeriodId: string | null }> {
  /* L'ISOLATION D'ABORD, comme pour la mission : un exercice sur l'entité
     d'un autre cabinet est un objet étranger dans nos papiers — et une
     entité inconnue est un REFUS nommé, pas une clé étrangère en page 500. */
  identifiant(input.entityId, 'entité inconnue');
  const ent = await q01<{ tenant_id: string }>(`select tenant_id from entity where id = $1`, [input.entityId]);
  if (!ent) throw new EngagementRuleError('entité inconnue');
  if (ent.tenant_id !== input.tenantId) {
    throw new EngagementRuleError('isolation : cette entité appartient à un autre cabinet — création refusée');
  }
  const fin = input.endDate;
  const debut = input.startDate ?? (() => {
    const d = new Date(`${jourPlus(fin, 1)}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();
  if (!(debut < fin)) throw new EngagementRuleError('un exercice commence avant de finir');
  const chevauche = await q01<{ label: string }>(
    `select label from period where entity_id = $1 and start_date <= $3::date and end_date >= $2::date limit 1`,
    [input.entityId, debut, fin]);
  if (chevauche) {
    throw new EngagementRuleError(`cet exercice chevauche « ${chevauche.label} » — deux exercices ne se recouvrent pas`);
  }
  const precedent = await q01<{ id: string }>(
    `select id from period where entity_id = $1 and end_date = $2::date`,
    [input.entityId, jourPlus(debut, -1)]);
  const label = input.label?.trim() || `FY${fin.slice(0, 4)}`;
  const row = await q1<{ id: string }>(
    `insert into period (entity_id, label, start_date, end_date, prior_period_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.entityId, label, debut, fin, precedent?.id ?? null],
  );
  const suivant = await q01<{ id: string }>(
    `update period set prior_period_id = $1
     where entity_id = $2 and start_date = $3::date and prior_period_id is null
     returning id`,
    [row.id, input.entityId, jourPlus(fin, 1)]);
  await logEvent({
    tenantId: input.tenantId, engagementId: null, actorKind: 'user', actorId: input.actorUserId,
    verb: 'period.created', objectType: 'period', objectId: row.id,
    payload: {
      entityId: input.entityId, label, start: debut, end: fin,
      priorPeriodId: precedent?.id ?? null, successorLinked: suivant?.id ?? null,
    },
  });
  return { id: row.id, priorPeriodId: precedent?.id ?? null };
}

/**
 * LA MISSION N-1 — UNE SEULE DÉFINITION, lue par l'en-tête, la reprise et
 * (récursivement, dans `team.anciennetes`) l'ancienneté : la mission de la
 * même entité, du même cabinet et de la MÊME NATURE, sur l'exercice que
 * `period.prior_period_id` désigne. Trois définitions coexistaient — l'une
 * sans la nature, qui montrait en en-tête la mission NEP comme N-1 d'une
 * mission SOX (revue hostile n°4).
 */
export async function missionN1(engagementId: string): Promise<{ id: string; name: string; period_label: string } | null> {
  return q01<{ id: string; name: string; period_label: string }>(
    `select prev.id::text, prev.name, pp.label period_label
     from engagement e
     join period p on p.id = e.period_id
     join period pp on pp.id = p.prior_period_id
     join engagement prev on prev.entity_id = e.entity_id and prev.period_id = pp.id
       and prev.kind = e.kind and prev.tenant_id = e.tenant_id
     where e.id = $1
     order by prev.created_at desc, prev.id
     limit 1`,
    [engagementId]);
}

/** Les natures et référentiels qu'une mission peut porter — les listes que
 *  l'écran propose ET que l'action vérifie, pour qu'un formulaire forgé ne
 *  finisse ni en contrainte violée (page 500) ni en mission sur un pack inconnu. */
export const KINDS = ['statutory_audit', 'sox_component', 'integrated'] as const;
export type Kind = (typeof KINDS)[number];
export const LANGUES = ['fr', 'en'] as const;

/**
 * Ce que la création vérifie AVANT d'écrire quoi que ce soit : l'action
 * enchaîne client → exercice → mission sans transaction (les services parlent
 * à la connexion partagée, pas à un exécuteur de transaction), donc tout
 * refus qui peut être connu d'avance l'est ici — un client créé puis une
 * mission refusée pour « aucune méthode publiée » serait un orphelin.
 * Ce qui reste hors de portée : deux créations simultanées du même nom.
 */
export async function preverifierMission(input: {
  tenantId: string; kind: string; packs: string[]; language: string;
}): Promise<void> {
  if (!KINDS.includes(input.kind as Kind)) throw new EngagementRuleError(`nature de mission inconnue : ${input.kind}`);
  if (!input.packs.length) throw new EngagementRuleError('une mission sans référentiel ne sait pas quelles règles appliquer');
  for (const p of input.packs) {
    if (!(p in assurancePacks)) throw new EngagementRuleError(`référentiel inconnu : ${p}`);
  }
  if (!LANGUES.includes(input.language as 'fr' | 'en')) throw new EngagementRuleError(`langue inconnue : ${input.language}`);
  if (!(await methodologieCourante(input.tenantId))) {
    throw new EngagementRuleError(
      'aucune méthode publiée pour ce cabinet : chargez-la avant de créer un dossier — '
      + 'une mission sans méthodologie désignée ne peut rien planifier',
    );
  }
}

/** Casse, accents et espaces internes ne distinguent pas deux clients. */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export async function creerMission(input: CreationMission): Promise<{ id: string }> {
  /* L'ISOLATION D'ABORD, comme partout : l'entité et la personne appartiennent
     au cabinet, ou l'opération n'a pas lieu. Un dossier créé sur l'entité d'un
     autre cabinet porterait son nom dans nos papiers. */
  identifiant(input.entityId, 'entité inconnue');
  identifiant(input.periodId, 'exercice inconnu');
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
  if (!KINDS.includes(input.kind)) throw new EngagementRuleError(`nature de mission inconnue : ${input.kind}`);
  if (!input.packs.length) {
    throw new EngagementRuleError('une mission sans référentiel ne sait pas quelles règles appliquer');
  }
  for (const p of input.packs) {
    if (!(p in assurancePacks)) throw new EngagementRuleError(`référentiel inconnu : ${p}`);
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

  const classe: Classe = input.classe ?? 'autre';
  if (!CLASSES.includes(classe)) throw new EngagementRuleError(`classe de mission inconnue : ${classe}`);
  const benchmark: BenchmarkPrefere = input.benchmarkPrefere ?? 'auto';
  if (!BENCHMARKS.includes(benchmark)) throw new EngagementRuleError(`référentiel de seuil inconnu : ${benchmark}`);
  const row = await q1<{ id: string }>(
    `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id, classe)
     values (coalesce($8::uuid, gen_random_uuid()),$1,$2,$3,$4,$5,$6::jsonb,'setup',$7,$9) returning id`,
    [input.tenantId, input.entityId, input.periodId, input.kind, input.name.trim() || `${ent.name} — ${per.label}`,
     JSON.stringify({
       assurance_packs: input.packs, accounting_map: input.accountingMap, language: input.language,
       /* La préférence de seuil voyage dans framework_set : c'est la
          configuration de la mission, lue par la proposition de seuils. */
       ...(benchmark !== 'auto' ? { materiality_benchmark: benchmark } : {}),
     }),
     meth.id, input.id ?? null, classe],
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
    payload: { entity: ent.name, period: per.label, kind: input.kind, classe, benchmark, methodologyId: meth.id },
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
