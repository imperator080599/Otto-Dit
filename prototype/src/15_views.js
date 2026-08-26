/* ═══ 14. PÉRIMÈTRE ET SYNTHÈSE ════════════════════════════════════════════ */
function postesEnPerimetre(){
  const s = seuils();
  return postesCalcules().filter(p =>
    (S.scopingOverride[p.code] || (Math.abs(p.solde) >= s.PM ? 'in' : 'out')) === 'in');
}

/** Écarts nés hors papier de travail : rapprochement et test des écritures.
 *  Ils passent par le MÊME casier de résolution que les écarts de papier.
 *  Les phrases ci-dessous sont des explications REÇUES du client : elles sont
 *  enregistrées comme telles, et à elles seules elles ne résolvent rien. */
function ecartsHorsPapier(){
  const out = [];
  for (const r of rapprochement()) if (r.ecart !== 0 && r.sTB - r.sGL > 0)
    out.push({ ref:'rappro|' + r.compte, cle:r.compte, src:'Rapprochement', objet:'rappro', vue:'plan.rappro',
      lib:'Écriture de situation non reprise au fichier des écritures — compte ' + r.compte,
      constate:r.ecart, section:null,
      explRecue:'Écriture de situation passée après la transmission du fichier des écritures.' });
  const parTag = t => lg().entries.filter(e => e.tag === t);
  const dupe = parTag('A1');
  if (dupe.length === 2) out.push({ ref:'je|' + dupe[1].num, cle:dupe[1].num, src:'Test des écritures',
    objet:'je', vue:'plan.je', lib:'Même facture comptabilisée deux fois (' + dupe[0].pieceRef + ')',
    constate:dupe[1].lines[0].debit, section:null, piece:dupe[1].pieceRef,
    explRecue:'Doublon d’intégration reconnu par le client ; extourne non comptabilisée à date.' });
  for (const e of parTag('A5')) out.push({ ref:'je|' + e.num, cle:e.num, src:'Test des écritures',
    objet:'je', vue:'plan.je', lib:'Produit de 2026 rattaché à 2025 (' + e.pieceRef + ')',
    constate:e.lines[0].debit, section:null, piece:e.pieceRef,
    explRecue:'Facture datée du ' + frDate(e.pieceDate) + ', comptabilisée le ' + frDate(e.date) + '.' });
  for (const e of parTag('A6')) out.push({ ref:'je|' + e.num, cle:e.num, src:'Test des écritures',
    objet:'je', vue:'plan.je', lib:'Écriture manuelle de direction (' + e.pieceRef + ')',
    constate:e.lines[0].debit, section:null, piece:e.pieceRef,
    explRecue:'Prestation démarrant en janvier 2026 selon l’explication reçue.' });
  return out;
}

/** Anomalies : elles ne sont pas saisies, elles AGRÈGENT ce que les sections
 *  ont produit — écarts de papiers de travail, écart de rapprochement,
 *  écritures relevées au test des écritures. Chacune porte son écart
 *  CONSTATÉ, la part EXPLIQUÉE par une résolution probante et le RÉSIDUEL.
 *  Seul le résiduel entre au cumul ; le triage sous/au-dessus du seuil de
 *  remontée se fait, lui, sur le constaté : une résolution change ce qui est
 *  cumulé, pas la taille de ce qui a été relevé. */
function anomalies(){
  const s = seuils(), out = [];
  const pousser = (o, d) => out.push({ ...o, constate:d.constate, explique:d.explique,
    montant:d.residuel, acquis:d.acquis, res:d.res, manques:d.manques,
    souSeuil:Math.abs(d.constate) < s.CTT });
  for (const p of postesEnPerimetre()){
    for (const pr of proceduresRequises(p)){
      for (const c of ecartsChiffresProc(p, pr)){
        pousser({ src:p.lib + ' · ' + procRef(p, pr),
                  lib:c.ch.lib + ' — ' + (c.ligne.x.e ? 'pièce ' + c.ligne.x.e.pieceRef : c.ligne.cle)
                     + ' (' + c.doc.toLowerCase() + ')',
                  section:p.code, objet:'papier', ref:c.ligne.cle, vue:'fsli:' + p.code,
                  piece:c.ligne.x.e ? c.ligne.x.e.pieceRef : null,
                  cleRes:p.code + '#' + pr.code + '#' + c.cle }, residuel(c));
      }
    }
  }
  for (const x of ecartsHorsPapier())
    pousser({ ...x, cleRes:'hors#' + x.ref }, residuelR(x.constate, resolHors(x.ref, x.explRecue)));
  /* Une anomalie quitte aussi le cumul quand une ÉCRITURE DE CORRECTION la
     porte, dans une version prise en compte. La bascule est automatique — pas
     de case à cocher — et bornée à l'anomalie : voir 29_ajustements.js. */
  return appliquerCorrections(out);
}

/** Une même pièce touche deux comptes : une facture de vente est relevée dans
 *  la section « Clients » ET dans la section « Chiffre d'affaires ». Le même
 *  fait entre alors DEUX fois au cumul alors qu'il ne fausse les comptes
 *  qu'une fois. Rien n'est déduit d'office : la qualification « déjà cumulée »
 *  existe pour cela, et c'est l'auditeur qui choisit le côté qui reste. */
