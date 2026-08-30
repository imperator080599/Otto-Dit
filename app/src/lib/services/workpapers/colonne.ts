import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { getField, type ExtractedField } from '@/lib/services/extraction/fields';
import { nextSeq } from '@/lib/services/requests';

// LA COLONNE AJOUTÉE AU TABLEAU DE TESTING (ADR-099).
//
// LE PIÈGE, ET C'EST LE POINT CENTRAL : le nom de colonne est du texte libre.
// Si OTTO devine mal et remplit quand même, une donnée FAUSSE entre dans un
// papier de travail — le pire défaut possible de ce produit. Donc il PROPOSE
// son interprétation, en français et au complet (« je cherche la date figurant
// sur le bon de livraison, dans les pièces de type bon de livraison ») et il
// ATTEND la confirmation humaine. Rien ne se cherche avant. Confirmer, c'est
// aussi pouvoir CORRIGER : le catalogue des champs lisibles est fermé, et on
// choisit dedans.
//
// L'interprétation est DÉTERMINISTE d'abord (P4) : des règles sur le
// catalogue des champs que l'échelle d'extraction sait lire. Un interprète
// LLM pourra proposer quand les règles ne reconnaissent rien — derrière un
// adaptateur, avec garde de budget et coût affiché — mais il ne fera jamais
// que PROPOSER : la confirmation reste humaine, et le remplissage n'utilise
// que des champs du catalogue.
//
// DEUX ISSUES PAR CELLULE, JAMAIS UNE SEULE : la donnée est dans une pièce
// REÇUE (avec sa provenance : pièce + extraction, héritant de la file de
// vérification), ou elle n'y est dans AUCUNE — et alors une demande de
// clarification se PROPOSE (brouillon, approbation L2 existante) au lieu de
// laisser la case vide sans rien dire.

export interface ChampLisible {
  champ: string;
  docType: 'invoice' | 'delivery_note';
  libelle: string;
  motifs: RegExp;
}

/** Ce que l'échelle d'extraction SAIT lire (fields.ts) — le catalogue est
 *  fermé : une colonne ne peut viser que ces champs-là. */
export const CHAMPS_LISIBLES: ChampLisible[] = [
  { champ: 'deliveryDate', docType: 'delivery_note', libelle: 'la date figurant sur le bon de livraison', motifs: /date.{0,12}(livraison|bl\b)|(livraison|bl\b).{0,12}date/i },
  { champ: 'invoiceDate', docType: 'invoice', libelle: 'la date figurant sur la facture', motifs: /date.{0,12}factur|factur.{0,12}date/i },
  { champ: 'qtyTotal', docType: 'delivery_note', libelle: 'la quantité totale portée sur le bon de livraison', motifs: /quantit|qt[ée]|\bqte\b/i },
  { champ: 'totalNetCents', docType: 'invoice', libelle: 'le montant hors taxes de la facture', motifs: /\bht\b|hors taxe|montant net/i },
  { champ: 'totalGrossCents', docType: 'invoice', libelle: 'le montant TTC de la facture', motifs: /\bttc\b|toutes taxes/i },
  { champ: 'vatCents', docType: 'invoice', libelle: 'la TVA portée sur la facture', motifs: /\btva\b/i },
  { champ: 'invoiceNumber', docType: 'invoice', libelle: 'le numéro de la facture', motifs: /(num[ée]ro|n[o°]).{0,8}factur/i },
  { champ: 'deliveryNoteNumber', docType: 'delivery_note', libelle: 'le numéro du bon de livraison', motifs: /(num[ée]ro|n[o°]).{0,8}(bon|bl\b)/i },
  { champ: 'invoiceRef', docType: 'delivery_note', libelle: 'la référence de facture portée sur le bon de livraison', motifs: /r[ée]f[ée]rence.{0,12}factur/i },
  { champ: 'buyerName', docType: 'invoice', libelle: 'le nom du client porté sur la facture', motifs: /\bclient\b|acheteur/i },
  { champ: 'sellerName', docType: 'invoice', libelle: 'le nom du fournisseur porté sur la facture', motifs: /fournisseur|vendeur/i },
];

