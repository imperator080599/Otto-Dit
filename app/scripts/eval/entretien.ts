import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import { loadEnvLocal, keyFingerprint } from '../../src/lib/core/env';
import { AnthropicAnalyste, RejeuAnalyste, normaliserTranscript } from '../../src/lib/services/entretiens-analyste';

// LA PREUVE QUE L'ANALYSTE RÉEL TOURNE (point 2, ADR-108) —
// `npm run eval:entretien`. Le chemin 'anthropic' de l'analyste de transcript
// ne doit pas être une branche que rien n'exécute jamais (règle 13) : ce
// harnais l'appelle UNE fois sur le transcript du jeu de données, mesure
// coût/latence, et compare les natures d'écarts trouvées au rejeu enregistré
// (la référence). Il REFUSE de tourner sans clé — rien ne se dépense par
// accident — et n'écrit rien en base : c'est une mesure, pas un dossier.

async function main() {
  loadEnvLocal();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY absent de app/.env.local — rien ne sera dépensé, rien ne sera mesuré.');
    process.exit(1);
  }
  console.log(`clé : ${keyFingerprint()} (empreinte, jamais la valeur)`);

  const transcript = fs.readFileSync(
    path.join(repoRoot(), 'dataset', 'entretiens', 'transcript-revenus-2025.txt'), 'utf8');
  const processus = JSON.parse(fs.readFileSync(
    path.join(repoRoot(), 'dataset', 'processus', 'revenus_2025.json'), 'utf8')) as {
    nom: string;
    etapes: { code: string; libelle: string; acteur: string; systeme: string; entrees: string; sorties: string }[];
    controles: { code: string; etape: string; libelle: string; frequence: string; proprietaire: string }[];
  };
  const documentation = [
    `PROCESSUS : ${processus.nom}`,
    'ÉTAPES :',
    ...processus.etapes.map((e) => `- ${e.code} ${e.libelle} | acteur : ${e.acteur} | système : ${e.systeme} | entrées : ${e.entrees} | sorties : ${e.sorties}`),
    'CONTRÔLES :',
    ...processus.controles.map((c) => `- ${c.code} (étape ${c.etape}) ${c.libelle} | fréquence : ${c.frequence} | propriétaire : ${c.proprietaire}`),
  ].join('\n');

  const reference = await new RejeuAnalyste().analyser(normaliserTranscript(transcript));
  if (!reference) {
    console.error('le rejeu ne connaît pas ce transcript — la fixture et le fichier ont divergé (dataset/entretiens/README.md).');
    process.exit(1);
  }

  const reel = await new AnthropicAnalyste().analyser(transcript, documentation);
  if (!reel) { console.error('réponse vide'); process.exit(1); }

  console.log(`\nmodèle ${reel.model} · ${reel.tokensIn} jetons entrés, ${reel.tokensOut} sortis · ${reel.costUsd.toFixed(4)} $ · ${(reel.latencyMs / 1000).toFixed(1)} s\n`);
  for (const e of reel.ecarts) {
    console.log(`- [${e.kind}] ${e.description}${e.citation ? `\n    « ${e.citation} »` : ''}`);
  }
  const attendus = reference.ecarts.map((e) => e.kind);
  const trouves = reel.ecarts.map((e) => e.kind);
  const retrouves = attendus.filter((k) => trouves.includes(k));
  console.log(`\nnatures attendues (rejeu enregistré) : ${attendus.join(', ')}`);
  console.log(`retrouvées par le modèle : ${retrouves.length}/${attendus.length} · écarts supplémentaires proposés : ${Math.max(0, trouves.length - retrouves.length)}`);
  console.log('\nRAPPEL : des écarts CANDIDATS — dans le produit, une personne statue chacun (L2).');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
