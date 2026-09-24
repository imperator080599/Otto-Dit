import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from '@/lib/services/imports';
import { computeTbGl, latestTbGl, noteReconciliationLimitation } from '@/lib/services/reconciliation';
import { rebuildFslis, proposeScoping, confirmScoping, listFslis, detecterBasculesMaterialite } from '@/lib/services/fsli';
import { propose, validate } from '@/lib/services/materiality';
import { assessFsli } from '@/lib/services/risk';
import { logEvent } from '@/lib/core/events';
import { questionsOfScope, answerQuestion, answers } from '@/lib/services/questionnaire';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { planifierProcedure, redigerPapierDeProcedure } from '@/lib/services/programme';
import { proposerAnalytique, enregistrerAnalytique } from '@/lib/services/analytique';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from '@/lib/services/sampling';
import { generatePbcFromSample, approveSend, requestDetail, demanderDetailDeCompte } from '@/lib/services/requests';
import { importerDetailDeCompte, rapprocherDetailDeCompte, attenduGlPourPoste } from '@/lib/services/account-detail';
import { ingestEvidence, answerExplanation, markAllSubmitted, attachEvidenceToItem } from '@/lib/services/evidence';
import {
  importerListing,
  tiers as tiersCircularises,
  envoyer as envoyerCircularisation,
  deposerReponse as deposerReponseCircularisation,
  rapprochement as rapprochementCircularisation,
  expliquerEcart as expliquerEcartCircularisation,
} from '@/lib/services/circularisations';
import { declarerContactCle } from '@/lib/services/reunions';
import { processInbound } from '@/lib/services/inbound';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { runMatching, listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement, recordScopeLimitation } from '@/lib/services/matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from '@/lib/services/verification';
import { computeSampleEvaluation, currentEvaluation, recordEvaluationResponse, concludeEvaluation } from '@/lib/services/evaluation';

// Part 1 demo flow (07 §6) executed programmatically — the SAME service calls the UI
// makes. Used by `npm run demo:seed` (turnkey demo state) and by the test suites.

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

interface IndexEntry { filename: string; sha256: string; docType: string; forUnits: string[]; anomaly?: string }
interface ManifestT { substantiveAnomalies: { id: string; taxonomy: string[]; units: string[] }[] }

