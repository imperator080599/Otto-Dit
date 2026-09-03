import type { OttoDb } from './client';

// LE BLOC D'ASSERTIONS RÔLE / RLS — imprimé À CHAQUE BUILD, contre la base
// RÉSEAU (Groupe 0 du mandat de nuit, item 106, première moitié).
//
// Pourquoi il existe : la chaîne de tests tourne sur PGlite, en local, en
// superutilisateur ; la production tourne sur Postgres réseau, par un pooler,
// sous le rôle que DATABASE_URL désigne. Ce sont deux exécutions différentes
// (règle 11), et c'est la seconde qu'ouvre le fondateur. Ce module pose les
// questions dont la réponse ne se lit QUE là : qui suis-je, est-ce que je
// contourne la RLS, quelles tables sont couvertes et FORCÉES, lesquelles n'ont
// aucune politique.
//
// CE QU'IL NE PRÉTEND PAS. Il constate le rôle servi ; il ne le choisit pas.
// Aujourd'hui l'application se connecte avec un rôle BYPASSRLS — `postgres`
// sur Supabase — et le bloc le DIT en toutes lettres plutôt que d'afficher
// « RLS forcée » comme si elle s'appliquait à l'application. Passer sous un
// rôle sans BYPASSRLS demande que l'application pose le locataire dans chaque
// transaction. LE MÉCANISME EXISTE depuis le 2026-09-03 (`db/tenant.ts`,
// `db/sans-locataire.ts`, migration 0140) ; LE CÂBLAGE, NON — `withTenant`
// n'a aucun appelant de production, et `tenant.test.ts` MESURE ce que
// l'armement coûterait aujourd'hui : l'écran d'accueil et `logEvent` lèvent.
// C'est l'étape 1 de docs/PLAN_RLS.md, à moitié faite, et écrite comme telle.

/** Tables d'infrastructure sans périmètre métier : RLS activée, AUCUNE
 *  politique — seul le propriétaire (l'application) les lit. Toute addition
 *  ici se justifie par écrit, pas par commodité. */
export const PROPRIETAIRE_SEUL = new Set([
  '_migrations',   // registre des migrations — appliquées sous SUPABASE_DB_URL (postgres), jamais par l'application (0140)
  'rls_definer_justifiee', // registre des fonctions SECURITY DEFINER statuées (0140) — un verdict par FONCTION, pas par locataire
  'notification',  // file technique : AUCUN chemin de l'application ne la lit ni ne l'écrit (recensé le 2026-09-03) — droit retiré à otto_app (0140)
]);

/* CINQ NOMS ONT QUITTÉ CETTE LISTE LE 2026-09-03 (migration 0140) — et le
   départ vaut d'être écrit. `app_state`, `blob_store`, `itgc_area`,
   `server_error` et `engagement_lock_verdict` portaient RLS + FORCE et AUCUNE
   politique : « propriétaire-seul » décrivait un état de la BASE, pas un
   besoin du PRODUIT — l'application les lit toutes. Sous `otto_app` (sans
   BYPASSRLS) elles auraient rendu ZÉRO LIGNE sans un mot : horloge de
   démonstration muette, pièces jointes introuvables, sonde de santé aveugle.
   Chacune a donc reçu sa politique, avec sa justification écrite dans 0140 —
   dont une, `server_error`, où `using` et `with check` DIVERGENT à dessein. */

export interface EtatRole { utilisateur: string; bypass: boolean; superutilisateur: boolean }
export interface TableRls { table: string; tenant: boolean; rls: boolean; force: boolean; politiques: number }

export async function etatRole(db: OttoDb): Promise<EtatRole> {
  const r = await db.query<{ u: string; b: boolean; s: boolean }>(
    `select current_user u, r.rolbypassrls b, r.rolsuper s from pg_roles r where r.rolname = current_user`);
  const x = r.rows[0];
  return { utilisateur: x.u, bypass: x.b, superutilisateur: x.s };
}

export async function tablesRls(db: OttoDb): Promise<TableRls[]> {
  const r = await db.query<{ t: string; tenant: boolean; rls: boolean; force: boolean; n: string }>(
    `select c.relname t, c.relrowsecurity rls, c.relforcerowsecurity force,
            exists(select 1 from pg_attribute a where a.attrelid = c.oid
                   and a.attname = 'tenant_id' and not a.attisdropped) tenant,
            (select count(*) from pg_policy p where p.polrelid = c.oid)::text n
     from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     order by 1`);
  return r.rows.map((x) => ({ table: x.t, tenant: x.tenant, rls: x.rls, force: x.force, politiques: Number(x.n) }));
}

