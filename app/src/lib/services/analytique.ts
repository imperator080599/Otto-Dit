import { q, q01, q1 } from '@/lib/db/client';
import { sha256 } from '@/lib/core/hash';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { missionN1 } from './engagement';
import { engagementRules, frameworkSet, fsliAccounts } from './fsli';
import { mapAccount } from '@/lib/kernel/fsli-map';
import { numToCents } from '@/lib/util/num';
import { fmtEur } from '@/lib/kernel/canon';
import { getAccountingMap } from '@/lib/packs';
import { traduire, type Locale } from '@/lib/i18n/catalogue';
import { assertMembre } from '@/lib/core/membre';

// LA LEADSHEET N / N-1 ET LA REVUE ANALYTIQUE DU POSTE (mandat de la soirée, §2.2).
//
// D'OÙ VIENT N-1, ET C'EST DIT À L'ÉCRAN. Dans l'ordre : (1) le dossier de
// l'exercice précédent — LA règle de N-1 (`missionN1` : même entité, même
// cabinet, même nature, exercices chaînés), s'il porte une balance ; (2) sinon
// la balance COMPARATIVE importée sur ce dossier (period_kind = 'prior') ;
// (3) sinon rien, et la colonne le dit. Les comptes N-1 sont rattachés au poste
// par la table de correspondance de CE dossier : comparer sous deux
// correspondances différentes comparerait deux périmètres.
//
// CE QUE CE SERVICE NE FAIT PAS, ET QUI EST DIT : il ne vérifie PAS que le
// lecteur est membre du dossier N-1. La politique de lignes est par LOCATAIRE
// (0004) et le contrôle d'accès (requireMember) ne regarde que le dossier
// courant : tout membre de N lit les soldes N-1 du même cabinet. Une politique
// par dossier est le chantier §10 (withTenant, puis le rôle) ; le jour où elle
// existe, ce service tombera de lui-même sur la balance comparative, et
// l'origine affichée restera vraie.
//
// LA REVUE ANALYTIQUE EST UN OBJET VERSIONNÉ (0130). Chaque enregistrement est
// une version nouvelle, empreintée des soldes du moment ; la lecture compare
// l'empreinte aux soldes ACTUELS et marque « périmée » quand ils ont bougé —
// elle n'efface rien (règle du recalcul, §0.3). La proposition du moteur est
// DÉTERMINISTE (P4) : une phrase construite depuis les chiffres, en langue du
// dossier, tracée par un engine_run ; elle ne compte qu'enregistrée par une
// personne (plafond L2).

export type SourceN1 = 'dossier_n1' | 'balance_n1' | 'aucune';

export interface OrigineN1 {
  source: SourceN1;
  mission: { id: string; name: string; period_label: string } | null;
}

export interface Compte { number: string; label: string; balanceCents: number }

export interface LigneSoldes {
  number: string;
  label: string;
  balanceCents: number;
  balanceN1Cents: number | null;
  variationCents: number | null;
  /** En pour cent, une décimale ; null quand N-1 est nul ou absent. */
  variationPct: number | null;
  presence: 'les_deux' | 'n_seul' | 'n1_seul';
}

export interface Leadsheet {
  origine: OrigineN1;
  lignes: LigneSoldes[];
  totalCents: number;
  totalN1Cents: number | null;
  variationCents: number | null;
  variationPct: number | null;
  /** L'empreinte des soldes — ce que la revue analytique fige à la rédaction. */
  empreinte: string;
}

export function pourcentage(n: number, n1: number | null): number | null {
  if (n1 === null || n1 === 0) return null;
  return Math.round(((n - n1) / Math.abs(n1)) * 1000) / 10;
}

