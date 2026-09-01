import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { propose, validate, currentMateriality, materialityVersions } from '@/lib/services/materiality';
import { proposeScoping } from '@/lib/services/fsli';
import { primaryPack, motDuPack } from '@/lib/packs';
import { frameworkSet } from '@/lib/services/fsli';
import { fmtEur } from '@/lib/kernel/canon';
import { q } from '@/lib/db/client';
import { notesPourEcran } from '@/lib/services/workpapers/lifecycle';
import { Annotable } from '@/app/annotable';
import { poserNoteAncreeAction } from '../notes/actions';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

export default async function MaterialityPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  await requireMember(id);
  const current = await currentMateriality(id);
  const versions = await materialityVersions(id);
  const fs = await frameworkSet(id);
  const pack = primaryPack(fs as never);

  async function proposeAction() {
    'use server';
    return executer(`/eng/${id}/materiality`, async () => {
      const { user } = await requireMember(id);
      await propose(id, user.id);
      revalidatePath(`/eng/${id}/materiality`);
    });
  }

  async function validateAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/materiality`, async () => {
      const { user } = await requireMember(id);
      const mid = String(formData.get('materiality_id'));
      const benchmarkCode = String(formData.get('benchmark_code') ?? '');
      const pctRaw = String(formData.get('pct') ?? '');
      const adjust = formData.get('adjust') === 'on' && benchmarkCode && pctRaw
        ? { benchmarkCode, pct: Number(pctRaw) / 100 }
        : undefined;
      await validate(mid, user.id, adjust);
      await proposeScoping(id, user.id);
      revalidatePath(`/eng/${id}/materiality`);
      revalidatePath(`/eng/${id}/scoping`);
    });
  }

  /* Chaque seuil est un PARAMÈTRE annotable (ADR-097) : l'ancre est le nom
     du paramètre, pas la position du cadran à l'écran. */
  const marques = await notesPourEcran(id);
  const membresNotes = (await q<{ id: string; nom: string }>(
    `select u.id::text id, u.name nom from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null order by u.name`,
    [id],
  ));
  const annotable = (param: string, libelle: string, contenu: React.ReactNode) => (
    <Annotable
      bloc
      ancre={{ kind: 'materiality_param', aRef: param, label: t('mat.ancreSeuil', { param: libelle }) }}
      marques={marques[`materiality_param|${param}`] ?? []}
      membres={membresNotes} engagementId={id} chemin={`/eng/${id}/materiality`}
      notesHref={`/eng/${id}/notes`} action={poserNoteAncreeAction}
    >
      {contenu}
    </Annotable>
  );

  return (
    <div className="grid cols-2">
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{motDuPack(fs.assurance_packs, 'materialite')} — {pack.name}</h2>
          <form action={proposeAction}>
            <button className="btn secondary">{t('mat.proposeL3')}</button>
          </form>
        </div>
        {!current ? (
          <p className="muted">{t('mat.noProposalYet')}</p>
        ) : (
          <>
            <p>
              <span className={`badge ${current.status === 'validated' ? 'green' : 'amber'}`}>{current.status}</span>{' '}
              <span className="badge gray">v{current.version}</span>{' '}
              <span className="ai-flag">engine proposal — human decides</span>
            </p>
            <div className="grid cols-2">
              {annotable('seuil_signification', 'Seuil de signification',
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.amount), 'fr')}</span><span className="l">Materiality ({current.benchmark_code} @ {(current.pct * 100).toFixed(1)}%)</span></div>)}
              {annotable('seuil_travail', 'Seuil de travail',
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.perf_amount), 'fr')}</span><span className="l">Performance materiality ({(current.perf_pct * 100).toFixed(0)}%)</span></div>)}
              {annotable('seuil_insignifiance', 'Seuil d\u2019insignifiance',
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.ctt_amount), 'fr')}</span><span className="l">Clearly trivial threshold ({(current.ctt_pct * 100).toFixed(0)}%)</span></div>)}
              {annotable('anomalie_tolerable', 'Anomalie tolérable',
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.te_amount), 'fr')}</span><span className="l">Tolerable misstatement (sampling)</span></div>)}
            </div>
            <h3>Rationale (pack language)</h3>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{current.rationale}</p>
            {current.status === 'proposed' && (
              <form action={validateAction} className="mt">
                <input type="hidden" name="materiality_id" value={current.id} />
                <div className="row">
                  <label className="row" style={{ gap: 4 }}>
                    <input type="checkbox" name="adjust" /> adjust before validating:
                  </label>
                  <select name="benchmark_code" defaultValue={current.benchmark_code}>
                    {pack.materiality.benchmarks.map((b) => (
                      <option key={b.code} value={b.code}>{b.label.en} ({(b.pctRange[0] * 100).toFixed(1)}–{(b.pctRange[1] * 100).toFixed(1)}%)</option>
                    ))}
                  </select>
                  <input type="number" name="pct" step="0.1" min="0.1" max="10" defaultValue={(current.pct * 100).toFixed(1)} style={{ width: 80 }} /> %
                  <button className="btn">Validate (computes thresholds + proposes scoping)</button>
                </div>
              </form>
            )}
            {current.status === 'validated' && (
              <p className="faint">Validated {current.validated_at?.slice(0, 16)} — scoping proposals refreshed.</p>
            )}
          </>
        )}
      </div>
      <div className="panel">
        <h2>Versions</h2>
        <table className="data">
          <thead><tr><th>v</th><th>Benchmark</th><th className="num">Materiality</th><th>{t('col.status')}</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>{v.version}</td>
                <td>{v.benchmark_code}</td>
                <td className="num">{fmtEur(numToCents(v.amount), 'fr')}</td>
                <td><span className={`badge ${v.status === 'validated' ? 'green' : v.status === 'proposed' ? 'amber' : 'gray'}`}>{v.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
