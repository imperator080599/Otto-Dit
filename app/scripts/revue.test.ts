import { describe, it, expect } from 'vitest';
import { rendre, type Revue } from './revue';

/**
 * L'ENGENDREUR DE docs/REVUE.md, ÉPROUVÉ CONTRE SON CAS CONNU MAUVAIS (règle 17 ; P0-00,
 * acceptation : « une ligne ne passe à OBSERVEE qu'avec un SHA et une station nommés »).
 *
 * Le cas connu mauvais : une ligne OBSERVEE sans `sha` (ou sans `station`) doit faire ÉCHOUER
 * l'engendrement — jamais s'imprimer en silence avec une preuve manquante (règle 13).
 */

const gestesVides: Revue['gestesH'] = [];

const donnees = (partiel: Partial<Revue> = {}): Revue => ({
  sources: {
    mandat: { date: '2026-09-20', fichier: 'docs/MANDATS/x.md', sections: '§1' },
    audit: { date: '2026-09-20', fichier: 'docs/AUDIT.md', sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', note: 'note' },
    plan: { fichier: 'docs/MANDATS/plan.md', correspondance: '§15' },
  },
  ouvertureDePhase: { quand: '2026-09-20', note: 'note d\'ouverture' },
  lignes: [],
  gestesH: gestesVides,
  ...partiel,
});

describe('revue.ts — rendre()', () => {
  it('CAS CONNU MAUVAIS : une ligne OBSERVEE sans sha fait échouer', () => {
    const data = donnees({
      lignes: [
        {
          id: 'R-F1', source: 'mandat §1', titre: 'titre', epreuve: 'épreuve',
          etat: 'OBSERVEE', station: 'une station', tache: ['P4-01'], phase: 4,
          // sha manquant
        },
      ],
    });
    expect(() => rendre(data)).toThrow(/OBSERVEE sans 'station' et 'sha'/);
  });

  it('CAS CONNU MAUVAIS : une ligne OBSERVEE sans station fait échouer', () => {
    const data = donnees({
      lignes: [
        {
          id: 'R-F1', source: 'mandat §1', titre: 'titre', epreuve: 'épreuve',
          etat: 'OBSERVEE', sha: 'deadbee', tache: ['P4-01'], phase: 4,
          // station manquante
        },
      ],
    });
    expect(() => rendre(data)).toThrow(/OBSERVEE sans 'station' et 'sha'/);
  });

  it('CAS CONNU MAUVAIS : une ligne NON_OBSERVEE sans manque fait échouer', () => {
    const data = donnees({
      lignes: [
        {
          id: 'R-F1', source: 'mandat §1', titre: 'titre', epreuve: 'épreuve',
          etat: 'NON_OBSERVEE', tache: ['P4-01'], phase: 4,
        },
      ],
    });
    expect(() => rendre(data)).toThrow(/NON_OBSERVEE sans champ 'manque'/);
  });

  it('CAS CONNU MAUVAIS : une ligne SANS_OBJET sans decision fait échouer', () => {
    const data = donnees({
      lignes: [
        {
          id: 'R-F1', source: 'mandat §1', titre: 'titre', epreuve: 'épreuve',
          etat: 'SANS_OBJET', tache: ['P4-01'], phase: 4,
        },
      ],
    });
    expect(() => rendre(data)).toThrow(/SANS_OBJET sans champ 'decision'/);
  });

  it('CAS CONNU MAUVAIS : un état inconnu fait échouer', () => {
    const data = donnees({
      lignes: [
        {
          id: 'R-F1', source: 'mandat §1', titre: 'titre', epreuve: 'épreuve',
          // @ts-expect-error — état invalide volontaire
          etat: 'PEUT-ETRE', tache: ['P4-01'], phase: 4,
        },
      ],
    });
    expect(() => rendre(data)).toThrow(/état inconnu/);
  });

  it('une ligne OBSERVEE avec station et sha nommés passe, et compte dans l\'en-tête', () => {
    const data = donnees({
      lignes: [
        {
          id: 'R-F1', source: 'mandat §1', titre: 'titre', epreuve: 'épreuve',
          etat: 'OBSERVEE', station: 'la station', sha: 'deadbee', tache: ['P4-01'], phase: 4,
        },
      ],
    });
    const md = rendre(data);
    expect(md).toMatch(/1 lignes — 1 OBSERVÉE\(S\), 0 NON OBSERVÉE\(S\), 0 SANS OBJET \(100 % observé\)/);
    expect(md).toContain('Preuve : station « la station », SHA `deadbee`.');
  });

  it('les comptes en tête ne sont jamais tapés à la main : recalculés depuis les lignes', () => {
    const data = donnees({
      lignes: [
        { id: 'A', source: 's', titre: 't', epreuve: 'e', etat: 'NON_OBSERVEE', manque: 'm', tache: [], phase: 0 },
        { id: 'B', source: 's', titre: 't', epreuve: 'e', etat: 'NON_OBSERVEE', manque: 'm', tache: [], phase: 0 },
        { id: 'C', source: 's', titre: 't', epreuve: 'e', etat: 'SANS_OBJET', decision: 'd', tache: [], phase: 0 },
      ],
    });
    const md = rendre(data);
    expect(md).toMatch(/3 lignes — 0 OBSERVÉE\(S\), 2 NON OBSERVÉE\(S\), 1 SANS OBJET \(0 % observé\)/);
  });

  it('les gestes du §20 sont rendus à part, hors du compte de l\'inventaire', () => {
    const data = donnees({
      lignes: [
        { id: 'A', source: 's', titre: 't', epreuve: 'e', etat: 'NON_OBSERVEE', manque: 'm', tache: [], phase: 0 },
      ],
      gestesH: [
        { id: 'H-1', geste: 'poser un secret', quand: 'Phase 2', etat: 'en_attente', note: 'note' },
      ],
    });
    const md = rendre(data);
    expect(md).toMatch(/1 lignes — 0 OBSERVÉE\(S\), 1 NON OBSERVÉE\(S\), 0 SANS OBJET/);
    expect(md).toContain('## Gestes du plan §20');
    expect(md).toContain('**H-1**');
  });
});

describe('revue.ts — le vrai instantané du dépôt', () => {
  it('docs/instantanes/revue.json engendre sans lever (règle 12 : ce qui est commité doit passer)', async () => {
    const { lireDonnees } = await import('./revue');
    expect(() => rendre(lireDonnees())).not.toThrow();
  });
});
