// « Votre méthode reste la vôtre » — la partie qui se vérifie.
//
// Un auditeur teste cette promesse en trente secondes : « et si je travaille à
// quatre niveaux ? », « et si je les appelle autrement ? ». Ce fichier répond en
// chargeant réellement une méthode à QUATRE niveaux nommés autrement, sur un
// dépôt temporaire, sans toucher une ligne de code.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { racineDepot } from './catalogue';

/** Copie la méthode du dépôt dans un dossier temporaire, en la modifiant. */
function methodeAlternative(
  muter: (f: Record<string, unknown>) => void,
  fichiersEnPlus: string[] = [],
): string {
  const src = path.join(racineDepot(), 'methodology');
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'otto-methode-'));
  fs.mkdirSync(path.join(dst, 'methodology'));
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dst, 'methodology', f));
  }
  const fichiers: Record<string, unknown> = {};
  for (const f of ['risque.json', 'procedures.json', ...fichiersEnPlus]) {
    fichiers[f] = JSON.parse(fs.readFileSync(path.join(dst, 'methodology', f), 'utf8'));
  }
  muter(fichiers);
  for (const [f, contenu] of Object.entries(fichiers)) {
    fs.writeFileSync(path.join(dst, 'methodology', f), JSON.stringify(contenu, null, 2));
  }
  return dst;
}

async function charger(racine: string) {
  const chemin = new URL('file://' + racineDepot() + '/methodology/valider.mjs').href;
  const m = (await import(/* @vite-ignore */ chemin)) as {
    chargerCatalogue: (r: string) => {
      risque: { niveaux: string[]; tailles: Record<string, number> };
      procedures: { code: string; risque_minimum: string; assertion: string }[];
      assertions: { liste: { code: string; libelle: string }[] };
    };
  };
  return m.chargerCatalogue(racine);
}

