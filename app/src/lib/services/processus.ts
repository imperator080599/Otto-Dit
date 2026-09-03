import { q, q01, q1 } from '@/lib/db/client';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { ingestEvidence } from './evidence';
import { raiseFactor } from './questionnaire';
import { motif, type Motif } from './motif';
import { assertMembre } from '@/lib/core/membre';

// LE PROCESSUS EN DONNÉES STRUCTURÉES (point 2, ADR-108). On ne lit pas le
// flowchart du client : la plateforme héberge les étapes, acteurs, systèmes,
// entrées/sorties et contrôles rattachés, et GÉNÈRE le diagramme. La
// comparaison N/N-1 est une différence EXACTE, dérivée à la lecture, jamais
// stockée — seules les décisions humaines le sont : CHAQUE changement se
// statue (significatif ou non, motivé), et un changement significatif lève
// un facteur de risque PROPOSÉ sur les postes du cycle — proposé, pas
// appliqué : un humain confirme au registre, comme partout.

export interface EtapeProcessus {
  code: string; seq: number; libelle: string; acteur: string; systeme: string;
  entrees: string; sorties: string;
}
export interface ControleProcessus {
  code: string; etape: string; libelle: string; frequence: string; proprietaire: string;
}
export interface VersionProcessus {
  id: string; exercice: 'n' | 'n1'; nom: string; filename: string;
  etapes: EtapeProcessus[]; controles: ControleProcessus[];
}

/** Les postes qu'un changement significatif de CE cycle concerne. */
export const FSLI_DU_CYCLE: Record<string, { fsli: string; assertions: string[] }[]> = {
  REVENUE: [
    { fsli: 'REVENUE', assertions: ['realite', 'exhaustivite'] },
    { fsli: 'TRADE_RECEIVABLES', assertions: ['evaluation'] },
  ],
};

function champTexte(brut: unknown, ou: string): string {
  if (typeof brut !== 'string' || !brut.trim()) {
    throw new Error(`processus : ${ou} est vide ou manquant`);
  }
  return brut.trim();
}

/** Importer une VERSION du processus — un fichier structuré, pièce à part
 *  entière. Le remplacement exige une confirmation explicite (ADR-016 en
 *  esprit : rien ne s'écrase en silence). */
