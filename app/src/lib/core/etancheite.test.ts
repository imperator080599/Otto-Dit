import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '@/lib/services/workpapers/draft';
import { addReviewNote, repondreNote, transitionNote } from '@/lib/services/workpapers/lifecycle';
import { assurerSections, sectionsDuDossier, attribuerA, envoyerA } from '@/lib/services/sections';
import { calculerGrille, cellulesDuDossier, disposerCellule, conclureLigne } from '@/lib/services/testing/grille';
import { enregistrerAnalytique } from '@/lib/services/analytique';
import { planifierProcedure, redigerPapierDeProcedure } from '@/lib/services/programme';
import { confirmScoping } from '@/lib/services/fsli';
import { assessFsli } from '@/lib/services/risk';

/**
 * L'ÉTANCHÉITÉ ENTRE CABINETS, ÉPROUVÉE PAR UN INTRUS (mandat du jour n°3, §1.1).
 *
 * CE QUI TENAIT L'ISOLATION HIER : `requireMember` sur les ÉCRANS, et rien
 * d'autre. Les services prenaient un `userId` sans jamais vérifier qu'il
 * appartient à l'équipe du dossier : une action serveur atteinte autrement que
 * par son écran — un identifiant deviné, un formulaire rejoué — écrivait dans
 * le dossier d'un autre cabinet. La politique RLS, elle, est INERTE en
 * production (le rôle qui sert l'application porte BYPASSRLS) : la base ne
 * rattrape rien.
 *
 * Ce fichier est le cas connu MAUVAIS de l'étanchéité (règle 17) : une
 * personne d'un AUTRE cabinet, membre d'aucun dossier ici, tente le geste
 * complet — lire, attribuer, envoyer, poser une note, répondre, clore,
 * disposer une cellule, conclure une ligne, rédiger une revue analytique,
 * planifier une procédure, rédiger un papier, statuer un périmètre, évaluer un
 * risque. CHAQUE tentative doit être REFUSÉE, et le refus doit se lire.
 *
 * CE QUE CE FICHIER NE PROUVE PAS, et le dit : il éprouve la règle en
 * APPLICATION. Tant que l'étape 3 de PLAN_RLS n'est pas exécutée, la base ne
 * l'impose pas — un accès direct à Postgres avec la chaîne de l'application
 * verrait tout. C'est écrit dans docs/PLAN_RLS.md et dans le rapport.
 */