export async function bootstrapNep(): Promise<void> {
  const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
  const { importFileId: tbCourantId } = await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv', content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
  const tbPrior = fs.readFileSync(ds('tb_2024.csv'), 'utf8');
  await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2024.csv', content: tbPrior, mapping: detectTbMapping(tbPrior.split('\n')[0]), periodKind: 'prior' });
  await importFec({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')) });
  await computeTbGl(IDS.engNep, IDS.users.karim);
  // L'écart tient à une écriture ABSENTE du grand livre : il n'y a ni écriture à citer ni
  // pièce à joindre. Le fermer en « différence documentée » exigerait une corroboration qui
  // n'existe pas (migration 0010) ; c'est une limitation de périmètre, et le fichier reste
  // provisoire jusqu'au FEC définitif — ce qui bloque la conclusion, pas le testing.
  for (const item of (await latestTbGl(IDS.engNep))!.items) {
    await noteReconciliationLimitation(item.id, IDS.users.karim, {
      explanation: 'Écriture de situation (Dr 411000 / Cr 706000, 25 000 €) passée après l’extraction du fichier des écritures ; elle sera reprise au FEC définitif.',
      alternativeProcedures: 'Rapprochement re-exécuté sur la balance et sur le détail des comptes 411000 et 706000 ; l’écart est isolé, de sens opposé et de même montant. Le fichier est marqué provisoire et le rapprochement sera rejoué sur le FEC définitif avant toute conclusion.',
    });
  }
  await rebuildFslis(IDS.engNep, IDS.users.karim);
  await validate(await propose(IDS.engNep, IDS.users.lea), IDS.users.lea);
  await proposeScoping(IDS.engNep, IDS.users.lea);

  /* NEUF POSTES AU PÉRIMÈTRE (« CINQ » dans cette même phrase était déjà FAUX
     avant la tranche Stocks — resté à sa valeur d'origine alors que PAYROLL puis
     PROVISIONS avaient déjà porté le compte à sept ; corrigé cette fois-là en
     « HUIT », étendu ici à « NEUF » avec Capitaux propres — même discipline,
     jamais un chiffre en prose que rien ne produisait — règle 31) — et le
     motif dit la vérité sur ce qu'il est. Le jeu de démonstration déroule le
     cycle chiffre d'affaires (REVENUE), depuis le Lot 5 (poste Trésorerie,
     mandat 2026-09-14) la trésorerie (CASH), depuis le Lot 5 poste 2
     (Clients, 2026-09-15) les créances clients (TRADE_RECEIVABLES), depuis le
     Lot 5 poste 3 (Immobilisations, 2026-09-15) PPE, depuis le Lot 5 poste 4
     (Fournisseurs, 2026-09-15) les dettes fournisseurs (TRADE_PAYABLES),
     depuis le Lot 5 poste 5 (Paie, 2026-09-15) les charges de personnel
     (PAYROLL), depuis le Lot 5 poste 6 (Provisions, 2026-09-15) les
     provisions (PROVISIONS), depuis le Lot 5 poste 7 (Stocks, 2026-09-15) les
     stocks (INVENTORY), et depuis le Lot 5 poste 8 (Capitaux propres et
     impôt, 2026-09-16) les capitaux propres (EQUITY) — chacun scopé
     `ns_confirmed`
     par CETTE MÊME convention avant son propre correctif ; un poste dont on
     conduit réellement les procédures et qu'on maintient hors périmètre
     aurait été l'exact défaut inverse (un geste réel que le dossier
     prétendrait ne jamais avoir eu besoin de statuer). Tant qu'aucune règle
     ne le remarquait, quinze autres postes pouvaient rester « retenus » sans
     qu'aucune procédure ne soit planifiée dessus, et le dossier se
     clôturait quand même. Depuis la famille d'obstacles « périmètre sans
     programme », ce serait quatorze obstacles au visa — à raison : un poste
     retenu et jamais travaillé est un trou dans le dossier. Les deux se
     réconcilient d'une seule façon honnête : le périmètre du dossier de
     DÉMONSTRATION est les postes qu'on déroule vraiment.
     CE QUE LE MOTIF NE PRÉTEND PAS ÊTRE. Sur cette entité, le moteur propose
     CES POSTES-LÀ AUSSI dans le périmètre (vérifié par requête directe avant
     chaque correctif, jamais supposé : `fsli.scoping` de CASH puis de
     TRADE_RECEIVABLES puis de PPE puis de TRADE_PAYABLES puis de PAYROLL
     portait déjà le motif « hors périmètre du jeu » — donc PAS `ns_proposed`,
     le moteur l'avait proposé `in_scope` — TRADE_RECEIVABLES pèse
     1 554 017,64 € (créances clients), PPE pèse 1 050 000,00 €
     (immobilisations corporelles), TRADE_PAYABLES pèse 265 632,25 € (dettes
     fournisseurs, un seul compte collectif 401000, `fsliAccounts` vérifié par
     exécution), PAYROLL pèse 2 601 608,10 € (charges de personnel, comptes
     641000/645000, `fsliAccounts` vérifié par exécution), contre un seuil de
     planification de 27 000 €. Les
     sortir n'est donc pas un jugement de significativité, et le motif le
     dit à l'écran, dans le journal et dans l'archive : c'est une convention
     du jeu synthétique. Écrire l'inverse ferait du dossier de démonstration
     un dossier qu'un inspecteur rejetterait — et le produit refuse partout
     ailleurs les motifs qui n'en sont pas. INTANGIBLES reste HORS de cette
     liste : sa balance (12 000,00 €) est SOUS le seuil de planification —
     vérifié par requête directe, `fsli.scoping_basis` d'INTANGIBLES ne porte
     PAS le motif générique ci-dessous, il dit « ressorti du périmètre » —
     un jugement de significativité GENUINE, pas une convention à lever un
     jour. */
  const MOTIF_DEMO =
    'Hors périmètre du jeu de démonstration : seuls les cycles chiffre d’affaires, trésorerie, '
    + 'clients, immobilisations, fournisseurs, paie, provisions, stocks et capitaux propres y sont '
    + 'déroulés. Ce n’est PAS un jugement de significativité — sur cette entité le poste dépasse le '
    + 'seuil de planification et serait travaillé dans un dossier réel.';
  const fslis = await listFslis(IDS.engNep);
  for (const f of fslis) {
    if (['REVENUE', 'CASH', 'TRADE_RECEIVABLES', 'PPE', 'TRADE_PAYABLES', 'PAYROLL', 'PROVISIONS', 'INVENTORY', 'EQUITY'].includes(f.code)) {
      /* TRADE_RECEIVABLES SEUL, parce que `enrichir.ts` (un flux SÉPARÉ de
         CETTE fonction — PAS appelé ici, mais bien appelé en aval par
         `scripts/deploy/reconstruire.ts`, le build de production, dans le
         MÊME processus ; ce n'est donc PAS un simple outil de test isolé,
         règle 19) porte SA PROPRE garde D9 sur ce poste précis, basée sur
         CE MÊME événement `demo_scoping_seeded` : sans lui, `enrichir.ts`
         croit n'avoir
         JAMAIS statué ce poste et RÉÉCRIT une décision humaine ultérieure
         (`ns_confirmed` posée par un associé) avec sa propre convention —
         trouvé par `enrichir.test.ts` (« CONSTAT 1 et 6 »), pas deviné :
         laisser TRADE_RECEIVABLES retenu dès ce seed (règle 14, Lot 5) sans
         émettre ce marqueur crée exactement le trou que D9 interdit.
         REVENUE/CASH/PPE/PAYROLL n'ont pas cette garde côté `enrichir.ts` :
         rien à émettre pour eux ici — vérifié pour PPE avant d'ouvrir ce
         poste (Lot 5, Immobilisations, 2026-09-15) puis pour PAYROLL (Lot 5,
         Paie, 2026-09-15), pas supposé par analogie avec TRADE_RECEIVABLES :
         `enrichir.ts` ne mentionne ni `PPE` ni `PAYROLL` NULLE PART
         (recherche directe dans le fichier). C'est exactement le trou que
         R93 nomme (le garde-fou D9 est dupliqué sans mécanisme partagé) —
         cette tranche n'a pas eu BESOIN d'ajouter un second marqueur ici,
         mais un futur poste pourrait en avoir besoin sans que rien ne le
         signale. */
      if (f.code === 'TRADE_RECEIVABLES') {
        const dejaMarque = await q01<{ id: string }>(
          `select id from event_log where engagement_id = $1 and verb = 'demo_scoping_seeded' and payload->>'fsli' = 'TRADE_RECEIVABLES'`,
          [IDS.engNep],
        );
        if (!dejaMarque) {
          await logEvent({
            tenantId: IDS.tenant, engagementId: IDS.engNep, actorKind: 'system', actorId: null,
            verb: 'demo_scoping_seeded', objectType: 'fsli', objectId: f.id,
            payload: { fsli: 'TRADE_RECEIVABLES', motif: 'Lot 5, poste Clients : retenu dès le seed de base, pas par enrichir.ts — même marqueur pour que sa garde D9 le sache.' },
          });
        }
      }
      continue; // les trois postes déroulés
    }
    if (f.confirmed_by) continue;                   // une décision humaine ne se réécrit pas (D9)
    await confirmScoping(f.id, IDS.users.lea, 'ns_confirmed',
      f.scoping === 'ns_proposed'
        ? undefined                                  // le moteur l'a proposé : son motif suffit
        : MOTIF_DEMO);
  }

  /* LA BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1) — le monde de démonstration en porte
     une RÉELLE, sans qu'il faille en fabriquer une : plusieurs postes ci-dessus (la paie, 2,6 M€)
     sont confirmés `ns_confirmed` pour la convention du jeu synthétique (MOTIF_DEMO) alors que
     leur solde dépasse déjà largement la matérialité de travail. C'est exactement le cas que le
     drapeau existe pour nommer — détecté ici par le MÊME chemin que `uploadTbAction`
     (imports/actions.ts), sur le VRAI `import_file_id` du TB déjà importé, jamais une ligne
     fabriquée à part. */
  await detecterBasculesMaterialite(IDS.engNep, tbCourantId, IDS.users.lea);

  /* LE RISQUE PAR ASSERTION, ÉVALUÉ — l'écran était VIDE dans la démonstration.
     `assessFsli` n'était appelé que par le dossier N-1 : sur le dossier
     courant, « Risque par assertion » affichait ses en-têtes de colonnes et
     zéro ligne. Il rendait 200, le balayage passait, les tests passaient — et
     l'écran qui porte le raisonnement le plus distinctif du produit ne montrait
     rien. Trouvé en REGARDANT les captures, pas en les comptant. */
  await assessFsli(IDS.engNep, 'REVENUE', IDS.users.lea);
}

/** Une décomposition déterministe de `totalCents` en N lignes dont la somme
 *  vaut EXACTEMENT `totalCents` — jamais des montants tapés de mémoire, ni un
 *  arrondi qui laisserait un écart résiduel. Les trois premières parts sont
 *  calculées, la dernière absorbe le reste (toujours positif si `totalCents`
 *  l'est, ce qui est le cas ici : un solde de chiffre d'affaires). */
function decouperEnLignes(totalCents: number, parts: number[]): number[] {
  const lignes = parts.slice(0, -1).map((p) => Math.round(totalCents * p));
  lignes.push(totalCents - lignes.reduce((s, c) => s + c, 0));
  return lignes;
}

/** PLAN D'AUTONOMIE, PARTIE B, ÉTAPES 1-2 : LE DÉTAIL DU COMPTE, PUIS SON
 *  RAPPROCHEMENT — semés par les MÊMES fonctions que le chemin humain
 *  (demanderDetailDeCompte, importerDetailDeCompte, rapprocherDetailDeCompte),
 *  jamais par une écriture directe en base : ce ne sont donc PAS des décors
 *  (règle 20) — exactement le même principe qu'`approveSend` ou
 *  `ingestEvidence` ailleurs dans ce fichier. Nécessaire depuis que POP-01
 *  (sampling.ts) refuse `proposeRevenueSample` sans rapprochement conclu :
 *  semer un tirage sans rapprocher d'abord romprait sa propre garde neuve.
 *  EXPORTÉE : les bootstraps locaux de s3s4.test.ts, s5s6.test.ts et
 *  retirage.test.ts appellent `proposeRevenueSample` sans passer par
 *  `samplingAndRequest` — ils doivent l'appeler aussi, sous peine du même
 *  refus POP-01 que celui que cette fonction existe pour satisfaire. */
export async function reconcilierDetailRevenueSemeur(engagementId: string): Promise<void> {
  const attendu = await attenduGlPourPoste(engagementId, 'REVENUE');
  const [l1, l2, l3] = decouperEnLignes(attendu, [0.5, 0.3, 0.2]);
  const csv = 'référence;libellé;montant\n'
    + `CA-SEMEUR-001;Chiffre d'affaires — ventes de marchandises;${(l1 / 100).toFixed(2)}\n`
    + `CA-SEMEUR-002;Chiffre d'affaires — prestations de services;${(l2 / 100).toFixed(2)}\n`
    + `CA-SEMEUR-003;Chiffre d'affaires — autres ventes et avoirs;${(l3 / 100).toFixed(2)}`;
  await demanderDetailDeCompte(engagementId, 'REVENUE', IDS.users.karim);
  const importId = await importerDetailDeCompte({
    engagementId, fsliCode: 'REVENUE', filename: 'detail-ca-semeur.csv',
    contenu: new TextEncoder().encode(csv), userId: IDS.users.karim,
  });
  await rapprocherDetailDeCompte(importId, IDS.users.lea); // écart nul : aucune explication requise
}

export async function samplingAndRequest(): Promise<string> {
  await reconcilierDetailRevenueSemeur(IDS.engNep);
  const sampleId = await proposeRevenueSample(IDS.engNep, IDS.users.karim);
  await validateSampleParams(sampleId, IDS.users.lea);
  await drawRevenueSample(sampleId, IDS.users.lea);
  const requestId = await generatePbcFromSample(IDS.engNep, sampleId, IDS.users.karim);
  await approveSend(requestId, IDS.users.karim);
  return requestId;
}

/**
 * The client answers the request. The auditor uploads nothing — that is the product.
 *
 * Every document below enters exactly as it would in production: through the portal
 * (`ingestEvidence`, the same call `/portal/[token]/[rid]` makes when a client attaches a
 * file) or through the engagement's inbound address (`processInbound`, the same pipeline
 * the mail webhook feeds). Two deliberate cases exercise the parts that matter: one
 * delivery note sent by e-mail instead of the portal, and one message from an address that
 * is not on the engagement's contact list — quarantined, never silently ingested.
 */
export async function clientDeposits(requestId: string): Promise<void> {
  const evidenceIndex = JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8')) as IndexEntry[];
  const detail = await requestDetail(requestId);
  const sample = await currentRevenueSample(IDS.engNep);
  const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));

  let byEmail = 0;
  for (const item of detail!.items.filter((i) => i.kind === 'document' && i.sample_item_id)) {
    const nk = nkBySampleItem.get(item.sample_item_id!);
    const isBl = /livraison|delivery/i.test(item.description);
    const entry = evidenceIndex.find(
      (e) => e.forUnits.includes(nk!) && (isBl ? e.docType === 'delivery_note' : e.docType === 'invoice' || e.docType === 'credit_note'),
    );
    if (!entry) continue; // A2: the delivery note cannot be provided at all
    const bytes = fs.readFileSync(ds(...entry.filename.split('/')));
    const filename = path.basename(entry.filename);

    // the first delivery note comes back by e-mail, the way half of them really do
    if (isBl && byEmail === 0) {
      byEmail += 1;
      const inbound = await processInbound(IDS.engNep, {
        from: 'theo.girard@altiverre.example',
        subject: `RE: ${detail!.request.title} — ${filename}`,
        attachments: [{ filename, mime: 'application/pdf', bytes }],
      });
      // mail does not arrive pre-filed: an auditor triages it onto the item it answers
      for (const evId of inbound.evidenceIds) {
        await attachEvidenceToItem(evId, item.id, IDS.users.karim);
      }
      continue;
    }

    await ingestEvidence({
      engagementId: IDS.engNep,
      requestItemId: item.id,
      filename,
      mime: 'application/pdf',
      bytes,
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.sophie },
    });
  }

  /* Les deux pièces d'ÉTENDUE (relevés bancaires, ajoutées inconditionnellement par
     `generatePbcFromSample`, `sample_item_id` NULL) restaient jusqu'ici JAMAIS déposées : la
     boucle ci-dessus les exclut exprès (`i.sample_item_id`). Trouvé par la revue hostile de
     Lot 7 tranche 2 (H-1 slice 2) : sans ce dépôt, ces deux `request_item` restent `pending`
     pour toujours, ce qui n'est pas un décor de test (règle 20) — les fixtures existent
     (`evidence_index.json`, docType `bank_statement`) et n'étaient simplement jamais reliées. */
  for (const item of detail!.items.filter((i) => i.kind === 'document' && !i.sample_item_id)) {
    const mois = /novembre|november/i.test(item.description) ? '2025-11' : '2025-12';
    const entry = evidenceIndex.find((e) => e.docType === 'bank_statement' && e.filename.includes(mois));
    if (!entry) continue;
    const bytes = fs.readFileSync(ds(...entry.filename.split('/')));
    await ingestEvidence({
      engagementId: IDS.engNep,
      requestItemId: item.id,
      filename: path.basename(entry.filename),
      mime: 'application/pdf',
      bytes,
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.sophie },
    });
  }

  // an unknown sender forwards a document: allow-listing holds, it is quarantined and an
  // auditor has to look at it before it can ever support a conclusion
  await processInbound(IDS.engNep, {
    from: 'compta@fournisseur-inconnu.example',
    subject: 'Facture jointe',
    attachments: [{
      filename: 'piece_expediteur_inconnu.pdf',
      mime: 'application/pdf',
      bytes: fs.readFileSync(ds(...evidenceIndex.find((e) => e.docType === 'invoice')!.filename.split('/'))),
    }],
  });

  await markAllSubmitted(requestId, IDS.contacts.sophie);
}

