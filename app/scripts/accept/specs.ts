import type { Page } from 'playwright';
import { porteLeRectangle } from '../../src/lib/pdf/rectangle';

// LES TÂCHES D'ACCEPTATION CLIQUÉE — une par chose annoncée, conduite dans un
// navigateur CONTRE L'URL DÉPLOYÉE (mandat du jour, W0).
//
// POURQUOI UNE LISTE À PART DU PARCOURS CLIQUÉ. `npm run clics` conduit la
// mission entière sur un build local, base PGlite, monde semé à l'instant. Il
// prouve le produit ; il ne prouve pas L'INSTANCE que le fondateur ouvre le
// soir. Ici, chaque tâche annoncée dans le rapport du soir a UNE épreuve, un
// verdict observé (PASS/FAIL), une capture et un horodatage — et la ligne du
// rapport qui dit « livré » cite ce verdict, jamais une intention.
//
// UNE TÂCHE = UNE FONCTION QUI LÈVE. Elle rend une phrase de détail quand elle
// tient ; elle lève avec la raison quand elle ne tient pas. Le harnais ne
// devine rien : pas de verdict sans observation.

export interface Contexte {
  base: string;
  /** Le dossier de démonstration (l'audit légal le plus riche de l'instance). */
  eng: string;
  identite: string;
  p: Page;
}

export interface Spec {
  code: string;
  tache: string;
  conduire: (c: Contexte) => Promise<string>;
}

/* ── Les gestes communs ────────────────────────────────────────────────────── */

async function ouvrir(c: Contexte, chemin: string): Promise<void> {
  await c.p.goto(/^(https?:|data:)/.test(chemin) ? chemin : `${c.base}${chemin}`, { waitUntil: 'networkidle', timeout: 60000 });
  const corps = await c.p.content();
  if (/Application error: a (server-side|client-side) exception/.test(corps)) {
    throw new Error(`page d'erreur sur ${chemin}`);
  }
}

function attendre(cond: boolean, sinon: string): void {
  if (!cond) throw new Error(sinon);
}

/** Le refus affiché par le produit : il voyage dans `?erreur=` (app/refus.ts). */
function refus(p: Page): string | null {
  const u = new URL(p.url());
  return u.searchParams.get('erreur');
}

async function compte(p: Page, sel: string): Promise<number> {
  return p.locator(sel).count();
}

/* ── Les tâches ────────────────────────────────────────────────────────────── */

