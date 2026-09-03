import Link from 'next/link';
import { requireUser } from '@/lib/core/auth';
import { tableauDeBord, ANCIENNETES, type LigneTravail } from '@/lib/services/travaux';
import { ECHELLE, type Section, type Statut } from '@/lib/services/sections';
import { FAMILLES } from '@/app/eng/[id]/familles';
import { tr } from '@/lib/i18n';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { Repli } from '@/app/repli';

// MES TRAVAUX — l'écran d'où l'on part (ADR-110), devenu LE TABLEAU DE BORD
// (Groupe 1, 1.2).
//
// Le critère de navigation du mandat se compte « depuis Mes travaux » : il
// fallait donc que Mes travaux existe. Rien n'y est stocké — tout est dérivé
// (notes adressées, papiers en attente de visa, demandes échues ; puis mes
// sections sur tous mes dossiers, ce qui empêche le visa de chacun, les notes
// ouvertes par ancienneté) : une liste de travail qui se maintient à la main
// ment le jour où on oublie de la tenir. Une ligne, un clic, l'objet.
//
// CE QUE CET ÉCRAN NE FAIT PAS : il ne porte aucune action. Envoyer une
// section, la suivre, lever un obstacle — cela se fait dans le dossier, là où
// la règle vit et où le refus s'affiche. Ici on lit, et on clique DEDANS.

export const dynamic = 'force-dynamic';

const TITRES: Record<LigneTravail['nature'], CleLibelle> = {
  note: 'trav.titre.note', visa: 'trav.titre.visa', demande: 'trav.titre.demande',
};

const SOUS_TITRES: Record<LigneTravail['nature'], CleLibelle> = {
  note: 'trav.quoi.note', visa: 'trav.quoi.visa', demande: 'trav.quoi.demande',
};

const LISTES: { cle: 'detenues' | 'attribuees' | 'suivies' | 'recentes'; titre: CleLibelle }[] = [
  { cle: 'detenues', titre: 'vue.currentlyWithMe' },
  { cle: 'attribuees', titre: 'vue.assignedToMe' },
  { cle: 'suivies', titre: 'vue.trackedByMe' },
  { cle: 'recentes', titre: 'vue.recent' },
];

const cleStatut = (s: Statut) => `statut.${s}` as CleLibelle;
const cleAge = (a: 'j7' | 'j30' | 'plus') => `trav.age.${a}` as CleLibelle;

type T = (cle: CleLibelle, vars?: Record<string, string | number>) => string;

/** Une des quatre listes de sections — la même échelle de statut que le
 *  dossier, avec le dossier en première colonne puisqu'on est hors dossier. */
