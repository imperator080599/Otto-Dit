import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { primaryPack } from '@/lib/packs';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import {
  proceduresDuCycle, procedure as procedureDuCatalogue, gabarit, referencePapier, sens as sensDeTest,
  justificatifs, executable,
} from '@/lib/methodology/catalogue';
import type { WpSection } from './workpapers/draft';

// LE PROGRAMME DE TRAVAIL D'UN POSTE — une procédure du catalogue devient une
// UNITÉ DE TRAVAIL (mandat de nuit n°2, 1.1 et 1.4).
//
// LA PROPOSITION VIENT DE LA MÉTHODE, JAMAIS DU CODE. Une procédure se planifie
// depuis le catalogue du cabinet (`methodology/procedures.json`), sur un poste
// RETENU au périmètre, et seulement si la méthode la déclare applicable au
// poste. Le code ne connaît aucune procédure : il sait planifier ce que la
// méthode nomme, et rédiger le papier que la procédure engendre — les blocs du
// gabarit du cabinet, remplis depuis le texte de la procédure (objectif,
// population, sens de test, justificatifs attendus), et laissés au préparateur
// là où le moteur n'a rien à écrire (« [à rédiger par le préparateur] »).
//
// Une procédure planifiée porte son papier : c'est par lui que le poste se lit
// (papiers, visas, écarts) et que le statut de section se dérive (sections.ts).
// Les REFUS, nommés :
//   PROG-01  procédure absente du catalogue
//   PROG-02  procédure que la méthode n'applique pas à ce poste
//   PROG-03  poste hors périmètre — on ne planifie pas ce qu'on ne travaille pas
//   PROG-04  procédure sans poste (un contrôle) — son papier se rédige depuis le contrôle

export interface ProcedurePlanifiee {
  id: string;
  code: string;
  fsliCode: string;
  titre: string;
  kind: string;
  status: string;
  assertion: string | null;
  echantillonnee: boolean;
  papier: { id: string; code: string; status: string; version: number } | null;
}

/** Les procédures planifiées sur un poste, avec leur papier vivant (dernière version non dépassée). */
export async function proceduresPlanifiees(engagementId: string, fsliCode: string): Promise<ProcedurePlanifiee[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const rows = await q<{ id: string; template_code: string; fsli_code: string; title: string; kind: string; status: string; wid: string | null; wcode: string | null; wstatus: string | null; wversion: number | null }>(
    `select p.id::text, p.template_code, p.fsli_code, p.title, p.kind, p.status,
            w.id::text wid, w.code wcode, w.status wstatus, w.version wversion
     from procedure_instance p
     left join lateral (
       select w.id, w.code, w.status, w.version from workpaper w
       where w.procedure_id = p.id order by (w.status = 'outdated'), w.version desc limit 1) w on true
     where p.engagement_id = $1 and p.fsli_code = $2
     order by p.created_at`,
    [engagementId, fsliCode]);
  return rows.map((r) => {
    const p = procedureDuCatalogue(cat, r.template_code);
    return {
      id: r.id, code: r.template_code, fsliCode: r.fsli_code, titre: r.title, kind: r.kind, status: r.status,
      assertion: p?.assertion ?? null, echantillonnee: p?.echantillonnee ?? true,
      papier: r.wid ? { id: r.wid, code: r.wcode!, status: r.wstatus!, version: Number(r.wversion) } : null,
    };
  });
}

/**
 * PLANIFIER une procédure du catalogue sur un poste retenu. Idempotent : une
 * procédure déjà planifiée sur ce poste est rendue telle quelle (`creee: false`).
 */
