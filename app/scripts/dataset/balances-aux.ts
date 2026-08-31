import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';

// LES BALANCES AUXILIAIRES ÂGÉES DE LA CLIENTE (point 1, ADR-107) — quatre
// exports que la direction d'Altiverre (fictive) fournit : clients et
// fournisseurs, N (31/12/2025) et N-1 (31/12/2024), avec l'ANCIENNETÉ en cinq
// tranches (le FEC ne porte AUCUN lettrage : la balance âgée ne peut venir
// que de l'export du client, et elle se RAPPROCHE au grand livre).
//
// Déterministe et ANCRÉ AU FEC : les totaux par tiers de l'exercice N sont
// LUS dans le FEC (mouvements 411/401 par compte auxiliaire), les totaux N-1
// somment exactement aux à-nouveaux agrégés (940 000,00 clients ;
// 610 000,00 fournisseurs). Régénérer produit les mêmes octets.
//
//   cd app && npm run dataset:balances-aux

const TRANCHES = ['non_echu', 'j0_30', 'j31_60', 'j61_90', 'plus_90'] as const;

/** Répartir un total (centimes) selon des parts, l'arrondi porté par la
 *  première tranche — la somme des tranches vaut EXACTEMENT le total. */
function repartir(totalCents: number, parts: number[]): number[] {
  const brut = parts.map((p) => Math.round(totalCents * p));
  brut[0] += totalCents - brut.reduce((s, v) => s + v, 0);
  return brut;
}

function lireFec(): { clients: Map<string, { label: string; cents: number }>; fournisseurs: Map<string, { label: string; cents: number }> } {
  const fec = fs.readFileSync(path.join(repoRoot(), 'dataset', '999888777FEC20251231.txt'), 'latin1');
  const clients = new Map<string, { label: string; cents: number }>();
  const fournisseurs = new Map<string, { label: string; cents: number }>();
  for (const ligne of fec.split('\n').slice(1)) {
    const c = ligne.split('\t');
    if (c.length < 13 || c[0] === 'AN' || !c[6]) continue;
    const cents = Math.round(Number(c[11].replace(',', '.')) * 100) - Math.round(Number(c[12].replace(',', '.')) * 100);
    if (c[4].startsWith('411')) {
      const cur = clients.get(c[6]) ?? { label: c[7], cents: 0 };
      cur.cents += cents;
      clients.set(c[6], cur);
    } else if (c[4].startsWith('401')) {
      const cur = fournisseurs.get(c[6]) ?? { label: c[7], cents: 0 };
      cur.cents -= cents; // solde créditeur fournisseur, en positif
      fournisseurs.set(c[6], cur);
    }
  }
  return { clients, fournisseurs };
}

const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function ecrire(fichier: string, lignes: { aux: string; label: string; tranches: number[] }[]) {
  const dossier = path.join(repoRoot(), 'dataset', 'balances_aux');
  fs.mkdirSync(dossier, { recursive: true });
  const corps = [
    'compte_aux;intitule;non_echu;0_30j;31_60j;61_90j;plus_90j',
    ...lignes.map((l) => `${l.aux};${l.label};${l.tranches.map(eur).join(';')}`),
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(dossier, fichier), corps, 'utf8');
  return lignes.reduce((s, l) => s + l.tranches.reduce((a, b) => a + b, 0), 0);
}