export const SPECS: Spec[] = [
  {
    code: 'A-01',
    tache: 'accueil : les identités de démonstration sont proposées',
    conduire: async (c) => {
      /* La session est ouverte : l'accueil montre les dossiers. On rouvre
         l'écran anonyme dans un contexte neuf pour compter les identités. */
      const ctx = await c.p.context().browser()!.newContext();
      const p = await ctx.newPage();
      try {
        await p.goto(`${c.base}/`, { waitUntil: 'networkidle', timeout: 60000 });
        const n = await p.locator('button[name=user_id]').count();
        attendre(n >= 3, `${n} identité(s) proposée(s) — il en faut au moins trois (préparateur, reviewer, associé)`);
        return `${n} identités proposées`;
      } finally { await ctx.close(); }
    },
  },
  {
    code: 'A-02',
    tache: 'tableau de bord « Mes travaux » : sections attribuées et obstacles (Groupe 1, 1.2)',
    conduire: async (c) => {
      await ouvrir(c, '/travaux');
      attendre((await compte(c.p, 'h1, h2')) > 0, 'aucun en-tête sur /travaux');
      attendre((await compte(c.p, 'table')) > 0, 'aucun tableau sur /travaux');
      return `${await compte(c.p, 'table tbody tr')} ligne(s) de travaux`;
    },
  },
  {
    code: 'A-03',
    tache: 'dossier : le rail et les destinations rendent',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}`);
      const liens = await compte(c.p, `a[href^="/eng/${c.eng}/"]`);
      attendre(liens >= 10, `${liens} destination(s) dans le rail — moins de dix, le rail ne rend pas`);
      return `${liens} destinations`;
    },
  },
  {
    code: 'A-04',
    tache: 'obstacles au visa : la liste calculée rend',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/obstacles`);
      attendre((await compte(c.p, 'h1, h2')) > 0, 'aucun en-tête sur /obstacles');
      return (await c.p.locator('main, body').first().innerText()).replace(/\s+/g, ' ').slice(0, 80);
    },
  },
  {
    code: 'A-05',
    tache: 'IPE : redésigner un rapport pour un AUTRE arrêté est REFUSÉ — les deux dates côte à côte sur un papier ouvert, « papier visé » sur un papier déjà visé (Groupe 1, 1.8)',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/workpapers`);
      const lien = await c.p.locator(`a[href^="/eng/${c.eng}/workpapers/"]`).first().getAttribute('href');
      attendre(Boolean(lien), 'aucun papier de travail listé');
      await ouvrir(c, lien!);
      const sel = c.p.locator('#ipe select[name=rapport_id]');
      attendre((await sel.count()) === 1, 'le papier ne propose pas de rapport IPE (#ipe select[name=rapport_id] absent)');
      const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? '' })));
      const fec = options.find((o) => /FEC-2025/.test(o.t));
      attendre(Boolean(fec), `aucun rapport FEC-2025 proposé (options : ${options.map((o) => o.t).join(' · ')})`);
      await sel.selectOption(fec!.v);
      /* DÉSIGNER un rapport existant, sans rien SAISIR d'un rapport neuf : le
         papier qui désigne déjà ce rapport pré-remplit sa documentation, et
         « désigné ET saisi » est un autre refus (voulu, revue hostile n°6) —
         pas celui qu'on vient observer. */
      for (const nom of ['rapport_nom', 'rapport_code', 'exhaustivite', 'exactitude', 'parametres', 'systeme_source']) {
        const champ = c.p.locator(`#ipe [name=${nom}]`);
        if (await champ.count()) await champ.first().fill('');
      }
      const utilisee = c.p.locator('#ipe input[name=utilisee][value=oui]');
      if (await utilisee.count()) await utilisee.check();
      await c.p.locator('#ipe select[name=approprie]').selectOption('oui');
      await c.p.locator('#ipe input[name=date_document]').fill('2026-01-15');
      /* LE BOUTON « Enregistrer », pas le dernier bouton du bloc (« Proposer une
         rédaction ») — cliquer le mauvais bouton lisait « aucun refus » là où rien
         n'avait été tenté (trouvé en conduisant le harnais en local). */
      const enregistrer = c.p.locator('#ipe button', { hasText: /^(Record|Enregistrer)$/ });
      attendre((await enregistrer.count()) === 1, `bouton d'enregistrement IPE introuvable (${await c.p.locator('#ipe button').allInnerTexts()})`);
      /* L'action serveur répond par une REDIRECTION que le routeur applique
         après la réponse : on attend la réponse, puis l'URL qui la porte. */
      await Promise.all([
        c.p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30000 }).catch(() => undefined),
        enregistrer.click(),
      ]);
      await c.p.waitForURL(/erreur=/, { timeout: 8000 }).catch(() => undefined);
      await c.p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
      const r = refus(c.p) ?? '';
      /* DEUX REFUS POSSIBLES, tous deux du produit : sur un papier déjà VISÉ
         (le monde semé signe ses papiers), l'IPE ne se modifie plus — le refus
         vient avant toute comparaison d'arrêté ; sur un papier ouvert, c'est
         l'arrêté qui refuse, les deux dates côte à côte. L'un ou l'autre est
         dit ; « aucun refus » est le seul défaut. */
      const vise = /vis[ée]|signed/i.test(r);
      attendre(vise || (/2025-12-31/.test(r) && /2026-01-15/.test(r)),
        r ? `refus sans les deux dates ni « papier visé » : « ${r.slice(0, 160)} »` : 'AUCUN refus : le rapport a été redésigné pour un autre arrêté (défaut)');
      return `${vise ? 'papier visé — ' : 'arrêté — '}refusé : « ${r.slice(0, 120)} »`;
    },
  },
  {
    code: 'A-06',
    tache: 'atelier de test : la pièce est dans l’écran, à côté de la ligne',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/testing`);
      for (let i = 0; i < 8 && !(await compte(c.p, '.atelier iframe.piece-vue')); i++) {
        const rang = c.p.locator('.atelier-liste tbody tr').nth(i);
        if (!(await rang.count())) break;
        await rang.click();
        await c.p.waitForTimeout(250);
      }
      attendre((await compte(c.p, '.atelier iframe.piece-vue')) > 0, 'aucune visionneuse de pièce dans l’atelier');
      return `${await compte(c.p, '.atelier-liste tbody tr')} ligne(s), visionneuse présente`;
    },
  },
  /* ── W1 : l'atelier de test — la grille, les ancres, les refus ─────────── */
  {
    code: 'W1-01',
    tache: 'grille : le calcul est accepté et la ligne ouverte montre sa bande de cellules avec un delta signé',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/testing`);
      /* Le calcul lit chaque pièce : on attend la RÉPONSE de l'action, pas le
         silence du réseau — puis on relit l'écran jusqu'à voir les cellules
         (une relecture trop tôt lisait « aucune cellule » sur un calcul en
         cours, trouvé en conduisant le harnais en local). */
      await Promise.all([
        c.p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 90000 }).catch(() => undefined),
        c.p.locator('button[data-grille-calculer]').click(),
      ]);
      await c.p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);
      attendre(!refus(c.p), `le calcul de la grille est refusé : ${refus(c.p)}`);
      /* Une ligne SANS pièce a des cellules toutes « absentes » (aucun delta) :
         s'arrêter à la première ligne avec cellules passerait à vide. On lit
         toutes les lignes et on exige au moins un delta SIGNÉ. */
      let n = 0;
      const deltas: string[] = [];
      for (let essai = 0; essai < 8 && n === 0; essai++) {
        await ouvrir(c, `/eng/${c.eng}/testing`);
        for (let i = 0; i < 16; i++) {
          const rang = c.p.locator('.atelier-liste tbody tr').nth(i);
          if (!(await rang.count())) break;
          await rang.click();
          await c.p.waitForTimeout(200);
          n += await compte(c.p, '[data-bande-cellules] table.cellules tbody tr');
          deltas.push(...(await c.p.locator('[data-bande-cellules] td[data-delta]').allInnerTexts()).map((d) => d.trim()));
        }
        if (n === 0) await c.p.waitForTimeout(4000);
      }
      attendre(n > 0, 'aucune ligne ne montre de cellules (après huit relectures)');
      const signes = deltas.filter((d) => /^(\+|−|0)/.test(d));
      attendre(signes.length > 0, 'aucune cellule comparée : tous les deltas sont absents');
      attendre(deltas.every((d) => /^(\+|−|0|—)/.test(d)), `delta non signé : ${deltas.join(' · ')}`);
      return `${n} cellule(s) · ${signes.length} delta(s) signé(s) : ${signes.slice(0, 6).join(' · ')}`;
    },
  },
  {
    code: 'W1-02',
    tache: 'ancre : cliquer une cellule ouvre la pièce avec le rectangle, à sa page ; le PDF rendu diffère de la pièce nue',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/testing`);
      let bouton = c.p.locator('[data-bande-cellules] button[data-ancre-page]').first();
      for (let i = 0; i < 12 && !(await bouton.count()); i++) {
        const rang = c.p.locator('.atelier-liste tbody tr').nth(i);
        if (!(await rang.count())) break;
        await rang.click();
        await c.p.waitForTimeout(200);
        bouton = c.p.locator('[data-bande-cellules] button[data-ancre-page]').first();
      }
      attendre((await bouton.count()) > 0, 'aucune cellule ancrée');
      await bouton.click();
      await c.p.waitForTimeout(400);
      const src = await c.p.locator('.atelier iframe.piece-vue').first().getAttribute('src') ?? '';
      attendre(/\/api\/piece\/[0-9a-f-]{36}\/ancre\?cellule=[0-9a-f-]{36}#page=\d+$/.test(src), `visionneuse sans ancre : ${src}`);
      const r = await c.p.request.get(c.base + src.replace(/#.*$/, ''));
      const nue = await c.p.request.get(c.base + src.replace(/\/ancre\?.*$/, '').replace('/api/piece/', '/api/blob/'));
      const enTete = r.headers()['x-otto-ancre'] ?? '';
      attendre(r.status() === 200 && /application\/pdf/.test(r.headers()['content-type'] ?? ''), `route d'ancre : ${r.status()}`);
      attendre(/page=\d+;x=/.test(enTete), 'en-tête X-Otto-Ancre absent');
      attendre(porteLeRectangle(await r.body(), enTete), 'le PDF rendu ne porte aucun rectangle à l’abscisse de l’ancre');
      attendre(!porteLeRectangle(await nue.body(), enTete), 'la pièce NUE porte déjà ce rectangle : la preuve ne discrimine pas');
      return `${enTete}`;
    },
  },
  {
    code: 'W1-03',
    tache: 'refus : V sur une ligne dont une cellule n’est pas conforme est refusé, attribut et code nommés (TEST-04)',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/testing`);
      let ok = false;
      for (let i = 0; i < 12 && !ok; i++) {
        const rang = c.p.locator('.atelier-liste tbody tr').nth(i);
        if (!(await rang.count())) break;
        await rang.click();
        await c.p.waitForTimeout(200);
        ok = (await compte(c.p, '[data-bande-cellules] form[data-disposer]')) > 0;
      }
      attendre(ok, 'aucune ligne avec une cellule à disposer : le refus ne peut pas être observé ici');
      await c.p.keyboard.press('v');
      await c.p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
      await c.p.waitForTimeout(600);
      const r = refus(c.p) ?? '';
      attendre(/TEST-04/.test(r), r ? `refus sans le code : ${r.slice(0, 120)}` : 'AUCUN refus : la ligne a été conclue (défaut)');
      return `refusé : « ${r.slice(0, 120)} »`;
    },
  },
  {
    code: 'W1-04',
    tache: 'refus : disposer une cellule sans motif est refusé par le serveur (TEST-03)',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/testing`);
      let f = c.p.locator('[data-bande-cellules] form[data-disposer]').first();
      for (let i = 0; i < 12 && !(await f.count()); i++) {
        const rang = c.p.locator('.atelier-liste tbody tr').nth(i);
        if (!(await rang.count())) break;
        await rang.click();
        await c.p.waitForTimeout(200);
        f = c.p.locator('[data-bande-cellules] form[data-disposer]').first();
      }
      attendre((await f.count()) > 0, 'aucune cellule à disposer');
      await f.locator('input[name=motif]').fill('   ');
      await f.locator('button[type=submit]').click();
      await c.p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
      await c.p.waitForTimeout(600);
      const r = refus(c.p) ?? '';
      attendre(/TEST-03/.test(r), r ? `refus sans le code : ${r.slice(0, 120)}` : 'AUCUN refus : la disposition vide a été acceptée (défaut)');
      return `refusé : « ${r.slice(0, 120)} »`;
    },
  },
  {
    code: 'W1-05',
    tache: 'grille figée : l’en-tête annonce la version et le nombre de colonnes du pack, et aucune ligne ne montre plus de cellules que la grille n’a de colonnes',
    conduire: async (c) => {
      /* Il n'existe AUCUN commutateur de langue dans le produit (la langue est
         celle du cabinet) : « les mêmes colonnes en français et en anglais »
         ne se clique pas ici — c'est prouvé par construction dans
         grille.test.ts (les colonnes sont du contenu de pack). Ce qui se
         clique : la grille figée et sa cohérence avec la bande. */
      await ouvrir(c, `/eng/${c.eng}/testing`);
      const enTete = (await c.p.locator('[data-bande-cellules] > .faint').first().innerText().catch(() => '')) ?? '';
      const m = enTete.match(/v(\d+) · (\d+) (?:colonnes|columns)/);
      attendre(Boolean(m), `en-tête de grille illisible : « ${enTete.slice(0, 80)} »`);
      const n = Number(m![2]);
      let max = 0;
      for (let i = 0; i < 12; i++) {
        const rang = c.p.locator('.atelier-liste tbody tr').nth(i);
        if (!(await rang.count())) break;
        await rang.click();
        await c.p.waitForTimeout(150);
        max = Math.max(max, await compte(c.p, '[data-bande-cellules] tr[data-cellule]'));
      }
      attendre(max > 0 && max <= n, `${max} cellule(s) sur une ligne pour ${n} colonne(s) figées`);
      return `grille v${m![1]}, ${n} colonnes ; au plus ${max} cellules par ligne`;
    },
  },
];