/** La leadsheet, assemblée depuis les comptes N et N-1 — pure, testable sans base. */
export function assemblerLeadsheet(courants: Compte[], n1: Compte[], origine: OrigineN1): Leadsheet {
  const parNumero = new Map<string, LigneSoldes>();
  for (const a of courants) {
    parNumero.set(a.number, {
      number: a.number, label: a.label, balanceCents: a.balanceCents,
      balanceN1Cents: origine.source === 'aucune' ? null : 0, variationCents: null, variationPct: null, presence: 'n_seul',
    });
  }
  for (const a of n1) {
    const l = parNumero.get(a.number);
    if (l) { l.balanceN1Cents = a.balanceCents; l.presence = 'les_deux'; }
    else {
      parNumero.set(a.number, {
        number: a.number, label: a.label, balanceCents: 0, balanceN1Cents: a.balanceCents,
        variationCents: null, variationPct: null, presence: 'n1_seul',
      });
    }
  }
  const lignes = [...parNumero.values()].sort((x, y) => x.number.localeCompare(y.number));
  for (const l of lignes) {
    if (l.balanceN1Cents !== null) {
      l.variationCents = l.balanceCents - l.balanceN1Cents;
      l.variationPct = pourcentage(l.balanceCents, l.balanceN1Cents);
    }
  }
  const totalCents = lignes.reduce((s, l) => s + l.balanceCents, 0);
  const totalN1Cents = origine.source === 'aucune' ? null : lignes.reduce((s, l) => s + (l.balanceN1Cents ?? 0), 0);
  const empreinte = sha256(lignes.map((l) => `${l.number}:${l.balanceCents}:${l.balanceN1Cents ?? ''}`).join('\n'));
  return {
    origine, lignes, totalCents, totalN1Cents,
    variationCents: totalN1Cents === null ? null : totalCents - totalN1Cents,
    variationPct: pourcentage(totalCents, totalN1Cents),
    empreinte,
  };
}

async function comptesDeLaBalance(engagementId: string, periodKind: 'current' | 'prior'): Promise<Compte[]> {
  const rows = await q<{ number: string; label: string; balance: string }>(
    `select a.number, a.label, a.balance::text from account a
     join tb_snapshot s on s.id = a.tb_snapshot_id
     where s.engagement_id = $1 and s.period_kind = $2 and s.status = 'active'
     order by a.number`,
    [engagementId, periodKind]);
  return rows.map((a) => ({ number: a.number, label: a.label, balanceCents: numToCents(a.balance) }));
}

/** Les soldes N-1 de tout le dossier, avec leur ORIGINE. */
export async function soldesN1(engagementId: string): Promise<{ origine: OrigineN1; comptes: Compte[] }> {
  const mission = await missionN1(engagementId);
  if (mission) {
    const comptes = await comptesDeLaBalance(mission.id, 'current');
    if (comptes.length) return { origine: { source: 'dossier_n1', mission }, comptes };
  }
  const comparative = await comptesDeLaBalance(engagementId, 'prior');
  if (comparative.length) return { origine: { source: 'balance_n1', mission }, comptes: comparative };
  return { origine: { source: 'aucune', mission }, comptes: [] };
}

/** La leadsheet d'UN poste : N, N-1, variation, empreinte. */
export async function leadsheetDuPoste(engagementId: string, code: string): Promise<Leadsheet> {
  const rules = await engagementRules(engagementId);
  const courants = await fsliAccounts(engagementId, code);
  const n1 = await soldesN1(engagementId);
  return assemblerLeadsheet(courants, n1.comptes.filter((a) => mapAccount(a.number, rules) === code), n1.origine);
}

export type OrigineRevue = 'humaine' | 'proposee_validee';

export interface RevueAnalytique {
  id: string;
  version: number;
  texte: string;
  origine: OrigineRevue;
  auteur: string;
  quand: string;
  engineRunId: string | null;
  /** Les soldes ont changé depuis la rédaction : à relire, rien n'est effacé. */
  perimee: boolean;
  /** Les versions antérieures, conservées. */
  anterieures: number;
}

/** La dernière version de la revue analytique du poste, jugée contre l'empreinte ACTUELLE. */
export async function lireAnalytique(engagementId: string, code: string, empreinteCourante?: string): Promise<RevueAnalytique | null> {
  const r = await q01<{ id: string; version: number; text: string; origine: OrigineRevue; auteur: string; quand: string; engine_run_id: string | null; soldes_hash: string; anterieures: string }>(
    `select a.id::text, a.version, a.text, a.origine, u.name auteur, a.created_at::text quand,
            a.engine_run_id::text, a.soldes_hash,
            (select count(*) from fsli_analytique b where b.engagement_id = a.engagement_id and b.fsli_code = a.fsli_code and b.version < a.version)::text anterieures
     from fsli_analytique a join app_user u on u.id = a.author_id
     where a.engagement_id = $1 and a.fsli_code = $2
     order by a.version desc limit 1`,
    [engagementId, code]);
  if (!r) return null;
  const empreinte = empreinteCourante ?? (await leadsheetDuPoste(engagementId, code)).empreinte;
  return {
    id: r.id, version: Number(r.version), texte: r.text, origine: r.origine, auteur: r.auteur, quand: r.quand,
    engineRunId: r.engine_run_id, perimee: r.soldes_hash !== empreinte, anterieures: Number(r.anterieures),
  };
}

