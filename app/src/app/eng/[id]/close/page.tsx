import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q01 } from '@/lib/db/client';
import { obstaclesAuVisa } from '@/lib/services/obstacles';
import { latestArchive } from '@/lib/services/archive';
import { dateRapport } from '@/lib/services/completion';
import { fileDeadlines } from '@/lib/services/retention';
import { cloreAction } from './actions';

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
const ko = (n: string | number) => `${(Number(n) / 1024).toFixed(0)} ko`;

export default async function ClosePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
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
  const parFamille = new Map<string, number>();
  for (const o of obstacles) parFamille.set(o.famille, (parFamille.get(o.famille) ?? 0) + 1);

  return (
    <div className="stack">
      {erreur && (
        <div className="panel warn">
          <p><span className="badge amber">refusé</span> {erreur}</p>
          <p className="faint">Rien n’a été enregistré. Le refus vient du service, pas de l’écran.</p>
        </div>
      )}

      <div className="panel">
        <h2>Clôture et archive scellée</h2>
        <p className="faint">
          Clore, c’est <strong>signer</strong> : le rapport est daté, l’assemblage part, la durée de
          conservation commence. L’archive est produite <strong>avant</strong> le verrou, à partir
          d’un dossier encore lisible — c’est le verrou qui la rend définitive.
        </p>

        {scelle ? (
          <>
            <p>
              <span className="badge green">dossier scellé</span> le {fr(archive!.sealed_at)} ·
              {' '}{ko(archive!.size_bytes)} · conservation jusqu’au {fr(archive!.retention_until)}
            </p>
            <p className="mono faint" style={{ wordBreak: 'break-all' }}>
              empreinte SHA-256 : {archive!.sha256}
            </p>
            <p>
              {/* LE CHEMIN DE LECTURE QUI MANQUAIT. Une archive qu'on ne peut pas
                  sortir ne prouve rien à un inspecteur. */}
              <a className="btn" href={`/api/archive/${id}`}>Télécharger le dossier scellé (.zip)</a>
            </p>
            <p className="faint">
              L’archive est autoportante : elle s’ouvre sans le produit, sans réseau et sans script.
              Deux exports du même dossier donnent les mêmes octets — c’est ce qui rend un export
              jetable.
            </p>
          </>
        ) : obstacles.length > 0 ? (
          <>
            <p>
              <span className="badge amber">{obstacles.length} obstacle(s) au visa</span> — le dossier
              ne se clôt pas tant qu’il en reste un.
            </p>
            <ul>
              {[...parFamille.entries()].map(([f, n]) => (
                <li key={f}>{f} — {n}</li>
              ))}
            </ul>
            <p>
              <Link href={`/eng/${id}/obstacles`}>Voir la liste, obstacle par obstacle →</Link>
            </p>
            <p className="faint">
              Cette liste est <strong>la même</strong> que celle que la clôture interroge : deux
              vérités sur ce qui bloque divergeraient un jour, et ce serait toujours celle qu’on
              croit.
            </p>
          </>
        ) : (
          <>
            <p><span className="badge green">aucun obstacle au visa</span></p>
            <p className="faint">
              Échéances calculées&nbsp;: assemblage à clore le <strong>{fr(echeances.completionDue)}</strong>
              {' '}({echeances.completion.source.citation}), conservation jusqu’au{' '}
              <strong>{fr(echeances.retentionUntil)}</strong> ({echeances.retention.source.citation})
              {echeances.anyUnverified && <> · <span className="badge amber">référence non vérifiée</span></>}
            </p>
            {membership.can_sign ? (
              <form action={cloreAction} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="engagement_id" value={id} />
                <label className="row" style={{ gap: 4 }}>
                  Date du rapport
                  <input name="report_date" placeholder="AAAA-MM-JJ"
                    defaultValue={rapport ?? eng?.report_date ?? ''} style={{ width: 120 }} />
                </label>
                <button className="btn">Clore le dossier et sceller l’archive</button>
              </form>
            ) : (
              /* Ne pas offrir l'action impossible — et dire pourquoi (ADR-090). */
              <p className="faint">
                Pas de bouton de clôture ici : clore revient à signer, et vous n’avez pas le droit
                de signature sur cette mission. Ouvrir un dossier n’est pas y travailler, et y
                travailler n’est pas le signer.
              </p>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h3>Ce que le verrou change</h3>
        <p className="faint">
          Après la clôture le dossier passe en <strong>verrouillé</strong> : les écritures y sont
          refusées par la base, pas seulement par l’écran. L’état actuel est{' '}
          <strong>{eng?.status ?? '—'}</strong>.
        </p>
      </div>
    </div>
  );
}