/* LES ÉPREUVES (règle 17) : des cas CONNUS MAUVAIS que le harnais doit
   déclarer FAIL, un par chemin de détection — l'assertion d'une tâche, la
   page d'erreur, l'exception du navigateur. Un harnais qui n'a jamais échoué
   exprès n'a jamais été testé. */
export const EPREUVES: Spec[] = [
  {
    code: 'X-0',
    tache: 'ÉPREUVE — un écran qui n’existe pas doit être déclaré FAIL (assertion de tâche)',
    conduire: async (c) => {
      await ouvrir(c, `/eng/${c.eng}/ecran-qui-n-existe-pas`);
      attendre((await compte(c.p, 'h1:has-text("Écran imaginaire")')) > 0, 'l’écran imaginaire n’a pas d’en-tête (attendu : il n’existe pas)');
      return 'IMPOSSIBLE : l’écran imaginaire a rendu';
    },
  },
  {
    code: 'X-1',
    tache: 'ÉPREUVE — une page qui porte le gabarit d’erreur de Next doit être déclarée FAIL (détecteur de page d’erreur)',
    conduire: async (c) => {
      await ouvrir(c, 'data:text/html,<h1>Application error: a server-side exception has occurred</h1>');
      return 'IMPOSSIBLE : la page d’erreur a été lue comme un écran';
    },
  },
  {
    code: 'X-2',
    tache: 'ÉPREUVE — une exception levée par la page doit être déclarée FAIL (écoute pageerror)',
    conduire: async (c) => {
      await ouvrir(c, 'data:text/html,<h1>Écran</h1><script>setTimeout(function(){throw new Error("exception connue mauvaise")},10)</script>');
      await c.p.waitForTimeout(300);
      return 'IMPOSSIBLE : l’exception n’a pas été comptée';
    },
  },
];
/** Rétro-compatibilité : la première épreuve. */
export const EPREUVE: Spec = EPREUVES[0];
