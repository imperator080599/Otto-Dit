import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';

/**
 * COMBIEN DE GESTES UN CABINET ÉTRANGER PEUT-IL ENCORE FAIRE ? (mandat du jour
 * n°3, §1.1.)
 *
 * POURQUOI CET INSTRUMENT EXISTE. `core/etancheite.test.ts` éprouve TREIZE
 * gestes et les refuse tous — et il serait facile de lire ce vert comme « les
 * services sont étanches ». Ils ne le sont pas : le dépôt compte
 * **quatre-vingt-seize** fonctions de service exportées qui prennent un acteur
 * ET écrivent. Treize refus sur quatre-vingt-seize, c'est un vert qui ment
 * (règle 13, corollaire : n'affirme jamais plus que ce que tu vérifies).
 *
 * Ce fichier compte donc, et il fait DEUX choses qu'un compte ne fait pas :
 *   · il refuse qu'une fonction NEUVE arrive sans garde et sans être écrite —
 *     la dette ne peut que rétrécir, jamais grossir en silence ;
 *   · il refuse une ligne PÉRIMÉE — une fonction inscrite comme découverte
 *     alors qu'elle a reçu sa garde, ou qui n'existe plus.
 *
 * CE QU'IL NE PROUVE PAS, ET IL LE DIT : c'est un balayage de TEXTE. Il
 * constate qu'un appel de garde figure dans le corps de la fonction ; il ne
 * dit pas que cet appel s'exécute sur le bon dossier (règle 15). Le chemin
 * réel, lui, est emprunté par `core/etancheite.test.ts` — treize fois.
 */
