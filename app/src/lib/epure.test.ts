import { describe, it, expect } from 'vitest';
import { verifierEpure, MOTIFS_INTERDITS } from './epure';

/**
 * P0-06 (EPURE-01, S-1). Chaque motif est éprouvé contre un cas connu MAUVAIS (règle 17) — un
 * texte qui DOIT le déclencher — et, quand la forme s'y prête, un cas connu BON voisin qui ne
 * doit JAMAIS le déclencher (un faux positif serait le défaut inverse : une revue qui rougit sur
 * un texte propre, et qu'on finit par ignorer).
 */
describe('verifierEpure', () => {
  it('CAS CONNUS MAUVAIS : chaque motif normatif se déclenche sur un texte qui le porte', () => {
    const cas: Record<string, string> = {
      'arbitrate': 'Cette exception attend un Arbitration humain avant de continuer.',
      'deterministic-en': 'The sampling method is deterministic given the seed.',
      'deterministe-fr': 'La méthode de tirage est déterministe à partir de la graine.',
      'drawn': 'Drawn items: 12 sur 40.',
      'niveau-parenthese': 'Cette réponse est proposée (L2) par OTTO.',
      'niveau-ponctuation': 'L2 : proposé par OTTO, en attente de validation.',
      'propose-l3': 'La ligne est marquée propose (L3) pour arbitrage.',
      'not-a-copy': 'This report is not a copy of the source ledger.',
      'counted-whole-file': 'The anomaly rate is counted on the whole file, not the sample.',
      'pas-un-jugement': 'Ce n’est PAS un jugement professionnel, seulement un calcul.',
      'code-refus-tete-paragraphe': 'CTRL-04 : la population dérivée diffère de la population demandée.',
      'variable-non-remplie': 'Bonjour {nom}, votre dossier est prêt.',
    };
    for (const m of MOTIFS_INTERDITS) {
      const texte = cas[m.id];
      expect(texte, `aucun cas connu mauvais écrit pour ${m.id}`).toBeDefined();
      expect(verifierEpure(texte), `${m.id} ne s'est pas déclenché sur : ${texte}`).toContain(m.id);
    }
  });

  it('CAS CONNU BON : un texte d’audit ordinaire, sans aucun motif interdit, ne déclenche rien', () => {
    const texte = 'Le solde du compte 512000 a été rapproché au relevé bancaire du 31 décembre. '
      + 'L’écart de 120,00 € a été expliqué par une écriture en transit et documenté au papier REV-04.';
    expect(verifierEpure(texte)).toEqual([]);
  });

  it('CAS CONNU BON : "L2" seul, sans ponctuation immédiate, n’est pas confondu avec le niveau HITL', () => {
    /* Une salle « L2 » ou un nom de section qui contient la lettre L suivie d'un chiffre ne doit
       pas se confondre avec le niveau HITL — seule la forme SUIVIE de « : », « — » ou « · » l'est. */
    expect(verifierEpure('Le badge L2 a été scanné à l’entrée.')).toEqual([]);
  });

  it('CAS CONNU BON : un "(L4)" hors de la plage L0-L3 n’est jamais confondu avec le niveau HITL', () => {
    expect(verifierEpure('Salle (L4), deuxième étage.')).toEqual([]);
  });

  it('CAS CONNU BON : un code de refus interne cité EN PLEIN MILIEU d’une phrase (pas en tête) ne déclenche pas la forme "tête de paragraphe"', () => {
    expect(verifierEpure('Voir la règle nommée CTRL-04 : pour plus de détails, consultez le manuel.')).toEqual([]);
  });

  it('deux motifs présents dans le même texte sont tous les deux rapportés, une fois chacun', () => {
    const texte = 'Bonjour {nom}, cette valeur est deterministic.';
    const trouves = verifierEpure(texte);
    expect(trouves).toContain('variable-non-remplie');
    expect(trouves).toContain('deterministic-en');
    expect(trouves).toHaveLength(2);
  });
});
