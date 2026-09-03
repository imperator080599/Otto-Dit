import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import {
  analyseAux, importerBalanceAux, proposerCandidat, redigerQuestionsClient,
  LIBELLES_TRANCHES, type Cote, type Exercice,
} from '@/lib/services/balances-aux';
import { fmtEur } from '@/lib/kernel/canon';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { Repli } from '@/app/repli';

// LES BALANCES AUXILIAIRES ÂGÉES (point 1, ADR-107). Les exports du client
// (clients / fournisseurs, N / N-1) se rapprochent au grand livre, puis
// l'analyse est DÉRIVÉE : concentration du top 10, apparus/disparus,
// déplacements de part au-delà d'un seuil, déformation du vieillissement.
// Un constat est un CANDIDAT : proposé au registre (un humain confirme),
// questionné au client par un brouillon de demande (L2). La couleur ne
// signale que les problèmes.

const TRANCHE_CLES = ['non_echu', 'j0_30', 'j31_60', 'j61_90', 'plus_90'] as const;

export default async function BalancesAuxPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; cote?: string; seuil?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const sp = await searchParams;
  await requireMember(id);
  const cote: Cote = sp.cote === 'fournisseurs' ? 'fournisseurs' : 'clients';
  const seuilPts = Number.isFinite(Number(sp.seuil)) && Number(sp.seuil) > 0 ? Number(sp.seuil) : 3;
  const a = await analyseAux(id, cote, seuilPts);
  const lesDeux = Boolean(a.fichiers.n && a.fichiers.n1);

  async function importAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/balances-aux?cote=${String(formData.get('cote'))}`, async () => {
      const { user } = await requireMember(id);
      const fichier = formData.get('fichier') as File;
      if (!fichier || !fichier.size) throw new Error('balance auxiliaire : choisissez le fichier exporté par le client');
      await importerBalanceAux({
        engagementId: id,
        cote: String(formData.get('cote')) as Cote,
        exercice: String(formData.get('exercice')) as Exercice,
        filename: fichier.name,
        contenu: new Uint8Array(await fichier.arrayBuffer()),
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/balances-aux`);
    });
  }
  async function proposerAction(formData: FormData) {
    'use server';
    const coteF = String(formData.get('cote'));
    const seuilF = String(formData.get('seuil'));
    return executer(`/eng/${id}/balances-aux?cote=${coteF}&seuil=${seuilF}`, async () => {
      const { user } = await requireMember(id);
      await proposerCandidat(id, coteF as Cote, String(formData.get('code')), Number(seuilF), user.id);
      revalidatePath(`/eng/${id}/balances-aux`);
      revalidatePath(`/eng/${id}/risk`);
    });
  }
  async function questionsAction(formData: FormData) {
    'use server';
    const coteF = String(formData.get('cote'));
    const seuilF = String(formData.get('seuil'));
    return executer(`/eng/${id}/balances-aux?cote=${coteF}&seuil=${seuilF}`, async () => {
      const { user } = await requireMember(id);
      await redigerQuestionsClient(id, coteF as Cote, Number(seuilF), user.id);
      revalidatePath(`/eng/${id}/balances-aux`);
      revalidatePath(`/eng/${id}/requests`);
    });
  }

  const rapprochement = (ex: Exercice, libelle: CleLibelle) => {
    const f = a.fichiers[ex];
    if (!f) return null;
    const ecart = f.totalCents - f.attenduCents;
    return (
      <p key={ex} className={ecart === 0 ? 'faint' : undefined} style={{ margin: '2px 0' }}>
        {t(libelle)} : <span className="mono">{f.filename}</span> {t('bal.total', { m: fmtEur(f.totalCents, 'fr') })} ·{' '}
        {t(ex === 'n' ? 'bal.soldeGlActif' : 'bal.aNouveaux')} {fmtEur(f.attenduCents, 'fr')} ·{' '}
        {ecart === 0
          ? <>{t('bal.reconciled')}</>
          : <span className="badge red">{t('bal.difference')} {fmtEur(ecart, 'fr')} {t('bal.theAgedBalanceDoesNotTie')}</span>}
        {' '}· <a href={`/api/blob/${f.evidenceId}`} target="_blank">{t('bal.openTheDocument')}</a>
      </p>
    );
  };

  return (
    <div>
      <BandeauRefus erreur={sp.erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('rail.balancesAux')}</h2>
          <span className="row">
            <Link className={`badge ${cote === 'clients' ? 'blue' : 'gray'}`} href={`/eng/${id}/balances-aux?cote=clients&seuil=${seuilPts}`}>{t('mot.customers')}</Link>
            <Link className={`badge ${cote === 'fournisseurs' ? 'blue' : 'gray'}`} href={`/eng/${id}/balances-aux?cote=fournisseurs&seuil=${seuilPts}`}>{t('mot.suppliers')}</Link>
          </span>
        </div>
        {rapprochement('n', cote === 'clients' ? 'bal.clientsN' : 'bal.fournisseursN')}
        {rapprochement('n1', cote === 'clients' ? 'bal.clientsN1' : 'bal.fournisseursN1')}
        <form action={importAction} className="row mt" style={{ flexWrap: 'wrap', gap: 6 }}>
          <input type="hidden" name="cote" value={cote} />
          <select name="exercice" defaultValue={a.fichiers.n ? 'n1' : 'n'}>
            <option value="n">{t('commun.exerciceN', { d: '31/12/2025' })}</option>
            <option value="n1">{t('commun.exerciceN1', { d: '31/12/2024' })}</option>
          </select>
          <input type="file" name="fichier" style={{ maxWidth: 230 }} />
          <button className="btn">{t('bal.importer')} {cote}</button>
        </form>
      </div>

      {lesDeux && (
        <>
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{t('bal.whatTheYearOnYearComparison')}</h2>
              <form className="row" style={{ gap: 4 }}>
                <input type="hidden" name="cote" value={cote} />
                <label className="row faint" style={{ gap: 4 }}>{t('bal.shareThreshold')}
                  <input type="number" name="seuil" defaultValue={seuilPts} min={1} max={20} style={{ width: 60 }} /> {t('bal.pts')}
                </label>
                <button className="btn secondary small">{t('bal.recompute')}</button>
              </form>
            </div>
            <div className="grid cols-2">
              <div className="kpi"><span className="v">{a.top10?.partN1} % → {a.top10?.partN} %</span><span className="l">{t('bal.top10ConcentrationShareOfThe')}</span></div>
              <div className="kpi"><span className="v">{a.apparus.length} / {a.disparus.length}</span><span className="l">{t('bal.counterpartiesNewGone')}</span></div>
              <div className="kpi"><span className="v">{a.deplacements.length}</span><span className="l">{t('bal.shareMovements')} {seuilPts} {t('bal.pts')}</span></div>
              <div className="kpi"><span className="v">{a.vieillissement ? `${a.vieillissement.partsN1[4]} % → ${a.vieillissement.partsN[4]} %` : '—'}</span><span className="l">{t('bal.shareBeyond90Days')}</span></div>
            </div>
            {a.vieillissement && (
              <div className="table-scroll mt">
                <table className="data">
                  <thead><tr><th>{t('col.ageing')}</th>{TRANCHE_CLES.map((t) => <th key={t} className="num">{LIBELLES_TRANCHES[t]}</th>)}</tr></thead>
                  <tbody>
                    <tr><td>N-1</td>{a.vieillissement.partsN1.map((p, i) => <td key={i} className="num">{p} %</td>)}</tr>
                    <tr><td>N</td>{a.vieillissement.partsN.map((p, i) => (
                      <td key={i} className="num">{i === 4 && a.vieillissement!.deltaPlus90Pts >= seuilPts ? <span className="badge red">{p} %</span> : `${p} %`}</td>
                    ))}</tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{t('bal.candidateRiskFactors')} <span className="badge gray">{a.candidats.length}</span></h2>
              {a.candidats.length > 0 && (
                <form action={questionsAction}>
                  <input type="hidden" name="cote" value={cote} />
                  <input type="hidden" name="seuil" value={seuilPts} />
                  <button className="btn">{t('bal.draftTheQuestionsToTheClient')}</button>
                </form>
              )}
            </div>
            {a.candidats.length === 0 ? (
              <p className="muted">{t('bal.noFindingAtTheThresholdOf')} {seuilPts} {t('bal.ptsNothingToProposeNothingTo')}</p>
            ) : (
              <table className="data">
                <thead><tr><th>{t('col.finding')}</th><th>{t('bal.suggestedNature')}</th><th></th></tr></thead>
                <tbody>
                  {a.candidats.map((c) => (
                    <tr key={c.code}>
                      <td style={{ maxWidth: 520 }}>{c.description}</td>
                      <td><span className="badge gray">{c.nature}</span></td>
                      <td>
                        {a.proposes.includes(c.code) ? (
                          <span className="badge blue" title={t('bal.inTheRegisterAwaitingHumanConfirmation')}>{t('bal.proposedToTheRegister')}</span>
                        ) : (
                          <form action={proposerAction}>
                            <input type="hidden" name="cote" value={cote} />
                            <input type="hidden" name="seuil" value={seuilPts} />
                            <input type="hidden" name="code" value={c.code} />
                            <button className="btn small secondary">{t('proc.proposerRegistre')}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Repli cle="bal.counterpartyByCounterparty" niveau={2} titre={<>{t('bal.counterpartyByCounterparty')} <span className="badge gray">{a.lignes.length}</span></>}>
            <div className="table-scroll">
              <table className="data">
                <thead><tr>
                  <th>{t('col.account')}</th><th>{t('col.counterparty')}</th>
                  <th className="num">{t('bal.soldeN1')}</th><th className="num">{t('bal.partN1')}</th>
                  <th className="num">{t('bal.soldeN')}</th><th className="num">{t('bal.partN')}</th>
                  <th className="num">{t('bal.plus90jN')}</th>
                </tr></thead>
                <tbody>
                  {a.lignes.map((l) => (
                    <tr key={l.aux}>
                      <td className="mono">{l.aux}</td>
                      <td>
                        {l.label}
                        {l.soldeN1 === null && <span className="badge amber" style={{ marginLeft: 6 }}>{t('mot.new')}</span>}
                        {l.soldeN === null && <span className="badge amber" style={{ marginLeft: 6 }}>{t('mot.gone')}</span>}
                      </td>
                      <td className="num">{l.soldeN1 !== null ? fmtEur(l.soldeN1, 'fr') : '—'}</td>
                      <td className="num">{l.partN1 !== null ? `${l.partN1} %` : '—'}</td>
                      <td className="num">{l.soldeN !== null ? fmtEur(l.soldeN, 'fr') : '—'}</td>
                      <td className="num">{l.partN !== null ? `${l.partN} %` : '—'}</td>
                      <td className="num">{l.tranchesN ? fmtEur(l.tranchesN[4], 'fr') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Repli>
        </>
      )}
      {!lesDeux && (a.fichiers.n || a.fichiers.n1) && (
        <div className="panel">
          <p className="muted">
            {t('bal.theYearOnYearComparisonNeeds')} {cote} {t('bal.importTheMissingOne')}
          </p>
        </div>
      )}
    </div>
  );
}
