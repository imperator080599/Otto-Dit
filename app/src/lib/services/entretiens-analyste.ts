import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';
import { sha256 } from '@/lib/core/hash';
import { costUsd } from '@/lib/core/pricing';
import { demoPublique } from '@/lib/core/demo-public';

// L'ANALYSTE DE TRANSCRIPT (point 2, ADR-108) — le SEUL endroit du module
// processus où un modèle intervient, et il est CADRÉ : il produit des ÉCARTS
// CANDIDATS entre ce qui est DIT et ce qui est DOCUMENTÉ, jamais une
// conclusion. Les OMISSIONS d'abord — un contrôle décrit à l'oral et absent
// de la documentation, une étape documentée passée sous silence — c'est le
// cas le plus fréquent et le plus utile ; les contradictions ensuite.
// Même règle que l'échelle d'extraction (ADR-012, ADR-105) : rejeu enregistré
// par défaut (zéro réseau), adaptateur réel sur choix explicite, garde de
// budget en amont, ai_run à chaque appel.

export type GenreEcart = 'omission_doc' | 'omission_orale' | 'contradiction';

export interface EcartCandidat {
  kind: GenreEcart;
  citation: string;
  description: string;
}

export interface ReponseAnalyste {
  ecarts: EcartCandidat[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}

export interface AnalysteTranscript {
  readonly name: string;
  /** null = ce transcript est inconnu de l'adaptateur (rejeu sans fixture). */
  analyser(transcript: string, documentation: string): Promise<ReponseAnalyste | null>;
}

/** Le texte est normalisé AVANT toute empreinte et tout stockage : un même
 *  entretien collé depuis Windows ou Linux doit produire le même dossier. */
export function normaliserTranscript(brut: string): string {
  return brut.replace(/\r\n/g, '\n').trim();
}

/** Rejeu enregistré — `dataset/fixtures/<fichier>.json` (par défaut `entretiens.json`), clé
 *  sha256 du texte normalisé. Un transcript inconnu rend null : le service REFUSE alors en le
 *  disant, il n'invente pas d'écarts.
 *
 *  GÉNÉRALISÉ POUR LE WALKTHROUGH (§4 point 3, R74) : le fichier de fixtures est un paramètre,
 *  pas une constante — un walkthrough et un entretien de processus partagent la MÊME forme
 *  d'appel (transcript + documentation → écarts candidats, COST.md §1 quater le dit noir sur
 *  blanc), donc la MÊME classe, jamais une copie qui divergerait en silence (règle 6). Seuls les
 *  fixtures et — pour l'adaptateur réel ci-dessous — le prompt système changent par domaine. */
export class RejeuAnalyste implements AnalysteTranscript {
  readonly name = 'mock';
  constructor(private readonly fichierFixtures = 'entretiens.json') {}
  async analyser(transcript: string): Promise<ReponseAnalyste | null> {
    let fixtures: { sha256: string; ecarts: EcartCandidat[] }[] = [];
    try {
      fixtures = JSON.parse(fs.readFileSync(
        path.join(repoRoot(), 'dataset', 'fixtures', this.fichierFixtures), 'utf8'));
    } catch {
      return null;                       // pas de fixtures : transcript inconnu
    }
    const trouve = fixtures.find((f) => f.sha256 === sha256(normaliserTranscript(transcript)));
    if (!trouve) return null;
    return { ecarts: trouve.ecarts, model: 'replay-fixture', tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 };
  }
}

const SYSTEM_ENTRETIEN = [
  'Tu compares le transcript d\'un entretien d\'audit à la documentation structurée du processus.',
  'Tu produis des ÉCARTS CANDIDATS, jamais une conclusion, jamais un avis, jamais une recommandation.',
  'Cherche D\'ABORD les omissions : un contrôle ou une vérification décrits à l\'oral et absents de la',
  'documentation (omission_doc) ; une étape ou un contrôle documentés jamais évoqués (omission_orale).',
  'Puis les contradictions : ce qui est dit contredit ce qui est documenté (fréquence, acteur, outil).',
  'Chaque écart cite le passage du transcript concerné (champ citation, vide pour une omission orale).',
  'Aucun écart n\'est aussi une réponse valable : n\'invente rien pour remplir.',
].join(' ');

/** §4 point 3 (R74) : le PENDANT walkthrough du prompt ci-dessus — même forme d'appel
 *  (COST.md §1 quater), un vocabulaire de contrôle interne plutôt que de processus. */
const SYSTEM_WALKTHROUGH = [
  'Tu compares le transcript d\'un walkthrough de contrôle interne (l\'enregistrement où le',
  'propriétaire du contrôle DÉCRIT ce qu\'il fait réellement) aux tâches déjà documentées de ce',
  'contrôle. Tu produis des ÉCARTS CANDIDATS, jamais une conclusion, jamais un avis, jamais une',
  'recommandation, jamais un jugement sur le design ou l\'efficacité du contrôle.',
  'Cherche D\'ABORD les omissions : une étape ou une vérification décrite dans le walkthrough et',
  'absente des tâches documentées (omission_doc) ; une tâche documentée jamais évoquée dans le',
  'walkthrough (omission_orale). Puis les contradictions : ce qui est décrit contredit une tâche',
  'documentée (fréquence, acteur, seuil, système utilisé).',
  'Chaque écart cite le passage du transcript concerné (champ citation, vide pour une omission orale).',
  'Aucun écart n\'est aussi une réponse valable : n\'invente rien pour remplir.',
].join(' ');

/** Adaptateur réel (Anthropic Messages API, appel d'outil forcé — le modèle
 *  ne peut pas répondre en prose). Activé par OTTO_TRANSCRIPT_ADAPTER=anthropic
 *  (entretiens) ou OTTO_WALKTHROUGH_ADAPTER=anthropic (walkthroughs) + ANTHROPIC_API_KEY,
 *  la MÊME clé, partagée — refuse de tourner sans les deux.
 *
 *  `system`/les deux libellés sont des PARAMÈTRES (§4 point 3, R74) : même appel Anthropic,
 *  même schéma d'outil, seul le vocabulaire du domaine change — jamais une seconde classe qui
 *  divergerait en silence (règle 6). */
export class AnthropicAnalyste implements AnalysteTranscript {
  readonly name = 'anthropic';
  constructor(
    private readonly model = process.env.OTTO_TRANSCRIPT_MODEL ?? 'claude-sonnet-5',
    private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? '',
    private readonly baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
    private readonly system = SYSTEM_ENTRETIEN,
    private readonly labelDocumentation = 'DOCUMENTATION DU PROCESSUS',
    private readonly labelTranscript = 'TRANSCRIPT DE L\'ENTRETIEN',
  ) {}