const DOC_LIBELLE: Record<string, string> = { invoice: 'facture', delivery_note: 'bon de livraison' };

export interface Interpretation {
  champ: string;
  docType: string;
  phrase: string;
}

export function phraseDe(c: ChampLisible): string {
  return `je cherche ${c.libelle}, dans les pièces de type ${DOC_LIBELLE[c.docType]}`;
}

/** Déterministe. Deux règles qui matchent = doute = pas de proposition
 *  automatique : on liste, l'humain choisit. */
export function interpreterTitre(titre: string): { interpretation: Interpretation | null; doute: ChampLisible[] } {
  const touches = CHAMPS_LISIBLES.filter((c) => c.motifs.test(titre));
  if (touches.length === 1) {
    const c = touches[0];
    return { interpretation: { champ: c.champ, docType: c.docType, phrase: phraseDe(c) }, doute: [] };
  }
  return { interpretation: null, doute: touches };
}

async function ctxEng(engagementId: string) {
  return q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
}

export interface ColonneAjoutee {
  id: string; workpaper_code: string; titre: string; justification: string;
  interpretation: Interpretation | null; statut: string; cout_usd: string;
  created_by_name?: string;
}

export async function ajouterColonne(
  engagementId: string, workpaperCode: string, titre: string, justification: string, userId: string,
): Promise<ColonneAjoutee> {
  if (!titre.trim()) throw new Error('colonne : le titre est vide');
  if (!justification.trim()) {
    throw new Error('colonne : ajouter une colonne modifie le modèle standard du papier — la justification est obligatoire, elle sort dans l\'export');
  }
  const { interpretation } = interpreterTitre(titre);
  const ctx = await ctxEng(engagementId);
  const row = await q1<{ id: string }>(
    `insert into wp_extra_column (engagement_id, workpaper_code, titre, justification, interpretation, created_by)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [engagementId, workpaperCode, titre.trim(), justification.trim(),
     interpretation ? JSON.stringify(interpretation) : null, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'wp_column_added', objectType: 'wp_extra_column', objectId: row.id,
    payload: { workpaperCode, titre, justification },
  });
  if (interpretation) {
    await logEvent({
      tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
      verb: 'wp_column_interpreted', objectType: 'wp_extra_column', objectId: row.id,
      payload: { interpretation, par: 'regles' },
    });
  }
  return { id: row.id, workpaper_code: workpaperCode, titre, justification, interpretation, statut: 'proposee', cout_usd: '0' };
}

/**
 * LA CONFIRMATION HUMAINE — le seul chemin vers le remplissage. `correction`
 * remplace la proposition (choisie dans le catalogue fermé) ; sans proposition
 * ni correction, refus : OTTO ne cherche pas ce qu'il n'a pas su nommer.
 */
export async function confirmerEtRemplir(
  columnId: string, userId: string, correction?: { champ: string },
): Promise<{ trouvees: number; introuvables: number }> {
  const col = await q1<{
    id: string; engagement_id: string; statut: string; titre: string;
    interpretation: Interpretation | null;
  }>(
    `select id, engagement_id, statut, titre, interpretation from wp_extra_column where id = $1`,
    [columnId],
  );
  if (col.statut === 'annulee') throw new Error('colonne annulée — elle ne se confirme plus');
  if (col.statut === 'remplie') throw new Error('colonne déjà remplie');
  let interp = col.interpretation;
  if (correction) {
    const c = CHAMPS_LISIBLES.find((x) => x.champ === correction.champ);
    if (!c) {
      throw new Error(
        `colonne : « ${correction.champ} » n'est pas un champ lisible. Le catalogue : `
        + CHAMPS_LISIBLES.map((x) => `${x.champ} (${x.libelle})`).join(' ; '),
      );
    }
    interp = { champ: c.champ, docType: c.docType, phrase: phraseDe(c) };
  }
  if (!interp) {
    throw new Error(
      `colonne : je n'ai pas su interpréter « ${col.titre} » et je ne remplis pas sur une devinette — `
      + 'choisissez un champ du catalogue (corriger) ou annulez la colonne. Ce que je sais lire : '
      + CHAMPS_LISIBLES.map((x) => x.libelle).join(' ; ') + '.',
    );
  }
  const ctx = await ctxEng(col.engagement_id);
  await q(
    `update wp_extra_column set statut = 'en_cours', interpretation = $2, confirmed_by = $3, confirmed_at = now()
     where id = $1`,
    [columnId, JSON.stringify(interp), userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: col.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'wp_column_confirmed', objectType: 'wp_extra_column', objectId: columnId,
    payload: { interpretation: interp, corrige: Boolean(correction) },
  });

  /* LE REMPLISSAGE : uniquement les pièces DÉJÀ REÇUES, uniquement le champ
     confirmé, provenance complète (pièce + extraction). La cellule hérite de
     la file de vérification : un champ relevé à un échelon OCR/LLM non
     attesté reste « à vérifier » — rien n'entre au papier comme un fait. */
  const items = await q<{ id: string }>(
    `select si.id::text id from sample_item si
     join sample s on s.id = si.sample_id
     where s.engagement_id = $1 and s.status = 'drawn' and si.unit_kind = 'gl_entry'`,
    [col.engagement_id],
  );
  let trouvees = 0; let introuvables = 0;
  for (const it of items) {
    const piece = await q01<{ evidence_id: string; extraction_id: string; fields: ExtractedField[]; status: string }>(
      `select e.id evidence_id, x.id extraction_id, x.fields, x.status
       from evidence e
       join request_item ri on ri.id = e.request_item_id
       left join lateral (
         select id, fields, status from extraction where evidence_id = e.id
         order by created_at desc limit 1
       ) x on true
       where ri.sample_item_id = $1 and e.quarantined = false and e.doc_type = $2
         and x.id is not null
       order by e.created_at desc limit 1`,
      [it.id, interp.docType],
    );
    const valeur = piece ? getField(piece.fields, interp.champ) : undefined;
    if (piece && valeur !== undefined) {
      await q(
        `insert into wp_extra_cell (column_id, engagement_id, sample_item_id, outcome, valeur, evidence_id, extraction_id, verifie)
         values ($1,$2,$3,'trouvee',$4,$5,$6,$7)
         on conflict (column_id, sample_item_id) do nothing`,
        [columnId, col.engagement_id, it.id, valeur, piece.evidence_id, piece.extraction_id,
         piece.status === 'complete' || piece.status === 'verified'],
      );
      trouvees += 1;
    } else {
      await q(
        `insert into wp_extra_cell (column_id, engagement_id, sample_item_id, outcome)
         values ($1,$2,$3,'introuvable')
         on conflict (column_id, sample_item_id) do nothing`,
        [columnId, col.engagement_id, it.id],
      );
      introuvables += 1;
    }
  }
  await q(`update wp_extra_column set statut = 'remplie' where id = $1`, [columnId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: col.engagement_id, actorKind: 'ai', actorId: null,
    verb: 'wp_column_filled', objectType: 'wp_extra_column', objectId: columnId,
    payload: { trouvees, introuvables, champ: interp.champ, docType: interp.docType },
  });
  return { trouvees, introuvables };
}