export async function extractAndVerify(): Promise<void> {
  await extractAll(IDS.engNep, IDS.users.karim);
  for (const p of await pendingVerifications(IDS.engNep)) {
    await verifyExtraction(p.id, IDS.users.karim);
  }
}

export async function matchAndClarify(): Promise<void> {
  await runMatching(IDS.engNep, IDS.users.karim);
  const clarifId = await draftClarificationRequest(IDS.engNep, IDS.users.karim);
  await approveSend(clarifId, IDS.users.karim);
  const answers = JSON.parse(fs.readFileSync(ds('fixtures', 'answers.json'), 'utf8')) as Record<string, string>;
  const manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8')) as ManifestT;
  const detail = await requestDetail(clarifId);
  const sample = await currentRevenueSample(IDS.engNep);
  const nkBySampleItem = new Map(sample!.items.map((i) => [i.id, i.natural_key]));
  for (const item of detail!.items) {
    const nk = item.sample_item_id ? nkBySampleItem.get(item.sample_item_id) : undefined;
    const anomaly = manifest.substantiveAnomalies.find((a) => nk && a.units.includes(nk));
    await answerExplanation(clarifId, item.id, IDS.contacts.theo, answers[anomaly?.id ?? 'A1'] ?? 'Réponse du client (démo).');
  }
}

/**
 * Disposition of every exception, one nature at a time.
 *
 * There is no generic "reviewed and corroborated" path any more: the engine refuses a
 * resolution without the client's words, a link to what corroborates them, and a
 * disposition saying what happened to the money (migration 0009). Read against the
 * client's own answers (dataset/fixtures/answers.json), five of the eight seeded
 * anomalies are admitted misstatements — the corrections are all promised, none is
 * booked at the reporting date — so they accumulate rather than disappear.
 */
