// Le catalogue méthodologique est de la donnée versionnée : il doit être
// VALIDE, COMPLET et HONNÊTE sur ce qu'il n'a pas pu vérifier. Ces tests
// tournent sans réseau, comme tout le reste de la suite.

import { describe, expect, it } from 'vitest';
import {
  chargerCatalogue, executable, justificatifs, procedure, proceduresDuCycle,
  proceduresRequises, racineDepot, referencesNonVerifiees, selectionExhaustive, sources,
} from './catalogue';
import type { Catalogue, Procedure } from './types';

const cat: Catalogue = await chargerCatalogue();

describe('catalogue méthodologique', () => {
  it('se charge et se valide contre son schéma', () => {
    expect(cat.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cat.procedures.length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(cat.sources).length).toBeGreaterThanOrEqual(15);
  });

  it('refuse un catalogue invalide plutôt que de le charger à moitié', async () => {
    const chemin = new URL('file://' + racineDepot() + '/methodology/valider.mjs').href;
    const { validerCatalogue } = (await import(/* @vite-ignore */ chemin)) as {
      validerCatalogue: (c: unknown, s: unknown, sch: unknown) => string[];
    };
    const fs = await import('node:fs');
    const lire = (f: string) =>
      JSON.parse(fs.readFileSync(racineDepot() + '/methodology/' + f, 'utf8'));
    const schema = lire('schema.json');
    const src = lire('sources.json');

    // procédure sans source, sens inconnu, champ inconnu, source absente du registre
    const casse = {
      version: '0.0.0',
      sens_de_test: cat.sensDeTest,
      procedures: [
        {
          ...cat.procedures[0],
          sens: 'divination',
          sources: ['SOURCE-QUI-N-EXISTE-PAS'],
          champ_inconnu: true,
        },
      ],
    };
    const erreurs = validerCatalogue(casse, src, schema);
    expect(erreurs.join(' | ')).toMatch(/hors énumération/);
    expect(erreurs.join(' | ')).toMatch(/absente du registre/);
    expect(erreurs.join(' | ')).toMatch(/inconnu du schéma/);
  });

  it('couvre les cycles du dossier, pas seulement les ventes', () => {
    const cycles = new Set(cat.procedures.map((p) => p.cycle).filter((c) => c !== '*'));
    for (const attendu of ['FOURN', 'IMMO_COR', 'STOCKS', 'CLIENTS', 'PERSONNEL', 'CAPITAUX', 'DETTES_FI', 'PROV']) {
      expect(cycles.has(attendu), `cycle ${attendu} absent du catalogue`).toBe(true);
    }
  });

  it('porte les deux sens du test, pas seulement le grand livre vers la pièce', () => {
    const inverse = cat.procedures.filter((p) => p.sens === 'piece_vers_gl');
    expect(inverse.length).toBeGreaterThanOrEqual(6);
    expect(cat.procedures.some((p) => p.sens === 'gl_vers_piece')).toBe(true);
  });

  it('porte la recherche de passifs non enregistrés, dans le bon sens', () => {
    const sul = procedure(cat, 'FOURN-SUL') as Procedure;
    expect(sul).toBeDefined();
    expect(sul.sens).toBe('piece_vers_gl');
    expect(sul.assertion).toBe('exhaustivite');
    expect(executable(sul)).toBe(true);
    // aucun tirage : sonder une population qu'on cherche à compléter ne prouve rien
    expect(selectionExhaustive(sul)).toBe(true);
    expect(justificatifs(sul, 'FOURN').map((d) => d.document))
      .toEqual(['Facture fournisseur', 'Bon de réception']);
  });

  it('distingue ce qui se relève de ce qui se contrôle', () => {
    const sul = procedure(cat, 'FOURN-SUL') as Procedure;
    const champs = justificatifs(sul, 'FOURN').flatMap((d) => d.champs);
    const releves = champs.filter((c) => c.releve_seul);
    expect(releves.length).toBeGreaterThan(0);
    // un champ relevé seul ne porte pas de règle de contrôle : le validateur l'interdit
    for (const c of releves) expect(c.regle).toBeUndefined();
    expect(champs.some((c) => !c.releve_seul && c.regle)).toBe(true);
  });

  it('nomme un prédicat et des résolveurs, jamais une expression exécutable', () => {
    for (const p of cat.procedures) {
      expect(p.population.predicat, `${p.code} : population sans prédicat nommé`).toBeTruthy();
      expect(String(p.population.predicat)).toMatch(/^[a-z0-9_]+$/);
      for (const d of p.justificatifs) {
        for (const c of d.champs) expect(c.reference).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it('marque UNVERIFIED tout ce dont le texte primaire n’a pas été atteint', () => {
    // Aucune source normative n'a pu être ouverte depuis l'environnement de
    // développement. Le catalogue doit le DIRE, pas le taire.
    const nonVerifiees = Object.entries(cat.sources).filter(([, s]) => !s.verifie);
    expect(nonVerifiees.length).toBeGreaterThan(0);
    for (const [code, s] of nonVerifiees) {
      expect(s.raison_non_verifie, `source ${code} : non vérifiée sans raison`).toBeTruthy();
    }
    // et aucune procédure ne cite un numéro de paragraphe
    for (const p of cat.procedures) {
      expect(sources(cat, p).length, `${p.code} : aucune source`).toBeGreaterThan(0);
      for (const { source } of sources(cat, p)) {
        expect(source.reference, `${source.reference} : numéro de paragraphe cité`)
          .not.toMatch(/§|\bpar(agraphe|a)?\.?\s*\d/i);
      }
    }
  });

  it('signale les procédures citées sans être exécutables', () => {
    const nonExec = cat.procedures.filter((p) => !executable(p));
    expect(nonExec.length).toBeGreaterThan(0);
    // elles restent au catalogue avec leur méthode : elles ne sont pas simulées
    for (const p of nonExec) expect(p.controle.length).toBeGreaterThan(15);
  });

  it('n’exige une procédure qu’au niveau de risque qu’elle déclare', () => {
    const requises = (n: 'faible' | 'moyen' | 'eleve') =>
      proceduresRequises(cat, 'FOURN', () => n).map((p) => p.code);
    const bas = requises('faible');
    const haut = requises('eleve');
    expect(haut.length).toBeGreaterThan(bas.length);
    for (const c of bas) expect(haut).toContain(c);
    expect(bas).toContain('FOURN-SUL'); // la procédure centrale du cycle, à tout niveau
  });

  it('rend les procédures transverses à tous les cycles', () => {
    const transverses = cat.procedures.filter((p) => p.cycle === '*' && !p.postes);
    for (const cycle of ['FOURN', 'STOCKS', 'CLIENTS']) {
      const codes = proceduresDuCycle(cat, cycle).map((p) => p.code);
      for (const t of transverses) expect(codes).toContain(t.code);
    }
  });

  it('dit combien de références restent à vérifier avant tout usage réel', () => {
    const sul = procedure(cat, 'FOURN-SUL') as Procedure;
    expect(referencesNonVerifiees(cat, sul).length).toBe(sul.sources.length);
  });
});
