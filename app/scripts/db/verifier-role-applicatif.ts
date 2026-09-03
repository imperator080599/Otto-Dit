import { getDb, closeDb, dbKind, hote } from '../../src/lib/db/client';
import { verdictOttoApp, RETRAITS_0140, type EtatOttoApp } from '../../src/lib/db/assertions-role';

// npx tsx scripts/db/verifier-role-applicatif.ts — LE RÔLE APPLICATIF, VÉRIFIÉ
// SUR UN VRAI POSTGRES
//
// IL S'APPELAIT `otto-app.ts`, ET CE NOM MENTAIT : on pouvait croire qu'il
// CRÉAIT le rôle. Il ne crée rien — c'est la migration 0140 qui crée. Il LIT le
// catalogue et rend un verdict. Un instrument mal nommé est un instrument mal
// cru (mandat du soir, 0.3).
// (migration 0140 ; docs/PLAN_RLS.md étape 2).
//
// POURQUOI CE SCRIPT EXISTE ALORS QUE LA SUITE ÉPROUVE DÉJÀ LE RÔLE. En local,
// c'est PGlite qui crée le rôle d'essai et qui répond — le même moteur, mais
// pas le même déploiement (règle 11). `otto_app` est créé par une MIGRATION :
// tant qu'aucune migration n'a été appliquée à un Postgres réseau, personne
// n'a vu ce rôle exister ailleurs que dans un wasm. Ce script pose les trois
// questions dont la réponse ne se lit QUE là, et il rougit sur chacune :
//   · le rôle existe-t-il après migration ?
//   · contourne-t-il la RLS ? (un `t` interdirait l'étape 3 : le rôle ne
//     garderait rien, et la bascule serait un théâtre)
//   · les SIX retraits de privilège de 0140 tiennent-ils vraiment ?
//
// CE QU'IL NE FAIT PAS : il ne se connecte PAS en tant qu'`otto_app` (le mot
// de passe se pose à la main, hors du dépôt — PLAN_RLS étape 3.1). Il lit le
// catalogue sous le rôle de la CI. Le jour de l'étape 2 bis, c'est le fondateur
// qui essaie la chaîne avec `psql`.

async function main() {
  if (!process.env.DATABASE_URL && process.env.OTTO_CI_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.OTTO_CI_DATABASE_URL;
  }
  if (dbKind() !== 'pg') {
    console.error('vérification du rôle applicatif : ni DATABASE_URL ni OTTO_CI_DATABASE_URL — cette lecture ne vaut que contre une base RÉSEAU.');
    process.exit(1);
  }
  console.log(`base réseau : ${hote(process.env.DATABASE_URL!)}`);
  const db = await getDb();

  const r = await db.query<{ b: boolean; s: boolean; l: boolean }>(
    `select rolbypassrls b, rolsuper s, rolcanlogin l from pg_roles where rolname = 'otto_app'`);
  const x = r.rows[0];
  if (x) console.log(`otto_app : bypassrls=${x.b} · superuser=${x.s} · login=${x.l}`);
  else console.log('otto_app : ABSENT');

  /* LES SIX RETRAITS DE 0140 — pas deux. `has_table_privilege` répond sur le
     rôle nommé, sans se connecter à sa place. */
  const ouvertes: string[] = [];
  if (x) {
    for (const r of RETRAITS_0140) {
      for (const priv of r.privileges) {
        const p = await db.query<{ ok: boolean }>(
          `select has_table_privilege('otto_app', $1, $2) ok`, [r.table, priv]);
        const ouvert = p.rows[0]?.ok === true;
        console.log(`${r.table}.${priv} : ${ouvert ? 'OUVERT à otto_app' : 'retiré'}`);
        if (ouvert) ouvertes.push(`${r.table}.${priv}`);
      }
    }
  }

  /* ET LE RECENSEMENT QUI DOIT RESTER À ZÉRO — POSÉ EXACTEMENT COMME DANS LA
     MIGRATION. Les deux inventaires ne posaient pas la même question : 0140
     exclut les fonctions installées par une EXTENSION (`pg_depend.deptype =
     'e'`), ce script ne les excluait pas. Sur un vrai Supabase — où `public`
     peut porter pgcrypto ou uuid-ossp — le script aurait échoué là où la
     migration passe, et on aurait cherché le défaut du mauvais côté
     (mandat du soir, 0.3). */
  const sd = await db.query<{ n: string }>(
    `select p.proname n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.prosecdef
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 1`);
  console.log(`fonctions SECURITY DEFINER : ${sd.rows.map((x) => x.n).join(', ') || '(aucune)'}`);

  const etat: EtatOttoApp = {
    role: x ? { bypass: x.b, superutilisateur: x.s, connexion: x.l } : null,
    ouvertes,
    definers: sd.rows.map((x) => x.n),
  };
  const defauts = verdictOttoApp(etat);

  await closeDb();
  if (defauts.length) {
    for (const d of defauts) console.error(`::error::${d}`);
    process.exit(1);
  }
  console.log('otto_app : rôle présent, sans bypass, six retraits tenus, aucune fonction definer (hors extensions).');
}

main().catch(async (e) => {
  await closeDb().catch(() => undefined);
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
