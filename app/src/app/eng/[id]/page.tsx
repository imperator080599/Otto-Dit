import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { q, q01 } from '@/lib/db/client';
import { motDuPack } from '@/lib/packs';
import { frameworkSet } from '@/lib/services/fsli';
import { obstaclesAuVisa } from '@/lib/services/obstacles';
import {
  assurerSections, mesSections, avancement, sectionsDuDossier,
  ECHELLE, ORDRE_STATUT, type Section, type Statut,
} from '@/lib/services/sections';
import { tr, type CleLibelle } from '@/lib/i18n';
import { BandeauRefus } from '@/app/bandeau-refus';
import { FAMILLES } from './familles';
import { envoyerAction, suivreAction } from './sections-actions';

// LA VUE D'ENSEMBLE — un tableau de bord, et d'abord LE MIEN (revue n°2 §5).
//
// Trois blocs, dans cet ordre : l'avancement de la mission et l'état des notes
// EN GRAPHIQUE ; « My assignments » en quatre listes qui ne se recouvrent pas ;
// puis qui porte quoi, et ce qui empêche de signer.
//
// L'ÉCHELLE DE COULEURS EST UNIQUE (vigilance §4) : quatre statuts, tenus
// partout, et la couleur n'est JAMAIS seule — chaque statut porte un repère de
// forme et son libellé. Le ROUGE ne fait pas partie de l'échelle : il est
// réservé à ce qui BLOQUE (une note « à corriger », une demande échue).

export const dynamic = 'force-dynamic';

const COULEUR: Record<string, string> = {
  gray: 'var(--gray-soft)', amber: 'var(--amber)', green: 'var(--green)',
  blue: 'var(--accent)', red: 'var(--red)',
};

