import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { repoRoot } from '@/lib/db/client';
import { railDuDossier, postesRetenus, GROUPES_CLES } from './rail';
import { traduire, type Locale } from '@/lib/i18n/catalogue';

/* Le rail SERT une langue, il ne la choisit pas : le test lui en donne une. */
const tr = (l: Locale) => (c: Parameters<typeof traduire>[1], v?: Record<string, string | number>) =>
  traduire(l, c, v);
const en = tr('en');
const fr = tr('fr');
import { destinationsDuPoste } from './poste';

// LE RAIL MONTRE L'ÉTAT, PAS LE CATALOGUE (ADR-103) — et depuis ADR-112 il
// suit le DOSSIER : groupé, vertical, les POSTES au premier rang. Cela se
// prouve aux deux bouts : un dossier qui vient d'être créé montre cinq
// destinations, chacune des autres porte sa raison en une ligne ; le dossier
// déroulé ouvre ses postes.
//
// ET IL SE PROUVE UNE TROISIÈME FOIS, par le garde de COUVERTURE : sortir un
// écran du rail est le geste qui rend un écran injoignable en silence — le
// défaut exact de la règle 13. Le test lit donc l'arborescence des routes et
// exige que chacune soit atteignable depuis le rail, depuis un poste, ou
// déclarée ici avec sa raison.

