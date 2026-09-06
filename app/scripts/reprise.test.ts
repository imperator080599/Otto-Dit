import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  chaineVerify, filsDuBacklog, tableFils, tableVerify, rendre, sectionsChasse,
  TransfertIncomplet, type Entrees, type Verify,
} from './reprise';

/**
 * L'ENGENDREUR DE docs/REPRISE.md, ÉPROUVÉ CONTRE SES CAS CONNUS MAUVAIS (règle 17).
 *
 * Il existe pour REFUSER le silence : un fil sans état (absent OU VIDE), une balise non
 * remplie, un `$` littéral pris pour un motif de remplacement, une commande de `verify` jamais
 * consignée, une variante prise pour le maillon nu, une date illisible — chacun est provoqué
 * ici, et on vérifie qu'il ÉCHOUE ou qu'il s'IMPRIME, avant de vérifier qu'il passe. Le dernier
 * cas rend le vrai dépôt : il fait échouer la suite le jour où l'on ajoute un R-nn au backlog
 * sans lui donner d'état.
 */
const racine = path.resolve(import.meta.dirname, '..', '..');
const lire = (p: string): string => fs.readFileSync(path.join(racine, p), 'utf8');

const BACKLOG = `
- **R10 — un fil ancien, hors fenêtre, qui pourrait rouvrir un jour.**
- **R24 — le câblage de \`withTenant\`** (fil J3-2). Le mécanisme existe.
- **R30 — un dossier dont la sélection est superseded et qui n'a jamais re-tiré reste
  signable** (trouvé en livrant l'étage 1.2).
- **R5 — un très vieux fil** qui n'entre pas dans la fenêtre.
| N2-1 | **Les onglets d'ancrage n'existent que sur la page de poste.** Les 55 sections… | raison |
| N2-6 | ~~**Un test de la grille rougit sur la CI et pas en local**~~ — **SOLDÉ le 2026-09-03** : … | texte |
`;

const VERIFY: Verify = {
  executions: [
    { commande: 'tsc', sha: 'aaaaaaa1', quand: '2026-09-04T00:08:22Z', resultat: '0 erreur', source: 'CI local' },
    { commande: 'tsc', sha: 'bbbbbbb1', quand: '2026-09-03T00:00:00Z', resultat: '0 erreur (vieux)', source: 'local' },
    { commande: 'clics', sha: 'ccccccc1', quand: '2026-09-03T23:20:00Z', resultat: '201 étapes / 3 échecs', source: 'local' },
    { commande: 'accept', sha: 'aaaaaaa1', quand: '2026-09-04T00:21:44Z', resultat: '17 tâches, 0 FAIL', source: 'CI url' },
    { commande: 'fumee', sha: 'aaaaaaa1', quand: '2026-09-04T00:18:01Z', resultat: 'vert', source: 'CI url', variante: 'fumee:url' },
  ],
  precedent: { source: 'rapport d\'hier', nonExecutees: ['clics', 'visuel'] },
};

const entrees = (partiel: Partial<Entrees> = {}): Entrees => ({
  date: '2026-09-05T10:00:00Z',
  git: { head: 'aaaaaaa1', sujet: 'sujet', modifies: 0, amont: 'origin/main', amontSha: 'aaaaaaa1' },
  servi: { url: 'https://x.test', sha: 'aaaaaaa1', mesure: { quand: '2026-09-05T09:00:00Z', par: 'CI' } },
  fils: [
    { id: '#418', etat: 'en chasse', titre: 'le #418' },
    { id: 'R24', etat: 'ouvert' },
    { id: 'R30', etat: 'à trancher avec un auditeur' },
    { id: 'N2-1', etat: 'ouvert' },
    { id: 'N2-6', etat: 'soldé' },
  ],
  backlog: BACKLOG,
  verify: VERIFY,
  chaine: ['tsc', 'vitest', 'clics', 'fumee'],
  processus: [],
  chasse: '# titre\n\n## 1. Le #418\n\ntexte\n\n## 2. R41\n',
  gabarit: '{{DATE}}|{{HEAD}}|{{HEAD_ETAT}}|{{SERVI}}|{{FILS}}|{{PROCESSUS}}|{{VERIFY}}|{{VERIFY_NON_EXECUTEES}}|{{VERIFY_PRECEDENT}}|{{VERIFY_AUTRES}}|{{CHASSE}}',
  ...partiel,
});

