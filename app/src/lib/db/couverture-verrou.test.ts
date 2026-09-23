import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';

// LA COUVERTURE DU VERROU GÉNÉRIQUE (P1-05, AUD-08, migration 0177) — un sujet DIFFÉRENT de
// `rls-couverture.test.ts` malgré le mot commun « couverture » : celui-ci vérifie qu'un dossier
// SCELLÉ refuse l'écriture, pas qu'une politique RLS existe. Le texte du plan maître §7.5
// suggérait de renommer/réutiliser `rls-couverture.test.ts` pour ce sujet — une coquille (les deux
// tests n'ont rien en commun), pas suivie ; décision consignée dans STATUS.md (P1-05).
//
// CE QUE CE TEST NE VOIT PAS (règle 19) : une table FILLE qui atteint `engagement_id` par une
// jointure (pas une colonne directe) n'est repérée par AUCUNE introspection générique ici — elle
// n'entre au registre que si une session l'y a mise à la main (0177 en a ajouté 16, une par une).
// Une table fille future, non gardée, ne rougira donc PAS ce test — seul un clic ou un test
// ciblé sur cette table précise le trouverait (règle 15).

describe('couverture du verrou générique (AUD-08, 0177)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  it('toute table publique portant une colonne engagement_id a un verdict au registre', async () => {
    const avecColonne = await q<{ table_name: string }>(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'engagement_id'
       order by 1`);
    const auRegistre = new Set((await q<{ table_name: string }>(
      `select table_name from engagement_lock_verdict`)).map((r) => r.table_name));
    const manquantes = avecColonne.map((r) => r.table_name).filter((t) => !auRegistre.has(t));
    expect(manquantes, 'tables à engagement_id sans verdict — en ajouter une ligne dans une MIGRATION, jamais ici').toEqual([]);
  });

  it('aucun verdict ne reste « garde_proposee » — 0177 les a toutes confirmées ou une nouvelle table attend confirmation', async () => {
    const proposees = await q<{ table_name: string }>(
      `select table_name from engagement_lock_verdict where verdict = 'garde_proposee' order by 1`);
    expect(proposees.map((r) => r.table_name)).toEqual([]);
  });

  it('tout verdict « garde » porte réellement un déclencheur <table>_lock_guard SUR CETTE TABLE', async () => {
    const gardees = await q<{ table_name: string }>(
      `select table_name from engagement_lock_verdict where verdict = 'garde' order by 1`);
    /* JOINT r.relname = table_name — pas seulement « un déclencheur de ce NOM existe quelque
       part » (revue hostile de P1-05, voix 1 : la version précédente aurait laissé passer
       `foo_lock_guard` posé par erreur sur la table `bar` tant que `foo` porte un verdict
       `garde`). */
    const parTable = new Map<string, string>();
    for (const r of await q<{ tgname: string; relname: string }>(
      `select g.tgname, r.relname from pg_trigger g join pg_class r on r.oid = g.tgrelid
       where g.tgname like '%\\_lock_guard' escape '\\'`)) {
      parTable.set(r.relname, r.tgname);
    }
    const sansDeclencheur = gardees
      .map((r) => r.table_name)
      .filter((t) => parTable.get(t) !== `${t}_lock_guard`);
    expect(sansDeclencheur, 'verdict « garde » sans déclencheur réel SUR CETTE TABLE — le registre ment').toEqual([]);
  });

  it('les 16 tables filles ajoutées par 0177 (sans colonne engagement_id directe) sont bien gardées', async () => {
    // Cas connu mauvais couvert séparément (gardes/registre.ts G-32..) : ici on vérifie
    // seulement que le déclencheur existe, pas qu'il refuse — l'épreuve du refus est le rôle
    // du registre des gardes (règle 17), pas de ce test de couverture.
    const filles = [
      'extraction', 'sample_item', 'match', 'attribute_result', 'control_test',
      'control_instance', 'request_item', 'reminder', 'signoff', 'workpaper_edit',
      'reconciliation_item', 'fs_tie', 'process_step', 'process_ctrl',
      'interview_transcript', 'transcript_gap',
    ];
    const parTable = new Map<string, string>();
    for (const r of await q<{ tgname: string; relname: string }>(
      `select g.tgname, r.relname from pg_trigger g join pg_class r on r.oid = g.tgrelid
       where g.tgname like '%\\_lock_guard' escape '\\'`)) {
      parTable.set(r.relname, r.tgname);
    }
    const manquantes = filles.filter((t) => parTable.get(t) !== `${t}_lock_guard`);
    expect(manquantes).toEqual([]);
  });
});
