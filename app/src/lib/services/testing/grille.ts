import { q, q01, q1, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { readBlob } from '@/lib/core/storage';
import { fmtEur, normalizeParty } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { primaryPack } from '@/lib/packs';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { justificatifs } from '@/lib/methodology/catalogue';
import type { ChampJustificatif } from '@/lib/methodology/types';
import { engagementCtx } from '../imports';
import { frameworkSet } from '../fsli';
import { currentRevenueSample } from '../sampling';
import { latestExtraction } from '../extraction/ladder';
import { fieldsToInvoice, type ExtractedField } from '../extraction/fields';
import { elementsDePage, rectangleDe, type Rect } from './ancres';

// L'ATELIER DE TEST — LA GRILLE (mandat du jour, W1).
//
// La grille est FIGÉE par pack : ses colonnes sont les champs des justificatifs
// du cycle dans la méthode du cabinet (procedures.json, procédure DETAIL, cycle
// CA), avec les tolérances du pack — versionnée et empreintée, les mêmes
// colonnes quelle que soit la langue de l'écran. Chaque ligne de l'échantillon
// × chaque colonne = UNE cellule : attendu (grand livre ou règle), trouvé
// (pièce), delta SIGNÉ toujours imprimé, tolérance, état, et l'ANCRE — la
// pièce, la page, le rectangle où la valeur se lit.
//
// La comparaison est déterministe (P4) : aucun modèle ne décide ici. Ce qui
// est humain, c'est la DISPOSITION d'une cellule non conforme (un motif
// écrit) et la CONCLUSION d'une ligne (touche V) — et les deux sont refusées
// quand il manque ce qui les fonde (TEST-01 à TEST-04, tenus en base).

export type EtatCellule = 'conforme' | 'hors_tolerance' | 'non_recevable' | 'absent' | 'sans_ancre';
export type UniteDelta = 'cents' | 'days' | 'units' | 'identite';

export interface ColonneGrille {
  code: string;
  libelle: string;
  type: string;
  /** La pièce sur laquelle la colonne se lit. */
  document: 'invoice' | 'delivery_note';
  reference: string;
  /** La tolérance telle qu'elle s'affiche — et d'où elle vient. */
  tolerance: string;
  toleranceSource: string;
  /** Un attribut d'identité : sa divergence rend la preuve non recevable. */
  identite: boolean;
  regle?: string;
}

export interface Grille {
  id: string;
  version: number;
  packId: string;
  colonnes: ColonneGrille[];
  empreinte: string;
  figeeLe: string;
}

export interface Cellule {
  id: string;
  sampleItemId: string;
  colonne: string;
  libelle: string;
  attendu: string | null;
  trouve: string | null;
  /** Les mêmes, formatés pour l'écran dans la langue du pack (montants en euros). */
  attenduAffiche: string;
  trouveAffiche: string;
  /** Le delta signé, formaté (« +12,00 € », « −3 j », « 0 »), null pour une identité qui diverge ou un champ absent. */
  delta: string | null;
  deltaBrut: number | null;
  unite: UniteDelta | null;
  tolerance: string;
  etat: EtatCellule;
  identite: boolean;
  evidenceId: string | null;
  page: number | null;
  rect: Rect | null;
  champ: string | null;
  /** La disposition qui couvre la valeur ACTUELLE de la cellule (même état, même delta) — sinon null. */
  disposition: { motif: string; par: string; quand: string } | null;
  /** Une disposition existe mais portait sur une AUTRE valeur : elle ne couvre plus rien. */
  dispositionPerimee: { motif: string; par: string; quand: string; etat: EtatCellule; delta: number | null } | null;
}

export interface ConclusionLigne { par: string; quand: string; perimee: boolean }

/* ── La grille figée ─────────────────────────────────────────────────────── */

/** Le document d'un justificatif, d'après son libellé dans la méthode. */
function documentDe(libelle: string): 'invoice' | 'delivery_note' | null {
  if (/facture/i.test(libelle)) return 'invoice';
  if (/livraison/i.test(libelle)) return 'delivery_note';
  return null;
}

const IDENTITE = new Set(['tiers', 'num_piece']);

function toleranceAffichee(c: ChampJustificatif, tol: { amountAbs: number; amountPct: number; dateDays: number; qtyAbs: number }, eur: (n: number) => string): { tolerance: string; source: string } {
  switch (c.code) {
    case 'montant_ht':
      return { tolerance: `± max(${eur(Math.round(tol.amountAbs * 100))}, ${(tol.amountPct * 100).toLocaleString('fr-FR')} %)`, source: 'pack substantive.tolerances (amountAbs, amountPct)' };
    case 'qte_livree':
      return { tolerance: `± ${tol.qtyAbs}`, source: 'pack substantive.tolerances (qtyAbs)' };
    default:
      return { tolerance: c.tolerance, source: 'méthode du cabinet (procedures.json)' };
  }
}

/** Les colonnes que la méthode et le pack commandent pour ce dossier. */
export async function colonnesCommandees(engagementId: string): Promise<{ packId: string; colonnes: ColonneGrille[] }> {
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const tol = pack.substantive?.tolerances;
  if (!tol) throw new Error(`Le pack ${pack.id} ne porte pas de tolérances de test de détail : aucune grille ne se fige sans elles.`);
  const cat = await catalogueDeLaMission(engagementId);
  const detail = cat.procedures.find((p) => p.code === 'DETAIL');
  if (!detail) throw new Error('La méthode du cabinet ne porte pas de procédure DETAIL : aucune grille ne se fige.');
  const eur = (c: number) => fmtEur(c, pack.language);
  const colonnes: ColonneGrille[] = [];
  for (const j of justificatifs(detail, 'CA')) {
    const document = documentDe(j.document);
    if (!document) continue;
    for (const c of j.champs) {
      const t = toleranceAffichee(c, tol, eur);
      colonnes.push({
        code: c.code, libelle: c.libelle, type: c.type, document, reference: c.reference,
        tolerance: t.tolerance, toleranceSource: t.source, identite: IDENTITE.has(c.code), regle: c.regle,
      });
    }
  }
  if (colonnes.length === 0) throw new Error('La procédure DETAIL ne décrit aucun champ de justificatif pour le cycle CA : aucune grille ne se fige.');
  return { packId: pack.id, colonnes };
}

interface GrilleRow { id: string; version: number; pack_id: string; columns: ColonneGrille[]; columns_hash: string; frozen_at: string }

function versGrille(g: GrilleRow): Grille {
  return { id: g.id, version: g.version, packId: g.pack_id, colonnes: g.columns, empreinte: g.columns_hash, figeeLe: g.frozen_at };
}

/** La grille en vigueur (la dernière version), ou null. */
export async function grilleDuDossier(engagementId: string): Promise<Grille | null> {
  const g = await q01<GrilleRow>(
    `select id::text, version, pack_id, columns, columns_hash, frozen_at::text from test_grid
     where engagement_id = $1 and procedure_code = 'REV-SUBST' order by version desc limit 1`, [engagementId]);
  return g ? versGrille(g) : null;
}

/**
 * Figer la grille : la première fois, version 1 ; ensuite, une version NEUVE
 * seulement si les colonnes commandées ont changé (méthode ou pack). Une
 * grille figée ne se modifie jamais — elle se remplace, et l'ancienne reste.
 */
export async function figerGrille(engagementId: string, userId: string | null): Promise<Grille> {
  const { packId, colonnes } = await colonnesCommandees(engagementId);
  const empreinte = hashObject(colonnes);
  const courante = await grilleDuDossier(engagementId);
  if (courante && courante.empreinte === empreinte) return courante;
  const ctx = await engagementCtx(engagementId);
  const version = (courante?.version ?? 0) + 1;
  const g = await q1<GrilleRow>(
    `insert into test_grid (engagement_id, procedure_code, pack_id, version, columns, columns_hash)
     values ($1, 'REV-SUBST', $2, $3, $4, $5)
     returning id::text, version, pack_id, columns, columns_hash, frozen_at::text`,
    [engagementId, packId, version, JSON.stringify(colonnes), empreinte]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: userId ? 'user' : 'system', actorId: userId,
    verb: 'test_grid_frozen', objectType: 'test_grid', objectId: g.id,
    payload: { version, packId, colonnes: colonnes.map((c) => c.code), empreinte },
  });
  return versGrille(g);
}

