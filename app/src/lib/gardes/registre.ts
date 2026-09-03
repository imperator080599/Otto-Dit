import type { OttoDb } from '@/lib/db/client';

// LE REGISTRE DES GARDES (Groupe 1, item 1.7) — une ligne par invariant, et
// pour chacune une ATTAQUE.
//
// Une garde qu'on affirme n'est pas une garde. Le dépôt en porte des dizaines
// — contraintes, déclencheurs, refus de service — et personne ne pouvait dire,
// en un endroit, LESQUELLES ont été éprouvées, ni comment. Ce registre nomme
// chaque invariant, l'endroit qui le tient, la phrase qui dit où il cesse de
// regarder (règle 4 de la nuit), et le CAS MAUVAIS qui doit être refusé.
//
// LA PREUVE SE PREND EN DEUX PASSES (règle 17) : l'attaque est jouée
// normalement — elle doit être refusée, par LA garde et pas par autre chose
// (le refus est comparé à l'expression de la garde) — puis rejouée dans une
// transaction annulée où la garde est NEUTRALISÉE (déclencheur désactivé,
// contrainte retirée) : elle doit alors RÉUSSIR. Si elle échoue encore, c'est
// que l'attaque n'a jamais atteint la garde — et « instrument non prouvé » est
// le verdict, pas « vert ».
//
// CE QUE LE REGISTRE NE PROUVE PAS, ET LE DIT : une garde de SERVICE (une règle
// en TypeScript) n'a pas de neutralisation SQL — elle est éprouvée sur une
// seule passe, par son refus nommé ; et une garde DÉCLARÉE sans attaque n'est
// pas prouvée du tout — la table `docs/GUARDS.md` l'écrit tel quel.

/** L'exécuteur d'une passe : la requête d'une transaction qui sera annulée. */
export type Requete = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }>;

/** Ce que les attaques ont sous la main : le monde de base semé. */
export interface Contexte {
  tenantId: string;
  engagementId: string;
  /** Un membre de la mission sans droit de revue (préparateur). */
  preparateur: string;
  /** Un réviseur de la mission (manager). */
  reviseur: string;
  /** L'associé. */
  associe: string;
}

export interface GardeSql {
  code: string;
  /** L'invariant, en une phrase. */
  enonce: string;
  /** Où il est tenu : le nom de la contrainte, du déclencheur, de la fonction. */
  point: string;
  /** Le rayon : ce qui casse si la garde tombe. */
  rayon: string;
  /** Où la garde cesse de regarder — une phrase, obligatoire. */
  stops_looking: string;
  /** Le cas mauvais. Doit être refusé ; le refus doit correspondre à `rejet`. */
  attaque: (run: Requete, ctx: Contexte) => Promise<void>;
  rejet: RegExp;
  /** Le SQL qui neutralise la garde, joué dans la transaction annulée. */
  neutraliser: string;
  nature: 'sql';
}

export interface GardeService {
  code: string;
  enonce: string;
  point: string;
  rayon: string;
  stops_looking: string;
  /** Le cas mauvais, qui doit lever une erreur dont le message correspond à `rejet`. */
  attaque: (ctx: Contexte) => Promise<void>;
  rejet: RegExp;
  nature: 'service';
}

/** Une garde nommée dont la preuve vit AILLEURS (un test de service), ou
 *  n'existe pas encore — et la table le dit. */
export interface GardeDeclaree {
  code: string;
  enonce: string;
  point: string;
  rayon: string;
  stops_looking: string;
  /** Le fichier de test qui l'éprouve, ou null : « aucun test ne la nomme ». */
  preuve: string | null;
  nature: 'declaree';
}

export type Garde = GardeSql | GardeService | GardeDeclaree;

/* ── Les fixtures minimales ─────────────────────────────────────────────── */

