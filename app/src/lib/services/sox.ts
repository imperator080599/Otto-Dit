import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { controlPopulationHash } from '@/lib/kernel/canon';
import { attributeDraw } from '@/lib/kernel/sampling';
import { proposeDeficiencySeverity, type DeviationNature } from '@/lib/kernel/deficiency';
import { primaryPack } from '@/lib/packs';
import type { Frequency } from '@/lib/packs/types';
import { centsToNum } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { validatedThresholds } from './materiality';
import { latestExtraction } from './extraction/ladder';
import type { ExtractedField } from './extraction/fields';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

// S8 — SOX OE cycle on the SAME engines (request, evidence, extraction, sampling,
// exception/deviation, documentation) under the PCAOB/COSO pack. UI held to the four
// Gate-2 surfaces: RCM table, instance list, attribute grid, deviation list.

// ---------- S8a: RCM import + D&I gate + instance listings ----------

const ATTRIBUTES_BY_CONTROL: Record<string, { code: string; description: string; required: boolean }[]> = {
  'C-BR-01': [
    { code: 'TIMELY', description: 'Reconciliation prepared within 10 days of month end', required: true },
    { code: 'SOD', description: 'Preparer and approver are different people', required: true },
    { code: 'APPROVAL', description: 'Independent approval signature present', required: true },
    { code: 'EVIDENCE', description: 'Signed reconciliation retained', required: true },
  ],
  'C-REV-01': [
    { code: 'REVIEW', description: 'Credit review performed and documented', required: true },
    { code: 'APPROVAL', description: 'CFO approval present', required: true },
    { code: 'EVIDENCE', description: 'Approval form retained', required: true },
  ],
};
const DEFAULT_ATTRIBUTES = [{ code: 'EVIDENCE', description: 'Evidence of performance retained', required: true }];

/** Split a ';'-separated CSV line honouring RFC4180 double-quote escaping. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function importRcm(engagementId: string, csv: string, userId: string): Promise<number> {
  await assertMembre(engagementId, userId, 'importRcm');
  const ctx = await engagementCtx(engagementId);
  const lines = csv.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  const idx = (n: string) => headers.indexOf(n);
  const processIds = new Map<string, string>();
  let count = 0;
  for (const line of lines.slice(1)) {
    const p = splitCsvLine(line);
    const get = (n: string) => p[idx(n)] ?? '';
    const processName = get('process');
    if (!processIds.has(processName)) {
      const existing = await q01<{ id: string }>(`select id from process where engagement_id = $1 and name = $2`, [engagementId, processName]);
      const pid = existing?.id ?? (await q1<{ id: string }>(`insert into process (engagement_id, name) values ($1,$2) returning id`, [engagementId, processName])).id;
      processIds.set(processName, pid);
    }
    const itgc = get('itgc_area');
    const itgcRow = itgc ? await q01<{ id: string }>(`select id from itgc_area where code = $1`, [itgc]) : null;
    const existing = await q01<{ id: string }>(`select id from control where engagement_id = $1 and code = $2`, [engagementId, get('code')]);
    if (existing) continue;
    /* CTRL-01 (mandat contrôle interne, 2026-09-08) : le D&I d'un contrôle est un JUGEMENT DE
       L'AUDITEUR — il ne vient JAMAIS du listing RCM du client (`di_status` a longtemps été une
       colonne de ce CSV, lue directement ici ; trouvé par la revue hostile du 2026-09-08 comme
       un défaut de modélisation, pas seulement un décor : un contrôle « effective » sans aucune
       tâche documentée, jamais passé par `setDiStatus`, est exactement le cas que CTRL-01 existe
       pour refuser). Chaque contrôle importé démarre donc `not_assessed`, quel que soit le
       contenu du listing — seul `setDiStatus` (gardé par CTRL-01) peut le faire avancer. */
    const control = await q1<{ id: string }>(
      `insert into control (engagement_id, process_id, code, name, description, frequency, nature, effect, is_key, itgc_area_id, owner_name)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [
        engagementId, processIds.get(processName), get('code'), get('name'), get('description'),
        get('frequency'), get('nature'), get('effect'), get('is_key') === 'yes',
        itgcRow?.id ?? null, get('owner'),
      ],
    );
    const assertionsList = (get('assertions') || '').split('|').filter(Boolean);
    await q(
      `insert into rcm_row (engagement_id, control_id, risk_desc, assertions, coso_component) values ($1,$2,$3,$4,$5)`,
      [engagementId, control.id, get('risk_desc'), assertionsList, get('coso_component')],
    );
    /* CTRL-02 (mandat contrôle interne, §2.4.1) : « ce facteur porte un lien vers les objets
       risque réels, jamais du texte libre seul ». `risk_desc` ci-dessus reste le texte du
       listing RCM (`rcm_row`, convention déjà en place, 0002) — mais chaque contrôle importé
       reçoit AUSSI un vrai risque en base (`risk`, 0001) par assertion listée, lié par
       `control_risk` (0150) : c'est CE lien, jamais le texte de `rcm_row`, que le facteur
       « réponse au risque » doit citer pour ne pas être un décor. Le niveau est dérivé du seul
       signal réellement présent dans le CSV (`is_key`) — pas une constante inventée : un
       contrôle clé répond à un risque tenu pour `high`, sinon `medium`.
       `source = 'rcm_import'` (règle 3 : ceci n'est PAS 'manual' — aucun humain n'a saisi ce
       risque, il est synthétisé depuis le CSV) et l'écriture est un upsert ATOMIQUE sur
       `unique(engagement_id, assertion, description)` (0150) — trouvé par la revue hostile du
       2026-09-08 (voix 2) : la forme précédente (SELECT puis INSERT) était une course
       vérification-puis-écriture, deux appels concurrents pouvant créer deux lignes `risk`
       identiques en silence. */
    for (const assertion of assertionsList) {
      const risque = await q1<{ id: string }>(
        `insert into risk (engagement_id, assertion, level, description, source) values ($1,$2,$3,$4,'rcm_import')
         on conflict (engagement_id, assertion, description) do update set assertion = excluded.assertion
         returning id`,
        [engagementId, assertion, get('is_key') === 'yes' ? 'high' : 'medium', get('risk_desc')],
      );
      await q(
        `insert into control_risk (engagement_id, control_id, risk_id) values ($1,$2,$3)
         on conflict (control_id, risk_id) do nothing`,
        [engagementId, control.id, risque.id],
      );
    }
    for (const a of ATTRIBUTES_BY_CONTROL[get('code')] ?? DEFAULT_ATTRIBUTES) {
      await q(
        `insert into attribute_def (control_id, code, description, required) values ($1,$2,$3,$4)`,
        [control.id, a.code, a.description, a.required],
      );
    }
    count++;
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'rcm_imported', objectType: 'control', payload: { controls: count },
  });
  return count;
}

export async function listControls(engagementId: string) {
  return q<{
    id: string; code: string; name: string; description: string; frequency: string; nature: string;
    effect: string; is_key: boolean; owner_name: string | null; di_status: string; process_name: string;
    itgc_code: string | null; risk_desc: string | null; coso_component: string | null;
    instance_count: string; deviation_count: string; test_status: string | null; test_conclusion: string | null;
    di_walkthrough_evidence_id: string | null;
  }>(
    `select c.id, c.code, c.name, c.description, c.frequency, c.nature, c.effect, c.is_key,
            c.owner_name, c.di_status, c.di_walkthrough_evidence_id, p.name process_name, i.code itgc_code,
            r.risk_desc, r.coso_component,
            (select count(*) from control_instance ci where ci.control_id = c.id) instance_count,
            (select count(*) from deviation d where d.control_id = c.id) deviation_count,
            (select ct.status from control_test ct where ct.control_id = c.id order by ct.id desc limit 1) test_status,
            (select ct.conclusion from control_test ct where ct.control_id = c.id order by ct.id desc limit 1) test_conclusion
     from control c
     left join process p on p.id = c.process_id
     left join itgc_area i on i.id = c.itgc_area_id
     left join rcm_row r on r.control_id = c.id
     where c.engagement_id = $1 order by c.code`,
    [engagementId],
  );
}

// ---------- S8x: le walkthrough et ses tâches (mandat contrôle interne, 2026-09-08, §2) ----------

/** L'enregistrement vidéo du walkthrough — cette pièce EST l'Inquiry (§2.1.1). Ancré
 *  directement sur `control` (pas sur la table `walkthrough` de 0002, morte et mal ancrée
 *  sur `process_id` — voir 0148). Un contrôle réenregistré remplace le lien : la PIÈCE reste
 *  au dossier (jamais supprimée), seul le lien change — les tâches déjà créées gardent leur
 *  citation de l'ancienne pièce dans leur ligne d'inquiry, elles ne sont jamais réécrites en
 *  silence. */
export async function attacherWalkthrough(controlId: string, userId: string, evidenceId: string): Promise<void> {
  await assertMembreDe('control', controlId, userId, 'attacher un enregistrement de walkthrough');
  const c = await q1<{ engagement_id: string; code: string }>(`select engagement_id, code from control where id = $1`, [controlId]);
  const ctx = await engagementCtx(c.engagement_id);
  const ev = await q1<{ engagement_id: string; quarantined: boolean }>(`select engagement_id, quarantined from evidence where id = $1`, [evidenceId]);
  if (ev.engagement_id !== c.engagement_id) throw new Error('cette pièce n’appartient pas à ce dossier');
  if (ev.quarantined) throw new Error('une pièce en quarantaine ne peut pas servir d’enregistrement de walkthrough');
  await q(`update control set di_walkthrough_evidence_id = $2 where id = $1`, [controlId, evidenceId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'walkthrough_attached', objectType: 'control', objectId: controlId, payload: { code: c.code, evidenceId },
  });
}

export interface TacheControle {
  id: string; seq_no: number; description: string; video_timestamp: string | null;
  procedures: { procedure: string; notes: string; evidence_id: string | null }[];
}

export async function listerTachesControle(controlId: string): Promise<TacheControle[]> {
  const taches = await q<{ id: string; seq_no: number; description: string; video_timestamp: string | null }>(
    `select id, seq_no, description, video_timestamp from control_task where control_id = $1 order by seq_no`,
    [controlId],
  );
  const out: TacheControle[] = [];
  for (const t of taches) {
    const procedures = await q<{ procedure: string; notes: string; evidence_id: string | null }>(
      `select procedure, notes, evidence_id from control_task_procedure where task_id = $1 order by procedure`,
      [t.id],
    );
    out.push({ ...t, procedures });
  }
  return out;
}

/** Une tâche = une ligne (§2.1.2), établie à partir de la vidéo ET de la documentation du
 *  client. Exige la vidéo déjà attachée (§2.1 : l'ordre est vidéo PUIS liste des tâches) — pas
 *  un code CTRL-nn, le mandat n'en nomme aucun pour cette précondition, donc aucun n'est
 *  inventé ici (règle 18). L'inquiry est SYSTÉMATIQUE (§2.2) : posée ici-même, une seule fois,
 *  citant la vidéo — c'est ce qui rend CTRL-01 lisible comme un simple compte de lignes. */
export async function ajouterTacheControle(
  controlId: string, userId: string, description: string, videoTimestamp?: string,
): Promise<string> {
  await assertMembreDe('control', controlId, userId, 'documenter une tâche du walkthrough');
  if (!description.trim()) throw new Error('la tâche a besoin d’une description — ce que le control owner a réellement fait');
  const c = await q1<{ engagement_id: string; code: string; di_walkthrough_evidence_id: string | null }>(
    `select engagement_id, code, di_walkthrough_evidence_id from control where id = $1`,
    [controlId],
  );
  if (!c.di_walkthrough_evidence_id) {
    throw new Error('le walkthrough n’a pas encore d’enregistrement vidéo attaché — attachez-le avant d’en tirer des tâches');
  }
  const ctx = await engagementCtx(c.engagement_id);
  const seq = await q1<{ n: string }>(`select coalesce(max(seq_no),0) n from control_task where control_id = $1`, [controlId]);
  const task = await q1<{ id: string }>(
    `insert into control_task (engagement_id, control_id, seq_no, description, video_timestamp, created_by)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [c.engagement_id, controlId, Number(seq.n) + 1, description.trim(), videoTimestamp?.trim() || null, userId],
  );
  await q(
    `insert into control_task_procedure (engagement_id, task_id, procedure, notes, evidence_id, created_by)
     values ($1,$2,'inquiry',$3,$4,$5)`,
    [c.engagement_id, task.id, 'Entretien — le walkthrough enregistré (§2.1.1, mandat contrôle interne).', c.di_walkthrough_evidence_id, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_task_added', objectType: 'control', objectId: controlId,
    payload: { code: c.code, taskId: task.id, description: description.trim() },
  });
  return task.id;
}

