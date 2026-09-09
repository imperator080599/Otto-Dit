import { q, q01, q1, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { now, DAY_MS } from '@/lib/core/clock';
import { engagementCtx } from './imports';
import { frameworkSet, fsliAccounts } from './fsli';
import { getAccountingMap } from '@/lib/packs';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// S4 request engine: PBC generation from the sample (per-tested-unit items) + standing
// items; L2 send gate; statuses; lazy reminder cadence (Q8) against the demo clock.

/** Le numéro d'une demande tel qu'il s'affiche partout : R-001. Formé ici et
 *  nulle part ailleurs — quatre écrans le recomposaient chacun. */
export const numeroDemande = (seq: number | string): string => `R-${String(seq).padStart(3, '0')}`;

export async function nextSeq(engagementId: string): Promise<number> {
  const r = await q1<{ n: string }>(`select coalesce(max(seq_no), 0) n from request where engagement_id = $1`, [engagementId]);
  return Number(r.n) + 1;
}

/** Le code d'evidence_type de l'étape 1 (plan d'autonomie, Partie B) — un seul
 *  endroit, jamais un littéral répété (revue hostile du 2026-09-06). */
export const EVIDENCE_TYPE_DETAIL_DE_COMPTE = 'detail_de_compte';

/** DISTINCT du code ci-dessus (mandat 2026-09-09, §2.3) — pas une variante, une PORTÉE
 *  différente : `EVIDENCE_TYPE_DETAIL_DE_COMPTE` demande TOUT le poste (Partie B, étape 1,
 *  `demanderDetailDeCompte`) ; celui-ci ne demande que les comptes AU-DESSUS DU CTT
 *  (`demanderDetailAuDessusDuCtt`, ci-dessous). Un même code aurait fait apparaître une demande
 *  CTT comme LA demande « détail du compte » du poste dans `derniereDemandeDetailDeCompte`
 *  (utilisée par `/sampling` pour éviter une seconde demande) — deux objets différents,
 *  deux codes différents. */
export const EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT = 'detail_de_compte_ctt';

/**
 * Plan d'autonomie, Partie B, étape 1 : LA DEMANDE NAÎT DU POSTE, jamais
 * d'une saisie. Les comptes visés viennent du même mécanisme qui statue le
 * périmètre (mapAccount contre les règles du pack + les surcharges du
 * dossier) — pas d'un cycle en dur comme generatePbcFromSample (701/709).
 * Ne vérifie PAS que le compte a déjà une demande de détail en cours : un
 * second clic crée une seconde demande (même défaut que redigerQuestions
 * et generatePbcFromSample — non traité ici, non élargi à cette tranche).
 */
export async function demanderDetailDeCompte(engagementId: string, fsliCode: string, userId: string): Promise<string> {
  await assertMembre(engagementId, userId, 'demanderDetailDeCompte');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const fr = fs.language === 'fr';
  const map = getAccountingMap(fs.accounting_map);
  const def = map.fslis.find((f) => f.code === fsliCode);
  if (!def) {
    throw new Error(fr
      ? `poste inconnu du pack comptable (${fs.accounting_map}) : ${fsliCode}`
      : `unknown poste in the accounting-map pack (${fs.accounting_map}): ${fsliCode}`);
  }
  const comptes = await fsliAccounts(engagementId, fsliCode);
  if (!comptes.length) {
    throw new Error(fr
      ? `détail du compte : aucun compte du poste « ${def.name.fr} » sur la balance courante — rien à demander`
      : `account detail: no account of "${def.name.en}" on the current trial balance — nothing to request`);
  }
  const seq = await nextSeq(engagementId);
  const liste = comptes.map((c) => `${c.number} ${c.label}`).join(', ');
  const req = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status, evidence_type_code, fsli_code)
     values ($1,$2,$3,$4,'draft',$5,$6) returning id`,
    [engagementId, seq,
      fr ? `Détail du compte — ${def.name.fr}` : `Account detail — ${def.name.en}`,
      fs.language, EVIDENCE_TYPE_DETAIL_DE_COMPTE, fsliCode],
  );
  await q(
    `insert into request_item (request_id, kind, description) values ($1,'document',$2)`,
    [req.id, fr
      ? `Détail du compte à la clôture (${ctx.period_end}) pour ${liste} — total, mouvements et pièces justificatives selon le format habituel du client.`
      : `Account detail as of period end (${ctx.period_end}) for ${liste} — total, movements, and supporting records in the client's usual format.`],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'detail_de_compte_demande', objectType: 'request', objectId: req.id,
    payload: { fsliCode, comptes: comptes.map((c) => c.number) },
  });
  return req.id;
}

