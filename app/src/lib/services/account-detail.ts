import { q, q01, q1, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { ingestEvidence } from './evidence';
import { fsliAccounts } from './fsli';
import { derniereDemandeDetailDeCompte } from './requests';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// Plan d'autonomie, Partie B, étape 2 : LE RAPPROCHEMENT. Même mécanique que
// aux_balance_file/row (migration 0026, balances-aux.ts) — un fichier CSV du
// client entre COMME PIÈCE (ingestEvidence, empreinte, provenance), ses
// lignes sont parsées et conservées, et le TOTAL se rapproche du grand livre
// au centime. CE QUE CE SERVICE NE FAIT PAS (règle 19) : il ne tire aucun
// échantillon (étape 4), ne dérive aucune population persistée (étape 3 —
// nombre de lignes/total/empreinte se lisent directement sur cette table,
// rien n'est dupliqué), et ne bloque AUCUN tirage existant (POP-01 n'est pas
// câblé ici — le tirage du chiffre d'affaires actuel, sample/sample_item,
// n'est pas touché).

function versCents(brut: string, ligne: number, colonne: string): number {
  /* `\s` (pas `/[  ]/g`, DEUX espaces ASCII littéraux — le défaut copié de
     balances-aux.ts:32/estimations.ts:44, révision hostile du 2026-09-06)
     couvre U+00A0 et U+202F : Intl.NumberFormat('fr-FR') choisit l'un ou
     l'autre selon la version d'ICU pour le séparateur de milliers — la
     même famille que D-J3N-11 (comparateur d'hydratation). Vérifié :
     /\s/.test(' ') et /\s/.test(' ') sont tous deux vrais en V8. */
  const v = Number(brut.trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(v)) {
    throw new Error(`détail du compte : ligne ${ligne}, colonne « ${colonne} » : « ${brut.trim()} » n'est pas un nombre`);
  }
  return Math.round(v * 100);
}

/** Ce que le grand livre porte pour ce poste — DÉRIVÉ, jamais stocké tel
 *  quel (même principe que attenduGl dans balances-aux.ts). Réutilise
 *  fsliAccounts (le même mécanisme qui a listé les comptes visés à
 *  l'étape 1, requests.ts) plutôt qu'un préfixe de compte en dur. */
export async function attenduGlPourPoste(engagementId: string, fsliCode: string): Promise<number> {
  const comptes = await fsliAccounts(engagementId, fsliCode);
  return comptes.reduce((s, c) => s + c.balanceCents, 0);
}

export interface DetailImporte {
  id: string; fsliCode: string; evidenceId: string; filename: string;
  rowCount: number; totalCents: number; glAttenduCents: number; ecartCents: number;
  ecartExplication: string | null; rapprochee: boolean;
}

/** Importe le détail du compte reçu du client (CSV « référence;libellé;montant »)
 *  et calcule l'écart contre le grand livre — le rapprochement lui-même
 *  (documenter l'écart) est un geste séparé, `rapprocherDetailDeCompte`
 *  (POP-02 : « RAS » n'explique rien). */
export async function importerDetailDeCompte(opts: {
  engagementId: string; fsliCode: string; filename: string; contenu: Uint8Array; userId: string;
}): Promise<string> {
  await assertMembre(opts.engagementId, opts.userId, 'importer le détail du compte');
  if (!opts.contenu.length) throw new Error('détail du compte : le fichier est vide — rien à importer');
  const comptes = await fsliAccounts(opts.engagementId, opts.fsliCode);
  if (!comptes.length) {
    throw new Error(`détail du compte : le poste « ${opts.fsliCode} » n'a aucun compte sur la balance courante — importer sa demande d'abord (étape 1)`);
  }
  const texte = new TextDecoder('utf-8').decode(opts.contenu);
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignes.length < 2) throw new Error('détail du compte : aucune ligne de données sous l\'en-tête');
  const entete = lignes[0].split(';');
  if (entete.length !== 3) {
    throw new Error(`détail du compte : trois colonnes attendues (référence ; libellé ; montant), l'en-tête en porte ${entete.length}`);
  }
  interface Brute { seq: number; reference: string; label: string; amountCents: number }
  const brutes: Brute[] = [];
  const vus = new Set<string>();
  for (let i = 1; i < lignes.length; i++) {
    const c = lignes[i].split(';');
    if (c.length !== 3) throw new Error(`détail du compte : ligne ${i + 1} — trois colonnes attendues, ${c.length} trouvée(s)`);
    const reference = c[0].trim();
    if (!reference) throw new Error(`détail du compte : ligne ${i + 1} — la référence est vide`);
    if (vus.has(reference)) throw new Error(`détail du compte : la référence « ${reference} » apparaît deux fois`);
    vus.add(reference);
    brutes.push({ seq: i, reference, label: c[1].trim(), amountCents: versCents(c[2], i + 1, entete[2]) });
  }
  const totalCents = brutes.reduce((s, b) => s + b.amountCents, 0);
  const glAttenduCents = await attenduGlPourPoste(opts.engagementId, opts.fsliCode);

  const ctx = await engagementCtx(opts.engagementId);
  /* Rattachée au request_item de la demande de détail (étape 1) quand elle
     existe — la pièce répond à la demande qui l'a fait naître, comme
     partout ailleurs dans le dossier (règle 3, piste d'audit). Une demande
     absente ne bloque pas l'import : l'auditeur qui importe directement un
     fichier reçu hors plateforme n'est pas moins réel. */
  const demande = await derniereDemandeDetailDeCompte(opts.engagementId, opts.fsliCode);
  const requestItemId = demande
    ? (await q01<{ id: string }>(`select id from request_item where request_id = $1 order by created_at limit 1`, [demande.id]))?.id ?? null
    : null;
  const { evidenceId } = await ingestEvidence({
    engagementId: opts.engagementId, requestItemId, filename: opts.filename, mime: 'text/csv',
    bytes: opts.contenu, source: 'auditor', audience: 'client_provided',
    uploadedBy: { kind: 'app_user', id: opts.userId },
  });
  /* LA LIGNE-MÈRE ET SES LIGNES DANS LA MÊME TRANSACTION (revue hostile du
     2026-09-06) : `row_count`/`total_cents` sur account_detail_import sont
     calculés à l'avance sur TOUT le fichier — un échec à mi-boucle (même
     rare en PGlite local) laissait la ligne-mère affirmer un compte que la
     base ne portait pas, et rien ne le voit (ni /api/sante, ni aucun
     garde). balances-aux.ts porte le même défaut, non touché ici (hors
     périmètre de cette tranche) — mais ce code neuf n'a pas de raison de
     le reproduire alors que `tx()` existe déjà dans ce dépôt. */
  const importId = await tx(async (run) => {
    const [row] = (await run(
      `insert into account_detail_import
         (engagement_id, fsli_code, evidence_id, row_count, total_cents, gl_attendu_cents, ecart_cents, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [opts.engagementId, opts.fsliCode, evidenceId, brutes.length, totalCents, glAttenduCents,
        totalCents - glAttenduCents, opts.userId],
    )) as { id: string }[];
    for (const b of brutes) {
      await run(
        `insert into account_detail_row (import_id, seq, reference, label, amount_cents) values ($1,$2,$3,$4,$5)`,
        [row.id, b.seq, b.reference, b.label, b.amountCents],
      );
    }
    return row.id;
  });
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId, actorKind: 'user', actorId: opts.userId,
    verb: 'account_detail_imported', objectType: 'account_detail_import', objectId: importId,
    payload: { fsliCode: opts.fsliCode, rows: brutes.length, totalCents, glAttenduCents, evidenceId },
  });
  return importId;
}

/** Conclut le rapprochement.
 *  POP-02 : un écart non nul exige une explication d'au moins dix
 *  caractères (règle EXACTE de `circularisations.ts::expliquerEcart`, pas
 *  seulement « pas vide et pas RAS » — la revue hostile du 2026-09-06 a
 *  prouvé par mutation qu'un motif comme « - » ou « n/a » passait la
 *  version précédente alors que le commentaire prétendait « même refus,
 *  mêmes mots » ; ce n'était vrai que du TEXTE du message, pas de la
 *  RÈGLE).
 *  POP-03 : un rapprochement déjà conclu ne se réécrit pas en silence —
 *  même famille que TIRAGE-04, entretien.ts, processus.ts (prouvé par
 *  mutation : un second appel écrasait l'explication de la première
 *  personne sans refus, CLAUDE.md règle 28). */
export async function rapprocherDetailDeCompte(importId: string, userId: string, explication?: string): Promise<void> {
  /* L'ÉTANCHÉITÉ SE VÉRIFIE AVANT TOUTE AUTRE LECTURE, sur l'ID SEUL —
     assertMembreDe résout le dossier depuis l'objet (membre.ts) et refuse
     avec ETANCH-04/01 s'il n'appartient à aucun dossier de ce cabinet. Un
     `select ... where id = $1` direct AVANT ce contrôle échoue en « expected
     a row » sur un id étranger — un refus réel, mais NON NOMMÉ et non
     distinguable d'un bug (trouvé par etancheite-executee.test.ts, qui
     appelle chaque fonction de service avec un acteur d'un autre cabinet). */
  const engagementId = await assertMembreDe('account_detail_import', importId, userId, 'rapprocher le détail du compte');
  const imp = await q1<{ ecart_cents: string; rapprochee: boolean }>(
    `select ecart_cents::text, rapprochee from account_detail_import where id = $1`, [importId]);
  if (imp.rapprochee) {
    throw new Error('POP-03 : ce rapprochement est déjà conclu — une décision se revoit, elle ne s\'écrase pas.');
  }
  const ecart = Number(imp.ecart_cents);
  const motif = explication?.trim() || null; // '' (formulaire sans écart) ET undefined valent NULL — jamais '' stocké
  if (ecart !== 0 && (!motif || motif.length < 10)) {
    throw new Error('POP-02 : une explication d\'écart se rédige — « RAS » n\'explique rien à qui relira le dossier.');
  }
  const ctx = await engagementCtx(engagementId);
  await q(
    `update account_detail_import set rapprochee = true, ecart_explication = $2, rapprochee_by = $3, rapprochee_at = now() where id = $1`,
    [importId, motif, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'account_detail_rapproche', objectType: 'account_detail_import', objectId: importId,
    payload: { ecartCents: ecart, explication: motif },
  });
}

export async function detailsDeCompteDuDossier(engagementId: string, fsliCode?: string): Promise<DetailImporte[]> {
  const rows = await q<{
    id: string; fsli_code: string; evidence_id: string; filename: string;
    row_count: number; total_cents: string; gl_attendu_cents: string; ecart_cents: string;
    ecart_explication: string | null; rapprochee: boolean;
  }>(
    `select i.id, i.fsli_code, i.evidence_id, e.filename, i.row_count,
            i.total_cents::text, i.gl_attendu_cents::text, i.ecart_cents::text,
            i.ecart_explication, i.rapprochee
     from account_detail_import i join evidence e on e.id = i.evidence_id
     where i.engagement_id = $1 ${fsliCode ? 'and i.fsli_code = $2' : ''}
     order by i.created_at desc`,
    fsliCode ? [engagementId, fsliCode] : [engagementId],
  );
  return rows.map((r) => ({
    id: r.id, fsliCode: r.fsli_code, evidenceId: r.evidence_id, filename: r.filename,
    rowCount: r.row_count, totalCents: Number(r.total_cents), glAttenduCents: Number(r.gl_attendu_cents),
    ecartCents: Number(r.ecart_cents), ecartExplication: r.ecart_explication, rapprochee: r.rapprochee,
  }));
}
