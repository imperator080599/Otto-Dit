import fs from 'node:fs';
import path from 'node:path';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb } from '@/lib/services/imports';
import { rebuildFslis } from '@/lib/services/fsli';
import { propose, validate } from '@/lib/services/materiality';
import {
  importRcm, setDiStatus, importInstances, drawAttributeSample, runAttributeTesting, listControls,
  proposeDeficiency, decideDeficiency, listDeviations, extendToFullPopulation,
  attacherWalkthrough, ajouterTacheControle, documenterProcedureTache,
  documenterFacteurDesign, declarerIuc, rapprocherPopulationControle, documenterProcedureOe,
} from '@/lib/services/sox';
import { approveSend, requestDetail, nextSeq } from '@/lib/services/requests';
import { ingestEvidence } from '@/lib/services/evidence';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { draftOeWorkpaper } from '@/lib/services/workpapers/oe-draft';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from '@/lib/services/imports';

// Part 2 demo flow (07 §6): SOX 404 component OE testing on the SAME engines, PCAOB pack.

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

export async function bootstrapSox(): Promise<void> {
  // the SOX engagement needs the TB for ICFR materiality (same ledger, separate file)
  const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
  await importTb({ engagementId: IDS.engSox, userId: IDS.users.karim, filename: 'tb_2025.csv', content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
  await rebuildFslis(IDS.engSox, IDS.users.karim);
  await validate(await propose(IDS.engSox, IDS.users.lea), IDS.users.lea);
  await importRcm(IDS.engSox, fs.readFileSync(ds('sox', 'rcm.csv'), 'utf8'), IDS.users.karim);
}

/** Population listing request (standing item) → client provides the listing → import. */
export async function requestAndImportListing(controlCode: string): Promise<void> {
  const ctx = await engagementCtx(IDS.engSox);
  const control = await q1<{ id: string; code: string; name: string }>(
    `select id, code, name from control where engagement_id = $1 and code = $2`,
    [IDS.engSox, controlCode],
  );
  const seq = await nextSeq(IDS.engSox);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1,$2,$3,'en','draft') returning id`,
    [IDS.engSox, seq, `Control population listing — ${control.code} ${control.name}`],
  );
  await q(
    `insert into request_item (request_id, kind, description) values ($1,'listing',$2)`,
    [request.id, `Complete listing of all ${control.code} control instances performed during FY2025 (date, performer).`],
  );
  await approveSend(request.id, IDS.users.karim);
  // client responds with the listing file
  const csv = fs.readFileSync(ds('sox', `instances_${controlCode}.csv`), 'utf8');
  const detail = await requestDetail(request.id);
  await ingestEvidence({
    engagementId: IDS.engSox,
    requestItemId: detail!.items[0].id,
    filename: `instances_${controlCode}.csv`,
    mime: 'text/csv',
    bytes: new TextEncoder().encode(csv),
    source: 'portal',
    uploadedBy: { kind: 'client_contact', id: IDS.contacts.theo },
  });
  const n = await importInstances(control.id, csv, IDS.users.karim);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: IDS.engSox, actorKind: 'user', actorId: IDS.users.karim,
    verb: 'listing_imported', objectType: 'control', objectId: control.id,
    payload: { control: control.code, instances: n, requestId: request.id },
  });
}

/** Client uploads evidence for the sampled instances (one month has none — seeded D4). */
export async function uploadControlEvidence(requestId: string): Promise<void> {
  const detail = await requestDetail(requestId);
  for (const item of detail!.items) {
    if (!item.control_instance_id) continue;
    const inst = await q1<{ label: string; control_code: string }>(
      `select ci.label, c.code control_code from control_instance ci join control c on c.id = ci.control_id where ci.id = $1`,
      [item.control_instance_id],
    );
    const file = inst.control_code === 'C-BR-01'
      ? `sox/evidence/bankrec_${inst.label}.pdf`
      : `sox/evidence/credit_approval_${inst.label}.pdf`;
    const abs = ds(...file.split('/'));
    if (!fs.existsSync(abs)) continue; // seeded missing-evidence deviation
    await ingestEvidence({
      engagementId: IDS.engSox,
      requestItemId: item.id,
      filename: path.basename(file),
      mime: 'application/pdf',
      bytes: fs.readFileSync(abs),
      source: 'portal',
      uploadedBy: { kind: 'client_contact', id: IDS.contacts.theo },
    });
  }
}

export async function runControlCycle(controlCode: string): Promise<{ controlId: string; workpaperId: string; deviations: number }> {
  const control = await q1<{ id: string; di_status: string; frequency: string }>(
    `select id, di_status, frequency from control where engagement_id = $1 and code = $2`,
    [IDS.engSox, controlCode],
  );
  if (control.di_status === 'not_assessed') {
    /* CTRL-01 (mandat contrôle interne, 2026-09-08) : conclure exige au moins une tâche
       documentée par une procédure autre que l'inquiry — semé ici en MINIMUM nécessaire pour
       que le monde de démonstration reste cohérent avec la règle, pas comme une conclusion
       d'auditeur que le semeur se substituerait à prendre (le statut 'effective' lui-même
       reste, comme avant, une affirmation du monde semé — non_prouve tant que personne ne l'a
       cliqué, registre.ts:171). Transcription synthétique, jamais une vidéo réelle. */
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engSox,
      filename: `walkthrough-${controlCode}.txt`,
      mime: 'text/plain',
      bytes: new TextEncoder().encode(`Walkthrough transcript — ${controlCode} (synthetic demo placeholder, no real recording).`),
      source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim },
      audience: 'internal',
    });
    await attacherWalkthrough(control.id, IDS.users.karim, evidenceId);
    const taskId = await ajouterTacheControle(control.id, IDS.users.karim, `Performance of ${controlCode} as observed in the walkthrough`, '00:00');
    await documenterProcedureTache(taskId, IDS.users.karim, 'inspection', 'Prior-period evidence of performance inspected during the walkthrough.');
    /* CTRL-02/CTRL-03 (mandat contrôle interne, 2026-09-08, §2.3, §2.4) : mêmes conditions
       qu'au commentaire ci-dessus — le MINIMUM que `setDiStatus` exige désormais, jamais un
       jugement d'auditeur inventé au-delà. Le lien de risque (« réponse au risque ») existe
       déjà : `importRcm` (`bootstrapSox`, appelé avant ce cycle) crée un vrai `risk` par
       assertion du RCM et le lie via `control_risk` — cette tranche ne fait qu'écrire la
       conclusion des quatre facteurs et déclarer l'IUC, jamais inventer le lien lui-même. Les
       deux contrôles cyclés ici (C-BR-01, C-REV-01) sont MANUELS d'après le RCM — aucune IUC
       n'entre dans leur exécution, donc `utilisee: false` est la réponse honnête, pas une
       case cochée par défaut. */
    await documenterFacteurDesign(control.id, IDS.users.karim, 'reponse_risque',
      `Le contrôle répond directement au(x) risque(s) lié(s) issu(s) du RCM pour ${controlCode} (voir la section Risques du contrôle).`);
    await documenterFacteurDesign(control.id, IDS.users.karim, 'autorite_competence',
      'Le control owner exerce cette fonction depuis l’ouverture de l’exercice et dispose de l’autorité hiérarchique nécessaire pour l’exécuter et en documenter le résultat.');
    await documenterFacteurDesign(control.id, IDS.users.karim, 'frequence_constance',
      `Contrôle exécuté à la fréquence prévue par le RCM (${controlCode}), sans interruption observée sur l’exercice.`);
    await documenterFacteurDesign(control.id, IDS.users.karim, 'seuil_investigation',
      'Seuil et critères d’investigation documentés dans la procédure du contrôle observée au walkthrough — au-delà du seuil, le control owner engage une investigation formelle.');
    await declarerIuc(control.id, IDS.users.karim, false, 'Contrôle manuel — aucune information produite par l’entité (IUC) n’entre dans son exécution.');
    await setDiStatus(control.id, IDS.users.karim, 'effective', 'Walkthrough performed; design and implementation assessed as effective (demo).');
  }
  await requestAndImportListing(controlCode);
  /* CTRL-04 (mandat contrôle interne, §3.1, tranche 6) : « tirer sur une population d'occurrences
     non rapprochée » est refusé — le monde de démonstration conclut donc le rapprochement, au
     nom du préparateur, avant de tirer, exactement comme un auditeur réel le ferait après avoir
     reçu et revu le listing client importé ci-dessus. Conclusion synthétique, jamais une
     affirmation qu'un humain aurait faite : le semeur DIT ce qu'il fait, il ne prétend pas
     l'avoir revue au sens professionnel du terme. */
  await rapprocherPopulationControle(
    control.id, IDS.users.karim,
    `Listing client importé pour ${controlCode} (voir la demande ci-dessus) — population revue et retenue pour le tirage (démonstration synthétique).`,
  );
  /* CTRL-07 (mandat contrôle interne, §3.2 ; redessiné par l'annexe sourcée du 10 septembre) :
     le pack livre désormais une table PLEINE (sourcée), mais le tirage de démonstration continue
     de passer par le chemin d'ADR-010 (saisie explicite + justification écrite) plutôt que de
     consulter la table — ce sont les MÊMES tailles qu'avant (3 pour un contrôle mensuel, 5 pour
     un hebdomadaire), honnêtement étiquetées comme un choix humain documenté, jamais un chemin
     que le monde de démonstration emprunterait pour prouver la table elle-même (les tests
     directs de `tailleEchantillonOe`, s8.test.ts, couvrent déjà ce chemin, règle 17). */
  const tailleParFrequence: Record<string, number> = { monthly: 3, weekly: 5, quarterly: 2, annual: 1, daily: 25, many_daily: 25, adhoc: 10 };
  const draw = await drawAttributeSample(
    control.id, IDS.users.lea, tailleParFrequence[control.frequency],
    `Table d'échantillonnage du cabinet non encore fournie (CTRL-07) — taille intérimaire de ${tailleParFrequence[control.frequency]} retenue pour un contrôle ${control.frequency}, en attendant que le cabinet livre sa propre table.`,
  );
  await approveSend(draw.requestId, IDS.users.karim);
  await uploadControlEvidence(draw.requestId);
  /* CTRL-06 (mandat contrôle interne, §3.3, tranche 7) : « L'inquiry de l'OE est une inquiry
     NEUVE... au moins une procédure parmi inspection, observation, reperformance. » Le monde de
     démonstration mène donc sa propre inquiry OE — une pièce NEUVE, jamais le walkthrough D&I —
     et documente une inspection, avant de conclure le test d'attributs. Date fixée au lendemain
     (calendaire) du jour du semis : l'inquiry D&I se pose le même jour que ce cycle (§2.2,
     `ajouterTacheControle`), et CTRL-06 exige une date STRICTEMENT postérieure — « demain »
     est la plus proche affirmation honnête d'un jour distinct, sans inventer une date antérieure
     au semis lui-même. */
  const { evidenceId: oeInquiryEvidenceId } = await ingestEvidence({
    engagementId: IDS.engSox,
    filename: `oe-inquiry-${controlCode}.txt`,
    mime: 'text/plain',
    bytes: new TextEncoder().encode(`OE inquiry transcript — ${controlCode} (synthetic demo placeholder, distinct from the D&I walkthrough).`),
    source: 'auditor',
    uploadedBy: { kind: 'app_user', id: IDS.users.karim },
    audience: 'internal',
  });
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await documenterProcedureOe(
    control.id, IDS.users.karim, 'inquiry',
    `Entretien avec le control owner de ${controlCode} : rien n'a changé dans l'exécution du contrôle depuis le walkthrough D&I (démonstration synthétique).`,
    oeInquiryEvidenceId, demain,
  );
  await documenterProcedureOe(
    control.id, IDS.users.karim, 'inspection',
    `Inspection des pièces du cycle OE de ${controlCode} — voir les demandes ci-dessus (démonstration synthétique).`,
    undefined, demain,
  );
  await extractAll(IDS.engSox, IDS.users.karim);
  for (const p of await pendingVerifications(IDS.engSox)) {
    await verifyExtraction(p.id, IDS.users.karim);
  }
  let res = await runAttributeTesting(control.id, IDS.users.karim);

  // Every tested instance failed → a conclusion cannot be drawn from three months when the
  // population is twelve. The engine says so, and the demo does what it says: the whole
  // population is requested, ingested, extracted and tested (founder review 2026-08-25).
  if (res.extensionRequired) {
    const ext = await extendToFullPopulation(
      control.id,
      IDS.users.lea,
      'Taux de déviation de 100 % sur l’échantillon initial : l’échantillon ne fournit aucune base de conclusion sur la population. Extension du test à l’intégralité des instances de la période.',
    );
    await approveSend(ext.requestId, IDS.users.karim);
    await uploadControlEvidence(ext.requestId);
    await extractAll(IDS.engSox, IDS.users.karim);
    for (const p of await pendingVerifications(IDS.engSox)) {
      await verifyExtraction(p.id, IDS.users.karim);
    }
    res = await runAttributeTesting(control.id, IDS.users.karim);
  }

  if (res.deviations > 0) {
    // Les déviations RESTENT ouvertes : l'explication reçue ne montrait pas que le contrôle
    // avait fonctionné, et aucun contrôle compensatoire n'est établi. Les porter
    // « expliquées » les aurait sorties du décompte alors qu'elles tiennent (migration 0010) :
    // une déviation qui subsiste alimente le taux et la déficience ci-dessous.
    // The magnitude exposure is derived from the accounts the control covers, not chosen:
    // for a bank reconciliation it is the cash the control is there to protect; for credit
    // approval it is the receivables exposed to unapproved credit. Both come from the
    // imported trial balance, and the basis travels with the number (migration 0009).
    const exposure = await controlExposure(controlCode);
    const defId = await proposeDeficiency(control.id, IDS.users.lea, {
      magnitudeExposureCents: exposure.cents,
      compensatingControl: false,
      magnitudeBasis: exposure.basis,
    });
    const proposed = await q1<{ severity_proposed: string }>(`select severity_proposed from deficiency where id = $1`, [defId]);
    // the partner confirms the engine's proposal — reducing it would require a rationale
    await decideDeficiency(defId, IDS.users.claire, proposed.severity_proposed as 'deficiency' | 'significant_deficiency' | 'material_weakness');
  }
  const workpaperId = await draftOeWorkpaper(IDS.engSox, control.id, IDS.users.karim);
  return { controlId: control.id, workpaperId, deviations: res.deviations };
}