export async function importerProcessus(opts: {
  engagementId: string;
  exercice: 'n' | 'n1';
  filename: string;
  contenu: Uint8Array;
  userId: string;
  confirmerRemplacement?: boolean;
}): Promise<string> {
  await assertMembre(opts.engagementId, opts.userId, 'importer une description de processus');
  if (!opts.contenu.length) throw new Error('processus : le fichier est vide — rien à importer');
  let racine: { cycle?: unknown; nom?: unknown; etapes?: unknown; controles?: unknown };
  try {
    racine = JSON.parse(new TextDecoder('utf-8').decode(opts.contenu));
  } catch {
    throw new Error('processus : le fichier n\'est pas un JSON lisible — voir dataset/processus/README.md pour le format');
  }
  const cycle = champTexte(racine.cycle, 'le cycle');
  const nom = champTexte(racine.nom, 'le nom du processus');
  if (!Array.isArray(racine.etapes) || racine.etapes.length === 0) {
    throw new Error('processus : aucune étape — un processus sans étape ne décrit rien');
  }
  const etapes: EtapeProcessus[] = [];
  const codesEtapes = new Set<string>();
  (racine.etapes as unknown[]).forEach((e, i) => {
    const o = e as Record<string, unknown>;
    const ou = `étape ${i + 1}`;
    const code = champTexte(o.code, `${ou}, le code`);
    if (codesEtapes.has(code)) throw new Error(`processus : le code d'étape « ${code} » apparaît deux fois`);
    codesEtapes.add(code);
    etapes.push({
      code, seq: i + 1,
      libelle: champTexte(o.libelle, `${ou} (${code}), le libellé`),
      acteur: champTexte(o.acteur, `${ou} (${code}), l'acteur`),
      systeme: champTexte(o.systeme, `${ou} (${code}), le système`),
      entrees: typeof o.entrees === 'string' ? o.entrees.trim() : '',
      sorties: typeof o.sorties === 'string' ? o.sorties.trim() : '',
    });
  });
  const controles: ControleProcessus[] = [];
  const codesCtrl = new Set<string>();
  ((Array.isArray(racine.controles) ? racine.controles : []) as unknown[]).forEach((c, i) => {
    const o = c as Record<string, unknown>;
    const ou = `contrôle ${i + 1}`;
    const code = champTexte(o.code, `${ou}, le code`);
    if (codesCtrl.has(code)) throw new Error(`processus : le code de contrôle « ${code} » apparaît deux fois`);
    codesCtrl.add(code);
    const etape = champTexte(o.etape, `${ou} (${code}), l'étape de rattachement`);
    if (!codesEtapes.has(etape)) {
      throw new Error(`processus : le contrôle ${code} se rattache à l'étape « ${etape} », qui n'existe pas`);
    }
    controles.push({
      code, etape,
      libelle: champTexte(o.libelle, `${ou} (${code}), le libellé`),
      frequence: champTexte(o.frequence, `${ou} (${code}), la fréquence`),
      proprietaire: champTexte(o.proprietaire, `${ou} (${code}), le propriétaire`),
    });
  });

  const deja = await q01<{ id: string }>(
    `select id from process_model where engagement_id = $1 and cycle_ref = $2 and exercice = $3`,
    [opts.engagementId, cycle, opts.exercice],
  );
  if (deja && !opts.confirmerRemplacement) {
    throw new Error(`processus : la version ${opts.exercice === 'n' ? 'N' : 'N-1'} du cycle ${cycle} est déjà décrite — remplacer une description invalide les décisions prises sur des changements qui disparaîtraient, et se CONFIRME`);
  }

  const ctx = await engagementCtx(opts.engagementId);
  const { evidenceId } = await ingestEvidence({
    engagementId: opts.engagementId,
    filename: opts.filename,
    mime: 'application/json',
    bytes: opts.contenu,
    source: 'auditor',
    audience: 'internal',
    uploadedBy: { kind: 'app_user', id: opts.userId },
  });
  if (deja) await q(`delete from process_model where id = $1`, [deja.id]);
  const modele = await q1<{ id: string }>(
    `insert into process_model (engagement_id, cycle_ref, exercice, name, evidence_id, created_by)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [opts.engagementId, cycle, opts.exercice, nom, evidenceId, opts.userId],
  );
  for (const e of etapes) {
    await q(
      `insert into process_step (process_id, code, seq, label, actor_name, system_name, inputs, outputs)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [modele.id, e.code, e.seq, e.libelle, e.acteur, e.systeme, e.entrees, e.sorties],
    );
  }
  for (const c of controles) {
    await q(
      `insert into process_ctrl (process_id, step_code, code, label, frequency, owner_name)
       values ($1,$2,$3,$4,$5,$6)`,
      [modele.id, c.etape, c.code, c.libelle, c.frequence, c.proprietaire],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId,
    actorKind: 'user', actorId: opts.userId,
    verb: deja ? 'process_replaced' : 'process_imported', objectType: 'process_model', objectId: modele.id,
    payload: { cycle, exercice: opts.exercice, etapes: etapes.length, controles: controles.length, evidenceId },
  });
  return modele.id;
}

