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
        <h2>Contrôle interne et processus {diff && diff.aStatuer.length > 0 && (
          <span className="badge red">{diff.aStatuer.length} changement(s) à statuer</span>
        )}</h2>
        <p className="faint">
          Le processus vit ici en DONNÉES STRUCTURÉES — étapes, acteurs, systèmes, entrées/sorties,
          contrôles rattachés — et le diagramme est GÉNÉRÉ. Le flowchart fourni par le client est une
          pièce de corroboration, pas la source. La comparaison N/N-1 est une différence exacte :
          chaque changement se statue, et un changement significatif propose un facteur de risque au
          registre — une personne confirme là-bas.
        </p>
        <form action={importAction} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select name="exercice" defaultValue="n">
            <option value="n">version N (exercice audité)</option>
            <option value="n1">version N-1 (reprise)</option>
          </select>
          <input type="file" name="fichier" style={{ maxWidth: 240 }} />
          <label className="faint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" name="remplacer" /> confirmer le remplacement
          </label>
          <button className="btn">Importer la description</button>
        </form>
        <p className="faint mono" style={{ marginBottom: 0 }}>
          {(['n1', 'n'] as const).map((ex) => versions[ex]
            ? `${NOM_EXERCICE[ex]} : ${versions[ex]!.filename} (${versions[ex]!.etapes.length} étapes, ${versions[ex]!.controles.length} contrôles)`
            : `${NOM_EXERCICE[ex]} : non décrite`).join(' · ')}
        </p>
      </div>

      {montre && diagramme && (
        <div className="panel">
          <h2>Diagramme — {montre.nom} ({NOM_EXERCICE[montre.exercice]})</h2>
          <p className="faint">Généré depuis les données ci-dessous ; il n&apos;existe pas d&apos;autre source.</p>
          <div className="table-scroll">
            <svg width={diagramme.w} height={diagramme.h} viewBox={`0 0 ${diagramme.w} ${diagramme.h}`} role="img"
              aria-label={`Diagramme du processus ${montre.nom}`} style={{ maxWidth: 'none' }}>
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
              <thead><tr><th>Étape</th><th>Libellé</th><th>Acteur</th><th>Système</th><th>Entrées</th><th>Sorties</th></tr></thead>
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
              <thead><tr><th>Contrôle</th><th>Étape</th><th>Libellé</th><th>Fréquence</th><th>Propriétaire</th></tr></thead>
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
          <h2>Différence N / N-1 — exacte, champ par champ</h2>
          <p className="faint">
            Étape supprimée, contrôle dont le propriétaire a changé, système remplacé : la différence
            est CALCULÉE depuis les deux versions, jamais devinée sur deux images. Chaque changement
            se statue par écrit ; « significatif » propose un facteur de risque au registre.
          </p>
          {diff.changements.length === 0 && <p className="faint">Aucun changement entre N-1 et N.</p>}
          {diff.changements.length > 0 && (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Changement</th><th>Avant (N-1)</th><th>Après (N)</th><th>Décision</th></tr></thead>
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
                              <span className="badge gray">{d.significance === 'significatif' ? 'significatif — facteur proposé au registre' : 'non significatif'}</span>
                              <div className="faint" style={{ fontSize: 12 }}>{d.reason} — {d.decideur}</div>
                            </>
                          ) : (
                            <form action={statuerAction} className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                              <input type="hidden" name="code" value={c.code} />
                              <span className="badge red">à statuer</span>
                              <select name="significance" defaultValue="non_significatif">
                                <option value="non_significatif">non significatif</option>
                                <option value="significatif">significatif</option>
                              </select>
                              <input name="reason" placeholder="motif écrit" style={{ minWidth: 160 }} />
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
          <span className="badge red">écarts candidats à statuer</span>
        )}</h2>
        <p className="faint">
          Participants, date, support, compréhension documentée. Enregistrer exige le consentement
          EXPLICITE de chaque participant — tracé — et une durée de conservation ; sans
          enregistrement, les notes saisies à la main suffisent et le module fonctionne en entier
          (docs/14_ENTRETIENS_CONSENTEMENT.md).
        </p>
        {adaptateur === 'mock' ? (
          <div className="callout">
            <strong>Analyste de transcript : REJEU (démonstration).</strong> L&apos;analyse retrouve les
            écarts enregistrés du jeu de données ; un transcript inconnu est refusé en le disant.
            Le mode IA réelle (<span className="mono">npm run demo:ia</span>) analyse un entretien
            jamais vu, avec garde de budget et journalisation ai_run.
          </div>
        ) : (
          <div className="callout">
            <strong>Analyste de transcript : IA RÉELLE ({process.env.OTTO_TRANSCRIPT_MODEL ?? 'claude-sonnet-5'}).</strong>{' '}
            L&apos;analyse confronte le discours à la documentation et produit des écarts CANDIDATS —
            jamais une conclusion. Chaque lecture est journalisée (ai_run), coûte de l&apos;argent réel,
            et la garde de budget refuse proprement au plafond.
          </div>
        )}
        <form action={entretienAction} className="mt" style={{ display: 'grid', gap: 6 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <input name="date" placeholder="AAAA-MM-JJ" style={{ width: 110 }} />
            <input name="sujet" placeholder="sujet — ex. Cycle ventes, compréhension du processus" style={{ minWidth: 260, flex: 1 }} />
            <select name="support" defaultValue="notes">
              <option value="notes">notes (sans enregistrement)</option>
              <option value="enregistrement">enregistrement (consentements requis)</option>
            </select>
            <input name="retention" placeholder="conservation AAAA-MM-JJ" style={{ width: 170 }} />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <input name={`nom${i}`} placeholder={`participant ${i} — nom`} style={{ minWidth: 180 }} />
              <input name={`qualite${i}`} placeholder="qualité" style={{ minWidth: 140 }} />
              <label className="faint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" name={`consent${i}`} /> consent à l&apos;enregistrement
              </label>
            </div>
          ))}
          <div><button className="btn">Créer l&apos;entretien</button></div>
        </form>
      </div>

      {entretiens.map((itv) => (
        <div className="panel" key={itv.id}>
          <h2>
            Entretien du {itv.date} — {itv.sujet}{' '}
            <span className="badge gray">{itv.support === 'notes' ? 'notes' : 'enregistrement'}</span>
            {itv.ecarts.some((e) => e.status === 'candidate') && (
              <span className="badge red">{itv.ecarts.filter((e) => e.status === 'candidate').length} candidat(s)</span>
            )}
          </h2>
          <p className="faint">
            {itv.participants.map((p) => `${p.nom}${p.qualite ? ` (${p.qualite})` : ''}${p.consentement ? ` — consentement ${p.quand ? p.quand.slice(0, 10) : '✓'}` : ''}`).join(' · ')}
            {itv.retentionUntil && <> · conservation jusqu&apos;au {itv.retentionUntil}</>}
          </p>

          {itv.comprehension ? (
            <p><strong>Compréhension documentée.</strong> {itv.comprehension}</p>
          ) : (
            <form action={comprehensionAction} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
              <input type="hidden" name="itv" value={itv.id} />
              <textarea name="texte" rows={2} placeholder="la compréhension documentée — le livrable de l'entretien" style={{ flex: 1, minWidth: 240 }} />
              <button className="btn">Consigner</button>
            </form>
          )}

          {itv.support === 'enregistrement' && !itv.transcriptDepose && !itv.transcriptPurge && (
            <form action={transcriptAction} className="row mt" style={{ gap: 6, alignItems: 'flex-start' }}>
              <input type="hidden" name="itv" value={itv.id} />
              <textarea name="contenu" rows={3} placeholder="coller le transcript de l'enregistrement" style={{ flex: 1, minWidth: 240 }} />
              <button className="btn">Déposer le transcript</button>
            </form>
          )}
          {itv.transcriptDepose && itv.ecarts.length === 0 && (
            <form action={analyserAction} className="row mt" style={{ gap: 6 }}>
              <input type="hidden" name="itv" value={itv.id} />
              <span className="faint">Transcript déposé.</span>
              <button className="btn">Confronter le discours à la documentation</button>
            </form>
          )}
          {itv.transcriptPurge && (
            <p className="faint">Transcript purgé à l&apos;échéance de conservation — les écarts et la compréhension restent.</p>
          )}

          {itv.ecarts.length > 0 && (
            <div className="table-scroll mt">
              <table className="data">
                <thead><tr><th>#</th><th>Nature</th><th>Écart candidat</th><th>Décision</th></tr></thead>
                <tbody>
                  {itv.ecarts.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">{e.seq}</td>
                      <td><span className="badge gray">{LIBELLES_ECARTS[e.kind]}</span></td>
                      <td>
                        {e.description}
                        {e.citation && <div className="faint" style={{ fontSize: 12 }}>« {e.citation} »</div>}
                        {e.coutUsd > 0 && <div className="faint mono" style={{ fontSize: 11 }}>lecture {e.coutUsd.toFixed(4)} $</div>}
                      </td>
                      <td>
                        {e.status === 'candidate' ? (
                          <form action={ecartAction} className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                            <input type="hidden" name="gap" value={e.id} />
                            <span className="badge red">candidat</span>
                            <button className="btn" name="decision" value="question">Question au client</button>
                            <button className="btn" name="decision" value="factor">Proposer au registre</button>
                            <input name="reason" placeholder="motif (pour écarter)" style={{ minWidth: 140 }} />
                            <button className="btn" name="decision" value="dismissed">Écarter</button>
                          </form>
                        ) : (
                          <>
                            <span className="badge gray">
                              {e.status === 'question' ? 'question au client (brouillon)'
                                : e.status === 'factor' ? 'facteur proposé au registre' : 'écarté'}
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
              Un transcript est une donnée personnelle à durée de vie limitée : à l&apos;échéance de
              conservation, il se purge — les écarts et la compréhension restent au dossier.
            </span>
            <button className="btn">Purger les transcripts échus</button>
          </form>
        </div>
      )}

      <p className="faint">
        Les facteurs proposés se confirment au <Link href={`/eng/${id}/risk`}>registre des risques</Link> ;
        les questions partent par les <Link href={`/eng/${id}/requests`}>demandes</Link> après approbation.
      </p>
    </div>
  );
}
