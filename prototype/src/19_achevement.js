/* ═══ 28. REVUE ANALYTIQUE — TROIS MOMENTS ═════════════════════════════════
   Ce ne sont pas trois affichages d'un même module : ce sont trois diligences
   différentes, à trois moments différents, avec trois finalités.
     · préliminaire — en planification, transverse, elle ALIMENTE le registre
       des facteurs de risque ;
     · substantive  — dans une section, comme procédure à valeur probante ;
     · finale       — à l'achèvement, cohérence d'ensemble avant signature.
   ═══════════════════════════════════════════════════════════════════════ */

/** Ratios calculés des deux exercices. Aucun n'est saisi. */
function ratios(){
  const q = (b, re) => { let s = 0; for (const [c, v] of b) if (re.test(c)) s += v.solde; return s; };
  const f = b => {
    const ca = -q(b, /^70/), achats = q(b, /^60/), perso = q(b, /^64/),
          stocks = q(b, /^3/), clients = q(b, /^41/), fourn = -q(b, /^40/),
          produits = -q(b, /^7/), charges = q(b, /^6/), fin = q(b, /^66/);
    return { ca, achats, perso, stocks, clients, fourn, resultat:produits - charges, fin };
  };
  const a = f(bal()), b = f(B24);
  const L = [
    { lib:'Marge sur achats consommés', u:'%', formule:'(chiffre d’affaires − achats consommés) ÷ chiffre d’affaires',
      n:a.ca ? (a.ca - a.achats) / a.ca : 0, n1:b.ca ? (b.ca - b.achats) / b.ca : 0, type:'pct' },
    { lib:'Poids des charges de personnel', u:'%', formule:'charges de personnel ÷ chiffre d’affaires',
      n:a.ca ? a.perso / a.ca : 0, n1:b.ca ? b.perso / b.ca : 0, type:'pct' },
    { lib:'Résultat courant rapporté au chiffre d’affaires', u:'%', formule:'résultat courant ÷ chiffre d’affaires',
      n:a.ca ? a.resultat / a.ca : 0, n1:b.ca ? b.resultat / b.ca : 0, type:'pct' },
    { lib:'Délai de règlement clients', u:'jours', formule:'créances clients ÷ chiffre d’affaires × 365',
      n:a.ca ? a.clients / a.ca * 365 : 0, n1:b.ca ? b.clients / b.ca * 365 : 0, type:'jours' },
    { lib:'Délai de règlement fournisseurs', u:'jours', formule:'dettes fournisseurs ÷ achats consommés × 365',
      n:a.achats ? a.fourn / a.achats * 365 : 0, n1:b.achats ? b.fourn / b.achats * 365 : 0, type:'jours' },
    { lib:'Rotation des stocks', u:'jours', formule:'stocks ÷ achats consommés × 365',
      n:a.achats ? a.stocks / a.achats * 365 : 0, n1:b.achats ? b.stocks / b.achats * 365 : 0, type:'jours' },
    { lib:'Couverture des charges financières', u:'×', formule:'résultat courant ÷ charges financières',
      n:a.fin ? a.resultat / a.fin : 0, n1:b.fin ? b.resultat / b.fin : 0, type:'fois' },
  ];
  return L.map(r => ({ ...r, d:r.n - r.n1,
    fmt:v => r.type === 'pct' ? pct(v, 1) : r.type === 'jours' ? v.toFixed(0).replace('.', ',') + NBSP + 'j'
           : v.toFixed(1).replace('.', ',') + NBSP + '×' }));
}

