import Link from 'next/link';
import { requireUser } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import {
  methodologies, methodologieCourante, contenuDeLaMethodologie, contenuDuDepot,
  fichiersAttendus,
} from '@/lib/methodology/depot';
import { ImportForm } from './import-form';
import { soumettreMethode, designerAction } from './actions';
import { tr } from '@/lib/i18n';

// LA MÉTHODE DU CABINET — l'écran qui rend la phrase démontrable.
//
// « Votre méthode reste la vôtre, vous la chargez, je ne la vois jamais. »
// Sans cet écran, la seconde moitié de la phrase se termine par « … dites-le
// moi et je la charge pour vous ». Avec lui, un cabinet colle son fichier
// devant vous et le voit prendre effet — ou se faire refuser avec la liste des
// raisons, ce qui est la partie la plus convaincante des deux.
//
// UNE SEULE RÈGLE : le texte est toujours un objet dont les clés sont des noms
// de fichiers. Ce qui change, c'est ce qu'on en fait.
//   · CORRECTIF — les fichiers présents remplacent les leurs, les autres sont
//     repris de la version en vigueur. Les liens ci-dessous pré-remplissent un
//     fichier ; on peut en ajouter un second à la main.
//   · PAQUET ENTIER — remplace tout, et doit être complet.
//
// LE CORRECTIF N'ÉTAIT D'ABORD QU'UN SEUL FICHIER, ET C'ÉTAIT UN PIÈGE, trouvé
// en conduisant l'écran : passer une échelle de trois à quatre niveaux exige
// risque.json ET procedures.json dans LA MÊME publication — chacun seul est
// refusé par le contrôle croisé, à juste titre. Un mode qui rend impossible la
// modification la plus probable n'est pas une commodité.
//
// Le paquet entier fait 126 000 caractères : l'imposer pour changer deux lignes
// serait une fausse configurabilité.

export const dynamic = 'force-dynamic';

function ligne(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function MethodologyPage({
  searchParams,
}: {
  searchParams: Promise<{ fichier?: string }>;
}) {
  const user = await requireUser();
  const t = await tr();
  const sp = await searchParams;
  const attendus = await fichiersAttendus();
  const liste = await methodologies(user.tenant_id);
  const courante = await methodologieCourante(user.tenant_id);

  const engagements = await q<{ id: string; name: string; methodology_id: string | null; label: string | null }>(
    `select e.id, e.name, e.methodology_id, m.label
     from engagement e
     left join firm_methodology m on m.id = e.methodology_id
     where e.tenant_id = $1 order by e.name`,
    [user.tenant_id],
  );

  // Sans méthode en vigueur, seul le paquet entier a un sens : il n'y a rien
  // dont reprendre les fichiers absents.
  const fichier = courante ? (sp.fichier ?? '') : '*';
  const base = courante
    ? await contenuDeLaMethodologie(courante.id)
    : await contenuDuDepot();
  const gabarit = fichier === '*'
    ? JSON.stringify(base, null, 2)
    : fichier
      ? JSON.stringify({ [fichier]: base[fichier] ?? {} }, null, 2)
      : '';

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('commun.methode')}</h1>
        <Link href="/" className="btn secondary small">{t('col.engagements')}</Link>
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>{t('col.version')}</th><th>{t('meth.published')}</th><th>{t('meth.procedures')}</th><th>{t('col.risk')}</th>
              <th>{t('col.assertions')}</th><th>{t('col.hash')}</th><th>{t('col.engagements')}</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.label}
                  {courante?.id === m.id && <> <span className="badge green">{t('meth.inForce')}</span></>}
                </td>
                <td>{ligne(m.published_at)}</td>
                <td className="mono">{m.versions.procedures ?? '—'}</td>
                <td className="mono">{m.versions.risque ?? '—'}</td>
                <td className="mono">{m.versions.assertions ?? '—'}</td>
                <td className="mono" style={{ fontSize: 11 }}>{m.content_hash.slice(0, 12)}…</td>
                <td>{engagements.filter((e) => e.methodology_id === m.id).length}</td>
              </tr>
            ))}
            {liste.length === 0 && (
              <tr><td colSpan={7} className="faint">
                {t('meth.noMethodologyPublishedUntilThereIs')} <strong>{t('meth.noEngagementCanBePlanned')}</strong> {t('meth.theEngineRefusesRatherThanFalling')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>{t('meth.whichEngagementWorksUnderWhichMethodolog')}</h2>
        <table className="data">
          <thead><tr><th>{t('col.engagement')}</th><th>{t('meth.methodology')}</th><th>{t('meth.reAssign')}</th></tr></thead>
          <tbody>
            {engagements.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/eng/${e.id}`}>{e.name}</Link></td>
                <td>
                  {e.label ?? <span className="badge amber">{t('meth.noneTheEngagementCannotBePlanned')}</span>}
                </td>
                <td>
                  <form action={designerAction} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="engagement_id" value={e.id} />
                    <select name="methodology_id" defaultValue={e.methodology_id ?? ''}>
                      {liste.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <button className="btn secondary small" disabled={liste.length === 0}>{t('meth.assign')}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>{t('meth.loadAMethodology')}</h2>
        {/* data-actions-item : cette bande CHOISIT un fichier parmi n — un lien
            par objet, comme les onglets de pièce de l'atelier. C'est une
            sélection d'objet, pas n actions d'écran (docs/DENSITE.md). */}
        <p className="row" style={{ gap: 6, flexWrap: 'wrap' }} data-actions-item>
          {courante && attendus.map((f) => (
            <Link
              key={f}
              href={`/methodology?fichier=${encodeURIComponent(f)}`}
              className={`btn small ${fichier === f ? '' : 'secondary'}`}
            >{f}</Link>
          ))}
          <Link href="/methodology?fichier=*" className={`btn small ${fichier === '*' ? '' : 'secondary'}`}>
            {t('meth.theWholePackage')}
          </Link>
        </p>
        {fichier ? (
          <ImportForm action={soumettreMethode} attendus={attendus} gabarit={gabarit} fichier={fichier} />
        ) : (
          <p className="faint">{t('meth.chooseAFileOrTheWhole')}</p>
        )}
      </div>

    </div>
  );
}