describe('la chaîne verify est lue dans package.json, pas recopiée', () => {
  it('rend une commande par maillon, tsc et vitest nommés', () => {
    const c = chaineVerify('npm run db:reset && npm run demo:seed && tsc --noEmit && vitest run && npm run gardes');
    expect(c).toEqual(['db:reset', 'demo:seed', 'tsc', 'vitest', 'gardes']);
  });
  it('le vrai package.json : la chaîne finit par le parcours cliqué et la revue visuelle', () => {
    const pkg = JSON.parse(lire('app/package.json')) as { scripts: Record<string, string> };
    const c = chaineVerify(pkg.scripts.verify);
    expect(c.length).toBeGreaterThanOrEqual(15);
    expect(c).toContain('clics');
    expect(c).toContain('visuel');
    expect(c[0]).toBe('db:reset');
  });
});

describe('les fils viennent du backlog, leur état de fils.json', () => {
  it('lit un titre qui court sur deux lignes, et le gras d\'une ligne N2 (barrée ou non)', () => {
    const f = filsDuBacklog(BACKLOG);
    expect(f.map((x) => x.id)).toEqual(['R10', 'R24', 'R30', 'R5', 'N2-1', 'N2-6']);
    expect(f[2].titre).toMatch(/^un dossier dont la sélection est superseded et qui n'a jamais re-tiré reste signable$/);
    expect(f[5].titre).toBe('Un test de la grille rougit sur la CI et pas en local');
  });

  it('CAS CONNU MAUVAIS — un fil du backlog sans état REFUSE, en le nommant', () => {
    const fils = entrees().fils.filter((f) => f.id !== 'R30');
    expect(() => tableFils(fils, BACKLOG)).toThrow(TransfertIncomplet);
    expect(() => tableFils(fils, BACKLOG)).toThrow(/R30/);
  });

  it('CAS CONNU MAUVAIS — une entrée PRÉSENTE mais à `etat` VIDE (ou absent) REFUSE comme un fil oublié', () => {
    const fils = entrees().fils.map((f) => (f.id === 'R30' ? { id: 'R30', etat: '' } : f));
    expect(() => tableFils(fils, BACKLOG)).toThrow(/R30/);
    const filsSansEtat = entrees().fils.map((f) => (f.id === 'R30' ? { id: 'R30' } as { id: string; etat: string } : f));
    expect(() => tableFils(filsSansEtat, BACKLOG)).toThrow(/R30/);
  });

  it('CAS CONNU MAUVAIS — un fil hors backlog sans titre REFUSE', () => {
    const fils = [...entrees().fils, { id: 'R99', etat: 'ouvert' }];
    expect(() => tableFils(fils, BACKLOG)).toThrow(/R99/);
  });

  it('un vieux fil (R5, R10) hors fenêtre n\'exige pas d\'état ; un vieux fil qui ROUVRE (R10) retrouve son titre du backlog', () => {
    const t = tableFils([...entrees().fils, { id: 'R10', etat: 'rouvert' }], BACKLOG);
    const lignes = new Map(t.split('\n').map((l) => {
      const cols = l.split('|').map((c) => c.trim());
      return [cols[1], cols[2]];
    }));
    expect(lignes.get('R10')).toBe('un fil ancien, hors fenêtre, qui pourrait rouvrir un jour.');
    expect(t).not.toMatch(/\bR5\b/);
  });

  it('le tableau garde l\'ordre de fils.json et cite le titre du backlog, pas celui de fils.json', () => {
    const t = tableFils(entrees().fils, BACKLOG);
    const ids = t.split('\n').map((l) => l.split('|')[1].trim());
    expect(ids).toEqual(['#418', 'R24', 'R30', 'N2-1', 'N2-6']);
    expect(t).toMatch(/\| R30 \| un dossier dont la sélection/);
  });
});

describe('la chaîne verify contre le registre des exécutions', () => {
  it('CAS CONNU MAUVAIS — une commande jamais consignée est IMPRIMÉE, jamais tue', () => {
    const v = tableVerify(['tsc', 'vitest', 'clics'], VERIFY, 'aaaaaaa1');
    expect(v.table).toMatch(/npx vitest run.*AUCUNE EXÉCUTION CONSIGNÉE/);
    expect(v.nonExecutees).toEqual(['vitest', 'clics']);
    expect(v.listeNonExecutees).toMatch(/vitest.*jamais consignée/);
    expect(v.listeNonExecutees).toMatch(/clics.*ccccccc.*201 étapes/);
  });

  it('la dernière exécution l\'emporte, et une exécution sur un autre SHA est dite « PAS le HEAD »', () => {
    const v = tableVerify(['tsc', 'clics'], VERIFY, 'aaaaaaa1');
    expect(v.table).toMatch(/npx tsc --noEmit.*0 erreur \|/);
    expect(v.table).not.toMatch(/vieux/);
    expect(v.table).toMatch(/npm run clics.*ccccccc.*PAS le HEAD/);
  });

  it('CAS CONNU MAUVAIS — une exécution portant `variante` ne vaut PAS pour le maillon nu : il reste « non exécuté »', () => {
    const v = tableVerify(['fumee'], VERIFY, 'aaaaaaa1');
    expect(v.nonExecutees).toEqual(['fumee']);
    expect(v.table).toMatch(/PAS EXÉCUTÉ TEL QUEL.*fumee:url/);
    expect(v.listeNonExecutees).toMatch(/jamais exécuté TEL QUEL.*fumee:url/);
  });

  it('CAS CONNU MAUVAIS — la liste « non exécuté » précédente ne dit PAS « levée » quand seule une variante a tourné', () => {
    const v = tableVerify(['tsc', 'clics', 'fumee'], { ...VERIFY, precedent: { source: 'hier', nonExecutees: ['fumee'] } }, 'aaaaaaa1');
    expect(v.precedent).toMatch(/fumee.*toujours non exécutée TELLE QUELLE.*fumee:url/);
    expect(v.precedent).not.toMatch(/a tourné depuis/);
  });

  it('la liste « non exécuté » précédente est transcrite ligne par ligne, avec ce qui a bougé', () => {
    const v = tableVerify(['tsc', 'clics', 'visuel'], VERIFY, 'aaaaaaa1');
    expect(v.precedent).toMatch(/npm run clics.*a tourné depuis.*ccccccc.*\(pas le HEAD\)/);
    expect(v.precedent).toMatch(/npm run visuel.*toujours non exécutée/);
  });

  it('une commande du rapport précédent absente de la chaîne actuelle est marquée, pas rendue muette', () => {
    const v = tableVerify(['tsc'], { ...VERIFY, precedent: { source: 'hier', nonExecutees: ['un-maillon-disparu'] } }, 'aaaaaaa1');
    expect(v.precedent).toMatch(/un-maillon-disparu.*absente de la chaîne verify actuelle.*toujours non exécutée/);
  });

  it('une mesure hors chaîne (l\'acceptation contre l\'URL) est rapportée à part', () => {
    const v = tableVerify(['tsc'], VERIFY, 'aaaaaaa1');
    expect(v.autres).toMatch(/accept.*17 tâches/);
  });

  it('CAS CONNU MAUVAIS — un `quand` illisible REFUSE en nommant la commande et le SHA, jamais un TypeError nu', () => {
    const casse: Verify = { executions: [{ commande: 'tsc', sha: 'aaaaaaa1', quand: 'pas une date', resultat: 'x', source: 'y' }], precedent: { source: 'z', nonExecutees: [] } };
    expect(() => tableVerify(['tsc'], casse, 'aaaaaaa1')).toThrow(/quand.*illisible.*tsc/);
  });
});

describe('le rendu', () => {
  it('remplit toutes les balises, dit quand le SHA servi diffère du HEAD, liste les sections de la chasse', () => {
    const t = rendre(entrees({ servi: { url: 'https://x.test', sha: 'ddddddd1', mesure: { quand: '2026-09-05T09:00:00Z', par: 'CI' } } }));
    expect(t).not.toMatch(/\{\{/);
    expect(t).toMatch(/DIFFÈRE du HEAD/);
    expect(t).toMatch(/il y a 1 h/);
    expect(t).toMatch(/- 1\. Le #418/);
    expect(t).toMatch(/aucun processus de harnais/);
  });

  it('dit ÉGAL quand l\'URL sert HEAD, et « arbre MODIFIÉ » quand le disque n\'est pas HEAD', () => {
    const t = rendre(entrees({ git: { head: 'aaaaaaa1', sujet: 's', modifies: 3, amont: 'origin/main', amontSha: 'eeeeeee1' } }));
    expect(t).toMatch(/ÉGAL au HEAD/);
    expect(t).toMatch(/arbre MODIFIÉ \(3 fichier\(s\)/);
    expect(t).toMatch(/HEAD N'EST PAS POUSSÉ/);
  });

  it('CAS CONNU MAUVAIS — une balise inconnue du gabarit REFUSE au lieu de rester dans le rendu', () => {
    expect(() => rendre(entrees({ gabarit: '{{DATE}} {{INCONNUE}}' }))).toThrow(/INCONNUE/);
  });

  it('CAS CONNU MAUVAIS — un `$&`/`$\'` littéral dans une note ou un titre ne réinterprète PAS le gabarit', () => {
    const base = entrees();
    const t = rendre({
      ...base,
      fils: base.fils.map((f) => (f.id === '#418' ? { ...f, note: 'un total de $\' et $& et $1 littéraux' } : f)),
    });
    expect(t).toMatch(/un total de \$' et \$& et \$1 littéraux/);
    expect(t).not.toMatch(/\{\{/); // pas de fuite du gabarit dans le texte inséré
  });

  it('sectionsChasse : aucune section est dit, pas rendu vide', () => {
    expect(sectionsChasse('# rien')).toMatch(/aucune section/);
  });
});

describe('LE VRAI DÉPÔT — la garde qui fait rougir la suite le jour où un fil est ajouté sans état', () => {
  it('chaque R24+ et N2-x de docs/BACKLOG_REPORTE.md a un état NON VIDE dans docs/instantanes/fils.json, et le gabarit se remplit', () => {
    const pkg = JSON.parse(lire('app/package.json')) as { scripts: Record<string, string> };
    const e: Entrees = {
      date: '2026-09-05T10:00:00Z',
      git: { head: 'aaaaaaa1', sujet: 'test', modifies: 0, amont: null, amontSha: null },
      servi: JSON.parse(lire('docs/instantanes/servi.json')),
      fils: (JSON.parse(lire('docs/instantanes/fils.json')) as { fils: { id: string; etat: string }[] }).fils,
      backlog: lire('docs/BACKLOG_REPORTE.md'),
      verify: JSON.parse(lire('docs/instantanes/verify.json')),
      chaine: chaineVerify(pkg.scripts.verify),
      processus: [],
      chasse: lire('docs/CHASSE.md'),
      gabarit: lire('docs/reprise.src.md'),
    };
    const t = rendre(e);
    expect(t).not.toMatch(/\{\{/);
    for (const id of ['#418', 'R37', 'R41', 'N2-1']) expect(t).toMatch(new RegExp(`\\| ${id.replace('#', '#')} \\|`));
    /* Les identifiants que le fondateur demande de voir : R33 à R41, N2-x, #418. */
    for (let n = 33; n <= 41; n++) expect(t).toMatch(new RegExp(`\\| R${n} \\|`));
  });

  it('fils.json ne connaît aucun fil que le backlog ignore (sauf ceux qui portent leur titre)', () => {
    const fils = (JSON.parse(lire('docs/instantanes/fils.json')) as { fils: { id: string; titre?: string }[] }).fils;
    const backlog = new Set(filsDuBacklog(lire('docs/BACKLOG_REPORTE.md')).map((f) => f.id));
    const orphelins = fils.filter((f) => !backlog.has(f.id) && !f.titre).map((f) => f.id);
    expect(orphelins).toEqual([]);
  });

  it('toutes les exécutions de docs/instantanes/verify.json portent un `quand` lisible', () => {
    const verify = JSON.parse(lire('docs/instantanes/verify.json')) as Verify;
    for (const ex of verify.executions) expect(Number.isNaN(Date.parse(ex.quand)), `${ex.commande} : « ${ex.quand} »`).toBe(false);
  });
});