async function papier(run: Requete, ctx: Contexte, code = 'G-WP'): Promise<string> {
  const r = await run<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
     values ($1, 'nep-fr', $2, $3, 'draft', '[]'::jsonb) returning id::text`,
    [ctx.engagementId, code, `Papier ${code}`]);
  return r.rows[0].id;
}

async function note(run: Requete, ctx: Contexte, wp: string, status = 'open', closedBy: string | null = null): Promise<string> {
  const r = await run<{ id: string }>(
    `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, status, text, note_type, closed_by)
     values ($1, $2, $3, $4, $5, 'Note d’attaque.', 'question', $6) returning id::text`,
    [ctx.engagementId, wp, ctx.reviseur, ctx.preparateur, status, closedBy]);
  return r.rows[0].id;
}

/** Une ligne d'échantillon et une grille figée, minimales, pour attaquer l'atelier (0050). */
async function ligneDeGrille(run: Requete, ctx: Contexte): Promise<{ grid: string; item: string }> {
  const proc = await run<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, title)
     values ($1, 'nep-fr', 'REV-SUBST', 'substantive', 'Attaque — test de détail') returning id::text`,
    [ctx.engagementId]);
  const sample = await run<{ id: string }>(
    `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, population_amount, status)
     values ($1, $2, 'monetary_coverage_random', '{}'::jsonb, 'attaque', 'attaque', 1, 1000, 'drawn') returning id::text`,
    [ctx.engagementId, proc.rows[0].id]);
  const item = await run<{ id: string }>(
    `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason, amount, status)
     values ($1, 'gl_entry', gen_random_uuid(), 'random', 1000, 'pending') returning id::text`,
    [sample.rows[0].id]);
  const grid = await run<{ id: string }>(
    `insert into test_grid (engagement_id, procedure_code, pack_id, version, columns, columns_hash)
     values ($1, 'REV-SUBST', 'nep-fr', 1, '[{"code":"montant_ht"},{"code":"tiers"}]'::jsonb, 'attaque') returning id::text`,
    [ctx.engagementId]);
  return { grid: grid.rows[0].id, item: item.rows[0].id };
}

/* ── Le registre ─────────────────────────────────────────────────────────── */