function doublesCumul(){
  const parPiece = {};
  for (const a of anomalies()){
    if (!a.piece || a.souSeuil) continue;
    (parPiece[a.piece] = parPiece[a.piece] || []).push(a);
  }
  return Object.entries(parPiece)
    .map(([piece, l]) => ({ piece, l, comptees:l.filter(x => x.montant !== 0).length,
                            montant:l.reduce((t, x) => t + x.montant, 0) }))
    .filter(x => x.comptees > 1);
}

/** Le bloc de résolution rendu là où l'écart naît — jamais dans la synthèse,
 *  qui n'est qu'un agrégat et ne doit rien porter de saisi. */
function blocEcartsHors(objet){
  const l = ecartsHorsPapier().filter(x => x.objet === objet);
  if (!l.length) return '';
  const d = l.map(x => residuelR(x.constate, resolHors(x.ref, x.explRecue)));
  const cumul = d.reduce((a, x) => a + x.residuel, 0);
  return blk('Écarts relevés et leur résolution', l.length + ' écart(s)',
    `<div class="row">
      <span class="pill">constaté ${eur(l.reduce((a, x) => a + x.constate, 0))}</span>
      <span class="pill">expliqué ${eur(d.reduce((a, x) => a + x.explique, 0))}</span>
      <span class="pill ${cumul ? 'bad' : ''}">résiduel porté au cumul ${eur(cumul)}</span>
    </div>
    <p class="note">Même contrainte que sur un papier de travail : une explication du client n’est pas un élément
    probant. Sans conclusion écrite, qualification, lien vers une pièce ou une écriture, auteur et date,
    l’écart reste entier au cumul des anomalies.</p>
    ${l.map(x => carteResolution('hors#' + x.ref,
        `<span class="mono">${esc(x.cle)}</span> · ${esc(x.lib)}`,
        x.constate, resolHors(x.ref, x.explRecue), null)).join('')}`);
}

/* ═══ 15. VUES TRANSVERSES DE PLANIFICATION ════════════════════════════════ */
function entete(t, sub){ return `<div class="hd"><h1>${esc(t)}</h1><span class="sub">${sub}</span></div>`; }
/* Chaque panneau porte, en chasse fixe et en haut à droite, la référence du
   papier qu'il constitue — la convention que tout associé reconnaît.
   La référence est dérivée du titre : deux mots, trois lettres chacun. */
let _refSeq = {};
function refPapier(t){
  const k = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 2)
    .map(w => w.slice(0, 3)).join('-') || 'GEN';
  _refSeq[k] = (_refSeq[k] || 0) + 1;
  return k + '-' + String(_refSeq[k]).padStart(2, '0');
}
/* ── panneaux repliables ───────────────────────────────────────────────────
   Le même traitement que les sections, appliqué aux écrans qui ont grossi.
   La liste n'est pas une préférence : elle retient les vues qui réunissent
   DEUX conditions mesurées à 390 px — au moins trois panneaux, et au moins
   deux écrans de téléphone de contenu. Replier une vue d'un écran et demi
   coûterait un clic sans rien rendre lisible. Le portail client y figure
   malgré sa taille de départ : il grandit avec le nombre de requêtes.        */
const VUES_PANNEAUX = new Set(['plan.je', 'plan.facteurs', 'plan.versions', 'plan.ajust', 'plan.equipe', 'pil.mission',
  'plan.programme', 'plan.donnees', 'plan.principes', 'plan.ra', 'pil.export', 'cli.vue']);
let _panSeq = 0;
function blk(t, why, html, att){
  const ref = refPapier(t);
  if (!VUES_PANNEAUX.has(S.vue))
    return `<section class="blk"><header><h2>${esc(t)}</h2>
      <span class="why">${esc(ref)}</span></header><div class="body">${html}</div></section>`;
  /* Ouvert si le panneau porte quelque chose à traiter ; à défaut, le premier
     l'est, pour qu'une vue repliée ne soit jamais une page vide. */
  const i = _panSeq++;
  const cle = S.vue + '/' + ref;
  const o = ouvertParDefaut(cle, att ? true : i === 0);
  return `<details class="blk pan" data-repli="${esc(cle)}" ${o ? 'open' : ''}>
    <summary><h2>${esc(t)}</h2><span class="sub">${esc(why === undefined ? '' : String(why))}</span>
      ${att ? `<span class="pill bad">${esc(String(att))}</span>` : ''}
      <span class="why">${esc(ref)}</span></summary>
    <div class="body">${html}</div></details>`;
}
function cite(q){ return `<blockquote class="idea">« ${esc(q)} »<span class="src">extrait, mot pour mot, de votre document d’idées</span></blockquote>`; }

