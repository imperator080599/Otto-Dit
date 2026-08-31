import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';
import { sha256 } from '@/lib/core/hash';
import { costUsd } from '@/lib/core/pricing';

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

/** Rejeu enregistré — dataset/fixtures/entretiens.json, clé sha256 du texte
 *  normalisé. Un transcript inconnu rend null : le service REFUSE alors en le
 *  disant, il n'invente pas d'écarts. */
export class RejeuAnalyste implements AnalysteTranscript {
  readonly name = 'mock';
  async analyser(transcript: string): Promise<ReponseAnalyste | null> {
    let fixtures: { sha256: string; ecarts: EcartCandidat[] }[] = [];
    try {
      fixtures = JSON.parse(fs.readFileSync(
        path.join(repoRoot(), 'dataset', 'fixtures', 'entretiens.json'), 'utf8'));
    } catch {
      return null;                       // pas de fixtures : transcript inconnu
    }
    const trouve = fixtures.find((f) => f.sha256 === sha256(normaliserTranscript(transcript)));
    if (!trouve) return null;
    return { ecarts: trouve.ecarts, model: 'replay-fixture', tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 };
  }
}

const SYSTEM = [
  'Tu compares le transcript d\'un entretien d\'audit à la documentation structurée du processus.',
  'Tu produis des ÉCARTS CANDIDATS, jamais une conclusion, jamais un avis, jamais une recommandation.',
  'Cherche D\'ABORD les omissions : un contrôle ou une vérification décrits à l\'oral et absents de la',
  'documentation (omission_doc) ; une étape ou un contrôle documentés jamais évoqués (omission_orale).',
  'Puis les contradictions : ce qui est dit contredit ce qui est documenté (fréquence, acteur, outil).',
  'Chaque écart cite le passage du transcript concerné (champ citation, vide pour une omission orale).',
  'Aucun écart n\'est aussi une réponse valable : n\'invente rien pour remplir.',
].join(' ');

/** Adaptateur réel (Anthropic Messages API, appel d'outil forcé — le modèle
 *  ne peut pas répondre en prose). Activé par OTTO_TRANSCRIPT_ADAPTER=anthropic
 *  + ANTHROPIC_API_KEY ; refuse de tourner sans les deux. */
export class AnthropicAnalyste implements AnalysteTranscript {
  readonly name = 'anthropic';
  constructor(
    private readonly model = process.env.OTTO_TRANSCRIPT_MODEL ?? 'claude-sonnet-5',
    private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? '',
    private readonly baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
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
        system: SYSTEM,
        tool_choice: { type: 'tool', name: 'signaler_ecarts' },
        tools: [tool],
        messages: [{
          role: 'user',
          content: `DOCUMENTATION DU PROCESSUS :\n${documentation}\n\nTRANSCRIPT DE L'ENTRETIEN :\n${normaliserTranscript(transcript)}`,
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
  const choix = process.env.OTTO_TRANSCRIPT_ADAPTER ?? 'mock';
  if (choix === 'mock') return new RejeuAnalyste();
  if (choix === 'anthropic') return new AnthropicAnalyste();
  throw new Error(`OTTO_TRANSCRIPT_ADAPTER « ${choix} » inconnu — 'mock' (rejeu enregistré) ou 'anthropic'`);
}