export async function planifierProcedure(o: {
  engagementId: string; fsliCode: string; code: string; userId: string;
}): Promise<{ id: string; creee: boolean }> {
  const cat = await catalogueDeLaMission(o.engagementId);
  const p = procedureDuCatalogue(cat, o.code);
  if (!p) {
    throw new Error(`PROG-01 : la procédure « ${o.code} » n’est pas au catalogue de la méthode — une procédure se planifie depuis la méthode, jamais depuis le code`);
  }
  if (!proceduresDuCycle(cat, o.fsliCode).some((x) => x.code === o.code)) {
    throw new Error(`PROG-02 : la méthode n’applique pas la procédure « ${o.code} » au poste « ${o.fsliCode} »`);
  }
  const poste = await q01<{ code: string }>(
    `select code from fsli where engagement_id = $1 and code = $2 and scoping in ('in_scope','in_scope_qualitative')`,
    [o.engagementId, o.fsliCode]);
  if (!poste) {
    throw new Error(`PROG-03 : le poste « ${o.fsliCode} » n’est pas retenu au périmètre — on ne planifie pas de travaux sur un poste qu’on ne travaille pas`);
  }
  const existante = await q01<{ id: string }>(
    `select id::text from procedure_instance where engagement_id = $1 and fsli_code = $2 and template_code = $3`,
    [o.engagementId, o.fsliCode, o.code]);
  if (existante) return { id: existante.id, creee: false };
  const ctx = await engagementCtx(o.engagementId);
  const fs = await frameworkSet(o.engagementId);
  const pack = primaryPack(fs as never);
  const r = await q1<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, params, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'planned') returning id::text`,
    [o.engagementId, pack.id, o.code, p.sens === 'analytique' ? 'analytical' : 'substantive', o.fsliCode, p.libelle,
      JSON.stringify({ catalogue: p.code, assertion: p.assertion, echantillonnee: p.echantillonnee, methode: cat.version })]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: o.engagementId, actorKind: 'user', actorId: o.userId,
    verb: 'procedure_planned', objectType: 'procedure_instance', objectId: r.id,
    payload: { code: p.code, fsli: o.fsliCode, assertion: p.assertion },
  });
  return { id: r.id, creee: true };
}

/** Le préfixe de code d'un papier, par poste : « REV » pour REVENUE — celui que porte déjà REV-01. */
function prefixeDuPoste(fsliCode: string): string {
  return fsliCode.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'WP';
}

/**
 * RÉDIGER le papier d'une procédure planifiée : les blocs du gabarit du
 * cabinet, remplis depuis la méthode. Une rédaction NOUVELLE dépasse les
 * versions précédentes du même papier (redraft), comme REV-01.
 */
export async function redigerPapierDeProcedure(o: {
  procedureId: string; userId: string; motif?: string;
}): Promise<{ id: string; code: string; version: number }> {
  const pi = await q01<{ id: string; engagement_id: string; template_code: string; fsli_code: string | null; title: string }>(
    `select id::text, engagement_id::text, template_code, fsli_code, title from procedure_instance where id = $1`,
    [o.procedureId]);
  if (!pi) throw new Error('PROG-01 : procédure inconnue');
  if (!pi.fsli_code) {
    throw new Error('PROG-04 : cette procédure n’est rattachée à aucun poste — le papier d’un contrôle se rédige depuis le contrôle');
  }
  const cat = await catalogueDeLaMission(pi.engagement_id);
  const p = procedureDuCatalogue(cat, pi.template_code);
  if (!p) throw new Error(`PROG-01 : la procédure « ${pi.template_code} » n’est pas au catalogue de la méthode`);
  const ctx = await engagementCtx(pi.engagement_id);
  const fs = await frameworkSet(pi.engagement_id);
  const pack = primaryPack(fs as never);
  const fr = pack.language === 'fr';
  const gab = gabarit(cat, 'substantif');
  const sensP = sensDeTest(cat, p.sens);
  const pieces = justificatifs(p, pi.fsli_code);

  /* LE CODE : celui du papier déjà rédigé pour cette procédure (une version de
     plus), sinon le suivant du poste — REV-02 après REV-01. */
  const prev = await q<{ code: string; version: number; reference: string | null }>(
    `select code, version, reference from workpaper where procedure_id = $1 order by version desc`, [pi.id]);
  let code = prev[0]?.code ?? null;
  if (!code) {
    const pris = new Set((await q<{ code: string }>(
      `select distinct w.code from workpaper w join procedure_instance q on q.id = w.procedure_id
       where w.engagement_id = $1 and q.fsli_code = $2`, [pi.engagement_id, pi.fsli_code])).map((x) => x.code));
    const prefixe = prefixeDuPoste(pi.fsli_code);
    let n = 1;
    while (pris.has(`${prefixe}-${String(n).padStart(2, '0')}`)) n++;
    code = `${prefixe}-${String(n).padStart(2, '0')}`;
  }
  const version = (prev[0]?.version ?? 0) + 1;

  const aRediger = fr ? '[à rédiger par le préparateur]' : '[to be written by the preparer]';
  const corps: Record<string, string> = {
    objectif: `${p.objectif}\n\n${fr ? 'Contrôle' : 'Control'} : ${p.controle}`,
    etendue: (fr
      ? `Population : ${p.population.libelle} — source : ${p.population.source} — période : ${p.population.periode} — filtre : ${p.population.filtre}.`
      : `Population: ${p.population.libelle} — source: ${p.population.source} — period: ${p.population.periode} — filter: ${p.population.filtre}.`)
      + (executable(p) ? '' : (fr
        ? ' La population n’est pas calculable par le moteur sur ce dossier : à constituer par le préparateur, avec sa source.'
        : ' The engine cannot compute this population on this file: to be built by the preparer, with its source.')),
    methode: `${sensP.libelle} — ${sensP.d}` + (p.echantillonnee
      ? (fr ? ' Procédure échantillonnée.' : ' Sampled procedure.')
      : (fr ? ' Sans tirage : sélection exhaustive au seuil.' : ' No draw: exhaustive selection above the threshold.')),
    tableau_echantillon: fr ? 'Aucun élément tiré à ce stade.' : 'No item drawn at this stage.',
    exceptions: fr ? 'Aucune anomalie relevée à ce stade.' : 'No exception noted at this stage.',
    evaluation: fr ? 'Sans objet tant qu’aucune anomalie n’est relevée.' : 'Not applicable while no exception is noted.',
    verification: fr ? 'À réaliser après le testing.' : 'To be performed after testing.',
    conclusion: aRediger,
  };
  const sections: WpSection[] = gab.sections.map((s) => {
    const section: WpSection = { key: s.bloc, title: s.titre, body: corps[s.bloc] ?? aRediger };
    if (s.bloc === 'tableau_echantillon') {
      section.table = {
        headers: pieces.flatMap((j) => j.champs.map((c) => `${j.document} · ${c.libelle}`)),
        rows: [],
      };
    }
    return section;
  });

  const basedOnHash = hashObject({ procedure: pi.id, catalogue: p.code, methode: cat.version });
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'workpaper_draft','v1',$3,$4,$5, now()) returning id::text`,
    [ctx.tenant_id, pi.engagement_id, pack.id, hashObject(gab), JSON.stringify({ code, procedure: p.code, basedOnHash })]);
  if (prev.length > 0) {
    await q(`update workpaper set status = 'outdated' where procedure_id = $1 and status <> 'outdated'`, [pi.id]);
  }
  let reference = prev[0]?.reference ?? null;
  if (!reference) {
    const dejaVus = await q1<{ n: string }>(
      `select count(distinct w.code) n from workpaper w join procedure_instance q on q.id = w.procedure_id
       where w.engagement_id = $1 and q.fsli_code = $2 and w.reference is not null and w.code <> $3`,
      [pi.engagement_id, pi.fsli_code, code]);
    reference = referencePapier(cat, { poste: pi.fsli_code, sequence: Number(dejaVus.n) + 1, code, version });
  }
  const row = await q1<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, reference, procedure_id, title, language, sections, status, version, based_on_hash, engine_run_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11) returning id::text`,
    [pi.engagement_id, pack.id, code, reference, pi.id, `${code} — ${p.libelle}`, pack.language,
      JSON.stringify(sections), version, basedOnHash, run.id]);
  await q(`update procedure_instance set status = 'in_progress' where id = $1 and status = 'planned'`, [pi.id]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: pi.engagement_id, actorKind: 'system', actorId: null,
    verb: 'workpaper_drafted', objectType: 'workpaper', objectId: row.id,
    payload: { code, version, engineRun: run.id, requestedBy: o.userId, procedure: p.code, motif: o.motif ?? null },
  });
  return { id: row.id, code, version };
}
