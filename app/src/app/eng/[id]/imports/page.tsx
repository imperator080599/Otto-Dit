import { requireMember } from '@/lib/core/auth';
import { listImports, activeTb, drawnSamples } from '@/lib/services/imports';
import type { Violation } from '@/lib/kernel/types';
import { uploadTbAction, uploadFecAction } from './actions';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { Repli } from '@/app/repli';

export const dynamic = 'force-dynamic';

/* L'IPE SE CAPTURE À L'IMPORT (1.8) : système source, nature, identifiant du
   rapport, date et auteur de l'extraction — facultatifs, repris par le rapport
   IPE créé sur ce fichier. Un fichier importé sans ces cinq réponses reste
   importable : la démonstration ne bloque pas sur une famille nouvelle
   (règle 2 de la nuit) ; le rapport IPE, lui, exige ce qu'il exige. */
function ChampsIpe({ t }: { t: (c: CleLibelle) => string }) {
  return (
    <details className="row" style={{ gap: 6, flexBasis: '100%' }}>
      <summary className="faint">{t('imp.ipe.legende')}</summary>
      <input name="ipe_systeme_source" placeholder={t('imp.ipe.systemeSource')} style={{ width: 150 }} />
      <select name="ipe_nature" defaultValue="">
        <option value="">{t('imp.ipe.nature')}</option>
        <option value="systeme">{t('wp.ipe.system')}</option>
        <option value="systeme_modifie">{t('wp.ipe.systemeModifie')}</option>
        <option value="manuelle">{t('wp.ipe.manual')}</option>
      </select>
      <input name="ipe_identifiant" placeholder={t('imp.ipe.identifiant')} style={{ width: 140 }} />
      <input name="ipe_extrait_le" placeholder={t('imp.ipe.extraitLe')} style={{ width: 120 }} />
      <input name="ipe_extrait_par" placeholder={t('imp.ipe.extraitPar')} style={{ width: 140 }} />
    </details>
  );
}

export default async function ImportsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const { erreur } = await searchParams;
  const imports = await listImports(id);
  const tbCur = await activeTb(id, 'current');
  const tbPrior = await activeTb(id, 'prior');
  const affected = await drawnSamples(id);

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="grid cols-2">
        <Repli cle="imp.trialBalanceGenericImporter" niveau={2} titre={t('imp.trialBalanceGenericImporter')}>
          <p>
            Current: {tbCur ? <span className="badge green">{t('imp.nComptes', { n: tbCur.accounts.length })}</span> : <span className="badge gray">{t('imp.notImported')}</span>}
            {'  '}Prior: {tbPrior ? <span className="badge green">{t('imp.nComptes', { n: tbPrior.accounts.length })}</span> : <span className="badge gray">{t('imp.notImported')}</span>}
          </p>
          <form action={uploadTbAction} className="row" style={{ flexWrap: 'wrap' }}>
            <input type="hidden" name="engagement_id" value={id} />
            <input type="file" name="file" accept=".csv,.txt" required />
            <select name="period_kind" defaultValue="current">
              <option value="current">{t('imp.currentPeriodN')}</option>
              <option value="prior">{t('imp.priorPeriodN1')}</option>
            </select>
            <ChampsIpe t={t} />
            <button className="btn">{t('imp.importTb')}</button>
          </form>
        </Repli>
        <Repli cle="imp.generalLedgerFecAdapterFrancePack" niveau={2} titre={t('imp.generalLedgerFecAdapterFrancePack')}>
          {affected.length > 0 && (
            <div className="callout warn">
              {t('imp.adr016')} {affected.length} {t('imp.drawnSampleSDependOnThe')}
            </div>
          )}
          <form action={uploadFecAction} className="row" style={{ flexWrap: 'wrap' }}>
            <input type="hidden" name="engagement_id" value={id} />
            <input type="file" name="file" accept=".txt,.csv" required />
            <ChampsIpe t={t} />
            {affected.length > 0 && (
              <label className="row" style={{ gap: 4 }}>
                <input type="checkbox" name="confirm_invalidation" /> {t('imp.confirmInvalidation')}
              </label>
            )}
            <button className="btn">{t('imp.importFec')}</button>
          </form>
        </Repli>
      </div>

      <Repli cle="imp.importHistoryValidationReports" niveau={2} titre={t('imp.importHistoryValidationReports')}>
        <table className="data">
          <thead>
            <tr><th>{t('col.file')}</th><th>{t('col.kind')}</th><th>{t('col.rows')}</th><th>{t('col.status')}</th><th>{t('col.violations')}</th><th>{t('col.when')}</th></tr>
          </thead>
          <tbody>
            {imports.map((f) => {
              const violations: Violation[] = f.validation_report?.violations ?? [];
              return (
                <tr key={f.id}>
                  <td className="mono">{f.filename}</td>
                  <td>{f.kind}</td>
                  <td className="num">{f.row_count}</td>
                  <td>
                    <span className={`badge ${f.status === 'validated' ? 'green' : f.status === 'rejected' ? 'red' : 'amber'}`}>{f.status}</span>
                  </td>
                  <td>
                    {violations.length === 0 ? (
                      <span className="faint">{t('mot.none')}</span>
                    ) : (
                      <details>
                        <summary>{violations.length} {t('imp.violationS')}</summary>
                        <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                          {violations.slice(0, 25).map((v, i) => (
                            <li key={i} className={v.severity === 'error' ? 'mono' : 'mono muted'} style={{ fontSize: 12 }}>
                              [{v.severity}] {v.code}
                              {v.line ? t('imp.ligneNo', { n: v.line }) : ''}: {v.message}
                            </li>
                          ))}
                          {violations.length > 25 && <li className="faint">{t('imp.nDePlus', { n: violations.length - 25 })}</li>}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="faint">{f.created_at.slice(0, 16)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Repli>
    </div>
  );
}
