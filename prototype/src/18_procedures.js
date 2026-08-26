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
/* ── les procédures viennent du CATALOGUE, pas d'ici ───────────────────────
   La méthodologie vit dans methodology/procedures.json, versionné, validé et
   consommé aussi par l'application. Ce fichier ne fait que la mettre en forme
   pour l'écran : il n'en possède aucune ligne. */
/* Une procédure n'est EXÉCUTABLE ici que si son prédicat de population est
   réellement implémenté. Trois cas de non-exécution, et un seul écran :
   le catalogue dit « non_implemente », le prototype déclare le prédicat
   absent, ou le registre ne le connaît pas du tout. Le troisième cas est un
   défaut de construction : le harnais du catalogue le relève. */
function raisonNonExecutable(c){
  const nom = c.population.predicat || 'non_implemente';
  if (nom === 'non_implemente')
    return 'le catalogue ne nomme aucune population calculable : cette procédure s’exécute hors '
         + 'des données comptables (observation, entretien, inspection physique).';
  if (PREDICATS_ABSENTS[nom]) return PREDICATS_ABSENTS[nom];
  if (!PREDICATS[nom]) return 'prédicat « ' + nom + ' » inconnu du registre du prototype.';
  return null;
}
const PROCEDURES = CAT_PROCEDURES.map(c => ({
  code:c.code, cycle:c.cycle, a:c.assertion, min:c.risque_minimum,
  ech:c.echantillonnee && !raisonNonExecutable(c),
  catalogue:c.echantillonnee, unite:c.unite, lib:c.libelle, objectif:c.objectif,
  sens:c.sens, controle:c.controle, sources:c.sources, note:c.note,
  exceptions:c.exceptions, postes:c.postes, siFacteur:c.si_facteur,
  tiers:(c.population.predicat || '').startsWith('tiers_'),
  nonExecutable:!!raisonNonExecutable(c), pourquoi:raisonNonExecutable(c),
  predicat:c.population.predicat || 'non_implemente',
  def:c,
}));
/** Une procédure s'applique-t-elle à ce poste ? Transverse, ou de son cycle. */
function procDuPoste(pr, p){
  if (pr.cycle !== '*' && pr.cycle !== p.code) return false;
  if (pr.postes && !pr.postes.includes(p.code)) return false;
  return true;
}
/** Le sens du test, en toutes lettres — la donnée qui manquait au catalogue. */
function libSens(code){ return (SENS_TEST[code] || {}).libelle || code; }
function dSens(code){ return (SENS_TEST[code] || {}).d || ''; }

function proceduresRequises(p){
  const fa = facteursActifs(p);
  return PROCEDURES.filter(pr => {
    if (!procDuPoste(pr, p)) return false;
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
  const cle = p.code + '|' + pr.code + '|' + s.CTT + '|' + S.version;
  if (_popCache.has(cle)) return _popCache.get(cle);
  const d = pr.def.population;
  const fn = PREDICATS[d.predicat || 'non_implemente'] || PREDICATS.non_implemente;
  const items = fn(p, pr, d.parametres || {});
  if (!items) return null;
  const r = { lib:d.libelle, source:d.source, periode:d.periode, filtre:d.filtre,
              predicat:d.predicat, comptes:p.comptes, unite:pr.unite, items,
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
  exhaustive:{
    lib:'sélection exhaustive au seuil de remontée',
    court:'exhaustive',
    imposee:'la méthode l’exige — voir la note de la procédure',
    d:'Aucun tirage : tous les éléments de la population sont testés. La population est déjà bornée '
     + 'par le seuil de remontée déclaré ; c’est ce seuil, et lui seul, qui fixe l’étendue.',
    quand:'Exigée par les tests d’exhaustivité : sonder une population que l’on cherche précisément à '
        + 'compléter ne prouve rien sur ce qui en est absent.' },
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
/** La méthode imposée par le catalogue n'est pas offerte au choix. */
function methodeImposee(pr){
  const m = pr.def && pr.def.selection === 'exhaustive_au_seuil' ? 'exhaustive' : null;
  return m;
}
function methodeDe(p, pr){
  const imp = methodeImposee(pr);
  if (imp) return imp;
  const st = proc(p.code, pr.code);
  return METHODES[st.methode] && !METHODES[st.methode].imposee ? st.methode : 'strate';
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
  if (meth === 'exhaustive'){
    /* Pas de strate, pas de tirage, pas de germe : la population entière est
       le papier de travail. Le garde-fou d'exhaustivité ne s'applique pas —
       il dit qu'on teste presque tout SANS l'avoir décidé ; ici c'est décidé,
       écrit au catalogue, et c'est la seule façon de conclure sur ce qui
       manque. */
    exhaustif = pop.items; alea = [];
  } else if (meth === 'sum'){
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
              indivSig, partSig, gardeFou: gardeFou && meth !== 'exhaustive',
              imposee: meth === 'exhaustive',
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

/* ── le catalogue de preuve vient lui aussi des données ────────────────────
   Chaque champ nomme sa RÉFÉRENCE ; RESOLVEURS sait la calculer et sait ce
   que la pièce synthétique en dit. Un champ dont le résolveur est
   « non_implemente » ne produit aucun contrôle exécutable. */
function champCode(c){
  const r = RESOLVEURS[c.reference] || RESOLVEURS.non_implemente;
  return { code:c.code, lib:c.libelle, type:c.type, contre:c.controle_contre,
           regle:c.regle, tolLib:c.tolerance, releveSeul:!!c.releve_seul,
           tol:c.type === 'montant' || c.type === 'nombre' ? 0
             : c.type === 'date' && /± (\d+)/.test(c.tolerance) ? parseInt(c.tolerance.match(/± (\d+)/)[1], 10) : 0,
           ref:r.ref, val:r.val, resolveur:c.reference };
}
function docsCatalogue(liste){
  return (liste || []).map(d => ({ doc:d.document, champs:d.champs.map(champCode) }));
}
function catalogue(p, pr){
  const d = pr.def; if (!d) return null;
  const parCycle = (d.justificatifs_par_cycle || {})[p.code];
  const l = parCycle || d.justificatifs;
  return l && l.length ? docsCatalogue(l) : null;
}
function catalogueSpecifique(p, pr){
  return !!(pr.def && (pr.def.justificatifs_par_cycle || {})[p.code]) || (pr.cycle && pr.cycle !== '*');
}
/** Documents attendus pour une procédure, dans l'ordre du catalogue. */
function docsAttendusProc(p, pr){ const c = catalogue(p, pr); return c ? c.map(d => d.doc) : []; }

/* ── comparaison d'un champ relevé à sa donnée de référence ──────────────── */
function compare(ch, releve, x){
  if (releve === undefined || releve === null || releve === '') return { saisi:false };
  /* Un champ RELEVÉ SEUL n'a pas de référence à laquelle se comparer : il
     alimente le jugement ou un autre contrôle. Le catalogue distingue donc
     « champs à relever » et « contrôle à opérer » — la date d'un fait
     générateur se relève, c'est la recherche de la dette qui se contrôle.
     Le confondre avec un contrôle, c'était relever comme anomalie toute
     facture normale du cycle. */
  if (ch.releveSeul) return { saisi:true, ecart:0, conforme:true, releveSeul:true,
    refLib:'—', ecartLib:'relevé',
    valLib: ch.type === 'date' ? frDate(releve)
          : ch.type === 'montant' ? eur(Math.round((parseFloat(String(releve).replace(/\s/g, '').replace(',', '.')) || 0) * 100))
          : String(releve) };
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
