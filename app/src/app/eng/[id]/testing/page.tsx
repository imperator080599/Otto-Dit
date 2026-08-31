import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { extractAll } from '@/lib/services/extraction/ladder';
import { runMatching } from '@/lib/services/matching';
import { startVerificationRun, currentVerificationRun, submitBlindCheck } from '@/lib/services/verification';
import {
  computeSampleEvaluation, concludeEvaluation, currentEvaluation, conclusionGate,
  recordEvaluationResponse, evaluationResponses, type ResponseKind,
} from '@/lib/services/evaluation';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { lignesAtelier } from '@/lib/services/workpapers/atelier';
import { depenseCumuleeUsd, plafondUsd } from '@/lib/services/extraction/budget';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { colonnes as colonnesGabarit } from '@/lib/methodology/catalogue';
import { Atelier } from './atelier';
import { attesterAction, clarifierLotAction } from './actions-atelier';

export default async function TestingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; item?: string }>;
}) {
  const { id } = await params;
  const { erreur, item } = await searchParams;
  await requireMember(id);
  /* L'ATELIER (ADR-104) : chaque ligne avec sa pièce, sa comparaison, son
     motif, sa provenance, et la ligne de papier qu'elle produira. */
  const { lignes, premierNonFini } = await lignesAtelier(id);
  /* LE COMPTEUR SUIT L'ÉCHANTILLON, pas le dossier entier : une extraction en
     attente sur une pièce dont la ligne a QUITTÉ le tirage (re-tirage après
     grand livre définitif) n'est l'obligation de personne — un badge qui
     l'annoncerait promettrait un travail que cet écran ne peut pas montrer.
     Elle ressurgit ici si sa ligne revient dans un tirage. Et il compte les
     PIÈCES en attente, pas les statuts : une ligne déjà en écart peut porter
     une lecture à attester — l'écart ne l'efface pas. */
  const pending = lignes.filter((l) => l.evidences.some((e) => e.extraction?.statut === 'pending_verify'));
  const cat = await catalogueDeLaMission(id).catch(() => null);
  const colonnesEch = cat ? colonnesGabarit(cat, 'substantif', 'echantillon').map((c) => ({ champ: c.champ, titre: c.titre })) : [];
  const verifRun = await currentVerificationRun(id);
  const evaluation = await currentEvaluation(id);
  const gate = await conclusionGate(id);
  /* LA RÉPONSE AU DÉPASSEMENT — elle n'avait AUCUN écran. Le service la
     réclame avant toute conclusion quand les anomalies dépassent l'anomalie
     tolérable, et rien dans l'application ne permettait de l'enregistrer : la
     seule façon de conclure était d'appeler le service depuis du code. Un
     verrou qu'on ne peut lever que hors du produit ferme le produit. */
  const reponses = evaluation ? await evaluationResponses(evaluation.id) : [];

  async function extractAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await extractAll(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function matchAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await runMatching(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
      revalidatePath(`/eng/${id}/exceptions`);
    });
  }
  async function startVerifRun() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await startVerificationRun(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function blindAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await submitBlindCheck({
        verificationRunId: String(formData.get('run_id')),
        sampleItemId: String(formData.get('sample_item_id')),
        verifierId: user.id,
        blind: {
          totalNetCents: Math.round(Number(formData.get('net')) * 100),
          invoiceDate: String(formData.get('date')),
        },
        escalationOnDisagree: 'expand_subsample',
      });
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function evalAction() {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await computeSampleEvaluation(id, user.id);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function repondreAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await recordEvaluationResponse(
        String(formData.get('evaluation_id')), user.id,
        String(formData.get('kind')) as ResponseKind,
        String(formData.get('rationale') ?? ''),
      );
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function concludeAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/testing`, async () => {
      const { user } = await requireMember(id);
      await concludeEvaluation(String(formData.get('evaluation_id')), user.id, String(formData.get('basis') ?? ''));
      revalidatePath(`/eng/${id}/testing`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Testing workbench — extraction → vouching → verification → evaluation</h2>
          <span className="row">
            <form action={extractAction}><button className="btn secondary">Run extraction ladder</button></form>
            <form action={matchAction}><button className="btn">Run vouching (L0)</button></form>
          </span>
        </div>
        <p className="faint">
          Ladder: Factur-X XML (exact) → PDF text layer (deterministic) → OCR/LLM adapter
          (recorded — always human-verified, ADR-012) → human. Vouching is deterministic
          with pack tolerances; exceptions land in the exceptions tab.
        </p>
        {(process.env.OTTO_OCR_ADAPTER ?? 'mock') === 'anthropic' && (
          /* MODE « IA RÉELLE » (ADR-105) : l'échelon OCR lit avec le modèle.
             L'écran DIT lequel tourne, ce que ça a coûté et où est le plafond
             — un mode payant qui ne s'annonce pas est un rejeu qui ment dans
             l'autre sens. Rien d'autre ne change : mêmes échelons gratuits
             d'abord, même file d'attestation humaine (L2), même provenance. */
          <div className="callout">
            <strong>Adaptateur OCR/LLM : IA RÉELLE ({process.env.OTTO_EXTRACT_MODEL ?? 'claude-opus-5'}).</strong>{' '}
            Les échelons XML et couche texte lisent d&apos;abord, gratuitement ; une pièce qu&apos;ils ne
            savent pas lire part au modèle — chaque lecture est journalisée (ai_run) et coûte de
            l&apos;argent réel. Dépense depuis cette base : <strong>{(await depenseCumuleeUsd()).toFixed(4)} $</strong>{' '}
            sur un plafond de {plafondUsd().toFixed(2)} $ — au plafond, la lecture suivante est refusée
            proprement. Rien n&apos;entre au dossier sans attestation humaine (L2).
          </div>
        )}
        {(process.env.OTTO_OCR_ADAPTER ?? 'mock') !== 'anthropic' && (
          /* L'HONNÊTETÉ DE LA DÉMONSTRATION (ADR-102) : ne jamais laisser
             croire qu'une pièce est lue par un modèle quand la donnée est
             rejouée. Les deux premiers échelons lisent RÉELLEMENT le fichier
             (déterministes, gratuits) ; l'échelon OCR/LLM, lui, REJOUE des
             extractions enregistrées du jeu synthétique — aucun appel, aucun
             centime. En production, un modèle lit au même endroit, avec la
             même file de vérification humaine. */
          <div className="callout warn">
            <strong>Adaptateur OCR/LLM : REJEU (démonstration).</strong> Sur cet écran, les échelons
            XML et couche texte lisent réellement le fichier de la pièce (déterministes) ; l&apos;échelon
            OCR/LLM ne lit rien — il REJOUE des extractions enregistrées du jeu synthétique, sans
            appel à un modèle et sans dépense. En production, un modèle lit à cet endroit précis,
            derrière la même file de vérification humaine (L2).
          </div>
        )}
      </div>

      {/* L'ATELIER — la pièce et la ligne côte à côte (point 10, ADR-104).
          La file d'attestation et le tableau de vouching vivaient en deux
          panneaux séparés de la ligne : ils sont désormais la MÊME chose,
          ligne par ligne, l'attestation emportant les corrections tapées. */}
      <div className="panel">
        <h2>
          L'échantillon, ligne par ligne{' '}
          {pending.length > 0 && <span className="badge amber">{pending.length} à attester</span>}
        </h2>
        <p className="faint">
          ↑/↓ change de ligne · Entrée atteste · la pièce est à droite, la comparaison sur la
          ligne, le motif de sélection sur chaque élément · cases à cocher pour les actions en
          lot · vous reprenez là où vous en étiez.
        </p>
        <Atelier
          engId={id}
          lignes={lignes}
          premierNonFini={premierNonFini}
          itemInitial={item ?? null}
          colonnes={colonnesEch}
          attester={attesterAction}
          clarifierLot={clarifierLotAction}
        />
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="reexecution">Re-exécution à l'aveugle (ADR-012.3)</h2>
            {!verifRun && (
              <details>
                <summary className="repli-action">Lancer la re-exécution</summary>
                <form action={startVerifRun} className="mt"><button className="btn secondary small">Draw subsample</button></form>
              </details>
            )}
          </div>
          {!verifRun ? (
            <p className="muted">Seeded, reproducible draw over machine-passed items; the verifier re-performs blind (no machine result shown) and agreement is computed.</p>
          ) : (
            <>
              <p className="faint">
                {verifRun.drawn_count} of {verifRun.machine_passed_count} machine-passed items — seed{' '}
                <span className="mono">{verifRun.seed}</span>
              </p>
              <table className="data">
                <thead><tr><th>Piece</th><th className="num">GL amount</th><th>Blind re-performance</th></tr></thead>
                <tbody>
                  {verifRun.items.map((it) => (
                    <tr key={it.sample_item_id}>
                      <td className="mono">{it.piece_ref}<div className="faint">{it.aux_label}</div></td>
                      <td className="num">{fmtEur(numToCents(it.amount), 'fr')}</td>
                      <td>
                        {it.result ? (
                          <span className={`badge ${it.result === 'agree' ? 'green' : 'red'}`}>{it.result}</span>
                        ) : (
                          <form action={blindAction} className="row">
                            <input type="hidden" name="run_id" value={verifRun.id} />
                            <input type="hidden" name="sample_item_id" value={it.sample_item_id} />
                            <input type="number" name="net" step="0.01" placeholder="Total HT (€)" style={{ width: 110 }} required />
                            <input type="date" name="date" required />
                            <button className="btn small">Submit blind</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="faint">Open the document from the evidence inbox to re-perform; the machine result stays hidden until submission.</p>
            </>
          )}
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Sample evaluation (vs TE)</h2>
            <details>
              <summary className="repli-action">Recalculer</summary>
              <form action={evalAction} className="mt"><button className="btn secondary small">Recompute</button></form>
            </details>
          </div>
          {!evaluation ? (
            <p className="muted">Known + projected misstatement vs tolerable misstatement (kernel arithmetic, Gate 2).</p>
          ) : (
            <>
              <div className="grid cols-2">
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.known_misstatement), 'fr')}</span><span className="l">Known misstatement</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.projected_misstatement), 'fr')}</span><span className="l">Projected ({evaluation.projection_method})</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.untested_amount), 'fr')}</span><span className="l">Untested remainder</span></div>
                <div className="kpi"><span className="v">{fmtEur(numToCents(evaluation.te_amount), 'fr')}</span><span className="l">Tolerable misstatement</span></div>
              </div>
              {reponses.length > 0 ? (
                <div className="callout mt">
                  <strong>Réponse au dépassement de l’anomalie tolérable :</strong>{' '}
                  {reponses.map((r) => r.kind).join(', ')}
                  {reponses[0]?.rationale && <p className="faint">{reponses[0].rationale}</p>}
                </div>
              ) : (
                <form action={repondreAction} className="mt stack">
                  <input type="hidden" name="evaluation_id" value={evaluation.id} />
                  <p className="faint">
                    Quand les anomalies relevées dépassent l’anomalie tolérable, l’échantillon ne
                    fournit plus une base raisonnable de conclusion sur la population. Le produit
                    refuse la conclusion tant que la <strong>réponse</strong> n’est pas écrite —
                    étendre les travaux, réviser la stratégie, ou conclure en le justifiant.
                  </p>
                  <p className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <select name="kind" defaultValue="revise_strategy">
                      <option value="extend_testing">étendre les travaux</option>
                      <option value="revise_strategy">réviser la stratégie</option>
                      <option value="conclude_with_justification">conclure en le justifiant</option>
                    </select>
                    <input name="rationale" placeholder="motif — obligatoire" style={{ flex: 1, minWidth: 260 }} />
                    <button className="btn secondary small">Enregistrer la réponse</button>
                  </p>
                </form>
              )}
              {evaluation.status === 'draft' ? (
                <form action={concludeAction} className="mt">
                  <input type="hidden" name="evaluation_id" value={evaluation.id} />
                  <textarea name="basis" placeholder="Conclusion basis (L4 — human judgment, required)" required />
                  <button className="btn mt">Record conclusion (L4)</button>
                </form>
              ) : (
                <div className="callout green mt">Concluded: {evaluation.conclusion_basis}</div>
              )}
            </>
          )}
          <div className={`callout ${gate.ok ? 'green' : 'warn'} mt`}>
            Conclusion gate: {gate.ok ? 'OPEN — all exceptions dispositioned and evaluation concluded' : `${gate.openExceptions} exception(s) undispositioned${gate.evaluationConcluded ? '' : '; evaluation not concluded'}`}
            {' — '}<Link href={`/eng/${id}/exceptions`}>exceptions</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