const PROCEDURES_DOCUMENTABLES = ['inspection', 'observation', 'reperformance'] as const;

/** CTRL-01 (§2.2) : « l'inquiry seule ne conclut rien. » Cette fonction documente le SEUL
 *  moyen prévu de satisfaire la règle — inspection, observation, ré-exécution — JAMAIS
 *  'inquiry', déjà posée une fois pour toutes par `ajouterTacheControle` et qui cite la vidéo
 *  du walkthrough : la garde ci-dessous est RUNTIME, pas seulement le type TypeScript (revue
 *  hostile du 2026-09-08, les deux voix, constat convergent — un `FormData` posté à la main
 *  n'est pas contraint par le `<select>` du formulaire). Un second appel sur la même (tâche,
 *  procédure) ÉDITE la ligne (upsert) : deux inspections de la même tâche sont une correction,
 *  pas deux preuves — mais l'ANCIENNE note et pièce sont conservées dans `event_log` avant
 *  d'être remplacées (règle 3 : la provenance ne se rattrape pas après coup). CE QUE CETTE
 *  FONCTION NE FAIT PAS (règle 19) : elle ne conserve pas d'historique EN BASE des versions
 *  précédentes — seul `event_log` les porte, pas de table de révisions dédiée. */
export async function documenterProcedureTache(
  taskId: string, userId: string, procedure: 'inspection' | 'observation' | 'reperformance', notes: string, evidenceId?: string,
): Promise<void> {
  /* ISOLATION D'ABORD, TOUJOURS (revue hostile du 2026-09-08, voix 2, tranche 2 du lot
     contrôle interne) : l'ordre inverse (valider la valeur AVANT `assertMembreDe`) fait fuir,
     par la FORME du refus, qu'un objet existe même à un acteur d'un autre dossier — un appel à
     valeur invalide reçoit le refus CTRL-01 (« pas une procédure documentable ») au lieu du
     refus d'étanchéité, ce qui distingue « objet à moi, payload invalide » de « objet pas à
     moi ». `assertMembreDe` tourne donc EN PREMIER, avant toute validation de valeur. */
  const engagementId = await assertMembreDe('control_task', taskId, userId, 'documenter une procédure de tâche');
  if (!PROCEDURES_DOCUMENTABLES.includes(procedure)) {
    throw new Error(`CTRL-01 : « ${procedure} » n’est pas une procédure documentable ici — inspection, observation ou `
      + 'ré-exécution seulement (l’inquiry est posée automatiquement, une seule fois, à la création de la tâche).');
  }
  if (!notes.trim()) throw new Error('la procédure a besoin d’une note — ce qui a été inspecté, observé ou ré-exécuté, et ce qui en ressort');
  const ctx = await engagementCtx(engagementId);
  if (evidenceId) {
    const ev = await q1<{ engagement_id: string; quarantined: boolean }>(`select engagement_id, quarantined from evidence where id = $1`, [evidenceId]);
    if (ev.engagement_id !== engagementId) throw new Error('cette pièce n’appartient pas à ce dossier');
    if (ev.quarantined) throw new Error('une pièce en quarantaine ne peut pas corroborer une procédure documentée');
  }
  const precedente = await q01<{ notes: string; evidence_id: string | null; created_by: string | null }>(
    `select notes, evidence_id, created_by from control_task_procedure where task_id = $1 and procedure = $2`,
    [taskId, procedure],
  );
  await q(
    `insert into control_task_procedure (engagement_id, task_id, procedure, notes, evidence_id, created_by)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (task_id, procedure) do update set notes = $4, evidence_id = $5, created_by = $6, created_at = now()`,
    [engagementId, taskId, procedure, notes.trim(), evidenceId ?? null, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'control_task_procedure_documented', objectType: 'control_task', objectId: taskId,
    payload: {
      procedure, notes: notes.trim().slice(0, 500), hasEvidence: Boolean(evidenceId),
      remplace: precedente ? { notes: precedente.notes.slice(0, 500), evidenceId: precedente.evidence_id, par: precedente.created_by } : null,
    },
  });
}