function vueRAPrelim(){
  const lignes = revueAnalytique().filter(l => l.flag);
  const rt = ratios();
  const deja = c => S.requetes.some(r => r.origine === 'revue analytique préliminaire' && r.items.some(i => i.ref === c));
  return entete('Revue analytique préliminaire', 'planification — elle sert à orienter les travaux, pas à conclure') +
    cite('Revue analytique générée automatiquement, variation comptes entre l’année N (auditée) et N-1 et FSLI, en haut de cette revue analytique un threshold monétaire et un % de variation, si la variation du compte dépasse l’un ou l’autre ou les 2 (à faire valider par un auditeur humain) des questions sur l’explication de la variation sont automatiquement envoyée au client sur l’interface des requêtes.') +
    blk('Seuils', 'le seuil en montant suit par défaut le seuil de planification',
      `<div class="row">
        <div class="ctrl"><label>Seuil en montant</label>
          <input type="number" id="ar-montant" value="${(arSeuilMontant() / 100).toFixed(0)}" step="1000"></div>
        <div class="ctrl"><label>Seuil en pourcentage</label>
          <input type="number" id="ar-pct" value="${S.arPct}" step="1"></div>
        <div class="ctrl"><label>&nbsp;</label>
          <span class="pill ${lignes.length ? 'warn' : ''}">${lignes.length} compte(s) au-dessus d’un seuil</span></div>
      </div>`) +
    blk('Variations de compte', lignes.length + ' au-dessus d’un seuil',
      lignes.length ? `<div class="tw"><table>
        <thead><tr><th>Compte</th><th class="n">Variation</th><th class="n">%</th><th>Ressort</th>
          <th>Poste</th><th>Destinataire</th><th>Question composée</th><th></th></tr></thead>
        <tbody>${lignes.map(l => {
          const ps = postesDuCompte(l.compte), c = ps.length ? referentSection(ps[0].code) : S.contacts[0];
          return `<tr>
            <td class="mono">${l.compte}<div class="smallcaps">${sensNaturel(l) < 0 ? 'créditeur' : 'débiteur'}</div></td>
            <td class="n">${eur(l.d * sensNaturel(l))}</td>
            <td class="n">${l.p === null ? '—' : pct(Math.abs(l.p) * (l.d * sensNaturel(l) > 0 ? 1 : -1), 1)}</td>
            <td>${l.parMontant ? '<span class="tag">montant</span> ' : ''}${l.parPct ? '<span class="tag">%</span>' : ''}</td>
            <td>${ps.map(x => `<button class="btn mini sec" data-open="${x.code}">${esc(x.lib)}</button>`).join(' ') || '<span class="smallcaps">—</span>'}</td>
            <td class="wrapcell">${c ? '<b>' + esc(c.nom) + '</b><div class="smallcaps">' + esc(c.fonction) + '</div>' : '—'}</td>
            <td class="wrapcell">${esc(questionVariation(l))}</td>
            <td>${deja(l.compte) ? '<span class="pill">requête émise</span>'
                  : `<button class="btn mini" data-raprelim="${l.compte}">envoyer la requête</button>`}</td></tr>`;
        }).join('')}</tbody></table></div>`
        : '<p class="note">Aucune variation au-dessus des seuils.</p>') +
    blk('Ratios', 'tous calculés depuis les deux balances',
      table([{k:'l',t:'Ratio',cls:'wrapcell'},{k:'f',t:'Formule',cls:'wrapcell'},
             {k:'a',t:'2024',n:1},{k:'b',t:'2025',n:1},{k:'d',t:'Variation',n:1}],
        rt.map(r => ({ l:esc(r.lib), f:'<span class="smallcaps">' + esc(r.formule) + '</span>',
                       a:r.fmt(r.n1), b:r.fmt(r.n),
                       d:(r.d > 0 ? '+' : '') + r.fmt(r.d).replace('+', '') })))) +
    blk('Effet sur le registre des facteurs de risque',
      registre().filter(f => f.regle === 'RA_PRELIM').length + ' facteur(s) levé(s)',
      `${registre().filter(f => f.regle === 'RA_PRELIM').length
        ? registre().filter(f => f.regle === 'RA_PRELIM').map(f => carteFacteur(f, false)).join('')
        : '<p class="note">Aucune variation ne dépasse le multiple retenu pour lever un facteur. Le seuil se règle dans le registre.</p>'}`);
}

/* ═══ 29. ESPACE ACHÈVEMENT ════════════════════════════════════════════════ */
const DATE_RAPPORT = '2026-04-15';
const DELAI_ASSEMBLAGE = 60;      // jours — C. com., art. D. 821-186, III et IV
const RETENTION_ANS = 6;          // ans  — C. com., art. R. 820-42

