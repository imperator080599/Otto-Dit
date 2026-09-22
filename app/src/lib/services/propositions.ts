import { q, q1, q01, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { assertMembre } from '@/lib/core/membre';
import { engagementCtx } from './imports';
import { APPLICATEURS } from './propositions/applicateurs';
import type { ObjectType } from './propositions/types';

// P1-01 (AUD-01, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §426-433). LE MÉCANISME
// GÉNÉRIQUE : « un seul motif pour toute proposition » (P3-01) commence ici, par la table et
// le service — les six opérations que tout écran futur appellera, quel que soit le type
// d'objet. `proposer()` écrit ; `accepter()`/`modifier()`/`refuser()`/`perimer()` statuent ;
// `enAttente()`/`parObjet()` lisent.
//
// CE QUE CE FICHIER NE FAIT PAS ENCORE (règle 13, à ne jamais lire en silence) :
//   · il ne crée pas la `review_note` explicative (« author_kind='otto' », P3-01/P3-02) — cette
//     capacité n'existe pas encore au niveau TOP de `review_note` (seule `review_note_reply` a
//     un `author_kind`, vérifié par lecture du schéma avant d'écrire cette ligne, jamais
//     supposé) ; `review_note_id` reste donc toujours `null` jusqu'à ce que P3-02 la construise.
//   · il ne réécrit pas `notifications.ts`/`obstacles.ts` sur `enAttente()` — le plan maître
//     lui-même (§797) assume une « double vérité » entre les colonnes de statut d'origine et
//     `proposition` jusqu'à la fin de P3-01, justement parce que les écrans ne bougent pas en
//     Phase 1. La lecture `/api/sante` « propositions » (route.ts) compare les deux comptes et
//     ROUGIT s'ils divergent — c'est elle, pas ce fichier, qui tient l'invariant de parité.
//   · il ne branche que QUATRE applicateurs (`propositions/applicateurs.ts` : materiality,
//     deficiency, walkthrough_gap, extraction_field) — les neuf autres types du catalogue
//     (`propositions/types.ts`) lèvent PROP-03. Reporté : R136.

export interface PropositionRow {
  id: string;
  engagementId: string;
  objectType: ObjectType;
  objectId: string;
  field: string | null;
  valeurProposee: unknown;
  valeurRetenue: unknown | null;
  status: 'proposee' | 'acceptee' | 'modifiee' | 'refusee' | 'perimee';
  aiRunId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  motif: string | null;
  createdAt: string;
}

interface RowSql {
  id: string; engagement_id: string; object_type: ObjectType; object_id: string; field: string | null;
  valeur_proposee: unknown; valeur_retenue: unknown | null; status: PropositionRow['status'];
  ai_run_id: string | null; decided_by: string | null; decided_at: string | null; motif: string | null;
  created_at: string;
}

const COLONNES = `id::text, engagement_id::text, object_type, object_id::text, field,
  valeur_proposee, valeur_retenue, status, ai_run_id::text, decided_by::text, decided_at::text,
  motif, created_at::text`;

function mapRow(r: RowSql): PropositionRow {
  return {
    id: r.id, engagementId: r.engagement_id, objectType: r.object_type, objectId: r.object_id,
    field: r.field, valeurProposee: r.valeur_proposee, valeurRetenue: r.valeur_retenue,
    status: r.status, aiRunId: r.ai_run_id, decidedBy: r.decided_by, decidedAt: r.decided_at,
    motif: r.motif, createdAt: r.created_at,
  };
}

export class PropositionExistante extends Error {}
export class PropositionDejaStatuee extends Error {}
export class ApplicateurNonBranche extends Error {}

/**
 * PROP-01 — refuse une seconde proposition « proposee » pour (type, objet, champ). Un engin qui
 * recalcule sur un objet déjà proposé doit d'abord `perimer()` l'ancienne, jamais en superposer
 * une seconde silencieuse.
 */
export async function proposer(opts: {
  engagementId: string;
  objectType: ObjectType;
  objectId: string;
  field?: string | null;
  valeur: unknown;
  aiRunId?: string | null;
}): Promise<string> {
  const existante = await q01<{ id: string }>(
    `select id::text from proposition
       where object_type = $1 and object_id = $2 and coalesce(field,'') = coalesce($3,'') and status = 'proposee'`,
    [opts.objectType, opts.objectId, opts.field ?? null],
  );
  if (existante) {
    throw new PropositionExistante(
      `PROP-01 : une proposition « proposee » existe déjà pour ${opts.objectType}/${opts.objectId}`
      + (opts.field ? `/${opts.field}` : '') + ` (${existante.id}) — elle se statue (accepter/modifier/refuser), `
      + 'elle ne se double pas ; périmez-la (perimer) avant d’en proposer une autre',
    );
  }
  const row = await q1<{ id: string }>(
    `insert into proposition (engagement_id, object_type, object_id, field, valeur_proposee, ai_run_id)
     values ($1,$2,$3,$4,$5,$6) returning id::text`,
    [opts.engagementId, opts.objectType, opts.objectId, opts.field ?? null, JSON.stringify(opts.valeur ?? {}), opts.aiRunId ?? null],
  );
  const ctx = await engagementCtx(opts.engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId, actorKind: 'system', actorId: null,
    verb: 'proposition.creee', objectType: 'proposition', objectId: row.id,
    payload: { objectType: opts.objectType, objectId: opts.objectId, field: opts.field ?? null },
  });
  return row.id;
}