/**
 * Mandat 2026-09-09, §2.3 : LA DEMANDE DE DÉTAIL AU-DESSUS DU CTT — déclenchée par la MÊME
 * DÉTECTION que le drapeau de bascule (§2.1, `fsli.ts::detecterBasculesMaterialite`) et
 * l'ouverture de section (§2.2), jamais un geste séparé (mandat §2.5, épreuve 3 : « le même
 * import »). RÉUTILISE le mécanisme de demandes de la Partie B TEL QUEL — même table `request`/
 * `request_item`, même forme que `demanderDetailDeCompte` juste au-dessus. AUCUN CHEMIN NEUF :
 * seul le FILTRE change (les comptes du poste dont le solde absolu dépasse le CTT, pas tout le
 * poste). N'APPELLE PAS `demanderDetailDeCompte` et n'en modifie pas le comportement : celui-ci
 * sert Partie B, étape 1, sur TOUT le poste — un appelant DÉJÀ testé (s3s4.test.ts, suivi.test.ts)
 * dont le contrat ne doit pas changer pour ce mandat-ci.
 *
 * Idempotence : PAS de garde locale ici — l'appelant unique (`detecterBasculesMaterialite`)
 * n'appelle cette fonction QUE pour une bascule NOUVELLEMENT posée (`on conflict do nothing` sur
 * `fsli_materiality_bascule` déjà filtré en amont) ; un ré-import ne rappelle donc jamais cette
 * fonction pour le même poste, et une seconde demande n'est jamais créée par ce chemin.
 *
 * CE QUE CETTE FONCTION NE VÉRIFIE PAS (règle 19) : que le CTT reçu (`cttCents`) est bien celui de
 * la matérialité VALIDÉE courante — c'est la responsabilité de l'appelant, qui le lit dans la même
 * requête que le seuil de performance (une seule source, pas deux lectures qui pourraient
 * diverger si la matérialité était revalidée entre-temps).
 */
