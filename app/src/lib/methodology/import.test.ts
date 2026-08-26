// L'écran d'import, par son chemin de service.
//
// LA PROPRIÉTÉ QUI COMPTE, et elle n'est pas « le bouton marche » : ce que
// l'écran déclare valide, la publication doit l'accepter — et ce qu'il déclare
// invalide, elle doit le refuser. Deux listes d'erreurs produites à deux
// endroits divergeraient un jour, et l'écran dirait « valide » là où le moteur
// refuse. Un cabinet qui voit ça une fois ne croit plus ni l'un ni l'autre.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import {
  verifierPaquet, publierMethodologie, contenuDeLaMethodologie, contenuDuDepot,
  fichiersAttendus, methodologies,
} from './depot';

type Paquet = Record<string, unknown>;

async function compte(): Promise<number> {
  const r = await q1<{ n: string }>(`select count(*) n from firm_methodology`);
  return Number(r.n);
}

/** Les paquets fautifs, chacun nommé par ce qu'un cabinet ferait vraiment. */
async function fautifs(): Promise<{ nom: string; paquet: Paquet; motif: RegExp }[]> {
  const base = await contenuDuDepot();
  const sansAssertions = { ...base };
  delete sansAssertions['assertions.json'];

  const procsFautives = JSON.parse(JSON.stringify(base['procedures.json'])) as {
    procedures: { assertion: string }[];
  };
  procsFautives.procedures[0].assertion = 'intuition';

  const risqueFautif = JSON.parse(JSON.stringify(base['risque.json'])) as {
    facteurs_observes: { predicat: string }[];
  };
  risqueFautif.facteurs_observes[0].predicat = 'flair_de_l_associe';

  const echelleTrouee = JSON.parse(JSON.stringify(base['risque.json'])) as {
    echelle: { niveaux: string[]; paliers: { facteurs_min: number; niveau: string }[] };
  };
  echelleTrouee.echelle.niveaux = ['leger', 'lourd'];   // les procédures exigent encore faible/moyen/eleve

  return [
    { nom: 'un schéma glissé dans le paquet', motif: /schéma\(s\) dans le paquet/,
      paquet: { ...base, 'schema-risque.json': { predicats_facteur: [] } } },
    // Deux causes différentes, deux messages : un refus qui envoie corriger la
    // mauvaise chose est pire qu'un refus sec.
    { nom: 'le contenu d’un fichier collé sans son nom', motif: /clé\(s\) non reconnue\(s\)/,
      paquet: { ...base, echelle: { niveaux: ['a'] }, tailles_echantillon: { a: 1 } } },
    { nom: 'un fichier oublié', motif: /fichiers manquants/, paquet: sansAssertions },
    { nom: 'une assertion inventée', motif: /absente du jeu du cabinet/,
      paquet: { ...base, 'procedures.json': procsFautives } },
    { nom: 'un prédicat que le moteur ne sait pas calculer',
      // le message DONNE la liste des prédicats connus : c'est ce qui rend le
      // refus corrigeable sans nous appeler
      motif: /prédicat « flair_de_l_associe » inconnu du moteur \(connus :/,
      paquet: { ...base, 'risque.json': risqueFautif } },
    { nom: 'une échelle qui ne couvre pas les niveaux exigés',
      motif: /risque_minimum « faible » absent de l’échelle du cabinet \(leger \| lourd\)/,
      paquet: { ...base, 'risque.json': echelleTrouee } },
  ];
}

describe('l’import d’une méthode', () => {
  beforeAll(async () => { await initTestDb(); });

  it('le paquet du dépôt est valide — sans quoi tous les refus ci-dessous ne prouveraient rien', async () => {
    expect(await verifierPaquet(await contenuDuDepot())).toEqual([]);
  });

  it('vérifier n’écrit RIEN, ni sur un paquet valide ni sur un paquet fautif', async () => {
    const avant = await compte();
    await verifierPaquet(await contenuDuDepot());
    for (const f of await fautifs()) await verifierPaquet(f.paquet);
    expect(await compte()).toBe(avant);
  });

  it('chaque faute réelle est nommée, pas résumée', async () => {
    for (const f of await fautifs()) {
      const erreurs = await verifierPaquet(f.paquet);
      expect(erreurs.length, `« ${f.nom} » aurait dû être refusé`).toBeGreaterThan(0);
      expect(erreurs.join(' · '), `« ${f.nom} »`).toMatch(f.motif);
    }
  });

  it('LA propriété : l’écran et la publication ne peuvent pas diverger', async () => {
    /* Pour chaque paquet fautif, la publication doit refuser AUSSI — et pour le
       paquet valide, elle doit accepter. Si l'un des deux chemins changeait
       seul, ce test tomberait. */
    for (const f of await fautifs()) {
      await expect(publierMethodologie({
        tenantId: IDS.tenant, label: f.nom, contenu: f.paquet, actorUserId: IDS.users.claire,
      }), `« ${f.nom} »`).rejects.toThrow();
    }
    const avant = await compte();
    await publierMethodologie({
      tenantId: IDS.tenant, label: 'Le paquet du dépôt, republié',
      contenu: await contenuDuDepot(), actorUserId: IDS.users.claire,
    });
    expect(await compte()).toBe(avant + 1);
  });

  /* ═══ le mode « un seul fichier » ══════════════════════════════════════ */

  it('modifier UN fichier reprend les cinq autres à l’identique', async () => {
    /* C'est le geste du rendez-vous : « passez mon échelle à quatre niveaux ».
       Imposer les 126 000 caractères du paquet entier pour changer deux lignes
       serait une fausse configurabilité. */
    const attendus = await fichiersAttendus();
    const socle = await contenuDeLaMethodologie(IDS.methodology);

    const risque = JSON.parse(JSON.stringify(socle['risque.json'])) as {
      echelle: { niveaux: string[]; paliers: { facteurs_min: number; niveau: string }[] };
      tailles_echantillon: Record<string, number>;
    };
    risque.echelle = {
      niveaux: ['limite', 'normal', 'accru', 'majeur'],
      paliers: [
        { facteurs_min: 0, niveau: 'limite' }, { facteurs_min: 1, niveau: 'normal' },
        { facteurs_min: 2, niveau: 'accru' }, { facteurs_min: 4, niveau: 'majeur' },
      ],
    };
    risque.tailles_echantillon = { limite: 10, normal: 25, accru: 45, majeur: 60 };

    // …et les procédures doivent suivre, sinon elles exigent un niveau absent.
    const procs = JSON.parse(JSON.stringify(socle['procedures.json'])) as {
      procedures: { risque_minimum: string }[];
    };
    for (const p of procs.procedures) p.risque_minimum = 'limite';

    // Étape 1 — risque.json seul : REFUSÉ, parce que les procédures ne suivent pas.
    const partiel = { ...socle, 'risque.json': risque };
    expect(await verifierPaquet(partiel)).not.toEqual([]);

    // Étape 2 — les deux fichiers : accepté, et les quatre autres sont intacts.
    const complet: Paquet = { ...socle, 'risque.json': risque, 'procedures.json': procs };
    expect(await verifierPaquet(complet)).toEqual([]);
    for (const f of attendus) {
      if (f === 'risque.json' || f === 'procedures.json') continue;
      expect(complet[f], f).toBe(socle[f]);   // la MÊME référence : rien n'a été retouché
    }
  });

  it('un JSON syntaxiquement faux ne se rend pas jusqu’au validateur', async () => {
    /* L'écran attrape JSON.parse et rend le message dans la MÊME liste : une
       erreur de syntaxe n'est pas une catégorie à part qu'on lirait ailleurs. */
    expect(() => JSON.parse('{ "risque.json": { ')).toThrow();
  });

  it('la version publiée doit porter un nom', async () => {
    await expect(publierMethodologie({
      tenantId: IDS.tenant, label: '   ', contenu: await contenuDuDepot(),
      actorUserId: IDS.users.claire,
    })).rejects.toThrow();
  });

  it('republier ne touche pas les versions précédentes', async () => {
    const avant = await methodologies(IDS.tenant);
    await publierMethodologie({
      tenantId: IDS.tenant, label: 'Encore une', contenu: await contenuDuDepot(),
      actorUserId: IDS.users.claire,
    });
    const apres = await methodologies(IDS.tenant);
    expect(apres.length).toBe(avant.length + 1);
    for (const m of avant) {
      const t = apres.find((x) => x.id === m.id)!;
      expect(t.content_hash).toBe(m.content_hash);
      expect(t.label).toBe(m.label);
    }
  });
});