describe('la couverture des gardes d’étanchéité dans les services', () => {
  const dir = path.join(repoRoot(), 'app', 'src', 'lib', 'services');
  const ACTEUR = /\b(userId|actorUserId|authorId|byUserId|actorId)\b\s*[:,?]/;
  const ECRIT = /\b(insert into|update\s+[a-z_]+\s+set|delete from)\b|logEvent\(/;
  const GARDE = /assertMembre\(|assertDestinataire\(|assertSameFirm\(|isolation/;

  /**
   * LES GESTES ENCORE NUS, un par un, avec la raison pour laquelle ils le sont.
   * Tous portent la même forme : ils sont désignés par l'identifiant d'un OBJET
   * FILS (un papier, un échantillon, un écart, une pièce, une déclaration), pas
   * par celui du dossier — la garde exige donc une résolution vers le dossier,
   * qui n'est pas écrite. Ce n'est pas une excuse : c'est la description exacte
   * de ce qui reste à faire, et le compte est publié.
   */
  const NUS: Record<string, string> = Object.fromEntries([
    ['carryforward.ts::deciderReprise', 'désigné par l’identifiant d’une proposition de reprise'],
    ['circularisations.ts::envoyer', 'désigné par l’identifiant d’un tiers circularisé'],
    ['circularisations.ts::expliquerEcart', 'désigné par l’identifiant d’un tiers circularisé'],
    ['entretiens.ts::consignerComprehension', 'désigné par l’identifiant d’un entretien'],
    ['entretiens.ts::deposerTranscript', 'désigné par l’identifiant d’un entretien'],
    ['entretiens.ts::analyserTranscript', 'désigné par l’identifiant d’un entretien'],
    ['estimations.ts::demanderJustificatifs', 'désigné par l’identifiant d’une estimation'],
    ['evaluation.ts::recordEvaluationResponse', 'désigné par l’identifiant d’une évaluation'],
    ['evaluation.ts::concludeEvaluation', 'désigné par l’identifiant d’une évaluation'],
    ['evidence.ts::attachEvidenceToItem', 'désigné par l’identifiant d’une pièce'],
    ['evidence.ts::setQuarantine', 'désigné par l’identifiant d’une pièce'],
    ['extraction/ladder.ts::extractEvidence', 'désigné par l’identifiant d’une pièce'],
    ['extraction/ladder.ts::verifyExtraction', 'désigné par l’identifiant d’une extraction'],
    ['ipe.ts::utiliserRapport', 'désigné par l’identifiant d’un rapport IPE'],
    ['ipe.ts::enregistrerIpe', 'désigné par l’identifiant d’un rapport IPE'],
    ['matching.ts::recordScopeLimitation', 'désigné par l’identifiant d’un écart'],
    ['matching.ts::escalateToMisstatement', 'désigné par l’identifiant d’un écart'],
    ['reconciliation.ts::documentDifference', 'désigné par l’identifiant d’une ligne de rapprochement'],
    ['reconciliation.ts::noteReconciliationLimitation', 'désigné par l’identifiant d’un rapprochement'],
    ['requests.ts::approveSend', 'désigné par l’identifiant d’une demande'],
    ['requests.ts::pauseReminders', 'désigné par l’identifiant d’une demande'],
    ['reunions.ts::envoyer', 'désigné par l’identifiant d’une réunion ; porte déjà sa garde d’isolation par ENTITÉ'],
    ['sampling.ts::validateSampleParams', 'désigné par l’identifiant d’un échantillon'],
    ['sampling.ts::drawRevenueSample', 'désigné par l’identifiant d’un échantillon'],
    ['sox.ts::setDiStatus', 'désigné par l’identifiant d’un contrôle'],
    ['sox.ts::importInstances', 'désigné par l’identifiant d’un contrôle'],
    ['sox.ts::drawAttributeSample', 'désigné par l’identifiant d’un contrôle'],
    ['sox.ts::runAttributeTesting', 'désigné par l’identifiant d’un échantillon d’attributs'],
    ['sox.ts::resolveDeviation', 'désigné par l’identifiant d’une déviation'],
    ['sox.ts::waiveExtension', 'désigné par l’identifiant d’une déviation'],
    ['sox.ts::proposeDeficiency', 'désigné par l’identifiant d’un contrôle'],
    ['sox.ts::decideDeficiency', 'désigné par l’identifiant d’une déficience'],
    ['team.ts::answerRubric', 'désigné par l’identifiant d’une déclaration ; la règle « on remplit pour soi » le tient déjà (team.test.ts)'],
    ['team.ts::signDeclaration', 'désigné par l’identifiant d’une déclaration ; la règle « on signe pour soi » le tient déjà, service ET base'],
    ['workpapers/colonne.ts::confirmerEtRemplir', 'désigné par l’identifiant d’une colonne ajoutée'],
    ['workpapers/colonne.ts::annulerColonne', 'désigné par l’identifiant d’une colonne ajoutée'],
    ['workpapers/colonne.ts::proposerClarification', 'désigné par l’identifiant d’une colonne ajoutée'],
  ]);

  function inventaire(): { gardes: string[]; nus: string[] } {
    const gardes: string[] = []; const nus: string[] = [];
    const marcher = (d: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) marcher(p, out);
        else if (/\.ts$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
      }
      return out;
    };
    for (const f of marcher(dir).sort()) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/^export async function (\w+)\(/gm)) {
        const nom = m[1]; const i = m.index! + m[0].length;
        const j = s.indexOf('\n}\n', i);
        const corps = s.slice(i, j === -1 ? s.length : j);
        const sig = corps.includes('{') ? corps.slice(0, corps.indexOf('{')) : corps;
        if (!ACTEUR.test(sig) || !ECRIT.test(corps)) continue;
        const cle = `${path.relative(dir, f).split(path.sep).join('/')}::${nom}`;
        (GARDE.test(corps) ? gardes : nus).push(cle);
      }
    }
    return { gardes, nus };
  }

  it('l’instrument VOIT quelque chose — un balayage muet dirait « zéro nu » et aurait l’air vert', () => {
    const { gardes, nus } = inventaire();
    expect(gardes.length + nus.length, 'aucune fonction d’écriture trouvée : l’instrument mesure à côté').toBeGreaterThan(80);
    expect(gardes.length, 'aucune garde trouvée : l’instrument ne reconnaît plus les appels').toBeGreaterThan(50);
  });

  it('aucun geste NU qui ne soit ÉCRIT — la dette ne grossit pas en silence', () => {
    const { nus } = inventaire();
    const inconnus = nus.filter((n) => !(n in NUS));
    expect(inconnus, 'gestes d’écriture sans garde d’étanchéité et sans ligne écrite :\n  ' + inconnus.join('\n  ')).toEqual([]);
  });

  it('aucune ligne PÉRIMÉE — une fonction gardée, ou disparue, ne reste pas inscrite comme nue', () => {
    const { gardes, nus } = inventaire();
    const vus = new Set(nus);
    const tous = new Set([...gardes, ...nus]);
    const perimees = Object.keys(NUS).filter((k) => !vus.has(k));
    expect(perimees.map((k) => k + (tous.has(k) ? ' (elle est GARDÉE désormais)' : ' (elle n’existe plus)')),
      'lignes périmées dans la liste des gestes nus').toEqual([]);
    for (const [k, raison] of Object.entries(NUS)) {
      expect(raison.length, `${k} : inscrit sans raison écrite`).toBeGreaterThan(20);
    }
  });

  it('le COMPTE est publié — c’est lui qu’on lit, pas une impression', () => {
    const { gardes, nus } = inventaire();
    /* Au 2026-09-03, après la revue hostile n°9 : 37 nus. Le plancher
       empêche une régression silencieuse ; la liste ci-dessus porte le détail. */
    expect(gardes.length).toBeGreaterThanOrEqual(55);
    expect(nus.length).toBeLessThanOrEqual(Object.keys(NUS).length);
  });
});
