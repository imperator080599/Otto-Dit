import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { ingestEvidence } from './evidence';
import { nextSeq } from './requests';
import { raiseFactor } from './questionnaire';
import { assertMembre } from '@/lib/core/membre';

// L'ANALYSE DES BALANCES AUXILIAIRES (point 1, ADR-107). Le client fournit
// ses balances auxiliaires ÂGÉES (clients / fournisseurs, N / N-1, cinq
// tranches) — le FEC ne porte aucun lettrage, l'ancienneté ne peut venir que
// de lui. Chaque fichier entre au moteur de pièces puis se RAPPROCHE au
// grand livre : le fichier N au solde actif du collectif, le fichier N-1 aux
// à-nouveaux. L'analyse est DÉRIVÉE à la lecture : concentration du top 10,
// tiers apparus et disparus, déplacements de part au-delà d'un seuil,
// déformation du vieillissement. Chaque constat est un CANDIDAT : il ne
// devient facteur de risque qu'en étant PROPOSÉ au registre (statut
// « proposé », un humain confirme — la règle de circulation du dossier), et
// les questions au client naissent en BROUILLON de demande (L2).

export type Cote = 'clients' | 'fournisseurs';
export type Exercice = 'n' | 'n1';

const TRANCHES = ['non_echu', 'j0_30', 'j31_60', 'j61_90', 'plus_90'] as const;
export const LIBELLES_TRANCHES: Record<(typeof TRANCHES)[number], string> = {
  non_echu: 'non échu', j0_30: '0-30 j', j31_60: '31-60 j', j61_90: '61-90 j', plus_90: '> 90 j',
};

const versCents = (v: number) => Math.round(v * 100);

function nombre(brut: string, ligne: number, colonne: string): number {
  const v = Number(brut.trim().replace(/[  ]/g, '').replace(',', '.'));
  if (!Number.isFinite(v)) {
    throw new Error(`balance auxiliaire : ligne ${ligne}, colonne « ${colonne} » : « ${brut.trim()} » n'est pas un nombre`);
  }
  return v;
}

/** Ce que le GRAND LIVRE porte pour ce côté : le solde actif du collectif
 *  (fichier N), et les à-nouveaux (fichier N-1). Dérivé, jamais stocké. */
export async function attenduGl(engagementId: string, cote: Cote, exercice: Exercice): Promise<number> {
  const prefixe = cote === 'clients' ? '411' : '401';
  const signe = cote === 'clients' ? 'debit - credit' : 'credit - debit';
  const anSeul = exercice === 'n1' ? `and journal_code = 'AN'` : '';
  const r = await q1<{ total: string | null }>(
    `select sum(${signe})::text total from gl_entry
     where engagement_id = $1 and status = 'active' and account_no like '${prefixe}%' ${anSeul}`,
    [engagementId],
  );
  return versCents(Number(r.total ?? 0));
}

