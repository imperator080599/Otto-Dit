import { getDb, q, q01 } from '@/lib/db/client';
import { demoPublique } from '@/lib/core/demo-public';
import { logEvent } from '@/lib/core/events';

// REMETTRE LE MONDE DE DÉMONSTRATION À ZÉRO — un geste du produit, pas une
// variable d'environnement (demande de Tuan, 2026-09-01).
//
// LA CONTRAINTE QUI COMMANDE TOUT LE DESSIN : semer le monde de démonstration
// prend une dizaine de minutes sur la base réseau (chaque flux passe par les
// mêmes services que l'interface — c'est le prix de « aucun raccourci »). Une
// fonction serverless meurt bien avant. Un bouton qui rejouerait le semis
// serait donc un bouton qui échoue toujours : la remise à zéro ne REJOUE pas
// le monde, elle le RESTAURE depuis un INSTANTANÉ pris au déploiement.
//
// L'instantané est une copie table par table dans le schéma `demo_instantane`,
// prise juste après le semis. La remise à zéro vide les tables publiques et y
// réinjecte l'instantané dans l'ordre des dépendances. C'est déterministe,
// c'est une seule transaction, et ça tient en quelques secondes.
//
// CE QUE ÇA VEUT DIRE, ET L'ÉCRAN LE DIT : « à zéro » signifie « à l'état du
// dernier déploiement », pas « à un état théorique ». La date de l'instantané
// est affichée — sans elle, la promesse serait invérifiable.

export const SCHEMA_INSTANTANE = 'demo_instantane';

/** Les objets dont l'écran de confirmation annonce le sort, avec leur nom. */
export const OBJETS_ANNONCES: { table: string; libelle: string }[] = [
  { table: 'engagement', libelle: 'missions' },
  { table: 'evidence', libelle: 'pièces reçues' },
  { table: 'request', libelle: 'demandes au client' },
  { table: 'review_note', libelle: 'notes de revue' },
  { table: 'workpaper', libelle: 'papiers de travail' },
  { table: 'signoff', libelle: 'visas' },
  { table: 'exception', libelle: 'écarts' },
  { table: 'file_archive', libelle: 'dossiers scellés' },
  { table: 'event_log', libelle: 'événements du journal' },
];

/** Les tables du schéma public, hors table de suivi des migrations. */
async function tablesPubliques(): Promise<string[]> {
  const r = await q<{ t: string }>(
    `select table_name t from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`);
  return r.map((x) => x.t).filter((t) => t !== 'schema_migration' && t !== '_migrations');
}

async function tablesDuSchema(schema: string): Promise<string[]> {
  const r = await q<{ t: string }>(
    `select table_name t from information_schema.tables
     where table_schema = $1 and table_type = 'BASE TABLE' order by table_name`, [schema]);
  return r.map((x) => x.t);
}

/**
 * Les colonnes de TOUT un schéma en UNE requête.
 *
 * Une requête par table paraissait plus simple ; sur quatre-vingt-quinze
 * tables et deux schémas, c'étaient près de quatre cents interrogations du
 * catalogue — la remise à zéro dépassait trois minutes, et le premier test
 * écrit l'a montré. Le catalogue se lit d'un coup.
 */
async function colonnesDuSchema(schema: string): Promise<Map<string, string[]>> {
  const r = await q<{ t: string; c: string }>(
    `select table_name t, column_name c from information_schema.columns
     where table_schema = $1 order by table_name, ordinal_position`, [schema]);
  const m = new Map<string, string[]>();
  for (const x of r) m.set(x.t, [...(m.get(x.t) ?? []), x.c]);
  return m;
}

/**
 * L'ORDRE D'INSERTION, DÉRIVÉ DU GRAPHE DES CLÉS ÉTRANGÈRES.
 *
 * Une liste d'ordre écrite à la main se périme à la première table ajoutée, et
 * l'échec serait une contrainte violée en pleine restauration. On lit donc les
 * arêtes réelles. Les auto-références sont ignorées : PostgreSQL vérifie les
 * clés étrangères en fin d'INSTRUCTION, donc une table qui se référence
 * elle-même se réinjecte en un seul `insert ... select` sans difficulté.
 *
 * Fonction PURE, pour être éprouvée sans base.
 */
