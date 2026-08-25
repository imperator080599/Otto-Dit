import { q, q01 } from '@/lib/db/client';
import { requireMember } from '@/lib/core/auth';
import { primaryPack } from '@/lib/packs';

export default async function EngagementOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMember(id);

  const eng = await q01<{ framework_set: { assurance_packs: string[]; accounting_map: string; language: string }; kind: string }>(
    `select framework_set, kind from engagement where id = $1`,
    [id],
  );
  const pack = primaryPack(eng!.framework_set as never);
  const members = await q<{ name: string; eng_role: string; can_sign: boolean }>(
    `select u.name, m.eng_role, m.can_sign from engagement_member m
     join app_user u on u.id = m.user_id where m.engagement_id = $1 order by m.eng_role`,
    [id],
  );
  const referral = await q<{ title: string; body: string; issued_by: string }>(
    `select ri.title, ri.body, ri.issued_by
     from engagement e
     join component c on c.id = e.component_id
     join referral_instruction ri on ri.component_id = c.id
     where e.id = $1`,
    [id],
  );

  return (
    <div className="grid cols-2">
      <div className="panel">
        <h2>Framework pack</h2>
        <p>
          <strong>{pack.name}</strong>
          <br />
          <span className="muted">Workpaper language: {pack.language.toUpperCase()}</span>
        </p>
        <p className="faint">{pack.docRules.basisNote}</p>
        <h2>Team</h2>
        <table className="data">
          <thead>
            <tr><th>Member</th><th>Role</th><th>Signs</th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>{m.eng_role}</td>
                <td>{m.can_sign ? <span className="badge green">yes</span> : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        {referral.length > 0 ? (
          <>
            <h2>Group-auditor referral instructions</h2>
            {referral.map((r) => (
              <div key={r.title} className="callout">
                <strong>{r.title}</strong>
                <br />
                <span className="muted">{r.issued_by}</span>
                <p style={{ marginBottom: 0 }}>{r.body}</p>
              </div>
            ))}
          </>
        ) : (
          <>
            <h2>Engagement</h2>
            <p className="muted">
              Statutory audit engagement. Work the cycle left to right: imports →
              reconciliation → materiality → scoping → population → sampling → requests →
              evidence → exceptions → workpapers.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
