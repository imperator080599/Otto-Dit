import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { motDuPack } from '@/lib/packs';
import { frameworkSet } from '@/lib/services/fsli';
import { tableauDeBord } from '@/lib/services/tableau-de-bord';
import { BandeauRefus } from '@/app/bandeau-refus';
import { FAMILLES } from './familles';

// LA VUE D'ENSEMBLE — un tableau de bord, et d'abord LE MIEN (R-04, ADR-112).
//
// Trois questions, dans cet ordre : qu'est-ce qui m'attend ? où en est le
// dossier ? qu'est-ce qui empêche de signer ? Le reste — référentiels,
// échéances légales, composition de l'équipe — vit là où on le travaille.

export const dynamic = 'force-dynamic';

const COULEUR = (pct: number) => (pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--amber)' : 'var(--track)');

function Barre({ pct, couleur }: { pct: number; couleur: string }) {
  return (
    <div className="progressbar" style={{ minWidth: 90 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, background: couleur }} />
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
  const fs = await frameworkSet(id);
  const b = await tableauDeBord(id, user.id);
  const base = `/eng/${id}`;
  const motObstacles = motDuPack(fs.assurance_packs, 'obstacles');

  const parFamille = new Map<string, number>();
  for (const o of b.obstacles) parFamille.set(o.famille, (parFamille.get(o.famille) ?? 0) + 1);

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>
          Ce qui m’attend <span className="faint">— {user.name}</span>{' '}
          {b.moi.length === 0
            ? <span className="badge green">rien</span>
            : <span className="badge amber">{b.moi.length}</span>}
        </h2>
        {b.moi.length === 0 ? (
          <p className="faint">
            Aucune note ne vous est adressée, aucun papier n’attend un visa, aucune demande
            n’est échue sur ce dossier.
          </p>
        ) : (
          <table className="data">
            <thead><tr><th>Objet</th><th>Où en est-ce</th><th>Date</th></tr></thead>
            <tbody>
              {b.moi.map((l, i) => (
                <tr key={`${l.nature}-${i}`}>
                  <td><Link href={l.href}>{l.titre}</Link></td>
                  <td>
                    {l.retard && <span className="badge amber" style={{ marginRight: 6 }}>à traiter</span>}
                    {l.detail}
                  </td>
                  <td className="faint">{l.quand ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Avancement par poste</h3>
          <table className="data">
            <thead><tr><th>Poste</th><th>Contrôlé</th><th className="num">Écarts</th></tr></thead>
            <tbody>
              {b.postes.map((p) => (
                <tr key={p.code}>
                  <td><Link href={`${base}/poste/${encodeURIComponent(p.code)}`}>{p.name}</Link></td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Barre pct={p.pct} couleur={COULEUR(p.pct)} />
                      <span className="faint">{p.testes}/{p.items}</span>
                    </div>
                  </td>
                  <td className="num">
                    {p.ecarts > 0
                      ? <span className="badge amber">{p.ecarts}</span>
                      : <span className="faint">—</span>}
                  </td>
                </tr>
              ))}
              {b.postes.length === 0 && (
                <tr><td colSpan={3} className="faint">
                  Aucun poste retenu — le {motDuPack(fs.assurance_packs, 'scoping').toLowerCase()} ouvre les espaces de travail.
                </td></tr>
              )}
            </tbody>
          </table>

          <h3>Demandes et papiers</h3>
          <table className="data">
            <tbody>
              <tr>
                <td><Link href={`${base}/requests`}>Demandes au client</Link></td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Barre pct={b.demandes.total ? (b.demandes.recues / b.demandes.total) * 100 : 0}
                      couleur={b.demandes.echues > 0 ? 'var(--red)' : 'var(--green)'} />
                    <span className="faint">{b.demandes.recues}/{b.demandes.total} reçues</span>
                  </div>
                </td>
                <td className="num">
                  {b.demandes.echues > 0
                    ? <span className="badge red">{b.demandes.echues} échue(s)</span>
                    : <span className="faint">—</span>}
                </td>
              </tr>
              <tr>
                <td><Link href={`${base}/workpapers`}>Papiers de travail</Link></td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Barre pct={b.papiers.total ? (b.papiers.signes / b.papiers.total) * 100 : 0}
                      couleur={COULEUR(b.papiers.total ? (b.papiers.signes / b.papiers.total) * 100 : 0)} />
                    <span className="faint">{b.papiers.signes}/{b.papiers.total} visés</span>
                  </div>
                </td>
                <td className="num faint">{b.papiers.brouillons} brouillon(s)</td>
              </tr>
            </tbody>
          </table>
          <p className="faint">
            <Link href={`${base}/dashboard`}>Pilotage détaillé — relances, exports, coût de l’IA</Link>
          </p>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>
            {motObstacles}{' '}
            {b.obstacles.length === 0
              ? <span className="badge green">rien ne bloque</span>
              : <span className="badge amber">{b.obstacles.length}</span>}
          </h3>
          {b.obstacles.length > 0 && (
            <table className="data">
              <tbody>
                {[...parFamille.entries()].map(([f, n]) => (
                  <tr key={f}>
                    <td>{FAMILLES[f]?.titre ?? f}</td>
                    <td className="num">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="faint"><Link href={`${base}/obstacles`}>Voir obstacle par obstacle</Link></p>

          <h3>Qui porte quoi</h3>
          <table className="data">
            <thead><tr><th>Membre</th><th>Rôle</th><th className="num">Notes reçues</th><th className="num">Notes posées</th></tr></thead>
            <tbody>
              {b.equipe.map((m) => (
                <tr key={m.userId}>
                  <td>{m.nom}</td>
                  <td className="faint">{m.role}</td>
                  <td className="num">
                    {m.notes > 0 ? m.notes : <span className="faint">—</span>}
                    {m.bloquantes > 0 && <span className="badge red" style={{ marginLeft: 6 }}>{m.bloquantes} bloquante(s)</span>}
                  </td>
                  <td className="num">{m.posees > 0 ? m.posees : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint">
            Notes reçues et notes posées : les deux seules attributions nominatives du dossier.
          </p>
        </div>
      </div>

      {b.notes.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Notes de revue ouvertes</h3>
          <table className="data">
            <thead><tr><th>Note</th><th>De → à</th><th>Type</th><th>Date</th></tr></thead>
            <tbody>
              {b.notes.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`${base}/notes`}>{x.texte.length > 120 ? `${x.texte.slice(0, 120)}…` : x.texte}</Link></td>
                  <td className="faint">{x.auteur} → {x.destinataire ?? 'non attribuée'}</td>
                  <td>
                    <span className={`badge ${x.type === 'a_corriger' ? 'red' : 'gray'}`}>
                      {x.type === 'a_corriger' ? 'à corriger' : x.type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="faint">{x.quand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
