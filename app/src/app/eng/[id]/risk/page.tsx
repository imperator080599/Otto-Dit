import { revalidatePath } from 'next/cache';
import { q } from '@/lib/db/client';
import { notesPourEcran } from '@/lib/services/workpapers/lifecycle';
import { Annotable } from '@/app/annotable';
import { poserNoteAncreeAction, repondreNoteAction, transitionNoteAction } from '../notes/actions';
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
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { Repli } from '@/app/repli';

// Le risque par assertion, et CE QU'IL COMMANDE.
//
// L'écran est construit pour rendre le commandement visible : à gauche le
// niveau et les faits qui l'ont produit, à droite la liste des procédures que
// ce niveau fait entrer — et celles qu'il fait sortir, avec la raison. Un écran
// qui n'afficherait que le niveau laisserait croire que le risque est une
// opinion qu'on note quelque part.

const STATUTS_FACTEUR = ['proposed', 'confirmed', 'dismissed'];

export default async function RiskPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fsli?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { fsli, erreur } = await searchParams;
  const membreCourant = await requireMember(id);
  /* QUI REGARDE, ET CE QU'IL PEUT (1.3, ADR-028) : seul un réviseur de la
     mission clôt une note, et jamais l'auteur. Le panneau latéral n'invente
     pas la règle — il reçoit la réponse du serveur et, quand le geste n'est
     pas offert, il écrit pourquoi. */
  const moi = { id: membreCourant.user.id, peutClore: ['manager', 'partner'].includes(membreCourant.membership.eng_role) };
  const cat = await catalogueDeLaMission(id);

  const fslis = (await listFslis(id)).filter(
    (f) => f.scoping === 'in_scope' || f.scoping === 'in_scope_qualitative',
  );
  const code = fsli && fslis.some((f) => f.code === fsli) ? fsli : fslis[0]?.code;

  if (!code) {
    return (
      <div className="panel"><h2 style={{ margin: 0 }}>{t('risk.riskByAssertion')}</h2></div>
    );
  }

  const risks = await risksFor(id, code);
  const required = await requiredProcedures(id, code);
  const excluded = await excludedProcedures(id, code);
  const sectionAnswers = await answers(id, code);
  const entityAnswers = await answers(id, null);
  const obstaclesSection = await questionnaireObstacles(id, code);
  const obstaclesEntity = await questionnaireObstacles(id, null);
  /* Chaque RÉPONSE du questionnaire est annotable — l'ancre est le code de
     la question, qui survit aux millésimes de la méthode (ADR-097). */
  const marquesNotes = await notesPourEcran(id);
  const membresNotes = await q<{ id: string; nom: string }>(
    `select u.id::text id, u.name nom from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null order by u.name`,
    [id],
  );
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
    return executer(`/eng/${id}/risk`, async () => {
      const { user } = await requireMember(id);
      await assessFsli(id, String(formData.get('fsli')), user.id);
      revalidatePath(`/eng/${id}/risk`);
    });
  }

  async function answerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/risk`, async () => {
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
    });
  }

  async function decideAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/risk`, async () => {
      const { user } = await requireMember(id);
      await decideFactor(
        id,
        String(formData.get('factor')),
        String(formData.get('status')) as 'confirmed' | 'dismissed',
        String(formData.get('reason') ?? ''),
        user.id,
      );
      revalidatePath(`/eng/${id}/risk`);
    });
  }

  async function overrideAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/risk`, async () => {
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
    });
  }

  const badge = (l: string) =>
    l === cat.risque.niveaux[cat.risque.niveaux.length - 1] ? 'red'
      : l === cat.risque.niveaux[0] ? 'gray' : 'amber';

  return (
    <div className="stack">
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('risk.riskByAssertion2')} {code}</h2>
          <form action={assessAction} className="row">
            <input type="hidden" name="fsli" value={code} />
            <button className="btn secondary small">{t('risk.reAssess')}</button>
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
              <th>{t('col.assertion')}</th><th>{t('risk.computed')}</th><th>{t('col.retained')}</th>
              <th>{t('risk.whatProducedIt')}</th><th>{t('col.arbitrate')}</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.assertion}>
                <td><strong>{r.assertion}</strong></td>
                <td>
                  <span className={`badge ${badge(r.computed_level)}`}>{r.computed_level}</span>
                  <div className="faint">{t('risk.nFacteurs', { n: r.factor_count })}</div>
                </td>
                <td>
                  {r.retained_level ? (
                    <>
                      <span className={`badge ${badge(r.retained_level)}`}>{r.retained_level}</span>
                      <div className="faint" style={{ maxWidth: 240 }}>{r.override_reason}</div>
                    </>
                  ) : (
                    <span className="faint">{t('risk.theComputation')}</span>
                  )}
                </td>
                <td style={{ maxWidth: 340 }}>
                  {r.factors.length === 0 ? (
                    <span className="faint">{t('risk.noFactorObserved')}</span>
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
                      <option value="">{t('risk.keepTheComputation')}</option>
                      {cat.risque.niveaux.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <input type="text" name="reason" placeholder={t('risk.reasonRequiredIfTheLevelDiffers')} style={{ width: 230 }} />
                    <button className="btn small secondary">{t('risk.arbitrate')}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* L'EXPLICATION SORT, LA RÈGLE RESTE (revue n°1) : l'échelle du
            cabinet est une DONNÉE, et elle continue de s'afficher. */}
        <p className="faint mt">
          {t('risk.scaleRule', { v: cat.risque.version })} :{' '}
          {cat.risque.paliers.map((p) => `${p.facteurs_min}+ → ${p.niveau}`).join(' · ')}
        </p>
        {/* CE QUE LE CABINET A ÉCRIT : la taille d'échantillon par assertion,
            nombre fixe ou FORMULE. C'est de la méthode, pas de la pédagogie —
            trente lignes sur 12 M€ ne couvrent pas ce que trente lignes
            couvrent sur 800 k€, et l'auditeur doit voir laquelle s'applique.
            Un balayage de prose l'avait emportée. */}
        <p className="faint">
          <strong>{t('risk.ceQueLeCabinetAEcrit')}</strong>{' '}
          {Object.entries(cat.risque.tailles).map(([k, v]) => (typeof v === 'number'
            ? `${k} → ${v}`
            : `${k} → ${cat.risque.formules?.[v.formule]?.calcul ?? v.formule}`)).join(' · ')}
        </p>
        {/* LA PART DE QUANTITATIF, MESURÉE — de la méthode d'un côté, de CE
            dossier de l'autre. C'est le chiffre qui dit si le risque ne voit
            que ce qui se compte ; il avait disparu dans un balayage de prose. */}
        <p className="faint">
          <strong>{t('risk.methode')}</strong> — {t('risk.methodePart', {
            q: share.quantitative, ql: share.qualitative, pct: share.pctQuantitative.toFixed(1),
          })}<br />
          <strong>{t('risk.ceDossier')}</strong> — {t('risk.dossierPart', {
            q: raised.quantitative, ql: raised.qualitative, pct: raised.pctQuantitative.toFixed(1),
          })}
        </p>
        {/* LE CHIFFRE SANS SON AVERTISSEMENT N'EST PAS ACTIONNABLE. Ma première
            réparation avait ramené les deux pourcentages et laissé tomber la
            pastille : une méthode équilibrée dont personne ne remplit le
            questionnaire redonne une évaluation qui ne voit que ce qui se
            compte, et c'est CE fait-là qu'un réviseur doit voir. */}
        {raised.qualitative === 0 && (
          <p><span className="badge amber">{t('risk.aucunQualitatif')}</span></p>
        )}
      </div>

      {/* ── LE QUALITATIF ─────────────────────────────────────────────
          Sans lui l'évaluation ne verrait que ce qui se compte : un changement
          de dirigeant, une pression sur le résultat, un litige non provisionné
          ne sont dans aucun grand livre. */}
      <div className="panel">
            <h2>{t('risk.riskByAssertion')}</h2>
        {(obstaclesEntity.length > 0 || obstaclesSection.length > 0) && (
          <div className="callout warn">
            <strong>{t('risk.whatPreventsSigning')}</strong>
            <ul>
              {obstaclesEntity.map((o, i) => <li key={`e-${i}`}>{t('risk.entity')} {t(o.cle, o.vars)}</li>)}
              {obstaclesSection.map((o, i) => <li key={`s-${i}`}>{code} — {t(o.cle, o.vars)}</li>)}
            </ul>
          </div>
        )}

        {(['entite', 'section'] as const).map((scope) => (
          <div key={scope}>
            <h3>{scope === 'entite' ? t('risk.questionsEntite') : t('risk.questionsSection', { code })}</h3>
            <table className="data">
              <tbody>
                {questionsOfScope(cat, scope).map((x) => {
                  const a = byCode.get(x.code);
                  const manque = a?.answer === 'oui' && !a.detail.trim();
                  return (
                    <tr key={x.code}>
                      <td>
                        {a ? (
                          <Annotable moi={moi} repondre={repondreNoteAction} transitionner={transitionNoteAction}
                            bloc
                            ancre={{ kind: 'questionnaire_answer', aRef: x.code, label: t('risk.ancreQuestionnaire', { code: x.code }) }}
                            marques={marquesNotes[`questionnaire_answer|${x.code}`] ?? []}
                            membres={membresNotes} engagementId={id} chemin={`/eng/${id}/risk`}
                            notesHref={`/eng/${id}/notes`} action={poserNoteAncreeAction}
                          >
                            <strong>{x.question}</strong>
                          </Annotable>
                        ) : (
                          <strong>{x.question}</strong>
                        )}
                        <div className="faint">{t('risk.whyItStillExists')} {x.pourquoi}</div>
                        <div className="faint">{t('risk.effectOfAYes')} {x.effet}</div>
                        {x.disparait_quand && (
                          <div className="faint">{t('risk.itWillDisappearWhen')} {x.disparait_quand}.</div>
                        )}
                      </td>
                      <td style={{ minWidth: 380 }}>
                        <form action={answerAction} className="row">
                          <input type="hidden" name="scope" value={scope} />
                          <input type="hidden" name="fsli" value={code} />
                          <input type="hidden" name="question" value={x.code} />
                          <select name="answer" defaultValue={a?.answer ?? ''} required>
                            <option value="" disabled>{t('risk.toAnswer')}</option>
                            <option value="non">{t('commun.non')}</option>
                            <option value="oui">{t('commun.oui')}</option>
                          </select>
                          <input type="text" name="detail" defaultValue={a?.detail ?? ''}
                            placeholder={t('risk.detailRequiredIfYes')}
                            style={{ width: 240, borderColor: manque ? 'var(--red)' : undefined }} />
                          <button className="btn small secondary">{t('mot.save')}</button>
                        </form>
                        {manque && (
                          <div className="faint" style={{ color: 'var(--red)' }}>
                            {t('risk.aYesWithoutDetailCreatesA')}
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
            <h2>{t('risk.registerOfDeclaredFactors')} {reg.length}</h2>
        <table className="data">
          <thead>
            <tr><th>{t('col.source')}</th><th>{t('col.nature')}</th><th>{t('risk.finding')}</th><th>{t('risk.targets')}</th><th>{t('risk.status')}</th><th /></tr>
          </thead>
          <tbody>
            {reg.length === 0 ? (
              <tr><td colSpan={6} className="faint">{t('risk.noFactorDeclared')}</td></tr>
            ) : reg.map((f) => (
              <tr key={f.id}>
                <td className="mono">{f.source}{f.source_ref ? ` · ${f.source_ref}` : ''}</td>
                <td>{cat.questionnaire.naturesRi[f.nature]?.libelle ?? f.nature}</td>
                <td style={{ maxWidth: 320 }}>
                  {f.description}
                  {f.decision_reason && <div className="faint">{t('risk.decision')} {f.decision_reason}</div>}
                </td>
                <td className="faint">
                  {f.targets.map((t) => `${t.fsli} (${t.assertions.join(', ')})`).join(' · ')}
                </td>
                <td>
                  <span className={`badge ${f.status === 'confirmed' ? 'blue' : f.status === 'dismissed' ? 'gray' : 'amber'}`}>
                    {STATUTS_FACTEUR.includes(f.status) ? t(`facteur.${f.status}` as CleLibelle) : f.status}
                  </span>
                </td>
                <td>
                  {f.status === 'proposed' && (
                    <form action={decideAction} className="row">
                      <input type="hidden" name="factor" value={f.id} />
                      <input type="text" name="reason" placeholder={t('commun.motifCourt')} style={{ width: 160 }} />
                      <button className="btn small secondary" name="status" value="confirmed">{t('mot.keep')}</button>
                      <button className="btn small secondary" name="status" value="dismissed">{t('risk.setAside')}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── CE QUE LE RISQUE COMMANDE ─────────────────────────────────── */}
      <Repli cle="risk.whatThisRiskCommands" niveau={2} titre={<>{t('risk.whatThisRiskCommands')} {required.length} {t('risk.procedureSRequired')}</>}>
        <table className="data">
          <thead>
            <tr>
              <th>{t('risk.procedure')}</th><th>{t('col.assertion')}</th><th>{t('col.direction')}</th>
              <th>{t('risk.populationAndSelection')}</th>
              <th>{t('risk.requiredBecause')}</th><th className="num">{t('col.size')}</th>
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
                    ? t('risk.exhaustiveAuSeuil')
                    : t('risk.selectionSuffixe', { s: p.procedure.selection ?? '—' })}</div>
                </td>
                <td className="faint" style={{ maxWidth: 300 }}>{p.because}</td>
                <td className="num">
                  {p.sampleSize === null
                    ? <span className="faint" title={p.taille.obstacle ?? ''}>
                        {p.taille.origine === 'sans_objet' ? '—' : (p.taille.obstacle ?? t('risk.aCalculer'))}
                      </span>
                    : <strong>{p.sampleSize}</strong>}
                  {/* Un chiffre affiché doit savoir dire D'OÙ IL VIENT (P7). */}
                  {p.taille.origine === 'formule' && (
                    <div className="faint" style={{ fontSize: 10, fontWeight: 400 }}>
                      {p.taille.libelle}
                      {p.taille.entrees && (
                        <> {t('risk.populationSuffixe')} {fmtEur(p.taille.entrees.valeurPopulationCents, 'fr')},
                          {t('commun.seuil')} {fmtEur(p.taille.entrees.seuilPlanificationCents, 'fr')}</>
                      )}
                    </div>
                  )}
                  {p.taille.origine === 'table' && (
                    <div className="faint" style={{ fontSize: 10, fontWeight: 400 }}>{t('risk.firmTable')}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Repli>

      {excluded.length > 0 && (
        <div className="panel">
          <details>
            <summary>
              <strong>{excluded.length} {t('risk.procedureSRuledOut')}</strong> {t('risk.andWhy')}
            </summary>
            <table className="data" style={{ marginTop: 8 }}>
              <thead>
                <tr><th>{t('risk.procedure')}</th><th>{t('risk.assertion')}</th><th>{t('risk.niveauAtteint')}</th><th>{t('risk.minimumRequired')}</th></tr>
              </thead>
              <tbody>
                {excluded.map((e) => (
                  <tr key={e.code}>
                    <td><span className="mono">{e.code}</span><div>{e.libelle}</div></td>
                    <td>{e.assertion}</td>
                    <td>{e.level ?? <span className="faint">{t('risk.notAssessed')}</span>}</td>
                    <td>{e.requires}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  );
}
