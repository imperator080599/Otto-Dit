import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { fsliAccounts } from './fsli';
import { currentMateriality } from './materiality';
import { copiesCalculees } from './reunions';
import { numToCents } from '@/lib/util/num';
import { getTransportCircularisation } from './circularisations/transport';

// LES CIRCULARISATIONS — banques et avocats (point 3 du mandat, ADR-111).
//
// Le fondateur décrit une file d'agents ; la file est en réalité une MÉCANIQUE
// DÉTERMINISTE, et c'est mieux : rien ici n'a besoin d'un modèle (P4).
//
//   listing du client → COMPLÉTUDE dérivée → demandes (envoi simulé, L2)
//   → réponses déposées comme pièces → RAPPROCHEMENT dérivé → questions
//
// Trois refus portent la valeur du module :
//   · on n'envoie pas une demande sans date de clôture arrêtée ;
//   · on ne « reçoit » pas une confirmation qu'on n'a jamais envoyée ;
//   · on ne clôt pas une circularisation dont un compte du grand livre n'est
//     couvert par aucun tiers — c'est un obstacle au visa, pas un détail.
//
// Et une règle d'écriture : AUCUN statut n'est stocké. Le statut d'un tiers se
// dérive de ce qu'un humain a fait (envoyé, déposé, saisi) et de la comparaison
// au grand livre, recalculée à chaque lecture (statuts dérivés, ADR-084).

export type Nature = 'banque' | 'avocat';

/** Le poste qui porte les comptes à couvrir — PAR LE PACK, jamais un préfixe
 *  français écrit en dur : « 512 » n'existe pas dans un plan américain. */
const POSTE: Record<Nature, string> = { banque: 'CASH', avocat: 'PROVISIONS' };

const NOM: Record<Nature, { pluriel: string; tiers: string; ref: string }> = {
  banque: { pluriel: 'banques', tiers: 'banque', ref: 'n° de compte' },
  avocat: { pluriel: 'avocats', tiers: 'cabinet', ref: 'référence de dossier' },
};

export interface Tiers {
  id: string;
  nom: string;
  email: string;
  reference: string;
  compte: string | null;
  sent_at: string | null;
  received_at: string | null;
  evidence_id: string | null;
  montant_confirme: string | null;
  litiges: Litige[] | null;
  explication: string | null;
}

export interface Litige { objet: string; provision_cents: number; statut: string }

export class CircularisationError extends Error {}

// ── 1. LA CAMPAGNE ET SON LISTING ───────────────────────────────────────────

export async function campagne(engagementId: string, kind: Nature) {
  return q01<{ id: string; as_of: string; listing_evidence_id: string | null; created_at: string }>(
    `select id::text, as_of::text, listing_evidence_id::text, created_at::text
     from confirmation_campaign where engagement_id = $1 and kind = $2`,
    [engagementId, kind],
  );
}

export async function tiers(engagementId: string, kind: Nature): Promise<Tiers[]> {
  return q<Tiers>(
    `select p.id::text, p.nom, p.email, p.reference, p.compte,
            p.sent_at::text, p.received_at::text, p.evidence_id::text,
            p.montant_confirme::text, p.litiges, p.explication
     from confirmation_party p
     join confirmation_campaign c on c.id = p.campaign_id
     where c.engagement_id = $1 and c.kind = $2
     order by p.nom`,
    [engagementId, kind],
  );
}

/**
 * Le listing du client, importé.
 *
 * Format : `Tiers;Contact;Reference;Compte` — la même sévérité que les autres
 * imports (ADR-107) : une colonne manquante, une adresse sans « @ », une
 * référence en double ou un fichier vide sont REFUSÉS en nommant la ligne. Un
 * import qui « fait au mieux » fabrique un dossier que personne ne peut relire.
 */
