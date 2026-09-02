import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { getDb, q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { GARDES, eprouver, eprouverSql, type Contexte, type GardeSql } from './registre';

// LE REGISTRE DES GARDES, ÉPROUVÉ (1.7) — et L'ÉPREUVE ELLE-MÊME ÉPROUVÉE
// (règle 17) : avant de croire un registre qui dit « prouvée » sur chaque
// ligne, on lui donne trois gardes connues MAUVAISES et on vérifie qu'il les
// dénonce — une attaque qui n'atteint pas la garde, une attaque refusée par
// autre chose, une garde qui n'existe pas.

let ctx: Contexte;

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
  it('toute table qui porte engagement_id a sa garde de verrou — ou figure ici, nommée', async () => {
    const sans = await q<{ t: string }>(
      `select c.table_name t from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'engagement_id'
         and not exists (select 1 from pg_trigger g join pg_class r on r.oid = g.tgrelid
                         where r.relname = c.table_name and g.tgname = c.table_name || '_lock_guard')
       order by 1`);
    /* LA LISTE EST DITE, PAS VIDE : ces tables n'ont pas de garde de verrou
       (0003 n'en posait que sur dix-neuf tables, et chaque migration depuis en
       a créé d'autres). Une table NOUVELLE qui apparaît ici fait échouer le
       test : elle est gardée, ou inscrite avec sa raison. Le tri de celles-ci
       — lesquelles sont écrites après le scellé par la clôture elle-même — est
       au registre reporté. */
    expect(sans.map((x) => x.t)).toEqual(SANS_GARDE_DE_VERROU);
  });

  /* Chaque garde SQL et de service, une par une : le verdict est lu, pas
     supposé. Une garde déclarée ne passe pas par ici — elle n'a pas d'attaque. */
  for (const g of GARDES.filter((x) => x.nature !== 'declaree')) {
    it(`${g.code} — ${g.enonce}`, async () => {
      const db = await getDb();
      const v = await eprouver(db, g, ctx);
      expect(v.prouvee, `${g.code} : ${v.raison}`).toBe(true);
    });
  }

  /* Et une passe neutralisée n'a rien laissé derrière elle : la transaction
     annulée annule aussi la neutralisation. */
  it('après l’épreuve, chaque objet neutralisé par une garde SQL est de nouveau en place', async () => {
    for (const g of GARDES) {
      if (g.nature !== 'sql') continue;
      const m = g.neutraliser.match(/\b(?:drop constraint|disable trigger)\s+([a-z_]+)/);
      expect(m, g.code).not.toBeNull();
      const nom = m![1];
      const present = g.neutraliser.includes('disable trigger')
        ? await q1<{ n: string }>(`select count(*)::text n from pg_trigger where tgname = $1 and tgenabled = 'O'`, [nom])
        : await q1<{ n: string }>(`select count(*)::text n from pg_constraint where conname = $1`, [nom]);
      expect(present.n, `${g.code} : ${nom}`).toBe('1');
    }
  });
});
