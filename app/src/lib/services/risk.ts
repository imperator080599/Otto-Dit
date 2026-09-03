// Le risque par assertion — et le fait qu'il COMMANDE.
//
// C'est le chaînon manquant entre le scoping et les travaux. Un risque qui
// s'écrit puis qu'on oublie décore ; ici il décide de DEUX choses, et les deux
// se vérifient à l'écran :
//
//     risque(assertion)  →  liste des procédures requises
//     risque(assertion)  →  taille du sondage de CETTE procédure
//
// LA TAILLE SUIT L'ASSERTION TESTÉE, jamais le risque le plus élevé du poste :
// une procédure répond à UNE assertion. Appliquer le maximum du poste revient à
// traiter la séparation des exercices comme l'exhaustivité sous prétexte
// qu'elles partagent un compte. Une section porte donc des échantillons de
// tailles différentes — c'est la conséquence normale.
//
// FRONTIÈRE (ADR-050, étendue ici) : la méthode NOMME un prédicat, le code SAIT
// le calculer. Un prédicat nommé que personne n'implémente arrête l'assemblage
// — sans quoi le facteur serait silencieusement toujours inactif, le risque
// sous-évalué, l'étendue réduite, et rien ne le dirait.

import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { assertAccepte } from './acceptance';
import { proceduresDuCycle, rangNiveau } from '@/lib/methodology/catalogue';
import type { Catalogue, Procedure } from '@/lib/methodology/types';
import { engagementContext } from './team';
import { declaredFactorsFor } from './questionnaire';
import { numToCents } from '@/lib/util/num';
import { engagementRules } from './fsli';
import { mapAccount } from '@/lib/kernel/fsli-map';
import { assertMembre } from '@/lib/core/membre';

export class RiskRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiskRuleError';
  }
}

export type Level = string; // les niveaux viennent de la méthode, pas du code

/* ── ce que les prédicats ont besoin de savoir ──────────────────────────── */

interface Facts {
  balanceCents: number;
  priorBalanceCents: number | null;
  performanceMaterialityCents: number | null;
  entries: number;
  odEntries: number;
  lateEntries: number;
  lastMonthEntries: number;
  periodEnd: string;
}

/** Un prédicat rend s'il est actif ET la mesure qui le dit, en toutes lettres. */
type Predicate = (f: Facts, p: Record<string, unknown>) => { active: boolean; evidence: string };

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);
const eur = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(cents / 100);

/**
 * Les prédicats. Chacun DIT ce qu'il a mesuré : « 1 254 écritures », jamais
 * « vrai ». Sans la mesure, on ne peut pas relire un niveau six mois plus tard
 * sans rejouer le calcul — et une preuve qu'il faut recalculer n'est pas une
 * preuve.
 */
export const PREDICATES: Record<string, Predicate> = {
  variation_n_n1_au_dessus_du_seuil(f) {
    if (f.priorBalanceCents === null || f.performanceMaterialityCents === null) {
      return {
        active: false,
        evidence: f.priorBalanceCents === null
          ? 'balance N-1 absente — facteur non évaluable, jamais supposé actif'
          : 'seuil de planification non arrêté — facteur non évaluable',
      };
    }
    const delta = Math.abs(f.balanceCents - f.priorBalanceCents);
    return {
      active: delta >= f.performanceMaterialityCents,
      evidence: `variation ${eur(delta)} · seuil de planification ${eur(f.performanceMaterialityCents)}`,
    };
  },
  nombre_ecritures_au_dessus_de(f, p) {
    const seuil = Number(p.seuil ?? 0);
    return { active: f.entries > seuil, evidence: `${f.entries} écritures (seuil ${seuil})` };
  },
  part_journal_od_au_dessus_de(f, p) {
    const part = Number(p.part ?? 0);
    return {
      active: f.entries > 0 && f.odEntries / f.entries > part,
      evidence: `${f.odEntries} écritures d’OD sur ${f.entries} — ${pct(f.odEntries, f.entries).toFixed(1)} % (seuil ${(part * 100).toFixed(0)} %)`,
    };
  },
  ecritures_validees_apres_cloture(f) {
    return {
      active: f.lateEntries > 0,
      evidence: `${f.lateEntries} écriture(s) validée(s) après le ${f.periodEnd}`,
    };
  },
  part_dernier_mois_au_dessus_de(f, p) {
    const part = Number(p.part ?? 0);
    return {
      active: f.entries > 0 && f.lastMonthEntries / f.entries > part,
      evidence: `${f.lastMonthEntries} écritures sur le dernier mois, sur ${f.entries} — ${pct(f.lastMonthEntries, f.entries).toFixed(1)} % (seuil ${(part * 100).toFixed(0)} %)`,
    };
  },
};