/** Une colonne ne se supprime pas : elle s'annule, et l'annulation se voit. */
export async function annulerColonne(columnId: string, userId: string): Promise<void> {
  const col = await q1<{ id: string; engagement_id: string; statut: string }>(
    `select id, engagement_id, statut from wp_extra_column where id = $1`, [columnId],
  );
  if (col.statut === 'remplie') {
    throw new Error('colonne remplie — elle ne s\'annule plus, elle fait partie du papier (et de son export)');
  }
  const ctx = await ctxEng(col.engagement_id);
  await q(`update wp_extra_column set statut = 'annulee' where id = $1`, [columnId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: col.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'wp_column_cancelled', objectType: 'wp_extra_column', objectId: columnId, payload: {},
  });
}

/**
 * LES INTROUVABLES NE RESTENT PAS MUETTES : une demande de clarification se
 * propose — BROUILLON, un élément par ligne sans pièce, approbation et envoi
 * par le circuit L2 existant (approveSend). Jamais d'envoi automatique.
 */
export async function proposerClarification(columnId: string, userId: string): Promise<{ requestId: string; items: number }> {
  const col = await q1<{ id: string; engagement_id: string; titre: string; statut: string; interpretation: Interpretation | null }>(
    `select id, engagement_id, titre, statut, interpretation from wp_extra_column where id = $1`, [columnId],
  );
  if (col.statut !== 'remplie') throw new Error('colonne non remplie — rien à clarifier encore');
  const vides = await q<{ id: string; sample_item_id: string; piece: string }>(
    `select c.id::text id, c.sample_item_id::text sample_item_id,
            coalesce(g.piece_ref, g.entry_no) piece
     from wp_extra_cell c
     join sample_item si on si.id = c.sample_item_id
     join gl_entry g on g.id = si.unit_id
     where c.column_id = $1 and c.outcome = 'introuvable' and c.clarification_request_item_id is null`,
    [columnId],
  );
  if (!vides.length) throw new Error('aucune ligne introuvable sans demande déjà proposée');
  const ctx = await ctxEng(col.engagement_id);
  const seq = await nextSeq(col.engagement_id);
  const req = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1, $2, $3, 'fr', 'draft') returning id`,
    [col.engagement_id, seq, `Clarification — « ${col.titre} » introuvable dans les pièces reçues`],
  );
  for (const v of vides) {
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, sample_item_id)
       values ($1, 'explanation', $2, $3) returning id`,
      [req.id,
       `Pièce ${v.piece} : ${col.interpretation ? col.interpretation.phrase : `« ${col.titre} »`} — la donnée `
       + 'ne figure dans aucune pièce reçue. Merci de transmettre le document qui la porte, ou d\'expliquer son absence.',
       v.sample_item_id],
    );
    await q(`update wp_extra_cell set clarification_request_item_id = $2 where id = $1`, [v.id, item.id]);
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: col.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'wp_column_clarification_proposed', objectType: 'request', objectId: req.id,
    payload: { columnId, items: vides.length },
  });
  return { requestId: req.id, items: vides.length };
}

