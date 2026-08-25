import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { requireMember } from '@/lib/core/auth';
import { q, q1, repoRoot } from '@/lib/db/client';
import { listControls, importInstances, drawAttributeSample, runAttributeTesting, attributeGrid, listDeviations, resolveDeviation, proposeDeficiency, decideDeficiency, listDeficiencies } from '@/lib/services/sox';
import { draftOeWorkpaper } from '@/lib/services/workpapers/oe-draft';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { approveSend } from '@/lib/services/requests';

const RESULT_STYLE: Record<string, string> = { pass: 'green', fail: 'red', na: 'gray' };

export default async function ControlDetail({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  await requireMember(id);
  const control = (await listControls(id)).find((c) => c.id === cid);
  if (!control) return <div className="panel">Control not found.</div>;
  const instances = await q<{ id: string; label: string; occurred_on: string | null; performer_name: string | null; sampled: boolean; evidence_count: string }>(
    `select ci.id, ci.label, ci.occurred_on::text, ci.performer_name,
            exists(select 1 from sample_item si join sample s on s.id = si.sample_id
                   join control_test ct on ct.sample_id = s.id
                   where si.unit_id = ci.id and ct.control_id = $1) sampled,
            (select count(*) from evidence e join request_item ri on ri.id = e.request_item_id where ri.control_instance_id = ci.id) evidence_count
     from control_instance ci where ci.control_id = $1 order by ci.label`,
    [cid],
  );
  const grid = await attributeGrid(cid);
  const attrCodes = [...new Set(grid.map((g) => g.attribute_code))].sort();
  const gridLabels = [...new Set(grid.map((g) => g.label))].sort();
  const deviations = (await listDeviations(id)).filter((d) => d.control_code === control.code);
  const deficiency = (await listDeficiencies(id)).find((d) => d.control_code === control.code);
  const workpaper = await q<{ id: string; code: string; status: string; version: number }>(
    `select id, code, status, version from workpaper where engagement_id = $1 and code = $2 order by version desc limit 1`,
    [id, `OE-${control.code}`],
  );

  async function importInstancesAction() {
    'use server';
    const { user } = await requireMember(id);
    const csv = fs.readFileSync(path.join(repoRoot(), 'dataset', 'sox', `instances_${control!.code}.csv`), 'utf8');
    await importInstances(cid, csv, user.id);
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }
  async function drawAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    const sizeRaw = String(formData.get('size') ?? '');
    const justification = String(formData.get('justification') ?? '');
    const res = await drawAttributeSample(cid, user.id, sizeRaw ? Number(sizeRaw) : undefined, justification || undefined);
    await approveSend(res.requestId, user.id);
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }
  async function testAction() {
    'use server';
    const { user } = await requireMember(id);
    await extractAll(id, user.id);
    for (const p of await pendingVerifications(id)) await verifyExtraction(p.id, user.id);
    await runAttributeTesting(cid, user.id);
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }
  async function resolveDevAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await resolveDeviation(String(formData.get('deviation_id')), user.id, String(formData.get('resolution') ?? ''));
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }
  async function deficiencyAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await proposeDeficiency(cid, user.id, {
      magnitudeExposureCents: Math.round(Number(formData.get('magnitude')) * 100),
      compensatingControl: formData.get('compensating') === 'on',
    });
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }
  async function decideAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await decideDeficiency(String(formData.get('deficiency_id')), user.id, String(formData.get('severity')) as 'deficiency' | 'significant_deficiency' | 'material_weakness');
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }
  async function draftWpAction() {
    'use server';
    const { user } = await requireMember(id);
    await draftOeWorkpaper(id, cid, user.id);
    revalidatePath(`/eng/${id}/rcm/${cid}`);
  }

  return (
    <div>
      <div className="panel">
        <h2>{control.code} — {control.name}</h2>
        <p className="muted">{control.description}</p>
        <div className="row">
          <span className="badge gray">{control.frequency}</span>
          <span className="badge gray">{control.nature}</span>
          <span className="badge gray">{control.effect}</span>
          {control.is_key && <span className="badge blue">key control</span>}
          <span className={`badge ${control.di_status === 'effective' ? 'green' : 'red'}`}>D&amp;I {control.di_status}</span>
          <span className="faint">owner {control.owner_name}</span>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Instance population ({instances.length})</h2>
            <span className="row">
              {instances.length === 0 && <form action={importInstancesAction}><button className="btn small secondary">Import client listing</button></form>}
              {instances.length > 0 && !instances.some((i) => i.sampled) && (
                <form action={drawAction} className="row">
                  <input type="number" name="size" placeholder="size (pack default)" style={{ width: 120 }} />
                  <input type="text" name="justification" placeholder="override justification" style={{ width: 150 }} />
                  <button className="btn small">Draw &amp; request evidence</button>
                </form>
              )}
              {instances.some((i) => i.sampled) && grid.length === 0 && (
                <form action={testAction}><button className="btn small">Extract &amp; test attributes</button></form>
              )}
            </span>
          </div>
          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table className="data">
              <thead><tr><th>Instance</th><th>Occurred</th><th>Performer</th><th>Sampled</th><th>Evidence</th></tr></thead>
              <tbody>
                {instances.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.label}</td>
                    <td>{i.occurred_on}</td>
                    <td>{i.performer_name}</td>
                    <td>{i.sampled ? <span className="badge blue">selected</span> : <span className="faint">—</span>}</td>
                    <td className="num">{i.evidence_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Attribute grid</h2>
          {grid.length === 0 ? <p className="muted">Not tested yet.</p> : (
            <table className="data">
              <thead><tr><th>Instance</th>{attrCodes.map((a) => <th key={a}>{a}</th>)}</tr></thead>
              <tbody>
                {gridLabels.map((label) => (
                  <tr key={label}>
                    <td className="mono">{label}</td>
                    {attrCodes.map((a) => {
                      const r = grid.find((g) => g.label === label && g.attribute_code === a);
                      return (
                        <td key={a}>
                          {r ? <span className={`badge ${RESULT_STYLE[r.result]}`} title={r.note ?? ''}>{r.result}</span> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Deviations ({deviations.length})</h2>
          <span className="row">
            {deviations.length > 0 && !deficiency && (
              <form action={deficiencyAction} className="row">
                <input type="number" name="magnitude" step="0.01" placeholder="magnitude exposure €" style={{ width: 160 }} required />
                <label className="row" style={{ gap: 3 }}><input type="checkbox" name="compensating" /> compensating control</label>
                <button className="btn small">Propose deficiency (L3)</button>
              </form>
            )}
            {grid.length > 0 && (
              <form action={draftWpAction}><button className="btn small">Draft OE workpaper</button></form>
            )}
          </span>
        </div>
        {deviations.length === 0 ? <p className="muted">None — control operated as designed in the sample tested.</p> : (
          <table className="data">
            <thead><tr><th>Instance</th><th>Attribute</th><th>Type</th><th>Status</th><th>Description</th><th>Disposition</th></tr></thead>
            <tbody>
              {deviations.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.instance_label}</td>
                  <td>{d.attribute_code}</td>
                  <td><span className="badge red">{d.taxonomy_code}</span></td>
                  <td><span className={`badge ${d.status === 'open' ? 'red' : 'green'}`}>{d.status}</span></td>
                  <td className="muted" style={{ maxWidth: 300 }}>{d.description}</td>
                  <td>
                    {d.status === 'open' ? (
                      <form action={resolveDevAction} className="row">
                        <input type="hidden" name="deviation_id" value={d.id} />
                        <input type="text" name="resolution" placeholder="client explanation / evaluation" style={{ width: 200 }} required />
                        <button className="btn small secondary">Record</button>
                      </form>
                    ) : <span className="muted">{d.resolution}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {deficiency && (
          <div className={`callout ${deficiency.status === 'confirmed' ? '' : 'warn'} mt`}>
            <strong>{(deficiency.severity_final ?? deficiency.severity_proposed).replace(/_/g, ' ').toUpperCase()}</strong>{' '}
            <span className="badge gray">{deficiency.status}</span>
            <p>{deficiency.narrative}</p>
            {deficiency.status === 'proposed' && (
              <form action={decideAction} className="row">
                <input type="hidden" name="deficiency_id" value={deficiency.id} />
                <select name="severity" defaultValue={deficiency.severity_proposed}>
                  <option value="deficiency">deficiency</option>
                  <option value="significant_deficiency">significant deficiency</option>
                  <option value="material_weakness">material weakness</option>
                </select>
                <button className="btn small">Record decision (human)</button>
              </form>
            )}
          </div>
        )}
        {workpaper.length > 0 && (
          <p className="mt">
            Workpaper: <Link href={`/eng/${id}/workpapers/${workpaper[0].id}`}>{workpaper[0].code} v{workpaper[0].version}</Link>{' '}
            <span className="badge gray">{workpaper[0].status}</span>
          </p>
        )}
      </div>
    </div>
  );
}