export async function importerBalanceAux(opts: {
  engagementId: string;
  cote: Cote;
  exercice: Exercice;
  filename: string;
  contenu: Uint8Array;
  userId: string;
}): Promise<string> {
  if (!opts.contenu.length) throw new Error('balance auxiliaire : le fichier est vide — rien à importer');
  const deja = await q01<{ id: string }>(
    `select id from aux_balance_file where engagement_id = $1 and cote = $2 and exercice = $3`,
    [opts.engagementId, opts.cote, opts.exercice],
  );
  if (deja) {
    throw new Error(`balance auxiliaire : la balance ${opts.cote} ${opts.exercice === 'n' ? 'N' : 'N-1'} est déjà importée — une seconde version se traite comme une version de fichier, pas comme un écrasement silencieux`);
  }
  const texte = new TextDecoder('utf-8').decode(opts.contenu);
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignes.length < 2) throw new Error('balance auxiliaire : aucune ligne de données sous l\'en-tête');
  const entete = lignes[0].split(';');
  if (entete.length !== 7) {
    throw new Error(`balance auxiliaire : sept colonnes attendues (compte ; intitulé ; cinq tranches d'ancienneté), l'en-tête en porte ${entete.length}`);
  }
  interface Brute { seq: number; aux: string; label: string; tranches: number[] }
  const brutes: Brute[] = [];
  const vus = new Set<string>();
  for (let i = 1; i < lignes.length; i++) {
    const c = lignes[i].split(';');
    if (c.length !== 7) throw new Error(`balance auxiliaire : ligne ${i + 1} — sept colonnes attendues, ${c.length} trouvées`);
    const aux = c[0].trim();
    if (!aux) throw new Error(`balance auxiliaire : ligne ${i + 1} — le compte auxiliaire est vide`);
    if (vus.has(aux)) throw new Error(`balance auxiliaire : le compte « ${aux} » apparaît deux fois`);
    vus.add(aux);
    brutes.push({
      seq: i, aux, label: c[1].trim(),
      tranches: TRANCHES.map((_, j) => nombre(c[2 + j], i + 1, entete[2 + j])),
    });
  }

  const ctx = await engagementCtx(opts.engagementId);
  const { evidenceId } = await ingestEvidence({
    engagementId: opts.engagementId,
    filename: opts.filename,
    mime: 'text/csv',
    bytes: opts.contenu,
    source: 'auditor',
    audience: 'client_provided',
    uploadedBy: { kind: 'app_user', id: opts.userId },
  });
  const fichier = await q1<{ id: string }>(
    `insert into aux_balance_file (engagement_id, cote, exercice, evidence_id, created_by)
     values ($1,$2,$3,$4,$5) returning id`,
    [opts.engagementId, opts.cote, opts.exercice, evidenceId, opts.userId],
  );
  for (const b of brutes) {
    await q(
      `insert into aux_balance_row (file_id, seq, aux_no, aux_label, non_echu, j0_30, j31_60, j61_90, plus_90)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [fichier.id, b.seq, b.aux, b.label, ...b.tranches.map((t) => t.toFixed(2))],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId,
    actorKind: 'user', actorId: opts.userId,
    verb: 'aux_balance_imported', objectType: 'aux_balance_file', objectId: fichier.id,
    payload: { cote: opts.cote, exercice: opts.exercice, lignes: brutes.length, evidenceId },
  });
  return fichier.id;
}

export interface LigneAux {
  aux: string; label: string;
  soldeN: number | null; soldeN1: number | null;      // centimes ; null = absent de l'exercice
  partN: number | null; partN1: number | null;        // en points de pourcentage
  tranchesN: number[] | null;                          // centimes, 5 tranches
}

export interface CandidatFacteur {
  code: string;                                        // stable : sert de source_ref au registre
  nature: string;                                      // suggérée — l'humain reste maître au registre
  description: string;
  question: string;                                    // la question au client, prête pour la demande
}

export interface AnalyseAux {
  cote: Cote;
  fichiers: Partial<Record<Exercice, { id: string; evidenceId: string; filename: string; totalCents: number; attenduCents: number }>>;
  lignes: LigneAux[];
  top10: { partN: number; partN1: number } | null;
  apparus: LigneAux[];
  disparus: LigneAux[];
  deplacements: (LigneAux & { deltaPts: number })[];
  vieillissement: { partsN: number[]; partsN1: number[]; deltaPlus90Pts: number } | null;
  candidats: CandidatFacteur[];
  /** Les candidats déjà proposés au registre (source_ref), pour ne pas proposer deux fois. */
  proposes: string[];
}

const pct = (n: number) => Math.round(n * 1000) / 10;
const eurTexte = (c: number) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`;

/** L'analyse — ENTIÈREMENT dérivée des fichiers importés et du grand livre. */
export async function analyseAux(engagementId: string, cote: Cote, seuilPts = 3): Promise<AnalyseAux> {
  const fichiers: AnalyseAux['fichiers'] = {};
  const parExercice: Partial<Record<Exercice, Map<string, { label: string; tranches: number[] }>>> = {};
  for (const exercice of ['n', 'n1'] as Exercice[]) {
    const f = await q01<{ id: string; evidence_id: string; filename: string }>(
      `select f.id::text id, f.evidence_id::text, e.filename from aux_balance_file f
       join evidence e on e.id = f.evidence_id
       where f.engagement_id = $1 and f.cote = $2 and f.exercice = $3`,
      [engagementId, cote, exercice],
    );
    if (!f) continue;
    const rows = await q<{ aux_no: string; aux_label: string; non_echu: string; j0_30: string; j31_60: string; j61_90: string; plus_90: string }>(
      `select aux_no, aux_label, non_echu::text, j0_30::text, j31_60::text, j61_90::text, plus_90::text
       from aux_balance_row where file_id = $1 order by seq`,
      [f.id],
    );
    const map = new Map<string, { label: string; tranches: number[] }>();
    for (const r of rows) {
      map.set(r.aux_no, { label: r.aux_label, tranches: TRANCHES.map((t) => versCents(Number(r[t]))) });
    }
    parExercice[exercice] = map;
    const totalCents = [...map.values()].reduce((s, v) => s + v.tranches.reduce((a, b) => a + b, 0), 0);
    fichiers[exercice] = {
      id: f.id, evidenceId: f.evidence_id, filename: f.filename,
      totalCents, attenduCents: await attenduGl(engagementId, cote, exercice),
    };
  }

  const n = parExercice.n, n1 = parExercice.n1;
  const totalN = fichiers.n?.totalCents ?? 0;
  const totalN1 = fichiers.n1?.totalCents ?? 0;
  const cles = [...new Set([...(n?.keys() ?? []), ...(n1?.keys() ?? [])])].sort();
  const lignes: LigneAux[] = cles.map((aux) => {
    const vN = n?.get(aux), vN1 = n1?.get(aux);
    const soldeN = vN ? vN.tranches.reduce((a, b) => a + b, 0) : null;
    const soldeN1 = vN1 ? vN1.tranches.reduce((a, b) => a + b, 0) : null;
    return {
      aux, label: (vN ?? vN1)!.label,
      soldeN, soldeN1,
      partN: soldeN !== null && totalN > 0 ? pct(soldeN / totalN) : null,
      partN1: soldeN1 !== null && totalN1 > 0 ? pct(soldeN1 / totalN1) : null,
      tranchesN: vN?.tranches ?? null,
    };
  });

  const lesDeux = Boolean(n && n1);
  const topParts = (exercice: 'partN' | 'partN1') =>
    lignes.map((l) => l[exercice] ?? 0).sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0);
  const top10 = lesDeux ? { partN: Math.round(topParts('partN') * 10) / 10, partN1: Math.round(topParts('partN1') * 10) / 10 } : null;

  const apparus = lesDeux ? lignes.filter((l) => l.soldeN !== null && l.soldeN1 === null) : [];
  const disparus = lesDeux ? lignes.filter((l) => l.soldeN === null && l.soldeN1 !== null) : [];
  const deplacements = lesDeux
    ? lignes
        .filter((l) => l.partN !== null && l.partN1 !== null)
        .map((l) => ({ ...l, deltaPts: Math.round(((l.partN ?? 0) - (l.partN1 ?? 0)) * 10) / 10 }))
        .filter((l) => Math.abs(l.deltaPts) >= seuilPts)
        .sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts))
    : [];

  let vieillissement: AnalyseAux['vieillissement'] = null;
  if (n && n1 && totalN > 0 && totalN1 > 0) {
    const somme = (m: Map<string, { tranches: number[] }>, i: number) =>
      [...m.values()].reduce((s, v) => s + v.tranches[i], 0);
    const partsN = TRANCHES.map((_, i) => pct(somme(n, i) / totalN));
    const partsN1 = TRANCHES.map((_, i) => pct(somme(n1, i) / totalN1));
    vieillissement = { partsN, partsN1, deltaPlus90Pts: Math.round((partsN[4] - partsN1[4]) * 10) / 10 };
  }

  /* LES CANDIDATS — un constat n'est PAS un facteur : il le devient au
     registre, proposé puis confirmé par un humain. Le code est stable (il
     sert de source_ref) pour ne jamais proposer deux fois le même. */
  const qui = cote === 'clients' ? 'client' : 'fournisseur';
  const candidats: CandidatFacteur[] = [];
  if (top10 && top10.partN - top10.partN1 >= seuilPts) {
    candidats.push({
      code: `baux:${cote}:top10`, nature: 'incertitude',
      description: `La concentration du top 10 ${qui}s passe de ${top10.partN1} % à ${top10.partN} % du solde — la dépendance monte.`,
      question: `La concentration de vos dix premiers ${qui}s a augmenté (${top10.partN1} % → ${top10.partN} % du solde) : quelle en est la cause, et des conditions particulières ont-elles été consenties ?`,
    });
  }
  for (const l of deplacements.slice(0, 5)) {
    candidats.push({
      code: `baux:${cote}:part:${l.aux}`, nature: 'changement',
      description: `${l.label} : sa part du solde ${qui}s passe de ${l.partN1} % à ${l.partN} % (${l.deltaPts > 0 ? '+' : ''}${l.deltaPts} pts).`,
      question: `La part de ${l.label} dans votre solde ${qui}s passe de ${l.partN1} % à ${l.partN} % : qu'est-ce qui explique ce déplacement (volumes, conditions de règlement, litige) ?`,
    });
  }
  for (const l of apparus.filter((x) => (x.partN ?? 0) >= seuilPts)) {
    candidats.push({
      code: `baux:${cote}:apparu:${l.aux}`, nature: 'changement',
      description: `${l.label} : ${qui} APPARU en N pour ${eurTexte(l.soldeN ?? 0)} (${l.partN} % du solde) — absent de la balance N-1.`,
      question: `${l.label} apparaît en N pour ${eurTexte(l.soldeN ?? 0)} : quelle est l'origine de la relation, et à quelles conditions (contrat, encours autorisé) ?`,
    });
  }
  for (const l of disparus.filter((x) => totalN1 > 0 && ((x.soldeN1 ?? 0) / totalN1) * 100 >= seuilPts)) {
    candidats.push({
      code: `baux:${cote}:disparu:${l.aux}`, nature: 'changement',
      description: `${l.label} : ${qui} DISPARU — ${eurTexte(l.soldeN1 ?? 0)} en N-1, plus aucun mouvement en N.`,
      question: `${l.label} portait ${eurTexte(l.soldeN1 ?? 0)} en N-1 et ne présente plus aucun mouvement : la relation est-elle rompue, et le solde a-t-il été apuré sans litige ?`,
    });
  }
  if (vieillissement && vieillissement.deltaPlus90Pts >= seuilPts) {
    const gros = lignes
      .filter((l) => l.tranchesN && l.tranchesN[4] > 0)
      .sort((a, b) => (b.tranchesN![4] - a.tranchesN![4]))
      .slice(0, 2)
      .map((l) => `${l.label} (${eurTexte(l.tranchesN![4])})`);
    candidats.push({
      code: `baux:${cote}:vieillissement`, nature: 'incertitude',
      description: `La part au-delà de 90 jours passe de ${vieillissement.partsN1[4]} % à ${vieillissement.partsN[4]} % du solde ${qui}s (+${vieillissement.deltaPlus90Pts} pts), portée par ${gros.join(' et ')}.`,
      question: `Votre balance ${qui}s vieillit : la part au-delà de 90 jours passe de ${vieillissement.partsN1[4]} % à ${vieillissement.partsN[4]} %. Quelles actions de recouvrement sont engagées sur ${gros.join(' et ')}, et une dépréciation est-elle envisagée ?`,
    });
  }

  const proposes = (await q<{ source_ref: string }>(
    `select source_ref from risk_factor_declared
     where engagement_id = $1 and source_ref like $2`,
    [engagementId, `baux:${cote}:%`],
  )).map((r) => r.source_ref);

  return { cote, fichiers, lignes, top10, apparus, disparus, deplacements, vieillissement, candidats, proposes };
}

