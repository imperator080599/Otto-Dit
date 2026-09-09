import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import Link from 'next/link';
import { propose, validate, currentMateriality, materialityVersions } from '@/lib/services/materiality';
import { proposeScoping, basculesMaterialite } from '@/lib/services/fsli';
import { primaryPack, motDuPack } from '@/lib/packs';
import { frameworkSet } from '@/lib/services/fsli';
import { fmtEur } from '@/lib/kernel/canon';
import { q } from '@/lib/db/client';
import { notesPourEcran } from '@/lib/services/workpapers/lifecycle';
import { Annotable } from '@/app/annotable';
import { poserNoteAncreeAction, repondreNoteAction, transitionNoteAction } from '../notes/actions';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';
import { Repli } from '@/app/repli';

export default async function MaterialityPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  const membreCourant = await requireMember(id);
  /* QUI REGARDE, ET CE QU'IL PEUT (1.3, ADR-028) : seul un réviseur de la
     mission clôt une note, et jamais l'auteur. Le panneau latéral n'invente
     pas la règle — il reçoit la réponse du serveur et, quand le geste n'est
     pas offert, il écrit pourquoi. */
  const moi = { id: membreCourant.user.id, peutClore: ['manager', 'partner'].includes(membreCourant.membership.eng_role) };
  const current = await currentMateriality(id);
  const versions = await materialityVersions(id);
  const bascules = await basculesMaterialite(id);
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
    <Annotable moi={moi} repondre={repondreNoteAction} transitionner={transitionNoteAction}
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
              <span className="ai-flag">{t('mat.engineProposalHumanDecides')}</span>
            </p>
            <div className="grid cols-2">
              {annotable('seuil_signification', t('mat.seuilDeSignification'),
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.amount), 'fr')}</span><span className="l">Materiality ({current.benchmark_code} @ {(current.pct * 100).toFixed(1)}%)</span></div>)}
              {annotable('seuil_travail', t('mat.seuilDeTravail'),
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.perf_amount), 'fr')}</span><span className="l">Performance materiality ({(current.perf_pct * 100).toFixed(0)}%)</span></div>)}
              {annotable('seuil_insignifiance', t('mat.seuilInsignifiance'),
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.ctt_amount), 'fr')}</span><span className="l">Clearly trivial threshold ({(current.ctt_pct * 100).toFixed(0)}%)</span></div>)}
              {annotable('anomalie_tolerable', t('mat.anomalieTolRable'),
                <div className="kpi"><span className="v">{fmtEur(numToCents(current.te_amount), 'fr')}</span><span className="l">{t('mat.tolerableMisstatementSampling')}</span></div>)}
            </div>
            <h3>{t('mat.rationalePackLanguage')}</h3>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{current.rationale}</p>
            {current.status === 'proposed' && (
              <form action={validateAction} className="mt">
                <input type="hidden" name="materiality_id" value={current.id} />
                <div className="row">
                  <label className="row" style={{ gap: 4 }}>
                    <input type="checkbox" name="adjust" /> {t('mat.adjustBeforeValidating')}
                  </label>
                  <select name="benchmark_code" defaultValue={current.benchmark_code}>
                    {pack.materiality.benchmarks.map((b) => (
                      <option key={b.code} value={b.code}>{b.label.en} ({(b.pctRange[0] * 100).toFixed(1)}–{(b.pctRange[1] * 100).toFixed(1)}%)</option>
                    ))}
                  </select>
                  <input type="number" name="pct" step="0.1" min="0.1" max="10" defaultValue={(current.pct * 100).toFixed(1)} style={{ width: 80 }} /> %
                  <button className="btn">{t('mat.validateComputesThresholdsProposesScopin')}</button>
                </div>
              </form>
            )}
            {current.status === 'validated' && (
              <p className="faint">{t('mat.validated')} {current.validated_at?.slice(0, 16)} {t('mat.scopingProposalsRefreshed')}</p>
            )}
          </>
        )}
      </div>
      <Repli cle="mat.versions" niveau={2} titre={t('mat.versions')}>
        <table className="data">
          <thead><tr><th>v</th><th>{t('mat.benchmark')}</th><th className="num">{t('mat.seuilDeSignification')}</th><th>{t('col.status')}</th></tr></thead>
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
      </Repli>

      {/* LE DRAPEAU DE BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1) : « voir si on a loupé
          du testing ». Toujours visible, jamais replié par défaut, quand il y en a — un poste
          devenu matériel sans procédure planifiée n'est pas un détail secondaire. Chaque ligne
          nomme le poste, l'import qui a causé la bascule, et si des procédures existent déjà
          pour ce poste (§2.2/§2.3 — ouverture de section et demande de détail — suivent dans une
          tranche séparée : ce panneau ne fait que MONTRER le constat, pas encore agir dessus). */}
      {bascules.length > 0 && (
        <div className="panel" data-bascules style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ marginTop: 0 }}>
            {t('mat.basculeTitre')} <span className="badge amber">{bascules.length}</span>
          </h2>
          <p className="faint">{t('mat.basculeAide')}</p>
          <table className="data">
            <thead>
              <tr>
                <th>{t('col.area')}</th><th className="num">{t('mat.solde')}</th>
                <th className="num">{t('mat.seuilDeTravail')}</th><th>{t('mat.basculeImport')}</th>
                <th>{t('mat.basculeProcedures')}</th>
              </tr>
            </thead>
            <tbody>
              {bascules.map((b) => (
                <tr key={b.fsliCode}>
                  <td><Link href={`/eng/${id}/poste/${encodeURIComponent(b.fsliCode)}`}>{b.fsliName ?? b.fsliCode}</Link></td>
                  <td className="num">{fmtEur(numToCents(b.solde), 'fr')}</td>
                  <td className="num">{fmtEur(numToCents(b.seuilPerformance), 'fr')}</td>
                  <td className="faint">{b.importFilename} · {b.detecteeLe.slice(0, 10)}</td>
                  <td>
                    {Number(b.procedureCount) === 0
                      ? <span className="badge red">{t('mat.basculeAucuneProcedure')}</span>
                      : <span className="badge gray">{t('mat.basculeNProcedures', { n: b.procedureCount })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
