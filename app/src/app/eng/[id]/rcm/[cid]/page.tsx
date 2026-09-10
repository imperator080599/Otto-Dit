import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { requireMember } from '@/lib/core/auth';
import { q, q1, repoRoot } from '@/lib/db/client';
import {
  listControls, importInstances, drawAttributeSample, runAttributeTesting, attributeGrid, listDeviations,
  resolveDeviation, proposeDeficiency, decideDeficiency, listDeficiencies,
  attacherWalkthrough, supprimerVideoWalkthrough, compteurConservationVideo,
  listerTachesControle, ajouterTacheControle, documenterProcedureTache,
  risquesDuDossier, risquesLiesAuControle, lierRisqueControle, delierRisqueControle,
  facteursDesignDuControle, documenterFacteurDesign, iucDuControle, declarerIuc, documenterIucPreuve,
  tailleEchantillonOePourControle, deriverPopulationControle, FREQUENCES_DERIVABLES,
  populationControleRapprochee, rapprocherPopulationControle,
  proceduresOeDuControle, documenterProcedureOe,
} from '@/lib/services/sox';
import { draftOeWorkpaper } from '@/lib/services/workpapers/oe-draft';
import { extractAll, pendingVerifications, verifyExtraction } from '@/lib/services/extraction/ladder';
import { approveSend, demanderPopulationControle, derniereDemandePopulationControle, numeroDemande } from '@/lib/services/requests';
import { ingestEvidence } from '@/lib/services/evidence';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr } from '@/lib/i18n';
import { Repli } from '@/app/repli';

const RESULT_STYLE: Record<string, string> = { pass: 'green', fail: 'red', na: 'gray' };

