// Le risque par assertion, et LE FAIT QU'IL COMMANDE.
//
// Ce fichier ne vérifie pas qu'un niveau s'affiche. Il vérifie qu'en le
// changeant, la LISTE des procédures requises change et la TAILLE des sondages
// change — sinon le risque décore, et tout le reste est une juxtaposition.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { chargerCatalogue } from '@/lib/methodology/catalogue';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, noteReconciliationLimitation } from './reconciliation';
import { rebuildFslis } from './fsli';
import { propose, validate } from './materiality';
import {
  assessFsli, risksFor, levelFor, overrideLevel, requiredProcedures, excludedProcedures,
  sampleSize, levelForCount, rank, assertPredicatesImplemented, PREDICATES, RiskRuleError,
  formuleDeTaille, assertFormulasImplemented, contexteTaille,
} from './risk';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

describe('risque par assertion — il commande, il ne décore pas', () => {
  beforeAll(async () => {
    await initTestDb();
    const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
    const prior = fs.readFileSync(ds('tb_2024.csv'), 'utf8');
    await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv',
      content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
    await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2024.csv',
      content: prior, mapping: detectTbMapping(prior.split('\n')[0]), periodKind: 'prior' });
    await importFec({ engagementId: IDS.engNep, userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')) });
    await computeTbGl(IDS.engNep, IDS.users.karim);
    const latest = await latestTbGl(IDS.engNep);
    for (const item of latest!.items) {
      await noteReconciliationLimitation(item.id, IDS.users.karim, {
        explanation: 'Écriture de situation passée après l’extraction du fichier des écritures.',
        alternativeProcedures: 'Rapprochement re-exécuté sur la balance et sur le détail des comptes ; écart isolé et de sens opposé.',
      });
    }
    await rebuildFslis(IDS.engNep, IDS.users.karim);
    const mid = await propose(IDS.engNep, IDS.users.lea);
    await validate(mid, IDS.users.lea);
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
  });

  /* ═══ 1. la frontière méthode / code ══════════════════════════════════ */

  it('tout prédicat nommé par la méthode est implémenté, et réciproquement', async () => {
    const cat = await chargerCatalogue();
    expect(() => assertPredicatesImplemented(cat)).not.toThrow();
    expect(cat.risque.facteurs.every((f) => PREDICATES[f.predicat])).toBe(true);
  });

  it('un prédicat nommé mais non implémenté ARRÊTE — il ne se tait pas', async () => {
    const cat = await chargerCatalogue();
    const faux = { ...cat, risque: { ...cat.risque, predicats: [...cat.risque.predicats, 'divination'] } };
    expect(() => assertPredicatesImplemented(faux)).toThrow(/non implémenté/);
  });

  it('chaque facteur dit ce qu’il craint, et nomme sa source', async () => {
    const cat = await chargerCatalogue();
    for (const f of cat.risque.facteurs) {
      expect(f.pourquoi.length).toBeGreaterThan(40);
      expect(f.sources.length).toBeGreaterThan(0);
      for (const s of f.sources) expect(cat.sources[s]).toBeDefined();
    }
  });

  /* ═══ 2. l'échelle ════════════════════════════════════════════════════ */

  it('l’échelle vient de la méthode : 0 → faible, 1 → moyen, 2 et plus → élevé', async () => {
    const cat = await chargerCatalogue();
    expect(levelForCount(cat, 0)).toBe('faible');
    expect(levelForCount(cat, 1)).toBe('moyen');
    expect(levelForCount(cat, 2)).toBe('eleve');
    expect(levelForCount(cat, 9)).toBe('eleve');
    expect(rank(cat, 'faible')).toBeLessThan(rank(cat, 'eleve'));
    expect(() => rank(cat, 'catastrophique')).toThrow(/absent de l’échelle/);
  });

  /* ═══ 3. les facteurs observés portent leur MESURE ════════════════════ */

  it('les facteurs sont calculés sur les données, jamais demandés — et ils disent ce qu’ils ont mesuré', async () => {
    const risks = await risksFor(IDS.engNep, 'REVENUE');
    const all = risks.flatMap((r) => r.factors);
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      expect(f.evidence).toMatch(/\d/);                 // un chiffre, pas « vrai »
      expect(f.evidence.length).toBeGreaterThan(10);
    }
    const codes = all.map((f) => f.factor_code);
    expect(codes).toContain('volume');                  // le CA porte plus de 200 écritures
  });

  it('un facteur non évaluable est INACTIF et le dit — jamais supposé actif', async () => {
    const r = PREDICATES.variation_n_n1_au_dessus_du_seuil(
      { balanceCents: 1, priorBalanceCents: null, performanceMaterialityCents: 1,
        entries: 0, odEntries: 0, lateEntries: 0, lastMonthEntries: 0, periodEnd: '2025-12-31' },
      {},
    );
    expect(r.active).toBe(false);
    expect(r.evidence).toContain('non évaluable');
  });

  /* ═══ 4. LE COMMANDEMENT — le cœur du point 5 ═════════════════════════ */

  it('le risque d’une assertion commande la LISTE des procédures qui la servent', async () => {
    const cat = await chargerCatalogue();
    const before = await requiredProcedures(IDS.engNep, 'REVENUE');
    const level = await levelFor(IDS.engNep, 'REVENUE', 'separation');
    expect(level).toBeTruthy();

    // On monte « séparation » au maximum : les procédures de cut-off entrent.
    const top = cat.risque.niveaux[cat.risque.niveaux.length - 1];
    await overrideLevel(IDS.engNep, 'REVENUE', 'separation', top,
      'Concentration de fin d’exercice relevée lors de la revue analytique préliminaire.', IDS.users.lea);
    const raised = await requiredProcedures(IDS.engNep, 'REVENUE');
    expect(raised.length).toBeGreaterThanOrEqual(before.length);

    // On rend la main au calcul (« séparation » y est au plancher) : elles sortent.
    await overrideLevel(IDS.engNep, 'REVENUE', 'separation', null, '', IDS.users.lea);
    const bottom = (await levelFor(IDS.engNep, 'REVENUE', 'separation'))!;
    expect(bottom).toBe(cat.risque.niveaux[0]);
    const lowered = await requiredProcedures(IDS.engNep, 'REVENUE');

    const sepRaised = raised.filter((p) => p.assertion === 'separation').map((p) => p.procedure.code);
    const sepLowered = lowered.filter((p) => p.assertion === 'separation').map((p) => p.procedure.code);
    expect(sepRaised.length).toBeGreaterThan(sepLowered.length);
    // et ce qui est sorti se retrouve dans les ÉCARTÉES, avec la raison
    const excluded = await excludedProcedures(IDS.engNep, 'REVENUE');
    for (const code of sepRaised.filter((c) => !sepLowered.includes(c))) {
      const e = excluded.find((x) => x.code === code);
      expect(e, `${code} devrait figurer parmi les écartées`).toBeDefined();
      expect(e!.level).toBe(bottom);
    }
  });

  it('la taille suit l’assertion TESTÉE, pas le risque le plus élevé du poste', async () => {
    const cat = await chargerCatalogue();
    // séparation est au plancher, exhaustivité ne l'est pas : deux tailles.
    const top = cat.risque.niveaux[cat.risque.niveaux.length - 1];
    await overrideLevel(IDS.engNep, 'REVENUE', 'exhaustivite', top,
      'Migration du système de facturation en cours d’exercice.', IDS.users.lea);
    const procs = await requiredProcedures(IDS.engNep, 'REVENUE');
    const sampled = procs.filter((p) => p.sampleSize !== null);
    expect(sampled.length).toBeGreaterThan(0);

    const sizes = new Map<string, Set<number>>();
    for (const p of sampled) {
      const s = sizes.get(p.assertion) ?? new Set<number>();
      s.add(p.sampleSize!);
      sizes.set(p.assertion, s);
    }
    // une assertion, une taille — et la taille est celle de SON niveau
    for (const p of sampled) expect(p.sampleSize).toBe(sampleSize(cat, p.level));
    // et le poste porte bien des tailles DIFFÉRENTES si ses niveaux diffèrent
    const levels = new Set(sampled.map((p) => p.level));
    if (levels.size > 1) {
      expect(new Set(sampled.map((p) => p.sampleSize)).size).toBeGreaterThan(1);
    }
  });

  it('chaque procédure requise dit POURQUOI elle est là', async () => {
    const procs = await requiredProcedures(IDS.engNep, 'REVENUE');
    for (const p of procs) {
      expect(p.because).toContain(p.assertion);
      expect(p.because).toContain(p.procedure.risque_minimum);
    }
  });

  /* ═══ 5. la surcharge, et son motif ═══════════════════════════════════ */

  it('une surcharge SANS MOTIF ÉCRIT est refusée — par le service et par la base', async () => {
    const cat = await chargerCatalogue();
    const bottom = cat.risque.niveaux[0];
    await expect(
      overrideLevel(IDS.engNep, 'REVENUE', 'realite', bottom, '   ', IDS.users.lea),
    ).rejects.toThrow(/sans motif écrit/);

    const row = await q1<{ computed_level: string }>(
      `select computed_level from fsli_assertion_risk
       where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'realite'`,
      [IDS.engNep],
    );
    if (row.computed_level !== bottom) {
      await expect(
        q(`update fsli_assertion_risk set retained_level = $2
           where engagement_id = $1 and fsli_code = 'REVENUE' and assertion = 'realite'`,
          [IDS.engNep, bottom]),
      ).rejects.toThrow();
    }
  });

  it('un niveau hors de l’échelle du cabinet est refusé', async () => {
    await expect(
      overrideLevel(IDS.engNep, 'REVENUE', 'realite', 'catastrophique', 'motif', IDS.users.lea),
    ).rejects.toThrow(/absent de l’échelle/);
  });

  it('une assertion non évaluée ne se surcharge pas', async () => {
    await expect(
      overrideLevel(IDS.engNep, 'PAYABLES', 'realite', 'eleve', 'motif', IDS.users.lea),
    ).rejects.toThrow(/pas encore été évaluée/);
  });

  /* ═══ 6. la décision SURVIT au recalcul ═══════════════════════════════ */

  it('ré-évaluer ne perd pas l’arbitrage — un ré-import n’efface pas une décision', async () => {
    const cat = await chargerCatalogue();
    // Une surcharge RÉELLE : on monte « séparation » (calculée faible) au maximum.
    const top = cat.risque.niveaux[cat.risque.niveaux.length - 1];
    const motif = 'Régularisations de fin d’exercice relevées à l’intérim ; le calcul ne les voit pas.';
    await overrideLevel(IDS.engNep, 'REVENUE', 'separation', top, motif, IDS.users.lea);

    const avant = (await risksFor(IDS.engNep, 'REVENUE')).find((r) => r.assertion === 'separation')!;
    expect(avant.retained_level).toBe(top);
    expect(avant.computed_level).not.toBe(top);   // c'est bien un arbitrage, pas un alignement
    expect(avant.override_reason).toContain('intérim');

    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);

    const apres = (await risksFor(IDS.engNep, 'REVENUE')).find((r) => r.assertion === 'separation')!;
    expect(apres.retained_level).toBe(top);
    expect(apres.override_reason).toContain('intérim');
    expect(apres.level).toBe(top);
  });

  it('une surcharge qui REJOINT le calcul cesse d’être une surcharge', async () => {
    const r = (await risksFor(IDS.engNep, 'REVENUE')).find((x) => x.assertion === 'separation')!;
    // on retient exactement le niveau calculé : ce n'est plus un arbitrage, et
    // l'afficher comme tel ferait croire à une décision qui n'existe plus
    await overrideLevel(IDS.engNep, 'REVENUE', 'separation', r.computed_level,
      'Alignement sur le calcul après test du contrôle.', IDS.users.lea);
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
    const apres = (await risksFor(IDS.engNep, 'REVENUE')).find((x) => x.assertion === 'separation')!;
    expect(apres.retained_level).toBeNull();
    expect(apres.override_reason).toBeNull();
    expect(apres.level).toBe(apres.computed_level);
  });

  it('retirer la surcharge rend la main au calcul', async () => {
    await overrideLevel(IDS.engNep, 'REVENUE', 'exhaustivite', null, '', IDS.users.lea);
    const r = (await risksFor(IDS.engNep, 'REVENUE')).find((x) => x.assertion === 'exhaustivite')!;
    expect(r.retained_level).toBeNull();
    expect(r.level).toBe(r.computed_level);
  });

  /* ═══ 7. la piste ═════════════════════════════════════════════════════ */

  it('l’évaluation et les arbitrages sont au journal, avec la version de la méthode', async () => {
    const rows = await q<{ verb: string; payload: Record<string, unknown> }>(
      `select verb, payload from event_log where engagement_id = $1 and verb like 'risk.%' order by id`,
      [IDS.engNep],
    );
    const verbs = rows.map((r) => r.verb);
    expect(verbs).toContain('risk.assessed');
    expect(verbs).toContain('risk.override.set');
    expect(verbs).toContain('risk.override.cleared');
    const assessed = rows.find((r) => r.verb === 'risk.assessed')!;
    expect(assessed.payload.methodology_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('le niveau se relit avec la version de méthode qui l’a produit', async () => {
    const cat = await chargerCatalogue();
    const rows = await q<{ methodology_version: string }>(
      `select distinct methodology_version from fsli_assertion_risk where engagement_id = $1`,
      [IDS.engNep],
    );
    expect(rows.map((r) => r.methodology_version)).toEqual([cat.risque.version]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   LA TAILLE PAR FORMULE — point 6.
   Une table par niveau ignore la taille de la population : trente lignes sur
   12 M€ ne couvrent pas la même chose que trente lignes sur 800 k€. La méthode
   NOMME la formule, le code la CALCULE — même frontière que les prédicats.
   ═══════════════════════════════════════════════════════════════════════ */

describe('la taille d’échantillon par formule', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  });

  it('la formule est NOMMÉE par la méthode et CALCULÉE par le code', async () => {
    const cat = await chargerCatalogue();
    const f = formuleDeTaille(cat, 'eleve');
    expect(f?.nom).toBe('mus_intervalle_au_seuil');
    expect(f?.calcul).toMatch(/facteur_confiance/);
    // et le niveau faible reste une table : les deux formes cohabitent
    expect(formuleDeTaille(cat, 'faible')).toBeNull();
    expect(sampleSize(cat, 'faible')).toBe(6);
  });

  it('le calcul est celui qui est écrit, pas un autre', async () => {
    const cat = await chargerCatalogue();
    // 12 000 000 € × 3 / 300 000 € = 120 → borné à 80
    expect(sampleSize(cat, 'eleve', {
      valeurPopulationCents: 1_200_000_000, seuilPlanificationCents: 30_000_000,
    })).toBe(80);
    // 800 000 € × 3 / 300 000 € = 8 → relevé au minimum 20
    expect(sampleSize(cat, 'eleve', {
      valeurPopulationCents: 80_000_000, seuilPlanificationCents: 30_000_000,
    })).toBe(20);
    // 4 000 000 € × 3 / 300 000 € = 40 → dans les bornes, donc tel quel
    expect(sampleSize(cat, 'eleve', {
      valeurPopulationCents: 400_000_000, seuilPlanificationCents: 30_000_000,
    })).toBe(40);
  });

  it('SANS population, la taille est NULLE — jamais un nombre plausible', async () => {
    /* Le défaut qu'on interdit : rendre une valeur par défaut. Un chiffre
       affiché qui ne sait pas dire d'où il vient est pire qu'une absence. */
    const cat = await chargerCatalogue();
    expect(sampleSize(cat, 'eleve')).toBeNull();
  });

  it('une population nulle ou un seuil nul LÈVENT au lieu de rendre zéro', async () => {
    const cat = await chargerCatalogue();
    expect(() => sampleSize(cat, 'eleve', { valeurPopulationCents: 0, seuilPlanificationCents: 30_000_000 }))
      .toThrow(/population n’est pas évaluée/);
    expect(() => sampleSize(cat, 'eleve', { valeurPopulationCents: 1_000, seuilPlanificationCents: 0 }))
      .toThrow(/seuil de planification n’est pas fixé/);
  });

  it('SCHÉMA ↔ MOTEUR : les deux sens, mais entre le produit et lui-même', async () => {
    /* La frontière est ici entre le SCHÉMA DU PRODUIT et le MOTEUR, pas entre
       le cabinet et nous. Une formule déclarée et non implémentée rendrait une
       taille silencieusement manquante ; une formule implémentée et non
       déclarée serait inatteignable par toute méthode.
       Un CABINET, lui, n'est pas tenu d'utiliser toutes les formules connues :
       une première version l'exigeait, ce qui aurait laissé l'implémentation du
       produit dicter sa méthode. */
    const cat = await chargerCatalogue();
    expect(() => assertFormulasImplemented(cat)).not.toThrow();

    const inventee = { ...cat, risque: { ...cat.risque, formules: { ...cat.risque.formules, boule_de_cristal: { libelle: '', calcul: '', parametres: [] } } } };
    expect(() => assertFormulasImplemented(inventee)).toThrow(/non implémentée/);

    const amputee = { ...cat, risque: { ...cat.risque, formules: {} } };
    expect(() => assertFormulasImplemented(amputee)).toThrow(/non déclarée/);
  });

  it('sur le dossier réel, la taille est calculée ET dit d’où elle vient', async () => {
    // Le risque doit avoir été évalué, sinon aucune procédure n'est requise et
    // le test passerait à vide sur deux listes vides.
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
    const reqs = await requiredProcedures(IDS.engNep, 'REVENUE');
    expect(reqs.length, 'aucune procédure requise : le test vérifierait deux listes vides').toBeGreaterThan(0);
    const echantillonnees = reqs.filter((r) => r.taille.origine !== 'sans_objet');
    expect(echantillonnees.length).toBeGreaterThan(0);

    /* SANS CETTE ASSERTION, LA BOUCLE CI-DESSOUS PASSERAIT À VIDE si aucune
       assertion n'atteignait le niveau qui porte la formule. On force donc le
       niveau élevé sur une assertion, et on vérifie qu'il y a bien matière. */
    await overrideLevel(IDS.engNep, 'REVENUE', 'realite', 'eleve',
      'Test : vérifier que la formule s’applique réellement.', IDS.users.claire);
    const reqs2 = await requiredProcedures(IDS.engNep, 'REVENUE');
    const parFormule = reqs2.filter((r) => r.taille.origine === 'formule');
    expect(parFormule.length, 'aucune procédure au niveau porteur de formule').toBeGreaterThan(0);
    for (const r of parFormule) {
      expect(r.taille.formule).toBe('mus_intervalle_au_seuil');
      // les ENTRÉES du calcul sont portées avec le résultat : un chiffre
      // affiché doit savoir dire d'où il vient (P7)
      expect(r.taille.entrees?.valeurPopulationCents).toBeGreaterThan(0);
      expect(r.taille.entrees?.seuilPlanificationCents).toBeGreaterThan(0);
      expect(r.sampleSize).toBeGreaterThanOrEqual(20);
      expect(r.sampleSize).toBeLessThanOrEqual(80);
    }
    // et une procédure non échantillonnée n'invente pas de taille
    for (const r of reqs.filter((x) => x.taille.origine === 'sans_objet')) {
      expect(r.sampleSize).toBeNull();
    }
  });

  it('sans seuil validé, l’obstacle est NOMMÉ, pas contourné', async () => {
    const ctx = await contexteTaille(IDS.engSox, 'REVENUE');
    // le dossier SOX n'a ni seuil validé ni poste chiffré sur ce code
    expect(ctx.valeurs).toBeNull();
    expect(ctx.obstacle).toBeTruthy();
  });
});