/* ── pointage des états financiers : trois natures de rapprochement ──────── */
function soldeDe(comptes){ const b = bal(); return comptes.reduce((a, c) => a + (b.get(c) ? b.get(c).solde : 0), 0); }
const PLAQUETTE = [
  { ref:'B-01', lib:'Capital social', nature:'solde', comptes:['101000'], ecart:0 },
  { ref:'B-02', lib:'Réserve légale', nature:'solde', comptes:['106100'], ecart:0 },
  { ref:'B-03', lib:'Immobilisations corporelles nettes', nature:'agregat',
    comptes:['213500','218300','281350','281830'],
    formule:'valeurs brutes 213500 + 218300 − amortissements 281350 + 281830', ecart:0 },
  { ref:'B-04', lib:'Stocks', nature:'agregat', comptes:['301000','355000'],
    formule:'matières premières 301000 + produits finis 355000', ecart:0 },
  { ref:'B-05', lib:'Créances clients', nature:'solde', comptes:['411000'], ecart:-120000 },
  { ref:'B-06', lib:'Trésorerie', nature:'agregat', comptes:['512100','512200'],
    formule:'somme des comptes de banque', ecart:0 },
  { ref:'R-01', lib:'Chiffre d’affaires', nature:'agregat', comptes:['701000','706000','709000'],
    formule:'ventes 701000 + prestations 706000 − rabais 709000', ecart:0 },
  { ref:'R-02', lib:'Charges de personnel', nature:'agregat', comptes:['641000','645000'],
    formule:'rémunérations 641000 + charges sociales 645000', ecart:0 },
  { ref:'A-01', lib:'Annexe — acquisitions d’immobilisations de l’exercice', nature:'calcul',
    formule:'valeur brute à la clôture − valeur brute à l’ouverture + valeur brute des cessions de l’exercice',
    aide:'Le montant ne se lit dans aucun solde : il résulte du tableau de variation. Il doit être documenté.' },
  { ref:'A-02', lib:'Annexe — échéancier des dettes financières à plus d’un an', nature:'calcul',
    formule:'capital restant dû au 31/12/2025 diminué des échéances contractuelles des douze mois suivants',
    aide:'Le solde 164000 ne se ventile pas seul : la ventilation vient du tableau d’amortissement de l’emprunt.' },
  { ref:'A-03', lib:'Annexe — ventilation du chiffre d’affaires par nature', nature:'calcul',
    formule:'ventes de produits finis d’une part, prestations de services d’autre part, nettes des rabais affectés',
    aide:'L’affectation des rabais par nature ne figure pas en comptabilité : elle doit être obtenue et documentée.' },
];
function montantAudite(e){
  if (e.nature === 'calcul') return null;
  return Math.abs(soldeDe(e.comptes));
}
function montantPlaquette(e){
  const a = montantAudite(e);
  return a === null ? null : a + (e.ecart || 0);
}
const NATURE_LIB = { solde:'solde de balance', agregat:'agrégat de comptes', calcul:'calcul à documenter' };

