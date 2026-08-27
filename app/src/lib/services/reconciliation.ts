import { q, q01, q1 } from '@/lib/db/client';
import type { ResolutionInput } from './matching';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { numToCents, centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';

// S1 deterministic TB↔GL reconciliation (L0). Per-account diffs, never netted; the
// population gate reads per-FSLI account statuses (Gate 2). Diffs raise typed exceptions.

export async function computeTbGl(engagementId: string, userId: string | null): Promise<{ reconciliationId: string; diffCount: number }> {
  const ctx = await engagementCtx(engagementId);
  const tb = await q<{ number: string; balance: string }>(
    `select a.number, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'`,
    [engagementId],
  );
  if (tb.length === 0) throw new Error('no active current-period TB');
  const gl = await q<{ account_no: string; bal: string }>(
    `select account_no, coalesce(sum(debit - credit), 0)::text as bal
     from gl_entry where engagement_id = $1 and status = 'active' group by account_no`,
    [engagementId],
  );
  if (gl.length === 0) throw new Error('no active GL');

  const glMap = new Map(gl.map((g) => [g.account_no, numToCents(g.bal)]));
  const tbMap = new Map(tb.map((t) => [t.number, numToCents(t.balance)]));
  const accounts = new Set([...glMap.keys(), ...tbMap.keys()]);
  const diffs: { account: string; tbCents: number; glCents: number; delta: number }[] = [];
  for (const acc of [...accounts].sort()) {
    const tbBal = tbMap.get(acc) ?? 0;
    const glBal = glMap.get(acc) ?? 0;
    if (tbBal !== glBal) diffs.push({ account: acc, tbCents: tbBal, glCents: glBal, delta: tbBal - glBal });
  }

  await q(`update reconciliation set status = 'superseded' where engagement_id = $1 and kind = 'tb_gl' and status <> 'superseded'`, [engagementId]);
  const rec = await q1<{ id: string }>(
    `insert into reconciliation (engagement_id, kind, status, summary)
     values ($1, 'tb_gl', $2, $3) returning id`,
    [
      engagementId,
      diffs.length === 0 ? 'clean' : 'differences',
      JSON.stringify({ accounts: accounts.size, diffs: diffs.length, inputHash: hashObject({ tb, gl }) }),
    ],
  );
  for (const d of diffs) {
    const item = await q1<{ id: string }>(
      `insert into reconciliation_item (reconciliation_id, account_no, tb_amount, gl_amount, delta)
       values ($1,$2,$3,$4,$5) returning id`,
      [rec.id, d.account, centsToNum(d.tbCents), centsToNum(d.glCents), centsToNum(d.delta)],
    );
    await q1(
      `insert into exception (engagement_id, taxonomy_code, kind, reconciliation_item_id, severity, description, amount_impact)
       values ($1, 'reconciliation_diff', 'reconciliation', $2, 'high', $3, $4) returning id`,
      [
        engagementId,
        item.id,
        `TB↔GL difference on account ${d.account}: TB ${centsToNum(d.tbCents)} vs GL ${centsToNum(d.glCents)} (Δ ${centsToNum(d.delta)} €)`,
        centsToNum(Math.abs(d.delta)),
      ],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: userId ? 'user' : 'system',
    actorId: userId,
    verb: 'reconciliation_computed',
    objectType: 'reconciliation',
    objectId: rec.id,
    payload: { kind: 'tb_gl', diffs: diffs.length },
  });

  /* LE DRAPEAU « GRAND LIVRE PROVISOIRE » SE LÈVE ICI, ET NULLE PART AILLEURS.
     Il se posait quand un écart de rapprochement ne pouvait être corroboré —
     une écriture ABSENTE du fichier — et il bloque la conclusion définitive.
     Rien ne le levait : le seul moyen d'aller jusqu'à la clôture était de le
     mettre à jour en SQL, ce que le test faisait EN LE DISANT. Un dossier qui
     ne peut se clore que par une écriture directe en base n'est pas un dossier
     qui se clôt : le dernier geste du métier passait à côté du produit.
     La règle est celle qu'un auditeur applique : le fichier définitif arrive,
     on RE-EXÉCUTE le rapprochement, et c'est son résultat — pas une case à
     cocher — qui décide. Propre ⇒ le fichier n'est plus provisoire. Encore
     différent ⇒ il le reste, et le dossier reste bloqué. */
  if (diffs.length === 0) {
    const eng = await q01<{ ledger_is_provisional: boolean }>(
      `select ledger_is_provisional from engagement where id = $1`, [engagementId],
    );
    if (eng?.ledger_is_provisional) {
      await q(
        `update engagement set ledger_is_provisional = false, ledger_provisional_reason = null
         where id = $1`,
        [engagementId],
      );
      await logEvent({
        tenantId: ctx.tenant_id, engagementId,
        actorKind: userId ? 'user' : 'system', actorId: userId,
        verb: 'ledger_no_longer_provisional', objectType: 'reconciliation', objectId: rec.id,
        payload: { accounts: accounts.size, diffs: 0 },
      });
    }
  }
  return { reconciliationId: rec.id, diffCount: diffs.length };
}

export async function latestTbGl(engagementId: string) {
  const rec = await q01<{ id: string; status: string; computed_at: string; summary: { accounts: number; diffs: number } }>(
    `select id, status, computed_at::text, summary from reconciliation
     where engagement_id = $1 and kind = 'tb_gl' and status <> 'superseded'
     order by computed_at desc limit 1`,
    [engagementId],
  );
  if (!rec) return null;
  const items = await q<{ id: string; account_no: string; tb_amount: string; gl_amount: string; delta: string; status: string; note: string | null }>(
    `select id, account_no, tb_amount::text, gl_amount::text, delta::text, status, note
     from reconciliation_item where reconciliation_id = $1 order by account_no`,
    [rec.id],
  );
  return { ...rec, items };
}

/** Closing a reconciliation difference reuses {@link ResolutionInput} verbatim — the same
 *  type as an exception resolution, not a parallel one. 'documented_difference' is what
 *  releases the Gate-2 population gate, so it may not be reachable on a sentence
 *  (migration 0010). */
export async function documentDifference(itemId: string, userId: string, closure: ResolutionInput): Promise<void> {
  if (!closure.explanation?.trim()) throw new Error('the explanation received is required — record it verbatim, not as a summary');
  if (!closure.conclusion?.trim()) throw new Error('an audit conclusion on the explanation is required');
  const evidenceId = closure.corroboration?.evidenceId ?? null;
  const glEntryId = closure.corroboration?.glEntryId ?? null;
  if (!evidenceId && !glEntryId) {
    throw new Error(
      'a reconciliation difference cannot be documented on an explanation alone: link the corroborating evidence or accounting entry (NEP 500)',
    );
  }
  const item = await q1<{ id: string; reconciliation_id: string; account_no: string }>(
    `select id, reconciliation_id, account_no from reconciliation_item where id = $1`,
    [itemId],
  );
  const rec = await q1<{ engagement_id: string }>(`select engagement_id from reconciliation where id = $1`, [item.reconciliation_id]);
  const ctx = await engagementCtx(rec.engagement_id);
  if (evidenceId) {
    const ev = await q1<{ quarantined: boolean }>(`select quarantined from evidence where id = $1`, [evidenceId]);
    if (ev.quarantined) throw new Error('quarantined evidence cannot corroborate a documented difference');
  }
  const note = closure.conclusion;
  await q(
    `update reconciliation_item set status = 'documented_difference', note = $2, client_explanation = $3,
            disposition = $4, corroboration_evidence_id = $5, corroboration_gl_entry_id = $6,
            resolved_by = $7, resolved_at = now()
     where id = $1`,
    [itemId, note, closure.explanation, closure.disposition, evidenceId, glEntryId, userId],
  );
  await q(
    `update exception set status = 'explained', resolution = $2, client_explanation = $3,
            resolved_by = $4, resolved_at = now()
     where reconciliation_item_id = $1 and status = 'open'`,
    [itemId, note, closure.explanation, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: rec.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'reconciliation_difference_documented',
    objectType: 'reconciliation_item',
    objectId: itemId,
    payload: {
      account: item.account_no,
      note,
      disposition: closure.disposition,
      corroboration_evidence_id: evidenceId,
      corroboration_gl_entry_id: glEntryId,
      explanation: closure.explanation.slice(0, 500),
    },
  });
}

/** The third path (migration 0010). Not a closure: nothing corroborates it. A TB/GL
 *  difference caused by an entry that is ABSENT from the ledger has no entry to link and
 *  no document to attach; forcing it into 'documented_difference' is what produced the
 *  one-sentence closures. It records what could not be obtained and what was done instead,
 *  and it is only tolerable while the engagement carries ledger_is_provisional — which
 *  blocks the final conclusion. */
export async function noteReconciliationLimitation(
  itemId: string,
  userId: string,
  input: { explanation: string; alternativeProcedures: string },
): Promise<void> {
  if (!input.explanation?.trim()) throw new Error('record why the difference could not be corroborated, in the client’s words');
  if (!input.alternativeProcedures?.trim()) throw new Error('record what was done instead — a limitation without alternative procedures is an omission');
  const item = await q1<{ id: string; reconciliation_id: string; account_no: string }>(
    `select id, reconciliation_id, account_no from reconciliation_item where id = $1`,
    [itemId],
  );
  const rec = await q1<{ engagement_id: string }>(`select engagement_id from reconciliation where id = $1`, [item.reconciliation_id]);
  const ctx = await engagementCtx(rec.engagement_id);
  await q(
    `update reconciliation_item set status = 'scope_limitation', client_explanation = $2,
            alternative_procedures = $3, note = $3, resolved_by = $4, resolved_at = now()
     where id = $1`,
    [itemId, input.explanation, input.alternativeProcedures, userId],
  );
  await q(
    `update exception set status = 'explained', resolution = $2, client_explanation = $3,
            resolved_by = $4, resolved_at = now()
     where reconciliation_item_id = $1 and status = 'open'`,
    [itemId, input.alternativeProcedures, input.explanation, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: rec.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'reconciliation_scope_limitation',
    objectType: 'reconciliation_item',
    objectId: itemId,
    payload: {
      account: item.account_no,
      explanation: input.explanation.slice(0, 500),
      alternative_procedures: input.alternativeProcedures.slice(0, 500),
    },
  });
}

/** Gate 2 per-FSLI population gate: the FSLI's accounts must each be clean or documented. */
export async function fsliRecoGate(engagementId: string, accountNos: string[]): Promise<{ ok: boolean; blocking: string[] }> {
  const latest = await latestTbGl(engagementId);
  if (!latest) return { ok: false, blocking: ['no reconciliation computed yet'] };
  const set = new Set(accountNos);
  const blocking = latest.items.filter((i) => set.has(i.account_no) && i.status === 'open').map((i) => i.account_no);
  return { ok: blocking.length === 0, blocking };
}