// ---------- S8y: les IUC et les facteurs de design (mandat contrôle interne, 2026-09-08, §2.3, §2.4) ----------

const FACTEURS_DESIGN = ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'] as const;
type FacteurDesign = (typeof FACTEURS_DESIGN)[number];

export interface RisqueDuDossier { id: string; fsli_code: string | null; assertion: string; level: string; description: string }

/** Les risques du dossier (`risk`, 0001), pour choisir lesquels un contrôle adresse (§2.4.1)
 *  — jamais du texte libre : le facteur « réponse au risque » exige un lien vers un objet
 *  RÉEL de cette liste, pas une nouvelle saisie. Pas `fsli_assertion_risk` (0012) : ce dernier
 *  est un NIVEAU CALCULÉ qui commande le programme substantif ISA/NEP, un axe orthogonal —
 *  voir l'en-tête de la migration 0150. */
export async function risquesDuDossier(engagementId: string): Promise<RisqueDuDossier[]> {
  return q<RisqueDuDossier>(
    `select id, fsli_code, assertion, level, description from risk where engagement_id = $1 order by fsli_code, assertion`,
    [engagementId],
  );
}

export async function risquesLiesAuControle(controlId: string): Promise<RisqueDuDossier[]> {
  return q<RisqueDuDossier>(
    `select r.id, r.fsli_code, r.assertion, r.level, r.description from control_risk cr
     join risk r on r.id = cr.risk_id where cr.control_id = $1 order by r.fsli_code, r.assertion`,
    [controlId],
  );
}

/** §2.4.1 : « ce facteur porte un lien vers les objets risque réels, jamais du texte libre
 *  seul ». Le lien lui-même, séparé de sa conclusion écrite (`documenterFacteurDesign`) — un
 *  contrôle peut répondre à plusieurs risques, posés l'un après l'autre. */
export async function lierRisqueControle(controlId: string, userId: string, riskId: string): Promise<void> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'lier un risque à un contrôle');
  const r = await q01<{ engagement_id: string }>(`select engagement_id from risk where id = $1`, [riskId]);
  if (!r || r.engagement_id !== engagementId) throw new Error('ce risque n’appartient pas à ce dossier');
  const ctx = await engagementCtx(engagementId);
  await q(
    `insert into control_risk (engagement_id, control_id, risk_id, created_by) values ($1,$2,$3,$4)
     on conflict (control_id, risk_id) do nothing`,
    [engagementId, controlId, riskId, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'control_risk_linked', objectType: 'control', objectId: controlId, payload: { riskId },
  });
}

export async function delierRisqueControle(controlId: string, userId: string, riskId: string): Promise<void> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'délier un risque d’un contrôle');
  const ctx = await engagementCtx(engagementId);
  await q(`delete from control_risk where control_id = $1 and risk_id = $2`, [controlId, riskId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'control_risk_unlinked', objectType: 'control', objectId: controlId, payload: { riskId },
  });
}

export interface FacteurDesignDocumente { factor: FacteurDesign; conclusion: string; created_by: string | null; created_at: string }

export async function facteursDesignDuControle(controlId: string): Promise<FacteurDesignDocumente[]> {
  return q<FacteurDesignDocumente>(
    `select factor, conclusion, created_by, created_at::text from control_design_factor where control_id = $1`,
    [controlId],
  );
}

/** CTRL-02 (§2.4) : chacun des quatre facteurs exige sa propre conclusion écrite avant de
 *  conclure le D&I — gardé à l'écriture (upsert, un facteur = une ligne), REVÉRIFIÉ à la
 *  conclusion (`setDiStatus`) parce que rien n'empêche structurellement un facteur écrit
 *  aujourd'hui d'être seul quand un autre manque encore — la garde ne suppose jamais qu'un
 *  chemin d'écriture partielle n'existe pas (règle 17). ISOLATION D'ABORD (revue hostile du
 *  2026-09-08, voix 2) : un premier passage validait `factor` avant `assertMembreDe` — un type
 *  TypeScript inline (au lieu d'un alias nommé) faisait passer le test d'étanchéité auto-généré
 *  SANS fermer le vrai trou (le harnais fabrique alors une valeur VALIDE et n'exerce plus jamais
 *  la combinaison valeur-invalide + acteur-étranger) : un appel à valeur invalide révélait la
 *  forme du refus CTRL-02 plutôt que le refus d'étanchéité, apprenant à un acteur d'un autre
 *  dossier que l'objet existe. `assertMembreDe` tourne donc EN PREMIER, avant toute validation
 *  de valeur — la garde d'étanchéité ne doit jamais dépendre de la FORME du type du paramètre.
 *  Révision : l'ANCIENNE conclusion est conservée dans `event_log` avant d'être remplacée
 *  (règle 3, même patron que `documenterProcedureTache`). */
export async function documenterFacteurDesign(
  controlId: string, userId: string,
  factor: 'reponse_risque' | 'autorite_competence' | 'frequence_constance' | 'seuil_investigation',
  conclusion: string,
): Promise<void> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'documenter un facteur de design');
  if (!FACTEURS_DESIGN.includes(factor)) {
    throw new Error(`CTRL-02 : « ${factor} » n’est pas un facteur de design reconnu — réponse au risque, autorité et `
      + 'compétence, fréquence et constance, ou seuil et critères d’investigation seulement.');
  }
  if (!conclusion.trim()) throw new Error('le facteur a besoin d’une conclusion écrite — le jugement de l’auditeur, pas seulement les faits bruts');
  const ctx = await engagementCtx(engagementId);
  const precedent = await q01<{ conclusion: string; created_by: string | null }>(
    `select conclusion, created_by from control_design_factor where control_id = $1 and factor = $2`,
    [controlId, factor],
  );
  await q(
    `insert into control_design_factor (engagement_id, control_id, factor, conclusion, created_by)
     values ($1,$2,$3,$4,$5)
     on conflict (control_id, factor) do update set conclusion = $4, created_by = $5, created_at = now()`,
    [engagementId, controlId, factor, conclusion.trim(), userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'control_design_factor_documented', objectType: 'control', objectId: controlId,
    payload: {
      factor, conclusion: conclusion.trim().slice(0, 500),
      remplace: precedent ? { conclusion: precedent.conclusion.slice(0, 500), par: precedent.created_by } : null,
    },
  });
}

export interface IucDuControle { id: string; utilisee: boolean; description: string | null; preuves: { volet: string; conclusion: string; evidence_id: string | null }[] }

export async function iucDuControle(controlId: string): Promise<IucDuControle | null> {
  const iuc = await q01<{ id: string; utilisee: boolean; description: string | null }>(
    `select id, utilisee, description from control_iuc where control_id = $1`,
    [controlId],
  );
  if (!iuc) return null;
  const preuves = await q<{ volet: string; conclusion: string; evidence_id: string | null }>(
    `select volet, conclusion, evidence_id from control_iuc_preuve where iuc_id = $1 order by volet`,
    [iuc.id],
  );
  return { ...iuc, preuves };
}