export async function importerListing(
  engagementId: string, kind: Nature, contenu: string, userId: string,
  opts: { asOf?: string; evidenceId?: string | null } = {},
): Promise<{ campagneId: string; lignes: number }> {
  const ctx = await engagementCtx(engagementId);
  const lignes = contenu.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lignes.length < 2) {
    throw new CircularisationError(
      `listing ${NOM[kind].pluriel} : le fichier est vide (attendu : un en-tête « Tiers;Contact;Reference;Compte » puis une ligne par ${NOM[kind].tiers}).`);
  }
  const entete = lignes[0].toLowerCase().replace(/﻿/g, '');
  const colonnes = entete.split(';').map((c) => c.trim());
  for (const attendue of ['tiers', 'contact', 'reference']) {
    if (!colonnes.includes(attendue)) {
      throw new CircularisationError(
        `listing ${NOM[kind].pluriel} : colonne « ${attendue} » absente de l'en-tête (lu : ${colonnes.join(', ')}).`);
    }
  }
  const idx = (c: string) => colonnes.indexOf(c);
  const parses: { nom: string; email: string; reference: string; compte: string | null }[] = [];
  const vues = new Set<string>();
  for (let i = 1; i < lignes.length; i++) {
    const cells = lignes[i].split(';').map((c) => c.trim());
    const nom = cells[idx('tiers')] ?? '';
    const email = cells[idx('contact')] ?? '';
    const reference = cells[idx('reference')] ?? '';
    const compte = idx('compte') >= 0 ? (cells[idx('compte')] ?? '') : '';
    if (!nom || !reference) {
      throw new CircularisationError(`listing ${NOM[kind].pluriel} : ligne ${i + 1} — nom ou ${NOM[kind].ref} manquant.`);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new CircularisationError(`listing ${NOM[kind].pluriel} : ligne ${i + 1} — « ${email || '(vide)'} » n'est pas une adresse de courriel.`);
    }
    if (vues.has(reference)) {
      throw new CircularisationError(`listing ${NOM[kind].pluriel} : ligne ${i + 1} — la référence « ${reference} » apparaît deux fois.`);
    }
    vues.add(reference);
    parses.push({ nom, email, reference, compte: compte || null });
  }

  const asOf = opts.asOf ?? ctx.period_end;
  const existante = await campagne(engagementId, kind);
  const camp = existante ?? await q1<{ id: string }>(
    `insert into confirmation_campaign (engagement_id, kind, as_of, listing_evidence_id, created_by)
     values ($1,$2,$3,$4,$5) returning id::text`,
    [engagementId, kind, asOf, opts.evidenceId ?? null, userId],
  );
  if (existante) {
    /* RÉIMPORTER NE RASE PAS CE QUI EST PARTI. Une demande envoyée est un fait
       du dossier : le listing corrigé complète, il n'efface pas. */
    const partis = await q<{ reference: string }>(
      `select reference from confirmation_party where campaign_id = $1 and sent_at is not null`,
      [camp.id]);
    const gardes = new Set(partis.map((p) => p.reference));
    await q(
      `delete from confirmation_party where campaign_id = $1 and sent_at is null`, [camp.id]);
    for (const p of parses.filter((x) => gardes.has(x.reference))) {
      await q(`update confirmation_party set nom = $2, email = $3, compte = $4
               where campaign_id = $1 and reference = $5`,
        [camp.id, p.nom, p.email, p.compte, p.reference]);
    }
    if (opts.evidenceId) {
      await q(`update confirmation_campaign set listing_evidence_id = $2 where id = $1`, [camp.id, opts.evidenceId]);
    }
  }
  let ajoutes = 0;
  for (const p of parses) {
    const deja = await q01<{ id: string }>(
      `select id from confirmation_party where campaign_id = $1 and reference = $2`, [camp.id, p.reference]);
    if (deja) continue;
    await q(
      `insert into confirmation_party (campaign_id, nom, email, reference, compte)
       values ($1,$2,$3,$4,$5)`,
      [camp.id, p.nom, p.email, p.reference, p.compte]);
    ajoutes++;
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'circularisation.listing_importe', objectType: 'confirmation_campaign', objectId: camp.id,
    payload: { kind, lignes: parses.length, ajoutes, asOf },
  });
  return { campagneId: camp.id, lignes: parses.length };
}

// ── 2. LA COMPLÉTUDE, DÉRIVÉE ───────────────────────────────────────────────

export interface Complétude {
  poste: string;
  comptesSansTiers: { compte: string; libelle: string; soldeCents: number }[];
  tiersSansCompte: { nom: string; reference: string; compte: string | null }[];
}

/**
 * Les deux sens du même contrôle.
 *
 * Un compte du poste que le listing ne couvre pas est le défaut classique — un
 * compte bancaire oublié par le client. Une ligne du listing qu'aucun compte ne
 * porte l'est tout autant : un compte ouvert et jamais comptabilisé. Les deux
 * se DISENT ; c'est le client qui explique, pas la machine qui devine.
 */