export async function dispositions(): Promise<void> {
  const byTaxonomy = async (code: string) =>
    (await listExceptions(IDS.engNep)).filter((x) => x.taxonomy_code === code && (x.status === 'explained' || x.status === 'open'));

  const amountOf = async (sampleItemId: string | null): Promise<number> => {
    if (!sampleItemId) return 0;
    const r = await q1<{ amount: string }>(`select amount::text from sample_item where id = $1`, [sampleItemId]);
    return Math.round(Number(r.amount) * 100);
  };

  // A5 — cut-off: invoice dated 2026-01-06 recognised in FY2025. Admitted by the client
  // ("facturation anticipée pour atteindre l'objectif annuel"). Uncorrected.
  for (const x of await byTaxonomy('cutoff')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: x.amount_impact ? Math.round(Number(x.amount_impact) * 100) : await amountOf(x.sample_item_id),
      corrected: false,
      notes: 'Produit de janvier 2026 constaté sur 2025 (séparation des exercices). Le client indique une facturation anticipée pour atteindre l’objectif annuel — non corrigé à la date du rapport.',
    });
  }

  // A1 — the same invoice booked twice. The client admits it and says a reversal "sera
  // passée": promised, not booked, so it is an uncorrected misstatement.
  //
  // The pair raises one exception per booking, but the accounts are overstated ONCE. The
  // later booking carries the misstatement; its twin is closed as already_accumulated,
  // linked to the same invoice — visible, not deleted, and not counted twice.
  const dupes = await byTaxonomy('duplicate_document');
  const dupesDated = await Promise.all(
    dupes.map(async (x) => ({
      x,
      date: x.sample_item_id
        ? (await q1<{ d: string }>(
            `select g.entry_date::text d from sample_item si join gl_entry g on g.id = si.unit_id where si.id = $1`,
            [x.sample_item_id],
          )).d
        : '',
    })),
  );
  dupesDated.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < dupesDated.length; i++) {
    const { x, date } = dupesDated[i];
    const isLater = i === dupesDated.length - 1;
    if (isLater) {
      await escalateToMisstatement(x.id, IDS.users.lea, {
        kind: 'factual',
        amountCents: await amountOf(x.sample_item_id),
        corrected: false,
        notes: `Double comptabilisation de la même facture (${dupesDated.map((d) => d.date).join(' et ')}), reconnue par le client : « la facture a été comptabilisée deux fois suite à un doublon d’intégration. Une correction sera passée ». L’extourne n’est pas comptabilisée à la date du rapport — produit surévalué une fois, retenu sur l’écriture du ${date}.`,
      });
    } else {
      const inv = await q01<{ id: string }>(
        `select e.id from evidence e join request_item ri on ri.id = e.request_item_id
         where ri.sample_item_id = $1 and e.doc_type in ('invoice','credit_note') and e.quarantined = false limit 1`,
        [x.sample_item_id],
      );
      if (!inv) continue;
      await resolveException(x.id, IDS.users.lea, {
        explanation: 'Vous avez raison : la facture a été comptabilisée deux fois suite à un doublon d’intégration. Une correction sera passée (extourne de la seconde écriture).',
        conclusion: `Les deux écritures s’appuient sur la même facture. La surévaluation est unique : elle est portée à l’état des anomalies sur l’écriture du ${dupesDated[dupesDated.length - 1].date}. Cette occurrence est close pour éviter un double décompte, sans disparaître du dossier.`,
        disposition: 'already_accumulated',
        corroboration: { evidenceId: inv.id },
      });
    }
  }

  // A3 — overbilling of 1 800,00 €; credit note announced, not issued.
  for (const x of await byTaxonomy('price_mismatch')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: x.amount_impact ? Math.round(Number(x.amount_impact) * 100) : 180000,
      corrected: false,
      notes: 'Écart de prix unitaire reconnu par le client (« un avoir de 1 800,00 € sera émis »). Avoir non émis à la date du rapport.',
    });
  }

  // A4 — 22 units billed but not delivered; credit note "en préparation".
  for (const x of await byTaxonomy('qty_mismatch')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: x.amount_impact ? Math.round(Number(x.amount_impact) * 100) : 0,
      corrected: false,
      notes: 'Quantité facturée supérieure à la quantité livrée (litige transport reconnu par le client, « avoir en préparation »). Avoir non émis à la date du rapport.',
    });
  }

  // A6 — 50 000 € manual journal on a Saturday. The client's own answer places the service
  // in January 2026: this is a cut-off misstatement, not merely an unusual entry.
  for (const x of await byTaxonomy('manual_journal_flag')) {
    await escalateToMisstatement(x.id, IDS.users.lea, {
      kind: 'factual',
      amountCents: await amountOf(x.sample_item_id),
      corrected: false,
      notes: 'Écriture manuelle de 50 000,00 € passée un samedi. Explication du client : contrat signé en fin d’exercice, « la prestation démarre en janvier 2026 » — produit rattaché au mauvais exercice.',
    });
  }

  // A8 — recurring credit notes to one customer. No amount impact on the period result:
  // genuinely explained, and corroborated by the credit notes themselves.
  for (const x of await byTaxonomy('credit_note_pattern')) {
    const cn = await q01<{ id: string }>(
      `select id from evidence where engagement_id = $1 and doc_type = 'credit_note' and quarantined = false order by filename limit 1`,
      [IDS.engNep],
    );
    if (!cn) continue;
    await resolveException(x.id, IDS.users.lea, {
      explanation: 'Les avoirs concernent des litiges qualité récurrents avec ce client ; un plan d’action qualité est en cours.',
      conclusion:
        'Les trois avoirs ont été rapprochés des pièces : ils portent sur des livraisons distinctes, sont émis dans l’exercice et ne présentent pas de caractère de dissimulation de chiffre d’affaires. Aucune anomalie de rattachement relevée sur ces pièces.',
      disposition: 'no_misstatement',
      corroboration: { evidenceId: cn.id },
    });
  }

  // A2 — the delivery note was never archived by the carrier and cannot be obtained. There
  // is nothing to link, so the platform cannot let this be "resolved". It becomes a
  // recorded scope limitation: what could not be obtained, what was done instead, and how
  // much is at risk — carried through to the conclusion rather than absorbed by it.
  for (const x of await byTaxonomy('missing_document')) {
    await recordScopeLimitation(x.id, IDS.users.lea, {
      explanation: 'Le bon de livraison n’a pas été archivé par le transporteur. Nous ne sommes pas en mesure de le fournir.',
      alternativeProcedures:
        'Procédures alternatives mises en œuvre : rapprochement de la facture avec la commande client et avec l’encaissement figurant au relevé bancaire ; aucune preuve de livraison n’a pu être obtenue. La réalité de la livraison n’est pas corroborée par un élément externe.',
      amountAtRiskCents: await amountOf(x.sample_item_id),
    });
  }

  // A7 — the trial balance carries a 25 000 € situation entry the FEC does not. The ledger
  // audited is therefore not the final one: that is a limitation until the definitive FEC
  // is reconciled, and it flags the engagement (migration 0009) so the file cannot be
  // closed on a provisional ledger.
  const recDiffs = await byTaxonomy('reconciliation_diff');
  for (const x of recDiffs) {
    await recordScopeLimitation(x.id, IDS.users.lea, {
      explanation: 'La balance transmise incluait un ajustement manuel de 25 000,00 € non repris dans le FEC (écriture de situation).',
      alternativeProcedures:
        'Écart documenté et rapproché ligne à ligne ; il correspond à une écriture de situation non reprise dans le FEC provisoire. Le rapprochement balance/grand livre sera re-exécuté sur le FEC définitif avant conclusion définitive.',
    });
  }
  if (recDiffs.length > 0) {
    await q(
      `update engagement set ledger_is_provisional = true, ledger_provisional_reason = $2 where id = $1`,
      [
        IDS.engNep,
        'FEC provisoire : écriture de situation de 25 000,00 € (Dr 411000 / Cr 706000) présente dans la balance et absente du FEC. Rapprochement à re-exécuter sur le FEC définitif.',
      ],
    );
  }
}

export async function spotcheckAndEvaluate(): Promise<void> {
  const runId = await startVerificationRun(IDS.engNep, IDS.users.lea);
  const run = await currentVerificationRun(IDS.engNep);
  for (const it of run!.items) {
    const ev = await q1<{ fields: { name: string; value: string }[] }>(
      `select x.fields from extraction x
       join evidence e on e.id = x.evidence_id
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.doc_type in ('invoice','credit_note')
       order by x.created_at desc limit 1`,
      [it.sample_item_id],
    );
    // the demo verifier re-performs from the source documents; here the fixture values ARE
    // the source-document values (blind agreement path)
    await submitBlindCheck({
      verificationRunId: runId,
      sampleItemId: it.sample_item_id,
      verifierId: IDS.users.lea,
      blind: {
        totalNetCents: Number(ev.fields.find((f) => f.name === 'totalNetCents')!.value),
        invoiceDate: ev.fields.find((f) => f.name === 'invoiceDate')!.value,
      },
      secondsSpent: 110,
    });
  }
  await computeSampleEvaluation(IDS.engNep, IDS.users.lea);
  const evaluation = await currentEvaluation(IDS.engNep);

  // Known misstatements (127 545,80 €) exceed both tolerable misstatement (27 000 €) and
  // materiality (37 000 €). The engine refuses a conclusion until that is answered
  // (migration 0009): the sample no longer provides a reasonable basis for a conclusion on
  // the population, so the strategy is revised before concluding.
  await recordEvaluationResponse(
    evaluation!.id,
    IDS.users.lea,
    'revise_strategy',
    'Les anomalies non corrigées relevées (127 545,80 €) dépassent le seuil de signification (37 000 €) et l’anomalie tolérable (27 000 €). L’échantillon ne fournit plus une base raisonnable de conclusion sur la population : extension des travaux au chiffre d’affaires du quatrième trimestre, demande de correction adressée à la direction, et re-exécution du rapprochement balance/grand livre sur le FEC définitif avant conclusion définitive.',
  );

  // EXTRAP-01 (mandat 2026-09-14, §1.2) : ce poste a bien une strate SONDÉE (le tirage
  // aléatoire de nep-fr.ts), mais les cinq anomalies plantées dans le monde de démonstration
  // sont TOUTES rattachées à des pièces sélectionnées par le RISQUE (high_value/risk_flag,
  // exhaustives par construction) — la sélection par le risque est justement CONÇUE pour les
  // attraper là, pas dans le tirage aléatoire pur. `random_misstatement` (migration 0160) le
  // confirme : la strate sondée est PROPRE ici, donc EXTRAP-01 ne bloque pas ce poste — une
  // strate sondée propre reste conclûable sans méthode d'extrapolation vérifiée. Le refus
  // EXTRAP-01 lui-même est éprouvé contre un cas FABRIQUÉ (kernel.test.ts), où la strate
  // sondée porte un écart.
  await concludeEvaluation(
    evaluation!.id,
    IDS.users.lea,
    'Anomalies non corrigées de 127 545,80 € (rattachement 36 330 €, double comptabilisation 36 800 €, surfacturation 1 800 €, quantités non livrées 2 615,80 €, écriture manuelle de 50 000 € rattachée au mauvais exercice), supérieures au seuil de signification de 37 000 €. Conclusion en l’état : le chiffre d’affaires est surévalué de façon significative si les corrections annoncées par la direction ne sont pas comptabilisées. Deux limitations sont par ailleurs consignées (bon de livraison non obtenu, FEC provisoire) : la conclusion est provisoire jusqu’au rapprochement du FEC définitif.',
  );
}

/** Run the whole Part 1 flow up to (not including) the workpaper. */
/**
 * LA CIRCULARISATION DES BANQUES — le listing du client, tel qu'il arrive.
 *
 * Le monde de démonstration s'arrête là où l'AUDITEUR doit décider : le
 * listing est importé (avec son défaut : un compte du grand livre qu'il ne
 * couvre pas, et deux lignes qu'aucun compte ne porte), et rien n'est envoyé.
 * Envoyer, recevoir, rapprocher et questionner sont des GESTES — ils se
 * cliquent, ils ne se sèment pas.
 */
export async function circulariserBanques(): Promise<void> {
  const listing = fs.readFileSync(ds('circularisations', 'banques.csv'), 'utf8');
  const { evidenceId } = await ingestEvidence({
    engagementId: IDS.engNep,
    filename: 'listing-banques-2025.csv',
    mime: 'text/csv',
    bytes: new TextEncoder().encode(listing),
    source: 'portal',
    uploadedBy: { kind: 'client_contact', id: null },
    audience: 'client_provided',
  });
  await importerListing(IDS.engNep, 'banque', listing, IDS.users.karim, { evidenceId });
}

