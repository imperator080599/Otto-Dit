import Link from 'next/link';
import { q1 } from '@/lib/db/client';
import { requireMember } from '@/lib/core/auth';
import { missionsParClient } from '@/lib/services/bascule';
import { railDuDossier } from '@/lib/services/rail';
import { basculerAction } from './bascule-actions';
import { EngNav } from './nav';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireMember(id);
  /* LA BASCULE (ADR-100) : les missions du connecté, groupées client →
     entité → mission. Un groupe est UN client à plusieurs entités et parfois
     plusieurs mandats — jamais une liste plate. */
  const clients = await missionsParClient(user.id);
  const eng = await q1<{
    id: string; name: string; status: string;
    framework_set: { assurance_packs: string[]; accounting_map: string; language: string };
    entity_name: string; period_label: string;
  }>(
    `select e.id, e.name, e.status, e.framework_set, en.name entity_name, p.label period_label
     from engagement e join entity en on en.id = e.entity_id join period p on p.id = e.period_id
     where e.id = $1`,
    [id],
  );

  /* LE RAIL D'ÉTAT (ADR-103) : calculé ici, contre l'état réel du dossier. */
  const rail = await railDuDossier(id, eng.framework_set.assurance_packs);

  return (
    <div className="shell shell-wide">
      {/* L'EN-TÊTE DU DOSSIER EST DU CHROME (ADR-112) : fil d'Ariane, bascule,
          référentiels, et le bouton qui ouvre la conversation avec le dossier.
          Identique sur tous les écrans du dossier, par conception — la mesure
          de densité l'exclut donc du compte des actions d'écran, et le dit. */}
      <header className="dossier-entete row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="faint">
            <Link href="/">Missions</Link> / {eng.entity_name} · {eng.period_label}
          </div>
          <h1>{eng.name}</h1>
        </div>
        <div className="row">
          <details className="bascule">
            <summary className="btn secondary small">Changer de dossier</summary>
            <div className="bascule-liste">
              {clients.map((c) => (
                <div key={c.client}>
                  <div className="faint" style={{ marginTop: 6 }}>{c.client}</div>
                  {c.entites.map((en) => (
                    <div key={en.entity_id} style={{ paddingLeft: 8 }}>
                      {c.entites.length > 1 || en.entity_name !== c.client ? <div>{en.entity_name}</div> : null}
                      {en.missions.map((m) => m.id === id ? (
                        <div key={m.id} className="faint" style={{ paddingLeft: 8 }}>▸ {m.name} · {m.period_label} (dossier ouvert)</div>
                      ) : (
                        <form key={m.id} action={basculerAction} style={{ paddingLeft: 8 }}>
                          <input type="hidden" name="vers" value={m.id} />
                          <input type="hidden" name="depuis" value={id} />
                          <button className="lien-bascule" type="submit">{m.name} · {m.period_label}</button>
                        </form>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
          {eng.framework_set.assurance_packs.map((p) => (
            <span key={p} className="badge blue">{p}</span>
          ))}
          <span className="badge gray">{eng.framework_set.accounting_map}</span>
          <span className="badge gray">{eng.framework_set.language}</span>
          <span className={`badge ${eng.status === 'locked' ? 'amber' : 'green'}`}>{eng.status}</span>
          {/* INTERROGER LE DOSSIER — un bouton en haut à droite, plus une
              section du rail (R-03) : on pose une question depuis l'écran où
              elle vient, pas en quittant son travail pour aller la poser. */}
          <Link href={`/eng/${id}/ask`} className="btn secondary small">Interroger le dossier</Link>
        </div>
      </header>
      <div className="dossier">
        <EngNav entrees={rail} />
        <div className="dossier-corps">{children}</div>
      </div>
    </div>
  );
}
