import fs from 'node:fs';
import path from 'node:path';

// LE MODE « IA RÉELLE » EXIGE UNE CLÉ — ET CE FICHIER NE LA LIT JAMAIS.
// Il répond à UNE question : « app/.env.local contient-il une ligne
// ANTHROPIC_API_KEY=<quelque chose> ? » — présence, jamais valeur. La clé
// n'est lue que par l'application au moment d'appeler le modèle (ADR-020) ;
// elle ne passe ni par un shell, ni par un argument, ni par un journal.

/**
 * @param {string} dossierApp le répertoire app/ (celui qui porte .env.local)
 * @returns {'presente'|'vide'|'fichier_absent'}
 */
export function etatCleIa(dossierApp) {
  const fichier = path.join(dossierApp, '.env.local');
  if (!fs.existsSync(fichier)) return 'fichier_absent';
  for (const brute of fs.readFileSync(fichier, 'utf8').split('\n')) {
    const ligne = brute.trim();
    if (ligne.startsWith('#')) continue;
    const m = ligne.match(/^ANTHROPIC_API_KEY\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '') ? 'presente' : 'vide';
  }
  return 'vide';
}