/**
 * LA TRÉSORERIE, POSTE OUVERT COMPLÈTEMENT (Lot 5, plan d'autonomie Partie
 * C.3 point 1, mandat 2026-09-14 soir).
 *
 * Le plan pose SIX éléments pour qu'un poste compte comme « ouvert » —
 * « leadsheet N/N-1, revue analytique, procédures commandées par le risque,
 * atelier de sa nature, papier, écarts. Un poste ouvert à moitié est pire
 * qu'un lien mort. » Leadsheet et papier sont déjà GÉNÉRIQUES sur `fsliCode`
 * (`leadsheetDuPoste`/`redigerPapierDeProcedure`, analytique.ts/programme.ts)
 * — rien à semer pour eux au-delà d'appeler le même service que REVENUE.
 * L'atelier et les écarts existaient déjà (`circulariserBanques` ci-dessus,
 * `circularisations.ts`). Ce qui manquait : le risque évalué et les
 * procédures RÉELLEMENT planifiées (`TRESO-CIRC`/`TRESO-RAPPRO`, corrigées
 * de `cycle: 'TRESO'` à `cycle: 'CASH'` dans le catalogue par ce même
 * correctif — R56 fermé POUR CASH), et la revue analytique rédigée.
 *
 * ÉVALUER LE RISQUE EST UN GESTE HUMAIN JOURNALISÉ (même garde que
 * `enrichir.ts` pour TRADE_RECEIVABLES) : le rejouer produirait un second
 * `risk.assessed` dans la chaîne hachée à chaque exécution. On n'évalue que
 * si rien ne l'a encore été.
 */