function ListeSections({ titre, sections, cle, t }: { titre: string; sections: Section[]; cle: string; t: T }) {
  return (
    <div data-section-liste={cle}>
      <h3>{titre} <span className="faint">({sections.length})</span></h3>
      {sections.length === 0 ? <p className="faint">{t('vue.nothing')}</p> : (
        <div className="table-scroll">
          <table className="data">
            <tbody>
              {sections.map((s) => (
                <tr key={s.id}>
                  <td className="faint">{s.mission}</td>
                  <td><Link href={s.href}>{s.label}</Link></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={`badge ${ECHELLE[s.statut].classe}`}>
                      <span aria-hidden="true">{ECHELLE[s.statut].repere}</span>{' '}
                      {t(cleStatut(s.statut))}
                    </span>
                  </td>
                  <td className="faint" style={{ whiteSpace: 'nowrap' }}>{s.holderNom ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function MesTravaux() {
  const user = await requireUser();
  const t = await tr();
  const { lignes, sections, obstacles, notes } = await tableauDeBord(user.id);
  const natures: LigneTravail['nature'][] = ['note', 'visa', 'demande'];
  const nObstacles = obstacles.reduce((s, d) => s + d.familles.reduce((x, f) => x + f.n, 0), 0);

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('commun.mesTravaux')}</h1>
        <span className="faint">{user.name} · {t('trav.nLignes', { n: lignes.length })}</span>
      </div>
      <p className="faint">{t('trav.scelles')}</p>

      {lignes.length === 0 && (
        <div className="panel">
          <p>
            <span className="badge green">{t('trav.nothingIsWaitingForYou')}</span> {t('trav.noNoteAddressedToYouNo')}
          </p>
        </div>
      )}

      {natures.map((nature) => {
        const groupe = lignes.filter((l) => l.nature === nature);
        if (groupe.length === 0) return null;
        return (
          <div className="panel" key={nature}>
            <h2>{t(TITRES[nature])} <span className="faint">({groupe.length})</span></h2>
            <p className="faint">{t(SOUS_TITRES[nature])}</p>
            <table className="data">
              <thead>
                <tr><th>{t('col.engagement')}</th><th>{t('col.subject')}</th><th>{t('trav.whereItStands')}</th><th>{t('col.date')}</th></tr>
              </thead>
              <tbody>
                {groupe.map((l, i) => (
                  <tr key={`${l.nature}-${i}`}>
                    <td className="faint">{l.mission}</td>
                    <td><Link href={l.href}>{l.titre}</Link></td>
                    <td>
                      {l.retard && <span className="badge amber" style={{ marginRight: 6 }}>{t('trav.toHandle')}</span>}
                      {t(l.detail.cle, l.detail.vars)}
                    </td>
                    <td className="faint">{l.quand ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* CE QUI EMPÊCHE LE VISA, DOSSIER PAR DOSSIER — le même calcul que
          l'écran des obstacles du dossier ; chaque famille mène à l'écran qui
          la lève. Le ROUGE reste réservé à ce qui bloque : ici, tout bloque. */}
      <div className="panel" data-obstacles>
        <h2>{t('trav.obstacles.titre')} <span className={`badge ${nObstacles ? 'amber' : 'green'}`}>{nObstacles}</span></h2>
        <p className="faint">{t('trav.obstacles.quoi')}</p>
        {obstacles.length === 0 ? <p className="faint">{t('trav.obstacles.aucunDossier')}</p> : (
          <table className="data">
            <thead>
              <tr><th>{t('col.engagement')}</th><th>{t('trav.col.famille')}</th><th>{t('trav.col.combien')}</th><th></th></tr>
            </thead>
            <tbody>
              {obstacles.map((d) => d.familles.length === 0 ? (
                <tr key={d.engagementId} data-obstacles-dossier={d.engagementId}>
                  <td className="faint">{d.mission}</td>
                  <td colSpan={3}><span className="badge green">{t('obst.aucun')}</span></td>
                </tr>
              ) : d.familles.map((f, i) => (
                <tr key={`${d.engagementId}-${f.famille}`} data-obstacles-dossier={i === 0 ? d.engagementId : undefined}
                  data-obstacle-famille={f.famille}>
                  <td className="faint">{i === 0 ? d.mission : ''}</td>
                  <td>{FAMILLES[f.famille] ? t(FAMILLES[f.famille].titre) : f.famille}</td>
                  <td><span className="badge amber">{f.n}</span></td>
                  <td><Link href={f.href}>{t('obst.aller')} →</Link></td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </div>

      <Repli cle="vue.assignments" niveau={2} titre={<>{t('vue.assignments')} <span className="faint">— {user.name}</span></>}>
        <p className="faint">{t('trav.sections.quoi')}</p>
        <div className="grid cols-2">
          {LISTES.map((l) => (
            <ListeSections key={l.cle} cle={l.cle} titre={t(l.titre)} sections={sections[l.cle]} t={t} />
          ))}
        </div>
      </Repli>

      <Repli cle="trav.notes.titre" niveau={2} titre={t('trav.notes.titre')}>
        <p className="faint">{t('trav.notes.quoi')}</p>
        {notes.length === 0 ? <p className="faint">{t('trav.notes.aucune')}</p> : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('col.engagement')}</th>
                {ANCIENNETES.map((a) => <th key={a}>{t(cleAge(a))}</th>)}
                <th>{t('col.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((d) => (
                <tr key={d.engagementId} data-notes-dossier={d.engagementId}>
                  <td className="faint">{d.mission}</td>
                  {ANCIENNETES.map((a) => (
                    <td key={a}>
                      {d.parAnciennete[a] > 0
                        ? <span className={`badge ${a === 'plus' ? 'amber' : 'gray'}`}>{d.parAnciennete[a]}</span>
                        : <span className="faint">—</span>}
                    </td>
                  ))}
                  <td><Link href={d.href}>{t('rail.notes')} ({d.total}) →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Repli>
    </div>
  );
}