async function charger(propositionId: string): Promise<PropositionRow> {
  const r = await q1<RowSql>(`select ${COLONNES} from proposition where id = $1`, [propositionId]);
  return mapRow(r);
}

async function statuer(
  p: PropositionRow,
  userId: string,
  statutFinal: 'acceptee' | 'modifiee',
  valeurRetenue: unknown | undefined,
): Promise<void> {
  const propositionId = p.id;
  if (p.status !== 'proposee') {
    throw new PropositionDejaStatuee(
      `PROP-02 : cette proposition est déjà « ${p.status} » — une décision se revoit, elle ne s’écrase pas`,
    );
  }
  const applicateur = APPLICATEURS[p.objectType];
  if (!applicateur) {
    throw new ApplicateurNonBranche(
      `PROP-03 : aucun applicateur branché pour « ${p.objectType} » — voir propositions/types.ts et R136 (docs/BACKLOG_REPORTE.md)`,
    );
  }
  const retenue = valeurRetenue === undefined ? p.valeurProposee : valeurRetenue;
  await tx(async (run) => {
    await applicateur.appliquer(p.engagementId, p.objectId, userId, valeurRetenue);
    await run(
      `update proposition set status = $2, valeur_retenue = $3, decided_by = $4, decided_at = now() where id = $1`,
      [propositionId, statutFinal, JSON.stringify(retenue ?? {}), userId],
    );
  });
  const ctx = await engagementCtx(p.engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagementId, actorKind: 'user', actorId: userId,
    verb: statutFinal === 'acceptee' ? 'proposition.acceptee' : 'proposition.modifiee',
    objectType: 'proposition', objectId: propositionId,
    payload: { objectType: p.objectType, objectId: p.objectId },
  });
}

/** Applique la valeur telle que proposée, sans correction. */
export async function accepter(propositionId: string, userId: string): Promise<void> {
  const p = await charger(propositionId);
  await assertMembre(p.engagementId, userId, 'accepter une proposition');
  await statuer(p, userId, 'acceptee', undefined);
}

/** Applique une valeur corrigée par l'humain, à la place de la valeur proposée. */
export async function modifier(propositionId: string, userId: string, valeurRetenue: unknown): Promise<void> {
  const p = await charger(propositionId);
  await assertMembre(p.engagementId, userId, 'modifier une proposition');
  await statuer(p, userId, 'modifiee', valeurRetenue);
}

/** PROP-02R — refuser sans motif écrit ne se relit pas. */
export async function refuser(propositionId: string, userId: string, motif: string): Promise<void> {
  if (!motif?.trim()) {
    throw new Error('PROP-02R : refuser une proposition sans motif écrit ne se relit pas — motif requis');
  }
  const p = await charger(propositionId);
  await assertMembre(p.engagementId, userId, 'refuser une proposition');
  if (p.status !== 'proposee') {
    throw new PropositionDejaStatuee(`PROP-02 : cette proposition est déjà « ${p.status} »`);
  }
  await q(
    `update proposition set status = 'refusee', motif = $2, decided_by = $3, decided_at = now() where id = $1`,
    [propositionId, motif.trim(), userId],
  );
  const ctx = await engagementCtx(p.engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagementId, actorKind: 'user', actorId: userId,
    verb: 'proposition.refusee', objectType: 'proposition', objectId: propositionId,
    payload: { objectType: p.objectType, objectId: p.objectId, motif: motif.trim() },
  });
}

/**
 * Appelée par les moteurs (jamais un écran) quand l'objet porteur a changé sous la proposition —
 * ré-import, recalcul. Ne touche JAMAIS une proposition déjà statuée par un humain (règle 28 : un
 * recalcul ne détruit ni n'invalide jamais en silence du travail humain) ; une proposition déjà
 * décidée reste ce qu'elle est, silencieusement ignorée ici.
 */
export async function perimer(propositionId: string, motif: string): Promise<void> {
  const p = await charger(propositionId);
  if (p.status !== 'proposee') return;
  await q(`update proposition set status = 'perimee', motif = $2 where id = $1`, [propositionId, motif]);
  const ctx = await engagementCtx(p.engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagementId, actorKind: 'system', actorId: null,
    verb: 'proposition.perimee', objectType: 'proposition', objectId: propositionId,
    payload: { objectType: p.objectType, objectId: p.objectId, motif },
  });
}

export async function enAttente(engagementId: string, opts: { userId?: string } = {}): Promise<PropositionRow[]> {
  if (opts.userId) await assertMembre(engagementId, opts.userId, 'lire les propositions en attente');
  const rows = await q<RowSql>(
    `select ${COLONNES} from proposition where engagement_id = $1 and status = 'proposee' order by created_at asc`,
    [engagementId],
  );
  return rows.map(mapRow);
}

export async function parObjet(objectType: ObjectType, objectId: string): Promise<PropositionRow[]> {
  const rows = await q<RowSql>(
    `select ${COLONNES} from proposition where object_type = $1 and object_id = $2 order by created_at desc`,
    [objectType, objectId],
  );
  return rows.map(mapRow);
}