function vueRappro(){
  const c = controlesFec(), rap = rapprochement(), ecarts = rap.filter(r => r.ecart !== 0);
  const ok = b => b ? '<span class="pill">conforme</span>' : '<span class="pill bad">à examiner</span>';
  const ctrls = [
    { t:'Structure : 18 champs de l’article A.47 A-1 présents', s:ok(!c.champsManquants.length),
      d:c.champsManquants.length ? 'manquants : ' + c.champsManquants.join(', ') : CHAMPS_FEC.join(' · ') },
    { t:'Équilibre général du fichier', s:ok(c.tot.d === c.tot.c), d:`débit ${eur(c.tot.d)} / crédit ${eur(c.tot.c)} — écart ${eur(c.tot.d - c.tot.c)}` },
    { t:'Équilibre de chaque écriture', s:ok(!c.ecrituresDesequilibrees), d:`${c.nbEcritures} écritures contrôlées, ${c.ecrituresDesequilibrees} déséquilibrée(s)` },
    { t:'Une seule colonne servie par ligne', s:ok(!c.deuxColonnes), d:`${c.deuxColonnes} ligne(s) en anomalie` },
    { t:'Dates d’écriture dans l’exercice', s:ok(!c.horsExercice), d:`${c.horsExercice} ligne(s) hors exercice` },
    { t:'Numéros de compte numériques (≥ 3 caractères)', s:ok(!c.compteInvalide), d:`${c.compteInvalide} ligne(s) en anomalie` },
    { t:'Date de validation postérieure à la date d’écriture', s:ok(!c.validAvant), d:`${c.validAvant} ligne(s) en anomalie` },
    { t:'Compte auxiliaire : numéro et libellé renseignés ensemble', s:ok(!c.auxIncomplet), d:`${c.auxIncomplet} ligne(s) en anomalie` },
    { t:'Date de pièce dans l’exercice', s:ok(!c.pieceHors), d:`${c.pieceHors} pièce(s) datée(s) hors exercice — indice de séparation des exercices` },
  ];
  return entete('Import et rapprochement balance ↔ grand livre', 'point d’entrée du dossier — toutes les sections en dépendent') +
    cite('Upload de la TB à l’année auditée · Upload du Grand livre (transactions de l’année auditée) · Fonction réconciliation grand livre /TB') +
    `<div class="grid2">
      ${blk('Contrôle de forme du fichier des écritures', lg().entries.length + ' écritures',
        table([{k:'t',t:'Contrôle',cls:'wrapcell'},{k:'s',t:'Résultat'},{k:'d',t:'Détail',cls:'wrapcell'}],
              ctrls.map(x => ({ t:esc(x.t), s:x.s, d:esc(x.d) }))))}
      ${blk('Rapprochement compte par compte', ecarts.length + ' écart(s)',
        table([{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'},{k:'a',t:'Balance client',n:1},
               {k:'b',t:'Grand livre',n:1},{k:'e',t:'Écart',n:1}],
          rap.map(r => ({ c:`<span class="mono">${r.compte}</span>`, l:esc(r.lib), a:eur(r.sTB), b:eur(r.sGL),
                          e:r.ecart ? '<b>' + eur(r.ecart) + '</b>' : '—' })),
          { foot:{ c:'Total', a:eur(rap.reduce((a, r) => a + r.sTB, 0)), b:eur(rap.reduce((a, r) => a + r.sGL, 0)),
                   e:eur(rap.reduce((a, r) => a + r.ecart, 0)) } }) +
        (ecarts.length ? `<div class="callout bad"><b>${ecarts.length} compte(s) en écart pour
          ${eur(ecarts.filter(r => r.ecart > 0).reduce((a, r) => a + r.ecart, 0))}.</b>
          ${ecarts.map(r => r.compte + ' : ' + eur(r.ecart)).join(' · ')}. Les écarts sont de sens opposé et de même
          montant : une écriture équilibrée figure dans la balance transmise et pas dans le fichier des écritures.
          Requête d’explication à émettre ; le rapprochement sera re-exécuté sur le FEC définitif.</div>` : ''))}
    </div>
    ${blocEcartsHors('rappro')}`;
}

function vueMaterialite(){
  const s = seuils();
  const rows = Object.values(bm()).map(b => ({
    r:esc(b.lib) + (b.code === S.benchmark ? ' <span class="pill">retenue</span>' : ''),
    m:eur(b.val), u:b.defaut + NBSP + '%', a:b.code === S.benchmark ? pct(S.pctM / 100, 1) : '—',
    s:b.code === S.benchmark ? eur(s.M) : '—', p:b.code === S.benchmark ? eur(s.PM) : '—',
  }));
  return entete('Matérialité', 'trois seuils, un seul jeu de paramètres — ils pilotent toutes les sections') +
    cite('Le benchmark et % doivent être proposés par un agent IA et expliqué pourquoi mais validé par un auditeur humain puis le calcul de la matérialité se fera automatiquement') +
    blk('Références possibles', 'toutes calculées depuis la balance',
      table([{k:'r',t:'Référence',cls:'wrapcell'},{k:'m',t:'Montant',n:1},{k:'u',t:'Taux usuel',n:1},
             {k:'a',t:'Taux appliqué',n:1},{k:'s',t:'Seuil de signification',n:1},{k:'p',t:'Planification',n:1}], rows) +
      `<div class="callout">${esc(s.bench.lib)} ${eur(s.bench.val)} × ${pct(S.pctM / 100, 1)} = ${eur(s.brut)},
        arrondi au millier inférieur → <b>${eur(s.M)}</b> · planification ${S.pctPM}${NBSP}% → <b>${eur(s.PM)}</b>
        · remontée ${S.pctCTT}${NBSP}%, arrondi à la centaine → <b>${eur(s.CTT)}</b>.
        <span class="tag mod">modèle</span> proposerait la référence, le taux et leur motivation ; le calcul reste
        déterministe et la proposition ne vaut rien tant qu’un auditeur ne l’a pas arrêtée.</div>`);
}

