import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { getAccountingMap } from '@/lib/packs';
import { mapAccount } from '@/lib/kernel/fsli-map';
import type { CoaMapRule } from '@/lib/packs/types';
import { numToCents, centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { assertMembre } from '@/lib/core/membre';

// S1/S2: account→FSLI mapping (pack default + engagement overrides) and FSLI scoping
// with propose-and-confirm NS statuses (D9 — never silently descoped).

export async function frameworkSet(engagementId: string): Promise<{ assurance_packs: string[]; accounting_map: string; language: 'fr' | 'en' }> {
  const row = await q1<{ framework_set: { assurance_packs: string[]; accounting_map: string; language: 'fr' | 'en' } }>(
    `select framework_set from engagement where id = $1`,
    [engagementId],
  );
  return row.framework_set;
}

export async function engagementRules(engagementId: string): Promise<CoaMapRule[]> {
  const fs = await frameworkSet(engagementId);
  const map = getAccountingMap(fs.accounting_map);
  const overrides = await q<{ account_prefix: string; fsli_code: string; priority: number }>(
    `select account_prefix, fsli_code, priority from coa_map_rule where engagement_id = $1`,
    [engagementId],
  );
  return [
    ...map.rules,
    ...overrides.map((o) => ({ prefix: o.account_prefix, fsli: o.fsli_code, priority: 1000 + o.account_prefix.length })),
  ];
}

/** Rebuild FSLI rows from the active current TB. Preserves confirmed scoping decisions. */
export async function rebuildFslis(engagementId: string, userId: string | null): Promise<void> {
  await assertMembre(engagementId, userId, 'rebuildFslis');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const map = getAccountingMap(fs.accounting_map);
  const rules = await engagementRules(engagementId);
  const accounts = await q<{ number: string; balance: string }>(
    `select a.number, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'`,
    [engagementId],
  );
  const balances = new Map<string, number>();
  for (const a of accounts) {
    const f = mapAccount(a.number, rules);
    if (!f) continue;
    balances.set(f, (balances.get(f) ?? 0) + numToCents(a.balance));
  }
  const existing = await q<{ code: string; scoping: string; scoping_basis: string | null; confirmed_by: string | null }>(
    `select code, scoping, scoping_basis, confirmed_by from fsli where engagement_id = $1`,
    [engagementId],
  );
  const keep = new Map(existing.map((e) => [e.code, e]));
  await q(`delete from fsli where engagement_id = $1`, [engagementId]);
  for (const def of map.fslis) {
    const bal = balances.get(def.code) ?? 0;
    if (bal === 0 && !keep.has(def.code)) continue;
    const prev = keep.get(def.code);
    await q(
      `insert into fsli (engagement_id, code, name, statement, balance, scoping, scoping_basis, confirmed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        engagementId,
        def.code,
        def.name[fs.language],
        def.statement,
        centsToNum(bal),
        prev?.confirmed_by ? prev.scoping : 'unscoped',
        prev?.confirmed_by ? prev.scoping_basis : null,
        prev?.confirmed_by ?? null,
      ],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: userId ? 'user' : 'system',
    actorId: userId,
    verb: 'fslis_rebuilt',
    objectType: 'fsli',
    payload: { count: balances.size },
  });
}

/** Propose scoping: |balance| < performance materiality ⇒ ns_proposed; else in_scope
 *  (still to confirm — D9). CTT governs misstatement accumulation, not scoping. */
export async function proposeScoping(engagementId: string, userId: string): Promise<void> {
  await assertMembre(engagementId, userId, 'proposeScoping');
  const ctx = await engagementCtx(engagementId);
  const mat = await q01<{ perf_amount: string }>(
    `select perf_amount::text from materiality where engagement_id = $1 and status = 'validated'
     order by version desc limit 1`,
    [engagementId],
  );
  if (!mat) throw new Error('validated materiality required before scoping (L3 order)');
  const ctt = numToCents(mat.perf_amount);
  const fslis = await q<{ id: string; code: string; balance: string; confirmed_by: string | null }>(
    `select id, code, balance::text, confirmed_by from fsli where engagement_id = $1`,
    [engagementId],
  );
  for (const f of fslis) {
    if (f.confirmed_by) continue; // human decisions are never overwritten (D9)
    const proposed = Math.abs(numToCents(f.balance)) < ctt ? 'ns_proposed' : 'in_scope';
    await q(
      `update fsli set scoping = $2, scoping_basis = $3 where id = $1`,
      [f.id, proposed, proposed === 'ns_proposed' ? `|balance| < performance materiality (${mat.perf_amount} €) — proposed NS, to confirm` : 'above performance materiality — in scope'],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: 'system',
    actorId: null,
    verb: 'scoping_proposed',
    objectType: 'fsli',
    payload: { thresholdCents: ctt, requestedBy: userId },
  });
}

/**
 * LE DRAPEAU DE BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1 — migration 0156).
 *
 * « Voir si on a loupé du testing » : le cas qui compte n'est PAS celui que `proposeScoping`
 * corrige déjà tout seul (un FSLI système, jamais confirmé, dont le solde franchit le seuil — il
 * passe `in_scope` de lui-même au prochain appel). Le cas qui compte est celui qu'un HUMAIN a
 * confirmé non matériel une année, et dont le solde dépasse la matérialité de performance CETTE
 * année après un nouvel import — `proposeScoping` ne le touchera JAMAIS (D9, `confirmed_by`
 * posé). Cette fonction compare donc le SOLDE COURANT à la matérialité VALIDÉE pour TOUT FSLI dont
 * le `scoping` reste non matériel, système ou humain confondus — jamais seulement ceux que
 * `proposeScoping` vient de faire basculer.
 *
 * PREMIER IMPORT QUI FRANCHIT LE SEUIL GAGNE (`unique (engagement_id, fsli_code)`, migration
 * 0156) : un ré-import ultérieur ne pose pas une seconde ligne. Le drapeau, une fois posé, ne se
 * retire JAMAIS (règle 28) — il reste le dossier permanent « ce jour-là, ce poste a basculé »,
 * même si un humain confirme ensuite le poste en scope.
 *
 * §2.2 (mandat 2026-09-09) : LE MÊME IMPORT OUVRE AUSSI LA SECTION. Un poste `ns_confirmed`
 * (D9) n'entre JAMAIS dans `postesRetenus` (rail.ts : `scoping in ('in_scope',
 * 'in_scope_qualitative')` seulement) — donc `assurerSections` (sections.ts) ne lui crée jamais
 * de `section_state`, et son dossier (leadsheet, revue analytique, et tout le reste de
 * `/poste/[code]`) reste invisible du tableau de bord, du suivi et du kanban, même après la
 * bascule. Même insertion que `assurerSections` (même table, même `on conflict`), posée ici
 * indépendamment de `scoping` — cette fonction n'écrit JAMAIS `fsli.scoping` lui-même (D9 reste
 * entier : la décision humaine ne bouge pas), elle rend seulement le dossier du poste ATTEIGNABLE.
 * §2.3 (mandat 2026-09-09) : LE MÊME IMPORT CRÉE AUSSI LA DEMANDE DE DÉTAIL, mais SEULEMENT pour
 * les comptes du poste dont le solde absolu ATTEINT OU DÉPASSE le CTT (`materiality.ctt_amount`,
 * PAS le seuil de performance qui a servi à détecter la bascule elle-même — deux seuils distincts,
 * `materiality.ts`). `requests.ts::demanderDetailAuDessusDuCtt` est une fonction DISTINCTE de
 * `demanderDetailDeCompte` (Partie B, étape 1, déjà testée, déjà utilisée par `/sampling` sur TOUT
 * le poste) — ce comportement existant ne change pas ici. Importée dynamiquement (comme
 * `obstacles.ts`/`matching.ts` le font déjà ailleurs dans ce dépôt) : `requests.ts` importe déjà
 * `frameworkSet`/`fsliAccounts` DEPUIS ce fichier, un import statique en sens inverse créerait un
 * cycle. Si aucun compte n’atteint le CTT, aucune demande n'est créée — ce n'est pas une erreur
 * (un poste peut devenir matériel par somme de petits comptes, chacun sous le CTT).
 * CE QUE CETTE FONCTION NE FAIT PAS (règle 19) : elle n'implémente aucun refus (MAT-01/02/03,
 * tranche suivante) — un poste devenu matériel sans section ouverte ou sans demande de détail ne
 * bloque encore rien au visa.
 */
export async function detecterBasculesMaterialite(
  engagementId: string, importFileId: string, userId: string | null,
): Promise<{ fsliCode: string }[]> {
  /* GARDE D'ÉTANCHÉITÉ (ETANCH-01/03) — trouvée MANQUANTE par le verify complet du
     2026-09-09 (`couverture-etancheite.test.ts`, `etancheite-executee.test.ts`), pas devinée :
     appeler cette fonction depuis `uploadTbAction` la protège déjà indirectement (`importTb`,
     `rebuildFslis` gardent AVANT elle sur la même requête) — mais chaque fonction de service
     prenant un ACTEUR se garde ELLE-MÊME, en défense en profondeur, jamais seulement par le
     contexte de son appelant. `assertMembre` ne fait rien si `userId` est `null` (le cas système,
     `detecterBasculesMaterialite(id, fichier, null)`), exactement le même contrat que
     `proposeScoping`/`confirmScoping` juste au-dessus. */
  await assertMembre(engagementId, userId, 'détecter les bascules de matérialité');
  const ctx = await engagementCtx(engagementId);
  const mat = await q01<{ perf_amount: string; ctt_amount: string }>(
    `select perf_amount::text, ctt_amount::text from materiality
     where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
    [engagementId],
  );
  if (!mat) return []; // aucune matérialité validée pour l'instant : rien à comparer, pas une erreur
  const seuil = numToCents(mat.perf_amount);
  const ctt = numToCents(mat.ctt_amount);
  const candidats = await q<{ code: string; name: string; balance: string; scoping: string }>(
    `select code, name, balance::text, scoping from fsli
     where engagement_id = $1 and scoping in ('unscoped', 'ns_proposed', 'ns_confirmed')`,
    [engagementId],
  );
  const bascules: { fsliCode: string }[] = [];
  for (const f of candidats) {
    if (Math.abs(numToCents(f.balance)) < seuil) continue;
    /* `q01`, PAS `q1` (revue hostile, deux voix indépendantes, même constat) : `q1` lève une
       erreur GÉNÉRIQUE sur zéro ligne — indiscernable entre « conflit, déjà flaggé » (le cas
       normal ici) et une VRAIE panne SQL sur cet insert précis (FK cassée, etc.). Un `.catch(() =>
       null)` derrière `q1` aurait avalé les deux de la même façon : un refus calculé puis jeté
       (règle 13). `q01` rend `null` UNIQUEMENT sur zéro ligne, sans jamais lever — une vraie
       erreur continue de se propager normalement, sans catch à ajouter ici. */
    const pose = await q01<{ id: string }>(
      `insert into fsli_materiality_bascule
         (engagement_id, fsli_code, import_file_id, scoping_avant, solde, seuil_performance)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (engagement_id, fsli_code) do nothing
       returning id`,
      [engagementId, f.code, importFileId, f.scoping, f.balance, mat.perf_amount],
    );
    if (!pose) continue; // déjà flaggé par un import antérieur — premier gagne
    bascules.push({ fsliCode: f.code });
    /* §2.2 : MÊME insertion que `assurerSections` pour un poste (sections.ts) — la section devient
       ATTEIGNABLE (tableau de bord, suivi, kanban) sans jamais toucher `fsli.scoping`. */
    await q(
      `insert into section_state (engagement_id, kind, ref, label)
       values ($1, 'poste', $2, $3)
       on conflict (engagement_id, kind, ref) do update set label = excluded.label`,
      [engagementId, f.code, f.name],
    );
    /* §2.3 : import dynamique — voir le commentaire d'en-tête de cette fonction (cycle
       fsli.ts ↔ requests.ts). `userId` propagé tel quel : `demanderDetailAuDessusDuCtt` porte sa
       propre garde `assertMembre`, no-op sur `null` (le cas système, `bootstrapNep`).
       TRY/CATCH TROUVÉ PAR LA REVUE HOSTILE (constat 1) : sans lui, la seule levée prévue de
       `demanderDetailAuDessusDuCtt` (poste absent du catalogue du pack — ne devrait jamais
       arriver) aurait fait sortir CETTE fonction en erreur, avortant l'évaluation de TOUS les
       candidats restants de la boucle en silence — alors que le drapeau et la section de CE
       poste, eux, sont déjà bien posés ci-dessus et doivent le rester (règle 28). Consignée dans
       `event_log`, jamais avalée sans trace (règle 13) : une vraie panne reste visible et
       rejouable, seulement plus loin que ce poste-là. */
    try {
      const { demanderDetailAuDessusDuCtt } = await import('./requests');
      await demanderDetailAuDessusDuCtt(engagementId, f.code, ctt, userId);
    } catch (e) {
      await logEvent({
        tenantId: ctx.tenant_id, engagementId, actorKind: userId ? 'user' : 'system', actorId: userId,
        verb: 'detail_de_compte_ctt_echec', objectType: 'fsli', objectId: f.code,
        payload: { fsliCode: f.code, erreur: e instanceof Error ? e.message : String(e) },
      });
    }
    await logEvent({
      tenantId: ctx.tenant_id, engagementId, actorKind: userId ? 'user' : 'system', actorId: userId,
      verb: 'materialite_basculee', objectType: 'fsli', objectId: f.code,
      payload: { fsliCode: f.code, scopingAvant: f.scoping, solde: f.balance, seuilPerformance: mat.perf_amount, importFileId },
    });
  }
  return bascules;
}

/** Les bascules non résolues du dossier — celles dont le FSLI reste non matériel dans le champ
 *  `scoping` (un humain a pu confirmer entre-temps ; alors l'obstacle qu'elles portaient n'a plus
 *  lieu d'être compté, même si la ligne historique reste, elle, permanente — règle 28). */
export async function basculesMaterialite(engagementId: string) {
  return q<{
    fsliCode: string; fsliName: string | null; importFilename: string; detecteeLe: string;
    solde: string; seuilPerformance: string; procedureCount: string;
  }>(
    `select b.fsli_code "fsliCode", f.name "fsliName", i.filename "importFilename", b.detectee_le::text "detecteeLe",
            b.solde::text, b.seuil_performance::text "seuilPerformance",
            (select count(*)::text from procedure_instance p where p.engagement_id = b.engagement_id and p.fsli_code = b.fsli_code) "procedureCount"
     from fsli_materiality_bascule b
     left join fsli f on f.engagement_id = b.engagement_id and f.code = b.fsli_code
     join import_file i on i.id = b.import_file_id
     where b.engagement_id = $1 and (f.scoping is null or f.scoping in ('unscoped', 'ns_proposed', 'ns_confirmed'))
     order by b.detectee_le`,
    [engagementId],
  );
}

export async function confirmScoping(
  fsliId: string,
  userId: string,
  decision: 'ns_confirmed' | 'in_scope' | 'in_scope_qualitative',
  basis?: string,
): Promise<void> {
  const f = await q1<{ id: string; engagement_id: string; code: string; scoping: string }>(
    `select id, engagement_id, code, scoping from fsli where id = $1`,
    [fsliId],
  );
  await assertMembre(f.engagement_id, userId, 'statuer le périmètre d’un poste');
  if (decision === 'in_scope_qualitative' && !basis?.trim()) {
    throw new Error('qualitative in-scope override requires a written basis');
  }
  const ctx = await engagementCtx(f.engagement_id);
  await q(
    `update fsli set scoping = $2, scoping_basis = coalesce($3, scoping_basis), confirmed_by = $4, confirmed_at = now() where id = $1`,
    [fsliId, decision, basis ?? null, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: f.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'scoping_confirmed',
    objectType: 'fsli',
    objectId: fsliId,
    payload: { code: f.code, from: f.scoping, to: decision, basis },
  });
}

export async function listFslis(engagementId: string) {
  return q<{ id: string; code: string; name: string; statement: string; balance: string; scoping: string; scoping_basis: string | null; confirmed_by: string | null }>(
    `select id, code, name, statement, balance::text, scoping, scoping_basis, confirmed_by
     from fsli where engagement_id = $1 order by statement, code`,
    [engagementId],
  );
}

/** Accounts composing one FSLI under current rules (per-section lead sheet + gates). */
export async function fsliAccounts(engagementId: string, fsliCode: string): Promise<{ number: string; label: string; balanceCents: number }[]> {
  const rules = await engagementRules(engagementId);
  const accounts = await q<{ number: string; label: string; balance: string }>(
    `select a.number, a.label, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'
     order by a.number`,
    [engagementId],
  );
  return accounts
    .filter((a) => mapAccount(a.number, rules) === fsliCode)
    .map((a) => ({ number: a.number, label: a.label, balanceCents: numToCents(a.balance) }));
}

export async function addMappingOverride(engagementId: string, userId: string, prefix: string, fsliCode: string): Promise<void> {
  await assertMembre(engagementId, userId, 'addMappingOverride');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  await q(
    `insert into coa_map_rule (pack_id, engagement_id, account_prefix, fsli_code, priority) values ($1,$2,$3,$4,$5)`,
    [fs.accounting_map, engagementId, prefix, fsliCode, 1000 + prefix.length],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: userId,
    verb: 'coa_override_added',
    objectType: 'coa_map_rule',
    payload: { prefix, fsliCode },
  });
  await rebuildFslis(engagementId, userId);
}
