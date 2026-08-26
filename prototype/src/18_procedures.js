/* ═══ 26. PROCÉDURES, POPULATIONS, CATALOGUE DE PREUVE ═════════════════════
   La sélection n'appartient pas à la section : elle appartient à LA PROCÉDURE.
   Une section porte plusieurs procédures, chacune avec sa population, son
   unité d'échantillonnage, son germe et son papier de travail. Sans quoi un
   réviseur ne peut pas savoir quelle sélection nourrit quel test.
   ═══════════════════════════════════════════════════════════════════════ */

const CLOTURE = '2025-12-31', OUVERTURE = '2025-01-01';
const CUTOFF_DEB = '2025-12-21', CUTOFF_FIN = '2026-01-10';

/* ── ANOMALIES DU JEU DE DONNÉES ──────────────────────────────────────────
   Le taux d'anomalie n'est pas un artefact : il est DÉCLARÉ. La version
   précédente le laissait tomber d'un modulo sur l'empreinte de la référence
   de pièce (h % 17, h % 23, h % 31), ce qui produisait environ 6 % de factures
   au montant faux — le portrait d'une entreprise en perdition, et un
   contre-argument commercial. Les taux ci-dessous sont choisis, réalistes pour
   une entreprise saine, et les pièces touchées sont NOMMÉES : elles ont été
   retenues à la construction du jeu de données pour couvrir plusieurs
   journaux, plusieurs tiers et plusieurs ordres de grandeur.
   ═══════════════════════════════════════════════════════════════════════ */
const POP_PIECES = 1598;      // écritures hors à-nouveaux — base des taux déclarés
const POP_VENTES = 323;       // factures de vente

const TAUX_ANOMALIE = [
  { code:'montant', lib:'Montant de la pièce différent du montant comptabilisé',
    cible:16, base:POP_PIECES, baseLib:'écritures hors à-nouveaux',
    motif:'avoirs et remises de fin d’exercice non comptabilisés, régularisations arrondies à la saisie' },
  { code:'quantite', lib:'Quantité livrée inférieure à la quantité facturée',
    cible:4, base:POP_VENTES, baseLib:'factures de vente',
    motif:'livraisons partielles, solde expédié sur l’exercice suivant' },
  { code:'signature', lib:'Bon de livraison non signé par le client',
    cible:5, base:POP_VENTES, baseLib:'factures de vente',
    motif:'bons non retournés signés, ou signés par une personne non habilitée' },
  { code:'livraison', lib:'Livraison postérieure à la date de clôture',
    cible:2, base:POP_VENTES, baseLib:'factures de vente',
    motif:'expéditions différées à la demande du client' },
  { code:'taux', lib:'Taux appliqué hors barème en vigueur',
    cible:8, base:POP_PIECES, baseLib:'écritures hors à-nouveaux',
    motif:'taux non couverts par le barème 2025, à faire justifier' },
];

/* ── ampleur d'un écart : elle découle de sa CAUSE ────────────────────────
   Les seize écarts de montant étaient tous posés entre 3 % et 10 % de la
   pièce qui les porte, quelle que soit la cause écrite à côté : un avoir
   entier non comptabilisé y valait la même chose qu'un arrondi de saisie.
   Une part choisie pour faire un joli nombre n'est pas un écart d'audit.
   Chaque écart déclare donc sa NATURE, et chaque nature sa bande — exprimée
   en part de la pièce, parce qu'une erreur est proportionnelle à ce sur quoi
   elle porte. La bande est vérifiée dans la vue « Jeu de données » : si un
   écart en sort, c'est la table qui est fausse, pas la bande. */
const NATURES_ECART = {
  arrondi:        { lib:'arrondi ou frais non ventilé', min:0,    max:0.01,
                    d:'une saisie arrondie, une commission non éclatée : quelques euros à quelques dizaines' },
  regularisation: { lib:'régularisation partielle',     min:0.02, max:0.12,
                    d:'une remise non déduite, un taux ajusté, un reliquat mal facturé : une part de la pièce' },
  omission:       { lib:'document ou ligne omis',       min:0.10, max:0.40,
                    d:'un avoir jamais comptabilisé, un retour non crédité, un rappel non intégré : l’essentiel de ce qu’il aurait fallu passer' },
};

/** Pièces touchées, nommément. Le delta est écrit, pas calculé — mais il doit
 *  tenir dans la bande de sa nature, et cela se vérifie. */