function vueScoping(){
  const s = seuils(), postes = postesCalcules();
  const rows = postes.map(p => {
    const auto = Math.abs(p.solde) >= s.PM ? 'in' : 'out';
    const ret = S.scopingOverride[p.code] || auto;
    return {
      l:`<b>${esc(p.lib)}</b><div class="smallcaps">${p.comptes.join(' · ')}</div>`,
      n:eur(p.solde), r:pct(Math.abs(p.solde) / s.PM, 0),
      a:auto === 'in' ? '<span class="pill">dans le périmètre</span>' : '<span class="pill">hors périmètre</span>',
      d:`<select class="cell txt" data-scope="${p.code}" style="width:150px">
          <option value="">proposé (${auto === 'in' ? 'dans' : 'hors'})</option>
          <option value="in"  ${S.scopingOverride[p.code] === 'in'  ? 'selected' : ''}>forcé : dans le périmètre</option>
          <option value="out" ${S.scopingOverride[p.code] === 'out' ? 'selected' : ''}>forcé : hors périmètre</option>
        </select>` + (S.scopingOverride[p.code]
          ? `<input class="cell txt" data-scopem="${p.code}" placeholder="motif obligatoire" value="${esc(S.scopingMotif[p.code] || '')}" style="margin-top:3px">` : ''),
      v:ret === 'in' ? `<button class="btn mini sec" data-open="${p.code}">ouvrir la section</button>` : '<span class="smallcaps">—</span>',
    };
  });
  const sansMotif = postes.filter(p => S.scopingOverride[p.code] && !(S.scopingMotif[p.code] || '').trim());
  return entete('Scoping des postes', 'chaque poste retenu ouvre une section de travail') +
    cite('Un scoping automatique des FSLIs selon la matérialité (montant déterminer par un % d’un benchmark, exemple le revenue, les COGS, l’equity etc.); possibilité de scoper qualitativement un FSLI inférieur à la matérialité') +
    blk('Postes', postesEnPerimetre().length + ' / ' + postes.length + ' dans le périmètre',
      table([{k:'l',t:'Poste',cls:'wrapcell'},{k:'n',t:'Solde N',n:1},{k:'r',t:'% du seuil de planification',n:1},
             {k:'a',t:'Proposition'},{k:'d',t:'Décision de l’auditeur'},{k:'v',t:''}], rows) +
      (sansMotif.length ? `<div class="callout bad"><b>Surcharge sans motif</b> sur ${sansMotif.map(p => esc(p.lib)).join(', ')}.
        Un poste sorti ou entré à la main sans justification est une décision non documentée.</div>` : '') +
      `<div class="callout">Le scoping n’est pas une liste : c’est ce qui <b>crée</b> les sections de travail.
        Bougez le seuil de planification (${eur0(s.PM)}) et regardez le rail de navigation à gauche —
        des sections apparaissent et disparaissent.</div>`);
}

function vueCirc(){
  const banques = exhaustiviteBanques(), avocats = exhaustiviteAvocats();
  const bManq = banques.filter(x => !x.declare), aManq = avocats.filter(x => !x.declare);
  const oui = '<span class="pill">présent</span>', non = '<span class="pill bad">absent</span>';
  return entete('Exhaustivité des circularisations', 'transverse : ce qui manque au listing transmis par le client') +
    cite('un agent IA regarde la comptabilité et vérifie qu’il ne manque pas de banque si oui il envoi une requête pour demander au client à quoi corresponde les comptes (présents en comptabilité mais absent du listing des banques du client)') +
    `<div class="grid2">
      ${blk('Banques', bManq.length + ' compte(s) hors listing',
        table([{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'},{k:'s',t:'Solde',n:1},{k:'p',t:'Listing client'}],
          banques.map(x => ({ c:`<span class="mono">${x.compte}</span>`, l:esc(x.lib), s:eur(x.solde),
                              p:x.declare ? oui : non }))) +
        (bManq.length ? `<div class="callout bad">${bManq.map(x => x.compte + ' « ' + esc(x.lib) + ' » (' + eur(x.solde) + ')').join(', ')}
          en comptabilité et absent(s) du listing transmis.</div>` : ''))}
      ${blk('Conseils juridiques', aManq.length + ' tiers hors listing',
        table([{k:'t',t:'Tiers',cls:'wrapcell'},{k:'h',t:'Honoraires N',n:1},{k:'p',t:'Listing client'}],
          avocats.map(x => ({ t:esc(x.tiers), h:eur(x.montant), p:x.declare ? oui : non }))) +
        (aManq.length ? `<div class="callout bad"><b>${aManq.length} tiers</b> reçoivent des honoraires juridiques sans
          figurer au listing des conseils : ${aManq.map(x => esc(x.tiers)).join(', ')}. Même traitement.</div>` : ''))}
    </div>`;
}

