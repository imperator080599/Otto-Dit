// LE GABARIT DU PAPIER DE TRAVAIL EST DE LA MÉTHODE.
//
// Le format d'un papier n'est ni un nom ni un calcul : c'est de la
// PRÉSENTATION, donc la signature du cabinet — le papier entre dans SON
// dossier, se fait relire par SON réviseur, s'inspecte chez lui. Le laisser
// dans un pack TypeScript exigeait un déploiement pour changer une colonne :
// contraire au principe du produit, à l'endroit le plus visible pour un client.
//
// Ce fichier vérifie les deux choses qui comptent : qu'un cabinet peut vraiment
// changer son gabarit, et que le moteur REFUSE ce qu'il ne saurait pas remplir.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { racineDepot, importerValideur } from './catalogue';
import type { Catalogue } from './types';
import { gabarit, colonnes, referencePapier } from './catalogue';

type Papier = Record<string, unknown>;
type Valideur = { chargerCatalogue: (r: string) => Catalogue };

function methodeAvecPapier(muter: (p: Record<string, never>) => void): string {
  const src = path.join(racineDepot(), 'methodology');
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'otto-papier-'));
  fs.mkdirSync(path.join(dst, 'methodology'));
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, 'methodology', f));
  const chemin = path.join(dst, 'methodology', 'papier.json');
  const pap = JSON.parse(fs.readFileSync(chemin, 'utf8')) as Papier;
  muter(pap as unknown as Record<string, never>);
  fs.writeFileSync(chemin, JSON.stringify(pap, null, 2));
  return dst;
}

async function charger(racine: string): Promise<Catalogue> {
  const m = await importerValideur<Valideur>(racineDepot());
  return m.chargerCatalogue(racine);
}

/* Raccourcis typés sur le gabarit muté. */
type G = {
  papiers: { substantif: {
    sections: { bloc: string; titre: string }[];
    tableaux: Record<string, { colonnes: { champ: string; titre: string }[] }>;
  } };
  annexes: Record<string, string>;
  mise_en_page: Record<string, number | number[]>;
  referencement: { modele: string; lettres_par_poste: Record<string, string> };
  entete: Record<string, string | null>;
};