export const GARDES: Garde[] = [
  {
    nature: 'sql', code: 'G-01',
    enonce: 'Le journal des événements est en ajout seul : ni mise à jour, ni suppression.',
    point: 'déclencheur event_log_append_only (0003) → forbid_mutation()',
    rayon: 'La piste d’audit entière : une ligne réécrite est une histoire réécrite.',
    stops_looking: 'Ne regarde pas le contenu des lignes ajoutées ni la continuité de la chaîne de hachage (vérifiée par events.test.ts).',
    attaque: async (run) => {
      await run(`update event_log set verb = verb where id = (select id from event_log order by id limit 1)`);
    },
    rejet: /append-only/,
    neutraliser: 'alter table event_log disable trigger event_log_append_only',
  },
  {
    nature: 'sql', code: 'G-02',
    enonce: 'Les visas se posent dans l’ordre préparateur → réviseur → associé.',
    point: 'déclencheur signoff_order_guard (0009) → assert_signoff_order()',
    rayon: 'Un visa d’associé posé sans revue : la hiérarchie de revue n’existe plus.',
    stops_looking: 'Ne regarde pas QUI pose le visa (le droit de signature est vérifié par le service, can_sign), seulement l’ordre des rôles.',
    attaque: async (run, ctx) => {
      const wp = await papier(run, ctx);
      await run(`insert into signoff (workpaper_id, user_id, sign_role) values ($1, $2, 'partner')`, [wp, ctx.associe]);
    },
    rejet: /review order/,
    neutraliser: 'alter table signoff disable trigger signoff_order_guard',
  },
  {
    nature: 'sql', code: 'G-03',
    enonce: 'L’auteur d’une note de revue ne la clôt jamais ; seul un réviseur de la mission la clôt.',
    point: 'déclencheur review_note_close_guard (0024) → assert_note_close_by_reviewer()',
    rayon: 'Une revue vidée de sa substance : chacun ferme ses propres notes.',
    stops_looking: 'Ne regarde pas le contenu de la réponse ni si la note visait un objet encore existant.',
    attaque: async (run, ctx) => {
      const wp = await papier(run, ctx);
      const n = await note(run, ctx, wp);
      await run(`update review_note set status = 'closed', closed_by = author_id where id = $1`, [n]);
    },
    rejet: /auteur d.une note ne la clôt jamais/,
    neutraliser: 'alter table review_note disable trigger review_note_close_guard',
  },
  {
    nature: 'sql', code: 'G-04',
    enonce: 'Une note close ne se rouvre pas — on en pose une nouvelle.',
    point: 'déclencheur review_note_close_guard (0024), seconde branche',
    rayon: 'L’historique d’une note réécrit : ce qui a été clos ne l’a plus été.',
    stops_looking: 'Ne regarde pas les réponses ajoutées après clôture (review_note_reply a sa propre garde de verrou).',
    attaque: async (run, ctx) => {
      const wp = await papier(run, ctx);
      const n = await note(run, ctx, wp, 'closed', ctx.associe);
      await run(`update review_note set status = 'open' where id = $1`, [n]);
    },
    rejet: /ne se rouvre pas/,
    neutraliser: 'alter table review_note disable trigger review_note_close_guard',
  },
  {
    nature: 'sql', code: 'G-05',
    enonce: 'Un écart ne se résout qu’avec explication, réponse du client, disposition, pièce corroborante, auteur et date — chiffré ou non.',
    point: 'contrainte exception_resolution_is_probative (0009)',
    rayon: 'Des écarts « résolus » par une phrase générique — et une anomalie de 36 800 € qui disparaît du total des anomalies connues (FA2025-0702) : la disposition du montant est exigée ICI ; la contrainte « chiffré ⇒ disposition » de 0009 était inerte puis recouverte, retirée en 0037.',
    stops_looking: 'Ne juge pas la QUALITÉ de l’explication ni la pertinence de la pièce désignée ; seulement leur présence.',
    attaque: async (run, ctx) => {
      const r = await run<{ id: string }>(
        `insert into exception (engagement_id, taxonomy_code, description) values ($1, 'ATTAQUE', 'écart d’attaque') returning id::text`,
        [ctx.engagementId]);
      await run(`update exception set status = 'resolved', resolution = 'ok' where id = $1`, [r.rows[0].id]);
    },
    rejet: /exception_resolution_is_probative/,
    neutraliser: 'alter table exception drop constraint exception_resolution_is_probative',
  },
  {
    nature: 'sql', code: 'G-07',
    enonce: 'Surcharger un niveau de risque par assertion exige un motif écrit, un décideur et une date.',
    point: 'contrainte override_needs_a_written_reason (0012)',
    rayon: 'Un niveau abaissé sans trace : moins de travaux, et personne ne sait pourquoi (ADR-094).',
    stops_looking: 'Ne juge pas le motif ; ne vérifie pas que le décideur avait le rôle pour décider.',
    attaque: async (run, ctx) => {
      await run(
        `insert into fsli_assertion_risk (engagement_id, fsli_code, assertion, computed_level, retained_level, methodology_version)
         values ($1, 'ATTAQUE', 'realite', 'eleve', 'faible', 'v-attaque')`,
        [ctx.engagementId]);
    },
    rejet: /override_needs_a_written_reason/,
    neutraliser: 'alter table fsli_assertion_risk drop constraint override_needs_a_written_reason',
  },
  {
    nature: 'sql', code: 'G-08',
    enonce: 'Répondre « une information produite par l’entité a été utilisée » sans désigner un rapport IPE documenté est refusé.',
    point: 'contrainte ipe_documente (0031, forme de 0036 : utilisee = false ou rapport_id posé)',
    rayon: 'Un test substantif tiré d’un listing jamais éprouvé — l’insuffisance d’inspection la plus fréquente.',
    stops_looking: 'La documentation (nature, pièce, exhaustivité, exactitude) est celle du rapport (G-12) ; l’arrêté attendu et la pertinence pour CE test sont exigés par le service (utiliserRapport), pas par la base.',
    attaque: async (run, ctx) => {
      const wp = await papier(run, ctx);
      await run(`insert into ipe (workpaper_id, utilisee) values ($1, true)`, [wp]);
    },
    rejet: /ipe_documente/,
    neutraliser: 'alter table ipe drop constraint ipe_documente',
  },
  {
    nature: 'sql', code: 'G-09',
    enonce: 'Un dossier scellé n’accepte plus d’écriture hors du flux d’amendement justifié.',
    point: 'déclencheurs <table>_lock_guard (0003) → assert_engagement_unlocked()',
    rayon: 'Un dossier archivé modifié après coup : le scellé ne scelle rien.',
    stops_looking: 'Ne couvre que les tables portant engagement_id listées en 0003/0021/0022/0023 ; une table nouvelle sans garde de verrou n’est pas vue ici (rls-couverture.test.ts compte les tables, pas les gardes).',
    attaque: async (run, ctx) => {
      const wp = await papier(run, ctx);
      await run(`update engagement set status = 'locked' where id = $1`, [ctx.engagementId]);
      await note(run, ctx, wp);
    },
    rejet: /writes rejected/,
    neutraliser: 'alter table review_note disable trigger review_note_lock_guard',
  },
  {
    nature: 'sql', code: 'G-10',
    enonce: 'Accepter ou refuser une mission sans motif écrit est impossible.',
    point: 'contrainte decision_needs_a_written_reason (0017)',
    rayon: 'La pièce qu’un inspecteur demande en premier quand un dossier tourne mal — absente.',
    stops_looking: 'Ne relit pas le questionnaire d’acceptation ; la cohérence des réponses est celle du service.',
    attaque: async (run, ctx) => {
      await run(
        `update engagement_acceptance set status = 'declined', decision_reason = '', decided_by = $2, decided_at = now()
         where engagement_id = $1`,
        [ctx.engagementId, ctx.associe]);
    },
    rejet: /decision_needs_a_written_reason/,
    neutraliser: 'alter table engagement_acceptance drop constraint decision_needs_a_written_reason',
  },
  {
    nature: 'sql', code: 'G-11',
    enonce: 'Une déclaration d’indépendance est signée par son propre auteur — personne ne signe pour un autre.',
    point: 'contrainte declaration_signed_by_self (0011)',
    rayon: 'Une indépendance déclarée par un autre : le fondement même de l’attribution des travaux.',
    stops_looking: 'Ne sait pas si les réponses sont vraies ; ne vérifie que QUI signe. L’intégralité de la signature (declaration_signature_is_whole) et le motif de révision (declaration_revision_has_a_reason) ne sont pas au registre — reportés.',
    attaque: async (run, ctx) => {
      /* Une PREMIÈRE déclaration, pour quelqu'un qui n'en a pas : le monde semé
         porte déjà la version 1 des membres, et une version 2 sans motif est
         refusée par une autre garde (declaration_revision_has_a_reason). */
      const sans = await run<{ id: string }>(
        `select u.id::text from app_user u where u.tenant_id = $1
           and not exists (select 1 from independence_declaration d where d.user_id = u.id) order by u.id limit 1`,
        [ctx.tenantId]);
      /* Signée ET datée (la signature est entière), mais par un AUTRE : seule
         la garde « on signe pour soi » est atteinte. */
      await run(
        `insert into independence_declaration (tenant_id, user_id, engagement_id, version, signed_by, signed_at, answers)
         values ($1, $2, $3, 1, $4, now(), '{}'::jsonb)`,
        [ctx.tenantId, sans.rows[0].id, ctx.engagementId, ctx.reviseur]);
    },
    rejet: /declaration_signed_by_self/,
    neutraliser: 'alter table independence_declaration drop constraint declaration_signed_by_self',
  },

  {
    nature: 'sql', code: 'G-12',
    enonce: 'Un rapport IPE désigne exactement un fichier du dossier et documente ses deux éléments testés.',
    point: 'contrainte ipe_rapport_documente (0036)',
    rayon: 'Un état système « éprouvé » sans exhaustivité ni exactitude — partagé par tous les papiers qui le désignent.',
    stops_looking: 'Ne vérifie pas que l’arrêté déclaré est celui du fichier (c’est le service qui refuse la réutilisation sur un autre arrêté).',
    attaque: async (run, ctx) => {
      await run(
        `insert into ipe_rapport (engagement_id, nom, periode_fin, nature, exhaustivite, exactitude)
         values ($1, 'ATTAQUE', '2025-12-31', 'systeme', 'x', '')`,
        [ctx.engagementId]);
    },
    rejet: /ipe_rapport_documente/,
    neutraliser: 'alter table ipe_rapport drop constraint ipe_rapport_documente',
  },

  /* ── L'atelier de test (0050, W1) : quatre refus, quatre objets ──────── */
  {
    nature: 'sql', code: 'G-13',
    enonce: 'TEST-01 — une cellule de test « conforme » porte une ancre : pièce, page, rectangle.',
    point: 'contrainte test_cell_green_needs_anchor (0050)',
    rayon: 'Une cellule verte que la pièce ne montre nulle part — un vert qu’on croit sur parole.',
    stops_looking: 'Ne vérifie pas que le rectangle est AU BON ENDROIT de la pièce : c’est la lecture de la couche texte (ancres.ts) qui le place, et l’œil qui le contrôle.',
    attaque: async (run, ctx) => {
      const { grid, item } = await ligneDeGrille(run, ctx);
      await run(
        `insert into test_cell (engagement_id, grid_id, sample_item_id, column_code, expected, found, delta_signed, delta_unit, tolerance, state)
         values ($1, $2, $3, 'montant_ht', '100000', '100000', 0, 'cents', '± 1', 'conforme')`,
        [ctx.engagementId, grid, item]);
    },
    rejet: /test_cell_green_needs_anchor/,
    neutraliser: 'alter table test_cell drop constraint test_cell_green_needs_anchor',
  },
  {
    nature: 'sql', code: 'G-14',
    enonce: 'TEST-02 — une ligne dont un attribut d’identité diverge (tiers, numéro de pièce) ne se conclut pas : la preuve n’est pas recevable.',
    point: 'déclencheur test_line_conclusion_1_identity (0050)',
    rayon: 'Une ligne conclue sur la facture d’un AUTRE client — le chiffre d’affaires « justifié » par la mauvaise pièce.',
    stops_looking: 'Ne juge pas la ressemblance des noms : c’est le calcul de la cellule (normalizeParty) qui décide « diverge » ; le déclencheur ne lit que l’état.',
    attaque: async (run, ctx) => {
      const { grid, item } = await ligneDeGrille(run, ctx);
      await run(
        `insert into test_cell (engagement_id, grid_id, sample_item_id, column_code, expected, found, delta_unit, tolerance, state)
         values ($1, $2, $3, 'tiers', 'Client Alpha (fictif)', 'Client Beta (fictif)', 'identite', 'identité', 'non_recevable')`,
        [ctx.engagementId, grid, item]);
      await run(
        `insert into test_line_conclusion (engagement_id, grid_id, sample_item_id, cells_hash, concluded_by)
         values ($1, $2, $3, 'attaque', $4)`,
        [ctx.engagementId, grid, item, ctx.preparateur]);
    },
    rejet: /TEST-02/,
    neutraliser: 'alter table test_line_conclusion disable trigger test_line_conclusion_1_identity',
  },
  {
    nature: 'sql', code: 'G-15',
    enonce: 'TEST-03 — une disposition de cellule porte un motif écrit.',
    point: 'contrainte cell_disposition_has_reason (0050)',
    rayon: 'Une cellule hors tolérance « disposée » par un clic, sans un mot — la décision humaine vidée de son contenu.',
    stops_looking: 'Ne juge pas la qualité du motif : « ok » passe. Le motif est lu par le reviewer, pas par la base.',
    attaque: async (run, ctx) => {
      const { grid, item } = await ligneDeGrille(run, ctx);
      const c = await run<{ id: string }>(
        `insert into test_cell (engagement_id, grid_id, sample_item_id, column_code, expected, found, delta_signed, delta_unit, tolerance, state)
         values ($1, $2, $3, 'montant_ht', '100000', '100500', 500, 'cents', '± 1', 'hors_tolerance') returning id::text`,
        [ctx.engagementId, grid, item]);
      await run(
        `insert into cell_disposition (engagement_id, cell_id, reason, state_at_decision, delta_at_decision, decided_by)
         values ($1, $2, '   ', 'hors_tolerance', 500, $3)`,
        [ctx.engagementId, c.rows[0].id, ctx.preparateur]);
    },
    rejet: /cell_disposition_has_reason/,
    neutraliser: 'alter table cell_disposition drop constraint cell_disposition_has_reason',
  },
  {
    nature: 'sql', code: 'G-16',
    enonce: 'TEST-04 — une ligne dont une cellule est hors tolérance, absente ou sans ancre ne se conclut pas sans disposition écrite.',
    point: 'déclencheur test_line_conclusion_2_cells (0050)',
    rayon: 'Une ligne conclue « conforme » avec un écart de montant que personne n’a regardé.',
    stops_looking: 'Ne relit pas la cellule après la conclusion : une cellule recalculée depuis rend la conclusion PÉRIMÉE (empreinte des cellules), c’est l’écran qui le dit, pas ce déclencheur.',
    attaque: async (run, ctx) => {
      const { grid, item } = await ligneDeGrille(run, ctx);
      await run(
        `insert into test_cell (engagement_id, grid_id, sample_item_id, column_code, expected, found, delta_signed, delta_unit, tolerance, state)
         values ($1, $2, $3, 'montant_ht', '100000', '100500', 500, 'cents', '± 1', 'hors_tolerance')`,
        [ctx.engagementId, grid, item]);
      await run(
        `insert into test_line_conclusion (engagement_id, grid_id, sample_item_id, cells_hash, concluded_by)
         values ($1, $2, $3, 'attaque', $4)`,
        [ctx.engagementId, grid, item, ctx.preparateur]);
    },
    rejet: /TEST-04/,
    neutraliser: 'alter table test_line_conclusion disable trigger test_line_conclusion_2_cells',
  },
  /* ── La revue analytique du poste (0130, mandat de la soirée §2.2) ───── */
  {
    nature: 'sql', code: 'G-17',
    enonce: 'ANA-01 — une revue analytique vide n’est pas une revue analytique.',
    point: 'contrainte fsli_analytique_text_not_empty (0130)',
    rayon: 'Un poste « revu » par un enregistrement à blanc — la section existe, elle ne dit rien, et le statut la compte.',
    stops_looking: 'Ne juge pas le contenu : « RAS » passe. La substance est lue par le réviseur, pas par la base.',
    attaque: async (run, ctx) => {
      await run(
        `insert into fsli_analytique (engagement_id, fsli_code, version, text, origine, soldes_hash, author_id)
         values ($1, 'REVENUE', 900, '   ', 'humaine', 'attaque', $2)`,
        [ctx.engagementId, ctx.preparateur]);
    },
    rejet: /fsli_analytique_text_not_empty/,
    neutraliser: 'alter table fsli_analytique drop constraint fsli_analytique_text_not_empty',
  },
  {
    nature: 'sql', code: 'G-18',
    enonce: 'ANA-02 — une rédaction « proposée puis validée » cite le run qui l’a produite.',
    point: 'contrainte fsli_analytique_proposal_has_run (0130)',
    rayon: 'Une phrase attribuée au moteur sans la trace de son calcul : « d’où vient cette rédaction ? » sans réponse (P7).',
    stops_looking: 'Ne vérifie pas que le run cité est bien celui de CE poste : la clé étrangère garantit qu’il existe, pas qu’il correspond.',
    attaque: async (run, ctx) => {
      await run(
        `insert into fsli_analytique (engagement_id, fsli_code, version, text, origine, engine_run_id, soldes_hash, author_id)
         values ($1, 'REVENUE', 901, 'Rédaction proposée, sans run.', 'proposee_validee', null, 'attaque', $2)`,
        [ctx.engagementId, ctx.preparateur]);
    },
    rejet: /fsli_analytique_proposal_has_run/,
    neutraliser: 'alter table fsli_analytique drop constraint fsli_analytique_proposal_has_run',
  },
  {
    nature: 'sql', code: 'G-19',
    enonce: 'ANA-03 — une version de revue analytique ne se modifie ni ne s’efface : on en écrit une nouvelle.',
    point: 'déclencheur fsli_analytique_append_only (0130)',
    rayon: 'Un texte réécrit sous la même version, sans trace : l’inspecteur lit une rédaction qui n’est pas celle qui a été visée.',
    stops_looking: 'Ne protège pas contre une suppression en cascade par la table mère : engagement est en « on delete restrict », donc rien ne cascade — mais c’est cette autre garde qui le tient.',
    attaque: async (run, ctx) => {
      const r = await run<{ id: string }>(
        `insert into fsli_analytique (engagement_id, fsli_code, version, text, origine, soldes_hash, author_id)
         values ($1, 'REVENUE', 902, 'Première rédaction.', 'humaine', 'attaque', $2) returning id::text`,
        [ctx.engagementId, ctx.preparateur]);
      await run(`update fsli_analytique set text = 'Réécrite en silence.' where id = $1`, [r.rows[0].id]);
    },
    rejet: /ANA-03/,
    neutraliser: 'alter table fsli_analytique disable trigger fsli_analytique_append_only',
  },
  {
    nature: 'sql', code: 'G-22',
    enonce: 'REPLI-01 — une clé de repli hors format est refusée : lettres, chiffres, « . _ : - », 120 caractères au plus.',
    point: 'contrainte ui_repli_cle_valide (0132) ; le service memoriserRepli lit le même prédicat avant la base',
    rayon: 'Une clé libre est un canal d’écriture arbitraire ouvert à tout compte connecté : n’importe quel texte, sans borne, mémorisé sous le nom de la personne et relu par chaque écran.',
    stops_looking: 'Ne juge pas le SENS de la clé : une clé bien formée qui ne correspond à aucune section est mémorisée et jamais lue. Ne borne pas le NOMBRE de clés par personne.',
    attaque: async (run, ctx) => {
      await run(`insert into ui_repli (tenant_id, user_id, cle, ouvert) values ($1, $2, $3, true)`,
        [ctx.tenantId, ctx.preparateur, 'clé avec espaces et <script>']);
    },
    rejet: /ui_repli_cle_valide/,
    neutraliser: 'alter table ui_repli drop constraint ui_repli_cle_valide',
  },
  {
    nature: 'service', code: 'G-23',
    enonce: 'REPLI-03 — le locataire d’un rangement vient de la PERSONNE : aucune écriture ne peut le poser au nom d’un autre cabinet.',
    point: 'memoriserRepli (services/replis.ts) : la ligne est insérée par jointure sur app_user, le locataire n’est pas un paramètre',
    rayon: 'Un appel forgé écrivait une ligne portant le locataire d’un AUTRE cabinet, et la lecture, qui ne filtrait que la personne, la relisait — une fuite d’un cabinet à l’autre sur un objet d’écran (revue hostile n°8, constat 3).',
    stops_looking: 'Ne dit rien de la RLS : le rôle qui sert l’application la contourne encore (PLAN_RLS, étape 3 non exécutée). Ne borne pas ce qu’une personne range chez elle — c’est REPLI-04 qui le fait.',
    attaque: async (ctx) => {
      /* On écrit un rangement pour une personne, puis on VÉRIFIE qu'aucune
         ligne ne porte un locataire étranger : le service n'offre plus de
         paramètre pour cela, et la jointure le rend impossible. */
      const { memoriserRepli } = await import('@/lib/services/replis');
      const { q } = await import('@/lib/db/client');
      await memoriserRepli({ userId: ctx.preparateur, cle: 'attaque.locataire', ouvert: false });
      const r = await q<{ n: string }>(
        `select count(*)::text n from ui_repli u join app_user a on a.id = u.user_id
         where u.cle = 'attaque.locataire' and u.tenant_id <> a.tenant_id`);
      if (Number(r[0].n) > 0) throw new Error('IMPOSSIBLE : un rangement porte le locataire d’un autre cabinet');
      throw new Error('REPLI-03 : le locataire vient de la personne — aucune ligne étrangère écrite');
    },
    rejet: /REPLI-03/,
  },

  /* ── Gardes de SERVICE : une passe, par le refus nommé ─────────────────── */
  {
    nature: 'service', code: 'G-20',
    enonce: 'Un exercice ou une mission ne se crée pas sur l’entité d’un autre cabinet.',
    point: 'engagement.ts → creerExercice / creerMission (EngagementRuleError « isolation »)',
    rayon: 'Le nom d’un client étranger dans nos papiers ; et l’inverse.',
    stops_looking: 'Ne remplace pas la RLS : l’application tourne sous un rôle qui la contourne (ADR-115), donc cette règle est la SEULE isolation à l’écriture pour ces deux objets.',
    attaque: async (ctx) => {
      const { q01 } = await import('@/lib/db/client');
      const { creerExercice } = await import('@/lib/services/engagement');
      const autre = await q01<{ id: string }>(`insert into tenant (name) values ('Cabinet d’attaque (fictif)') returning id`);
      const ent = await q01<{ id: string }>(
        `insert into entity (tenant_id, name, country, registry_type, registry_no, currency)
         values ($1, 'Entité d’attaque (fictive)', 'FR', 'fictional', null, 'EUR') returning id`, [autre!.id]);
      await creerExercice({ tenantId: ctx.tenantId, entityId: ent!.id, endDate: '2026-12-31', actorUserId: ctx.associe });
    },
    rejet: /isolation/,
  },
  {
    nature: 'service', code: 'G-21',
    enonce: 'Une préférence de référentiel de seuil ne contourne pas la garde du résultat non représentatif.',
    point: 'kernel/materiality.ts → proposeMateriality (motif « NOT applied »)',
    rayon: 'Un seuil de 1 000 € — le plancher d’arrondi — sur une base négative.',
    stops_looking: 'Ne juge pas si 2 % du chiffre d’affaires est le bon critère de représentativité : c’est la règle du pack, écrite telle quelle.',
    attaque: async () => {
      const { proposeMateriality } = await import('@/lib/kernel/materiality');
      const { getAssurancePack } = await import('@/lib/packs');
      const tb = [
        { accountNo: '701000', label: 'Ventes', debitCents: 0, creditCents: 850000000, balanceCents: -850000000 },
        { accountNo: '601000', label: 'Achats', debitCents: 900000000, creditCents: 0, balanceCents: 900000000 },
      ];
      const p = proposeMateriality(tb, getAssurancePack('nep-fr'), 'pbt');
      if (p.benchmarkCode === 'pbt') throw new Error('préférence SUIVIE sur une base négative');
      throw new Error(`refus : ${p.basis.rule}`);
    },
    rejet: /NOT applied/,
  },

  /* ── Gardes DÉCLARÉES : la preuve vit ailleurs, ou n'existe pas ────────── */
  ...([
    ['acceptation', 'obst.missionNonAcceptee', null],
    ['independance', 'obst.declarationNonSignee / obst.rotationDue', 'team.test.ts'],
    ['reprise', 'obst.repriseNonStatuee', 'carryforward.test.ts'],
    ['questionnaire', 'obst.facteursNonStatues / obst.ouiSansPrecision / obst.questionsSectionSansReponse', 'services/questionnaire.test.ts'],
    ['processus', 'obst.processusChangementsNonStatues / obst.entretienEcartsCandidats', 'processus.test.ts, entretiens.test.ts'],
    ['programme', 'obst.posteSansProcedure', null],
    ['boucle', 'obstacles de loop.ts (b.obstacles[].cle)', 'loop.test.ts'],
    ['pointage', 'obst.pointageEcart', 'tieout.test.ts'],
    ['evaluation', 'obst.evaluation', null],
    ['achevement', 'obst.achevementNonConclu', 'completion.test.ts'],
    ['circularisation', 'obst.circEcartNonExplique', 'circularisations.test.ts'],
    ['ipe', 'obst.ipeQuestionNonPosee', 'ipe.test.ts'],
    ['jalons', 'obst.jalonEnRetard', null],
    /* W1 : la famille naît en AVERTISSEMENT (drapeau de pack à off) — la
       fixture appariée (dossier sain, aucun avertissement) vit dans le test. */
    ['unsupported_sample_items — avertissement, drapeau nep-fr à off', 'obst.lignesNonConclues / obst.lignesConclusionPerimee', 'testing/grille.test.ts'],
  ] as [string, string, string | null][]).map(([famille, motifs, preuve], i): GardeDeclaree => ({
    nature: 'declaree', code: `G-${50 + i}`,
    enonce: `Famille d’obstacles au visa « ${famille} » : le dossier ne se vise pas tant qu’un obstacle de cette famille subsiste.`,
    point: `obstacles.ts → obstaclesAuVisa, famille ${famille} (motifs : ${motifs})`,
    rayon: 'Un dossier visé avec un obstacle non levé de cette famille.',
    stops_looking: preuve
      ? `Le test nommé éprouve le motif ; le FAUX POSITIF (un dossier sain qui déclencherait la famille) n’a pas de fixture.`
      : 'Aucun test ne nomme ce motif : la famille est déclarée, pas éprouvée. Reporté.',
    preuve,
  })),
  {
    nature: 'declaree', code: 'G-70',
    enonce: '« RAS » n’explique pas un écart de circularisation.',
    point: 'circularisations.ts (CircularisationError « RAS »)',
    rayon: 'Une explication vide qui passe pour une explication.',
    stops_looking: 'Ne reconnaît que la lettre « RAS » et le vide ; « rien à signaler » en toutes lettres passe.',
    preuve: 'circularisations.test.ts',
  },
  {
    nature: 'declaree', code: 'G-71',
    enonce: 'Le tirage est déterministe par graine : même population, même graine, même sélection.',
    point: 'kernel/sampling.ts (attributeDraw, monetary draw)',
    rayon: 'Une sélection non rejouable : le papier ne prouve plus quel élément a été tiré.',
    stops_looking: 'Ne fige pas les sélections du monde de démonstration en fichier d’or — reporté.',
    preuve: 'kernel.test.ts',
  },
];