export async function lireProcessus(engagementId: string, cycle: string): Promise<Partial<Record<'n' | 'n1', VersionProcessus>>> {
  const out: Partial<Record<'n' | 'n1', VersionProcessus>> = {};
  for (const exercice of ['n', 'n1'] as const) {
    const m = await q01<{ id: string; name: string; filename: string }>(
      `select m.id::text id, m.name, e.filename from process_model m
       join evidence e on e.id = m.evidence_id
       where m.engagement_id = $1 and m.cycle_ref = $2 and m.exercice = $3`,
      [engagementId, cycle, exercice],
    );
    if (!m) continue;
    const etapes = await q<{ code: string; seq: number; label: string; actor_name: string; system_name: string; inputs: string; outputs: string }>(
      `select code, seq, label, actor_name, system_name, inputs, outputs
       from process_step where process_id = $1 order by seq`,
      [m.id],
    );
    const controles = await q<{ code: string; step_code: string; label: string; frequency: string; owner_name: string }>(
      `select code, step_code, label, frequency, owner_name
       from process_ctrl where process_id = $1 order by code`,
      [m.id],
    );
    out[exercice] = {
      id: m.id, exercice, nom: m.name, filename: m.filename,
      etapes: etapes.map((e) => ({
        code: e.code, seq: e.seq, libelle: e.label, acteur: e.actor_name,
        systeme: e.system_name, entrees: e.inputs, sorties: e.outputs,
      })),
      controles: controles.map((c) => ({
        code: c.code, etape: c.step_code, libelle: c.label,
        frequence: c.frequency, proprietaire: c.owner_name,
      })),
    };
  }
  return out;
}

export interface Changement {
  /** Stable : sert de clé de décision et de source_ref au registre. */
  code: string;
  objet: 'etape' | 'controle';
  sens: 'ajout' | 'suppression' | 'modification';
  /** Le changement, en CLÉ de catalogue et ses variables — jamais une phrase. */
  libelle: Motif;
  avant: string | null;
  apres: string | null;
}
export interface DecisionChangement {
  significance: 'significatif' | 'non_significatif';
  reason: string;
  decideur: string;
  quand: string;
}
export interface DiffProcessus {
  changements: Changement[];
  decisions: Record<string, DecisionChangement>;
  aStatuer: Changement[];
}

/** La différence N/N-1 — EXACTE, champ par champ, appariée par code. L'ordre
 *  des étapes (seq) n'est pas un changement : déplacer une ligne dans le
 *  fichier ne modifie pas le processus. */
export function diffVersions(n: VersionProcessus, n1: VersionProcessus, cycle: string): Changement[] {
  const out: Changement[] = [];
  const eN = new Map(n.etapes.map((e) => [e.code, e]));
  const eN1 = new Map(n1.etapes.map((e) => [e.code, e]));
  /* LES NOMS DE CHAMP SONT DES CLÉS : « Étape A — libellé modifié » se rendait
     en français sur l'instance anglaise, invisible au détecteur tant qu'il ne
     lisait pas les gabarits (revue hostile n°4). */
  const CHAMPS_ETAPE: [keyof EtapeProcessus, CleLibelle][] = [
    ['libelle', 'proc.libelle'], ['acteur', 'proc.actor'], ['systeme', 'proc.systeme'],
    ['entrees', 'proc.entrees'], ['sorties', 'proc.outputs'],
  ];
  for (const code of [...new Set([...eN1.keys(), ...eN.keys()])].sort()) {
    const a = eN1.get(code), b = eN.get(code);
    if (a && !b) {
      out.push({ code: `proc:${cycle}:etape-:${code}`, objet: 'etape', sens: 'suppression',
        libelle: motif('proc.chg.etapeSupprimee', { code, libelle: a.libelle }), avant: a.libelle, apres: null });
    } else if (!a && b) {
      out.push({ code: `proc:${cycle}:etape+:${code}`, objet: 'etape', sens: 'ajout',
        libelle: motif('proc.chg.etapeAjoutee', { code, libelle: b.libelle }), avant: null, apres: b.libelle });
    } else if (a && b) {
      for (const [champ, nomChamp] of CHAMPS_ETAPE) {
        if (a[champ] !== b[champ]) {
          out.push({ code: `proc:${cycle}:etape~:${code}:${champ}`, objet: 'etape', sens: 'modification',
            libelle: motif('proc.chg.etapeModifiee', { code, champ: { cle: nomChamp } }), avant: String(a[champ]), apres: String(b[champ]) });
        }
      }
    }
  }
  const cN = new Map(n.controles.map((c) => [c.code, c]));
  const cN1 = new Map(n1.controles.map((c) => [c.code, c]));
  const CHAMPS_CTRL: [keyof ControleProcessus, CleLibelle][] = [
    ['libelle', 'proc.libelle'], ['etape', 'proc.etape'],
    ['frequence', 'proc.frequence'], ['proprietaire', 'proc.proprietaire'],
  ];
  for (const code of [...new Set([...cN1.keys(), ...cN.keys()])].sort()) {
    const a = cN1.get(code), b = cN.get(code);
    if (a && !b) {
      out.push({ code: `proc:${cycle}:controle-:${code}`, objet: 'controle', sens: 'suppression',
        libelle: motif('proc.chg.controleSupprime', { code, libelle: a.libelle }), avant: a.libelle, apres: null });
    } else if (!a && b) {
      out.push({ code: `proc:${cycle}:controle+:${code}`, objet: 'controle', sens: 'ajout',
        libelle: motif('proc.chg.controleAjoute', { code, libelle: b.libelle }), avant: null, apres: b.libelle });
    } else if (a && b) {
      for (const [champ, nomChamp] of CHAMPS_CTRL) {
        if (a[champ] !== b[champ]) {
          out.push({ code: `proc:${cycle}:controle~:${code}:${champ}`, objet: 'controle', sens: 'modification',
            libelle: motif('proc.chg.controleModifie', { code, champ: { cle: nomChamp } }), avant: String(a[champ]), apres: String(b[champ]) });
        }
      }
    }
  }
  return out;
}

