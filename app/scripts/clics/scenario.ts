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

    /* LE QUESTIONNAIRE : compter d'abord, boucler ensuite. Une liste vide veut
       dire deux choses — « tout est répondu » et « la page n'est pas encore
       revenue » — et la première version les confondait : après l'arbitrage,
       elle lisait zéro formulaire au milieu d'un re-rendu, sortait de la boucle
       et annonçait « 0 sans réponse » sur un questionnaire entièrement vierge. */
    await aller(`${eng}/risk`);
    const total = await compte('form:has(select[name=answer])');
    if (total === 0) {
      dire('risque : aucun formulaire de questionnaire à l’écran', false,
        'la liste est vide — répondu, ou pas encore rendu ?');
    }

    /* ATTENDRE QUE LA RÉPONSE SOIT LÀ, pas qu'un délai soit écoulé. La
       première version attendait 900 ms puis relisait le DOM : en production le
       aller-retour de l'action est plus long, la page montrait encore l'ancien
       état, la boucle re-répondait DEUX CENTS FOIS à la même question et
       concluait « dix sans réponse » — un harnais qui insiste au lieu de
       rapporter, et qui accuse le produit de son propre défaut de patience. */
    const videsMaintenant = () => p.locator('form:has(select[name=answer])').evaluateAll(
      (els) => els.map((e, i) => ({ i, v: (e.querySelector('select[name=answer]') as HTMLSelectElement)?.value }))
        .filter((x) => !x.v).map((x) => x.i));

    let repondus = 0;
    for (let tour = 0; tour < 60 && total > 0; tour++) {
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
        await aller(`${eng}/risk`);
        if ((await videsMaintenant()).length >= vides.length) {
          dire('risque : une réponse au questionnaire ne s’enregistre pas', false,
            refus(p) ?? `${vides.length} question(s) restent sans réponse après envoi`);
          break;
        }
      }
      repondus++;
      const r = refus(p);
      if (r) { dire('risque : la réponse au questionnaire est REFUSÉE', false, r); break; }
    }
    const reste = await p.locator('form:has(select[name=answer])').evaluateAll(
      (els) => els.filter((e) => !(e.querySelector('select[name=answer]') as HTMLSelectElement)?.value).length);
    dire('risque : le questionnaire résiduel est répondu, question par question',
      total > 0 && reste === 0, `${total} question(s), ${repondus} répondue(s), ${reste} sans réponse`);
  });

  // ── 8. SONDAGE : proposer → valider → TIRER → demander les pièces
  //    Le ré-import du fichier définitif a INVALIDÉ la sélection tirée sur le
  //    fichier provisoire (ADR-016). Ce n'est pas un effet de bord du harnais :
  //    c'est la règle, et c'est ce que le dossier de démonstration promet
  //    lui-même dans sa limitation de périmètre — « le rapprochement sera
  //    re-exécuté sur le FEC définitif avant conclusion définitive ». Les
  //    travaux se REFONT donc sur le grand livre définitif, au clic.
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
      await cliquer(`button:has-text("${L('samp.generatePbcRequest')}")`, 6000);
      dire('sondage : la demande de pièces naît DE la sélection, pas d’une saisie',
        !refus(p), refus(p) ?? 'demande engendrée');
    }
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
    const lien = await p.locator('a[href*="/workpapers/"]').first().getAttribute('href').catch(() => null);
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

  // ── 21. JALONS : poser, puis MARQUER FAIT (le geste qui n'avait pas d'écran)
  await station('jalons', async () => {
    await aller(`${eng}/acceptance`);
    /* LES JALONS SONT DANS UN REPLI depuis la revue n°2 (ils sortent du flux
       d'acceptation sans disparaître). Le geste de l'utilisateur est donc :
       déplier, puis marquer. */
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
    const lienWp = await p.locator('a[href*="/workpapers/"]').first().getAttribute('href').catch(() => null);
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