/**
 * LE VERDICT, pur — le build et le test l'appellent sur des lignes, pas sur une
 * base. Trois défauts possibles, chacun nommé avec sa table :
 *   · une table sans RLS ;
 *   · une table à politique dont la RLS n'est pas FORCÉE (le propriétaire la
 *     contournerait) ;
 *   · une table sans politique qui n'est pas sur la liste propriétaire-seul.
 */
export function verdictRls(tables: TableRls[], proprietaireSeul: Set<string> = PROPRIETAIRE_SEUL): string[] {
  const defauts: string[] = [];
  /* UNE BASE VIDE EST VERTE PAR CONSTRUCTION — `every()` sur l'ensemble vide
     dit « FORCE sur toutes » quand il n'y a aucune table. Le plancher est
     celui du schéma réel (cent tables) ; en dessous, la base n'est pas
     migrée, et le bloc le dit au lieu de bénir le vide. */
  if (tables.length < 90) defauts.push(`base non migrée : ${tables.length} table(s) publique(s) seulement (le schéma en compte une centaine)`);
  for (const t of tables) {
    if (!t.rls) defauts.push(`${t.table} : RLS non activée`);
    /* FORCE sur TOUTE table à RLS (0034) — le premier build a montré
       `server_error` : tenant_id, RLS, aucune politique, pas de FORCE, et un
       verdict « aucun défaut » à côté d'une ligne « FORCE MANQUANTE ». Un bloc
       qui se contredit lui-même n'est pas un bloc. */
    if (t.rls && !t.force) defauts.push(`${t.table} : RLS non FORCÉE — le propriétaire la contourne`);
    if (t.politiques === 0 && !proprietaireSeul.has(t.table)) defauts.push(`${t.table} : aucune politique, et pas sur la liste propriétaire-seul justifiée`);
  }
  return defauts;
}

/**
 * LES SIX RETRAITS QUE 0140 POSE, ET QU'IL FAUT DONC VÉRIFIER — les six, pas
 * deux (revue hostile n°9, constat 14 : le script n'en contrôlait que deux, et
 * une migration future re-`grant`ant en bloc — le geste que 0140 fait
 * lui-même — rouvrirait quatre tables sans qu'aucun voyant s'allume).
 */
export const RETRAITS_0140: { table: string; privileges: string[] }[] = [
  { table: '_migrations', privileges: ['select', 'insert', 'update', 'delete'] },
  { table: 'notification', privileges: ['select', 'insert', 'update', 'delete'] },
  { table: 'blob_store', privileges: ['update', 'delete'] },
  { table: 'itgc_area', privileges: ['insert', 'update', 'delete'] },
  { table: 'engagement_lock_verdict', privileges: ['insert', 'update', 'delete'] },
  { table: 'server_error', privileges: ['update', 'delete'] },
];

/**
 * LES FONCTIONS `SECURITY DEFINER` JUSTIFIÉES, NOMMÉES UNE PAR UNE.
 *
 * Une fonction `definer` s'exécute avec les droits de son PROPRIÉTAIRE : elle
 * contourne la RLS. Le recensement valait zéro jusqu'au 2026-09-03 au soir ; il
 * en compte deux depuis 0141, et la règle n'est donc plus « zéro » mais
 * « AUCUNE QUI NE SOIT ÉCRITE ICI ». Les fonctions installées par une EXTENSION
 * sont hors sujet et exclues à la source (pg_depend.deptype = 'e').
 */
export const DEFINERS_JUSTIFIEES: Record<string, string> = {
  otto_portal_contact:
    'PORTAIL CLIENT (0141) : résout UN jeton vers UN contact actif. En `security invoker`, elle produit une RÉCURSION INFINIE entre la politique de `engagement` et celle de `client_contact` — mesuré, et vu de l’application comme ZÉRO LIGNE. Sans argument (rien à injecter), `search_path` figé, ne rend aucune donnée de dossier.',
  otto_portal_entity:
    'PORTAIL CLIENT (0141) : l’entité du contact que le jeton désigne. Même raison, même forme : sans argument, `search_path` figé, rend un seul identifiant d’entité.',
};