/* ── Le calcul des cellules ──────────────────────────────────────────────── */

/** Le libellé qui, sur la pièce, commence la ligne où la valeur se lit. */
const MOTIF_ANCRE: Record<string, RegExp> = {
  montant_ht: /^Total HT\b/,
  date_piece: /^Date\s*:/,
  tiers: /^Client\s*:/,
  num_piece: /^Numero\s*:/,
  qte_livree: /^Quantite totale livree\b/,
  date_livraison: /^Date\s*:/,
  signature: /signature/i,
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Le champ relevé qui porte la valeur de la colonne. */
const CHAMP: Record<string, string> = {
  montant_ht: 'totalNetCents', date_piece: 'invoiceDate', tiers: 'buyerName', num_piece: 'invoiceNumber',
  qte_livree: 'qtyTotal', date_livraison: 'deliveryDate', signature: 'signedBy',
};

function jours(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86400000);
}

function signe(n: number, fmt: (abs: number) => string): string {
  if (n === 0) return `0 ${fmt(0).replace(/^0[\s,.\d]*/, '').trim()}`.trim();
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

export interface CelluleCalculee {
  colonne: ColonneGrille;
  attendu: string | null; trouve: string | null;
  delta: number | null; unite: UniteDelta | null;
  etat: EtatCellule;
  evidenceId: string | null; extractionId: string | null; page: number | null; rect: Rect | null; champ: string | null;
}

export interface PieceLue { evidenceId: string; extractionId: string; fields: ExtractedField[]; storagePath: string; docType: string }

/** Les éléments de texte d'une PAGE d'une pièce lue — lus une fois par calcul.
 *  Une pièce ILLISIBLE (magasin de pièces cassé, fichier absent) fait ÉCHOUER
 *  le calcul en le disant : la lire comme « sans couche texte » rendrait toutes
 *  les cellules « sans ancre » en silence (revue hostile du jour). Une pièce
 *  lisible mais sans couche texte (un scan) rend simplement aucun élément. */
async function elementsDe(cache: Map<string, ReturnType<typeof elementsDePage>>, p: PieceLue, page: number) {
  const cle = `${p.evidenceId}:${page}`;
  if (!cache.has(cle)) {
    cache.set(cle, readBlob(p.storagePath)
      .catch((e) => { throw new Error(`La pièce ${p.evidenceId} est illisible dans le magasin (${p.storagePath}) : ${e instanceof Error ? e.message : String(e)}. La grille ne se calcule pas sur une pièce qu'on ne peut pas ouvrir.`); })
      .then((b) => elementsDePage(b, page).catch(() => [])));
  }
  return cache.get(cle)!;
}

/**
 * La cellule d'une colonne pour une ligne : déterministe, delta signé toujours
 * imprimé quand il y a comparaison, ancre cherchée sur la pièce.
 */
export async function calculerCellule(o: {
  colonne: ColonneGrille;
  gl: { montantCents: number; dateEcriture: string; pieceRef: string | null; tiers: string | null };
  periode: { debut: string; fin: string };
  piece: PieceLue | null;
  qteFacturee: number | undefined;
  tol: { amountAbs: number; amountPct: number; qtyAbs: number };
  elements: (p: PieceLue, page: number) => Promise<{ str: string; x: number; y: number; w: number; h: number }[]>;
}): Promise<CelluleCalculee> {
  const { colonne: c, gl, piece } = o;
  const base: CelluleCalculee = {
    colonne: c, attendu: null, trouve: null, delta: null, unite: null, etat: 'absent',
    evidenceId: piece?.evidenceId ?? null, extractionId: piece?.extractionId ?? null, page: null, rect: null, champ: CHAMP[c.code] ?? null,
  };
  const valeur = piece ? piece.fields.find((f) => f.name === CHAMP[c.code])?.value : undefined;
  const pageChamp = piece ? (piece.fields.find((f) => f.name === CHAMP[c.code])?.page ?? 1) : 1;

  /* L'ancre d'abord : elle décide si un « conforme » est possible. */
  let rect: Rect | null = null;
  if (piece && MOTIF_ANCRE[c.code]) {
    /* L'ancre se cherche sur la PAGE du champ relevé, pas toujours la première. */
    rect = rectangleDe(await o.elements(piece, pageChamp), MOTIF_ANCRE[c.code]);
  }
  const ancrer = (cell: CelluleCalculee): CelluleCalculee =>
    rect ? { ...cell, page: pageChamp, rect } : cell;
  /* Conforme SEULEMENT avec une ancre ; sinon la cellule dit « sans ancre ». */
  const conforme = (cell: CelluleCalculee): CelluleCalculee =>
    rect ? { ...ancrer(cell), etat: 'conforme' } : { ...cell, etat: 'sans_ancre' };

  switch (c.code) {
    case 'montant_ht': {
      /* LE SENS COMPTE : une vente est un crédit (montant positif), un avoir
         un débit (négatif). Un AVOIR présenté à l'appui d'une vente du même
         montant n'est pas conforme — la comparaison est SIGNÉE, et le signe de
         la pièce vient de sa nature (facture +, avoir −), jamais d'une valeur
         absolue (revue hostile du jour). */
      const attendu = gl.montantCents;
      if (valeur === undefined || !/^-?\d+$/.test(valeur)) return { ...base, attendu: String(attendu), trouve: valeur ?? null };
      const trouve = Math.abs(Number(valeur)) * (piece?.docType === 'credit_note' ? -1 : 1);
      const delta = trouve - attendu;
      const tolCents = Math.max(o.tol.amountAbs * 100, Math.abs(attendu) * o.tol.amountPct);
      const cell = { ...base, attendu: String(attendu), trouve: String(trouve), delta, unite: 'cents' as const };
      return Math.abs(delta) <= tolCents ? conforme(cell) : { ...ancrer(cell), etat: 'hors_tolerance' };
    }
    case 'date_piece': {
      const attendu = `${o.periode.debut}..${o.periode.fin}`;
      /* Une date qui n'est pas ISO (« 15/06/2025 ») n'est pas comparée : elle
         est « absente », la valeur relevée gardée sous les yeux — comparer
         des chaînes donnerait un delta NaN écrit en base (revue hostile). */
      if (!valeur || !ISO.test(valeur)) return { ...base, attendu, trouve: valeur ?? null };
      const delta = valeur < o.periode.debut ? jours(valeur, o.periode.debut) : valeur > o.periode.fin ? jours(valeur, o.periode.fin) : 0;
      const cell = { ...base, attendu, trouve: valeur, delta, unite: 'days' as const };
      return delta === 0 ? conforme(cell) : { ...ancrer(cell), etat: 'hors_tolerance' };
    }
    case 'tiers': {
      const attendu = gl.tiers ?? '';
      if (!valeur) return { ...base, attendu };
      const a = normalizeParty(attendu);
      const t = normalizeParty(valeur);
      /* Égalité après normalisation ; l'inclusion n'est admise qu'entre deux
         noms SUBSTANTIELS (au moins six caractères chacun) — « SAS » ou une
         chaîne vide ne « contient » rien, et « ALPHA » n'est pas « ALPHANORD »
         (revue hostile du jour). */
      const identique = a.length > 0 && t.length > 0
        && (a === t || (a.length >= 6 && t.length >= 6 && (t.includes(a) || a.includes(t))));
      const cell = { ...base, attendu, trouve: valeur, unite: 'identite' as const };
      return identique ? conforme({ ...cell, delta: 0 }) : { ...ancrer(cell), etat: 'non_recevable', delta: null };
    }
    case 'num_piece': {
      const attendu = gl.pieceRef ?? '';
      if (!valeur) return { ...base, attendu };
      const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
      const identique = attendu.length > 0 && norm(attendu) === norm(valeur);
      const cell = { ...base, attendu, trouve: valeur, unite: 'identite' as const };
      return identique ? conforme({ ...cell, delta: 0 }) : { ...ancrer(cell), etat: 'non_recevable', delta: null };
    }
    case 'qte_livree': {
      const attendu = o.qteFacturee;
      if (attendu === undefined) return { ...base, attendu: null, trouve: valeur ?? null };
      if (valeur === undefined || !/^-?\d+(?:[.,]\d+)?$/.test(valeur)) return { ...base, attendu: String(attendu), trouve: valeur ?? null };
      const delta = Number(valeur.replace(',', '.')) - attendu;
      const cell = { ...base, attendu: String(attendu), trouve: valeur, delta, unite: 'units' as const };
      return Math.abs(delta) <= o.tol.qtyAbs ? conforme(cell) : { ...ancrer(cell), etat: 'hors_tolerance' };
    }
    case 'date_livraison': {
      const attendu = o.periode.fin;
      if (!valeur || !ISO.test(valeur)) return { ...base, attendu, trouve: valeur ?? null };
      const delta = valeur > attendu ? jours(valeur, attendu) : 0;
      const cell = { ...base, attendu, trouve: valeur, delta, unite: 'days' as const };
      return delta === 0 ? conforme(cell) : { ...ancrer(cell), etat: 'hors_tolerance' };
    }
    default: {
      /* Un champ « relevé seul » ou booléen (la signature) : présent si relevé,
         absent sinon — et absent, il attend une disposition humaine. */
      if (valeur === undefined || valeur === '') return { ...base, attendu: c.tolerance };
      return conforme({ ...base, attendu: c.tolerance, trouve: valeur, delta: 0, unite: 'units' });
    }
  }
}

/** La pièce que le vouching utilise : la plus récente du type dont la lecture n'attend pas. */
async function pieceLue(sampleItemId: string, types: string[]): Promise<PieceLue | null> {
  const evs = await q<{ id: string; storage_path: string; doc_type: string }>(
    `select e.id::text, e.storage_path, e.doc_type from evidence e
     join request_item ri on ri.id = e.request_item_id
     where ri.sample_item_id = $1 and e.quarantined = false and e.doc_type = any($2)
     order by e.created_at desc`, [sampleItemId, types]);
  for (const ev of evs) {
    const x = await latestExtraction(ev.id);
    if (x && x.status !== 'pending_verify') return { evidenceId: ev.id, extractionId: x.id, fields: x.fields, storagePath: ev.storage_path, docType: ev.doc_type };
  }
  return null;
}

/**
 * Calculer (ou recalculer) toutes les cellules de l'échantillon courant sur la
 * grille en vigueur. Idempotent : la cellule garde son identité (et donc sa
 * disposition) d'un calcul à l'autre — seule sa valeur change.
 */
export async function calculerGrille(engagementId: string, userId: string | null): Promise<{ grille: Grille; lignes: number; cellules: number }> {
  const ctx = await engagementCtx(engagementId);
  const sample = await currentRevenueSample(engagementId);
  if (!sample || sample.status !== 'drawn') throw new Error('Aucun échantillon tiré : la grille se calcule sur une sélection tirée.');
  const grille = await figerGrille(engagementId, userId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const tol = pack.substantive!.tolerances;
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'test_grid','v1',$3,$4,$5, now()) returning id::text`,
    [ctx.tenant_id, engagementId, pack.id, grille.empreinte, JSON.stringify({ items: sample.items.length, grille: grille.id })]);

  const cache = new Map<string, ReturnType<typeof elementsDePage>>();
  const elements = (p: PieceLue, page: number) => elementsDe(cache, p, page);
  let cellules = 0;
  /* TOUT EST CALCULÉ D'ABORD, ÉCRIT ENSUITE, EN UNE TRANSACTION : un calcul
     qui échoue à la sixième ligne ne laisse pas cinq lignes neuves et sept
     périmées sous le même numéro de calcul (revue hostile du jour). */
  const ecritures: { sql: string; params: unknown[] }[] = [];
  for (const it of sample.items) {
    const gl = await q1<{ debit: string; credit: string; piece_date: string | null }>(
      `select debit::text, credit::text, piece_date::text from gl_entry where id = $1`, [it.unit_id]);
    const montantCents = numToCents(gl.credit) > 0 ? numToCents(gl.credit) : -numToCents(gl.debit);
    const facture = await pieceLue(it.id, ['invoice', 'credit_note']);
    const bl = await pieceLue(it.id, ['delivery_note']);
    const demandeBl = await q01<{ n: string }>(
      `select count(*) n from request_item where sample_item_id = $1 and kind = 'document' and description ~* 'livraison|delivery'`, [it.id]);
    const requiertBl = it.account_no.startsWith('701') && Number(demandeBl?.n ?? 0) > 0;
    const inv = facture ? fieldsToInvoice(facture.fields) : null;
    const qteFacturee = inv?.lines?.reduce((s, l) => s + (l.qty ?? 0), 0);

    for (const colonne of grille.colonnes) {
      if (colonne.document === 'delivery_note' && !requiertBl) continue;
      const cell = await calculerCellule({
        colonne,
        gl: { montantCents, dateEcriture: gl.piece_date ?? it.entry_date, pieceRef: it.piece_ref ?? it.entry_no, tiers: it.aux_label },
        periode: { debut: ctx.period_start, fin: ctx.period_end },
        piece: colonne.document === 'invoice' ? facture : bl,
        qteFacturee, tol, elements,
      });
      ecritures.push({
        sql: `insert into test_cell (engagement_id, grid_id, sample_item_id, column_code, expected, found, delta_signed, delta_unit,
                                tolerance, state, evidence_id, extraction_id, page, rect, field_name, engine_run_id, computed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         on conflict (grid_id, sample_item_id, column_code) do update set
           expected = excluded.expected, found = excluded.found, delta_signed = excluded.delta_signed, delta_unit = excluded.delta_unit,
           tolerance = excluded.tolerance, state = excluded.state, evidence_id = excluded.evidence_id, extraction_id = excluded.extraction_id,
           page = excluded.page, rect = excluded.rect, field_name = excluded.field_name, engine_run_id = excluded.engine_run_id, computed_at = now()`,
        params: [engagementId, grille.id, it.id, colonne.code, cell.attendu, cell.trouve, cell.delta, cell.unite,
          colonne.tolerance, cell.etat, cell.evidenceId, cell.extractionId, cell.page, cell.rect ? JSON.stringify(cell.rect) : null, cell.champ, run.id],
      });
      cellules++;
    }
    /* Une colonne qui ne s'applique plus (le BL n'est plus requis) disparaît —
       avec sa disposition, qui ne couvre plus rien, et le journal le dit. */
    ecritures.push({
      sql: `delete from cell_disposition where cell_id in (
              select id from test_cell where grid_id = $1 and sample_item_id = $2 and engine_run_id is distinct from $3)`,
      params: [grille.id, it.id, run.id],
    });
    ecritures.push({
      sql: `delete from test_cell where grid_id = $1 and sample_item_id = $2 and engine_run_id is distinct from $3`,
      params: [grille.id, it.id, run.id],
    });
  }
  await tx(async (run) => { for (const e of ecritures) await run(e.sql, e.params); });
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'test_grid_computed', objectType: 'test_grid', objectId: grille.id,
    payload: { engineRun: run.id, lignes: sample.items.length, cellules, requestedBy: userId },
  });
  return { grille, lignes: sample.items.length, cellules };
}

/* ── La lecture ──────────────────────────────────────────────────────────── */

function formaterDelta(brut: number | null, unite: UniteDelta | null, lang: 'fr' | 'en'): string | null {
  if (brut === null || unite === null) return null;
  if (unite === 'cents') return signe(brut, (a) => fmtEur(a, lang));
  if (unite === 'days') return brut === 0 ? '0 j' : `${brut > 0 ? '+' : '−'}${Math.abs(brut)} j`;
  if (unite === 'units') return brut === 0 ? '0' : `${brut > 0 ? '+' : '−'}${Math.abs(brut)}`;
  return '0';
}

/** Toutes les cellules du dossier, par ligne, avec leur disposition. */
export async function cellulesDuDossier(engagementId: string): Promise<{
  grille: Grille | null;
  cellules: Record<string, Cellule[]>;
  conclusions: Record<string, ConclusionLigne>;
}> {
  const grille = await grilleDuDossier(engagementId);
  if (!grille) return { grille: null, cellules: {}, conclusions: {} };
  const fs = await frameworkSet(engagementId);
  const lang = primaryPack(fs as never).language;
  const parCode = new Map(grille.colonnes.map((c) => [c.code, c]));
  const rows = await q<{
    id: string; sample_item_id: string; column_code: string; expected: string | null; found: string | null;
    delta_signed: string | null; delta_unit: UniteDelta | null; tolerance: string; state: EtatCellule;
    evidence_id: string | null; page: number | null; rect: Rect | null; field_name: string | null;
    motif: string | null; par: string | null; quand: string | null; etat_decide: EtatCellule | null; delta_decide: string | null;
  }>(
    `select c.id::text, c.sample_item_id::text, c.column_code, c.expected, c.found, c.delta_signed::text, c.delta_unit,
            c.tolerance, c.state, c.evidence_id::text, c.page, c.rect, c.field_name,
            d.reason motif, u.name par, d.decided_at::text quand, d.state_at_decision etat_decide, d.delta_at_decision::text delta_decide
     from test_cell c
     left join cell_disposition d on d.cell_id = c.id
     left join app_user u on u.id = d.decided_by
     where c.grid_id = $1
     order by c.sample_item_id, c.column_code`, [grille.id]);
  const ordre = new Map(grille.colonnes.map((c, i) => [c.code, i]));
  const cellules: Record<string, Cellule[]> = {};
  for (const r of rows) {
    const col = parCode.get(r.column_code);
    const brut = r.delta_signed === null ? null : Number(r.delta_signed);
    /* Un montant sans valeur relevée n'a pas d'unité de delta ; il reste un montant. */
    if (r.column_code === 'montant_ht' && r.delta_unit === null) r.delta_unit = 'cents';
    (cellules[r.sample_item_id] ??= []).push({
      id: r.id, sampleItemId: r.sample_item_id, colonne: r.column_code, libelle: col?.libelle ?? r.column_code,
      attendu: r.expected, trouve: r.found,
      attenduAffiche: formaterMontantCellule(r.expected, r.delta_unit, lang), trouveAffiche: formaterMontantCellule(r.found, r.delta_unit, lang),
      delta: formaterDelta(brut, r.delta_unit, lang), deltaBrut: brut, unite: r.delta_unit,
      tolerance: r.tolerance, etat: r.state, identite: col?.identite ?? false,
      evidenceId: r.evidence_id, page: r.page, rect: r.rect, champ: r.field_name,
      disposition: r.motif && dispositionCouvre(r) ? { motif: r.motif, par: r.par ?? '—', quand: r.quand ?? '' } : null,
      dispositionPerimee: r.motif && !dispositionCouvre(r)
        ? { motif: r.motif, par: r.par ?? '—', quand: r.quand ?? '', etat: r.etat_decide ?? 'absent', delta: r.delta_decide === null ? null : Number(r.delta_decide) }
        : null,
    });
  }
  for (const l of Object.values(cellules)) l.sort((a, b) => (ordre.get(a.colonne) ?? 99) - (ordre.get(b.colonne) ?? 99));
  const concl = await q<{ sample_item_id: string; par: string; quand: string; cells_hash: string }>(
    `select c.sample_item_id::text, u.name par, c.concluded_at::text quand, c.cells_hash
     from test_line_conclusion c join app_user u on u.id = c.concluded_by where c.grid_id = $1`, [grille.id]);
  const conclusions: Record<string, ConclusionLigne> = {};
  for (const c of concl) {
    conclusions[c.sample_item_id] = { par: c.par, quand: c.quand, perimee: c.cells_hash !== empreinteCellules(cellules[c.sample_item_id] ?? []) };
  }
  return { grille, cellules, conclusions };
}

/** Une disposition ne couvre que la valeur qu'elle a disposée : même état, même delta. */
function dispositionCouvre(r: { state: EtatCellule; delta_signed: string | null; etat_decide: EtatCellule | null; delta_decide: string | null }): boolean {
  if (r.etat_decide !== r.state) return false;
  const a = r.delta_signed === null ? null : Number(r.delta_signed);
  const b = r.delta_decide === null ? null : Number(r.delta_decide);
  return a === b;
}

/** Les valeurs de cellule formatées pour l'écran, dans la langue du pack — utile aux tests. */
export function formaterMontantCellule(v: string | null, unite: UniteDelta | null, lang: 'fr' | 'en'): string {
  if (v === null) return '—';
  if (unite === 'cents' && /^-?\d+$/.test(v)) return fmtEur(Number(v), lang);
  return v;
}

/** L'empreinte des états de cellule : c'est elle que la conclusion signe. */
export function empreinteCellules(cellules: { colonne: string; etat: EtatCellule; deltaBrut: number | null; disposition: { motif: string } | null }[]): string {
  return hashObject(cellules.map((c) => [c.colonne, c.etat, c.deltaBrut, c.disposition?.motif ?? null]));
}

/* ── Les gestes humains ──────────────────────────────────────────────────── */

async function refuserSiScelle(engagementId: string): Promise<void> {
  const e = await q01<{ status: string }>(`select status from engagement where id = $1`, [engagementId]);
  if (e && (e.status === 'locked' || e.status === 'archived')) {
    throw new Error('Ce dossier est scellé : l’atelier de test ne s’y modifie plus.');
  }
}

/** Disposer une cellule non conforme : un motif écrit, par une personne (L2). TEST-03. */
export async function disposerCellule(engagementId: string, cellId: string, userId: string, motif: string): Promise<void> {
  /* LA CELLULE EST CELLE DU DOSSIER QU'ON A LE DROIT D'ÉCRIRE : l'identifiant
     d'une cellule d'un autre dossier ne passe pas — l'application tourne sous
     un rôle qui contourne la RLS (ADR-115), cette clause est le mur (revue
     hostile du jour). */
  const c = await q01<{ engagement_id: string; state: EtatCellule; column_code: string; delta_signed: string | null }>(
    `select engagement_id::text, state, column_code, delta_signed::text from test_cell where id = $1 and engagement_id = $2`,
    [cellId, engagementId]);
  if (!c) throw new Error('Cellule inconnue sur ce dossier.');
  await refuserSiScelle(c.engagement_id);
  if (!motif || !motif.trim()) {
    throw new Error(`TEST-03 : une disposition porte un motif écrit — la cellule « ${c.column_code} » reste ${c.state}.`);
  }
  if (c.state === 'non_recevable') {
    throw new Error(`TEST-02 : l’attribut d’identité « ${c.column_code} » diverge — cela ne se dispose pas, la preuve n’est pas recevable ; obtenez la bonne pièce.`);
  }
  if (c.state === 'conforme') throw new Error(`La cellule « ${c.column_code} » est conforme : rien à disposer.`);
  const ctx = await engagementCtx(c.engagement_id);
  await q(
    `insert into cell_disposition (engagement_id, cell_id, reason, state_at_decision, delta_at_decision, decided_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (cell_id) do update set reason = excluded.reason, state_at_decision = excluded.state_at_decision,
       delta_at_decision = excluded.delta_at_decision, decided_by = excluded.decided_by, decided_at = now()`,
    [c.engagement_id, cellId, motif.trim(), c.state, c.delta_signed, userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'test_cell_dispositioned', objectType: 'test_cell', objectId: cellId,
    payload: { colonne: c.column_code, etat: c.state, delta: c.delta_signed, motif: motif.trim().slice(0, 500) },
  });
}

/**
 * Conclure une ligne (touche V) : refusé si un attribut d'identité diverge
 * (TEST-02), si une cellule non conforme n'a pas de disposition (TEST-04), si
 * aucune cellule n'est calculée. Les refus sont tenus en base ; le service les
 * nomme AVANT, avec l'attribut, pour que l'écran parle.
 */
export async function conclureLigne(engagementId: string, sampleItemId: string, userId: string): Promise<void> {
  await refuserSiScelle(engagementId);
  const grille = await grilleDuDossier(engagementId);
  if (!grille) throw new Error('TEST-04 : la ligne ne se conclut pas — aucune grille calculée (lancez le calcul de la grille).');
  const { cellules } = await cellulesDuDossier(engagementId);
  const mes = cellules[sampleItemId] ?? [];
  if (mes.length === 0) throw new Error('TEST-04 : la ligne ne se conclut pas — aucune cellule calculée (lancez le calcul de la grille).');
  const identite = mes.find((c) => c.etat === 'non_recevable');
  if (identite) {
    throw new Error(`TEST-02 : la ligne ne se conclut pas — l’attribut d’identité « ${identite.libelle} » diverge (grand livre « ${identite.attendu ?? ''} », pièce « ${identite.trouve ?? ''} ») : la preuve n’est pas recevable.`);
  }
  const ouverte = mes.find((c) => c.etat !== 'conforme' && !c.disposition);
  if (ouverte) {
    throw new Error(`TEST-04 : la ligne ne se conclut pas — la cellule « ${ouverte.libelle} » est ${ouverte.etat.replace('_', ' ')}${ouverte.delta ? ` (delta ${ouverte.delta})` : ''} sans disposition écrite${ouverte.dispositionPerimee ? ' (la disposition existante portait sur une autre valeur)' : ''}.`);
  }
  const ctx = await engagementCtx(engagementId);
  await q(
    `insert into test_line_conclusion (engagement_id, grid_id, sample_item_id, cells_hash, concluded_by)
     values ($1, $2, $3, $4, $5)
     on conflict (sample_item_id) do update set grid_id = excluded.grid_id, cells_hash = excluded.cells_hash,
       concluded_by = excluded.concluded_by, concluded_at = now()`,
    [engagementId, grille.id, sampleItemId, empreinteCellules(mes), userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'test_line_concluded', objectType: 'sample_item', objectId: sampleItemId,
    payload: { grille: grille.id, cellules: mes.map((c) => [c.colonne, c.etat]) },
  });
}

/* ── L'avertissement au visa ─────────────────────────────────────────────── */

/**
 * Les lignes de l'échantillon tiré qui ne sont pas conclues (ou dont la
 * conclusion est périmée). Famille `unsupported_sample_items` : un
 * AVERTISSEMENT tant que le pack ne la déclare pas bloquante (drapeau
 * `flags.unsupportedSampleItemsBlocking`, à `false` dans nep-fr).
 */
export async function lignesNonConclues(engagementId: string): Promise<{ total: number; nonConclues: number; perimees: number }> {
  const sample = await currentRevenueSample(engagementId);
  if (!sample || sample.status !== 'drawn') return { total: 0, nonConclues: 0, perimees: 0 };
  const { conclusions } = await cellulesDuDossier(engagementId);
  let nonConclues = 0;
  let perimees = 0;
  for (const it of sample.items) {
    const c = conclusions[it.id];
    if (!c) nonConclues++;
    else if (c.perimee) perimees++;
  }
  return { total: sample.items.length, nonConclues, perimees };
}