describe('le rail du dossier (ADR-103, ADR-112)', () => {
  const NEUF = 'cccc3333-0000-4000-8000-000000000001';

  beforeAll(async () => {
    await initTestDb();
    /* Un dossier NEUF, même entité, même exercice — rien n'y a été fait. */
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
       values ($1, $2, $3, $4, 'statutory_audit', 'Dossier neuf (test rail)',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork', $5)`,
      [NEUF, IDS.tenant, IDS.entity, IDS.periodFY2025, IDS.methodology],
    );
  }, 120000);

  it('un dossier qui vient d\'être créé montre CINQ destinations, le reste grisé avec sa raison', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr'], en);
    const ouvertes = rail.filter((x) => x.atteignable).map((x) => x.label);
    /* Les libellés viennent du CATALOGUE : les comparer à des chaînes écrites
       ici referait deux vérités pour un même mot (revue n°2 §2). SIX, depuis
       que le monde de base porte la mission NEP FY2024 : la reprise N-1 d'un
       dossier neuf sur Altiverre FY2025 est atteignable — même entité, même
       nature, exercice chaîné. */
    expect(new Set(ouvertes)).toEqual(new Set([
      en('rail.vue'), en('rail.acceptation'), en('rail.equipe'), en('rail.reunions'),
      en('rail.journal'), en('rail.reprise'),
    ]));
    expect(rail.find((x) => x.label === en('rail.reprise'))!.atteignable).toBe(true);
    for (const x of rail.filter((r) => !r.atteignable)) {
      expect(x.raison, `raison manquante pour ${x.label}`).toBeTruthy();
      expect(x.raison!.length).toBeLessThan(90); // une ligne, pas un paragraphe
    }
    expect(rail.find((x) => x.label === en('rail.imports'))!.atteignable).toBe(false);
    expect(rail.find((x) => x.label === en('rail.imports'))!.raison).toBe(en('rail.raison.apresAcceptation'));
  });

  /* LA REPRISE EST ATTEIGNABLE QUAND UNE MISSION N-1 DE MÊME NATURE EXISTE —
     et grisée sinon. Le cas mauvais : le drapeau calculé par `missionN1` et
     jamais réinjecté dans l'état — le rail n'offrait plus AUCUN lien de reprise,
     et ce test-ci passait quand même parce qu'il ne regardait que le dossier
     neuf (revue hostile n°6 + parcours cliqué). */
  it('la reprise N-1 s’ouvre pour la mission qui a un N-1 de même nature, reste grisée pour la première', async () => {
    const { creerClient, creerExercice, creerMission } = await import('./engagement');
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Rail N-1 SA (fictif)', actorUserId: IDS.users.claire });
    const p1 = await creerExercice({ tenantId: IDS.tenant, entityId: c.id, endDate: '2026-12-31', actorUserId: IDS.users.claire });
    const p2 = await creerExercice({ tenantId: IDS.tenant, entityId: c.id, endDate: '2027-12-31', actorUserId: IDS.users.claire });
    const base = { tenantId: IDS.tenant, entityId: c.id, kind: 'statutory_audit' as const, name: '', packs: ['nep-fr'],
      accountingMap: 'pcg', language: 'fr' as const, actorUserId: IDS.users.claire };
    const m1 = await creerMission({ ...base, periodId: p1.id });
    const m2 = await creerMission({ ...base, periodId: p2.id });
    const r1 = await railDuDossier(m1.id, ['nep-fr'], en);
    const r2 = await railDuDossier(m2.id, ['nep-fr'], en);
    expect(r1.find((x) => x.label === en('rail.reprise'))!.atteignable).toBe(false);
    expect(r2.find((x) => x.label === en('rail.reprise'))!.atteignable).toBe(true);
  });

  it('chaque entrée porte un GROUPE connu et une phrase — aucune entrée muette', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr'], en);
    for (const x of rail) {
      expect(x.phrase.length, x.label).toBeGreaterThan(20);
      expect(GROUPES_CLES, `groupe inconnu pour ${x.label}`).toContain(x.groupeCle);
    }
  });

  it('la LANGUE vient du cabinet : le même rail se lit en anglais et en français', async () => {
    const a = await railDuDossier(NEUF, ['nep-fr'], en);
    const b = await railDuDossier(NEUF, ['nep-fr'], fr);
    expect(a.length).toBe(b.length);
    expect(a[0].label).toBe('Overview');
    expect(b[0].label).toBe('Vue d’ensemble');
    /* Les DESTINATIONS sont les mêmes : traduire ne change pas le dossier. */
    expect(a.map((x) => x.href)).toEqual(b.map((x) => x.href));
  });

  it('le VOCABULAIRE vient du pack, jamais du code (DA-15)', async () => {
    const rail = await railDuDossier(NEUF, ['nep-fr'], en);
    const labels = rail.map((x) => x.label);
    expect(labels).toContain('Matérialité');
    expect(labels).toContain('Scoping');
    expect(labels).toContain('Ce qui empêche de signer');
    /* L'ancien vocabulaire ne survit nulle part : deux mots pour un concept
       sur le même écran est exactement ce que DA-15 interdit. */
    expect(labels.some((l) => /seuil de signification/i.test(l))).toBe(false);
    expect(labels.some((l) => /Périmètre \(postes retenus\)/i.test(l))).toBe(false);
    expect(labels.some((l) => /Obstacles au visa/i.test(l))).toBe(false);
  });

  it('les POSTES retenus sont des destinations de premier rang', async () => {
    await runPart1UpToWorkpaper();
    const postes = await postesRetenus(IDS.engNep);
    expect(postes.length).toBeGreaterThan(0);
    const rail = await railDuDossier(IDS.engNep, ['nep-fr'], en);
    /* Les postes RETENUS sont atteignables dans les groupes bilan / compte de
       résultat ; les autres postes du pack y sont aussi, grisés avec leur
       raison (mandat de la soirée, §1). */
    const groupesEtats = rail.filter((x) => x.groupeCle === 'rail.groupe.bilan' || x.groupeCle === 'rail.groupe.resultat');
    const groupePostes = groupesEtats.filter((x) => x.atteignable);
    expect(groupePostes.length).toBe(postes.length);
    expect(groupesEtats.length).toBeGreaterThan(postes.length);
    for (const g of groupesEtats.filter((x) => !x.atteignable)) expect(g.raison, g.label).toBeTruthy();
    for (const p of postes) {
      const e = groupePostes.find((x) => x.label === p.name);
      expect(e, `poste ${p.code} absent du rail`).toBeTruthy();
      expect(e!.atteignable).toBe(true);
      expect(e!.href).toContain(`/poste/${encodeURIComponent(p.code)}`);
    }
    /* Le rail neuf, lui, annonce les postes AVANT qu'ils existent, avec la
       raison — jamais un groupe qui apparaît de nulle part. */
    const neuf = await railDuDossier(NEUF, ['nep-fr'], en);
    expect(neuf.find((x) => x.groupeCle === 'rail.groupe.bilan')!.raison).toBe(en('rail.raison.desQuUnPosteEstRetenu'));
  });

  it('le dossier déroulé ouvre presque tout ; la clôture attend l\'achèvement', async () => {
    const { draftRevenueWorkpaper } = await import('./workpapers/draft');
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const { signWorkpaper } = await import('./workpapers/lifecycle');
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    const rail = await railDuDossier(IDS.engNep, ['nep-fr'], en);
    expect(rail.filter((x) => !x.atteignable).map((x) => x.label)).toContain(en('rail.cloture'));
    expect(rail.find((x) => x.label === en('rail.pointage'))!.atteignable).toBe(true);
    const sox = await railDuDossier(IDS.engSox, ['pcaob-sox'], en);
    expect(sox.find((x) => x.label === en('rail.controleInterne'))!.atteignable).toBe(true);
    expect(sox.find((x) => x.label === en('rail.deviations'))).toBeTruthy();
  });

  /**
   * LE GARDE DE COUVERTURE.
   *
   * Réorganiser une navigation, c'est retirer des entrées. Une entrée retirée
   * dont l'écran n'est repris nulle part devient un objet qu'aucun chemin de
   * lecture n'atteint — et rien ne le signale : la page rend toujours 200
   * pour qui connaît son URL. On lit donc les routes sur le DISQUE et on
   * exige que chacune soit atteignable.
   */
  it('aucun écran de dossier n\'est injoignable : rail, poste, ou déclaré', async () => {
    /* Les écrans qu'on atteint autrement, et par où. Une exception sans
       destination écrite serait une excuse. */
    const AILLEURS: Record<string, string> = {
      '/eng/[id]/requests/[rid]': 'depuis la liste des demandes au client',
      '/eng/[id]/workpapers/[wid]': 'depuis la liste des papiers et depuis « Mes travaux »',
      '/eng/[id]/rcm/[cid]': 'depuis la matrice des contrôles',
      '/eng/[id]/poste/[code]': 'c\'est la destination du groupe « Les postes »',
    };
    const racine = path.join(repoRoot(), 'app', 'src', 'app', 'eng', '[id]');
    const routes: string[] = [];
    const marcher = (dir: string, prefixe: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) marcher(path.join(dir, e.name), `${prefixe}/${e.name}`);
        else if (e.name === 'page.tsx') routes.push(prefixe || '/eng/[id]');
      }
    };
    marcher(racine, '/eng/[id]');

    const rail = await railDuDossier(IDS.engNep, ['nep-fr'], en);
    const railSox = await railDuDossier(IDS.engSox, ['pcaob-sox'], en);
    const atteintes = new Set<string>();
    for (const e of [...rail, ...railSox]) {
      atteintes.add(e.href.replace(IDS.engNep, '[id]').replace(IDS.engSox, '[id]').split('?')[0]);
    }
    for (const d of destinationsDuPoste('[id]', 'X')) atteintes.add(d.split('?')[0]);

    const injoignables = routes.filter((r) => {
      const motif = r.replace(/\/poste\/\[code\]$/, '/poste/X');
      return !atteintes.has(motif) && !(r in AILLEURS);
    });
    expect(injoignables, `écran(s) qu'aucun chemin de lecture n'atteint : ${injoignables.join(', ')}`).toEqual([]);
  });
});
