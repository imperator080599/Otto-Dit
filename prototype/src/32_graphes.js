
/* ═══ 48. REPRÉSENTATIONS GRAPHIQUES — À L'ENCRE ═══════════════════════════
   Cinq représentations pour l'associé qui ouvre le dossier : avancement par
   section, budget contre réalisé, achèvements dans le temps rapportés à
   l'échéance, charge par personne, et âge des demandes en retard.

   CONTRAINTE, et c'est elle qui décide de tout : le système visuel existant
   s'applique intégralement. Les graphiques se tracent à l'ENCRE — les trois
   gris du texte et le filet — et la COULEUR reste réservée aux PROBLÈMES :
   retard, blocage, dépassement de budget. Aucune palette de graphique, aucun
   dégradé, aucune teinte hors jetons. Un camembert à sept couleurs dirait
   « regardez-moi » là où le dossier dit « regardez ce qui ne va pas ».

   Conséquence de conception : ce sont des BARRES et des LIGNES, jamais des
   secteurs, parce qu'une série sans couleur ne se distingue que par sa
   position et sa longueur. La densité fait le reste — hachures pour ce qui
   est fait, plein pour ce qui reste.
   ═══════════════════════════════════════════════════════════════════════ */

/* Les seules « couleurs » admises dans un graphe. Trois encres, un filet, et
   deux teintes de problème — exactement les jetons du système. */
const ENCRE = { fort:'var(--ink)', moyen:'var(--ink-2)', faible:'var(--ink-3)',
                filet:'var(--line)', probleme:'var(--anomalie)', attention:'var(--attention)' };

/* `preserveAspectRatio` par défaut CENTRE le dessin quand le conteneur est
   plus large que le viewBox : les graphiques flottaient au milieu d'une page
   large, décrochés de la colonne de texte. On les cale à gauche et on borne
   leur largeur — au-delà, un graphique étiré ne se lit pas mieux. */
function svg(w, h, contenu, titre){
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img"
    preserveAspectRatio="xMinYMid meet" aria-label="${esc(titre)}"
    style="display:block;overflow:visible;max-width:${w}px">${contenu}</svg>`;
}
function txt(x, y, s, o){
  o = o || {};
  return `<text x="${x}" y="${y}" fill="${o.fill || ENCRE.faible}"
    font-family="${o.mono ? 'var(--mono)' : 'var(--sans)'}" font-size="${o.taille || 11}"
    text-anchor="${o.ancre || 'start'}"${o.gras ? ' font-weight="700"' : ''}>${esc(s)}</text>`;
}
function rect(x, y, w, h, fill, o){
  o = o || {};
  return `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${h}" fill="${fill}"
    ${o.opacite ? `opacity="${o.opacite}"` : ''} ${o.rx ? `rx="${o.rx}"` : ''}></rect>`;
}
/** Hachures : ce qui est FAIT, sans recourir à une seconde couleur. */
/* `fill="none"` partout où rien ne doit être peint : sans lui, ces éléments
   portent le noir par défaut de SVG. Ils ne peignent rien — un trait n'a pas
   de surface, un <defs> ne se rend pas — mais le contrôle de couleur les
   relève, et il a raison de les relever : une teinte non voulue dans le
   document reste une teinte non voulue. On la retire plutôt que de l'excuser. */
const HACHURE = `<defs fill="none">
  <pattern id="hach" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" fill="none">
    <rect width="4" height="4" fill="var(--panel)"></rect>
    <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink-2)" stroke-width="2" fill="none"></line>
  </pattern>
