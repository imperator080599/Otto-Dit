import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';

// LE BALAYAGE DE LA COUVERTURE DES GARDES D'ÉTANCHÉITÉ — extrait de
// `couverture-etancheite.test.ts` (P2-01, AUD-04) pour que `/api/sante` rejoue EXACTEMENT le
// même calcul que le test, jamais une copie qui pourrait diverger (même discipline que
// REGISTRE_REFUS/LIBELLES, mais ici la duplication est évitable — un seul fichier de logique,
// deux appelants).
//
// CE QUE CE BALAYAGE NE FAIT PAS, ET LE DIT (règle 19) : c'est un balayage de TEXTE. Il
// constate qu'un appel de garde FIGURE dans le corps — jamais qu'il s'exécute sur le bon
// dossier (règle 15). La preuve d'exécution vit dans `etancheite-executee.test.ts`.

export const ACTEUR = /\b(userId|actorUserId|authorId|byUserId|actorId|verifierId|contactId)\b\s*[:;,?]/;
export const GARDE = /assertMembreDe\(|assertMembre\(|assertDestinataire\(|assertCabinet\(|assertCabinetDuLocataire\(|assertSameFirm\(|isolation|assertRequestDeLEntite\(|assertItemDeLaDemandeEtDeLEntite\(/;

/**
 * CE QUI PORTE SUR LA PERSONNE ELLE-MÊME. L'acteur n'y est pas l'AUTEUR d'un geste sur
 * l'objet d'autrui : il en est le SUJET. Il n'y a aucun dossier d'un autre cabinet à
 * atteindre, donc rien à garder par dossier.
 */
export const PAR_PERSONNE: Record<string, string> = {
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
  'travaux.ts::echantillonsDeMesDossiers': 'même patron qu’obstaclesDeMesDossiers, même jointure engagement_member : les lignes d’échantillon restant à conclure des dossiers de CETTE personne (R62)',
  'travaux.ts::notesOuvertesParAnciennete': 'les notes adressées à CETTE personne',
  'travaux.ts::tableauDeBord': 'le tableau de bord de CETTE personne',
  'monde-demo.ts::remettreLeMondeAZero': 'la remise à zéro de la DÉMONSTRATION : gardée par demoPublique et par l’instantané, et son acteur peut être nul (chemin système)',
  'notifications.ts::notificationsPourApprobation': 'les éléments IA non validés que CETTE personne doit approuver, sur ses propres dossiers (can_sign) — même jointure engagement_member que mesTravaux',
};

export function inventaire(): { gardees: string[]; nues: string[] } {
  const dir = path.join(repoRoot(), 'app', 'src', 'lib', 'services');
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
