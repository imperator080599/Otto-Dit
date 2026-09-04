import { describe, it, expect } from 'vitest';
import { attendreLeSha, shaServi } from './atteint';

/**
 * LA GARDE DU DÉPLOIEMENT, ÉPROUVÉE CONTRE SES CAS CONNUS MAUVAIS (règle 17).
 *
 * Elle existe parce que trois tranches poussées sur `main` ne sont jamais
 * arrivées à l'URL, et que RIEN ne l'a dit : le travail `url` de la CI ne se
 * déclenche que sur un déploiement RÉUSSI. Un instrument qui ne parle que quand
 * tout va bien ne sert à rien.
 *
 * Les cas se jouent sans réseau : `fetch` et l'horloge sont fournis.
 */
describe('le SHA poussé doit devenir le SHA servi', () => {
  const NEUF = 'a06a7f10a60dfbe3bbe42954d4af524069ed7e4c';
  const VIEUX = 'e004053f04f35495717f45b3fc0c2b197318fea4';

  /** Une instance qui sert `sha`, et qui compte les interrogations. */
  const instance = (sha: () => string | null, statut = 200) => {
    let appels = 0;
    const lire = (async () => {
      appels++;
      const s = sha();
      return {
        ok: statut === 200,
        status: statut,
        json: async () => ({ sha: s, version: { sha: s } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    return { lire, appels: () => appels };
  };

  /** Une horloge et un sommeil qui n'attendent rien : les minutes défilent seules. */
  const horloge = () => {
    let t = 0;
    return { maintenant: () => t, dormir: async (ms: number) => { t += ms; } };
  };

  it('l’instance sert déjà le SHA poussé : vert du premier coup', async () => {
    const i = instance(() => NEUF);
    const h = horloge();
    const v = await attendreLeSha({ url: 'https://x.test', attendu: NEUF, minutes: 12, lire: i.lire, ...h });
    expect(v.atteint).toBe(true);
    expect(i.appels(), 'la garde a interrogé plus d’une fois une instance déjà à jour').toBe(1);
  });

  it('CAS CONNU MAUVAIS — l’instance sert le VIEUX SHA : la garde ROUGIT, et nomme les deux', async () => {
    /* C'est exactement ce qui s'est passé : l'URL servait `e004053` pendant que
       `main` portait trois tranches de plus. Sans cette garde, aucun signal. */
    const i = instance(() => VIEUX);
    const h = horloge();
    const v = await attendreLeSha({
      url: 'https://x.test', attendu: NEUF, minutes: 2, intervalleMs: 20_000, lire: i.lire, ...h,
    });
    expect(v.atteint, 'la garde laisse passer une instance restée sur l’ancien SHA').toBe(false);
    expect(v.message).toMatch(/e004053/);
    expect(v.message).toMatch(/a06a7f1/);
    expect(v.observations.length, 'la garde n’a pas réessayé avant de conclure').toBeGreaterThan(1);
  });

  it('elle attend, et repart au vert quand le déploiement finit par arriver', async () => {
    /* Un build prend plusieurs minutes : la garde ne doit pas conclure au
       premier passage, sinon elle rougirait à chaque pousse. */
    let tours = 0;
    const i = instance(() => (++tours >= 4 ? NEUF : VIEUX));
    const h = horloge();
    const v = await attendreLeSha({
      url: 'https://x.test', attendu: NEUF, minutes: 12, intervalleMs: 20_000, lire: i.lire, ...h,
    });
    expect(v.atteint).toBe(true);
    expect(v.secondes, 'la garde n’a pas attendu le déploiement').toBeGreaterThan(0);
  });

  it('CAS CONNU MAUVAIS — une instance qui ne répond pas n’est pas un succès', async () => {
    /* Une lecture impossible n'est pas « pas encore déployé » : c'est un
       silence, et un silence n'est jamais vert. */
    const i = instance(() => null, 503);
    const h = horloge();
    const v = await attendreLeSha({
      url: 'https://x.test', attendu: NEUF, minutes: 1, intervalleMs: 20_000, lire: i.lire, ...h,
    });
    expect(v.atteint).toBe(false);
    expect(v.message).toMatch(/HTTP 503/);
  });

  it('une réponse illisible rend « aucun SHA », jamais une exception qui remonte', async () => {
    const lire = (async () => { throw new Error('getaddrinfo ENOTFOUND otto-dit.vercel.app'); }) as unknown as typeof fetch;
    const r = await shaServi('https://x.test', lire);
    expect(r.sha).toBeNull();
    expect(r.erreur).toMatch(/ENOTFOUND/);
  });
});
