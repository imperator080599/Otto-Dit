import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { listExceptions, draftClarificationRequest, resolveException, escalateToMisstatement, dismissMisstatementAsAnomaly, constatEtPointAction, assignerProprietairePointAction } from '@/lib/services/matching';
import { contactsDisponibles } from '@/lib/services/reunions';
import { frameworkSet } from '@/lib/services/fsli';
import { validatedThresholds } from '@/lib/services/materiality';
import { q } from '@/lib/db/client';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents } from '@/lib/util/num';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { notesPourEcran } from '@/lib/services/workpapers/lifecycle';
import { Annotable } from '@/app/annotable';
import { poserNoteAncreeAction, repondreNoteAction, transitionNoteAction } from '../notes/actions';
import { tr } from '@/lib/i18n';
import { Repli } from '@/app/repli';

const STATUS_BADGE: Record<string, string> = {
  open: 'red', clarification_requested: 'amber', explained: 'blue', resolved: 'green', escalated: 'violet',
};

/* MÊME MAP que requests/[rid]/page.tsx::ITEM_BADGE (request_item.status) — recopiée plutôt
   qu'importée : ce fichier n'a pas d'export partagé pour cette constante, et H-2 slice 1 est
   une lecture, pas une raison d'introduire un module de constantes partagées non demandé. */
const ITEM_BADGE: Record<string, string> = { pending: 'gray', uploaded: 'blue', complete: 'green', na: 'gray' };