export async function demanderDetailAuDessusDuCtt(
  engagementId: string, fsliCode: string, cttCents: number, userId: string | null,
): Promise<string | null> {
  await assertMembre(engagementId, userId, 'demanderDetailAuDessusDuCtt');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const fr = fs.language === 'fr';
  const map = getAccountingMap(fs.accounting_map);
  const def = map.fslis.find((f) => f.code === fsliCode);
  if (!def) {
    /* Ne devrait jamais arriver : `fsliCode` vient d'une ligne `fsli` déjà validée par le même
       pack (même garde que `demanderDetailDeCompte` ci-dessus) — lève plutôt que d'avaler une
       incohérence de données (règle 13). */
    throw new Error(fr
      ? `poste inconnu du pack comptable (${fs.accounting_map}) : ${fsliCode}`
      : `unknown poste in the accounting-map pack (${fs.accounting_map}): ${fsliCode}`);
  }
  const comptes = (await fsliAccounts(engagementId, fsliCode))
    .filter((c) => Math.abs(c.balanceCents) >= cttCents);
  if (!comptes.length) return null; // rien au-dessus du CTT — pas une erreur, rien à demander
  const seq = await nextSeq(engagementId);
  const liste = comptes.map((c) => `${c.number} ${c.label}`).join(', ');
  const req = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status, evidence_type_code, fsli_code)
     values ($1,$2,$3,$4,'draft',$5,$6) returning id`,
    [engagementId, seq,
      fr ? `Détail du compte (au-dessus du CTT) — ${def.name.fr}` : `Account detail (above CTT) — ${def.name.en}`,
      fs.language, EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT, fsliCode],
  );
  await q(
    `insert into request_item (request_id, kind, description) values ($1,'document',$2)`,
    [req.id, fr
      ? `Détail du compte à la clôture (${ctx.period_end}) pour ${liste} — comptes au-dessus du `
        + `seuil de signification négligeable (CTT), suite à la bascule de matérialité du poste `
        + `« ${def.name.fr} ». Total, mouvements et pièces justificatives selon le format habituel du client.`
      : `Account detail as of period end (${ctx.period_end}) for ${liste} — accounts above the `
        + `clearly-trivial threshold (CTT), following the materiality bascule of "${def.name.en}". `
        + 'Total, movements, and supporting records in the client\'s usual format.'],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: userId ? 'user' : 'system', actorId: userId,
    verb: 'detail_de_compte_demande_ctt', objectType: 'request', objectId: req.id,
    payload: { fsliCode, comptes: comptes.map((c) => c.number), cttCents },
  });
  return req.id;
}

/**
 * Mandat contrôle interne, §3.1/CTRL-05 : la population d'un contrôle `adhoc`/`many_daily` (le
 * mandat dit « as_needed » — aucune autre valeur de `Frequency` ne porte ce concept) se DEMANDE
 * au client, jamais dérivée (`FREQUENCES_DERIVABLES`, sox.ts). RÉUTILISE le mécanisme de la
 * Partie B tel quel — `request`/`request_item`, `kind='listing'`, même forme que
 * `requestAndImportListing` (part2.ts) — aucun chemin neuf, aucun formulaire parallèle.
 * Ne vérifie PAS qu'une demande existe déjà (même défaut de classe que `demanderDetailDeCompte`
 * ci-dessus, R63 — non élargi à cette tranche) : un second clic crée une seconde demande.
 */
export async function demanderPopulationControle(controlId: string, userId: string): Promise<string> {
  await assertMembreDe('control', controlId, userId, 'demander la population d’un contrôle');
  const c = await q1<{ engagement_id: string; code: string; name: string }>(
    `select engagement_id, code, name from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const seq = await nextSeq(c.engagement_id);
  const req = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status, control_id)
     values ($1,$2,$3,'en','draft',$4) returning id`,
    [c.engagement_id, seq, `Control population listing — ${c.code} ${c.name}`, controlId],
  );
  await q(
    `insert into request_item (request_id, kind, description) values ($1,'listing',$2)`,
    [req.id, `Complete listing of all ${c.code} control instances performed during the period (date, performer).`],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_population_requested', objectType: 'request', objectId: req.id,
    payload: { code: c.code, controlId },
  });
  return req.id;
}

/** La dernière demande de population pour ce contrôle, si une existe déjà — même rôle que
 *  `derniereDemandeDetailDeCompte` ci-dessus : un lien vers elle plutôt que d'en recréer une
 *  seconde, et le garde CTRL-05 (sox.ts, `drawAttributeSample`) s'appuie sur SA présence. */
export async function derniereDemandePopulationControle(controlId: string) {
  return q01<{ id: string; seq_no: number; status: string }>(
    `select id, seq_no, status from request where control_id = $1 order by seq_no desc limit 1`,
    [controlId],
  );
}

/** Generate the PBC request from a drawn sample (draft — auditor approves send, L2). */
export async function generatePbcFromSample(engagementId: string, sampleId: string, userId: string): Promise<string> {
  await assertMembre(engagementId, userId, 'generatePbcFromSample');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const fr = fs.language === 'fr';
  const sample = await q1<{ id: string; procedure_id: string }>(`select id, procedure_id from sample where id = $1 and status = 'drawn'`, [sampleId]);
  const items = await q<{
    id: string; selection_reason: string; amount: string; natural_key: string; entry_no: string;
    journal_code: string; account_no: string; piece_ref: string | null; aux_label: string | null; entry_date: string;
  }>(
    `select si.id, si.selection_reason, si.amount::text, g.natural_key, g.entry_no, g.journal_code,
            g.account_no, g.piece_ref, g.aux_label, g.entry_date::text
     from sample_item si join gl_entry g on g.id = si.unit_id where si.sample_id = $1`,
    [sample.id],
  );
  const seq = await nextSeq(engagementId);
  const due = new Date((await now()).getTime() + 10 * DAY_MS).toISOString().slice(0, 10);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, procedure_id, title, language, status, due_date)
     values ($1,$2,$3,$4,$5,'draft',$6) returning id`,
    [
      engagementId, seq, sample.procedure_id,
      fr ? `Justificatifs — contrôle du chiffre d'affaires (sélection)` : 'Supporting documents — revenue testing (selection)',
      fs.language, due,
    ],
  );
  for (const it of items) {
    const isCreditNote = it.piece_ref?.toUpperCase().startsWith('AV') || it.account_no.startsWith('709');
    const isManualJe = it.journal_code === 'OD';
    const isGoods = it.account_no.startsWith('701');
    if (isManualJe) {
      await q(
        `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'explanation',$2,$3)`,
        [request.id, fr
          ? `Explication de l'écriture manuelle ${it.entry_no} du ${it.entry_date} (${it.amount} € — pièce ${it.piece_ref ?? '—'}) : nature, justification et documentation à l'appui.`
          : `Explanation of manual entry ${it.entry_no} dated ${it.entry_date} (${it.amount} €).`, it.id],
      );
      continue;
    }
    await q(
      `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'document',$2,$3)`,
      [request.id, fr
        ? `${isCreditNote ? 'Avoir' : 'Facture de vente'} ${it.piece_ref ?? it.entry_no} — ${it.aux_label ?? ''} (${it.amount} €)`
        : `${isCreditNote ? 'Credit note' : 'Sales invoice'} ${it.piece_ref ?? it.entry_no} — ${it.aux_label ?? ''} (${it.amount} €)`, it.id],
    );
    if (isGoods && !isCreditNote) {
      await q(
        `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'document',$2,$3)`,
        [request.id, fr
          ? `Bon de livraison associé à la facture ${it.piece_ref ?? it.entry_no}`
          : `Delivery note for invoice ${it.piece_ref ?? it.entry_no}`, it.id],
      );
    }
  }
  // standing items (procedure-level, Gate 2): bank statements supporting the period
  for (const label of fr
    ? ['Relevé bancaire 512100 — novembre 2025', 'Relevé bancaire 512100 — décembre 2025']
    : ['Bank statement 512100 — November 2025', 'Bank statement 512100 — December 2025']) {
    await q(`insert into request_item (request_id, kind, description) values ($1,'document',$2)`, [request.id, label]);
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'request_generated', objectType: 'request', objectId: request.id,
    payload: { seq, items: items.length, requestedBy: userId },
  });
  return request.id;
}

/* PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 5 — LES PIÈCES, ET LEURS DEMANDES. Un
   bouton en un clic par TYPE de pièce (facture, bon de livraison), par
   ligne d'échantillon ET en lot pour tout l'échantillon — complémentaire à
   `generatePbcFromSample` (qui reste inchangé : un seul paquet, toutes les
   pièces, jamais typé) plutôt qu'une réécriture. Les deux vocabulaires ne
   se recoupent PAS : un item créé par `generatePbcFromSample` ne porte pas
   `request.evidence_type_code`, donc ces fonctions ne le voient jamais
   comme « déjà demandé » — cliquer ici après le paquet standard crée une
   pièce RÉELLE, séparément suivie, jamais un double invisible (règle 20 :
   le geste n'est pas un décor). CE QUE CE MODULE NE FAIT PAS (règle 19) :
   il ne réconcilie pas les deux chemins de demande entre eux (R48,
   BACKLOG_REPORTE.md) ; REQ-02 (conclure une ligne dont une colonne exige
   une pièce jamais demandée) appartient à la grille de test, étapes 6-7,
   pas à ce fichier. */

export const EVIDENCE_TYPE_INVOICE = 'invoice';
export const EVIDENCE_TYPE_DELIVERY_NOTE = 'delivery_note';
const EVIDENCE_TYPES_CONNUS = new Set([EVIDENCE_TYPE_INVOICE, EVIDENCE_TYPE_DELIVERY_NOTE]);

interface LigneClassee {
  id: string; amount: string; entryNo: string; entryDate: string;
  pieceRef: string | null; auxLabel: string | null;
  isCreditNote: boolean; isManualJe: boolean; isGoods: boolean;
}

/** MÊME CLASSIFICATION que `generatePbcFromSample` ci-dessus (isCreditNote,
 *  isManualJe, isGoods) — dupliquée plutôt que partagée pour garder ce
 *  correctif localisé à cette tranche ; un futur changement de l'une doit
 *  changer l'autre à la main, non gardé par un test commun (limite nommée,
 *  règle 19). */
async function lignesClasseesDuTirage(sampleId: string): Promise<LigneClassee[]> {
  const rows = await q<{
    id: string; amount: string; entry_no: string; entry_date: string; journal_code: string;
    account_no: string; piece_ref: string | null; aux_label: string | null;
  }>(
    `select si.id, si.amount::text, g.entry_no, g.entry_date::text, g.journal_code,
            g.account_no, g.piece_ref, g.aux_label
     from sample_item si join gl_entry g on g.id = si.unit_id where si.sample_id = $1`,
    [sampleId],
  );
  return rows.map((it) => ({
    id: it.id, amount: it.amount, entryNo: it.entry_no, entryDate: it.entry_date,
    pieceRef: it.piece_ref, auxLabel: it.aux_label,
    isCreditNote: Boolean(it.piece_ref?.toUpperCase().startsWith('AV')) || it.account_no.startsWith('709'),
    isManualJe: it.journal_code === 'OD',
    isGoods: it.account_no.startsWith('701'),
  }));
}

function pieceApplicable(evidenceTypeCode: string, l: LigneClassee): boolean {
  if (l.isManualJe) return false; // une écriture manuelle porte une explication, jamais une pièce (generatePbcFromSample)
  if (evidenceTypeCode === EVIDENCE_TYPE_INVOICE) return true;
  if (evidenceTypeCode === EVIDENCE_TYPE_DELIVERY_NOTE) return l.isGoods && !l.isCreditNote;
  return false;
}

function descriptionDeLaPiece(evidenceTypeCode: string, l: LigneClassee, fr: boolean): string {
  if (evidenceTypeCode === EVIDENCE_TYPE_INVOICE) {
    return fr
      ? `${l.isCreditNote ? 'Avoir' : 'Facture de vente'} ${l.pieceRef ?? l.entryNo} — ${l.auxLabel ?? ''} (${l.amount} €)`
      : `${l.isCreditNote ? 'Credit note' : 'Sales invoice'} ${l.pieceRef ?? l.entryNo} — ${l.auxLabel ?? ''} (${l.amount} €)`;
  }
  return fr
    ? `Bon de livraison associé à la facture ${l.pieceRef ?? l.entryNo}`
    : `Delivery note for invoice ${l.pieceRef ?? l.entryNo}`;
}