export async function colonnesDuPapier(engagementId: string, workpaperCode: string) {
  return q<ColonneAjoutee & { created_by_name: string; confirmed_by_name: string | null }>(
    `select c.id::text id, c.workpaper_code, c.titre, c.justification, c.interpretation,
            c.statut, c.cout_usd::text cout_usd, u.name created_by_name, v.name confirmed_by_name
     from wp_extra_column c
     join app_user u on u.id = c.created_by
     left join app_user v on v.id = c.confirmed_by
     where c.engagement_id = $1 and c.workpaper_code = $2 and c.statut <> 'annulee'
     order by c.created_at`,
    [engagementId, workpaperCode],
  );
}

export interface CelluleAjoutee {
  column_id: string; sample_item_id: string; outcome: string; valeur: string | null;
  evidence_id: string | null; verifie: boolean; clarification_request_item_id: string | null;
}

export async function cellulesDuPapier(engagementId: string, workpaperCode: string): Promise<CelluleAjoutee[]> {
  return q<CelluleAjoutee>(
    `select c.column_id::text column_id, c.sample_item_id::text sample_item_id, c.outcome,
            c.valeur, c.evidence_id::text evidence_id, c.verifie, c.clarification_request_item_id::text clarification_request_item_id
     from wp_extra_cell c
     join wp_extra_column col on col.id = c.column_id
     where col.engagement_id = $1 and col.workpaper_code = $2 and col.statut <> 'annulee'`,
    [engagementId, workpaperCode],
  );
}
