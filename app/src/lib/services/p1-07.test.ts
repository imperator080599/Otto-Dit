import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { assessFsli, risksFor, overrideLevel, RiskRuleError } from './risk';

// P1-07 (AUD-11, §7.7 du plan maître) : l'échelle à quatre niveaux (nrpmm/lower/higher/
// significant), RISK-01 (justification écrite obligatoire pour nrpmm) et les décisions
// versionnées (fsli_assertion_risk_decision, 0179). Ce fichier EXERCE le chemin réel
// (règle 15) — la contrainte en base d'abord, le service ensuite, jamais l'inverse.

describe('P1-07 : RISK-01 et les décisions versionnées (0179)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
  }, 60000);

  it('CAS CONNU MAUVAIS (règle 17) : la contrainte en base refuse nrpmm sans justification, même en contournant le service', async () => {
    const row = await q1<{ id: string }>(
      `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'realite'`,
      [IDS.engNep],
    );
    /* G-07 (override_needs_a_written_reason, 0012) ET RISK-01 sont deux
       contraintes INDÉPENDANTES qui portent toutes les deux sur un écart vers
       nrpmm (voir l'en-tête de 0179) : pour isoler RISK-01, on satisfait
       D'ABORD G-07 (override_reason, decided_by, decided_at) — sinon c'est
       G-07 qui refuse en premier, et le test ne prouverait rien sur RISK-01. */
    const satisfaitG07 = `override_reason = 'motif', decided_by = '${IDS.users.lea}', decided_at = now()`;
    await expect(
      q(`update fsli_assertion_risk set retained_level = 'nrpmm', ${satisfaitG07} where id = $1`, [row.id]),
    ).rejects.toThrow(/risk01_nrpmm_justifie/);
    // et avec une justification blanche, toujours refusé — btrim, pas une simple présence
    await expect(
      q(`update fsli_assertion_risk set retained_level = 'nrpmm', justification = '   ', ${satisfaitG07} where id = $1`, [row.id]),
    ).rejects.toThrow(/risk01_nrpmm_justifie/);
    // avec une justification réelle, la base l'accepte — la contrainte ne refuse pas tout
    await q(`update fsli_assertion_risk set retained_level = 'nrpmm', justification = 'Sonde directe.', ${satisfaitG07} where id = $1`, [row.id]);
    // on remet la ligne à plat pour ne pas fausser les tests qui suivent
    await q(`update fsli_assertion_risk set retained_level = null, justification = null,
             override_reason = null, decided_by = null, decided_at = null where id = $1`, [row.id]);
  });

  it('CAS CONNU MAUVAIS : la table de décision est append-only', async () => {
    const risk = await q1<{ id: string }>(
      `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'exhaustivite'`,
      [IDS.engNep],
    );
    const d = await q1<{ id: string }>(
      `insert into fsli_assertion_risk_decision (fsli_assertion_risk_id, retained_level, justification, decided_by)
       values ($1, 'higher', 'sonde', $2) returning id`,
      [risk.id, IDS.users.lea],
    );
    await expect(q(`update fsli_assertion_risk_decision set retained_level = 'lower' where id = $1`, [d.id]))
      .rejects.toThrow(/append-only/);
    await expect(q(`delete from fsli_assertion_risk_decision where id = $1`, [d.id]))
      .rejects.toThrow(/append-only/);
  });

  it('RISK-01 : surcharger vers nrpmm SANS justification est refusé par le SERVICE, avant tout aller-retour SQL', async () => {
    await expect(
      overrideLevel(IDS.engNep, 'REVENUE', 'mesure', 'nrpmm',
        'Motif de l’écart (G-07).', IDS.users.lea),
    ).rejects.toThrow(RiskRuleError);
    await expect(
      overrideLevel(IDS.engNep, 'REVENUE', 'mesure', 'nrpmm',
        'Motif de l’écart (G-07).', IDS.users.lea, '   '),
    ).rejects.toThrow(/RISK-01/);
    // rien n'a été écrit : ni ligne de décision, ni mutation de la table mère
    const risk = await q1<{ retained_level: string | null }>(
      `select retained_level from fsli_assertion_risk
       where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'mesure'`,
      [IDS.engNep],
    );
    expect(risk.retained_level).toBeNull();
    const decisions = await q(
      `select d.id from fsli_assertion_risk_decision d
       join fsli_assertion_risk r on r.id = d.fsli_assertion_risk_id
       where r.engagement_id = $1 and r.fsli_code = 'REVENUE' and r.assertion = 'mesure'`,
      [IDS.engNep],
    );
    expect(decisions).toHaveLength(0);
  });

  it('RISK-01 : AVEC justification, nrpmm est accepté — et retire tout travail substantif', async () => {
    await overrideLevel(IDS.engNep, 'REVENUE', 'presentation', 'nrpmm',
      'Motif de l’écart (G-07).', IDS.users.lea,
      'Assertion sans risque raisonnablement possible : présentation standardisée, contrôlée par le logiciel comptable, jamais mise en cause en cinq exercices.');
    const r = (await risksFor(IDS.engNep, 'REVENUE')).find((x) => x.assertion === 'presentation')!;
    expect(r.retained_level).toBe('nrpmm');
    expect(r.level).toBe('nrpmm');
  });

  it('chaque surcharge écrit une ligne append-only, chaînée à la précédente — la table mère ne reflète que la DERNIÈRE', async () => {
    const risk = await q1<{ id: string }>(
      `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'droits'`,
      [IDS.engNep],
    );
    const avant = await q<{ id: string }>(
      `select id from fsli_assertion_risk_decision where fsli_assertion_risk_id = $1`, [risk.id]);
    expect(avant).toHaveLength(0);

    await overrideLevel(IDS.engNep, 'REVENUE', 'droits', 'significant',
      'Première surcharge : litige de propriété relevé à la revue analytique.', IDS.users.lea);
    const d1 = await q1<{ id: string; supersedes_id: string | null; retained_level: string | null }>(
      `select id, supersedes_id, retained_level from fsli_assertion_risk_decision
       where fsli_assertion_risk_id = $1 order by decided_at desc limit 1`, [risk.id]);
    expect(d1.supersedes_id).toBeNull();
    expect(d1.retained_level).toBe('significant');

    await overrideLevel(IDS.engNep, 'REVENUE', 'droits', 'nrpmm',
      'Seconde surcharge : le litige est clos sans effet sur les droits comptabilisés.', IDS.users.lea,
      'Clôture du litige confirmée par l’avocat du cabinet, aucun effet sur les droits comptabilisés au 31/12.');
    const d2 = await q1<{ id: string; supersedes_id: string | null; retained_level: string | null }>(
      `select id, supersedes_id, retained_level from fsli_assertion_risk_decision
       where fsli_assertion_risk_id = $1 order by decided_at desc limit 1`, [risk.id]);
    expect(d2.supersedes_id).toBe(d1.id);
    expect(d2.retained_level).toBe('nrpmm');

    // les DEUX lignes existent encore — un arbitrage n'efface jamais le précédent (règle 28)
    const toutes = await q(`select id from fsli_assertion_risk_decision where fsli_assertion_risk_id = $1`, [risk.id]);
    expect(toutes).toHaveLength(2);

    // et la table mère ne reflète que la DERNIÈRE
    const mere = await q1<{ retained_level: string | null; justification: string | null }>(
      `select retained_level, justification from fsli_assertion_risk where id = $1`, [risk.id]);
    expect(mere.retained_level).toBe('nrpmm');
    expect(mere.justification).toContain('avocat');
  });

  it('vider une surcharge écrit AUSSI une ligne de décision, chaînée', async () => {
    const risk = await q1<{ id: string }>(
      `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'separation'`,
      [IDS.engNep],
    );
    await overrideLevel(IDS.engNep, 'REVENUE', 'separation', 'significant', 'Motif.', IDS.users.lea);
    await overrideLevel(IDS.engNep, 'REVENUE', 'separation', null, '', IDS.users.lea);
    const rows = await q<{ retained_level: string | null; supersedes_id: string | null }>(
      `select retained_level, supersedes_id from fsli_assertion_risk_decision
       where fsli_assertion_risk_id = $1 order by decided_at asc`, [risk.id]);
    expect(rows).toHaveLength(2);
    expect(rows[0].retained_level).toBe('significant');
    expect(rows[1].retained_level).toBeNull();
    expect(rows[1].supersedes_id).toBeTruthy();
  });

  it('CORRECTIF DE REVUE HOSTILE (règle 17/30) — deux surcharges CONCURRENTES sur LA MÊME assertion : la chaîne supersedes_id ne forke jamais', async () => {
    /* SANS le verrou de ligne (`for update`) posé sur `fsli_assertion_risk` dans
       `overrideLevel`, les deux appels pouvaient tous deux lire la MÊME « précédente »
       décision (aucune n'existait encore ici) avant qu'aucun des deux n'ait écrit — chacun
       insérerait alors une ligne de décision avec `supersedes_id = null`, et la ligne mère
       ne refléterait que la DERNIÈRE à valider, l'autre devenant une décision fantôme,
       jamais visible depuis la mère et sans successeur (le même défaut que P1-06 avait déjà
       corrigé pour `materiality.ts::validate`, par un CLAIM plutôt qu'un verrou — ici la
       ligne « courante » vit sur la mère, pas sur la décision, d'où la forme différente). */
    await overrideLevel(IDS.engNep, 'REVENUE', 'exhaustivite', 'higher',
      'Concurrence A.', IDS.users.lea);
    await overrideLevel(IDS.engNep, 'REVENUE', 'exhaustivite', null, '', IDS.users.lea);
    const risk = await q1<{ id: string }>(
      `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'exhaustivite'`,
      [IDS.engNep],
    );
    const avant = await q<{ id: string }>(
      `select id from fsli_assertion_risk_decision where fsli_assertion_risk_id = $1`, [risk.id]);
    const compteAvant = avant.length; // état de départ MESURÉ, pas supposé — pour isoler la course qui suit

    const resultats = await Promise.allSettled([
      overrideLevel(IDS.engNep, 'REVENUE', 'exhaustivite', 'significant', 'Concurrence B.', IDS.users.lea),
      overrideLevel(IDS.engNep, 'REVENUE', 'exhaustivite', 'higher', 'Concurrence C.', IDS.users.karim),
    ]);
    // le verrou SÉRIALISE, il ne fait échouer personne : les deux surcharges réussissent.
    expect(resultats.every((r) => r.status === 'fulfilled')).toBe(true);

    const decisions = await q<{ id: string; supersedes_id: string | null; retained_level: string | null }>(
      `select id, supersedes_id, retained_level from fsli_assertion_risk_decision
       where fsli_assertion_risk_id = $1 order by decided_at asc`, [risk.id]);
    // deux de plus qu'avant la course — une par appel concurrent, jamais un fork (qui en
    // laisserait aussi deux, mais toutes deux pointant vers la MÊME précédente).
    expect(decisions).toHaveLength(compteAvant + 2);
    const [avantDerniere, derniere] = decisions.slice(-2);
    // LE CŒUR DE LA PREUVE : la dernière décision supersède l'AVANT-dernière. Un fork
    // produirait autre chose : les DEUX décisions de la course auraient lu la MÊME
    // « précédente » (la ligne d'avant la course) et pointeraient donc toutes deux vers
    // ELLE — `derniere.supersedes_id` égalerait `avantDerniere.supersedes_id`, jamais
    // `avantDerniere.id`.
    expect(derniere.supersedes_id).toBe(avantDerniere.id);

    // et la ligne mère reflète exactement la DERNIÈRE décision de la chaîne — jamais les deux.
    const mere = await q1<{ retained_level: string | null }>(
      `select retained_level from fsli_assertion_risk where id = $1`, [risk.id]);
    expect(mere.retained_level).toBe(derniere.retained_level);
  });
});