/** REQ-01 (partiel) — refuse une demande sans type de pièce reconnu. CE QUE
 *  CETTE GARDE NE VÉRIFIE PAS (règle 19) : l'autre moitié de REQ-01 du
 *  mandat, « ni destinataire » — `request` ne porte aucun champ
 *  destinataire dans ce dépôt, sur aucun chemin, aujourd'hui ; le poser
 *  est hors périmètre de cette tranche (R48, BACKLOG_REPORTE.md). */
function assertTypeDePieceConnu(evidenceTypeCode: string): void {
  if (!EVIDENCE_TYPES_CONNUS.has(evidenceTypeCode)) {
    throw new Error(`REQ-01 : type de pièce inconnu ou absent (« ${evidenceTypeCode} ») — une demande porte toujours un type de pièce reconnu.`);
  }
}

/** Les pièces déjà demandées PAR CE MÉCANISME (evidence_type_code posé sur
 *  la demande), pour dessiner le lien plutôt que le bouton — jamais les
 *  demandes du paquet `generatePbcFromSample`, qui ne portent pas ce
 *  champ (voir l'en-tête du module). */
export async function piecesDemandeesParLigne(
  engagementId: string, sampleId: string, evidenceTypeCode: string,
): Promise<Map<string, { requestId: string; seqNo: number; status: string }>> {
  const rows = await q<{ sample_item_id: string; request_id: string; seq_no: number; status: string }>(
    `select ri.sample_item_id, r.id as request_id, r.seq_no, r.status
     from request_item ri join request r on r.id = ri.request_id
     join sample_item si on si.id = ri.sample_item_id
     where r.engagement_id = $1 and si.sample_id = $2 and r.evidence_type_code = $3`,
    [engagementId, sampleId, evidenceTypeCode],
  );
  return new Map(rows.map((r) => [r.sample_item_id, { requestId: r.request_id, seqNo: r.seq_no, status: r.status }]));
}

/** Étape 5, geste PAR LIGNE : une demande, une pièce, un type — le bouton en
 *  un clic sur une ligne précise de l'échantillon.
 *
 *  CE QUE CETTE FONCTION NE VÉRIFIE PAS (règle 19, trouvé par la revue
 *  hostile du 2026-09-07) : que `sampleItemId` appartient encore à
 *  l'échantillon COURANT — un re-tirage (ADR-133) peut faire passer un
 *  sample en `superseded` sans que cette fonction s'en aperçoive. AUCUN
 *  chemin d'aujourd'hui n'expose ce cas : le tableau n'affiche ces boutons
 *  QUE pour `currentRevenueSample` (sampling.ts, filtre `status <>
 *  'superseded'`), jamais pour le panneau « ce qui sort du tirage »
 *  (`lignesSortiesDuTirage`). Non corrigé volontairement : bloquer ici
 *  supposerait qu'une pièce sur une ligne sortie est TOUJOURS sans objet,
 *  ce que ADR-133 ne dit pas (le travail déjà porté par une ligne sortie
 *  reste visible et se statue, il ne s'efface pas) — une vraie garde
 *  demanderait de trancher cette question métier d'abord, hors périmètre
 *  d'Étape 5. */