function main() {
  const { clients, fournisseurs } = lireFec();

  /* ── CLIENTS N (31/12/2025) — les totaux par tiers viennent du FEC.
     Vieillissement DÉGRADÉ par rapport à N-1 : la part au-delà de 90 jours
     monte, concentrée sur C004 (Groupe Immovance) et C006 (Peyrelle). */
  const vieillesN: Record<string, number[]> = {
    C004: [0.30, 0.20, 0.12, 0.10, 0.28],
    C006: [0.34, 0.22, 0.12, 0.10, 0.22],
  };
  const normaleN = [0.55, 0.25, 0.12, 0.05, 0.03];
  const clientsN = [...clients.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([aux, v]) => ({ aux, label: v.label, tranches: repartir(v.cents, vieillesN[aux] ?? normaleN) }));
  const totalClientsN = ecrire('clients_2025.csv', clientsN);

  /* ── CLIENTS N-1 (31/12/2024) — somme EXACTE aux à-nouveaux (940 000,00).
     C008 et C012 absents (APPARUS en N) ; C013 et C014 n'existent qu'ici
     (DISPARUS) ; C004 petit en N-1 (déplacement de part en N). Vieillissement
     sain : ~4 % au-delà de 90 jours. */
  const saineN1 = [0.62, 0.24, 0.08, 0.04, 0.02];
  const clientsN1Cents: [string, string, number][] = [
    ['C001', 'Bâtiplace SARL', 55000_00],
    ['C002', 'Verrería del Sur SL', 96000_00],
    ['C003', 'Menuiseries Chartier SAS', 71000_00],
    ['C004', 'Groupe Immovance SA', 89000_00],
    ['C005', 'Façades Rhodaniennes SARL', 102000_00],
    ['C006', 'Constructions Peyrelle SAS', 148000_00],
    ['C007', 'Atelier Lumière & Verre EURL', 46000_00],
    ['C009', 'Négoce Vitrages Réunis SARL', 84000_00],
    ['C010', 'Promoteurs du Forez SA', 90000_00],
    ['C011', 'Serres & Vérandas Alpines SAS', 19000_00],
    ['C013', 'Vitrages du Bocage SARL', 118000_00],
    ['C014', 'Serrurerie Naves EURL', 22000_00],
  ];
  const totalClientsN1 = ecrire('clients_2024.csv',
    clientsN1Cents.map(([aux, label, cents]) => ({ aux, label, tranches: repartir(cents, saineN1) })));

  /* ── FOURNISSEURS N — totaux du FEC ; vieillissement normal. */
  const fournisseursN = [...fournisseurs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([aux, v]) => ({ aux, label: v.label, tranches: repartir(v.cents, [0.60, 0.28, 0.08, 0.03, 0.01]) }));
  const totalFournisseursN = ecrire('fournisseurs_2025.csv', fournisseursN);

  /* ── FOURNISSEURS N-1 — somme EXACTE aux à-nouveaux (610 000,00).
     F008 (Intérim Provalor) absent (APPARU en N) ; F009 n'existe qu'ici
     (DISPARU). F001 domine les deux exercices : la dépendance au fournisseur
     unique se lit dans la concentration, pas dans un mouvement. */
  const fournisseursN1Cents: [string, string, number][] = [
    ['F001', 'Float Glass Industries GmbH', 425000_00],
    ['F002', 'Silices de Loire SARL', 21000_00],
    ['F003', 'Profilés Aluminium Roussel SAS', 34000_00],
    ['F004', 'Énergie Rhône Distribution SA', 17000_00],
    ['F005', 'Transports Cantagrel SARL', 9000_00],
    ['F006', 'Maintenance Fours Vidal EURL', 12000_00],
    ['F007', 'Assurances Mutuelles du Verre', 51000_00],
    ['F009', 'Cartonnages Estival SARL', 41000_00],
  ];
  const totalFournisseursN1 = ecrire('fournisseurs_2024.csv',
    fournisseursN1Cents.map(([aux, label, cents]) => ({ aux, label, tranches: repartir(cents, [0.66, 0.24, 0.06, 0.03, 0.01]) })));

  /* LES ATTACHES, VÉRIFIÉES À LA GÉNÉRATION : N-1 = à-nouveaux du FEC. */
  if (totalClientsN1 !== 940000_00) throw new Error(`clients 2024 : ${totalClientsN1} ≠ 94000000 (à-nouveaux)`);
  if (totalFournisseursN1 !== 610000_00) throw new Error(`fournisseurs 2024 : ${totalFournisseursN1} ≠ 61000000 (à-nouveaux)`);

  fs.writeFileSync(path.join(repoRoot(), 'dataset', 'balances_aux', 'README.md'), [
    '# Balances auxiliaires âgées — exports de la cliente (synthétiques)',
    '',
    'Quatre fichiers que la direction d\'Altiverre (fictive) fournit : clients et',
    'fournisseurs, au 31/12/2025 (N) et au 31/12/2024 (N-1), avec l\'ancienneté en cinq',
    'tranches. Le FEC ne porte aucun lettrage : la balance âgée vient de l\'export du',
    'client et se RAPPROCHE au grand livre — les totaux N par tiers sont ceux du FEC,',
    'les totaux N-1 somment exactement aux à-nouveaux (940 000,00 € clients,',
    '610 000,00 € fournisseurs).',
    '',
    'Ils se chargent sur l\'écran « Balances auxiliaires » (point 1, ADR-107).',
    'Régénération : `cd app && npm run dataset:balances-aux` (déterministe).',
    '',
    'Toutes les données sont fabriquées (règle 2).',
    '',
  ].join('\n'));

  console.log(`balances auxiliaires : clients N ${eur(totalClientsN)} € (${clientsN.length} tiers) · `
    + `N-1 940 000,00 € · fournisseurs N ${eur(totalFournisseursN)} € (${fournisseursN.length} tiers) · N-1 610 000,00 €`);
}

main();