/** Les `security definer` non justifiées — la liste qui doit rester vide. */
export function verdictDefiners(presentes: string[], justifiees = DEFINERS_JUSTIFIEES): string[] {
  return presentes.filter((n) => !(n in justifiees))
    .map((n) => `${n} : fonction SECURITY DEFINER non justifiée — elle contourne la RLS avec les droits du propriétaire. Écrivez sa raison dans DEFINERS_JUSTIFIEES, ou repassez-la en security invoker.`);
}

export interface EtatOttoApp {
  /** null = le rôle n'existe pas (migration 0140 non appliquée). */
  role: { bypass: boolean; superutilisateur: boolean; connexion: boolean } | null;
  /** Les couples table/privilège que 0140 referme et qui sont RESTÉS ouverts. */
  ouvertes: string[];
  /** Les fonctions `security definer` de `public`, hors extensions. */
  definers: string[];
}

/**
 * LE VERDICT SUR LE RÔLE APPLICATIF, pur — `scripts/db/verifier-role-applicatif.ts` l'appelle
 * sur ce qu'un vrai Postgres a répondu, le test l'appelle sur des cas connus
 * MAUVAIS (règle 17 : un détecteur qui n'a jamais échoué exprès n'a jamais été
 * testé, et celui-ci ne peut pas s'exécuter en local — aucune base réseau).
 */
export function verdictOttoApp(e: EtatOttoApp): string[] {
  const defauts: string[] = [];
  if (!e.role) {
    defauts.push('otto_app ABSENT — la migration 0140 n’a pas été appliquée à cette base');
  } else {
    if (e.role.bypass) defauts.push('otto_app CONTOURNE la RLS — il ne garderait rien ; l’étape 3 est interdite tant que c’est vrai');
    if (e.role.superutilisateur) defauts.push('otto_app est SUPERUTILISATEUR — il contourne tout');
    if (!e.role.connexion) defauts.push('otto_app ne peut pas se connecter (rolcanlogin=false) — la chaîne de l’étape 3 échouerait');
  }
  for (const t of e.ouvertes) {
    defauts.push(`${t} est ouvert à otto_app — 0140 devait le retirer (raison écrite dans la migration)`);
  }
  defauts.push(...verdictDefiners(e.definers));
  return defauts;
}

export interface PolitiqueRls {
  table: string; nom: string;
  /** `ALL` | `SELECT` | `INSERT` | `UPDATE` | `DELETE`, tel que pg_policies le rend. */
  cmd: string;
  using: string | null;
  withCheck: string | null;
  /** La table porte-t-elle une colonne `tenant_id` ? */
  tenant: boolean;
}

/**
 * LE VERDICT QUI REGARDE `cmd` — celui qui manquait (mandat du soir, 0.3).
 *
 * La propriété sur laquelle tout le reste s'appuie — « `USING` tient lieu de
 * `WITH CHECK` » — n'est PAS générale : PostgreSQL ne l'applique qu'aux
 * politiques `FOR ALL` et `FOR UPDATE`. `verdictRls()` ne lisait jamais la
 * commande : il aurait donc béni un schéma où quelqu'un écrit un jour
 * `for select using (…)` sur une table à locataire, laissant l'écriture
 * couverte par une AUTRE politique — ou par aucune.
 *
 * Trois défauts, chacun nommé avec sa table :
 *   · une politique `with check (true)` sur une table à locataire : l'écriture
 *     n'est contrainte par RIEN, quel que soit le `using` ;
 *   · une table à locataire dont AUCUNE politique ne couvre l'écriture
 *     (ni `ALL`, ni `INSERT`, ni `UPDATE`) : l'application écrira et la base
 *     refusera — panne franche, mais il vaut mieux le savoir au build ;
 *   · une politique `FOR UPDATE` ou `FOR ALL` dont le `using` vaut `true` sur
 *     une table à locataire : la lecture n'est pas bornée.
 */
/**
 * LES DIVERGENCES VOULUES, ÉCRITES. Une règle qui n'a pas d'exception écrite
 * finit par être désarmée en bloc le jour où elle gêne : celle-ci nomme les
 * siennes, et le test vérifie que chacune porte sa raison.
 */
export const POLITIQUES_JUSTIFIEES: Record<string, string> = {
  'server_error.server_error_applicatif':
    'DÉLIBÉRÉ (0140) : `with check (true)` parce qu’une exception peut survenir AVANT toute session — un crochet qui échoue à consigner la panne est la panne qui disparaît. La LECTURE, elle, reste bornée (`tenant_id is null or tenant_id = otto_tenant()`).',
};

