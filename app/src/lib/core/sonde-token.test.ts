import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detailAutorise } from './sonde-token';

function requete(valeur: string | null): { headers: { get(n: string): string | null } } {
  return { headers: { get: (n: string) => (n === 'x-otto-sante' ? valeur : null) } };
}

describe('sonde-token — detailAutorise', () => {
  const AVANT = process.env.OTTO_SANTE_TOKEN;
  afterEach(() => {
    if (AVANT === undefined) delete process.env.OTTO_SANTE_TOKEN;
    else process.env.OTTO_SANTE_TOKEN = AVANT;
  });

  it('refuse quand OTTO_SANTE_TOKEN est absente, même avec un en-tête présent', () => {
    delete process.env.OTTO_SANTE_TOKEN;
    expect(detailAutorise(requete('quoi-que-ce-soit'))).toBe(false);
  });

  it('refuse quand OTTO_SANTE_TOKEN est une CHAÎNE VIDE (posée, pas absente), même avec un en-tête vide (voix 2, trou de couverture comblé)', () => {
    process.env.OTTO_SANTE_TOKEN = '';
    expect(detailAutorise(requete(''))).toBe(false);
    expect(detailAutorise(requete(null))).toBe(false);
  });

  it('refuse quand aucun en-tête n’est fourni', () => {
    process.env.OTTO_SANTE_TOKEN = 'un-secret-de-32-octets-au-moins!';
    expect(detailAutorise(requete(null))).toBe(false);
  });

  it('refuse un en-tête de longueur différente', () => {
    process.env.OTTO_SANTE_TOKEN = 'un-secret-de-32-octets-au-moins!';
    expect(detailAutorise(requete('trop-court'))).toBe(false);
  });

  it('refuse un en-tête de même longueur mais faux', () => {
    process.env.OTTO_SANTE_TOKEN = 'un-secret-de-32-octets-au-moins!';
    expect(detailAutorise(requete('X'.repeat('un-secret-de-32-octets-au-moins!'.length)))).toBe(false);
  });

  it('autorise un en-tête qui correspond exactement', () => {
    process.env.OTTO_SANTE_TOKEN = 'un-secret-de-32-octets-au-moins!';
    expect(detailAutorise(requete('un-secret-de-32-octets-au-moins!'))).toBe(true);
  });
});