export async function completude(engagementId: string, kind: Nature): Promise<Complétude> {
  const poste = POSTE[kind];
  const comptes = await fsliAccounts(engagementId, poste);
  const listes = await tiers(engagementId, kind);
  const couverts = new Set(listes.map((t) => t.compte).filter((c): c is string => Boolean(c)));
  return {
    poste,
    comptesSansTiers: comptes
      .filter((c) => !couverts.has(c.number))
      .map((c) => ({ compte: c.number, libelle: c.label, soldeCents: c.balanceCents })),
    tiersSansCompte: listes
      .filter((t) => !t.compte || !comptes.some((c) => c.number === t.compte))
      .map((t) => ({ nom: t.nom, reference: t.reference, compte: t.compte })),
  };
}

// ── 3. L'ENVOI (simulé, jamais sans humain) ─────────────────────────────────

export async function envoyer(partyId: string, userId: string): Promise<{ remis: boolean; detail: string }> {
  const p = await q1<{ id: string; nom: string; email: string; reference: string; sent_at: string | null; engagement_id: string; kind: Nature; as_of: string }>(
    `select p.id::text, p.nom, p.email, p.reference, p.sent_at::text,
            c.engagement_id::text, c.kind, c.as_of::text
     from confirmation_party p join confirmation_campaign c on c.id = p.campaign_id
     where p.id = $1`,
    [partyId]);
  if (p.sent_at) {
    throw new CircularisationError('circularisation : cette demande est déjà partie (simulée) — on ne circularise pas deux fois le même tiers sans le dire.');
  }
  const ctx = await engagementCtx(p.engagement_id);
  /* LES COPIES SONT CELLES DU DOSSIER (ADR-101) : l'équipe, et le contact
     client clé — le fondateur le demande explicitement, et c'est juste : le
     client doit voir partir la demande qu'il a rendue possible. Sans contact
     clé déclaré, on REFUSE en disant où le déclarer, au lieu d'envoyer une
     demande dont personne côté client n'aura eu connaissance. */
  const copies = await copiesCalculees(p.engagement_id).catch(() => {
    throw new CircularisationError(
      'circularisation : la mission n\'a pas de contact client clé — déclarez-le (écran Réunions) '
      + 'avant d\'écrire à un tiers en son nom.');
  });
  const transport = getTransportCircularisation();
  const objet = p.kind === 'banque'
    ? `Confirmation de solde au ${p.as_of} — ${p.reference}`
    : `Confirmation des litiges en cours au ${p.as_of} — ${p.reference}`;
  const remise = await transport.envoyer({
    destinataire: p.email,
    copies: copies.map((c) => c.email),
    objet,
    corps: `Dans le cadre de l'audit des comptes clos le ${p.as_of}, merci de confirmer directement `
      + (p.kind === 'banque'
        ? `le solde du compte ${p.reference} à cette date, ainsi que les engagements hors bilan.`
        : `les litiges en cours, leur objet et les montants provisionnés à cette date.`),
  });
  await q(`update confirmation_party set sent_at = now(), sent_by = $2 where id = $1`, [partyId, userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'circularisation.envoi_simule', objectType: 'confirmation_party', objectId: partyId,
    payload: { kind: p.kind, tiers: p.nom, copies: copies.length, transport: transport.name, remis: remise.remis },
  });
  return remise;
}

// ── 4. LA RÉPONSE, DÉPOSÉE ET SAISIE ────────────────────────────────────────

export async function deposerReponse(input: {
  partyId: string; userId: string; evidenceId: string;
  montantConfirmeCents?: number; litiges?: Litige[];
}): Promise<void> {
  const p = await q1<{ sent_at: string | null; engagement_id: string; kind: Nature; nom: string }>(
    `select p.sent_at::text, c.engagement_id::text, c.kind, p.nom
     from confirmation_party p join confirmation_campaign c on c.id = p.campaign_id
     where p.id = $1`, [input.partyId]);
  if (!p.sent_at) {
    throw new CircularisationError('circularisation : aucune demande n\'est partie vers ce tiers — une confirmation qu\'on n\'a pas demandée n\'est pas une réponse.');
  }
  if (p.kind === 'banque' && input.montantConfirmeCents === undefined) {
    throw new CircularisationError('circularisation : le solde confirmé est obligatoire — c\'est lui qu\'on rapproche.');
  }
  if (p.kind === 'avocat' && (!input.litiges || input.litiges.length === 0)) {
    throw new CircularisationError('circularisation : la réponse d\'un cabinet se saisit litige par litige (« aucun litige » se déclare par une ligne « néant », jamais par un vide).');
  }
  const ctx = await engagementCtx(p.engagement_id);
  await q(
    `update confirmation_party
     set received_at = now(), evidence_id = $2, montant_confirme = $3, litiges = $4, saisi_par = $5
     where id = $1`,
    [
      input.partyId, input.evidenceId,
      input.montantConfirmeCents === undefined ? null : input.montantConfirmeCents / 100,
      input.litiges ? JSON.stringify(input.litiges) : null,
      input.userId,
    ]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagement_id, actorKind: 'user', actorId: input.userId,
    verb: 'circularisation.reponse_saisie', objectType: 'confirmation_party', objectId: input.partyId,
    payload: { kind: p.kind, tiers: p.nom, evidenceId: input.evidenceId },
  });
}