export async function diffProcessus(engagementId: string, cycle: string): Promise<DiffProcessus | null> {
  const v = await lireProcessus(engagementId, cycle);
  if (!v.n || !v.n1) return null;
  const changements = diffVersions(v.n, v.n1, cycle);
  const lignes = await q<{ change_code: string; significance: string; reason: string; decided_by: string; decided_at: string }>(
    `select d.change_code, d.significance, d.reason, u.name decided_by, d.decided_at::text
     from process_change_decision d join app_user u on u.id = d.decided_by
     where d.engagement_id = $1 and d.change_code like $2`,
    [engagementId, `proc:${cycle}:%`],
  );
  const decisions: Record<string, DecisionChangement> = {};
  for (const l of lignes) {
    decisions[l.change_code] = {
      significance: l.significance as DecisionChangement['significance'],
      reason: l.reason, decideur: l.decided_by, quand: l.decided_at,
    };
  }
  return { changements, decisions, aStatuer: changements.filter((c) => !decisions[c.code]) };
}

/** Statuer UN changement — motivé, signé. « Significatif » lève un facteur
 *  de risque PROPOSÉ sur les postes du cycle : proposé, un humain confirme
 *  au registre. */
export async function statuerChangement(opts: {
  engagementId: string; cycle: string; changeCode: string;
  significance: 'significatif' | 'non_significatif'; reason: string; userId: string;
}): Promise<void> {
  await assertMembre(opts.engagementId, opts.userId, 'statuer un changement de processus');
  if (!opts.reason.trim()) {
    throw new Error('processus : statuer un changement sans motif écrit ne se relit pas — motif requis');
  }
  const diff = await diffProcessus(opts.engagementId, opts.cycle);
  if (!diff) throw new Error('processus : les deux versions (N et N-1) doivent être décrites avant de statuer');
  const c = diff.changements.find((x) => x.code === opts.changeCode);
  if (!c) throw new Error(`processus : le changement « ${opts.changeCode} » n'existe pas dans la différence actuelle`);
  if (diff.decisions[opts.changeCode]) {
    throw new Error('processus : ce changement est déjà statué — une décision se revoit, elle ne se re-prend pas en silence');
  }
  const ctx = await engagementCtx(opts.engagementId);
  await q(
    `insert into process_change_decision (engagement_id, change_code, significance, reason, decided_by)
     values ($1,$2,$3,$4,$5)`,
    [opts.engagementId, opts.changeCode, opts.significance, opts.reason.trim(), opts.userId],
  );
  if (opts.significance === 'significatif') {
    const cibles = FSLI_DU_CYCLE[opts.cycle];
    if (!cibles) throw new Error(`processus : aucun poste n'est rattaché au cycle « ${opts.cycle} » — le rattachement se déclare, il ne se devine pas`);
    await raiseFactor({
      engagementId: opts.engagementId,
      source: 'manual',
      sourceRef: opts.changeCode,
      nature: 'changement',
      description: `${c.libelle}${c.avant !== null && c.apres !== null ? ` (« ${c.avant} » → « ${c.apres} »)` : ''} — changement de processus statué significatif : ${opts.reason.trim()}`,
      targets: cibles,
      actorUserId: opts.userId,
    });
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId,
    actorKind: 'user', actorId: opts.userId,
    verb: 'process_change_decided', objectType: 'process_change_decision', objectId: opts.changeCode,
    payload: { significance: opts.significance, facteur: opts.significance === 'significatif' },
  });
}