/** §2.3 : « une IUC est-elle utilisée ? » — une déclaration PAR CONTRÔLE, pas par tâche.
 *  Redéclarer 'non' après 'oui' n'efface PAS les preuves déjà écrites (elles restent au
 *  dossier, règle 28) — seule la déclaration change ; CTRL-03 ne les exige plus tant que
 *  `utilisee` est redevenu faux, mais elles restent lisibles au dossier. Révision : l'ANCIENNE
 *  déclaration est conservée dans `event_log` avant d'être remplacée (règle 3). */
export async function declarerIuc(controlId: string, userId: string, utilisee: boolean, description?: string): Promise<void> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'déclarer l’usage d’une IUC');
  const ctx = await engagementCtx(engagementId);
  const precedent = await q01<{ utilisee: boolean; description: string | null; created_by: string | null }>(
    `select utilisee, description, created_by from control_iuc where control_id = $1`,
    [controlId],
  );
  await q(
    `insert into control_iuc (engagement_id, control_id, utilisee, description, created_by)
     values ($1,$2,$3,$4,$5)
     on conflict (control_id) do update set utilisee = $3, description = $4, created_by = $5, created_at = now()`,
    [engagementId, controlId, utilisee, description?.trim() || null, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'control_iuc_declared', objectType: 'control', objectId: controlId,
    payload: {
      utilisee, description: description ?? null,
      remplace: precedent ? { utilisee: precedent.utilisee, description: precedent.description, par: precedent.created_by } : null,
    },
  });
}

/** CTRL-03 (§2.3) : une IUC déclarée utilisée exige exactitude ET exhaustivité, chacune sa
 *  propre preuve — deux volets, jamais fusionnés (une seule note qui dit « exact et complet »
 *  ne nomme ni l'un ni l'autre si on l'interroge après coup, exactement ce que le mandat
 *  demande d'éviter : « le refus nomme laquelle des deux manque »). ISOLATION D'ABORD — même
 *  raison et même correction que `documenterFacteurDesign` ci-dessus (revue hostile du
 *  2026-09-08, voix 2) : `assertMembreDe` tourne avant toute validation de `volet`. Révision :
 *  l'ANCIENNE preuve est conservée dans `event_log` avant d'être remplacée (règle 3). */
export async function documenterIucPreuve(controlId: string, userId: string, volet: 'exactitude' | 'exhaustivite', conclusion: string, evidenceId?: string): Promise<void> {
  const engagementId = await assertMembreDe('control', controlId, userId, 'documenter une preuve IUC');
  if (volet !== 'exactitude' && volet !== 'exhaustivite') {
    throw new Error(`CTRL-03 : « ${volet} » n’est pas un volet reconnu — exactitude ou exhaustivité seulement.`);
  }
  if (!conclusion.trim()) throw new Error('la preuve a besoin d’une conclusion écrite');
  const iuc = await q01<{ id: string; utilisee: boolean }>(`select id, utilisee from control_iuc where control_id = $1`, [controlId]);
  if (!iuc) throw new Error('CTRL-03 : déclarez d’abord si une IUC est utilisée avant d’en documenter la preuve.');
  if (!iuc.utilisee) throw new Error('CTRL-03 : ce contrôle est déclaré sans IUC utilisée — aucune preuve n’est requise ni attendue.');
  if (evidenceId) {
    const ev = await q1<{ engagement_id: string; quarantined: boolean }>(`select engagement_id, quarantined from evidence where id = $1`, [evidenceId]);
    if (ev.engagement_id !== engagementId) throw new Error('cette pièce n’appartient pas à ce dossier');
    if (ev.quarantined) throw new Error('une pièce en quarantaine ne peut pas corroborer une preuve IUC');
  }
  const precedent = await q01<{ conclusion: string; evidence_id: string | null; created_by: string | null }>(
    `select conclusion, evidence_id, created_by from control_iuc_preuve where iuc_id = $1 and volet = $2`,
    [iuc.id, volet],
  );
  const ctx = await engagementCtx(engagementId);
  await q(
    `insert into control_iuc_preuve (engagement_id, iuc_id, volet, conclusion, evidence_id, created_by)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (iuc_id, volet) do update set conclusion = $4, evidence_id = $5, created_by = $6, created_at = now()`,
    [engagementId, iuc.id, volet, conclusion.trim(), evidenceId ?? null, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'control_iuc_preuve_documented', objectType: 'control', objectId: controlId,
    payload: {
      volet, conclusion: conclusion.trim().slice(0, 500), hasEvidence: Boolean(evidenceId),
      remplace: precedent ? { conclusion: precedent.conclusion.slice(0, 500), evidenceId: precedent.evidence_id, par: precedent.created_by } : null,
    },
  });
}

export async function setDiStatus(controlId: string, userId: string, status: 'effective' | 'deficient', conclusion: string): Promise<void> {
  await assertMembreDe('control', controlId, userId, 'statuer la conception d’un contrôle');
  if (!conclusion.trim()) throw new Error('D&I conclusion required');
  const c = await q1<{ engagement_id: string; code: string }>(`select engagement_id, code from control where id = $1`, [controlId]);
  const taches = await q<{ id: string; description: string }>(
    `select id, description from control_task where control_id = $1 order by seq_no`,
    [controlId],
  );
  if (taches.length === 0) {
    throw new Error('CTRL-01 : aucune tâche documentée — établissez la liste des tâches à partir du walkthrough avant de conclure le design et l’implémentation.');
  }
  for (const t of taches) {
    const preuve = await q01(
      `select 1 from control_task_procedure where task_id = $1 and procedure <> 'inquiry'`,
      [t.id],
    );
    if (!preuve) {
      throw new Error(
        `CTRL-01 : la tâche « ${t.description} » n’est documentée que par l’inquiry — au moins une inspection, `
        + 'observation ou ré-exécution est requise avant de conclure.',
      );
    }
  }
  const facteurs = await q<{ factor: string }>(`select factor from control_design_factor where control_id = $1`, [controlId]);
  const facteursManquants = FACTEURS_DESIGN.filter((f) => !facteurs.some((x) => x.factor === f));
  if (facteursManquants.length > 0) {
    throw new Error(`CTRL-02 : facteur(s) de design sans conclusion écrite — ${facteursManquants.join(', ')}.`);
  }
  const lienRisque = await q01(`select 1 from control_risk where control_id = $1`, [controlId]);
  if (!lienRisque) {
    throw new Error('CTRL-02 : le facteur « réponse au risque » ne pointe aucun risque réel — un contrôle qui ne pointe aucun risque existant est un décor.');
  }
  const iuc = await q01<{ id: string; utilisee: boolean }>(`select id, utilisee from control_iuc where control_id = $1`, [controlId]);
  if (!iuc) {
    throw new Error('CTRL-03 : aucune déclaration IUC — indiquez si le contrôle utilise une information produite par l’entité avant de conclure.');
  }
  if (iuc.utilisee) {
    const preuves = await q<{ volet: string }>(`select volet from control_iuc_preuve where iuc_id = $1`, [iuc.id]);
    const voletsManquants = (['exactitude', 'exhaustivite'] as const).filter((v) => !preuves.some((p) => p.volet === v));
    if (voletsManquants.length > 0) {
      throw new Error(`CTRL-03 : IUC déclarée utilisée sans ${voletsManquants.join(' ni ')} documentée(s).`);
    }
  }
  const ctx = await engagementCtx(c.engagement_id);
  await q(`update control set di_status = $2, di_conclusion = $3 where id = $1`, [controlId, status, conclusion]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'di_assessed', objectType: 'control', objectId: controlId, payload: { code: c.code, status, conclusion },
  });
}

export async function importInstances(controlId: string, csv: string, userId: string): Promise<number> {
  await assertMembreDe('control', controlId, userId, 'importer les occurrences d’un contrôle');
  const c = await q1<{ engagement_id: string; code: string; di_status: string }>(
    `select engagement_id, code, di_status from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const lines = csv.trim().split(/\r?\n/).slice(1);
  let n = 0;
  for (const line of lines) {
    const [label, occurredOn, performer] = line.split(';');
    const exists = await q01(`select id from control_instance where control_id = $1 and label = $2`, [controlId, label]);
    if (exists) continue;
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,$2,$3,$4,'listing')`,
      [controlId, label, occurredOn || null, performer || null],
    );
    n++;
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_instances_imported', objectType: 'control', objectId: controlId,
    payload: { code: c.code, instances: n },
  });
  return n;
}

