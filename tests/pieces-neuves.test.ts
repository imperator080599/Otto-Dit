import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { choisirCibles, type LigneCible } from '../app/scripts/dataset/pieces-neuves';
// @ts-expect-error module JavaScript nu, sans types — voulu (scripts/demo)
import { etatCleIa } from '../app/scripts/demo/cle.mjs';

// LE MODE « IA RÉELLE » (ADR-105) : ses règles se testent SANS réseau et sans
// clé. Le choix des cibles est pur ; la présence de la clé se lit sans jamais
// lire la valeur ; le jeu engendré, s'il est là, doit être JAMAIS VU du cache
// de rejeu — sinon le rejeu serait indiscernable d'une vraie lecture.

const ligne = (piece: string, montantCents: number, docs = 1, qteFacturee?: number): LigneCible => ({
  piece, tiers: 'Client Test SARL', montantCents, dateGl: '2025-06-15', docs, qteFacturee,
});

describe('le choix des lignes cibles (pur)', () => {
  it('distribue les sept rôles sur des lignes distinctes, pièges à deux documents d\'abord', () => {
    const cibles = choisirCibles([
      ligne('FA2025-0001', 900_00), ligne('FA2025-0002', 800_00, 2, 40),
      ligne('FA2025-0003', 700_00, 2, 25), ligne('FA2025-0004', 600_00),
      ligne('FA2025-0005', 500_00), ligne('FA2025-0006', 400_00),
      ligne('FA2025-0007', 300_00), ligne('FA2025-0008', 200_00),
    ]);
    expect(cibles).toHaveLength(7);
    const parRole = Object.fromEntries(cibles.map((c) => [c.role, c.ligne.piece]));
    expect(parRole['piege-quantite']).toBe('FA2025-0002');    // 2 documents + quantité connue
    expect(parRole['piege-signature']).toBe('FA2025-0003');
    expect(new Set(cibles.map((c) => c.ligne.piece)).size).toBe(7); // jamais deux rôles sur une ligne
  });

  it('les écritures manuelles (OD, SIT) ne reçoivent jamais de pièce neuve', () => {
    const cibles = choisirCibles([
      ligne('OD-2025-089', 900_00), ligne('SIT-2025-12', 800_00), ligne('FA2025-0001', 700_00),
    ]);
    expect(cibles.every((c) => c.ligne.piece.startsWith('FA'))).toBe(true);
  });
});

describe('la présence de la clé, lue sans lire la valeur', () => {
  const dossierTemp = (contenu: string | null): string => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'otto-cle-'));
    if (contenu !== null) fs.writeFileSync(path.join(d, '.env.local'), contenu);
    return d;
  };
  it('fichier absent, clé vide, clé en commentaire : refusés ; clé présente : acceptée', () => {
    expect(etatCleIa(dossierTemp(null))).toBe('fichier_absent');
    expect(etatCleIa(dossierTemp('AUTRE=1\n'))).toBe('vide');
    expect(etatCleIa(dossierTemp('ANTHROPIC_API_KEY=\n'))).toBe('vide');
    expect(etatCleIa(dossierTemp('# ANTHROPIC_API_KEY=sk-fictive\n'))).toBe('vide');
    expect(etatCleIa(dossierTemp('ANTHROPIC_API_KEY=sk-fictive-0000\n'))).toBe('presente');
    expect(etatCleIa(dossierTemp('ANTHROPIC_API_KEY="sk-fictive-0000"\n'))).toBe('presente');
  });
});

describe('le jeu engendré, s\'il est là, est cohérent et JAMAIS VU', () => {
  const dossier = path.join(__dirname, '..', 'dataset', 'pieces_neuves');
  const veriteF = path.join(dossier, 'verite.json');
  const disponible = fs.existsSync(veriteF);

  it.skipIf(!disponible)('chaque fichier annoncé existe, et aucune empreinte n\'est dans le cache de rejeu', () => {
    const verites = JSON.parse(fs.readFileSync(veriteF, 'utf8')) as { filename: string; role: string; truth: Record<string, string> }[];
    expect(verites.length).toBeGreaterThanOrEqual(6);
    const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dataset', 'fixtures', 'evidence_index.json'), 'utf8')) as { sha256: string }[];
    const connues = new Set(index.map((e) => e.sha256));
    for (const v of verites) {
      const chemin = path.join(dossier, v.filename);
      expect(fs.existsSync(chemin), `${v.filename} annoncé mais absent`).toBe(true);
      const empreinte = createHash('sha256').update(fs.readFileSync(chemin)).digest('hex');
      expect(connues.has(empreinte), `${v.filename} est déjà dans le cache de rejeu`).toBe(false);
    }
  });

  it.skipIf(!disponible)('les pièges annoncés piègent vraiment (le document contredit sa ligne)', () => {
    const verites = JSON.parse(fs.readFileSync(veriteF, 'utf8')) as {
      role: string; ligne: { montantGl: string; dateGl: string }; truth: Record<string, string>;
    }[];
    const roles = new Set(verites.map((v) => v.role));
    for (const attendu of ['normale-scan', 'piege-montant', 'piege-date', 'piege-quantite', 'piege-signature']) {
      expect(roles.has(attendu), `rôle manquant : ${attendu}`).toBe(true);
    }
    const montant = verites.find((v) => v.role === 'piege-montant')!;
    const glCents = Math.round(Number(montant.ligne.montantGl.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
    expect(Number(montant.truth.totalNetCents)).not.toBe(glCents);
    const date = verites.find((v) => v.role === 'piege-date')!;
    expect(date.truth.invoiceDate.slice(0, 4)).not.toBe(date.ligne.dateGl.slice(0, 4));
    const normale = verites.find((v) => v.role === 'normale-scan')!;
    const glNormale = Math.round(Number(normale.ligne.montantGl.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
    expect(Number(normale.truth.totalNetCents)).toBe(glNormale);
  });
});
