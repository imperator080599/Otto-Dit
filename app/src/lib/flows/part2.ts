import fs from 'node:fs';
import path from 'node:path';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb } from '@/lib/services/imports';
import { rebuildFslis } from '@/lib/services/fsli';
import { propose, validate } from '@/lib/services/materiality';
import { importRcm, setDiStatus, importInstances, drawAttributeSample, runAttributeTesting, listControls, proposeDeficiency, decideDeficiency, resolveDeviation, listDeviations } from '@/lib/services/sox';
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
  const control = await q1<{ id: string; di_status: string }>(
    `select id, di_status from control where engagement_id = $1 and code = $2`,
    [IDS.engSox, controlCode],
  );
  if (control.di_status === 'not_assessed') {
    await setDiStatus(control.id, IDS.users.karim, 'effective', 'Walkthrough performed; design and implementation assessed as effective (demo).');
  }
  await requestAndImportListing(controlCode);
  const draw = await drawAttributeSample(control.id, IDS.users.lea);
  await approveSend(draw.requestId, IDS.users.karim);
  await uploadControlEvidence(draw.requestId);
  await extractAll(IDS.engSox, IDS.users.karim);
  for (const p of await pendingVerifications(IDS.engSox)) {
    await verifyExtraction(p.id, IDS.users.karim);
  }
  const res = await runAttributeTesting(control.id, IDS.users.karim);
  if (res.deviations > 0) {
    for (const d of (await listDeviations(IDS.engSox)).filter((x) => x.control_code === controlCode && x.status === 'open')) {
      await resolveDeviation(d.id, IDS.users.karim, 'Client explanation obtained and evaluated; deviation stands as a control failure for the instance tested.');
    }
    const defId = await proposeDeficiency(control.id, IDS.users.lea, { magnitudeExposureCents: 1500000, compensatingControl: false });
    const proposed = await q1<{ severity_proposed: string }>(`select severity_proposed from deficiency where id = $1`, [defId]);
    await decideDeficiency(defId, IDS.users.claire, proposed.severity_proposed as 'deficiency' | 'significant_deficiency' | 'material_weakness');
  }
  const workpaperId = await draftOeWorkpaper(IDS.engSox, control.id, IDS.users.karim);
  return { controlId: control.id, workpaperId, deviations: res.deviations };
}

export async function runPart2(): Promise<{ bankRec: Awaited<ReturnType<typeof runControlCycle>>; approvals: Awaited<ReturnType<typeof runControlCycle>> }> {
  await bootstrapSox();
  const bankRec = await runControlCycle('C-BR-01');
  const approvals = await runControlCycle('C-REV-01');
  void listControls;
  return { bankRec, approvals };
}