export async function planifierTresorerie(): Promise<void> {
  /* MÊME GESTE que TRADE_RECEIVABLES quand ce poste est devenu retenu
     (enrichir.ts) : les questions de SECTION sont les mêmes pour tout poste
     retenu (questionnaire.ts, questionnaireObstacles) — rester ns_confirmed
     dispensait CASH de les répondre ; redevenu in_scope (règle 14, amendement
     du 14 septembre), l'obstacle « obst.questionsSectionSansReponse »
     apparaît pour de vrai au visa si personne n'y répond. Trouvé par le
     parcours cliqué mené à la clôture (règle 37), pas deviné. */
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesCash = new Set((await answers(IDS.engNep, 'CASH')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesCash.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'CASH', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'CASH' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'CASH', IDS.users.lea);

  const circ = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'CASH', code: 'TRESO-CIRC', userId: IDS.users.karim });
  await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'CASH', code: 'TRESO-RAPPRO', userId: IDS.users.karim });

  const papierExistant = await q01<{ id: string }>(
    `select id from workpaper where procedure_id = $1 limit 1`, [circ.id]);
  if (!papierExistant) {
    const wp = await redigerPapierDeProcedure({ procedureId: circ.id, userId: IDS.users.karim });
    /* L'IPE (information produite par l'entité) EST UN OBSTACLE AU VISA
       (obstacles.ts) SUR TOUT PAPIER, jamais seulement REVENUE — même
       geste que `declarerIpe` (enrichir.ts) pour TRADE_RECEIVABLES, écrit
       ici plutôt que réutilisé (cette fonction est privée à enrichir.ts,
       hardcodée sur le cycle REVENUE — jamais une résolution devinée pour
       CASH par une fonction qui ne le connaît pas). TRESO-CIRC porte
       `population.source: "balance"` (methodology/procedures.json) : la
       source est la balance elle-même, déjà importée dans bootstrapNep(). */
    const tb = await q01<{ id: string }>(
      `select id::text from import_file where engagement_id = $1 and kind = 'tb' order by created_at desc limit 1`,
      [IDS.engNep],
    );
    const { enregistrerIpe } = await import('@/lib/services/ipe');
    if (tb) {
      await enregistrerIpe(wp.id, {
        utilisee: true, nature: 'systeme', importFileId: tb.id,
        exhaustivite: 'Comptes de trésorerie rapprochés à la balance importée.',
        exactitude: 'Soldes vérifiés contre le grand livre au centime.',
        dateDocument: '2025-12-31', approprie: true,
      }, IDS.users.karim);
    } else {
      await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
    }
  }

  const dejaRedigee = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'CASH' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigee) {
    const proposition = await proposerAnalytique(IDS.engNep, 'CASH');
    await enregistrerAnalytique(IDS.engNep, 'CASH', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 2 (Clients, 2026-09-15) — même patron que `planifierTresorerie()`,
 * DEUX procédures au lieu d'une paire circularisation/rapprochement : CLIENTS-AGE
 * (rapprochement, atelier `/balances-aux`) et CLIENTS-DEPREC (recalcul_parametre,
 * atelier `/estimations`). CLIENTS-CIRC n'est PAS planifiée ici : mesuré par
 * exécution avant d'écrire cette fonction (assessFsli + risksFor), l'assertion
 * `realite` de TRADE_RECEIVABLES est `lower` (`faible` avant le renommage AUD-11/P1-07)
 * — sous le `risque_minimum: "higher"`
 * de CLIENTS-CIRC. La planifier quand même aurait été une décision inventée,
 * pas une procédure commandée par le risque (règle 14, « les procédures
 * commandées PAR LE RISQUE »). CLIENTS-AVOIRS (sondage_pieces) EST commandée
 * mais SANS atelier atteignable — disclosed R92, pas planifiée (même raison
 * que ci-dessus, à l'envers : ici c'est l'atelier qui manque, pas le risque).
 *
 * LES DEUX PAPIERS RÉFÉRENCENT UNE POPULATION QUI N'EXISTE PAS ENCORE AU
 * MOMENT DU SEED. `CLIENTS-AGE.population.source` et `CLIENTS-DEPREC.population.source`
 * (methodology/procedures.json) sont tous deux la balance auxiliaire des
 * clients — et son IMPORT est un GESTE DE L'AUDITEUR (ADR-107, point 1),
 * conduit par le parcours cliqué (`scripts/clics/scenario.ts`, station
 * balances-aux), jamais pré-semé. Même choix que `circulariserBanques()` :
 * la graine pose le PROGRAMME (risque, procédure, papier, IPE non utilisée)
 * et le geste réel FINIT le travail au clic — le papier se rédige quand même
 * « depuis les faits stockés », qui sont vides tant que rien n'est importé,
 * et l'IPE le dit honnêtement (`utilisee: false`) plutôt que de fabriquer un
 * rapport qui n'existe pas.
 */
export async function planifierClients(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesClients = new Set((await answers(IDS.engNep, 'TRADE_RECEIVABLES')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesClients.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'TRADE_RECEIVABLES', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'TRADE_RECEIVABLES' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'TRADE_RECEIVABLES', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  for (const code of ['CLIENTS-AGE', 'CLIENTS-DEPREC'] as const) {
    const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'TRADE_RECEIVABLES', code, userId: IDS.users.karim });
    const papierExistant = await q01<{ id: string }>(
      `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
    if (!papierExistant) {
      const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
      await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
    }
  }

  const dejaRedigeeClients = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'TRADE_RECEIVABLES' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeeClients) {
    const proposition = await proposerAnalytique(IDS.engNep, 'TRADE_RECEIVABLES');
    await enregistrerAnalytique(IDS.engNep, 'TRADE_RECEIVABLES', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 3 (Immobilisations/PPE, 2026-09-15) — UNE SEULE procédure
 * planifiée, IMMO_COR-DOT (recalcul_parametre, dotations aux amortissements),
 * contrairement à Trésorerie (deux) et Clients (deux) : mesuré par exécution
 * avant d'écrire (`assessFsli` + `risksFor` contre la base seedée), TROIS
 * procédures dépassent leur `risque_minimum` sur PPE — IMMO_COR-TAB
 * (rapprochement, `exhaustivite:faible` ≥ `faible`), IMMO_COR-ACQ
 * (sondage_pieces, `realite:eleve` ≥ `faible`) et IMMO_COR-DOT
 * (recalcul_parametre, `mesure:faible` ≥ `faible`) — mais SEULE IMMO_COR-DOT
 * a un atelier atteignable (`/estimations`, réutilisé de TRADE_RECEIVABLES,
 * `atelierDeLaNature` dans `programme.ts`). IMMO_COR-TAB et IMMO_COR-ACQ
 * n'ont NI L'UNE NI L'AUTRE d'atelier : `/balances-aux` ne généralise pas
 * (type `Cote` fermé), `/testing` reste câblé sur REVENUE (R92) — disclosed
 * R95 plutôt que planifiées sans écran atteignable (même raisonnement que
 * CLIENTS-AVOIRS/R92 dans `planifierClients()` ci-dessus). IMMO_COR-CESS,
 * IMMO_COR-ENTRETIEN et IMMO_COR-INDICES restent SOUS leur `risque_minimum`
 * (`moyen`) sur ce dossier — non commandées, pas seulement non planifiées.
 *
 * MÊME LIMITE que CLIENTS-DEPREC sur le papier : `estimations.ts` est
 * générique par sa CLÉ (`pieceRef`), pas par son CALCUL
 * (`montantComptabilise` filtre `account_no like '70%'`, des comptes de
 * PRODUITS — une dotation aux amortissements se book en 68x/28x). L'IPE
 * reste donc `utilisee: false`, HONNÊTE : le papier se rédige depuis des
 * faits stockés vides, jamais un calcul fabriqué.
 */
export async function planifierImmobilisations(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesImmo = new Set((await answers(IDS.engNep, 'PPE')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesImmo.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'PPE', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'PPE' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'PPE', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'PPE', code: 'IMMO_COR-DOT', userId: IDS.users.karim });
  const papierExistant = await q01<{ id: string }>(
    `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
  if (!papierExistant) {
    const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
    await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
  }

  const dejaRedigeeImmo = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'PPE' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeeImmo) {
    const proposition = await proposerAnalytique(IDS.engNep, 'PPE');
    await enregistrerAnalytique(IDS.engNep, 'PPE', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 4 (Fournisseurs/TRADE_PAYABLES, 2026-09-15) — UNE SEULE
 * procédure planifiée, FOURN-CIRC (confirmation_externe), même patron que
 * Trésorerie/Clients/Immobilisations : mesuré par exécution avant d'écrire
 * (`assessFsli` + `requiredProcedures` contre la base seedée), TROIS
 * procédures du cycle sont commandées par le risque sur TRADE_PAYABLES —
 * FOURN-CIRC (confirmation_externe, `exhaustivite:moyen` ≥ `moyen`),
 * FOURN-FNP (sondage_pieces, `exhaustivite:moyen` ≥ `moyen`) et FOURN-SUL
 * (sondage_pieces, `exhaustivite:moyen` ≥ `faible`) — mais SEULE FOURN-CIRC a
 * un atelier atteignable : `circularisations.ts` porte désormais la Nature
 * `fournisseur` (migration 0165, mécanique livrée plus tôt ce jour),
 * `programme.ts` route `confirmation_externe`+TRADE_PAYABLES vers le MÊME
 * `/circularisations` que CASH. FOURN-FNP et FOURN-SUL (sondage_pieces)
 * N'ONT NI L'UNE NI L'AUTRE d'atelier : même gap que CLIENTS-AVOIRS/
 * IMMO_COR-ACQ (R92/R95) — `/testing` reste câblé sur REVENUE — disclosed R97
 * plutôt que planifiées sans écran atteignable. FOURN-CUTOFF-REC reste SOUS
 * son `risque_minimum` (`moyen`) sur ce dossier — non commandée, pas
 * seulement non planifiée.
 *
 * R96 (docs/BACKLOG_REPORTE.md) EST UNE CONDITION BLOQUANTE que cette
 * fonction RESPECTE PAR OMISSION : elle plante FOURN-CIRC (procédure, papier
 * `utilisee:false`, honnête — même limite que CLIENTS-DEPREC/IMMO_COR-DOT,
 * aucun calcul automatisé n'existe pour ce papier), jamais une campagne de
 * circularisation DÉPOSÉE. `circulariserBanques()`/`acheverCircularisationBanques()`
 * ci-dessous montrent le patron complet (listing → envoi → réponse → écart)
 * pour la nature `banque` ; AUCUN équivalent n'existe ni ne doit exister pour
 * `fournisseur` tant que R96 n'est pas résolu — déposer une réponse
 * afficherait un écart FAUX (comparaison au solde ENTIER du compte collectif
 * 401000, prouvé par exécution lors de la revue hostile de la mécanique).
 */
export async function planifierFournisseurs(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesFourn = new Set((await answers(IDS.engNep, 'TRADE_PAYABLES')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesFourn.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'TRADE_PAYABLES', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'TRADE_PAYABLES' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'TRADE_PAYABLES', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'TRADE_PAYABLES', code: 'FOURN-CIRC', userId: IDS.users.karim });
  const papierExistant = await q01<{ id: string }>(
    `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
  if (!papierExistant) {
    const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
    await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
  }

  const dejaRedigeeFourn = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'TRADE_PAYABLES' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeeFourn) {
    const proposition = await proposerAnalytique(IDS.engNep, 'TRADE_PAYABLES');
    await enregistrerAnalytique(IDS.engNep, 'TRADE_PAYABLES', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 5 (Paie/PAYROLL, 2026-09-15) — UNE SEULE procédure planifiée,
 * PERSONNEL-DSN (rapprochement), même patron minimal que Trésorerie/Clients/
 * Immobilisations/Fournisseurs : mesuré par exécution avant d'écrire
 * (`fsliAccounts` + `assessFsli` + `requiredProcedures` contre la base
 * seedée). `fsliAccounts(eng, 'PAYROLL')` porte deux comptes (641000
 * Rémunérations, 645000 Charges de sécurité sociale, `pcg.ts`), solde
 * 2 601 608,10 €. `assessFsli` mesure `realite:eleve` (2 facteurs — variation
 * N/N-1 de 230 040 € contre un seuil de 27 000 €, et 100 % d'écritures d'OD
 * manuelles) ; toutes les autres assertions restent `faible`.
 *
 * `methodology/procedures.json` portait DEUX procédures pour ce cycle sous
 * les noms `cycle:"PERSONNEL"` et `cycle:"SOCIAL"` — jamais consultées par
 * `proceduresDuCycle`, qui filtre sur le VRAI code FSLI (même correspondance
 * cassée que TRESO/CLIENTS/IMMO_COR/FOURN, R54/R57/R95/R97). Corrigé pour
 * PERSONNEL-DSN et SOCIAL-COTIS (`cycle:"PAYROLL"`, version 1.4.1) —
 * PERSONNEL-CP (provision pour congés payés) reste `cycle:"PERSONNEL"`,
 * DÉLIBÉRÉMENT NON corrigé ici : son objet réel est une provision de BILAN
 * (compte 15x), pas une charge de PAYROLL (compte 64x) — elle relève du
 * futur poste Provisions (Lot 5, poste 6), pas de celui-ci ; la corriger
 * maintenant vers PAYROLL aurait été une correspondance FAUSSE, pas une
 * correspondance manquante (règle 8, ne rien écrire de mémoire).
 *
 * Une fois la correspondance corrigée, HUIT procédures sont commandées par
 * le risque sur PAYROLL (compté par exécution, `requiredProcedures('PAYROLL').length`,
 * jamais recopié de tête — règle 31) : les quatre transverses de base
 * (DETAIL/RAPPRO/RA/SEQ, `risque_minimum:faible`, universelles), trois
 * commandées par `realite:eleve` (ENTRETIEN, FRAUDE, MANUEL), et
 * PERSONNEL-DSN elle-même (`exhaustivite:faible`) — 4+3+1 = 8. AUCUNE n'a
 * d'atelier réel : `rapprochement`
 * (RAPPRO, PERSONNEL-DSN) n'est câblé QUE pour CASH/TRADE_RECEIVABLES — pas
 * de concept de « balance âgée » pour la paie, `/balances-aux` resterait un
 * écran qui ment (même défaut que R95 existe pour nommer) ; `sondage_pieces`
 * (DETAIL/FRAUDE/MANUEL) n'est câblé QUE pour REVENUE (`/testing`, R92/R95/
 * R97) ; `observation_documentee` (ENTRETIEN) et `test_exhaustif` (SEQ) NE
 * SONT CÂBLÉS NULLE PART, pour AUCUN poste, encore — vérifié par lecture
 * complète de `atelierDeLaNature` (programme.ts), pas supposé. C'est le
 * poste le plus dépourvu d'atelier de tout le Lot 5 jusqu'ici : chaque poste
 * précédent avait AU MOINS une nature câblée (`rapprochement` OU
 * `recalcul_parametre`) ; PAYROLL n'en a AUCUNE. Disclosed R98
 * (`docs/BACKLOG_REPORTE.md`) plutôt que planifiées sans écran atteignable —
 * PERSONNEL-DSN seule est plantée (procédure + papier `utilisee:false`
 * honnête, même limite que CLIENTS-DEPREC/IMMO_COR-DOT/FOURN-CIRC), pour que
 * l'obstacle « périmètre sans programme » (`obstacles.ts`) trouve une ligne
 * `procedure_instance` — ce prédicat ne demande qu'une ligne, jamais un
 * atelier cliquable, vérifié par lecture directe de sa requête SQL.
 */
export async function planifierPaie(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesPaie = new Set((await answers(IDS.engNep, 'PAYROLL')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesPaie.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'PAYROLL', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'PAYROLL' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'PAYROLL', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'PAYROLL', code: 'PERSONNEL-DSN', userId: IDS.users.karim });
  const papierExistant = await q01<{ id: string }>(
    `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
  if (!papierExistant) {
    const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
    await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
  }

  const dejaRedigeePaie = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'PAYROLL' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeePaie) {
    const proposition = await proposerAnalytique(IDS.engNep, 'PAYROLL');
    await enregistrerAnalytique(IDS.engNep, 'PAYROLL', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 6 (Provisions/PROVISIONS, 2026-09-15) — UNE SEULE procédure
 * planifiée, PROV-LITIGES (confirmation_externe), même patron minimal que
 * les cinq postes précédents : mesuré par exécution avant d'écrire
 * (`fsliAccounts` + `assessFsli` + `requiredProcedures` contre la base
 * seedée). `fsliAccounts(eng, 'PROVISIONS')` porte UN SEUL compte (151000
 * « Provisions pour risques »), solde -60 000,00 € — un seul tiers
 * (`dataset/circularisations/avocats.csv`, Cabinet Vialar & Associés) sur
 * ce compte, donc AUCUN risque R96 (le rapprochement collectif compare un
 * tiers au compte ENTIER — sans objet ici, un seul tiers EST le compte).
 * `assessFsli` mesure TOUTES les assertions `faible` (0 facteur) sur ce
 * dossier.
 *
 * `methodology/procedures.json` portait TROIS procédures pour ce cycle sous
 * `cycle:"PROV"` (PROV-LITIGES, PROV-RECALC) et `cycle:"PERSONNEL"`
 * (PERSONNEL-CP, laissée délibérément non corrigée par la tranche Paie —
 * une provision de BILAN, pas une charge PAYROLL) — aucune jamais
 * consultée par `proceduresDuCycle`, même correspondance cassée que
 * TRESO/CLIENTS/IMMO_COR/FOURN/PAYROLL (R54/R57/R95/R97/R98). Les TROIS
 * corrigées vers `cycle:"PROVISIONS"` cette même tranche (version 1.4.2) :
 * PERSONNEL-CP trouve ENFIN sa vraie correspondance, pas une nouvelle
 * incertitude.
 *
 * Une fois la correspondance corrigée, CINQ procédures sont commandées
 * (compté par exécution, `requiredProcedures('PROVISIONS').length`, jamais
 * recopié de tête — règle 31, leçon de la tranche précédente) : les quatre
 * transverses universelles (DETAIL/RAPPRO/RA/SEQ, `risque_minimum:faible`)
 * et PROV-LITIGES elle-même (`exhaustivite:faible`) — 4+1 = 5 ; PROV-RECALC
 * et PERSONNEL-CP (`evaluation:moyen`) restent SOUS leur `risque_minimum`
 * sur ce dossier (`evaluation` mesurée `faible`) — NON commandées, pas
 * disclosed comme un gap. **PROV-LITIGES A UN ATELIER RÉEL** — le premier
 * poste du Lot 5, après CASH et TRADE_PAYABLES, à en recevoir un pour
 * `confirmation_externe` : « Revue des litiges et confirmation des
 * conseils juridiques » EST la Nature `avocat` que `circularisations.ts`
 * porte depuis ADR-111 (`POSTE.avocat === 'PROVISIONS'`, jamais changé,
 * jamais exercée par un poste réellement ouvert avant celui-ci) —
 * `programme.ts` route désormais `confirmation_externe`+PROVISIONS vers le
 * MÊME `/circularisations` que CASH/TRADE_PAYABLES. `poste.ts` : AUCUN
 * changement nécessaire, vérifié par exécution (`vuePoste('PROVISIONS')`),
 * `natureCirculariseeDuPoste('PROVISIONS')` retourne déjà `'avocat'` par la
 * même table `POSTE` inversée que TRADE_PAYABLES a généralisée.
 */
export async function planifierProvisions(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesProv = new Set((await answers(IDS.engNep, 'PROVISIONS')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesProv.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'PROVISIONS', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'PROVISIONS' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'PROVISIONS', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'PROVISIONS', code: 'PROV-LITIGES', userId: IDS.users.karim });
  const papierExistant = await q01<{ id: string }>(
    `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
  if (!papierExistant) {
    const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
    await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
  }

  const dejaRedigeeProv = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'PROVISIONS' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeeProv) {
    const proposition = await proposerAnalytique(IDS.engNep, 'PROVISIONS');
    await enregistrerAnalytique(IDS.engNep, 'PROVISIONS', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 7 (Stocks/INVENTORY, 2026-09-15) — UNE SEULE procédure
 * planifiée, STOCKS-INV, même patron minimal que les six postes précédents :
 * mesuré par exécution avant d'écrire (`fsliAccounts` + `assessFsli` +
 * `requiredProcedures` contre la base seedée). `fsliAccounts(eng,
 * 'INVENTORY')` porte DEUX comptes (301000 « Stocks matières premières »,
 * 420 000,00 € ; 355000 « Stocks produits finis », 380 000,00 €), total
 * 800 000,00 €. `assessFsli` mesure TOUTES les assertions `faible` (0
 * facteur) sur ce dossier.
 *
 * `methodology/procedures.json` portait SIX procédures pour ce cycle sous
 * `cycle:"STOCKS"` (STOCKS-INV, STOCKS-VALO, STOCKS-COUT, STOCKS-NRV,
 * STOCKS-CUTOFF, STOCKS-TIERS) — jamais consultées par `proceduresDuCycle`,
 * même correspondance cassée que TRESO/CLIENTS/IMMO_COR/FOURN/PAYROLL/PROV
 * (R54/R57/R95/R97/R98). Les SIX corrigées vers `cycle:"INVENTORY"` cette
 * même tranche (version 1.4.3).
 *
 * Une fois la correspondance corrigée, CINQ procédures sont commandées
 * (compté par exécution, `requiredProcedures('INVENTORY').length`, jamais
 * recopié de tête — règle 31) : les quatre transverses universelles
 * (DETAIL/RAPPRO/RA/SEQ, `risque_minimum:faible`) et STOCKS-INV elle-même
 * (`realite:faible`) — 4+1 = 5 ; STOCKS-VALO/COUT/NRV/CUTOFF/TIERS
 * (`risque_minimum:moyen`) restent SOUS leur seuil sur ce dossier (chacune
 * de leurs assertions mesurée `faible`) — NON commandées, pas disclosed
 * comme un gap.
 *
 * **STOCKS-INV N'A AUCUN ATELIER — disclosed R99, même situation que PAYROLL
 * (R98).** Sa nature, `observation_documentee` (assistance à l'inventaire
 * physique), n'a JAMAIS eu de route dans `atelierDeLaNature` — contrairement
 * à `confirmation_externe` (CASH/TRADE_PAYABLES/PROVISIONS) ou
 * `rapprochement` (CASH), qui portaient déjà un écran avant que cette
 * tranche les exerce sur un nouveau poste. Construire l'écran d'assistance à
 * l'inventaire physique serait de la MÉCANIQUE NEUVE (un atelier qui
 * n'existe nulle part), pas la correction d'une correspondance déjà câblée
 * ailleurs — hors du périmètre d'une tranche d'ouverture de poste (règle 9).
 * `poste.ts` : AUCUN changement nécessaire, vérifié par exécution
 * (`vuePoste('INVENTORY')`) — le garde `sans_objet`/`href:null` posé pour
 * PAYROLL (R98, même mécanisme que R97) couvre déjà toute nature sans
 * atelier réel, générique dès son écriture.
 */
export async function planifierStocks(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesStocks = new Set((await answers(IDS.engNep, 'INVENTORY')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesStocks.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'INVENTORY', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'INVENTORY' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'INVENTORY', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'INVENTORY', code: 'STOCKS-INV', userId: IDS.users.karim });
  const papierExistant = await q01<{ id: string }>(
    `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
  if (!papierExistant) {
    const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
    await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
  }

  const dejaRedigeeStocks = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'INVENTORY' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeeStocks) {
    const proposition = await proposerAnalytique(IDS.engNep, 'INVENTORY');
    await enregistrerAnalytique(IDS.engNep, 'INVENTORY', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LOT 5, POSTE 8 — LE DERNIER DU PLAN (Capitaux propres et impôt/EQUITY,
 * 2026-09-16). Mesuré par exécution avant d'écrire (`fsliAccounts` +
 * `assessFsli` + `requiredProcedures` contre la base seedée, à travers le
 * VRAI `runPart1UpToWorkpaper()` — une première sonde isolée, montée à la
 * main comme `programme-vue.test.ts`, avait mesuré TOUTES les assertions
 * `faible` : FAUX, corrigé avant tout commit en rejouant contre le pipeline
 * réel, où `realite` mesure `moyen` (1 facteur : `variation`) — la
 * démonstration entière avance l'horloge et pose des écritures avant que ce
 * poste ne soit évalué, un effet qu'une fixture isolée ne reproduit pas).
 * `fsliAccounts(eng, 'EQUITY')` porte TROIS comptes (101000 « Capital
 * social » -500 000,00 € ; 106100 « Réserve légale » -50 000,00 € ; 110000
 * « Report à nouveau » -1 094 000,00 € ; total -1 644 000,00 €).
 *
 * `methodology/procedures.json` portait TROIS procédures pour ce cycle sous
 * `cycle:"CAPITAUX"` (CAPITAUX-VAR, CAPITAUX-PV, CAPITAUX-CONV) — jamais
 * consultées par `proceduresDuCycle`, même correspondance cassée que
 * TRESO/CLIENTS/IMMO_COR/FOURN/PAYROLL/PROV/STOCKS
 * (R54/R57/R95/R97/R98/R99). Les TROIS corrigées vers `cycle:"EQUITY"`
 * cette même tranche (version 1.4.4).
 *
 * **HUIT procédures commandées** une fois la correspondance corrigée
 * (compté par exécution, `requiredProcedures('EQUITY').length`, jamais
 * recopié de tête — règle 31) : les quatre transverses universelles au
 * seuil `faible` (DETAIL/RA/RAPPRO/SEQ), DEUX autres transverses débloquées
 * PAR le facteur `realite:moyen` (FRAUDE, MANUEL — `risque_minimum:moyen`,
 * même paire que PAYROLL avait débloquée par `realite:eleve`), et les DEUX
 * procédures propres au poste : CAPITAUX-VAR (`rapprochement`,
 * `exhaustivite:faible`) et CAPITAUX-PV (`sondage_pieces`, `droits:faible`)
 * — 4+2+2 = 8. CAPITAUX-CONV (`test_exhaustif`, `presentation:moyen`) reste
 * SOUS son seuil (`presentation` mesurée `faible`) — NON commandée, pas
 * disclosed comme un gap.
 *
 * **NI CAPITAUX-VAR NI CAPITAUX-PV N'A D'ATELIER — disclosed R100, la même
 * famille que R92/R95/R97/R98/R99, mais DOUBLE cette fois.** `rapprochement`
 * n'est câblé que pour CASH/TRADE_RECEIVABLES (`programme.ts`, lu en
 * entier) ; `sondage_pieces` n'est câblé que pour REVENUE. Aucune des deux
 * natures n'atteint EQUITY. `poste.ts` : AUCUN changement nécessaire,
 * vérifié par exécution (`vuePoste('EQUITY')` après
 * `runPart1UpToWorkpaper()` complet) — le garde-fou générique posé pour
 * PAYROLL (R98) couvre déjà toute nature sans atelier réel, quel que soit
 * le nombre de procédures qui s'y heurtent.
 *
 * **Les DEUX procédures sont plantées** (même patron que
 * `planifierTresorerie()`, qui en plante déjà deux — TRESO-CIRC/TRESO-RAPPRO
 * — pas un précédent inventé pour cette tranche), chacune avec un papier
 * `utilisee:false` honnête : aucune des deux n'a d'atelier réel à faire
 * semblant d'avoir consulté.
 */
export async function planifierCapitaux(): Promise<void> {
  const cat = await catalogueDeLaMission(IDS.engNep);
  const reponduesEquity = new Set((await answers(IDS.engNep, 'EQUITY')).map((a) => a.question_code));
  for (const qn of questionsOfScope(cat, 'section')) {
    if (reponduesEquity.has(qn.code)) continue;
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'EQUITY', questionCode: qn.code, answer: 'non', detail: '', actorUserId: IDS.users.lea });
  }

  const dejaEvalue = await q01<{ id: string }>(
    `select id from fsli_assertion_risk where engagement_id = $1 and fsli_code = 'EQUITY' limit 1`,
    [IDS.engNep],
  );
  if (!dejaEvalue) await assessFsli(IDS.engNep, 'EQUITY', IDS.users.lea);

  const { enregistrerIpe } = await import('@/lib/services/ipe');
  for (const code of ['CAPITAUX-VAR', 'CAPITAUX-PV']) {
    const proc = await planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'EQUITY', code, userId: IDS.users.karim });
    const papierExistant = await q01<{ id: string }>(
      `select id from workpaper where procedure_id = $1 limit 1`, [proc.id]);
    if (!papierExistant) {
      const wp = await redigerPapierDeProcedure({ procedureId: proc.id, userId: IDS.users.karim });
      await enregistrerIpe(wp.id, { utilisee: false }, IDS.users.karim);
    }
  }

  const dejaRedigeeEquity = await q01<{ id: string }>(
    `select id from fsli_analytique where engagement_id = $1 and fsli_code = 'EQUITY' limit 1`,
    [IDS.engNep],
  );
  if (!dejaRedigeeEquity) {
    const proposition = await proposerAnalytique(IDS.engNep, 'EQUITY');
    await enregistrerAnalytique(IDS.engNep, 'EQUITY', IDS.users.karim, proposition.texte,
      { origine: 'proposee_validee', engineRunId: proposition.engineRunId });
  }
}

/**
 * LA CIRCULARISATION, MENÉE À SON TERME.
 *
 * `circulariserBanques()` s'arrête au listing incomplet — c'est ce que le
 * monde de DÉMONSTRATION doit montrer (un défaut à trouver). Mais tout monde
 * qui va jusqu'au SCELLEMENT doit la finir : un compte non couvert et une
 * demande jamais partie sont des obstacles au visa, et c'est voulu. Cette
 * fonction fait les quatre gestes qui restent — listing corrigé, envoi,
 * réponse, explication de l'écart — par les MÊMES services que les clics.
 */
export async function acheverCircularisationBanques(): Promise<void> {
  /* ÉCRIRE À UN TIERS AU NOM DU CLIENT EXIGE UN CONTACT CLIENT CLÉ (ADR-101) :
     c'est lui qui reçoit copie. Le monde de démonstration le déclare ici s'il
     ne l'est pas encore — par le service, comme l'écran le ferait. */
  const dejaCle = await q01<{ id: string }>(
    `select id from engagement_contact where engagement_id = $1 and role = 'cle'`, [IDS.engNep]);
  if (!dejaCle) {
    const contact = await q1<{ id: string }>(
      `select c.id::text from client_contact c
       join engagement e on e.entity_id = c.entity_id
       where e.id = $1 and c.active order by c.email limit 1`, [IDS.engNep]);
    await declarerContactCle(IDS.engNep, contact.id, IDS.users.karim);
  }
  const corrige = fs.readFileSync(ds('circularisations', 'banques-corrige.csv'), 'utf8');
  await importerListing(IDS.engNep, 'banque', corrige, IDS.users.karim);
  const banque = (await tiersCircularises(IDS.engNep, 'banque'))
    .find((t) => t.compte === '512100');
  if (!banque) throw new Error('flux : le listing corrigé n\'a pas rattaché la banque au compte 512100');
  if (!banque.sent_at) await envoyerCircularisation(banque.id, IDS.users.karim);
  const ligne = (await rapprochementCircularisation(IDS.engNep, 'banque'))
    .lignes.find((l) => l.id === banque.id)!;
  const { evidenceId } = await ingestEvidence({
    engagementId: IDS.engNep,
    filename: 'confirmation-bancaire-blc.txt',
    mime: 'text/plain',
    bytes: new TextEncoder().encode(
      'Confirmation de solde (pièce fictive) — compte FR76 3000 1000 0100 0000 0000 123.'),
    source: 'email',
    uploadedBy: { kind: 'client_contact', id: null },
    audience: 'client_provided',
  });
  await deposerReponseCircularisation({
    partyId: banque.id, userId: IDS.users.karim, evidenceId,
    montantConfirmeCents: (ligne.soldeComptableCents ?? 0) + 125000,
  });
  await expliquerEcartCircularisation(banque.id,
    'Frais de tenue de compte prélevés le 31/12 par la banque et comptabilisés en janvier — '
    + 'rattachement corrigé, écart expliqué.',
    IDS.users.karim);
}

export async function runPart1UpToWorkpaper(): Promise<void> {
  await bootstrapNep();
  const requestId = await samplingAndRequest();
  await clientDeposits(requestId);
  await extractAndVerify();
  await matchAndClarify();
  await dispositions();
  await spotcheckAndEvaluate();
  await circulariserBanques();
  await planifierTresorerie();
  await planifierClients();
  await planifierImmobilisations();
  await planifierFournisseurs();
  await planifierPaie();
  await planifierProvisions();
  await planifierStocks();
  await planifierCapitaux();
}