export default async function ExceptionsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  const membreCourant = await requireMember(id);
  /* QUI REGARDE, ET CE QU'IL PEUT (1.3, ADR-028) : seul un réviseur de la
     mission clôt une note, et jamais l'auteur. Le panneau latéral n'invente
     pas la règle — il reçoit la réponse du serveur et, quand le geste n'est
     pas offert, il écrit pourquoi. */
  const moi = { id: membreCourant.user.id, peutClore: ['manager', 'partner'].includes(membreCourant.membership.eng_role) };
  const fs = await frameworkSet(id);
  const isSox = fs.assurance_packs.includes('pcaob-sox');
  const exceptions = await listExceptions(id);
  const constatsEtActions = await constatEtPointAction(id);
  const contactsPourAssignation = await contactsDisponibles(id);
  /* LES ANCRES DES ÉCARTS (ADR-102) : « pourquoi as-tu considéré celui-ci
     comme résolu ? » est la note de revue la plus fréquente en pratique.
     L'identité métier d'un écart : sa taxonomie + l'écriture qui le porte
     (natural_key) quand il en a une, son id sinon. */
  const marquesNotes = await notesPourEcran(id);
  const identitesEcarts = new Map(
    (await q<{ id: string; aref: string; piece: string | null; item: string | null }>(
      `select x.id::text id,
              case when g.natural_key is not null then x.taxonomy_code || '|' || g.natural_key
                   else 'id|' || x.id::text end aref,
              coalesce(g.piece_ref, g.entry_no) piece,
              si.id::text item
       from exception x
       left join sample_item si on si.id = x.sample_item_id
       left join gl_entry g on g.id = si.unit_id
       where x.engagement_id = $1`,
      [id],
    )).map((r) => [r.id, r]),
  );
  const membresNotes = await q<{ id: string; nom: string }>(
    `select u.id::text id, u.name nom from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null order by u.name`,
    [id],
  );
  const misstatements = await q<{
    id: string; kind: string; amount: string; corrected: boolean; status: string; notes: string | null;
    dismissed_reason: string | null; dismissed_evidence_filename: string | null; dismissed_by_name: string | null;
    dismissed_at: string | null; rolled_into_projection: boolean;
  }>(
    `select m.id, m.kind, m.amount::text, m.corrected, m.status, m.notes,
            m.dismissed_reason, e.filename dismissed_evidence_filename, u.name dismissed_by_name,
            m.dismissed_at::text, m.rolled_into_projection
     from misstatement m
     left join evidence e on e.id = m.dismissed_evidence_id
     left join app_user u on u.id = m.dismissed_by
     where m.engagement_id = $1 order by m.created_at`,
    [id],
  );
  /* EXTRAP-03 (mandat 2026-09-14, §1.4) : « L'écran affiche EN PERMANENCE le compte d'anomalies
     écartées sur le dossier — un compte qui monte est en soi un signal. » PERMANENCE veut dire
     visible même à zéro, jamais replié derrière une section qui n'apparaît que si des anomalies
     existent déjà (ce panneau-ci vit hors du `misstatements.length > 0` plus bas). */
  const dismissedCount = misstatements.filter((m) => m.status === 'dismissed').length;
  /* §1.5 (mandat) : « évaluation contre la matérialité ». Le connu déjà comptabilisé et non corrigé
     — les anomalies écartées (EXTRAP-03) ne comptent JAMAIS ici : ISA 530 §5(e) les définit comme
     démontrablement NON représentatives, donc hors de l'évaluation de la population.
     `rolled_into_projection` (migration 0163, revue hostile voix 2, finding HIGH reproduit en
     exécution) EXCLUT les lignes BRUTES de la strate sondée déjà REPRÉSENTÉES par leur propre
     ligne 'projected' — sans ce filtre, le même écart se sommait deux fois (une fois brut, une
     fois extrapolé), mesuré à 175 000 c€ d'écart contre known+projected (testing/page.tsx) sur
     un cas réel. La ligne 'projected' elle-même n'est jamais `rolled_into_projection` — elle
     reste comptée, une seule fois. */
  const seuils = await validatedThresholds(id);
  const totalNonCorrigeCents = misstatements
    .filter((m) => !m.corrected && m.status !== 'dismissed' && !m.rolled_into_projection)
    .reduce((s, m) => s + numToCents(m.amount), 0);
  const evidencesPourEcartement = await q<{ id: string; filename: string; doc_type: string | null }>(
    `select id, filename, doc_type from evidence where engagement_id = $1 and quarantined = false order by filename`,
    [id],
  );

  async function draftAction() {
    'use server';
    return executer(`/eng/${id}/exceptions`, async () => {
      const { user } = await requireMember(id);
      const rid = await draftClarificationRequest(id, user.id);
      redirect(`/eng/${id}/requests/${rid}`);
    });
  }
  async function resolveAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/exceptions`, async () => {
      const { user } = await requireMember(id);
      const link = String(formData.get('corroboration') ?? '');
      const [kind, refId] = link.split(':');
      await resolveException(String(formData.get('exception_id')), user.id, {
        explanation: String(formData.get('explanation') ?? ''),
        conclusion: String(formData.get('conclusion') ?? ''),
        disposition: String(formData.get('disposition') ?? 'no_misstatement') as 'corrected' | 'no_misstatement' | 'compensated' | 'already_accumulated',
        corroboration: kind === 'gl' ? { glEntryId: refId } : { evidenceId: refId },
        /* LA CONSTATATION QUI DÉPASSE L'ÉLÉMENT TESTÉ. Renseignée, elle lève un
           facteur PROPOSÉ au registre, visant d'autres sections. C'est le chemin
           par lequel une constatation CIRCULE — il manquait, et `raiseFactor`
           existait sans que rien ne l'appelle. */
        factRaised: String(formData.get('fait') ?? '').trim()
          ? {
              nature: String(formData.get('fait_nature') ?? 'controle'),
              description: String(formData.get('fait')),
              targets: String(formData.get('fait_postes') ?? '')
                .split(',').map((p) => p.trim()).filter(Boolean)
                .map((fsli) => ({ fsli, assertions: ['realite'] })),
            }
          : undefined,
      });
      revalidatePath(`/eng/${id}/exceptions`);
    });
  }
  async function escalateAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/exceptions`, async () => {
      const { user } = await requireMember(id);
      await escalateToMisstatement(String(formData.get('exception_id')), user.id, {
        kind: String(formData.get('kind')) as 'factual' | 'judgmental' | 'projected',
        amountCents: Math.round(Number(formData.get('amount')) * 100),
        corrected: formData.get('corrected') === 'on',
        notes: String(formData.get('notes') ?? '') || undefined,
      });
      revalidatePath(`/eng/${id}/exceptions`);
      revalidatePath(`/eng/${id}/testing`);
    });
  }
  async function dismissAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/exceptions`, async () => {
      const { user } = await requireMember(id);
      await dismissMisstatementAsAnomaly(String(formData.get('misstatement_id')), user.id, {
        reason: String(formData.get('reason') ?? ''),
        evidenceId: String(formData.get('evidence_id') ?? ''),
      });
      revalidatePath(`/eng/${id}/exceptions`);
    });
  }
  async function assignerAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/exceptions`, async () => {
      const { user } = await requireMember(id);
      const contactId = String(formData.get('owner_contact_id') ?? '');
      const dueDate = String(formData.get('due_date') ?? '');
      await assignerProprietairePointAction(
        String(formData.get('item_id')), contactId || null, dueDate || null, user.id,
      );
      revalidatePath(`/eng/${id}/exceptions`);
    });
  }

  const open = exceptions.filter((x) => x.status === 'open');
  // what may be linked as corroboration: any non-quarantined piece of evidence on the file,
  // or an accounting entry (the correcting journal, a credit note posting)
  const corroborations = [
    ...(await q<{ id: string; filename: string; doc_type: string | null }>(
      `select id, filename, doc_type from evidence where engagement_id = $1 and quarantined = false order by filename`,
      [id],
    )).map((e) => ({ value: `ev:${e.id}`, label: `pièce · ${e.filename}${e.doc_type ? ` [${e.doc_type}]` : ''}` })),
    ...(await q<{ id: string; entry_no: string; piece_ref: string | null; entry_date: string }>(
      `select id, entry_no, piece_ref, entry_date::text from gl_entry
       where engagement_id = $1 and journal_code = 'OD' order by entry_date desc limit 25`,
      [id],
    )).map((g) => ({ value: `gl:${g.id}`, label: t('exc.ecritureLabel', { no: g.entry_no, piece: g.piece_ref ?? '', date: g.entry_date }) })),
  ];

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{isSox ? t('exc.deviationsExceptions') : t('col.exceptions')} <span className="badge gray">{exceptions.length}</span></h2>
          {open.length > 0 && (
            <form action={draftAction}>
              <button className="btn">{t('exc.draftClarificationRequest')}{open.length} {t('exc.openL2')}</button>
            </form>
          )}
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>{t('col.type')}</th><th>{t('col.description')}</th><th className="num">{t('col.impact')}</th><th>{t('col.status')}</th><th>{t('col.disposition')}</th></tr></thead>
            <tbody>
              {exceptions.map((x) => (
                /* L'ANCRE DE L'ÉCART (point 10) : l'atelier pointe ici en un
                   clic (#x-<id>), et la ligne testée est à un clic en retour. */
                <tr key={x.id} id={`x-${x.id}`}>
                  <td>
                    <Annotable moi={moi} repondre={repondreNoteAction} transitionner={transitionNoteAction}
                      ancre={{
                        kind: 'exception',
                        aRef: identitesEcarts.get(x.id)?.aref ?? `id|${x.id}`,
                        label: `Écart ${x.taxonomy_code}${identitesEcarts.get(x.id)?.piece ? ` · ${identitesEcarts.get(x.id)!.piece}` : ''}`,
                      }}
                      marques={marquesNotes[`exception|${x.id}`] ?? []}
                      membres={membresNotes} engagementId={id} chemin={`/eng/${id}/exceptions`}
                      notesHref={`/eng/${id}/notes`} action={poserNoteAncreeAction}
                    >
                      <span className={`badge ${x.severity === 'high' ? 'red' : 'amber'}`}>{x.taxonomy_code}</span>
                    </Annotable>
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    {x.description}{x.resolution && <div className="faint">↳ {x.resolution}</div>}
                    {identitesEcarts.get(x.id)?.item && (
                      <div>
                        <Link className="faint" href={`/eng/${id}/testing?item=${identitesEcarts.get(x.id)!.item}`}>
                          {t('exc.theTestedLineInTheWorkbench')}
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="num">{x.amount_impact ? fmtEur(numToCents(x.amount_impact), 'fr') : '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[x.status]}`}>{x.status}</span></td>
                  <td>
                    {(x.status === 'explained' || x.status === 'open') && (
                      <details>
                        <summary className="repli-action">{t('commun.actions')}</summary>
                        <form action={resolveAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 520 }}>
                          <input type="hidden" name="exception_id" value={x.id} />
                          <textarea name="explanation" rows={2} required
                            placeholder={t('commun.explicationMotPourMot')} />
                          <input name="fait" placeholder={t('exc.findingBeyondThisItemOptionalIt')} />
                          <div className="row" style={{ gap: 4 }}>
                            <select name="fait_nature" defaultValue="controle">
                              <option value="controle">{t('exc.control')}</option>
                              <option value="changement">{t('mot.change')}</option>
                              <option value="complexite">{t('exc.complexity')}</option>
                              <option value="incertitude">{t('mot.uncertainty')}</option>
                              <option value="biais">{t('mot.bias')}</option>
                            </select>
                            <input name="fait_postes" placeholder={t('exc.areasConcernedCommaSeparated')} style={{ flex: 1 }} />
                          </div>
                          <textarea name="conclusion" rows={2} required
                            placeholder={t('rap.conclusion')} />
                          <div className="row" style={{ gap: 4 }}>
                            <select name="disposition" defaultValue="no_misstatement">
                              <option value="no_misstatement">{t('commun.aucuneAnomalie')}</option>
                              <option value="corrected">{t('rap.corrige')}</option>
                              <option value="compensated">{t('rap.couvert')}</option>
                              <option value="already_accumulated">{t('rap.dejaCumule')}</option>
                            </select>
                            <select name="corroboration" required style={{ flex: 1 }}>
                              <option value="">{t('rap.corroboration')}</option>
                              {corroborations.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                            <button className="btn small secondary">{t('col.resolve')}</button>
                          </div>
                        </form>
                        <form action={escalateAction} className="row">
                          <input type="hidden" name="exception_id" value={x.id} />
                          <select name="kind" defaultValue="factual">
                            <option value="factual">{t('mot.factual')}</option>
                            <option value="judgmental">{t('mot.judgmental')}</option>
                            <option value="projected">{t('mot.projected')}</option>
                          </select>
                          <input type="number" name="amount" step="0.01" placeholder="€" style={{ width: 100 }} required />
                          <label className="row" style={{ gap: 3 }}><input type="checkbox" name="corrected" /> {t('mot.corrected')}</label>
                          <button className="btn small danger">{t('exc.misstatement')}</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* H-2, slice 1 (Lot 7, `docs/REGISTRE_IDEES.md` ligne 270 — « le cycle de vie du constat
          vis-à-vis du client ») : ce panneau ne CRÉE rien — il rend VISIBLES, comme deux objets
          nommés distinctement, ce que `draftClarificationRequest`/`answerExplanation`/
          `resolveException` tiennent déjà séparé en base (matching.ts::constatEtPointAction).
          « Constat » = le dossier (exception.status, refermé SEULEMENT par un humain via
          resolveException) ; « point d'action client » = l'entité (request_item.status/
          client_note, jamais lu comme une conclusion). Zéro migration, pure lecture — visible
          même vide (une slice qui n'a encore engendré aucune clarification n'est pas une panne). */}
      <div className="panel">
        <h2>{t('exc.constatVsActionClient')} <span className="badge gray">{constatsEtActions.length}</span></h2>
        <p className="faint" style={{ margin: '0 0 8px' }}>{t('exc.constatVsActionClientAide')}</p>
        {constatsEtActions.length === 0 ? (
          <p className="muted">{t('req.noneYet')}</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('exc.colConstat')}</th>
                  <th>{t('col.status')}</th>
                  <th>{t('exc.colActionClient')}</th>
                  <th>{t('exc.colProprietaire')}</th>
                  <th>{t('exc.colDemande')}</th>
                </tr>
              </thead>
              <tbody>
                {constatsEtActions.map((c) => (
                  <tr key={c.item_id}>
                    <td style={{ maxWidth: 360 }}>
                      <span className={`badge ${STATUS_BADGE[c.exception_status] ?? 'gray'}`}>{c.taxonomy_code}</span>
                      <div className="faint">{c.description}</div>
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[c.exception_status] ?? 'gray'}`}>{c.exception_status}</span></td>
                    <td>
                      <span className={`badge ${ITEM_BADGE[c.item_status] ?? 'gray'}`}>{c.item_status}</span>
                      {c.client_note && <div className="faint">↳ {c.client_note}</div>}
                    </td>
                    <td>
                      {/* H-2, slice 2 (migration 0166) : propriétaire/échéance PROPRES au point
                          d'action — jamais posés sur `exception`, toujours sur `request_item`. */}
                      <div className="faint">{c.owner_name ?? t('exc.assignerAucun')}{c.item_due_date ? ` · ${c.item_due_date}` : ''}</div>
                      <form action={assignerAction} className="row" style={{ gap: 4, marginTop: 4 }}>
                        <input type="hidden" name="item_id" value={c.item_id} />
                        <select name="owner_contact_id" defaultValue={c.owner_contact_id ?? ''} style={{ maxWidth: 140 }}>
                          <option value="">{t('exc.assignerAucun')}</option>
                          {contactsPourAssignation.map((ct) => <option key={ct.id} value={ct.id}>{ct.nom}</option>)}
                        </select>
                        <input type="date" name="due_date" defaultValue={c.item_due_date ?? ''} style={{ maxWidth: 130 }} />
                        <button className="btn small secondary">{t('exc.assigner')}</button>
                      </form>
                    </td>
                    <td>
                      <Link href={`/eng/${id}/requests/${c.request_id}`}>{c.request_title}</Link>
                      <div className="faint">{c.request_status}{c.request_due_date ? ` · ${c.request_due_date}` : ''}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EXTRAP-03 (mandat 2026-09-14, §1.4) : « L'écran affiche EN PERMANENCE le compte
          d'anomalies écartées sur le dossier — un compte qui monte est en soi un signal. »
          Hors du `misstatements.length > 0` : visible même à zéro écart, jamais replié. */}
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('exc.dismissedAnomaliesCount')} <span className={`badge ${dismissedCount > 0 ? 'violet' : 'gray'}`}>{dismissedCount}</span></h2>
        </div>
        {seuils && (
          <p className="muted">
            {t('exc.evaluatedAgainstMateriality', {
              amount: fmtEur(totalNonCorrigeCents, 'fr'), te: fmtEur(seuils.teCents, 'fr'),
            })}
          </p>
        )}
      </div>

      {misstatements.length > 0 && (
        <Repli cle="exc.misstatementsIsa450ShapedLedger" niveau={2} titre={t('exc.misstatementsIsa450ShapedLedger')}>
          <table className="data">
            <thead><tr><th>{t('col.kind')}</th><th className="num">{t('col.amount')}</th><th>{t('col.corrected')}</th><th>{t('col.status')}</th><th>{t('col.notes')}</th><th>{t('commun.actions')}</th></tr></thead>
            <tbody>
              {misstatements.map((m) => (
                <tr key={m.id}>
                  <td><span className="badge violet">{m.kind}</span></td>
                  <td className="num">{fmtEur(numToCents(m.amount), 'fr')}</td>
                  <td>{m.corrected ? <span className="badge green">{t('commun.oui')}</span> : <span className="badge red">{t('commun.non')}</span>}</td>
                  <td><span className={`badge ${m.status === 'dismissed' ? 'violet' : 'gray'}`}>{m.status}</span></td>
                  <td className="muted">
                    {m.notes}
                    {m.rolled_into_projection && (
                      <div className="faint">{t('exc.rolledIntoProjection')}</div>
                    )}
                    {m.status === 'dismissed' && (
                      <div>
                        <div><strong>{t('exc.dismissedReason')}</strong> {m.dismissed_reason}</div>
                        <div>
                          <strong>{t('exc.dismissedEvidence')}</strong>{' '}
                          {m.dismissed_evidence_filename ?? '—'}
                          {m.dismissed_by_name && ` · ${m.dismissed_by_name}`}
                          {m.dismissed_at && ` · ${m.dismissed_at.slice(0, 10)}`}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {/* EXTRAP-03 (revue hostile, voix 1) : une ligne 'projected' est TOUJOURS
                        refusée par le service (matching.ts) — le formulaire ne s'offre donc pas,
                        plutôt que de promettre un geste qui échoue systématiquement. */}
                    {m.status !== 'dismissed' && m.kind !== 'projected' && (
                      <details>
                        <summary className="repli-action">{t('exc.dismissAsAnomaly')}</summary>
                        <form action={dismissAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 420 }}>
                          <input type="hidden" name="misstatement_id" value={m.id} />
                          <textarea name="reason" rows={2} required placeholder={t('exc.extrap03Reason')} />
                          <select name="evidence_id" required defaultValue="">
                            <option value="" disabled>{t('exc.extrap03Evidence')}</option>
                            {evidencesPourEcartement.map((e) => (
                              <option key={e.id} value={e.id}>{e.filename}{e.doc_type ? ` [${e.doc_type}]` : ''}</option>
                            ))}
                          </select>
                          <button className="btn small danger">{t('exc.dismissAsAnomaly')}</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Repli>
      )}
    </div>
  );
}
