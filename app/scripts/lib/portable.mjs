import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// LANCER UN PROCESSUS QUI MARCHE AUSSI SUR WINDOWS.
//
// Le défaut qui a créé ce fichier : `spawn('npx', …)` échoue sur Windows avec
// `ENOENT`, parce que `npx` y est un script `npx.cmd` et qu'un spawn sans
// shell ne résout pas les `.cmd`. (Et depuis le correctif de sécurité de Node
// CVE-2024-27980, spawner un `.cmd` sans shell est de toute façon refusé.)
// La réponse n'est pas « ajouter shell:true » — le shell ouvre la porte aux
// problèmes de guillemets — mais NE PLUS PASSER PAR `npx` DU TOUT : chaque
// outil (next, tsx) est un fichier JavaScript dans node_modules, et le Node
// qui exécute déjà ce script sait l'exécuter directement, sur tout système :
//     spawn(process.execPath, [binaireDe('next', racine), 'build'])
//
// CE FICHIER EST EN JAVASCRIPT NU, sans dépendance : le lanceur de
// démonstration l'importe AVANT de savoir si `npm install` a été lancé.
//
// Chaque fonction prend la plateforme EN PARAMÈTRE (défaut : celle du
// processus) : la branche Windows se teste depuis Linux en la passant —
// c'est ce que fait tests/portable.test.ts. Sans cela, la moitié Windows de
// ce fichier serait du code que personne n'exécute avant un utilisateur.

export function estWindows(plateforme = process.platform) {
  return plateforme === 'win32';
}

/**
 * Le VRAI fichier JavaScript du binaire d'un paquet — lu dans le champ `bin`
 * de son package.json, pas deviné : si une version déplace le fichier, on le
 * suit. Retourne null si le paquet (ou son binaire) est absent : l'appelant
 * décide du message — le lanceur de démonstration dit « lancez npm install »,
 * un harnais de développement lève.
 */
export function binaireDe(paquet, racine) {
  const manifeste = path.join(racine, 'node_modules', paquet, 'package.json');
  let bin;
  try {
    bin = JSON.parse(fs.readFileSync(manifeste, 'utf8')).bin;
  } catch {
    return null;
  }
  const relatif = typeof bin === 'string' ? bin : bin?.[paquet] ?? Object.values(bin ?? {})[0];
  if (!relatif) return null;
  const absolu = path.join(racine, 'node_modules', paquet, relatif);
  return fs.existsSync(absolu) ? absolu : null;
}

/**
 * Faut-il `detached: true` ? Sur POSIX, oui : cela crée un GROUPE de
 * processus, et tuer `-pid` tue le groupe entier — sans quoi `next-server`
 * survit à son lanceur et garde le port. Sur Windows, `detached` détache
 * l'enfant de la console (nouvelle fenêtre potentielle, Ctrl-C ne le joint
 * plus) et n'aide en rien : l'arbre se tue avec `taskkill /T`.
 */
export function groupeDetache(plateforme = process.platform) {
  return !estWindows(plateforme);
}

/**
 * La commande qui tue un arbre de processus — DESCRIPTION pure, pour que la
 * branche Windows soit testable depuis Linux. `tuerArbre` l'exécute.
 */
export function commandeTuer(pid, signal = 'SIGTERM', plateforme = process.platform) {
  return estWindows(plateforme)
    ? { exe: 'taskkill', args: ['/pid', String(pid), '/T', '/F'] }
    : { groupe: -pid, signal };
}

/** Tue l'arbre de processus de `pid`. Silencieux si déjà mort. */
export function tuerArbre(pid, signal = 'SIGTERM') {
  if (!pid) return;
  const c = commandeTuer(pid, signal);
  try {
    if (c.exe) spawnSync(c.exe, c.args, { stdio: 'ignore' });
    else process.kill(c.groupe, c.signal);
  } catch { /* déjà mort */ }
}

/**
 * Enchaîner des commandes dans un conseil affiché. `&&` n'existe pas dans le
 * PowerShell livré avec Windows (5.1) ; `;` y marche partout. Un conseil que
 * le terminal de l'utilisateur refuse de coller est pire que pas de conseil.
 */
export function enchaine(commandes, plateforme = process.platform) {
  return commandes.join(estWindows(plateforme) ? '; ' : ' && ');
}

/**
 * Préfixer une commande d'une variable d'environnement PORT. La syntaxe
 * `PORT=3100 npm run demo` est du shell POSIX ; PowerShell la refuse avec une
 * erreur de parsing. C'est exactement le genre de conseil qui a déjà menti
 * une fois (ADR-095) : il doit être écrit pour le terminal qui le lira.
 */
export function avecPort(port, commande, plateforme = process.platform) {
  return estWindows(plateforme)
    ? `$env:PORT=${port}; ${commande}`
    : `PORT=${port} ${commande}`;
}

/** La réinstallation propre des dépendances, dans la syntaxe du terminal. */
export function commandeReinstalle(plateforme = process.platform) {
  return estWindows(plateforme)
    ? 'Remove-Item -Recurse -Force node_modules; npm install'
    : 'rm -rf node_modules && npm install';
}

/** Où trouver Node, dit pour la plateforme. */
export function conseilNode(plateforme = process.platform) {
  return estWindows(plateforme)
    ? 'installez Node 20 LTS depuis https://nodejs.org puis rouvrez le terminal'
    : 'installez une version récente de Node (par exemple `nvm install 20 && nvm use 20`)';
}

/**
 * Le Chromium des harnais visuels. Trois cas : la variable d'environnement
 * commande ; le chemin du conteneur de développement s'il existe ; sinon
 * `undefined` et Playwright résout SON navigateur installé — le seul chemin
 * qui existe sur la machine d'un utilisateur Windows ou macOS. L'ancien
 * défaut `/opt/pw-browsers/chromium` codé en dur était un chemin
 * POSIX-seulement qui échouait ailleurs sans dire pourquoi.
 */
export function cheminChromium(env = process.env) {
  if (env.PLAYWRIGHT_CHROMIUM) return env.PLAYWRIGHT_CHROMIUM;
  const conteneur = '/opt/pw-browsers/chromium';
  return fs.existsSync(conteneur) ? conteneur : undefined;
}

/**
 * Classer l'échec de la création de base pour donner à CHAQUE cause son
 * message. Le premier utilisateur Windows a reçu « vérifiez que rien
 * n'utilise app/.data » pour un exécutable introuvable : il a cherché un
 * conflit de base qui n'existait pas. Une cause non reconnue est 'inconnue'
 * — rapportée comme telle, jamais déguisée en cause probable.
 */
export function causeEchecBase(sortie) {
  if (/ENOSPC|no space left/i.test(sortie)) return 'espace';
  if (/Aborted\(\)|EBUSY|EPERM|resource busy|being used by another process/i.test(sortie)) return 'tenue';
  if (/Cannot find module|ERR_MODULE_NOT_FOUND/i.test(sortie)) return 'casse';
  return 'inconnue';
}

/** Le message quand Playwright ne trouve aucun navigateur. */
export function conseilChromium() {
  return 'aucun navigateur trouvé pour le harnais : lancez `npx playwright install chromium` '
    + '(une seule fois), ou donnez un chemin via la variable PLAYWRIGHT_CHROMIUM.';
}