const ANOMALIES_PIECES = {
  /* montant — 16 pièces réparties sur les cinq journaux */
  'FA2025-1516':{ t:'montant', n:'omission',       delta:-624000, why:'avoir de fin d’exercice accordé au client, non comptabilisé' },
  'FA2025-3685':{ t:'montant', n:'regularisation', delta:-62000,  why:'remise commerciale accordée et non déduite' },
  'FA2025-6342':{ t:'montant', n:'regularisation', delta:-134000, why:'avoir partiel émis après facturation' },
  'FA2025-8914':{ t:'montant', n:'omission',       delta:-485000, why:'reprise de marchandise non facturée en retour' },
  'FF2025-1419':{ t:'montant', n:'regularisation', delta:-94000,  why:'remise de fin d’année du fournisseur non déduite' },
  'FF2025-3593':{ t:'montant', n:'omission',       delta:-397000, why:'avoir fournisseur reçu et non comptabilisé' },
  'FF2025-5392':{ t:'montant', n:'regularisation', delta:-31000,  why:'écart de facturation sur reliquat de commande' },
  'FF2025-7319':{ t:'montant', n:'regularisation', delta:-4500,   why:'prime d’assurance ajustée après régularisation' },
  'FF2025-9284':{ t:'montant', n:'arrondi',        delta:-420,    why:'frais de transport refacturés partiellement' },
  'BQ2025-2260':{ t:'montant', n:'arrondi',        delta:-370,    why:'frais bancaires imputés séparément, non rapprochés' },
  'BQ2025-5665':{ t:'montant', n:'omission',       delta:-672000, why:'virement partiellement rejeté et réémis' },
  'BQ2025-8784':{ t:'montant', n:'arrondi',        delta:-815,    why:'commission de mouvement non ventilée' },
  'PA2025-2462':{ t:'montant', n:'omission',       delta:-531000, why:'régularisation de prime non intégrée au journal de paie' },
  'PA2025-6967':{ t:'montant', n:'omission',       delta:-248000, why:'rappel de cotisation postérieur au bulletin' },
  'OD2025-2539':{ t:'montant', n:'arrondi',        delta:-6240,   why:'écriture de régularisation arrondie lors de la saisie' },
  'OD2025-6435':{ t:'montant', n:'regularisation', delta:-178000, why:'reclassement partiel non repris dans la contrepartie' },
  /* quantité — 4 factures de vente */
  'FA2025-1959':{ t:'quantite', delta:-3,  why:'livraison partielle, solde sur l’exercice suivant' },
  'FA2025-4906':{ t:'quantite', delta:-12, why:'casse constatée à la livraison, avoir non émis' },
  'FA2025-7268':{ t:'quantite', delta:-1,  why:'écart de comptage relevé par le client' },
  'FA2025-9351':{ t:'quantite', delta:-7,  why:'reliquat non expédié à la date de facturation' },
  /* signature — 5 factures de vente */
  'FA2025-1116':{ t:'signature', why:'bon non retourné signé par le client' },
  'FA2025-3021':{ t:'signature', why:'bon signé par un intérimaire non habilité' },
  'FA2025-5513':{ t:'signature', why:'bon non retourné signé par le client' },
  'FA2025-7891':{ t:'signature', why:'signature illisible, identité du signataire non établie' },
  'FA2025-9833':{ t:'signature', why:'bon égaré, duplicata non signé' },
  /* livraison postérieure à la clôture — 2 factures de vente */
  'FA2025-4494':{ t:'livraison', jours:4, why:'expédition différée à la demande du client' },
  'FA2025-8505':{ t:'livraison', jours:7, why:'enlèvement par le client reporté après les fêtes' },
  /* taux hors barème — 8 pièces */
  'PA2025-1378':{ t:'taux', why:'taux horaire hors grille, avenant non fourni' },
  'PA2025-5413':{ t:'taux', why:'majoration appliquée sans référence au barème' },
  'PA2025-8319':{ t:'taux', why:'coefficient d’ancienneté non justifié' },
  'FF2025-2507':{ t:'taux', why:'prix unitaire hors conditions négociées' },
  'FF2025-6287':{ t:'taux', why:'révision de prix appliquée avant sa date d’effet' },
  'FF2025-8576':{ t:'taux', why:'taux de facturation d’intérim hors contrat-cadre' },
  'OD2025-3794':{ t:'taux', why:'taux de provision retenu sans note de calcul' },
  'OD2025-7962':{ t:'taux', why:'clé de répartition modifiée sans justification' },
};
/** Anomalie portée par une pièce, ou null. */
function anomaliePiece(ref){ return ANOMALIES_PIECES[ref] || null; }

/* ── données portées par les pièces justificatives ────────────────────────
   Déterministes. La QUANTITÉ facturée est une donnée synthétique dérivée de
   la référence — c'est une donnée, pas un taux d'erreur. Les ÉCARTS, eux,
   viennent exclusivement de la table ci-dessus.                            */
function pieceSynth(e, montantCompta){
  const a = anomaliePiece(e.pieceRef);
  const qteFacturee = 1 + (seedOf(e.pieceRef) % 480);
  return {
    montant_ht:  a && a.t === 'montant' ? montantCompta + a.delta : montantCompta,
    date_piece:  e.pieceDate,
    tiers:       e.lines.map(l => l.auxLib).find(Boolean) || '—',
    num_piece:   e.pieceRef,
    qte_facturee:qteFacturee,
    qte_livree:  a && a.t === 'quantite' ? Math.max(0, qteFacturee + a.delta) : qteFacturee,
    date_livraison: a && a.t === 'livraison' ? addDays(CLOTURE, a.jours) : addDays(e.date, -(seedOf(e.pieceRef) % 5)),
    signature:   !(a && a.t === 'signature'),
    taux_contrat:a && a.t === 'taux' ? 'hors barème' : 'barème 2025 applicable',
  };
}

/* ── catalogue des procédures ─────────────────────────────────────────────
   `ech` : la procédure comporte-t-elle une sélection ?
   `pop` : définition EXPLICITE de la population — c'est ce qui rend la
           sélection revoyable, et c'est affiché tel quel à l'écran.        */
