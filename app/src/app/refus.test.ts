import { describe, it, expect } from 'vitest';
import { separerCode } from './refus';

// D.6 point 1 : le code technique ne doit jamais rester en première position
// d'un message vu par un auditeur. `separerCode` est la seule chose qui le
// garantit (le bandeau l'utilise pour l'affichage) — donc c'est elle qu'on
// éprouve, avec de vrais codes du dépôt et, RÈGLE 17, un cas connu où il n'y
// a PAS de code à trouver.
describe('separerCode', () => {
  it.each([
    ['PROG-07 : cette procédure est déjà déplanifiée.', 'PROG-07', 'cette procédure est déjà déplanifiée.'],
    ['TIRAGE-04 : le tirage dépend du grand livre.', 'TIRAGE-04', 'le tirage dépend du grand livre.'],
    ['ANA-01 : la variation exige une explication.', 'ANA-01', 'la variation exige une explication.'],
    ['COL-01 : le fichier désigné n’est pas une pièce de ce dossier.', 'COL-01', 'le fichier désigné n’est pas une pièce de ce dossier.'],
    ['IMPOSSIBLE : ce geste n’a pas de sens ici.', 'IMPOSSIBLE', 'ce geste n’a pas de sens ici.'],
    ['REQ-02 : une réponse existe déjà pour cette demande.', 'REQ-02', 'une réponse existe déjà pour cette demande.'],
  ])('extrait le code en tête de « %s »', (erreur, codeAttendu, phraseAttendue) => {
    const { code, phrase } = separerCode(erreur);
    expect(code).toBe(codeAttendu);
    expect(phrase).toBe(phraseAttendue);
  });

  it('un message SANS code en tête ne produit aucun code — cas connu mauvais (règle 17)', () => {
    const erreur = 'Ce dossier est scellé : l’atelier de test ne s’y modifie plus.';
    const { code, phrase } = separerCode(erreur);
    // « Ce » commence par une majuscule mais n'est pas un bloc TOUT capitales :
    // aucune extraction ne doit avoir lieu, la phrase reste intacte.
    expect(code).toBeNull();
    expect(phrase).toBe(erreur);
  });

  it('un message qui ne commence pas par une majuscule ne produit aucun code', () => {
    const erreur = 'ancre : référence vide';
    const { code, phrase } = separerCode(erreur);
    expect(code).toBeNull();
    expect(phrase).toBe(erreur);
  });

  it('un message sans « : » du tout ne produit aucun code', () => {
    const erreur = 'D&I conclusion required';
    const { code, phrase } = separerCode(erreur);
    expect(code).toBeNull();
    expect(phrase).toBe(erreur);
  });

  it('conserve un « : » supplémentaire à l’intérieur de la phrase après le code', () => {
    const erreur = 'PROG-05 : la date choisie doit être : postérieure à celle du programme.';
    const { code, phrase } = separerCode(erreur);
    expect(code).toBe('PROG-05');
    expect(phrase).toBe('la date choisie doit être : postérieure à celle du programme.');
  });

  it('conserve intacte une phrase qui contient une URL ou une heure après le code', () => {
    const url = separerCode('PROG-07 : voir https://exemple.test:8080/x');
    expect(url.code).toBe('PROG-07');
    expect(url.phrase).toBe('voir https://exemple.test:8080/x');
    const heure = separerCode('TIRAGE-02 : reçu à 14:32, hors délai.');
    expect(heure.code).toBe('TIRAGE-02');
    expect(heure.phrase).toBe('reçu à 14:32, hors délai.');
  });

  it('un `erreur` NON-STRING (règle 13, revue hostile F3 — `?erreur=` répété dans l’URL rend un tableau) ne fait jamais planter l’affichage', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { code, phrase } = separerCode(['a', 'b'] as any);
    expect(code).toBeNull();
    expect(phrase).toBe('a,b');
  });
});
