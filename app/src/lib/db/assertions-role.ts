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

export interface EtatOttoApp {
  /** null = le rôle n'existe pas (migration 0140 non appliquée). */
  role: { bypass: boolean; superutilisateur: boolean; connexion: boolean } | null;
  /** Les couples table/privilège que 0140 referme et qui sont RESTÉS ouverts. */
  ouvertes: string[];
  /** Le nombre de fonctions `security definer` dans public. */
  definers: number;
}

/**
 * LE VERDICT SUR LE RÔLE APPLICATIF, pur — `scripts/db/otto-app.ts` l'appelle
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
  if (e.definers > 0) {
    defauts.push(`${e.definers} fonction(s) SECURITY DEFINER — elles contournent la RLS avec les droits du propriétaire`);
  }
  return defauts;
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
