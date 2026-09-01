import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import {
  importerProcessus, lireProcessus, diffProcessus, statuerChangement, layoutDiagramme,
} from '@/lib/services/processus';
import {
  creerEntretien, consignerComprehension, deposerTranscript, analyserTranscript,
  statuerEcart, lireEntretiens, purgerTranscriptsEchus, LIBELLES_ECARTS,
} from '@/lib/services/entretiens';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

// LE CONTRÔLE INTERNE ET LES PROCESSUS (point 2, ADR-108). La plateforme
// héberge le processus en DONNÉES STRUCTURÉES et GÉNÈRE le diagramme — le
// flowchart du client est une pièce de corroboration, pas la source. La
// différence N/N-1 est EXACTE et chaque changement se STATUE. L'entretien se
// documente (consentement tracé, ou notes sans enregistrement) ; le
// transcript produit des ÉCARTS CANDIDATS — omissions d'abord — statués un
// par un. La couleur ne signale que ce qui attend une décision.

const CYCLE = 'REVENUE';

export default async function ProcessusPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  await requireMember(id);
  const versions = await lireProcessus(id, CYCLE);
  const diff = await diffProcessus(id, CYCLE);
  const entretiens = await lireEntretiens(id, CYCLE);
  const adaptateur = process.env.OTTO_TRANSCRIPT_ADAPTER ?? 'mock';
  const montre = versions.n ?? versions.n1;
  const diagramme = montre ? layoutDiagramme(montre) : null;

  async function importAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      const fichier = formData.get('fichier') as File;
      if (!fichier || !fichier.size) throw new Error('processus : choisissez le fichier de description structurée (JSON)');
      await importerProcessus({
        engagementId: id,
        exercice: String(formData.get('exercice')) as 'n' | 'n1',
        filename: fichier.name,
        contenu: new Uint8Array(await fichier.arrayBuffer()),
        userId: user.id,
        confirmerRemplacement: formData.get('remplacer') === 'on',
      });
      revalidatePath(`/eng/${id}/processus`);
    });
  }
  async function statuerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      await statuerChangement({
        engagementId: id, cycle: CYCLE,
        changeCode: String(formData.get('code')),
        significance: String(formData.get('significance')) as 'significatif' | 'non_significatif',
        reason: String(formData.get('reason') ?? ''),
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/processus`);
      revalidatePath(`/eng/${id}/risk`);
    });
  }
  async function entretienAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      const participants = [1, 2, 3].map((i) => ({
        nom: String(formData.get(`nom${i}`) ?? ''),
        qualite: String(formData.get(`qualite${i}`) ?? ''),
        consentement: formData.get(`consent${i}`) === 'on',
      }));
      await creerEntretien({
        engagementId: id, cycle: CYCLE,
        date: String(formData.get('date') ?? ''),
        sujet: String(formData.get('sujet') ?? ''),
        support: String(formData.get('support')) as 'notes' | 'enregistrement',
        participants,
        retentionUntil: String(formData.get('retention') ?? '') || null,
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/processus`);
    });
  }
  async function comprehensionAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      await consignerComprehension(String(formData.get('itv')), String(formData.get('texte') ?? ''), user.id);
      revalidatePath(`/eng/${id}/processus`);
    });
  }
  async function transcriptAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      await deposerTranscript(String(formData.get('itv')), String(formData.get('contenu') ?? ''), user.id);
      revalidatePath(`/eng/${id}/processus`);
    });
  }
  async function analyserAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      await analyserTranscript(String(formData.get('itv')), user.id);
      revalidatePath(`/eng/${id}/processus`);
    });
  }
  async function ecartAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      await statuerEcart({
        gapId: String(formData.get('gap')),
        decision: String(formData.get('decision')) as 'question' | 'factor' | 'dismissed',
        reason: String(formData.get('reason') ?? ''),
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/processus`);
      revalidatePath(`/eng/${id}/risk`);
      revalidatePath(`/eng/${id}/requests`);
    });
  }
  async function purgeAction() {
    'use server';
    return executer(`/eng/${id}/processus`, async () => {
      const { user } = await requireMember(id);
      const n = await purgerTranscriptsEchus(id, new Date().toISOString().slice(0, 10), user.id);
      if (n === 0) throw new Error('purge : aucun transcript à conservation échue — rien à supprimer');
      revalidatePath(`/eng/${id}/processus`);
    });
  }

  const NOM_EXERCICE = { n: 'N', n1: 'N-1' } as const;

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <h2>{t('proc.internalControlAndProcesses')} {diff && diff.aStatuer.length > 0 && (
          <span className="badge red">{diff.aStatuer.length} {t('proc.changeSToDecide')}</span>
        )}</h2>
        <form action={importAction} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select name="exercice" defaultValue="n">
            <option value="n">{t('proc.versionN')}</option>
            <option value="n1">version N-1 (reprise)</option>
          </select>
          <input type="file" name="fichier" style={{ maxWidth: 240 }} />
          <label className="faint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" name="remplacer" /> {t('proc.confirmer')}
          </label>
          <button className="btn">{t('proc.importer')}</button>
        </form>
        <p className="faint mono" style={{ marginBottom: 0 }}>
          {(['n1', 'n'] as const).map((ex) => versions[ex]
            ? t('proc.versionDecrite', { ex: NOM_EXERCICE[ex], fichier: versions[ex]!.filename, e: versions[ex]!.etapes.length, c: versions[ex]!.controles.length })
            : t('proc.versionNonDecrite', { ex: NOM_EXERCICE[ex] })).join(' · ')}
        </p>
      </div>

      {montre && diagramme && (
        <div className="panel">
          <h2>{t('proc.diagramme')} — {montre.nom} ({NOM_EXERCICE[montre.exercice]})</h2>
          <p className="faint"></p>
          <div className="table-scroll">
            <svg width={diagramme.w} height={diagramme.h} viewBox={`0 0 ${diagramme.w} ${diagramme.h}`} role="img"
              aria-label={t('proc.diagramme', { nom: montre.nom })} style={{ maxWidth: 'none' }}>
              {diagramme.fleches.map((f, i) => (
                <line key={`f${i}`} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} stroke="currentColor" strokeWidth="1.2" />
              ))}
              {diagramme.attaches.map((a, i) => (
                <line key={`a${i}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.6" />
              ))}
              {diagramme.etapes.map((b) => (
                <g key={b.code}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <text x={b.x + 10} y={b.y + 20} fontSize="12.5" fontWeight="600" fill="currentColor">{b.libelle}</text>
                  <text x={b.x + 10} y={b.y + 38} fontSize="11" fill="currentColor" opacity="0.75">{b.acteur}</text>
                  <text x={b.x + 10} y={b.y + 52} fontSize="11" fill="currentColor" opacity="0.75">{b.systeme}</text>
                </g>
              ))}
              {diagramme.controles.map((c) => (
                <g key={c.code}>
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="6" fill="none" stroke="currentColor" strokeWidth="0.9" strokeDasharray="5 3" />
                  <text x={c.x + 8} y={c.y + 17} fontSize="11.5" fontWeight="600" fill="currentColor">{c.code} — {c.libelle.length > 34 ? `${c.libelle.slice(0, 33)}…` : c.libelle}</text>
                  <text x={c.x + 8} y={c.y + 33} fontSize="10.5" fill="currentColor" opacity="0.75">{c.frequence} · {c.proprietaire}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className="table-scroll mt">
            <table className="data">
              <thead><tr><th>{t('proc.etape')}</th><th>{t('proc.libelle')}</th><th>Acteur</th><th>{t('proc.systeme')}</th><th>{t('proc.entrees')}</th><th>Sorties</th></tr></thead>
              <tbody>
                {montre.etapes.map((e) => (
                  <tr key={e.code}>
                    <td className="mono">{e.code}</td><td>{e.libelle}</td><td>{e.acteur}</td>
                    <td>{e.systeme}</td><td className="faint">{e.entrees}</td><td className="faint">{e.sorties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll mt">
            <table className="data">
              <thead><tr><th>{t('proc.controle')}</th><th>{t('proc.etape')}</th><th>{t('proc.libelle')}</th><th>{t('proc.frequence')}</th><th>{t('proc.proprietaire')}</th></tr></thead>
              <tbody>
                {montre.controles.map((c) => (
                  <tr key={c.code}>
                    <td className="mono">{c.code}</td><td className="mono">{c.etape}</td><td>{c.libelle}</td>
                    <td>{c.frequence}</td><td>{c.proprietaire}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {diff && (
        <div className="panel">
          <h2>{t('proc.diff')}</h2>
          {diff.changements.length === 0 && <p className="faint">{t('proc.aucunChangement')}</p>}
          {diff.changements.length > 0 && (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Changement</th><th>Avant (N-1)</th><th>{t('proc.apres')}</th><th>{t('proc.decision')}</th></tr></thead>
                <tbody>
                  {diff.changements.map((c) => {
                    const d = diff.decisions[c.code];
                    return (
                      <tr key={c.code}>
                        <td>
                          {c.libelle}
                          <div className="faint mono" style={{ fontSize: 11 }}>{c.code}</div>
                        </td>
                        <td>{c.avant ?? '—'}</td>
                        <td>{c.apres ?? '—'}</td>
                        <td>
                          {d ? (
                            <>
                              <span className="badge gray">{d.significance === 'significatif' ? t('proc.significatif') : t('proc.nonSignificatif')}</span>
                              <div className="faint" style={{ fontSize: 12 }}>{d.reason} — {d.decideur}</div>
                            </>
                          ) : (
                            <form action={statuerAction} className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                              <input type="hidden" name="code" value={c.code} />
                              <span className="badge red">{t('proc.aStatuer')}</span>
                              <select name="significance" defaultValue="non_significatif">
                                <option value="non_significatif">{t('proc.nonSignificatif')}</option>
                                <option value="significatif">{t('proc.significatifCourt')}</option>
                              </select>
                              <input name="reason" placeholder={t('proc.motifEcrit')} style={{ minWidth: 160 }} />
                              <button className="btn">Statuer</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <h2>Entretiens {entretiens.some((i) => i.ecarts.some((e) => e.status === 'candidate')) && (
          <span className="badge red">{t('proc.ecartsAStatuer')}</span>
        )}</h2>
        {adaptateur === 'mock' ? (
          <div className="callout">
            {/* LA PROSE EXPLICATIVE SORT (règle générale) : le mode se DIT en
                un mot, il ne se raconte pas. */}
            <strong>{t('proc.analysteRejeu')}</strong>
          </div>
        ) : (
          <div className="callout">
            <strong>{t('proc.transcriptAnalystRealAi')}{process.env.OTTO_TRANSCRIPT_MODEL ?? 'claude-sonnet-5'}).</strong>{' '}
            {t('proc.analyseCandidats')}
          </div>
        )}
        <form action={entretienAction} className="mt" style={{ display: 'grid', gap: 6 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <input name="date" placeholder="AAAA-MM-JJ" style={{ width: 110 }} />
            <input name="sujet" placeholder={t('proc.sujet')} style={{ minWidth: 260, flex: 1 }} />
            <select name="support" defaultValue="notes">
              <option value="notes">{t('proc.notesSansEnr')}</option>
              <option value="enregistrement">enregistrement (consentements requis)</option>
            </select>
            <input name="retention" placeholder="conservation AAAA-MM-JJ" style={{ width: 170 }} />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <input name={`nom${i}`} placeholder={t('proc.participantNom', { i })} style={{ minWidth: 180 }} />
              <input name={`qualite${i}`} placeholder={t('proc.qualite')} style={{ minWidth: 140 }} />
              <label className="faint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" name={`consent${i}`} /> {t('proc.consent')}
              </label>
            </div>
          ))}
          <div><button className="btn">{t('proc.creerEntretien')}</button></div>
        </form>
      </div>

      {entretiens.map((itv) => (
        <div className="panel" key={itv.id}>
          <h2>
            {t('proc.interviewOf')} {itv.date} — {itv.sujet}{' '}
            <span className="badge gray">{itv.support === 'notes' ? 'notes' : 'enregistrement'}</span>
            {itv.ecarts.some((e) => e.status === 'candidate') && (
              <span className="badge red">{t('proc.nCandidats', { n: itv.ecarts.filter((e) => e.status === 'candidate').length })}</span>
            )}
          </h2>
          {/* QUI A CONSENTI, ET QUAND. Cette ligne avait DISPARU dans un balayage
              de prose : elle ressemblait à une explication, elle était le seul
              chemin de lecture d'un fait qu'on doit pouvoir montrer — sur quelle
              base cette personne a-t-elle été enregistrée, et jusqu'à quand le
              transcript est-il conservé (ADR-101, docs/14). Un fait stocké que
              plus aucun écran ne rend n'existe pas pour qui relit le dossier. */}
          <p className="faint">
            {itv.participants.map((x) => `${x.nom}${x.qualite ? ` (${x.qualite})` : ''}${x.consentement ? ` — ${t('proc.consentementLe')} ${x.quand ? x.quand.slice(0, 10) : '✓'}` : ''}`).join(' · ')}
            {itv.retentionUntil && <> · {t('proc.conservationJusquAu')} {itv.retentionUntil}</>}
          </p>
          {itv.comprehension ? (
            <p><strong>{t('proc.comprehension')}</strong> {itv.comprehension}</p>
          ) : (
            <form action={comprehensionAction} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
              <input type="hidden" name="itv" value={itv.id} />
              <textarea name="texte" rows={2} placeholder={t('proc.comprehensionLivrable')} style={{ flex: 1, minWidth: 240 }} />
              <button className="btn">{t('col.record')}</button>
            </form>
          )}

          {itv.support === 'enregistrement' && !itv.transcriptDepose && !itv.transcriptPurge && (
            <form action={transcriptAction} className="row mt" style={{ gap: 6, alignItems: 'flex-start' }}>
              <input type="hidden" name="itv" value={itv.id} />
              <textarea name="contenu" rows={3} placeholder={t('proc.collerTranscript')} style={{ flex: 1, minWidth: 240 }} />
              <button className="btn">{t('proc.deposerTranscript')}</button>
            </form>
          )}
          {itv.transcriptDepose && itv.ecarts.length === 0 && (
            <form action={analyserAction} className="row mt" style={{ gap: 6 }}>
              <input type="hidden" name="itv" value={itv.id} />
              <span className="faint">{t('proc.transcriptDepose')}</span>
              <button className="btn">{t('proc.confronter')}</button>
            </form>
          )}
          {itv.transcriptPurge && (
            <p className="faint">{t('proc.transcriptPurge')}</p>
          )}

          {itv.ecarts.length > 0 && (
            <div className="table-scroll mt">
              <table className="data">
                <thead><tr><th>#</th><th>{t('col.nature')}</th><th>{t('proc.ecartCandidat')}</th><th>{t('proc.decision')}</th></tr></thead>
                <tbody>
                  {itv.ecarts.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">{e.seq}</td>
                      <td><span className="badge gray">{LIBELLES_ECARTS[e.kind]}</span></td>
                      <td>
                        {e.description}
                        {e.citation && <div className="faint" style={{ fontSize: 12 }}>« {e.citation} »</div>}
                        {e.coutUsd > 0 && <div className="faint mono" style={{ fontSize: 11 }}>{t('atl.lectureCout', { c: e.coutUsd.toFixed(4) })}</div>}
                      </td>
                      <td>
                        {e.status === 'candidate' ? (
                          <form action={ecartAction} className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                            <input type="hidden" name="gap" value={e.id} />
                            <span className="badge red">{t('mot.candidate')}</span>
                            <button className="btn" name="decision" value="question">{t('proc.questionClient')}</button>
                            <button className="btn" name="decision" value="factor">{t('proc.proposerRegistre')}</button>
                            <input name="reason" placeholder={t('proc.motifEcarter')} style={{ minWidth: 140 }} />
                            <button className="btn" name="decision" value="dismissed">{t('proc.ecarter')}</button>
                          </form>
                        ) : (
                          <>
                            <span className="badge gray">
                              {e.status === 'question' ? t('proc.questionBrouillon')
                                : e.status === 'factor' ? t('proc.facteurPropose') : t('proc.ecarte')}
                            </span>
                            <div className="faint" style={{ fontSize: 12 }}>
                              {e.decisionReason ? `${e.decisionReason} — ` : ''}{e.decideur}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {entretiens.some((i) => i.transcriptDepose && i.retentionUntil) && (
        <div className="panel">
          <form action={purgeAction} className="row" style={{ gap: 6 }}>
            <span className="faint">
              {t('proc.aTranscriptIsPersonalDataWith')}
            </span>
            <button className="btn">{t('proc.purger')}</button>
          </form>
        </div>
      )}

    </div>
  );
}