export async function demanderPieceLigne(
  sampleItemId: string, evidenceTypeCode: string, userId: string,
): Promise<string> {
  /* L'ÉTANCHÉITÉ SE VÉRIFIE AVANT TOUTE AUTRE LECTURE (même règle que
     rapprocherDetailDeCompte, account-detail.ts) — trouvé par
     etancheite-executee.test.ts : REQ-01 passait AVANT ETANCH-04/01 dans
     une version précédente de cette fonction, ce qui aurait laissé un
     acteur d'un autre cabinet lire un message métier avant le refus
     d'étanchéité. */
  const engagementId = await assertMembreDe('sample_item', sampleItemId, userId, 'demanderPieceLigne');
  assertTypeDePieceConnu(evidenceTypeCode);
  const sampleRow = await q1<{ sample_id: string }>(`select sample_id from sample_item where id = $1`, [sampleItemId]);
  const lignes = await lignesClasseesDuTirage(sampleRow.sample_id);
  const ligne = lignes.find((l) => l.id === sampleItemId);
  if (!ligne) throw new Error('demanderPieceLigne : ligne d’échantillon introuvable');
  if (!pieceApplicable(evidenceTypeCode, ligne)) {
    throw new Error(`demanderPieceLigne : cette ligne ne porte pas de « ${evidenceTypeCode} » (écriture manuelle, avoir, ou type sans objet ici)`);
  }
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const fr = fs.language === 'fr';
  const seq = await nextSeq(engagementId);
  /* LA DEMANDE ET SON ÉLÉMENT, DANS LA MÊME TRANSACTION (revue hostile du
     2026-09-07 — même précédent que importerDetailDeCompte, account-detail.ts) :
     un échec entre les deux insertions laisserait une demande typée SANS
     AUCUN élément, exactement le cas que la lecture « étape 5 » de
     /api/sante existe pour attraper — mieux vaut l'empêcher que le détecter. */
  const reqId = await tx(async (run) => {
    const [req] = (await run(
      `insert into request (engagement_id, seq_no, title, language, status, evidence_type_code)
       values ($1,$2,$3,$4,'draft',$5) returning id`,
      [engagementId, seq,
        fr ? `Pièce — ${ligne.entryNo}` : `Supporting document — ${ligne.entryNo}`,
        fs.language, evidenceTypeCode],
    )) as { id: string }[];
    await run(
      `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'document',$2,$3)`,
      [req.id, descriptionDeLaPiece(evidenceTypeCode, ligne, fr), sampleItemId],
    );
    return req.id;
  });
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'piece_demandee', objectType: 'request', objectId: reqId,
    payload: { evidenceTypeCode, sampleItemId },
  });
  return reqId;
}

/** Étape 5, geste EN LOT : une seule demande, une ligne par unité de
 *  l'échantillon à laquelle ce type de pièce s'applique et qui n'est pas
 *  déjà suivie par ce mécanisme. Refuse plutôt que de poser une demande
 *  vide — une demande sans aucun élément serait un décor (règle 20). */
export async function demanderPiecesEnLot(
  sampleId: string, evidenceTypeCode: string, userId: string,
): Promise<string> {
  /* L'ÉTANCHÉITÉ SE VÉRIFIE SUR L'OBJET DÉSIGNÉ, PAS SUR UN ENGAGEMENT_ID
     REÇU DU FORMULAIRE (revue hostile du 2026-09-07, indépendamment
     convergée par deux réviseurs) : une version antérieure recevait
     `engagementId` en paramètre — posé par l'appelant, donc un champ caché
     de formulaire — et vérifiait l'appartenance du SEUL appelant à CET
     engagementId, sans jamais vérifier que `sampleId` (lui aussi un champ
     caché) appartenait bien à ce même dossier. Sous le rôle applicatif qui
     contourne la RLS (ADR-115, étape 3 de PLAN_RLS non exécutée), un membre
     légitime du cabinet A pouvait poser l'id d'un tirage du cabinet B dans
     ce champ et lire ses lignes (montants, tiers, références de pièce) —
     une fuite entre cabinets. `assertMembreDe('sample', ...)` remonte le
     dossier RÉEL du tirage et vérifie l'appartenance sur CELUI-là, même
     précédent que `demanderPieceLigne` ci-dessus. */
  const engagementId = await assertMembreDe('sample', sampleId, userId, 'demanderPiecesEnLot');
  assertTypeDePieceConnu(evidenceTypeCode);
  const lignes = await lignesClasseesDuTirage(sampleId);
  const dejaSuivies = await piecesDemandeesParLigne(engagementId, sampleId, evidenceTypeCode);
  const aTraiter = lignes.filter((l) => pieceApplicable(evidenceTypeCode, l) && !dejaSuivies.has(l.id));
  if (!aTraiter.length) {
    throw new Error(`demanderPiecesEnLot : aucune ligne de l’échantillon n’attend une « ${evidenceTypeCode} » — rien à demander`);
  }
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const fr = fs.language === 'fr';
  const seq = await nextSeq(engagementId);
  const titre = evidenceTypeCode === EVIDENCE_TYPE_INVOICE
    ? (fr ? 'Factures — sélection (lot)' : 'Invoices — selection (batch)')
    : (fr ? 'Bons de livraison — sélection (lot)' : 'Delivery notes — selection (batch)');
  /* LA DEMANDE ET TOUS SES ÉLÉMENTS, DANS LA MÊME TRANSACTION (revue hostile
     du 2026-09-07) : la boucle insérait un `request_item` à la fois, hors
     transaction — un échec à mi-boucle laissait une demande RÉELLE mais
     PARTIELLE (certaines lignes couvertes, d'autres non, sans que rien ne
     le distingue d'une demande complète). Un rejeu du lot après un échec
     aurait re-couvert le reste correctement (`piecesDemandeesParLigne` lit
     l'état réel), donc ce n'était pas un compte qui MENT — mais une
     transaction l'empêche d'exister du tout, même précédent que
     importerDetailDeCompte (account-detail.ts). */
  const reqId = await tx(async (run) => {
    const [req] = (await run(
      `insert into request (engagement_id, seq_no, title, language, status, evidence_type_code)
       values ($1,$2,$3,$4,'draft',$5) returning id`,
      [engagementId, seq, titre, fs.language, evidenceTypeCode],
    )) as { id: string }[];
    for (const l of aTraiter) {
      await run(
        `insert into request_item (request_id, kind, description, sample_item_id) values ($1,'document',$2,$3)`,
        [req.id, descriptionDeLaPiece(evidenceTypeCode, l, fr), l.id],
      );
    }
    return req.id;
  });
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'pieces_demandees_en_lot', objectType: 'request', objectId: reqId,
    payload: { evidenceTypeCode, lignes: aTraiter.length },
  });
  return reqId;
}

