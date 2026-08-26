function soldes(tb){ const m = new Map(); for (const [c, l, d, cr] of tb) m.set(c, { lib:l, solde:d - cr, debit:d, credit:cr }); return m; }
const B24 = soldes(TB_2024);
function sumWhere(bal, re){ let s = 0; for (const [c, v] of bal) if (re.test(c)) s += v.solde; return s; }

/** Références possibles pour la matérialité, toutes calculées depuis la balance.
 *  Signe : produits et capitaux propres sont créditeurs, on les rend positifs. */
function benchmarks(bal){
  const produits = -sumWhere(bal, /^7/);
  const charges  =  sumWhere(bal, /^6/);
  const ca       = -sumWhere(bal, /^70/);                    // 701+706 moins 709 (RRR)
  const resultat = produits - charges;                        // résultat courant avant impôt
  // total actif net = soldes débiteurs des classes 2 à 5, nets des amortissements
  let actif = 0;
  for (const [c, v] of bal){
    if (/^(28|29|39|49)/.test(c)) actif += v.solde;           // amortissements : solde créditeur, donc négatif
    else if (/^[2345]/.test(c) && v.solde > 0) actif += v.solde;
  }
  const capitaux = -sumWhere(bal, /^(101|106|110)/) + resultat;
  return {
    ca:{ code:'ca', lib:'Chiffre d’affaires', val:ca, defaut:1 },
    pbt:{ code:'pbt', lib:'Résultat courant avant impôt', val:resultat, defaut:5 },
    equity:{ code:'equity', lib:'Capitaux propres', val:capitaux, defaut:3 },
    actif:{ code:'actif', lib:'Total de l’actif', val:actif, defaut:2 },
    charges:{ code:'charges', lib:'Total des charges', val:charges, defaut:1 },
  };
}
const BM24 = benchmarks(B24);

/** Arrondi prudent vers le bas au pas indiqué (pratique de place). */
function arrondiBas(cents, pas){ return Math.floor(cents / pas) * pas; }

/** Les trois seuils. Recalculés à chaque mouvement de curseur. */
function seuils(){
  const b = bm()[S.benchmark];
  const brut = Math.round(b.val * S.pctM / 100);
  const M  = arrondiBas(brut, 100000);            // au millier d'euros inférieur
  const PM = arrondiBas(Math.round(M * S.pctPM / 100), 100000);
  const CTT= arrondiBas(Math.round(M * S.pctCTT / 100), 10000); // à la centaine d'euros
  return { bench:b, brut, M, PM, CTT };
}

/* ═══ 5. POSTES DES COMPTES ANNUELS ════════════════════════════════════════
   `dom` est le DOMAINE MÉTIER du poste : le nom que le client lui donne, et
   accessoirement la personne qui en répond chez lui. « CLIENTS » et « CA »
   sont deux sections d'audit ; pour la DAF, c'est un seul sujet — les ventes.
   Le portail client filtre là-dessus, jamais sur le code de section : lui
   demander de connaître notre découpage, c'est lui demander de faire notre
   travail avant de faire le sien.
   ═══════════════════════════════════════════════════════════════════════ */