function vueAchPointage(){
  const st = S.achevement;
  const rows = PLAQUETTE.map(e => {
    const aud = e.nature === 'calcul'
      ? (st.calculs[e.ref] && st.calculs[e.ref].montant !== undefined ? st.calculs[e.ref].montant : null)
      : montantAudite(e);
    const pl = e.nature === 'calcul'
      ? (st.plaquette[e.ref] !== undefined ? st.plaquette[e.ref] : null)
      : montantPlaquette(e);
    const ec = (aud === null || pl === null) ? null : pl - aud;
    return {
      ref:`<span class="mono">${e.ref}</span>`,
      lib:`<b>${esc(e.lib)}</b>${e.formule ? '<div class="smallcaps">' + esc(e.formule) + '</div>' : ''}`,
      nat:`<span class="tag ${e.nature === 'calcul' ? 'abs' : 'det'}">${NATURE_LIB[e.nature]}</span>`,
      pl:e.nature === 'calcul'
         ? `<input class="cell" data-plaq="${e.ref}" value="${pl === null ? '' : (pl / 100).toFixed(2).replace('.', ',')}" placeholder="montant plaquette">`
         : eur(pl),
      or:e.nature === 'calcul' ? '<span class="smallcaps">à documenter</span>'
         : `<span class="smallcaps">${e.comptes.join(' · ')}</span>`,
      aud:e.nature === 'calcul'
          ? `<input class="cell" data-calcm="${e.ref}" value="${aud === null ? '' : (aud / 100).toFixed(2).replace('.', ',')}" placeholder="montant audité">`
          : eur(aud),
      ec:ec === null ? '<span class="pill warn">non rapproché</span>'
         : ec === 0 ? '<span class="pill">nul</span>' : '<span class="pill bad">' + eur(ec) + '</span>',
      doc:e.nature === 'calcul'
          ? `<input class="cell txt" data-calcd="${e.ref}" value="${esc((st.calculs[e.ref] || {}).doc || '')}" placeholder="d’où vient le montant">`
          : '<span class="smallcaps">rapproché de la balance</span>',
    };
  });
  const nonRappro = PLAQUETTE.filter(e => {
    const aud = e.nature === 'calcul' ? (st.calculs[e.ref] || {}).montant : montantAudite(e);
    const pl = e.nature === 'calcul' ? st.plaquette[e.ref] : montantPlaquette(e);
    return aud === undefined || aud === null || pl === undefined || pl === null;
  });
  const ecarts = PLAQUETTE.filter(e => {
    const aud = e.nature === 'calcul' ? (st.calculs[e.ref] || {}).montant : montantAudite(e);
    const pl = e.nature === 'calcul' ? st.plaquette[e.ref] : montantPlaquette(e);
    return aud != null && pl != null && pl - aud !== 0;
  });
  const sansDoc = PLAQUETTE.filter(e => e.nature === 'calcul' && !((st.calculs[e.ref] || {}).doc || '').trim());
  return entete('Pointage des états financiers', 'plaquette à gauche, montant audité à droite, écart et origine') +
    cite('Une fonction pointage des états financiers et données chiffrées des annexes où après réception de la plaquette du client, un agent IA vient s’assurer que chaque chiffre cadre bien avec les montants que nous avons audité, dans notre TB et documente un réconciliation sur un Template intégré avec à gauche montant plaquette et à droite montant interne et validé avec une cross reference vers l’origine du montant validé.') +
    blk('Rapprochement', `${PLAQUETTE.length} montants · ${ecarts.length} écart(s) · ${nonRappro.length} non rapproché(s)`,
      table([{k:'ref',t:'Réf.'},{k:'lib',t:'Poste de la plaquette',cls:'wrapcell'},{k:'nat',t:'Nature'},
             {k:'pl',t:'Montant plaquette',n:1},{k:'aud',t:'Montant audité',n:1},
             {k:'or',t:'Origine',cls:'wrapcell'},{k:'ec',t:'Écart',n:1},{k:'doc',t:'Documentation du calcul',cls:'wrapcell'}], rows) +
      `<div class="row" style="margin-top:8px">
        <span class="pill ${ecarts.length ? 'bad' : ''}">${ecarts.length} écart(s)</span>
        <span class="pill ${nonRappro.length ? 'warn' : ''}">${nonRappro.length} non rapproché(s)</span>
        <span class="pill ${sansDoc.length ? 'warn' : ''}">${sansDoc.length} calcul(s) sans documentation</span>
        <span class="smallcaps">${PLAQUETTE.filter(e => e.nature === 'calcul').length} des ${PLAQUETTE.length} montants ne se lisent dans aucun solde</span>
      </div>
      <p class="note">Aucune plaquette n’existe dans ce fichier : les montants « solde » et « agrégat » viennent de la
      balance auditée augmentée des écarts semés, ceux marqués « calcul » se saisissent. Lire une plaquette réelle
      relève de l’échelle d’extraction <span class="tag mod">modèle</span>.</p>`);
}

function vueAchRA(){
  const rt = ratios(), st = S.achevement;
  const lignes = revueAnalytique().filter(l => l.flag);
  return entete('Revue analytique finale', 'achèvement — cohérence d’ensemble avant signature') +
    blk('Ce que la revue finale ajoute', 'elle ne refait pas la préliminaire',
      `<div class="kv">
        <span class="k">Variations encore au-dessus des seuils</span><span class="v">${lignes.length}</span>
        <span class="k">Dont ayant reçu une explication du client</span><span class="v">${lignes.filter(l => S.requetes.some(r => r.items.some(i => i.ref === l.compte && i.depots.length))).length}</span>
        <span class="k">Anomalies non corrigées cumulées</span><span class="v">${eur(anomalies().filter(a => !a.souSeuil).reduce((t, a) => t + a.montant, 0))}</span>
        <span class="k">Sections visées</span><span class="v">${postesEnPerimetre().filter(p => sec(p.code).visa).length} / ${postesEnPerimetre().length}</span>
      </div>`) +
    blk('Ratios de clôture', 'mêmes formules qu’en planification, sur les comptes arrêtés',
      table([{k:'l',t:'Ratio',cls:'wrapcell'},{k:'a',t:'2024',n:1},{k:'b',t:'2025',n:1},{k:'d',t:'Variation',n:1}],
        rt.map(r => ({ l:esc(r.lib), a:r.fmt(r.n1), b:r.fmt(r.n), d:(r.d > 0 ? '+' : '') + r.fmt(r.d).replace('+', '') })))) +
    blk('Conclusion', st.raFinale.trim() ? 'rédigée' : 'à rédiger',
      `<textarea id="ach-ra" rows="4" placeholder="les comptes arrêtés sont-ils cohérents avec la connaissance acquise de l’entité et de son environnement ? les variations et ratios s’expliquent-ils par ce qui a été constaté au cours de la mission ?">${esc(st.raFinale)}</textarea>`);
}