/** Toutes les versions, la plus récente en tête — l'histoire de la rédaction. */
export async function versionsAnalytique(engagementId: string, code: string) {
  return q<{ version: number; text: string; origine: OrigineRevue; auteur: string; quand: string }>(
    `select a.version, a.text, a.origine, u.name auteur, a.created_at::text quand
     from fsli_analytique a join app_user u on u.id = a.author_id
     where a.engagement_id = $1 and a.fsli_code = $2 order by a.version desc`,
    [engagementId, code]);
}

/**
 * ENREGISTRER une version : le texte d'une personne, ou la proposition qu'elle
 * a validée (avec le run qui l'a produite). Refus nommés ; la base tient les
 * mêmes (ANA-01, ANA-02) pour une écriture qui contournerait le service.
 */
export async function enregistrerAnalytique(
  engagementId: string, code: string, userId: string, texte: string,
  opts: { origine: OrigineRevue; engineRunId?: string | null },
): Promise<{ id: string; version: number }> {
  await assertMembre(engagementId, userId, 'rédiger une revue analytique');
  if (!texte.trim()) throw new Error('ANA-01 : une revue analytique vide n’est pas une revue analytique — rien n’est enregistré');
  if (opts.origine === 'proposee_validee' && !opts.engineRunId) {
    throw new Error('ANA-02 : une rédaction proposée puis validée cite le run qui l’a produite — sans lui, enregistrez-la comme rédaction humaine');
  }
  const poste = await q01<{ code: string }>(`select code from fsli where engagement_id = $1 and code = $2`, [engagementId, code]);
  if (!poste) throw new Error(`poste « ${code} » inconnu sur ce dossier : la revue analytique se rédige sur un poste de la balance`);
  /* LE RUN CITÉ EST CELUI D'UNE PROPOSITION DE CE POSTE, SUR CE DOSSIER. Il
     arrive par le formulaire (donc par l'URL) : sans cette vérification, un
     run de sondage d'un autre dossier ferait lire « proposée par OTTO » sur un
     texte inventé (revue hostile de la soirée). La base ne tient que
     l'existence du run (G-18) ; le service tient sa nature. */
  if (opts.origine === 'proposee_validee') {
    const run = await q01<{ id: string }>(
      `select id::text from engine_run
       where id = $1 and engagement_id = $2 and engine = 'revue_analytique' and params->>'code' = $3`,
      [opts.engineRunId, engagementId, code]);
    if (!run) {
      throw new Error('ANA-02 : le run cité n’est pas une proposition de revue analytique de ce poste sur ce dossier — la proposition a été annulée (sonde) ou ne le concerne pas ; enregistrez la rédaction comme rédaction humaine, ou proposez-la de nouveau');
    }
  }
  const ls = await leadsheetDuPoste(engagementId, code);
  const ctx = await engagementCtx(engagementId);
  const r = await q1<{ id: string; version: number }>(
    `insert into fsli_analytique (engagement_id, fsli_code, version, text, origine, engine_run_id, soldes_hash, author_id)
     values ($1, $2, (select coalesce(max(version), 0) + 1 from fsli_analytique where engagement_id = $1 and fsli_code = $2),
             $3, $4, $5, $6, $7)
     returning id::text, version`,
    [engagementId, code, texte.trim(), opts.origine, opts.engineRunId ?? null, ls.empreinte, userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'analytique.redigee', objectType: 'fsli_analytique', objectId: r.id,
    payload: { code, version: Number(r.version), origine: opts.origine, empreinte: ls.empreinte, engineRunId: opts.engineRunId ?? null },
  });
  return { id: r.id, version: Number(r.version) };
}

/**
 * PROPOSER une rédaction d'après les chiffres — déterministe, en langue du
 * dossier, tracée par un engine_run. Elle n'est PAS enregistrée : elle revient
 * à l'écran, et compte quand une personne l'enregistre (plafond L2).
 */
