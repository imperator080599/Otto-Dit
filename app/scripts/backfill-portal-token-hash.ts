import { getDb, closeDb } from '../src/lib/db/client';
import { hacherJetonPortail } from '../src/lib/core/jeton-portail';
import { logEvent } from '../src/lib/core/events';

// P2-03b (AUD-07, migration 0183) — backfill PONCTUEL, jamais partie de migrate().
//
// `client_contact.portal_token_hash` n'existe pas pour les lignes ANTÉRIEURES à
// cette migration — `migrate()` n'exécute que des fichiers .sql (aucune capacité
// TypeScript-après-SQL dans ce dépôt aujourd'hui, même limite que
// `backfill-signoff-hash.ts`, 0176). Ce script calcule le hachage à partir du
// jeton EN CLAIR encore présent (`portal_token`, conservé jusqu'en Phase 7 par
// le plan) et pose une ligne `event_log` nommée `contact.portal_token_hash_backfill`
// par ligne touchée.
//
// LANCÉ UNE FOIS, MANUELLEMENT, sur une base PERSISTANTE qui porterait encore des
// lignes `portal_token_hash is null` — JAMAIS sur `db:reset` local ni sur la
// démonstration publique (reconstruite à chaque déploiement, ADR-109) : `lib/
// seed.ts` pose désormais `portal_token_hash` pour CHAQUE contact qu'il crée,
// donc un monde reconstruit de zéro n'a RIEN à backfiller — ce script est un
// filet pour l'exception, pas le chemin attendu de ce dépôt.

async function main() {
  const db = await getDb();
  const rows = await db.query<{ id: string; portal_token: string; entity_id: string; tenant_id: string }>(
    `select c.id, c.portal_token, c.entity_id, e.tenant_id
     from client_contact c
     join entity e on e.id = c.entity_id
     where c.portal_token_hash is null`,
  );
  console.log(`backfill-portal-token-hash : ${rows.rows.length} ligne(s) client_contact sans portal_token_hash`);
  let touchees = 0;
  for (const r of rows.rows) {
    const hash = hacherJetonPortail(r.portal_token);
    await db.query(`update client_contact set portal_token_hash = $2 where id = $1`, [r.id, hash]);
    await logEvent({
      tenantId: r.tenant_id, engagementId: null, actorKind: 'system', actorId: null,
      verb: 'contact.portal_token_hash_backfill', objectType: 'client_contact', objectId: r.id,
      payload: { note: 'hachage posé rétroactivement à partir du jeton en clair existant (migration 0183)' },
    });
    touchees++;
  }
  console.log(`backfill-portal-token-hash : ${touchees} ligne(s) backfillée(s), event_log contact.portal_token_hash_backfill posé pour chacune`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