export default async function ControlDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string; cid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id, cid } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  await requireMember(id);
  const control = (await listControls(id)).find((c) => c.id === cid);
  if (!control) return <div className="panel">{t('rcmc.controlNotFound')}</div>;
  const videoWalkthrough = control.di_walkthrough_evidence_id
    ? await q1<{
      filename: string; uploaded_at: string; uploaded_by_name: string | null;
      deleted_at: string | null; deleted_by_name: string | null; deleted_reason: string | null;
    }>(
      `select e.filename, e.created_at::text uploaded_at, u.name uploaded_by_name,
              e.deleted_at::text deleted_at, d.name deleted_by_name, e.deleted_reason
       from evidence e
       left join app_user u on u.id = e.uploaded_by_id
       left join app_user d on d.id = e.deleted_by
       where e.id = $1`,
      [control.di_walkthrough_evidence_id],
    )
    : null;
  const compteurConservation = await compteurConservationVideo(id);
  const tailleOe = await tailleEchantillonOePourControle(cid);
  const estDerivable = (FREQUENCES_DERIVABLES as readonly string[]).includes(control.frequency);
  const demandePopulation = estDerivable ? null : await derniereDemandePopulationControle(cid);
  const instances = await q<{ id: string; label: string; occurred_on: string | null; performer_name: string | null; source: string; sampled: boolean; evidence_count: string }>(
    `select ci.id, ci.label, ci.occurred_on::text, ci.performer_name, ci.source,
            exists(select 1 from sample_item si join sample s on s.id = si.sample_id
                   join control_test ct on ct.sample_id = s.id
                   where si.unit_id = ci.id and ct.control_id = $1) sampled,
            (select count(*) from evidence e join request_item ri on ri.id = e.request_item_id where ri.control_instance_id = ci.id) evidence_count
     from control_instance ci where ci.control_id = $1 order by ci.occurred_on nulls last, ci.label`,
    [cid],
  );
  const rapprochee = instances.length > 0 ? await populationControleRapprochee(cid) : null;
  const grid = await attributeGrid(cid);
  const attrCodes = [...new Set(grid.map((g) => g.attribute_code))].sort();
  const gridLabels = [...new Set(grid.map((g) => g.label))].sort();
  const deviations = (await listDeviations(id)).filter((d) => d.control_code === control.code);
  // Ce qui peut être LIÉ pour montrer que le contrôle a fonctionné : les pièces du dossier.
  const corroborations = await q<{ id: string; filename: string }>(
    `select id, filename from evidence where engagement_id = $1 and quarantined = false order by filename`,
    [id],
  );
  const deficiency = (await listDeficiencies(id)).find((d) => d.control_code === control.code);
  const workpaper = await q<{ id: string; code: string; status: string; version: number }>(
    `select id, code, status, version from workpaper where engagement_id = $1 and code = $2 order by version desc limit 1`,
    [id, `OE-${control.code}`],
  );
  const taches = await listerTachesControle(cid);
  const oeProcedures = await proceduresOeDuControle(cid);
  const oeInquiryFaite = oeProcedures.some((p) => p.procedure === 'inquiry');
  const oeAutreFaite = oeProcedures.some((p) => p.procedure !== 'inquiry');
  const risquesDossier = await risquesDuDossier(id);
  const risquesLies = await risquesLiesAuControle(cid);
  const facteurs = await facteursDesignDuControle(cid);
  const iuc = await iucDuControle(cid);
  const FACTEURS = [
    { cle: 'reponse_risque' as const, libelle: t('rcmc.facteurReponseRisque') },
    { cle: 'autorite_competence' as const, libelle: t('rcmc.facteurAutoriteCompetence') },
    { cle: 'frequence_constance' as const, libelle: t('rcmc.facteurFrequenceConstance') },
    { cle: 'seuil_investigation' as const, libelle: t('rcmc.facteurSeuilInvestigation') },
  ];

  async function lierRisqueAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await lierRisqueControle(cid, user.id, String(formData.get('risk_id')));
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function delierRisqueAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await delierRisqueControle(cid, user.id, String(formData.get('risk_id')));
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function documenterFacteurAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await documenterFacteurDesign(
        cid, user.id,
        String(formData.get('factor')) as 'reponse_risque' | 'autorite_competence' | 'frequence_constance' | 'seuil_investigation',
        String(formData.get('conclusion') ?? ''),
      );
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function declarerIucAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await declarerIuc(cid, user.id, formData.get('utilisee') === 'oui', String(formData.get('description') ?? '') || undefined);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function documenterIucPreuveAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await documenterIucPreuve(
        cid, user.id, String(formData.get('volet')) as 'exactitude' | 'exhaustivite',
        String(formData.get('conclusion') ?? ''),
      );
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }

  async function attacherWalkthroughAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      const fichier = formData.get('fichier') as File | null;
      if (!fichier || !fichier.size) {
        throw new Error('joignez l’enregistrement du walkthrough (vidéo — donnée synthétique en démonstration).');
      }
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const { evidenceId } = await ingestEvidence({
        engagementId: id, filename: fichier.name, mime: fichier.type || 'application/octet-stream',
        bytes: octets, source: 'auditor', uploadedBy: { kind: 'app_user', id: user.id }, audience: 'internal',
      });
      await attacherWalkthrough(cid, user.id, evidenceId);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function supprimerVideoWalkthroughAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await supprimerVideoWalkthrough(cid, user.id, String(formData.get('raison') ?? ''));
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function ajouterTacheAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await ajouterTacheControle(
        cid, user.id, String(formData.get('description') ?? ''), String(formData.get('video_timestamp') ?? '') || undefined,
      );
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function documenterProcedureAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await documenterProcedureTache(
        String(formData.get('task_id')), user.id,
        String(formData.get('procedure')) as 'inspection' | 'observation' | 'reperformance',
        String(formData.get('notes') ?? ''),
      );
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }

  async function importInstancesAction() {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      const csv = fs.readFileSync(path.join(repoRoot(), 'dataset', 'sox', `instances_${control!.code}.csv`), 'utf8');
      await importInstances(cid, csv, user.id);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function deriverPopulationAction() {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await deriverPopulationControle(cid, user.id);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function demanderPopulationAction() {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await demanderPopulationControle(cid, user.id);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function rapprocherPopulationAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await rapprocherPopulationControle(cid, user.id, String(formData.get('conclusion') ?? ''));
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function drawAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      const sizeRaw = String(formData.get('size') ?? '');
      const justification = String(formData.get('justification') ?? '');
      const res = await drawAttributeSample(cid, user.id, sizeRaw ? Number(sizeRaw) : undefined, justification || undefined);
      await approveSend(res.requestId, user.id);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function documenterProcedureOeAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      const procedure = String(formData.get('procedure')) as 'inquiry' | 'inspection' | 'observation' | 'reperformance';
      await documenterProcedureOe(
        cid, user.id, procedure, String(formData.get('notes') ?? ''),
        String(formData.get('evidence_id') ?? '') || undefined,
        String(formData.get('performed_at') ?? '') || undefined,
      );
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function testAction() {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await extractAll(id, user.id);
      for (const p of await pendingVerifications(id)) await verifyExtraction(p.id, user.id);
      await runAttributeTesting(cid, user.id);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function resolveDevAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await resolveDeviation(String(formData.get('deviation_id')), user.id, {
        explanation: String(formData.get('explanation') ?? ''),
        conclusion: String(formData.get('conclusion') ?? ''),
        disposition: String(formData.get('disposition') ?? 'control_operated') as 'control_operated' | 'compensating_control',
        evidenceId: String(formData.get('evidence_id') ?? ''),
      });
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function deficiencyAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await proposeDeficiency(cid, user.id, {
        magnitudeExposureCents: Math.round(Number(formData.get('magnitude')) * 100),
        compensatingControl: formData.get('compensating') === 'on',
        magnitudeBasis: String(formData.get('magnitude_basis') ?? ''),
      });
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function decideAction(formData: FormData) {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await decideDeficiency(
        String(formData.get('deficiency_id')), user.id,
        String(formData.get('severity')) as 'deficiency' | 'significant_deficiency' | 'material_weakness',
        String(formData.get('decision_rationale') ?? ''),
      );
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }
  async function draftWpAction() {
    'use server';
    return executer(`/eng/${id}/rcm/${cid}`, async () => {
      const { user } = await requireMember(id);
      await draftOeWorkpaper(id, cid, user.id);
      revalidatePath(`/eng/${id}/rcm/${cid}`);
    });
  }

  return (
    <div>
      <BandeauRefus erreur={erreur} />
      <Repli cle="eng.id.rcm.cid.1" niveau={2} titre={<>{control.code} — {control.name}</>}>
        <p className="muted">{control.description}</p>
        <div className="row">
          <span className="badge gray">{control.frequency}</span>
          <span className="badge gray">{control.nature}</span>
          <span className="badge gray">{control.effect}</span>
          {control.is_key && <span className="badge blue">{t('rcmc.keyControl')}</span>}
          <span className={`badge ${control.di_status === 'effective' ? 'green' : 'red'}`}>{t('rcm.di')} {control.di_status}</span>
          <span className="faint">{t('rcmc.owner')} {control.owner_name}</span>
        </div>
      </Repli>

      <Repli cle="eng.id.rcm.cid.walkthrough" niveau={2} titre={t('rcmc.walkthrough')} id="walkthrough">
        {/* CORRIGÉ (revue hostile, voix 2) : la table des tâches et son formulaire d'ajout
            vivaient DANS cette branche « attaché et non supprimé » — supprimer la vidéo les
            rendait invisibles alors que `control_task`/`control_task_procedure` restent intacts
            en base (règle 13 : un objet créé qu'aucun chemin de lecture n'atteint). Les deux
            sections sont maintenant INDÉPENDANTES : celle-ci (dépôt / provenance / suppression)
            se branche sur « attaché ET vivant » vs « jamais attaché OU supprimé » ; la table des
            tâches se branche séparément sur « un lien existe » (attaché un jour, peu importe
            l'état courant de la pièce). */}
        {!control.di_walkthrough_evidence_id || videoWalkthrough?.deleted_at ? (
          <>
            {videoWalkthrough?.deleted_at && (
              <p className="callout warn" data-walkthrough-supprime>
                {t('rcmc.walkthroughSupprime', {
                  quand: videoWalkthrough.deleted_at.slice(0, 10),
                  qui: videoWalkthrough.deleted_by_name ?? '—',
                  motif: videoWalkthrough.deleted_reason ?? '',
                })}
              </p>
            )}
            <form action={attacherWalkthroughAction} className="row" data-attacher-walkthrough>
              <input type="file" name="fichier" required />
              <button className="btn small">{t('rcmc.attacherWalkthrough')}</button>
            </form>
          </>
        ) : (
          <>
            <p className="faint" data-walkthrough-attache>
              {t('rcmc.walkthroughAttache')}{' '}
              <span className="faint">
                {t('rcmc.walkthroughProvenance', {
                  fichier: videoWalkthrough?.filename ?? '',
                  qui: videoWalkthrough?.uploaded_by_name ?? '—',
                  quand: (videoWalkthrough?.uploaded_at ?? '').slice(0, 10),
                })}
              </span>
            </p>
            <p className="faint small" data-compteur-conservation-video>
              {compteurConservation.eligible
                ? (compteurConservation.duree.verifie
                  ? (compteurConservation.purgeable
                    ? t('rcmc.conservationPurgeable')
                    : t('rcmc.conservationJoursRestants', { n: compteurConservation.joursRestants ?? 0 }))
                  : t('rcmc.conservationNonVerifiee'))
                : t('rcmc.conservationNonEligible')}
            </p>
            <details data-supprimer-walkthrough>
              <summary className="repli-action">{t('rcmc.supprimerWalkthrough')}</summary>
              <form action={supprimerVideoWalkthroughAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 380 }}>
                <textarea name="raison" rows={2} required placeholder={t('rcmc.supprimerWalkthroughMotif')} />
                <button className="btn small secondary">{t('rcmc.supprimerWalkthroughConfirmer')}</button>
              </form>
            </details>
          </>
        )}
        {control.di_walkthrough_evidence_id && (
          <>
            <table className="data mt" data-taches-controle>
              <thead>
                <tr><th>#</th><th>{t('rcmc.tache')}</th><th>{t('rcmc.reperVideo')}</th><th>{t('rcmc.procedures')}</th><th>{t('commun.actions')}</th></tr>
              </thead>
              <tbody>
                {taches.map((tache) => {
                  const documentee = tache.procedures.some((p) => p.procedure !== 'inquiry');
                  return (
                    <tr key={tache.id} data-tache={tache.seq_no}>
                      <td className="mono">{tache.seq_no}</td>
                      <td>{tache.description}</td>
                      <td className="mono faint">{tache.video_timestamp ?? '—'}</td>
                      <td>
                        {tache.procedures.map((p) => (
                          <span key={p.procedure} className={`badge ${p.procedure === 'inquiry' ? 'gray' : 'blue'}`} title={p.notes} style={{ marginRight: 4 }}>
                            {p.procedure}
                          </span>
                        ))}
                        {!documentee && <span className="badge amber" data-ctrl-01-manquant>{t('rcmc.ctrl01Manquant')}</span>}
                      </td>
                      <td>
                        <details>
                          <summary className="repli-action">{t('commun.actions')}</summary>
                          <form action={documenterProcedureAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 360 }} data-documenter-procedure>
                            <input type="hidden" name="task_id" value={tache.id} />
                            <select name="procedure" defaultValue="inspection">
                              <option value="inspection">{t('rcmc.procInspection')}</option>
                              <option value="observation">{t('rcmc.procObservation')}</option>
                              <option value="reperformance">{t('rcmc.procReperformance')}</option>
                            </select>
                            <textarea name="notes" rows={2} required placeholder={t('rcmc.procNotes')} />
                            <button className="btn small secondary">{t('rcmc.procDocumenter')}</button>
                          </form>
                        </details>
                      </td>
                    </tr>
                  );
                })}
                {taches.length === 0 && <tr><td colSpan={5} className="faint">{t('rcmc.aucuneTache')}</td></tr>}
              </tbody>
            </table>
            <form action={ajouterTacheAction} className="row mt" data-ajouter-tache>
              <input type="text" name="description" placeholder={t('rcmc.tacheDescription')} style={{ width: 320 }} required />
              <input type="text" name="video_timestamp" placeholder={t('rcmc.reperVideo')} style={{ width: 100 }} />
              <button className="btn small">{t('rcmc.ajouterTache')}</button>
            </form>
          </>
        )}
      </Repli>

      <Repli cle="eng.id.rcm.cid.design" niveau={2} titre={t('rcmc.facteursEtIuc')} id="design">
        <h3>{t('rcmc.risquesLies')}</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }} data-risques-lies>
          {risquesLies.length === 0 && <span className="faint">{t('rcmc.aucunRisqueLie')}</span>}
          {risquesLies.map((r) => (
            <span key={r.id} className="badge amber" title={r.description}>
              {r.fsli_code ?? '—'} · {r.assertion} · {r.level}
              <form action={delierRisqueAction} style={{ display: 'inline' }}>
                <input type="hidden" name="risk_id" value={r.id} />
                <button className="btn tiny" type="submit" aria-label={t('rcmc.delierRisque')}>×</button>
              </form>
            </span>
          ))}
        </div>
        {risquesDossier.filter((r) => !risquesLies.some((l) => l.id === r.id)).length > 0 && (
          <form action={lierRisqueAction} className="row mt" data-lier-risque>
            <select name="risk_id" required defaultValue="">
              <option value="" disabled>{t('rcmc.choisirRisque')}</option>
              {risquesDossier.filter((r) => !risquesLies.some((l) => l.id === r.id)).map((r) => (
                <option key={r.id} value={r.id}>{r.fsli_code ?? '—'} · {r.assertion} · {r.level} — {r.description.slice(0, 60)}</option>
              ))}
            </select>
            <button className="btn small secondary">{t('rcmc.lierRisque')}</button>
          </form>
        )}

        <h3 className="mt">{t('rcmc.facteursDesign')}</h3>
        <table className="data" data-facteurs-design>
          <tbody>
            {FACTEURS.map((f) => {
              const doc = facteurs.find((x) => x.factor === f.cle);
              return (
                <tr key={f.cle} data-facteur={f.cle}>
                  <td style={{ width: 220 }}>{f.libelle}</td>
                  <td>{doc ? <span data-facteur-conclusion>{doc.conclusion}</span> : <span className="badge amber">{t('rcmc.facteurManquant')}</span>}</td>
                  <td>
                    <details>
                      <summary className="repli-action">{doc ? t('rcmc.reviser') : t('rcmc.documenter')}</summary>
                      <form action={documenterFacteurAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 420 }}>
                        <input type="hidden" name="factor" value={f.cle} />
                        <textarea name="conclusion" rows={2} required defaultValue={doc?.conclusion ?? ''} />
                        <button className="btn small secondary">{t('rcmc.enregistrerConclusion')}</button>
                      </form>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className="mt">{t('rcmc.iuc')}</h3>
        {!iuc ? (
          <form action={declarerIucAction} className="row" data-declarer-iuc>
            <select name="utilisee" defaultValue="non" required>
              <option value="non">{t('rcmc.iucNonUtilisee')}</option>
              <option value="oui">{t('rcmc.iucUtilisee')}</option>
            </select>
            <input type="text" name="description" placeholder={t('rcmc.iucDescription')} style={{ width: 280 }} />
            <button className="btn small">{t('rcmc.declarer')}</button>
          </form>
        ) : (
          <>
            <p className="row" data-iuc-declaree>
              <span className={`badge ${iuc.utilisee ? 'blue' : 'gray'}`}>{iuc.utilisee ? t('rcmc.iucUtilisee') : t('rcmc.iucNonUtilisee')}</span>
              {iuc.description && <span className="faint">{iuc.description}</span>}
              <details>
                <summary className="repli-action">{t('rcmc.reviser')}</summary>
                <form action={declarerIucAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 380 }}>
                  <select name="utilisee" defaultValue={iuc.utilisee ? 'oui' : 'non'} required>
                    <option value="non">{t('rcmc.iucNonUtilisee')}</option>
                    <option value="oui">{t('rcmc.iucUtilisee')}</option>
                  </select>
                  <input type="text" name="description" defaultValue={iuc.description ?? ''} placeholder={t('rcmc.iucDescription')} />
                  <button className="btn small secondary">{t('rcmc.declarer')}</button>
                </form>
              </details>
            </p>
            {iuc.utilisee && (
              <table className="data" data-iuc-preuves>
                <tbody>
                  {(['exactitude', 'exhaustivite'] as const).map((volet) => {
                    const preuve = iuc.preuves.find((p) => p.volet === volet);
                    return (
                      <tr key={volet} data-volet={volet}>
                        <td style={{ width: 160 }}>{volet === 'exactitude' ? t('rcmc.exactitude') : t('rcmc.exhaustivite')}</td>
                        <td>{preuve ? <span data-preuve-conclusion>{preuve.conclusion}</span> : <span className="badge amber">{t('rcmc.preuveManquante')}</span>}</td>
                        <td>
                          <details>
                            <summary className="repli-action">{preuve ? t('rcmc.reviser') : t('rcmc.documenter')}</summary>
                            <form action={documenterIucPreuveAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 380 }}>
                              <input type="hidden" name="volet" value={volet} />
                              <textarea name="conclusion" rows={2} required defaultValue={preuve?.conclusion ?? ''} />
                              <button className="btn small secondary">{t('rcmc.enregistrerConclusion')}</button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </Repli>

      <div className="grid cols-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Instance population ({instances.length})</h2>
            <span className="row">
              {instances.length === 0 && (estDerivable ? (
                <form action={deriverPopulationAction}><button className="btn small secondary">{t('rcmc.deriverPopulation')}</button></form>
              ) : !demandePopulation ? (
                <form action={demanderPopulationAction}><button className="btn small secondary">{t('rcmc.demanderPopulation')}</button></form>
              ) : (
                <form action={importInstancesAction}><button className="btn small secondary">{t('rcmc.importClientListing')}</button></form>
              ))}
              {instances.length > 0 && !instances.some((i) => i.sampled) && !rapprochee && (
                <form action={rapprocherPopulationAction} className="row" data-rapprocher-population>
                  <textarea name="conclusion" rows={2} required placeholder={t('rcmc.ctrl04ConclusionPlaceholder')} style={{ width: 260 }} />
                  <button className="btn small secondary">{t('rcmc.rapprocherPopulation')}</button>
                </form>
              )}
              {instances.length > 0 && !instances.some((i) => i.sampled) && rapprochee && (
                <form action={drawAction} className="row">
                  <input
                    type="number" name="size" required={!tailleOe.verifie}
                    placeholder={tailleOe.verifie ? String(tailleOe.valeur) : t('rcmc.sizeNonVerifiee')}
                    style={{ width: 120 }}
                  />
                  <input
                    type="text" name="justification" required={!tailleOe.verifie}
                    placeholder={t('rcmc.overrideJustification')} style={{ width: 150 }}
                  />
                  <button className="btn small">{t('rcm.drawAndRequestEvidence')}</button>
                </form>
              )}
              {instances.some((i) => i.sampled) && grid.length === 0 && oeInquiryFaite && oeAutreFaite && (
                <form action={testAction}><button className="btn small">{t('rcm.extractAndTestAttributes')}</button></form>
              )}
            </span>
          </div>
          {instances.length > 0 && !instances.some((i) => i.sampled) && !rapprochee && (
            <p className="muted small" data-ctrl04-non-rapprochee>{t('rcmc.ctrl04NonRapprochee')}</p>
          )}
          {instances.length > 0 && !instances.some((i) => i.sampled) && rapprochee && !tailleOe.verifie && (
            <p className="muted small">
              {t('rcmc.ctrl07Avertissement')} {tailleOe.motif}
              {tailleOe.texteSource && <> — « {tailleOe.texteSource} »</>}
            </p>
          )}
          {/* Revue hostile du §1 (voix 2) : une taille VÉRIFIÉE peut aussi porter une source
              (le minimum ≤ 200, annexe §2.2) — jusqu'ici affichée seulement quand NON vérifiée.
              Pour une population de 200 pile, la note « la source dit 199, pas 200 » vivait
              uniquement dans un commentaire de code, jamais à l'écran — une taille vérifiée ne
              doit pas laisser croire à une source sans astérisque quand il y en a un. */}
          {instances.length > 0 && !instances.some((i) => i.sampled) && rapprochee && tailleOe.verifie && tailleOe.texteSource && (
            <p className="muted small">{t('rcmc.tailleSource')} « {tailleOe.texteSource} »</p>
          )}
          {instances.length > 0 && rapprochee && (
            <p className="muted small" data-population-rapprochee>{t('rcmc.populationRapprochee')}</p>
          )}
          {instances.length === 0 && demandePopulation && (
            <p className="muted small">
              {t('rcmc.demandePopulationEnvoyee')} <Link href={`/eng/${id}/requests/${demandePopulation.id}`}>{numeroDemande(demandePopulation.seq_no)}</Link>
            </p>
          )}
          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table className="data">
              <thead><tr><th>{t('col.instance')}</th><th>{t('rcmc.occurred')}</th><th>{t('rcmc.performer')}</th><th>{t('rcmc.source')}</th><th>{t('rcmc.sampled')}</th><th>{t('col.evidence')}</th></tr></thead>
              <tbody>
                {instances.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.label}</td>
                    <td>{i.occurred_on}</td>
                    <td>{i.performer_name}</td>
                    <td>{i.source === 'derived' ? <span className="badge">{t('rcmc.sourceDerived')}</span> : i.source}</td>
                    <td>{i.sampled ? <span className="badge blue">{t('rcmc.selected')}</span> : <span className="faint">—</span>}</td>
                    <td className="num">{i.evidence_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {instances.some((i) => i.sampled) && (
            <div className="mt" data-oe-procedures>
              <h3>{t('rcmc.oeProcedures')}</h3>
              <table className="data">
                <tbody>
                  {(['inquiry', 'inspection', 'observation', 'reperformance'] as const).map((p) => {
                    const doc = oeProcedures.find((x) => x.procedure === p);
                    return (
                      <tr key={p} data-oe-procedure={p}>
                        <td style={{ width: 140 }}>{p}</td>
                        <td>
                          {doc
                            ? <span data-oe-procedure-conclusion>{doc.notes} <span className="faint">({doc.performedAt.slice(0, 10)})</span></span>
                            : <span className="badge amber">{p === 'inquiry' ? t('rcmc.oeInquiryManquante') : t('rcmc.oeAutreProcManquante')}</span>}
                        </td>
                        <td>
                          <details>
                            <summary className="repli-action">{doc ? t('rcmc.reviser') : t('rcmc.documenter')}</summary>
                            <form action={documenterProcedureOeAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 380 }}>
                              <input type="hidden" name="procedure" value={p} />
                              {p === 'inquiry' && (
                                <input type="date" name="performed_at" defaultValue={doc?.performedAt.slice(0, 10) ?? ''} required />
                              )}
                              <textarea name="notes" rows={2} required defaultValue={doc?.notes ?? ''} placeholder={p === 'inquiry' ? t('rcmc.oeInquiryPlaceholder') : t('rcmc.procNotes')} />
                              <select name="evidence_id" required={p === 'inquiry'} defaultValue={doc?.evidenceId ?? ''}>
                                <option value="">{t('rcm.documentThatShowsItRequired')}</option>
                                {corroborations.map((c) => (
                                  <option key={c.id} value={c.id}>{c.filename}</option>
                                ))}
                              </select>
                              <button className="btn small secondary">{t('rcmc.enregistrerConclusion')}</button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Repli cle="eng.id.rcm.cid.2" niveau={2} titre={<>Attribute grid</>}>
          {grid.length === 0 ? <p className="muted">{t('rcmc.notTestedYet')}</p> : (
            <table className="data">
              <thead><tr><th>{t('col.instance')}</th>{attrCodes.map((a) => <th key={a}>{a}</th>)}</tr></thead>
              <tbody>
                {gridLabels.map((label) => (
                  <tr key={label}>
                    <td className="mono">{label}</td>
                    {attrCodes.map((a) => {
                      const r = grid.find((g) => g.label === label && g.attribute_code === a);
                      return (
                        <td key={a}>
                          {r ? <span className={`badge ${RESULT_STYLE[r.result]}`} title={r.note ?? ''}>{r.result}</span> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Repli>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('rcmc.nDeviations', { n: deviations.length })}</h2>
          <span className="row">
            {deviations.length > 0 && !deficiency && (
              <form action={deficiencyAction} className="row">
                <input type="number" name="magnitude" step="0.01" placeholder={t('rcmc.magnitudeExposure')} style={{ width: 160 }} required />
                <input type="text" name="magnitude_basis" required style={{ width: 320 }}
                  placeholder={t('rcmc.whereThatExposureComesFromAccount')} />
                <label className="row" style={{ gap: 3 }}><input type="checkbox" name="compensating" /> {t('rcmc.compensatingControl')}</label>
                <button className="btn small">{t('rcmc.proposeDeficiencyL3')}</button>
              </form>
            )}
            {grid.length > 0 && (
              <form action={draftWpAction}><button className="btn small">{t('rcmc.draftOeWorkpaper')}</button></form>
            )}
          </span>
        </div>
        {deviations.length === 0 ? <p className="muted">{t('rcmc.noneControlOperatedAsDesignedIn')}</p> : (
          <table className="data">
            <thead><tr><th>{t('col.instance')}</th><th>{t('col.attribute')}</th><th>{t('col.type')}</th><th>{t('col.status')}</th><th>{t('col.description')}</th><th>{t('col.disposition')}</th></tr></thead>
            <tbody>
              {deviations.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.instance_label}</td>
                  <td>{d.attribute_code}</td>
                  <td><span className="badge red">{d.taxonomy_code}</span></td>
                  <td><span className={`badge ${d.status === 'open' ? 'red' : 'green'}`}>{d.status}</span></td>
                  <td className="muted" style={{ maxWidth: 300 }}>{d.description}</td>
                  <td>
                    {d.status === 'open' ? (
                      <details>
                        <summary className="repli-action">{t('commun.actions')}</summary>
                        <form action={resolveDevAction} style={{ margin: '6px 0', display: 'grid', gap: 4, maxWidth: 460 }}>
                          <input type="hidden" name="deviation_id" value={d.id} />
                          <textarea name="explanation" rows={2} required
                            placeholder={t('commun.explicationMotPourMot')} />
                          <textarea name="conclusion" rows={2} required
                            placeholder={t('rap.conclusion')} />
                          <select name="disposition" defaultValue="control_operated">
                            <option value="control_operated">{t('rcm.theControlDidOperateDocumentLinked')}</option>
                            <option value="compensating_control">{t('rcm.compensatingControlLinked')}</option>
                          </select>
                          <select name="evidence_id" required>
                            <option value="">{t('rcm.documentThatShowsItRequired')}</option>
                            {corroborations.map((c) => (
                              <option key={c.id} value={c.id}>{c.filename}</option>
                            ))}
                          </select>
                          <button className="btn small secondary">{t('col.record')}</button>
                        </form>
                        <p className="faint" style={{ maxWidth: 460 }}>
                          {t('rcm.aDeviationThatRemainsHasNeither')}
                        </p>
                      </details>
                    ) : <span className="muted">{d.resolution}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {deficiency && (
          <div className={`callout ${deficiency.status === 'confirmed' ? '' : 'warn'} mt`}>
            <strong>{(deficiency.severity_final ?? deficiency.severity_proposed).replace(/_/g, ' ').toUpperCase()}</strong>{' '}
            <span className="badge gray">{deficiency.status}</span>
            <p>{deficiency.narrative}</p>
            {deficiency.status === 'proposed' && (
              <form action={decideAction} className="row">
                <input type="hidden" name="deficiency_id" value={deficiency.id} />
                <select name="severity" defaultValue={deficiency.severity_proposed}>
                  <option value="deficiency">{t('rcmc.deficiency')}</option>
                  <option value="significant_deficiency">{t('rcmc.significantDeficiency')}</option>
                  <option value="material_weakness">{t('rcmc.materialWeakness')}</option>
                </select>
                <input type="text" name="decision_rationale" style={{ width: 340 }}
                  placeholder={t('rcmc.rationaleRequiredToGoBelowThe')} />
                <button className="btn small">{t('rcmc.recordDecisionHuman')}</button>
              </form>
            )}
          </div>
        )}
        {workpaper.length > 0 && (
          <p className="mt">
            Workpaper: <Link href={`/eng/${id}/workpapers/${workpaper[0].id}`}>{workpaper[0].code} v{workpaper[0].version}</Link>{' '}
            <span className="badge gray">{workpaper[0].status}</span>
          </p>
        )}
      </div>
    </div>
  );
}