/** Mandat contrôle interne, §3.1 : les fréquences RÉGULIÈRES dérivent leur population de la
 *  fréquence et de la période — le système la calcule. `adhoc`/`many_daily` en sont exclus
 *  DÉLIBÉRÉMENT (règle 19, où cette règle cesse de regarder) : le mandat ne nomme que
 *  « annuelle, mensuelle, hebdomadaire, quotidienne » (§3.1, le tableau) ; `many_daily` implique
 *  un nombre d'occurrences par jour qu'aucune fréquence ni période ne peut donner sans une
 *  constante inventée (règle 8 — jamais une valeur écrite de mémoire), donc ce n'est pas une
 *  omission mais un refus honnête de deviner. Ces deux fréquences restent sur le chemin de
 *  demande client (`importInstances`, CTRL-05 à venir). */
export const FREQUENCES_DERIVABLES: readonly Frequency[] = ['annual', 'quarterly', 'monthly', 'weekly', 'daily'];

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

/** Pure, testable sans base : les dates d'occurrence d'une fréquence régulière sur une période
 *  [debut, fin] incluse. Toujours en UTC (règle : jamais de dérive de fuseau sur une date de
 *  calendrier). Exportée pour ses propres tests unitaires (règle 17).
 *
 *  UN CYCLE FINAL PARTIEL (la période ne se termine pas exactement à la fin d'un cycle complet
 *  de la fréquence) N'EST JAMAIS INCLUS, POUR AUCUNE FRÉQUENCE — un contrôle « mensuel » sur une
 *  période qui s'arrête le 15 n'a pas eu 15 jours de mois, il n'a pas eu ce mois-là. `quarterly`
 *  suit la MÊME règle que `monthly`/`weekly`/`daily` (corrigé le 2026-09-09, revue hostile voix 1
 *  du lot contrôle interne, tranche 4 : la version d'origine bornait le trimestre en DUR à 4
 *  itérations ET tronquait le dernier trimestre à la fin de période au lieu de l'exclure — sur
 *  une période de PLUS de 12 mois (un premier exercice allongé, cas réel : `creerExercice`,
 *  engagement.ts, n'impose que `debut < fin`), les mois au-delà du 4e trimestre disparaissaient
 *  SANS AUCUNE erreur, silencieusement). Toutes les fréquences bouclent maintenant `for(;;)`
 *  jusqu'à dépasser `fin`, jamais un nombre d'itérations fixé d'avance. */
export function occurrencesDeLaPeriode(frequency: Frequency, debut: string, fin: string): { label: string; occurredOn: string }[] {
  const d0 = new Date(`${debut}T00:00:00Z`);
  const d1 = new Date(`${fin}T00:00:00Z`);
  const occ: { label: string; occurredOn: string }[] = [];
  if (frequency === 'annual') {
    occ.push({ label: `Exercice clos le ${iso(d1)}`, occurredOn: iso(d1) });
  } else if (frequency === 'quarterly') {
    for (let q = 1; ; q++) {
      const d = new Date(d0); d.setUTCMonth(d.getUTCMonth() + 3 * q); d.setUTCDate(d.getUTCDate() - 1);
      if (d > d1) break;
      occ.push({ label: `Trimestre ${q}, clos le ${iso(d)}`, occurredOn: iso(d) });
    }
  } else if (frequency === 'monthly') {
    for (let m = 1; ; m++) {
      const d = new Date(d0); d.setUTCMonth(d.getUTCMonth() + m); d.setUTCDate(d.getUTCDate() - 1);
      if (d > d1) break;
      occ.push({ label: `Mois ${m}, clos le ${iso(d)}`, occurredOn: iso(d) });
    }
  } else if (frequency === 'weekly') {
    for (let s = 1; ; s++) {
      const d = new Date(d0); d.setUTCDate(d.getUTCDate() + 7 * s - 1);
      if (d > d1) break;
      occ.push({ label: `Semaine ${s}, close le ${iso(d)}`, occurredOn: iso(d) });
    }
  } else if (frequency === 'daily') {
    let i = 1;
    for (const d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1), i++) {
      occ.push({ label: `Jour ${i} (${iso(d)})`, occurredOn: iso(d) });
    }
  }
  return occ;
}

export async function deriverPopulationControle(controlId: string, userId: string): Promise<number> {
  await assertMembreDe('control', controlId, userId, 'dériver la population d’un contrôle');
  const c = await q1<{ engagement_id: string; code: string; frequency: Frequency }>(
    `select engagement_id, code, frequency from control where id = $1`,
    [controlId],
  );
  if (!FREQUENCES_DERIVABLES.includes(c.frequency)) {
    throw new Error(
      `population non dérivable pour la fréquence « ${c.frequency} » (mandat §3.1) — elle se `
      + 'demande au client, pas au système : importez le listing client pour ce contrôle.',
    );
  }
  const existe = await q01(`select 1 from control_instance where control_id = $1`, [controlId]);
  if (existe) {
    throw new Error('population déjà présente pour ce contrôle — la dérivation ne s’exécute qu’une fois, sur une population vide');
  }
  const periode = await q1<{ start_date: string; end_date: string }>(
    `select p.start_date::text as start_date, p.end_date::text as end_date
     from engagement e join period p on p.id = e.period_id where e.id = $1`,
    [c.engagement_id],
  );
  const occurrences = occurrencesDeLaPeriode(c.frequency, periode.start_date, periode.end_date);
  for (const o of occurrences) {
    await q(
      `insert into control_instance (control_id, label, occurred_on, source) values ($1,$2,$3,'derived')`,
      [controlId, o.label, o.occurredOn],
    );
  }
  const ctx = await engagementCtx(c.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_population_derived', objectType: 'control', objectId: controlId,
    payload: { code: c.code, frequency: c.frequency, instances: occurrences.length, period: periode },
  });
  return occurrences.length;
}

// ---------- S8b: attribute sampling → evidence request → testing → deviations ----------

/** CTRL-07 (mandat contrôle interne, §3.2) : la taille sort d'une table du CABINET, jamais
 *  d'une valeur écrite de mémoire. La table livrée est VIDE (`pcaob-sox.ts`) — cette fonction dit
 *  pourquoi, dans la même forme que l'écran doit l'afficher, pour que le service et l'écran ne
 *  divergent jamais sur ce qu'ils considèrent « vérifié ». */
export function tailleEchantillonOe(pack: { attributeSampleSizes?: Partial<Record<Frequency, number>> }, frequency: Frequency): { valeur: number; verifie: true } | { valeur: null; verifie: false } {
  const valeur = pack.attributeSampleSizes?.[frequency];
  return valeur === undefined ? { valeur: null, verifie: false } : { valeur, verifie: true };
}

/** Même lecture que `drawAttributeSample`, pour un écran qui doit savoir AVANT de soumettre si
 *  la taille sera vérifiée ou non — le formulaire ne doit jamais afficher une valeur que le
 *  service refusera ensuite (règle 13). */
export async function tailleEchantillonOePourControle(controlId: string): Promise<ReturnType<typeof tailleEchantillonOe>> {
  const c = await q1<{ engagement_id: string; frequency: Frequency }>(
    `select engagement_id, frequency from control where id = $1`,
    [controlId],
  );
  const fs = await frameworkSet(c.engagement_id);
  const pack = primaryPack(fs as never);
  return tailleEchantillonOe(pack, c.frequency);
}