const PROCEDURES = [
  { code:'RAPPRO', a:'exhaustivite', min:'faible', ech:false, nature:'det',
    lib:'Rapprochement du détail du compte au solde de la balance' },

  { code:'RA', a:'presentation', min:'faible', ech:false, nature:'det',
    lib:'Revue analytique substantive du poste et explication des variations' },

  { code:'DETAIL', a:'realite', min:'faible', ech:true, unite:'écriture comptable', nature:'det',
    lib:'Test de détail sur les éléments sélectionnés, pièce à l’appui',
    pop:p => ({ lib:'Écritures mouvementant un compte du poste',
                periode:frDate(OUVERTURE) + ' au ' + frDate(CLOTURE),
                filtre:'aucun filtre — population entière du poste',
                f:() => true }) },

  { /* Un test de séparation des exercices est bidirectionnel par nature : il
       cherche les opérations de N rattachées à N+1 ET celles de N+1 rattachées
       à N. Le grand livre s'arrête au 31/12/2025 : le second sens est
       inexécutable ici. La période annoncée allait jusqu'au 10/01/2026 alors
       que rien après le 31/12 n'était testable — la population déclarée était
       plus large que la population testée. Elle est bornée à ce qui existe, et
       la limitation est écrite sur le papier. */
    code:'CUTOFF', a:'separation', min:'moyen', ech:true, unite:'écriture comptable', nature:'det',
    lib:'Test de séparation des exercices — dix jours avant la clôture',
    unidirectionnel:'Sens couvert : opérations comptabilisées en 2025 dont le fait générateur relève de 2026. '
      + 'Le sens inverse — opérations comptabilisées en 2026 relevant de 2025 — exige le grand livre de '
      + 'l’exercice suivant, indisponible à la date de ces travaux. Le test est donc unidirectionnel et ne '
      + 'fonde aucune conclusion sur l’exhaustivité du rattachement.',
    pop:p => ({ lib:'Écritures du poste comptabilisées dans les dix jours précédant la clôture',
                periode:frDate(CUTOFF_DEB) + ' au ' + frDate(CLOTURE),
                filtre:'date de comptabilisation comprise entre le ' + frDate(CUTOFF_DEB) + ' et le ' + frDate(CLOTURE)
                     + ' — borne haute imposée par la fin du grand livre',
                f:e => e.date >= CUTOFF_DEB && e.date <= CLOTURE }) },

  { code:'MANUEL', a:'realite', min:'moyen', ech:true, unite:'écriture comptable', nature:'det',
    lib:'Examen des écritures manuelles du poste et de leur justification',
    pop:p => ({ lib:'Écritures manuelles du poste',
                periode:frDate(OUVERTURE) + ' au ' + frDate(CLOTURE),
                filtre:'journal d’opérations diverses OU saisie par la direction',
                f:e => e.journal === 'OD' || /direction/.test(e.saisiePar) }) },

  { code:'SEQ', a:'exhaustivite', min:'moyen', ech:false, nature:'det',
    lib:'Contrôle de séquence des pièces et recherche de ruptures de numérotation' },

  { code:'RECALC', a:'evaluation', min:'moyen', ech:true, unite:'écriture comptable', nature:'det',
    lib:'Recalcul des montants et vérification des bases de calcul retenues',
    pop:p => ({ lib:'Écritures du poste supérieures au seuil de remontée',
                periode:frDate(OUVERTURE) + ' au ' + frDate(CLOTURE),
                filtre:'montant du mouvement supérieur au seuil de remontée',
                f:() => true, min:() => seuils().CTT }) },

  { code:'CONFIRM', a:'realite', min:'eleve', ech:true, unite:'tiers à circulariser', nature:'det',
    postes:['CLIENTS','TRESO','FOURN','PROV'],
    lib:'Confirmation directe auprès des tiers (circularisation)',
    tiers:true,
    pop:p => ({ lib:'Tiers auxiliaires mouvementés sur les comptes du poste',
                periode:frDate(OUVERTURE) + ' au ' + frDate(CLOTURE),
                filtre:'un élément par tiers auxiliaire, cumul des mouvements' }) },

  { code:'ENTRETIEN', a:'realite', min:'eleve', ech:false, nature:'det',
    lib:'Entretien avec le responsable du cycle et documentation du processus' },

  { code:'ESTIM', a:'evaluation', min:'moyen', ech:true, unite:'écriture comptable', nature:'det',
    siFacteur:'estimation',
    lib:'Test de la base servant à l’estimation et des taux ou formules appliqués',
    pop:p => ({ lib:'Écritures du poste rattachées à l’estimation',
                periode:frDate(OUVERTURE) + ' au ' + frDate(CLOTURE),
                filtre:'journal d’opérations diverses',
                f:e => e.journal === 'OD' }) },

  { code:'FRAUDE', a:'realite', min:'moyen', ech:true, unite:'écriture comptable', nature:'det',
    siFacteur:'fraude',
    lib:'Test spécifique de réponse au risque de fraude sur le poste',
    pop:p => ({ lib:'Écritures du poste porteuses d’un marqueur de fraude',
                periode:frDate(OUVERTURE) + ' au ' + frDate(CLOTURE),
                filtre:'week-end, montant rond au millier, validation après la clôture, ou saisie par la direction',
                f:e => isWeekend(e.date) || e.validDate > CLOTURE || /direction/.test(e.saisiePar)
                    || (() => { const m = e.lines[0].debit || e.lines[0].credit; return m >= 100000 && m % 100000 === 0; })() }) },

  { code:'ANNEXE', a:'presentation', min:'eleve', ech:false, nature:'det',
    lib:'Rapprochement des montants d’annexe se rapportant au poste' },
];

function proceduresRequises(p){
  const fa = facteursActifs(p);
  return PROCEDURES.filter(pr => {
    if (pr.postes && !pr.postes.includes(p.code)) return false;
    if (pr.siFacteur && !fa.find(f => f.code === pr.siFacteur && f.actif)) return false;
    return NIVEAUX.indexOf(niveau(p, pr.a)) >= NIVEAUX.indexOf(pr.min);
  });
}
function procRef(p, pr){ return p.code.slice(0, 4) + '-' + pr.code.slice(0, 3) + '-01'; }

/* ── casier d'une procédure dans une section ─────────────────────────────── */
function proc(code, prCode){
  const st = sec(code);
  if (!st.procs) st.procs = {};
  if (!st.procs[prCode]) st.procs[prCode] = {
    seed:'otto-' + code.toLowerCase() + '-' + prCode.toLowerCase() + '-01',
    wp:null, conclusion:'',
  };
  return st.procs[prCode];
}