export function ordreDeDependance(
  tables: string[],
  aretes: { enfant: string; parent: string }[],
): { ordre: string[]; cycle: string[] } {
  const dedans = new Set(tables);
  const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  const enfants = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  for (const a of aretes) {
    if (a.enfant === a.parent) continue;
    if (!dedans.has(a.enfant) || !dedans.has(a.parent)) continue;
    parents.get(a.enfant)!.add(a.parent);
    enfants.get(a.parent)!.add(a.enfant);
  }
  const ordre: string[] = [];
  const prets = tables.filter((t) => parents.get(t)!.size === 0).sort();
  while (prets.length) {
    const t = prets.shift()!;
    ordre.push(t);
    for (const e of [...enfants.get(t)!].sort()) {
      parents.get(e)!.delete(t);
      if (parents.get(e)!.size === 0) prets.push(e);
    }
    prets.sort();
  }
  /* Un cycle ne se traite PAS en silence : on le nomme. Les tables restantes
     sont ajoutées à la fin — la restauration les tentera, et si elle échoue,
     elle échouera bruyamment dans une transaction annulée, jamais à moitié. */
  const cycle = tables.filter((t) => !ordre.includes(t)).sort();
  return { ordre: [...ordre, ...cycle], cycle };
}

async function aretes(): Promise<{ enfant: string; parent: string }[]> {
  return q<{ enfant: string; parent: string }>(
    `select tc.relname enfant, tf.relname parent
     from pg_constraint c
     join pg_class tc on tc.oid = c.conrelid
     join pg_class tf on tf.oid = c.confrelid
     join pg_namespace n on n.oid = tc.relnamespace
     where c.contype = 'f' and n.nspname = 'public'`);
}

export interface EtatInstantane {
  existe: boolean;
  /** Quand il a été pris — la promesse « à zéro » n'est vérifiable que datée. */
  prisLe: string | null;
  /** L'instantané couvre-t-il exactement le schéma actuel ? */
  aJour: boolean;
  /** Ce qui empêche de restaurer, en toutes lettres. */
  desaccords: string[];
}

export async function etatInstantane(): Promise<EtatInstantane> {
  const existe = (await q01<{ n: string }>(
    `select count(*)::text n from information_schema.schemata where schema_name = $1`,
    [SCHEMA_INSTANTANE]))?.n !== '0';
  if (!existe) return { existe: false, prisLe: null, aJour: false, desaccords: ['aucun instantané sur cette instance'] };

  const pris = await q01<{ pris_le: string }>(
    `select pris_le::text from ${SCHEMA_INSTANTANE}.__instantane limit 1`).catch(() => null);
  const publiques = await tablesPubliques();
  const copiees = new Set(await tablesDuSchema(SCHEMA_INSTANTANE));
  const colPub = await colonnesDuSchema('public');
  const colInst = await colonnesDuSchema(SCHEMA_INSTANTANE);
  const desaccords: string[] = [];
  for (const t of publiques) {
    if (!copiees.has(t)) { desaccords.push(`table « ${t} » absente de l’instantané`); continue; }
    if ((colPub.get(t) ?? []).join(',') !== (colInst.get(t) ?? []).join(',')) {
      desaccords.push(`table « ${t} » : colonnes différentes depuis l’instantané`);
    }
  }
  return { existe: true, prisLe: pris?.pris_le ?? null, aJour: desaccords.length === 0, desaccords };
}

/**
 * Prendre l'instantané du monde courant. Appelé par le build, jamais par
 * l'application : personne ne fige un monde depuis un écran.
 */
export async function instantanerLeMonde(): Promise<{ tables: number; lignes: number }> {
  const db = await getDb();
  const publiques = await tablesPubliques();
  await db.exec(`drop schema if exists ${SCHEMA_INSTANTANE} cascade; create schema ${SCHEMA_INSTANTANE};`);
  /* L'INSTANTANÉ PORTE LES MÊMES DONNÉES QUE LE MONDE, SANS LA RLS QUI LES
     PROTÈGE : il ne doit être lisible par personne d'autre que le
     propriétaire. On retire explicitement l'accès au lieu de compter sur le
     défaut — un défaut ne se relit pas dans une revue de sécurité. */
  await db.exec(`revoke all on schema ${SCHEMA_INSTANTANE} from public;`);
  await db.exec(publiques.map((t) =>
    `create table ${SCHEMA_INSTANTANE}."${t}" as table public."${t}";`).join('\n'));
  const lignes = Number((await q01<{ n: string }>(
    `select coalesce(sum(n),0)::text n from (${publiques.map((t) =>
      `select count(*) n from ${SCHEMA_INSTANTANE}."${t}"`).join(' union all ')}) x`))?.n ?? 0);
  await db.exec(
    `create table ${SCHEMA_INSTANTANE}.__instantane (pris_le timestamptz not null default now());
     insert into ${SCHEMA_INSTANTANE}.__instantane default values;`);
  return { tables: publiques.length, lignes };
}