/** Magnitude exposure for a control, read from the trial balance the engagement imported. */
async function controlExposure(controlCode: string): Promise<{ cents: number; basis: string }> {
  const accounts = controlCode === 'C-BR-01'
    ? { prefix: '512', label: 'comptes de trésorerie (512x)' }
    : { prefix: '411', label: 'créances clients (411x)' };
  const row = await q1<{ total: string }>(
    `select coalesce(sum(abs(a.balance)),0)::text total
     from account a join tb_snapshot t on t.id = a.tb_snapshot_id
     where t.engagement_id = $1 and t.period_kind = 'current' and t.status = 'active'
       and a.number like $2`,
    [IDS.engSox, `${accounts.prefix}%`],
  );
  const cents = Math.round(Number(row.total) * 100);
  return {
    cents,
    basis:
      controlCode === 'C-BR-01'
        ? `solde de clôture des ${accounts.label} au 31/12/2025 (${(cents / 100).toLocaleString('fr-FR')} €), montant que le rapprochement bancaire mensuel a précisément pour objet de sécuriser — source : balance importée tb_2025.csv`
        : `solde de clôture des ${accounts.label} au 31/12/2025 (${(cents / 100).toLocaleString('fr-FR')} €), exposition aux ventes accordées sans validation de la limite de crédit — source : balance importée tb_2025.csv`,
  };
}

export async function runPart2(): Promise<{ bankRec: Awaited<ReturnType<typeof runControlCycle>>; approvals: Awaited<ReturnType<typeof runControlCycle>> }> {
  await bootstrapSox();
  const bankRec = await runControlCycle('C-BR-01');
  const approvals = await runControlCycle('C-REV-01');
  void listControls;
  return { bankRec, approvals };
}