/* ── population d'une procédure : explicite, affichée, comptée ───────────── */
const _popCache = new Map();
function population(p, pr){
  if (!pr.ech) return null;
  const s = seuils();
  const cle = p.code + '|' + pr.code + '|' + s.CTT;
  if (_popCache.has(cle)) return _popCache.get(cle);
  const d = pr.pop(p);
  let items;
  if (pr.tiers){
    const m = new Map();
    for (const e of lg().entries){
      const aux = e.lines.map(l => l.auxLib).find(Boolean);
      if (!aux || !e.lines.some(l => p.re.test(l.compte))) continue;
      const mv = e.lines.reduce((a, l) => a + (p.re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0);
      const cur = m.get(aux) || { cle:aux, lib:aux, montant:0, n:0, e:null };
      cur.montant += mv; cur.n++; cur.e = cur.e || e;
      m.set(aux, cur);
    }
    items = [...m.values()].sort((a, b) => b.montant - a.montant);
  } else {
    const min = d.min ? d.min() : 0;
    items = lg().entries
      .filter(e => e.lines.some(l => p.re.test(l.compte)))
      .filter(d.f)
      .map(e => ({ cle:e.num, e, montant:e.lines.reduce((a, l) => a + (p.re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0) }))
      .filter(x => x.montant > min);
  }
  const r = { ...d, comptes:p.comptes, unite:pr.unite, items,
              masse:items.reduce((a, x) => a + x.montant, 0) };
  if (_popCache.size > 300) _popCache.clear();
  _popCache.set(cle, r);
  return r;
}

/* ── méthodes de sélection ────────────────────────────────────────────────
   Deux méthodes, deux justifications écrites. Elles ne s'équivalent pas :
   la première convient quand les éléments sont petits devant le seuil, la
   seconde quand ils l'approchent — c'est précisément le cas où la première
   se met à retenir la moitié de la population.                             */
const METHODES = {
  strate:{
    lib:'strate exhaustive + tirage aléatoire',
    court:'strate + aléatoire',
    d:'Tout élément individuellement significatif est testé ; le reliquat est tiré au sort, '
     + 'chaque élément ayant la même probabilité d’être retenu.',
    quand:'Convient quand les éléments sont petits devant le seuil de planification.' },
  sum:{
    lib:'sondage en unités monétaires',
    court:'unités monétaires',
    d:'La population est parcourue en euros, pas en éléments : un euro sur « intervalle » est '
     + 'retenu, et l’élément qui le porte entre dans l’échantillon. Un élément a donc une '
     + 'probabilité proportionnelle à sa valeur, et tout élément supérieur à l’intervalle est '
     + 'retenu d’office.',
    quand:'Convient quand les éléments approchent le seuil : la couverture en valeur est obtenue '
        + 'sans tester la moitié des éléments.' },
};
function methodeDe(p, pr){
  const st = proc(p.code, pr.code);
  return METHODES[st.methode] ? st.methode : 'strate';
}

/** Sondage en unités monétaires. Déterministe : le départ aléatoire est tiré
 *  du germe, et les éléments sont parcourus dans un ordre stable. */
/* Un intervalle de sondage supérieur au seuil de planification laisse passer,
   sans jamais les voir, des anomalies individuellement significatives : la
   méthode tourne, le papier a l'air rempli, et l'échantillon ne prouve rien.
   C'est le même défaut que la strate exhaustive à 50 % de la population, par
   l'autre bout — on le dit de la même façon, sans basculer seul.
   La taille qui ramène l'intervalle au seuil est une division, pas un choix. */
function tailleAdequate(masse, pm){ return Math.max(1, Math.ceil(masse / Math.max(1, pm))); }

function tirageSUM(items, masse, n, seed){
  const intervalle = Math.max(1, Math.floor(masse / Math.max(1, n)));
  const rnd = mulberry32(seedOf(seed + '|sum'));
  const depart = Math.floor(rnd() * intervalle);
  const ordre = [...items].sort((a, b) => String(a.cle) < String(b.cle) ? -1 : 1);
  const sel = [], unites = [];
  let cum = 0, cible = depart;
  for (const it of ordre){
    const haut = cum + it.montant;
    let pris = false;
    while (cible < haut){
      unites.push({ cle:it.cle, unite:cible });
      if (!pris){ sel.push(it); pris = true; }
      cible += intervalle;
    }
    cum = haut;
  }
  return { sel, intervalle, depart, unites };
}

/** Tirage d'une procédure. La coupure d'exhaustivité vaut le seuil de
 *  planification, sans modulation par le risque (voir 11_state.js). */
const _echProcCache = new Map();
function echantillonProc(p, pr){
  const pop = population(p, pr);
  if (!pop) return null;
  const s = seuils(), st = proc(p.code, pr.code);
  const nRegle = tailleEchantillon(p, pr);
  const n = st.taille ? Math.max(1, st.taille) : nRegle;
  const strate = seuilStrate();
  const meth = methodeDe(p, pr);
  const cle = [p.code, pr.code, st.seed, strate, s.CTT, n, meth].join('|');
  if (_echProcCache.has(cle)) return _echProcCache.get(cle);

  /* La strate des éléments individuellement significatifs se calcule dans les
     deux méthodes : c'est elle qui déclenche le garde-fou, indépendamment de
     la méthode retenue. */
  const indivSig = pop.items.filter(x => x.montant >= strate);
  const partSig = pop.items.length ? indivSig.length / pop.items.length : 0;
  const gardeFou = partSig > GARDE_EXHAUSTIVE;

  let exhaustif, alea, intervalle = null, depart = null, unites = [];
  if (meth === 'sum'){
    const t = tirageSUM(pop.items, pop.masse, n, st.seed);
    intervalle = t.intervalle; depart = t.depart; unites = t.unites;
    exhaustif = t.sel.filter(x => x.montant >= intervalle);
    alea = t.sel.filter(x => x.montant < intervalle);
  } else {
    exhaustif = indivSig;
    const reste = pop.items.filter(x => x.montant < strate);
    const rnd = mulberry32(seedOf(st.seed));
    const idx = reste.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    alea = idx.slice(0, Math.min(n, idx.length)).sort((a, b) => a - b).map(i => reste[i]);
  }
  const retenus = [...exhaustif, ...alea];
  const couvert = retenus.reduce((a, x) => a + x.montant, 0);
  const nAdequate = tailleAdequate(pop.masse, strate);
  const r = { pop, exhaustif, alea, retenus, n, nRegle, couvert,
              taux: pop.masse ? couvert / pop.masse : 0, strate, niv:niveau(p, pr.a),
              methode:meth, intervalle, depart, unites,
              indivSig, partSig, gardeFou,
              nAdequate, intervalleLarge: meth === 'sum' && intervalle > strate };
  if (_echProcCache.size > 300) _echProcCache.clear();
  _echProcCache.set(cle, r);
  return r;
}

/* ═══ 27. CATALOGUE DE PREUVE ══════════════════════════════════════════════
   Par FSLI × procédure : les types de justificatifs attendus, et pour chaque
   type les CHAMPS à relever et le CONTRÔLE à opérer contre la ligne
   sélectionnée. C'est la méthode livrée avec l'outil : un cabinet sans
   département méthodologie achète l'une avec l'autre.

   `ref(x)`  : la donnée de référence, tirée du grand livre ou du paramétrage.
   `val(x)`  : ce que porte réellement la pièce (donnée synthétique).
   `tol`     : tolérance admise avant de compter un écart.
   ═══════════════════════════════════════════════════════════════════════ */
const C_MONTANT = { type:'montant', tol:0, tolLib:'exact' };
const C_DATE    = { type:'date',    tol:0, tolLib:'exact' };

const CATALOGUE = {
  /* ── chiffre d'affaires : test de détail ─────────────────────────────── */
  'CA/DETAIL': [
    { doc:'Facture de vente', champs:[
      { code:'montant_ht', lib:'Montant HT', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'date_piece', lib:'Date de facture', type:'date', regle:'dans l’exercice', tolLib:'dans l’exercice',
        contre:'exercice audité', ref:x => x.e.date, val:x => pieceSynth(x.e, x.montant).date_piece },
      { code:'tiers', lib:'Client facturé', type:'texte', tolLib:'identité',
        contre:'compte auxiliaire de l’écriture', ref:x => x.e.lines.map(l => l.auxLib).find(Boolean) || '—',
        val:x => pieceSynth(x.e, x.montant).tiers },
      { code:'num_piece', lib:'Numéro de pièce', type:'texte', tolLib:'identité',
        contre:'référence de pièce du grand livre', ref:x => x.e.pieceRef, val:x => pieceSynth(x.e, x.montant).num_piece },
    ]},
    { doc:'Bon de livraison', champs:[
      { code:'qte_livree', lib:'Quantité livrée', type:'nombre', tol:0, tolLib:'exact',
        contre:'quantité facturée', ref:x => pieceSynth(x.e, x.montant).qte_facturee, val:x => pieceSynth(x.e, x.montant).qte_livree },
      { code:'date_livraison', lib:'Date de livraison', type:'date', tolLib:'antérieure ou égale à la clôture',
        contre:'date de clôture', ref:() => CLOTURE, val:x => pieceSynth(x.e, x.montant).date_livraison,
        regle:'antérieure ou égale' },
      { code:'signature', lib:'Signature du client', type:'bool', tolLib:'présence exigée',
        contre:'présence de la signature', ref:() => true, val:x => pieceSynth(x.e, x.montant).signature },
    ]},
  ],
  /* ── achats ───────────────────────────────────────────────────────────── */
  'ACHATS/DETAIL': [
    { doc:'Facture fournisseur', champs:[
      { code:'montant_ht', lib:'Montant HT', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'date_piece', lib:'Date de facture', type:'date', regle:'dans l’exercice', tolLib:'dans l’exercice',
        contre:'exercice audité', ref:x => x.e.date, val:x => pieceSynth(x.e, x.montant).date_piece },
      { code:'tiers', lib:'Fournisseur', type:'texte', tolLib:'identité',
        contre:'compte auxiliaire de l’écriture', ref:x => x.e.lines.map(l => l.auxLib).find(Boolean) || '—',
        val:x => pieceSynth(x.e, x.montant).tiers },
    ]},
    { doc:'Bon de réception', champs:[
      { code:'qte_livree', lib:'Quantité reçue', type:'nombre', tol:0, tolLib:'exact',
        contre:'quantité facturée', ref:x => pieceSynth(x.e, x.montant).qte_facturee, val:x => pieceSynth(x.e, x.montant).qte_livree },
      { code:'date_livraison', lib:'Date de réception', type:'date', tolLib:'antérieure ou égale à la clôture',
        contre:'date de clôture', ref:() => CLOTURE, val:x => pieceSynth(x.e, x.montant).date_livraison,
        regle:'antérieure ou égale' },
    ]},
  ],
  /* ── charges de personnel ─────────────────────────────────────────────── */
  'PERSONNEL/DETAIL': [
    { doc:'Bulletin de paie', champs:[
      { code:'montant_ht', lib:'Brut du bulletin', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'date_piece', lib:'Période de paie', type:'date', regle:'dans l’exercice', tolLib:'dans l’exercice',
        contre:'exercice audité', ref:x => x.e.date, val:x => pieceSynth(x.e, x.montant).date_piece },
    ]},
    { doc:'Contrat de travail ou avenant', champs:[
      { code:'taux_contrat', lib:'Rémunération contractuelle', type:'texte', tolLib:'conformité au contrat',
        contre:'barème de rémunération applicable', ref:() => 'barème 2025 applicable',
        val:x => pieceSynth(x.e, x.montant).taux_contrat },
    ]},
  ],
  /* ── trésorerie ───────────────────────────────────────────────────────── */
  'TRESO/DETAIL': [
    { doc:'Relevé bancaire', champs:[
      { code:'montant_ht', lib:'Montant du mouvement', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'date_piece', lib:'Date de valeur', type:'date', tol:5, tolLib:'± 5 jours',
        contre:'date de comptabilisation', ref:x => x.e.date, val:x => pieceSynth(x.e, x.montant).date_piece },
    ]},
  ],
  /* ── circularisation ──────────────────────────────────────────────────── */
  '*/CONFIRM': [
    { doc:'Réponse de confirmation du tiers', champs:[
      { code:'montant_ht', lib:'Solde confirmé', ...C_MONTANT,
        contre:'cumul des mouvements en comptabilité', ref:x => x.montant, val:x => x.montant },
      { code:'date_piece', lib:'Date d’arrêté confirmée', ...C_DATE,
        contre:'date de clôture', ref:() => CLOTURE, val:() => CLOTURE },
    ]},
  ],
  /* ── séparation des exercices ─────────────────────────────────────────── */
  '*/CUTOFF': [
    { doc:'Pièce justificative de l’opération', champs:[
      { code:'date_piece', lib:'Date de la pièce', type:'date', regle:'même exercice que la référence',
        tolLib:'même exercice que la comptabilisation',
        contre:'date de comptabilisation', ref:x => x.e.date, val:x => pieceSynth(x.e, x.montant).date_piece },
      { code:'montant_ht', lib:'Montant de la pièce', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
    ]},
    { doc:'Preuve de la livraison ou du service fait', champs:[
      { code:'date_livraison', lib:'Date du fait générateur', type:'date', tolLib:'antérieure ou égale à la clôture',
        contre:'date de clôture', ref:() => CLOTURE, val:x => pieceSynth(x.e, x.montant).date_livraison,
        regle:'antérieure ou égale' },
    ]},
  ],
  /* ── écritures manuelles et fraude ────────────────────────────────────── */
  '*/MANUEL': [
    { doc:'Justification de l’écriture manuelle', champs:[
      { code:'montant_ht', lib:'Montant justifié', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'signature', lib:'Approbation d’un tiers autre que le préparateur', type:'bool', tolLib:'présence exigée',
        contre:'présence de l’approbation', ref:() => true, val:x => pieceSynth(x.e, x.montant).signature },
    ]},
  ],
  '*/FRAUDE': [
    { doc:'Justification de l’écriture relevée', champs:[
      { code:'montant_ht', lib:'Montant justifié', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'signature', lib:'Approbation d’un tiers autre que le préparateur', type:'bool', tolLib:'présence exigée',
        contre:'présence de l’approbation', ref:() => true, val:x => pieceSynth(x.e, x.montant).signature },
    ]},
  ],
  /* ── recalcul et estimation ───────────────────────────────────────────── */
  '*/RECALC': [
    { doc:'Base de calcul et pièce d’appui', champs:[
      { code:'montant_ht', lib:'Montant recalculé', ...C_MONTANT,
        contre:'montant comptabilisé', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'taux_contrat', lib:'Taux ou formule appliqué', type:'texte', tolLib:'conformité au barème',
        contre:'barème ou contrat de référence', ref:() => 'barème 2025 applicable',
        val:x => pieceSynth(x.e, x.montant).taux_contrat },
    ]},
  ],
  '*/ESTIM': [
    { doc:'Base de données servant à l’estimation', champs:[
      { code:'montant_ht', lib:'Montant issu de la base', ...C_MONTANT,
        contre:'montant comptabilisé', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'taux_contrat', lib:'Taux ou formule appliqué', type:'texte', tolLib:'justificatif exigé',
        contre:'justificatif du taux retenu', ref:() => 'barème 2025 applicable',
        val:x => pieceSynth(x.e, x.montant).taux_contrat },
    ]},
  ],
  /* ── repli générique ──────────────────────────────────────────────────── */
  '*/DETAIL': [
    { doc:'Pièce justificative de l’opération', champs:[
      { code:'montant_ht', lib:'Montant de la pièce', ...C_MONTANT,
        contre:'montant de la ligne du grand livre', ref:x => x.montant, val:x => pieceSynth(x.e, x.montant).montant_ht },
      { code:'date_piece', lib:'Date de la pièce', type:'date', regle:'dans l’exercice', tolLib:'dans l’exercice',
        contre:'exercice audité', ref:x => x.e.date, val:x => pieceSynth(x.e, x.montant).date_piece },
      { code:'tiers', lib:'Tiers', type:'texte', tolLib:'identité',
        contre:'compte auxiliaire de l’écriture', ref:x => x.e.lines.map(l => l.auxLib).find(Boolean) || '—',
        val:x => pieceSynth(x.e, x.montant).tiers },
    ]},
  ],
};
/** Le catalogue applicable : spécifique au poste s'il existe, générique sinon. */
function catalogue(p, pr){
  return CATALOGUE[p.code + '/' + pr.code] || CATALOGUE['*/' + pr.code] || null;
}
function catalogueSpecifique(p, pr){ return !!CATALOGUE[p.code + '/' + pr.code]; }
/** Documents attendus pour une procédure, dans l'ordre du catalogue. */
function docsAttendusProc(p, pr){ const c = catalogue(p, pr); return c ? c.map(d => d.doc) : []; }

/* ── comparaison d'un champ relevé à sa donnée de référence ──────────────── */
function compare(ch, releve, x){
  if (releve === undefined || releve === null || releve === '') return { saisi:false };
  const r = ch.ref(x);
  if (ch.type === 'montant'){
    const v = Math.round((parseFloat(String(releve).replace(/\s/g, '').replace(',', '.')) || 0) * 100);
    return { saisi:true, ecart:v - r, conforme:Math.abs(v - r) <= (ch.tol || 0),
             refLib:eur(r), valLib:eur(v), ecartLib:eur(v - r) };
  }
  if (ch.type === 'nombre'){
    const v = parseFloat(String(releve).replace(',', '.'));
    return { saisi:true, ecart:v - r, conforme:Math.abs(v - r) <= (ch.tol || 0),
             refLib:String(r), valLib:String(v), ecartLib:(v - r > 0 ? '+' : '') + (v - r) };
  }
  if (ch.type === 'date'){
    /* Une facture datée du 5 et comptabilisée le 8 n'est pas une anomalie :
       comparer une date de pièce à la date de comptabilisation « à l'exact »
       produisait un écart sur toute pièce normale. Chaque champ déclare donc
       la RÈGLE qui le contrôle, et non une simple égalité. */
    const j = Math.round((Date.parse(releve) - Date.parse(r)) / 86400000);
    let conforme, refLib;
    switch (ch.regle){
      case 'dans l’exercice':
        conforme = releve >= OUVERTURE && releve <= CLOTURE;
        refLib = frDate(OUVERTURE) + ' – ' + frDate(CLOTURE);
        break;
      case 'antérieure ou égale':
        conforme = releve <= r; refLib = '≤ ' + frDate(r); break;
      case 'même exercice que la référence':
        conforme = (releve <= CLOTURE) === (r <= CLOTURE);
        refLib = frDate(r) + ' (même exercice)'; break;
      default:
        conforme = Math.abs(j) <= (ch.tol || 0); refLib = frDate(r);
    }
    return { saisi:true, ecart:j, conforme, refLib, valLib:frDate(releve),
             ecartLib:ch.regle === 'dans l’exercice' ? 'hors exercice' : (j > 0 ? '+' : '') + j + ' j' };
  }
  if (ch.type === 'bool'){
    const v = releve === 'oui' || releve === true;
    return { saisi:true, ecart:v === !!r ? 0 : 1, conforme:v === !!r,
             refLib:r ? 'exigée' : 'non exigée', valLib:v ? 'oui' : 'non', ecartLib:v === !!r ? '—' : 'absente' };
  }
  const conforme = String(releve).trim().toLowerCase() === String(r).trim().toLowerCase();
  return { saisi:true, ecart:conforme ? 0 : 1, conforme,
           refLib:String(r), valLib:String(releve), ecartLib:conforme ? '—' : 'divergent' };
}

/* ── papier de travail d'une procédure ───────────────────────────────────── */
function wpProc(p, pr){
  const e = echantillonProc(p, pr);
  if (!e) return null;
  const st = proc(p.code, pr.code);
  const anc = new Map((st.wp || []).map(r => [r.cle, r]));
  /* Une ligne ne porte AUCUN drapeau de réception : « reçue » se dérive du
     dépôt du client sur la requête (voir ligneRecue). Elle ne porte que ce
     qu'un auditeur a réellement saisi : les valeurs relevées et les
     résolutions d'écart. */
  st.wp = e.retenus.map(x => {
    const g = anc.get(x.cle);
    return g || { cle:x.cle, x, champs:{}, res:{} };
  });
  for (const r of st.wp){ const x = e.retenus.find(v => v.cle === r.cle); if (x) r.x = x; }
  return st.wp;
}
/** Contrôles d'une procédure : un par (élément × document attendu × champ). */
function controles(p, pr){
  const cat = catalogue(p, pr), wp = wpProc(p, pr);
  if (!cat || !wp) return [];
  const out = [];
  for (const r of wp){
    for (const d of cat){
      for (const ch of d.champs){
        const cle = r.cle + '|' + d.doc + '|' + ch.code;
        const c = compare(ch, r.champs[cle], r.x);
        out.push({ ligne:r, doc:d.doc, ch, cle, recu:docRecu(p, pr, r.cle, d.doc), ...c });
      }
    }
  }
  return out;
}
function ecartsProc(p, pr){ return controles(p, pr).filter(c => c.saisi && !c.conforme); }
/** Écarts chiffrés d'une procédure, pour la synthèse des anomalies.
 *  Seul le RÉSIDUEL entre au cumul — mais un écart intégralement expliqué
 *  reste LISTÉ, avec son constaté, sa part expliquée et son résiduel nul.
 *  Le faire disparaître de la liste est précisément ce qui avait permis à un
 *  montant de quitter le cumul sans que rien ne l'explique. */
function ecartsChiffresProc(p, pr){
  return ecartsProc(p, pr).filter(c => constateDe(c) !== 0)
    .map(c => ({ ...c, ...residuel(c), montant:residuel(c).residuel }));
}

/* ═══ 27b. DOCUMENTATION DU JEU DE DONNÉES ═════════════════════════════════
   Le taux d'anomalie est un paramètre du jeu d'essai : il doit être lisible,
   et le taux CONSTATÉ doit être comparé au taux VISÉ. Si les deux divergent,
   c'est que la table des pièces et les cibles ne sont plus d'accord.
   ═══════════════════════════════════════════════════════════════════════ */
/** Contrôle de bande : la part de la pièce que représente chaque écart posé,
 *  comparée à la bande de sa nature. C'est la vérification que le montant
 *  découle de la cause et non d'un réglage. */
function bandesEcarts(){
  return Object.entries(ANOMALIES_PIECES).filter(([, a]) => a.t === 'montant').map(([ref, a]) => {
    const e = lg().entries.find(x => x.pieceRef === ref);
    const piece = e ? Math.max(...e.lines.map(l => Math.max(l.debit, l.credit))) : 0;
    const part = piece ? -a.delta / piece : null;
    const b = NATURES_ECART[a.n];
    return { ref, ...a, piece, part, bande:b,
             ok:part !== null && part > b.min && part <= b.max };
  });
}
function tauxConstates(){
  const parType = {};
  for (const [ref, a] of Object.entries(ANOMALIES_PIECES)){
    (parType[a.t] = parType[a.t] || []).push({ ref, ...a });
  }
  return TAUX_ANOMALIE.map(t => {
    const l = parType[t.code] || [];
    return { ...t, constate:l.length, taux:l.length / t.base, vise:t.cible / t.base,
             ok:l.length === t.cible, pieces:l };
  });
}
function vueJeuDonnees(){
  const tx = tauxConstates(), faux = tx.filter(t => !t.ok);
  const ent = lg().entries;
  return entete('Jeu de données', 'synthétique et déterministe — ce qu’il contient, et pourquoi') +
    blk('Grand livre', ent.length + ' écritures',
      `<div class="grid3">
        <div class="kv"><span class="k">Écritures</span><span class="v">${ent.length}</span>
          <span class="k">Lignes</span><span class="v">${ent.reduce((a, e) => a + e.lines.length, 0)}</span></div>
        <div class="kv"><span class="k">Hors à-nouveaux</span><span class="v">${POP_PIECES}</span>
          <span class="k">Factures de vente</span><span class="v">${POP_VENTES}</span></div>
        <div class="kv"><span class="k">Germe du générateur</span><span class="v">otto-altiverre-fy2025-v1</span>
          <span class="k">Écritures déséquilibrées</span><span class="v">0</span></div>
      </div>
      <p class="note">Le grand livre est engendré à germe fixe et totalise la balance transmise compte par compte,
      moins l’écriture de situation volontairement absente. Toutes les données sont fabriquées.</p>`) +
    blk('Taux d’anomalie déclarés', tx.reduce((a, t) => a + t.constate, 0) + ' pièces touchées',
      table([{k:'l',t:'Anomalie',cls:'wrapcell'},{k:'b',t:'Base',cls:'wrapcell'},{k:'v',t:'Taux visé',n:1},
             {k:'n',t:'Pièces posées',n:1},{k:'c',t:'Taux constaté',n:1},{k:'m',t:'Motif retenu',cls:'wrapcell'}],
        tx.map(t => ({ l:esc(t.lib), b:t.base + ' <span class="smallcaps">' + esc(t.baseLib) + '</span>',
                       v:pct(t.vise, 2), n:String(t.constate) + (t.ok ? '' : ' <span class="pill bad">≠ ' + t.cible + '</span>'),
                       c:pct(t.taux, 2), m:esc(t.motif) })),
        { foot:{ l:'Total', n:String(tx.reduce((a, t) => a + t.constate, 0)) } }) +
      (faux.length ? `<div class="callout bad">${faux.length} écart(s) entre la cible déclarée et les pièces réellement posées.</div>` : '') +
      `<p class="note">Les pièces touchées sont <b>nommées</b> dans la table ci-dessous : elles ont été retenues à la
      construction du jeu de données pour couvrir plusieurs journaux, plusieurs tiers et plusieurs ordres de grandeur.
      Aucun écart ne provient d’une fonction du numéro de pièce.</p>`) +
    blk('Ampleur des écarts de montant, rapportée à leur cause', bandesEcarts().filter(x => !x.ok).length + ' hors bande',
      table([{k:'p',t:'Pièce'},{k:'n',t:'Nature de l’écart',cls:'wrapcell'},{k:'b',t:'Bande admise',n:1},
             {k:'m',t:'Montant de la pièce',n:1},{k:'d',t:'Écart posé',n:1},{k:'q',t:'Part de la pièce',n:1},{k:'r',t:''}],
        bandesEcarts().map(x => ({ p:`<span class="mono">${esc(x.ref)}</span>`,
          n:esc(x.bande.lib), b:pct(x.bande.min, 0) + ' – ' + pct(x.bande.max, 0),
          m:eur(x.piece), d:eur(x.delta), q:pct(x.part, 2),
          r:x.ok ? marque('p', 'dans la bande de sa nature') : marque('x', 'hors bande') })),
        { foot:{ p:'Total', d:eur(bandesEcarts().reduce((a, x) => a + x.delta, 0)) } }) +
      (bandesEcarts().some(x => !x.ok)
        ? `<div class="callout bad">${bandesEcarts().filter(x => !x.ok).length} écart(s) hors de la bande de leur nature :
           la table des pièces et les natures ne sont plus d’accord.</div>` : '') +
      `<div class="grid3" style="margin-top:8px">${Object.entries(NATURES_ECART).map(([, b]) =>
        `<div class="kv"><span class="k">${esc(b.lib)}</span><span class="v">${pct(b.min, 0)} – ${pct(b.max, 0)}</span>
          <span class="k" style="grid-column:1/-1;font-family:var(--sans)">${esc(b.d)}</span></div>`).join('')}</div>
      <p class="note">Ces seize écarts étaient auparavant posés entre 3 % et 10 % de leur pièce quelle que soit leur
      cause : un avoir entier non comptabilisé y valait autant qu’un arrondi de saisie. La bande est désormais la
      décision, et le montant en découle. ${bandesEcarts().filter(x => Math.abs(x.delta) >= seuils().CTT).length}
      écart(s) dépassent le seuil de remontée de ${eur0(seuils().CTT)} — ce nombre est constaté, pas visé.</p>`) +
    blk('Pièces porteuses d’une anomalie', Object.keys(ANOMALIES_PIECES).length,
      table([{k:'p',t:'Pièce'},{k:'j',t:'Journal'},{k:'t',t:'Nature'},{k:'d',t:'Écart posé',n:1},
             {k:'w',t:'Motif',cls:'wrapcell'}],
        Object.entries(ANOMALIES_PIECES).map(([ref, a]) => {
          const e = ent.find(x => x.pieceRef === ref);
          return { p:`<span class="mono">${esc(ref)}</span>`,
                   j:e ? e.journal : '<span class="pill bad">introuvable</span>',
                   t:esc((TAUX_ANOMALIE.find(x => x.code === a.t) || {}).lib || a.t),
                   d:a.delta !== undefined ? (a.t === 'montant' ? eur(a.delta) : a.delta + ' unité(s)')
                     : a.jours !== undefined ? '+' + a.jours + ' j après la clôture' : 'absence',
                   w:esc(a.why) };
        }))) +
    blk('Écritures particulières', '3 scénarios semés dans le grand livre',
      table([{k:'t',t:'Scénario',cls:'wrapcell'},{k:'n',t:'Écritures',n:1},{k:'e',t:'Références'}],
        [['A1', 'Même facture comptabilisée deux fois'], ['A5', 'Produit de 2026 rattaché à 2025'],
         ['A6', 'Écriture manuelle de direction en fin d’exercice']].map(([tag, lib]) => {
          const l = ent.filter(e => e.tag === tag);
          return { t:esc(lib), n:String(l.length), e:l.map(e => `<span class="mono">${esc(e.num)}</span>`).join(' ') };
        })) +
      `<p class="note">Écart de rapprochement volontaire : écriture de situation de 25 000 € présente dans la balance
      transmise et absente du fichier des écritures (411000 / 706000).</p>`);
}