describe('l’échelle de risque appartient au cabinet', () => {
  it('QUATRE niveaux, nommés autrement, se chargent sans toucher au code', async () => {
    const racine = methodeAlternative((f) => {
      const r = f['risque.json'] as Record<string, unknown>;
      r.echelle = {
        niveaux: ['limite', 'normal', 'accru', 'majeur'],
        paliers: [
          { facteurs_min: 0, niveau: 'limite' },
          { facteurs_min: 1, niveau: 'normal' },
          { facteurs_min: 2, niveau: 'accru' },
          { facteurs_min: 4, niveau: 'majeur' },
        ],
      };
      r.tailles_echantillon = { limite: 5, normal: 12, accru: 25, majeur: 45 };
      const p = f['procedures.json'] as { procedures: { risque_minimum: string }[] };
      const tr: Record<string, string> = { faible: 'limite', moyen: 'normal', eleve: 'accru' };
      for (const proc of p.procedures) proc.risque_minimum = tr[proc.risque_minimum] ?? 'normal';
    });
    const cat = await charger(racine);
    expect(cat.risque.niveaux).toEqual(['limite', 'normal', 'accru', 'majeur']);
    expect(cat.risque.tailles.majeur).toBe(45);
    expect(cat.procedures.length).toBeGreaterThan(50);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('DEUX niveaux aussi', async () => {
    const racine = methodeAlternative((f) => {
      const r = f['risque.json'] as Record<string, unknown>;
      r.echelle = {
        niveaux: ['standard', 'renforce'],
        paliers: [{ facteurs_min: 0, niveau: 'standard' }, { facteurs_min: 1, niveau: 'renforce' }],
      };
      r.tailles_echantillon = { standard: 10, renforce: 40 };
      const p = f['procedures.json'] as { procedures: { risque_minimum: string }[] };
      const tr: Record<string, string> = { faible: 'standard', moyen: 'standard', eleve: 'renforce' };
      for (const proc of p.procedures) proc.risque_minimum = tr[proc.risque_minimum] ?? 'standard';
    });
    const cat = await charger(racine);
    expect(cat.risque.niveaux).toEqual(['standard', 'renforce']);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('une procédure qui exige un niveau ABSENT de l’échelle arrête l’assemblage', async () => {
    const racine = methodeAlternative((f) => {
      const p = f['procedures.json'] as { procedures: { risque_minimum: string }[] };
      p.procedures[0].risque_minimum = 'catastrophique';
    });
    await expect(charger(racine)).rejects.toThrow(/absent de l’échelle du cabinet/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un niveau sans taille d’échantillon arrête l’assemblage', async () => {
    const racine = methodeAlternative((f) => {
      const r = f['risque.json'] as Record<string, unknown>;
      r.tailles_echantillon = { faible: 6, moyen: 15 };   // « eleve » manquant
    });
    await expect(charger(racine)).rejects.toThrow(/sans taille d’échantillon/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('une échelle qui ne couvre pas zéro facteur arrête l’assemblage', async () => {
    const racine = methodeAlternative((f) => {
      const r = f['risque.json'] as { echelle: { paliers: { facteurs_min: number }[] } };
      r.echelle.paliers = r.echelle.paliers.filter((p) => p.facteurs_min !== 0);
    });
    await expect(charger(racine)).rejects.toThrow(/zéro facteur actif/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  /* ═══ le JEU D'ASSERTIONS appartient aussi au cabinet ═══════════════════
     Même défaut que l'échelle, un cran plus bas : certains cabinets séparent
     « présentation » et « informations à fournir ». Un auditeur pose la
     question tout de suite après celle sur les niveaux.                     */

  it('un jeu d’assertions DIFFÉRENT se charge — présentation et informations séparées', async () => {
    const racine = methodeAlternative((f) => {
      const a = f['assertions.json'] as { assertions: { code: string; libelle: string; definition: string }[] };
      a.assertions = a.assertions.filter((x) => x.code !== 'presentation');
      a.assertions.push(
        { code: 'presentation', libelle: 'Présentation', definition: 'Les éléments sont classés et présentés conformément au référentiel applicable.' },
        { code: 'informations', libelle: 'Informations à fournir', definition: 'Les informations requises par le référentiel figurent en annexe et sont exactes.' },
      );
      const q = f['questionnaire.json'] as { questions: { assertion: string }[] };
      for (const x of q.questions) if (x.assertion === 'presentation') x.assertion = 'informations';
    }, ['assertions.json', 'questionnaire.json']);
    const cat = await charger(racine);
    expect(cat.assertions.liste.map((a) => a.code)).toContain('informations');
    expect(cat.assertions.liste).toHaveLength(8);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('une procédure visant une assertion ABSENTE du jeu arrête l’assemblage', async () => {
    const racine = methodeAlternative((f) => {
      const p = f['procedures.json'] as { procedures: { assertion: string }[] };
      p.procedures[0].assertion = 'intuition';
    });
    await expect(charger(racine)).rejects.toThrow(/absente du jeu du cabinet/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('une QUESTION visant une assertion absente du jeu arrête aussi l’assemblage', async () => {
    const racine = methodeAlternative((f) => {
      const q = f['questionnaire.json'] as { questions: { assertion: string }[] };
      q.questions[0].assertion = 'intuition';
    }, ['questionnaire.json']);
    await expect(charger(racine)).rejects.toThrow(/absente du jeu du cabinet/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un FACTEUR DE RISQUE visant une assertion absente du jeu arrête l’assemblage', async () => {
    /* Le troisième consommateur. Sans ce contrôle, un facteur mal orthographié
       viserait une assertion qui n'existe pas : il monterait un risque que
       personne ne lit, et aucun écran ne le dirait. */
    const racine = methodeAlternative((f) => {
      const r = f['risque.json'] as { facteurs_observes: { assertion: string }[] };
      r.facteurs_observes[0].assertion = 'intuition';
    });
    await expect(charger(racine)).rejects.toThrow(/absente du jeu du cabinet/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un SENS NATUREL inconnu du catalogue arrête l’assemblage', async () => {
    /* Il produirait un libellé vide à l'écran — pas une erreur, un blanc. */
    const racine = methodeAlternative((f) => {
      const a = f['assertions.json'] as { assertions: { sens_naturel?: string }[] };
      a.assertions[0].sens_naturel = 'divination';
    }, ['assertions.json']);
    await expect(charger(racine)).rejects.toThrow(/sens naturel/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('deux assertions de MÊME CODE arrêtent l’assemblage', async () => {
    /* Le doublon est le mode de défaillance propre aux listes ouvertes :
       l'énumération le rendait impossible, plus rien ne le ferait sans ceci. */
    const racine = methodeAlternative((f) => {
      const a = f['assertions.json'] as { assertions: { code: string }[] };
      a.assertions.push({ ...a.assertions[0] });
    }, ['assertions.json']);
    await expect(charger(racine)).rejects.toThrow(/en double/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un jeu d’assertions VIDE arrête l’assemblage', async () => {
    const racine = methodeAlternative((f) => {
      (f['assertions.json'] as { assertions: unknown[] }).assertions = [];
    }, ['assertions.json']);
    await expect(charger(racine)).rejects.toThrow(/le jeu est vide/);
    fs.rmSync(racine, { recursive: true, force: true });
  });
});