/**
 * Le garde-fou de la frontière : tout prédicat nommé par la méthode doit être
 * implémenté ici, et réciproquement. On le vérifie au chargement plutôt qu'à
 * l'exécution — un facteur silencieusement inactif ne se voit sur aucun écran.
 */
export function assertPredicatesImplemented(cat: Catalogue): void {
  const missing = cat.risque.predicats.filter((p) => !PREDICATES[p]);
  if (missing.length) {
    throw new RiskRuleError(
      `prédicat(s) de facteur nommé(s) par la méthode et non implémenté(s) : ${missing.join(', ')}`,
    );
  }
  const orphans = Object.keys(PREDICATES).filter((p) => !cat.risque.predicats.includes(p));
  if (orphans.length) {
    throw new RiskRuleError(
      `prédicat(s) implémenté(s) mais absent(s) de l’énumération du schéma : ${orphans.join(', ')}`,
    );
  }
}

/* ── les faits, lus une fois par poste ──────────────────────────────────── */

async function factsFor(engagementId: string, fsliCode: string): Promise<Facts> {
  const fsli = await q1<{ balance: string }>(
    `select balance::text from fsli where engagement_id = $1 and code = $2`,
    [engagementId, fsliCode],
  );
  const period = await q1<{ end_date: string }>(
    `select p.end_date::text as end_date from engagement e
     join period p on p.id = e.period_id where e.id = $1`,
    [engagementId],
  );

  // Le solde N-1 se recompose par le MÊME mappage de comptes que le solde N :
  // deux mappages divergents feraient une variation fantôme.
  const rules = await engagementRules(engagementId);
  const prior = await q<{ number: string; balance: string }>(
    `select a.number, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'prior' and s.status = 'active'`,
    [engagementId],
  );
  const priorBalanceCents = prior.length
    ? prior.filter((a) => mapAccount(a.number, rules) === fsliCode)
        .reduce((t, a) => t + numToCents(a.balance), 0)
    : null;

  const mat = await q01<{ perf_amount: string }>(
    `select perf_amount::text from materiality
     where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
    [engagementId],
  );

  const accounts = (await q<{ number: string }>(
    `select a.number from account a join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active'`,
    [engagementId],
  ))
    .filter((a) => mapAccount(a.number, rules) === fsliCode)
    .map((a) => a.number);

  const stats = accounts.length
    ? await q1<{ n: string; od: string; late: string; last_month: string }>(
        `select count(*)::text as n,
                count(*) filter (where journal_code = 'OD')::text as od,
                count(*) filter (where valid_date is not null and valid_date > $3::date)::text as late,
                count(*) filter (where entry_date >= date_trunc('month', $3::date))::text as last_month
         from gl_entry
         where engagement_id = $1 and account_no = any($2)
           and not exists (select 1 from gl_entry_supersession x where x.old_gl_entry_id = gl_entry.id)`,
        [engagementId, accounts, period.end_date],
      )
    : { n: '0', od: '0', late: '0', last_month: '0' };

  return {
    balanceCents: numToCents(fsli.balance),
    priorBalanceCents,
    performanceMaterialityCents: mat ? numToCents(mat.perf_amount) : null,
    entries: Number(stats.n),
    odEntries: Number(stats.od),
    lateEntries: Number(stats.late),
    lastMonthEntries: Number(stats.last_month),
    periodEnd: period.end_date,
  };
}

/* ── l'échelle : combien de facteurs font quel niveau ────────────────────── */

export function levelForCount(cat: Catalogue, n: number): Level {
  const applicable = cat.risque.paliers
    .filter((p) => n >= p.facteurs_min)
    .sort((a, b) => b.facteurs_min - a.facteurs_min)[0];
  if (!applicable) throw new RiskRuleError(`aucun palier de l’échelle ne couvre ${n} facteur(s)`);
  return applicable.niveau;
}

