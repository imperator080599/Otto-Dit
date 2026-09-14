import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { auditer } from './ia-flag-source';

// LA GARDE DE RÉGRESSION — règle 17 : éprouvée contre un cas connu mauvais avant d'être
// crue. Voir l'en-tête de `ia-flag-source.ts` pour ce que cette garde prouve et ne prouve pas.

describe('aucun usage brut de la classe ai-flag hors du composant IaFlag (R59/ADR-103)', () => {
  it('CAS CONNU MAUVAIS : un fichier fabriqué qui écrit className="ai-flag" en dur est détecté', () => {
    const sonde = path.join(import.meta.dirname, '..', '..', 'src', 'app', '_sonde-ai-flag-brut.tsx');
    fs.writeFileSync(sonde, [
      "export function SondeBrute() {",
      "  return <span className=\"ai-flag\">contenu jamais passé par IaFlag</span>;",
      "}",
      '',
    ].join('\n'));
    try {
      const sites = auditer();
      const trouve = sites.find((s) => s.fichier.endsWith('_sonde-ai-flag-brut.tsx'));
      expect(trouve, 'le fichier de sonde devrait être détecté comme usage brut').toBeTruthy();
    } finally {
      fs.rmSync(sonde, { force: true }); // fichier de sonde supprimé avant le commit (règle 24)
    }
  });

  it('zéro usage brut dans le vrai balayage — tout écran passe par IaFlag', () => {
    const sites = auditer();
    expect(sites, `usage(s) brut(s) : ${sites.map((s) => `${s.fichier}:${s.ligne}`).join(' · ')}`).toEqual([]);
  });
});
