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
import type { NatureDeTest, Catalogue } from '@/lib/methodology/types';
import type { WpSection } from './workpapers/draft';
import { assertMembre } from '@/lib/core/membre';
import { requiredProcedures, excludedProcedures, risksFor } from './risk';

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
  /** Lot 3, tranche 1 (mandat, Partie C.1) — la FORME de l'atelier qui exécute
   *  cette procédure. Lue sur la LIGNE (`procedure_instance.nature`), jamais
   *  re-dérivée du catalogue par `template_code` : REV-SUBST (sampling.ts)
   *  n'existe pas dans methodology/procedures.json, une re-dérivation le
   *  laisserait sans nature alors que la colonne, elle, la porte toujours
   *  (posée explicitement à l'écriture, règle 13). */
  nature: NatureDeTest;
  papier: { id: string; code: string; status: string; version: number } | null;
}

/** Les procédures planifiées sur un poste, avec leur papier vivant (dernière version non dépassée).
 *  Lot 4, tranche 1 : une procédure DÉPLANIFIÉE (`deplanned_at` non nul) n'est
 *  plus une procédure planifiée — elle est exclue ici, et redevient
 *  planifiable (`planifierProcedure`). Elle reste lisible via
 *  `proceduresDeplanifiees`, jamais effacée (règle 28). */
