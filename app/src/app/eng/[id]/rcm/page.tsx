import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { listControls, setDiStatus, importRcm, listDeficiencies } from '@/lib/services/sox';
import { repoRoot } from '@/lib/db/client';
import fs from 'node:fs';
import path from 'node:path';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';

const DI_BADGE: Record<string, string> = { not_assessed: 'gray', effective: 'green', deficient: 'red' };
const SEV_BADGE: Record<string, string> = { deficiency: 'amber', significant_deficiency: 'violet', material_weakness: 'red' };

export default async function RcmPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  await requireMember(id);
  const controls = await listControls(id);
  const deficiencies = await listDeficiencies(id);

  async function importDatasetRcm() {
    'use server';
    return executer(`/eng/${id}/rcm`, async () => {
      const { user } = await requireMember(id);
      const csv = fs.readFileSync(path.join(repoRoot(), 'dataset', 'sox', 'rcm.csv'), 'utf8');
      await importRcm(id, csv, user.id);
      revalidatePath(`/eng/${id}/rcm`);
    });
  }
  async function diAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm`, async () => {
      const { user } = await requireMember(id);
      await setDiStatus(
        String(formData.get('control_id')),
        user.id,
        String(formData.get('status')) as 'effective' | 'deficient',
        String(formData.get('conclusion') ?? ''),
      );
      revalidatePath(`/eng/${id}/rcm`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Risk–Control Matrix (RCM)</h2>
          {controls.length === 0 && (
            <form action={importDatasetRcm}><button className="btn">Import RCM (client listing)</button></form>
          )}
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>Control</th><th>Process</th><th>Risk / assertions</th><th>Freq.</th><th>Nature</th><th>Key</th><th>D&amp;I</th><th>Instances</th><th>Deviations</th><th>OE test</th></tr>
            </thead>
            <tbody>
              {controls.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong className="mono">{c.code}</strong> {c.name}
                    {c.itgc_code && <span className="badge violet" style={{ marginLeft: 4 }}>ITGC/{c.itgc_code}</span>}
                    <div className="faint">{c.description}</div>
                  </td>
                  <td>{c.process_name}</td>
                  <td className="muted" style={{ maxWidth: 220 }}>{c.risk_desc}<div className="faint">{c.coso_component}</div></td>
                  <td>{c.frequency}</td>
                  <td>{c.nature}</td>
                  <td>{c.is_key ? <span className="badge blue">key</span> : <span className="faint">—</span>}</td>
                  <td>
                    <span className={`badge ${DI_BADGE[c.di_status]}`}>{c.di_status}</span>
                    {c.di_status === 'not_assessed' && (
                      <form action={diAction} className="mt">
                        <input type="hidden" name="control_id" value={c.id} />
                        <input type="hidden" name="status" value="effective" />
                        <input type="text" name="conclusion" placeholder="D&I conclusion" style={{ width: 150 }} required />
                        <button className="btn small secondary mt">Assess effective</button>
                      </form>
                    )}
                  </td>
                  <td className="num">{c.instance_count}</td>
                  <td className="num">{Number(c.deviation_count) > 0 ? <span className="badge red">{c.deviation_count}</span> : '—'}</td>
                  <td>
                    <Link className="btn small secondary" href={`/eng/${id}/rcm/${c.id}`}>
                      {c.test_status === 'complete' ? 'View test' : 'Test OE →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {controls.length === 0 && <p className="muted">No RCM imported yet.</p>}
      </div>

      {deficiencies.length > 0 && (
        <div className="panel">
          <h2>Deficiency aggregation</h2>
          <table className="data">
            <thead><tr><th>Control</th><th>Proposed (rules, L3)</th><th>Final (human)</th><th>Status</th><th>Basis / narrative</th></tr></thead>
            <tbody>
              {deficiencies.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.control_code}<div className="faint">{d.control_name}</div></td>
                  <td><span className={`badge ${SEV_BADGE[d.severity_proposed]}`}>{d.severity_proposed.replace(/_/g, ' ')}</span></td>
                  <td>{d.severity_final ? <span className={`badge ${SEV_BADGE[d.severity_final]}`}>{d.severity_final.replace(/_/g, ' ')}</span> : <span className="faint">pending</span>}</td>
                  <td><span className="badge gray">{d.status}</span></td>
                  <td className="muted" style={{ maxWidth: 460 }}>{d.narrative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