export async function approveSend(requestId: string, userId: string): Promise<void> {
  await assertMembreDe('request', requestId, userId, 'approuver l’envoi d’une demande');
  const r = await q1<{ id: string; engagement_id: string; status: string; seq_no: number }>(
    `select id, engagement_id, status, seq_no from request where id = $1`,
    [requestId],
  );
  if (r.status !== 'draft' && r.status !== 'reopened') throw new Error('only draft/reopened requests can be sent');
  const ctx = await engagementCtx(r.engagement_id);
  const ts = await now();
  await q(`update request set status = 'sent', sent_at = $2, approved_by = $3 where id = $1`, [requestId, ts.toISOString(), userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: r.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'request_sent', objectType: 'request', objectId: requestId,
    payload: { seq: r.seq_no },
  });
}

/** Lazy reminder materialization (Q8: due+3 business days, then weekly; pausable). */
export async function ensureReminders(engagementId: string): Promise<void> {
  const ts = await now();
  const requests = await q<{ id: string; sent_at: string | null; due_date: string | null; status: string }>(
    `select id, sent_at::text, due_date::text, status from request
     where engagement_id = $1 and status in ('sent','partially_submitted')`,
    [engagementId],
  );
  for (const r of requests) {
    if (!r.sent_at) continue;
    const paused = await q01<{ id: string }>(`select id from reminder where request_id = $1 and status = 'paused'`, [r.id]);
    if (paused) continue;
    const base = r.due_date ? Date.parse(r.due_date) : Date.parse(r.sent_at);
    const first = base + 3 * DAY_MS;
    const existing = await q<{ scheduled_for: string }>(
      `select scheduled_for::text from reminder where request_id = $1 order by scheduled_for`,
      [r.id],
    );
    const lastScheduled = existing.length ? Date.parse(existing[existing.length - 1].scheduled_for) : null;
    let next = lastScheduled === null ? first : lastScheduled + 7 * DAY_MS;
    while (next <= ts.getTime()) {
      await q(
        `insert into reminder (request_id, scheduled_for, sent_at, channel, status) values ($1,$2,$3,'portal','sent')`,
        [r.id, new Date(next).toISOString(), ts.toISOString()],
      );
      next += 7 * DAY_MS;
    }
  }
}

export async function pauseReminders(requestId: string, userId: string): Promise<void> {
  await assertMembreDe('request', requestId, userId, 'suspendre les relances d’une demande');
  const r = await q1<{ engagement_id: string }>(`select engagement_id from request where id = $1`, [requestId]);
  const ctx = await engagementCtx(r.engagement_id);
  await q(`insert into reminder (request_id, scheduled_for, channel, status) values ($1, now(), 'portal', 'paused')`, [requestId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: r.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'reminders_paused', objectType: 'request', objectId: requestId, payload: {},
  });
}

/**
 * ACTION EN LOT DE L'ATELIER (point 10) : une demande de clarification pour
 * PLUSIEURS lignes d'un coup — brouillon, un élément par ligne, circuit
 * d'approbation L2 existant. Traiter 167 éléments un par un est inutilisable.
 */
export async function demandeClarificationLignes(
  engagementId: string, sampleItemIds: string[], motif: string, userId: string,
): Promise<{
  requestId: string; items: number }> {
  await assertMembre(engagementId, userId, 'demandeClarificationLignes');
  if (!sampleItemIds.length) throw new Error('clarification : aucune ligne sélectionnée');
  if (!motif.trim()) throw new Error('clarification : le motif est vide — le client doit savoir quoi expliquer');
  const ctx = await engagementCtx(engagementId);
  const lignes = await q<{ id: string; piece: string }>(
    `select si.id::text id, coalesce(g.piece_ref, g.entry_no) piece
     from sample_item si join gl_entry g on g.id = si.unit_id
     where si.id = any($1::uuid[])`,
    [sampleItemIds],
  );
  if (!lignes.length) throw new Error('clarification : lignes inconnues');
  const seqRow = await q1<{ n: string }>(`select coalesce(max(seq_no),0) n from request where engagement_id = $1`, [engagementId]);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1,$2,$3,'fr','draft') returning id`,
    [engagementId, Number(seqRow.n) + 1, `Clarifications — ${lignes.length} élément(s) de l'échantillon`],
  );
  for (const l of lignes) {
    await q(
      `insert into request_item (request_id, kind, description, sample_item_id)
       values ($1, 'explanation', $2, $3)`,
      [request.id, `Pièce ${l.piece} : ${motif.trim()}`, l.id],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'clarification_batch_drafted', objectType: 'request', objectId: request.id,
    payload: { items: lignes.length, motif: motif.trim() },
  });
  return { requestId: request.id, items: lignes.length };
}