export async function proposerAnalytique(engagementId: string, code: string): Promise<{ texte: string; engineRunId: string }> {
  const fsli = await q01<{ name: string }>(`select name from fsli where engagement_id = $1 and code = $2`, [engagementId, code]);
  if (!fsli) throw new Error(`poste « ${code} » inconnu sur ce dossier`);
  const fs = await frameworkSet(engagementId);
  const locale: Locale = fs.language === 'fr' ? 'fr' : 'en';
  const ls = await leadsheetDuPoste(engagementId, code);
  const eur = (c: number) => fmtEur(c, locale);
  const signe = (c: number) => (c > 0 ? '+' : c < 0 ? '−' : '') + eur(Math.abs(c));
  let texte: string;
  if (ls.totalN1Cents === null) {
    texte = traduire(locale, 'ana.proposition.sansN1', { poste: fsli.name, n: eur(ls.totalCents) });
  } else {
    texte = traduire(locale, 'ana.proposition', {
      poste: fsli.name, n: eur(ls.totalCents), n1: eur(ls.totalN1Cents),
      variation: signe(ls.variationCents ?? 0),
      pct: ls.variationPct === null ? '—' : `${ls.variationPct > 0 ? '+' : ''}${ls.variationPct.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')}`,
    });
    const mouvements = ls.lignes
      .filter((l) => (l.variationCents ?? 0) !== 0)
      .sort((a, b) => Math.abs(b.variationCents!) - Math.abs(a.variationCents!))
      .slice(0, 3)
      .map((l) => traduire(locale, 'ana.proposition.mouvement', { compte: l.number, libelle: l.label, variation: signe(l.variationCents!) }));
    if (mouvements.length) texte += traduire(locale, 'ana.proposition.mouvements', { mouvements: mouvements.join(' ; ') });
  }
  texte += traduire(locale, 'ana.proposition.aVerifier');
  const ctx = await engagementCtx(engagementId);
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1, $2, 'revue_analytique', 'v1', $3, $4, $5, now()) returning id::text`,
    [ctx.tenant_id, engagementId, fs.assurance_packs[0], ls.empreinte,
      JSON.stringify({ code, lignes: ls.lignes.length, langue: locale, origineN1: ls.origine.source })]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'analytique.proposee', objectType: 'engine_run', objectId: run.id,
    payload: { code, empreinte: ls.empreinte },
  });
  return { texte, engineRunId: run.id };
}

export interface PosteAnalytique {
  code: string;
  name: string;
  statement: string;
  retenu: boolean;
  /** Le poste existe sur la balance du dossier (une ligne fsli). */
  present: boolean;
  totalCents: number;
  totalN1Cents: number | null;
  variationCents: number | null;
  variationPct: number | null;
  revue: { version: number; texte: string; auteur: string; quand: string; origine: OrigineRevue; perimee: boolean } | null;
}

/** LA REVUE ANALYTIQUE DU DOSSIER : chaque poste du pack, N contre N-1, et le texte rédigé — le même objet que sur la page du poste. */
export async function revueAnalytiqueGlobale(engagementId: string): Promise<{ origine: OrigineN1; postes: PosteAnalytique[] }> {
  const fs = await frameworkSet(engagementId);
  const carte = getAccountingMap(fs.accounting_map);
  const rules = await engagementRules(engagementId);
  const courants = await comptesDeLaBalance(engagementId, 'current');
  const n1 = await soldesN1(engagementId);
  const lignes = await q<{ code: string; name: string; scoping: string }>(
    `select code, name, scoping from fsli where engagement_id = $1`, [engagementId]);
  const parCode = new Map(lignes.map((l) => [l.code, l]));
  const revues = await q<{ fsli_code: string; version: number; text: string; origine: OrigineRevue; auteur: string; quand: string; soldes_hash: string }>(
    `select distinct on (a.fsli_code) a.fsli_code, a.version, a.text, a.origine, u.name auteur, a.created_at::text quand, a.soldes_hash
     from fsli_analytique a join app_user u on u.id = a.author_id
     where a.engagement_id = $1 order by a.fsli_code, a.version desc`,
    [engagementId]);
  const revueParCode = new Map(revues.map((r) => [r.fsli_code, r]));
  const langue = fs.language === 'fr' ? 'fr' : 'en';
  const postes: PosteAnalytique[] = [];
  for (const def of carte.fslis) {
    const ls = assemblerLeadsheet(
      courants.filter((a) => mapAccount(a.number, rules) === def.code),
      n1.comptes.filter((a) => mapAccount(a.number, rules) === def.code),
      n1.origine,
    );
    const ligne = parCode.get(def.code);
    const r = revueParCode.get(def.code);
    postes.push({
      code: def.code, name: ligne?.name ?? def.name[langue] ?? def.name.en, statement: def.statement,
      retenu: Boolean(ligne && (ligne.scoping === 'in_scope' || ligne.scoping === 'in_scope_qualitative')),
      present: Boolean(ligne),
      totalCents: ls.totalCents, totalN1Cents: ls.totalN1Cents, variationCents: ls.variationCents, variationPct: ls.variationPct,
      revue: r ? { version: Number(r.version), texte: r.text, auteur: r.auteur, quand: r.quand, origine: r.origine, perimee: r.soldes_hash !== ls.empreinte } : null,
    });
  }
  return { origine: n1.origine, postes };
}
