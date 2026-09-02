// MES TRAVAUX : ce qui attend QUELQU'UN, dérivé — jamais tenu à la main.
//
// Ce qui se vérifie ici, c'est le tri du produit : une note adressée à un
// autre n'est pas mon travail, une note close non plus, un dossier dont je ne
// suis pas membre ne me regarde pas, et le visa attendu est le PREMIER de
// l'ordre qui manque — pas n'importe lequel. Puis le tableau de bord (1.2) :
// les obstacles de MES dossiers par famille, les notes ouvertes par
// ancienneté, et un dossier scellé qui n'est plus parcouru.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { mesTravaux, obstaclesDeMesDossiers, notesOuvertesParAnciennete, tableauDeBord } from './travaux';
import { obstaclesAuVisa } from './obstacles';

const KARIM = IDS.users.karim;
const LEA = IDS.users.lea;
const HUGO = IDS.users.hugo;   // membre du cabinet, d'AUCUN dossier

async function papier(code: string, statut: string): Promise<string> {
  const r = await q1<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
     values ($1, 'nep-fr', $2, $3, $4, '[]'::jsonb) returning id::text`,
    [IDS.engNep, code, `Papier ${code}`, statut]);
  return r.id;
}

describe('mes travaux — la liste se DÉRIVE', () => {
  beforeAll(async () => {
    await initTestDb();

    const wp = await papier('W-NOTE', 'in_review');
    // trois notes : pour Karim (ouverte), pour Karim (close), pour Léa
    await q(
      `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, status, text, note_type)
       values ($1,$2,$3,$4,'open','Reprendre la conclusion.','a_corriger'),
              ($1,$2,$3,$4,'closed','Note déjà close.','question'),
              ($1,$2,$4,$3,'open','Pour Léa.','a_documenter')`,
      [IDS.engNep, wp, LEA, KARIM]);
    // et trois notes ouvertes plus anciennes, pour l'ancienneté : 15 j, 45 j, 8 j
    await q(
      `insert into review_note (engagement_id, workpaper_id, author_id, assignee_id, status, text, note_type, created_at)
       values ($1,$2,$3,$4,'open','Quinze jours.','question', now() - interval '15 days'),
              ($1,$2,$3,$4,'open','Quarante-cinq jours.','question', now() - interval '45 days'),
              ($1,$2,$3,$4,'open','Huit jours.','question', now() - interval '8 days')`,
      [IDS.engNep, wp, LEA, KARIM]);

    // un papier au premier visa manquant, un autre où le préparateur a signé
    const w1 = await papier('W-VISA-1', 'draft');
    const w2 = await papier('W-VISA-2', 'in_review');
    await q(`insert into signoff (workpaper_id, user_id, sign_role) values ($1,$2,'preparer_validator')`, [w2, KARIM]);
    // un papier SIGNÉ n'attend plus rien
    const w3 = await papier('W-SIGNE', 'signed');
    await q(`insert into signoff (workpaper_id, user_id, sign_role) values ($1,$2,'preparer_validator')`, [w3, KARIM]);

    // deux demandes : une échue, une à échoir
    await q(
      `insert into request (engagement_id, seq_no, title, status, due_date)
       values ($1, 901, 'Contrats de vente', 'sent', current_date - 5),
              ($1, 902, 'Relevés bancaires', 'sent', current_date + 30)`,
      [IDS.engNep]);
  });

  it('une note adressée à un AUTRE, ou close, n’est pas mon travail — et le détail est une CLÉ', async () => {
    const t = await mesTravaux(KARIM);
    const notes = t.filter((l) => l.nature === 'note');
    expect(notes.map((n) => n.detail.cle).sort()).toEqual([
      'trav.detail.note', 'trav.detail.note', 'trav.detail.note', 'trav.detail.noteBloquante']);
    const bloquante = notes.find((n) => n.detail.cle === 'trav.detail.noteBloquante')!;
    expect(bloquante.titre).toContain('Reprendre la conclusion');
    expect(bloquante.detail.vars).toEqual({ auteur: 'Léa Moreau' });
  });

  it('un dossier dont je ne suis pas membre ne me regarde pas', async () => {
    expect(await mesTravaux(HUGO)).toEqual([]);
  });

  it('le visa attendu est le PREMIER de l’ordre qui manque, et un papier signé sort', async () => {
    const visas = (await mesTravaux(KARIM)).filter((l) => l.nature === 'visa');
    const role = (v: (typeof visas)[number]) => (v.detail.vars?.role as { cle: string }).cle;
    const par = Object.fromEntries(visas.map((v) => [v.titre.split(' — ')[0], role(v)]));
    expect(par['W-VISA-1']).toBe('visa.role.preparer_validator');
    expect(par['W-VISA-2']).toBe('visa.role.reviewer');
    expect(par['W-SIGNE']).toBeUndefined();
    for (const v of visas) expect(v.detail.cle).toBe('trav.detail.visa');
  });

  it('seule la demande ÉCHUE remonte, et elle mène à la demande elle-même', async () => {
    const d = (await mesTravaux(KARIM)).filter((l) => l.nature === 'demande');
    expect(d).toHaveLength(1);
    expect(d[0].titre).toContain('R-901');
    expect(d[0].detail.cle).toBe('trav.detail.demandeSansReponse');
    expect(d[0].href).toMatch(/^\/eng\/[^/]+\/requests\/[^/]+$/);
  });

  it('ce qui est en retard passe devant — l’ordre d’une liste de travail est une décision', async () => {
    const t = await mesTravaux(KARIM);
    expect(t[0].retard).toBe(true);
    const dernier = t[t.length - 1];
    expect(dernier.retard).toBe(false);
  });

  it('chaque ligne mène à l’objet en UN clic (le critère se compte depuis ici)', async () => {
    for (const l of await mesTravaux(KARIM)) {
      expect(l.href.startsWith(`/eng/${l.engagementId}/`)).toBe(true);
    }
  });

  /* ── LE TABLEAU DE BORD (1.2) ─────────────────────────────────────────── */

  it('les obstacles de MES dossiers, par famille, chacun avec l’écran qui le lève', async () => {
    const d = await obstaclesDeMesDossiers(KARIM);
    const nep = d.find((x) => x.engagementId === IDS.engNep)!;
    expect(nep).toBeDefined();
    /* UNE SEULE VÉRITÉ : ce que le tableau de bord compte est, famille par
       famille, ce que l'écran des obstacles du dossier liste — ni plus, ni
       moins, dans le même ordre. */
    const liste = await obstaclesAuVisa(IDS.engNep);
    const attendu: Record<string, number> = {};
    for (const o of liste) attendu[o.famille] = (attendu[o.famille] ?? 0) + 1;
    expect(nep.familles.map((f) => [f.famille, f.n])).toEqual(Object.entries(attendu));
    expect(liste.length).toBeGreaterThan(0);
    for (const f of nep.familles) {
      expect(f.href).toBe(`/eng/${IDS.engNep}/${liste.find((o) => o.famille === f.famille)!.ou}`);
    }
    expect(await obstaclesDeMesDossiers(HUGO)).toEqual([]);
  });

  it('les notes ouvertes par ancienneté — jours calendaires, « ouverte » au sens de la vue d’ensemble', async () => {
    const n = await notesOuvertesParAnciennete(KARIM);
    const nep = n.find((x) => x.engagementId === IDS.engNep)!;
    /* Ouvertes : Karim (aujourd'hui), Léa (aujourd'hui), 8 j, 15 j, 45 j. La
       note close ne compte pas. */
    expect(nep.parAnciennete).toEqual({ j7: 2, j30: 2, plus: 1 });
    expect(nep.total).toBe(5);
    expect(nep.href).toBe(`/eng/${IDS.engNep}/notes`);
    expect(await notesOuvertesParAnciennete(HUGO)).toEqual([]);
  });

  it('le tableau de bord rassemble les quatre vues en un appel', async () => {
    const tb = await tableauDeBord(KARIM);
    expect(tb.lignes.length).toBeGreaterThan(0);
    expect(Object.keys(tb.sections).sort()).toEqual(['attribuees', 'detenues', 'recentes', 'suivies']);
    expect(tb.obstacles.length).toBeGreaterThan(0);
    expect(tb.notes.length).toBe(1);
  });

  it('les sections « ouvertes récemment » sont dans l’ordre des visites, la dernière en tête', async () => {
    const { assurerSections, visiter } = await import('./sections');
    await assurerSections(IDS.engNep);
    const secs = await q<{ id: string; ref: string }>(
      `select id::text, ref from section_state where engagement_id = $1 and kind = 'papier' order by ref`, [IDS.engNep]);
    expect(secs.length).toBeGreaterThanOrEqual(3);
    /* Trois visites, un jour d'écart, dans l'ordre A, B, C : la plus récente
       est C. Le tri en JS sur `String(Date)` rangeait par NOM de jour
       (revue hostile n°5). */
    const [a, b, c] = secs;
    for (const [s, jours] of [[a, 3], [b, 2], [c, 1]] as const) {
      await q(`insert into section_visit (section_id, user_id, visited_at) values ($1, $2, now() - ($3 || ' days')::interval)`,
        [s.id, KARIM, String(jours)]);
    }
    await visiter(IDS.engNep, 'papier', a.ref, KARIM);   // et A revisitée à l'instant : elle repasse en tête
    const tb = await tableauDeBord(KARIM);
    const ordre = tb.sections.recentes.map((s) => s.id).filter((id) => [a.id, b.id, c.id].includes(id));
    expect(ordre).toEqual([a.id, c.id, b.id]);
  });

  it('une appartenance à un dossier d’un AUTRE cabinet n’affiche rien — l’appartenance ne suffit pas', async () => {
    const autre = await q1<{ id: string }>(`insert into tenant (name) values ('Autre cabinet (fictif)') returning id::text`);
    const ent = await q1<{ id: string }>(
      `insert into entity (tenant_id, name, country, registry_type, registry_no, currency)
       values ($1, 'Étrangère SA (fictive)', 'FR', 'fictional', null, 'EUR') returning id::text`, [autre.id]);
    const per = await q1<{ id: string }>(
      `insert into period (entity_id, label, start_date, end_date) values ($1, 'FY2026', '2026-01-01', '2026-12-31') returning id::text`, [ent.id]);
    const eng = await q1<{ id: string }>(
      `insert into engagement (tenant_id, entity_id, period_id, kind, name, framework_set, status)
       values ($1, $2, $3, 'statutory_audit', 'Dossier étranger (fictif)', '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}'::jsonb, 'setup')
       returning id::text`, [autre.id, ent.id, per.id]);
    await q(`insert into engagement_member (engagement_id, user_id, eng_role, can_sign, entered_on) values ($1, $2, 'partner', false, current_date)`,
      [eng.id, KARIM]);
    await q(`insert into review_note (engagement_id, author_id, assignee_id, status, text, note_type) values ($1, $2, $2, 'open', 'Note étrangère.', 'question')`,
      [eng.id, KARIM]);
    const tb = await tableauDeBord(KARIM);
    expect(tb.obstacles.some((x) => x.engagementId === eng.id)).toBe(false);
    expect(tb.notes.some((x) => x.engagementId === eng.id)).toBe(false);
    expect(tb.lignes.some((l) => l.engagementId === eng.id)).toBe(false);
  });

  it('un dossier SCELLÉ sort de TOUT le tableau de bord — obstacles, notes, sections', async () => {
    await q(`update engagement set status = 'locked' where id = $1`, [IDS.engNep]);
    const tb = await tableauDeBord(KARIM);
    expect(tb.obstacles.some((x) => x.engagementId === IDS.engNep)).toBe(false);
    expect(tb.notes.some((x) => x.engagementId === IDS.engNep)).toBe(false);
    expect(tb.sections.recentes.some((s) => s.engagementId === IDS.engNep)).toBe(false);
    await q(`update engagement set status = 'setup' where id = $1`, [IDS.engNep]);
  });
});