export async function drawAttributeSample(controlId: string, userId: string, overrideSize?: number, overrideJustification?: string): Promise<{ sampleId: string; requestId: string; selected: string[] }> {
  await assertMembreDe('control', controlId, userId, 'tirer un échantillon d’attributs');
  const c = await q1<{ id: string; engagement_id: string; code: string; name: string; frequency: Frequency; di_status: string }>(
    `select id, engagement_id, code, name, frequency, di_status from control where id = $1`,
    [controlId],
  );
  if (c.di_status !== 'effective') {
    throw new Error(`D&I gate: control ${c.code} is '${c.di_status}' — operating-effectiveness testing requires an effective design & implementation assessment first`);
  }
  const ctx = await engagementCtx(c.engagement_id);
  const fs = await frameworkSet(c.engagement_id);
  const pack = primaryPack(fs as never);
  if (overrideSize !== undefined && !overrideJustification?.trim()) {
    throw new Error('overriding the pack sample size requires a written justification (ADR-010)');
  }
  let size: number;
  if (overrideSize !== undefined) {
    size = overrideSize;
  } else {
    const table = tailleEchantillonOe(pack, c.frequency);
    if (!table.verifie) {
      throw new Error(
        `CTRL-07 : aucune taille d’échantillon vérifiée pour la fréquence « ${c.frequency} » — `
        + 'paramètre non vérifié, à fixer par le cabinet (mandat §3.2). Saisissez une taille avec '
        + 'sa justification écrite en attendant (ADR-010).',
      );
    }
    size = table.valeur;
  }
  const instances = await q<{ id: string; label: string; occurred_on: string | null; performer_name: string | null }>(
    `select id, label, occurred_on::text, performer_name from control_instance where control_id = $1 order by label`,
    [controlId],
  );
  if (instances.length === 0) throw new Error('no instance population — import the client listing first');
  const popHash = controlPopulationHash(instances.map((i) => ({ label: i.label, occurredOn: i.occurred_on ?? undefined, performerName: i.performer_name ?? undefined })));
  const seed = `${pack.attributeSeedDefault}:${c.code}`;
  const draw = attributeDraw(instances.map((i) => i.label), size, seed, popHash);

  const procedure = await q1<{ id: string }>(
    /* nature = 'tests_de_controles' EXPLICITE (Lot 3, tranche 1) : `OE-${code}`
       est un template SOX, hors catalogue ISA methodology/procedures.json —
       même motif que sampling.ts::ensureRevenueProcedure ci-dessus (règle 13,
       pas de repli silencieux sur le défaut de colonne). Un test attributif
       sur des occurrences de contrôle EST la définition même de cette
       nature (mandat, table C.1). */
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, control_id, title, status, nature)
     values ($1,$2,$3,'control_test',$4,$5,'in_progress','tests_de_controles') returning id`,
    [c.engagement_id, pack.id, `OE-${c.code}`, controlId, `Operating effectiveness — ${c.code} ${c.name}`],
  );
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'sampling','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, pack.id, hashObject({ size, seed }), JSON.stringify({ control: c.code, size, seed, populationHash: popHash, basis: pack.attributeSampleBasis, override: overrideJustification ?? null })],
  );
  const sample = await q1<{ id: string }>(
    `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, rationale, status, validated_by, validated_at, engine_run_id)
     values ($1,$2,'attribute_frequency',$3,$4,$5,$6,$7,'drawn',$8, now(), $9) returning id`,
    [
      c.engagement_id, procedure.id, JSON.stringify({ size, frequency: c.frequency, override: overrideJustification ?? null }),
      seed, popHash, instances.length,
      `Frequency-based OE sample: ${c.frequency} control ⇒ ${size} instance(s). Basis: ${pack.attributeSampleBasis} Seed "${seed}" — reproducible.`,
      userId, run.id,
    ],
  );
  const byLabel = new Map(instances.map((i) => [i.label, i]));
  for (const label of draw.selected) {
    await q(
      `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason) values ($1,'control_instance',$2,'random')`,
      [sample.id, byLabel.get(label)!.id],
    );
  }
  await q(
    `insert into control_test (control_id, procedure_id, sample_id, status) values ($1,$2,$3,'testing')`,
    [controlId, procedure.id, sample.id],
  );

  // per-sampled-instance evidence request (Gate 2 two-request flow)
  const seqRow = await q1<{ n: string }>(`select coalesce(max(seq_no),0) n from request where engagement_id = $1`, [c.engagement_id]);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, procedure_id, title, language, status)
     values ($1,$2,$3,$4,'en','draft') returning id`,
    [c.engagement_id, Number(seqRow.n) + 1, procedure.id, `Evidence — ${c.code} ${c.name} (sampled instances)`],
  );
  for (const label of draw.selected) {
    await q(
      `insert into request_item (request_id, kind, description, control_instance_id)
       values ($1,'document',$2,$3)`,
      [request.id, `Signed evidence of performance — ${c.code}, instance ${label}`, byLabel.get(label)!.id],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'attribute_sample_drawn', objectType: 'sample', objectId: sample.id,
    payload: { control: c.code, size, seed, selected: draw.selected, engineRun: run.id, requestedBy: userId },
  });
  return { sampleId: sample.id, requestId: request.id, selected: draw.selected };
}

