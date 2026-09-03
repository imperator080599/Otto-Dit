import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import {
  proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample,
  lignesSortiesDuTirage, statuerSortie,
} from '@/lib/services/sampling';
import { generatePbcFromSample } from '@/lib/services/requests';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';

const REASON_BADGE: Record<string, string> = { high_value: 'blue', risk_flag: 'amber', random: 'gray' };

export default async function SamplingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  await requireMember(id);
  const sample = await currentRevenueSample(id);
  const sorties = await lignesSortiesDuTirage(id);

  async function proposeAction() {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await proposeRevenueSample(id, user.id);
      revalidatePath(`/eng/${id}/sampling`);
    });
  }
  async function validateAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      const edits: { coverageCapCents?: number; randomSize?: number; seed?: string } = {};
      const cap = String(formData.get('coverage_cap') ?? '');
      const size = String(formData.get('random_size') ?? '');
      const seed = String(formData.get('seed') ?? '');
      if (cap) edits.coverageCapCents = Math.round(Number(cap) * 100);
      if (size) edits.randomSize = Number(size);
      if (seed) edits.seed = seed;
      await validateSampleParams(String(formData.get('sample_id')), user.id, edits);
      revalidatePath(`/eng/${id}/sampling`);
    });
  }
  async function drawAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await drawRevenueSample(String(formData.get('sample_id')), user.id);
      revalidatePath(`/eng/${id}/sampling`);
    });
  }
  async function pbcAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await generatePbcFromSample(id, String(formData.get('sample_id')), user.id);
      redirect(`/eng/${id}/requests`);
    });
  }

  async function statuerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/sampling`, async () => {
      const { user } = await requireMember(id);
      await statuerSortie({
        sampleItemId: String(formData.get('ligne')),
        decision: 'sans_suite',
        /* LE MOTIF N'EST PAS `required` DANS LE NAVIGATEUR, ET C'EST VOULU
           (ADR-091). Un champ que le navigateur refuse d'envoyer donne un
           harnais qui croit avoir éprouvé une règle du serveur alors qu'il n'a
           éprouvé que le navigateur. C'est le serveur qui refuse (TIRAGE-03),
           et c'est son refus qu'on lit à l'écran. */
        motif: String(formData.get('motif') ?? ''),
        userId: user.id,
      });
      revalidatePath(`/eng/${id}/sampling`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('samp.revenueSamplingProposeL3ValidateDraw')}</h2>
          {!sample && (
            <form action={proposeAction}><button className="btn">{t('samp.proposeParameters')}</button></form>
          )}
        </div>
        {!sample ? (
          <p className="muted">{t('samp.noSamplingYetPrerequisitesReconciliation')}</p>
        ) : (
          <>
            <p>
              <span className={`badge ${sample.status === 'drawn' ? 'green' : sample.status === 'validated' ? 'blue' : 'amber'}`}>{sample.status}</span>{' '}
              {t('samp.populationLignes', { n: sample.population_size, montant: fmtEur(numToCents(sample.population_amount), 'fr') })}{' '}
              {t('samp.empreinte')} <span className="mono faint">{sample.population_hash.slice(0, 24)}…</span>
            </p>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{sample.rationale}</p>
            {sample.status === 'proposed' && (
              <form action={validateAction} className="row">
                <input type="hidden" name="sample_id" value={sample.id} />
                <label className="fld"><span>{t('samp.coverageCap')}</span>
                  <input type="number" name="coverage_cap" defaultValue={(sample.params.coverageCapCents / 100).toFixed(0)} style={{ width: 110 }} />
                </label>
                <label className="fld"><span>{t('samp.randomSize')}</span>
                  <input type="number" name="random_size" defaultValue={sample.params.randomSize} style={{ width: 70 }} />
                </label>
                <label className="fld"><span>{t('samp.seedDeterministic')}</span>
                  <input type="text" name="seed" defaultValue={sample.params.seed} style={{ width: 160 }} />
                </label>
                <button className="btn">{t('samp.validateParametersL3')}</button>
              </form>
            )}
            {sample.status === 'validated' && (
              <form action={drawAction}>
                <input type="hidden" name="sample_id" value={sample.id} />
                <button className="btn">{t('samp.drawSampleDeterministic')}</button>
              </form>
            )}
            {sample.status === 'drawn' && (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>Selected items ({sample.items.length}{t('samp.coverage')} {fmtEur(numToCents(sample.coverage_amount ?? '0'), 'fr')}</h3>
                  <form action={pbcAction}>
                    <input type="hidden" name="sample_id" value={sample.id} />
                    <button className="btn">{t('samp.generatePbcRequest')}</button>
                  </form>
                </div>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr><th>{t('samp.reason')}</th><th>{t('col.entry')}</th><th>{t('col.date')}</th><th>{t('col.account')}</th><th>{t('col.piece')}</th><th>{t('col.counterparty')}</th><th className="num">{t('col.amount')}</th><th>{t('col.flags')}</th></tr>
                    </thead>
                    <tbody>
                      {sample.items.map((it) => (
                        <tr key={it.id}>
                          <td><span className={`badge ${REASON_BADGE[it.selection_reason]}`}>{it.selection_reason}</span></td>
                          <td className="mono">{it.entry_no}</td>
                          <td>{it.entry_date}</td>
                          <td className="mono">{it.account_no}</td>
                          <td className="mono">{it.piece_ref}</td>
                          <td>{it.aux_label}</td>
                          <td className="num">{fmtEur(numToCents(it.amount), 'fr')}</td>
                          <td>{(it.flags ?? []).map((f) => <span key={f} className="badge amber" style={{ marginRight: 3 }}>{f}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── CE QUI EST SORTI DU TIRAGE, ET QUI NE DISPARAÎT PAS (ADR-133) ──
          Un re-tirage — après le ré-import du grand livre définitif, c'est le
          cas normal — laisse derrière lui des lignes déjà travaillées. Elles
          sont ICI, avec ce qu'elles portent, jusqu'à ce qu'une personne écrive
          ce qu'on en fait. */}
      {sorties.length > 0 && (
        <div className="panel" data-sorties-du-tirage>
          <h3 style={{ marginTop: 0 }}>{t('samp.sortiesTitre')}</h3>
          <p className="faint">{t('samp.sortiesAide')}</p>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('col.piece')}</th><th className="num">{t('col.amount')}</th>
                  <th>{t('samp.sortiesTravail')}</th><th>{t('samp.sortiesDecision')}</th>
                </tr>
              </thead>
              <tbody>
                {sorties.map((l) => (
                  <tr key={l.id} data-sortie={l.id}>
                    <td className="mono">{l.piece}</td>
                    <td className="num">{fmtEur(numToCents(l.montant), 'fr')}</td>
                    <td className="faint">
                      {t('samp.sortiesPorte', {
                        pieces: l.travail.pieces, ecarts: l.travail.ecarts, cellules: l.travail.cellules,
                      })}
                    </td>
                    <td>
                      {l.decision ? (
                        <span data-sortie-statuee={l.decision.quoi}>
                          <span className="badge green">{t('samp.sortieSansSuite')}</span>{' '}
                          {l.decision.motif}
                          <div className="faint">{t('samp.sortieQui', { qui: l.decision.qui, quand: l.decision.quand })}</div>
                        </span>
                      ) : (
                        <form action={statuerAction} className="row">
                          <input type="hidden" name="ligne" value={l.id} />
                          <input type="text" name="motif" placeholder={t('samp.sortieMotif')} style={{ minWidth: 260 }} />
                          <button className="btn small">{t('samp.sortieStatuer')}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
