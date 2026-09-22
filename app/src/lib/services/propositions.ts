import { q, q1, q01, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';
import { engagementCtx } from './imports';
import { APPLICATEURS } from './propositions/applicateurs';
import type { ObjectType } from './propositions/types';

// P1-01 (AUD-01, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §426-433). LE MÉCANISME
// GÉNÉRIQUE : « un seul motif pour toute proposition » (P3-01) commence ici, par la table et
// le service. `proposer()`/`resoudreParObjet()` sont côté MOTEUR (jamais un écran — voir plus
// bas) ; `accepter()`/`modifier()`/`refuser()`/`perimer()` sont ce qu'un écran appellera (P3-01) ;
// `enAttente()`/`parObjet()` lisent.
//
// LA FRONTIÈRE DE CONFIANCE DE `proposer()` (revue hostile, voix 1, P1-01, finding 2). Cette
// fonction NE VÉRIFIE ELLE-MÊME AUCUNE appartenance — elle fait confiance à l'appelant. C'est
// DÉLIBÉRÉ, pas un oubli : proposer() est un geste de MOTEUR (« l'IA/le moteur propose »), jamais
// un bouton qu'un humain clique — aucun écran n'appelle `proposer()` dans ce plan, à aucune
// phase. Les QUATRE sites de création qui l'appellent aujourd'hui (`materiality.propose`,
// `sox.ts` proposition de déficience, `walkthrough-analyse.ts::analyserWalkthrough`,
// `extraction/ladder.ts::extractEvidence`) ont TOUS déjà vérifié `assertMembre`/`assertMembreDe`
// avant d'atteindre ce point — ne pas re-vérifier ici évite une garde redondante, jamais une
// garde manquante. `parObjet()`, de même, est une lecture SANS acteur — un futur écran qui
// l'exposerait devra la garder À L'APPEL (comme toute action serveur le fait déjà pour son
// propre objet), exactement comme `materiality/page.tsx` garde aujourd'hui `validate()`.
// CE CONTRAT DOIT ÊTRE LU AVANT D'APPELER `proposer()`/`parObjet()` D'UN NOUVEAU SITE : un futur
// appelant qui n'a pas déjà vérifié l'appartenance introduit un trou d'étanchéité — exactement
// la classe de défaut que `core/membre.ts` documente dans son propre en-tête (« onze gestes sur
// treize acceptés depuis un autre cabinet »). Non gardé formellement ici faute d'un site RÉEL non
// gardé à corriger — ajouter une garde qu'aucun appelant ne viole encore serait une redondance,
// pas une correction (règle 9).
//
// CE QUE CE FICHIER NE FAIT PAS ENCORE (règle 13, à ne jamais lire en silence) :
//   · il ne crée pas la `review_note` explicative (« author_kind='otto' », P3-01/P3-02) — cette
//     capacité n'existe pas encore au niveau TOP de `review_note` (seule `review_note_reply` a
//     un `author_kind`, vérifié par lecture du schéma avant d'écrire cette ligne, jamais
//     supposé) ; `review_note_id` reste donc toujours `null` jusqu'à ce que P3-02 la construise.
//   · il ne réécrit pas `notifications.ts`/`obstacles.ts` sur `enAttente()` — le plan maître
//     lui-même (§797) assume une « double vérité » entre les colonnes de statut d'origine et
//     `proposition` jusqu'à la fin de P3-01, justement parce que les écrans ne bougent pas en
//     Phase 1. `PROP-04` (le rôle exigé pour statuer une proposition de matérialité) n'a donc
//     AUCUN EFFET RÉEL avant P3-01 : `/eng/[id]/materiality`'s `validateAction` appelle
//     `materiality.validate()` directement, sans jamais passer par `propositions.accepter()` —
//     trouvé par la revue hostile, voix 1, finding 4, nommé ici plutôt que découvert plus tard.
//   · il ne branche que QUATRE applicateurs (`propositions/applicateurs.ts` : materiality,
//     deficiency, walkthrough_gap, extraction_field) — les neuf autres types du catalogue
//     (`propositions/types.ts`) lèvent PROP-03. Reporté : R136.
//   · `proposer()` écrit APRÈS l'insertion de l'objet porteur (le moteur appelant a déjà commis
//     sa ligne + son `event_log`) sans les envelopper dans une transaction commune (R137,
//     docs/BACKLOG_REPORTE.md) : un `proposer()` qui échoue laisse l'objet porteur orphelin
//     d'une proposition, jamais l'inverse. Borné, jamais silencieux : la lecture `/api/sante`
//     « propositions » compte exactement cet écart et ROUGIT s'il existe.
//
// `resoudreParObjet()` — LE CORRECTIF DU DÉFAUT LE PLUS GRAVE TROUVÉ PAR LA REVUE HOSTILE (voix
// 1, finding 1, CRITIQUE). Cette tranche câblait `proposer()` dans les QUATRE sites de CRÉATION,
// mais AUCUN des quatre sites de DÉCISION (`materiality.validate`, `sox.decideDeficiency`,
// `statuerEcartWalkthrough`, `verifyExtraction`) — exactement les fonctions que TOUS les écrans
// existants appellent aujourd'hui (Phase 1 n'en touche aucun). Résultat mesuré par la revue :
// CHAQUE déficience/extraction déjà statuée par le produit existant (le semeur y compris —
// `part2.ts:236` appelle `decideDeficiency` juste après avoir proposé) laissait sa `proposition`
// bloquée « proposee » pour toujours — et la lecture `/api/sante` « propositions » (§n ≥ notif),
// construite pour ROUGIR si un site de création oublie `proposer()`, ne pouvait plus jamais le
// faire : l'excédent gonflait à chaque décision existante et masquait indéfiniment toute future
// régression. `resoudreParObjet()` ferme cette boucle : les QUATRE fonctions de décision
// l'appellent maintenant, elles aussi, immédiatement après leur propre écriture — qu'elles soient
// atteintes PAR `propositions.ts::accepter/modifier` (l'applicateur) OU DIRECTEMENT par un écran
// existant (le chemin d'aujourd'hui). Dans le premier cas, la proposition est déjà « acceptee »/
// « modifiee » (réclamée par `statuer()` AVANT d'appeler l'applicateur — voir plus bas) et
// `resoudreParObjet()` ne trouve rien à faire (la garde `where status = 'proposee'`) ; dans le
// second, c'est elle, et elle seule, qui referme la ligne.
//
// LA COURSE (revue hostile, voix 2, P1-01) : `accepter()`/`modifier()`/`refuser()` RÉCLAMENT la
// proposition par une seule instruction — `update ... where id = $1 and status = 'proposee'
// returning id` — AVANT d'exécuter l'applicateur, jamais après. Deux décisions concurrentes sur
// la MÊME proposition ne peuvent donc jamais toutes deux atteindre l'applicateur : la seconde
// voit `returning` ne rendre aucune ligne (le verrou de ligne posé par la première UPDATE la
// fait attendre, puis elle relit un statut déjà changé) et refuse PROP-02, sans avoir exécuté le
// moindre effet métier. La vérification en mémoire (`p.status !== 'proposee'`) qui précède reste
// un raccourci de lisibilité — le refus RÉEL, celui qui tient sous concurrence, est
// TOUJOURS le compte de lignes rendu par cet UPDATE.

export type SourceKind = 'ai_run' | 'engine_run' | 'regle';

export interface PropositionRow {
  id: string;
  engagementId: string;
  tenantId: string;
  objectType: ObjectType;
  objectId: string;
  field: string | null;
  valeurProposee: unknown;
  valeurRetenue: unknown | null;
  status: 'proposee' | 'acceptee' | 'modifiee' | 'refusee' | 'perimee';
  sourceKind: SourceKind;
  aiRunId: string | null;
  engineRunId: string | null;
  niveauAutomatisation: string;
  sectionId: string | null;
  noteId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

interface RowSql {
  id: string; engagement_id: string; tenant_id: string; object_type: ObjectType; object_id: string; field: string | null;
  valeur_proposee: unknown; valeur_retenue: unknown | null; status: PropositionRow['status'];
  source_kind: SourceKind; ai_run_id: string | null; engine_run_id: string | null;
  niveau_automatisation: string; section_id: string | null; note_id: string | null;
  decided_by: string | null; decided_at: string | null; decision_reason: string | null;
  created_at: string;
}

const COLONNES = `id::text, engagement_id::text, tenant_id::text, object_type, object_id::text, field,
  valeur_proposee, valeur_retenue, status, source_kind, ai_run_id::text, engine_run_id::text,
  niveau_automatisation, section_id::text, note_id::text, decided_by::text, decided_at::text,
  decision_reason, created_at::text`;

function mapRow(r: RowSql): PropositionRow {
  return {
    id: r.id, engagementId: r.engagement_id, tenantId: r.tenant_id, objectType: r.object_type, objectId: r.object_id,
    field: r.field, valeurProposee: r.valeur_proposee, valeurRetenue: r.valeur_retenue,
    status: r.status, sourceKind: r.source_kind, aiRunId: r.ai_run_id, engineRunId: r.engine_run_id,
    niveauAutomatisation: r.niveau_automatisation, sectionId: r.section_id, noteId: r.note_id,
    decidedBy: r.decided_by, decidedAt: r.decided_at, decisionReason: r.decision_reason, createdAt: r.created_at,
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
  engineRunId?: string | null;
  /** Déduit de `aiRunId` quand omis (§7.1 du plan maître : 'ai_run' si un `ai_run_id` accompagne
   *  la proposition, sinon 'engine_run' — les quatre familles branchées aujourd'hui n'ont aucune
   *  occurrence de 'regle', jamais devinée). */
  sourceKind?: SourceKind;
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
  const ctx = await engagementCtx(opts.engagementId);
  const sourceKind = opts.sourceKind ?? (opts.aiRunId ? 'ai_run' : 'engine_run');
  const row = await q1<{ id: string }>(
    `insert into proposition (engagement_id, tenant_id, object_type, object_id, field, valeur_proposee,
       ai_run_id, engine_run_id, source_kind)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id::text`,
    [opts.engagementId, ctx.tenant_id, opts.objectType, opts.objectId, opts.field ?? null,
      JSON.stringify(opts.valeur ?? {}), opts.aiRunId ?? null, opts.engineRunId ?? null, sourceKind],
  );
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

/** Le message PROP-02, un seul endroit pour les trois appelants (statuer/refuser). */
function messagePropDejaStatuee(status: string): string {
  return `PROP-02 : cette proposition est déjà « ${status} » — une décision se revoit, elle ne s’écrase pas`;
}

async function statuer(
  p: PropositionRow,
  userId: string,
  statutFinal: 'acceptee' | 'modifiee',
  valeurRetenue: unknown | undefined,
): Promise<void> {
  const propositionId = p.id;
  if (p.status !== 'proposee') {
    /* Raccourci de lisibilité, jamais la garde réelle (voir le commentaire d'en-tête) : le refus
       qui tient sous concurrence est le compte de lignes de l'UPDATE ci-dessous. */
    throw new PropositionDejaStatuee(messagePropDejaStatuee(p.status));
  }
  const applicateur = APPLICATEURS[p.objectType];
  if (!applicateur) {
    throw new ApplicateurNonBranche(
      `PROP-03 : aucun applicateur branché pour « ${p.objectType} » — voir propositions/types.ts et R136 (docs/BACKLOG_REPORTE.md)`,
    );
  }
  if (applicateur.verifierRole) await applicateur.verifierRole(p.engagementId, userId);
  const retenue = valeurRetenue === undefined ? p.valeurProposee : valeurRetenue;
  await tx(async (run) => {
    /* LA RÉCLAMATION D'ABORD, L'APPLICATEUR ENSUITE — jamais l'inverse. `where status =
       'proposee'` rend la ligne AUCUNE fois pour un second appelant concurrent : c'est ce qui
       empêche l'applicateur (decideDeficiency, materialityValidate, …) de s'exécuter deux fois
       pour une seule proposition. */
    const claim = await run(
      `update proposition set status = $2, valeur_retenue = $3, decided_by = $4, decided_at = now()
         where id = $1 and status = 'proposee' returning id`,
      [propositionId, statutFinal, JSON.stringify(retenue ?? {}), userId],
    ) as Array<{ id: string }>;
    if (claim.length === 0) {
      throw new PropositionDejaStatuee(messagePropDejaStatuee('proposee (concurrence : une autre décision vient de passer)'));
    }
    await applicateur.appliquer(p.engagementId, p.objectId, userId, valeurRetenue);
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
  await assertMembreDe('proposition', propositionId, userId, 'accepter une proposition');
  const p = await charger(propositionId);
  await statuer(p, userId, 'acceptee', undefined);
}

/** Applique une valeur corrigée par l'humain, à la place de la valeur proposée. */
export async function modifier(propositionId: string, userId: string, valeurRetenue: unknown): Promise<void> {
  await assertMembreDe('proposition', propositionId, userId, 'modifier une proposition');
  const p = await charger(propositionId);
  await statuer(p, userId, 'modifiee', valeurRetenue);
}

/**
 * PROP-02R — refuser sans motif écrit ne se relit pas. Consulte, PAR TYPE, le même rôle que
 * `accepter`/`modifier` exigeraient (`applicateur.verifierRole`, mandat §Permissions : « les
 * trois exigent assertMembre ET, par type, le rôle ») — trouvé manquant par la revue hostile,
 * voix 2 : sans ce contrôle, un membre sans droit de signer pouvait REFUSER une proposition de
 * matérialité qu'il n'aurait pas eu le droit d'accepter.
 */
export async function refuser(propositionId: string, userId: string, motif: string): Promise<void> {
  if (!motif?.trim()) {
    throw new Error('PROP-02R : refuser une proposition sans motif écrit ne se relit pas — motif requis');
  }
  const engagementId = await assertMembreDe('proposition', propositionId, userId, 'refuser une proposition');
  const p = await charger(propositionId);
  const applicateur = APPLICATEURS[p.objectType];
  if (applicateur?.verifierRole) await applicateur.verifierRole(engagementId, userId);
  const claim = await q<{ id: string }>(
    `update proposition set status = 'refusee', decision_reason = $2, decided_by = $3, decided_at = now()
       where id = $1 and status = 'proposee' returning id`,
    [propositionId, motif.trim(), userId],
  );
  if (claim.length === 0) {
    throw new PropositionDejaStatuee(messagePropDejaStatuee('proposee (concurrence ou déjà statuée)'));
  }
  const ctx = await engagementCtx(engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'proposition.refusee', objectType: 'proposition', objectId: propositionId,
    payload: { objectType: p.objectType, objectId: p.objectId, motif: motif.trim() },
  });
}

/**
 * Appelée par les moteurs (jamais un écran) quand l'objet porteur a changé sous la proposition —
 * ré-import, recalcul. Ne touche JAMAIS une proposition déjà statuée par un humain (règle 28 : un
 * recalcul ne détruit ni n'invalide jamais en silence du travail humain) ; une proposition déjà
 * décidée reste ce qu'elle est, silencieusement ignorée ici (`where status = 'proposee'` : même
 * garde de ligne que `statuer`/`refuser`, jamais une lecture-puis-écriture séparée).
 *
 * `userId` EXIGÉ, DEPUIS LE CORRECTIF 0171 — QUI a déclenché le recalcul invalidant (celui qui a
 * relancé le ré-import, pas un « système » sans visage) : la contrainte normative du plan
 * (§7.1 : `decided_by` non nul dès que `status <> 'proposee'`) l'exige, et un moteur qui invalide
 * sait toujours PAR QUI il a été relancé (même doctrine que `materiality.propose()`, qui porte
 * déjà un `requestedBy` sur un chemin système).
 */
export async function perimer(propositionId: string, userId: string, motif: string): Promise<void> {
  const p = await charger(propositionId);
  await assertMembre(p.engagementId, userId, 'périmer une proposition');
  const claim = await q<{ id: string }>(
    `update proposition set status = 'perimee', decision_reason = $2, decided_by = $3, decided_at = now()
       where id = $1 and status = 'proposee' returning id`,
    [propositionId, motif, userId],
  );
  if (claim.length === 0) return;
  const ctx = await engagementCtx(p.engagementId);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagementId, actorKind: 'system', actorId: userId,
    verb: 'proposition.perimee', objectType: 'proposition', objectId: propositionId,
    payload: { objectType: p.objectType, objectId: p.objectId, motif },
  });
}

/**
 * Résout, EN INTERNE, la proposition « proposee » d'un objet — jamais appelée par un écran, mais
 * par les fonctions de DÉCISION du domaine elles-mêmes (`materiality.validate`,
 * `sox.decideDeficiency`, `statuerEcartWalkthrough`, `verifyExtraction`). Voir l'en-tête de ce
 * fichier pour le défaut qu'elle corrige (revue hostile, voix 1, finding 1).
 *
 * `engagementId` EST FOURNI PAR L'APPELANT, jamais déduit de la proposition elle-même — CORRIGÉ
 * après un second défaut, trouvé par l'instrument AUTOMATIQUE (`etancheite-executee.test.ts`,
 * pas par lecture, règle 15) : la première version dérivait le dossier de la ligne `proposition`
 * trouvée, et RENDAIT SANS RIEN VÉRIFIER quand aucune proposition n'existait pour cet objet (un
 * objet jamais proposé — le cas le plus courant) — la garde ne s'exécutait alors JAMAIS,
 * « acteur d'un autre cabinet accepté » selon l'instrument. Chaque appelant connaît déjà SON
 * `engagementId` (résolu par sa propre requête, avant son propre `assertMembre`/`assertMembreDe`)
 * : le lui faire passer rend la garde ci-dessous VRAIMENT inconditionnelle, qu'une proposition
 * existe ou non.
 *
 * NE FAIT RIEN si aucune proposition « proposee » n'existe pour cet objet (un objet jamais
 * proposé se décide exactement comme avant P1-01) ni si elle a déjà été réclamée entre-temps
 * (même garde `where status = 'proposee'` que `statuer`/`refuser` — la seconde fermeture, qu'elle
 * vienne d'ici ou de `propositions.accepter/modifier`, ne trouve rien).
 *
 * `userId` EST NON NULLABLE depuis le correctif 0171 (§7.1 : `decided_by` non nul dès que
 * `status <> 'proposee'`) — les quatre fonctions de décision qui appellent cette fonction
 * reçoivent TOUJOURS un acteur réel (jamais un chemin système anonyme) ; vérifié sur les quatre
 * sites, pas supposé.
 */
export async function resoudreParObjet(
  engagementId: string,
  objectType: ObjectType,
  objectId: string,
  statutFinal: 'acceptee' | 'modifiee' | 'refusee',
  userId: string,
  valeurRetenue?: unknown,
  motif?: string,
): Promise<void> {
  /* INCONDITIONNELLE — avant même de chercher une proposition. Redondante avec la garde déjà
     faite par l'appelant (les quatre fonctions de décision vérifient déjà `assertMembre`/
     `assertMembreDe` avant d'écrire) ; gardée quand même, parce qu'un balayage de texte
     (couverture-etancheite.test.ts) ne sait pas lire « déjà gardé plus haut dans un AUTRE
     fichier », et parce qu'un `userId` réel qui entre ici mérite une garde qui s'exécute
     TOUJOURS, pas seulement quand une ligne existe déjà à protéger. */
  await assertMembre(engagementId, userId, 'résoudre une proposition (synchronisation de décision)');
  const existante = await q01<{ id: string }>(
    `select id::text from proposition
       where object_type = $1 and object_id = $2 and field is null and status = 'proposee'`,
    [objectType, objectId],
  );
  if (!existante) return;
  const claim = await q<{ id: string; engagement_id: string; object_id: string }>(
    `update proposition set status = $2, valeur_retenue = coalesce($3, valeur_proposee), decision_reason = $5,
        decided_by = $4, decided_at = now()
       where id = $1 and status = 'proposee'
       returning id::text, engagement_id::text, object_id::text`,
    [existante.id, statutFinal, valeurRetenue !== undefined ? JSON.stringify(valeurRetenue) : null, userId, motif ?? null],
  );
  if (claim.length === 0) return;
  const row = claim[0];
  const ctx = await engagementCtx(row.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: row.engagement_id, actorKind: 'user', actorId: userId,
    verb: statutFinal === 'acceptee' ? 'proposition.acceptee' : statutFinal === 'modifiee' ? 'proposition.modifiee' : 'proposition.refusee',
    objectType: 'proposition', objectId: row.id,
    payload: { objectType, objectId: row.object_id, viaResoudreParObjet: true },
  });
}

export async function enAttente(engagementId: string, userId: string): Promise<PropositionRow[]> {
  await assertMembre(engagementId, userId, 'lire les propositions en attente');
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