export interface LigneComparee { table: string; libelle: string; actuel: number; instantane: number }

/** Ce que la remise à zéro effacerait, objet par objet : l'état actuel face à l'instantané. */
export async function comparaison(): Promise<LigneComparee[]> {
  const etat = await etatInstantane();
  const un = (schema: string) => q01<Record<string, string>>(
    `select ${OBJETS_ANNONCES.map((o) => `(select count(*) from ${schema}."${o.table}")::text "${o.table}"`).join(', ')}`);
  const actuels = (await un('public'))!;
  const figes = etat.existe ? await un(SCHEMA_INSTANTANE).catch(() => null) : null;
  return OBJETS_ANNONCES.map((o) => ({
    table: o.table, libelle: o.libelle,
    actuel: Number(actuels[o.table] ?? 0),
    instantane: Number(figes?.[o.table] ?? 0),
  }));
}

/**
 * La remise à zéro. Une transaction : ou tout revient, ou rien ne bouge.
 *
 * Elle REFUSE hors démonstration publique — le geste n'existe que là, et le
 * refus vit dans le service, pas dans l'écran (un écran qui garde tout seul
 * est une règle qu'un autre chemin contourne).
 */
export async function remettreLeMondeAZero(
  acteur: { userId: string | null } = { userId: null },
): Promise<{ tables: number; lignes: number; prisLe: string | null }> {
  if (!demoPublique()) {
    throw new Error(
      'La remise à zéro n’existe que sur la démonstration publique : sur une instance réelle, '
      + 'aucun écran ne rase un dossier d’audit.');
  }
  const etat = await etatInstantane();
  if (!etat.existe) {
    throw new Error('Aucun instantané sur cette instance : il n’y a rien à restaurer. '
      + 'L’instantané est pris au déploiement, juste après le semis du monde.');
  }
  if (!etat.aJour) {
    throw new Error(`L’instantané ne correspond plus au schéma : ${etat.desaccords.join(' · ')}. `
      + 'Un déploiement le reprendra ; restaurer maintenant casserait la base.');
  }

  const db = await getDb();
  const publiques = await tablesPubliques();
  const { ordre } = ordreDeDependance(publiques, await aretes());
  const cols = await colonnesDuSchema('public');
  const liste = publiques.map((t) => `public."${t}"`).join(', ');

  await db.transaction(async (t) => {
    await t.query(`truncate table ${liste} cascade`);
    for (const nom of ordre) {
      const c = (cols.get(nom) ?? []).map((x) => `"${x}"`).join(', ');
      await t.query(
        `insert into public."${nom}" (${c}) select ${c} from ${SCHEMA_INSTANTANE}."${nom}"`);
    }
  });
  const lignes = Number((await q01<{ n: string }>(
    `select coalesce(sum(n),0)::text n from (${publiques.map((t) =>
      `select count(*) n from public."${t}"`).join(' union all ')}) x`))?.n ?? 0);

  /* LES SÉQUENCES SUIVENT LES DONNÉES. `event_log.id` est une bigserial :
     restaurée sans recaler sa séquence, la prochaine insertion entrerait en
     collision — un défaut qui n'apparaîtrait qu'au premier geste APRÈS la
     remise à zéro, c'est-à-dire au pire moment. */
  const seqs = await q<{ seq: string; tbl: string; col: string }>(
    `select s.relname seq, t.relname tbl, a.attname col
     from pg_class s
     join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass
     join pg_class t on t.oid = d.refobjid
     join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
     join pg_namespace n on n.oid = s.relnamespace
     where s.relkind = 'S' and n.nspname = 'public'`);
  for (const s of seqs) {
    await q(`select setval($1, coalesce((select max("${s.col}") from public."${s.tbl}"), 1),
                            (select max("${s.col}") from public."${s.tbl}") is not null)`, [`public.${s.seq}`]);
  }

  /* L'ÉVÉNEMENT S'ÉCRIT APRÈS, jamais avant : écrit avant, il serait effacé
     par la restauration elle-même — un geste sans trace. Écrit après, il
     chaîne sur le dernier événement restauré, et la chaîne reste valide. */
  const tenant = await q01<{ id: string }>(`select id::text id from tenant limit 1`);
  if (tenant) {
    await logEvent({
      tenantId: tenant.id,
      engagementId: null,
      actorKind: acteur.userId ? 'user' : 'system',
      actorId: acteur.userId,
      verb: 'demo.world.reset',
      objectType: 'demo_world',
      objectId: null,
      payload: { pris_le: etat.prisLe, tables: ordre.length, lignes },
    });
  }
  return { tables: ordre.length, lignes, prisLe: etat.prisLe };
}
