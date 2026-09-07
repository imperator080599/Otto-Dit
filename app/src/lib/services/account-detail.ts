import { q, q01, q1, tx } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { ingestEvidence } from './evidence';
import { fsliAccounts } from './fsli';
import { derniereDemandeDetailDeCompte } from './requests';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// Plan d'autonomie, Partie B, étapes 2 ET 3 : LE RAPPROCHEMENT, puis LA
// POPULATION dérivée de ce rapprochement. Même mécanique que
// aux_balance_file/row (migration 0026, balances-aux.ts) — un fichier CSV du
// client entre COMME PIÈCE (ingestEvidence, empreinte, provenance), ses
// lignes sont parsées et conservées, et le TOTAL se rapproche du grand livre
// au centime. `populationDuDetailRapproche` (étape 3) ne dérive RIEN de
// nouveau : nombre de lignes, total et empreinte se lisent directement sur
// cette table et sur `evidence.sha256` — rien n'est dupliqué ni stocké deux
// fois. CE QUE CE SERVICE NE FAIT TOUJOURS PAS (règle 19) : il ne tire
// aucun échantillon lui-même — POP-01 (le refus « on ne tire pas sur une
// population non rapprochée ») est câblé dans `sampling.ts`
// (`proposeRevenueSample`), qui APPELLE `populationDuDetailRapproche`
// d'ici ; ce fichier expose la lecture, il ne bloque rien lui-même.

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
 *  l'étape 1, requests.ts) plutôt qu'un préfixe de compte en dur.
 *
 *  EN VALEUR ABSOLUE — trouvé par la revue hostile du 2026-09-06, en
 *  clôturant l'étape 3 : `account.balance` est débit MOINS crédit, et un
 *  compte 70x (chiffre d'affaires) est créditeur par nature — son solde
 *  est donc NÉGATIF dans cette convention. Le semeur (part1.ts,
 *  reconcilierDetailRevenueSemeur) prenait cette valeur brute pour
 *  fabriquer un détail de compte : un « chiffre d'affaires » affiché en
 *  négatif à l'écran, mesuré une fois à -5 631 895,30 €. Même convention
 *  que `population.ts:66` (`Math.abs(creditCents - debitCents)`) pour
 *  exactement la même famille de montant — l'un des deux avait déjà
 *  raison, l'autre non. Une vraie anomalie (un compte de produits
 *  débiteur) resterait invisible ici : ce n'est pas le rôle de cette
 *  fonction de la signaler, celui de `reconciliation.ts`/`fsliRecoGate`. */
export async function attenduGlPourPoste(engagementId: string, fsliCode: string): Promise<number> {
  const comptes = await fsliAccounts(engagementId, fsliCode);
  return Math.abs(comptes.reduce((s, c) => s + c.balanceCents, 0));
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

export interface PopulationRapprochee {
  importId: string; fsliCode: string; rowCount: number; totalCents: number;
  empreinte: string; rapprocheeLe: string;
}

/** Plan d'autonomie, Partie B, étape 3 : LA POPULATION. « Dérivée du détail
 *  rapproché… jamais saisie » (mandat §B.2) — rien de nouveau n'est stocké :
 *  compte de lignes et total viennent de `account_detail_import` (posés à
 *  l'import, étape 1/2), l'empreinte est celle de la PIÈCE elle-même
 *  (`evidence.sha256`, déjà calculée par `ingestEvidence` — pas une seconde
 *  fonction de hachage à maintenir). `null` : aucun détail rapproché pour ce
 *  poste, OU un rapprochement conclu mais PÉRIMÉ — c'est exactement l'état
 *  que POP-01 (sampling.ts) refuse. Le plus RÉCENT rapprochement conclu
 *  fait foi si plusieurs imports se sont succédé (même règle que
 *  `derniereDemandeDetailDeCompte`, requests.ts).
 *
 *  LA FRAÎCHEUR EST VÉRIFIÉE, PAS SUPPOSÉE — trouvé par la revue hostile du
 *  2026-09-06, en clôturant l'étape 4 : `rapprochee` ne repasse jamais à
 *  faux (POP-03), mais RIEN n'empêchait un ré-import de balance postérieur
 *  (`importTb`, sans garde d'invalidation contrairement à `importFec`) de
 *  faire bouger `attenduGlPourPoste` SOUS un rapprochement déjà conclu —
 *  POP-01 aurait laissé tirer sur un rapprochement qui ne correspond plus
 *  au grand livre courant. Le `gl_attendu_cents` figé à l'import est donc
 *  comparé ICI à une relecture FRAÎCHE de `attenduGlPourPoste` : un écart
 *  entre les deux rend `null`, exactement comme s'il n'y avait jamais eu de
 *  rapprochement — l'auditeur doit importer et rapprocher le détail à
 *  nouveau contre le grand livre qui a changé sous lui. CE QUE ÇA NE FAIT
 *  PAS (règle 19) : réparer `importTb`, qui reste sans garde d'invalidation
 *  — cette fonction ne fait que refuser de mentir sur l'état du tirage,
 *  elle ne rend pas le ré-import de balance plus sûr pour autant. */
export async function populationDuDetailRapproche(engagementId: string, fsliCode: string): Promise<PopulationRapprochee | null> {
  const row = await q01<{
    id: string; row_count: number; total_cents: string; empreinte: string; rapprochee_at: string;
    gl_attendu_cents: string;
  }>(
    `select i.id, i.row_count, i.total_cents::text, e.sha256 as empreinte, i.rapprochee_at::text,
            i.gl_attendu_cents::text
     from account_detail_import i join evidence e on e.id = i.evidence_id
     where i.engagement_id = $1 and i.fsli_code = $2 and i.rapprochee = true
     order by i.rapprochee_at desc limit 1`,
    [engagementId, fsliCode],
  );
  if (!row) return null;
  const attenduFrais = await attenduGlPourPoste(engagementId, fsliCode);
  if (attenduFrais !== Number(row.gl_attendu_cents)) return null; // périmé : le GL a bougé depuis le rapprochement
  return {
    importId: row.id, fsliCode, rowCount: row.row_count, totalCents: Number(row.total_cents),
    empreinte: row.empreinte, rapprocheeLe: row.rapprochee_at,
  };
}
