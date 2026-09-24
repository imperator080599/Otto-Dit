import { q, tx } from '@/lib/db/client';
import { sha256, stableStringify } from './hash';
import { verbeConnu, verbeCanonique } from './verbes';

// Immutable, hash-chained event log (docs/04 §8, docs/06 §4). Every state change in the
// system goes through logEvent — services call it in the same logical operation as the
// write. Chain: per engagement (or per tenant for engagement-less events).

export interface EventInput {
  tenantId: string;
  engagementId?: string | null;
  actorKind: 'user' | 'system' | 'ai';
  actorId?: string | null;
  verb: string;
  objectType: string;
  objectId?: string | null;
  payload?: Record<string, unknown>;
}

export async function logEvent(e: EventInput): Promise<void> {
  /* P1-10 (AUD-12) : LE VERBE EST RÉSOLU UNE SEULE FOIS, ICI, AVANT LE HASH ET AVANT
   * L'ÉCRITURE — jamais l'un puis l'autre séparément, sinon la chaîne de hachage et la
   * ligne stockée porteraient CHACUNE une forme différente du même verbe (un alias
   * normalisé pour l'une, brut pour l'autre), et `verifyChain` (plus bas) casserait sur
   * un événement pourtant intact. Un verbe hors du registre ET hors de ses alias est un
   * verbe qui n'a jamais été nommé nulle part — en test, ça lève (le silence d'un
   * troisième spelling qui naît est le défaut que ce registre existe pour empêcher,
   * règle 13) ; en production, un `console.warn` seulement — un dossier réel n'a jamais
   * à perdre son écriture pour une faute d'orthographe côté registre, cette faute-là se
   * corrige au prochain déploiement, pas en bloquant l'auditeur. */
  if (!verbeConnu(e.verb)) {
    const message = `logEvent : verbe « ${e.verb} » absent de VERBES/ALIAS_VERBES (lib/core/verbes.ts) — `
      + `l'ajouter au registre avant de l'utiliser, jamais un verbe deviné au site d'appel.`;
    if (process.env.NODE_ENV === 'test') throw new Error(message);
    console.warn(message);
  }
  const verb = verbeCanonique(e.verb);
  const body = stableStringify({
    verb,
    objectType: e.objectType,
    objectId: e.objectId ?? null,
    payload: e.payload ?? {},
    actorKind: e.actorKind,
    actorId: e.actorId ?? null,
  });
  /* SÉRIALISER LA CHAÎNE (ADR-016.2, DEPLOY.md §1.6). En PGlite, la connexion
     unique sérialise par construction. Sur un Postgres réseau, deux écrivains
     concurrents liraient le même `prev_hash` et FOURCHERAIENT la chaîne — un
     défaut qu'aucun test local ne peut montrer. Le verrou consultatif de
     transaction, pris sur la clé de chaîne (mission, ou locataire pour les
     événements hors mission), rend lecture+insertion atomiques. Il ne coûte
     rien en local et existe dans les deux pilotes. */
  await tx(async (run) => {
    await run(`select pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${e.tenantId}:${e.engagementId ?? ''}`]);
    const prev = (await run(
      `select hash from event_log
       where tenant_id = $1 and engagement_id is not distinct from $2
       order by id desc limit 1`,
      [e.tenantId, e.engagementId ?? null],
    )) as { hash: string }[];
    const prevHash = prev[0]?.hash ?? '';
    const hash = sha256(prevHash + body);
    await run(
      `insert into event_log (tenant_id, engagement_id, actor_kind, actor_id, verb,
         object_type, object_id, payload, prev_hash, hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        e.tenantId,
        e.engagementId ?? null,
        e.actorKind,
        e.actorId ?? null,
        verb,
        e.objectType,
        e.objectId ?? null,
        JSON.stringify(e.payload ?? {}),
        prevHash,
        hash,
      ],
    );
  });
}

/** Verify the hash chain for an engagement (S9 event-log viewer indicator). */
export async function verifyChain(tenantId: string, engagementId: string | null): Promise<{ ok: boolean; count: number; brokenAtId?: number }> {
  const rows = await q<{ id: number; prev_hash: string; hash: string; actor_kind: string; actor_id: string | null; verb: string; object_type: string; object_id: string | null; payload: unknown }>(
    `select id, prev_hash, hash, actor_kind, actor_id, verb, object_type, object_id, payload
     from event_log where tenant_id = $1 and engagement_id is not distinct from $2 order by id`,
    [tenantId, engagementId],
  );
  let prev = '';
  for (const r of rows) {
    const body = stableStringify({
      verb: r.verb,
      objectType: r.object_type,
      objectId: r.object_id,
      payload: r.payload ?? {},
      actorKind: r.actor_kind,
      actorId: r.actor_id,
    });
    if (r.prev_hash !== prev || r.hash !== sha256(prev + body)) {
      return { ok: false, count: rows.length, brokenAtId: r.id };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
