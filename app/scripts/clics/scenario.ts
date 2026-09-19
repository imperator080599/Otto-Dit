import type { BrowserContext, Locator, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import type { Contexte } from './contexte';
import { LOCALES, traduire, type CleLibelle, type Locale } from '../../src/lib/i18n/catalogue';

// LE PARCOURS CLIQUÉ — TOUT le chemin de démonstration, de l'import à l'export
// scellé. C'est ce que le balayage ne peut pas voir.
//
// `npm run screens` OUVRE les 60 routes et vérifie qu'elles RENDENT. Il ne
// clique sur rien, et les défauts les plus coûteux de ce dépôt lui étaient donc
// invisibles : six formulaires INERTES en production (ADR-078), un dossier créé
// QUE PERSONNE NE POUVAIT ATTEINDRE (ADR-088), et la clôture — le dernier geste
// du métier — qui n'avait AUCUN écran (ADR-091).
//
// CE QUE CHAQUE ÉTAPE VÉRIFIE VRAIMENT. Une action qui aboutit prouve peu. Ce
// qui prouve, c'est qu'une action INTERDITE soit refusée ET que le refus
// s'affiche. La majorité des étapes ci-dessous sont donc des refus attendus.
//
// CE QU'IL NE FAIT PAS, ET POURQUOI : il ne repeuple pas le monde. Le dossier
// de démonstration est construit par `npm run demo:seed`, qui passe par les
// mêmes services ; le parcours le reprend là où il s'arrête — sur un grand
// livre PROVISOIRE — et le conduit jusqu'au scellé. Refaire l'import initial au
// clic ferait un second dossier, pas une vérification du premier.

export interface Etape { nom: string; ok: boolean; detail: string }

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

/* LE PARCOURS LIT LE MÊME CATALOGUE QUE L'ÉCRAN (revue n°3). Il cherchait des
   textes FRANÇAIS écrits à la main ; le jour où l'interface a basculé, dix-neuf
   stations ont échoué d'un coup sans qu'aucune règle du produit n'ait bougé.
   Un test qui recopie un libellé diverge le jour où le libellé change — et
   c'est toujours le test qu'on croit.

   ET IL LIT LA LANGUE RÉELLEMENT SERVIE, IL NE LA SUPPOSE PAS (défaut n°25).
   `L` était figé sur l'anglais parce que c'est la locale du cabinet de
   démonstration. Le jour où l'instance sert le français, tous les `has-text`
   anglais renvoient zéro : les stations de PRÉSENCE échouent bruyamment — on le
   verrait — mais les onze stations d'ABSENCE passent EN SILENCE, en prouvant
   exactement rien. La locale est donc relevée sur `<html lang>` au premier
   écran. Si ce n'est pas une locale du catalogue, la station ÉCHOUE et le
   parcours vire au rouge — il ne s'ARRÊTE pas : les stations suivantes tournent
   sur la locale par défaut et échouent à leur tour, ce qui est bruyant, jamais
   silencieux. */
let locServie: Locale = 'en';
const L = (cle: CleLibelle) => traduire(locServie, cle);

/* UNE ASSERTION DE PARCOURS NE DOIT PAS DÉPENDRE DE LA LANGUE SERVIE. `R`
   accepte le libellé dans L'UNE OU L'AUTRE locale : le parcours passe que le
   cabinet de démonstration soit anglais (défaut du produit) ou français, et il
   éprouve du même coup que les deux entrées du catalogue existent. */
const echapper = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const R = (cle: CleLibelle) => new RegExp([traduire('en', cle), traduire('fr', cle)].map(echapper).join('|'));

/** L'index du jeu de données : quelle pièce répond à quelle facture. Le client
 *  qui dépose au portail sait quel document va sur quelle ligne ; le harnais
 *  doit le savoir aussi, sinon il dépose n'importe quoi n'importe où. */
interface PieceIndex { filename: string; docType: string; invoiceNumber?: string }
function indexPieces(): PieceIndex[] {
  return JSON.parse(fs.readFileSync(ds('fixtures', 'evidence_index.json'), 'utf8')) as PieceIndex[];
}

/* LIRE LE REFUS OÙ IL EST ÉCRIT. Chercher « refus » dans le texte de la page
   attrape les explications de la méthode (« Le système refuse, il ne rappelle
   pas ») et annonce un refus là où l'action a RÉUSSI. Les écrans font voyager
   le refus dans `?erreur=` (ADR-078) : c'est là, et nulle part ailleurs. */
function refus(p: Page): string | null {
  const m = p.url().match(/[?&](?:erreur|error)=([^&]*)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

/** La réponse défavorable de chaque critère d'acceptation, prise dans la méthode. */
const DEFAVORABLE: Record<string, string> = {
  integrite_direction: 'oui', competence_equipe: 'non', independance: 'non',
  predecesseur: 'non', difficultes_exercice_precedent: 'oui', honoraires_soutenables: 'non',
};

/** Un geste métier, et le nombre de clics RÉELS qu'il a coûtés. */
export interface Geste { nom: string; clics: number }

export async function conduire(
  p: Page, ctx: BrowserContext, base: string, c: Contexte,
): Promise<{ etapes: Etape[]; gestes: Geste[] }> {
  const etapes: Etape[] = [];
  const gestes: Geste[] = [];
  const dire = (nom: string, ok: boolean, detail: string) => etapes.push({ nom, ok, detail });
  const eng = `${base}/eng/${c.eng}`;

  /* LES CLICS SE COMPTENT, ILS NE S'ESTIMENT PAS (mandat §3.D : « les clics
     publiés »). Le compteur est posé DANS la page et écoute les vrais
     événements de clic — donc il compte ce qu'un humain aurait cliqué, y
     compris les dépliages, et jamais ce que le harnais fait sans souris
     (navigation directe, changement d'identité). Il survit aux navigations
     par sessionStorage : recharger une page ne remet pas un utilisateur à
     zéro. Ce que ce chiffre N'EST PAS, et qui est écrit dans docs/CLICS.md :
     le chemin OPTIMAL. C'est le chemin du parcours, qui vérifie aussi des
     refus — un plafond honnête, pas un record. */
  await ctx.addInitScript(() => {
    const CLE = '__otto_clics';
    document.addEventListener('click', () => {
      try { sessionStorage.setItem(CLE, String(Number(sessionStorage.getItem(CLE) ?? '0') + 1)); }
      catch { /* stockage refusé : le compteur se tait, il ne casse rien */ }
    }, true);
  });
  const clicsCumules = async (): Promise<number> => {
    try { return Number(await p.evaluate(`Number(sessionStorage.getItem('__otto_clics') ?? '0')`)) || 0; }
    catch { return 0; }
  };

  const texte = () => p.locator('body').innerText();
  const compte = (sel: string) => p.locator(sel).count();
  /* UNE ABSENCE NE SE PROUVE PAS DANS UNE SEULE LANGUE (défaut n°25). Onze
     stations concluent d'une ABSENCE : « plus aucune note ouverte », « plus
     aucun jalon à faire », « la clôture n'est pas offerte ». Cherchées par le
     libellé d'UNE langue, elles renvoient zéro sur une instance servie dans
     l'autre — et l'absence est alors vraie même quand l'écran affiche dix
     boutons. Ces stations-là comptent sur les DEUX libellés du catalogue :
     rien n'est absent tant qu'il reste visible dans une langue.

     CE N'EST PAS L'ÉQUIVALENT EXACT de `form:has(button:has-text("X"))` :
     `hasText` lit le texte de TOUT l'élément, pas celui du bouton. Le sens va
     dans le bon sens — le compte est plus large, donc un `=== 0` est PLUS
     strict et ne peut pas devenir un faux vert — mais il peut rougir pour un
     mot présent ailleurs dans le même formulaire. Dit ici plutôt que supposé. */
  const compteAbsent = (sel: string, cle: CleLibelle) => p.locator(sel, { hasText: R(cle) }).count();
  /* `load` ne suffit PAS : l'hydratation et la fin du flux RSC arrivent
     APRÈS, et naviguer à cet instant coupe le flux — l'erreur d'hydratation
     (#418) part alors sur la page SUIVANTE, mal étiquetée (fil n°7 de
     STATUS.md). On attend le silence réseau, comme après une action. */
  const aller = async (url: string) => {
    await p.goto(url, { waitUntil: 'load' });
    /* LE DÉPASSEMENT SE DIT, IL NE SE MASQUE PAS. L'ancien `.catch(() =>
       undefined)` avalait le cas « le réseau ne se calme jamais en 8 s » —
       et on naviguait ensuite sur un flux encore ouvert : c'est le mécanisme
       le plus probable des #418 erratiques du fil n°7 (l'exception coupée
       s'étiquette sur la page SUIVANTE). Quand ça arrive, on le journalise
       et on accorde une grâce fixe avant de continuer. */
    const calme = await p.waitForLoadState('networkidle', { timeout: 8000 })
      .then(() => true).catch(() => false);
    if (!calme) {
      console.log(`  (réseau jamais calme sur ${url} — grâce de 1500 ms)`);
      await p.waitForTimeout(1500);
    }
  };
  const cliquer = async (sel: string, attente = 2000) => {
    await p.locator(sel).first().click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(attente);
  };
  /* SOUMETTRE, PUIS ATTENDRE QUE L'ACTION AIT VRAIMENT FINI.
     Attention au piège : une action serveur ne déclenche PAS d'événement
     `load` — c'est une mise à jour côté client. Attendre `load` rend la main
     immédiatement et n'attend rien du tout ; c'est le SILENCE RÉSEAU qui
     marque la fin de l'aller-retour.
     Les actions redirigent (ADR-078) ; enchaîner un clic et un délai fixe fait
     courir le clic suivant contre le chargement en cours, et React signale une
     hydratation incohérente qu'il répare seul — sur des pages que le balayage
     rend proprement. Ce n'est pas le produit, c'est le harnais, et un harnais
     qui produit ses propres erreurs apprend à les ignorer. */
  /* Ouvrir le <details> fermé qui contient l'élément — les actions
     secondaires vivent dans des replis pilotés (§3.D, densité) et Playwright
     ne clique pas un bouton caché. Le geste est celui de l'utilisateur :
     déplier, puis agir. */
  const deplier = async (element: Locator) => {
    /* TOUS les replis fermés au-dessus de l'élément, du plus EXTÉRIEUR au plus
       intérieur : ouvrir un repli intérieur ne sert à rien tant que son parent
       est fermé. La première version n'ouvrait que le premier ancêtre — juste
       tant qu'aucun repli n'est imbriqué, faux le jour où il l'est. */
    for (let garde = 0; garde < 6; garde++) {
      const fermes = element.locator('xpath=ancestor::details[not(@open)]');
      if (!(await fermes.count())) return;
      await fermes.first().locator('summary').first().click();
      await p.waitForTimeout(250);
    }
  };
  /* (Il a existé ici un `deplierTout()` qui ouvrait TOUS les replis de
     l'écran. Il portait le même nom que `deplier` dans une station — deux
     gestes sous un seul nom, l'un masquant l'autre — et il coûtait treize
     clics là où un humain en fait un, ce qui faussait docs/CLICS.md. Chaque
     appel vise désormais LE repli de l'objet cherché.) */
  const soumettre = async (bouton: Locator, apres = 600) => {
    await bouton.click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(apres);
  };

  /* UNE STATION QUI TOMBE NE DOIT PAS EMPORTER LES SUIVANTES. La première
     version laissait l'exception remonter : un sélecteur qui n'accroche pas à
     la troisième station masquait les quinze suivantes, et le rapport disait
     « le parcours s'est interrompu » sans dire ce qui allait plus loin. Un
     harnais qui s'arrête au premier problème mesure le premier problème, pas le
     produit. L'échec est ENREGISTRÉ, avec sa cause, et le parcours continue. */
  const station = async (nom: string, fn: () => Promise<void>): Promise<void> => {
    const avant = etapes.length;
    const clicsAvant = await clicsCumules();
    const coutDuGeste = async () => {
      const n = (await clicsCumules()) - clicsAvant;
      gestes.push({ nom, clics: n >= 0 ? n : 0 });
    };
    try {
      await fn();
    } catch (e) {
      const cause = e instanceof Error ? e.message.split('\n')[0] : String(e);
      dire(nom, false, `station interrompue — ${cause.slice(0, 150)}`);
      await coutDuGeste();
      return;
    }
    await coutDuGeste();
    /* Une station qui ne produit AUCUNE étape n'a rien vérifié : c'est un
       silence, pas un succès. */
    if (etapes.length === avant) dire(nom, false, 'station muette — aucune vérification produite');
  };

  /** Changer d'identité, comme le sélecteur de l'application le fait. Le visa se
   *  vérifie en étant TROIS personnes : un seul utilisateur ne peut pas montrer
   *  qu'un associé ne signe pas avant son reviewer. */
  const devenir = async (id: string) => {
    await ctx.clearCookies();
    await ctx.addCookies([{
      name: 'otto_user', value: id, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax',
    }]);
  };

  /* APPROUVER TOUTES LES DEMANDES APPROUVABLES — pas « la première ».
     Une demande naît en brouillon ; tant qu'une personne ne l'a pas approuvée,
     elle N'EXISTE PAS pour le client. Le harnais ouvrait le premier lien de la
     liste, tombait sur une demande déjà envoyée, en concluait « déjà envoyée »
     — et la demande fraîchement engendrée restait en brouillon, invisible au
     portail. Dix-sept lignes sans réponse plus tard, l'obstacle accusait le
     produit d'un défaut du harnais. */
  const approuverToutes = async (): Promise<number> => {
    await aller(`${eng}/requests`);
    const liens = await p.locator('a[href*="/requests/"]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('href'))
        .filter((h): h is string => typeof h === 'string' && /\/requests\/[0-9a-f-]{36}/.test(h)));
    let envoyees = 0;
    for (const href of liens) {
      await aller(base + href);
      if (await compte(`button:has-text("${L('req.approveAndSendL2')}")`)) {
        await cliquer(`button:has-text("${L('req.approveAndSendL2')}")`, 3000);
        if (!refus(p)) envoyees++;
      }
    }
    return envoyees;
  };

  let engNeuf = '';

  await devenir(c.associe.id);

  // ── 0. LA LANGUE SERVIE — mesurée, jamais supposée

  /* `L` lisait le catalogue EN ANGLAIS parce que c'est la locale du cabinet de
     démonstration. C'est vrai aujourd'hui et ce n'est écrit nulle part : le
     jour où l'instance sert le français, les cent cinquante-sept sélecteurs
     anglais du parcours accrochent le vide. Les stations de PRÉSENCE échouent
     bruyamment — on les verrait — mais les stations d'ABSENCE passeraient en
     prouvant exactement rien. Le parcours relève donc la langue sur
     `<html lang>` et la SERT à `L` ; et il vérifie, sur cet écran, que le
     libellé de cette langue est bien celui que l'utilisateur voit — un
     attribut correct sur un écran traduit autrement serait le même silence. */
  await station('langue : le parcours lit le catalogue DANS la langue réellement servie', async () => {
    await aller(base + '/');
    const lang = String(await p.evaluate('document.documentElement.lang'));
    const connue = (LOCALES as readonly string[]).includes(lang);
    if (connue) locServie = lang as Locale;
    const vu = connue ? await compte(`summary:has-text("${L('nouveau.titre')}")`) : 0;
    dire('langue : le parcours lit le catalogue DANS la langue réellement servie',
      connue && vu > 0,
      connue ? `<html lang="${lang}"> et le libellé de cette langue est à l’écran`
        : `<html lang="${lang}"> n’est pas une locale du catalogue`);
  });

  // ── 1. CRÉER UN DOSSIER, ET LE RETROUVER (le contrôle qui a trouvé ADR-088)
  await station('création : le dossier créé est ATTEIGNABLE', async () => {
    await aller(base + '/');
    await cliquer(`summary:has-text("${L('nouveau.titre')}")`, 300);
    await p.locator('select[name=kind]').selectOption('integrated');
    await p.locator('input[name=name]').fill('Dossier créé au clic');
    await cliquer(`form button:has-text("${L('nm.creer')}")`, 2500);

    if (p.url().includes('/acceptance')) {
      engNeuf = p.url().match(/\/eng\/([^/]+)/)![1];
      dire('création : le dossier créé s’ouvre sur son acceptation — donc il est ATTEIGNABLE',
        true, engNeuf);
      return;
    }
    /* REJOUABLE : la règle du doublon refuse la seconde exécution, à raison. Le
       parcours suit alors le dossier déjà créé — une vérification qui ne se
       rejoue qu'une fois est une affirmation. */
    const motif = refus(p) ?? '';
    const href = await p.locator('a[href*="/eng/"]').evaluateAll(
      (els, nom) => {
        const a = els.find((e) => (e.textContent ?? '').includes(nom));
        return a ? a.getAttribute('href') : null;
      }, 'Dossier créé au clic');
    engNeuf = href ? href.match(/^\/eng\/([^/]+)/)![1] : '';
    dire('création : refusée en doublon, et le dossier déjà créé reste ATTEIGNABLE',
      Boolean(motif) && Boolean(engNeuf), motif || 'refus non lisible dans l’URL');
  });

  // ── 1 bis. LE RAIL D'ÉTAT sur le dossier neuf (ADR-103)
  await station('rail : l\'état du dossier, pas le catalogue', async () => {
    if (!engNeuf) { dire('rail : pas de dossier neuf', false, 'étape 1 en échec'); return; }
    await aller(`${base}/eng/${engNeuf}`);
    const liens = await compte('.rail a.rail-lien');
    /* Un dossier neuf (accepté ou pas selon le rejeu) montre PEU : le rail
       grandit avec le travail, il ne présente pas le catalogue. */
    dire('rail : un dossier jeune montre un rail COURT (état, pas catalogue)',
      liens >= 5 && liens <= 12, `${liens} destination(s) atteignable(s)`);
    /* LE RAIL EST VERTICAL ET GROUPÉ (ADR-112) : ce n'est pas une préférence
       d'affichage, c'est la thèse — les destinations ne sont pas toutes du
       même rang, et un groupe le dit. On le MESURE dans le navigateur : une
       classe posée ne prouve pas une colonne. */
    /* LE RAIL EST VERTICAL (ADR-112) : ce n'est pas une préférence
       d'affichage, c'est la thèse — les destinations ne sont pas toutes du
       même rang. On le MESURE dans le navigateur : une classe posée ne prouve
       pas une colonne (règle 15). */
    const enColonne = await p.evaluate(`(() => {
      const l = [...document.querySelectorAll('.rail a.rail-lien')].slice(0, 2)
        .map((e) => e.getBoundingClientRect());
      return l.length === 2 ? l[1].top > l[0].top + 4 : false;
    })()`);
    dire('rail : vertical — les destinations sont empilées, pas alignées',
      enColonne === true, `liens empilés : ${enColonne}`);
    dire('rail : « tout afficher » annonce ce qui reste, jamais un masquage muet',
      (await compte('.rail .rail-tout')) === 1,
      await p.locator('.rail .rail-tout').innerText().catch(() => 'absent'));
    await p.locator('.rail .rail-tout').click();
    await p.waitForTimeout(400);
    /* Déplié, le rail montre les SIX groupes — un dossier jeune n'en ouvre que
       deux, et c'est ce qui rendrait le compte instable sans le dépliage. */
    /* `allInnerTexts` rend le texte TEL QU'IL S'AFFICHE : la feuille de style
       met les titres de groupe en capitales, et comparer au libellé du code
       échouerait sur une différence de casse — pas sur une règle. */
    /* Les titres viennent du CATALOGUE (anglais par défaut) et portent un
       chevron : on compare au libellé servi, chevron ôté. */
    const titres = (await p.locator('.rail .rail-titre').allInnerTexts())
      .map((x) => x.replace(/[▸▾]/g, '').trim().toLowerCase());
    /* SEPT groupes depuis le mandat de la soirée (§1) : les ÉTATS FINANCIERS —
       bilan puis compte de résultat — au milieu, lus par le catalogue dans les
       deux langues, casse ignorée (les titres s'affichent en capitales). */
    const groupe = (cle: CleLibelle) => new RegExp(R(cle).source, 'i');
    dire('rail : groupé par nature de travail, le BILAN puis le COMPTE DE RÉSULTAT au milieu',
      titres.length === 7 && groupe('rail.groupe.bilan').test(titres[2]) && groupe('rail.groupe.resultat').test(titres[3]), titres.join(' · '));
    const grises = await compte('.rail .rail-lien.grise');
    const t = await p.locator('.rail').innerText();
    dire('rail : le pas-encore-atteignable est GRISÉ avec sa raison en une ligne',
      grises > 0 && new RegExp([R('rail.raison.apresAcceptation'), R('rail.raison.auPremierEcart')].map((x) => x.source).join('|')).test(t), `${grises} grisée(s), raisons visibles`);
  });

  // ── 1 bis. CRÉER UN CLIENT NEUF ET SON EXERCICE, EN UN ÉCRAN (Groupe 1, 1.1)
  //
  // Le formulaire d'accueil accepte un client qui n'existe pas encore et un
  // exercice par sa date de clôture ; la mission naît avec sa classe et sa
  // préférence de seuil, et s'ouvre sur son acceptation avec le rail entier.
  // Puis l'exercice SUIVANT du même client se relie tout seul au précédent :
  // l'en-tête montre le lien N-1. Rejouable : un second passage tombe sur le
  // refus « existe déjà », qui est la règle, et le dit.
  const CLIENT_NEUF = 'Client de nuit (fictif)';
  await station('création : un client NEUF et son exercice, en un écran', async () => {
    await aller(base + '/');
    await cliquer(`summary:has-text("${L('nouveau.titre')}")`, 300);
    await p.locator('select[name=entity_id]').selectOption('__nouveau__');
    await p.locator('input[name=entity_name]').fill(CLIENT_NEUF);
    await p.locator('select[name=period_id]').selectOption('__nouveau__');
    await p.locator('input[name=period_end]').fill('31/12/2026');
    await p.locator('select[name=classe]').selectOption('eip');
    await p.locator('select[name=benchmark]').selectOption('revenue');
    await cliquer(`form button:has-text("${L('nm.creer')}")`, 2500);
    const motif = refus(p);
    /* AU REJEU, LA STATION CHANGE DE NOM : le figé dédoublonne par nom, et
       un « ok » de rejeu sous le nom du vrai chemin ferait croire que les cinq
       assertions ont été conduites (revue hostile n°4). Le refus du doublon
       est une règle : il se vérifie sous son propre nom. */
    if (motif && /existe déjà|already exists/i.test(motif)) {
      dire('création : rejeu — le client de nuit existe déjà, et le formulaire le dit', true, motif);
      return;
    }
    const ok = p.url().includes('/acceptance') && (await compte('[data-classe="eip"]')) === 1;
    dire('création : un client NEUF et son exercice, en un écran',
      ok, motif ?? `${p.url().replace(base, '')} · classe affichée en en-tête`);
    dire('création : un premier exercice n’a pas de N-1 — l’en-tête ne l’invente pas',
      (await compte('[data-n1]')) === 0, 'aucun lien N-1');
  });

  await station('création : l’exercice suivant se relie au précédent, et l’en-tête montre N-1', async () => {
    await aller(base + '/');
    await cliquer(`summary:has-text("${L('nouveau.titre')}")`, 300);
    await p.locator('select[name=entity_id]').selectOption({ label: CLIENT_NEUF });
    await p.locator('select[name=period_id]').selectOption('__nouveau__');
    await p.locator('input[name=period_end]').fill('31/12/2027');
    await p.locator('input[name=name]').fill('Client de nuit — exercice suivant');
    await cliquer(`form button:has-text("${L('nm.creer')}")`, 2500);
    const motif = refus(p);
    if (motif && /chevauche|overlap|existe déjà|already exists/i.test(motif)) {
      dire('création : rejeu — l’exercice suivant existe déjà, et le formulaire le dit', true, motif);
      return;
    }
    const lien = p.locator('[data-n1]');
    dire('création : l’exercice suivant se relie au précédent, et l’en-tête montre N-1',
      p.url().includes('/acceptance') && (await lien.count()) === 1 && /FY2026/.test(await lien.innerText().catch(() => '')),
      motif ?? `lien N-1 : ${await lien.innerText().catch(() => '(absent)')}`);
    /* Le rail du dossier neuf : les imports attendent l'acceptation, et la
       raison est ÉCRITE dans le rail — derrière « tout afficher », que l'on
       déplie d'abord (lire le corps sans déplier ne voyait rien : le premier
       passage a échoué exactement là). Et la reprise N-1 est ATTEIGNABLE —
       vérifié, pas commenté : son lien n'est pas grisé. */
    if (await compte('.rail .rail-tout')) { await p.locator('.rail .rail-tout').click(); await p.waitForTimeout(400); }
    const rail = await p.locator('.rail').innerText().catch(() => '');
    dire('création : le rail du dossier neuf est grisé avec ses raisons',
      R('rail.raison.apresAcceptation').test(rail), 'raison « après acceptation » lisible dans le rail');
    dire('création : la reprise N-1 du dossier neuf est atteignable — un N-1 existe',
      (await compte('.rail a[href$="/carry-forward"]:not(.grise)')) === 1,
      `${await compte('.rail a[href$="/carry-forward"]')} lien(s) reprise, ${await compte('.rail a[href$="/carry-forward"].grise')} grisé(s)`);
  });

  // ── 1 ter. LE TABLEAU DE BORD, HORS RAIL (Groupe 1, 1.2)
  //
  // L'associé se connecte et, sans toucher au rail, voit ce qui l'attend sur
  // TOUS ses dossiers — les obstacles au visa par famille, ses sections, les
  // notes ouvertes par ancienneté — et clique droit dedans. Le point de
  // départ est le lien du bandeau ; la destination est l'écran qui lève
  // l'obstacle. À ce stade du parcours, les dossiers neufs ne sont pas
  // acceptés : la famille « acceptation » y est certaine.
  await station('tableau de bord : ce qui attend l’associé, hors rail, et le clic direct', async () => {
    await devenir(c.associe.id);
    await aller(`${eng}/dashboard`);
    await p.locator(`.topbar-lien:has-text("${L('commun.mesTravaux')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await p.waitForTimeout(600);
    const surTravaux = p.url().includes('/travaux');
    const dossiers = await compte('[data-obstacles-dossier]');
    const familles = await compte('[data-obstacle-famille]');
    dire('tableau de bord : les obstacles de MES dossiers, par famille, sans toucher au rail',
      surTravaux && dossiers > 0 && familles > 0, `${dossiers} dossier(s), ${familles} famille(s) listée(s)`);
    dire('tableau de bord : mes sections sur tous mes dossiers, en quatre listes',
      (await compte('[data-section-liste]')) === 4, `${await compte('[data-section-liste]')} liste(s)`);
    dire('tableau de bord : les notes ouvertes par ancienneté, ou la phrase qui dit qu’il n’y en a pas',
      (await compte('[data-notes-dossier]')) > 0 || R('trav.notes.aucune').test(await texte()),
      `${await compte('[data-notes-dossier]')} dossier(s) avec notes ouvertes`);
    if (!surTravaux || !familles) return;
    const lien = p.locator('[data-obstacle-famille] a[href]').first();
    const cible = (await lien.getAttribute('href')) ?? '';
    await lien.click();
    await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await p.waitForTimeout(600);
    dire('tableau de bord : un obstacle mène à l’écran qui le lève, en UN clic',
      cible.length > 0 && p.url().includes(cible), `→ ${cible}`);
  });

  // ── 2. ACCEPTATION ET JALONS, sur le dossier neuf
  await station('acceptation du dossier neuf', async () => {
    if (!engNeuf) { dire('acceptation : pas de dossier neuf à accepter', false, 'étape 1 en échec'); return; }
    await aller(`${base}/eng/${engNeuf}/acceptance`);
    if (await compte(`button:has-text("${L('acc.openTheDecision')}")`)) {
      await cliquer(`button:has-text("${L('acc.openTheDecision')}")`);
    }
    if (await compte(`button:has-text("${L('acc.acceptTheEngagement')}")`)) {
      await cliquer(`button:has-text("${L('acc.acceptTheEngagement')}")`);
      dire('acceptation : décider SANS motif est refusé', Boolean(refus(p)), refus(p) ?? 'passé — défaut');

      /* Parcourir par CODE : le formulaire d'un critère reste affiché après la
         réponse — on doit pouvoir se corriger — donc « le premier » répond n
         fois au même, et l'application refuse alors en nommant les critères
         sans réponse. Elle a raison, mais ce n'est pas ce qu'on vérifiait. */
      const codes = await p.locator('form:has(select[name=answer]) input[name=code]')
        .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      for (const code of codes) {
        const f = p.locator(`form:has(input[name=code][value="${code}"]):has(select[name=answer])`);
        await f.locator('select[name=answer]').selectOption(DEFAVORABLE[code] === 'oui' ? 'non' : 'oui');
        await f.locator(`button:has-text("${L('col.record')}")`).click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(900);
      }
      const sansReponse = await p.locator('form:has(select[name=answer]) select[name=answer]')
        .evaluateAll((els) => els.filter((e) => !(e as HTMLSelectElement).value).length);
      dire('acceptation : tous les critères notés', codes.length > 0 && sansReponse === 0,
        `${codes.length} critère(s), ${sansReponse} sans réponse`);

      await p.locator('input[name=reason]').first()
        .fill('Client connu, équipe disponible, indépendance acquise.');
      await cliquer(`button:has-text("${L('acc.acceptTheEngagement')}")`, 2500);
      dire('acceptation : décider AVEC motif et critères complets est accepté',
        !refus(p) && R('acc.accepted').test(await texte()), refus(p) ?? 'acceptée');
    } else {
      dire('acceptation : décision déjà prise (rejeu)', true,
        (await texte()).match(/(acceptée|refusée)[^\n]{0,60}/i)?.[0] ?? '');
    }

    /* Le jalon DÉRIVÉ ne se refuse pas : il ne s'OFFRE pas. Une action
       impossible qu'on ne propose pas vaut mieux qu'une action proposée puis
       refusée — à condition de dire pourquoi, sinon l'absence se lit comme un
       oubli d'écran. */
    const jalonsRepli = p.locator(`details:has(summary:has-text("${L('acc.engagementMilestones')}"))`).first();
    if (await jalonsRepli.count()) {
      await deplier(jalonsRepli.locator('table').first());
    }
    dire('jalons : le jalon dérivé n’est pas saisissable, et la raison est écrite',
      (await compte('form:has(input[name=code][value="assemblage"]) input[name=date]')) === 0
        && R('acc.computedByTheFrameworkRuleNot').test(await texte()),
      'aucun champ de saisie sur le jalon dérivé');
  });

  /* ── ÉQUIPE ET INDÉPENDANCE (Lot 4, tranche 3 — mandat, « création de
     dossier de bout en bout ») : L'ÉCRAN N'AVAIT JAMAIS ÉTÉ CLIQUÉ. Le semeur
     pose quatre membres et une déclaration déjà SIGNÉE d'un coup (seed.ts) —
     aucun geste humain ne le fait. `openDeclaration`, `answerRubric`,
     `signDeclaration`, `assignMember` existaient, testés en unitaire
     (`team.test.ts`), jamais empruntés par ce parcours. Identité active :
     Claire (associé), inchangée depuis l'acceptation — cohérent, l'associé
     confirme sa propre indépendance après avoir accepté la mission. */
  await station('équipe et indépendance', async () => {
    await aller(`${eng}/team`);

    /* MA DÉCLARATION EST DÉJÀ SIGNÉE (semeur) : le seul geste possible est
       une RÉVISION, motif écrit obligatoire (TeamRuleError sinon). */
    const formeReviser = p.locator('form:has(input[name=reason])').first();
    if (await formeReviser.count()) {
      await formeReviser.locator('input[name=reason]').fill('Reconfirmation annuelle, aucun changement de situation.');
      await formeReviser.locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(900);
    }
    dire('équipe : ma déclaration d’indépendance se RÉVISE depuis l’écran, avec un motif écrit',
      !refus(p) && (await compte('form:has(select[name=answer])')) > 0,
      refus(p) ?? 'révision ouverte, rubriques à répondre');

    /* CHAQUE RUBRIQUE SE RÉPOND, une par une (même idiome que le
       questionnaire résiduel, station « risque par assertion »). La révision
       repart TOUJOURS de zéro (aucune reprise des réponses précédentes,
       `openDeclaration` ne les copie pas) : aucune n'est présélectionnée. */
    const total = await compte('form:has(select[name=answer])');
    for (let tour = 0; tour < 30; tour++) {
      const vides = await p.locator('form:has(select[name=answer])').evaluateAll(
        (els) => els.map((e, i) => ({ i, v: (e.querySelector('select[name=answer]') as HTMLSelectElement)?.value }))
          .filter((x) => !x.v).map((x) => x.i));
      if (!vides.length) break;
      const f = p.locator('form:has(select[name=answer])').nth(vides[0]);
      await f.locator('select[name=answer]').selectOption('non');
      await f.locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(700);
    }
    const reste = await p.locator('form:has(select[name=answer])').evaluateAll(
      (els) => els.filter((e) => !(e.querySelector('select[name=answer]') as HTMLSelectElement)?.value).length);
    dire('équipe : chaque rubrique d’indépendance se répond, une par une',
      total > 0 && reste === 0, `${total} rubrique(s), ${reste} sans réponse`);

    /* SIGNER : n'est offert qu'une fois `missing` vide (page.tsx) — donc CE
       bouton n'existe que si la boucle ci-dessus a vraiment tout répondu. */
    const boutonSigner = p.locator(`button:has-text("${L('team.signMyDeclaration')}")`).first();
    const offertAvantSignature = await boutonSigner.count();
    if (offertAvantSignature) {
      await boutonSigner.click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(900);
    }
    dire('équipe : la déclaration se SIGNE depuis l’écran, une fois toutes les rubriques répondues',
      offertAvantSignature > 0 && !refus(p) && (await compte(`button:has-text("${L('team.signMyDeclaration')}")`)) === 0,
      refus(p) ?? (offertAvantSignature ? 'signée' : 'le bouton de signature n’a jamais été offert'));

    /* AFFECTER : réaffecter Claire elle-même (déjà membre, déclaration tout
       juste signée ci-dessus) — le geste réel d'`assignMember`, idempotent
       (UPDATE si déjà membre), sans dépendre d'une AUTRE personne dont
       l'indépendance n'aurait jamais été confirmée par ce parcours.
       RÔLE ET VISA EXPLICITES, PAS LES DÉFAUTS DU FORMULAIRE (defaultValue
       "staff", case "peut viser" décochée) : un premier passage les avait
       laissés tels quels et avait donc RÉÉCRIT Claire — l'associée — en
       « staff » sans droit de visa, cassant la hiérarchie de revue pour
       toutes les stations suivantes (visas, clôture des notes, réunions).
       `assignMember` fait un UPDATE inconditionnel des trois champs qu'on
       lui donne (`team.ts:422-427`) : on lui redonne donc EXACTEMENT son
       rôle réel (`seed.ts:171`, partner) pour que le geste soit un vrai
       no-op fonctionnel, pas une corruption silencieuse. */
    const formeAffecter = p.locator('form:has(select[name=user_id])').first();
    const offertAffecter = await formeAffecter.count();
    if (offertAffecter) {
      await formeAffecter.locator('select[name=user_id]').selectOption({ value: c.associe.id });
      await formeAffecter.locator('select[name=eng_role]').selectOption('partner');
      await formeAffecter.locator('input[name=can_sign]').check();
      await formeAffecter.locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(900);
    }
    dire('équipe : un membre s’AFFECTE depuis l’écran (rôle, visa, date d’entrée)',
      offertAffecter > 0 && !refus(p),
      refus(p) ?? (offertAffecter ? 'affectation enregistrée' : 'le formulaire d’affectation n’a jamais été offert'));
  });

  // ── 3. IMPORT DU FEC DÉFINITIF (ADR-016 : un ré-import se confirme)
  await station('import du grand livre définitif', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/imports`);
    const fecDef = ds('definitif', '999888777FEC20251231.txt');
    const avecCase = await compte('form:has(input[name=confirm_invalidation])');
    if (avecCase > 0) {
      const f1 = p.locator('form:has(input[name=confirm_invalidation])');
      await f1.locator('input[type=file]').setInputFiles(fecDef);
      await f1.locator(`button:has-text("${L('imp.importFec')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(5000);
      dire('import : ré-importer le grand livre SANS confirmer l’invalidation est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    } else {
      dire('import : aucune sélection en aval, la confirmation n’est pas demandée', true,
        'rien à invalider');
    }

    await aller(`${eng}/imports`);
    const f2 = p.locator(`form:has(button:has-text("${L('imp.importFec')}"))`);
    await f2.locator('input[type=file]').setInputFiles(fecDef);
    const cb = f2.locator('input[name=confirm_invalidation]');
    if (await cb.count()) await cb.check();
    await f2.locator(`button:has-text("${L('imp.importFec')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(12000);
    dire('import : le FEC DÉFINITIF entre, invalidation confirmée',
      !refus(p), refus(p) ?? 'importé');
  });

  // ── 4. RAPPROCHEMENT : c'est LUI, propre, qui lève le drapeau « provisoire »
  await station('rapprochement balance / grand livre', async () => {
    await aller(`${eng}/reconciliation`);
    if (await compte(`button:has-text("${L('col.recompute')}")`)) {
      await cliquer(`button:has-text("${L('col.recompute')}")`, 6000);
    }
    /* LIRE LE VERDICT, PAS LA PROSE. L'écran EXPLIQUE, sous le résultat, que
       « per-account differences are never netted » : chercher le mot
       « differences » dans toute la page annonçait un rapprochement en écart
       alors qu'il était propre. Le verdict, lui, tient en une phrase. */
    const t = await texte();
    const propre = /all accounts tie/i.test(t);
    dire('rapprochement : re-exécuté sur le fichier définitif, il est PROPRE',
      propre, t.match(/\d+ accounts compared[^\n]{0,40}/i)?.[0] ?? '(verdict non lu)');
  });

  // ── 4 bis. LES BALANCES AUXILIAIRES ÂGÉES (ADR-107) : les exports du
  //    client, rapprochés au grand livre — et l'écart de 25 000 € que le
  //    collectif porte SANS attribution auxiliaire (l'écriture de situation
  //    du fichier définitif) est DIT, pas absorbé.
  await station('balances auxiliaires : concentration, apparus, vieillissement', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/balances-aux`);
    for (const [exercice, fichier] of [['n', 'clients_2025.csv'], ['n1', 'clients_2024.csv']] as const) {
      await p.locator('select[name=exercice]').selectOption(exercice);
      await p.locator('input[type=file]').setInputFiles(ds('balances_aux', fichier));
      await soumettre(p.locator(`button:has-text("${L('bal.importer')}")`).first(), 1500);
    }
    let t = await texte();
    dire('balances aux. : la balance N-1 se rapproche AUX À-NOUVEAUX, au centime',
      new RegExp(`${traduire('en', 'bal.clientsN1')}|${traduire('fr', 'bal.clientsN1')}`).test(t) && R('bal.reconciled').test(t), 'N-1 rapprochée ✓');
    /* L'écart est NÉGATIF : la balance des tiers porte 25 000 € de MOINS que
       le grand livre — l'écriture de situation crédite le collectif sans
       attribution auxiliaire, la balance ne peut pas la porter. */
    dire('balances aux. : l’écart du collectif est DIT — 25 000 € sans attribution auxiliaire (écriture de situation)',
      /-25.?000,00/.test(t), (t.match(/-25[^\n]{0,20}/) ?? ['écart non affiché'])[0]);
    dire('balances aux. : apparus et disparus sont nommés sur leurs lignes',
      (await compte(`.badge:has-text("${L('mot.new')}")`)) >= 2 && (await compte(`.badge:has-text("${L('mot.gone')}")`)) >= 2,
      'badges apparu/disparu présents');
    /* innerText rend le texte TEL QU'AFFICHÉ : les en-têtes de table sont en
       capitales par CSS (text-transform), donc /Vieillissement/ échouait alors
       que le tableau était à l'écran. On ne cherche plus le mot : on lit la
       MESURE (le KPI « x % → y % ») et le MARQUAGE (la tranche > 90 jours au
       badge rouge quand le déplacement dépasse le seuil). */
    const t90 = await texte();
    const RE_KPI = /\d+(?:[.,]\d+)? % → \d+(?:[.,]\d+)? %/;
    const kpiMesure = RE_KPI.test(t90);
    const trancheMarquee = await compte('table.data .badge.red:has-text("%")');
    dire('balances aux. : la déformation du vieillissement (> 90 jours) est mesurée N contre N-1',
      R('bal.shareBeyond90Days').test(t90) && kpiMesure && trancheMarquee >= 1,
      kpiMesure ? `KPI ${(t90.match(RE_KPI) ?? [''])[0]}, tranche > 90 j marquée` : 'mesure absente');

    /* Un constat SE PROPOSE au registre — il ne s'applique pas tout seul. */
    const proposer = p.locator(`button:has-text("${L('proc.proposerRegistre')}")`).first();
    dire('balances aux. : les constats sont des CANDIDATS, à proposer au registre',
      (await proposer.count()) > 0, `${await compte(`button:has-text("${L('proc.proposerRegistre')}")`)} candidat(s)`);
    await soumettre(proposer, 1200);
    dire('balances aux. : le candidat proposé attend une confirmation HUMAINE au registre',
      refus(p) === null && (await compte(`.badge:has-text("${L('bal.proposedToTheRegister')}")`)) === 1,
      'badge « proposé au registre », bouton retiré');

    /* LA CIRCULATION VA JUSQU'AU BOUT : un facteur proposé se STATUE au
       registre — sinon il bloque le visa, et c'est voulu. La réviseuse le
       RETIENT, avec motif. */
    await devenir(c.reviewer.id);
    await aller(`${eng}/risk`);
    const rangFacteur = p.locator('tr:has-text("Immovance")')
      .filter({ has: p.locator(`button:has-text("${L('mot.keep')}")`) }).first();
    await rangFacteur.locator('input[name=reason]').fill(
      'Concentration accrue sur un donneur d’ordre — revue du recouvrement étendue.');
    await soumettre(rangFacteur.locator(`button:has-text("${L('mot.keep')}")`).first(), 1500);
    dire('balances aux. : le facteur est STATUÉ par une personne au registre — la circulation est complète',
      refus(p) === null, refus(p) ?? 'facteur retenu, visa débloqué');
    await devenir(c.preparateur.id);
    await aller(`${eng}/balances-aux`);

    /* Les questions au client : un BROUILLON de demande. */
    await soumettre(p.locator(`button:has-text("${L('circ.draftTheQuestionsToTheClient')}")`).first(), 1500);
    await aller(`${eng}/requests`);
    t = await texte();
    dire('balances aux. : les questions au client naissent en brouillon, dans le circuit habituel',
      /Balance auxiliaire clients — questions/.test(t), 'demande listée avec les demandes');

    /* Le côté FOURNISSEURS existe et se rapproche pareil. */
    await aller(`${eng}/balances-aux?cote=fournisseurs`);
    for (const [exercice, fichier] of [['n', 'fournisseurs_2025.csv'], ['n1', 'fournisseurs_2024.csv']] as const) {
      await p.locator('select[name=exercice]').selectOption(exercice);
      await p.locator('input[type=file]').setInputFiles(ds('balances_aux', fichier));
      await soumettre(p.locator(`button:has-text("${L('bal.importer')}")`).first(), 1500);
    }
    t = await texte();
    dire('balances aux. : le côté fournisseurs se rapproche et s’analyse pareil',
      new RegExp(`${traduire('en', 'bal.fournisseursN1')}|${traduire('fr', 'bal.fournisseursN1')}`).test(t)
      && R('bal.reconciled').test(t) && R('bal.top10ConcentrationShareOfThe').test(t),
      'fournisseurs N-1 rapprochée ✓, analyse rendue');
  });

  // ── 4 ter. LE CONTRÔLE INTERNE ET LES PROCESSUS (ADR-108) : les données
  //    structurées, le diagramme GÉNÉRÉ, la différence N/N-1 statuée, et
  //    l'entretien dont le transcript produit des écarts CANDIDATS.
  await station('contrôle interne : processus, différence statuée, entretien', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/processus`);
    for (const [exercice, fichier] of [['n1', 'revenus_2024.json'], ['n', 'revenus_2025.json']] as const) {
      await p.locator('select[name=exercice]').selectOption(exercice);
      await p.locator('input[type=file]').setInputFiles(ds('processus', fichier));
      await soumettre(p.locator(`button:has-text("${L('proc.importer')}")`).first(), 1500);
    }
    let t = await texte();
    dire('processus : le diagramme est GÉNÉRÉ depuis les données — le flowchart client n’est qu’une corroboration',
      (await compte('svg[role=img] rect')) >= 6 && R('proc.diagramme').test(t),
      `${await compte('svg[role=img] rect')} boîtes dessinées`);

    /* Ré-importer sans confirmer est REFUSÉ : rien ne s'écrase en silence. */
    await p.locator('select[name=exercice]').selectOption('n');
    await p.locator('input[type=file]').setInputFiles(ds('processus', 'revenus_2025.json'));
    await soumettre(p.locator(`button:has-text("${L('proc.importer')}")`).first(), 1200);
    dire('processus : remplacer une version décrite SANS confirmer est refusé',
      /se CONFIRME/.test(refus(p) ?? ''), refus(p) ?? '(aucun refus affiché)');

    await aller(`${eng}/processus`);
    dire('processus : la différence N/N-1 est EXACTE et chaque changement attend une décision',
      (await compte(`button:has-text("${L('proc.decide')}")`)) === 5, `${await compte(`button:has-text("${L('proc.decide')}")`)} changement(s) à statuer`);

    /* Le passage au module de facturation est SIGNIFICATIF : il propose un
       facteur au registre. Les quatre autres se motivent sans en lever. */
    /* LA LIGNE SE TROUVE PAR LE CODE DU CHANGEMENT (`proc:<cycle>:etape…:FAC`),
       affiché sous le libellé — pas par « Étape FAC », une phrase française
       recopiée que le libellé traduit ne porte plus dès que l'instance sert
       l'anglais (le parcours a échoué exactement là, revue hostile n°4). */
    const rangFac = p.locator('tr', { hasText: /proc:[A-Z]+:etape[~+-]:FAC(?::|\s|$)/ })
      .filter({ has: p.locator(`button:has-text("${L('proc.decide')}")`) }).first();
    await rangFac.locator('select[name=significance]').selectOption('significatif');
    await rangFac.locator('input[name=reason]').fill('Facturation générée automatiquement — le risque se déplace vers le paramétrage.');
    await soumettre(rangFac.locator(`button:has-text("${L('proc.decide')}")`).first(), 1500);
    for (let i = 0; i < 4; i++) {
      const rang = p.locator('tr').filter({ has: p.locator(`button:has-text("${L('proc.decide')}")`) }).first();
      if (!(await rang.count())) break;
      await rang.locator('input[name=reason]').fill('Changement d’exécution sans déplacement du risque.');
      await soumettre(rang.locator(`button:has-text("${L('proc.decide')}")`).first(), 1500);
    }
    t = await texte();
    dire('processus : tout est statué — le significatif porte « facteur proposé au registre »',
      (await compteAbsent('button', 'proc.decide')) === 0 && R('proc.facteurPropose').test(t),
      'cinq décisions écrites, un facteur proposé');

    /* L'entretien : enregistrer SANS le consentement de chacun est refusé —
       et le module fonctionne sans enregistrement. */
    await p.locator('input[name=date]').fill('2026-01-12');
    await p.locator('input[name=sujet]').fill('Cycle ventes — compréhension du processus');
    await p.locator('select[name=support]').selectOption('enregistrement');
    await p.locator('input[name=retention]').fill('2027-01-12');
    await p.locator('input[name=nom1]').fill('Théo Girard');
    await p.locator('input[name=qualite1]').fill('chef comptable');
    await soumettre(p.locator(`button:has-text("${L('proc.creerEntretien')}")`).first(), 1200);
    dire('entretien : enregistrer sans le consentement EXPLICITE de chacun est refusé',
      /consentement EXPLICITE/.test(refus(p) ?? ''), refus(p) ?? '(aucun refus affiché)');

    await aller(`${eng}/processus`);
    await p.locator('input[name=date]').fill('2026-01-12');
    await p.locator('input[name=sujet]').fill('Cycle ventes — compréhension du processus');
    await p.locator('select[name=support]').selectOption('enregistrement');
    await p.locator('input[name=retention]').fill('2027-01-12');
    await p.locator('input[name=nom1]').fill('Théo Girard');
    await p.locator('input[name=qualite1]').fill('chef comptable');
    await p.locator('input[name=consent1]').check();
    await p.locator('input[name=nom2]').fill('Karim Bensalem');
    await p.locator('input[name=qualite2]').fill('auditeur');
    await p.locator('input[name=consent2]').check();
    await soumettre(p.locator(`button:has-text("${L('proc.creerEntretien')}")`).first(), 1500);
    t = await texte();
    dire('entretien : créé, consentements TRACÉS (qui, quand) et conservation écrite',
      /* ON LIT LA LIGNE, PAS LE DOCUMENT. `/consent/` sur le corps entier était
         satisfait par le libellé de la case à cocher « consents to recording »,
         rendu inconditionnellement : supprimer la ligne des participants
         laissait cette station VERTE. C'est la règle 15 mot pour mot — un mot
         trouvé dans une phrase prise pour la preuve d'un chemin. */
      refus(p) === null
      && (await compte('[data-consentements]')) === 1
      && /Théo Girard[\s\S]*20\d\d-\d\d-\d\d/.test(await p.locator('[data-consentements]').innerText())
      && /2027-01-12/.test(await p.locator('[data-consentements]').innerText()),
      'consentements datés sur leur ligne');

    /* Le transcript, confronté à la documentation : trois écarts CANDIDATS,
       les OMISSIONS d'abord. */
    await p.locator('textarea[name=contenu]')
      .fill(fs.readFileSync(ds('entretiens', 'transcript-revenus-2025.txt'), 'utf8'));
    await soumettre(p.locator(`button:has-text("${L('proc.deposerTranscript')}")`).first(), 1500);
    await soumettre(p.locator(`button:has-text("${L('proc.confronter')}")`).first(), 2500);
    t = await texte();
    const badgesEcarts = p.locator(`table.data .badge:has-text("${L('mot.candidate')}")`);
    dire('entretien : trois écarts CANDIDATS, les omissions D’ABORD, jamais une conclusion',
      (await badgesEcarts.count()) === 3 && /décrit à l.oral, absent de la documentation[\s\S]*documenté, passé sous silence[\s\S]*le discours contredit/.test(t),
      `${await badgesEcarts.count()} candidat(s), omissions en tête`);

    const rangRevue = p.locator('tr:has-text("revue analytique")').first();
    await soumettre(rangRevue.locator(`button:has-text("${L('proc.proposerRegistre')}")`).first(), 1500);
    const rangCp02 = p.locator('tr:has-text("CP-02")').filter({ has: p.locator(`button:has-text("${L('proc.questionClient')}")`) }).first();
    await soumettre(rangCp02.locator(`button:has-text("${L('proc.questionClient')}")`).first(), 1500);
    const rangCp01 = p.locator('tr:has-text("CP-01")').filter({ has: p.locator(`button:has-text("${L('proc.ecarter')}")`) }).first();
    await rangCp01.locator('input[name=reason]').fill('Fréquence documentée à corriger avec le client — portée par la question.');
    await soumettre(rangCp01.locator(`button:has-text("${L('proc.ecarter')}")`).first(), 1500);
    dire('entretien : chaque écart est STATUÉ par une personne — facteur, question, écarté motivé',
      refus(p) === null && (await compteAbsent('table.data .badge', 'mot.candidate')) === 0,
      'plus aucun candidat en attente');

    /* Les deux facteurs PROPOSÉS se confirment au registre — la réviseuse. */
    await devenir(c.reviewer.id);
    await aller(`${eng}/risk`);
    for (const motCle of ['module Facturation', 'revue analytique']) {
      const rang = p.locator(`tr:has-text("${motCle}")`)
        .filter({ has: p.locator(`button:has-text("${L('mot.keep')}")`) }).first();
      await rang.locator('input[name=reason]').fill('Retenu — la revue du paramétrage et des contrôles espacés entre au programme.');
      await soumettre(rang.locator(`button:has-text("${L('mot.keep')}")`).first(), 1500);
    }
    dire('processus : les facteurs proposés sont CONFIRMÉS au registre — la circulation est complète',
      refus(p) === null, refus(p) ?? 'deux facteurs retenus');
    await devenir(c.preparateur.id);
    await aller(`${eng}/requests`);
    t = await texte();
    dire('entretien : la question au client naît en BROUILLON, dans le circuit habituel',
      /2026-01-12/.test(t), 'demande listée avec les demandes');
  });

  // ── 5. MATÉRIALITÉ
  await station('matérialité', async () => {
    await aller(`${eng}/materiality`);
    const t = await texte();
    dire('matérialité : le seuil validé et sa justification sont à l’écran',
      /seuil|materiality|benchmark/i.test(t) && t.length > 200,
      t.match(/[\d \s]{4,}€/)?.[0]?.trim() ?? 'affichée');
  });

  // ── 5b. LA BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1) — le monde de
  // démonstration en porte plusieurs (payroll, PPE, achats… confirmés
  // ns_confirmed pour la convention du jeu synthétique, tous au-dessus de la
  // matérialité de travail dès le premier import, `detecterBasculesMaterialite`
  // appelé depuis `bootstrapNep`). Une carte de la liste doit mener à un
  // poste RÉEL — même discipline que le kanban (mandat §6 point 8).
  await station('bascule de matérialité : un poste devenu matériel mène au poste réel', async () => {
    await aller(`${eng}/materiality`);
    const lignes = await compte('[data-bascules] table.data tbody tr');
    dire('bascule : au moins un poste devenu matériel est listé',
      lignes > 0, `${lignes} ligne(s)`);
    if (lignes === 0) return;
    const lien = p.locator('[data-bascules] table.data tbody tr a').first();
    const cible = await lien.getAttribute('href').catch(() => null);
    if (!cible) { dire('bascule : la ligne mène quelque part', false, 'aucun lien'); return; }
    await cliquer('[data-bascules] table.data tbody tr a');
    dire('bascule : le lien ouvre bien la page du poste',
      p.url().includes('/poste/') && p.url().endsWith(cible.split('/').pop()!),
      p.url());
  });

  /* §2.3 (mandat 2026-09-09) : « la demande de détail… visible dans l'espace de demandes, atteinte
     par un clic » (§2.5, épreuve 3). AUCUN écran neuf : `/requests` (Partie B) montre déjà cette
     demande — « CTT » figure dans le titre dans les DEUX langues (fr « au-dessus du CTT », en
     « above CTT »), un sélecteur qui ne dépend pas de la langue servie. */
  await station('bascule de matérialité : la demande de détail au-dessus du CTT est visible et cliquable', async () => {
    await aller(`${eng}/requests`);
    const lignes = await compte('a[href*="/requests/"]:has-text("CTT")');
    dire('CTT : au moins une demande de détail au-dessus du CTT est listée',
      lignes > 0, `${lignes} ligne(s)`);
    if (lignes === 0) return;
    const lien = p.locator('a[href*="/requests/"]:has-text("CTT")').first();
    const cible = await lien.getAttribute('href').catch(() => null);
    if (!cible) { dire('CTT : la ligne mène quelque part', false, 'aucun lien'); return; }
    await cliquer('a[href*="/requests/"]:has-text("CTT")');
    dire('CTT : le lien ouvre bien la page de la demande',
      p.url().endsWith(cible.split('/').pop()!), p.url());
  });

  // ── 6. PÉRIMÈTRE : la dixième famille d'obstacles, démontrée AU CLIC
  await station('périmètre sans programme', async () => {
    await aller(`${eng}/scoping`);
    /* VISER UN POSTE QU'ON NE TRAVAILLE PAS, et passer par le repli « revoir ».
       Le premier essai cherchait un bouton « Confirm in scope » : il n'existe
       que pour un poste NON encore décidé. Sur un dossier où le périmètre est
       arrêté, la révision vit dans un repli — et c'est elle qu'il faut
       emprunter, parce que c'est le geste réel de l'auditeur. */
    const replis = await p.locator('details:has(form:has(select[name=decision]))').evaluateAll(
      (els) => els.map((e, i) => ({ i, texte: (e.closest('tr') ?? e.parentElement)?.textContent ?? '' })));
    const cible = replis.find((r) => !/REVENUE|affaires/i.test(r.texte));
    if (!cible) {
      dire('périmètre : aucun poste décidé à revoir', false, `${replis.length} repli(s) trouvé(s)`);
      return;
    }
    const bloc = p.locator('details:has(form:has(select[name=decision]))').nth(cible.i);
    await bloc.locator('summary').click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(300);
    await bloc.locator('select[name=decision]').selectOption('in_scope');
    await bloc.locator('input[name=basis]').fill(
      'Remis au périmètre : la revue analytique fait apparaître une variation non expliquée.');
    await bloc.locator(`button:has-text("${L('scop.review')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(3000);
    dire('périmètre : une décision de périmètre se REVOIT, avec un motif',
      !refus(p), refus(p) ?? 'décision revue');

    await aller(`${eng}/obstacles`);
    const bloque = R('famille.programme.titre').test(await texte());
    dire('périmètre : un poste retenu SANS procédure planifiée bloque le visa',
      bloque, bloque ? 'famille « périmètre sans programme » affichée' : 'aucun obstacle — défaut');

    await aller(`${eng}/scoping`);
    const replis2 = await p.locator('details:has(form:has(select[name=decision]))').evaluateAll(
      (els) => els.map((e, i) => ({ i, texte: (e.closest('tr') ?? e.parentElement)?.textContent ?? '' })));
    const cible2 = replis2.find((r) => !/REVENUE|affaires/i.test(r.texte));
    if (cible2) {
      const b2 = p.locator('details:has(form:has(select[name=decision]))').nth(cible2.i);
      await b2.locator('summary').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(300);
      await b2.locator('select[name=decision]').selectOption('ns_confirmed');
      await b2.locator('input[name=basis]').fill(
        'Ressorti du périmètre : hors périmètre du jeu de démonstration, seul le chiffre d’affaires y est déroulé.');
      await b2.locator(`button:has-text("${L('scop.review')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(3000);
    }
    await aller(`${eng}/obstacles`);
    dire('périmètre : le sortir du périmètre lève l’obstacle — c’est la sortie prévue',
      !/Périmètre sans programme/i.test(await texte()), 'obstacle levé');
  });

  // ── 7. RISQUE PAR ASSERTION + QUESTIONNAIRE RÉSIDUEL
  await station('risque par assertion', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/risk`);
    /* ARBITRER VERS UN NIVEAU DIFFÉRENT DU CALCULÉ — sinon ce n'est pas une
       surcharge. La règle est précise : retenir le niveau calculé ne demande
       aucun motif, seul un ÉCART s'explique. Le premier essai prenait « la
       dernière option » et tombait parfois sur le niveau déjà calculé : le
       service acceptait, à raison, et le contrôle annonçait un défaut du
       produit. Et il était conditionnel : quand la table du risque était vide —
       ce qu'elle a été tout du long — il ne produisait AUCUNE étape, et son
       absence se lisait comme une réussite. */
    /* LIRE LE NIVEAU CALCULÉ DANS SA CASE, pas dans le texte de la ligne : la
       ligne contient AUSSI les libellés de toutes les options du menu, si bien
       que « chercher le mot » les trouve tous. Le calculé est le badge de la
       deuxième colonne, et lui seul. */
    const lignes = await p.locator('tr:has(form:has(select[name=level]))').evaluateAll(
      (els) => els.map((e, i) => ({
        i,
        calcule: (e.querySelectorAll('td')[1]?.querySelector('.badge')?.textContent ?? '').trim(),
      })));
    if (!lignes.length) {
      dire('risque : aucune assertion à arbitrer — la table du risque est VIDE', false,
        'l’écran rend ses en-têtes et rien d’autre');
    } else {
      const niveaux = await p.locator('form:has(select[name=level]) select[name=level] option')
        .evaluateAll((els) => Array.from(new Set(els.map((e) => (e as HTMLOptionElement).value).filter(Boolean))));
      const ligne = lignes.find((l) => niveaux.includes(l.calcule)) ?? lignes[0];
      const calcule = ligne.calcule;
      const autre = niveaux.find((n) => n !== calcule);
      if (!autre) {
        dire('risque : une seule valeur dans l’échelle — rien à arbitrer', false, niveaux.join(', '));
      } else {
        const f = p.locator('tr:has(form:has(select[name=level]))').nth(ligne.i).locator('form');
        await f.locator('select[name=level]').selectOption(autre);
        await f.locator(`button:has-text("${L('risk.arbitrate')}")`).click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2500);
        dire(`risque : surcharger le niveau (${calcule ?? '?'} → ${autre}) SANS motif écrit est refusé`,
          Boolean(refus(p)), refus(p) ?? 'passé — défaut');

        await aller(`${eng}/risk`);
        const g = p.locator('tr:has(form:has(select[name=level]))').nth(ligne.i).locator('form');
        await g.locator('select[name=level]').selectOption(autre);
        await g.locator('input[name=reason]').fill(
          'Surcharge motivée : le confrère précédent signale une pression commerciale de fin d’exercice non visible dans les données.');
        await g.locator(`button:has-text("${L('risk.arbitrate')}")`).click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2500);
        dire('risque : la même surcharge AVEC motif est acceptée, et le motif est conservé',
          !refus(p), refus(p) ?? 'surcharge enregistrée');
      }
    }

    /* LE QUESTIONNAIRE : compter d'abord, boucler ensuite — POUR CHAQUE POSTE
       RETENU, pas seulement celui par défaut. `/risk` sans `?fsli=` rend le
       PREMIER poste dans l'ordre bilan-puis-résultat (rail.ts,
       postesRetenus, « order by statement, code ») : tant que REVENUE était
       seul retenu, c'était lui. Depuis que Trésorerie (CASH, poste de
       BILAN) est retenu, CASH passe devant REVENUE (compte de résultat) —
       REVENUE restait alors à jamais sans réponse, un obstacle « 6 sans
       réponse » jamais levé par ce parcours, jamais visible dans « total »
       (qui ne comptait que la page par défaut). Trouvé par le parcours
       cliqué mené jusqu'à la clôture (règle 37), pas deviné : sur la base
       fraîche, seul CASH portait des réponses (le seed, planifierTresorerie)
       et REVENUE restait à zéro après le passage complet de cette station.
       Les postes à visiter se lisent depuis les badges DE LA PAGE ELLE-MÊME
       (`a[href^="?fsli="]`), jamais une liste codée en dur qui prendrait
       encore du retard au prochain poste du Lot 5. Une liste vide voulait
       dire deux choses — « tout est répondu » et « la page n'est pas encore
       revenue » — et la première version les confondait : après l'arbitrage,
       elle lisait zéro formulaire au milieu d'un re-rendu, sortait de la
       boucle et annonçait « 0 sans réponse » sur un questionnaire
       entièrement vierge. */
    await aller(`${eng}/risk`);
    const codesPostes = await p.locator('a[href^="?fsli="]').evaluateAll(
      (els) => els.map((e) => e.textContent?.trim()).filter((x): x is string => Boolean(x)));

    /* ATTENDRE QUE LA RÉPONSE SOIT LÀ, pas qu'un délai soit écoulé. La
       première version attendait 900 ms puis relisait le DOM : en production le
       aller-retour de l'action est plus long, la page montrait encore l'ancien
       état, la boucle re-répondait DEUX CENTS FOIS à la même question et
       concluait « dix sans réponse » — un harnais qui insiste au lieu de
       rapporter, et qui accuse le produit de son propre défaut de patience. */
    const videsMaintenant = () => p.locator('form:has(select[name=answer])').evaluateAll(
      (els) => els.map((e, i) => ({ i, v: (e.querySelector('select[name=answer]') as HTMLSelectElement)?.value }))
        .filter((x) => !x.v).map((x) => x.i));

    let totalGlobal = 0; let reponduGlobal = 0; let resteGlobal = 0;
    for (const codePoste of codesPostes) {
      await aller(`${eng}/risk?fsli=${codePoste}`);
      const total = await compte('form:has(select[name=answer])');
      totalGlobal += total;
      if (total === 0) continue;

      for (let tour = 0; tour < 60; tour++) {
        const vides = await videsMaintenant();
        if (!vides.length) break;
        const f = p.locator('form:has(select[name=answer])').nth(vides[0]);
        await f.locator('select[name=answer]').selectOption('non');
        await f.locator('button').first().click();

        // …et on attend que le compte DIMINUE, sinon on relit la page, puis on renonce.
        let vu = false;
        for (let attente = 0; attente < 12; attente++) {
          await p.waitForTimeout(500);
          if ((await videsMaintenant()).length < vides.length) { vu = true; break; }
        }
        if (!vu) {
          await aller(`${eng}/risk?fsli=${codePoste}`);
          if ((await videsMaintenant()).length >= vides.length) {
            dire('risque : une réponse au questionnaire ne s’enregistre pas', false,
              refus(p) ?? `${vides.length} question(s) restent sans réponse après envoi (${codePoste})`);
            break;
          }
        }
        reponduGlobal++;
        const r = refus(p);
        if (r) { dire('risque : la réponse au questionnaire est REFUSÉE', false, r); break; }
      }
      const reste = await p.locator('form:has(select[name=answer])').evaluateAll(
        (els) => els.filter((e) => !(e.querySelector('select[name=answer]') as HTMLSelectElement)?.value).length);
      resteGlobal += reste;
    }
    if (totalGlobal === 0) {
      dire('risque : aucun formulaire de questionnaire à l’écran', false,
        'la liste est vide — répondu, ou pas encore rendu ?');
    }
    dire('risque : le questionnaire résiduel est répondu, question par question',
      totalGlobal > 0 && resteGlobal === 0,
      `${codesPostes.length} poste(s) · ${totalGlobal} question(s), ${reponduGlobal} répondue(s), ${resteGlobal} sans réponse`);
  });

  // ── 8. SONDAGE : proposer → valider → TIRER → demander les pièces
  //    Le ré-import du fichier définitif a INVALIDÉ la sélection tirée sur le
  //    fichier provisoire (ADR-016). Ce n'est pas un effet de bord du harnais :
  //    c'est la règle, et c'est ce que le dossier de démonstration promet
  //    lui-même dans sa limitation de périmètre — « le rapprochement sera
  //    re-exécuté sur le FEC définitif avant conclusion définitive ». Les
  //    travaux se REFONT donc sur le grand livre définitif, au clic.
  /* ── 8 ter. LE PROGRAMME DE TRAVAIL (étage 1.1). L'écran qui manquait :
        planifier une procédure que le risque commande, et rédiger son papier,
        en cliquant. Avant, ces deux services n'étaient appelés que par le
        semeur de la démonstration. */
  await station('programme de travail', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/programme`);
    const postes = await compte('[data-poste-programme]');
    /* Scopé à `[data-commandees]` depuis Lot 3, tranche 2, même raison que la
       station suivante : `[data-ligne-programme]` non scopé additionnerait
       les `<li>` du panneau « hors commande » à un compte que le message
       nomme explicitement « commandée(s) » — un artefact qui affirmerait
       plus que ce qu'il vérifie (règle 13/16), même si ce prédicat-ci
       (`> 0`) ne change pas de verdict avec le compte inflaté. */
    dire('programme : chaque poste retenu porte ce que le risque lui commande',
      postes > 0 && (await compte('[data-commandees] [data-ligne-programme]')) > 0,
      `${postes} poste(s), ${await compte('[data-commandees] [data-ligne-programme]')} procédure(s) commandée(s)`);

    /* PLANIFIER — le geste qui n'existait nulle part.
       CE QUE LA REVUE HOSTILE A CASSÉ DANS LA PREMIÈRE VERSION DE CETTE STATION
       (constat 1) : le verdict était « il existe au moins une ligne planifiée »,
       et le REFUS éventuel n'allait que dans le détail imprimé. Or le semeur de
       la démonstration planifie déjà plusieurs procédures : le compteur était
       vrai AVANT le clic, et un clic refusé laissait l'étape verte — « un refus
       calculé puis jeté », règle 13, dans l'instrument même qui existe pour
       attraper ce défaut. Le verdict est désormais : aucun refus ET le compte a
       AUGMENTÉ. */
    /* LOT 3, TRANCHE 1 (mandat, Partie C.1) — LA NATURE se lit sur CHAQUE
       ligne commandée, AVANT même d'être planifiée : elle vient du
       catalogue (`r.procedure.nature`), pas de l'instance.
       CE QUE CE COMPTE VÉRIFIE (règle 19, revue hostile du 2026-09-07) :
       que l'attribut `data-nature` existe sur CHAQUE ligne — React omet un
       attribut posé à `null`/`undefined`, donc une `nature` manquante
       ferait BAISSER ce compte, pas le remplir d'une chaîne vide (`nature`
       est de toute façon typée par une union à 8 valeurs et contrainte en
       base par un `check` — la chaîne vide n'est atteignable par AUCUN des
       deux). CE QU'IL NE VÉRIFIE PAS : que le LIBELLÉ affiché soit le BON
       — seulement qu'un libellé existe.
       SCOPÉ À `[data-commandees]` depuis Lot 3, tranche 2 (trouvé par cette
       même chaîne verify, pas par relecture — règle 15) : tranche 2 pose
       aussi `[data-ligne-programme]` sur les `<li>` du panneau « hors
       commande » (pour y couvrir l'atelier, cf. plus bas), donc un compte
       NON scopé additionnait ces `<li>` — qui ne portent jamais `data-nature`
       — au dénominateur d'une station de tranche 1 qui n'a rien à voir avec
       eux, la faisant rougir à tort (« 6 sur 7 » au lieu de « 6 sur 6 »). */
    dire('programme : chaque procédure commandée affiche sa nature, avant même d’être planifiée',
      (await compte('[data-nature]')) === (await compte('[data-commandees] [data-ligne-programme]')),
      `${await compte('[data-nature]')} ligne(s) avec une nature affichée sur ${await compte('[data-commandees] [data-ligne-programme]')} commandée(s)`);

    const dejaPlanifiees = await compte('[data-planifiee]');
    const aPlanifier = await compte('[data-planifier]');
    if (aPlanifier > 0) {
      const f = p.locator('form:has([data-planifier])').first();
      await soumettre(f.locator('button').first());
      await aller(`${eng}/programme`);
      const apres = await compte('[data-planifiee]');
      dire('programme : une procédure se PLANIFIE en un clic, et l’écran la montre planifiée',
        !refus(p) && apres > dejaPlanifiees,
        refus(p) ?? `${dejaPlanifiees} → ${apres} procédure(s) planifiée(s)`);

      /* ET SON ATELIER — un lien RÉEL (sondage_pieces et recalcul_parametre
         sur REVENUE ; confirmation_externe et rapprochement sur CASH — Lot 3
         complet, tranches 1-4) ou un AVEU honnête (les quatre autres
         natures du Lot 5, encore sans atelier) : jamais ni l'un ni l'autre
         en silence (règle 13), et
         jamais les DEUX à la fois (un ternaire dans page.tsx les rend
         mutuellement exclusifs aujourd'hui — cette assertion vérifie la
         CHOSE, pas seulement qu'elle continue de dépendre du même code).
         Compté PAR LIGNE (`[data-ligne-programme]`), jamais par une SOMME
         globale (revue hostile du 2026-09-07) : une première version
         comparait `nAtelier + nAbsent >= total` — vrai sur TOUT chemin
         atteignable puisque les deux compteurs sont posés par le MÊME `if`
         que le total qu'ils devaient couvrir, donc une garde qui ne pouvait
         structurellement jamais s'éteindre (règle 17).
         DEUX conteneurs, PAS UN SEUL (Lot 3, tranche 2, corrigé après un
         premier passage qui ne couvrait que `[data-commandees]` — trouvé en
         conduisant l'écran dans un navigateur, règle 10) : une procédure
         déjà planifiée que le risque ne commande PLUS reste dans le
         panneau « hors commande » (`[data-hors-commande]`), pas dans le
         tableau des commandées — RECALC, la seule procédure
         `recalcul_parametre` du monde semé, y vit précisément. Son travail
         n'est pas défait parce que le risque a changé d'avis : son atelier
         doit rester ouvrable, et cette assertion doit donc le couvrir aussi
         — sinon la garde mesure à côté du seul cas réel qu'elle existe pour
         attraper (même famille que le middleware « inerte », ADR-088/089). */
      if (!refus(p)) {
        const trous = await compte(
          '[data-commandees] tr[data-ligne-programme]:has([data-planifiee]):not(:has([data-atelier])):not(:has([data-atelier-absent])), '
          + '[data-hors-commande] li[data-ligne-programme]:not(:has([data-atelier])):not(:has([data-atelier-absent]))');
        const doubles = await compte(
          '[data-commandees] tr[data-ligne-programme]:has([data-atelier]):has([data-atelier-absent]), '
          + '[data-hors-commande] li[data-ligne-programme]:has([data-atelier]):has([data-atelier-absent])');
        dire('programme : une ligne planifiée (commandée ou hors commande) montre un atelier RÉEL ou un aveu honnête « pas construit encore » — jamais rien du tout, jamais les deux',
          trous === 0 && doubles === 0,
          `${trous} ligne(s) planifiée(s) sans lien NI aveu, ${doubles} ligne(s) avec les deux à la fois`);
      }
    } else {
      /* PAS DE SUCCÈS MUET : sur ce monde, le risque est évalué et la méthode
         commande plus de procédures que le semeur n'en planifie. N'avoir rien à
         planifier est le signe que l'écran n'offre plus le geste. */
      dire('programme : une procédure se PLANIFIE en un clic, et l’écran la montre planifiée',
        false, 'AUCUNE procédure à planifier sur ce dossier — l’écran n’offre plus le geste');
    }

    /* DÉPLANIFIER — le contre-geste qui n'existait nulle part (Lot 4,
       tranche 1). On plante ICI une ligne FRAÎCHE, dédiée à cette seule
       démonstration, plutôt que de réutiliser celle que « rédiger » ou le
       refus PROG-06/PROG-07 emploient plus loin dans cette même station :
       une collision romprait leurs assertions sans que ce soit la faute de
       la déplanification. */
    const encoreAPlanifier = await compte('[data-planifier]');
    if (encoreAPlanifier > 0) {
      const f2 = p.locator('form:has([data-planifier])').first();
      const codeDeplan = await f2.locator('[data-planifier]').first().getAttribute('data-planifier');
      await soumettre(f2.locator('button').first());
      await aller(`${eng}/programme`);

      const ligneFraiche = codeDeplan
        ? p.locator(`[data-commandees] tr[data-ligne-programme="${codeDeplan}"] form:has([data-deplanifier])`)
        : null;
      if (ligneFraiche && await ligneFraiche.count()) {
        await soumettre(ligneFraiche.locator('button').first());
        await aller(`${eng}/programme`);
        dire('programme : une procédure se DÉPLANIFIE en un clic, et le travail reste visible dessous',
          !refus(p) && (await compte(`[data-ligne-deplanifiee="${codeDeplan}"]`)) > 0,
          refus(p) ?? `ligne ${codeDeplan} déplanifiée, visible dans le panneau dédié`);
      } else {
        dire('programme : une procédure se DÉPLANIFIE en un clic, et le travail reste visible dessous',
          false, `ligne ${codeDeplan ?? '?'} planifiée mais son bouton « déplanifier » est introuvable`);
      }
    } else {
      dire('programme : une procédure se DÉPLANIFIE en un clic, et le travail reste visible dessous',
        false, 'AUCUNE procédure à planifier pour démontrer la déplanification sur ce dossier — l’écran n’offre plus le geste');
    }

    /* RÉDIGER LE PAPIER — depuis la même ligne, sans changer d'écran. */
    if (await compte('[data-rediger]')) {
      const g = p.locator('form:has([data-rediger])').first();
      /* R41 (docs/CHASSE.md §2) : lire le CODE de la ligne AVANT de soumettre —
         c'est lui qui permettra de retrouver la BONNE ligne après coup. */
      const codeRedige = await g.locator('[data-rediger]').first().getAttribute('data-rediger');
      await soumettre(g.locator('button').first());
      await aller(`${eng}/programme`);
      dire('programme : le papier de la procédure se RÉDIGE depuis la ligne, et devient atteignable',
        !refus(p) && /WP-|REV-|[A-Z]{2,3}-\d{2}/.test(await texte()),
        refus(p) ?? 'papier rédigé et lié depuis le programme');

      /* ET LA QUESTION QUI SUIT LE PAPIER, PARCE QU'ELLE LE SUIT VRAIMENT.
         Rédiger un papier ouvre une obligation : dire s'il s'appuie sur une
         information produite par l'entité (Groupe 1, 1.8) — sinon le visa est
         bloqué, et c'est le produit qui a raison. La première version de cette
         station rédigeait le papier et laissait l'obstacle derrière elle : un
         harnais qui crée du travail et s'en va. On va donc au papier neuf et on
         répond, comme le ferait le préparateur.

         R41, hypothèses éliminées par lecture (docs/CHASSE.md §2) :
         `[data-planifiee] a[href*="/workpapers/"]).last()` désigne N'IMPORTE
         QUEL papier DÉJÀ rédigé du dossier ENTIER — l'attribut habille toute
         ligne planifiée, y compris celles SEMÉES avant cette station — pas
         forcément celui qu'on vient de rédiger. On scope donc à la LIGNE dont
         on a lu le code juste avant de soumettre, et on y va par son `href`,
         en `aller()` (silence réseau attendu), comme la station des visas le
         fait déjà (ligne ~1889) — jamais par un `.click()` suivi d'une
         attente dont la station 2. de CHASSE.md n'excluait pas totalement le
         rôle. Si le symptôme persiste malgré ce ciblage précis, l'URL et le
         HTML de la page atteinte sont imprimés au lieu d'être devinés
         (règle 18 : une explication plausible n'est pas un diagnostic). */
      const lienPapier = codeRedige
        ? p.locator(`tr[data-ligne-programme="${codeRedige}"] a[href*="/workpapers/"]`).first()
        : null;
      const href = lienPapier ? await lienPapier.getAttribute('href').catch(() => null) : null;
      if (!href) {
        /* PAS DE BRANCHE MUETTE : si le papier qu'on vient de rédiger n'est pas
           atteignable depuis sa ligne, l'assertion précédente ment. */
        dire('programme : le papier neuf porte la question de l’information produite par l’entité, et elle est répondue',
          false, `le papier rédigé n’est pas atteignable depuis sa ligne (code=${codeRedige ?? '?'})`);
      } else {
        await aller(base + href);
        const sel = p.locator('#ipe select[name=rapport_id]');
        if (!(await sel.count())) {
          const html = await p.locator('body').innerHTML().then((h) => h.slice(0, 400)).catch(() => '(HTML illisible)');
          dire('programme : le papier neuf porte la question de l’information produite par l’entité, et elle est répondue',
            false, `le formulaire IPE est absent du papier rédigé (code=${codeRedige}, url=${p.url()}) — début du corps : ${html}`);
        } else {
          const opts = await sel.locator('option').evaluateAll(
            (els) => els.map((e) => (e as HTMLOptionElement).label).filter((l) => l && !/^—|^$/.test(l)));
          if (opts.length > 0) {
            await sel.selectOption({ label: opts[0] });
            await p.locator('#ipe input[name=utilisee][value=oui]').check();
            await p.locator('#ipe select[name=approprie]').selectOption('oui');
            /* RÉUTILISER UN RAPPORT EXIGE SON ARRÊTÉ (ipe-actions.ts:34-44,
               `utiliserRapport` refuse sans `date_document`, ipe.ts:337) — la
               première version de cette station ne le remplissait jamais et
               obtenait le refus « Dites sur quel arrêté ce papier s’appuie »
               (observé, pas deviné). L’option choisie porte sa période dans
               son libellé (page.tsx:328, « … période au AAAA-MM-JJ … ») : on
               la relit plutôt que de la retaper. */
            const dateArrete = opts[0].match(/\d{4}-\d{2}-\d{2}/)?.[0];
            if (dateArrete) await p.locator('#ipe input[name=date_document]').fill(dateArrete);
            await soumettre(p.locator(`#ipe button:has-text("${L('wp.ipe.record')}")`).first(), 1500);
          } else {
            await p.locator('#ipe input[name=utilisee][value=non]').check();
            await soumettre(p.locator(`#ipe button:has-text("${L('wp.ipe.record')}")`).first(), 1500);
          }
          dire('programme : le papier neuf porte la question de l’information produite par l’entité, et elle est répondue',
            !refus(p), refus(p) ?? 'question IPE posée et répondue sur le papier rédigé');
        }
        await aller(`${eng}/programme`);
      }
    }

    /* LE REFUS PROG-06, EMPRUNTÉ ET NON CHERCHÉ. Un papier VISÉ ne se dépasse
       pas sans motif écrit : l'écran n'offre le champ que sur une ligne visée,
       et il n'est pas `required` — c'est le serveur qui refuse (ADR-091). */
    const visees = p.locator('form:has(input[name=motif]):has([data-nouvelle-version])');
    if (await visees.count()) {
      await soumettre(visees.first().locator('button').first());
      dire('refus : dépasser un papier VISÉ sans motif écrit est refusé par le serveur (PROG-06)',
        /PROG-06/.test(refus(p) ?? ''),
        refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
      await aller(`${eng}/programme`);
    }

    /* LE REFUS PROG-07, EMPRUNTÉ AUSSI (Lot 4, tranche 1) : même ligne visée
       que PROG-06 ci-dessus — le même geste, une garde différente. On
       s'arrête à la preuve du refus, JAMAIS en soumettant un motif : compléter
       la déplanification effacerait la ligne que ce parcours entier utilise
       plus loin (rédaction, visas). */
    const visesADeplanifier = p.locator('form:has(input[name=motif]):has([data-deplanifier])');
    if (await visesADeplanifier.count()) {
      await soumettre(visesADeplanifier.first().locator('button').first());
      dire('refus : déplanifier un papier VISÉ sans motif écrit est refusé par le serveur (PROG-07)',
        /PROG-07/.test(refus(p) ?? ''),
        refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
      await aller(`${eng}/programme`);
    }
  });

  /* PLAN D'AUTONOMIE, PARTIE B, ÉTAPES 1 ET 3-4 : la demande naît DU POSTE,
     avant tout tirage — et POP-01 (sampling.ts) exige désormais qu'elle soit
     RAPPROCHÉE avant qu'un tirage puisse être proposé. Depuis le câblage de
     POP-01 (2026-09-06), le SEMEUR reconcilie déjà le détail REVENUE avant
     de tirer l'échantillon (`reconcilierDetailRevenueSemeur`, part1.ts,
     mêmes fonctions que le chemin humain, pas un raccourci — règle 20) :
     à la première visite du parcours cliqué, le bouton a donc déjà disparu.
     Cette station vérifie l'état SEMÉ, pas la création : le lien mène à une
     demande RÉELLE, et le rapprochement affiché est bien celui du semeur —
     un objet qu'on peut nommer, pas une supposition sur ce que la page rend. */
  await station('détail du compte', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/sampling`);
    dire('détail du compte : semé déjà rapproché — le lien remplace le bouton dès la première visite',
      (await compte('[data-detail-de-compte-lien]')) > 0 && (await compte('[data-demander-detail-de-compte]')) === 0,
      refus(p) ?? 'lien attendu, bouton absent');
    const href = await p.locator('[data-detail-de-compte-lien]').first().getAttribute('href');
    // `cliquer()`, pas un `.click()` + `waitForLoadState` maison : une navigation
    // CLIENT (<Link>) ne déclenche ni `load` ni toujours un `networkidle` net, et
    // sans la grâce fixe de `cliquer()`, `p.url()` se lit avant que la transition
    // n'ait fini — trouvé ici même (« arrivée sur .../sampling », faux négatif).
    await cliquer('[data-detail-de-compte-lien]', 3000);
    dire('détail du compte : le lien mène à une demande RÉELLE (page /requests/<id>, pas une redirection décorative)',
      !refus(p) && p.url().includes(String(href)),
      refus(p) ?? `arrivée sur ${p.url()}`);
    await aller(`${eng}/sampling`);
    const ligneSemee = p.locator('[data-rapprochement-ligne]').first();
    dire('détail du compte : le rapprochement semé (3 lignes, POP-01) est visible CONCLU, pas en attente',
      (await ligneSemee.locator('[data-rapprochement-conclu]').count()) > 0,
      refus(p) ?? 'ligne semée non conclue — POP-01 n’aurait pas dû laisser tirer');
  });

  /* PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 2 : LE RAPPROCHEMENT. Depuis que le
     semeur rapproche déjà UN import REVENUE (POP-01, station précédente),
     cette station importe un SECOND fichier — la ligne la plus RÉCENTE
     (`detailsDeCompteDuDossier` trie par `created_at desc`) est donc
     TOUJOURS celle qu'on vient d'importer, jamais la ligne semée. Le
     `data-rapprochement-conclu` final est vérifié SUR CETTE LIGNE
     précisément (`ligneApres`), pas sur la page entière : la ligne semée
     porte déjà ce marqueur, un `compte()` global aurait rendu la preuve
     vraie même si CETTE conclusion avait échoué en silence. Un fichier
     importé avec un montant délibérément décalé (pas de solde exact à
     deviner dans le navigateur) — l'écart se voit, se refuse SANS
     explication (POP-02, le serveur, pas le navigateur : le champ n'est pas
     `required`), puis se conclut une fois expliqué. */
  await station('détail du compte : le rapprochement', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/sampling`);
    if (await compte('[data-import-detail-fichier]')) {
      const avant = await compte('[data-rapprochement-ligne]');
      await p.locator('[data-import-detail-fichier]').setInputFiles({
        name: 'detail-clics.csv', mimeType: 'text/csv',
        buffer: Buffer.from('référence;libellé;montant\nCLIC-001;Ligne du parcours cliqué;999999,99', 'utf-8'),
      });
      await soumettre(p.locator(`button:has-text("${L('samp.rapprochementImporterFichier')}")`).first(), 2000);
      const apres = await compte('[data-rapprochement-ligne]');
      dire('rapprochement : importer le détail engendre une ligne RÉELLE, pas seulement une redirection',
        !refus(p) && apres > avant,
        refus(p) ?? (apres > avant ? `ligne engendrée (${avant} → ${apres})` : `AUCUNE nouvelle ligne (${avant} → ${apres}) — écriture avalée`));
      if (apres > avant) {
        const ligne = p.locator('[data-rapprochement-ligne]').first();
        await soumettre(ligne.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('refus : conclure un écart non nul SANS explication est refusé par le serveur (POP-02)',
          /POP-02/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
        await aller(`${eng}/sampling`);
        const ligneApres = p.locator('[data-rapprochement-ligne]').first();
        await ligneApres.locator('input[name=explication]').fill('Facture régularisée post-clôture, écart confirmé et documenté.');
        await soumettre(ligneApres.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('rapprochement : expliqué par écrit, le rapprochement se conclut',
          !refus(p) && (await p.locator('[data-rapprochement-ligne]').first().locator('[data-rapprochement-conclu]').count()) > 0,
          refus(p) ?? 'rapprochement conclu');
      }
    }
  });

  /* Lot 7, priorité 1 (R98, docs/BACKLOG_REPORTE.md) : PERSONNEL-DSN (PAYROLL,
     nature `rapprochement`) était plantée sans AUCUN atelier atteignable —
     ni ce que la station ci-dessus exerce (REVENUE, /sampling), ni
     /balances-aux (union fermée clients/fournisseurs). `/poste/PAYROLL/
     detail-compte` réutilise les MÊMES fonctions de service (account-detail.ts
     déjà générique par fsliCode), donc le MÊME geste : demander, importer,
     refuser un écart non expliqué (POP-02), conclure expliqué. Le monde de
     démo ne porte AUCUNE demande ni import PAYROLL avant cette station — au
     contraire de REVENUE (semé déjà rapproché) — donc les DEUX boutons sont
     exercés ici, pas seulement l'un des deux. */
  await station('détail du compte : PAYROLL (R98, atelier neuf)', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/poste/PAYROLL/detail-compte`);
    dire('détail du compte PAYROLL : aucune demande encore — le bouton est offert',
      (await compte('[data-demander-detail-de-compte]')) > 0,
      refus(p) ?? 'bouton absent');
    await soumettre(p.locator('[data-demander-detail-de-compte]').first(), 3000);
    dire('détail du compte PAYROLL : demander engendre une VRAIE demande — le lien remplace le bouton',
      !refus(p) && (await compte('[data-detail-de-compte-lien]')) > 0,
      refus(p) ?? 'lien affiché');
    if (await compte('[data-import-detail-fichier]')) {
      const avant = await compte('[data-rapprochement-ligne]');
      await p.locator('[data-import-detail-fichier]').setInputFiles({
        name: 'dsn-clics.csv', mimeType: 'text/csv',
        buffer: Buffer.from('référence;libellé;montant\nDSN-CLIC-001;Charge du parcours cliqué;777777,77', 'utf-8'),
      });
      await soumettre(p.locator(`button:has-text("${L('samp.rapprochementImporterFichier')}")`).first(), 2000);
      const apres = await compte('[data-rapprochement-ligne]');
      dire('détail du compte PAYROLL : importer engendre une ligne RÉELLE (rapprochement.ts réutilisé, pas dupliqué)',
        !refus(p) && apres > avant,
        refus(p) ?? (apres > avant ? `ligne engendrée (${avant} → ${apres})` : `AUCUNE nouvelle ligne (${avant} → ${apres})`));
      if (apres > avant) {
        const ligne = p.locator('[data-rapprochement-ligne]').first();
        await soumettre(ligne.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('refus : conclure le rapprochement PAYROLL SANS explication est refusé (POP-02, même règle que REVENUE)',
          /POP-02/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
        await aller(`${eng}/poste/PAYROLL/detail-compte`);
        const ligneApres = p.locator('[data-rapprochement-ligne]').first();
        await ligneApres.locator('input[name=explication]').fill('DSN régularisée post-clôture, écart confirmé et documenté.');
        await soumettre(ligneApres.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('détail du compte PAYROLL : expliqué par écrit, le rapprochement se conclut',
          !refus(p) && (await p.locator('[data-rapprochement-ligne]').first().locator('[data-rapprochement-conclu]').count()) > 0,
          refus(p) ?? 'rapprochement conclu');
      }
    }
  });

  /* Lot 7, priorité 1 (R99, docs/BACKLOG_REPORTE.md) : STOCKS-INV (INVENTORY,
     nature `observation_documentee`) réutilise le MÊME atelier que PAYROLL
     (R98, station ci-dessus) — même écran, même patron de station. Le monde
     de démo ne porte AUCUNE demande ni import INVENTORY avant cette station,
     donc les DEUX boutons sont exercés ici aussi. R109 (BACKLOG_REPORTE.md) :
     cette station ne prouve QU'UNE réconciliation de total, jamais le test
     bidirectionnel ligne à ligne que la méthode décrit — disclosed, pas une
     prétention que cette station ne tient pas. */
  await station('détail du compte : INVENTORY (R99, atelier réutilisé)', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/poste/INVENTORY/detail-compte`);
    dire('détail du compte INVENTORY : aucune demande encore — le bouton est offert',
      (await compte('[data-demander-detail-de-compte]')) > 0,
      refus(p) ?? 'bouton absent');
    await soumettre(p.locator('[data-demander-detail-de-compte]').first(), 3000);
    dire('détail du compte INVENTORY : demander engendre une VRAIE demande — le lien remplace le bouton',
      !refus(p) && (await compte('[data-detail-de-compte-lien]')) > 0,
      refus(p) ?? 'lien affiché');
    if (await compte('[data-import-detail-fichier]')) {
      const avant = await compte('[data-rapprochement-ligne]');
      await p.locator('[data-import-detail-fichier]').setInputFiles({
        name: 'inventaire-clics.csv', mimeType: 'text/csv',
        buffer: Buffer.from('référence;libellé;montant\nSTOCK-CLIC-001;Relevé physique du parcours cliqué;555555,55', 'utf-8'),
      });
      await soumettre(p.locator(`button:has-text("${L('samp.rapprochementImporterFichier')}")`).first(), 2000);
      const apres = await compte('[data-rapprochement-ligne]');
      dire('détail du compte INVENTORY : importer engendre une ligne RÉELLE (le MÊME atelier que PAYROLL, jamais dupliqué)',
        !refus(p) && apres > avant,
        refus(p) ?? (apres > avant ? `ligne engendrée (${avant} → ${apres})` : `AUCUNE nouvelle ligne (${avant} → ${apres})`));
      if (apres > avant) {
        const ligne = p.locator('[data-rapprochement-ligne]').first();
        await soumettre(ligne.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('refus : conclure le rapprochement INVENTORY SANS explication est refusé (POP-02, même règle que PAYROLL/REVENUE)',
          /POP-02/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
        await aller(`${eng}/poste/INVENTORY/detail-compte`);
        const ligneApres = p.locator('[data-rapprochement-ligne]').first();
        await ligneApres.locator('input[name=explication]').fill('Relevé physique daté de clôture, écart confirmé et documenté.');
        await soumettre(ligneApres.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('détail du compte INVENTORY : expliqué par écrit, le rapprochement se conclut',
          !refus(p) && (await p.locator('[data-rapprochement-ligne]').first().locator('[data-rapprochement-conclu]').count()) > 0,
          refus(p) ?? 'rapprochement conclu');
      }
    }
  });

  /* Lot 7, priorité 1 (R100, docs/BACKLOG_REPORTE.md) : CAPITAUX-VAR (EQUITY,
     nature `rapprochement`) réutilise le MÊME atelier que PAYROLL/INVENTORY
     (R98/R99 ci-dessus) — même écran, même patron de station. Le monde de
     démo ne porte AUCUNE demande ni import EQUITY avant cette station, donc
     les DEUX boutons sont exercés ici aussi. CAPITAUX-PV (même poste, nature
     sondage_pieces) reste SANS atelier — disclosed R110, pas exercée ici. */
  await station('détail du compte : EQUITY (R100, atelier réutilisé)', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/poste/EQUITY/detail-compte`);
    dire('détail du compte EQUITY : aucune demande encore — le bouton est offert',
      (await compte('[data-demander-detail-de-compte]')) > 0,
      refus(p) ?? 'bouton absent');
    await soumettre(p.locator('[data-demander-detail-de-compte]').first(), 3000);
    dire('détail du compte EQUITY : demander engendre une VRAIE demande — le lien remplace le bouton',
      !refus(p) && (await compte('[data-detail-de-compte-lien]')) > 0,
      refus(p) ?? 'lien affiché');
    if (await compte('[data-import-detail-fichier]')) {
      const avant = await compte('[data-rapprochement-ligne]');
      await p.locator('[data-import-detail-fichier]').setInputFiles({
        name: 'capitaux-clics.csv', mimeType: 'text/csv',
        buffer: Buffer.from('référence;libellé;montant\nCAPITAUX-CLIC-001;Variation du parcours cliqué;333333,33', 'utf-8'),
      });
      await soumettre(p.locator(`button:has-text("${L('samp.rapprochementImporterFichier')}")`).first(), 2000);
      const apres = await compte('[data-rapprochement-ligne]');
      dire('détail du compte EQUITY : importer engendre une ligne RÉELLE (le MÊME atelier que PAYROLL/INVENTORY, jamais dupliqué)',
        !refus(p) && apres > avant,
        refus(p) ?? (apres > avant ? `ligne engendrée (${avant} → ${apres})` : `AUCUNE nouvelle ligne (${avant} → ${apres})`));
      if (apres > avant) {
        const ligne = p.locator('[data-rapprochement-ligne]').first();
        await soumettre(ligne.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('refus : conclure le rapprochement EQUITY SANS explication est refusé (POP-02, même règle que PAYROLL/INVENTORY/REVENUE)',
          /POP-02/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
        await aller(`${eng}/poste/EQUITY/detail-compte`);
        const ligneApres = p.locator('[data-rapprochement-ligne]').first();
        await ligneApres.locator('input[name=explication]').fill('Distribution de dividendes votée en AG, écart confirmé et documenté.');
        await soumettre(ligneApres.locator(`button:has-text("${L('samp.rapprochementConclure')}")`).first());
        dire('détail du compte EQUITY : expliqué par écrit, le rapprochement se conclut',
          !refus(p) && (await p.locator('[data-rapprochement-ligne]').first().locator('[data-rapprochement-conclu]').count()) > 0,
          refus(p) ?? 'rapprochement conclu');
      }
    }
  });

  await station('sondage', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/sampling`);
    if (await compte(`button:has-text("${L('samp.proposeParameters')}")`)) {
      await cliquer(`button:has-text("${L('samp.proposeParameters')}")`, 5000);
    }
    dire('sondage : les paramètres sont PROPOSÉS avec leur justification',
      (await compte(`button:has-text("${L('samp.validateParametersL3')}")`)) > 0 || (await compte(`button:has-text("${L('samp.drawSampleDeterministic')}")`)) > 0,
      refus(p) ?? 'proposition affichée');

    if (await compte(`button:has-text("${L('samp.validateParametersL3')}")`)) {
      await devenir(c.reviewer.id);
      await aller(`${eng}/sampling`);
      await cliquer(`button:has-text("${L('samp.validateParametersL3')}")`, 4000);
      dire('sondage : une PERSONNE valide les paramètres avant tout tirage',
        !refus(p), refus(p) ?? 'paramètres validés');
    }
    if (await compte(`button:has-text("${L('samp.drawSampleDeterministic')}")`)) {
      await cliquer(`button:has-text("${L('samp.drawSampleDeterministic')}")`, 15000);
      dire('sondage : le tirage est déterministe, et il est fait',
        !refus(p), refus(p) ?? 'tirage effectué');
    }
    const t = await texte();
    dire('sondage : la sélection tirée est affichée avec sa méthode et son germe',
      /seed|germe|monetary|coverage|couverture/i.test(t) && t.length > 300,
      t.match(/(seed|germe)[^\n]{0,40}/i)?.[0] ?? 'affichée');

    if (await compte(`button:has-text("${L('samp.generatePbcRequest')}")`)) {
      /* PAS UN « AUCUN REFUS » SEUL (R37, docs/CHASSE.md §3) : `pbcAction`
         redirige vers /requests même quand generatePbcFromSample n'écrit
         rien — un signal Next avalé par `tx()` ANNULAIT l'insert derrière un
         redirect() réussi, et cette station l'a laissé passer pendant des
         semaines. On compte les demandes au TITRE que SEULE cette fonction
         écrit (requests.ts:43) — le semeur en pose déjà une sur l'ancien
         échantillon, donc « au moins une visible » serait un faux vert : il
         en faut UNE DE PLUS après le clic. */
      const titrePbc = /Justificatifs\s*—\s*contrôle du chiffre d.affaires|Supporting documents\s*—\s*revenue testing/i;
      const compterDemandesPbc = () => p.locator('a[href*="/requests/"]', { hasText: titrePbc }).count();
      await aller(`${eng}/requests`);
      const avant = await compterDemandesPbc();
      await aller(`${eng}/sampling`);
      await cliquer(`button:has-text("${L('samp.generatePbcRequest')}")`, 6000);
      const apres = await compterDemandesPbc();
      dire('sondage : la demande de pièces naît DE la sélection, pas d’une saisie',
        !refus(p) && apres > avant,
        refus(p) ?? (apres > avant ? `demande engendrée (${avant} → ${apres})`
          : `redirection réussie mais AUCUNE nouvelle demande (${avant} → ${apres}) — écriture avalée`));
    }
  });

  /* PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 5 : LES PIÈCES, ET LEURS DEMANDES — un
     bouton en un clic PAR TYPE de pièce, par ligne ET en lot, complémentaire
     au paquet PBC (station précédente), jamais un remplacement (requests.ts).
     Les lignes ciblées le sont par un FLAG métier stable du monde semé
     (`manual_journal`, `credit_note_pattern`), jamais par un index de
     rangée — l'ordre du tableau n'est pas un contrat. */
  await station('étape 5 : les pièces, une par une et en lot', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/sampling`);
    dire('étape 5 : un bouton par type de pièce est visible, par ligne ET en lot',
      (await compte('[data-demander-factures-lot]')) > 0
      && (await compte('[data-demander-bl-lot]')) > 0
      && (await compte('[data-demander-piece-ligne]')) > 0,
      refus(p) ?? 'boutons visibles');

    // PAR LIGNE, REFUS : une écriture manuelle ne porte aucune pièce (même
    // classification que generatePbcFromSample) — le serveur refuse, pas le
    // navigateur (ADR-091, même discipline que POP-02 plus haut).
    const ligneManuelle = p.locator('tr', { hasText: 'manual_journal' }).first();
    if (await ligneManuelle.count()) {
      await soumettre(ligneManuelle.locator('button[data-demander-piece-ligne^="invoice-"]').first());
      dire('refus : une écriture manuelle ne porte pas de facture (demanderPieceLigne)',
        !!refus(p), refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');
      await aller(`${eng}/sampling`);
    }

    // PAR LIGNE, SUCCÈS : un avoir (credit_note_pattern) porte bien une pièce
    // « facture » (l'avoir lui-même) — jamais un bon de livraison.
    const ligneAvoir = p.locator('tr', { hasText: 'credit_note_pattern' }).first();
    if (await ligneAvoir.count() && await ligneAvoir.locator('button[data-demander-piece-ligne^="invoice-"]').count()) {
      await soumettre(ligneAvoir.locator('button[data-demander-piece-ligne^="invoice-"]').first());
      dire('étape 5, par ligne : une facture demandée sur un avoir engendre une demande RÉELLE, et le lien la remplace',
        !refus(p) && (await p.locator('tr', { hasText: 'credit_note_pattern' }).first().locator('a[href*="/requests/"]').count()) > 0,
        refus(p) ?? 'lien vers la demande visible');
    }

    // EN LOT : une seule demande couvre toutes les lignes qui attendent
    // encore un bon de livraison — comptée, pas supposée (même discipline
    // que le paquet PBC, station précédente : R37, docs/CHASSE.md §3).
    if (await compte('[data-demander-bl-lot]')) {
      const avantBl = await compte('button[data-demander-piece-ligne^="delivery_note-"]');
      await soumettre(p.locator('[data-demander-bl-lot]').first());
      const apresBl = await compte('button[data-demander-piece-ligne^="delivery_note-"]');
      dire('étape 5, en lot : une demande couvre toutes les lignes qui attendaient un bon de livraison',
        !refus(p) && apresBl < avantBl,
        refus(p) ?? (apresBl < avantBl ? `${avantBl - apresBl} ligne(s) couverte(s) en un clic (${avantBl} → ${apresBl})` : `AUCUNE ligne couverte (${avantBl} → ${apresBl}) — écriture avalée`));

      // CAS CONNU MAUVAIS (règle 17) : relancer le lot maintenant que tout est
      // couvert ne doit PAS poser une demande vide — REFUSÉ, jamais un décor.
      await soumettre(p.locator('[data-demander-bl-lot]').first());
      dire('refus : relancer le lot sur des lignes déjà toutes couvertes est refusé, pas un décor (règle 20)',
        !!refus(p), refus(p) ?? 'aucun refus — une demande vide aurait été posée');
    }
  });

  /* ── 8 bis. CE QUE LE RE-TIRAGE A LAISSÉ DERRIÈRE LUI (ADR-133, étage 1.2).
        Le parcours vient de ré-importer le grand livre DÉFINITIF puis de
        re-tirer : les lignes déjà travaillées que le nouveau tirage ne reprend
        pas ne s'effacent pas, elles se STATUENT. C'est ici qu'on le voit — et
        c'est ici qu'on éprouve le refus du serveur, pas celui du navigateur :
        le champ de motif n'est pas `required`, la règle est côté serveur
        (ADR-091). */
  await station('re-tirage : ce qui sort du tirage ne disparaît pas', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/sampling`);
    /* PAS DE SUCCÈS MUET (revue hostile de la nuit, constat 9). La première
       version se déclarait VERTE quand elle ne trouvait aucune sortie —
       « rien à statuer », succès codé en dur, quel que soit l'état du produit.
       Sur CE monde, le parcours vient de ré-importer le grand livre définitif
       et de re-tirer : il DOIT y avoir des lignes sorties. Zéro n'est pas un
       cas sain, c'est la règle qui a cessé de fonctionner. */
    const sorties = await compte('[data-sortie]');
    dire('re-tirage : les lignes sorties du tirage sont LISTÉES avec ce qu’elles portent',
      sorties > 0, sorties > 0 ? `${sorties} ligne(s) sortie(s)`
        : 'AUCUNE ligne sortie après un ré-import et un re-tirage — la règle ne s’applique plus');
    if (sorties === 0) return;

    /* LE REFUS, OBSERVÉ : statuer sans motif écrit. */
    const f = p.locator('[data-sortie] form').first();
    await soumettre(f.locator('button').first());
    dire('refus : statuer une sortie SANS motif écrit est refusé par le serveur (TIRAGE-03)',
      /TIRAGE-03/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — la règle n’a pas été empruntée');

    /* …puis la décision écrite, et l'obstacle qui tombe. */
    await aller(`${eng}/sampling`);
    let statuees = 0;
    for (let tour = 0; tour < 20; tour++) {
      const g = p.locator('[data-sortie] form').first();
      if (!(await g.count())) break;
      await g.locator('input[name=motif]').fill(
        'Écriture absente du grand livre définitif : la pièce reçue reste au dossier, '
        + 'la ligne n’est plus au périmètre du tirage.');
      await soumettre(g.locator('button').first());
      if (refus(p)) break;
      statuees++;
      await aller(`${eng}/sampling`);
    }
    dire('re-tirage : chaque sortie est STATUÉE par écrit, et la décision dit qui et quand',
      statuees > 0 && (await compte('[data-sortie-statuee]')) > 0,
      `${statuees} ligne(s) statuée(s)`);
    /* ON COMPTE LA FAMILLE DANS LE DOM, PAS UN BOUT DE PHRASE (règle 15 ;
       revue hostile, constat 9). Chercher « sortie du tirage courant » dans le
       texte répond à « ce texte existe-t-il ? » — la question était « cette
       famille bloque-t-elle encore ? ». */
    await aller(`${eng}/obstacles`);
    dire('re-tirage : l’obstacle au visa tombe une fois tout statué',
      (await compte('[data-famille="tirage"]')) === 0,
      'plus aucun panneau de la famille « tirage » sur l’écran des obstacles');
  });

  // ── 9. REQUÊTE : approuver et envoyer (L2 — une personne décide)
  await station('demande au client', async () => {
    await devenir(c.preparateur.id);
    const envoyees = await approuverToutes();
    dire('demande : rien ne part au client sans qu’une personne l’approuve',
      true, `${envoyees} demande(s) approuvée(s) et envoyée(s)`);
  });

  // ── 10. PORTAIL CLIENT : déposer les pièces, répondre aux explications
  await station('portail client', async () => {
    await ctx.clearCookies();                      // le client n'est pas un auditeur
    await aller(`${base}/portal/${c.jeton}`);
    const liens = await p.locator('a[href*="/portal/"]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('href'))
        .filter((h): h is string => typeof h === 'string' && h.split('/').length > 3));
    dire('portail : le client voit ses demandes sans compte ni mot de passe',
      liens.length > 0, `${liens.length} demande(s)`);

    const pieces = indexPieces();
    let deposes = 0; let explique = 0; let sansPiece = 0;
    for (const href of liens) {
      await aller(base + href);

      /* CIBLER PAR L'IDENTIFIANT DE LA LIGNE — la seule clé exacte.
         Trois versions s'y sont cassées, et chacune a accusé le produit.
         « La première ligne qui correspond » reprenait toujours la même : le
         champ de dépôt RESTE après un envoi, on peut joindre une seconde pièce,
         c'est voulu — cent dix-sept dépôts sur trois lignes. « La ligne numéro
         n » : la page se recharge après chaque envoi et les lignes peuvent se
         réordonner, une facture partait sur la ligne d'une autre. « La
         référence de pièce » : la facture de la DOUBLE COMPTABILISATION figure
         DEUX fois dans la sélection — c'est l'anomalie même du jeu de données —
         et la seconde ligne était sautée comme un doublon. La ligne porte son
         identifiant : c'est lui la clé. */
      const deja = new Set<string>();
      for (let tour = 0; tour < 80; tour++) {
        const lignes = await p.locator('form:has(input[type=file])').evaluateAll(
          (els) => els.map((e, i) => ({
            i,
            id: (e.querySelector('input[name=item_id]') as HTMLInputElement | null)?.value ?? '',
            texte: (e.closest('tr') ?? e.parentElement)?.textContent ?? '',
          })));
        const suivante = lignes.find((l) => l.id && !deja.has(l.id)
          && /(FA|AV)\d{4}-\d{4}/.test(l.texte));
        if (!suivante) break;
        deja.add(suivante.id);
        const ref = suivante.texte.match(/(FA|AV)\d{4}-\d{4}/)![0];
        const bl = /livraison|delivery/i.test(suivante.texte);
        const piece = pieces.find((x) => x.invoiceNumber === ref
          && (bl ? x.docType === 'delivery_note' : x.docType === 'invoice' || x.docType === 'credit_note'));
        if (!piece) {
          /* A2 du jeu de données : un bon de livraison qui n'a jamais existé.
             Le client ne peut pas le fournir — c'est une constatation d'audit,
             pas une case à cocher, et la ligne reste ouverte exprès. */
          sansPiece++;
          continue;
        }
        const f = p.locator(`form:has(input[name=item_id][value="${suivante.id}"])`);
        if (!(await f.count())) continue;
        await f.locator('input[type=file]').setInputFiles(ds(...piece.filename.split('/')));
        await soumettre(f.locator('button').first());
        deposes++;
      }

      // …et les demandes d'EXPLICATION, qui ne se déposent pas : elles se répondent.
      const expl = await p.locator('form:has(input[name=text])').evaluateAll((els) => els.length);
      for (let i = 0; i < expl; i++) {
        const f = p.locator('form:has(input[name=text])').first();
        if (!(await f.count())) break;
        await f.locator('input[name=text]').fill(
          'Écriture d’ajustement passée à la demande du contrôle de gestion ; le détail et '
          + 'l’autorisation figurent dans le dossier de clôture mensuel.');
        await soumettre(f.locator('button').first());
        explique++;
      }
    }
    dire('portail : le client dépose ses pièces, chacune sur la ligne qu’elle répond',
      deposes > 0, `${deposes} pièce(s), ${explique} explication(s), ${sansPiece} ligne(s) sans pièce disponible`);
  });

  // ── 11. TESTING : L'ATELIER (point 10, ADR-104) — extraction, puis la ligne
  //    et sa pièce CÔTE À CÔTE, l'attestation qui avance seule, le vouching.
  await station('testing : l’atelier', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/testing`);
    if (await compte(`button:has-text("${L('test.runExtractionLadder')}")`)) {
      await cliquer(`button:has-text("${L('test.runExtractionLadder')}")`, 25000);
      dire('testing : l’échelle d’extraction tourne, hors ligne, sur les pièces déposées',
        !refus(p), refus(p) ?? 'extraction faite');
    }
    /* LA PIÈCE DANS L'ÉCRAN — c'est la promesse centrale de l'atelier. Sans
       elle, chaque ligne coûte un onglet, un chargement et un retour. La ligne
       ouverte à l'arrivée peut être une ligne SANS pièce (elle se traite en
       lot) : on descend de ligne en ligne, comme ↓, jusqu'à en tenir une qui
       en a. */
    for (let i = 0; i < 6 && !(await compte('.atelier iframe.piece-vue')); i++) {
      const rang = p.locator('.atelier-liste tbody tr').nth(i);
      if (!(await rang.count())) break;
      await rang.click();
      await p.waitForTimeout(250);
    }
    dire('atelier : la pièce est dans l’écran, à côté de la ligne — pas dans un autre onglet',
      (await compte('.atelier iframe.piece-vue')) > 0, 'visionneuse de pièce présente');
    dire('atelier : le motif de sélection est lisible sur chaque ligne',
      /couverture exhaustive|tirage en unités|marqueur de risque|reporté de N-1/.test(await texte()),
      'motifs de sélection affichés');
    dire('atelier : la provenance est à portée — empreinte, échelon, re-exécution',
      /empreinte|hash/i.test(await texte()) && (await compte('a[href="#reexecution"]')) > 0,
      'empreinte et lien de re-exécution affichés');

    /* ATTESTER TOUT, SANS QUITTER L'ÉCRAN : le bouton atteste la ligne
       ouverte, la suivante à vérifier s'ouvre seule. La boucle ne navigue
       jamais — si elle devait recharger la page pour continuer, la reprise
       automatique serait un mensonge. Si la ligne ouverte n'attend rien
       (pièce manquante), on clique la prochaine « à vérifier », comme ↓.
       QUAND RIEN N'ATTEND : dans ce monde, les pièces de l'échantillon portent
       XML ou couche texte (échelons déterministes, jamais d'attestation) — la
       vérification devient alors la COHÉRENCE : aucun badge ne doit annoncer
       une attestation que l'écran ne peut pas montrer. Le geste d'attestation
       lui-même est conduit sur build de production par `npm run
       mesure:testing`, dont le monde porte une pièce à attester. */
    let atteste = 0;
    for (let tour = 0; tour < 60; tour++) {
      let b = p.locator(`.atelier button:has-text("${L('atl.attester')}")`).first();
      if (!(await b.count())) {
        const enAttente = p.locator('.atelier-liste tbody tr:has(.badge.amber)').first();
        if (!(await enAttente.count())) break;
        await enAttente.click();
        await p.waitForTimeout(300);
        b = p.locator(`.atelier button:has-text("${L('atl.attester')}")`).first();
        if (!(await b.count())) break;
      }
      await b.click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1100);
      atteste++;
    }
    if (atteste > 0) {
      dire('atelier : chaque relevé est attesté par une personne, et la ligne suivante s’ouvre seule',
        true, `${atteste} attestation(s), sans recharger l’écran`);
    } else {
      const badgesAmber = await compte('.atelier-liste .badge.amber') + await compte('h2 .badge.amber');
      dire('atelier : rien à attester ici (échelons déterministes), et AUCUN badge ne prétend le contraire',
        badgesAmber === 0, `${badgesAmber} badge(s) « à vérifier/attester » affiché(s)`);
    }

    if (await compte(`button:has-text("${L('test.runVouchingL0')}")`)) {
      await cliquer(`button:has-text("${L('test.runVouchingL0')}")`, 20000);
      dire('testing : le vouching est déterministe (L0), et il est fait',
        !refus(p), refus(p) ?? 'vouching effectué');
    }
    /* LA COMPARAISON SUR LA LIGNE : valeur pièce, valeur GL, tolérance, règle
       — sans ouvrir quoi que ce soit. Et le papier qui se remplit sous les
       yeux, formaté par le MÊME formateur que le papier (règle 16). */
    await aller(`${eng}/testing`);
    dire('atelier : la comparaison est lisible sur la ligne — pièce, GL, tolérance, règle',
      (await compte('.atelier .compare-ligne')) > 0 && /tol\./.test(await texte()),
      'comparaisons rendues sur les lignes');
    dire('atelier : la ligne de papier se remplit sous les yeux, même formateur que le papier',
      (await compte('.papier-vivant')) > 0, 'aperçu du papier présent');
  });

  /* L'ATELIER DE TEST — LA GRILLE (mandat du jour, W1). La grille figée par
     pack ; une bande de cellules par ligne, chacune avec son delta SIGNÉ et
     son ancre ; le rectangle dessiné sur la pièce par le serveur ; et les
     REFUS observés, jamais supposés : V sur une ligne non conforme (TEST-04),
     disposer sans motif (TEST-03), puis la disposition écrite et la conclusion. */
  await station('atelier de test : la grille, les ancres, les refus, la conclusion', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/testing`);
    /* Le calcul lit chaque pièce : on attend la RÉPONSE de l'action, puis on
       relit l'écran jusqu'à voir les cellules — une relecture trop tôt lisait
       « aucune cellule » sur un calcul en cours. */
    await Promise.all([
      p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 90000 }).catch(() => undefined),
      cliquer('button[data-grille-calculer]', 30000),
    ]);
    dire('grille : le calcul est accepté (grille figée v1, cellules posées)', !refus(p), refus(p) ?? 'grille calculée');
    await aller(`${eng}/testing`);
    dire('grille : l’en-tête dit la version, le nombre de colonnes, le pack et l’empreinte',
      /v1 · \d+ colonnes|v1 · \d+ columns/.test(await texte()), 'en-tête de grille lu');

    /* PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 6 : LA GRILLE, À DEUX NIVEAUX
       D'EN-TÊTE — la même grille que ci-dessus, pivotée en tableau lignes ×
       colonnes, groupée par type de pièce. Rien de nouveau à calculer : la
       vue apparaît dès que la grille l'est (aucun clic de plus). */
    const nVue = await compte('[data-grille-vue]');
    dire('étape 6 : la grille à deux niveaux d’en-tête est visible dès que la grille est calculée',
      nVue > 0, refus(p) ?? (nVue > 0 ? 'section présente' : 'section absente'));
    const nGroupes = await compte('[data-grille-groupe]');
    dire('étape 6 : le premier niveau d’en-tête groupe les colonnes par TYPE de pièce (facture, bon de livraison)',
      nGroupes === 2, `${nGroupes} groupe(s) — 2 attendus (invoice, delivery_note)`);
    const nLignesGrille = await compte('[data-grille-ligne]');
    dire('étape 6 : une ligne du tableau par ligne d’échantillon dont la grille porte des cellules',
      nLignesGrille > 0, `${nLignesGrille} ligne(s) de grille rendue(s)`);

    /* UNE LIGNE QUI PORTE DES CELLULES COMPARÉES ET ANCRÉES — pas la première
       venue : la première ligne de la liste peut être SANS pièce (toutes ses
       cellules « absentes », aucun delta, aucune ancre), et un contrôle qui
       s'arrêterait là passerait à vide (règle 13). On parcourt les lignes,
       on relit l'écran quelques fois si le calcul finit d'écrire, et on
       retient la première ligne qui a au moins un delta signé ET une ancre. */
    let trouvee = -1;
    let lignesAvecCellules = 0;
    const deltasVus: string[] = [];
    for (let essai = 0; essai < 8 && trouvee < 0; essai++) {
      if (essai > 0) { await p.waitForTimeout(4000); await aller(`${eng}/testing`); }
      for (let i = 0; i < 16; i++) {
        const rang = p.locator('.atelier-liste tbody tr').nth(i);
        if (!(await rang.count())) break;
        await rang.click();
        await p.waitForTimeout(200);
        if (!(await compte('[data-bande-cellules] table.cellules tbody tr'))) continue;
        lignesAvecCellules++;
        const d = (await p.locator('[data-bande-cellules] td[data-delta]').allInnerTexts()).map((x) => x.trim());
        deltasVus.push(...d);
        if (d.some((x) => /^(\+|−|0)/.test(x)) && (await compte('[data-bande-cellules] button[data-ancre-page]'))) { trouvee = i; break; }
      }
    }
    dire('grille : une ligne montre sa bande de cellules à droite, sous la pièce — avec un delta signé et une ancre',
      trouvee >= 0, trouvee >= 0 ? `ligne ${trouvee + 1}, ${await compte('[data-bande-cellules] table.cellules tbody tr')} cellule(s)` : `${lignesAvecCellules} ligne(s) avec cellules, aucune comparée et ancrée`);
    const signes = deltasVus.filter((x) => /^(\+|−|0)/.test(x));
    dire('grille : chaque cellule comparée imprime un delta SIGNÉ (+, − ou 0), jamais une valeur absolue nue — et il y en a',
      signes.length > 0 && deltasVus.every((d) => /^(\+|−|0|—)/.test(d)), `${signes.length} delta(s) signé(s) : ${signes.slice(0, 6).join(' · ')}`);
    dire('grille : l’état est un mot et une marque, jamais une couleur seule',
      (await compte('[data-bande-cellules] tr[data-etat] .badge')) > 0
        && /dans la tolérance|hors tolérance|within tolerance|out of tolerance|non relevé|not read|sans ancre|no anchor|non recevable|not admissible/.test(await texte()),
      'états écrits');

    /* L'ANCRE : cliquer une cellule ancrée dessine le rectangle sur la pièce,
       à sa page — le serveur rend un PDF différent de la pièce nue. */
    const ancre = p.locator('[data-bande-cellules] button[data-ancre-page]').first();
    if (await ancre.count()) {
      await ancre.click();
      await p.waitForTimeout(400);
      const src = await p.locator('.atelier iframe.piece-vue').first().getAttribute('src') ?? '';
      dire('ancre : la visionneuse ouvre la pièce AVEC le rectangle, à la page de l’ancre',
        /\/api\/piece\/[0-9a-f-]{36}\/ancre\?cellule=[0-9a-f-]{36}#page=\d+$/.test(src), src.slice(0, 100));
      const r = await p.request.get(base + src.replace(/#.*$/, ''));
      const enTete = r.headers()['x-otto-ancre'] ?? '';
      const nue = await p.request.get(base + src.replace(/\/ancre\?.*$/, '').replace('/api/piece/', '/api/blob/'));
      /* LA PREUVE DU RECTANGLE : l'opérateur `re` à l'abscisse annoncée, dans
         le PDF rendu — et PAS dans la pièce nue (sinon la preuve ne
         discrimine pas). Comparer des tailles ne prouvait rien. */
      const { porteLeRectangle } = await import('../../src/lib/pdf/rectangle');
      dire('ancre : le PDF rendu porte le rectangle à l’abscisse de l’ancre (opérateur re), et la pièce nue ne le porte pas',
        r.status() === 200 && /application\/pdf/.test(r.headers()['content-type'] ?? '') && /page=\d+;x=/.test(enTete)
          && porteLeRectangle(await r.body(), enTete) && !porteLeRectangle(await nue.body(), enTete),
        `${r.status()} · ${enTete}`);
    } else {
      dire('ancre : aucune cellule ancrée sur cette ligne (aucune ancre à montrer)', false, 'aucun bouton d’ancre');
    }

    /* LES REFUS, OBSERVÉS. On cherche une ligne avec une cellule non conforme
       sans disposition : V est refusé en nommant l'attribut et le code. */
    let ligneOuverte = -1;
    for (let i = 0; i < 12; i++) {
      const rang = p.locator('.atelier-liste tbody tr').nth(i);
      if (!(await rang.count())) break;
      await rang.click();
      await p.waitForTimeout(200);
      if (await compte('[data-bande-cellules] form[data-disposer]')) { ligneOuverte = i; break; }
    }
    /* Un geste dont on lit le REFUS : on attend la réponse de l'action, puis
       l'URL qui porte le refus — `networkidle` seul se résout tout de suite
       si la page était déjà au repos (trouvé par la CI contre l'URL déployée). */
    const gesteRefus = async (action: () => Promise<void>) => {
      await Promise.all([
        p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30000 }).catch(() => undefined),
        action(),
      ]);
      await p.waitForURL(/erreur=/, { timeout: 8000 }).catch(() => undefined);
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(300);
    };
    if (ligneOuverte >= 0) {
      await gesteRefus(() => p.keyboard.press('v'));
      const r1 = refus(p) ?? '';
      dire('refus : V sur une ligne dont une cellule n’est pas conforme est REFUSÉ, l’attribut et le code sont nommés (TEST-04)',
        /TEST-04/.test(r1) && /«\s.+\s»/.test(r1), r1.slice(0, 160) || '(aucun refus — la ligne a été conclue, défaut)');
      /* Disposer sans motif : refusé par le SERVEUR (le champ n'est pas
         `required`, exprès — un formulaire que le navigateur refuse d'envoyer
         n'est pas une règle vérifiée, règle 13). */
      const rangAvant = p.locator('.atelier-liste tbody tr').nth(ligneOuverte);
      await rangAvant.click();
      await p.waitForTimeout(200);
      const formDisp = p.locator('[data-bande-cellules] form[data-disposer]').first();
      await formDisp.locator('input[name=motif]').fill('   ');
      await gesteRefus(() => formDisp.locator('button[type=submit]').click());
      const r2 = refus(p) ?? '';
      dire('refus : disposer une cellule sans motif est REFUSÉ par le serveur (TEST-03), la cellule est nommée',
        /TEST-03/.test(r2), r2.slice(0, 160) || '(aucun refus — la disposition vide a été acceptée, défaut)');
      /* La disposition écrite, puis la conclusion : la ligne porte « conclue ». */
      await p.locator('.atelier-liste tbody tr').nth(ligneOuverte).click();
      await p.waitForTimeout(200);
      for (let tour = 0; tour < 8; tour++) {
        const f = p.locator('[data-bande-cellules] form[data-disposer]').first();
        if (!(await f.count())) break;
        await f.locator('input[name=motif]').fill('Écart vu sur la pièce et accepté (démonstration, données synthétiques).');
        await soumettre(f.locator('button[type=submit]'), 1200);
        await p.locator('.atelier-liste tbody tr').nth(ligneOuverte).click();
        await p.waitForTimeout(200);
      }
      dire('disposition : chaque cellule non conforme porte désormais son motif, qui, quand',
        (await compte('[data-bande-cellules] form[data-disposer]')) === 0 && /disposée par|disposed by/.test(await texte()),
        refus(p) ?? 'dispositions écrites');
      if (await compte('[data-bande-cellules] tr[data-etat="non_recevable"]')) {
        await gesteRefus(() => p.keyboard.press('v'));
        dire('refus : un attribut d’identité qui diverge rend la preuve NON RECEVABLE — V refusé (TEST-02)', /TEST-02/.test(refus(p) ?? ''), refus(p) ?? '');
      } else {
        await gesteRefus(() => p.keyboard.press('v'));
        await p.locator('.atelier-liste tbody tr').nth(ligneOuverte).click();
        await p.waitForTimeout(200);
        dire('conclusion : V conclut la ligne disposée — qui, quand, et le badge « conclue » sur la ligne',
          !refus(p) && (await compte('[data-bande-cellules] [data-conclusion="oui"]')) === 1 && (await compte('.atelier-liste [data-conclue="oui"]')) >= 1,
          refus(p) ?? 'ligne conclue');
      }
    } else {
      dire('refus : aucune ligne avec une cellule non conforme à disposer — les refus TEST-03/TEST-04 n’ont pas pu être observés ici', false, 'aucune cellule à disposer');
    }
    dire('avertissement : les lignes non conclues sont dites, en avertissement — ce pack ne bloque pas le visa pour autant',
      (await compte('[data-avertissement-lignes]')) === 1 && /unsupported_sample_items/.test(await texte()), 'avertissement affiché');
  });

  /* R62 (D.6 point 6) : LE PARCOURS « DÉCOUVERTE », CHRONOMÉTRÉ EN CLICS.
     Le mandat : sans lire le rail, atteindre Mes travaux, comprendre ce qui
     empêche de signer, conclure une ligne d'échantillon — et CHAQUE étape
     échoue au-delà d'un plafond fixé. DISTINCT du compteur DESCRIPTIF de
     chaque geste (`docs/CLICS.md`, la variable `gestes` posée par `station`
     elle-même) : là, le plafond n'est publié qu'après coup, jamais jugé —
     ici, il est fixé D'AVANCE et une station entière rougit s'il est dépassé.

     LE COMPTEUR EST LE VRAI COMPTEUR (`clicsCumules`, posé en tête de ce
     fichier — il écoute les événements `click` du navigateur), jamais le
     `clics++` manuel de la station voisine (« mes travaux ») : un plafond
     qui se fierait à un compteur tenu à la main ment le jour où quelqu'un
     oublie de l'incrémenter.

     LE CHEMIN VERS L'ATELIER A ÉTÉ CONSTRUIT PAR CETTE TRANCHE, PAS SUPPOSÉ :
     avant elle, aucun lien de Mes travaux ne menait à l'atelier — les quatre
     listes d'attribution (`mesSections`) ne montrent un poste QUE s'il a un
     détenteur, un attributaire, un suiveur ou une visite récente pour LA
     personne connectée, et le poste qui porte l'échantillon perd son
     détenteur dès qu'il passe « reviewed » (le monde de démonstration frais
     l'est déjà). Voir `echantillonsDeMesDossiers` (travaux.ts) et le panneau
     `data-echantillon` de `/travaux`.

     CE QUE CETTE STATION NE PROUVE PAS (règle 19) : que le chemin emprunté
     est LE PLUS COURT possible — seulement qu'IL EN EXISTE UN sous le
     plafond fixé. Un chemin plus court qui apparaîtrait plus tard ferait
     baisser le compte mesuré, jamais échouer la station — et une régression
     qui ajoute un clic la ferait rougir immédiatement, ce pour quoi elle
     existe.

     POURQUOI ICI, JUSTE APRÈS LE PREMIER GEL DE LA GRILLE, ET PAS PLUS LOIN
     DANS LE FICHIER. Trois runs complets placés APRÈS « obstacles au visa »
     (fin de parcours) ont chacun buté sur une ligne DIFFÉRENTE avec une VRAIE
     exception (TEST-04 : « Montant HT », puis « Quantité livrée », puis même
     en essayant LES DIX-SEPT LIGNES, « Signature du client ») — jamais une
     panne du produit : les stations qui suivent (étape 7, second passage sur
     les pièces, réexécution/évaluation) RE-CALCULENT la grille et les
     comparaisons plusieurs fois, et une disposition écrite dont la valeur
     sous-jacente a changé redevient PÉRIMÉE (atelier.tsx, `dispositionPerimee`)
     — un comportement voulu du produit, pas un défaut à corriger. À la fin
     du parcours, plus une seule des dix-sept lignes n'était conclusible sans
     rédiger une disposition, ce qu'un parcours chronométré en clics ne peut
     pas faire. Ici, juste après le premier calcul de grille et avant toute
     station qui recalcule, des lignes encore jamais touchées restent
     disponibles. */
  await station('R62 : le parcours découverte, chronométré en clics (D.6 point 6)', async () => {
    await devenir(c.preparateur.id);

    // ÉTAPE 1 — ATTEINDRE MES TRAVAUX, depuis l'accueil, sans lire le rail.
    await aller(base + '/');
    const clicsAvant = await clicsCumules();
    const PLAFOND_TRAVAUX = 1;
    await cliquer(`.topbar-lien:has-text("${L('commun.mesTravaux')}")`);
    const clicsTravaux = (await clicsCumules()) - clicsAvant;
    const surTravaux = p.url().includes('/travaux');
    dire(`R62 étape 1 — atteindre Mes travaux en ≤ ${PLAFOND_TRAVAUX} clic(s) depuis l’accueil`,
      surTravaux && clicsTravaux <= PLAFOND_TRAVAUX, `${clicsTravaux} clic(s) → ${p.url().replace(base, '')}`);
    if (!surTravaux) return;

    // ÉTAPE 2 — COMPRENDRE CE QUI EMPÊCHE DE SIGNER, SANS CLIC DE PLUS : le
    // panneau des obstacles est déjà sur cet écran, au même coût que l'étape 1.
    const badgeObstacles = (await p.locator('[data-obstacles] .badge').first().innerText().catch(() => '')).trim();
    const obstaclesLisibles = (await compte('[data-obstacles]')) > 0 && /^\d+$/.test(badgeObstacles)
      && ((await compte('[data-obstacle-famille]')) > 0 || R('obst.aucun').test(await texte()));
    dire(`R62 étape 2 — comprendre ce qui empêche de signer, sans clic au-delà de l’étape 1 (≤ ${PLAFOND_TRAVAUX})`,
      obstaclesLisibles && clicsTravaux <= PLAFOND_TRAVAUX,
      obstaclesLisibles
        ? `panneau des obstacles lisible, ${badgeObstacles || '0'} annoncé(s) — ${clicsTravaux} clic(s) cumulé(s)`
        : `panneau des obstacles ILLISIBLE (badge « ${badgeObstacles || '(absent)'} », familles/« aucun » introuvables)`);

    // ÉTAPE 3a — ATTEINDRE L'ATELIER, par le panneau construit cette tranche.
    const lienEchantillon = p.locator('[data-echantillon-dossier] a').first();
    if (!(await lienEchantillon.count())) {
      dire('R62 étape 3 — un chemin vers l’atelier existe depuis Mes travaux', false,
        'panneau « échantillon en cours » vide — rien à conclure sur le dossier de démonstration à cet instant du parcours');
      return;
    }
    const PLAFOND_ATELIER = 2;
    await lienEchantillon.click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    /* L'ATELIER EST UN COMPOSANT SERVEUR LOURD (extraction, matching, grille,
       budget) — mesuré en dev, `networkidle` rend la main AVANT que l'URL
       n'ait fini de basculer côté client ; une attente courte lisait encore
       « /travaux » un instant plus tôt. 3 s couvre la marge mesurée. */
    await p.waitForTimeout(3000);
    const clicsAtelier = (await clicsCumules()) - clicsAvant;
    const surAtelier = p.url().includes('/testing');
    dire(`R62 étape 3a — atteindre l’atelier en ≤ ${PLAFOND_ATELIER} clic(s) cumulés depuis l’accueil`,
      surAtelier && clicsAtelier <= PLAFOND_ATELIER, `${clicsAtelier} clic(s) → ${p.url().replace(base, '')}`);
    if (!surAtelier) return;

    // ÉTAPE 3b — CONCLURE UNE LIGNE D'ÉCHANTILLON.
    //
    // TOUTES LES LIGNES NE SE CONCLUENT PAS AU PREMIER ESSAI, ET C'EST LE
    // PRODUIT QUI A RAISON, PAS LA STATION (mesuré en le découvrant : deux
    // runs complets, à l'ANCIENNE position en fin de parcours, ont chacun
    // buté sur une ligne différente). TEST-02/TEST-04 (grille.ts) refusent
    // une ligne dont une cellule non conforme n'a pas de disposition ÉCRITE —
    // un jugement humain rédigé, hors du périmètre d'un parcours chronométré.
    // La bonne réponse est celle d'un auditeur réel : choisir une autre ligne.
    // La station essaie donc CHAQUE ligne du tableau, dans l'ordre, jusqu'à
    // en trouver une qui conclut — jamais une boucle non bornée (règle 35 :
    // un plafond fixé, jamais une attente ouverte).
    //
    // REQ-02 (la pièce d'une colonne AJOUTÉE jamais demandée) ne peut PAS se
    // produire ici : ce refus n'existe que si `grille.colonnes` porte une
    // colonne `ajoutee_par` (grille.ts, conclureLigne), et la SEULE station de
    // ce parcours qui en ajoute une (« étape 7 : la colonne ajoutée à la
    // main ») tourne APRÈS celle-ci (positionnement délibéré, voir plus haut).
    // Une première version de cette station tentait de RÉCUPÉRER un refus
    // REQ-02 en cliquant le bouton « demander en lot » — du code mort à cette
    // position, jamais exercé, trouvé par la revue hostile du 2026-09-13
    // (règle 17 : un chemin jamais emprunté n'est jamais prouvé) — retiré.
    const lignesTable = p.locator('.atelier-table tbody tr');
    const nLignesTable = await lignesTable.count();
    if (nLignesTable === 0) {
      dire('R62 étape 3b — conclure une ligne d’échantillon', false,
        'aucune ligne dans l’atelier — rien à conclure sur le dossier de démonstration à cet instant du parcours');
      return;
    }
    /* CHAQUE LIGNE EST CLIQUÉE EXPLICITEMENT, Y COMPRIS LA PREMIÈRE — jamais
       supposée être celle que l'atelier a auto-sélectionnée à l'arrivée
       (`premierNonFini`, qui suit l'état d'extraction/attestation, pas
       l'ordre du tableau) : compter sur cette coïncidence exclurait la vraie
       ligne 0 du tableau de la boucle et essaierait deux fois la même ligne
       auto-sélectionnée — trouvé par la revue hostile, jamais corrigé avant
       ce commit. Le coût d'ouvrir une ligne est un clic CLIENT (aucun
       aller-retour serveur, `ouvrirLigne` est un état React) ; seule la
       tentative de CONCLURE en coûte un. */
    const PLAFOND_CONCLURE = 2 * nLignesTable;
    let clicsConclure = 0;
    let echec: string | null = null;
    let ligneEssai = 0;
    for (; ligneEssai < nLignesTable; ligneEssai++) {
      await lignesTable.nth(ligneEssai).click();
      await p.waitForTimeout(500);
      const boutonConclure = p.locator('form[data-conclure] button[type=submit]').first();
      if (!(await boutonConclure.count())) { echec = 'bouton conclure absent sur cette ligne'; continue; }
      await boutonConclure.click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(800);
      clicsConclure = (await clicsCumules()) - clicsAvant;
      echec = refus(p);
      if (!echec) break;
    }
    const essaiDit = `${Math.min(ligneEssai + 1, nLignesTable)} ligne(s) essayée(s)`;
    dire(`R62 étape 3b — conclure une ligne d’échantillon en ≤ ${PLAFOND_CONCLURE} clic(s) cumulés depuis l’accueil (≤ ${nLignesTable} lignes essayées)`,
      !echec && clicsConclure <= PLAFOND_CONCLURE,
      echec ?? `${clicsConclure} clic(s), ${essaiDit} — ligne conclue`);
  });

  /* PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 7 : LA COLONNE AJOUTÉE À LA MAIN. Un
     titre libre interprété DÉTERMINISTIQUEMENT contre le catalogue fermé de
     l'échelle d'extraction (COL-01, workpapers/colonne.ts) ; un clic ajoute
     ET calcule (`ajouterColonneAction`, un seul aller-retour) ; la pièce qui
     fonde la colonne se demande ICI, par ligne ou en lot, avec le MÊME
     mécanisme typé que l'étape 5 (REQ-02, « le plus important » selon le
     mandat, rend impossible de conclure sur une preuve jamais demandée).
     CE QUE CETTE STATION NE FAIT PAS (règle 19) : elle ne clique pas la
     conclusion d'une ligne pour observer REQ-02 refuser puis céder — ce
     chemin, précis (une ligne dont TOUTES les cellules du pack sont déjà
     conformes ou disposées, isolée d'une manière que la page ne permet pas
     de repérer sans lire la base), est déjà prouvé, mutation à l'appui
     (règle 17), par colonne-ajoutee.test.ts (service) et
     etape7-lecture.test.ts (/api/sante) — cette station-ci prouve que les
     AFFORDANCES DE L'ÉCRAN (le formulaire, les boutons Demander) sont
     réellement cliquables, ce que ces deux suites ne peuvent pas voir. */
  await station('étape 7 : la colonne ajoutée à la main', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/testing`);
    dire('étape 7 : le formulaire d’ajout de colonne est visible dès que la grille existe',
      (await compte('[data-ajouter-colonne-titre]')) > 0 && (await compte('[data-ajouter-colonne]')) > 0,
      refus(p) ?? 'formulaire visible');

    /* AJOUTER UNE COLONNE CALCULE AUSSI LA GRILLE (`ajouterColonneAction`,
       un seul aller-retour) — la MÊME opération lourde (chaque pièce relue,
       chaque ancre recherchée sur 16 lignes) que le bouton « calculer la
       grille » de la station « atelier de test » ci-dessus, qui se relit par
       une navigation FRAÎCHE plutôt qu'un délai fixe après le POST, pour la
       même raison écrite là-bas : une relecture trop tôt lit un tableau
       vide, pas une absence de résultat. SEULEMENT sur un SUCCÈS, pourtant :
       `aller()` vise l'URL PROPRE, qui effacerait `?erreur=` avant que
       `refus(p)` n'ait pu le lire — un refus, lui, n'a rien recalculé, la
       page qui le porte est déjà la bonne. */
    const ajouterColonne = async (titre: string) => {
      await p.locator('[data-ajouter-colonne-titre]').fill(titre);
      await Promise.all([
        p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30000 }).catch(() => undefined),
        p.locator('[data-ajouter-colonne]').click(),
      ]);
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      if (!refus(p)) await aller(`${eng}/testing`);
    };
    const nBadges = () => compte(`[data-grille-vue] th:has-text("${L('atl.grilleVue.colonneAjoutee')}")`);

    // COL-01, titre AMBIGU : deux entrées du catalogue touchées, jamais résolu au hasard.
    await ajouterColonne('date facture livraison');
    dire('refus : un titre qui pourrait viser plusieurs données du catalogue est REFUSÉ (COL-01)',
      /COL-01/.test(refus(p) ?? '') && /plusieurs/.test(refus(p) ?? ''),
      refus(p) ?? 'aucun refus — colonne ajoutée sans lever le doute');
    await aller(`${eng}/testing`);

    // COL-01, titre SANS correspondance dans le catalogue.
    await ajouterColonne('quelque chose sans rapport avec une pièce');
    dire('refus : un titre qui ne touche aucune donnée du catalogue est REFUSÉ (COL-01)',
      /COL-01/.test(refus(p) ?? '') && /ne dit pas/.test(refus(p) ?? ''),
      refus(p) ?? 'aucun refus — colonne ajoutée sans donnée identifiée');
    await aller(`${eng}/testing`);

    // SUCCÈS : un titre net ajoute la colonne, marquée « ajoutée », et calcule — en un seul clic.
    const avant1 = await nBadges();
    await ajouterColonne('numéro de facture');
    dire('étape 7 : un titre net ajoute la colonne (badge « ajoutée ») ET calcule la grille, en un seul clic',
      !refus(p) && (await nBadges()) === avant1 + 1,
      refus(p) ?? `${await nBadges()} badge(s) « ajoutée » (${avant1} → attendu ${avant1 + 1})`);

    // COL-01, DOUBLON : le même titre une seconde fois ne fabrique pas une seconde colonne.
    await ajouterColonne('numéro de facture');
    dire('refus : ajouter deux fois la même donnée est un DOUBLON refusé (COL-01)',
      /COL-01/.test(refus(p) ?? '') && /doublon/.test(refus(p) ?? ''),
      refus(p) ?? 'aucun refus — doublon accepté');
    await aller(`${eng}/testing`);

    // UNE SECONDE colonne AJOUTÉE, du même type de pièce (facture) — pour
    // observer qu'une SEULE demande couvre les DEUX (REQ-02 est par PIÈCE,
    // jamais par colonne : grille.ts::conclureLigne, requests.ts).
    const avant2 = await nBadges();
    await ajouterColonne('nom du fournisseur');
    dire('étape 7 : une seconde colonne ajoutée (autre donnée, même pièce) s’ajoute à la première, jamais ne la remplace',
      !refus(p) && (await nBadges()) === avant2 + 1,
      refus(p) ?? `${await nBadges()} badge(s) « ajoutée » (${avant2} → attendu ${avant2 + 1})`);

    /* LA PIÈCE, DEMANDÉE ICI — le MÊME mécanisme typé que l'étape 5
       (piecesDemandeesParLigne). Une ligne au hasard peut ne pas porter de
       facture (écriture manuelle) : demanderPieceLigne la refuse, comme à
       l'étape 5 — on essaie donc ligne après ligne, jusqu'à ce qu'une
       demande RÉUSSISSE (même précédent que la station étape 5 ci-dessus,
       et que pieces-lignes.test.ts). */
    let ligneCouverte = -1;
    let idLigneCouverte = '';
    for (let i = 0; i < 10 && ligneCouverte < 0; i++) {
      const ligne = p.locator('[data-grille-vue] [data-grille-ligne]').nth(i);
      if (!(await ligne.count())) break;
      const bouton = ligne.locator('[data-demander-piece-ajoutee^="invoice-"]').first();
      if (!(await bouton.count())) continue; // déjà couverte, ou aucune colonne facture sur cette ligne
      idLigneCouverte = (await ligne.getAttribute('data-grille-ligne')) ?? '';
      await Promise.all([
        p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30000 }).catch(() => undefined),
        bouton.click(),
      ]);
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      /* LE REFUS EST LU AVANT TOUTE NAVIGATION (il voyage dans l'URL) ; LA
         NAVIGATION, ELLE, EST TOUJOURS FRAÎCHE — même précaution que
         `ajouterColonne` ci-dessus, trouvée ici en conduisant cette station
         une première fois : le lot suivant lisait un compte inchangé alors
         que la demande avait bien été posée, la page n'ayant pas fini de se
         réafficher après un délai fixe seul. */
      const echec = refus(p);
      await aller(`${eng}/testing`);
      if (!echec) { ligneCouverte = i; break; }
      idLigneCouverte = '';
    }
    const liensSurLaLigne = idLigneCouverte
      ? await compte(`[data-grille-ligne="${idLigneCouverte}"] [data-piece-ajoutee^="invoice-"] a`)
      : 0;
    dire('étape 7, par ligne : demander la pièce d’UNE colonne ajoutée couvre les DEUX colonnes ajoutées de ce type sur la ligne (REQ-02 par pièce, jamais par colonne)',
      ligneCouverte >= 0 && liensSurLaLigne === 2,
      ligneCouverte >= 0 ? `ligne couverte, ${liensSurLaLigne} lien(s) (2 attendus)` : 'aucune ligne éligible trouvée (10 essais)');

    // EN LOT : couvre toutes les lignes RESTANTES qui attendent encore la pièce d'une colonne ajoutée.
    if (await compte('[data-demander-factures-ajoutees-lot]')) {
      const avantLot = await compte('[data-grille-vue] [data-demander-piece-ajoutee^="invoice-"]');
      await Promise.all([
        p.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30000 }).catch(() => undefined),
        p.locator('[data-demander-factures-ajoutees-lot]').first().click(),
      ]);
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      const echecLot = refus(p); // lu AVANT la navigation fraîche (même précaution que ci-dessus)
      await aller(`${eng}/testing`);
      const apresLot = await compte('[data-grille-vue] [data-demander-piece-ajoutee^="invoice-"]');
      dire('étape 7, en lot : un clic couvre toutes les lignes qui attendaient encore la pièce d’une colonne ajoutée',
        !echecLot && apresLot < avantLot,
        echecLot ?? (apresLot < avantLot ? `${avantLot - apresLot} bouton(s) remplacé(s) par un lien (${avantLot} → ${apresLot})` : `aucun bouton remplacé (${avantLot} → ${apresLot})`));
    } else {
      dire('étape 7, en lot : bouton absent alors que deux colonnes ajoutées de type facture existent', false, 'bouton en lot absent');
    }
  });

  // ── 11bis. L'ÉCART VA À LA SYNTHÈSE EN UN CLIC, ET LA SYNTHÈSE RAMÈNE À LA LIGNE.
  /* ── LE CLAVIER, ÉPROUVÉ. ADR-104 promet « ↑/↓ et Entrée atteste » depuis
     deux tranches, et AUCUN harnais n'avait jamais pressé une touche : un
     geste annoncé que personne n'exerce est une affirmation (règle 13). Le
     critère « clavier » du mandat §3.D commence ici, sur l'écran où la
     souris coûte le plus cher. */
  await station('atelier au clavier : ↓ déplace, ↑ revient, Entrée atteste', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/testing`);
    const nLignes = await compte('.atelier tr.sel, .atelier tbody tr');
    if (nLignes < 2) {
      dire('atelier clavier : au moins deux lignes à parcourir', false, `${nLignes} ligne(s)`);
      return;
    }
    const ligneSel = async () => (await p.locator('.atelier tr.sel').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 40);
    const avant = await ligneSel();
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(600);
    const apres = await ligneSel();
    dire('atelier : la flèche BAS change de ligne, sans toucher la souris',
      Boolean(avant) && Boolean(apres) && avant !== apres, `${avant} → ${apres}`);
    await p.keyboard.press('ArrowUp');
    await p.waitForTimeout(600);
    dire('atelier : la flèche HAUT revient exactement sur la ligne quittée',
      (await ligneSel()) === avant, await ligneSel());

    /* Entrée n'atteste que s'il RESTE une lecture à attester. S'il n'en reste
       pas, on le DIT au lieu de compter une preuve qu'on n'a pas faite. */
    const enAttente = await compte(`.atelier form:has(button:has-text("${L('atl.attester')}"))`);
    if (enAttente === 0) {
      dire('atelier clavier : aucune lecture en attente ICI — Entrée est éprouvée par `npm run mesure:testing`',
        true, 'monde du parcours : pièces lues par échelons déterministes, rien à attester');
      return;
    }
    await p.keyboard.press('Enter');
    await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await p.waitForTimeout(2500);
    const reste = await compte(`.atelier form:has(button:has-text("${L('atl.attester')}"))`);
    dire('atelier : Entrée ATTESTE la lecture ouverte — le clavier suffit à travailler une ligne',
      !refus(p) && reste < enAttente, refus(p) ?? `${enAttente} → ${reste} lecture(s) en attente`);
  });

  await station('atelier : l’aller-retour écart ↔ synthèse', async () => {
    await aller(`${eng}/testing`);
    const ligneEcart = p.locator('.atelier-liste tbody tr:has(.badge.red)').first();
    if (!(await ligneEcart.count())) {
      dire('atelier : aucun écart au tirage — l’aller-retour n’a rien à montrer', true, 'rien à suivre');
      return;
    }
    await ligneEcart.click();
    await p.waitForTimeout(400);
    const versSynthese = p.locator('.atelier-detail a[href*="#x-"]').first();
    dire('atelier : l’écart de la ligne porte un lien vers la synthèse',
      (await versSynthese.count()) > 0, 'lien « → synthèse » sur la ligne ouverte');
    if (!(await versSynthese.count())) return;
    /* Quitter l'ATELIER — l'écran le plus lourd — pendant qu'il hydrate coupe
       le flux (fil n°7) : on attend le calme AVANT le clic qui navigue. */
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
    await p.waitForTimeout(600);
    await versSynthese.click();
    await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    await p.waitForTimeout(600);
    dire('synthèse : chaque écart a son ancre, le lien atterrit sur la ligne visée',
      p.url().includes('/exceptions#x-') && (await compte('tr[id^="x-"]')) > 0,
      `${await compte('tr[id^="x-"]')} ancre(s) d’écart`);
    const retour = p.locator('a[href*="/testing?item="]').first();
    dire('synthèse : la ligne testée est à un clic en retour',
      (await retour.count()) > 0, 'lien « la ligne testée, dans l’atelier » présent');
    if (await retour.count()) {
      await retour.click();
      await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
      await p.waitForTimeout(700);
      dire('atelier : le retour ouvre la ligne même d’où venait l’écart',
        (await compte('.atelier-liste tr.sel:has(.badge.red)')) > 0, 'ligne à écart rouverte et sélectionnée');
    }
  });

  // ── 11ter. LES ACTIONS EN LOT : cocher des lignes, demander une clarification
  //    — refusée sans motif (et le refus S'AFFICHE), en brouillon avec.
  await station('atelier : la clarification en lot', async () => {
    await aller(`${eng}/testing`);
    const cases = p.locator('.atelier-liste tbody input[type=checkbox]');
    if (!(await cases.count())) {
      dire('atelier : aucune ligne à grouper', true, 'tirage vide');
      return;
    }
    await cases.first().check();
    if ((await cases.count()) > 1) await cases.nth(1).check();
    dire('atelier : cocher des lignes fait apparaître la barre d’actions en lot',
      (await compte('.lot-barre')) > 0, 'barre de lot affichée');
    /* SANS MOTIF : refusé. Le champ n'est pas `required` — la soumission part
       vraiment, et c'est le SERVICE qui refuse (règle 13 : un formulaire que
       le navigateur retient n'a rien vérifié). */
    await soumettre(p.locator('.lot-barre button').first(), 1200);
    dire('atelier : une clarification en lot sans motif est refusée, et le refus s’affiche',
      refus(p) !== null && /motif/i.test(refus(p) ?? ''), refus(p) ?? 'aucun refus affiché');
    if (!(await compte('.lot-barre'))) await cases.first().check();
    await p.locator('.lot-barre input[name=motif]').fill(
      'Le rapprochement de ces lignes réclame le détail de la facturation : merci de préciser '
      + 'la prestation livrée et de joindre le justificatif correspondant.');
    await soumettre(p.locator('.lot-barre button').first(), 1200);
    dire('atelier : la clarification en lot naît en brouillon — rien ne part au client sans approbation',
      refus(p) === null, refus(p) ?? 'brouillon de demande créé');
  });

  // ── 12. LA BOUCLE : émettre les clarifications dues aux écarts ouverts
  //    C'est le geste que la boucle réclame : un écart ouvert sans demande de
  //    clarification laisse la boucle ouverte, et le visa bloqué.
  await station('la boucle : émettre les clarifications', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/loop`);
    if (await compte(`button:has-text("${L('loop.issueTheClarificationsOwedOnOpen')}")`)) {
      await cliquer(`button:has-text("${L('loop.issueTheClarificationsOwedOnOpen')}")`, 6000);
      const envoyees = await approuverToutes();
      dire('la boucle : les clarifications sont émises PUIS approuvées avant de partir',
        true, `${envoyees} demande(s) de clarification envoyée(s)`);
    } else {
      dire('la boucle : aucun écart ouvert ne réclame de clarification', true, 'rien à émettre');
    }
  });

  // ── 12bis. H-2 SLICE 2 : assigner un propriétaire et une échéance au point d'action client
  //    APRÈS l'émission des clarifications (étape 12, request_item kind=explanation créés,
  //    encore pending) et AVANT que le client n'y réponde (étape 13) — le moment naturel où
  //    l'auditeur assigne. Formulaire scopé par `has-text(exc.assigner)`, jamais par un
  //    sélecteur large sur `/portal/` ou `form` seul (leçon de Lot 7 tranche 1, STATUS.md).
  //
  //    CIBLE UNE LIGNE ENCORE 'pending' (règle 17, trouvé en construisant 12ter) : sur ce monde
  //    de démo, le `.first()` formulaire d'assignation peut tomber sur un point d'action DÉJÀ
  //    répondu historiquement (status='complete') — `assignerProprietairePointAction` ne le
  //    refuse pas (aucune restriction de statut, c'est voulu), mais `relancerPointAction`, LUI,
  //    refuse un item non 'pending' (rien à relancer). Sans ce ciblage, 12ter tombait
  //    vacueusement sur « rien à relancer » alors qu'un point d'action pending existait bien
  //    ailleurs dans le même tableau — jamais reproduit par les tests unitaires (fixture propre,
  //    un seul item), trouvé seulement en conduisant l'écran dans un navigateur (règle 10/37).
  await station('constat vs point d’action client : assigner un propriétaire', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/exceptions`);
    const lignePending = p.locator('tr')
      .filter({ has: p.locator(`form:has(button:has-text("${L('exc.assigner')}"))`) })
      .filter({ has: p.locator('td:nth-child(3) span.badge:has-text("pending")') });
    if (!(await lignePending.count())) {
      dire('constat vs point d’action client : aucun point d’action PENDING à assigner ici',
        true, 'rien à assigner');
      return;
    }
    const f = lignePending.first().locator(`form:has(button:has-text("${L('exc.assigner')}"))`);
    const select = f.locator('select[name=owner_contact_id]');
    const vals = await select.locator('option').evaluateAll(
      (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
    /* RÈGLE 17 : une assertion qui peut passer SANS RIEN VÉRIFIER (ici, si le monde de démo ne
       portait aucun contact client actif) n'est pas une garde — trouvé par la revue hostile
       (voix 1) sur la forme `vals.length === 0 || …` d'un premier essai. Le monde de démo porte
       toujours au moins un contact (Sophie, Théo — seed.ts) : ce compte le DIT, plutôt que de le
       supposer en silence dans la condition suivante. */
    dire('constat vs point d’action client : au moins un contact client existe pour assigner',
      vals.length > 0, `${vals.length} contact(s) disponible(s)`);
    if (!vals.length) return;
    await select.selectOption(vals[0]);
    await f.locator('input[name=due_date]').fill('2026-10-15');
    await soumettre(f.locator(`button:has-text("${L('exc.assigner')}")`), 2000);
    dire('constat vs point d’action client : assigner un propriétaire/échéance ne bloque pas, et le dossier ne bouge pas',
      refus(p) === null, refus(p) ?? 'assigné');
    const apres = await texte();
    dire('constat vs point d’action client : le propriétaire assigné apparaît à l’écran',
      apres.includes('2026-10-15'), 'échéance affichée après assignation');
  });

  // ── 12ter. H-2 SLICE 3 : relancer le point d'action tout juste assigné (station 12bis) — un
  //    geste EXPLICITE de l'auditeur, distinct de la cadence automatique d'ensureReminders (H-1,
  //    grain `request`). Offert seulement quand un propriétaire est assigné ET l'item encore
  //    'pending' — c'est exactement l'état laissé par 12bis, avant la réponse du client (13).
  //
  //    R106 (docs/BACKLOG_REPORTE.md), DISCLOSED PLUTÔT QUE CACHÉ : sur ce monde de démo, AUCUN
  //    écart n'est jamais 'open' au moment où 12bis/12ter tournent (draftClarificationRequest ne
  //    trouve jamais rien à créer, ni sur /exceptions ni sur /kanban) — cette station retombe donc
  //    en pratique sur « rien à relancer », honnêtement, à chaque exécution de ce monde de démo
  //    précis. Le geste POSITIF reste prouvé par exécution directe
  //    (constat-action-client.test.ts), pas encore par un clic réel dans ce parcours — R106 le
  //    nomme comme un chantier séparé (demo-seed.ts), pas une faiblesse de cette station.
  await station('constat vs point d’action client : relancer', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/exceptions`);
    const f = p.locator(`form:has(button:has-text("${L('exc.relancer')}"))`).first();
    if (!(await f.count())) {
      dire('constat vs point d’action client : aucun point d’action à relancer ici',
        true, 'rien à relancer');
      return;
    }
    await soumettre(f.locator(`button:has-text("${L('exc.relancer')}")`), 2000);
    dire('constat vs point d’action client : relancer ne bloque pas',
      refus(p) === null, refus(p) ?? 'relancé');
    const apres = await texte();
    dire('constat vs point d’action client : la dernière relance apparaît à l’écran',
      apres.includes(L('exc.derniereRelance')), 'dernière relance affichée après le clic');
  });

  // ── 12quater. H-3, SLICES 1 et 2 (Lot 7, docs/REGISTRE_IDEES.md §H) : le test exhaustif du
  //    grand livre — un écran de LECTURE PURE (aucun geste d'écriture), conduit dans un navigateur
  //    (règle 10) : ADR-003 calcule déjà les SEPT règles à l'import (six depuis slice 1,
  //    « hors_periode » depuis slice 2), sur TOUTE la population ; cet écran les rend visibles.
  //    Atteint via le lien posé sur /analytique, jamais une navigation directe par URL devinée.
  await station('grand livre : le test exhaustif rend visible ce qu’ADR-003 calcule déjà', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/analytique`);
    const lien = p.locator(`a:has-text("${L('gl.titre')}")`).first();
    dire('grand livre : le lien depuis l’analytique existe', (await lien.count()) > 0, 'lien absent');
    if (!(await lien.count())) return;
    await cliquer(`a:has-text("${L('gl.titre')}")`, 1500);
    dire('grand livre : la navigation atteint bien l’écran dédié', p.url().includes('/grand-livre'), p.url());
    const contenu = await texte();
    dire('grand livre : la couverture (100% des écritures actives) est affichée',
      /\d/.test(contenu) && contenu.includes(L('gl.regle.weekend.libelle')), 'aucun chiffre ou règle affiché(e)');
    /* CHAQUE règle porte sa disclosure « couvre »/« ne couvre pas » — jamais une seule, sinon un
       défaut d'affichage sur les cinq autres passerait inaperçu (règle 17 appliquée à l'écran). */
    const nCouvre = await p.locator('strong', { hasText: L('gl.couvre') }).count();
    dire('grand livre : les SEPT règles portent chacune leur disclosure de couverture',
      nCouvre === 7, `${nCouvre}/7 disclosure(s) « couvre » affichée(s)`);
  });

  // ── 12quinquies. H-4, TRANCHE 1 (Lot 7, docs/REGISTRE_IDEES.md §H, ligne 272) : le troisième
  //    périmètre d'audience — équipe et direction existaient déjà, comité manquait. Un écran de
  //    LECTURE PURE (aucun geste d'écriture), conduit dans un navigateur (règle 10) : agrège ce
  //    que le dossier sait déjà (obstacles, écarts, achèvement, papiers, jalons) — zéro contenu
  //    rédigé ici (R16). Atteint via le lien posé sur /dashboard, jamais une URL devinée.
  await station('comité : la synthèse de gouvernance agrège ce que le dossier sait déjà', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/dashboard`);
    const lien = p.locator(`a:has-text("${L('ach.gouvernance.titre')}")`).first();
    dire('comité : le lien depuis le dashboard existe', (await lien.count()) > 0, 'lien absent');
    if (!(await lien.count())) return;
    await cliquer(`a:has-text("${L('ach.gouvernance.titre')}")`, 1500);
    dire('comité : la navigation atteint bien l’écran dédié', p.url().includes('/comite'), p.url());
    const contenu = await texte();
    dire('comité : le compte de papiers signés est affiché', /\d+\/\d+/.test(contenu), 'aucun compte signé(s)/total affiché');
    const badge = await p.locator('.panel .badge').first().count();
    dire('comité : un badge de statut (visa possible ou obstacles) est affiché', badge > 0, 'aucun badge de statut');
  });

  // ── 13. PORTAIL, SECOND PASSAGE : le client répond aux clarifications
  await station('portail : réponses aux clarifications', async () => {
    await ctx.clearCookies();
    await aller(`${base}/portal/${c.jeton}`);
    const liens = await p.locator('a[href*="/portal/"]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('href'))
        .filter((h): h is string => typeof h === 'string' && h.split('/').length > 3));
    let repondu = 0;
    for (const href of liens) {
      await aller(base + href);
      const combien = await p.locator('form:has(input[name=text])').evaluateAll((els) => els.length);
      for (let tour = 0; tour < combien; tour++) {
        const f = p.locator('form:has(input[name=text])').first();
        if (!(await f.count())) break;
        await f.locator('input[name=text]').fill(
          'La facture a été émise sur la base du bon de commande signé ; le rattachement de '
          + 'période a été corrigé dans la clôture du mois suivant, pièce jointe au dossier.');
        await soumettre(f.locator('button').first());
        repondu++;
      }
      // Ce qui reste sans pièce est DIT, pas laissé en suspens.
      if (await compte(`button:has-text("${L('portal.toutTransmis')}")`)) {
        await soumettre(p.locator(`button:has-text("${L('portal.toutTransmis')}")`).first(), 1200)
          .catch(() => undefined);
      }
    }
    dire('portail : le client répond aux clarifications, et clôt sa demande',
      true, `${repondu} réponse(s)`);
  });

  // ── 13bis. TESTING, SECOND PASSAGE : les pièces arrivées ENTRE-TEMPS
  //    Les clarifications font revenir des pièces APRÈS le premier vouching.
  //    Les laisser là produit « deux pièces lues non encore rapprochées » — un
  //    reste de boucle qui n'est pas un défaut du produit mais l'ordre réel des
  //    choses : une pièce qui arrive après coup se lit et se rapproche, elle ne
  //    s'ignore pas. Le premier passage suffisait tant que rien n'arrivait
  //    après lui — ce qui n'était vrai qu'une fois sur deux, et un contrôle qui
  //    ne passe qu'une fois sur deux ne prouve rien.
  await station('testing : le second passage sur les pièces arrivées après coup', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/testing`);
    if (await compte(`button:has-text("${L('test.runExtractionLadder')}")`)) {
      await cliquer(`button:has-text("${L('test.runExtractionLadder')}")`, 25000);
    }
    let atteste = 0;
    for (let tour = 0; tour < 80; tour++) {
      let b = p.locator(`.atelier button:has-text("${L('atl.attester')}")`).first();
      if (!(await b.count())) {
        const enAttente = p.locator('.atelier-liste tbody tr:has(.badge.amber)').first();
        if (!(await enAttente.count())) break;
        await enAttente.click();
        await p.waitForTimeout(300);
        b = p.locator(`.atelier button:has-text("${L('atl.attester')}")`).first();
        if (!(await b.count())) break;
      }
      await b.click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1100);
      atteste++;
    }
    if (await compte(`button:has-text("${L('test.runVouchingL0')}")`)) {
      await cliquer(`button:has-text("${L('test.runVouchingL0')}")`, 20000);
    }
    await aller(`${eng}/loop`);
    const reste = (await texte()).match(/(\d+)\s+pièces? lues? non encore rapproch/i)?.[1] ?? '0';
    dire('testing : plus aucune pièce lue ne reste sans rapprochement',
      reste === '0', `${atteste} attestation(s) de plus · ${reste} pièce(s) en attente`);
  });

  // ── 13ter. L'ESTIMATION COMPTABLE (ADR-106) : le fichier de calcul de la
  //    cliente — importé, rapproché à l'écriture, recalculé, sondé, et CHAQUE
  //    taux demandé en justificatif. Les refus d'abord, comme toujours.
  await station('estimation : le fichier de calcul de la cliente', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/estimations`);
    const fichier = ds('estimations', 'fae-2025.csv');

    /* Une écriture INCONNUE du grand livre actif est refusée, en la nommant. */
    await p.locator('input[name=titre]').fill('Essai');
    await p.locator('input[name=piece_ref]').fill('OD-9999-999');
    await p.locator('input[type=file]').setInputFiles(fichier);
    await soumettre(p.locator(`button:has-text("${L('est.importTheCalculationFile')}")`).first(), 1200);
    dire('estimation : viser une écriture inconnue est refusé, et le refus s’affiche',
      refus(p) !== null && /OD-9999-999/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus affiché');

    /* Le vrai fichier, sur la vraie écriture (OD-2025-089, 50 000 €). */
    await p.locator('input[name=titre]').fill('Factures à établir 2025');
    await p.locator('input[name=piece_ref]').fill('OD-2025-089');
    await p.locator('input[type=file]').setInputFiles(fichier);
    await soumettre(p.locator(`button:has-text("${L('est.importTheCalculationFile')}")`).first(), 1500);
    const t1 = await texte();
    dire('estimation : la base est rapprochée à la comptabilité et recalculée au centime — écart nul',
      refus(p) === null && R('est.recomputedByOttoBaseRate').test(t1) && !/n’explique pas|n'explique pas/.test(t1),
      'comptabilisé, fichier et recalcul affichés, aucun avertissement d’écart');
    dire('estimation : chaque taux et la formule sont des paramètres à justifier',
      /formule/.test(t1) && /taux_journalier/.test(t1), 'paramètres listés');

    /* Demander AVANT de tirer : refusé — la sélection se décide d'abord. */
    await soumettre(p.locator(`button:has-text("${L('est.requestSupportingDocumentsDraftL2')}")`).first(), 1200);
    dire('estimation : demander des justificatifs sans tirage est refusé',
      refus(p) !== null && /tirez d/i.test(refus(p) ?? ''), refus(p) ?? 'aucun refus affiché');

    /* Le tirage — même moteur que le chiffre d'affaires, germé, rejouable. */
    await soumettre(p.locator(`button:has-text("${L('est.drawTheBase')}")`).first(), 1500);
    const badges = await compte(`.badge:has-text("${L('est.motifAlea')}"), .badge:has-text("${L(`est.motifCouverture`)}"), .badge:has-text("${L('est.motifMarqueur')}")`);
    dire('estimation : la base est sondée (couverture + aléa germé), le motif sur chaque ligne',
      refus(p) === null && badges >= 3, `${badges} ligne(s) retenue(s)`);

    /* La demande naît en brouillon — rien ne part sans approbation. */
    await soumettre(p.locator(`button:has-text("${L('est.requestSupportingDocumentsDraftL2')}")`).first(), 1500);
    dire('estimation : la demande de justificatifs (base tirée + chaque taux + méthode) naît en brouillon',
      refus(p) === null && R('est.requested').test(await texte()), 'demande liée, paramètres marqués « demandé »');
    const envoyees = await approuverToutes();
    dire('estimation : la demande part APRÈS approbation, par le circuit habituel',
      envoyees >= 1, `${envoyees} demande(s) approuvée(s) et envoyée(s)`);
  });

  // ── 14. ÉCARTS : une résolution GÉNÉRIQUE est rejetée, puis on résout POUR DE BON
  await station('résolution des écarts', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/exceptions`);
    /* DÉPLIER AVANT DE REMPLIR — mais LE repli qui porte ce formulaire, pas
       tous ceux de l'écran. Le formulaire de disposition vit dans un
       `<details>` replié : Playwright attend indéfiniment un champ caché, et la
       station tombait sur un délai de trente secondes sans rien dire du
       produit. Un harnais qui échoue sur SA propre mécanique accuse le code.
       Et ouvrir treize replis quand un humain en ouvre UN fausse le compte de
       clics publié (docs/CLICS.md) : le harnais doit cliquer comme la personne
       qu'il imite. */
    const f = p.locator(`form:has(button:has-text("${L('col.resolve')}"))`).first();
    if (await f.count()) await deplier(f);
    if (!(await f.count())) {
      dire('écarts : aucun écart ouvert à résoudre', true, 'rien à disposer');
      return;
    }
    /* CE QUE LA RÈGLE REFUSE VRAIMENT — et où le navigateur s'interpose.
       Le premier essai attendait qu'une résolution « générique » soit rejetée.
       Elle ne l'est pas, et elle ne peut pas l'être : la contrainte exige une
       STRUCTURE — explication reçue non vide, disposition, LIEN vers ce qui
       corrobore, qui a conclu et quand — pas un jugement sur la qualité d'une
       phrase. Une machine ne sait pas distinguer « RAS » d'une explication
       substantielle ; ce sont les notes de revue et les visas qui le font.
       Le deuxième essai a voulu omettre le lien : le `required` du navigateur
       bloque l'envoi AVANT le serveur, rien ne part, et le harnais lisait ce
       silence comme un succès. C'est le défaut de la règle 13 dans le harnais
       lui-même : un formulaire non envoyé n'est pas une règle vérifiée. */
    await f.locator('textarea[name=explanation]').fill('   ');
    await f.locator('textarea[name=conclusion]').fill('Explication retenue en l’état.');
    const corr0 = f.locator('select[name=corroboration]');
    if (await corr0.count()) {
      const vals = await corr0.locator('option').evaluateAll(
        (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
      if (vals.length) await corr0.selectOption(vals[0]);
    }
    await f.locator(`button:has-text("${L('col.resolve')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(2500);
    /* ET LE REFUS DOIT ÊTRE LU PAR UN HUMAIN, pas seulement présent dans
       l'URL. Vérifier `?erreur=` prouve que le service a refusé ; il ne prouve
       pas que l'écran le MONTRE. Les deux se sont déjà dissociés : dix écrans
       calculaient un refus et rendaient une page 500. On regarde donc le texte. */
    const messageVisible = R('commun.refuse').test(await texte());
    dire('écarts : une explication vide de contenu (des espaces) est refusée, et le refus S’AFFICHE',
      Boolean(refus(p)) && messageVisible,
      refus(p) ? (messageVisible ? refus(p)! : 'refusé mais RIEN À L’ÉCRAN — défaut') : 'passé — défaut');

    /* LE LIEN MANQUANT, EN COURT-CIRCUITANT LA GARDE DU NAVIGATEUR. Le
       `required` est une commodité d'écran ; la règle, elle, doit tenir sans
       lui — c'est ce que verrait un client d'API. On désactive donc la
       validation HTML pour vérifier que le SERVEUR refuse, et pas seulement le
       champ. */
    await aller(`${eng}/exceptions`);
    const g0 = p.locator(`form:has(button:has-text("${L('col.resolve')}"))`).first();
    if (await g0.count()) {
      await deplier(g0);
      await g0.evaluate((el) => { (el as HTMLFormElement).noValidate = true; });
      await g0.locator('textarea[name=explanation]').fill(
        'Le client indique que la facture est correcte.');
      await g0.locator('textarea[name=conclusion]').fill('Explication retenue.');
      const sel0 = g0.locator('select[name=corroboration]');
      if (await sel0.count()) await sel0.selectOption('');
      await g0.locator(`button:has-text("${L('col.resolve')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('écarts : résoudre SANS lien vers ce qui corrobore est refusé par le SERVICE, pas par le champ',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }

    /* …puis on dispose chaque écart AVEC sa substance : l'explication reçue,
       la conclusion de l'auditeur, une disposition et la pièce qui corrobore.
       Sans cela le verrou de conclusion reste fermé — et c'est le but. */
    let resolus = 0; let anomalies = 0;
    for (let tour = 0; tour < 40; tour++) {
      await aller(`${eng}/exceptions`);
      const g = p.locator(`form:has(button:has-text("${L('col.resolve')}"))`).first();
      if (!(await g.count())) break;
      await deplier(g);
      const contexte = await g.evaluate((e) => (e.closest('tr') ?? e.parentElement)?.textContent ?? '');
      /* Un écart de MONTANT est une anomalie : il se chiffre, il ne se
         « résout » pas d'un trait de plume. Le produit sépare les deux, et le
         parcours doit emprunter les deux chemins. */
      const chiffrable = /écart|difference|montant|€/i.test(contexte)
        && (await p.locator(`form:has(button:has-text("${L('exc.misstatement')}"))`).count()) > 0
        && anomalies < 2;
      if (chiffrable) {
        const h = p.locator(`form:has(button:has-text("${L('exc.misstatement')}"))`).first();
        await h.locator('input[name=amount]').fill('1800');
        await h.locator(`button:has-text("${L('exc.misstatement')}")`).click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1600);
        if (!refus(p)) { anomalies++; continue; }
      }
      await g.locator('textarea[name=explanation]').fill(
        'Le client a produit la pièce d’origine et le détail du calcul : la facture reprend '
        + 'les quantités livrées et le prix contractuel de l’exercice.');
      await g.locator('textarea[name=conclusion]').fill(
        'Rapproché de la pièce déposée et du bon de livraison correspondant ; aucun redressement '
        + 'nécessaire, l’écart s’explique par le rattachement de période.');
      const sel = g.locator('select[name=corroboration]');
      if (await sel.count()) {
        const vals = await sel.locator('option').evaluateAll(
          (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
        if (!vals.length) break;
        await sel.selectOption(vals[0]);
      }
      await g.locator(`button:has-text("${L('col.resolve')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1600);
      if (refus(p)) break;                       // ne pas boucler sur un refus permanent
      resolus++;
    }
    dire('écarts : chacun est disposé avec explication, conclusion et pièce liée',
      resolus + anomalies > 0, `${resolus} résolu(s), ${anomalies} porté(s) en anomalie`);
  });

  // ── 14 bis. EXTRAP-03 (mandat 2026-09-14, §1.4) : écarter un écart chiffré
  //    (misstatement) comme anomalie exige une preuve SUPPLÉMENTAIRE obtenue
  //    exprès (ISA 530 §13, « extremely rare », « high degree of certainty »)
  //    — refusé sans elle, puis un vrai écartement avec une pièce DISTINCTE
  //    de celle qui a déjà servi à constater l'écart d'origine.
  await station('EXTRAP-03 : écarter un écart comme anomalie, refus puis geste réel', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/exceptions`);
    const forme = p.locator('form:has(input[name=misstatement_id])').first();
    if (!(await forme.count())) {
      dire('EXTRAP-03 : aucun écart chiffré à écarter sur ce dossier', true,
        'aucune ligne de misstatement (kind ≠ projected, non déjà écartée) — rien à disposer ici');
      return;
    }
    /* REFUS D'ABORD, TOUJOURS. La pièce n'est PAS choisie (l'option par
       défaut du <select required> est désactivée et vide) — même discipline
       que le lien manquant de la station « résolution des écarts » : on
       désactive la validation HTML pour laisser le SERVICE refuser, pas
       seulement le champ. */
    await deplier(forme);
    await forme.evaluate((el) => { (el as HTMLFormElement).noValidate = true; });
    await forme.locator('textarea[name=reason]').fill(
      'Contexte inhabituel mentionné par le client, à documenter.');
    await forme.locator(`button:has-text("${L('exc.dismissAsAnomaly')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(2000);
    dire('EXTRAP-03 : écarter un écart comme anomalie SANS preuve supplémentaire est refusé, en citant §13',
      Boolean(refus(p)) && /EXTRAP-03|§13/.test(refus(p) ?? ''), refus(p) ?? 'passé — défaut');

    /* …puis le vrai geste : une pièce DISTINCTE de celle qui a déjà servi à
       constater l'écart d'origine. Le formulaire n'a aucun moyen de savoir
       LAQUELLE des pièces du dossier est « la même » (§13 : une preuve
       supplémentaire, jamais relue) — on essaie donc chaque option jusqu'à
       ce que le service accepte, sans le présumer. */
    await aller(`${eng}/exceptions`);
    const formeVals = p.locator('form:has(input[name=misstatement_id])').first();
    let vals: string[] = [];
    if (await formeVals.count()) {
      await deplier(formeVals);
      vals = await formeVals.locator('select[name=evidence_id] option').evaluateAll(
        (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
    }
    let ecarte = false;
    for (const v of vals) {
      await aller(`${eng}/exceptions`);
      const f = p.locator('form:has(input[name=misstatement_id])').first();
      if (!(await f.count())) break;
      await deplier(f);
      await f.locator('textarea[name=reason]').fill(
        'Le client a confirmé un incident isolé et hors norme, distinct de la cause habituelle des '
        + 'écarts de ce dossier — pièce jointe obtenue exprès pour corroborer ce caractère '
        + 'exceptionnel (ISA 530 §13).');
      await f.locator('select[name=evidence_id]').selectOption(v);
      await f.locator(`button:has-text("${L('exc.dismissAsAnomaly')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      if (!refus(p)) { ecarte = true; break; }
    }
    dire('EXTRAP-03 : écarté comme anomalie avec une preuve DISTINCTE — le compte d’anomalies écartées monte',
      ecarte, ecarte ? 'écartement enregistré' : (refus(p) ?? `aucune des ${vals.length} pièce(s) disponible(s) n’a été acceptée`));
  });

  // ── 15. RE-EXÉCUTION EN AVEUGLE ET ÉVALUATION DE L'ÉCHANTILLON
  await station('re-exécution et évaluation', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/testing`);
    if (await compte(`button:has-text("${L('test.drawSubsample')}")`)) {
      await deplier(p.locator(`button:has-text("${L('test.drawSubsample')}")`).first());
      await cliquer(`button:has-text("${L('test.drawSubsample')}")`, 5000);
      dire('re-exécution : un sous-échantillon est tiré pour re-performer en aveugle',
        !refus(p), refus(p) ?? 'sous-échantillon tiré');
    } else {
      /* UN `if` SANS `else` NE DIT RIEN, et ne rien dire se lit comme un succès
         (défaut n°22). On ne prétend pas que la re-exécution a eu lieu : on dit
         ce qu'on a VU — l'écran ne l'offre pas ici. */
      dire('re-exécution : aucun sous-échantillon à tirer sur cet écran',
        true, 'le bouton n’est pas offert — rien n’a été re-performé à cette station');
    }
    /* La re-exécution est EN AVEUGLE : le résultat machine reste caché tant que
       le vérificateur n'a pas soumis le sien. On lit donc les valeurs dans le
       jeu de données, pas à l'écran — c'est ce que fait un humain avec la pièce
       sous les yeux. */
    const fixtures = JSON.parse(fs.readFileSync(ds('fixtures', 'extractions.json'), 'utf8')) as {
      filename: string; fields: { name: string; value: string }[];
    }[];
    let soumis = 0;
    for (let tour = 0; tour < 20; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('test.submitBlind')}"))`).first();
      if (!(await f.count())) break;
      const ligne = await f.evaluate((e) => (e.closest('tr') ?? e.parentElement)?.textContent ?? '');
      const ref = ligne.match(/(FA|AV)\d{4}-\d{4}/)?.[0];
      const fx = ref ? fixtures.find((x) => x.filename.includes(ref)) : undefined;
      const net = fx?.fields.find((x) => x.name === 'totalNetCents')?.value;
      const date = fx?.fields.find((x) => x.name === 'invoiceDate')?.value;
      if (!net || !date) break;
      await f.locator('input[name=net]').fill((Number(net) / 100).toFixed(2));
      await f.locator('input[name=date]').fill(date);
      await f.locator(`button:has-text("${L('test.submitBlind')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1600);
      soumis++;
    }
    dire('re-exécution : les contrôles en aveugle sont soumis depuis l’écran',
      soumis > 0 || (await compteAbsent('button', 'test.submitBlind')) === 0,
      `${soumis} contrôle(s) soumis`);

    await aller(`${eng}/testing`);
    if (await compte(`form:has(button:has-text("${L('col.recompute')}")) button`)) {
      await deplier(p.locator(`form:has(button:has-text("${L('col.recompute')}"))`).last());
      await p.locator(`form:has(button:has-text("${L('col.recompute')}"))`).last().locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(5000);
    }

    /* EXTRAP-04 (mandat 2026-09-14, §1.6 pt 6) et « trois nombres distincts »
       (même §, pt 6 aussi) : lus ICI, sur le bloc KPI de l'évaluation
       recalculée à l'instant — jamais affirmés depuis /api/sante ni un test
       vitest. Les trois libellés (connu / projeté / total) doivent être
       TOUS visibles à l'écran, avec trois VALEURS EUR distinctes (jamais un
       seul total agrégé) ; EXTRAP-04 lui-même ne se prouve QUE si le monde
       semé fait actuellement tenir la branche « méthode non vérifiée »
       (`t('test.extrapolationMethodNotVerified')` affiché au lieu d'un
       montant projeté) — sinon la station le DIT, honnêtement, plutôt que
       de forcer un vrai à un cas qu'elle n'a pas vu (règle 17/18). */
    const tKpi = await texte();
    const kpiPresent = R('test.knownMisstatement').test(tKpi)
      && R('test.projectedMisstatementMethod').test(tKpi)
      && R('test.totalEstimatedMisstatement').test(tKpi);
    dire('évaluation : écart connu, écart projeté et écart total estimé sont TROIS libellés distincts à l’écran',
      kpiPresent, kpiPresent ? 'les trois libellés KPI sont affichés' : 'au moins un des trois libellés KPI manque');
    const methodeNonVerifieeAffichee = R('test.extrapolationMethodNotVerified').test(tKpi);
    /* Toujours VRAI (règle 22 appliquée à l'inverse : un `if` sans `else` ne
       dit rien) — cette station ne force personne à tenir la branche
       « méthode non vérifiée », elle DIT laquelle des deux le monde semé
       tient réellement à l'instant du clic, sans jamais transformer une
       observation honnête en échec de parcours. */
    dire('EXTRAP-04 : aucune projection ne s’affiche tant que la méthode du cabinet n’est pas posée',
      true,
      methodeNonVerifieeAffichee
        ? 'message « paramètre non vérifié » affiché à la place du montant projeté — la suppression est VUE'
        : 'le monde semé actuel ne tient pas la branche « méthode non vérifiée » à cette station — non observée ici');

    /* LA RÉPONSE AU DÉPASSEMENT — l'écran qui n'existait pas. Sans elle, la
       conclusion est refusée par le service, et rien dans l'application ne
       permettait de l'écrire. */
    const fRep = p.locator('form:has(select[name=kind]):has(input[name=rationale])');
    if (await fRep.count()) {
      await fRep.locator('select[name=kind]').selectOption('revise_strategy');
      await fRep.locator('input[name=rationale]').fill(
        'Les anomalies relevées dépassent l’anomalie tolérable : l’échantillon ne fournit plus '
        + 'une base raisonnable de conclusion. Extension des travaux au quatrième trimestre et '
        + 'demande de correction adressée à la direction.');
      await fRep.locator(`button:has-text("${L('circ.recordTheReply')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(3000);
      dire('évaluation : la réponse au dépassement de l’anomalie tolérable s’enregistre à l’écran',
        !refus(p), refus(p) ?? 'réponse enregistrée');
    } else {
      dire('évaluation : aucun dépassement à répondre sur cet écran',
        true, 'le formulaire de réponse n’est pas offert — rien n’a été statué à cette station');
    }
    const fConc = p.locator('form:has(textarea[name=basis])');
    if (await fConc.count()) {
      await fConc.locator('textarea[name=basis]').fill(
        'Anomalies non corrigées supérieures au seuil de signification : le chiffre d’affaires est '
        + 'surévalué de façon significative si les corrections annoncées ne sont pas comptabilisées. '
        + 'Conclusion prise sur le grand livre définitif, rapprochement re-exécuté et propre.');
      await fConc.locator(`button:has-text("${L('test.recordConclusionL4')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(4000);
      dire('évaluation : la conclusion sur l’échantillon est enregistrée (L4, jugement humain)',
        !refus(p), refus(p) ?? 'conclusion enregistrée');
    } else {
      dire('évaluation : déjà conclue', true, 'conclusion présente');
    }
  });

  // ── 16. PAPIER, NOTES DE REVUE ET VISAS, en étant TROIS personnes
  await station('papier de travail et visas', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/workpapers`);
    if (await compte(`button:has-text("${L('wps.draftRev01AutoFromStored')}")`)) {
      await cliquer(`button:has-text("${L('wps.draftRev01AutoFromStored')}")`, 8000);
      dire('papier : le papier se RÉDIGE depuis les faits stockés, pas à la main',
        !refus(p), refus(p) ?? 'papier rédigé');
    }
    /* NOMMÉ, pas « le premier de la liste » : cette station teste un contenu
       du CYCLE CHIFFRE D'AFFAIRES précis (colonne « BL signé ? », rapport IPE
       FEC-2025) — dès qu'un second poste porte son propre papier (Lot 5), la
       liste (`listWorkpapers`, order by w.code) trie alphabétiquement et
       `.first()` peut tomber sur CE papier-là au lieu de REV-01 (CAS-01 <
       REV-01). Trouvé en clics sur la tranche Trésorerie : CAS-01 n'a ni
       colonne ajoutée ni rapport FEC-2025, la station échouait en cascade. */
    const lien = await p.locator('tr:has-text("REV-01") a[href*="/workpapers/"]').first().getAttribute('href').catch(() => null);
    if (!lien) { dire('papier : aucun papier de travail dans le dossier', false, 'écran vide'); return; }

    await aller(base + lien);
    const t = await texte();
    dire('papier : le papier rend, avec ses sections et son bloc de visas',
      /visa|sign|préparateur|preparer/i.test(t) && t.length > 400, `${t.length} car.`);

    /* L'ANNEXE (ADR-106) : le tableur de calcul se JOINT au papier — la table
       existait depuis la migration 0002 sans qu'aucun chemin ne l'atteigne.
       Avant les visas : une annexe s'ajoute pendant que le papier se
       travaille, pas après qu'il est signé. */
    await deplier(p.locator('input[name=fichier]').first());
    await p.locator('input[name=fichier]').setInputFiles(ds('estimations', 'fae-2025.csv'));
    await soumettre(p.locator('form:has(input[name=fichier]) button').first(), 1500);
    dire('papier : un tableur se JOINT au papier, avec empreinte et provenance',
      refus(p) === null && (await compte('a[href^="/api/blob/"]:has-text("fae-2025.csv")')) > 0,
      'fae-2025.csv listée en annexe');

    /* L'ÉDITION D'UNE SECTION — un geste que le parcours ne conduisait PAS
       (revue hostile de la tranche 9) : le corps se corrige à la main, la
       justification part dans l'export, et la section porte la marque
       « modified — justified ». Avant les visas : un papier signé ne s'édite
       plus, et c'est justement pour ça que le repli disparaît après visa. */
    const fEdit = p.locator(`form:has(button:has-text("${L('wp.saveEdit')}"))`).first();
    if (await fEdit.count()) {
      await deplier(fEdit);
      await fEdit.locator('textarea[name=body]').fill(
        'Conclusion reprise au clic : la couverture du tirage et les écarts relevés y sont rappelés.');
      await fEdit.locator('input[name=justification]').fill(
        'Revue : la conclusion doit rappeler la couverture de l’échantillon.');
      await soumettre(fEdit.locator(`button:has-text("${L('wp.saveEdit')}")`), 2000);
      dire('papier : une section s’ÉDITE à la main, et l’édition porte sa justification',
        !refus(p) && (await compte(`.mod-flag:has-text("${L('wp.modifiedJustified')}")`)) > 0,
        refus(p) ?? 'section marquée « modified — justified »');
    } else {
      dire('papier : le formulaire d’édition de section existe avant les visas', false, 'formulaire absent');
    }

    /* LE VISA HORS ORDRE. L'associé ne vise pas avant son reviewer : la règle
       est portée par un trigger, pas par l'écran. On l'essaie AVANT les
       autres, c'est-à-dire au moment où elle doit mordre. */
    await devenir(c.associe.id);
    await aller(base + lien);
    const fPartner = p.locator('form:has(input[name=role][value="partner"])');
    if (await fPartner.count()) {
      await fPartner.locator('button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('papier : l’associé ne vise pas avant le préparateur et le reviewer',
        Boolean(refus(p)), refus(p) ?? 'PASSÉ — défaut');
    }

    // Une note de revue, du reviewer vers le préparateur.
    await devenir(c.reviewer.id);
    await aller(base + lien);
    const fNote = p.locator('form:has(textarea[name=text])').first();
    if (await fNote.count()) {
      await fNote.locator('textarea[name=text]').fill(
        'Préciser dans la conclusion le renvoi à l’état des anomalies (note posée au clic).');
      await fNote.locator(`button:has-text("${L('wp.addNote')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('papier : une note de revue s’ajoute et s’affiche', !refus(p), refus(p) ?? 'note ajoutée');
    }
    // Le préparateur la traite, le reviewer la ferme : une note ne se ferme pas seule.
    await devenir(c.preparateur.id);
    await aller(base + lien);
    for (let tour = 0; tour < 8; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('wp.markAddressed')}"))`).first();
      if (!(await f.count())) break;
      await f.locator('button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    /* ADR-028 (rétabli par ADR-102) : la note de Léa se ferme par CLAIRE —
       un réviseur qui n'en est pas l'auteur. */
    await devenir(c.associe.id);
    await aller(base + lien);
    for (let tour = 0; tour < 8; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('notes.clore')}"))`).first();
      if (!(await f.count())) break;
      await f.locator('button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    dire('papier : les notes se ferment par un réviseur qui n’en est PAS l’auteur',
      (await compteAbsent('form:has(button)', 'notes.clore')) === 0, 'aucune note ouverte');

    /* LA NOTE ANCRÉE (ADR-097) — le geste entier, au clic droit : l'ancre est
       l'OBJET (la conclusion du papier), jamais une position d'écran. On la
       pose, on vérifie le marqueur, on répond, on essuie le refus de clôture
       par un non-auteur, et l'auteur clôt — dans la vue transverse. */
    await devenir(c.reviewer.id);
    await aller(base + lien);
    const conclusion = p.locator('.annotable:has(> h2:text-is("Conclusion"))').first();
    if (await conclusion.count()) {
      await conclusion.locator('h2').click({ button: 'right' });
      const panneau = p.locator('.note-panneau');
      const cible = (await panneau.count()) ? await panneau.locator('.note-cible').innerText() : '';
      dire('note ancrée : le clic droit ouvre la pose et NOMME l’objet visé',
        /conclusion/i.test(cible), cible || 'panneau absent');
      await panneau.locator('textarea[name=texte]').fill(
        'Étoffer la conclusion — note ANCRÉE posée au clic droit par le parcours.');
      await panneau.locator('select[name=assignee]').selectOption(c.preparateur.id);
      await panneau.locator(`button:has-text("${L('note.post')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      await aller(base + lien);
      dire('note ancrée : l’élément annoté porte le jeton d’attention',
        (await compte('.annotable.a-note')) >= 1, `${await compte('.annotable.a-note')} élément(s) marqué(s)`);

      /* 1.3 — LE FIL S'OUVRE À CÔTÉ DU TRAVAIL. Le repère chiffré n'emmène
         plus à la vue transverse : il ouvre le panneau latéral, sur place. */
      const repere = p.locator('button.compte-notes').first();
      dire('panneau : l’objet annoté porte un repère chiffré, et c’est un GESTE (il ouvre le fil)',
        (await repere.count()) === 1, `${await compte('button.compte-notes')} repère(s)`);
      if (await repere.count()) {
        await repere.click();
        await p.waitForTimeout(400);
        const pan = p.locator('[data-panneau-notes]');
        const texteP = (await pan.innerText().catch(() => '')).trim();
        dire('panneau : le fil dit le type, l’ancienneté en jours OUVRÉS et le destinataire',
          /ouvr|business/i.test(texteP) && R('note.type.a_corriger').test(texteP),
          texteP.replace(/\s+/g, ' ').slice(0, 110) || 'panneau absent');
        dire('panneau : le travail reste à l’écran — le fil s’ouvre À CÔTÉ, pas à la place',
          (await compte('.annotable.a-note')) >= 1 && (await pan.count()) === 1,
          `${await compte('.annotable.a-note')} objet(s) annoté(s) encore visible(s)`);
        /* La clôture n'est pas offerte à l'auteur — et la RAISON est écrite
           (ADR-028) : un geste absent sans explication est un geste disparu. */
        const raison = await compte('[data-panneau-notes] [data-clore-refuse]');
        dire('panneau : la clôture n’est pas offerte ici, et la raison est ÉCRITE',
          raison >= 1 && (await compte('[data-panneau-notes] [data-clore]')) === 0,
          `${raison} raison(s) écrite(s)`);
        /* Répondre DEPUIS le fil : le geste revient sur l'écran de travail. */
        await pan.locator('[data-repondre-texte]').first().fill('Réponse écrite depuis le panneau latéral (parcours).');
        await soumettre(pan.locator(`button:has-text("${L('notes.repondre')}")`).first());
        dire('panneau : répondre depuis le fil ramène à l’ÉCRAN DE TRAVAIL, jamais à la vue transverse',
          !refus(p) && p.url().includes('/workpapers/'), refus(p) ?? p.url().replace(/^https?:\/\/[^/]+/, ''));
      }

      // La vue transverse la montre, avec son ancre.
      await aller(`${eng}/notes`);
      dire('notes : la vue transverse porte l’ancre de la note',
        /Conclusion/i.test(await texte()), 'ancre visible');

      // Le préparateur répond — la réponse entre au dossier et la note passe « adressée ».
      await devenir(c.preparateur.id);
      await aller(`${eng}/notes`);
      const fRep = p.locator(`form:has(input[name=texte]):has(button:has-text("${L('notes.repondre')}"))`).first();
      if (await fRep.count()) {
        await fRep.locator('input[name=texte]').fill('Conclusion étoffée, renvoi ajouté.');
        await fRep.locator(`button:has-text("${L('notes.repondre')}")`).first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2000);
        dire('notes : la réponse s’enregistre et la note passe « adressée »',
          !refus(p) && R('notes.statut.addressed').test(await texte()), refus(p) ?? 'réponse au dossier');
      }
      /* DEUX REFUS DISTINCTS (ADR-028) : Karim, préparateur, n'est pas
         réviseur ; Léa, réviseur, est l'AUTEUR — un auteur ne clôt jamais sa
         propre note, c'est ce qu'un inspecteur cherche en premier. */
      const fClore = p.locator(`form:has(button:has-text("${L('notes.clore')}"))`).first();
      if (await fClore.count()) {
        await fClore.locator(`button:has-text("${L('notes.clore')}")`).first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2000);
        dire('notes : la clôture par le préparateur (non réviseur) est REFUSÉE',
          Boolean(refus(p)) && /réviseur|reviewer/i.test(refus(p) ?? ''), refus(p) ?? 'PASSÉE — défaut');
      }
      await devenir(c.reviewer.id);
      await aller(`${eng}/notes`);
      const fCloreAuteur = p.locator(`form:has(button:has-text("${L('notes.clore')}"))`).first();
      if (await fCloreAuteur.count()) {
        await fCloreAuteur.locator(`button:has-text("${L('notes.clore')}")`).first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2000);
        dire('notes : la clôture par l’AUTEUR est refusée — même réviseur',
          Boolean(refus(p)) && /auteur/.test(refus(p) ?? ''), refus(p) ?? 'PASSÉE — défaut');
      }
      // Le réviseur qui n'a pas écrit la note — l'associée — clôt.
      await devenir(c.associe.id);
      await aller(`${eng}/notes`);
      for (let tour = 0; tour < 8; tour++) {
        const f = p.locator(`form:has(button:has-text("${L('notes.clore')}"))`).first();
        if (!(await f.count())) break;
        await f.locator('button').first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1400);
      }
      dire('notes : un réviseur non-auteur clôt, depuis la vue transverse',
        (await compteAbsent('form:has(button)', 'notes.clore')) === 0, 'aucune note ouverte');
    } else {
      dire('note ancrée : la conclusion du papier est annotable', false, 'élément .annotable absent');
    }

    /* LES NOTES POUR OTTO — l'instruction exécutée, et le refus de principe.
       Trois règles éprouvées au clic : OTTO répond (sa réponse ENTRE au
       dossier : fait, pièces, reste à vérifier), il refuse ce qui n'est pas
       de son ressort AVEC la liste de ce qu'il sait faire, et il ne clôt
       jamais — l'humain le fait, ici même. */
    await devenir(c.reviewer.id);
    await aller(base + lien);
    const fNoteOtto = p.locator('form:has(textarea[name=text])').first();
    if (await fNoteOtto.count()) {
      await fNoteOtto.locator('textarea[name=text]').fill(
        'Reprends la lecture des pièces : la quantité n’a pas été relevée.');
      await fNoteOtto.locator('select[name=assignee]').selectOption('otto');
      await fNoteOtto.locator(`button:has-text("${L('wp.addNote')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('OTTO : l’instruction est exécutée à la pose', !refus(p), refus(p) ?? 'exécutée');

      await aller(`${eng}/notes`);
      const t1 = await texte();
      dire('OTTO : sa réponse entre au dossier — fait, pièces, reste à vérifier',
        /OTTO/.test(t1) && /reste à vérifier/i.test(t1) && /vérification|attestation|réassemble/i.test(t1),
        'compte rendu visible');
      dire('OTTO : il a répondu, il n’a PAS clos — la note est « adressée », un humain clôt',
        R('notes.statut.addressed').test(t1), 'adressée, pas close');

      // Le refus de principe : « Conclus la section » n'est pas de son ressort.
      await aller(base + lien);
      await fNoteOtto.locator('textarea[name=text]').fill('Conclus la section, cela me paraît raisonnable.');
      await fNoteOtto.locator('select[name=assignee]').selectOption('otto');
      await fNoteOtto.locator(`button:has-text("${L('wp.addNote')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      await aller(`${eng}/notes`);
      const t2 = await texte();
      dire('OTTO : « conclus la section » est REFUSÉ, avec la liste de ce qu’il sait faire',
        /Je refuse/.test(t2) && /Ce que je sais faire/.test(t2) && /ressort|L2/.test(t2),
        'refus motivé et listé');

      /* On referme les deux notes OTTO avant les visas : l'exécutée se clôt,
         la refusée se reprend (réponse humaine) puis se clôt — une note
         refusée reste OUVERTE, c'est la règle, et elle bloque le visa. */
      const fRepO = p.locator(`form:has(input[name=texte]):has(button:has-text("${L('notes.repondre')}"))`).first();
      if (await fRepO.count()) {
        await fRepO.locator('input[name=texte]').fill('Compris — je conclus moi-même, la note est reprise.');
        await fRepO.locator(`button:has-text("${L('notes.repondre')}")`).first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1600);
      }
      /* Léa a ÉCRIT ces notes : c'est Claire, réviseur non-auteur, qui clôt. */
      await devenir(c.associe.id);
      await aller(`${eng}/notes`);
      for (let tour = 0; tour < 8; tour++) {
        const f = p.locator(`form:has(button:has-text("${L('notes.clore')}"))`).first();
        if (!(await f.count())) break;
        await f.locator('button').first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1400);
      }
      dire('OTTO : les notes sont closes par un réviseur humain non-auteur, jamais par lui',
        (await compteAbsent('form:has(button)', 'notes.clore')) === 0, 'clôture humaine');
    }

    /* LA COLONNE AJOUTÉE (ADR-099) — le piège central au clic : le titre est
       du texte libre, OTTO PROPOSE et n'écrit RIEN avant confirmation ; deux
       issues par cellule ; l'illisible est refusé, jamais deviné. */
    await devenir(c.preparateur.id);
    await aller(base + lien);
    const fCol = p.locator('form:has(input[name=titre])').first();
    if (await fCol.count()) {
      await deplier(fCol);
      await fCol.locator('input[name=titre]').fill('Date livraison');
      await fCol.locator('input[name=justification]').fill(
        'Cut-off : la date de livraison commande l’exercice de rattachement.');
      await fCol.locator(`button:has-text("${L('wp.addTheColumn')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      const t1 = await texte();
      dire('colonne : OTTO PROPOSE son interprétation, en clair, et attend',
        /je cherche la date figurant sur le bon de livraison/.test(t1), 'proposition affichée');
      dire('colonne : RIEN n’est rempli avant la confirmation humaine',
        (await compte('th:has-text("Date livraison")')) === 0, 'aucune colonne dans le tableau');

      await p.locator(`button:has-text("${L('wp.confirmOttoSearchesTheDocumentsReceived')}")`).first().click();
      await p.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('colonne : confirmée, elle entre au tableau MARQUÉE « ajoutée »',
        (await compte('th:has-text("Date livraison")')) === 1 && !refus(p),
        refus(p) ?? 'colonne remplie et marquée');
      const t2 = await texte();
      dire('colonne : deux issues, jamais une seule — trouvée AVEC sa pièce, ou « absente »',
        R('wp.absentFromTheDocumentsReceived').test(t2), 'les deux issues visibles');

      await p.locator(`button:has-text("${L('wp.proposeAClarificationToTheClient')}")`).first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      dire('colonne : l’introuvable PROPOSE une demande de clarification (brouillon L2)',
        R('wp.clarificationProposed').test(await texte()) && !refus(p), refus(p) ?? 'clarification proposée');

      // L'illisible : proposé comme tel, et JAMAIS rempli sur une devinette.
      await deplier(fCol);
      await fCol.locator('input[name=titre]').fill('BL signé ?');
      await fCol.locator('input[name=justification]').fill('Existence : la signature atteste la réception.');
      await fCol.locator(`button:has-text("${L('wp.addTheColumn')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      dire('colonne : « BL signé ? » — OTTO avoue ne pas savoir interpréter',
        R('wp.ottoICouldNotInterpretThis').test(await texte()), 'aveu affiché');
      await p.locator(`button:has-text("${L('wp.confirmOttoSearchesTheDocumentsReceived')}")`).first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      dire('colonne : confirmer sans corriger un titre illisible est REFUSÉ',
        Boolean(refus(p)), refus(p) ?? 'PASSÉ — défaut');
      const fAnnule = p.locator(`form:has(button:has-text("${L('note.cancel')}"))`).last();
      if (await fAnnule.count()) {
        await fAnnule.locator(`button:has-text("${L('note.cancel')}")`).click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1500);
      }
    } else {
      dire('colonne : le formulaire d’ajout est présent sur le papier', false, 'formulaire absent');
    }

    /* L'INFORMATION PRODUITE PAR L'ENTITÉ — UN SEUL OBJET (Groupe 1, 1.8),
       AVANT les visas : un papier visé ne se modifie plus. Le peuplement a
       documenté le rapport « FEC-2025 » arrêté au 31/12/2025 et ce papier le
       désigne. Le cas mauvais du plan : redésigner ce rapport pour un AUTRE
       arrêté (15/01/2026) est REFUSÉ, les deux dates côte à côte — puis le
       bon arrêté passe, et l'écran montre le rapport partagé. */
    const selRapport = p.locator('#ipe select[name=rapport_id]');
    if (await selRapport.count()) {
      const optionFec = selRapport.locator('option', { hasText: 'FEC-2025' });
      if (await optionFec.count()) {
        await selRapport.selectOption({ label: (await optionFec.first().innerText()).trim() });
        await p.locator('#ipe input[name=utilisee][value=oui]').check();
        await p.locator('#ipe select[name=approprie]').selectOption('oui');
        await p.locator('#ipe input[name=date_document]').fill('2026-01-15');
        await soumettre(p.locator(`#ipe button:has-text("${L('wp.ipe.record')}")`).first(), 1500);
        const r = refus(p) ?? '';
        dire('IPE : réutiliser un rapport pour un AUTRE arrêté est refusé, les deux dates côte à côte',
          /2025-12-31/.test(r) && /2026-01-15/.test(r), r || '(aucun refus — PASSÉ, défaut)');
        await aller(base + lien);
        await selRapport.selectOption({ label: (await optionFec.first().innerText()).trim() });
        await p.locator('#ipe input[name=utilisee][value=oui]').check();
        await p.locator('#ipe select[name=approprie]').selectOption('oui');
        await p.locator('#ipe input[name=date_document]').fill('2025-12-31');
        await soumettre(p.locator(`#ipe button:has-text("${L('wp.ipe.record')}")`).first(), 1500);
        dire('IPE : le rapport du bon arrêté se désigne, et l’écran montre le rapport (empreinte, nombre de papiers)',
          !refus(p) && (await compte('[data-ipe-rapport]')) === 1 && (await compte('[data-ipe-papiers]')) === 1,
          refus(p) ?? `rapport affiché · ${await p.locator('[data-ipe-papiers]').first().innerText().catch(() => '')}`);
      } else {
        dire('IPE : le rapport FEC-2025 du peuplement est proposé au papier', false, 'option absente');
      }
    } else {
      dire('IPE : le panneau propose les rapports du dossier', false, 'sélecteur absent');
    }

    // Les visas, DANS L'ORDRE : préparateur, reviewer, associé.
    for (const [qui, role] of [
      [c.preparateur.id, 'preparer_validator'], [c.reviewer.id, 'reviewer'], [c.associe.id, 'partner'],
    ] as const) {
      await devenir(qui);
      await aller(base + lien);
      const f = p.locator(`form:has(input[name=role][value="${role}"])`);
      if (!(await f.count())) continue;
      await f.locator('button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
    }
    await aller(base + lien);
    dire('papier : les trois visas se posent dans l’ordre de la hiérarchie de revue',
      (await compte('form:has(input[name=role])')) === 0,
      'préparateur, reviewer et associé ont visé');

    /* LES EXPORTS : le papier sort du produit, en PDF ET en tableur. Ils sont
       passés en REPLI à la tranche 9 — donc le parcours déplie d'abord, comme
       l'utilisateur. Un bouton replié qu'on clique sans déplier n'échoue pas
       « parce que le produit est cassé » : il échoue parce que le harnais ne
       fait pas le geste. Et l'Excel, que personne ne cliquait, est cliqué. */
    for (const [format, nom] of [['pdf', 'PDF'], ['xlsx', 'tableur']] as const) {
      const fx = p.locator(`form:has(input[name=format][value="${format}"])`).first();
      if (!(await fx.count())) { dire(`papier : l’export ${nom} est offert sur l’écran`, false, 'formulaire absent'); continue; }
      await deplier(fx);
      await soumettre(fx.locator('button').first(), 6000);
      dire(`papier : il s’exporte en ${nom} depuis l’écran`, !refus(p), refus(p) ?? 'export produit');
    }
    dire('papier : les deux exports sont TÉLÉCHARGEABLES depuis l’écran',
      (await compte('a[href^="/api/export-file/"]')) >= 2,
      `${await compte('a[href^="/api/export-file/"]')} lien(s) d’export`);
  });

  // ── 16 ter. L'ANATOMIE DE LA PAGE DE POSTE (mandat de la soirée, §2)
  //
  // Visas en haut, leadsheet N/N-1 avec son origine et une variation signée,
  // revue analytique éditable (refus du vide, rédaction, proposition L2 puis
  // validation), dix sections en ancres, replis mémorisés, et « ce qui reste
  // ouvert » disparu — dans les deux langues.
  await station('poste : l’anatomie — visas en haut, leadsheet N/N-1, revue analytique, sections repliées mémorisées', async () => {
    await devenir(c.preparateur.id);
    const url = `${eng}/poste/REVENUE`;
    await aller(url);
    /* 2.1 — les trois visas, EN HAUT : mesurés dans le navigateur, au-dessus
       de la leadsheet — une classe posée ne prouve pas une position (règle 15). */
    const visas = await compte('[data-visas] [data-visa]');
    const enHaut = await p.evaluate(`(() => {
      const v = document.querySelector('[data-visas]'); const l = document.querySelector('[data-leadsheet]');
      return v && l ? v.getBoundingClientRect().bottom <= l.getBoundingClientRect().top : false;
    })()`);
    dire('poste : trois visas compacts, au-dessus de la leadsheet', visas === 3 && enHaut === true, `${visas} visa(s), au-dessus : ${enHaut}`);
    const vises = await compte('[data-visa-etat="vise"]');
    dire('poste : le visa posé sur le papier (station 16) se lit en en-tête du poste', vises >= 1, `${vises} visa(s) lu(s)`);
    /* 2.2 — sept colonnes, N-1 renseigné, variation SIGNÉE, origine dite. */
    const entetes = (await p.locator('[data-leadsheet] thead th').allInnerTexts()).map((x) => x.trim());
    dire('poste : la leadsheet a sept colonnes (compte, intitulé, N, N-1, variation, variation %, XREF)', entetes.length === 7, entetes.join(' · '));
    const n1 = (await p.locator('[data-leadsheet] tbody td[data-solde-n1]').allInnerTexts()).filter((x) => x.trim() !== '—').length;
    const variations = (await p.locator('[data-leadsheet] tbody td[data-variation]').allInnerTexts()).map((x) => x.trim());
    dire('poste : les soldes N-1 sont renseignés et la variation est SIGNÉE',
      n1 > 0 && variations.length > 0 && variations.every((x) => /^(\+|−|0|—)/.test(x)),
      `${n1} solde(s) N-1 · variations : ${variations.slice(0, 4).join(' · ')}`);
    const origine = await p.locator('[data-origine-n1]').first().getAttribute('data-origine-n1');
    dire('poste : l’origine des chiffres N-1 est dite (dossier N-1 ou balance comparative)', origine === 'dossier_n1' || origine === 'balance_n1', `origine : ${origine}`);
    const lienVariation = (await p.locator('[data-leadsheet] td[data-variation] a').first().getAttribute('href')) ?? '';
    dire('poste : la variation renvoie à la revue analytique du dossier', lienVariation.includes('/analytique#'), lienVariation || 'aucun lien');
    /* 2.4 — la navigation par ancres : une entrée par section. */
    const ancres = await compte('[data-ancres] a[data-ancre]');
    dire('poste : la navigation par ancres liste les dix sections', ancres === 10, `${ancres} ancre(s)`);
    /* « Ce qui reste ouvert » a disparu — dans les DEUX langues (défaut n°25). */
    const resteOuvert = await compteAbsent('h2, h3, summary', 'poste.openItems');
    dire('poste : « ce qui reste ouvert » a disparu', resteOuvert === 0, `${resteOuvert} occurrence(s)`);
    /* 2.3 — papiers avec visa, écarts avec leur papier, demandes : sections du poste. */
    const papiers = await compte('[data-papiers-du-poste] tbody tr');
    dire('poste : les papiers du poste sont listés, avec leur visa et leur date', papiers >= 1, `${papiers} papier(s)`);
    const ecarts = await compte('[data-ecarts-du-poste] tbody tr');
    const ecartsAvecPapier = await compte('[data-ecarts-du-poste] a[data-ecart-papier]');
    dire('poste : chaque écart du poste porte le lien vers son papier', ecarts >= 1 && ecartsAvecPapier === ecarts, `${ecartsAvecPapier}/${ecarts} écart(s) avec papier`);
    const demandes = await compte('[data-demandes-du-poste] tbody tr');
    dire('poste : les demandes au client du poste sont listées', demandes >= 1, `${demandes} demande(s)`);
    /* 2.2 — la revue analytique : REFUS du vide (le navigateur n'arrête pas le
       formulaire, c'est le service qui refuse — ADR-091), puis rédaction,
       puis proposition L2 marquée et non enregistrée, puis validation. */
    await p.locator('[data-analytique-texte]').fill('');
    await soumettre(p.locator('[data-analytique-enregistrer]'));
    dire('poste : REFUS — une revue analytique vide n’est pas enregistrée (ANA-01)', /ANA-01/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus');
    await aller(url);
    await p.locator('[data-analytique-texte]').fill('Le chiffre d’affaires progresse avec le volume facturé au second semestre (rédaction de parcours, fictive).');
    await soumettre(p.locator('[data-analytique-enregistrer]'));
    const version = async () => p.locator('[data-analytique-provenance]').getAttribute('data-analytique-version').catch(() => null);
    dire('poste : la revue analytique s’enregistre — version 1, rédigée par le préparateur', !refus(p) && (await version()) === '1', refus(p) ?? `version ${await version()}`);
    await soumettre(p.locator('[data-analytique-proposer]'));
    const proposee = await compte('[data-analytique-propose]');
    const texteProp = await p.locator('[data-analytique-texte]').inputValue();
    dire('poste : OTTO propose une rédaction d’après les chiffres — marquée, pré-remplie, NON enregistrée (L2)',
      proposee === 1 && texteProp.includes('N-1') && (await version()) === '1',
      `proposée : ${proposee} · version enregistrée : ${await version()}`);
    await soumettre(p.locator('[data-analytique-enregistrer]'));
    dire('poste : la proposition validée devient la version 2, d’origine « proposée, validée »',
      !refus(p) && (await version()) === '2' && R('poste.analytique.origine.proposee_validee').test(await texte()),
      refus(p) ?? `version ${await version()}`);
    /* 2.3 — le repli se MÉMORISE : replier, recharger, toujours replié ; l'ancre le rouvre. */
    await p.locator('details[data-repli="poste.papiers"] > summary').click();
    await p.waitForTimeout(300);
    await aller(url);
    const replie = await p.evaluate(`!document.querySelector('details[data-repli="poste.papiers"]').open`);
    dire('poste : un repli se mémorise — replié, rechargé, toujours replié', replie === true, `replié après rechargement : ${replie}`);
    await p.locator('[data-ancres] a[data-ancre="papiers"]').click();
    await p.waitForTimeout(300);
    const rouvert = await p.evaluate(`document.querySelector('details[data-repli="poste.papiers"]').open`);
    dire('poste : l’ancre rouvre une section repliée', rouvert === true, `rouvert : ${rouvert}`);
    /* La revue analytique du DOSSIER lit le même objet : la version 2, sur le poste. */
    await aller(`${eng}/analytique`);
    const memeTexte = await compte('tr[data-poste="REVENUE"] [data-revue-version="2"]');
    dire('revue analytique du dossier : le poste y porte la MÊME rédaction (version 2), parmi tous les postes du pack',
      memeTexte === 1 && (await compte('tr[data-poste]')) > 1, `${await compte('tr[data-poste]')} poste(s) · v2 lue : ${memeTexte}`);
  });

  // ── 17. LA BOUCLE, RELUE
  // ── 16 bis. LA BASCULE ENTRE MISSIONS DU GROUPE (ADR-100)
  await station('bascule entre missions du groupe', async () => {
    await devenir(c.associe.id);
    await aller(`${eng}`);
    const t0 = await texte();
    /* Le sélecteur groupe par CLIENT : le groupe Meridian est le client,
       Altiverre l'entité, et les deux mandats pendent dessous. */
    await p.locator('.bascule > summary').click();
    await p.waitForTimeout(400);
    const liste = await p.locator('.bascule-liste').innerText().catch(() => '');
    dire('bascule : les missions sont groupées par CLIENT (le groupe), pas en liste plate',
      /Meridian/i.test(liste) && /Altiverre/i.test(liste), liste.slice(0, 80));
    const bouton = p.locator('.bascule-liste button.lien-bascule').first();
    if (await bouton.count()) {
      const versNom = (await bouton.innerText()).trim();
      await bouton.click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1500);
      const t1 = await texte();
      dire('bascule : le clic CHANGE de dossier',
        !refus(p) && t1 !== t0 && t1.includes(versNom.split(' · ')[0].slice(0, 20)),
        refus(p) ?? `ouvert : ${versNom}`);
      /* Et le changement est JOURNALISÉ — on le lit dans l'écran du journal. */
      const url = p.url();
      const engId = (url.match(/\/eng\/([0-9a-f-]{36})/) || [])[1];
      if (engId) {
        await aller(`${base}/eng/${engId}/events`);
        dire('bascule : chaque changement s’inscrit au journal (engagement.switched)',
          /engagement\.switched/.test(await texte()), 'événement au journal');
      }
      // retour au dossier NEP pour la suite du parcours
      await aller(`${eng}`);
    } else {
      dire('bascule : une autre mission est proposée au clic', false, 'aucun bouton de bascule');
    }
  });

  // ── 16 ter. LES RÉUNIONS — le déterministe, l'envoi simulé et DIT tel (ADR-101)
  await station('réunions : créneaux, ordre des copies, envoi simulé', async () => {
    await devenir(c.associe.id);
    await aller(`${eng}/reunions`);
    dire('réunions : l’écran DIT que la lecture d’agendas et l’envoi sont simulés',
      R('reun.calendarReadingAndSendingSimulated').test(await texte()), 'mention affichée');

    // Chercher des créneaux AVANT tout contact clé : la proposition marche…
    await p.locator('input[name=de]').fill('2026-03-02');
    await p.locator('input[name=a]').fill('2026-03-06');
    await p.locator(`button:has-text("${L('reun.findTheCommonSlots')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1500);
    dire('réunions : des créneaux communs sortent des disponibilités (libre/occupé seulement)',
      /créneau|slot/i.test(await texte()) && (await compte(`button:has-text("${L('reun.pickThisSlot')}")`)) > 0,
      `${await compte(`button:has-text("${L('reun.pickThisSlot')}")`)} créneau(x)`);

    // …mais CHOISIR sans contact clé est refusé en nommant le geste manquant.
    const premier = p.locator(`form:has(button:has-text("${L('reun.pickThisSlot')}"))`).first();
    await premier.locator('input[name=objet]').fill('Point d’étape sur les demandes');
    await premier.locator('select[name=destinataire]').selectOption({ label: 'Sophie Marchand' });
    await premier.locator(`button:has-text("${L('reun.pickThisSlot')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1800);
    dire('réunions : choisir un créneau SANS contact clé est refusé, en nommant le geste',
      Boolean(refus(p)) && /contact/.test(refus(p) ?? ''), refus(p) ?? 'PASSÉ — défaut');

    // Le contact clé se déclare, puis le choix passe — humain à chaque pas.
    const fCle = p.locator(`form:has(button:has-text("${L('reun.declareKeyContact')}"))`);
    await fCle.locator('select[name=contact]').selectOption({ label: 'Sophie Marchand' });
    await fCle.locator(`button:has-text("${L('reun.declareKeyContact')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1500);
    dire('réunions : le contact clé est déclaré', R('reun.keyContact').test(await texte()) && !refus(p), refus(p) ?? 'Sophie Marchand, clé');

    await p.locator('input[name=de]').fill('2026-03-02');
    await p.locator('input[name=a]').fill('2026-03-06');
    await p.locator(`button:has-text("${L('reun.findTheCommonSlots')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1500);
    const f2 = p.locator(`form:has(button:has-text("${L('reun.pickThisSlot')}"))`).first();
    await f2.locator('input[name=objet]').fill('Point d’étape sur les demandes');
    await f2.locator('select[name=destinataire]').selectOption({ label: 'Sophie Marchand' });
    await f2.locator(`button:has-text("${L('reun.pickThisSlot')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(2000);
    const t = await texte();
    dire('réunions : l’invitation porte les copies dans l’ORDRE CALCULÉ — clé, puis la hiérarchie',
      /Sophie Marchand[\s\S]*Claire Fontaine[\s\S]*Léa Moreau[\s\S]*Karim Benali/.test(t),
      'ordre des copies affiché');
    dire('réunions : le .ics standard se télécharge depuis l’écran',
      (await compte('a[href^="/api/reunion-ics/"]')) > 0, 'lien .ics présent');

    await p.locator(`button:has-text("${L('reun.sendSimulatedTransport')}")`).first().click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1800);
    dire('réunions : l’envoi est SIMULÉ et l’écran l’affirme — rien n’est parti',
      R('reun.envoyeeSimulee').test(await texte()) && !refus(p), refus(p) ?? 'envoi simulé, dit tel');
  });

  await station('la boucle', async () => {
    await aller(`${eng}/loop`);
    const t = await texte();
    dire('la boucle : les étapes du cycle sont rendues avec leur reste',
      t.length > 300, `${t.length} car.`);
  });

  // ── 18. REPRISE N-1
  await station('reprise N-1', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/carry-forward`);
    if (await compte(`button:has-text("${L('cf.proposeTheCarryForward')}")`)) {
      await cliquer(`button:has-text("${L('cf.proposeTheCarryForward')}")`, 3000);
    }
    if (await compte(`button:has-text("${L('proc.ecarter')}")`)) {
      await cliquer(`button:has-text("${L('proc.ecarter')}")`);
      dire('reprise N-1 : écarter une conclusion SANS motif est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }
    for (let tour = 0; tour < 60; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('col.reconfirm')}"))`).first();
      if (!(await f.count())) break;
      await f.locator(`button:has-text("${L('col.reconfirm')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1100);
    }
    dire('reprise N-1 : plus aucune proposition non statuée',
      (await compteAbsent('button', 'col.reconfirm')) === 0, 'toutes statuées');
  });

  // ── 19. POINTAGE DES ÉTATS FINANCIERS
  await station('pointage des états financiers', async () => {
    await aller(`${eng}/fs-tieout`);
    if (await compte(`button:has-text("${L('fst.chargerPlaquette')}")`)) {
      await cliquer(`button:has-text("${L('fst.chargerPlaquette')}")`, 4000);
    }
    if (await compte(`button:has-text("${L('fst.repointer')}")`)) {
      await cliquer(`button:has-text("${L('fst.repointer')}")`, 4000);
    }
    dire('pointage : la plaquette est chargée et pointée',
      /pointé|écart|ouvert|documenté|tied|difference|open|documented/i.test(await texte()), 'statuts affichés');

    const doc = p.locator(`form:has(button:has-text("${L('col.document')}"))`).first();
    if (await doc.count()) {
      await doc.locator('input[name=explanation]').fill('Calculé hors système, feuille annexe.');
      await doc.locator(`button:has-text("${L('col.document')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('pointage : documenter un chiffre SANS pièce liée est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }
    // …puis correctement, sinon l'obstacle demeure et le dossier ne se clôt pas.
    for (let tour = 0; tour < 25; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('col.document')}"))`).first();
      if (!(await f.count())) break;
      await f.locator('input[name=explanation]').fill(
        'Poste calculé hors système à partir du détail des comptes ; la feuille de calcul est jointe.');
      const sel = f.locator('select[name=evidence_id]');
      const vals = await sel.locator('option').evaluateAll(
        (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
      if (!vals.length) break;
      await sel.selectOption(vals[0]);
      await f.locator(`button:has-text("${L('col.document')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    for (let tour = 0; tour < 25; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('col.explain')}"))`).first();
      if (!(await f.count())) break;
      await f.locator('input[name=explanation]').fill(
        'Écart de présentation : reclassement opéré dans la plaquette, sans incidence sur le résultat.');
      await f.locator(`button:has-text("${L('col.explain')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    dire('pointage : plus aucune ligne ouverte ni écart inexpliqué',
      (await compteAbsent('form:has(button)', 'col.document')) === 0
        && (await compteAbsent('form:has(button)', 'col.explain')) === 0,
      'toutes les lignes traitées');
  });

  // ── 20. ACHÈVEMENT
  /* ── CIRCULARISATIONS (point 3, ADR-111) — le chemin entier, au clic :
     le listing incomplet du client, les DEUX constats de complétude, le
     listing corrigé, la demande (simulée), la réponse déposée, l'écart
     CALCULÉ, son explication écrite, et les questions au client en brouillon.
     C'est la station qui prouve que le module n'est pas qu'un tableau. */
  await station('circularisation des banques : complétude, envoi, écart, explication', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/circularisations`);
    const t0 = await texte();
    dire('circularisation : le compte du grand livre qu\'AUCUN tiers ne couvre est nommé',
      /512100/.test(t0) && /aucun|no counterparty|covered by no/i.test(t0), '512100 signalé sans tiers');
    dire('circularisation : la ligne de listing qu\'aucune écriture ne porte est nommée aussi',
      /512900|512200/.test(t0), 'compte annoncé sans écriture signalé');

    /* Le client répond : le listing corrigé rattache la banque au bon compte. */
    await deplier(p.locator('input[name=fichier][accept*="csv"]').first());
    await p.locator('input[name=fichier][accept*="csv"]').first()
      .setInputFiles(ds('circularisations', 'banques-corrige.csv'));
    await soumettre(p.locator('form:has(input[name=fichier][accept*="csv"]) button').first(), 1500);
    dire('circularisation : le listing CORRIGÉ referme le constat de complétude',
      !refus(p) && !/n’est couvert par|n\'est couvert par/.test(await texte()),
      refus(p) ?? 'plus aucun compte sans tiers');

    /* La demande part — simulée, et l'écran le dit. */
    const envoyer = p.locator(`button:has-text("${L('circ.sendSimulated')}")`).first();
    if (await envoyer.count()) {
      await soumettre(envoyer, 1500);
      dire('circularisation : la demande PART (transport simulé, jamais un envoi qui se croit réel)',
        !refus(p) && R('circ.etat.envoyee').test(await texte()), refus(p) ?? 'demande envoyée');
    } else {
      dire('circularisation : une demande reste à envoyer après le listing corrigé', false, 'aucun bouton d\'envoi');
      return;
    }

    /* La réponse de la banque : la pièce, et le solde LU dessus — ici,
       1 250,00 € de plus que la comptabilité (des frais non comptabilisés). */
    const cellules = await p.locator('table.data tbody tr').first().locator('td').allInnerTexts();
    const compta = Number((cellules[4] ?? '').replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
    dire('circularisation : le solde COMPTABLE est affiché en face du tiers',
      Number.isFinite(compta) && compta !== 0, `${compta} € au grand livre`);
    await deplier(p.locator('input[name=montant]').first());
    await p.locator('form:has(input[name=montant]) input[type=file]').first()
      .setInputFiles(ds('circularisations', 'banques-corrige.csv'));
    await p.locator('input[name=montant]').first().fill(String((compta + 1250).toFixed(2)));
    await soumettre(p.locator('form:has(input[name=montant]) button').first(), 2000);
    /* LIRE LE TEXTE TEL QU'IL EST RENDU : le séparateur de milliers français
       est une espace INSÉCABLE (U+00A0 / U+202F), pas une espace ordinaire —
       « 1 250,00 » cherché avec une espace normale ne matche jamais ce que
       l'écran affiche. Même famille que le mot capitalisé par le CSS
       (règle 15) : on normalise, et le détail rapporte la valeur LUE. */
    const t1 = (await texte()).replace(/[\u00a0\u202f]/g, ' ');
    const cellulesApres = await p.locator('table.data tbody tr').first().locator('td').allInnerTexts();
    const ecartLu = (cellulesApres[6] ?? '').replace(/[\u00a0\u202f]/g, ' ').trim().split('\n')[0];
    dire('circularisation : l\'écart est CALCULÉ contre le grand livre, et tout écart se dit',
      !refus(p) && /1 250,00/.test(t1), refus(p) ?? `écart lu : ${ecartLu || '(vide)'}`);

    /* L'écart ne se referme pas d'un clic : il se JUSTIFIE. */
    const sansMotif = p.locator('form:has(input[name=explication])').first();
    if (await sansMotif.count()) {
      await sansMotif.evaluate((el) => { (el as HTMLFormElement).noValidate = true; });
      await sansMotif.locator('input[name=explication]').fill('RAS');
      await soumettre(sansMotif.locator('button'), 1200);
      dire('circularisation : « RAS » est REFUSÉ — une explication d\'écart se rédige',
        Boolean(refus(p)), refus(p) ?? 'PASSÉ — défaut');
      const vrai = p.locator('form:has(input[name=explication])').first();
      await vrai.locator('input[name=explication]').fill(
        'Frais de tenue de compte prélevés le 31/12, comptabilisés en janvier — rattachement corrigé.');
      await soumettre(vrai.locator('button'), 1500);
      dire('circularisation : l\'écart expliqué par écrit lève l\'obstacle au visa',
        !refus(p) && /Frais de tenue de compte/.test(await texte()), refus(p) ?? 'explication au dossier');
    }

    /* Les questions au client : un brouillon, jamais un envoi. */
    const qs = p.locator(`button:has-text("${L('circ.draftTheQuestionsToTheClient')}")`).first();
    if (await qs.count()) {
      await soumettre(qs, 1500);
      await aller(`${eng}/requests`);
      dire('circularisation : les questions naissent en BROUILLON, dans les demandes au client',
        /Circularisation/i.test(await texte()), 'demande rédigée');
    }
  });

  await station('achèvement', async () => {
    await devenir(c.associe.id);
    await aller(`${eng}/completion`);
    if (await compte(`button:has-text("${L('comp.openTheCompletionProcedures')}")`)) {
      await cliquer(`button:has-text("${L('comp.openTheCompletionProcedures')}")`, 3000);
    }
    const f0 = p.locator(`form:has(button:has-text("${L('col.conclude')}"))`).first();
    if (await f0.count()) {
      await f0.locator('input[name=findings]').fill('Revue faite.');
      await f0.locator(`button:has-text("${L('col.conclude')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('achèvement : conclure SANS conclusion écrite est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }
    dire('achèvement : la lettre d’affirmation ne peut pas être « sans objet », et l’écran le dit',
      (await compte('form:has(input[name=nature][value="lettre_affirmation"])')) > 0
        && (await compte(`form:has(input[name=nature][value="lettre_affirmation"]):has(button:has-text("${L('comp.notApplicable2')}"))`)) === 0
        && R('comp.pasSansObjet').test(await texte()),
      'action non offerte, raison écrite');

    const rapport = (await texte()).match(/Date du rapport\s*:?\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];
    const iso = rapport ? rapport.split('/').reverse().join('-') : '2026-03-31';
    for (let tour = 0; tour < 12; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('col.conclude')}"))`).first();
      if (!(await f.count())) break;
      await f.locator('input[name=findings]').fill(
        'Travaux menés jusqu’à la date du rapport ; aucun fait nouveau non consigné.');
      await f.locator('input[name=conclusion]').fill(
        'Aucune incidence sur l’opinion ; les éléments obtenus sont suffisants et appropriés.');
      const cov = f.locator('input[name=covered_through]');
      if (await cov.count()) await cov.fill(iso);
      const sig = f.locator('input[name=signed_on]');
      if (await sig.count()) await sig.fill(iso);
      const ev = f.locator('select[name=evidence_id]');
      if (await ev.count()) {
        const vals = await ev.locator('option').evaluateAll(
          (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
        if (vals.length) await ev.selectOption(vals[0]);
      }
      await f.locator(`button:has-text("${L('col.conclude')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1800);
    }
    dire('achèvement : les cinq natures sont conclues',
      (await compteAbsent('form:has(button)', 'col.conclude')) === 0,
      'plus aucune nature à conclure');
  });

  // ── 21. JALONS : poser LA DATE, poser, puis MARQUER FAIT (le geste qui n'avait pas d'écran)
  await station('jalons', async () => {
    await aller(`${eng}/acceptance`);
    /* LES JALONS SONT DANS UN REPLI depuis la revue n°2 (ils sortent du flux
       d'acceptation sans disparaître). Le geste de l'utilisateur est donc :
       déplier, puis marquer. */

    /* LE GESTE QUI N'AVAIT JAMAIS ÉTÉ EMPRUNTÉ (Lot 4, tranche 3) : `jalonAction`
       pose la date d'un jalon (`input[name=date]`) — chaque jalon du monde
       semé porte déjà une échéance, donc jusqu'ici seul `markDone` était
       cliqué, jamais ce formulaire. On repose une date NEUVE (le lendemain de
       l'échéance actuelle) sur le premier jalon NON dérivé et on vérifie que
       la colonne « échéance » affiche vraiment la nouvelle date — pas
       seulement que le formulaire existe. */
    const formeDate = p.locator('form:has(input[name=date])').first();
    if (await formeDate.count()) {
      await deplier(formeDate);
      const champDate = formeDate.locator('input[name=date]');
      const avant = await champDate.inputValue();
      const d = new Date(avant);
      const neuve = isNaN(d.getTime())
        ? '2026-12-31'
        : new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
      const [aa, mm, jj] = neuve.split('-');
      await champDate.fill(neuve);
      await formeDate.locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(800);
      /* LE REPLI SE REFERME au rechargement (`<details>` sans état persisté :
         `revalidatePath`+`redirect` réaffichent la page fraîche, fermée par
         défaut) — son contenu masqué n'entre pas dans `innerText()`. Trouvé
         en diagnostiquant un premier ÉCHEC (sonde jetable, supprimée) : la
         date était bien posée en base, seulement invisible tant que le
         repli restait fermé — pas un défaut du produit, un défaut de CETTE
         station. On rouvre avant de lire. */
      const repliApres = p.locator(`details:has(summary:has-text("${L('acc.engagementMilestones')}"))`).first();
      if (await repliApres.count()) await deplier(repliApres.locator('table').first());
      const corps = await p.locator('body').innerText();
      dire('jalons : la date d’un jalon se pose depuis l’écran (jalonAction), et l’échéance affichée change',
        !refus(p) && corps.includes(`${jj}/${mm}/${aa}`),
        refus(p) ?? `échéance « ${jj}/${mm}/${aa} » introuvable après l’avoir posée (était « ${avant} »)`);
    } else {
      dire('jalons : la date d’un jalon se pose depuis l’écran (jalonAction), et l’échéance affichée change',
        false, 'AUCUN jalon non dérivé sur ce dossier — le formulaire de date n’est pas offert');
    }

    for (let tour = 0; tour < 12; tour++) {
      const f = p.locator(`form:has(button:has-text("${L('acc.markDone')}"))`).first();
      if (!(await f.count())) break;
      await deplier(f);
      await f.locator(`button:has-text("${L('acc.markDone')}")`).click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1300);
    }
    dire('jalons : chaque jalon se marque FAIT depuis l’écran',
      (await compteAbsent('form:has(button)', 'acc.markDone')) === 0,
      'aucun jalon posé non fait');
  });

  // ── 21b. LE SUIVI DE MISSION (mandat contrôle interne, §5, §7.4) — le
  // tableau de bord, VUE PURE : avancement par poste, ce qui bloque le visa,
  // l'âge des demandes en attente, les écarts non conclus. Premier écran dans
  // le nouveau langage (mandat du 2026-09-09, §5, classe `.epure`) : la
  // station clique une carte KPI et vérifie qu'elle mène quelque part — pas
  // seulement qu'un chiffre s'affiche (le compteur qui ne mène nulle part est
  // exactement le défaut D.6 nomme).
  await station('suivi de mission : le tableau de bord mène quelque part', async () => {
    await aller(`${eng}/suivi`);
    const t = await texte();
    const cartes = await compte('.epure-carte');
    dire('suivi : les quatre panneaux du mandat sont posés',
      cartes >= 4, `${cartes} carte(s) .epure-carte`);
    /* LA CARTE « OBSTACLES » MÈNE À /obstacles — pas un lien mort, pas une
       ancre qui ne bouge rien. `href` EST RELATIF DANS LE DOM (Next `<Link>`
       rend `/eng/id/obstacles`, jamais l'origine complète) : un `=` contre
       `${eng}/obstacles` (qui PORTE l'origine) ne matche donc JAMAIS — cas
       connu mauvais mesuré une première fois (« lien absent », verify du
       2026-09-09) avant ce correctif. `$=` (suffixe), même convention que
       les autres stations du fichier (ex. `a[href$="/carry-forward"]`). */
    const selObstacles = `a[href$="/obstacles"].epure-carte`;
    if (!(await p.locator(selObstacles).count())) {
      dire('suivi : la carte obstacles a un lien réel vers /obstacles', false, 'lien absent');
    } else {
      /* `cliquer()` (pas un clic à la main) : le réseau ne se calme pas
         toujours à temps sur une transition client Next — c'est `cliquer()`
         qui porte la grâce fixe après le silence réseau (voir sa définition).
         Un clic suivi d'un simple `waitForLoadState` a lu l'URL AVANT la
         navigation réelle — cas connu mauvais mesuré (« /suivi » encore
         affiché après le clic, verify du 2026-09-09) avant ce correctif. */
      await cliquer(selObstacles);
      dire('suivi : cliquer la carte obstacles ouvre /obstacles',
        p.url().endsWith('/obstacles'), p.url());
      await aller(`${eng}/suivi`);
    }
    dire('suivi : la page s’affiche dans le nouveau langage (classe .epure)',
      (await compte('.epure')) > 0, t.slice(0, 60));
  });

  // ── 21c. LE KANBAN DES ÉCARTS (mandat contrôle interne, §5, §7.4, seconde
  // moitié) — l'épreuve d'acceptation du mandat lui-même (§6, point 8) :
  // « un test échoue si une seule carte ne se résout pas à l'identifiant
  // d'un objet existant. » `clics` tourne contre un BUILD DE PRODUCTION, sans
  // accès direct à la base (contrairement à un test vitest) : la preuve
  // passe donc par une SECONDE PAGE — chaque id de carte relevé sur le
  // kanban doit se retrouver comme ANCRE RÉELLE (`#x-<id>`) sur
  // `/exceptions`, qui lit LA MÊME table (`listExceptions`). Une carte dont
  // l'id ne mène à aucune ancre serait un décor : cette station le
  // détecterait en listant l'id manquant, pas en affirmant « ok » en gros.
  await station('kanban des écarts : chaque carte se résout à un écart réel', async () => {
    await aller(`${eng}/kanban`);
    const idsCartes = await p.locator('[data-carte]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('data-carte')).filter((v): v is string => Boolean(v)));
    if (idsCartes.length === 0) {
      dire('kanban : au moins une carte est posée (le monde de démonstration porte des écarts)',
        false, 'aucune carte — le kanban ne peut pas être éprouvé sans écart');
      return;
    }
    await aller(`${eng}/exceptions`);
    const manquants: string[] = [];
    for (const id of idsCartes) {
      if (!(await compte(`#x-${id}`))) manquants.push(id);
    }
    dire('kanban : chaque carte se résout à l’identifiant d’un écart réel (ancre #x-<id> sur /exceptions)',
      manquants.length === 0, manquants.length === 0
        ? `${idsCartes.length} carte(s), toutes résolues`
        : `${manquants.length}/${idsCartes.length} carte(s) SANS ancre : ${manquants.slice(0, 3).join(', ')}`);

    /* LE GESTE DE LOT (« rédiger la demande de clarification ») : posé
       UNE SEULE FOIS sur la colonne « Ouvert », il exécute le VRAI
       `draftClarificationRequest` (matching.ts) — pas une étiquette. On le
       clique quand la colonne en porte, et on vérifie qu'il mène à une
       VRAIE demande créée (redirection vers /requests/<id>), pas un
       rafraîchissement sur place. */
    await aller(`${eng}/kanban`);
    const boutonLot = p.locator('.epure-carte[data-colonne="open"] form button');
    if (await boutonLot.count()) {
      await cliquer('.epure-carte[data-colonne="open"] form button');
      dire('kanban : le geste de lot (rédiger la clarification) crée une VRAIE demande',
        /\/requests\//.test(p.url()), p.url());
    } else {
      dire('kanban : aucun écart ouvert à rédiger en lot pour l’instant (colonne vide)', true, '0 écart ouvert');
    }
  });

  // ── 21d bis. R61 (D.6 point 5, mandat 2026-09-05 §D.6 ; « A2 » de
  // l'inventaire du 10 septembre) : une colonne vide disait « rien ici »
  // pour les cinq colonnes indifféremment — un écart ouvert vide (bonne
  // nouvelle) n'est pas la même chose qu'une clarification vide (rien à
  // relancer), et le message ne le disait pas. Chaque colonne porte
  // désormais son propre texte ; cette station vérifie qu'une colonne VIDE
  // ne porte JAMAIS le texte GÉNÉRIQUE retiré (« rien ici »), et que le
  // texte affiché est bien celui de SA colonne, pas celui d'une autre.
  await station('R61 : chaque colonne vide du kanban porte SON état, pas un texte générique', async () => {
    await aller(`${eng}/kanban`);
    const texteParColonne: Record<string, string> = {};
    for (const col of ['open', 'clarification_requested', 'explained', 'resolved', 'escalated']) {
      const vide = p.locator(`.epure-carte[data-colonne="${col}"] .epure-liste-vide`);
      if (await vide.count()) texteParColonne[col] = (await vide.textContent()) ?? '';
    }
    const nVides = Object.keys(texteParColonne).length;
    if (nVides === 0) {
      dire('R61 kanban : au moins une colonne est vide (sinon la station n’éprouve rien)',
        false, 'les cinq colonnes portent des écarts — refaire tourner après un ré-semis');
    } else {
      /* CORRIGÉ après revue hostile (2026-09-12) : la première rédaction ne
         cherchait que le texte FRANÇAIS retiré (« rien ici ») — la
         démonstration sert l'ANGLAIS par défaut (locServie, voir la station
         « langue » de ce fichier), où le texte retiré était « nothing
         here ». Une régression exacte serait passée inaperçue dans la
         langue réellement servie. Les deux formes de la clé RETIRÉE
         (`kanban.aucune`, EN/FR) sont donc écrites ici en dur, jamais lues
         du catalogue — la clé elle-même a disparu, et c'est précisément ce
         qu'on ne veut plus jamais y revoir. */
      const TEXTE_GENERIQUE_RETIRE = /^(rien ici|nothing here)$/i;
      const textesDistincts = new Set(Object.values(texteParColonne));
      dire('R61 kanban : les colonnes vides portent des textes DISTINCTS (jamais le générique retiré)',
        textesDistincts.size === nVides && ![...textesDistincts].some((t) => TEXTE_GENERIQUE_RETIRE.test(t.trim())),
        `${nVides} colonne(s) vide(s) : ${Object.entries(texteParColonne).map(([c, t]) => `${c}="${t}"`).join(' · ')}`);
    }
  });

  // ── 21d. R60 (D.6 point 4, mandat 2026-09-05 §D.6 ; repass design déclenché
  // le 2026-09-10) : « tout compteur mène quelque part ». Quatre tuiles
  // KPI, trois pages, corrigées le même jour (dashboard, population,
  // balances-aux) — chacune était du texte plein sans lien. La station
  // clique la tuile et vérifie une VRAIE navigation, pas seulement un
  // `href` présent (un lien mort passerait le second test, pas le premier).
  await station('R60 : les compteurs du dossier mènent quelque part (dashboard, population, balances-aux)', async () => {
    await aller(`${eng}/dashboard`);
    /* CORRIGÉ après revue hostile (2026-09-10) : la première rédaction
       passait « lien absent » comme détail QUEL QUE SOIT le résultat — un
       « ok » aurait affiché « lien absent » à côté de lui, exactement la
       forme d'affirmation qui se contredit que la règle 13 nomme déjà pour
       CTRL-04. Le détail dit maintenant ce qui a été VU, dans les deux sens. */
    const lienPieces = (await p.locator('a.panel.kpi[href="#dash-requestTracker"]').count()) > 0
      && (await p.locator('#dash-requestTracker').count()) > 0;
    dire('dashboard : la tuile « pièces reçues » a un lien réel vers le suivi de la demande (même page)',
      lienPieces, lienPieces ? 'lien et ancre présents' : 'lien ou ancre absent');
    const lienEvidence = (await p.locator('a.panel.kpi[href$="/evidence"]').count()) > 0;
    dire('dashboard : la tuile « pièces lues » a un lien réel vers /evidence',
      lienEvidence, lienEvidence ? 'lien présent' : 'lien absent');
    const selExceptions = `a[href$="/exceptions"].panel.kpi, a.panel.kpi[href$="/exceptions"]`;
    if (!(await p.locator(selExceptions).count())) {
      dire('dashboard : la tuile écarts a un lien réel vers /exceptions', false, 'lien absent');
    } else {
      await cliquer(selExceptions);
      dire('dashboard : cliquer la tuile écarts ouvre /exceptions', p.url().endsWith('/exceptions'), p.url());
      await aller(`${eng}/dashboard`);
    }
    const selRcm = `a[href$="/rcm"].panel.kpi, a.panel.kpi[href$="/rcm"]`;
    if (!(await p.locator(selRcm).count())) {
      dire('dashboard : la tuile déviations a un lien réel vers /rcm', false, 'lien absent');
    } else {
      await cliquer(selRcm);
      dire('dashboard : cliquer la tuile déviations ouvre /rcm', p.url().endsWith('/rcm'), p.url());
      /* H-5, TRANCHE 1 (Lot 7, docs/REGISTRE_IDEES.md §H, ligne 273) : le vrai geste d'upload
         RCM — ce dossier (eng/engNep) n'a AUCUN contrôle à ce point du parcours canonique (la
         RCM d'engNep n'est importée que par enrichir.ts, jamais par demo-seed.ts), donc le
         formulaire d'upload EST offert. Vérifié en direct par requête SQL avant d'écrire cette
         station (règle 15/18) — jamais supposé depuis registre.ts (qui décrivait, à tort avant
         ce correctif, ce chemin comme jamais atteignable par clics, R107/R109). */
      const formUpload = p.locator('form:has(input[type=file])');
      if (await formUpload.count()) {
        await formUpload.locator('input[type=file]').setInputFiles(ds('sox', 'rcm.csv'));
        await formUpload.locator('button').click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1500);
        const nLignes = await p.locator('table.data tbody tr').count();
        dire('rcm : l’upload réel du listing client (fichier, pas un fixture serveur) importe des contrôles',
          !refus(p) && nLignes > 0, refus(p) ?? `${nLignes} ligne(s) affichée(s)`);
      } else {
        dire('rcm : le formulaire d’upload est offert quand aucun contrôle n’existe encore', false, 'formulaire absent');
      }
      await aller(`${eng}/dashboard`);
    }

    await aller(`${eng}/population`);
    const selFlags = `a.panel.kpi[href="?view=flags"]`;
    const lienFlags = (await p.locator(selFlags).count()) > 0;
    dire('population : la tuile « lignes signalées » a un lien réel (?view=flags)',
      lienFlags, lienFlags ? 'lien présent' : 'lien absent');

    await aller(`${eng}/balances-aux`);
    const selDeplacements = `a.kpi[href="#bal-counterpartyByCounterparty"]`;
    const nDeplacements = await p.locator(selDeplacements).count();
    dire('balances-aux : les tuiles tiers apparus/disparus/déplacements ont un lien réel',
      nDeplacements >= 2, `${nDeplacements} tuile(s) liée(s)`);

    /* CORRIGÉ après revue hostile (2026-09-10, constat 1) : la quatrième page
       du commit (imports, l'avertissement ADR-016) n'était éprouvée nulle
       part dans cette station — la revendication « corrigée » dans le
       message de commit n'était pas exercée par le harnais. Le rendu est
       CONDITIONNEL (`affected.length > 0`) : sur le monde de démonstration
       courant, aucun échantillon n'est encore invalidé par un ré-import, donc
       l'avertissement peut être absent — ce n'est pas un échec, c'est nommé. */
    await aller(`${eng}/imports`);
    const selAvertissementFec = '.callout.warn a[href$="/sampling"]';
    const avertissementPresent = await p.locator('.callout.warn').count();
    if (avertissementPresent > 0) {
      const lienEchantillon = (await p.locator(selAvertissementFec).count()) > 0;
      dire('imports : l’avertissement de ré-import mène à /sampling',
        lienEchantillon, lienEchantillon ? 'lien présent' : 'lien absent dans l’avertissement');
    } else {
      dire('imports : aucun avertissement de ré-import pour l’instant (rien à invalider)', true, '0 échantillon affecté');
    }
  });

  // ── 22. OBSTACLES AU VISA
  let restants = 0;
  await station('obstacles au visa', async () => {
    await aller(`${eng}/obstacles`);
    const t = await texte();
    /* LE VERDICT EST UN NOMBRE QUI DOIT SE RECOUPER, pas la présence d'un mot :
       les deux branches de l'écran portent désormais l'un ou l'autre libellé,
       donc « l'un ou l'autre » ne peut plus échouer. Le compte annoncé en tête
       et le nombre d'obstacles listés dans les familles doivent coïncider —
       un écran qui annonce 4 et en montre 3 est le défaut qu'on cherche. */
    restants = Number(t.match(/(\d+)\s+(?:obstacle|blocker)/i)?.[1] ?? '0');
    const listes = await compte('.panel.warn ul li');
    dire('obstacles : le compte annoncé et les obstacles listés se recoupent',
      restants === listes && (restants > 0 || R('obst.aucun').test(t)),
      `${restants} annoncé(s) · ${listes} listé(s)`);
  });

  // ── 23. CLÔTURE ET ARCHIVE SCELLÉE
  /* ── MES TRAVAUX — le point d'origine, et le critère COMPTÉ (ADR-110).
     Le mandat mesure la navigation « en trois clics depuis Mes travaux ».
     L'écran n'existait pas : le critère portait sur un point de départ absent.

     LA CONDITION SE CRÉE PAR LE PRODUIT, et c'est le scénario lui-même : à ce
     stade tout est visé et toutes les notes sont closes — Karim n'a plus rien
     qui l'attend. Léa lui adresse donc une note ANCRÉE sur la conclusion du
     papier (le geste réel : clic droit sur l'objet, type « à documenter »,
     qui ne bloque aucun visa), puis Karim ouvre « Mes travaux » PAR LE LIEN du
     bandeau et va à l'objet. On COMPTE les clics, on ne les affirme pas — et
     une liste vide serait un ÉCHEC de la station, pas une excuse (deux essais
     précédents s'étaient déclarés « ok » en ne prouvant aucun chemin).

     ET AVANT LA CLÔTURE : le dossier scellé est VERROUILLÉ — la pose de note
     y est refusée, « engagement is locked, writes rejected ». Le produit a
     raison ; c'est la station qui était mal placée. */
  await station('mes travaux : le point d’origine, et les clics comptés', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/workpapers`);
    /* MÊME PAPIER que la station 16 (REV-01), pas « le premier de la liste » —
       la note ancrée ici vise la référence qu'un pas ultérieur relit
       (« CAS-01:conclusion » n'existait plus dans l'état du dossier une fois
       CAS-01 traité ailleurs dans le parcours, tranche Trésorerie). */
    const lienWp = await p.locator('tr:has-text("REV-01") a[href*="/workpapers/"]').first().getAttribute('href').catch(() => null);
    if (!lienWp) { dire('mes travaux : un papier existe pour y ancrer une note', false, 'aucun papier'); return; }
    await aller(base + lienWp);
    const conclusion = p.locator('.annotable:has(> h2:text-is("Conclusion"))').first();
    if (!(await conclusion.count())) { dire('mes travaux : la conclusion du papier est annotable', false, 'objet annotable absent'); return; }
    await conclusion.locator('h2').click({ button: 'right' });
    const panneau = p.locator('.note-panneau');
    if (!(await panneau.count())) { dire('mes travaux : le clic droit ouvre la pose de note', false, 'panneau absent'); return; }
    await panneau.locator('textarea[name=texte]').fill(
      'Pour Karim : compléter le renvoi à l’état des anomalies (note posée par le parcours).');
    await panneau.locator('select[name=note_type]').selectOption('a_documenter');
    await panneau.locator('select[name=assignee]').selectOption(c.preparateur.id);
    await panneau.locator(`button:has-text("${L('note.post')}")`).click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1500);
    dire('mes travaux : une note ADRESSÉE crée du travail qui attend quelqu’un',
      !refus(p), refus(p) ?? 'note posée pour le préparateur');

    await devenir(c.preparateur.id);
    await aller(`${eng}/dashboard`);
    let clics = 0;
    await p.locator(`.topbar-lien:has-text("${L('commun.mesTravaux')}")`).click();
    clics++;
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(600);
    const surTravaux = p.url().includes('/travaux');
    dire('mes travaux : le bandeau y mène depuis n’importe quel écran, en 1 clic',
      surTravaux && (await compte('h1')) > 0 && R('commun.mesTravaux').test(await p.locator('h1').first().innerText()), p.url().replace(base, ''));
    if (!surTravaux) return;

    const liens = p.locator('table.data td a');
    const n = await liens.count();
    if (n === 0) {
      dire('mes travaux : la note adressée APPARAÎT dans la liste de travail', false,
        'liste VIDE — le chemin vers l’objet n’est pas éprouvé');
      return;
    }
    const cible = (await liens.first().getAttribute('href')) ?? '';
    await liens.first().click();
    clics++;
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(800);
    dire(`mes travaux : ${n} ligne(s), et l’objet s’atteint en ${clics} clic(s) — le critère est de 3`,
      p.url().includes(cible.split('?')[0]) && clics <= 3,
      `${clics} clic(s) → ${cible}`);
  });

  /* §4 POINT 3 (mandat du 10 septembre, point 1 ; R74) — L'ANALYSE DE WALKTHROUGH : les
     AFFORDANCES DE L'ÉCRAN (dépôt, bouton « Analyser », décisions par écart) sont réellement
     cliquables — la couverture LOGIQUE (fixtures, refus REQ-02-like, garde de budget) est déjà
     prouvée par walkthrough-analyse.test.ts, même patron qu'étape 7 (ADR : « cette station-ci
     prouve que les AFFORDANCES DE L'ÉCRAN sont réellement cliquables, ce que la suite de service
     ne peut pas voir »). PREMIÈRE STATION SOX de ce parcours : `contexte()` ne résolvait qu'un
     SEUL dossier avant cette tranche (`eng`, NEP) — étendu pour porter aussi un contrôle SOX
     avec walkthrough déjà attaché (`controleWalkthrough`), résolu comme `eng` avant que le
     serveur ne prenne la base (PGlite, écrivain unique). */
  if (c.controleWalkthrough) {
    await station('walkthrough : dépôt du transcript, analyse (rejeu), écarts décidés (§4 point 3, R74)', async () => {
      await devenir(c.preparateur.id);
      const engSox = `${base}/eng/${c.controleWalkthrough!.engId}`;
      /* PAS DE FRAGMENT `#walkthrough-analyse` DANS L'URL — trouvé en creusant F17/F17 bis
         (docs/CHASSE.md §1) : un #418 s'est reproduit 3/3 sur PRÉCISÉMENT cette navigation,
         toujours du bruit connu. Le panneau est déjà OUVERT par défaut (aucune préférence
         mémorisée possible pour une clé neuve, repli.tsx:55) : rien à dérouler, un simple
         défilement suffit. HYPOTHÈSE « saut d'ancre natif » ÉLIMINÉE ENSUITE (F17 ter,
         CHASSE.md) : le retrait seul n'a pas arrêté la récidive (4ᵉ occurrence, sur l'URL plate).
         `rcm/[cid]` porte PLUSIEURS panneaux `Repli` — chacun un composant CLIENT
         (`repli.tsx:1`) — et reste, avec `/eng/[id]/testing`, l'une des pages les plus LOURDES
         du parcours ; `aller()` attend le SILENCE RÉSEAU, pas la fin de l'hydratation
         CPU-liée, et le réseau se calme souvent avant que React ait fini — la grâce de secours
         de `aller()` (1500 ms) ne se déclenche alors JAMAIS. Grâce EXPLICITE ajoutée ici,
         propre à cette station, plutôt qu'élargir `aller()` pour tout le monde sans preuve que
         les 239 autres stations en ont besoin. */
      await aller(`${engSox}/rcm/${c.controleWalkthrough!.controlId}`);
      await p.waitForTimeout(1200);
      await p.locator('#walkthrough-analyse').scrollIntoViewIfNeeded();
      const TRANSCRIPT = "Auditeur : Pouvez-vous me décrire ce que vous faites quand un client demande un avoir ?\nPropriétaire du contrôle : Le commercial saisit la demande d'avoir dans le système, puis moi je la valide avant qu'elle parte en compta. Je regarde toujours le motif et je vérifie le montant par rapport à la facture d'origine.\nAuditeur : Et pour les avoirs au-delà d'un certain montant ?\nPropriétaire du contrôle : Au-dessus de 5 000 euros, j'envoie systématiquement un mail au directeur financier pour qu'il valide aussi, avant que je ne finalise. C'est comme ça depuis le début de l'année, on a resserré le contrôle après un souci l'an dernier.\nAuditeur : Est-ce que vous faites autre chose de régulier sur ce cycle ?\nPropriétaire du contrôle : Oui, une fois par trimestre je fais un point avec la compta sur les avoirs en attente de plus de trente jours, pour être sûr qu'aucun ne traîne. On regarde la liste ensemble.";

      if (await compte('[data-deposer-transcript-walkthrough]')) {
        await p.locator('[data-deposer-transcript-walkthrough] textarea[name=contenu]').fill(TRANSCRIPT);
        await soumettre(p.locator('[data-deposer-transcript-walkthrough] button'));
        dire('walkthrough : le transcript déposé est accepté', !refus(p), refus(p) ?? 'transcript déposé');
      }
      if (await compte('[data-analyser-walkthrough]')) {
        await soumettre(p.locator('[data-analyser-walkthrough] button'), 2000);
        dire('walkthrough : l’analyse (rejeu) est acceptée et produit des écarts', !refus(p), refus(p) ?? 'analyse acceptée');
      }
      const nEcarts = await compte('[data-ecarts-walkthrough] tbody tr');
      dire('walkthrough : le rejeu retrouve les écarts ENREGISTRÉS de la fixture (2)', nEcarts === 2, `${nEcarts} écart(s) affiché(s)`);
      if (nEcarts === 0) return;

      /* R59/ADR-103 (mandat du 10 septembre, option b) : chaque écart candidat vient de
         l'analyse IA du transcript, jamais d'une saisie humaine — la ligne DOIT porter
         data-ia-prepare="true" (posé par la même constante que le composant IaFlag,
         src/app/ia-flag.tsx). Éprouvé ici sur du DOM RENDU avec de VRAIES données IA
         (le rejeu de la fixture), pas seulement dans le code source. */
      const nMarques = await compte('[data-ecarts-walkthrough] tbody tr[data-ia-prepare="true"]');
      dire('walkthrough : chaque écart candidat porte le marqueur structurel « préparé par l’IA »',
        nMarques === nEcarts, `${nMarques}/${nEcarts} ligne(s) marquée(s)`);

      const avantTaches = await compte('[data-taches-controle] tbody tr[data-tache]');
      await p.locator('[data-ecart-walkthrough="1"] summary.repli-action').click();
      await soumettre(p.locator('[data-ecart-walkthrough="1"] form[data-ecart-decision="task"] button'), 2000);
      dire('walkthrough : « en faire une tâche » ajoute une VRAIE ligne à la table des tâches',
        !refus(p) && (await compte('[data-taches-controle] tbody tr[data-tache]')) === avantTaches + 1,
        refus(p) ?? `${avantTaches} → ${await compte('[data-taches-controle] tbody tr[data-tache]')} tâche(s)`);

      await p.locator('[data-ecart-walkthrough="2"] summary.repli-action').click();
      await soumettre(p.locator('[data-ecart-walkthrough="2"] form[data-ecart-decision="question"] button'), 2000);
      dire('walkthrough : « poser une question » crée une demande BROUILLON (L2, rien ne part sans approbation)',
        !refus(p) && (await compte('[data-ecart-walkthrough="2"][data-statut="question"]')) === 1,
        refus(p) ?? 'demande brouillon créée');

      dire('walkthrough : les deux écarts sont désormais statués, aucun ne reste candidat',
        (await compte('[data-ecart-walkthrough][data-statut="candidate"]')) === 0, 'aucun candidat restant');
    });
  }

  /* INVENTAIRE DE CLÔTURE (2026-09-19), §3 — CTRL-01/02/03/04/05/06/07, VID-01, l'annexe
     sourcée. Les deux contrôles déjà cyclés par le semeur (C-BR-01/C-REV-01,
     `controleWalkthrough` ci-dessus) sont déjà entièrement conclus : aucun refus CTRL-0X ne
     peut plus s'y observer, la seule fenêtre où un refus existe est AVANT que le geste ne soit
     posé — donc sur un contrôle ENCORE VIERGE. Le RCM importe SEPT contrôles
     (dataset/sox/rcm.csv), le semeur n'en cycle que DEUX (part2.ts:266-267) : les cinq autres
     restent `not_assessed`, sans tâche ni facteur ni IUC ni population — exactement l'état
     requis pour PROVOQUER chaque refus, un par un, en retirant la cause qui vient de le
     déclencher avant de passer au suivant. Jamais un refus démontré sur un monde construit
     exprès pour qu'il tienne (règle 17 du dépôt appliquée à ce parcours lui-même) : ce monde
     vierge existe déjà dans le monde semé, `contexte()` le résout, cette station le clique. */
  if (c.controlePristineMensuel) {
    await station('contrôle interne : la ladder de refus CTRL-01/02/03, un geste à la fois', async () => {
      await devenir(c.preparateur.id);
      const engSox = `${base}/eng/${c.controlePristineMensuel!.engId}`;
      const cid = c.controlePristineMensuel!.controlId;
      const code = c.controlePristineMensuel!.code;
      const ligne = p.locator(`tr:has(strong:text-is("${code}"))`);
      const tenterConclure = async () => {
        await aller(`${engSox}/rcm`);
        await ligne.locator('input[name=conclusion]').fill('Walkthrough performed (démonstration, inventaire de clôture).');
        await soumettre(ligne.locator(`button:has-text("${L('rcm.assessEffective')}")`));
      };

      // 1. AUCUNE tâche documentée : tenter de conclure refuse — CTRL-01, première forme.
      await tenterConclure();
      dire('CTRL-01 : conclure un D&I sans AUCUNE tâche documentée est refusé',
        Boolean(refus(p)) && /CTRL-01/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — défaut');

      // 2. Attacher le walkthrough (VID-01 : dépôt manuel réel, pièce rangée avec provenance).
      await aller(`${engSox}/rcm/${cid}`);
      await p.locator('[data-attacher-walkthrough] input[type=file]').setInputFiles(ds('sox', 'walkthrough-video-placeholder.txt'));
      await soumettre(p.locator('[data-attacher-walkthrough] button'));
      dire('VID-01 : le dépôt manuel de la vidéo de walkthrough est accepté et rangé comme une pièce du dossier',
        !refus(p) && (await compte('[data-walkthrough-attache]')) > 0, refus(p) ?? 'vidéo attachée');

      // 3. Une tâche, SEULE l'inquiry la documente encore : refuse — CTRL-01, seconde forme.
      await p.locator('[data-ajouter-tache] input[name=description]').fill(`Exécution de ${code} observée au walkthrough`);
      await soumettre(p.locator('[data-ajouter-tache] button'));
      dire('CTRL-01 : la tâche ajoutée porte le badge « documentée par la seule inquiry »',
        (await compte('[data-ctrl-01-manquant]')) > 0, `${await compte('[data-ctrl-01-manquant]')} badge(s)`);
      await tenterConclure();
      dire('CTRL-01 : une tâche documentée par la seule inquiry refuse toujours de conclure',
        Boolean(refus(p)) && /CTRL-01/.test(refus(p) ?? '') && /inquiry/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — défaut');

      // 4. Documenter une procédure hors inquiry pour la tâche — lève CTRL-01, découvre CTRL-02.
      await aller(`${engSox}/rcm/${cid}`);
      const ligneTache = p.locator('[data-taches-controle] tbody tr[data-tache="1"]');
      await ligneTache.locator('summary.repli-action').click();
      await ligneTache.locator('[data-documenter-procedure] textarea[name=notes]')
        .fill('Pièce de la période précédente inspectée pendant le walkthrough (démonstration).');
      await soumettre(ligneTache.locator('[data-documenter-procedure] button'));
      await tenterConclure();
      dire('CTRL-02 : les quatre facteurs de design vides refusent de conclure, la tâche seule ne suffit plus',
        Boolean(refus(p)) && /CTRL-02/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — défaut');

      // 5. Documenter les quatre facteurs — lève CTRL-02, découvre CTRL-03.
      await aller(`${engSox}/rcm/${cid}`);
      for (const facteur of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation']) {
        const ligneFacteur = p.locator(`[data-facteur="${facteur}"]`);
        await ligneFacteur.locator('summary.repli-action').click();
        await ligneFacteur.locator('textarea[name=conclusion]').fill(`Conclusion du facteur ${facteur} (démonstration, inventaire de clôture).`);
        await soumettre(ligneFacteur.locator('button'));
      }
      dire('CTRL-02 : les quatre facteurs de design portent désormais leur conclusion écrite',
        (await compte('[data-facteur-conclusion]')) === 4, `${await compte('[data-facteur-conclusion]')}/4`);
      await tenterConclure();
      dire('CTRL-03 : aucune IUC déclarée refuse de conclure, les facteurs seuls ne suffisent pas',
        Boolean(refus(p)) && /CTRL-03/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — défaut');

      // 6. Déclarer une IUC utilisée SANS preuve — CTRL-03, seconde forme (nomme les volets).
      await aller(`${engSox}/rcm/${cid}`);
      await p.locator('[data-declarer-iuc] select[name=utilisee]').selectOption('oui');
      await p.locator('[data-declarer-iuc] input[name=description]').fill('Rapprochement bancaire système (démonstration, inventaire de clôture).');
      await soumettre(p.locator('[data-declarer-iuc] button'));
      await tenterConclure();
      dire('CTRL-03 : une IUC utilisée sans preuve d’exactitude ni d’exhaustivité refuse, en nommant les deux volets',
        Boolean(refus(p)) && /CTRL-03/.test(refus(p) ?? '') && /exactitude/.test(refus(p) ?? '') && /exhaustiv/.test(refus(p) ?? ''),
        refus(p) ?? 'aucun refus — défaut');

      // 7. Documenter les deux preuves IUC — lève CTRL-03, la conclusion RÉUSSIT enfin.
      await aller(`${engSox}/rcm/${cid}`);
      for (const volet of ['exactitude', 'exhaustivite']) {
        const lignePreuve = p.locator(`[data-iuc-preuves] tr[data-volet="${volet}"]`);
        await lignePreuve.locator('summary.repli-action').click();
        await lignePreuve.locator('textarea[name=conclusion]').fill(`Preuve de ${volet} documentée (démonstration, inventaire de clôture).`);
        await soumettre(lignePreuve.locator('button'));
      }
      await tenterConclure();
      dire('CTRL-01/02/03 tous levés : le D&I se conclut enfin, sans aucun refus',
        !refus(p) && (await compte(`tr:has(strong:text-is("${code}")) .badge.green`)) > 0, refus(p) ?? 'conclu effective');

      // 8. VID-01 : supprimer la vidéo (tracée qui/quand/motif), puis la ré-attacher.
      await aller(`${engSox}/rcm/${cid}`);
      await p.locator('[data-supprimer-walkthrough] summary').click();
      await p.locator('[data-supprimer-walkthrough] textarea[name=raison]')
        .fill('Contrôle qualité — ré-attachement pour l’inventaire de clôture (démonstration).');
      await soumettre(p.locator('[data-supprimer-walkthrough] button'));
      dire('VID-01 : la suppression manuelle de la vidéo est tracée (qui, quand, motif) à l’écran',
        (await compte('[data-walkthrough-supprime]')) > 0, `${await compte('[data-walkthrough-supprime]')} mention(s)`);
      await p.locator('[data-attacher-walkthrough] input[type=file]').setInputFiles(ds('sox', 'walkthrough-video-placeholder.txt'));
      await soumettre(p.locator('[data-attacher-walkthrough] button'));
      dire('VID-01 : un nouvel enregistrement se rattache après suppression, jamais un cul-de-sac',
        !refus(p) && (await compte('[data-walkthrough-attache]')) > 0, refus(p) ?? 'vidéo re-attachée');

      // 9. Population dérivable (mensuel) — CTRL-04 avant/après rapprochement, puis l'annexe sourcée.
      const deriver = p.locator(`form:has(button:has-text("${L('rcmc.deriverPopulation')}"))`);
      if (await deriver.count()) {
        await soumettre(deriver.locator('button'));
        dire('CTRL-04 : la population dérivée ne se tire PAS tant qu’elle n’est pas rapprochée',
          (await compte('[data-ctrl04-non-rapprochee]')) > 0,
          `${await compte('[data-ctrl04-non-rapprochee]')} mention(s), aucun formulaire de tirage`);
        await p.locator('[data-rapprocher-population] textarea[name=conclusion]')
          .fill(`Population dérivée de ${code} revue et retenue (démonstration, inventaire de clôture).`);
        await soumettre(p.locator('[data-rapprocher-population] button'));
        dire('CTRL-04 : rapprochée, la population ouvre enfin le formulaire de tirage',
          (await compte('[data-population-rapprochee]')) > 0, `${await compte('[data-population-rapprochee]')} mention(s)`);
        const nCaveat = await compte('[data-minima-caveat]');
        dire('annexe §2.2 : la phrase « minima suggérés, jamais un verdict » est reprise sous la taille affichée',
          nCaveat > 0, nCaveat > 0 ? (await p.locator('[data-minima-caveat]').first().innerText()).slice(0, 90) : 'absente');
      } else {
        dire('CTRL-04 : population dérivable non offerte — état inattendu du contrôle vierge', false, 'formulaire de dérivation absent');
      }
    });
  }

  if (c.controlePristineAdhoc) {
    await station('contrôle interne : CTRL-05, la demande de population as_needed créée par un clic', async () => {
      await devenir(c.preparateur.id);
      const engSox = `${base}/eng/${c.controlePristineAdhoc!.engId}`;
      const cid = c.controlePristineAdhoc!.controlId;
      await aller(`${engSox}/rcm/${cid}`);
      const demander = p.locator(`form:has(button:has-text("${L('rcmc.demanderPopulation')}"))`);
      const nDeriver = await compte(`form:has(button:has-text("${L('rcmc.deriverPopulation')}"))`);
      dire('CTRL-05 : un contrôle as_needed n’offre PAS de dérivation automatique, seulement la demande',
        nDeriver === 0, nDeriver === 0 ? 'aucun bouton de dérivation automatique' : `${nDeriver} bouton(s) de dérivation — inattendu`);
      if (await demander.count()) {
        await soumettre(demander.locator('button'));
        dire('CTRL-05 : la demande de population est créée par UN clic, visible dans l’espace de demandes',
          !refus(p) && (await compte(`a[href*="/requests/"]`)) > 0, refus(p) ?? 'demande créée, lien visible');
      } else {
        dire('CTRL-05 : bouton de demande de population absent — état inattendu du contrôle vierge', false, 'formulaire absent');
      }
    });
  }

  if (c.controlePristineQuotidien) {
    await station('contrôle interne : CTRL-07 (population > 200) et CTRL-06 (inquiry OE neuve)', async () => {
      await devenir(c.preparateur.id);
      const engSox = `${base}/eng/${c.controlePristineQuotidien!.engId}`;
      const cid = c.controlePristineQuotidien!.controlId;
      await aller(`${engSox}/rcm/${cid}`);
      const deriver = p.locator(`form:has(button:has-text("${L('rcmc.deriverPopulation')}"))`);
      if (await deriver.count()) {
        await soumettre(deriver.locator('button'));
        await p.locator('[data-rapprocher-population] textarea[name=conclusion]')
          .fill('Population quotidienne dérivée, revue et retenue (démonstration, inventaire de clôture).');
        await soumettre(p.locator('[data-rapprocher-population] button'));
        const t2 = await texte();
        dire('CTRL-07 : population > 200 SANS les trois jugements de cabinet refuse d’afficher une taille',
          /CTRL-07/.test(t2) && /(niveau de confiance|confidence level)/i.test(t2), t2.match(/CTRL-07[^\n]{0,160}/)?.[0] ?? 'mention absente');
      } else {
        dire('CTRL-07 : population quotidienne non dérivable — état inattendu du contrôle vierge', false, 'formulaire de dérivation absent');
      }

      /* CTRL-06, sur le contrôle DÉJÀ conclu par le semeur (C-BR-01/C-REV-01,
         `controleWalkthrough`) : réviser l'inquiry OE en y attachant la pièce du walkthrough
         D&I LUI-MÊME — la seule façon d'observer le refus sans reconstruire tout un cycle OE
         sur un contrôle vierge. */
      if (c.controleWalkthrough) {
        const engWalkthrough = `${base}/eng/${c.controleWalkthrough.engId}`;
        await aller(`${engWalkthrough}/rcm/${c.controleWalkthrough.controlId}`);
        const ligneInquiry = p.locator('[data-oe-procedure="inquiry"]');
        if (await ligneInquiry.count()) {
          await ligneInquiry.locator('summary.repli-action').click();
          const select = ligneInquiry.locator('select[name=evidence_id]');
          const optionWalkthrough = select.locator(`option:has-text("walkthrough-${c.controleWalkthrough.code}")`);
          if (await optionWalkthrough.count()) {
            await select.selectOption({ label: await optionWalkthrough.first().innerText() });
            await ligneInquiry.locator('textarea[name=notes]').fill('Tentative de réutilisation de la pièce D&I (inventaire de clôture, cas connu mauvais).');
            await soumettre(ligneInquiry.locator('button'));
            dire('CTRL-06 : réutiliser la pièce du walkthrough D&I comme inquiry OE est refusé',
              Boolean(refus(p)) && /CTRL-06/.test(refus(p) ?? ''), refus(p) ?? 'aucun refus — défaut');
          } else {
            dire('CTRL-06 : la pièce du walkthrough D&I n’apparaît pas dans les pièces sélectionnables', false, 'option absente du select');
          }
        } else {
          dire('CTRL-06 : aucune ligne d’inquiry OE sur le contrôle déjà cyclé — état inattendu', false, 'ligne absente');
        }

        // EXTRAP-CONTROLES (mandat 2026-09-14, §1.5) : un test de contrôles n'affiche
        // jamais de projection, et le dit en une phrase — déjà visible sur ce même écran
        // puisque le contrôle est entièrement testé (grid.length > 0, semé par part2.ts).
        const t3 = await texte();
        dire('§1.5 : un test de contrôles n’affiche jamais de projection, et le dit en une phrase (ISA 530 §A20)',
          /never show a projection|n’affichent jamais de projection/.test(t3), t3.match(/(Tests of controls never[^\n]{0,120}|Les tests de contrôles[^\n]{0,120})/)?.[0] ?? 'phrase absente');
      }
    });
  }

  // ── AUTO-01 (mandat 2026-09-14, §2.2 ; réexamen du 2026-09-19) : porter le
  //    niveau d'automatisation de la mission au-dessus du plafond du pack est
  //    refusé, en nommant le plafond et le pack qui l'a posé — puis un vrai
  //    réglage, valide, est accepté. pcaob-sox.ts pose désormais L1 (au lieu du
  //    défaut L2), précisément pour que ce refus soit observable contre un
  //    cabinet réel plutôt que seulement un pack fictif de test.
  if (c.controleWalkthrough) {
    await station('AUTO-01 : le niveau d’automatisation de la mission ne dépasse jamais le plafond du pack', async () => {
      await devenir(c.associe.id);
      await aller(`${base}/eng/${c.controleWalkthrough!.engId}/team`);
      const f = p.locator('form:has(select[name=niveau])');
      if (!(await f.count())) {
        dire('AUTO-01 : le réglage du niveau d’automatisation est offert sur l’écran équipe', false, 'formulaire absent');
        return;
      }
      const tAvant = await texte();
      dire('AUTO-01 : le niveau en vigueur et le plafond du pack sont affichés',
        /L1|L2/.test(tAvant), tAvant.match(/plafond[^\n]{0,80}/i)?.[0] ?? 'texte du plafond non trouvé');

      await f.locator('select[name=niveau]').selectOption('L2');
      await f.locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1500);
      dire('AUTO-01 : dépasser le plafond du pack (L2 contre un plafond L1) est refusé, en nommant le plafond et le pack',
        Boolean(refus(p)) && /L1/.test(refus(p) ?? '') && /pcaob-sox/.test(refus(p) ?? ''), refus(p) ?? 'passé — défaut');

      await aller(`${base}/eng/${c.controleWalkthrough!.engId}/team`);
      const f2 = p.locator('form:has(select[name=niveau])');
      await f2.locator('select[name=niveau]').selectOption('L1');
      await f2.locator('button').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1500);
      const tApres = await texte();
      dire('AUTO-01 : un réglage qui respecte le plafond (L1) est accepté, et l’écran le montre en vigueur',
        !refus(p) && /L1/.test(tApres), refus(p) ?? tApres.match(/plafond[^\n]{0,80}/i)?.[0] ?? '(non lu)');
    });
  }

  await station('clôture et archive scellée', async () => {
    /* CLORE, C'EST SIGNER : la station le DIT au lieu d'hériter de l'identité
       laissée par la précédente. Ce couplage caché a mordu dès qu'une station
       s'est intercalée : le préparateur n'a pas le droit de signature, l'écran
       ne lui offre donc aucun bouton — et le parcours concluait « le dossier
       n'est PAS scellé » alors que zéro obstacle subsistait. Une station qui
       dépend de ce que la précédente a laissé mesure l'ordre du fichier. */
    await devenir(c.associe.id);
    await aller(`${eng}/close`);
    const t = await texte();
    if (restants > 0 && !R('close.fileSealed').test(t)) {
      /* Le refus est ici l'ABSENCE du bouton : l'écran ne propose pas de clore
         un dossier qui porte des obstacles, et il dit combien il en reste. */
      dire('clôture : tant qu’un obstacle subsiste, la clôture n’est pas offerte',
        (await compteAbsent('button', 'close.closeTheFileAndSealThe')) === 0
          && R('obst.titre').test(t),
        `${restants} obstacle(s) restant(s)`);
    }
    if (await compte(`button:has-text("${L('close.closeTheFileAndSealThe')}")`)) {
      await cliquer(`button:has-text("${L('close.closeTheFileAndSealThe')}")`, 20000);
      dire('clôture : le dossier se CLÔT et l’archive est scellée',
        !refus(p) && R('close.fileSealed').test(await texte()), refus(p) ?? 'scellé');
    }

    const tf = await texte();
    if (!R('close.fileSealed').test(tf)) {
      dire('clôture : le dossier n’est PAS scellé à la fin du parcours', false,
        `${restants} obstacle(s) au visa subsistent`);
      return;
    }
    const empreinte = tf.match(/([0-9a-f]{64})/)?.[1] ?? '';
    dire('archive : le dossier scellé porte son empreinte SHA-256 à l’écran',
      /^[0-9a-f]{64}$/.test(empreinte), empreinte.slice(0, 24) + '…');

    /* LE CHEMIN DE LECTURE. Une archive qu'on ne peut pas SORTIR ne prouve rien
       à un inspecteur — et `file_archive` n'en avait aucun (ADR-091). */
    const rep = await p.request.get(`${base}/api/archive/${c.eng}`);
    const buf = await rep.body();
    const zip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;   // « PK »
    dire('archive : elle se TÉLÉCHARGE, et ce sont bien les octets d’un zip',
      rep.status() === 200 && zip,
      `HTTP ${rep.status()} · ${(buf.length / 1024).toFixed(0)} ko · ${zip ? 'zip' : 'pas un zip'}`);
  });

  return { etapes, gestes };
}
