import { describe, it, expect } from 'vitest';
import { joursOuvresAvant, joursOuvresEntre } from '@/lib/core/jours';

describe('les jours ouvrés', () => {
  /* Repères : 2026-09-03 est un JEUDI. */
  const jeudi = new Date('2026-09-03T10:00:00Z');

  it('saute les samedis et dimanches en arrière', () => {
    expect(joursOuvresAvant(1, jeudi).toISOString().slice(0, 10)).toBe('2026-09-02');
    /* Trois jours ouvrés avant jeudi = lundi ; cinq = le jeudi précédent. */
    expect(joursOuvresAvant(3, jeudi).toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(joursOuvresAvant(5, jeudi).toISOString().slice(0, 10)).toBe('2026-08-27');
  });

  it('compte à rebours ce que la pose a compté à l’aller — les deux sens s’accordent', () => {
    for (const n of [1, 2, 3, 6, 9, 14]) {
      expect(joursOuvresEntre(joursOuvresAvant(n, jeudi), jeudi), `${n} jours ouvrés`).toBe(n);
    }
  });

  it('CAS CONNUS MAUVAIS : un week-end ne compte pas, et le futur ne compte pas', () => {
    /* Du vendredi au lundi : UN jour ouvré, pas trois. */
    expect(joursOuvresEntre(new Date('2026-08-28T09:00:00Z'), new Date('2026-08-31T09:00:00Z'))).toBe(1);
    /* Samedi → dimanche : zéro. */
    expect(joursOuvresEntre(new Date('2026-08-29T09:00:00Z'), new Date('2026-08-30T09:00:00Z'))).toBe(0);
    /* Une note posée « demain » a zéro jour d'ancienneté, pas un nombre négatif. */
    expect(joursOuvresEntre(new Date('2026-09-04T09:00:00Z'), jeudi)).toBe(0);
    /* Une date illisible ne fait pas planter l'écran : zéro, dit tel quel. */
    expect(joursOuvresEntre('pas une date', jeudi)).toBe(0);
  });

  it('NE CONNAÎT AUCUN JOUR FÉRIÉ, et c’est écrit : le 1er mai 2026 (vendredi) compte', () => {
    /* Du jeudi 30 avril au lundi 4 mai : vendredi 1er mai est compté comme
       ouvré. La règle ne prétend pas connaître le calendrier d'un cabinet. */
    expect(joursOuvresEntre(new Date('2026-04-30T09:00:00Z'), new Date('2026-05-04T09:00:00Z'))).toBe(2);
  });
});
