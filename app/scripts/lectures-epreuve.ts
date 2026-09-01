import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// LE GARDE DES LECTURES S'ÉPROUVE CONTRE LE DÉFAUT QU'IL EXISTE POUR ATTRAPER
// (règle 17) : on retire la ligne qui rend le consentement d'un participant —
// exactement ce qu'un balayage de prose avait fait sur huit écrans — et on
// vérifie que `npm run lectures` le dénonce.

const ici = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ici, '..');
const cible = path.join(APP, 'src', 'app', 'eng', '[id]', 'processus', 'page.tsx');

function lectures(): { code: number; sortie: string } {
  try {
    const sortie = execFileSync('npx', ['tsx', path.join(ici, 'lectures.ts')], { cwd: APP, encoding: 'utf8' });
    return { code: 0, sortie };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const depart = lectures();
if (depart.code !== 0) {
  console.error('  ÉCHEC  l’arbre n’est pas propre au départ — éprouver sur un arbre sale ne prouve rien');
  console.error(depart.sortie);
  process.exit(1);
}

const original = fs.readFileSync(cible, 'utf8');
const MARQUE = 'itv.participants.map';
if (!original.includes(MARQUE)) {
  console.error(`  ÉCHEC  le point d’injection (${MARQUE}) n’existe plus — l’épreuve doit être remise à jour, pas retirée`);
  process.exit(1);
}

let echec = 0;
try {
  /* On retire le bloc <p> qui porte la lecture, comme le balayage l'avait fait. */
  fs.writeFileSync(cible, original.replace(
    /\n {10}<p className="faint">\n {12}\{itv\.participants\.map[\s\S]*?\n {10}<\/p>/, ''));
  if (fs.readFileSync(cible, 'utf8').includes(MARQUE)) {
    console.error('  ÉCHEC  l’injection n’a rien retiré — le motif ne colle plus au fichier');
    echec = 1;
  } else {
    const apres = lectures();
    if (apres.code !== 0 && apres.sortie.includes('itv.participants.map')) {
      console.log('  ok     une lecture retirée d’un écran est dénoncée');
      console.log(`         ${apres.sortie.split('\n').filter((l) => l.includes('participants')).join(' ')}`);
    } else {
      console.error('  ÉCHEC  la règle N’A RIEN VU — une lecture peut disparaître en silence');
      echec = 1;
    }
  }
} finally {
  fs.writeFileSync(cible, original);
}

const fin = lectures();
if (fin.code !== 0) {
  console.error('  ÉCHEC  l’arbre n’a pas été remis en état');
  echec = 1;
}
process.exit(echec === 0 ? 0 : 1);
