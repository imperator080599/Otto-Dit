import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import {
  assurerSections, mesSections, sectionsDuDossier, avancement,
  envoyerA, attribuerA, suivre, visiter, ECHELLE,
} from './sections';

// « CURRENTLY WITH ME » ET « ASSIGNED TO ME » NE SONT PAS LE MÊME CHAMP.
//
// C'est la remarque de la revue n°2 qui commande tout le modèle, et c'est
// exactement ce qu'un test doit prouver : si les deux notions vivaient dans un
// seul champ, les deux listes montreraient la même chose et personne ne le
// verrait — elles seraient toutes les deux « justes ».

describe('les sections du dossier', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    const { draftRevenueWorkpaper } = await import('./workpapers/draft');
    await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await assurerSections(IDS.engNep);
  }, 180000);

  it('se dérivent du dossier : un poste retenu, un papier écrit', async () => {
    const s = await sectionsDuDossier(IDS.engNep);
    expect(s.some((x) => x.kind === 'poste')).toBe(true);
    expect(s.some((x) => x.kind === 'papier')).toBe(true);
    /* Rejouer ne duplique pas : la dérivation est idempotente. */
    const avant = s.length;
    await assurerSections(IDS.engNep);
    expect((await sectionsDuDossier(IDS.engNep)).length).toBe(avant);
  });

  it('ENVOYER déplace le détenteur et ne touche PAS au responsable', async () => {
    const poste = (await sectionsDuDossier(IDS.engNep)).find((x) => x.kind === 'poste')!;
    await attribuerA(poste.id, IDS.users.karim, IDS.users.claire);
    await envoyerA(poste.id, IDS.users.claire, IDS.users.karim);

    const apres = (await sectionsDuDossier(IDS.engNep)).find((x) => x.id === poste.id)!;
    expect(apres.ownerId).toBe(IDS.users.karim);   // répond de
    expect(apres.holderId).toBe(IDS.users.claire); // la détient

    /* LA PREUVE QUI COMPTE : les deux listes ne montrent PAS la même chose. */
    const chezClaire = await mesSections(IDS.users.claire);
    const chezKarim = await mesSections(IDS.users.karim);
    expect(chezClaire.detenues.map((x) => x.id)).toContain(poste.id);
    expect(chezClaire.attribuees.map((x) => x.id)).not.toContain(poste.id);
    expect(chezKarim.attribuees.map((x) => x.id)).toContain(poste.id);
    expect(chezKarim.detenues.map((x) => x.id)).not.toContain(poste.id);
  });

  it('refuse d’envoyer une section à quelqu’un qui n’est pas sur la mission', async () => {
    const poste = (await sectionsDuDossier(IDS.engNep)).find((x) => x.kind === 'poste')!;
    const etranger = await q01<{ id: string }>(
      `select u.id::text from app_user u
       where not exists (select 1 from engagement_member m
                         where m.engagement_id = $1 and m.user_id = u.id) limit 1`,
      [IDS.engNep]);
    if (!etranger) return; // le monde de base n'en a pas toujours un
    await expect(envoyerA(poste.id, etranger.id, IDS.users.karim)).rejects.toThrow(/pas sur la mission/);
  });

  it('SUIVRE est un abonnement volontaire, et se retire', async () => {
    const papier = (await sectionsDuDossier(IDS.engNep)).find((x) => x.kind === 'papier')!;
    expect((await mesSections(IDS.users.lea)).suivies).toHaveLength(0);
    await suivre(papier.id, IDS.users.lea, true);
    expect((await mesSections(IDS.users.lea)).suivies.map((x) => x.id)).toEqual([papier.id]);
    await suivre(papier.id, IDS.users.lea, false);
    expect((await mesSections(IDS.users.lea)).suivies).toHaveLength(0);
  });

  it('RÉCENT est un journal de consultation, et n’entre pas dans la piste d’audit', async () => {
    const papier = (await sectionsDuDossier(IDS.engNep)).find((x) => x.kind === 'papier')!;
    const evAvant = Number((await q01<{ n: string }>(
      `select count(*) n from event_log where engagement_id = $1`, [IDS.engNep]))!.n);
    await visiter(IDS.engNep, 'papier', papier.ref, IDS.users.lea);
    expect((await mesSections(IDS.users.lea)).recentes.map((x) => x.id)).toContain(papier.id);
    const evApres = Number((await q01<{ n: string }>(
      `select count(*) n from event_log where engagement_id = $1`, [IDS.engNep]))!.n);
    expect(evApres, 'lire n’est pas un changement d’état').toBe(evAvant);
  });

  it('le statut se DÉRIVE du dossier, et l’échelle n’utilise pas le rouge', async () => {
    const papier = (await sectionsDuDossier(IDS.engNep)).find((x) => x.kind === 'papier')!;
    expect(papier.statut).toBe('in_preparation'); // brouillon
    const { signWorkpaper } = await import('./workpapers/lifecycle');
    await signWorkpaper(papier.ref, IDS.users.karim, 'preparer_validator');
    const apres = (await sectionsDuDossier(IDS.engNep)).find((x) => x.id === papier.id)!;
    expect(apres.statut).toBe('completed');
    /* Aucun statut n'a été écrit : c'est le VISA qui a bougé. */
    const cols = await q<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'section_state' and column_name = 'status'`);
    expect(cols, 'aucune colonne de statut : il se dérive').toEqual([]);
    for (const v of Object.values(ECHELLE)) expect(v.classe).not.toBe('red');
  });

  it('l’avancement compte TOUTES les sections, une seule fois chacune', async () => {
    const total = (await avancement(IDS.engNep)).reduce((s, x) => s + x.n, 0);
    expect(total).toBe((await sectionsDuDossier(IDS.engNep)).length);
  });
});
