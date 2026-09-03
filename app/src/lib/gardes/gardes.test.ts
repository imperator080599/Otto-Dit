import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { getDb, q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { GARDES, eprouver, eprouverSql, type Contexte, type GardeSql } from './registre';

// LE REGISTRE DES GARDES, ÉPROUVÉ (1.7) — et L'ÉPREUVE ELLE-MÊME ÉPROUVÉE
// (règle 17) : avant de croire un registre qui dit « prouvée » sur chaque
// ligne, on lui donne trois gardes connues MAUVAISES et on vérifie qu'il les
// dénonce — une attaque qui n'atteint pas la garde, une attaque refusée par
// autre chose, une garde qui n'existe pas.

let ctx: Contexte;
/* LES VERDICTS OBSERVÉS, écrits à la fin : docs/GARDES_RESULTATS.json est ce
   que `npm run gardes` lit pour dire PROUVÉE / NON PROUVÉE / SANS RÉSULTAT.
   Le compte « prouvé » se lit dans les résultats d'exécution, jamais dans le
   registre (mandat du jour, S1). */
const verdicts: Record<string, { prouvee: boolean; raison: string; quand: string }> = {};

/** Les tables à engagement_id SANS garde de verrou, figées — voir le test qui les compare. */
const SANS_GARDE_DE_VERROU: string[] = [
  'ai_run', 'aux_balance_file', 'carry_forward', 'coa_map_rule', 'completion_item',
  'confirmation_campaign', 'engagement_acceptance', 'engagement_member', 'engagement_milestone',
  'engine_run', 'estimation', 'evaluation_response', 'event_log', 'file_archive', 'fs_line',
  'fsli_assertion_risk', 'gl_entry_supersession', 'inbound_email', 'independence_declaration',
  'non_audit_service', 'process_change_decision', 'process_interview', 'process_model', 'rcm_row',
  'risk_factor_declared', 'risk_factor_observed', 'risk_question_answer', 'section_state',
  'server_error', 'verification_check', 'verification_run',
];

describe('registre des gardes', () => {
  beforeAll(async () => {
    await initTestDb();
    /* Le préparateur et le réviseur sont pris dans la mission, par leur rôle
       — pas par un identifiant qu'on croirait connaître. */
    const role = async (roles: string[]) => (await q1<{ id: string }>(
      `select user_id::text id from engagement_member where engagement_id = $1 and eng_role = any($2::text[]) order by user_id limit 1`,
      [IDS.engNep, roles])).id;
    ctx = {
      tenantId: IDS.tenant, engagementId: IDS.engNep,
      preparateur: await role(['senior', 'staff']), reviseur: await role(['manager']), associe: await role(['partner']),
    };
  }, 120000);

  it('l’épreuve dénonce une attaque qui n’atteint jamais la garde (les deux passes refusent)', async () => {
    const db = await getDb();
    const fausse: GardeSql = {
      nature: 'sql', code: 'X-1', enonce: 'x', point: 'x', rayon: 'x', stops_looking: 'x',
      /* Une faute de syntaxe : refusée avec ou sans neutralisation. */
      attaque: async (run) => { await run(`updte event_log set verb = verb`); },
      rejet: /syntax|syntaxe/i,
      neutraliser: 'alter table event_log disable trigger event_log_append_only',
    };
    const v = await eprouverSql(db, fausse, ctx);
    expect(v.prouvee).toBe(false);
    expect(v.raison).toMatch(/jamais atteint la garde/);
  });

  it('l’épreuve dénonce un refus qui vient d’AUTRE CHOSE que la garde', async () => {
    const db = await getDb();
    const fausse: GardeSql = {
      nature: 'sql', code: 'X-2', enonce: 'x', point: 'x', rayon: 'x', stops_looking: 'x',
      attaque: async (run) => { await run(`update event_log set verb = verb where id = (select id from event_log order by id limit 1)`); },
      rejet: /une garde qui n.existe pas/,
      neutraliser: 'alter table event_log disable trigger event_log_append_only',
    };
    const v = await eprouverSql(db, fausse, ctx);
    expect(v.prouvee).toBe(false);
    expect(v.raison).toMatch(/AUTRE raison/);
  });

  it('l’épreuve dénonce une garde qui n’existe pas (l’attaque réussit)', async () => {
    const db = await getDb();
    const fausse: GardeSql = {
      nature: 'sql', code: 'X-3', enonce: 'x', point: 'x', rayon: 'x', stops_looking: 'x',
      attaque: async (run, c) => { await run(`update engagement set name = name where id = $1`, [c.engagementId]); },
      rejet: /rien/,
      neutraliser: 'select 1',
    };
    const v = await eprouverSql(db, fausse, ctx);
    expect(v.prouvee).toBe(false);
    expect(v.raison).toMatch(/RÉUSSI/);
  });

  /* LE CRITÈRE DU PLAN, JOUÉ : « il retire le déclencheur localement et voit
     le registre dire que la garde n'est plus prouvée, en la nommant ». */
  it('une garde RETIRÉE est dénoncée par son nom (G-03 sans son déclencheur)', async () => {
    const db = await getDb();
    const g03 = GARDES.find((g) => g.code === 'G-03')!;
    await db.exec('alter table review_note disable trigger review_note_close_guard');
    try {
      const v = await eprouver(db, g03, ctx);
      expect(v.prouvee).toBe(false);
      expect(v.raison).toMatch(/RÉUSSI sans neutralisation/);
    } finally {
      await db.exec('alter table review_note enable trigger review_note_close_guard');
    }
  });

  it('chaque garde a sa phrase « où elle cesse de regarder », et un code unique', () => {
    const codes = GARDES.map((g) => g.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const g of GARDES) expect(g.stops_looking.length, g.code).toBeGreaterThan(20);
  });

  /* UNE GARDE, UN OBJET. La classe que la double passe ne peut pas voir : un
     refus accepté de DEUX gardes et une neutralisation qui en retire DEUX —
     l'attaque est refusée par la seconde, la première est inerte, et l'épreuve
     dit « prouvée » (G-06, contrainte inerte depuis 0009 — revue hostile n°6).
     Le registre l'interdit structurellement, et le cas connu mauvais est joué. */
  it('une garde SQL attend UN refus et neutralise UN objet — jamais deux', () => {
    for (const g of GARDES) {
      if (g.nature !== 'sql') continue;
      expect(g.rejet.source, `${g.code} : deux refus acceptés`).not.toMatch(/\|/);
      const objets = (g.neutraliser.match(/\b(drop constraint|disable trigger)\b/g) ?? []).length;
      expect(objets, `${g.code} : ${objets} objet(s) neutralisé(s)`).toBe(1);
    }
  });

  it('le cas connu mauvais de cette classe est dénoncé : refus double, neutralisation double', () => {
    const fausse: GardeSql = {
      nature: 'sql', code: 'X-4', enonce: 'x', point: 'x', rayon: 'x', stops_looking: 'x',
      attaque: async () => undefined,
      rejet: /constraint_a|constraint_b/,
      neutraliser: 'alter table exception drop constraint a, drop constraint b',
    };
    expect(fausse.rejet.source).toMatch(/\|/);
    expect((fausse.neutraliser.match(/\b(drop constraint|disable trigger)\b/g) ?? []).length).toBe(2);
  });

  /* TOUTE TABLE À engagement_id PORTE UNE GARDE DE VERROU (0003, étendu par
     0037) : un dossier scellé acceptait des écritures IPE parce que la table
     nouvelle n'en avait pas (revue hostile n°6). Le compte est dit, pas
     supposé — la liste des tables sans garde doit être VIDE. */
  /* « 0 TABLE SANS VERDICT » (mandat du jour, S5) : toute table à engagement_id
     porte une garde de verrou OU une ligne du registre des verdicts (0042),
     avec sa raison écrite — proposée par l'agent, confirmée par un humain. Une
     table nouvelle sans verdict fait échouer le test : on ne l'inscrit pas dans
     un tableau figé, on écrit son verdict. Et un verdict « garde » sans garde
     attachée est un mensonge : vérifié dans l'autre sens aussi. */
  it('toute table qui porte engagement_id a une garde de verrou ou un verdict écrit — 0 table sans verdict', async () => {
    const sans = await q<{ t: string }>(
      `select c.table_name t from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'engagement_id'
         and not exists (select 1 from pg_trigger g join pg_class r on r.oid = g.tgrelid
                         where r.relname = c.table_name and g.tgname = c.table_name || '_lock_guard')
         and not exists (select 1 from engagement_lock_verdict v where v.table_name = c.table_name)
       order by 1`);
    expect(sans.map((x) => x.t), 'tables sans garde ni verdict').toEqual([]);
    const menteurs = await q<{ t: string }>(
      `select v.table_name t from engagement_lock_verdict v
       where v.verdict = 'garde'
         and not exists (select 1 from pg_trigger g join pg_class r on r.oid = g.tgrelid
                         where r.relname = v.table_name and g.tgname = v.table_name || '_lock_guard')`);
    expect(menteurs.map((x) => x.t), 'verdict « garde » sans garde attachée').toEqual([]);
    /* LES OBJETS D'ÉCRAN PAR PERSONNE (revue hostile n°8, constat 9). Le test
       ne regardait que les tables porteuses de dossier : `ui_repli` (0132)
       portait un verdict que PERSONNE ne vérifiait. Une table qui porte un
       LOCATAIRE et une PERSONNE sans dossier est de cette famille — rangement
       d'écran, préférence, journal de consultation — et le scellé la concerne
       (elle doit dire « lecture », ou porter une garde). Ce qui reste hors de
       ce filet est nommé au backlog (N2-5), pas oublié en silence. */
    const parPersonne = await q<{ t: string }>(
      `select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and exists (select 1 from information_schema.columns i
                     where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'user_id')
         and exists (select 1 from information_schema.columns i
                     where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'tenant_id')
         and not exists (select 1 from information_schema.columns i
                         where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'engagement_id')
         and not exists (select 1 from engagement_lock_verdict v where v.table_name = c.relname)
       order by 1`);
    expect(parPersonne.map((x) => x.t), 'objets d’écran par personne sans verdict de verrou écrit').toEqual([]);
    /* ET LE CAS CONNU MAUVAIS, DANS LA MÊME SESSION (règle 17). Posé hors de
       la session, il était emporté par `initTestDb` : le détecteur passait au
       vert sur une table qu'il n'avait jamais vue — l'instrument mesurait à
       côté, et c'est la règle 17 qui l'a montré, pas la relecture. */
    await q(`create table ui_essai_mauvais (tenant_id uuid not null, user_id uuid not null, x text)`);
    const vu = await q<{ t: string }>(
      `select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'ui_essai_mauvais'
         and exists (select 1 from information_schema.columns i
                     where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'user_id')
         and exists (select 1 from information_schema.columns i
                     where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'tenant_id')
         and not exists (select 1 from engagement_lock_verdict v where v.table_name = c.relname)`);
    expect(vu.map((x) => x.t), 'le détecteur ne voit pas une table par personne SANS verdict').toEqual(['ui_essai_mauvais']);
    await q(`drop table ui_essai_mauvais`);
    /* Une proposition non confirmée reste une PROPOSITION : elle n'attache
       rien (pas de garde), et le registre le dit. On ne suppose pas qu'il en
       reste toujours — le jour où un humain aura tout confirmé, ce test n'a
       pas à rougir (revue hostile du jour). */
    const proposes = await q<{ t: string }>(
      `select v.table_name t from engagement_lock_verdict v
       where v.verdict = 'garde_proposee' and v.confirmed_by is null
         and exists (select 1 from pg_trigger g join pg_class r on r.oid = g.tgrelid
                     where r.relname = v.table_name and g.tgname = v.table_name || '_lock_guard')`);
    expect(proposes.map((x) => x.t), 'proposition non confirmée qui porte déjà une garde').toEqual([]);
  });

  /* Chaque garde SQL et de service, une par une : le verdict est lu, pas
     supposé. Une garde déclarée ne passe pas par ici — elle n'a pas d'attaque. */
  for (const g of GARDES.filter((x) => x.nature !== 'declaree')) {
    it(`${g.code} — ${g.enonce}`, async () => {
      const db = await getDb();
      const v = await eprouver(db, g, ctx);
      verdicts[g.code] = { prouvee: v.prouvee, raison: v.raison, quand: new Date().toISOString() };
      expect(v.prouvee, `${g.code} : ${v.raison}`).toBe(true);
    });
  }

  afterAll(() => {
    /* L'horodatage ne bouge que si le VERDICT bouge : un fichier suivi par
       git qui change à chaque exécution est un arbre toujours sale, et un
       changement qu'on ne lit plus (revue hostile du jour). */
    const cible = path.join(repoRoot(), 'docs', 'GARDES_RESULTATS.json');
    let anciens: Record<string, { prouvee: boolean; raison: string; quand: string }> = {};
    try { anciens = JSON.parse(fs.readFileSync(cible, 'utf8')); } catch { /* premier passage */ }
    const fusion: typeof verdicts = {};
    for (const [code, v] of Object.entries(verdicts)) {
      const a = anciens[code];
      fusion[code] = a && a.prouvee === v.prouvee && a.raison === v.raison ? a : v;
    }
    fs.writeFileSync(cible, `${JSON.stringify(fusion, null, 2)}\n`);
  });

  /* Et une passe neutralisée n'a rien laissé derrière elle : la transaction
     annulée annule aussi la neutralisation. */
  it('après l’épreuve, chaque objet neutralisé par une garde SQL est de nouveau en place', async () => {
    for (const g of GARDES) {
      if (g.nature !== 'sql') continue;
      const m = g.neutraliser.match(/\b(?:drop constraint|disable trigger)\s+([a-z0-9_]+)/);
      expect(m, g.code).not.toBeNull();
      const nom = m![1];
      const present = g.neutraliser.includes('disable trigger')
        ? await q1<{ n: string }>(`select count(*)::text n from pg_trigger where tgname = $1 and tgenabled = 'O'`, [nom])
        : await q1<{ n: string }>(`select count(*)::text n from pg_constraint where conname = $1`, [nom]);
      expect(present.n, `${g.code} : ${nom}`).toBe('1');
    }
  });
});