/** La dernière demande de détail de compte pour ce poste, si une existe déjà
 *  — le bouton « Demander le détail du compte » devient un lien vers elle
 *  plutôt que d'en recréer une seconde (plan d'autonomie, Partie B, étape 1 :
 *  « un lien cliquable conduit à cette demande… pour l'ajuster »). */
export async function derniereDemandeDetailDeCompte(engagementId: string, fsliCode: string) {
  return q01<{ id: string; seq_no: number; status: string }>(
    `select id, seq_no, status from request
     where engagement_id = $1 and fsli_code = $2 and evidence_type_code = $3
     order by seq_no desc limit 1`,
    [engagementId, fsliCode, EVIDENCE_TYPE_DETAIL_DE_COMPTE],
  );
}

export async function listRequests(engagementId: string) {
  return q<{ id: string; seq_no: number; title: string; status: string; due_date: string | null; sent_at: string | null; item_count: string; done_count: string; reminder_count: string }>(
    `select r.id, r.seq_no, r.title, r.status, r.due_date::text, r.sent_at::text,
            (select count(*) from request_item i where i.request_id = r.id) item_count,
            (select count(*) from request_item i where i.request_id = r.id and i.status in ('uploaded','complete','na')) done_count,
            (select count(*) from reminder m where m.request_id = r.id and m.status = 'sent') reminder_count
     from request r where r.engagement_id = $1 order by r.seq_no`,
    [engagementId],
  );
}

/**
 * Les demandes EN ATTENTE, avec leur ÂGE — la matière du tableau de bord
 * (mandat contrôle interne, §5 : « l'âge des demandes en attente »).
 *
 * EN ATTENTE veut dire ENVOYÉE et pas encore reçue en entier : `sent` ou
 * `partially_submitted` (le client a commencé, pas fini), et `reopened`
 * (une pièce refusée, redemandée). `draft` n'a jamais été envoyée — rien
 * n'attend personne — et `submitted`/`accepted` sont closes. L'âge se compte
 * depuis `sent_at`, jamais `created_at` : une demande rédigée un mois avant
 * son envoi n'attend le client que depuis l'envoi.
 */
export async function requestsEnAttente(engagementId: string): Promise<{
  id: string; seqNo: number; title: string; status: string; sentAt: string; ageJours: number;
}[]> {
  const t = await now();
  const rows = await q<{ id: string; seq_no: number; title: string; status: string; sent_at: string }>(
    `select id, seq_no, title, status, sent_at::text from request
     where engagement_id = $1 and status in ('sent', 'partially_submitted', 'reopened')
       and sent_at is not null
     order by sent_at asc`,
    [engagementId],
  );
  return rows.map((r) => ({
    id: r.id, seqNo: r.seq_no, title: r.title, status: r.status, sentAt: r.sent_at,
    ageJours: Math.floor((t.getTime() - new Date(r.sent_at).getTime()) / DAY_MS),
  }));
}

export async function requestDetail(requestId: string) {
  const request = await q01<{ id: string; engagement_id: string; seq_no: number; title: string; status: string; due_date: string | null; sent_at: string | null; language: string; evidence_type_code: string | null; fsli_code: string | null }>(
    `select id, engagement_id, seq_no, title, status, due_date::text, sent_at::text, language, evidence_type_code, fsli_code from request where id = $1`,
    [requestId],
  );
  if (!request) return null;
  const items = await q<{ id: string; kind: string; description: string; status: string; client_note: string | null; sample_item_id: string | null; control_instance_id: string | null; evidence_count: string }>(
    `select i.id, i.kind, i.description, i.status, i.client_note, i.sample_item_id, i.control_instance_id,
            (select count(*) from evidence e where e.request_item_id = i.id) evidence_count
     from request_item i where i.request_id = $1 order by i.created_at`,
    [requestId],
  );
  const reminders = await q<{ scheduled_for: string; sent_at: string | null; status: string }>(
    `select scheduled_for::text, sent_at::text, status from reminder where request_id = $1 order by scheduled_for`,
    [requestId],
  );
  return { request, items, reminders };
}
