import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { fmtEur } from '@/lib/kernel/canon';
import { listFslis } from '@/lib/services/fsli';
import {
  assessFsli, risksFor, overrideLevel, requiredProcedures, excludedProcedures,
} from '@/lib/services/risk';
import {
  questionsOfScope, answers, answerQuestion, register, decideFactor,
  questionnaireObstacles, ruleShare, raisedShare,
} from '@/lib/services/questionnaire';

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
  const cat = await catalogueDeLaMission(id);

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
  const sectionAnswers = await answers(id, code);
  const entityAnswers = await answers(id, null);
  const obstaclesSection = await questionnaireObstacles(id, code);
  const obstaclesEntity = await questionnaireObstacles(id, null);
  const reg = await register(id);
  /* DEUX ratios : ce que la méthode peut voir, et ce que CE dossier porte
     réellement. Le second peut être mauvais alors que le premier est bon — une
     méthode équilibrée dont personne ne remplit le questionnaire redonne une
     évaluation à 100 % quantitative, et c'est cela qu'il faut voir. */
  const share = ruleShare(cat);
  const raised = await raisedShare(id);
  const byCode = new Map([...sectionAnswers, ...entityAnswers].map((a) => [a.question_code, a]));

  async function assessAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await assessFsli(id, String(formData.get('fsli')), user.id);
    revalidatePath(`/eng/${id}/risk`);
  }

  async function answerAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    const scope = String(formData.get('scope'));
    await answerQuestion({
      engagementId: id,
      fsliCode: scope === 'entite' ? null : String(formData.get('fsli')),
      questionCode: String(formData.get('question')),
      answer: String(formData.get('answer')) as 'oui' | 'non',
      detail: String(formData.get('detail') ?? ''),
      actorUserId: user.id,
    });
    revalidatePath(`/eng/${id}/risk`);
  }

  async function decideAction(formData: FormData) {
    'use server';
    const { user } = await requireMember(id);
    await decideFactor(
      id,
      String(formData.get('factor')),
      String(formData.get('status')) as 'confirmed' | 'dismissed',
      String(formData.get('reason') ?? ''),
      user.id,
    );
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

      {/* ── LE QUALITATIF ─────────────────────────────────────────────
          Sans lui l'évaluation ne verrait que ce qui se compte : un changement
          de dirigeant, une pression sur le résultat, un litige non provisionné
          ne sont dans aucun grand livre. */}
      <div className="panel">
        <h2>Questionnaire résiduel</h2>
        <p className="faint">
          Uniquement ce qu’<strong>aucune autre source du dossier</strong> ne peut lever. Une réponse
          « oui » ne coche rien : elle <strong>crée un facteur au registre</strong>, avec son texte.
        </p>
        <p className="faint">
          <strong>Méthode</strong> — {share.quantitative} règles calculées, {share.qualitative}{' '}
          sources déclarées : <strong>{share.pctQuantitative.toFixed(1)} %</strong> de quantitatif.
          {' · '}
          <strong>Ce dossier</strong> — {raised.quantitative} facteur(s) observé(s),{' '}
          {raised.qualitative} déclaré(s) retenu(s) :{' '}
          <strong>{raised.pctQuantitative.toFixed(1)} %</strong> de quantitatif.
          {raised.qualitative === 0 && (
            <> {' '}<span className="badge amber">aucun qualitatif sur ce dossier</span> — une méthode
            équilibrée dont personne ne remplit le questionnaire redonne une évaluation qui ne voit
            que ce qui se compte.</>
          )}
        </p>

        {(obstaclesEntity.length > 0 || obstaclesSection.length > 0) && (
          <div className="callout warn">
            <strong>Obstacles au visa</strong>
            <ul>
              {obstaclesEntity.map((o) => <li key={`e-${o}`}>entité — {o}</li>)}
              {obstaclesSection.map((o) => <li key={`s-${o}`}>{code} — {o}</li>)}
            </ul>
          </div>
        )}

        {(['entite', 'section'] as const).map((scope) => (
          <div key={scope}>
            <h3>{scope === 'entite' ? 'Questions d’entité — posées une fois' : `Questions de section — ${code}`}</h3>
            <table className="data">
              <tbody>
                {questionsOfScope(cat, scope).map((x) => {
                  const a = byCode.get(x.code);
                  const manque = a?.answer === 'oui' && !a.detail.trim();
                  return (
                    <tr key={x.code}>
                      <td>
                        <strong>{x.question}</strong>
                        <div className="faint">Pourquoi elle existe encore : {x.pourquoi}</div>
                        <div className="faint">Effet d’un « oui » : {x.effet}</div>
                        {x.disparait_quand && (
                          <div className="faint">Elle disparaîtra quand {x.disparait_quand}.</div>
                        )}
                      </td>
                      <td style={{ minWidth: 380 }}>
                        <form action={answerAction} className="row">
                          <input type="hidden" name="scope" value={scope} />
                          <input type="hidden" name="fsli" value={code} />
                          <input type="hidden" name="question" value={x.code} />
                          <select name="answer" defaultValue={a?.answer ?? ''} required>
                            <option value="" disabled>— à répondre —</option>
                            <option value="non">non</option>
                            <option value="oui">oui</option>
                          </select>
                          <input type="text" name="detail" defaultValue={a?.detail ?? ''}
                            placeholder="précision — obligatoire si « oui »"
                            style={{ width: 240, borderColor: manque ? 'var(--red)' : undefined }} />
                          <button className="btn small secondary">enregistrer</button>
                        </form>
                        {manque && (
                          <div className="faint" style={{ color: 'var(--red)' }}>
                            Un « oui » sans précision crée un facteur que personne ne pourra relire.
                            La réponse est gardée ; le visa reste bloqué.
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Registre des facteurs déclarés — {reg.length}</h2>
        <p className="faint">
          Une constatation faite <strong>ailleurs</strong> se pose seule sur les sections concernées,
          avec un lien vers sa source. Un facteur <strong>non statué bloque le visa</strong> ; l’écarter
          exige un motif écrit, sans quoi « écarté » et « oublié » se ressemblent.
        </p>
        <table className="data">
          <thead>
            <tr><th>Source</th><th>Nature</th><th>Constatation</th><th>Vise</th><th>Statut</th><th /></tr>
          </thead>
          <tbody>
            {reg.length === 0 ? (
              <tr><td colSpan={6} className="faint">Aucun facteur déclaré.</td></tr>
            ) : reg.map((f) => (
              <tr key={f.id}>
                <td className="mono">{f.source}{f.source_ref ? ` · ${f.source_ref}` : ''}</td>
                <td>{cat.questionnaire.naturesRi[f.nature]?.libelle ?? f.nature}</td>
                <td style={{ maxWidth: 320 }}>
                  {f.description}
                  {f.decision_reason && <div className="faint">décision : {f.decision_reason}</div>}
                </td>
                <td className="faint">
                  {f.targets.map((t) => `${t.fsli} (${t.assertions.join(', ')})`).join(' · ')}
                </td>
                <td>
                  <span className={`badge ${f.status === 'confirmed' ? 'blue' : f.status === 'dismissed' ? 'gray' : 'amber'}`}>
                    {f.status}
                  </span>
                </td>
                <td>
                  {f.status === 'proposed' && (
                    <form action={decideAction} className="row">
                      <input type="hidden" name="factor" value={f.id} />
                      <input type="text" name="reason" placeholder="motif" style={{ width: 160 }} />
                      <button className="btn small secondary" name="status" value="confirmed">retenir</button>
                      <button className="btn small secondary" name="status" value="dismissed">écarter</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── CE QUE LE RISQUE COMMANDE ─────────────────────────────────── */}
      <div className="panel">
        <h2>Ce que ce risque commande — {required.length} procédure(s) requise(s)</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Procédure</th><th>Assertion</th><th>Sens</th>
              <th>Population et sélection</th>
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
                {/* LA MÉTHODE LÀ OÙ ELLE S'EXÉCUTE (point 6). Une procédure sans
                    population explicite est une intention, pas une procédure :
                    on dit sur QUOI elle porte et COMMENT on y choisit. */}
                <td className="faint" style={{ maxWidth: 260 }}>
                  <div className="mono" style={{ fontSize: 11 }}>{p.procedure.population.predicat}</div>
                  {Object.keys(p.procedure.population.parametres ?? {}).length > 0 && (
                    <div style={{ fontSize: 11 }}>
                      {Object.entries(p.procedure.population.parametres ?? {})
                        .map(([k, v]) => `${k} : ${String(v)}`).join(' · ')}
                    </div>
                  )}
                  <div>{p.procedure.selection === 'exhaustive_au_seuil'
                    ? 'exhaustive au seuil — aucun tirage'
                    : `sélection : ${p.procedure.selection}`}</div>
                </td>
                <td className="faint" style={{ maxWidth: 300 }}>{p.because}</td>
                <td className="num">
                  {p.sampleSize === null
                    ? <span className="faint" title={p.taille.obstacle ?? ''}>
                        {p.taille.origine === 'sans_objet' ? '—' : (p.taille.obstacle ?? 'à calculer')}
                      </span>
                    : <strong>{p.sampleSize}</strong>}
                  {/* Un chiffre affiché doit savoir dire D'OÙ IL VIENT (P7). */}
                  {p.taille.origine === 'formule' && (
                    <div className="faint" style={{ fontSize: 10, fontWeight: 400 }}>
                      {p.taille.libelle}
                      {p.taille.entrees && (
                        <> — population {fmtEur(p.taille.entrees.valeurPopulationCents, 'fr')},
                          seuil {fmtEur(p.taille.entrees.seuilPlanificationCents, 'fr')}</>
                      )}
                    </div>
                  )}
                  {p.taille.origine === 'table' && (
                    <div className="faint" style={{ fontSize: 10, fontWeight: 400 }}>table du cabinet</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint mt">
          <strong>La taille suit l’assertion testée</strong>, jamais le risque le plus élevé du poste :
          une procédure répond à UNE assertion. Une section porte donc des échantillons de tailles
          différentes — c’est la conséquence normale, pas une incohérence.
        </p>
        <p className="faint">
          <strong>Ce que le cabinet a écrit</strong> :{' '}
          {Object.entries(cat.risque.tailles).map(([k, v]) =>
            typeof v === 'number'
              ? `${k} → ${v}`
              : `${k} → ${cat.risque.formules?.[v.formule]?.calcul ?? v.formule}`,
          ).join(' · ')}.
          {' '}Une taille par <strong>formule</strong> tient compte de la population :
          trente lignes sur 12 M€ ne couvrent pas la même chose que trente lignes sur 800 k€.
          La méthode <strong>nomme</strong> la formule et fixe ses paramètres ; le moteur la{' '}
          <strong>calcule</strong> — une formule nommée qu’il ne saurait pas calculer arrête le
          chargement de la méthode, elle ne rend pas une taille au hasard.
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