/* ── diligences d'achèvement à liste de points ───────────────────────────── */
const ACH = {
  evenements:{ t:'Événements postérieurs à la clôture',
    sub:'du 31/12/2025 à la date du rapport',
    pts:['Procès-verbaux des organes sociaux postérieurs à la clôture obtenus et lus',
         'Situation intermédiaire et évolution de la trésorerie depuis la clôture examinées',
         'Litiges nés ou révélés depuis la clôture recensés auprès des conseils',
         'Engagements et opérations significatives postérieurs identifiés',
         'Distinction faite entre événements donnant lieu à ajustement et événements à mentionner'] },
  continuite:{ t:'Continuité d’exploitation',
    sub:'appréciation à la date du rapport',
    pts:['Prévisions de trésorerie à douze mois obtenues et rapprochées des hypothèses',
         'Respect des engagements bancaires et clauses contractuelles vérifié',
         'Capacité de financement et lignes disponibles confirmées',
         'Position de la direction obtenue par écrit',
         'Incidence éventuelle sur le rapport appréciée'] },
  affirmation:{ t:'Lettre d’affirmation',
    sub:'déclarations écrites de la direction',
    pts:['Périmètre des déclarations arrêté au regard des travaux effectués',
         'Anomalies non corrigées annexées à la lettre',
         'Parties liées, litiges et engagements couverts',
         'Événements postérieurs couverts',
         'Lettre datée du jour du rapport et signée par la direction'] },
  gouvernance:{ t:'Communication aux organes de gouvernance',
    sub:'avant la signature du rapport',
    pts:['Étendue et calendrier des travaux communiqués',
         'Faiblesses du contrôle interne relevées et communiquées',
         'Anomalies non corrigées portées à la connaissance de l’organe compétent',
         'Difficultés rencontrées et désaccords éventuels signalés',
         'Indépendance de l’équipe confirmée par écrit'] },
};
function vueAchSimple(k){
  const d = ACH[k], st = S.achevement.points[k] || (S.achevement.points[k] = {});
  const faits = d.pts.filter((_, i) => st[i]).length;
  return entete(d.t, d.sub) +
    blk('Points de diligence', faits + ' / ' + d.pts.length,
      d.pts.map((x, i) => `<label class="chk" style="display:flex;margin:4px 0">
        <input type="checkbox" data-achpt="${k}|${i}" ${st[i] ? 'checked' : ''}>
        <span style="white-space:normal">${esc(x)}</span></label>`).join('') +
      `<div class="ctrl" style="margin-top:10px"><label>Conclusion</label>
        <textarea data-achc="${k}" rows="3" placeholder="conclusion de l’auditeur">${esc(S.achevement.concl[k] || '')}</textarea></div>` +
      (faits < d.pts.length ? `<div class="callout warn">${d.pts.length - faits} point(s) non exécuté(s).</div>` : '')) +
    blk('Pièces requises', 'non fournies dans ce fichier',
      `<p class="note">Procès-verbaux, prévisions de trésorerie et confirmations de conseils se demandent par le
      portail ; leur lecture relève de l’échelle d’extraction <span class="tag mod">modèle</span>. Aucun résultat
      n’est simulé ici.</p>`);
}

