/* Où trouver le navigateur. Playwright est fourni par l'environnement (variable
   PLAYWRIGHT_BROWSERS_PATH) ; à défaut on laisse Playwright résoudre lui-même.
   Écrit une seule fois : trente et un harnais ne doivent pas porter trente et
   un chemins en dur. */
import fs from 'node:fs';
const CANDIDATS = [
  process.env.OTTO_CHROMIUM,
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH
    ? fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
        .filter(d => d.startsWith('chromium'))
        .map(d => `${process.env.PLAYWRIGHT_BROWSERS_PATH}/${d}/chrome-linux/chrome`)
    : []),
].filter(Boolean).filter(p => { try { return fs.existsSync(p); } catch { return false; } });

export const NAV = CANDIDATS.length ? { executablePath:CANDIDATS[0] } : {};

/* Le fichier à ouvrir, donné en argument. Résolu en chemin ABSOLU : « file://
   ../otto-prototype.html » n'est pas une URL, et l'erreur que le navigateur
   rend alors ne le dit pas. */
import path from 'node:path';
import url from 'node:url';
export function cible(){
  const a = process.argv[2];
  if (!a){ console.error('usage : node <harnais>.mjs <chemin du fichier html>'); process.exit(2); }
  const p = path.resolve(a);
  if (!fs.existsSync(p)){ console.error('fichier introuvable : ' + p); process.exit(2); }
  return url.pathToFileURL(p).href;
}