// ── LE DIAGRAMME — GÉNÉRÉ depuis les données, jamais dessiné à la main ──────

export interface BoiteEtape { code: string; x: number; y: number; w: number; h: number; libelle: string; acteur: string; systeme: string }
export interface BoiteControle { code: string; x: number; y: number; w: number; h: number; libelle: string; frequence: string; proprietaire: string; etape: string }
export interface Diagramme {
  w: number; h: number;
  etapes: BoiteEtape[];
  fleches: { x1: number; y1: number; x2: number; y2: number }[];
  controles: BoiteControle[];
  attaches: { x1: number; y1: number; x2: number; y2: number }[];
}

/** Disposition déterministe : les étapes en colonne, les contrôles rattachés
 *  à droite de leur étape. Pure — testable sans navigateur. */
export function layoutDiagramme(v: VersionProcessus): Diagramme {
  const E_W = 320, E_H = 58, PAS = 84, C_W = 300, C_H = 44, X_E = 10, X_C = 400;
  const etapes: BoiteEtape[] = [];
  const fleches: Diagramme['fleches'] = [];
  const controles: BoiteControle[] = [];
  const attaches: Diagramme['attaches'] = [];
  const parEtape = new Map<string, ControleProcessus[]>();
  for (const c of v.controles) {
    parEtape.set(c.etape, [...(parEtape.get(c.etape) ?? []), c]);
  }
  let yCtrl = 10;
  v.etapes.forEach((e, i) => {
    const y = 10 + i * PAS;
    etapes.push({ code: e.code, x: X_E, y, w: E_W, h: E_H, libelle: `${e.code} — ${e.libelle}`, acteur: e.acteur, systeme: e.systeme });
    if (i > 0) fleches.push({ x1: X_E + E_W / 2, y1: y - PAS + E_H, x2: X_E + E_W / 2, y2: y });
    for (const c of parEtape.get(e.code) ?? []) {
      const yc = Math.max(yCtrl, y);
      controles.push({ code: c.code, x: X_C, y: yc, w: C_W, h: C_H, libelle: c.libelle, frequence: c.frequence, proprietaire: c.proprietaire, etape: c.etape });
      attaches.push({ x1: X_E + E_W, y1: y + E_H / 2, x2: X_C, y2: yc + C_H / 2 });
      yCtrl = yc + C_H + 10;
    }
  });
  const h = Math.max(10 + v.etapes.length * PAS, yCtrl) + 10;
  return { w: X_C + C_W + 10, h, etapes, fleches, controles, attaches };
}

/** Les obstacles au visa portés par ce module : des changements N/N-1 non
 *  statués. (Les écarts d'entretien non statués sont portés par entretiens.ts.) */
export async function obstaclesProcessus(engagementId: string): Promise<Motif[]> {
  const cycles = await q<{ cycle_ref: string }>(
    `select distinct cycle_ref from process_model where engagement_id = $1 order by cycle_ref`,
    [engagementId],
  );
  const out: Motif[] = [];
  for (const c of cycles) {
    const diff = await diffProcessus(engagementId, c.cycle_ref);
    if (diff && diff.aStatuer.length > 0) {
      out.push(motif('obst.processusChangementsNonStatues', { cycle: c.cycle_ref, n: diff.aStatuer.length }));
    }
  }
  return out;
}