describe('le gabarit du papier appartient au cabinet', () => {
  /* ═══ 1. un cabinet change vraiment sa signature ═════════════════════ */

  it('réordonner et renommer les sections se charge sans toucher au code', async () => {
    const racine = methodeAvecPapier((p) => {
      const g = p as unknown as G;
      const s = g.papiers.substantif.sections;
      // « Évaluation » remonte avant « Exceptions », et tout est renommé.
      const evalIdx = s.findIndex((x) => x.bloc === 'evaluation');
      const [ev] = s.splice(evalIdx, 1);
      s.splice(s.findIndex((x) => x.bloc === 'exceptions'), 0, ev);
      for (const x of s) x.titre = `§ ${x.titre.toUpperCase()}`;
    });
    const cat = await charger(racine);
    const ordre = gabarit(cat, 'substantif').sections.map((x) => x.bloc);
    expect(ordre.indexOf('evaluation')).toBeLessThan(ordre.indexOf('exceptions'));
    expect(gabarit(cat, 'substantif').sections[0].titre.startsWith('§ ')).toBe(true);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('retirer une colonne et réordonner les autres se charge', async () => {
    const racine = methodeAvecPapier((p) => {
      const g = p as unknown as G;
      const c = g.papiers.substantif.tableaux.echantillon.colonnes;
      g.papiers.substantif.tableaux.echantillon.colonnes = [
        c.find((x) => x.champ === 'date')!,
        c.find((x) => x.champ === 'piece')!,
        { champ: 'montant', titre: 'Montant (HT)' },
        c.find((x) => x.champ === 'anomalies')!,
      ];
    });
    const cat = await charger(racine);
    const cols = colonnes(cat, 'substantif', 'echantillon');
    expect(cols.map((c) => c.champ)).toEqual(['date', 'piece', 'montant', 'anomalies']);
    expect(cols[2].titre).toBe('Montant (HT)');
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un autre plan de classement donne d’autres références', async () => {
    const racine = methodeAvecPapier((p) => {
      const g = p as unknown as G;
      g.referencement.modele = '{lettre}{sequence}/{version}';
      g.referencement.lettres_par_poste = { REVENUE: 'R', _defaut: 'X' };
    });
    const cat = await charger(racine);
    expect(referencePapier(cat, { poste: 'REVENUE', sequence: 3, code: 'REV-01', version: 2 })).toBe('R03/2');
    // un poste non listé prend la lettre de secours, il n'est pas laissé sans référence
    expect(referencePapier(cat, { poste: 'INCONNU', sequence: 1, code: 'X', version: 1 })).toBe('X01/1');
    fs.rmSync(racine, { recursive: true, force: true });
  });

  /* ═══ 2. LA FRONTIÈRE, DANS LES DEUX SENS ═══════════════════════════ */

  it('un bloc NOMMÉ que le moteur ne sait pas remplir arrête l’assemblage', async () => {
    /* Sans ce refus, la section sortirait VIDE et rien ne le dirait. */
    const racine = methodeAvecPapier((p) => {
      (p as unknown as G).papiers.substantif.sections.push({ bloc: 'synthese_du_associe', titre: 'Synthèse' });
    });
    await expect(charger(racine)).rejects.toThrow(/bloc « synthese_du_associe » inconnu du moteur/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un bloc IMPLÉMENTÉ que le gabarit ne nomme pas arrête l’assemblage', async () => {
    /* L'autre sens, et c'est le plus sournois : le bloc disparaîtrait du
       papier — un contrôle de fiabilité effectué mais absent du document. */
    const racine = methodeAvecPapier((p) => {
      const g = p as unknown as G;
      g.papiers.substantif.sections = g.papiers.substantif.sections.filter((x) => x.bloc !== 'verification');
    });
    await expect(charger(racine)).rejects.toThrow(/« verification » est implémenté mais absent du gabarit/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('une colonne qui nomme un champ non relevé arrête l’assemblage', async () => {
    const racine = methodeAvecPapier((p) => {
      (p as unknown as G).papiers.substantif.tableaux.echantillon.colonnes.push(
        { champ: 'marge_brute', titre: 'Marge' },
      );
    });
    await expect(charger(racine)).rejects.toThrow(/champ « marge_brute » non relevé/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un bloc en double arrête l’assemblage', async () => {
    const racine = methodeAvecPapier((p) => {
      const g = p as unknown as G;
      g.papiers.substantif.sections.push({ bloc: 'conclusion', titre: 'Conclusion (bis)' });
    });
    await expect(charger(racine)).rejects.toThrow(/bloc\(s\) en double/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('une variable de référence inconnue arrête l’assemblage', async () => {
    /* Elle laisserait un trou dans la référence, et une référence trouée ne se
       cherche pas dans un dossier. */
    const racine = methodeAvecPapier((p) => {
      (p as unknown as G).referencement.modele = '{lettre}-{millesime}-{sequence}';
    });
    await expect(charger(racine)).rejects.toThrow(/variable « millesime » inconnue/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  /* ═══ 3. CE QUI NE SE RETIRE PAS, et pourquoi ═══════════════════════ */

  it('retirer une annexe est refusé — c’est elle qui rend l’export relisible sans OTTO', async () => {
    const racine = methodeAvecPapier((p) => {
      delete (p as unknown as G).annexes.signoffs;
    });
    await expect(charger(racine)).rejects.toThrow(/annexe « signoffs » sans libellé/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('la RENOMMER, en revanche, est à vous', async () => {
    const racine = methodeAvecPapier((p) => {
      (p as unknown as G).annexes.signoffs = 'Pièce jointe 5 — Approbations';
    });
    const cat = await charger(racine);
    expect(cat.papier.annexes.signoffs).toBe('Pièce jointe 5 — Approbations');
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un corps de texte illisible imprimé est refusé', async () => {
    const racine = methodeAvecPapier((p) => {
      (p as unknown as G).mise_en_page.corps_pt = 3;
    });
    await expect(charger(racine)).rejects.toThrow(/corps_pt.*hors bornes/);
    fs.rmSync(racine, { recursive: true, force: true });
  });

  it('un logo chargé depuis le réseau est refusé — un papier auto-portant ne dépend d’aucun serveur', async () => {
    const racine = methodeAvecPapier((p) => {
      (p as unknown as G).entete.logo_data_uri = 'https://cabinet.example/logo.png';
    });
    await expect(charger(racine)).rejects.toThrow(/data: URI/);
    fs.rmSync(racine, { recursive: true, force: true });
  });
});
