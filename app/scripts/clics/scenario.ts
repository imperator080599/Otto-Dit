import type { Page } from 'playwright';

// LE PARCOURS CLIQUÉ — ce que le balayage ne peut pas voir.
//
// `npm run screens` OUVRE chaque route et vérifie qu'elle rend. Il ne clique
// sur rien. Or les deux défauts les plus coûteux de ce dépôt étaient invisibles
// à l'ouverture : six formulaires INERTES en production (ADR-078) et un dossier
// créé QUE PERSONNE NE POUVAIT ATTEINDRE (ADR-088). Un écran qui rend n'est pas
// un écran qui marche.
//
// CE QUE CHAQUE ÉTAPE VÉRIFIE VRAIMENT. Une action qui réussit prouve peu ; ce
// qui prouve, c'est qu'une action INTERDITE soit refusée ET que le refus
// s'affiche. Les étapes ci-dessous sont donc en majorité des refus attendus.

export interface Etape { nom: string; ok: boolean; detail: string }

/* LIRE LE REFUS OÙ IL EST ÉCRIT. Chercher « refus » dans le texte de la page
   attrape les explications de la méthode (« Le système refuse, il ne rappelle
   pas ») et annonce un refus là où l'action a RÉUSSI. Les écrans font voyager
   le refus dans `?erreur=` (ADR-078) : c'est là, et nulle part ailleurs. */