function monthEndPlus(label: string, days: number): string {
  const m = Number(label.slice(5, 7));
  const d = new Date(Date.UTC(2025, m, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function raiseDeviation(engagementId: string, controlId: string, sampleItemId: string, attributeCode: string, taxonomy: string, description: string): Promise<boolean> {
  const existing = await q01(
    `select id from deviation where control_id = $1 and sample_item_id = $2 and taxonomy_code = $3`,
    [controlId, sampleItemId, taxonomy],
  );
  if (existing) return false;
  await q(
    `insert into deviation (engagement_id, control_id, sample_item_id, attribute_code, taxonomy_code, description)
     values ($1,$2,$3,$4,$5,$6)`,
    [engagementId, controlId, sampleItemId, attributeCode, taxonomy, description],
  );
  return true;
}

export async function runAttributeTesting(controlId: string, userId: string): Promise<{ tested: number; deviations: number; extensionRequired: boolean }> {
  await assertMembreDe('control', controlId, userId, 'conduire le test d’attributs');
  const c = await q1<{ id: string; engagement_id: string; code: string }>(
    `select id, engagement_id, code from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const test = await q1<{ id: string; sample_id: string }>(
    `select id, sample_id from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  const items = await q<{ id: string; unit_id: string; label: string }>(
    `select si.id, si.unit_id, ci.label from sample_item si
     join control_instance ci on ci.id = si.unit_id
     where si.sample_id = $1 order by ci.label`,
    [test.sample_id],
  );
  const attrs = await q<{ code: string; description: string; required: boolean }>(
    `select code, description, required from attribute_def where control_id = $1`,
    [controlId],
  );
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'attribute_testing','v1','pcaob-sox',$3,$4, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, hashObject(attrs), JSON.stringify({ control: c.code, items: items.length })],
  );

  let deviations = 0;
  for (const it of items) {
    const evs = await q<{ id: string }>(
      `select e.id from evidence e join request_item ri on ri.id = e.request_item_id
       where ri.control_instance_id = $1 and e.quarantined = false`,
      [it.unit_id],
    );
    let fields: ExtractedField[] | null = null;
    for (const ev of evs) {
      const x = await latestExtraction(ev.id);
      if (x && x.status !== 'pending_verify') {
        fields = x.fields;
        break;
      }
    }
    const record = async (code: string, result: 'pass' | 'fail' | 'na', basis: 'extraction_field' | 'human', note?: string) => {
      await q(
        `insert into attribute_result (sample_item_id, attribute_code, result, basis, note)
         values ($1,$2,$3,$4,$5)
         on conflict (sample_item_id, attribute_code) do update set result = $3, basis = $4, note = $5`,
        [it.id, code, result, basis, note ?? null],
      );
    };

    if (!fields) {
      for (const a of attrs) await record(a.code, 'na', 'human', 'no evidence provided');
      if (await raiseDeviation(c.engagement_id, controlId, it.id, 'EVIDENCE', 'missing_evidence', `${c.code} instance ${it.label}: no evidence of performance could be provided.`)) deviations++;
      await q(`update sample_item set status = 'exception' where id = $1`, [it.id]);
      continue;
    }
    const get = (n: string) => fields!.find((f) => f.name === n)?.value ?? '';
    let failed = false;
    for (const a of attrs) {
      let result: 'pass' | 'fail' = 'pass';
      let note: string | undefined;
      if (a.code === 'TIMELY') {
        const preparedOn = get('preparedOn');
        const deadline = monthEndPlus(it.label, 10);
        if (!preparedOn || preparedOn > deadline) {
          result = 'fail';
          note = `prepared ${preparedOn || 'n/a'} vs deadline ${deadline}`;
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'late_performance', `${c.code} instance ${it.label}: ${note}.`)) deviations++;
        }
      } else if (a.code === 'SOD') {
        const prep = get('preparedBy');
        const appr = get('approvedBy');
        if (prep && appr && prep === appr) {
          result = 'fail';
          note = `prepared and approved by the same person (${prep})`;
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'wrong_performer', `${c.code} instance ${it.label}: ${note}.`)) deviations++;
        }
      } else if (a.code === 'APPROVAL') {
        if (!get('approvedBy')) {
          result = 'fail';
          note = 'no approval signature';
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'missing_approval', `${c.code} instance ${it.label}: approval missing.`)) deviations++;
        }
      } else if (a.code === 'REVIEW') {
        if (!get('reviewedBy')) {
          result = 'fail';
          note = 'no reviewer';
          if (await raiseDeviation(c.engagement_id, controlId, it.id, a.code, 'attribute_fail', `${c.code} instance ${it.label}: review not documented.`)) deviations++;
        }
      }
      if (result === 'fail') failed = true;
      await record(a.code, result, 'extraction_field', note);
    }
    await q(`update sample_item set status = $2 where id = $1`, [it.id, failed ? 'exception' : 'tested']);
  }
  await q(`update control_test set status = 'complete' where id = $1`, [test.id]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'attribute_testing_completed', objectType: 'control', objectId: controlId,
    payload: { control: c.code, tested: items.length, deviations, engineRun: run.id, requestedBy: userId },
  });
  // Every tested instance failed: this is not a sample result, it is the absence of a
  // control. The population must be tested in full before anything is concluded from it
  // (founder review 2026-08-25, migration 0009).
  const deviatedItems = await q1<{ n: string }>(
    `select count(distinct si.id) n from sample_item si
     join deviation d on d.sample_item_id = si.id where si.sample_id = $1`,
    [test.sample_id],
  );
  const allFailed = items.length > 0 && Number(deviatedItems.n) === items.length;
  const population = await q1<{ n: string }>(`select count(*) n from control_instance where control_id = $1`, [controlId]);
  const extensionRequired = allFailed && Number(population.n) > items.length;
  await q(
    `update control_test set status = 'complete', extension_required = $2, extension_reason = $3 where id = $1`,
    [
      test.id, extensionRequired,
      extensionRequired
        ? `${deviatedItems.n}/${items.length} instances tested show a deviation (100 %). A conclusion cannot be drawn from a sample where nothing passed: the ${population.n} instances of the population must be tested.`
        : null,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: extensionRequired ? 'control_test_extension_required' : 'control_test_completed',
    objectType: 'control_test', objectId: test.id,
    payload: { control: c.code, tested: items.length, deviations, population: Number(population.n), extensionRequired },
  });

  const sampleDeviations = await q1<{ n: string }>(
    `select count(*) n from deviation d join sample_item si on si.id = d.sample_item_id where si.sample_id = $1`,
    [test.sample_id],
  );
  return { tested: items.length, deviations: Number(sampleDeviations.n), extensionRequired };
}

export async function attributeGrid(controlId: string) {
  return q<{ label: string; attribute_code: string; result: string; note: string | null; basis: string }>(
    `select ci.label, ar.attribute_code, ar.result, ar.note, ar.basis
     from attribute_result ar
     join sample_item si on si.id = ar.sample_item_id
     join control_instance ci on ci.id = si.unit_id
     where ci.control_id = $1 order by ci.label, ar.attribute_code`,
    [controlId],
  );
}

export async function listDeviations(engagementId: string) {
  return q<{ id: string; control_code: string; instance_label: string | null; attribute_code: string; taxonomy_code: string; status: string; description: string; resolution: string | null }>(
    `select d.id, c.code control_code, ci.label instance_label, d.attribute_code, d.taxonomy_code, d.status, d.description, d.resolution
     from deviation d
     join control c on c.id = d.control_id
     left join sample_item si on si.id = d.sample_item_id
     left join control_instance ci on ci.id = si.unit_id
     where d.engagement_id = $1 order by c.code, ci.label`,
    [engagementId],
  );
}

/** What explaining a control deviation must carry (migration 0010). Same shape as an
 *  exception resolution — explanation verbatim, corroborating LINK, conclusion, author —
 *  but not the same dispositions: a control test carries no amount, so the money words do
 *  not apply. Only two outcomes take a deviation out of the count, and both are claims
 *  about evidence. A genuine deviation has neither: it stays open and counts in the rate. */
export type DeviationClosure = {
  /** The explanation received, in the client's own words. */
  explanation: string;
  /** The auditor's conclusion on that explanation. */
  conclusion: string;
  /** control_operated: evidence produced later shows the control did operate.
   *  compensating_control: a linked control covers the same assertion. */
  disposition: 'control_operated' | 'compensating_control';
  /** The evidence that shows it. A deviation cannot be explained without one. */
  evidenceId: string;
};

export async function resolveDeviation(deviationId: string, userId: string, closure: DeviationClosure): Promise<void> {
  await assertMembreDe('deviation', deviationId, userId, 'statuer une déviation');
  if (!closure.conclusion?.trim()) throw new Error('an audit conclusion on the explanation is required');
  if (!closure.explanation?.trim()) throw new Error('the explanation received is required — record it verbatim, not as a summary');
  if (!closure.evidenceId) {
    throw new Error(
      'a control deviation cannot be explained away on an explanation alone: link the evidence that shows the control operated, or the compensating control (NEP 500)',
    );
  }
  const d = await q1<{ engagement_id: string }>(`select engagement_id from deviation where id = $1`, [deviationId]);
  const ctx = await engagementCtx(d.engagement_id);
  const ev = await q1<{ quarantined: boolean }>(`select quarantined from evidence where id = $1`, [closure.evidenceId]);
  if (ev.quarantined) throw new Error('quarantined evidence cannot corroborate a deviation closure');
  await q(
    `update deviation set status = 'explained', resolution = $2, client_explanation = $3,
            disposition = $4, corroboration_evidence_id = $5, resolved_by = $6, resolved_at = now()
     where id = $1`,
    [deviationId, closure.conclusion, closure.explanation, closure.disposition, closure.evidenceId, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: d.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'deviation_explained', objectType: 'deviation', objectId: deviationId,
    payload: {
      resolution: closure.conclusion,
      disposition: closure.disposition,
      corroboration_evidence_id: closure.evidenceId,
      explanation: closure.explanation.slice(0, 500),
    },
  });
}

/** Test the whole population after a 100 % deviation rate. Draws every instance as a new,
 *  full-coverage test rather than editing the first one — both remain in the file, and the
 *  conclusion is drawn from the extended test. */
export async function extendToFullPopulation(
  controlId: string,
  userId: string,
  reason: string,
): Promise<{ sampleId: string; requestId: string; selected: string[] }> {
  await assertMembreDe('control', controlId, userId, 'étendre un test à la population complète');
  const test = await q01<{ id: string; extension_required: boolean }>(
    `select id, extension_required from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  if (!test?.extension_required) throw new Error('no extension is required on the latest test of this control');
  const population = await q1<{ n: string }>(`select count(*) n from control_instance where control_id = $1`, [controlId]);
  return drawAttributeSample(controlId, userId, Number(population.n), reason);
}

/** A human may decide the extension is unnecessary — with a reason, on the record. */
export async function waiveExtension(controlId: string, userId: string, reason: string): Promise<void> {
  await assertMembreDe('control', controlId, userId, 'renoncer à l’extension d’un test');
  if (!reason.trim()) throw new Error('waiving a required population extension needs a documented reason');
  const test = await q1<{ id: string; control_id: string }>(
    `select id, control_id from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  const c = await q1<{ engagement_id: string; code: string }>(`select engagement_id, code from control where id = $1`, [controlId]);
  const ctx = await engagementCtx(c.engagement_id);
  await q(
    `update control_test set extension_waived_by = $2, extension_waiver_reason = $3 where id = $1`,
    [test.id, userId, reason],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'control_test_extension_waived', objectType: 'control_test', objectId: test.id,
    payload: { control: c.code, reason },
  });
}