// ── 5. LE RAPPROCHEMENT, DÉRIVÉ ─────────────────────────────────────────────

export type EtatTiers = 'a_envoyer' | 'envoyee' | 'recue' | 'rapprochee' | 'ecart';

export interface LigneRapprochement {
  id: string; nom: string; reference: string; compte: string | null;
  etat: EtatTiers;
  soldeComptableCents: number | null;
  confirmeCents: number | null;
  ecartCents: number | null;
  /** Avocats : provision confirmée vs comptabilisée. */
  provisionConfirmeeCents: number | null;
  /** L'écart dépasse-t-il le seuil qui commande (banque : tout écart ; avocat : CTT) ? */
  remonte: boolean;
  evidenceId: string | null;
  explication: string | null;
}

export async function rapprochement(engagementId: string, kind: Nature): Promise<{
  lignes: LigneRapprochement[]; seuilCents: number | null; regle: string;
}> {
  const comptes = await fsliAccounts(engagementId, POSTE[kind]);
  const soldes = new Map(comptes.map((c) => [c.number, c.balanceCents]));
  const mat = await currentMateriality(engagementId);
  const ctt = mat ? numToCents(mat.ctt_amount) : null;
  const lignes: LigneRapprochement[] = [];
  for (const t of await tiers(engagementId, kind)) {
    const solde = t.compte ? soldes.get(t.compte) ?? null : null;
    const confirme = t.montant_confirme === null ? null : numToCents(t.montant_confirme);
    const provisions = t.litiges ? t.litiges.reduce((s, l) => s + (l.provision_cents ?? 0), 0) : null;
    const compare = kind === 'banque' ? confirme : provisions;
    const ecart = solde !== null && compare !== null ? compare - solde : null;
    /* LA RÈGLE DIFFÈRE, ET C'EST VOULU : côté banque, TOUT écart se dit — un
       centime non expliqué sur un compte confirmé n'existe pas par hasard.
       Côté avocats, la provision est une estimation : c'est le seuil de
       remontée du dossier (CTT) qui décide. */
    const remonte = ecart !== null && (kind === 'banque' ? ecart !== 0 : Math.abs(ecart) > (ctt ?? 0));
    const etat: EtatTiers = !t.sent_at ? 'a_envoyer'
      : !t.received_at ? 'envoyee'
        : ecart === null ? 'recue'
          : remonte ? 'ecart' : 'rapprochee';
    lignes.push({
      id: t.id, nom: t.nom, reference: t.reference, compte: t.compte, etat,
      soldeComptableCents: solde, confirmeCents: confirme, ecartCents: ecart,
      provisionConfirmeeCents: provisions, remonte, evidenceId: t.evidence_id,
      explication: t.explication,
    });
  }
  return {
    lignes,
    seuilCents: kind === 'banque' ? 0 : ctt,
    regle: kind === 'banque'
      ? 'tout écart se dit, quel que soit son montant'
      : `écart remonté au-delà du seuil de remontée du dossier${ctt === null ? ' (non fixé : aucun seuil validé)' : ''}`,
  };
}

/**
 * L'ÉCART S'EXPLIQUE PAR ÉCRIT — sinon il reste ouvert.
 *
 * Voir un écart n'est pas le traiter. Tant que personne n'a écrit POURQUOI le
 * solde confirmé diffère de la comptabilité, l'obstacle au visa tient : c'est
 * la même règle que la résolution d'un écart de contrôle (ADR-B1), et c'est
 * elle qui rend le dossier relisible par un inspecteur.
 */