function refus(p: Page): string | null {
  const m = p.url().match(/[?&]erreur=([^&]*)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

const texte = (p: Page) => p.locator('body').innerText();

/** La réponse défavorable de chaque critère, prise dans la méthode. */
const DEFAVORABLE: Record<string, string> = {
  integrite_direction: 'oui', competence_equipe: 'non', independance: 'non',
  predecesseur: 'non', difficultes_exercice_precedent: 'oui', honoraires_soutenables: 'non',
};

export async function conduire(p: Page, base: string, engRiche: string): Promise<Etape[]> {
  const etapes: Etape[] = [];
  const dire = (nom: string, ok: boolean, detail: string) => etapes.push({ nom, ok, detail });

  // ═══ 1. CRÉER UN DOSSIER ═══════════════════════════════════════════════
  await p.goto(base + '/', { waitUntil: 'load' });
  await p.locator('summary:has-text("Créer un dossier")').click();
  await p.waitForTimeout(200);
  await p.locator('select[name=kind]').selectOption('integrated');
  await p.locator('input[name=name]').fill('Dossier créé au clic');
  await p.locator('form button:has-text("Créer")').click();
  await p.waitForTimeout(2500);

  let engNeuf = '';
  if (p.url().includes('/acceptance')) {
    engNeuf = p.url().match(/\/eng\/([^/]+)/)![1];
    /* LE CONTRÔLE QUI A TROUVÉ ADR-088 : le dossier créé doit être ATTEIGNABLE.
       Il existait, bien formé, et n'apparaissait nulle part — la liste d'accueil
       joint `engagement_member` et le créateur n'y était pas. */
    dire('création : le dossier créé s’ouvre sur son acceptation', true, engNeuf);
  } else {
    /* REJOUABLE. La règle du doublon refuse la seconde exécution, à raison : le
       script suit alors le dossier déjà créé. Une vérification qui ne se rejoue
       qu'une fois est une affirmation. */
    const motif = refus(p) ?? '';
    const href = await p.locator('a[href*="/eng/"]').evaluateAll(
      (els, nom) => { const a = els.find((e) => (e.textContent ?? '').includes(nom)); return a ? a.getAttribute('href') : null; },
      'Dossier créé au clic',
    );
    engNeuf = href ? href.match(/^\/eng\/([^/]+)/)![1] : '';
    dire('création : refusée en doublon, et le dossier déjà créé reste ATTEIGNABLE',
      Boolean(motif) && Boolean(engNeuf), motif || 'refus non lisible dans l’URL');
  }
  if (!engNeuf) return etapes;

  // ═══ 2. ACCEPTATION ════════════════════════════════════════════════════
  await p.goto(`${base}/eng/${engNeuf}/acceptance`, { waitUntil: 'load' });
  const ouvrir = p.locator('button:has-text("Ouvrir la décision")');
  if (await ouvrir.count()) { await ouvrir.click(); await p.waitForTimeout(2000); }

  if (await p.locator('button:has-text("Accepter la mission")').count()) {
    await p.locator('button:has-text("Accepter la mission")').click();
    await p.waitForTimeout(2000);
    const r = refus(p);
    dire('acceptation : décider SANS motif est refusé', Boolean(r), r ?? 'passé — défaut');

    /* Parcourir par CODE : le formulaire d'un critère reste affiché après la
       réponse (on doit pouvoir se corriger), donc `.first()` répond n fois au
       même — et l'application refuse alors la décision en nommant les critères
       sans réponse, ce qui est juste, mais ce n'est pas ce qu'on vérifiait. */
    const codes = await p.locator('form:has(select[name=answer]) input[name=code]')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    for (const code of codes) {
      const f = p.locator(`form:has(input[name=code][value="${code}"]):has(select[name=answer])`);
      await f.locator('select[name=answer]').selectOption(DEFAVORABLE[code] === 'oui' ? 'non' : 'oui');
      await f.locator('button:has-text("Noter")').click();
      await p.waitForTimeout(1000);
    }
    const sansReponse = await p.locator('form:has(select[name=answer]) select[name=answer]')
      .evaluateAll((els) => els.filter((e) => !(e as HTMLSelectElement).value).length);
    dire('acceptation : tous les critères notés', codes.length > 0 && sansReponse === 0,
      `${codes.length} critère(s), ${sansReponse} sans réponse`);

    await p.locator('input[name=reason]').first()
      .fill('Client connu, équipe disponible, indépendance acquise.');
    await p.locator('button:has-text("Accepter la mission")').click();
    await p.waitForTimeout(2500);
    const r2 = refus(p);
    dire('acceptation : décider AVEC motif et critères complets est accepté',
      !r2 && (await texte(p)).includes('acceptée'), r2 ?? 'acceptée');
  } else {
    dire('acceptation : décision déjà prise (rejeu)', true,
      (await texte(p)).match(/(acceptée|refusée)[^\n]{0,60}/i)?.[0] ?? '');
  }

  // ═══ 3. JALONS ═════════════════════════════════════════════════════════
  /* Le jalon DÉRIVÉ ne se refuse pas : il ne s'offre pas. Une action impossible
     qu'on ne propose pas vaut mieux qu'une action proposée puis refusée — à
     condition de DIRE pourquoi, sinon l'absence se lit comme un oubli. */
  const champDerive = await p.locator('form:has(input[name=code][value="assemblage"])').count();
  const tJalons = await texte(p);
  dire('jalons : le jalon dérivé n’est pas saisissable, et la raison est écrite',
    champDerive === 0 && /ne se saisit pas/.test(tJalons),
    champDerive === 0 ? 'aucun champ' : 'champ offert — défaut');

  const libre = p.locator('form:has(input[name=code][value="lettre_mission"])');
  if (await libre.count()) {
    await libre.locator('input[name=date]').fill('2025-10-20');
    await libre.locator('button:has-text("Poser")').click();
    await p.waitForTimeout(2000);
    dire('jalons : un jalon libre se pose et s’affiche',
      !refus(p) && /20\/10\/2025/.test(await texte(p)), refus(p) ?? 'posé');
  }

  // ═══ 4. REPRISE N-1 — sur le dossier RICHE, seul à avoir un exercice N-1 ═
  await p.goto(`${base}/eng/${engRiche}/carry-forward`, { waitUntil: 'load' });
  const proposer = p.locator('button:has-text("Proposer la reprise")');
  if (await proposer.count()) { await proposer.click(); await p.waitForTimeout(2500); }
  const aDesPropositions = await p.locator('button:has-text("Écarter")').count() > 0;
  dire('reprise N-1 : des conclusions de l’exercice précédent sont PROPOSÉES',
    aDesPropositions, aDesPropositions ? 'propositions affichées' : 'aucune proposition');

  if (aDesPropositions) {
    await p.locator('button:has-text("Écarter")').first().click();
    await p.waitForTimeout(2000);
    const r = refus(p);
    dire('reprise N-1 : écarter SANS motif est refusé', Boolean(r), r ?? 'passé — défaut');
    const champ = p.locator('input[name=reason]').first();
    if (await champ.count()) {
      await champ.fill('Périmètre revu cette année : le poste a changé de nature.');
      await p.locator('button:has-text("Écarter")').first().click();
      await p.waitForTimeout(2000);
      dire('reprise N-1 : écarter AVEC motif est accepté', !refus(p), refus(p) ?? 'écarté');
    }
    const rec = p.locator('button:has-text("Reconfirmer")').first();
    if (await rec.count()) {
      await rec.click(); await p.waitForTimeout(2000);
      dire('reprise N-1 : reconfirmer une conclusion est accepté', !refus(p), refus(p) ?? 'reconfirmé');
    }
  }

  // ═══ 5. POINTAGE DES ÉTATS FINANCIERS ══════════════════════════════════
  await p.goto(`${base}/eng/${engRiche}/fs-tieout`, { waitUntil: 'load' });
  const charger = p.locator('button:has-text("Charger la plaquette")');
  if (await charger.count()) { await charger.click(); await p.waitForTimeout(2500); }
  const repointer = p.locator('button:has-text("Repointer")');
  if (await repointer.count()) { await repointer.click(); await p.waitForTimeout(2500); }
  dire('pointage : la plaquette est chargée et pointée',
    /pointé|écart|ouvert|documenté/i.test(await texte(p)), 'statuts affichés');

  const doc = p.locator('button:has-text("Documenter")').first();
  if (await doc.count()) {
    const exp = p.locator('input[name=explanation]').first();
    if (await exp.count()) await exp.fill('Calculé hors système, feuille annexe.');
    await doc.click();
    await p.waitForTimeout(2000);
    const r = refus(p);
    dire('pointage : documenter un chiffre SANS pièce liée est refusé', Boolean(r), r ?? 'passé — défaut');
  }

  // ═══ 6. ACHÈVEMENT ═════════════════════════════════════════════════════
  await p.goto(`${base}/eng/${engRiche}/completion`, { waitUntil: 'load' });
  const ouvrirAch = p.locator('button:has-text("Ouvrir les travaux")');
  if (await ouvrirAch.count()) { await ouvrirAch.click(); await p.waitForTimeout(2500); }
  const conc = p.locator('button:has-text("Conclure")').first();
  if (await conc.count()) {
    const f = p.locator('input[name=findings]').first();
    if (await f.count()) await f.fill('Revue faite.');
    await conc.click();
    await p.waitForTimeout(2000);
    const r = refus(p);
    dire('achèvement : conclure SANS conclusion écrite est refusé', Boolean(r), r ?? 'passé — défaut');
  }
  await p.goto(`${base}/eng/${engRiche}/completion`, { waitUntil: 'load' });
  const tAch = await texte(p);
  const ligne = await p.locator('form:has(input[name=nature][value="lettre_affirmation"])').count();
  const bouton = await p.locator(
    'form:has(input[name=nature][value="lettre_affirmation"]):has(button:has-text("Sans objet"))').count();
  dire('achèvement : la lettre d’affirmation ne peut pas être « sans objet », et l’écran le dit',
    ligne > 0 && bouton === 0 && /Pas de « sans objet » ici/.test(tAch),
    bouton === 0 ? 'action non offerte, raison écrite' : 'action offerte — défaut');

  // ═══ 7. OBSTACLES AU VISA ══════════════════════════════════════════════
  await p.goto(`${base}/eng/${engRiche}/obstacles`, { waitUntil: 'load' });
  const tObs = await texte(p);
  const familles = ['Acceptation', 'Reprise', 'Questionnaire', 'boucle', 'Pointage', 'anomalies', 'Jalons']
    .filter((f) => new RegExp(f, 'i').test(tObs));
  dire('obstacles : la liste unique est calculée et rend ses familles',
    familles.length >= 5 && /(aucun obstacle|\d+\s+obstacle)/i.test(tObs),
    `${familles.length} famille(s) · ${tObs.match(/(aucun obstacle|\d+\s+obstacle)/i)?.[0] ?? '?'}`);

  return etapes;
}