</defs>`;

/* ── 1. avancement par section ──────────────────────────────────────────── */
function grapheAvancement(){
  const postes = postesEnPerimetre().map(p => {
    const l = travauxDe(p.code).filter(t => !t.sansObjet);
    return { p, n:l.length,
             revus:l.filter(t => t.statut === 'revu').length,
             acheves:l.filter(t => t.statut === 'acheve').length,
             obst:obstaclesVisa(p).length, visa:!!sec(p.code).visa };
  }).filter(x => x.n).sort((a, b) => (b.revus + b.acheves) / b.n - (a.revus + a.acheves) / a.n);
  /* Colonnes FIXES : nom, barre, décompte, obstacles. En texte proportionnel
     on ne sait pas où finit une chaîne, et deux étiquettes finissaient l'une
     sur l'autre. Chaque colonne a donc sa position, et le décompte est en
     chasse fixe pour que les nombres s'alignent. */
  const H = 19, LG = 152, BAR = 260, CPT = LG + BAR + 12, OBS = CPT + 92, W = OBS + 106;
  const h = postes.length * H + 26;
  const lignes = postes.map((x, i) => {
    const y = i * H + 16;
    const u = BAR / Math.max(1, x.n);
    const wr = x.revus * u, wa = x.acheves * u, wo = (x.n - x.revus - x.acheves) * u;
    return txt(0, y + 9, x.p.lib.length > 25 ? x.p.lib.slice(0, 24) + '…' : x.p.lib, { fill:ENCRE.moyen })
      + rect(LG, y, BAR, 11, ENCRE.filet)
      + rect(LG, y, wr, 11, ENCRE.fort)
      + rect(LG + wr, y, wa, 11, 'url(#hach)')
      + (x.obst ? rect(LG + wr + wa + wo - 2, y, 2, 11, ENCRE.probleme) : '')
      + txt(CPT, y + 9, `${String(x.revus).padStart(2)} · ${String(x.acheves).padStart(2)} · ${String(x.n).padStart(2)}`,
            { mono:true, fill:ENCRE.faible })
      + (x.obst ? txt(OBS, y + 9, String(x.obst).padStart(2) + ' obstacle(s)',
            { mono:true, fill:ENCRE.probleme }) : '');
  }).join('');
  return svg(W, h, HACHURE
    + txt(CPT, 8, 'revu · achevé · total', { mono:true, fill:ENCRE.faible })
    + lignes
    + txt(0, h - 2, 'plein : revu · hachuré : achevé · filet : reste — le trait rouge marque une section qui porte un obstacle au visa',
          { fill:ENCRE.faible }),
    'Avancement par section');
}

/* ── 2. budget contre réalisé, par phase ────────────────────────────────── */
function grapheBudget(){
  const l = travaux().filter(t => !t.sansObjet);
  const par = PHASES.map(ph => {
    const t = l.filter(x => x.phase === ph.id);
    return { ph, b:t.reduce((a, x) => a + budget(x), 0), r:t.reduce((a, x) => a + x.heuresReel, 0) };
  }).filter(x => x.b || x.r);
  const max = Math.max(1, ...par.map(x => Math.max(x.b, x.r)));
  const H = 30, LG = 150, BAR = 300, W = LG + BAR + 150;
  const h = par.length * H + 26;
  const lignes = par.map((x, i) => {
    const y = i * H + 12;
    const depasse = x.r > x.b;
    return txt(0, y + 8, x.ph.lib, { fill:ENCRE.moyen })
      + rect(LG, y, BAR * x.b / max, 9, ENCRE.filet)
      + txt(LG + BAR * x.b / max + 6, y + 8, hFmt(x.b), { mono:true, fill:ENCRE.faible })
      + rect(LG, y + 11, BAR * x.r / max, 9, depasse ? ENCRE.probleme : ENCRE.moyen)
      + txt(LG + BAR * x.r / max + 6, y + 19, hFmt(x.r) + (depasse ? ' — dépassement' : ''),
            { mono:true, fill:depasse ? ENCRE.probleme : ENCRE.faible });
  }).join('');
  return svg(W, h, lignes
    + txt(LG, h - 2, 'barre claire : budget · barre pleine : réalisé — rouge dès que le réalisé dépasse',
          { fill:ENCRE.faible }),
    'Budget contre réalisé, par phase');
}

/* ── 3. achèvements dans le temps, rapportés à l'échéance ───────────────── */
function grapheCourbe(){
  const l = travaux().filter(t => !t.sansObjet);
  const faits = l.filter(t => t.acheve).map(t => t.acheve.t.slice(0, 10)).sort();
  const deb = jalon('interim'), fin = jalon('rapport');
  const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const total = Math.max(1, jours(deb, fin));
  const W = 520, h = 150, G = 40, B = 26;
  const x = d => G + (W - G - 10) * Math.min(1, Math.max(0, jours(deb, d) / total));
  const y = n => h - B - (h - B - 14) * (n / Math.max(1, l.length));
  /* La courbe RÉELLE : un palier par achèvement. */
  let pts = `${x(deb)},${y(0)}`, n = 0;
  for (const d of faits){ pts += ` ${x(d)},${y(n)} ${x(d)},${y(++n)}`; }
  pts += ` ${x(S.aujourdhui)},${y(n)}`;
  /* La droite ATTENDUE : de zéro au premier jalon à tout à la date du rapport.
     Ce n'est pas une prévision, c'est une référence — et elle est en pointillé
     pour qu'on ne la confonde pas avec une mesure. */
  const retard = n < l.length * Math.min(1, jours(deb, S.aujourdhui) / total);
  return svg(W, h, `
    <line x1="${G}" y1="${h - B}" x2="${W - 10}" y2="${h - B}" stroke="${ENCRE.filet}" stroke-width="1" fill="none"></line>
    <line x1="${G}" y1="14" x2="${G}" y2="${h - B}" stroke="${ENCRE.filet}" stroke-width="1" fill="none"></line>
    <line x1="${x(deb)}" y1="${y(0)}" x2="${x(fin)}" y2="${y(l.length)}"
      stroke="${ENCRE.faible}" stroke-width="1" stroke-dasharray="3 3" fill="none"></line>
    <line x1="${x(S.aujourdhui)}" y1="10" x2="${x(S.aujourdhui)}" y2="${h - B}"
      stroke="${ENCRE.moyen}" stroke-width="1" fill="none"></line>
    <polyline points="${pts}" fill="none" stroke="${retard ? ENCRE.probleme : ENCRE.fort}" stroke-width="2"></polyline>
    ${txt(G - 6, y(l.length) + 4, String(l.length), { mono:true, ancre:'end' })}
    ${txt(G - 6, y(0) + 4, '0', { mono:true, ancre:'end' })}
    ${txt(x(deb), h - B + 14, frDate(deb), { mono:true })}
    ${txt(x(fin), h - B + 14, frDate(fin), { mono:true, ancre:'end' })}
    ${txt(x(S.aujourdhui) + 4, 18, 'aujourd’hui', { fill:ENCRE.moyen })}
    ${txt(G, h - 4, `trait plein : travaux achevés · pointillé : rythme qu’exige la date du rapport`
      + (retard ? ' — la courbe est sous la référence' : ''),
      { fill:retard ? ENCRE.probleme : ENCRE.faible })}`,
    'Travaux achevés dans le temps');
}

/* ── 4. charge par personne ─────────────────────────────────────────────── */
function grapheCharge(){
  const c = chargeParPersonne('reelle').filter(x => !USERS[x.k].sortie);
  const prop = chargeParPersonne('proposee');
  const max = Math.max(1, ...c.map(x => x.h), ...prop.map(x => x.h));
  const H = 26, LG = 150, BAR = 280, W = LG + BAR + 170;
  const h = c.length * H + 26;
  const lignes = c.map((x, i) => {
    const y = i * H + 12, pr = prop.find(z => z.k === x.k) || { h:0 };
    return txt(0, y + 8, x.u.nom, { fill:ENCRE.moyen })
      + txt(0, y + 19, x.u.grade, { fill:ENCRE.faible })
      + rect(LG, y, BAR * pr.h / max, 8, ENCRE.filet)
      + rect(LG, y + 10, BAR * x.h / max, 8, x.indispo ? ENCRE.probleme : ENCRE.fort)
      + txt(LG + BAR + 8, y + 8, hFmt(pr.h) + ' proposé', { mono:true, fill:ENCRE.faible })
      + txt(LG + BAR + 8, y + 19, x.indispo ? esc(x.indispo) : hFmt(x.h) + ' attribué',
            { mono:!x.indispo, fill:x.indispo ? ENCRE.probleme : ENCRE.moyen });
  }).join('');
  return svg(W, h, lignes
    + txt(LG, h - 2, 'barre claire : charge proposée · barre pleine : charge réellement attribuée',
          { fill:ENCRE.faible }),
    'Charge par personne');
}

/* ── 5. âge des demandes clients en retard ──────────────────────────────── */
function grapheRetards(){
  const l = S.requetes.filter(retard).map(r => ({ r, age:ancienneteRetard(r) }))
    .sort((a, b) => b.age - a.age);
  if (!l.length) return `<p class="note">Aucune demande en retard : rien à tracer.</p>`;
  const max = Math.max(...l.map(x => x.age), 1);
  const H = 20, LG = 230, BAR = 240, W = LG + BAR + 110;
  const h = l.length * H + 26;
  const seuil = S.portail.escalade;
  const lignes = l.map((x, i) => {
    const y = i * H + 14;
    const grave = x.age >= seuil;
    return txt(0, y + 9, (x.r.titre.length > 38 ? x.r.titre.slice(0, 37) + '…' : x.r.titre), { fill:ENCRE.moyen })
      + rect(LG, y, BAR * x.age / max, 11, grave ? ENCRE.probleme : ENCRE.attention)
      + txt(LG + BAR * x.age / max + 6, y + 9, x.age + ' j ouvrés', { mono:true,
            fill:grave ? ENCRE.probleme : ENCRE.moyen });
  }).join('');
  return svg(W, h, lignes
    + `<line x1="${LG + BAR * seuil / max}" y1="6" x2="${LG + BAR * seuil / max}" y2="${h - 20}"
        stroke="${ENCRE.probleme}" stroke-width="1" stroke-dasharray="2 2" fill="none"></line>`
    + txt(LG, h - 2, `pointillé : seuil d’escalade du portail (${seuil} jours ouvrés)`, { fill:ENCRE.faible }),
    'Âge des demandes en retard');
}

/** Le bloc entier, pour la vue de pilotage. */
function blocGraphes(){
  return blk('Où en est le dossier', 'cinq lectures, à l’encre — la couleur ne dit qu’un problème',
    `<h3>Avancement par section</h3>${grapheAvancement()}
     <h3>Budget contre réalisé</h3>${grapheBudget()}
     <h3>Travaux achevés dans le temps</h3>${grapheCourbe()}
     <h3>Charge par personne</h3>${grapheCharge()}
     <h3>Demandes clients en retard</h3>${grapheRetards()}
     <p class="note">Tout est tracé avec les jetons du système : trois encres, le filet, et les deux teintes
     de problème. Aucune palette de graphique, aucun dégradé. Une série ne se distingue donc jamais par sa
     couleur mais par sa <b>position</b>, sa <b>longueur</b> et sa <b>densité</b> — et quand quelque chose
     devient rouge, c’est que quelque chose ne va pas, pas que c’est la deuxième série.</p>`);
}
