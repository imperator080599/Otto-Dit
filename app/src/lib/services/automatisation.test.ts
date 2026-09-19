// LE DEGRÉ D'AUTOMATISATION — mandat 2026-09-14, §2. AUTO-01 (dépasser le
// plafond, ou appeler l'IA sous L0), AUTO-02 (un ai_run sans son niveau), et
// l'épreuve du §2.4 : deux gardes indépendantes, aucune ne remplace l'autre.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { recordAiRun } from '@/lib/core/airuns';
import {
  plafondDuPack, capperNiveau, depasseLePlafond, niveauEffectif, definirNiveauMission, assertNiveauOuvert,
} from './automatisation';
import { assertBudgetActifEnBase, _reinitialiserGardeBudgetEnBasePourSonde } from './extraction/budget';
import { nepFr } from '@/lib/packs/nep-fr';

describe('le degré d’automatisation (mandat 2026-09-14, §2)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  afterEach(async () => {
    await q(`update engagement set automation_level = null where id in ($1, $2)`, [IDS.engNep, IDS.engSox]);
    await _reinitialiserGardeBudgetEnBasePourSonde();
  });

  it('plafondDuPack : absent ⇒ L2 (le défaut déjà sûr), jamais un refus', () => {
    expect(plafondDuPack({})).toBe('L2');
    expect(plafondDuPack({ automationLevel: 'L1' })).toBe('L1');
    expect(plafondDuPack({ automationLevel: 'L0' })).toBe('L0');
  });

  it('capperNiveau : une mission dans les bornes du plafond passe telle quelle, au-delà elle est plafonnée', () => {
    expect(capperNiveau('L1', 'L2')).toBe('L1');
    expect(capperNiveau('L2', 'L2')).toBe('L2');
    expect(capperNiveau('L0', 'L1')).toBe('L0');
    /* CAS CONNU MAUVAIS (règle 17) : une mission qui dépasserait son plafond
       (possible seulement par une écriture directe qui contournerait
       definirNiveauMission) ne se lit jamais telle quelle. */
    expect(capperNiveau('L2', 'L0')).toBe('L0');
    expect(capperNiveau('L2', 'L1')).toBe('L1');
  });

  it('depasseLePlafond : prend le pack déjà résolu — éprouvée contre un plafond RÉEL sous L2 (règle 17)', () => {
    /* CAS CONNU MAUVAIS : à l'écriture de cette lecture (2026-09-14), ni
       nep-fr ni pcaob-sox ne posaient de plafond sous L2 — une version qui
       résolvait le pack par le registre réel (comme la toute première forme
       de cette lecture) ne pouvait donc JAMAIS être éprouvée contre un
       dépassement authentique, seulement contre le cas trivial « L2 contre
       L2 » (revue hostile du 2026-09-14, voix 1 ET 2, même constat). Un pack
       FICTIF, ici, pose le plafond bas — INCHANGÉ depuis : pcaob-sox pose
       désormais L1 en réalité (tranche AUTO-01, 2026-09-19, pour rendre le
       refus observable par un clic), mais ce test continue d'éprouver la
       fonction PURE, isolée de ce que le registre pose ou non aujourd'hui. */
    expect(depasseLePlafond('L2', { automationLevel: 'L1' })).toBe(true);
    expect(depasseLePlafond('L1', { automationLevel: 'L1' })).toBe(false);
    expect(depasseLePlafond('L0', { automationLevel: 'L1' })).toBe(false);
    expect(depasseLePlafond('L2', {})).toBe(false);   // absent ⇒ L2, jamais dépassé par L2 lui-même
  });

  it('definirNiveauMission : AUTO-01 refuse RÉELLEMENT contre un plafond de pack abaissé (pas seulement en théorie)', async () => {
    /* Mutation TEMPORAIRE d'un pack RÉEL (nep-fr), restaurée en finally —
       même discipline que les sondes de scripts/audit/ (règle 24 : rien de
       durable ne doit survivre au test). C'est la preuve, par exécution, que
       la branche « mission > plafond du pack » de definirNiveauMission
       refuse VRAIMENT quand un cabinet abaisse son plafond — jusqu'ici
       correcte seulement à la lecture du code (revue hostile du 2026-09-14,
       voix 2, finding MOYEN). */
    const original = nepFr.automationLevel;
    nepFr.automationLevel = 'L1';
    try {
      await expect(definirNiveauMission(IDS.engNep, 'L2', IDS.users.karim)).rejects.toThrow(/AUTO-01/);
      expect(await niveauEffectif(IDS.engNep)).toBe('L1');   // rien écrit, le refus a bien eu lieu AVANT l'update
      await expect(definirNiveauMission(IDS.engNep, 'L1', IDS.users.karim)).resolves.toBeUndefined();
      expect(await niveauEffectif(IDS.engNep)).toBe('L1');
    } finally {
      nepFr.automationLevel = original;
    }
  });

  it('niveauEffectif : sans réglage de mission, c’est le plafond du pack (nep-fr, non posé ⇒ L2)', async () => {
    expect(await niveauEffectif(IDS.engNep)).toBe('L2');
  });

  it('niveauEffectif : le réglage de mission, une fois posé, prime', async () => {
    await q(`update engagement set automation_level = 'L1' where id = $1`, [IDS.engNep]);
    expect(await niveauEffectif(IDS.engNep)).toBe('L1');
  });

  it('definirNiveauMission : AUTO-01 refuse de dépasser le plafond du pack (nep-fr ⇒ L2)', async () => {
    /* Le pack nep-fr ne pose pas de plafond explicite (⇒ L2) : aucun niveau
       du type NiveauAutomatisation ne le dépasse (L3 n'existe même pas dans
       le type) — cette épreuve porte donc sur les BORNES valides elles-mêmes,
       toutes acceptées jusqu'au plafond. */
    await expect(definirNiveauMission(IDS.engNep, 'L2', IDS.users.karim)).resolves.toBeUndefined();
    expect(await niveauEffectif(IDS.engNep)).toBe('L2');
  });

  it('definirNiveauMission : une mission peut se rendre plus prudente que son cabinet (L0/L1), et le redire plus tard', async () => {
    await definirNiveauMission(IDS.engNep, 'L0', IDS.users.karim);
    expect(await niveauEffectif(IDS.engNep)).toBe('L0');
    await definirNiveauMission(IDS.engNep, 'L1', IDS.users.karim);
    expect(await niveauEffectif(IDS.engNep)).toBe('L1');
    /* §2.2 : « vers le bas UNIQUEMENT » ne veut pas dire monotone dans le
       temps — une mission reste libre de remonter jusqu'au plafond de son
       cabinet, jamais au-delà. */
    await definirNiveauMission(IDS.engNep, 'L2', IDS.users.karim);
    expect(await niveauEffectif(IDS.engNep)).toBe('L2');
  });

  it('definirNiveauMission : un dossier d’un AUTRE cabinet refuse — l’appartenance d’abord', async () => {
    const autre = await q<{ id: string }>(`insert into tenant (name) values ('Autre cabinet (fictif, sonde auto)') returning id::text`);
    await expect(definirNiveauMission(autre[0].id, 'L1', IDS.users.karim)).rejects.toThrow();
  });

  it('assertNiveauOuvert : L0 refuse (AUTO-01) — l’agent est éteint pour ce périmètre', async () => {
    await definirNiveauMission(IDS.engNep, 'L0', IDS.users.karim);
    await expect(assertNiveauOuvert(IDS.engNep)).rejects.toThrow(/AUTO-01/);
  });

  it('assertNiveauOuvert : L1/L2 laissent passer', async () => {
    await expect(assertNiveauOuvert(IDS.engNep)).resolves.toBe('L2');
    await definirNiveauMission(IDS.engNep, 'L1', IDS.users.karim);
    await expect(assertNiveauOuvert(IDS.engNep)).resolves.toBe('L1');
  });

  it('AUTO-02 : recordAiRun refuse d’enregistrer un élément sans son niveau — CAS CONNU MAUVAIS (règle 17)', async () => {
    /* Contourne le typage (une vraie régression ne pourrait PAS passer ce
       champ requis) pour éprouver le refus RUNTIME, pas seulement le
       compilateur — même discipline que la colonne NOT NULL sans défaut. */
    await expect(recordAiRun({
      tenantId: IDS.tenant, engagementId: IDS.engNep, purpose: 'ocr', adapter: 'mock',
      model: 'mock', promptId: 'sonde', promptVersion: 'v1', input: 'x', output: '[]',
      niveauAutomatisation: undefined as never,
    })).rejects.toThrow(/AUTO-02/);
  });

  it('AUTO-02 : un ai_run bien formé porte réellement son niveau, immuable', async () => {
    await definirNiveauMission(IDS.engNep, 'L1', IDS.users.karim);
    const id = await recordAiRun({
      tenantId: IDS.tenant, engagementId: IDS.engNep, purpose: 'ocr', adapter: 'mock',
      model: 'mock', promptId: 'sonde', promptVersion: 'v1', input: 'x', output: '[]',
      niveauAutomatisation: await niveauEffectif(IDS.engNep),
    });
    const row = await q<{ niveau_automatisation: string }>(`select niveau_automatisation from ai_run where id = $1`, [id]);
    expect(row[0].niveau_automatisation).toBe('L1');
    /* Baisser le niveau APRÈS coup ne réécrit jamais l'histoire (§2.3). */
    await definirNiveauMission(IDS.engNep, 'L0', IDS.users.karim);
    const encore = await q<{ niveau_automatisation: string }>(`select niveau_automatisation from ai_run where id = $1`, [id]);
    expect(encore[0].niveau_automatisation).toBe('L1');
  });

  /* §2.4, L'ÉPREUVE VERBATIM DU MANDAT : « niveau ouvert + budget fermé ⇒
     refus ; niveau fermé + budget ouvert ⇒ refus. » Chaque scénario prouve
     que l'AUTRE garde, prise seule, n'aurait PAS attrapé ce cas — les deux
     sont réellement indépendantes, ni l'une ne remplace l'autre. */
  describe('§2.4 : deux gardes indépendantes', () => {
    it('niveau OUVERT + budget FERMÉ ⇒ refus (par le budget, pas par le niveau)', async () => {
      await expect(assertNiveauOuvert(IDS.engNep)).resolves.toBe('L2');
      await expect(assertBudgetActifEnBase()).rejects.toThrow(/IA-BUDGET-01/);
    });

    it('niveau FERMÉ + budget OUVERT ⇒ refus (par le niveau, pas par le budget)', async () => {
      await definirNiveauMission(IDS.engNep, 'L0', IDS.users.karim);
      await q(
        `insert into app_state (key, value) values ('ia_vivante_budget', $1)`,
        [JSON.stringify({ actif: true, plafondUsd: 5, activePar: IDS.users.claire, activeLe: new Date().toISOString() })],
      );
      await expect(assertNiveauOuvert(IDS.engNep)).rejects.toThrow(/AUTO-01/);
      await expect(assertBudgetActifEnBase()).resolves.toEqual(
        expect.objectContaining({ actif: true, plafondUsd: 5 }),
      );
    });
  });
});