const DOMAINES = {
  ventes:   'Ventes et clients',
  achats:   'Achats et fournisseurs',
  stocks:   'Stocks et production',
  paie:     'Paie et personnel',
  immo:     'Immobilisations',
  treso:    'Trésorerie et financement',
  fiscal:   'Fiscalité',
  juridique:'Juridique et capitaux propres',
  autres:   'Autres produits et charges',
};
const POSTES = [
  { code:'IMMO_INC', lib:'Immobilisations incorporelles', re:/^(205|280)/, masse:'bilan', dom:'immo' },
  { code:'IMMO_COR', lib:'Immobilisations corporelles',   re:/^(213|218|2813|2818)/, masse:'bilan', dom:'immo' },
  { code:'STOCKS',   lib:'Stocks',                        re:/^3/, masse:'bilan', aussi:'resultat', dom:'stocks' },
  { code:'CLIENTS',  lib:'Clients et comptes rattachés',  re:/^41/, masse:'bilan', dom:'ventes' },
  { code:'TRESO',    lib:'Trésorerie',                    re:/^(512|53)/, masse:'bilan', dom:'treso' },
  { code:'CAPITAUX', lib:'Capitaux propres',              re:/^(101|106|110)/, masse:'bilan', dom:'juridique' },
  { code:'PROV',     lib:'Provisions pour risques',       re:/^15/, masse:'bilan', aussi:'resultat', dom:'juridique' },
  { code:'DETTES_FI',lib:'Dettes financières',            re:/^16/, masse:'bilan', dom:'treso' },
  { code:'FOURN',    lib:'Fournisseurs',                  re:/^40/, masse:'bilan', dom:'achats' },
  { code:'SOCIAL',   lib:'Dettes sociales et personnel',  re:/^(42|43)/, masse:'bilan', dom:'paie' },
  { code:'FISCAL',   lib:'Dettes fiscales (TVA)',         re:/^445/, masse:'bilan', dom:'fiscal' },
  { code:'CA',       lib:'Chiffre d’affaires',            re:/^70/, masse:'resultat', dom:'ventes' },
  { code:'AUTRES_PR',lib:'Autres produits',               re:/^75/, masse:'resultat', dom:'autres' },
  { code:'ACHATS',   lib:'Achats consommés',              re:/^60/, masse:'resultat', dom:'achats' },
  { code:'CHARGES_EXT',lib:'Charges externes',            re:/^(61|62)/, masse:'resultat', dom:'achats' },
  { code:'PERSONNEL',lib:'Charges de personnel',          re:/^64/, masse:'resultat', dom:'paie' },
  { code:'FINANCIER',lib:'Charges financières',           re:/^66/, masse:'resultat', dom:'treso' },
  { code:'AMORT',    lib:'Dotations aux amortissements et provisions', re:/^68/, masse:'resultat', aussi:'bilan', dom:'immo' },
];
/* Une section sans domaine, ou avec un domaine inconnu, rendrait le filtre du
   portail silencieusement incomplet : une demande deviendrait introuvable sans
   qu'aucun écran ne le dise. On refuse de démarrer plutôt que de le taire. */
for (const p of POSTES)
  if (!p.dom || !DOMAINES[p.dom])
    throw new Error('POSTES : domaine métier inconnu sur ' + p.code + ' — ' + String(p.dom));
/** Le domaine métier d'une section, et son libellé côté client. */
function domaineDe(code){ const p = POSTES.find(x => x.code === code); return p ? p.dom : null; }
function libDomaine(code){ const d = domaineDe(code); return d ? DOMAINES[d] : 'Autres demandes'; }

let _postesCache = null;
function postesCalcules(){
  if (_postesCache) return _postesCache;
  const b = bal();
  _postesCache = POSTES.map(p => {
    const comptes = tb().filter(r => p.re.test(r[0])).map(r => r[0]);
    const n = comptes.reduce((s, c) => s + b.get(c).solde, 0);
    const n1 = comptes.reduce((s, c) => s + (B24.get(c) ? B24.get(c).solde : 0), 0);
    return { ...p, comptes, solde:n, soldeN1:n1 };
  }).filter(p => p.comptes.length);
  return _postesCache;
}

/* ═══ 6. SOCLE D'AFFICHAGE ═════════════════════════════════════════════════ */
/* ── masses : bilan et compte de résultat ─────────────────────────────────
   Un poste a une masse principale et peut en toucher une seconde : les
   provisions et les stocks vivent au bilan mais leur variation passe par le
   résultat ; les dotations sont une charge dont la contrepartie est au bilan.
   Le classement n'est donc pas binaire — le poste apparaît dans les deux. */
const MASSE_LIB = { bilan:'Bilan', resultat:'Compte de résultat' };
function masseDe(p){ return p.masse || 'bilan'; }
function postesDeMasse(m){
  return postesEnPerimetre().filter(p => masseDe(p) === m || p.aussi === m);
}
/** Tous les postes d'une masse, périmètre ou non — le rail peut vouloir
 *  rendre atteignable un poste sorti du périmètre, sans quoi le sortir revient
 *  à le faire disparaître de la navigation. */
function postesDeMasseTous(m){
  return postesCalcules().filter(p => masseDe(p) === m || p.aussi === m);
}
