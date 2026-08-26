import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { chargerCatalogue } from '@/lib/methodology/catalogue';
import { listFslis } from '@/lib/services/fsli';
import {
  assessFsli, risksFor, overrideLevel, requiredProcedures, excludedProcedures,
} from '@/lib/services/risk';

// Le risque par assertion, et CE QU'IL COMMANDE.
//
// L'écran est construit pour rendre le commandement visible : à gauche le
// niveau et les faits qui l'ont produit, à droite la liste des procédures que
// ce niveau fait entrer — et celles qu'il fait sortir, avec la raison. Un écran
// qui n'afficherait que le niveau laisserait croire que le risque est une
// opinion qu'on note quelque part.

export default async function RiskPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fsli?: string }>;
}) {
  const { id } = await params;
  const { fsli } = await searchParams;
  await requireMember(id);
  const cat = await chargerCatalogue();

  const fslis = (await listFslis(id)).filter(
    (f) => f.scoping === 'in_scope' || f.scoping === 'in_scope_qualitative',
  );
  const code = fsli && fslis.some((f) => f.code === fsli) ? fsli : fslis[0]?.code;

  if (!code) {
    return (
      <div className="panel">
        <h2>Risque par assertion</h2>
        <p className="faint">
          Aucun poste retenu au périmètre. Le risque s’évalue sur ce qui est dans le périmètre —
          l’évaluer ailleurs produirait des travaux que personne ne fera.
        </p>
      </div>
    );
  }

  const risks = await risksFor(id, code);
  const required = await requiredProcedures(id, code);
  const excluded = await excludedProcedures(id, code);

  async function assessAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await assessFsli(id, String(formData.get('fsli')), user.id);
    revalidatePath(`/eng/${id}/risk`);
  }

  async function overrideAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    const level = String(formData.get('level') ?? '');
    await overrideLevel(
      id,
      String(formData.get('fsli')),
      String(formData.get('assertion')),
      level === '' ? null : level,
      String(formData.get('reason') ?? ''),
      user.id,
    );
    revalidatePath(`/eng/${id}/risk`);
  }

  const badge = (l: string) =>
    l === cat.risque.niveaux[cat.risque.niveaux.length - 1] ? 'red'
      : l === cat.risque.niveaux[0] ? 'gray' : 'amber';

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Risque par assertion — {code}</h2>
          <form action={assessAction} className="row">
            <input type="hidden" name="fsli" value={code} />
            <button className="btn secondary small">Ré-évaluer</button>
          </form>
        </div>
        <div className="row">
          {fslis.map((f) => (
            <a key={f.code} href={`?fsli=${f.code}`} className={f.code === code ? 'badge blue' : 'badge gray'}>
              {f.code}
            </a>
          ))}
        </div>

        <table className="data" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Assertion</th><th>Calculé</th><th>Retenu</th>
              <th>Ce qui l’a produit</th><th>Arbitrer</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.assertion}>
                <td><strong>{r.assertion}</strong></td>
                <td>
                  <span className={`badge ${badge(r.computed_level)}`}>{r.computed_level}</span>
                  <div className="faint">{r.factor_count} facteur(s)</div>
                </td>
                <td>
                  {r.retained_level ? (
                    <>
                      <span className={`badge ${badge(r.retained_level)}`}>{r.retained_level}</span>
                      <div className="faint" style={{ maxWidth: 240 }}>{r.override_reason}</div>
                    </>
                  ) : (
                    <span className="faint">— le calcul</span>
                  )}
                </td>
                <td style={{ maxWidth: 340 }}>
                  {r.factors.length === 0 ? (
                    <span className="faint">aucun facteur observé</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {r.factors.map((f) => (
                        <li key={f.factor_code}>
                          {f.label}
                          <div className="faint mono">{f.evidence}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <form action={overrideAction} className="row">
                    <input type="hidden" name="fsli" value={code} />
                    <input type="hidden" name="assertion" value={r.assertion} />
                    <select name="level" defaultValue={r.retained_level ?? ''}>
                      <option value="">— retenir le calcul —</option>
                      {cat.risque.niveaux.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <input type="text" name="reason" placeholder="motif — obligatoire" style={{ width: 200 }} />
                    <button className="btn small secondary">arbitrer</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint mt">
          Le <strong>calculé</strong> est re-dérivé à chaque évaluation : il suit la matérialité et les
          données, et ne se saisit jamais. Le <strong>retenu</strong> est votre décision, et elle
          survit au recalcul. Une surcharge <strong>sans motif écrit est refusée</strong> — par le
          service et par la base. Règle de l’échelle :{' '}
          {cat.risque.paliers.map((p) => `${p.facteurs_min}+ → ${p.niveau}`).join(' · ')} (méthode
          v{cat.risque.version}, modifiable dans <span className="mono">methodology/risque.json</span>).
        </p>
      </div>

      {/* ── CE QUE LE RISQUE COMMANDE ─────────────────────────────────── */}
      <div className="panel">
        <h2>Ce que ce risque commande — {required.length} procédure(s) requise(s)</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Procédure</th><th>Assertion</th><th>Sens</th>
              <th>Requise parce que</th><th className="num">Taille</th>
            </tr>
          </thead>
          <tbody>
            {required.map((p) => (
              <tr key={p.procedure.code}>
                <td>
                  <span className="mono">{p.procedure.code}</span>
                  <div>{p.procedure.libelle}</div>
                </td>
                <td>{p.assertion}</td>
                <td className="faint">{cat.sensDeTest[p.procedure.sens]?.libelle ?? p.procedure.sens}</td>
                <td className="faint" style={{ maxWidth: 320 }}>{p.because}</td>
                <td className="num">
                  {p.sampleSize === null ? <span className="faint">—</span> : <strong>{p.sampleSize}</strong>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint mt">
          <strong>La taille suit l’assertion testée</strong>, jamais le risque le plus élevé du poste :
          une procédure répond à UNE assertion. Une section porte donc des échantillons de tailles
          différentes — c’est la conséquence normale, pas une incohérence. Table du cabinet :{' '}
          {Object.entries(cat.risque.tailles).map(([k, v]) => `${k} → ${v}`).join(' · ')}.
        </p>
      </div>

      {excluded.length > 0 && (
        <div className="panel">
          <details>
            <summary>
              <strong>{excluded.length} procédure(s) écartée(s)</strong> — et pourquoi
            </summary>
            <table className="data" style={{ marginTop: 8 }}>
              <thead>
                <tr><th>Procédure</th><th>Assertion</th><th>Niveau atteint</th><th>Minimum exigé</th></tr>
              </thead>
              <tbody>
                {excluded.map((e) => (
                  <tr key={e.code}>
                    <td><span className="mono">{e.code}</span><div>{e.libelle}</div></td>
                    <td>{e.assertion}</td>
                    <td>{e.level ?? <span className="faint">non évaluée</span>}</td>
                    <td>{e.requires}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="faint mt">
              Une liste qui ne dit que ce qu’elle retient ne se conteste pas. Monter le niveau d’une
              assertion fait entrer ses procédures ici ; le baisser les en sort.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