/** Une barre empilée : la part de chaque statut, avec sa légende à côté. */
function Barre({ parts }: { parts: { cle: string; n: number; classe: string; libelle: string; repere: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <>
      <div className="barre-empilee" role="img"
        aria-label={parts.map((p) => `${p.libelle} : ${p.n}`).join(', ')}>
        {total === 0
          ? <div style={{ width: '100%', background: 'var(--track)' }} />
          : parts.filter((p) => p.n > 0).map((p) => (
            <div key={p.cle} style={{ width: `${(p.n / total) * 100}%`, background: COULEUR[p.classe] }} />
          ))}
      </div>
      <div className="row legende">
        {parts.map((p) => (
          <span key={p.cle} className="legende-item">
            <span aria-hidden="true" style={{ color: COULEUR[p.classe] }}>{p.repere}</span>
            {' '}{p.libelle} <strong>{p.n}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

type T = (cle: CleLibelle, vars?: Record<string, string | number>) => string;

/** La clé de statut, typée : les quatre existent, un test le garde. */
const cleStatut = (s: Statut) => `statut.${s}` as CleLibelle;

function Liste({
  titre, sections, vide, engagementId, membres, t,
}: {
  titre: string; sections: Section[]; vide: string; engagementId: string;
  membres: { id: string; nom: string }[]; t: T;
}) {
  return (
    <div>
      <h3>{titre} <span className="faint">({sections.length})</span></h3>
      {sections.length === 0 ? <p className="faint">{vide}</p> : (
        /* LA LARGEUR EST CONTENUE ICI, pas dans la page : une liste qui porte
           un envoi et un suivi déborde de sa demi-colonne, et c'est le CORPS
           qui se mettrait à défiler — mesuré par `npm run visuel`. */
        <div className="table-scroll">
        <table className="data">
          <tbody>
            {sections.map((s) => (
              <tr key={s.id}>
                <td><Link href={s.href}>{s.label}</Link></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className={`badge ${ECHELLE[s.statut].classe}`}>
                    <span aria-hidden="true">{ECHELLE[s.statut].repere}</span>{' '}
                    {t(cleStatut(s.statut))}
                  </span>
                </td>
                <td className="faint" style={{ whiteSpace: 'nowrap' }}>
                  {s.holderNom ?? '—'}
                </td>
                <td>
                  <form action={envoyerAction} className="row" style={{ gap: 3 }}>
                    <input type="hidden" name="engagement_id" value={engagementId} />
                    <input type="hidden" name="section_id" value={s.id} />
                    <select name="vers" defaultValue="" aria-label={t('vue.sendTo')}>
                      <option value="" disabled>{t('vue.sendTo')}…</option>
                      {membres.filter((m) => m.id !== s.holderId).map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                    <button className="btn secondary small">→</button>
                  </form>
                </td>
                <td>
                  <form action={suivreAction}>
                    <input type="hidden" name="engagement_id" value={engagementId} />
                    <input type="hidden" name="section_id" value={s.id} />
                    <input type="hidden" name="suivre" value="1" />
                    <button className="btn secondary small">{t('vue.track')}</button>
                  </form>
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

export default async function VueDEnsemble({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const { erreur } = await searchParams;
  const { user } = await requireMember(id);
  const t = await tr();
  const fs = await frameworkSet(id);

  /* Les sections se DÉRIVENT du dossier : un poste retenu, un papier écrit.
     Une liste tenue à la main oublie la section suivante en silence. */
  await assurerSections(id);

  const mes = await mesSections(user.id);
  const parStatut = await avancement(id);
  const toutes = await sectionsDuDossier(id);
  const obstacles = await obstaclesAuVisa(id);
  const membres = await q<{ id: string; nom: string; role: string }>(
    `select u.id::text, u.name nom, m.eng_role role
     from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 order by u.name`, [id]);

  /* LES NOTES : rouge pour ce qui BLOQUE, jaune pour ouvert, gris pour clos.
     Le rouge ne sert qu'ici, et seulement pour « à corriger ». */
  const notes = (await q01<{ bloquantes: string; ouvertes: string; closes: string }>(
    `select count(*) filter (where status = 'open' and note_type = 'a_corriger')::text bloquantes,
            count(*) filter (where status = 'open' and note_type <> 'a_corriger')::text ouvertes,
            count(*) filter (where status <> 'open')::text closes
     from review_note where engagement_id = $1`, [id]))!;

  const parFamille = new Map<string, number>();
  for (const o of obstacles) parFamille.set(o.famille, (parFamille.get(o.famille) ?? 0) + 1);

  const parMembre = membres.map((m) => ({
    ...m,
    detenues: toutes.filter((s) => s.holderId === m.id).length,
    possedees: toutes.filter((s) => s.ownerId === m.id).length,
    statuts: ORDRE_STATUT.map((st) => toutes.filter(
      (s) => s.ownerId === m.id && s.statut === st).length),
  }));

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <div className="grid cols-2">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{t('vue.engagementStatus')}</h2>
          <Barre parts={parStatut.map((p) => ({
            cle: p.statut, n: p.n, classe: ECHELLE[p.statut].classe,
            repere: ECHELLE[p.statut].repere, libelle: t(cleStatut(p.statut)),
          }))} />
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{t('rail.notes')}</h2>
          <Barre parts={[
            { cle: 'b', n: Number(notes.bloquantes), classe: 'red', repere: '▲', libelle: t('note.priority') },
            { cle: 'o', n: Number(notes.ouvertes), classe: 'amber', repere: '◐', libelle: t('note.open') },
            { cle: 'c', n: Number(notes.closes), classe: 'gray', repere: '●', libelle: t('note.closed') },
          ]} />
          <p className="faint mt">
            <Link href={`/eng/${id}/notes`}>{t('rail.notes')} →</Link>
          </p>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{t('vue.assignments')} <span className="faint">— {user.name}</span></h2>
        <div className="grid cols-2">
          <Liste titre={t('vue.currentlyWithMe')} sections={mes.detenues} vide={t('vue.nothing')}
            engagementId={id} membres={membres} t={t} />
          <Liste titre={t('vue.assignedToMe')} sections={mes.attribuees} vide={t('vue.nothing')}
            engagementId={id} membres={membres} t={t} />
          <Liste titre={t('vue.trackedByMe')} sections={mes.suivies} vide={t('vue.nothing')}
            engagementId={id} membres={membres} t={t} />
          <Liste titre={t('vue.recent')} sections={mes.recentes} vide={t('vue.nothing')}
            engagementId={id} membres={membres} t={t} />
        </div>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{t('vue.byMember')}</h2>
          <table className="data">
            <thead>
              <tr>
                <th>{t('vue.owner')}</th>
                <th className="num">{t('vue.assignedToMe')}</th>
                <th className="num">{t('vue.currentlyWithMe')}</th>
                <th>{t('vue.status')}</th>
              </tr>
            </thead>
            <tbody>
              {parMembre.map((m) => (
                <tr key={m.id}>
                  <td>{m.nom} <span className="faint">{m.role}</span></td>
                  <td className="num">{m.possedees}</td>
                  <td className="num">{m.detenues}</td>
                  <td>
                    {m.statuts.every((n) => n === 0) ? <span className="faint">—</span>
                      : ORDRE_STATUT.map((st, i) => (m.statuts[i] > 0 ? (
                        <span key={st} className={`badge ${ECHELLE[st].classe}`} style={{ marginRight: 4 }}>
                          <span aria-hidden="true">{ECHELLE[st].repere}</span> {m.statuts[i]}
                        </span>
                      ) : null))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>
            {motDuPack(fs.assurance_packs, 'obstacles')}{' '}
            {obstacles.length === 0
              ? <span className="badge green">0</span>
              : <span className="badge red">{obstacles.length}</span>}
          </h2>
          {obstacles.length > 0 && (
            <table className="data">
              <tbody>
                {[...parFamille.entries()].map(([f, n]) => (
                  <tr key={f}><td>{FAMILLES[f] ? t(FAMILLES[f].titre) : f}</td><td className="num">{n}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="faint"><Link href={`/eng/${id}/obstacles`}>→</Link></p>
        </div>
      </div>
    </div>
  );
}