describe('l’étanchéité entre cabinets', () => {
  let intrus = '';
  let sectionId = '';
  let noteId = '';
  let celluleId = '';
  let ligneId = '';
  let procedureId = '';
  let papierId = '';
  let fsliId = '';

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    papierId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    /* UN AUTRE CABINET, avec sa propre personne : ni le locataire ni la
       personne n'ont rien à voir avec le dossier de démonstration. */
    const cabinet = await q1<{ id: string }>(
      `insert into tenant (name) values ('Cabinet Étranger (fictif)') returning id::text`);
    const u = await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role)
       values ($1, 'Nadia Ferrand', 'nadia.ferrand@etranger.test', 'partner') returning id::text`,
      [cabinet.id]);
    intrus = u.id;

    await assurerSections(IDS.engNep);
    sectionId = (await sectionsDuDossier(IDS.engNep))[0].id;
    noteId = await addReviewNote(IDS.engNep, papierId, IDS.users.lea, IDS.users.karim,
      'Note posée par la revue, pour éprouver l’étanchéité.', { noteType: 'a_corriger' });
    await calculerGrille(IDS.engNep, IDS.users.karim);
    const { cellules } = await cellulesDuDossier(IDS.engNep);
    const [item, cells] = Object.entries(cellules)[0];
    ligneId = item;
    celluleId = (cells.find((c) => c.etat !== 'conforme') ?? cells[0]).id;
    procedureId = (await q1<{ id: string }>(
      `select id::text from procedure_instance where engagement_id = $1 and fsli_code = 'REVENUE' limit 1`,
      [IDS.engNep])).id;
    fsliId = (await q1<{ id: string }>(
      `select id::text from fsli where engagement_id = $1 and code = 'REVENUE'`, [IDS.engNep])).id;
  }, 600000);

  /**
   * CHAQUE GESTE, SA TENTATIVE — ET S'IL EST VRAIMENT UN CAS CONNU MAUVAIS.
   *
   * LE CHIFFRE A ÉTÉ CORRIGÉ PAR LA REVUE HOSTILE n°9 (constat 5). Le premier
   * jet de ce fichier a mesuré « onze sur treize acceptés » ; en neutralisant
   * les gardes, la mesure donne **dix**. Trois gestes échouaient DÉJÀ, pour une
   * raison qui n'est pas l'étanchéité — un état du dossier, ou une garde
   * antérieure. Ils sont refusés, tant mieux, mais ils ne PROUVENT pas la
   * garde neuve : un refus produit par un autre objet n'est pas une preuve de
   * celui-ci (règle 16). Ils portent donc `casMauvais: false` et leur raison,
   * et le compte des vrais cas mauvais est ASSERTÉ plus bas.
   */
  const gestes = (): { nom: string; casMauvais: boolean; pourquoi?: string; tenter: () => Promise<unknown> }[] => [
    { nom: 'attribuer une section', casMauvais: true, tenter: () => attribuerA(sectionId, intrus, intrus) },
    { nom: 'envoyer une section', casMauvais: true, tenter: () => envoyerA(sectionId, IDS.users.karim, intrus) },
    {
      nom: 'poser une note de revue',
      casMauvais: true,
      tenter: () => addReviewNote(IDS.engNep, papierId, intrus, IDS.users.karim, 'Note d’un cabinet étranger.', { noteType: 'question' }),
    },
    { nom: 'répondre à une note', casMauvais: true, tenter: () => repondreNote(noteId, intrus, 'Réponse d’un cabinet étranger.') },
    {
      /* Le libellé mentait sur le geste : `transitionNote(…, 'addressed')` est
         « TRAITER une note », pas la clore (revue hostile n°9, constat 5). */
      nom: 'traiter une note',
      casMauvais: false,
      pourquoi: 'la note est OUVERTE : sans la garde d’étanchéité, ce geste échouerait quand même — « only open notes can be addressed » n’est pas un refus d’isolation',
      tenter: () => transitionNote(noteId, intrus, 'addressed'),
    },
    { nom: 'disposer une cellule', casMauvais: true, tenter: () => disposerCellule(IDS.engNep, celluleId, intrus, 'Disposition d’un cabinet étranger.') },
    {
      nom: 'conclure une ligne',
      casMauvais: false,
      pourquoi: 'la ligne porte des cellules non disposées : sans la garde, TEST-04 la refuserait déjà — un refus d’ÉTAT, pas d’isolation',
      tenter: () => conclureLigne(IDS.engNep, ligneId, intrus),
    },
    {
      nom: 'rédiger une revue analytique',
      casMauvais: true,
      tenter: () => enregistrerAnalytique(IDS.engNep, 'REVENUE', intrus, 'Revue rédigée par un cabinet étranger.', { origine: 'humaine' }),
    },
    { nom: 'planifier une procédure', casMauvais: true, tenter: () => planifierProcedure({ engagementId: IDS.engNep, fsliCode: 'REVENUE', code: 'RA', userId: intrus }) },
    {
      nom: 'rédiger le papier d’une procédure',
      casMauvais: false,
      pourquoi: 'PROG-05 (garde antérieure) le refusait déjà — mais PROG-05 ne consulte QUE `engagement_member`, jamais `tenant_id` : il distinguait « procédure inconnue » de « pas membre », ce qui apprenait à un intrus que la procédure existe. ETANCH-01 passe désormais AVANT (revue hostile n°9, constat 6)',
      tenter: () => redigerPapierDeProcedure({ procedureId, userId: intrus, motif: 'reprise' }),
    },
    { nom: 'statuer un périmètre', casMauvais: true, tenter: () => confirmScoping(fsliId, intrus, 'ns_confirmed', 'Sorti du périmètre par un cabinet étranger.') },
    { nom: 'évaluer le risque d’un poste', casMauvais: true, tenter: () => assessFsli(IDS.engNep, 'REVENUE', intrus) },
    { nom: 'calculer la grille de test', casMauvais: true, tenter: () => calculerGrille(IDS.engNep, intrus) },
  ];

  it('AUCUN geste d’un cabinet étranger n’entre dans le dossier — chaque refus est nommé', async () => {
    const passes: string[] = [];
    const refus: string[] = [];
    for (const g of gestes()) {
      try {
        await g.tenter();
        passes.push(g.nom);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        refus.push(`${g.nom} → ${m.slice(0, 60)}`);
      }
    }
    expect(passes, `gestes ACCEPTÉS depuis un autre cabinet :\n${passes.join('\n')}`).toEqual([]);
    /* Et le refus doit se LIRE : un message vide, ou une erreur de base
       (violation de contrainte) au lieu d'un refus nommé, laisserait
       l'utilisateur — et l'inspecteur — sans explication.
       TOUS, y compris les trois qui ne sont pas des cas mauvais : depuis la
       correction du constat 6, l'étanchéité passe AVANT PROG-05 et avant les
       refus d'état, donc c'est bien elle qu'on lit. */
    for (const r of refus) {
      expect(r, `refus sans code d’étanchéité : ${r}`).toMatch(/ETANCH-0[123]/);
    }
  }, 600000);

  it('LE COMPTE, sans arrondi : dix gestes sur treize sont de vrais cas connus MAUVAIS', () => {
    /* CE QUE CE CHIFFRE VEUT DIRE (revue hostile n°9, constat 5). Dix des
       treize gestes AURAIENT RÉUSSI depuis un autre cabinet si la garde
       n'existait pas — ce sont eux qui la prouvent. Les trois autres
       échouaient déjà, pour un état du dossier ou pour une garde antérieure :
       ils sont dans la liste parce qu'un geste offert doit être tenté, mais
       ils ne prouvent RIEN de la garde neuve. Le premier jet de ce fichier a
       publié « onze sur treize » ; c'était faux, et c'est écrit ici. */
    const tous = gestes();
    const vrais = tous.filter((g) => g.casMauvais);
    expect(tous.length).toBe(13);
    expect(vrais.length, 'le compte des vrais cas mauvais a changé sans que la raison soit écrite').toBe(10);
    for (const g of tous.filter((x) => !x.casMauvais)) {
      expect(g.pourquoi?.length ?? 0, `${g.nom} : marqué « pas un cas mauvais » sans raison écrite`).toBeGreaterThan(60);
    }
  });

  it('rien n’a été écrit par l’intrus : ni ligne, ni événement', async () => {
    const ecrits = await q<{ t: string; n: string }>(
      `select 'review_note' t, count(*)::text n from review_note where author_id = $1
       union all select 'review_note_reply', count(*)::text from review_note_reply where author_id = $1
       union all select 'cell_disposition', count(*)::text from cell_disposition where decided_by = $1
       union all select 'test_line_conclusion', count(*)::text from test_line_conclusion where concluded_by = $1
       union all select 'fsli_analytique', count(*)::text from fsli_analytique where author_id = $1
       union all select 'event_log', count(*)::text from event_log where actor_id = $1`, [intrus]);
    const nonVides = ecrits.filter((x) => Number(x.n) > 0);
    expect(nonVides.map((x) => `${x.t}=${x.n}`), 'traces laissées par un cabinet étranger').toEqual([]);
    /* Et la section n'a pas changé de main. */
    const s = await q01<{ owner_id: string | null; holder_id: string | null }>(
      `select owner_id::text, holder_id::text from section_state where id = $1`, [sectionId]);
    expect(s!.owner_id).not.toBe(intrus);
    expect(s!.holder_id).not.toBe(intrus);
  });

  it('tout écran de dossier passe par requireMember — la lecture est gardée à l’entrée', () => {
    /* LA LECTURE : elle ne se garde pas dans les services (une lecture n'a pas
       d'acteur), elle se garde à l'ENTRÉE de l'écran. Ce test lit les fichiers,
       donc il dit ce qu'il vérifie : la PRÉSENCE de l'appel, pas son exécution
       — le parcours cliqué et l'acceptation, eux, l'empruntent pour de vrai. */
    const base = path.join(repoRoot(), 'app', 'src', 'app', 'eng');
    const pages: string[] = [];
    const marcher = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) marcher(p);
        else if (e.name === 'page.tsx' || e.name === 'layout.tsx') pages.push(p);
      }
    };
    marcher(base);
    const sans = pages.filter((p) => !/requireMember\s*\(/.test(fs.readFileSync(p, 'utf8')));
    expect(sans.map((p) => path.relative(base, p)), 'écrans de dossier sans requireMember').toEqual([]);
    expect(pages.length).toBeGreaterThan(20);
  });
});
