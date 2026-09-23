import { getDb, closeDb } from '../src/lib/db/client';
import { hashObject } from '../src/lib/core/hash';
import { logEvent } from '../src/lib/core/events';

// P1-04 (AUD-05/AUD-09, migration 0176) — backfill PONCTUEL, jamais partie de migrate().
//
// `signoff.sections_hash` n'existe pas pour les lignes ANTÉRIEURES à cette migration —
// `migrate()` n'exécute que des fichiers .sql (aucune capacité TypeScript-après-SQL dans ce
// dépôt aujourd'hui, voir l'en-tête de 0176_visa.sql). Ce script porte le backfill que le plan
// demande : « empreinte courante » (le hash de `workpaper.sections` TEL QU'IL EST AUJOURD'HUI,
// pas tel qu'il était au moment du visa d'origine — cette distinction n'est plus mesurable pour
// les lignes déjà écrites) + une ligne `event_log` nommée `signoff.hash_backfill` par ligne
// touchée, pour que la provenance de la valeur reste honnête (une empreinte rétroactive, jamais
// confondue avec une empreinte posée au moment réel du visa).
//
// LANCÉ UNE FOIS, MANUELLEMENT, sur la base réseau, APRÈS que la migration 0176 y soit appliquée
// (jamais avant : sections_hash n'existerait pas encore) — jamais sur `db:reset` local, où
// `signWorkpaper` (désormais) pose sections_hash pour CHAQUE nouveau visa, y compris ceux du
// semeur : un monde reconstruit de zéro n'a donc RIEN à backfiller.

async function main() {
  const db = await getDb();
  const rows = await db.query<{ id: string; workpaper_id: string; sections: unknown; engagement_id: string; tenant_id: string }>(
    `select s.id, s.workpaper_id, w.sections, w.engagement_id, e.tenant_id
     from signoff s
     join workpaper w on w.id = s.workpaper_id
     join engagement e on e.id = w.engagement_id
     where s.sections_hash is null`,
  );
  console.log(`backfill-signoff-hash : ${rows.rows.length} ligne(s) signoff sans sections_hash`);
  let touchees = 0;
  for (const r of rows.rows) {
    const h = hashObject(r.sections);
    await db.query(`update signoff set sections_hash = $2 where id = $1`, [r.id, h]);
    await logEvent({
      tenantId: r.tenant_id, engagementId: r.engagement_id, actorKind: 'system', actorId: null,
      verb: 'signoff.hash_backfill', objectType: 'signoff', objectId: r.id,
      payload: { sections_hash: h, note: 'empreinte courante, posée rétroactivement (migration 0176)' },
    });
    touchees++;
  }
  console.log(`backfill-signoff-hash : ${touchees} ligne(s) backfillée(s), event_log signoff.hash_backfill posé pour chacune`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
