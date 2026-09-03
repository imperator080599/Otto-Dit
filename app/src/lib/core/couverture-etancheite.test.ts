import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';

/**
 * AUCUNE FONCTION DE SERVICE PRENANT UN ACTEUR NE PEUT EXISTER SANS GARDE
 * (mandat du soir, étage 0.1 : « le compteur qui refuse la 38ᵉ devient un
 * compteur qui refuse LA PREMIÈRE »).
 *
 * CE QUI A CHANGÉ, ET POURQUOI. La version précédente comptait les fonctions
 * qui écrivaient — au sens d'un `insert into` VISIBLE dans le corps — et
 * tolérait trente-sept manques écrits un par un. Deux défauts :
 *   · le critère ratait les écritures PAR DÉLÉGATION (`joindreAnnexe` appelle
 *     `ingestEvidence`, `deposerReponse` et `statuerEcart` écrivent plus bas) —
 *     trois fonctions passaient pour des lectures ;
 *   · une liste de manques tolérés est une liste qui s'allonge.
 * Le critère est désormais le plus large possible : PRENDRE UN ACTEUR suffit à
 * devoir se garder. Les seules exceptions sont les gestes qui portent sur la
 * PERSONNE elle-même, écrits ci-dessous avec leur raison.
 *
 * CE QU'IL NE PROUVE PAS, ET IL LE DIT : c'est un balayage de TEXTE. Il
 * constate qu'un appel de garde FIGURE dans le corps — jamais qu'il s'exécute
 * sur le bon dossier (règle 15). La preuve, elle, est dans
 * `etancheite-executee.test.ts`, qui APPELLE chaque fonction avec un acteur
 * d'un autre cabinet et observe le refus.
 */
describe('la couverture des gardes d’étanchéité dans les services', () => {
  const dir = path.join(repoRoot(), 'app', 'src', 'lib', 'services');
  const ACTEUR = /\b(userId|actorUserId|authorId|byUserId|actorId)\b\s*[:;,?]/;
  const GARDE = /assertMembreDe\(|assertMembre\(|assertDestinataire\(|assertCabinet\(|assertCabinetDuLocataire\(|assertSameFirm\(|isolation/;

  /**
   * CE QUI PORTE SUR LA PERSONNE ELLE-MÊME. L'acteur n'y est pas l'AUTEUR d'un
   * geste sur l'objet d'autrui : il en est le SUJET. Il n'y a aucun dossier
   * d'un autre cabinet à atteindre, donc rien à garder par dossier.
   */
  const PAR_PERSONNE: Record<string, string> = {
    'bascule.ts::missionsParClient': 'les missions de CETTE personne : la requête est bornée par son appartenance à l’équipe',
    'replis.ts::lireReplis': 'les rangements d’écran de CETTE personne',
    'replis.ts::memoriserRepli': 'un rangement d’écran chez CETTE personne ; le locataire de la ligne vient de la personne par jointure (REPLI-03, G-23)',
    'sections.ts::mesSections': 'les sections détenues par CETTE personne',
    'team.ts::declarations': 'les déclarations d’indépendance de CETTE personne sur ce dossier',
    'team.ts::currentDeclaration': 'la déclaration courante de CETTE personne',
    'team.ts::independenceHolds': 'l’indépendance de CETTE personne tient-elle',
    'team.ts::declarationState': 'l’état de la déclaration de CETTE personne',
    'travaux.ts::mesTravaux': 'le tableau de bord de CETTE personne',
    'travaux.ts::obstaclesDeMesDossiers': 'les obstacles des dossiers de CETTE personne',
    'travaux.ts::notesOuvertesParAnciennete': 'les notes adressées à CETTE personne',
    'travaux.ts::tableauDeBord': 'le tableau de bord de CETTE personne',
    'monde-demo.ts::remettreLeMondeAZero': 'la remise à zéro de la DÉMONSTRATION : gardée par demoPublique et par l’instantané, et son acteur peut être nul (chemin système)',
  };

  function inventaire(): { gardees: string[]; nues: string[] } {
    const fichiers: string[] = [];
    const marcher = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) marcher(p);
        else if (/\.ts$/.test(e.name) && !/\.test\./.test(e.name)) fichiers.push(p);
      }
    };
    marcher(dir);
    const gardees: string[] = []; const nues: string[] = [];
    for (const f of fichiers.sort()) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/^export async function (\w+)\(/gm)) {
        const nom = m[1];
        if (/^assert/.test(nom)) continue;                 // une garde n'est pas un geste
        const i = m.index! + m[0].length - 1;
        let d = 0; let fin = -1;
        for (let k = i; k < s.length; k++) {
          if (s[k] === '(') d++;
          else if (s[k] === ')') { d--; if (d === 0) { fin = k; break; } }
        }
        if (fin === -1) continue;
        const j = s.indexOf('\n}\n', fin);
        const corps = s.slice(fin, j === -1 ? s.length : j);
        if (!ACTEUR.test(s.slice(i + 1, fin))) continue;
        const cle = `${path.relative(dir, f).split(path.sep).join('/')}::${nom}`;
        (GARDE.test(corps) ? gardees : nues).push(cle);
      }
    }
    return { gardees, nues };
  }

  it('l’instrument VOIT quelque chose — un balayage muet dirait « zéro nue » et aurait l’air vert', () => {
    const { gardees, nues } = inventaire();
    expect(gardees.length + nues.length, 'aucune fonction à acteur trouvée : l’instrument mesure à côté').toBeGreaterThan(100);
    expect(gardees.length, 'aucune garde reconnue : l’instrument ne lit plus les appels').toBeGreaterThan(95);
  });

  it('AUCUNE fonction à acteur sans garde — la première rougit, pas la trente-huitième', () => {
    const { nues } = inventaire();
    const fautives = nues.filter((n) => !(n in PAR_PERSONNE));
    expect(fautives, 'fonctions de service prenant un acteur SANS garde d’étanchéité :\n  ' + fautives.join('\n  ')).toEqual([]);
  });

  it('aucune ligne PÉRIMÉE dans la liste « par personne », et chacune porte sa raison', () => {
    const { gardees, nues } = inventaire();
    const vues = new Set(nues);
    const toutes = new Set([...gardees, ...nues]);
    const perimees = Object.keys(PAR_PERSONNE).filter((k) => !vues.has(k))
      .map((k) => k + (toutes.has(k) ? ' (elle est GARDÉE désormais)' : ' (elle n’existe plus)'));
    expect(perimees, 'lignes périmées dans la liste « par personne »').toEqual([]);
    for (const [k, raison] of Object.entries(PAR_PERSONNE)) {
      expect(raison.length, `${k} : inscrit sans raison écrite`).toBeGreaterThan(30);
    }
  });
});
