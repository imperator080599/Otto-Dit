import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getDb, repoRoot, type OttoDb } from './client';

// Applies supabase/migrations/*.sql in lexical order; tracks applied files in _migrations.
// The same .sql files are applied to Supabase in production (DEPLOY.md) — and by the same
// code : `migrate()` roule sur les DEUX pilotes (PGlite local, DATABASE_URL réseau).
//
// ON N'ÉDITE PAS UNE MIGRATION APPLIQUÉE — ET CE FICHIER LE REFUSE DÉSORMAIS.
//
// CE QUE CETTE GARDE A COÛTÉ AVANT D'EXISTER. Le 3 septembre, 0140 est
// appliquée en production. Le soir, j'ajoute une table au fichier 0140. Une
// migration appliquée ne rejoue jamais : `_migrations` la connaît par son NOM,
// et rien ne regardait son contenu. Sur une base fraîche, tout passait ; sur la
// production, la table n'a jamais existé, 0141 a échoué à chaque déploiement,
// et TROIS tranches poussées sur `main` ne sont jamais arrivées à l'URL. La
// suite était verte, le parcours cliqué était vert, et le fondateur ouvrait une
// application vieille d'un jour.
//
// OÙ CETTE GARDE S'ARRÊTE DE REGARDER, dit ici :
//   · elle ne vérifie que ce qu'elle a elle-même enregistré. Les migrations
//     appliquées AVANT son existence n'ont pas d'empreinte : elles sont dites
//     NON VÉRIFIABLES, une fois, par leur nom — et jamais bénies en silence,
//     car enregistrer leur empreinte aujourd'hui reviendrait à approuver
//     l'édition qu'on cherche à interdire ;
//   · elle ne dit rien de ce qu'une migration FAIT, seulement de ce qu'elle
//     EST : deux fichiers différents ne peuvent pas se prétendre le même ;
//   · elle ne rattrape pas une migration éditée puis remise à l'identique.

/** L'empreinte d'un fichier de migration : son contenu, rien d'autre. */
export function empreinteMigration(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export class MigrationEditee extends Error {}

export async function migrate(db?: OttoDb): Promise<string[]> {
  const conn = db ?? (await getDb());
  await conn.exec(`create table if not exists _migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  /* La colonne s'ajoute aux bases qui existaient avant la garde : elles gardent
     leurs lignes, sans empreinte, et le diront. */
  await conn.exec(`alter table _migrations add column if not exists empreinte text`);

  const dir = path.join(repoRoot(), 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const deja = new Map(
    (await conn.query<{ name: string; empreinte: string | null }>(
      'select name, empreinte from _migrations')).rows.map((r) => [r.name, r.empreinte]),
  );

  /* LA VÉRIFICATION D'ABORD, L'APPLICATION ENSUITE. Une migration éditée après
     coup arrête TOUT : appliquer les suivantes sur une base dont on sait qu'elle
     ne correspond plus aux fichiers, c'est aggraver en silence. */
  const editees: string[] = [];
  const sansEmpreinte: string[] = [];
  for (const f of files) {
    if (!deja.has(f)) continue;
    const attendue = deja.get(f);
    const reelle = empreinteMigration(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (attendue === null || attendue === undefined) sansEmpreinte.push(f);
    else if (attendue !== reelle) editees.push(f);
  }
  if (editees.length > 0) {
    throw new MigrationEditee(
      `${editees.length} migration(s) ÉDITÉE(S) APRÈS APPLICATION : ${editees.join(', ')}.\n`
      + '  Une migration appliquée ne rejoue jamais : cette base ne correspond plus à ces fichiers,\n'
      + '  et une base fraîche ne se comportera pas comme elle. Écrivez le changement dans une\n'
      + '  migration NOUVELLE, idempotente, plutôt que dans celle-ci.',
    );
  }
  if (sansEmpreinte.length > 0) {
    /* DIT, PAS TU. Ces lignes sont antérieures à la garde ; les bénir
       silencieusement reviendrait à approuver ce qu'on interdit. */
    console.log(`migrations sans empreinte (appliquées avant la garde, non vérifiables) : ${sansEmpreinte.length}`);
  }

  const applied: string[] = [];
  for (const f of files) {
    if (deja.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await conn.exec(sql);
    await conn.query('insert into _migrations(name, empreinte) values ($1, $2)',
      [f, empreinteMigration(sql)]);
    applied.push(f);
  }
  return applied;
}