export async function expliquerEcart(partyId: string, texte: string, userId: string): Promise<void> {
  const t = texte.trim();
  if (t.length < 10) {
    throw new CircularisationError('circularisation : une explication d\'écart se rédige — « RAS » n\'explique rien à qui relira le dossier.');
  }
  const p = await q1<{ engagement_id: string; kind: Nature; nom: string }>(
    `select c.engagement_id::text, c.kind, p.nom
     from confirmation_party p join confirmation_campaign c on c.id = p.campaign_id
     where p.id = $1`, [partyId]);
  const r = await rapprochement(p.engagement_id, p.kind);
  const ligne = r.lignes.find((l) => l.id === partyId);
  if (!ligne || !ligne.remonte) {
    throw new CircularisationError('circularisation : ce tiers ne porte aucun écart à expliquer — une explication sans écart encombre le dossier.');
  }
  const ctx = await engagementCtx(p.engagement_id);
  await q(`update confirmation_party set explication = $2, explique_par = $3, explique_le = now() where id = $1`,
    [partyId, t, userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: p.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'circularisation.ecart_explique', objectType: 'confirmation_party', objectId: partyId,
    payload: { kind: p.kind, tiers: p.nom, ecartCents: ligne.ecartCents },
  });
}

// ── 6. CE QUI EN SORT : QUESTIONS AU CLIENT, ET OBSTACLES AU VISA ───────────

async function nextSeq(engagementId: string): Promise<number> {
  const r = await q1<{ n: string }>(
    `select coalesce(max(seq_no), 0) + 1 as n from request where engagement_id = $1`, [engagementId]);
  return Number(r.n);
}

/** Les questions au client — un BROUILLON (L2), une question par constat. */
export async function redigerQuestions(engagementId: string, kind: Nature, userId: string): Promise<string> {
  const c = await completude(engagementId, kind);
  const r = await rapprochement(engagementId, kind);
  const questions: string[] = [
    ...c.comptesSansTiers.map((x) =>
      `Le compte ${x.compte} « ${x.libelle} » figure au grand livre mais aucun ${NOM[kind].tiers} du listing ne le couvre. À quoi correspond-il, et qui doit le confirmer ?`),
    ...c.tiersSansCompte.map((x) =>
      `Le listing porte « ${x.nom} » (${x.reference})${x.compte ? ` rattaché au compte ${x.compte}` : ''}, qu'aucun compte du grand livre ne porte. Ce compte est-il ouvert, et pourquoi n'est-il pas comptabilisé ?`),
    ...r.lignes.filter((l) => l.remonte).map((l) =>
      `${l.nom} (${l.reference}) : ${kind === 'banque' ? 'le solde confirmé' : 'la provision confirmée'} et la comptabilité diffèrent de ${(Math.abs(l.ecartCents ?? 0) / 100).toFixed(2)} €. Quelle en est l'explication ?`),
  ];
  if (!questions.length) {
    throw new CircularisationError('circularisation : aucun constat à questionner — rien ne justifie une demande.');
  }
  const ctx = await engagementCtx(engagementId);
  const seq = await nextSeq(engagementId);
  const req = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1,$2,$3,'fr','draft') returning id`,
    [engagementId, seq, `Circularisation ${NOM[kind].pluriel} — questions sur la complétude et les écarts`]);
  for (const question of questions) {
    await q(`insert into request_item (request_id, kind, description) values ($1,'explanation',$2)`,
      [req.id, question]);
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'circularisation.questions_redigees', objectType: 'request', objectId: req.id,
    payload: { kind, questions: questions.length },
  });
  return req.id;
}

/** Ce qui EMPÊCHE le visa — calculé, jamais saisi (famille « circularisation »). */
export async function obstaclesCircularisation(engagementId: string): Promise<string[]> {
  const out: string[] = [];
  for (const kind of ['banque', 'avocat'] as const) {
    const camp = await campagne(engagementId, kind);
    if (!camp) continue;   // pas de campagne ouverte : rien à exiger
    const c = await completude(engagementId, kind);
    for (const x of c.comptesSansTiers) {
      out.push(`Circularisation ${NOM[kind].pluriel} : le compte ${x.compte} « ${x.libelle} » n'est couvert par aucun ${NOM[kind].tiers} du listing.`);
    }
    const r = await rapprochement(engagementId, kind);
    for (const l of r.lignes) {
      if (l.etat === 'a_envoyer') out.push(`Circularisation ${NOM[kind].pluriel} : la demande à ${l.nom} n'est pas partie.`);
      else if (l.etat === 'envoyee') out.push(`Circularisation ${NOM[kind].pluriel} : ${l.nom} n'a pas répondu.`);
      else if (l.etat === 'ecart' && !l.explication) out.push(`Circularisation ${NOM[kind].pluriel} : l'écart de ${l.nom} n'est pas expliqué.`);
    }
  }
  return out;
}
