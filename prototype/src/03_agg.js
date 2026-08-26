function soldes(tb){ const m = new Map(); for (const [c, l, d, cr] of tb) m.set(c, { lib:l, solde:d - cr, debit:d, credit:cr }); return m; }
const B25 = soldes(TB_2025), B24 = soldes(TB_2024);
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
const BM25 = benchmarks(B25), BM24 = benchmarks(B24);

/** Arrondi prudent vers le bas au pas indiqué (pratique de place). */
function arrondiBas(cents, pas){ return Math.floor(cents / pas) * pas; }

/** Les trois seuils. Recalculés à chaque mouvement de curseur. */
function seuils(){
  const b = BM25[S.benchmark];
  const brut = Math.round(b.val * S.pctM / 100);
  const M  = arrondiBas(brut, 100000);            // au millier d'euros inférieur
  const PM = arrondiBas(Math.round(M * S.pctPM / 100), 100000);
  const CTT= arrondiBas(Math.round(M * S.pctCTT / 100), 10000); // à la centaine d'euros
  return { bench:b, brut, M, PM, CTT };
}

/* ═══ 5. POSTES DES COMPTES ANNUELS ════════════════════════════════════════ */
const POSTES = [
  { code:'IMMO_INC', lib:'Immobilisations incorporelles', re:/^(205|280)/, masse:'bilan' },
  { code:'IMMO_COR', lib:'Immobilisations corporelles',   re:/^(213|218|2813|2818)/, masse:'bilan' },
  { code:'STOCKS',   lib:'Stocks',                        re:/^3/, masse:'bilan', aussi:'resultat' },
  { code:'CLIENTS',  lib:'Clients et comptes rattachés',  re:/^41/, masse:'bilan' },
  { code:'TRESO',    lib:'Trésorerie',                    re:/^(512|53)/, masse:'bilan' },
  { code:'CAPITAUX', lib:'Capitaux propres',              re:/^(101|106|110)/, masse:'bilan' },
  { code:'PROV',     lib:'Provisions pour risques',       re:/^15/, masse:'bilan', aussi:'resultat' },
  { code:'DETTES_FI',lib:'Dettes financières',            re:/^16/, masse:'bilan' },
  { code:'FOURN',    lib:'Fournisseurs',                  re:/^40/, masse:'bilan' },
  { code:'SOCIAL',   lib:'Dettes sociales et personnel',  re:/^(42|43)/, masse:'bilan' },
  { code:'FISCAL',   lib:'Dettes fiscales (TVA)',         re:/^445/, masse:'bilan' },
  { code:'CA',       lib:'Chiffre d’affaires',            re:/^70/, masse:'resultat' },
  { code:'AUTRES_PR',lib:'Autres produits',               re:/^75/, masse:'resultat' },
  { code:'ACHATS',   lib:'Achats consommés',              re:/^60/, masse:'resultat' },
  { code:'CHARGES_EXT',lib:'Charges externes',            re:/^(61|62)/, masse:'resultat' },
  { code:'PERSONNEL',lib:'Charges de personnel',          re:/^64/, masse:'resultat' },
  { code:'FINANCIER',lib:'Charges financières',           re:/^66/, masse:'resultat' },
  { code:'AMORT',    lib:'Dotations aux amortissements',  re:/^68/, masse:'resultat', aussi:'bilan' },
];
let _postesCache = null;
function postesCalcules(){
  if (_postesCache) return _postesCache;
  _postesCache = POSTES.map(p => {
    const comptes = TB_2025.filter(r => p.re.test(r[0])).map(r => r[0]);
    const n = comptes.reduce((s, c) => s + B25.get(c).solde, 0);
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