function vueAchAnomalies(){
  const s = seuils(), a = anomalies(), st = S.achevement;
  const retenues = a.filter(x => !x.souSeuil);
  const resolues = retenues.filter(x => x.acquis);
  const nonCorr = retenues.filter(x => x.montant !== 0);
  const cumul = retenues.reduce((t, x) => t + x.montant, 0);
  const corrige = retenues.reduce((t, x) => t + (x.corrige || 0), 0);
  const parEcriture = retenues.filter(x => (x.corrigePar || []).length);
  const depasse = Math.abs(cumul) > s.M;
  const opinions = [
    { v:'certification', lib:'Certification sans réserve' },
    { v:'reserve', lib:'Certification avec réserve' },
    { v:'refus', lib:'Refus de certifier' },
    { v:'impossibilite', lib:'Impossibilité de certifier' },
  ];
  const propose = depasse ? 'reserve' : 'certification';
  return entete('Anomalies non corrigées et incidence sur l’opinion', 'évaluation finale') +
    blk('Anomalies au-dessus du seuil de remontée', retenues.length + ' — dont ' + nonCorr.length + ' résiduelles',
      table([{k:'src',t:'Origine',cls:'wrapcell'},{k:'lib',t:'Anomalie',cls:'wrapcell'},{k:'c',t:'Constaté',n:1},
             {k:'e',t:'Expliqué',n:1},{k:'x',t:'Corrigé',n:1},{k:'m',t:'Résiduel',n:1},
             {k:'q',t:'Qualification',cls:'wrapcell'},{k:'v',t:''}],
        retenues.map(x => ({
          src:esc(x.src), lib:esc(x.lib), c:eur(x.constate),
          e:x.explique ? eur(x.explique) : '<span class="smallcaps">—</span>',
          x:x.corrige ? eur(x.corrige) : '<span class="smallcaps">—</span>',
          m:x.montant ? eur(x.montant) : '<span class="smallcaps">—</span>',
          q:(x.corrigePar || []).length
            ? `corrigée par écriture<div class="smallcaps">${esc(x.corrigePar.map(y => 'v' + y.v + ' ' + y.ref).join(', '))}${x.montant ? ' — partiellement' : ''}</div>`
            : x.acquis ? `${esc(DISPOSITIONS[x.res.disposition].lib)}
              <div class="smallcaps">${esc(USERS[x.res.par].nom)}, ${horo(x.res.t)}</div>`
            : `<span class="pill bad">non résolue</span>`,
          v:`<button class="btn mini sec" data-goecart="${esc(x.vue)}">voir</button>`,
        })), { foot:{ src:'Cumul non corrigé', c:eur(retenues.reduce((t, x) => t + x.constate, 0)),
                      e:eur(retenues.reduce((t, x) => t + x.explique, 0)),
                      x:eur(corrige), m:eur(cumul) } }) +
      `<p class="note">Il n’y a pas de case « corrigée » à cocher ici : une anomalie quitte le cumul par une
      résolution documentée — explication reçue, conclusion de l’auditeur, qualification, lien vers la pièce ou
      l’écriture qui corrobore, auteur et date — enregistrée là où l’écart est né, ou par une <b>écriture de
      correction</b> passée dans une version prise en compte et nommant la pièce qu’elle corrige. Une case à
      cocher aurait fait disparaître un montant du cumul sans que rien ne le porte.</p>
      ${parEcriture.length ? `<div class="callout"><b>${parEcriture.length} anomalie(s) corrigée(s) par une
        écriture de version, pour ${eur(corrige)}.</b> La bascule est automatique et bornée à l’anomalie :
        le détail, écriture par écriture, avec les deux signaux de réconciliation, est dans
        <b>Ajustements et retraitements</b>.</div>` : ''}`) +
    blk('Incidence sur l’opinion', depasse ? 'le cumul dépasse le seuil de signification' : 'le cumul reste sous le seuil',
      `<div class="kv">
        <span class="k">Cumul non corrigé</span><span class="v">${eur(cumul)}</span>
        <span class="k">Corrigé par écriture de version</span><span class="v">${eur(corrige)}</span>
        <span class="k">Seuil de signification</span><span class="v">${eur(s.M)}</span>
        <span class="k">Rapport au seuil</span><span class="v">${pct(Math.abs(cumul) / s.M, 0)}</span>
        <span class="k">Résolues et corroborées</span><span class="v">${resolues.length} — ${eur(retenues.reduce((t, x) => t + x.explique, 0))}</span>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="ctrl"><label>Opinion retenue — proposition : ${esc(opinions.find(o => o.v === propose).lib)}</label>
          <select id="ach-op">${opinions.map(o => `<option value="${o.v}" ${st.opinion === o.v ? 'selected' : ''}>${esc(o.lib)}</option>`).join('')}</select></div>
      </div>
      <div class="ctrl"><label>Motivation${st.opinion && st.opinion !== propose ? ' — obligatoire : l’opinion retenue s’écarte de la proposition' : ''}</label>
        <textarea id="ach-opm" rows="3" placeholder="motivation de l’opinion retenue">${esc(st.opinionMotif)}</textarea></div>
      ${st.opinion && st.opinion !== propose && !st.opinionMotif.trim()
        ? '<div class="callout bad">L’opinion retenue s’écarte de la proposition et n’est pas motivée.</div>' : ''}`);
}