function vueSynthese(){
  const s = seuils(), a = anomalies();
  const retenues = a.filter(x => !x.souSeuil), triviales = a.filter(x => x.souSeuil);
  const cumul = retenues.reduce((t, x) => t + x.montant, 0);
  const explique = retenues.reduce((t, x) => t + x.explique, 0);
  const nonResolues = retenues.filter(x => x.montant !== 0);
  const depasse = Math.abs(cumul) > s.M;
  const corrige = retenues.reduce((t, x) => t + (x.corrige || 0), 0);
  const rows = a.map(x => ({
    src:esc(x.src), lib:esc(x.lib),
    c:eur(x.constate), e:x.explique ? eur(x.explique) : '<span class="smallcaps">—</span>',
    x:x.corrige ? `${eur(x.corrige)}<div class="smallcaps">${esc((x.corrigePar || []).map(y => y.ref).join(', '))}</div>`
                : '<span class="smallcaps">—</span>',
    m:x.montant ? eur(x.montant) : '<span class="smallcaps">—</span>',
    st:x.souSeuil ? '<span class="pill">sous le seuil de remontée</span>'
       : (x.corrigePar || []).length && !x.montant
         ? marqueEtat('explique', 'corrigée par écriture de version')
           + ` <span class="smallcaps">corrigée par ${esc(x.corrigePar.map(y => 'v' + y.v + ' ' + y.ref).join(', '))}</span>`
       : x.acquis ? marqueEtat('explique', 'écart expliqué : ' + DISPOSITIONS[x.res.disposition].lib)
                    + ` <span class="smallcaps">${esc(DISPOSITIONS[x.res.disposition].lib)}, ${esc(USERS[x.res.par].nom)}</span>`
                  : marqueEtat('ecart') + ' <span class="smallcaps">' + esc(x.manques.length + ' élément(s) probant(s) manquant(s)') + '</span>',
    v:`<button class="btn mini sec" data-goecart="${esc(x.vue)}">${x.objet === 'papier' ? 'voir la section' : 'voir le papier'}</button>`,
  }));
  return entete('Synthèse des anomalies', 'agrège ce que les sections ont produit — rien n’est saisi ici') +
    cite('Un moyen simple d’accéder à la synthèse des déficiences de contrôle interne et des "misstatements" écarts observés lors du testing') +
    blk('Anomalies relevées', a.length + ' au total',
      table([{k:'src',t:'Origine'},{k:'lib',t:'Anomalie',cls:'wrapcell'},{k:'c',t:'Écart constaté',n:1},
             {k:'e',t:'Part expliquée',n:1},{k:'x',t:'Corrigé par écriture',n:1,cls:'wrapcell'},
             {k:'m',t:'Écart résiduel',n:1},
             {k:'st',t:'Résolution',cls:'wrapcell'},{k:'v',t:''}], rows,
            { foot:{ src:'Cumul non corrigé', c:eur(retenues.reduce((t, x) => t + x.constate, 0)),
                     e:eur(explique), x:eur(corrige), m:eur(cumul) } }) +
      (doublesCumul().length ? `<div class="callout bad" style="margin-top:10px">
        <b>${doublesCumul().length} pièce(s) comptée(s) plusieurs fois au cumul.</b>
        Une même facture est relevée dans deux sections — au compte de tiers et au compte de résultat —
        et son écart entre donc deux fois, alors qu’il ne fausse les comptes qu’une fois.
        ${doublesCumul().map(x => `<div class="smallcaps"><span class="mono">${esc(x.piece)}</span> —
          ${x.comptees} fois, ${eur(x.montant)} au total : ${esc(x.l.map(y => y.src).join(' · '))}</div>`).join('')}
        Rien n’est déduit d’office : qualifiez l’un des côtés « déjà cumulée » dans son papier de travail,
        avec la pièce ou l’écriture qui corrobore. C’est une décision d’auditeur, pas une soustraction automatique.</div>` : '') +
      `<p class="note">La résolution d’un écart se documente là où il est né — dans le papier de travail, le
      rapprochement ou le test des écritures — et jamais ici. Une explication du client n’y suffit pas :
      il faut une conclusion écrite, une qualification, un lien vers la pièce ou l’écriture qui corrobore,
      un auteur et une date. Seul le résiduel entre dans le cumul ci-dessous.</p>
      <p class="note">La colonne « corrigé par écriture » n’est pas saisie non plus : elle vient des
      <b>écritures de correction</b> passées par le client dans une version <b>prise en compte</b>, qui
      nomment la pièce qu’elles corrigent. Une correction partielle laisse le reste au cumul. Le détail,
      écriture par écriture, est dans <b>Ajustements et retraitements</b>.</p>
      <div class="grid2" style="margin-top:10px">
        <div class="kv">
          <span class="k">Anomalies relevées</span><span class="v">${a.length}</span>
          <span class="k">Sous le seuil de remontée (${eur0(s.CTT)})</span><span class="v">${triviales.length}</span>
          <span class="k">Expliquées et corroborées</span><span class="v">${retenues.filter(x => x.acquis).length} — ${eur(explique)}</span>
          <span class="k">Résiduelles</span><span class="v">${nonResolues.length} — ${eur(cumul)}</span>
          <span class="k">Seuil de signification</span><span class="v">${eur(s.M)}</span>
          <span class="k">Rapport au seuil</span><span class="v">${pct(Math.abs(cumul) / s.M, 0)}</span>
        </div>
        <div class="callout ${depasse ? 'bad' : ''}"><b>Conséquence.</b> ${depasse
          ? `Le cumul des anomalies non corrigées (${eur(cumul)}) <b>dépasse le seuil de signification</b> (${eur(s.M)}).
             Correction à demander à la direction ; à défaut, la conclusion sur les comptes doit en tirer les conséquences.`
          : `Le cumul (${eur(cumul)}) reste <b>inférieur au seuil de signification</b> (${eur(s.M)}).
             Les anomalies sont communiquées à la direction sans remettre en cause, à elles seules, la conclusion.`}
          <br><span class="smallcaps">Déplacez le taux de matérialité : le tri sous/au-dessus du seuil de remontée
          et cette conclusion changent avec lui.</span></div>
      </div>`);
}

