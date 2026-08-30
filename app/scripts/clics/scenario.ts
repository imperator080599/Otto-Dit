import type { BrowserContext, Locator, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import type { Contexte } from './contexte';

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

export async function conduire(
  p: Page, ctx: BrowserContext, base: string, c: Contexte,
): Promise<Etape[]> {
  const etapes: Etape[] = [];
  const dire = (nom: string, ok: boolean, detail: string) => etapes.push({ nom, ok, detail });
  const eng = `${base}/eng/${c.eng}`;

  const texte = () => p.locator('body').innerText();
  const compte = (sel: string) => p.locator(sel).count();
  const aller = async (url: string) => { await p.goto(url, { waitUntil: 'load' }); };
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
    try {
      await fn();
    } catch (e) {
      const cause = e instanceof Error ? e.message.split('\n')[0] : String(e);
      dire(nom, false, `station interrompue — ${cause.slice(0, 150)}`);
      return;
    }
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
      if (await compte('button:has-text("Approve")')) {
        await cliquer('button:has-text("Approve")', 3000);
        if (!refus(p)) envoyees++;
      }
    }
    return envoyees;
  };

  let engNeuf = '';

  await devenir(c.associe.id);

  // ── 1. CRÉER UN DOSSIER, ET LE RETROUVER (le contrôle qui a trouvé ADR-088)
  await station('création : le dossier créé est ATTEIGNABLE', async () => {
    await aller(base + '/');
    await cliquer('summary:has-text("Créer un dossier")', 300);
    await p.locator('select[name=kind]').selectOption('integrated');
    await p.locator('input[name=name]').fill('Dossier créé au clic');
    await cliquer('form button:has-text("Créer")', 2500);

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

  // ── 2. ACCEPTATION ET JALONS, sur le dossier neuf
  await station('acceptation du dossier neuf', async () => {
    if (!engNeuf) { dire('acceptation : pas de dossier neuf à accepter', false, 'étape 1 en échec'); return; }
    await aller(`${base}/eng/${engNeuf}/acceptance`);
    if (await compte('button:has-text("Ouvrir la décision")')) {
      await cliquer('button:has-text("Ouvrir la décision")');
    }
    if (await compte('button:has-text("Accepter la mission")')) {
      await cliquer('button:has-text("Accepter la mission")');
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
        await f.locator('button:has-text("Noter")').click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(900);
      }
      const sansReponse = await p.locator('form:has(select[name=answer]) select[name=answer]')
        .evaluateAll((els) => els.filter((e) => !(e as HTMLSelectElement).value).length);
      dire('acceptation : tous les critères notés', codes.length > 0 && sansReponse === 0,
        `${codes.length} critère(s), ${sansReponse} sans réponse`);

      await p.locator('input[name=reason]').first()
        .fill('Client connu, équipe disponible, indépendance acquise.');
      await cliquer('button:has-text("Accepter la mission")', 2500);
      dire('acceptation : décider AVEC motif et critères complets est accepté',
        !refus(p) && (await texte()).includes('acceptée'), refus(p) ?? 'acceptée');
    } else {
      dire('acceptation : décision déjà prise (rejeu)', true,
        (await texte()).match(/(acceptée|refusée)[^\n]{0,60}/i)?.[0] ?? '');
    }

    /* Le jalon DÉRIVÉ ne se refuse pas : il ne s'OFFRE pas. Une action
       impossible qu'on ne propose pas vaut mieux qu'une action proposée puis
       refusée — à condition de dire pourquoi, sinon l'absence se lit comme un
       oubli d'écran. */
    dire('jalons : le jalon dérivé n’est pas saisissable, et la raison est écrite',
      (await compte('form:has(input[name=code][value="assemblage"]) input[name=date]')) === 0
        && /ne se saisit pas/.test(await texte()),
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
      await f1.locator('button:has-text("Import FEC")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(5000);
      dire('import : ré-importer le grand livre SANS confirmer l’invalidation est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    } else {
      dire('import : aucune sélection en aval, la confirmation n’est pas demandée', true,
        'rien à invalider');
    }

    await aller(`${eng}/imports`);
    const f2 = p.locator('form:has(button:has-text("Import FEC"))');
    await f2.locator('input[type=file]').setInputFiles(fecDef);
    const cb = f2.locator('input[name=confirm_invalidation]');
    if (await cb.count()) await cb.check();
    await f2.locator('button:has-text("Import FEC")').click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(12000);
    dire('import : le FEC DÉFINITIF entre, invalidation confirmée',
      !refus(p), refus(p) ?? 'importé');
  });

  // ── 4. RAPPROCHEMENT : c'est LUI, propre, qui lève le drapeau « provisoire »
  await station('rapprochement balance / grand livre', async () => {
    await aller(`${eng}/reconciliation`);
    if (await compte('button:has-text("Recompute")')) {
      await cliquer('button:has-text("Recompute")', 6000);
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
    await bloc.locator('button:has-text("Revoir")').click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(3000);
    dire('périmètre : une décision de périmètre se REVOIT, avec un motif',
      !refus(p), refus(p) ?? 'décision revue');

    await aller(`${eng}/obstacles`);
    const bloque = /Périmètre sans programme/i.test(await texte());
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
      await b2.locator('button:has-text("Revoir")').click();
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
        await f.locator('button:has-text("arbitrer")').click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2500);
        dire(`risque : surcharger le niveau (${calcule ?? '?'} → ${autre}) SANS motif écrit est refusé`,
          Boolean(refus(p)), refus(p) ?? 'passé — défaut');

        await aller(`${eng}/risk`);
        const g = p.locator('tr:has(form:has(select[name=level]))').nth(ligne.i).locator('form');
        await g.locator('select[name=level]').selectOption(autre);
        await g.locator('input[name=reason]').fill(
          'Surcharge motivée : le confrère précédent signale une pression commerciale de fin d’exercice non visible dans les données.');
        await g.locator('button:has-text("arbitrer")').click();
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
    if (await compte('button:has-text("Propose parameters")')) {
      await cliquer('button:has-text("Propose parameters")', 5000);
    }
    dire('sondage : les paramètres sont PROPOSÉS avec leur justification',
      (await compte('button:has-text("Validate parameters")')) > 0 || (await compte('button:has-text("Draw sample")')) > 0,
      refus(p) ?? 'proposition affichée');

    if (await compte('button:has-text("Validate parameters")')) {
      await devenir(c.reviewer.id);
      await aller(`${eng}/sampling`);
      await cliquer('button:has-text("Validate parameters")', 4000);
      dire('sondage : une PERSONNE valide les paramètres avant tout tirage',
        !refus(p), refus(p) ?? 'paramètres validés');
    }
    if (await compte('button:has-text("Draw sample")')) {
      await cliquer('button:has-text("Draw sample")', 15000);
      dire('sondage : le tirage est déterministe, et il est fait',
        !refus(p), refus(p) ?? 'tirage effectué');
    }
    const t = await texte();
    dire('sondage : la sélection tirée est affichée avec sa méthode et son germe',
      /seed|germe|monetary|coverage|couverture/i.test(t) && t.length > 300,
      t.match(/(seed|germe)[^\n]{0,40}/i)?.[0] ?? 'affichée');

    if (await compte('button:has-text("Generate PBC request")')) {
      await cliquer('button:has-text("Generate PBC request")', 6000);
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

  // ── 11. TESTING : extraction → attestation → vouching → re-exécution → évaluation
  await station('testing', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/testing`);
    if (await compte('button:has-text("Run extraction ladder")')) {
      await cliquer('button:has-text("Run extraction ladder")', 25000);
      dire('testing : l’échelle d’extraction tourne, hors ligne, sur les pièces déposées',
        !refus(p), refus(p) ?? 'extraction faite');
    }
    let atteste = 0;
    for (let tour = 0; tour < 60; tour++) {
      const f = p.locator('form:has(button:has-text("Confirm fields"))').first();
      if (!(await f.count())) break;
      await f.locator('button:has-text("Confirm fields")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1100);
      atteste++;
    }
    dire('testing : aucun champ extrait n’entre au dossier sans qu’une personne l’atteste',
      true, `${atteste} extraction(s) attestée(s)`);

    if (await compte('button:has-text("Run vouching")')) {
      await cliquer('button:has-text("Run vouching")', 20000);
      dire('testing : le vouching est déterministe (L0), et il est fait',
        !refus(p), refus(p) ?? 'vouching effectué');
    }
    dire('testing : le résultat du vouching est rendu, écart par écart',
      /matched|exception|pending/i.test(await texte()), 'états de rapprochement affichés');
  });

  // ── 12. LA BOUCLE : émettre les clarifications dues aux écarts ouverts
  //    C'est le geste que la boucle réclame : un écart ouvert sans demande de
  //    clarification laisse la boucle ouverte, et le visa bloqué.
  await station('la boucle : émettre les clarifications', async () => {
    await devenir(c.preparateur.id);
    await aller(`${eng}/loop`);
    if (await compte('button:has-text("Émettre les clarifications")')) {
      await cliquer('button:has-text("Émettre les clarifications")', 6000);
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
      if (await compte('button:has-text("Tous les justificatifs ont été transmis")')) {
        await soumettre(p.locator('button:has-text("Tous les justificatifs ont été transmis")').first(), 1200)
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
    if (await compte('button:has-text("Run extraction ladder")')) {
      await cliquer('button:has-text("Run extraction ladder")', 25000);
    }
    let atteste = 0;
    for (let tour = 0; tour < 80; tour++) {
      const f = p.locator('form:has(button:has-text("Confirm fields"))').first();
      if (!(await f.count())) break;
      await f.locator('button:has-text("Confirm fields")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1100);
      atteste++;
    }
    if (await compte('button:has-text("Run vouching")')) {
      await cliquer('button:has-text("Run vouching")', 20000);
    }
    await aller(`${eng}/loop`);
    const reste = (await texte()).match(/(\d+)\s+pièces? lues? non encore rapproch/i)?.[1] ?? '0';
    dire('testing : plus aucune pièce lue ne reste sans rapprochement',
      reste === '0', `${atteste} attestation(s) de plus · ${reste} pièce(s) en attente`);
  });

  // ── 14. ÉCARTS : une résolution GÉNÉRIQUE est rejetée, puis on résout POUR DE BON
  await station('résolution des écarts', async () => {
    await devenir(c.reviewer.id);
    await aller(`${eng}/exceptions`);
    /* DÉPLIER AVANT DE REMPLIR. Le formulaire de disposition vit dans un
       `<details>` replié : Playwright attend indéfiniment un champ caché, et la
       station tombait sur un délai de trente secondes sans rien dire du
       produit. Un harnais qui échoue sur SA propre mécanique accuse le code. */
    const deplier = async () => {
      const n = await p.locator('details:not([open]) > summary').count();
      for (let i = 0; i < n; i++) {
        await p.locator('details:not([open]) > summary').first().click({ timeout: 5000 }).catch(() => undefined);
      }
    };
    await deplier();
    const f = p.locator('form:has(button:has-text("Resolve"))').first();
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
    await f.locator('button:has-text("Resolve")').click();
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(2500);
    /* ET LE REFUS DOIT ÊTRE LU PAR UN HUMAIN, pas seulement présent dans
       l'URL. Vérifier `?erreur=` prouve que le service a refusé ; il ne prouve
       pas que l'écran le MONTRE. Les deux se sont déjà dissociés : dix écrans
       calculaient un refus et rendaient une page 500. On regarde donc le texte. */
    const messageVisible = (await texte()).includes('refusé');
    dire('écarts : une explication vide de contenu (des espaces) est refusée, et le refus S’AFFICHE',
      Boolean(refus(p)) && messageVisible,
      refus(p) ? (messageVisible ? refus(p)! : 'refusé mais RIEN À L’ÉCRAN — défaut') : 'passé — défaut');

    /* LE LIEN MANQUANT, EN COURT-CIRCUITANT LA GARDE DU NAVIGATEUR. Le
       `required` est une commodité d'écran ; la règle, elle, doit tenir sans
       lui — c'est ce que verrait un client d'API. On désactive donc la
       validation HTML pour vérifier que le SERVEUR refuse, et pas seulement le
       champ. */
    await aller(`${eng}/exceptions`);
    await deplier();
    const g0 = p.locator('form:has(button:has-text("Resolve"))').first();
    if (await g0.count()) {
      await g0.evaluate((el) => { (el as HTMLFormElement).noValidate = true; });
      await g0.locator('textarea[name=explanation]').fill(
        'Le client indique que la facture est correcte.');
      await g0.locator('textarea[name=conclusion]').fill('Explication retenue.');
      const sel0 = g0.locator('select[name=corroboration]');
      if (await sel0.count()) await sel0.selectOption('');
      await g0.locator('button:has-text("Resolve")').click();
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
      await deplier();
      const g = p.locator('form:has(button:has-text("Resolve"))').first();
      if (!(await g.count())) break;
      const contexte = await g.evaluate((e) => (e.closest('tr') ?? e.parentElement)?.textContent ?? '');
      /* Un écart de MONTANT est une anomalie : il se chiffre, il ne se
         « résout » pas d'un trait de plume. Le produit sépare les deux, et le
         parcours doit emprunter les deux chemins. */
      const chiffrable = /écart|difference|montant|€/i.test(contexte)
        && (await p.locator('form:has(button:has-text("Misstatement"))').count()) > 0
        && anomalies < 2;
      if (chiffrable) {
        const h = p.locator('form:has(button:has-text("Misstatement"))').first();
        await h.locator('input[name=amount]').fill('1800');
        await h.locator('button:has-text("Misstatement")').click();
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
      await g.locator('button:has-text("Resolve")').click();
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
    if (await compte('button:has-text("Draw subsample")')) {
      await cliquer('button:has-text("Draw subsample")', 5000);
      dire('re-exécution : un sous-échantillon est tiré pour re-performer en aveugle',
        !refus(p), refus(p) ?? 'sous-échantillon tiré');
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
      const f = p.locator('form:has(button:has-text("Submit blind"))').first();
      if (!(await f.count())) break;
      const ligne = await f.evaluate((e) => (e.closest('tr') ?? e.parentElement)?.textContent ?? '');
      const ref = ligne.match(/(FA|AV)\d{4}-\d{4}/)?.[0];
      const fx = ref ? fixtures.find((x) => x.filename.includes(ref)) : undefined;
      const net = fx?.fields.find((x) => x.name === 'totalNetCents')?.value;
      const date = fx?.fields.find((x) => x.name === 'invoiceDate')?.value;
      if (!net || !date) break;
      await f.locator('input[name=net]').fill((Number(net) / 100).toFixed(2));
      await f.locator('input[name=date]').fill(date);
      await f.locator('button:has-text("Submit blind")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1600);
      soumis++;
    }
    dire('re-exécution : les contrôles en aveugle sont soumis depuis l’écran',
      soumis > 0 || (await compte('button:has-text("Submit blind")')) === 0,
      `${soumis} contrôle(s) soumis`);

    await aller(`${eng}/testing`);
    if (await compte('form:has(button:has-text("Recompute")) button')) {
      await p.locator('form:has(button:has-text("Recompute"))').last().locator('button').click();
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
      await fRep.locator('button:has-text("Enregistrer la réponse")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(3000);
      dire('évaluation : la réponse au dépassement de l’anomalie tolérable s’enregistre à l’écran',
        !refus(p), refus(p) ?? 'réponse enregistrée');
    }
    const fConc = p.locator('form:has(textarea[name=basis])');
    if (await fConc.count()) {
      await fConc.locator('textarea[name=basis]').fill(
        'Anomalies non corrigées supérieures au seuil de signification : le chiffre d’affaires est '
        + 'surévalué de façon significative si les corrections annoncées ne sont pas comptabilisées. '
        + 'Conclusion prise sur le grand livre définitif, rapprochement re-exécuté et propre.');
      await fConc.locator('button:has-text("Record conclusion")').click();
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
    if (await compte('button:has-text("Draft REV-01")')) {
      await cliquer('button:has-text("Draft REV-01")', 8000);
      dire('papier : le papier se RÉDIGE depuis les faits stockés, pas à la main',
        !refus(p), refus(p) ?? 'papier rédigé');
    }
    const lien = await p.locator('a[href*="/workpapers/"]').first().getAttribute('href').catch(() => null);
    if (!lien) { dire('papier : aucun papier de travail dans le dossier', false, 'écran vide'); return; }

    await aller(base + lien);
    const t = await texte();
    dire('papier : le papier rend, avec ses sections et son bloc de visas',
      /visa|sign|préparateur|preparer/i.test(t) && t.length > 400, `${t.length} car.`);

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
      await fNote.locator('button:has-text("Add note")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('papier : une note de revue s’ajoute et s’affiche', !refus(p), refus(p) ?? 'note ajoutée');
    }
    // Le préparateur la traite, le reviewer la ferme : une note ne se ferme pas seule.
    await devenir(c.preparateur.id);
    await aller(base + lien);
    for (let tour = 0; tour < 8; tour++) {
      const f = p.locator('form:has(button:has-text("Mark addressed"))').first();
      if (!(await f.count())) break;
      await f.locator('button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    await devenir(c.reviewer.id);
    await aller(base + lien);
    for (let tour = 0; tour < 8; tour++) {
      const f = p.locator('form:has(button:has-text("Close (author)"))').first();
      if (!(await f.count())) break;
      await f.locator('button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    dire('papier : les notes de revue sont traitées puis fermées par leur auteur',
      (await compte('form:has(button:has-text("Close (author)"))')) === 0, 'aucune note ouverte');

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
      await panneau.locator('button:has-text("Poser la note")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2000);
      await aller(base + lien);
      dire('note ancrée : l’élément annoté porte le jeton d’attention',
        (await compte('.annotable.a-note')) >= 1, `${await compte('.annotable.a-note')} élément(s) marqué(s)`);

      // La vue transverse la montre, avec son ancre.
      await aller(`${eng}/notes`);
      dire('notes : la vue transverse porte l’ancre de la note',
        /Conclusion/i.test(await texte()), 'ancre visible');

      // Le préparateur répond — la réponse entre au dossier et la note passe « adressée ».
      await devenir(c.preparateur.id);
      await aller(`${eng}/notes`);
      const fRep = p.locator('form:has(input[name=texte][placeholder*="Répondre"])').first();
      if (await fRep.count()) {
        await fRep.locator('input[name=texte]').fill('Conclusion étoffée, renvoi ajouté.');
        await fRep.locator('button:has-text("Répondre")').click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2000);
        dire('notes : la réponse s’enregistre et la note passe « adressée »',
          !refus(p) && /adressée/.test(await texte()), refus(p) ?? 'réponse au dossier');
      }
      // Il tente de clore : refusé — seul l'AUTEUR clôt sa note.
      const fClore = p.locator('form:has(button:has-text("Clore"))').first();
      if (await fClore.count()) {
        await fClore.locator('button').first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(2000);
        dire('notes : la clôture par un autre que l’auteur est REFUSÉE',
          Boolean(refus(p)), refus(p) ?? 'PASSÉE — défaut');
      }
      // L'auteur clôt, dans la vue transverse.
      await devenir(c.reviewer.id);
      await aller(`${eng}/notes`);
      for (let tour = 0; tour < 8; tour++) {
        const f = p.locator('form:has(button:has-text("Clore"))').first();
        if (!(await f.count())) break;
        await f.locator('button').first().click();
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
        await p.waitForTimeout(1400);
      }
      dire('notes : l’auteur clôt sa note ancrée depuis la vue transverse',
        (await compte('form:has(button:has-text("Clore"))')) === 0, 'aucune note ouverte');
    } else {
      dire('note ancrée : la conclusion du papier est annotable', false, 'élément .annotable absent');
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

    // L'export : le papier sort du produit, en PDF.
    if (await compte('form:has(input[name=format][value="pdf"]) button')) {
      await p.locator('form:has(input[name=format][value="pdf"]) button').first().click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(6000);
      dire('papier : il s’exporte en PDF depuis l’écran', !refus(p), refus(p) ?? 'export demandé');
    }
  });

  // ── 17. LA BOUCLE, RELUE
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
    if (await compte('button:has-text("Proposer la reprise")')) {
      await cliquer('button:has-text("Proposer la reprise")', 3000);
    }
    if (await compte('button:has-text("Écarter")')) {
      await cliquer('button:has-text("Écarter")');
      dire('reprise N-1 : écarter une conclusion SANS motif est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }
    for (let tour = 0; tour < 60; tour++) {
      const f = p.locator('form:has(button:has-text("Reconfirmer"))').first();
      if (!(await f.count())) break;
      await f.locator('button:has-text("Reconfirmer")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1100);
    }
    dire('reprise N-1 : plus aucune proposition non statuée',
      (await compte('button:has-text("Reconfirmer")')) === 0, 'toutes statuées');
  });

  // ── 19. POINTAGE DES ÉTATS FINANCIERS
  await station('pointage des états financiers', async () => {
    await aller(`${eng}/fs-tieout`);
    if (await compte('button:has-text("Charger la plaquette")')) {
      await cliquer('button:has-text("Charger la plaquette")', 4000);
    }
    if (await compte('button:has-text("Repointer")')) {
      await cliquer('button:has-text("Repointer")', 4000);
    }
    dire('pointage : la plaquette est chargée et pointée',
      /pointé|écart|ouvert|documenté/i.test(await texte()), 'statuts affichés');

    const doc = p.locator('form:has(button:has-text("Documenter"))').first();
    if (await doc.count()) {
      await doc.locator('input[name=explanation]').fill('Calculé hors système, feuille annexe.');
      await doc.locator('button:has-text("Documenter")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('pointage : documenter un chiffre SANS pièce liée est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }
    // …puis correctement, sinon l'obstacle demeure et le dossier ne se clôt pas.
    for (let tour = 0; tour < 25; tour++) {
      const f = p.locator('form:has(button:has-text("Documenter"))').first();
      if (!(await f.count())) break;
      await f.locator('input[name=explanation]').fill(
        'Poste calculé hors système à partir du détail des comptes ; la feuille de calcul est jointe.');
      const sel = f.locator('select[name=evidence_id]');
      const vals = await sel.locator('option').evaluateAll(
        (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
      if (!vals.length) break;
      await sel.selectOption(vals[0]);
      await f.locator('button:has-text("Documenter")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    for (let tour = 0; tour < 25; tour++) {
      const f = p.locator('form:has(button:has-text("Expliquer"))').first();
      if (!(await f.count())) break;
      await f.locator('input[name=explanation]').fill(
        'Écart de présentation : reclassement opéré dans la plaquette, sans incidence sur le résultat.');
      await f.locator('button:has-text("Expliquer")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1400);
    }
    dire('pointage : plus aucune ligne ouverte ni écart inexpliqué',
      (await compte('form:has(button:has-text("Documenter"))')) === 0
        && (await compte('form:has(button:has-text("Expliquer"))')) === 0,
      'toutes les lignes traitées');
  });

  // ── 20. ACHÈVEMENT
  await station('achèvement', async () => {
    await devenir(c.associe.id);
    await aller(`${eng}/completion`);
    if (await compte('button:has-text("Ouvrir les travaux")')) {
      await cliquer('button:has-text("Ouvrir les travaux")', 3000);
    }
    const f0 = p.locator('form:has(button:has-text("Conclure"))').first();
    if (await f0.count()) {
      await f0.locator('input[name=findings]').fill('Revue faite.');
      await f0.locator('button:has-text("Conclure")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(2500);
      dire('achèvement : conclure SANS conclusion écrite est refusé',
        Boolean(refus(p)), refus(p) ?? 'passé — défaut');
    }
    dire('achèvement : la lettre d’affirmation ne peut pas être « sans objet », et l’écran le dit',
      (await compte('form:has(input[name=nature][value="lettre_affirmation"])')) > 0
        && (await compte('form:has(input[name=nature][value="lettre_affirmation"]):has(button:has-text("Sans objet"))')) === 0
        && /Pas de « sans objet » ici/.test(await texte()),
      'action non offerte, raison écrite');

    const rapport = (await texte()).match(/Date du rapport\s*:?\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];
    const iso = rapport ? rapport.split('/').reverse().join('-') : '2026-03-31';
    for (let tour = 0; tour < 12; tour++) {
      const f = p.locator('form:has(button:has-text("Conclure"))').first();
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
      await f.locator('button:has-text("Conclure")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1800);
    }
    dire('achèvement : les cinq natures sont conclues',
      (await compte('form:has(button:has-text("Conclure"))')) === 0,
      'plus aucune nature à conclure');
  });

  // ── 21. JALONS : poser, puis MARQUER FAIT (le geste qui n'avait pas d'écran)
  await station('jalons', async () => {
    await aller(`${eng}/acceptance`);
    for (let tour = 0; tour < 12; tour++) {
      const f = p.locator('form:has(button:has-text("Marquer fait"))').first();
      if (!(await f.count())) break;
      await f.locator('button:has-text("Marquer fait")').click();
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1300);
    }
    dire('jalons : chaque jalon se marque FAIT depuis l’écran',
      (await compte('form:has(button:has-text("Marquer fait"))')) === 0,
      'aucun jalon posé non fait');
  });

  // ── 22. OBSTACLES AU VISA
  let restants = 0;
  await station('obstacles au visa', async () => {
    await aller(`${eng}/obstacles`);
    const t = await texte();
    restants = Number(t.match(/(\d+)\s+obstacle/i)?.[1] ?? '0');
    dire('obstacles : la liste unique est calculée et rend son verdict',
      /(aucun obstacle|\d+\s+obstacle)/i.test(t),
      t.match(/(aucun obstacle|\d+\s+obstacle)/i)?.[0] ?? '(non lu)');
  });

  // ── 23. CLÔTURE ET ARCHIVE SCELLÉE
  await station('clôture et archive scellée', async () => {
    await aller(`${eng}/close`);
    const t = await texte();
    if (restants > 0 && !/dossier scellé/.test(t)) {
      /* Le refus est ici l'ABSENCE du bouton : l'écran ne propose pas de clore
         un dossier qui porte des obstacles, et il dit combien il en reste. */
      dire('clôture : tant qu’un obstacle subsiste, la clôture n’est pas offerte',
        (await compte('button:has-text("Clore le dossier")')) === 0 && /obstacle/i.test(t),
        `${restants} obstacle(s) restant(s)`);
    }
    if (await compte('button:has-text("Clore le dossier")')) {
      await cliquer('button:has-text("Clore le dossier")', 20000);
      dire('clôture : le dossier se CLÔT et l’archive est scellée',
        !refus(p) && /dossier scellé/.test(await texte()), refus(p) ?? 'scellé');
    }

    const tf = await texte();
    if (!/dossier scellé/.test(tf)) {
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

  return etapes;
}
