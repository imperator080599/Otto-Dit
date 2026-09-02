import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q01 } from '@/lib/db/client';
import { obstaclesAuVisa, type Famille } from '@/lib/services/obstacles';
import { latestArchive } from '@/lib/services/archive';
import { dateRapport } from '@/lib/services/completion';
import { fileDeadlines } from '@/lib/services/retention';
import { cloreAction } from './actions';
import { FAMILLES } from '../familles';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';

// LA CLÔTURE ET L'ARCHIVE SCELLÉE — la fin de l'arc, enfin dans l'application.
//
// CE QUI MANQUAIT, ET C'EST GÊNANT À ÉCRIRE. `closeFile` existait, `sealFile`
// existait, l'archive était produite, empreintée, conservée — et AUCUN écran
// n'y menait. L'arc du produit se terminait dans du code appelé par des tests.
// La table `file_archive` n'avait même pas de chemin de lecture : le dossier
// scellé existait sans que personne puisse le sortir. C'est le défaut de la
// règle 13 dans sa forme la plus pure — un objet créé qu'aucun chemin de
// lecture n'atteint — et il vivait au dernier geste du métier.

export const dynamic = 'force-dynamic';

const fr = (iso: string | null | undefined) =>
  (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const ko = (n: string | number) => `${(Number(n) / 1024).toFixed(0)} kB`;

export default async function ClosePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { membership } = await requireMember(id);
  const { erreur } = await searchParams;

  const eng = await q01<{ status: string; report_date: string | null; name: string }>(
    `select status, report_date::text as report_date, name from engagement where id = $1`, [id],
  );
  const obstacles = await obstaclesAuVisa(id);
  const archive = await q01<{ id: string; sha256: string; size_bytes: string; sealed_at: string; retention_until: string }>(
    `select id, sha256, size_bytes::text, sealed_at::text, retention_until::text
     from file_archive where engagement_id = $1 order by sealed_at desc limit 1`, [id],
  );
  const rapport = await dateRapport(id);
  /* Les échéances se CALCULENT à partir des faits du dossier — jamais une durée
     en dur. On les montre avant de clore : signer, c'est démarrer deux horloges. */
  const echeances = await fileDeadlines(id, rapport ?? undefined);

  const scelle = Boolean(archive);
  const parFamille = new Map<Famille, number>();
  for (const o of obstacles) parFamille.set(o.famille, (parFamille.get(o.famille) ?? 0) + 1);

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <div className="panel">
        <h2>{t('close.closeAndSealedArchive')}</h2>

        {scelle ? (
          <>
            <p>
              <span className="badge green">{t('close.fileSealed')}</span> le {fr(archive!.sealed_at)} ·
              {' '}{ko(archive!.size_bytes)} {t('close.retainedUntil')} {fr(archive!.retention_until)}
            </p>
            <p className="mono faint" style={{ wordBreak: 'break-all' }}>
              {t('close.sha256Hash')} {archive!.sha256}
            </p>
            <p>
              {/* LE CHEMIN DE LECTURE QUI MANQUAIT. Une archive qu'on ne peut pas
                  sortir ne prouve rien à un inspecteur. */}
              <a className="btn" href={`/api/archive/${id}`}>{t('close.downloadTheSealedFileZip')}</a>
            </p>
          </>
        ) : obstacles.length > 0 ? (
          <>
            <p>
              <span className="badge amber">{obstacles.length} {t('close.blockerSToSignOff')}</span> {t('close.theFileCannotBeClosedWhile')}
            </p>
            <ul>
              {[...parFamille.entries()].map(([f, n]) => (
                /* Le NOM de la famille, pas son code : « achevement — 1 » n'est
                   pas une phrase qu'on donne à lire à un signataire. */
                <li key={f}>{t(FAMILLES[f].titre)} — {n}</li>
              ))}
            </ul>
            <p>
              <Link href={`/eng/${id}/obstacles`}>{t('close.seeTheListBlockerByBlocker')}</Link>
            </p>
          </>
        ) : (
          <>
            <p><span className="badge green">{t('close.noBlockerToSignOff')}</span></p>
            <p className="faint">
              {t('close.computedDeadlinesAssemblyToBeClosed')} <strong>{fr(echeances.completionDue)}</strong>
              {' '}({echeances.completion.source.citation}{t('close.retainedUntil2')}{' '}
              <strong>{fr(echeances.retentionUntil)}</strong> ({echeances.retention.source.citation})
              {echeances.anyUnverified && <> · <span className="badge amber">{t('close.referenceUnverified')}</span></>}
            </p>
            {membership.can_sign ? (
              <form action={cloreAction} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="engagement_id" value={id} />
                <label className="row" style={{ gap: 4 }}>
                  {t('close.reportDate')}
                  <input name="report_date" placeholder="AAAA-MM-JJ"
                    defaultValue={rapport ?? eng?.report_date ?? ''} style={{ width: 120 }} />
                </label>
                <button className="btn">{t('close.closeTheFileAndSealThe')}</button>
              </form>
            ) : (
              /* Ne pas offrir l'action impossible — et dire pourquoi (ADR-090). */
              <p className="faint">{t('close.pasDeDroit')}</p>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h3>{t('close.whatTheLockChanges')}</h3>
      </div>
    </div>
  );
}