function vueAchCloture(){
  const st = S.achevement, postes = postesEnPerimetre();
  const nonVisees = postes.filter(p => !sec(p.code).visa);
  const bloq = notesBloquantesOuvertes();
  const facteursOuverts = registre().filter(f => f.statut === 'propose');
  const echeance = addDays(DATE_RAPPORT, DELAI_ASSEMBLAGE);
  const jours = Math.round((Date.parse(echeance) - Date.parse(S.aujourdhui)) / 86400000);
  const obstacles = [];
  if (nonVisees.length) obstacles.push(`${nonVisees.length} section(s) non visée(s) : ${nonVisees.map(p => p.lib).join(', ')}`);
  if (bloq.length) obstacles.push(`${bloq.length} note(s) de revue bloquante(s) ouverte(s)`);
  if (facteursOuverts.length) obstacles.push(`${facteursOuverts.length} facteur(s) de risque non statué(s)`);
  if (!st.opinion) obstacles.push('opinion non arrêtée');
  if (!st.raFinale.trim()) obstacles.push('revue analytique finale non conclue');
  for (const k of Object.keys(ACH)){
    const f = ACH[k].pts.filter((_, i) => (st.points[k] || {})[i]).length;
    if (f < ACH[k].pts.length) obstacles.push(`${ACH[k].t} : ${ACH[k].pts.length - f} point(s) non exécuté(s)`);
    if (!(st.concl[k] || '').trim()) obstacles.push(`${ACH[k].t} : conclusion manquante`);
  }
  return entete('Assemblage et clôture du dossier', 'le dossier devient définitif et se verrouille') +
    blk('Délai d’assemblage', jours >= 0 ? jours + ' jour(s) restant(s)' : 'délai dépassé',
      `<div class="kv">
        <span class="k">Date du rapport</span><span class="v">${frDate(DATE_RAPPORT)}</span>
        <span class="k">Délai d’assemblage</span><span class="v">${DELAI_ASSEMBLAGE} jours</span>
        <span class="k">Échéance</span><span class="v">${frDate(echeance)}</span>
        <span class="k">Aujourd’hui</span><span class="v">${frDate(S.aujourdhui)}</span>
        <span class="k">Conservation</span><span class="v">${RETENTION_ANS} ans</span>
      </div>
      <p class="note">Délai d’assemblage : <b>C. com., art. D. 821-186, III et IV</b> — 60 jours.
      Durée de conservation : <b>C. com., art. R. 820-42</b> — 6 ans. Ces deux références ont été vérifiées sur le
      texte primaire lors des travaux de rétention du dépôt ; elles sont portées ici telles que le noyau les
      enregistre, avec leur source.</p>`) +
    blk('Conditions de clôture', obstacles.length ? obstacles.length + ' obstacle(s)' : 'réunies',
      obstacles.length
        ? `<div class="callout bad"><ul style="margin:0 0 0 16px;padding:0">${obstacles.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
           <button class="btn" disabled>clôturer et verrouiller le dossier</button>`
        : st.clos
          ? `<div class="callout"><b>Dossier clôturé</b> par ${esc(USERS[st.clos.par].nom)} le ${horo(st.clos.t)}.
             Le dossier est en lecture seule ; toute pièce ajoutée après cette date porte sa propre date et ne se
             substitue à rien.</div>`
          : `<button class="btn" id="ach-clore">clôturer et verrouiller le dossier</button>`) +
    blk('Ce que contient le dossier clôturé', '',
      table([{k:'q',t:'Élément'},{k:'n',t:'Nombre',n:1}], [
        { q:'Sections de travail visées', n:String(postes.filter(p => sec(p.code).visa).length) },
        { q:'Procédures exécutées', n:String(postes.reduce((a, p) => a + proceduresRequises(p).length, 0)) },
        { q:'Éléments sélectionnés', n:String(postes.reduce((a, p) => a + proceduresRequises(p).reduce((b, pr) => { const e = echantillonProc(p, pr); return b + (e ? e.retenus.length : 0); }, 0), 0)) },
        { q:'Requêtes émises', n:String(S.requetes.length) },
        { q:'Pièces déposées', n:String(S.requetes.reduce((a, r) => a + r.items.reduce((b, i) => b + i.depots.length, 0), 0)) },
        { q:'Notes de revue', n:String(S.notes.length) },
        { q:'Facteurs de risque statués', n:String(registre().filter(f => f.statut !== 'propose').length) },
        { q:'Événements au journal', n:String(S.events.length) },
      ]));
}