/* ── L'ÉPREUVE ───────────────────────────────────────────────────────────── */

export interface Verdict {
  code: string;
  prouvee: boolean;
  /** Pourquoi, dans les mots de l'épreuve — jamais un « ok » nu. */
  raison: string;
}

class Annulation extends Error {}

/** Joue l'attaque dans une transaction ANNULÉE, neutralisée ou non ; rend le
 *  message du refus, ou null si l'attaque a réussi. */
async function passe(db: OttoDb, g: GardeSql, ctx: Contexte, neutraliser: boolean): Promise<string | null> {
  let refus: string | null = null;
  try {
    await db.transaction(async (t) => {
      if (neutraliser) await t.query(g.neutraliser);
      try {
        await g.attaque(t.query, ctx);
      } catch (e) {
        refus = (e as Error).message;
      }
      throw new Annulation();
    });
  } catch (e) {
    if (!(e instanceof Annulation)) throw e;
  }
  return refus;
}

export async function eprouverSql(db: OttoDb, g: GardeSql, ctx: Contexte): Promise<Verdict> {
  const normal = await passe(db, g, ctx, false);
  if (normal === null) {
    return { code: g.code, prouvee: false, raison: 'l’attaque a RÉUSSI sans neutralisation — la garde n’existe pas, ou ne s’applique pas à ce cas' };
  }
  if (!g.rejet.test(normal)) {
    return { code: g.code, prouvee: false, raison: `refusée pour une AUTRE raison que la garde : « ${normal.slice(0, 160)} »` };
  }
  const neutre = await passe(db, g, ctx, true);
  if (neutre !== null) {
    return { code: g.code, prouvee: false, raison: `l’attaque n’a jamais atteint la garde : neutralisée, elle refuse encore — « ${neutre.slice(0, 160)} »` };
  }
  return { code: g.code, prouvee: true, raison: 'refusée par la garde, acceptée sans elle' };
}

export async function eprouverService(g: GardeService, ctx: Contexte): Promise<Verdict> {
  try {
    await g.attaque(ctx);
  } catch (e) {
    const m = (e as Error).message;
    return g.rejet.test(m)
      ? { code: g.code, prouvee: true, raison: 'refusée par la garde (une passe : pas de neutralisation pour une garde de service)' }
      : { code: g.code, prouvee: false, raison: `refusée pour une AUTRE raison que la garde : « ${m.slice(0, 160)} »` };
  }
  return { code: g.code, prouvee: false, raison: 'l’attaque a RÉUSSI — la garde n’existe pas, ou ne s’applique pas à ce cas' };
}

export async function eprouver(db: OttoDb, g: Garde, ctx: Contexte): Promise<Verdict> {
  if (g.nature === 'sql') return eprouverSql(db, g, ctx);
  if (g.nature === 'service') return eprouverService(g, ctx);
  return {
    code: g.code, prouvee: false,
    raison: g.preuve ? `déclarée — preuve hors registre : ${g.preuve}` : 'déclarée — aucune preuve',
  };
}
