import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

// P1-10 (AUD-12, « deux horloges », ADR-138) : AUCUN `new Date()` NU dans `lib/services`.
// L'HORLOGE SYSTÈME (`new Date()`) est sourde au warp de démonstration — seule l'horloge
// async de `core/clock.ts::now()` (base + décalage persisté, `app_state.key =
// 'clock_offset'`) sait qu'un temps de démo a été avancé. Un calcul métier (jours ouvrés,
// échéance, « aujourd'hui ») qui appelle `new Date()` directement répond FAUX dès qu'une
// démonstration a été mise en avance : deux fonctions du même dépôt répondraient alors
// « quel jour sommes-nous » de deux façons différentes. Trouvé et corrigé sur 7 sites
// réels cette tranche (`core/jours.ts` ×2 défauts de paramètre, `obstacles.ts`,
// `eng/[id]/acceptance/page.tsx`, `workpapers/lifecycle.ts`, `flows/enrichir.ts`,
// `sox.ts::documenterProcedureOe`, `gouvernance.ts::syntheseComite`) — ce test fige le
// résultat pour qu'un huitième site ne se réintroduise pas en silence (règle 17).
//
// CE QUE CE BALAYAGE NE FAIT PAS, ET LE DIT (règle 19) :
//   · Il n'interdit QUE la forme SANS ARGUMENT (`new Date()`) — `new Date(x)` (construire
//     depuis une valeur déjà connue, ex. un ISO string ou un `.getTime()` déjà dérivé de
//     `now()`) reste légitime et n'est jamais signalé.
//   · Il ne comprend pas TypeScript — un simple retrait de commentaires (// et /* *\/) et
//     de contenu de chaînes/gabarits avant de chercher le motif, pour ne pas se tromper
//     sur un commentaire qui PARLE de `new Date()` sans l'appeler.
//   · Il ne couvre QUE `lib/services` — le SQL `now()` des colonnes `created_at`/
//     `updated_at` par défaut, et l'horloge système ailleurs dans le dépôt (scripts de
//     harnais, `clock.ts` lui-même) sont hors de son périmètre, volontairement.

const RACINE = path.join(__dirname, '..', '..', '..');
const SERVICES = path.join(RACINE, 'src', 'lib', 'services');

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Retire les commentaires (// et /* *\/) SANS toucher au contenu des chaînes/gabarits —
 *  un `new Date()` mentionné en commentaire ne doit jamais compter comme un vrai appel. */
function sansCommentaires(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c; out += c; i++;
      while (i < code.length && code[i] !== q) { out += code[i]; if (code[i] === '\\') { i++; out += code[i] ?? ''; } i++; }
      if (i < code.length) { out += code[i]; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const NEW_DATE_NU = /\bnew\s+Date\s*\(\s*\)/g;

function sitesNus(code: string): number[] {
  const propre = sansCommentaires(code);
  return [...propre.matchAll(NEW_DATE_NU)].map((m) => propre.slice(0, m.index).split('\n').length);
}

describe('pas de `new Date()` nu dans lib/services (P1-10, AUD-12, deux horloges, ADR-138)', () => {
  it('aucun fichier de lib/services n’appelle `new Date()` sans argument', () => {
    const trouves: string[] = [];
    for (const f of fichiers(SERVICES)) {
      const code = fs.readFileSync(f, 'utf8');
      const rel = path.relative(path.join(RACINE, 'src', 'lib', 'services'), f).split(path.sep).join('/');
      for (const ligne of sitesNus(code)) trouves.push(`${rel}:${ligne}`);
    }
    expect(trouves, `\`new Date()\` nu trouvé — utiliser \`await now()\` de core/clock :\n  ${trouves.join('\n  ')}`).toEqual([]);
  });

  it('cas connu MAUVAIS (règle 17) : un `new Date()` nu est détecté', () => {
    const code = `
export function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}
`;
    expect(sitesNus(code)).toEqual([3]);
  });

  it('cas connu BON (règle 17, le régression-guard) : `new Date(arg)` n’est jamais signalé', () => {
    const code = `
export async function echeance(depuis: Date): Promise<string> {
  const d = new Date(depuis.getTime() + 10 * 86400000);
  return d.toISOString().slice(0, 10);
}
`;
    expect(sitesNus(code)).toEqual([]);
  });

  it('un `new Date()` mentionné DANS UN COMMENTAIRE n’est pas une fausse alerte', () => {
    const code = `
export function ok(): void {
  // avant P1-10 ce calcul appelait new Date() ici, corrigé depuis
}
`;
    expect(sitesNus(code)).toEqual([]);
  });
});