function vuePiste(){
  const ev = [...S.events].reverse();
  return entete('Piste d’audit', 'journal d’événements — ajout seul, jamais de réécriture') +
    blk('Événements', S.events.length + ' depuis l’ouverture de la page',
      (ev.length ? table([{k:'t',t:'Horodatage'},{k:'q',t:'Auteur'},{k:'a',t:'Action'},{k:'o',t:'Objet',cls:'wrapcell'},{k:'d',t:'Détail',cls:'wrapcell'}],
        ev.map(e => ({ t:`<span class="mono">${horo(e.t)}</span>`, q:esc(e.qui), a:esc(e.quoi), o:esc(e.objet), d:esc(e.detail) })))
        : '<p class="note">Aucun événement pour l’instant : agissez dans une section ou au portail client, puis revenez ici.</p>') +
      `<p class="note">Horloge de mission simulée : départ 15/03/2026 09:12, +7 min par événement, donc rejouable
        à l’identique. Le chaînage par hachage appartient à l’application, pas à ce fichier.</p>`);
}

/* ── sections transverses prévues au lot 2 : structure montrée, rien d'inventé ── */
const LOT2 = {
  'plan.secteur': { t:'Analyse sectorielle et macroéconomique',
    q:'Une analyse macroéconomique, des facteurs externes impactant la ou les entités auditées automatisée',
    struct:['Secteur et positionnement de l’entité','Marché et demande','Concurrence','Réglementation applicable','Facteurs macroéconomiques'],
    exig:'Chaque constat sectoriel devra se relier à un risque sur un FSLI nommé, et de là à une procédure. Le lien sera obligatoire : une analyse qui ne modifie aucune évaluation de risque est une page morte.',
    manque:['sources publiques à interroger (INSEE, Banque de France, BODACC, comptes publiés) — aucun accès réseau dans ce fichier',
            'les études payantes s’attacheront comme PIÈCE jointe, jamais aspirées'] },
  'plan.parties': { t:'Parties liées',
    q:'Fonction agent IA qui va regarder si parmi les key contacts du management (organigramme partagé par le client) certains ont des relations avec des clients ou fournisseurs du client (risque de fraude)',
    struct:['Liste déclarée par la direction','Rapprochement aux comptes auxiliaires','Recherche des NON déclarées : dirigeants et associés contre le grand livre auxiliaire, y compris en rapprochement approximatif','Liens capitalistiques issus des registres publics','Requête d’explication par correspondance trouvée'],
    exig:'Le rapprochement de la liste déclarée est facile ; la valeur est dans les non déclarées.',
    manque:['registres publics de liens capitalistiques — accès réseau requis',
            'organigramme et liste des dirigeants — pièce à demander au client'] },
  'plan.lcbft': { t:'LCB-FT et bénéficiaires effectifs',
    q:null,   // ce module ne figure PAS dans le document d'idées : pas de citation à afficher
    hors:'Ce module ne vient pas du document d’idées : il vient de votre consigne de cette itération. Il est traité comme une obligation propre du commissaire aux comptes, distincte de la certification des comptes.',
    struct:['Identification de l’entité et de son actionnariat','Bénéficiaires effectifs','Criblage contre les listes de sanctions publiques','Personnes politiquement exposées','Conservation des diligences'],
    exig:'Module à part entière : c’est une obligation propre, distincte de la certification des comptes.',
    manque:['API publique de l’INPI (registre national des entreprises) et BODACC — accès réseau requis',
            'listes de sanctions publiques (UE, ONU, OFAC) — accès réseau requis',
            'criblage des personnes politiquement exposées — renvoyé à un fournisseur commercial, hors périmètre v1'],
    juridique:true },
  'plan.pointage': { t:'Pointage des états financiers',
    q:'Une fonction pointage des états financiers et données chiffrées des annexes où après réception de la plaquette du client, un agent IA vient s’assurer que chaque chiffre cadre bien avec les montants que nous avons audité',
    struct:['Montant = solde de balance','Montant = agrégat de comptes','Montant = calcul à documenter (tableaux de variation, échéanciers, ventilations)'],
    exig:'Le travail réel n’est pas sur la face des états financiers mais dans les ANNEXES : un module qui suppose que tout vient de la balance échouera sur la majorité d’entre elles. Sortie : plaquette à gauche, montant audité à droite, renvoi vers l’origine, colonne d’écart.',
    manque:['plaquette du client — pièce à recevoir, puis lecture par l’échelle d’extraction'] },
};
function vueLot2(id){
  const d = LOT2[id];
  return entete(d.t, 'structure du module — lot 2') +
    (d.q ? cite(d.q) : `<div class="callout info">${esc(d.hors || '')}</div>`) +
    `<div class="callout warn"><b>Ce module n’est pas alimenté dans ce fichier.</b> Vous voyez sa structure et ce qui
      lui manque. Aucun résultat n’est affiché : inventer un constat sectoriel ou une correspondance de partie liée
      serait exactement le défaut que ce prototype existe pour écarter.</div>` +
    blk('Structure prévue', '', `<ol style="margin:0 0 0 18px;padding:0">${d.struct.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <div class="callout"><b>Exigence de conception.</b> ${esc(d.exig)}</div>`) +
    blk('Ce qui manque pour l’alimenter', d.manque.length + ' dépendance(s)',
      `<ul style="margin:0 0 0 18px;padding:0">${d.manque.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` +
      (d.juridique ? `<div class="callout bad"><b>Précaution juridique — à vérifier avant toute écriture de code.</b>
        Le KBIS et le registre des bénéficiaires effectifs sont <b>deux registres distincts</b> ; l’accès au second est
        restreint. L’état exact du droit applicable n’a pas pu être vérifié sur le texte primaire depuis cet
        environnement : ce point est porté <span class="tag abs">UNVERIFIED</span> et aucune constante ne sera écrite
        dans le code tant qu’il ne l’est pas. Par ailleurs, cribler des personnes physiques suppose une base légale,
        une minimisation des données et une gestion documentée des faux positifs.</div>` : '') +
      `<div class="callout info"><b>Déterministe ou modèle ?</b> Le rapprochement, le criblage et le calcul d’écart sont
        <span class="tag det">déterministes</span>. La lecture d’une plaquette, d’un organigramme ou d’une étude
        sectorielle est <span class="tag mod">un modèle</span> : compter de 20 à 40 min de vérification humaine par
        plaquette, et ne rien faire entrer au dossier sans source vérifiée.</div>`);
}

