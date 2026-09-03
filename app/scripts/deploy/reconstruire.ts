import { getDb, closeDb, dbKind } from '../../src/lib/db/client';
import { construireMondeDemo } from '../demo-seed';
import { instantanerLeMonde, etatInstantane } from '../../src/lib/services/monde-demo';

// npm run deploy:reconstruire (ADR-109, P0a) — reconstruit LA DÉMO PUBLIQUE
// dans la base réseau : schéma rasé, migrations, monde de démonstration
// entier — les MÊMES appels que l'interface, aucun raccourci. Exécuté par la
// commande de build Vercel : chaque déploiement repart d'un monde propre,
// comme le mandat l'exige.
//
// DEUX GARDES, parce que ce script DÉTRUIT :
//  1. DATABASE_URL doit être posée — sans elle il refuse (il ne touchera
//     jamais la base locale PGlite) ;
//  2. OTTO_DEMO_PUBLIC=1 doit être posée — ce script ne rase qu'une base de
//     DÉMONSTRATION PUBLIQUE assumée comme telle. Une base de production
//     réelle n'aura jamais cette variable, et le script refusera de la toucher.

async function main() {
  if (dbKind() !== 'pg') {
    console.error(
      'deploy:reconstruire : DATABASE_URL est absente — ce script reconstruit une base RÉSEAU '
      + 'de démonstration, jamais la base locale.\n'
      + `  Environnement du build : VERCEL_ENV=${process.env.VERCEL_ENV ?? '(absent)'} · `
      + `branche ${process.env.VERCEL_GIT_COMMIT_REF ?? '(inconnue)'}.\n`
      + '  LA CAUSE LA PLUS FRÉQUENTE, et elle ne se voit pas depuis le tableau de bord : une '
      + 'variable posée pour le seul environnement « Production » est ABSENTE des déploiements '
      + 'd\'aperçu (Preview). Si ce build est un aperçu, cochez DATABASE_URL pour TOUS les '
      + 'environnements — ou réglez la branche de production sur celle-ci.\n'
      + '  Vercel : Settings → Environment Variables → DATABASE_URL (Production + Preview + '
      + 'Development), puis Redeploy.');
    process.exit(1);
  }
  /* VERCEL=1 vaut déclaration : sur Vercel, tout déploiement EST la démo
     publique (DA-10). Hors Vercel, la destruction se déclare à la main. */
  if (process.env.OTTO_DEMO_PUBLIC !== '1' && process.env.VERCEL !== '1') {
    console.error(
      'deploy:reconstruire : ce script RASE la base visée, et ne le fait que pour une démonstration '
      + 'publique déclarée (OTTO_DEMO_PUBLIC=1, ou build Vercel). Sur une base réelle, ne posez '
      + 'JAMAIS cette variable ; pour la démo, posez-la et relancez.');
    process.exit(1);
  }
  const hote = (() => {
    try { return new URL(process.env.DATABASE_URL!).hostname; } catch { return '(URL illisible)'; }
  })();
  console.log(`reconstruction de la démo publique sur ${hote} — schéma rasé, données 100 % fictives`);

  /* LE MONDE ENRICHI (mandat de nuit n°2, 1.1) : ADDITIF, rejouable — sur un
     monde conservé comme sur un monde reconstruit. Il ne remplace rien : ce
     que quelqu'un a saisi sur la démonstration survit. Une étape qui ne tient
     pas est DITE dans le journal de build, jamais tue. */
  const enrichir = async () => {
    const { enrichirMondeDemo } = await import('../../src/lib/flows/enrichir');
    const r = await enrichirMondeDemo();
    for (const e of r.etapes) console.log(`  enrichissement ${e.fait ? 'ok ' : 'NON'} ${e.nom} — ${e.detail}`);
  };
  const db = await getDb();
  /* SEMER SI VIDE (décision de Tuan, 2026-08-31) : quelqu'un TESTE peut-être
     l'URL en ce moment — un push pendant sa séance ne doit pas lui retirer
     ses données sous les doigts. Le monde ne se rase que s'il n'existe pas,
     ou sur ordre explicite (OTTO_RECONSTRUIRE=1, à poser dans les variables
     Vercel pour retrouver un monde neuf à chaque déploiement). Les NOUVELLES
     migrations s'appliquent dans tous les cas. */
  const dejaSeme = (await db.query<{ n: string }>(
    `select count(*)::text n from information_schema.tables
     where table_schema = 'public' and table_name = 'tenant'`)).rows[0].n !== '0'
    && (await db.query<{ n: string }>(`select count(*)::text n from tenant`)).rows[0].n !== '0';
  let reconstruit = false;
  if (dejaSeme && process.env.OTTO_RECONSTRUIRE !== '1') {
    const { migrate } = await import('../../src/lib/db/migrate');
    const appliquees = await migrate();
    console.log(`monde déjà semé — conservé (OTTO_RECONSTRUIRE=1 pour raser) ; `
      + `migrations nouvelles : ${appliquees.length ? appliquees.join(', ') : 'aucune'}`);
    await enrichir();
  } else {
    await db.exec('drop schema if exists public cascade; create schema public; grant all on schema public to public;');
    /* Le monde entier passe par migrate() + les mêmes flux que npm run
       demo:seed — c'est aussi la VÉRIFICATION du pilote réseau : chaque
       service, chaque contrainte, chaque trigger tourne sur le vrai Postgres. */
    await construireMondeDemo('all');
    reconstruit = true;
    await enrichir();
  }

  /* L'INSTANTANÉ DU MONDE — ce que le bouton « remettre à zéro » restaure.
     Semer prend une dizaine de minutes sur la base réseau : aucune fonction
     serverless ne peut le rejouer. On fige donc ici, au build, l'état exact
     que le bouton rendra — et l'écran affiche la date de ce figeage, pour que
     « à zéro » veuille dire quelque chose de vérifiable.

     QUAND ON LE REPREND : après une reconstruction (évident), quand il
     n'existe pas, et quand une migration a changé la forme des tables — dans
     ce dernier cas l'instantané fige le monde TEL QU'IL EST à ce déploiement,
     et le journal le dit au lieu de le taire. */
  const avant = await etatInstantane();
  if (reconstruit || !avant.existe || !avant.aJour) {
    const raison = reconstruit ? 'monde reconstruit'
      : !avant.existe ? 'aucun instantané sur cette base'
        : `schéma changé depuis l'instantané (${avant.desaccords.slice(0, 3).join(' · ')})`;
    const inst = await instantanerLeMonde();
    console.log(`instantané du monde repris — ${raison} : ${inst.tables} table(s), ${inst.lignes} ligne(s)`
      + (reconstruit ? '' : ' — « remettre à zéro » ramènera donc à l\'état de CE déploiement'));
  } else {
    console.log(`instantané du monde conservé (pris le ${avant.prisLe ?? '—'})`);
  }

  /* LE BLOC D'ASSERTIONS RÔLE / RLS — CONTRE LA BASE RÉSEAU, À CHAQUE BUILD
     (Groupe 0 du mandat de nuit, item 106). Qui sert l'application, si ce
     rôle contourne la RLS, quelles tables sont couvertes et FORCÉES, et
     lesquelles n'ont aucune politique. Un défaut ARRÊTE le déploiement : une
     table à locataire sans politique en ligne est exactement ce que la chaîne
     locale — superutilisateur sur PGlite — ne peut pas voir. */
  {
    const { etatRole, tablesRls, verdictRls, bloc } = await import('../../src/lib/db/assertions-role');
    const role = await etatRole(db);
    const tables = await tablesRls(db);
    const defauts = verdictRls(tables);
    for (const l of bloc(role, tables, defauts)) console.log(l);
    if (defauts.length) {
      console.error(`deploy:reconstruire : ${defauts.length} défaut(s) de couverture RLS sur la base réseau — le déploiement s'arrête.`);
      process.exit(1);
    }
  }

  /* LA TENTATIVE DE FUITE, SUR LE VRAI POSTGRES, À CHAQUE DÉPLOIEMENT.
     Localement, RLS est inerte (le propriétaire la contourne) : la seule
     preuve qui compte se prend ici. Un rôle NON propriétaire, avec SELECT
     sur tout, essaie de lire : (a) sans locataire → rien ; (b) avec un
     locataire ÉTRANGER → rien ; (c) avec le bon locataire → le monde semé.
     Un échec ARRÊTE le déploiement — une démo publique qui fuit ne part pas. */
  const db2 = await getDb();
  await db2.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'otto_lecteur_demo') then
        create role otto_lecteur_demo nologin;
      end if;
    end $$;
    grant usage on schema public to otto_lecteur_demo;
    grant select on all tables in schema public to otto_lecteur_demo;
    grant otto_lecteur_demo to current_user;`);
  const essai = async (tenant: string | null) => {
    let visibles = -1;
    await db2.transaction(async (t) => {
      await t.query(`set local role otto_lecteur_demo`);
      if (tenant) await t.query(`select set_config('otto.tenant_id', $1, true)`, [tenant]);
      const r = await t.query<{ n: string }>(
        `select (select count(*) from engagement)
              + (select count(*) from evidence)
              + (select count(*) from workpaper) as n`);
      visibles = Number(r.rows[0].n);
    });
    return visibles;
  };
  const vermeil = (await db2.query<{ id: string }>(`select id::text from tenant limit 1`)).rows[0].id;
  const sansTenant = await essai(null);
  const etranger = await essai('00000000-0000-4000-8000-00000000dead');
  const legitime = await essai(vermeil);
  console.log(`fuite tentée — sans locataire : ${sansTenant} ligne(s) · locataire étranger : ${etranger} · locataire légitime : ${legitime}`);
  if (sansTenant !== 0 || etranger !== 0) {
    throw new Error(`FUITE RLS : un rôle non propriétaire lit ${sansTenant + etranger} ligne(s) hors de son locataire — déploiement ARRÊTÉ`);
  }
  if (legitime === 0) {
    throw new Error('RLS trop stricte ou monde vide : le locataire légitime ne voit RIEN — le test de fuite ne prouve alors rien');
  }
  await closeDb();
  console.log('démo publique reconstruite, tentative de fuite refusée.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