/* ═══ 30. PRINCIPES DE CONCEPTION ══════════════════════════════════════════
   Les règles s'appliquent dans le comportement de l'écran ; leur
   justification se lit ici, une fois, et pas à chaque ligne.
   ═══════════════════════════════════════════════════════════════════════ */
const PRINCIPES = [
  { r:'Une ligne sans pièce ne porte aucun contrôle',
    o:'le papier affiche « non reçu » et le contrôle reste vide',
    j:'Remplir une ligne dont la pièce n’est pas arrivée, c’est fabriquer une diligence. Le compteur « n/n éléments avec pièce » suffit à le dire ; il n’a pas besoin d’être commenté.' },
  { r:'Le seuil de la strate exhaustive suit la matérialité, le nombre tiré suit le risque',
    o:'deux compteurs distincts sur chaque sélection',
    j:'Deux leviers indépendants. Les confondre revient à croire qu’un poste risqué se traite en baissant la matérialité.' },
  { r:'Rien ne s’applique sans décision humaine',
    o:'un facteur « proposé » n’entre dans aucun niveau de risque',
    j:'Une constatation automatique qui modifierait seule une évaluation de risque ferait de l’outil l’auteur du jugement.' },
  { r:'Une constatation, un facteur',
    o:'l’identifiant du facteur porte la constatation, pas la section',
    j:'Deux facteurs au même texte sur deux sections, c’est déjà le bruit que le garde-fou combat.' },
  { r:'Chaque règle de levée porte un seuil de pertinence explicite',
    o:'colonne « seuil » réglable dans le registre, compteur au bandeau',
    j:'Trois cents alertes que personne ne lit, c’est le défaut classique de l’analyse de données en audit. Un seuil calibré pour produire un joli compte est un seuil faux.' },
  { r:'Le préparateur répond, seul le réviseur clôt, jamais l’auteur',
    o:'le bouton « clore » n’est pas rendu pour l’auteur',
    j:'Une note qu’on peut clore soi-même n’est pas une revue.' },
  { r:'Le client ne voit pas la matérialité',
    o:'le bandeau de seuils n’est pas construit dans son espace',
    j:'Un masquage se désactive par erreur ; une absence de composant, non.' },
  { r:'Le statut « en attente de revue par X » est interne',
    o:'replié sur « en cours de traitement » avant tout rendu client',
    j:'Il révélerait l’organisation et l’avancement de la revue.' },
  { r:'Les travaux N-1 ne sont jamais repris automatiquement',
    o:'marqués « à reconfirmer », bloquants tant qu’ils ne le sont pas',
    j:'La reprise automatique transforme une diligence de l’an dernier en diligence de cette année.' },
  { r:'Un jugement qui écarte le calcul s’écrit',
    o:'motif obligatoire sur toute surcharge de statut, de périmètre ou de niveau',
    j:'Sans motif, la surcharge est indistinguable d’une erreur de manipulation.' },
  { r:'Le tirage est rejouable',
    o:'le germe est écrit sur la sélection',
    j:'Un tiers doit pouvoir obtenir exactement les mêmes éléments.' },
  { r:'Aucun montant écrit en dur',
    o:'tout se recalcule quand un curseur bouge',
    j:'C’est la seule façon de vérifier qu’un chiffre affiché est un chiffre calculé.' },
];
function vuePrincipes(){
  return entete('Principes de conception', 'les règles s’appliquent dans l’écran ; leur justification se lit ici') +
    blk('Règles', PRINCIPES.length,
      table([{k:'r',t:'Règle',cls:'wrapcell'},{k:'o',t:'Où elle se voit',cls:'wrapcell'},{k:'j',t:'Pourquoi',cls:'wrapcell'}],
        PRINCIPES.map(x => ({ r:'<b>' + esc(x.r) + '</b>', o:esc(x.o), j:esc(x.j) })))) +
    vueIA();
}