/* ═══ 16. FRONTIÈRE DÉTERMINISTE / MODÈLE ══════════════════════════════════ */
function vueIA(){
  return entete('Ce que ce prototype ne peut pas faire sans modèle', 'et ce qu’il fait très bien sans') +
    blk('Ces idées ont réellement besoin d’un modèle', BESOIN_MODELE.length + ' cas',
      table([{k:'i',t:'Idée',cls:'wrapcell'},{k:'a',t:'Ce que le modèle apporte',cls:'wrapcell'},
             {k:'v',t:'Vérification humaine imposée',cls:'wrapcell'}],
        BESOIN_MODELE.map(x => ({ i:esc(x.idee), a:esc(x.apport), v:esc(x.verif) })))) +
    blk('Ces idées, classées « agent », n’en ont pas besoin', FAUSSEMENT_AGENT.length + ' cas',
      table([{k:'i',t:'Votre note',cls:'wrapcell'},{k:'r',t:'Ce que c’est réellement',cls:'wrapcell'}],
        FAUSSEMENT_AGENT.map(x => ({ i:'« ' + esc(x.idee) + ' »', r:esc(x.reel) }))) +
      '') +
    blk('Ce que la réorganisation par section change', 'nature de chaque bloc ajouté',
      table([{k:'b',t:'Bloc',cls:'wrapcell'},{k:'n',t:'Nature'},{k:'v',t:'Vérification humaine',cls:'wrapcell'}], [
        { b:'Tableau de bord des comptes de la section', n:'<span class="tag det">déterministe</span>', v:'aucune — ce sont des soustractions et des comparaisons à un seuil' },
        { b:'Évaluation du risque : facteurs observés', n:'<span class="tag det">déterministe</span>', v:'aucune — comptages sur le grand livre' },
        { b:'Évaluation du risque : facteurs déclarés et niveau retenu', n:'<span class="tag abs">jugement humain</span>', v:'≈ 10 à 20 min par poste — c’est la décision de l’auditeur, aucun modèle n’a à la prendre' },
        { b:'Procédures requises et taille d’échantillon', n:'<span class="tag det">déterministe</span>', v:'aucune — table affichée à l’écran' },
        { b:'Tirage de l’échantillon', n:'<span class="tag det">déterministe</span>', v:'aucune — rejouable au germe' },
        { b:'Rédaction de l’objet d’une requête', n:'<span class="tag mod">modèle</span>', v:'≈ 1 min — relecture avant envoi au client' },
        { b:'Lecture du montant porté sur la pièce déposée', n:'<span class="tag mod">modèle</span>', v:'≈ 1 à 2 min par pièce — dans ce prototype, la lecture est entièrement humaine : aucune pièce n’existe' },
        { b:'Notes de revue', n:'<span class="tag abs">humain seul</span>', v:'aucun auteur automatique, aucune réponse suggérée — décision de conception' },
        { b:'Blocage du visa et de la clôture', n:'<span class="tag det">déterministe</span>', v:'aucune — la règle est écrite et ne se contourne pas' },
        { b:'Analyse sectorielle, parties liées, LCB-FT, pointage', n:'<span class="tag mod">modèle + sources externes</span>', v:'non alimentés ici : structure seule, dépendances nommées' },
      ]));
}