/** Le rang d'un niveau. Une seule implémentation dans le dépôt : celle du
 *  chargeur de méthode. La dupliquer ici la ferait diverger le jour où un
 *  cabinet change d'échelle. */
export function rank(cat: Catalogue, level: Level): number {
  try {
    return rangNiveau(cat, level);
  } catch (e) {
    throw new RiskRuleError(e instanceof Error ? e.message : String(e));
  }
}

/* ── évaluer un poste ────────────────────────────────────────────────────── */

export interface AssertionRisk {
  fsli_code: string;
  assertion: string;
  computed_level: Level;
  factor_count: number;
  retained_level: Level | null;
  override_reason: string | null;
  decided_by: string | null;
  /** Le niveau qui COMMANDE : la décision si elle existe, sinon le calcul. */
  level: Level;
  factors: { factor_code: string; label: string; evidence: string }[];
}

/**
 * Re-dérive les facteurs observés et les niveaux calculés d'un poste.
 *
 * Les décisions humaines (`retained_level`) sont CONSERVÉES : bouger la
 * matérialité ou ré-importer un fichier ne doit jamais effacer un arbitrage.
 * C'est la même règle que le scoping confirmé qui survit à un ré-import.
 */
export async function assessFsli(
  engagementId: string,
  fsliCode: string,
  actorUserId: string | null,
): Promise<AssertionRisk[]> {
  /* Évaluer le risque, c'est planifier des travaux. Une mission non acceptée
     n'en planifie aucun : le système refuse, il ne rappelle pas. */
  await assertMembre(engagementId, actorUserId, 'évaluer le risque d’un poste');
  await assertAccepte(engagementId);
  const cat = await catalogueDeLaMission(engagementId);
  assertPredicatesImplemented(cat);
  const eng = await engagementContext(engagementId);
  const facts = await factsFor(engagementId, fsliCode);

  const active = new Map<string, { factor_code: string; label: string; evidence: string; predicate: string }[]>();
  /* LES FACTEURS DÉCLARÉS COMPTENT COMME LES OBSERVÉS.
     C'est ici que la circulation produit son EFFET plutôt qu'un affichage : une
     constatation confirmée qui vise (ce poste, cette assertion) pèse sur le
     niveau au même titre qu'un fait calculé. Sans cela, le registre serait une
     liste qu'on lit, et le risque resterait à 100 % quantitatif. */
  for (const d of await declaredFactorsFor(engagementId, fsliCode)) {
    const list = active.get(d.assertion) ?? [];
    list.push({
      factor_code: `${d.source}:${d.source_ref ?? '—'}`,
      label: d.description,
      evidence: `déclaré · ${cat.questionnaire.naturesRi[d.nature]?.libelle ?? d.nature}`
        + (d.source_ref ? ` · source ${d.source_ref}` : ''),
      predicate: 'declare',
    });
    active.set(d.assertion, list);
  }
  await q(`delete from risk_factor_observed where engagement_id = $1 and fsli_code = $2`, [engagementId, fsliCode]);
  for (const f of cat.risque.facteurs) {
    const fn = PREDICATES[f.predicat];
    const { active: on, evidence } = fn(facts, f.parametres);
    if (!on) continue;
    const list = active.get(f.assertion) ?? [];
    list.push({ factor_code: f.code, label: f.libelle, evidence, predicate: f.predicat });
    active.set(f.assertion, list);
    await q(
      `insert into risk_factor_observed
         (engagement_id, fsli_code, assertion, factor_code, label, evidence, predicate)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [engagementId, fsliCode, f.assertion, f.code, f.libelle, evidence, f.predicat],
    );
  }

  const assertions = new Set<string>([
    ...cat.risque.facteurs.map((f) => f.assertion),
    ...cat.questionnaire.questions.map((x) => x.assertion),
    ...cat.procedures.map((p) => p.assertion),
    ...active.keys(),
  ]);
  const out: AssertionRisk[] = [];
  for (const a of [...assertions].sort()) {
    const factors = active.get(a) ?? [];
    const computed = levelForCount(cat, factors.length);
    const existing = await q01<{ retained_level: string | null; override_reason: string | null; decided_by: string | null }>(
      `select retained_level, override_reason, decided_by from fsli_assertion_risk
       where engagement_id = $1 and fsli_code = $2 and assertion = $3`,
      [engagementId, fsliCode, a],
    );
    /* La décision survit au recalcul — mais si elle a rejoint le calcul, on la
       range : un « retenu » égal au calculé n'est plus une surcharge, et
       l'afficher comme telle ferait croire à un arbitrage qui n'existe plus. */
    const retained = existing?.retained_level === computed ? null : existing?.retained_level ?? null;
    await q(
      `insert into fsli_assertion_risk
         (engagement_id, fsli_code, assertion, computed_level, factor_count,
          retained_level, override_reason, decided_by, decided_at, methodology_version, computed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,
               case when $6::text is null then null else now() end, $9, now())
       on conflict (engagement_id, fsli_code, assertion) do update set
         computed_level = excluded.computed_level,
         factor_count = excluded.factor_count,
         retained_level = excluded.retained_level,
         override_reason = case when excluded.retained_level is null then null else fsli_assertion_risk.override_reason end,
         methodology_version = excluded.methodology_version,
         computed_at = now()`,
      [engagementId, fsliCode, a, computed, factors.length,
       retained, retained === null ? null : existing?.override_reason ?? null,
       retained === null ? null : existing?.decided_by ?? null, cat.risque.version],
    );
    out.push({
      fsli_code: fsliCode, assertion: a, computed_level: computed, factor_count: factors.length,
      retained_level: retained, override_reason: retained === null ? null : existing?.override_reason ?? null,
      decided_by: retained === null ? null : existing?.decided_by ?? null,
      level: retained ?? computed,
      factors: factors.map(({ factor_code, label, evidence }) => ({ factor_code, label, evidence })),
    });
  }
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId,
    actorKind: actorUserId ? 'user' : 'system',
    actorId: actorUserId,
    verb: 'risk.assessed',
    objectType: 'fsli',
    objectId: fsliCode,
    payload: {
      methodology_version: cat.risque.version,
      levels: Object.fromEntries(out.map((r) => [r.assertion, r.level])),
    },
  });
  return out;
}

/** Le niveau qui commande, pour une assertion. */
export async function levelFor(engagementId: string, fsliCode: string, assertion: string): Promise<Level | null> {
  const r = await q01<{ computed_level: string; retained_level: string | null }>(
    `select computed_level, retained_level from fsli_assertion_risk
     where engagement_id = $1 and fsli_code = $2 and assertion = $3`,
    [engagementId, fsliCode, assertion],
  );
  return r ? (r.retained_level ?? r.computed_level) : null;
}

/**
 * Les niveaux d'un poste, AVEC les facteurs qui les ont produits — observés ET
 * déclarés.
 *
 * Les deux doivent être rendus ensemble : le niveau compte les deux sortes, et
 * un écran qui afficherait « 2 facteurs » au-dessus d'une liste qui n'en montre
 * qu'un serait pire qu'un écran muet. C'est le test qui l'a relevé : le compte
 * montait, la liste ne suivait pas.
 */
export async function risksFor(engagementId: string, fsliCode: string): Promise<AssertionRisk[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const rows = await q<Omit<AssertionRisk, 'level' | 'factors'>>(
    `select fsli_code, assertion, computed_level, factor_count, retained_level,
            override_reason, decided_by
     from fsli_assertion_risk where engagement_id = $1 and fsli_code = $2 order by assertion`,
    [engagementId, fsliCode],
  );
  const observed = await q<{ assertion: string; factor_code: string; label: string; evidence: string }>(
    `select assertion, factor_code, label, evidence from risk_factor_observed
     where engagement_id = $1 and fsli_code = $2 order by assertion, factor_code`,
    [engagementId, fsliCode],
  );
  const declared = (await declaredFactorsFor(engagementId, fsliCode)).map((d) => ({
    assertion: d.assertion,
    factor_code: `${d.source}:${d.source_ref ?? '—'}`,
    label: d.description,
    evidence: `déclaré · ${cat.questionnaire.naturesRi[d.nature]?.libelle ?? d.nature}`
      + (d.source_ref ? ` · source ${d.source_ref}` : ''),
  }));
  const all = [...observed, ...declared];
  return rows.map((r) => ({
    ...r,
    level: r.retained_level ?? r.computed_level,
    factors: all.filter((f) => f.assertion === r.assertion)
      .map(({ factor_code, label, evidence }) => ({ factor_code, label, evidence })),
  }));
}

/**
 * Surcharger un niveau. SANS MOTIF ÉCRIT, C'EST REFUSÉ — descendre un risque
 * sans dire pourquoi est précisément le geste qu'un dossier doit rendre
 * impossible. La contrainte de base le refuse aussi.
 */
export async function overrideLevel(
  engagementId: string,
  fsliCode: string,
  assertion: string,
  level: Level | null,
  reason: string,
  actorUserId: string,
): Promise<void> {
  await assertMembre(engagementId, actorUserId, 'overrideLevel');
  const cat = await catalogueDeLaMission(engagementId);
  const eng = await engagementContext(engagementId);
  const row = await q01<{ computed_level: string }>(
    `select computed_level from fsli_assertion_risk
     where engagement_id = $1 and fsli_code = $2 and assertion = $3`,
    [engagementId, fsliCode, assertion],
  );
  if (!row) throw new RiskRuleError('cette assertion n’a pas encore été évaluée sur ce poste');
  if (level !== null) {
    rank(cat, level); // lève si le niveau n'est pas de l'échelle du cabinet
    if (level !== row.computed_level && !reason.trim()) {
      throw new RiskRuleError('une surcharge de niveau sans motif écrit n’est pas une surcharge');
    }
  }
  await q(
    `update fsli_assertion_risk
       set retained_level = $4, override_reason = $5, decided_by = $6,
           decided_at = case when $4::text is null then null else now() end
     where engagement_id = $1 and fsli_code = $2 and assertion = $3`,
    [engagementId, fsliCode, assertion, level, level === null ? null : reason.trim(),
     level === null ? null : actorUserId],
  );
  await logEvent({
    tenantId: eng.tenant_id,
    engagementId,
    actorKind: 'user',
    actorId: actorUserId,
    verb: level === null ? 'risk.override.cleared' : 'risk.override.set',
    objectType: 'fsli_assertion_risk',
    objectId: `${fsliCode}/${assertion}`,
    payload: { computed: row.computed_level, retained: level, reason: reason.trim() },
  });
}

/* ═══ CE QUE LE RISQUE COMMANDE ═══════════════════════════════════════════ */

export interface RequiredProcedure {
  procedure: Procedure;
  assertion: string;
  /** Le niveau de l'assertion que CETTE procédure sert. */
  level: Level;
  /** Le minimum que la procédure exige pour être requise. */
  requires: string;
  sampleSize: number | null;
  /** Comment la taille est obtenue : lue dans la table, ou calculée. */
  taille: {
    origine: 'table' | 'formule' | 'sans_objet';
    formule?: string;
    libelle?: string;
    calcul?: string;
    /** Les entrées réelles du calcul, pour qu'un chiffre affiché sache d'où il vient. */
    entrees?: { valeurPopulationCents: number; seuilPlanificationCents: number };
    /** Pourquoi elle n'est pas calculable, le cas échéant. */
    obstacle?: string;
  };
  /** Pourquoi elle est là, en une phrase relisible. */
  because: string;
}

/**
 * Les procédures requises sur un poste : celles de son cycle (et les
 * transverses) dont le `risque_minimum` est atteint par le niveau de
 * L'ASSERTION QU'ELLES SERVENT.
 *
 * C'est ici que le risque cesse de décorer. Baisser « séparation » de moyen à
 * faible retire les procédures de cut-off de la liste ; le monter les remet.
 */
export async function requiredProcedures(
  engagementId: string,
  fsliCode: string,
): Promise<RequiredProcedure[]> {
  const cat = await catalogueDeLaMission(engagementId);
  assertFormulasImplemented(cat);
  const risks = await risksFor(engagementId, fsliCode);
  const byAssertion = new Map(risks.map((r) => [r.assertion, r]));

  /* LE CONTEXTE DE LA FORMULE — et c'est pour cela que la formule attendait le
     point 6 : elle a besoin de la VALEUR de la population et du seuil de
     planification. Ni l'un ni l'autre n'est connu au chargement du catalogue ;
     les deux le sont ici, au moment où la procédure s'exécute sur un poste. */
  const ctx = await contexteTaille(engagementId, fsliCode);

  const out: RequiredProcedure[] = [];
  for (const p of proceduresDuCycle(cat, fsliCode)) {
    const r = byAssertion.get(p.assertion);
    if (!r) continue;
    if (rank(cat, r.level) < rank(cat, p.risque_minimum)) continue;
    const f = formuleDeTaille(cat, r.level);
    const taille: RequiredProcedure['taille'] = !p.echantillonnee
      ? { origine: 'sans_objet' }
      : f
        ? {
            origine: 'formule', formule: f.nom, libelle: f.libelle, calcul: f.calcul,
            entrees: ctx.valeurs ?? undefined,
            obstacle: ctx.obstacle ?? undefined,
          }
        : { origine: 'table' };
    out.push({
      procedure: p,
      assertion: p.assertion,
      level: r.level,
      requires: p.risque_minimum,
      sampleSize: p.echantillonnee ? sampleSize(cat, r.level, ctx.valeurs ?? undefined) : null,
      taille,
      because: `risque « ${r.level} » sur « ${p.assertion} »`
        + (r.retained_level ? ' (niveau retenu par l’auditeur)' : ` (${r.factor_count} facteur(s) observé(s))`)
        + ` ≥ minimum « ${p.risque_minimum} » de la procédure`,
    });
  }
  return out.sort((a, b) => a.procedure.code.localeCompare(b.procedure.code));
}

/**
 * Les entrées de la formule, pour CE poste.
 *
 * Elle rend un obstacle NOMMÉ plutôt que des zéros : sans population évaluée ou
 * sans seuil validé, la taille n'est pas calculable, et l'écran doit le dire
 * au lieu d'afficher un nombre dont personne ne saurait dire d'où il vient.
 */
export async function contexteTaille(
  engagementId: string,
  fsliCode: string,
): Promise<{ valeurs: ContexteTaille | null; obstacle: string | null }> {
  /* Le seuil VALIDÉ, pas le dernier proposé : une étendue réglée sur une
     proposition non validée serait réglée sur rien. */
  const mat = await q01<{ perf_amount: string; status: string }>(
    `select perf_amount::text as perf_amount, status from materiality
     where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
    [engagementId],
  );
  if (!mat || mat.status !== 'validated') {
    return { valeurs: null, obstacle: 'seuil de planification non validé' };
  }
  /* La valeur de la population du poste : le solde du POSTE, pas une somme
     re-calculée sur le grand livre. C'est le chiffre qui figure aux états
     financiers, donc celui sur lequel l'étendue doit se régler. */
  const poste = await q01<{ balance: string }>(
    `select balance::text as balance from fsli where engagement_id = $1 and code = $2`,
    [engagementId, fsliCode],
  );
  const valeur = Math.round(Math.abs(Number(poste?.balance ?? 0)) * 100);
  if (!valeur) return { valeurs: null, obstacle: 'population du poste non évaluée' };
  return {
    valeurs: {
      valeurPopulationCents: valeur,
      seuilPlanificationCents: Math.round(Number(mat.perf_amount) * 100),
    },
    obstacle: null,
  };
}

/* ── la taille d'échantillon : table OU formule nommée ────────────────────
   La méthode NOMME la formule et fixe ses paramètres ; le code la CALCULE.
   Même frontière que les prédicats, pour la même raison : une expression
   exécutable chargée par un cabinet serait du code sans revue, et le jour où
   elle se trompe, elle se trompe sur un dossier signé (ADR-050).            */

/** Les formules que le moteur sait calculer. */
export const FORMULES_TAILLE: Record<string, (p: Record<string, number>, ctx: ContexteTaille) => number> = {
  /**
   * Sondage en unités monétaires : l'intervalle de sondage ramené au seuil de
   * planification. n = valeur de population × facteur de confiance / seuil,
   * borné.
   *
   * POURQUOI UNE FORMULE PLUTÔT QU'UN NOMBRE, au niveau élevé : trente lignes
   * sur un chiffre d'affaires de 12 M€ ne couvrent pas la même chose que trente
   * lignes sur 800 k€. Une table par niveau ignore la population ; c'est
   * défendable au niveau faible, ça ne l'est pas là où le risque est le plus
   * élevé.
   */
  mus_intervalle_au_seuil(p, ctx) {
    if (ctx.seuilPlanificationCents <= 0) {
      throw new RiskRuleError(
        'formule « mus_intervalle_au_seuil » : le seuil de planification n’est pas fixé — '
        + 'la taille ne se calcule pas, et une taille inventée serait pire qu’une taille absente',
      );
    }
    if (ctx.valeurPopulationCents <= 0) {
      throw new RiskRuleError(
        'formule « mus_intervalle_au_seuil » : la population n’est pas évaluée — '
        + 'elle est la donnée d’entrée de la formule, pas un détail',
      );
    }
    const brut = (ctx.valeurPopulationCents * p.facteur_confiance) / ctx.seuilPlanificationCents;
    return Math.min(p.maximum, Math.max(p.minimum, Math.ceil(brut)));
  },
};

/** Ce dont une formule a besoin, et que seule l'exécution sur un poste connaît. */
export interface ContexteTaille {
  valeurPopulationCents: number;
  seuilPlanificationCents: number;
}

/**
 * Toute formule déclarée est implémentée, toute formule implémentée est
 * déclarée. Les DEUX sens, comme pour les prédicats : une formule nommée et
 * absente rendrait une taille silencieusement manquante ; une formule
 * implémentée et jamais nommée serait du code que rien ne peut atteindre.
 */
export function assertFormulasImplemented(cat: Catalogue): void {
  const declarees = Object.keys(cat.risque.formules ?? {});
  const implementees = Object.keys(FORMULES_TAILLE);
  const manquantes = declarees.filter((f) => !implementees.includes(f));
  const orphelines = implementees.filter((f) => !declarees.includes(f));
  if (manquantes.length || orphelines.length) {
    throw new RiskRuleError(
      [
        manquantes.length ? `formule(s) déclarée(s) et non implémentée(s) : ${manquantes.join(', ')}` : '',
        orphelines.length ? `formule(s) implémentée(s) et non déclarée(s) : ${orphelines.join(', ')}` : '',
      ].filter(Boolean).join(' · '),
    );
  }
}

/**
 * La taille suit l'assertion testée. Elle vient de la méthode, pas du code.
 *
 * Le contexte est OPTIONNEL, et son absence n'invente rien : une formule sans
 * population rend `null`, ce que l'écran affiche comme « à calculer sur la
 * population » — jamais un nombre plausible tiré d'on ne sait où.
 */
export function sampleSize(cat: Catalogue, level: Level, ctx?: ContexteTaille): number | null {
  const t = cat.risque.tailles[level];
  if (typeof t === 'number') return t;
  if (!t || typeof t !== 'object') {
    throw new RiskRuleError(`aucune taille d’échantillon pour le niveau « ${level} »`);
  }
  const calcul = FORMULES_TAILLE[t.formule];
  if (!calcul) {
    throw new RiskRuleError(
      `formule « ${t.formule} » inconnue du moteur (connues : ${Object.keys(FORMULES_TAILLE).join(', ')})`,
    );
  }
  if (!ctx) return null;
  return calcul(t.parametres, ctx);
}

/** La taille est-elle calculée par une formule, et laquelle ? */
export function formuleDeTaille(cat: Catalogue, level: Level): { nom: string; libelle: string; calcul: string } | null {
  const t = cat.risque.tailles[level];
  if (typeof t === 'number' || !t) return null;
  const def = cat.risque.formules?.[t.formule];
  return { nom: t.formule, libelle: def?.libelle ?? t.formule, calcul: def?.calcul ?? '' };
}

/** Les procédures ÉCARTÉES, et pourquoi — une liste qui ne dit que ce qu'elle
 *  retient ne se conteste pas. */
export async function excludedProcedures(
  engagementId: string,
  fsliCode: string,
): Promise<{ code: string; libelle: string; assertion: string; level: Level | null; requires: string }[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const risks = await risksFor(engagementId, fsliCode);
  const byAssertion = new Map(risks.map((r) => [r.assertion, r]));
  return proceduresDuCycle(cat, fsliCode)
    .filter((p) => {
      const r = byAssertion.get(p.assertion);
      return !r || rank(cat, r.level) < rank(cat, p.risque_minimum);
    })
    .map((p) => ({
      code: p.code, libelle: p.libelle, assertion: p.assertion,
      level: byAssertion.get(p.assertion)?.level ?? null,
      requires: p.risque_minimum,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