export function verdictPolitiques(
  politiques: PolitiqueRls[],
  justifiees: Record<string, string> = POLITIQUES_JUSTIFIEES,
): string[] {
  const defauts: string[] = [];
  const parTable = new Map<string, PolitiqueRls[]>();
  for (const p of politiques) parTable.set(p.table, [...(parTable.get(p.table) ?? []), p]);
  for (const p of politiques) {
    if (!p.tenant) continue;
    if (`${p.table}.${p.nom}` in justifiees) continue;
    const vrai = (x: string | null) => x !== null && /^\(?\s*true\s*\)?$/i.test(x.trim());
    if (vrai(p.withCheck)) {
      defauts.push(`${p.table}.${p.nom} : \`with check (true)\` sur une table à locataire — l’écriture n’est contrainte par rien`);
    }
    if ((p.cmd === 'ALL' || p.cmd === 'SELECT') && vrai(p.using)) {
      defauts.push(`${p.table}.${p.nom} : \`using (true)\` sur une table à locataire — la lecture n’est bornée par rien`);
    }
  }
  for (const [table, ps] of parTable) {
    if (!ps[0].tenant) continue;
    const ecrit = ps.some((p) => p.cmd === 'ALL' || p.cmd === 'INSERT' || p.cmd === 'UPDATE');
    if (!ecrit) {
      defauts.push(`${table} : aucune politique ne couvre l’ÉCRITURE (${ps.map((p) => p.cmd).join(', ')}) — la base refusera toute écriture de l’application`);
    }
  }
  return defauts.sort();
}

/** Les politiques du schéma, telles que le catalogue les rend. */
export async function politiquesRls(db: OttoDb): Promise<PolitiqueRls[]> {
  const r = await db.query<{ t: string; n: string; c: string; u: string | null; w: string | null; tenant: boolean }>(
    `select p.tablename t, p.policyname n, p.cmd c, p.qual u, p.with_check w,
            exists(select 1 from information_schema.columns c2
                   where c2.table_schema = 'public' and c2.table_name = p.tablename
                     and c2.column_name = 'tenant_id') tenant
     from pg_policies p where p.schemaname = 'public' order by 1, 2`);
  return r.rows.map((x) => ({ table: x.t, nom: x.n, cmd: x.c, using: x.u, withCheck: x.w, tenant: x.tenant }));
}

/** Le bloc tel qu'il s'imprime dans un journal de build. */
export function bloc(role: EtatRole, tables: TableRls[], defauts: string[]): string[] {
  const tenant = tables.filter((t) => t.tenant);
  const lignes = [
    '── ASSERTIONS RÔLE / RLS (contre la base RÉSEAU) ───────────────────────',
    `rôle servi        : ${role.utilisateur}${role.superutilisateur ? ' (superutilisateur)' : ''}`,
    `rolbypassrls      : ${role.bypass ? 'TRUE — ce rôle CONTOURNE la RLS : les politiques et FORCE sont inertes pour l’application' : 'false — la RLS s’applique à l’application'}`,
    `tables publiques  : ${tables.length} · avec tenant_id : ${tenant.length} · avec politique : ${tables.filter((t) => t.politiques > 0).length}`,
    `tenant_id tables  : RLS ${tenant.every((t) => t.rls) ? 'activée sur toutes' : 'MANQUANTE sur ' + tenant.filter((t) => !t.rls).map((t) => t.table).join(', ')}`
      + ` · FORCE ${tenant.every((t) => t.force) ? 'sur toutes' : 'MANQUANTE sur ' + tenant.filter((t) => !t.force).map((t) => t.table).join(', ')}`,
    `sans politique    : ${tables.filter((t) => t.politiques === 0).map((t) => t.table).join(', ') || '(aucune)'} — propriétaire-seul, justifiées dans assertions-role.ts`,
  ];
  if (defauts.length) {
    lignes.push(`DÉFAUTS (${defauts.length}) :`);
    for (const d of defauts) lignes.push(`  · ${d}`);
  } else {
    lignes.push('défauts           : aucun');
  }
  if (role.bypass) {
    lignes.push('CE QUE CE BLOC NE PROUVE PAS : la RLS n’est pas éprouvée sous le rôle qui sert l’application,');
    lignes.push('  puisqu’il la contourne. Elle l’est sous otto_lecteur_demo (tentative de fuite ci-dessous).');
  }
  lignes.push('───────────────────────────────────────────────────────────────────────');
  return lignes;
}