/* ═══ 17. ESPACE DE PILOTAGE ═══════════════════════════════════════════════ */
function vuePilotage(){
  const postes = postesEnPerimetre();
  const rows = postes.map(p => {
    const st = sec(p.code), prs = proceduresRequises(p);
    const t = avancementSection(p);
    const rs = requetesDe(p.code), av = rs.length ? rs.reduce((a, r) => a + avancement(r.items), 0) / rs.length : 0;
    const o = obstaclesVisa(p), bl = notesBloquantesOuvertes(p.code).length;
    return {
      s:`<b>${esc(p.lib)}</b><div class="smallcaps">${esc(MASSE_LIB[masseDe(p)])}</div>`,
      r:`<span class="pill ${NIVEAUX[niveauMax(p)] === 'eleve' ? 'bad' : NIVEAUX[niveauMax(p)] === 'moyen' ? 'warn' : ''}">${NIV_LIB[NIVEAUX[niveauMax(p)]]}</span>`,
      p:String(proceduresRequises(p).length),
      e:t.elements ? `${t.recus} / ${t.elements}` : '<span class="smallcaps">—</span>',
      tr:t.total ? String(t.traitee) : '<span class="smallcaps">—</span>',
      ec:t.ecart ? `<span style="color:var(--anomalie)">${t.ecart}</span>` : '<span class="smallcaps">—</span>',
      ex:t.explique ? String(t.explique) : '<span class="smallcaps">—</span>',
      q:rs.length ? `<div class="bar" style="width:80px"><i style="width:${(av * 100).toFixed(0)}%"></i></div><span class="smallcaps">${pct(av, 0)}</span>` : '<span class="smallcaps">aucune</span>',
      n:bl ? `<span class="pill bad">${bl} bloquante(s)</span>` : '<span class="smallcaps">—</span>',
      v:st.visa ? '<span class="pill">visée</span>' : `<span class="pill ${o.length ? 'bad' : 'warn'}">${o.length || 'prête'}</span>`,
      a:`<button class="btn mini sec" data-open="${p.code}">ouvrir</button>`,
    };
  });
  const enRetard = S.requetes.filter(retard);
  const parPersonne = {};
  for (const r of enRetard){ const c = S.contacts.find(x => x.id === r.contact);
    const k = c ? c.id : '?';
    parPersonne[k] = parPersonne[k] || { c, n:0, items:0, age:0 };
    parPersonne[k].n++; parPersonne[k].items += r.items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length;
    parPersonne[k].age = Math.max(parPersonne[k].age, ancienneteRetard(r)); }
  return entete('Avancement de la mission', 'état réel des sections et des demandes — rien de saisi à côté') +
    blk('Sections', postes.length + ' dans le périmètre',
      table([{k:'s',t:'Section',cls:'wrapcell'},{k:'r',t:'Risque'},{k:'p',t:'Procédures',n:1},
             {k:'e',t:'Justificatifs reçus',n:1},{k:'tr',t:'Traités sans écart',n:1},
             {k:'ec',t:'Écarts à expliquer',n:1},{k:'ex',t:'Écarts expliqués',n:1},{k:'q',t:'Requêtes'},
             {k:'n',t:'Notes bloquantes'},{k:'v',t:'Visa'},{k:'a',t:''}], rows,
        { foot:{ s:'Total',
                 e:`${postes.reduce((a, x) => a + avancementSection(x).recus, 0)} / ${postes.reduce((a, x) => a + avancementSection(x).elements, 0)}`,
                 tr:String(postes.reduce((a, x) => a + avancementSection(x).traitee, 0)),
                 ec:String(postes.reduce((a, x) => a + avancementSection(x).ecart, 0)),
                 ex:String(postes.reduce((a, x) => a + avancementSection(x).explique, 0)) } }) +
      `<p class="note">Ces colonnes ne sont saisies nulle part : elles agrègent les cinq états dérivés du papier
      de travail — en attente, reçue, traitée sans écart, écart à expliquer, écart expliqué.</p>`) +
    blk('Qui doit quoi, côté client', enRetard.length + ' demande(s) en retard',
      Object.keys(parPersonne).length
        ? table([{k:'p',t:'Personne',cls:'wrapcell'},{k:'n',t:'Demandes',n:1},{k:'i',t:'Éléments',n:1},{k:'a',t:'Ancienneté',n:1}],
            Object.values(parPersonne).sort((a, b) => b.age - a.age).map(x => ({
              p:x.c ? `<b>${esc(x.c.nom)}</b><div class="smallcaps">${esc(x.c.fonction)} · ${esc(x.c.societe)}</div>` : '—',
              n:String(x.n), i:String(x.items), a:x.age + ' j ouvrés' }))) +
          ''
        : '<p class="note">Aucune demande en retard.</p>') +
    blk('Export du statut de mission', 'trois périmètres de destinataire',
      `<p class="note">Le classeur, les périmètres de colonnes et la composition de l’envoi périodique se trouvent
      dans <a data-vue="pil.export" style="cursor:pointer">Exports et envoi</a>.</p>`);
}