/** Blocks anything that would conclude from a test whose extension is still outstanding. */
export async function assertNoOutstandingExtension(controlId: string): Promise<void> {
  const test = await q01<{ extension_required: boolean; extension_reason: string | null; extension_waived_by: string | null }>(
    `select extension_required, extension_reason, extension_waived_by from control_test
     where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  if (test?.extension_required && !test.extension_waived_by) {
    throw new Error(`population extension outstanding — ${test.extension_reason ?? 'test the full population before concluding'}`);
  }
}

// ---------- deficiency ladder (L3) + aggregation ----------

export async function proposeDeficiency(
  controlId: string,
  userId: string,
  inputs: { magnitudeExposureCents: number; compensatingControl: boolean; magnitudeBasis: string },
): Promise<string> {
  await assertMembreDe('control', controlId, userId, 'proposer une déficience');
  // The exposure is the number that decides severity, so it may not be an assertion:
  // where it comes from is stored next to it (migration 0009).
  if (!inputs.magnitudeBasis?.trim()) {
    throw new Error('state where the magnitude exposure comes from — a severity proposal may not rest on an unexplained number');
  }
  const c = await q1<{ id: string; engagement_id: string; code: string; name: string; is_key: boolean }>(
    `select id, engagement_id, code, name, is_key from control where id = $1`,
    [controlId],
  );
  const ctx = await engagementCtx(c.engagement_id);
  const fs = await frameworkSet(c.engagement_id);
  const pack = primaryPack(fs as never);
  const thresholds = await validatedThresholds(c.engagement_id);
  if (!thresholds) throw new Error('validated materiality required (ICFR materiality = FS materiality)');
  await assertNoOutstandingExtension(controlId);
  // counts come from the LATEST test only: after an extension, the rate is 3/12, not 3/15
  const latest = await q1<{ sample_id: string }>(
    `select sample_id from control_test where control_id = $1 order by created_at desc, id desc limit 1`,
    [controlId],
  );
  // the deviation RATE is deviating instances over instances tested — one month that fails
  // three attributes is one month that failed, not three
  const devCount = await q1<{ n: string }>(
    `select count(distinct si.id) n from deviation d join sample_item si on si.id = d.sample_item_id where si.sample_id = $1`,
    [latest.sample_id],
  );
  const sampleSize = await q1<{ n: string }>(`select count(*) n from sample_item where sample_id = $1`, [latest.sample_id]);
  const natures = await q<{ taxonomy_code: string }>(
    `select distinct d.taxonomy_code from deviation d join sample_item si on si.id = d.sample_item_id where si.sample_id = $1`,
    [latest.sample_id],
  );
  const proposal = proposeDeficiencySeverity({
    deviationsCount: Number(devCount.n),
    sampleSize: Number(sampleSize.n),
    isKeyControl: c.is_key,
    compensatingControl: inputs.compensatingControl,
    magnitudeExposureCents: inputs.magnitudeExposureCents,
    materialityCents: thresholds.materialityCents,
    ladder: pack.deficiencyLadder!,
    deviationNatures: natures.map((n) => n.taxonomy_code as DeviationNature),
  });
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'deficiency_rules','v2',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, c.engagement_id, pack.id, hashObject(pack.deficiencyLadder), JSON.stringify(proposal.basis)],
  );
  const narrative =
    `Operating deviations were identified in the OE sample for ${c.code} (${c.name}): ${devCount.n} deviation(s) over ${sampleSize.n} instance(s) tested ` +
    `(deviation rate ${(proposal.basis.deviationRate * 100).toFixed(0)} %)` +
    (proposal.basis.severeNatures.length ? `, including ${proposal.basis.severeNatures.join(' and ')}` : '') + '. ' +
    `Rules-based severity proposal: ${proposal.severity.replace(/_/g, ' ')} — ${proposal.basis.rule}. ` +
    `Magnitude exposure considered: ${centsToNum(inputs.magnitudeExposureCents)} € vs materiality ${centsToNum(thresholds.materialityCents)} € ` +
    `(significant threshold ${centsToNum(proposal.basis.thresholds.significantCents)} €). Basis for that exposure: ${inputs.magnitudeBasis} ` +
    (proposal.populationExtensionRequired
      ? 'Every tested instance failed: the sample no longer supports a conclusion about the population — the full population must be tested before concluding. '
      : '') +
    'Human decision required (L3).';
  const row = await q1<{ id: string }>(
    `insert into deficiency (engagement_id, control_id, severity_proposed, basis, narrative, status, engine_run_id, magnitude_basis)
     values ($1,$2,$3,$4,$5,'proposed',$6,$7) returning id`,
    [c.engagement_id, controlId, proposal.severity, JSON.stringify(proposal.basis), narrative, run.id, inputs.magnitudeBasis],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: c.engagement_id, actorKind: 'system', actorId: null,
    verb: 'deficiency_proposed', objectType: 'deficiency', objectId: row.id,
    payload: {
      control: c.code, severity: proposal.severity, deviationRate: proposal.basis.deviationRate,
      severeNatures: proposal.basis.severeNatures, extensionRequired: proposal.populationExtensionRequired,
      engineRun: run.id, requestedBy: userId,
    },
  });
  return row.id;
}

const SEVERITY_RANK = { deficiency: 0, significant_deficiency: 1, material_weakness: 2 } as const;

export async function decideDeficiency(
  deficiencyId: string,
  userId: string,
  severity: 'deficiency' | 'significant_deficiency' | 'material_weakness',
  rationale?: string,
): Promise<void> {
  await assertMembreDe('deficiency', deficiencyId, userId, 'statuer une déficience');
  const d = await q1<{ engagement_id: string; severity_proposed: keyof typeof SEVERITY_RANK; narrative: string }>(
    `select engagement_id, severity_proposed, narrative from deficiency where id = $1`,
    [deficiencyId],
  );
  // The engine's proposal may be argued down, never silently: reducing severity below what
  // the rules proposed is the decision an inspector will ask about, so it carries a reason.
  const isReduction = SEVERITY_RANK[severity] < SEVERITY_RANK[d.severity_proposed];
  if (isReduction && !rationale?.trim()) {
    throw new Error(
      `reducing the proposed severity (${d.severity_proposed} → ${severity}) requires a documented rationale`,
    );
  }
  const ctx = await engagementCtx(d.engagement_id);
  await q(
    `update deficiency set severity_final = $2, status = 'confirmed', decided_by = $3, decided_at = now(),
            narrative = case when $4::text is null then narrative else narrative || ' — Décision humaine : ' || $4 end
     where id = $1`,
    [deficiencyId, severity, userId, rationale?.trim() ? rationale.trim() : null],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: d.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'deficiency_decided', objectType: 'deficiency', objectId: deficiencyId,
    payload: { severity, proposed: d.severity_proposed, reduction: isReduction, rationale: rationale ?? null },
  });
}

export async function listDeficiencies(engagementId: string) {
  return q<{ id: string; control_code: string; control_name: string; severity_proposed: string; severity_final: string | null; status: string; narrative: string; basis: Record<string, unknown> }>(
    `select d.id, c.code control_code, c.name control_name, d.severity_proposed, d.severity_final, d.status, d.narrative, d.basis
     from deficiency d join control c on c.id = d.control_id
     where d.engagement_id = $1
     order by case coalesce(d.severity_final, d.severity_proposed)
       when 'material_weakness' then 0 when 'significant_deficiency' then 1 else 2 end`,
    [engagementId],
  );
}