/** Proposer UN candidat au registre — statut « proposé », un humain confirme. */
export async function proposerCandidat(
  engagementId: string, cote: Cote, code: string, seuilPts: number, userId: string,
): Promise<void> {
  const analyse = await analyseAux(engagementId, cote, seuilPts);
  const c = analyse.candidats.find((x) => x.code === code);
  if (!c) throw new Error(`balance auxiliaire : le candidat « ${code} » n'existe pas (l'analyse a peut-être changé avec le seuil)`);
  if (analyse.proposes.includes(code)) {
    throw new Error('balance auxiliaire : ce constat est déjà proposé au registre — il se confirme ou s\'écarte là-bas, il ne se propose pas deux fois');
  }
  await raiseFactor({
    engagementId,
    source: 'manual',
    sourceRef: code,
    nature: c.nature,
    description: c.description,
    targets: [{ fsli: cote === 'clients' ? 'TRADE_RECEIVABLES' : 'TRADE_PAYABLES', assertions: ['evaluation'] }],
    actorUserId: userId,
  });
}

/** Les questions au client — un BROUILLON de demande (L2), une question par candidat. */
export async function redigerQuestionsClient(engagementId: string, cote: Cote, seuilPts: number, userId: string): Promise<string> {
  await assertMembre(engagementId, userId, 'redigerQuestionsClient');
  const analyse = await analyseAux(engagementId, cote, seuilPts);
  if (!analyse.candidats.length) {
    throw new Error('balance auxiliaire : aucun constat à questionner — rien ne justifie une demande');
  }
  const ctx = await engagementCtx(engagementId);
  const seq = await nextSeq(engagementId);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1,$2,$3,'fr','draft') returning id`,
    [engagementId, seq, `Balance auxiliaire ${cote} — questions sur l'évolution N/N-1`],
  );
  for (const c of analyse.candidats) {
    await q(
      `insert into request_item (request_id, kind, description) values ($1,'explanation',$2)`,
      [request.id, c.question],
    );
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId,
    actorKind: 'user', actorId: userId,
    verb: 'aux_balance_questions_drafted', objectType: 'request', objectId: request.id,
    payload: { cote, questions: analyse.candidats.length },
  });
  return request.id;
}