  async analyser(transcript: string, documentation: string): Promise<ReponseAnalyste | null> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY absente — l\'analyste de transcript réel ne peut pas tourner (DEPLOY.md)');
    }
    const started = Date.now();
    const tool = {
      name: 'signaler_ecarts',
      description: 'Signale les écarts candidats entre le transcript et la documentation.',
      input_schema: {
        type: 'object',
        properties: {
          ecarts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['omission_doc', 'omission_orale', 'contradiction'] },
                citation: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['kind', 'description'],
            },
          },
        },
        required: ['ecarts'],
      },
    };
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: this.system,
        tool_choice: { type: 'tool', name: 'signaler_ecarts' },
        tools: [tool],
        messages: [{
          role: 'user',
          content: `${this.labelDocumentation} :\n${documentation}\n\n${this.labelTranscript} :\n${normaliserTranscript(transcript)}`,
        }],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`analyste de transcript HTTP ${res.status}: ${body.slice(0, 300)}`);
    const json = JSON.parse(body) as {
      content: { type: string; name?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const call = json.content.find((c) => c.type === 'tool_use' && c.name === 'signaler_ecarts');
    const input = (call?.input ?? { ecarts: [] }) as { ecarts?: EcartCandidat[] };
    const brut = Array.isArray(input.ecarts) ? input.ecarts : [];
    const RANG: Record<GenreEcart, number> = { omission_doc: 0, omission_orale: 1, contradiction: 2 };
    const ecarts = brut
      .filter((e) => e && typeof e.description === 'string' && e.description.trim() && RANG[e.kind] !== undefined)
      .map((e) => ({ kind: e.kind, citation: typeof e.citation === 'string' ? e.citation : '', description: e.description.trim() }))
      .sort((a, b) => RANG[a.kind] - RANG[b.kind]);    // les omissions d'abord, par contrat
    const tokensIn = json.usage?.input_tokens ?? 0;
    const tokensOut = json.usage?.output_tokens ?? 0;
    return {
      ecarts, model: this.model, tokensIn, tokensOut,
      costUsd: costUsd(this.model, tokensIn, tokensOut),
      latencyMs: Date.now() - started,
    };
  }
}

export function getAnalyste(): AnalysteTranscript {
  if (demoPublique()) return new RejeuAnalyste();          // URL publique : rejeu, point final (ADR-109)
  const choix = process.env.OTTO_TRANSCRIPT_ADAPTER ?? 'mock';
  if (choix === 'mock') return new RejeuAnalyste();
  if (choix === 'anthropic') return new AnthropicAnalyste();
  throw new Error(`OTTO_TRANSCRIPT_ADAPTER « ${choix} » inconnu — 'mock' (rejeu enregistré) ou 'anthropic'`);
}

/** §4 point 3 (R74) : le SÉLECTEUR walkthrough, INDÉPENDANT de `OTTO_TRANSCRIPT_ADAPTER` — le
 *  fondateur doit pouvoir ouvrir l'un sans l'autre, chaque surface sa propre bascule (demande du
 *  fondateur, 2026-09-13). `ANTHROPIC_API_KEY` reste PARTAGÉE : ce n'est pas un second secret,
 *  seul le sélecteur et les fixtures de rejeu sont distincts. */
export function getAnalysteWalkthrough(): AnalysteTranscript {
  if (demoPublique()) return new RejeuAnalyste('walkthroughs.json');   // URL publique : rejeu, point final (ADR-109)
  const choix = process.env.OTTO_WALKTHROUGH_ADAPTER ?? 'mock';
  if (choix === 'mock') return new RejeuAnalyste('walkthroughs.json');
  if (choix === 'anthropic') {
    return new AnthropicAnalyste(
      process.env.OTTO_WALKTHROUGH_MODEL ?? process.env.OTTO_TRANSCRIPT_MODEL ?? 'claude-sonnet-5',
      process.env.ANTHROPIC_API_KEY ?? '',
      process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
      SYSTEM_WALKTHROUGH,
      'TÂCHES DÉJÀ DOCUMENTÉES DU CONTRÔLE',
      'TRANSCRIPT DU WALKTHROUGH',
    );
  }
  throw new Error(`OTTO_WALKTHROUGH_ADAPTER « ${choix} » inconnu — 'mock' (rejeu enregistré) ou 'anthropic'`);
}