export async function proceduresPlanifiees(engagementId: string, fsliCode: string): Promise<ProcedurePlanifiee[]> {
  const cat = await catalogueDeLaMission(engagementId);
  const rows = await q<{ id: string; template_code: string; fsli_code: string; title: string; kind: string; status: string; nature: NatureDeTest; wid: string | null; wcode: string | null; wstatus: string | null; wversion: number | null }>(
    `select p.id::text, p.template_code, p.fsli_code, p.title, p.kind, p.status, p.nature,
            w.id::text wid, w.code wcode, w.status wstatus, w.version wversion
     from procedure_instance p
     left join lateral (
       select w.id, w.code, w.status, w.version from workpaper w
       where w.procedure_id = p.id order by (w.status = 'outdated'), w.version desc limit 1) w on true
     where p.engagement_id = $1 and p.fsli_code = $2 and p.deplanned_at is null
     order by p.created_at`,
    [engagementId, fsliCode]);
  return rows.map((r) => {
    const p = procedureDuCatalogue(cat, r.template_code);
    return {
      id: r.id, code: r.template_code, fsliCode: r.fsli_code, titre: r.title, kind: r.kind, status: r.status,
      assertion: p?.assertion ?? null, echantillonnee: p?.echantillonnee ?? true, nature: r.nature,
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
  await assertMembre(o.engagementId, o.userId, 'planifier une procédure');
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
  /* LOT 4, TRANCHE 1 : une ligne DÉPLANIFIÉE n'est plus « déjà existante » —
     replanifier la même procédure sur ce poste crée une ligne NEUVE,
     jamais une réanimation de l'ancienne (voir `deplanifierProcedure`). */
  const existante = await q01<{ id: string }>(
    `select id::text from procedure_instance
     where engagement_id = $1 and fsli_code = $2 and template_code = $3 and deplanned_at is null`,
    [o.engagementId, o.fsliCode, o.code]);
  if (existante) return { id: existante.id, creee: false };
  const ctx = await engagementCtx(o.engagementId);
  const fs = await frameworkSet(o.engagementId);
  const pack = primaryPack(fs as never);
  const r = await q1<{ id: string }>(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, params, status, nature)
     values ($1, $2, $3, $4, $5, $6, $7, 'planned', $8) returning id::text`,
    [o.engagementId, pack.id, o.code, p.sens === 'analytique' ? 'analytical' : 'substantive', o.fsliCode, p.libelle,
      JSON.stringify({ catalogue: p.code, assertion: p.assertion, echantillonnee: p.echantillonnee, methode: cat.version }),
      p.nature]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: o.engagementId, actorKind: 'user', actorId: o.userId,
    verb: 'procedure_planned', objectType: 'procedure_instance', objectId: r.id,
    payload: { code: p.code, fsli: o.fsliCode, assertion: p.assertion },
  });
  return { id: r.id, creee: true };
}

/**
 * Le préfixe de code d'un papier, par poste — celui que porte déjà REV-01.
 *
 * TROUVÉ PAR EXÉCUTION (Lot 5, poste Fournisseurs, 2026-09-15), PAS SUPPOSÉ :
 * cette fonction dérivait naïvement les trois premières lettres du
 * `fsli_code` (« TRA » pour TRADE_RECEIVABLES ET pour TRADE_PAYABLES — la
 * même collision qu'un préfixe français en dur aurait produite, la classe
 * même d'erreur que cette mécanique existe pour éviter), sans jamais
 * consulter `lettres_par_poste` (`papier.json`), qui existe PRÉCISÉMENT pour
 * donner à chaque poste une lettre distincte et QUE `referencePapier`
 * utilisait déjà pour le champ `reference` — deux dérivations indépendantes
 * du même concept, l'une correcte, l'autre pas. `code` (la clé unique en
 * base, `workpaper_engagement_id_code_version_key`) et `reference` (le champ
 * cabinet-facing) portaient donc CHACUN sa propre lettre, muettes l'une de
 * l'autre — muet jusqu'à ce que deux postes partagent enfin le même préfixe
 * naïf. Reproduit par exécution (`planifierFournisseurs()` contre une base
 * fraîche : `duplicate key value violates unique constraint
 * "workpaper_engagement_id_code_version_key"`, TRADE_PAYABLES tentant
 * d'insérer « TRA-01 », déjà pris par TRADE_RECEIVABLES). Corrigé en
 * RÉUTILISANT `lettres_par_poste`, jamais une seconde table de
 * correspondance : les papiers déjà créés (CAS-01, PPE-01, TRA-01/02)
 * gardent leur code d'origine (règle 26 du produit, appliquée ici aux
 * données semées : `code` ne se régénère que `if (!code)`, pour une
 * NOUVELLE série) — seuls les postes ouverts APRÈS ce correctif reçoivent la
 * lettre correcte et unique. */
function prefixeDuPoste(cat: Catalogue, fsliCode: string): string {
  const r = cat.papier.referencement;
  return (r.lettres_par_poste[fsliCode] ?? r.lettres_par_poste._defaut ?? 'WP').toUpperCase();
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
  /* ETANCH-01 AVANT PROG-05, ET L'ORDRE EST LA RÈGLE (revue hostile n°9,
     constat 6). PROG-05 ne consulte que `engagement_member` : il distingue
     donc « procédure inconnue » de « pas membre du dossier », ce qui APPREND à
     un intrus d'un autre cabinet que la procédure existe — exactement la
     divulgation qu'ETANCH-01-d'abord existe pour empêcher (ADR-069/ADR-082). */
  await assertMembre(pi.engagement_id, o.userId, 'rédiger le papier d’une procédure');
  if (!pi.fsli_code) {
    throw new Error('PROG-04 : cette procédure n’est rattachée à aucun poste — le papier d’un contrôle se rédige depuis le contrôle');
  }
  /* QUI RÉDIGE (revue hostile n°7, constat 10). Le service prenait un
     identifiant de procédure et un identifiant de personne, sans jamais
     vérifier qu'ils appartiennent au même dossier : un membre d'un autre
     cabinet pouvait dépasser le papier visé d'une mission qu'il ne voit pas.
     La règle est celle des écrans (requireMember), tenue ici aussi — ce
     service est appelé par l'écran « Programme de travail » (ADR-134).

     CE QUE PROG-05 PEUT ENCORE REFUSER, ET C'EST PEU : `assertMembre` juste
     au-dessus refuse déjà un non-membre par ETANCH-03 dès que l'équipe est non
     vide. PROG-05 ne lève donc que sur un dossier SANS AUCUN membre. La garde
     reste, parce qu'un dossier sans équipe n'est pas une hypothèse d'école —
     mais elle ne se lit plus comme la garde principale. (Revue hostile de la
     nuit, constat 10.) */
  const membre = await q01<{ n: string }>(
    `select count(*)::text n from engagement_member
     where engagement_id = $1 and user_id = $2 and exited_on is null`,
    [pi.engagement_id, o.userId]);
  if (Number(membre?.n ?? 0) === 0) {
    throw new Error('PROG-05 : cette personne n’est pas membre du dossier — un papier de travail se rédige par l’équipe de la mission');
  }
  const cat = await catalogueDeLaMission(pi.engagement_id);
  const p = procedureDuCatalogue(cat, pi.template_code);
  if (!p) throw new Error(`PROG-01 : la procédure « ${pi.template_code} » n’est pas au catalogue de la méthode`);
  const ctx = await engagementCtx(pi.engagement_id);
  const fs = await frameworkSet(pi.engagement_id);
  const pack = primaryPack(fs as never);
  const fr = pack.language === 'fr';
  /* LE GABARIT SUIT LE SENS DU TEST (revue hostile n°7, constat 8). Le papier
     d'une revue analytique sortait avec « Testing : aucun élément tiré » et
     « Contrôle de fiabilité : à réaliser après le testing » — les blocs d'un
     contrôle substantif échantillonné, sur une procédure qui ne s'échantillonne
     pas. La méthode est interrogée pour la nature du sens ; si elle n'a pas de
     gabarit pour cette nature, on REPLIE sur « substantif » et on l'ÉCRIT (dans
     le moteur, et dans les blocs qui ne s'appliquent pas) : un mauvais gabarit
     qui sort en silence est exactement la faute que la règle 13 nomme. */
  const natureVoulue = p.sens === 'analytique' ? 'analytique' : 'substantif';
  const natureTenue = cat.papier.papiers[natureVoulue] ? natureVoulue : 'substantif';
  const repliDeGabarit = natureTenue !== natureVoulue
    ? `la méthode n’a pas de gabarit « ${natureVoulue} » : blocs du gabarit « substantif »`
    : null;
  const gab = gabarit(cat, natureTenue);
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
    const prefixe = prefixeDuPoste(cat, pi.fsli_code);
    let n = 1;
    while (pris.has(`${prefixe}-${String(n).padStart(2, '0')}`)) n++;
    code = `${prefixe}-${String(n).padStart(2, '0')}`;
  }
  const version = (prev[0]?.version ?? 0) + 1;
  /* DÉPASSER UN PAPIER VISÉ EXIGE UN MOTIF ÉCRIT (revue hostile n°7,
     constat 10). Une rédaction nouvelle PÉRIME les visas de la version
     précédente — le réviseur et l'associée voient leur signature tomber. Sans
     motif, l'inspecteur lit un visa périmé sans savoir pourquoi ; c'est la
     même règle que la surcharge d'un niveau de risque (ADR-094). */
  const dejaVise = await q01<{ n: string }>(
    `select count(*)::text n from signoff s join workpaper w on w.id = s.workpaper_id
     where w.procedure_id = $1 and w.status <> 'outdated'`, [pi.id]);
  if (Number(dejaVise?.n ?? 0) > 0 && !o.motif?.trim()) {
    throw new Error('PROG-06 : ce papier porte au moins un visa — une version nouvelle les périme, elle exige un motif écrit');
  }

  const aRediger = fr ? '[à rédiger par le préparateur]' : '[to be written by the preparer]';
  const corps: Record<string, string> = {
    objectif: `${p.objectif}\n\n${fr ? 'Contrôle' : 'Control'} : ${p.controle}`
      + (repliDeGabarit ? `\n\n${fr ? 'Format' : 'Format'} : ${repliDeGabarit}.` : ''),
    etendue: (fr
      ? `Population : ${p.population.libelle} — source : ${p.population.source} — période : ${p.population.periode} — filtre : ${p.population.filtre}.`
      : `Population: ${p.population.libelle} — source: ${p.population.source} — period: ${p.population.periode} — filter: ${p.population.filtre}.`)
      + (executable(p) ? '' : (fr
        ? ' La population n’est pas calculable par le moteur sur ce dossier : à constituer par le préparateur, avec sa source.'
        : ' The engine cannot compute this population on this file: to be built by the preparer, with its source.')),
    methode: `${sensP.libelle} — ${sensP.d}` + (p.echantillonnee
      ? (fr ? ' Procédure échantillonnée.' : ' Sampled procedure.')
      : (fr ? ' Sans tirage : sélection exhaustive au seuil.' : ' No draw: exhaustive selection above the threshold.')),
    tableau_echantillon: p.echantillonnee
      ? (fr ? 'Aucun élément tiré à ce stade.' : 'No item drawn at this stage.')
      : (fr ? 'Sans objet : cette procédure ne s’échantillonne pas (méthode du cabinet).'
        : 'Not applicable: this procedure is not sampled (firm methodology).'),
    exceptions: fr ? 'Aucune anomalie relevée à ce stade.' : 'No exception noted at this stage.',
    evaluation: fr ? 'Sans objet tant qu’aucune anomalie n’est relevée.' : 'Not applicable while no exception is noted.',
    verification: p.echantillonnee
      ? (fr ? 'À réaliser après le testing.' : 'To be performed after testing.')
      : (fr ? 'Sans objet : aucun élément tiré à re-exécuter.' : 'Not applicable: no drawn item to re-perform.'),
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

  /* L'EMPREINTE PORTE LE CONTENU (revue hostile n°7, constat 9). Elle ne
     tenait que des identifiants : la v1 et la v2 du même papier avaient la
     même, et un texte de méthode modifié à version constante passait
     inaperçu. Elle hache désormais les blocs RÉELLEMENT écrits, la version, et
     la nature de gabarit tenue. */
  const basedOnHash = hashObject({
    procedure: pi.id, catalogue: p.code, methode: cat.version,
    gabarit: natureTenue, version, sections,
  });
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'workpaper_draft','v1',$3,$4,$5, now()) returning id::text`,
    [ctx.tenant_id, pi.engagement_id, pack.id, hashObject(gab),
      JSON.stringify({ code, procedure: p.code, basedOnHash, gabarit: natureTenue, repliDeGabarit })]);
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

export interface ProcedureDeplanifiee {
  id: string; code: string; fsliCode: string; titre: string; nature: NatureDeTest;
  papier: { id: string; code: string } | null;
  quand: string; qui: string; motif: string | null;
}

/** Les procédures DÉPLANIFIÉES d'un poste — le travail humain qui reste
 *  visible après une déplanification (règle 28), jamais effacé. */
export async function proceduresDeplanifiees(engagementId: string, fsliCode: string): Promise<ProcedureDeplanifiee[]> {
  /* LEFT JOIN sur app_user, jamais INNER (revue hostile, voix 2, constat G1) :
     un `deplanned_by` incohérent (nul alors que `deplanned_at` est posé — l'état
     que le cas connu mauvais de /api/sante fabrique exprès) ne doit PAS rendre
     la ligne invisible ICI EN PLUS d'être invisible dans `proceduresPlanifiees`
     — elle resterait alors atteignable par AUCUN écran, seulement par le 500
     global de /api/sante (règle 13 : un objet qu'aucun chemin de lecture
     n'atteint). Le seul point d'écriture réel (`deplanifierProcedure`) ne
     produit jamais cet état ; cette garde ne couvre que l'écriture directe. */
  const rows = await q<{ id: string; template_code: string; fsli_code: string; title: string; nature: NatureDeTest; quand: string; qui: string | null; motif: string | null; wid: string | null; wcode: string | null }>(
    `select p.id::text, p.template_code, p.fsli_code, p.title, p.nature,
            p.deplanned_at::text quand, u.name qui, p.deplanned_motif motif,
            w.id::text wid, w.code wcode
     from procedure_instance p
     left join app_user u on u.id = p.deplanned_by
     left join lateral (
       select w.id, w.code from workpaper w
       where w.procedure_id = p.id order by (w.status = 'outdated'), w.version desc limit 1) w on true
     where p.engagement_id = $1 and p.fsli_code = $2 and p.deplanned_at is not null
     order by p.deplanned_at desc`,
    [engagementId, fsliCode]);
  return rows.map((r) => ({
    id: r.id, code: r.template_code, fsliCode: r.fsli_code, titre: r.title, nature: r.nature,
    papier: r.wid ? { id: r.wid, code: r.wcode! } : null,
    quand: (r.quand ?? '').slice(0, 10), qui: r.qui ?? '(compte inconnu — deplanned_by incohérent)', motif: r.motif,
  }));
}

/**
 * Lot 4, tranche 1 (mandat, Partie D.1 — « les écrans qui manquent … la
 * déplanification d'une procédure »). DÉPLANIFIER : l'auditeur annule une
 * planification qui ne devait pas être — sans jamais l'effacer (règle 28).
 * La ligne reste, marquée, atteignable par `proceduresDeplanifiees` ; son
 * papier, ses visas, ses pièces restent tous à leur place. Le POSTE, lui,
 * redevient planifiable pour la même procédure (`planifierProcedure` exclut
 * les lignes déplanifiées de son test d'idempotence) — une NOUVELLE ligne
 * naît si l'auditeur replanifie, jamais une réanimation de l'ancienne :
 * l'ancienne reste un témoin honnête (même discipline que le re-tirage,
 * ADR-133 — un recalcul ne détruit ni n'invalide jamais en silence).
 * REFUS :
 *   PROG-07  le papier porte au moins un visa — même garde que PROG-06,
 *            une déplanification périme un visa aussi sûrement qu'une
 *            nouvelle version, et l'exige donc pour la même raison.
 *   PROG-08  déjà déplanifiée — on ne récrit pas une décision en silence
 *            (même garde que TIRAGE-04).
 */
export async function deplanifierProcedure(o: {
  procedureId: string; userId: string; motif?: string;
}): Promise<{ id: string }> {
  const pi = await q01<{ id: string; engagement_id: string; template_code: string; deplanned_at: string | null }>(
    `select id::text, engagement_id::text, template_code, deplanned_at::text deplanned_at
     from procedure_instance where id = $1`,
    [o.procedureId]);
  if (!pi) throw new Error('PROG-01 : procédure inconnue');
  await assertMembre(pi.engagement_id, o.userId, 'déplanifier une procédure');
  if (pi.deplanned_at) {
    const deja = await q01<{ qui: string; quand: string }>(
      `select u.name qui, p.deplanned_at::text quand from procedure_instance p
       join app_user u on u.id = p.deplanned_by where p.id = $1`,
      [o.procedureId]);
    throw new Error(`PROG-08 : cette procédure est déjà déplanifiée, par ${deja?.qui ?? '(inconnu)'} `
      + `le ${(deja?.quand ?? '').slice(0, 10)} — on ne récrit pas une décision en silence`);
  }
  const dejaVise = await q01<{ n: string }>(
    `select count(*)::text n from signoff s join workpaper w on w.id = s.workpaper_id
     where w.procedure_id = $1 and w.status <> 'outdated'`, [o.procedureId]);
  if (Number(dejaVise?.n ?? 0) > 0 && !o.motif?.trim()) {
    throw new Error('PROG-07 : ce papier porte au moins un visa — le déplanifier exige un motif écrit');
  }
  await q(
    `update procedure_instance set deplanned_at = now(), deplanned_by = $2, deplanned_motif = $3 where id = $1`,
    [o.procedureId, o.userId, o.motif?.trim() || null]);
  const ctx = await engagementCtx(pi.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: pi.engagement_id, actorKind: 'user', actorId: o.userId,
    verb: 'procedure_deplanned', objectType: 'procedure_instance', objectId: o.procedureId,
    payload: { code: pi.template_code, motif: o.motif?.trim() || null },
  });
  return { id: o.procedureId };
}


/* ═══ LE PROGRAMME DE TRAVAIL DU DOSSIER, VU D'UN ÉCRAN ═══════════════════ */

// L'ÉCRAN QUI MANQUAIT (mandat du soir et de la nuit J3, étage 1.1). Toutes les
// briques existaient depuis des semaines — `requiredProcedures` dit ce que le
// risque commande, `planifierProcedure` planifie, `redigerPapierDeProcedure`
// rédige le papier — et AUCUN écran ne les appelait : seul le semeur de la
// démonstration (`lib/flows/enrichir.ts`) les touchait. Un auditeur voyait, sur
// l'écran du risque, une liste de procédures « commandées » qui n'ouvrait sur
// rien, et ne pouvait pas planifier un travail en cliquant. C'est « un geste du
// métier sans écran », mot pour mot dans la règle 13.
//
// TROIS LISTES, ET LA DEUXIÈME EST CELLE QU'ON OUBLIE :
//   · ce que le risque COMMANDE — planifié ou non ;
//   · ce qui est PLANIFIÉ ET QUE LE RISQUE NE COMMANDE PLUS. Baisser un niveau
//     d'assertion retire une procédure des requises ; si l'écran s'arrêtait à la
//     première liste, le travail déjà fait sous cette procédure disparaîtrait de
//     la vue sans que personne ne l'ait décidé. Même règle qu'au re-tirage
//     (ADR-133) : un recalcul ne fait pas disparaître du travail en silence ;
//   · ce qui est ÉCARTÉ, avec le niveau atteint et le minimum exigé — une liste
//     qui ne dit que ce qu'elle retient ne se conteste pas.

export interface LigneProgramme {
  code: string;
  libelle: string;
  assertion: string;
  /** Le niveau de l'assertion aujourd'hui — nul si elle n'est pas évaluée. */
  niveau: string | null;
  /** Le minimum que la méthode exige pour que la procédure soit requise. */
  minimum: string;
  /** Pourquoi elle est là — la phrase du service de risque, relisible. */
  pourquoi: string;
  taille: number | null;
  /** Ce que l'écran écrit à la place d'un nombre quand il n'y en a pas. */
  tailleDit: string | null;
  planifiee: {
    id: string; statut: string;
    papier: { id: string; code: string; statut: string; version: number } | null;
    /** Un papier visé : une version nouvelle exige un motif écrit (PROG-06). */
    vise: boolean;
  } | null;
  /** Lot 3, tranche 1 (mandat, Partie C.1) — la forme de l'atelier qui exécute
   *  cette procédure. Connue dès le CATALOGUE (`r.procedure.nature`,
   *  `e.nature`) : contrairement à `planifiee`, elle existe même AVANT que la
   *  procédure ne soit planifiée — un auditeur voit ce qu'il commande avant
   *  de le commander. */
  nature: NatureDeTest;
}

/**
 * Lot 3, tranches 1-4 — LOT COMPLET (mandat, Partie C.1) — LE SEUL ENDROIT qui
 * sait, pour une nature de test, l'atelier qui l'exécute. Quatre cases,
 * HONNÊTES, chacune bornée à UN SEUL poste : `sondage_pieces` (Lot 2, le
 * cycle de testing du chiffre d'affaires, `REV-SUBST`/`testing/grille.ts`) et
 * `recalcul_parametre` (les estimations comptables hors litige, ADR-106a,
 * `estimations.ts` — fichier de calcul du client, rapproché au grand livre,
 * recalculé au centime, base sondée, justificatifs de CHAQUE paramètre
 * demandés en brouillon : exactement la forme que Partie C.1 décrit pour
 * cette nature) sur REVENUE ; `confirmation_externe` ET `rapprochement`
 * (les circularisations, `TRESO-CIRC`/`TRESO-RAPPRO` dans le catalogue —
 * `cycle: 'CASH'` depuis le Lot 5, poste Trésorerie, 2026-09-14 ; RAPPRO
 * (`cycle: '*'`, générique, exhaustivité du détail) s'y ajoute déjà par son
 * échappatoire propre, sans rapport avec ce correctif — `circularisations.ts`
 * — listing des tiers importé, complétude contre le grand livre, envoi
 * simulé, réponse déposée, PUIS rapprochement dérivé, `rapprochement()`
 * ligne ~292 : solde comptable contre `montant_confirme`, écart calculé et
 * jamais tu — les DEUX natures que Partie C.1 décrit pour la Trésorerie,
 * Partie C.3 point 1 : « confirmation_externe + rapprochement. Le plus
 * démonstratif après le CA, et les circularisations existent déjà »)
 * sur CASH, TOUTES DEUX rendues sur le MÊME écran (`circularisations/page.tsx`
 * — campagne de confirmation puis rapprochement dérivé, l'un sous l'autre) :
 * même URL, deux entrées de ce dispatch, parce que c'est UN SEUL atelier qui
 * exécute les deux étapes d'un même contrôle de trésorerie. La seconde
 * nature que `circularisations.ts` construit, `POSTE.avocat = 'PROVISIONS'`
 * (Partie C.3 point 6) — `PROVISIONS` est un `fsli.code` réel, pas absent —
 * n'a aucun `procedure_instance` câblé dessus ici : ce câblage entre au Lot
 * 5, avec le poste Provisions lui-même, pas ces tranches (règle 8).
 * AUCUNE DES QUATRE CASES N'EST GÉNÉRIQUE sur `fsliCode` : `montantComptabilise`
 * (estimations.ts) rapproche sur les comptes 70x, `circularisations.ts` sur
 * `POSTE.banque = 'CASH'` (ligne dédiée, jamais un préfixe français en dur)
 * — un lien vers l'un de ces ateliers pour un AUTRE poste ouvrirait un
 * atelier qui ne saurait pas rapprocher SES écritures à lui.
 * CHAQUE NATURE CÂBLÉE A SA PROCÉDURE-ÉCHAPPATOIRE (`cycle: '*'`) et son
 * lot de procédures bloquées par un `cycle`/`postes` qui ne correspond à
 * AUCUN `fsli.code` réel — DEUX FOIS LE MÊME DÉFAUT, PRÉEXISTANT et
 * distinct de cette fonction, sur `recalcul_parametre` et sur l'usage
 * `CLIENTS`/`FOURN`/`PROV` de `CONFIRM` (jamais sur `confirmation_externe`
 * ni `rapprochement` pour CASH — CORRIGÉ, Lot 5 poste Trésorerie,
 * 2026-09-14) :
 * `recalcul_parametre` — RECALC/ESTIM échappent (R54, 14 autres bloquées,
 * planifiables nulle part) ; `confirmation_externe` — `TRESO-CIRC` porte
 * désormais `cycle: 'CASH'` (corrigé de `'TRESO'`, R56 fermé POUR CASH —
 * `CONFIRM` garde `postes: ['CLIENTS','TRESO','FOURN','PROV']`, sans
 * `'CASH'`, et reste donc bloqué sur ces quatre-là, hors périmètre de
 * cette tranche, R56 encore ouvert POUR ELLES) ; `rapprochement` — sur les
 * NEUF procédures du catalogue, DEUX portent `cycle: '*'` (RAPPRO et
 * ANNEXE, `ANNEXE` hors du champ de cette fonction — pas câblée) : RAPPRO
 * échappe donc comme RECALC/ESTIM et reste planifiable sur CASH par cette
 * voie ; `TRESO-RAPPRO`, lui, porte désormais `cycle: 'CASH'` (corrigé de
 * `'TRESO'`, même correctif que TRESO-CIRC) et n'a plus besoin d'échapper.
 * Les SEPT procédures restantes du catalogue portent toujours un `cycle`
 * qui ne correspond à aucun `fsli.code` réel — R57, docs/BACKLOG_REPORTE.md,
 * inchangé par cette tranche (postes hors Trésorerie).
 * RAPPRO/TRESO-CIRC/TRESO-RAPPRO sont donc tous PLANIFIABLES sur CASH,
 * mais RIEN ne les plante ENCORE — ni `bootstrapNep()` ni
 * `enrichirMondeDemo()` — dans le monde semé à la date de ce commentaire :
 * contrairement à RECALC (planifiable ET seedé, juste absent de
 * `npm run verify`, R55), leur preuve d'atelier vient encore exclusivement
 * d'un cas connu mauvais à insertion directe
 * (`atelier-confirmation-lecture.test.ts`, `atelier-rapprochement-lecture.test.ts`),
 * pas d'un clic réel — la suite de cette même tranche (Lot 5, Trésorerie)
 * plante un geste réel via `planifierProcedure`, pas un `insert` direct.
 * RECALC vit aujourd'hui dans « hors commande » (le risque actuel ne la
 * commande plus, mais elle a été planifiée — programme/page.tsx), pas dans
 * « commandées » : l'appelant doit donc offrir l'atelier dans LES DEUX
 * rendus dès qu'une ligne porte `planifiee`, pas seulement dans le tableau
 * des procédures commandées — trouvé en construisant la tranche 2 (règle
 * 10, un écran conduit dans un navigateur avant d'être annoncé) : sans ce
 * second appel, l'atelier livré n'aurait jamais été atteignable au clic
 * dans le monde semé.
 * `/estimations` et `/circularisations` sont chacun un atelier PAR DOSSIER,
 * pas filtré par ligne de programme ni par procédure — comme `/testing`
 * déjà, le lien ouvre l'espace de travail entier, jamais une vue
 * pré-découpée par `procedure_instance`. `null` se lit à l'écran comme
 * « aucun atelier construit pour cette nature encore » — jamais comme un
 * geste caché.
 *
 * CE QUE CETTE FONCTION NE FAIT PAS (règle 19) : elle ne construit AUCUN
 * atelier — `confirmation_externe` sur PROVISIONS (avocats, Lot 5 point 6)
 * et `confirmation_externe` sur TRADE_RECEIVABLES (CLIENTS-CIRC : NON commandée
 * par le risque sur ce dossier aujourd'hui — l'assertion `realite` y est
 * `faible`, mesuré par exécution avant de scoper la tranche Clients, pas
 * supposé — mais deviendrait un atelier RÉEL à construire, `circularisations.ts`
 * n'a que les Nature `banque`/`avocat`, le jour où le risque la commande),
 * et `sondage_pieces` sur TRADE_RECEIVABLES (CLIENTS-AVOIRS : commandée par le
 * risque sur ce dossier — `exhaustivite` y est `moyen` —, mais SANS atelier :
 * `sample`/`sample_item` ne sont écrits que par `proposeRevenueSample`/
 * `drawRevenueSample`, câblés en dur sur `revenuePopulation()`, disclosed R92
 * (docs/BACKLOG_REPORTE.md) plutôt que planifiée sans écran atteignable),
 * `rapprochement` sur PPE (IMMO_COR-TAB, tableau de variation des
 * immobilisations : `/balances-aux` ne généralise pas — `Cote` est une union
 * fermée `'clients' | 'fournisseurs'`, et un rollforward ouverture+
 * acquisitions-cessions=clôture n'est de toute façon PAS le même calcul
 * qu'un rapprochement sous-registre↔GL) et `sondage_pieces` sur PPE
 * (IMMO_COR-ACQ, acquisitions : même gap que CLIENTS-AVOIRS, `/testing` câblé
 * sur REVENUE) — ces deux-là disclosed R95 plutôt que planifiées, Lot 5 poste 3
 * (Immobilisations, 2026-09-15) — entrent ICI le jour où ils existent, jamais
 * ailleurs — un second endroit qui devine l'atelier diverge un jour.
 * Lot 3 (Partie C.1) est COMPLET avec la quatrième case (CASH) : les quatre
 * natures qu'il mandatait (`sondage_pieces`, `recalcul_parametre`,
 * `confirmation_externe`, `rapprochement`) ont chacune un atelier réel sur
 * au moins un poste. Lot 5, poste 2 (Clients, 2026-09-15) généralise DEUX de
 * ces quatre cases (`rapprochement`, `recalcul_parametre`) à un second poste —
 * les deux ateliers sous-jacents (`balances-aux`, `estimations`) sont
 * poste-agnostiques PAR LEUR CLÉ, seule la ligne de routage manquait ; NI L'UN
 * NI L'AUTRE n'est poste-agnostique dans son CALCUL (`balances-aux.ts` : type
 * `Cote` fermé à deux valeurs ; `estimations.ts` : `montantComptabilise` filtre
 * en dur les comptes `70%` — précision ajoutée le 2026-09-15, poste 3, la
 * phrase d'origine ne le disait pas). Lot 5, poste 3 (Immobilisations)
 * généralise UNE SEULE case (`recalcul_parametre`, à PPE, même limite de
 * calcul que ci-dessus) ; les DEUX autres cases qu'il aurait pu généraliser
 * (`rapprochement`, `sondage_pieces`) restent SANS atelier sur ce poste,
 * disclosed R95. Les QUATRE autres natures (`revue_analytique_substantive`,
 * `test_exhaustif`, `tests_de_controles`, `observation_documentee`) restent
 * hors de ce Lot.
 */
export function atelierDeLaNature(nature: NatureDeTest, fsliCode: string, base: string): string | null {
  if (nature === 'sondage_pieces' && fsliCode === 'REVENUE') return `${base}/testing`;
  if (nature === 'recalcul_parametre' && fsliCode === 'REVENUE') return `${base}/estimations`;
  if (nature === 'confirmation_externe' && fsliCode === 'CASH') return `${base}/circularisations`;
  if (nature === 'rapprochement' && fsliCode === 'CASH') return `${base}/circularisations`;
  /* Lot 5, poste 2 (Clients, 2026-09-15) : `rapprochement` sur TRADE_RECEIVABLES
     n'est PAS le rapprochement de tiers circularisés (`circularisations.ts`,
     Nature 'banque'/'avocat' seulement — CLIENTS-CIRC n'est pas commandée par
     le risque sur ce dossier, vérifié par exécution, pas supposé) : c'est
     CLIENTS-AGE, « rapprocher la balance âgée au solde comptable » — l'atelier
     qui fait déjà exactement ça est `/balances-aux` (ADR-107, point 1),
     poste-agnostique PAR SA CLÉ (`Cote = 'clients' | 'fournisseurs'`), mais
     PAS par son TYPE — un troisième poste (ex. Immobilisations) ne pourrait
     PAS réutiliser `/balances-aux` sans étendre ce type union, une vraie
     mécanique neuve, pas un câblage supplémentaire (voir R95, poste 3 ne
     l'a donc PAS reçu). `recalcul_parametre`/CLIENTS-DEPREC : `estimations.ts`
     est générique par sa CLÉ (`pieceRef`, jamais `fsliCode`) — MAIS PAS par
     son calcul : `montantComptabilise` (`estimations.ts`) filtre en dur
     `account_no like '70%'` (comptes de PRODUITS), donc son papier reste
     `utilisee:false` HONNÊTE (jamais exercé) sur TOUT poste hors REVENUE,
     câblé ici pour un second poste plutôt que dupliqué — précision corrigée
     le 2026-09-15 (poste 3, Immobilisations) : la phrase d'origine disait
     « déjà générique » sans nuance, ce qui était vrai pour la clé, faux pour
     le calcul (règle 13, corollaire). */
  if (nature === 'rapprochement' && fsliCode === 'TRADE_RECEIVABLES') return `${base}/balances-aux?cote=clients`;
  if (nature === 'recalcul_parametre' && fsliCode === 'TRADE_RECEIVABLES') return `${base}/estimations`;
  /* Lot 5, poste 3 (Immobilisations, 2026-09-15) : PPE seul (INTANGIBLES reste
     sous la matérialité de performance sur ce dossier, 12 000 € < 27 000 € —
     mesuré, pas supposé ; FINANCIAL_ASSETS absent du plan de comptes). Seule
     IMMO_COR-DOT (recalcul_parametre, dotations aux amortissements) reçoit un
     atelier — le même `/estimations` que TRADE_RECEIVABLES, MÊME LIMITE
     ci-dessus (papier `utilisee:false`, jamais exercé). IMMO_COR-TAB
     (rapprochement, tableau de variation) et IMMO_COR-ACQ (sondage_pieces,
     acquisitions) N'ONT AUCUN atelier réutilisable — ni `/balances-aux`
     (union de type fermée), ni `/testing` (câblé en dur sur
     `revenuePopulation()`, R92) : disclosed R95, pas planifiées. */
  if (nature === 'recalcul_parametre' && fsliCode === 'PPE') return `${base}/estimations`;
  /* Lot 5, poste 4 (Fournisseurs, 2026-09-15) : FOURN-CIRC (confirmation_externe)
     réutilise le MÊME atelier que TRESO-CIRC — `circularisations.ts` porte
     désormais une troisième Nature (`fournisseur`, migration 0165), le même
     écran `/circularisations` route les trois. FOURN-SUL/FOURN-FNP
     (sondage_pieces) N'ONT AUCUN atelier réutilisable — même gap que
     CLIENTS-AVOIRS/IMMO_COR-ACQ (R92/R95) : `/testing` reste câblé sur
     REVENUE — disclosed R96/backlog, pas planifiées. */
  if (nature === 'confirmation_externe' && fsliCode === 'TRADE_PAYABLES') return `${base}/circularisations`;
  return null;
}

export interface PosteProgramme {
  code: string;
  nom: string;
  /** Faux = aucune assertion évaluée sur ce poste : le risque ne commande rien encore. */
  risqueEvalue: boolean;
  commandees: LigneProgramme[];
  horsCommande: LigneProgramme[];
  ecartees: LigneProgramme[];
  /** Lot 4, tranche 1 — les procédures DÉPLANIFIÉES : un travail humain qui
   *  reste visible après une décision d'auditeur, jamais effacé (règle 28). */
  deplanifiees: ProcedureDeplanifiee[];
}

/** Le programme de travail de TOUS les postes retenus, dans l'ordre du dossier. */
export async function programmeDuDossier(engagementId: string): Promise<PosteProgramme[]> {
  const postes = await q<{ code: string; name: string }>(
    `select code, name from fsli
     where engagement_id = $1 and scoping in ('in_scope','in_scope_qualitative')
     order by statement, code`,
    [engagementId]);
  /* LES VISAS EN UNE FOIS : un papier visé ne se dépasse pas sans motif écrit
     (PROG-06), et l'écran doit le savoir AVANT de proposer le geste — sinon il
     offre un bouton dont il ignore qu'il sera refusé. */
  const vises = new Set((await q<{ id: string }>(
    `select distinct w.procedure_id::text id from workpaper w
     join signoff s on s.workpaper_id = w.id
     where w.engagement_id = $1 and w.status <> 'outdated' and w.procedure_id is not null`,
    [engagementId])).map((r) => r.id));

  const out: PosteProgramme[] = [];
  for (const poste of postes) {
    /* CE QUE L'ON NE PAIE PAS QUAND ÇA NE SERT À RIEN (revue hostile de la
       nuit, constat 4). `requiredProcedures` et `excludedProcedures` rejouent
       CHACUNE `risksFor` : trois fois par poste, plus le catalogue rechargé à
       chaque appel. Or `proposeScoping` retient tout ce qui dépasse le seuil,
       et un dossier réel porte une quinzaine de postes retenus dont un seul est
       évalué. Mesuré par la revue : 272 requêtes pour un rendu, dont quatorze
       postes sur quinze qui n'affichent qu'une phrase. On demande donc d'abord
       le risque — deux requêtes — et on ne va plus loin que s'il existe. */
    const risques = await risksFor(engagementId, poste.code);
    const [planifiees, deplanifiees] = await Promise.all([
      proceduresPlanifiees(engagementId, poste.code),
      proceduresDeplanifiees(engagementId, poste.code),
    ]);
    if (risques.length === 0) {
      /* ET POURTANT ON REND CE QUI EST PLANIFIÉ DESSOUS (constat 3). La
         première version enfermait les trois listes dans « le risque est
         évalué » : un poste retenu, non évalué, portant un papier déjà rédigé,
         n'affichait que « le risque n'est pas évalué » — un objet créé
         qu'aucun chemin de lecture n'atteint, alors que `/api/sante` le
         comptait. Mesuré par la revue : CAS-01, papier existant, invisible. */
      out.push({
        code: poste.code, nom: poste.name, risqueEvalue: false,
        commandees: [], ecartees: [], deplanifiees,
        horsCommande: planifiees.map((x) => ({
          code: x.code, libelle: x.titre, assertion: x.assertion ?? '—',
          niveau: null, minimum: '—', pourquoi: '', taille: null, tailleDit: null,
          nature: x.nature,
          planifiee: {
            id: x.id, statut: x.status, vise: vises.has(x.id),
            papier: x.papier
              ? { id: x.papier.id, code: x.papier.code, statut: x.papier.status, version: x.papier.version }
              : null,
          },
        })),
      });
      continue;
    }
    const [requises, ecartees] = await Promise.all([
      requiredProcedures(engagementId, poste.code),
      excludedProcedures(engagementId, poste.code),
    ]);
    const parCode = new Map(planifiees.map((x) => [x.code, x]));
    const vue = (x: ProcedurePlanifiee | undefined): LigneProgramme['planifiee'] => (x
      ? {
          id: x.id, statut: x.status, vise: vises.has(x.id),
          papier: x.papier
            ? { id: x.papier.id, code: x.papier.code, statut: x.papier.status, version: x.papier.version }
            : null,
        }
      : null);

    const commandees: LigneProgramme[] = requises.map((r) => ({
      code: r.procedure.code, libelle: r.procedure.libelle, assertion: r.assertion,
      niveau: r.level, minimum: r.requires, pourquoi: r.because,
      taille: r.sampleSize,
      tailleDit: r.sampleSize !== null || r.taille.origine === 'sans_objet'
        ? null : (r.taille.obstacle ?? null),
      nature: r.procedure.nature,
      planifiee: vue(parCode.get(r.procedure.code)),
    }));
    const requisesCodes = new Set(requises.map((r) => r.procedure.code));
    const parCodeEcartee = new Map(ecartees.map((e) => [e.code, e]));
    const horsCommande: LigneProgramme[] = planifiees
      .filter((x) => !requisesCodes.has(x.code))
      .map((x) => {
        const e = parCodeEcartee.get(x.code);
        return {
          code: x.code, libelle: x.titre, assertion: x.assertion ?? e?.assertion ?? '—',
          niveau: e?.level ?? null, minimum: e?.requires ?? '—',
          pourquoi: '', taille: null, tailleDit: null, nature: x.nature, planifiee: vue(x),
        };
      });
    out.push({
      code: poste.code, nom: poste.name,
      risqueEvalue: risques.length > 0,
      commandees,
      horsCommande,
      deplanifiees,
      ecartees: ecartees.filter((e) => !parCode.has(e.code)).map((e) => ({
        code: e.code, libelle: e.libelle, assertion: e.assertion,
        niveau: e.level, minimum: e.requires, pourquoi: '', taille: null, tailleDit: null, nature: e.nature,
        planifiee: null,
      })),
    });
  }
  return out;
}
