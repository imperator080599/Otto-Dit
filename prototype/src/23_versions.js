
/* ═══ 36. VERSIONS DE LA BALANCE ET DU GRAND LIVRE ═════════════════════════
   Un mandat reçoit trois à cinq versions du fichier. Le prototype n'en
   connaissait qu'une, et l'écrasement était donc impensé. Deux règles :

   1. Une version n'est JAMAIS une régénération. C'est le grand livre
      précédent PLUS les écritures passées depuis. Régénérer redistribuerait
      les montants et déplacerait les anomalies : deux versions ne seraient
      plus comparables.
   2. Une version reçue n'est pas une version prise en compte. On lit d'abord
      le rapport d'impact, puis on décide. Basculer le grand livre sous une
      mission en cours sans le dire est ce que fait un tableur, pas un outil
      d'audit.

   Chaque écriture de version déclare sa CIBLE : elle touche la balance, le
   grand livre, ou les deux. Une écriture qui ne touche que l'un des deux crée
   — ou résorbe — un écart de rapprochement, et c'est voulu.

   Chaque écriture déclare aussi sa NATURE, son JUSTIFICATIF et son AUTEUR
   CÔTÉ CLIENT. Le rapport d'impact dit CE QUI a changé ; la section
   « Ajustements et retraitements » dit POURQUOI, écriture par écriture. Une
   écriture de nature « correction_audit » nomme en outre la PIÈCE qu'elle
   corrige : c'est ce qui permet à une anomalie de passer de « non corrigée »
   à « corrigée » sans qu'on la coche à la main.
   ═══════════════════════════════════════════════════════════════════════ */

const CIBLE_LIB = {
  deux:'balance et grand livre',
  tb:'balance seule — le fichier des écritures est antérieur',
  gl:'grand livre seul — la balance la portait déjà',
};

const VERSIONS = [
  { n:1, date:'2026-02-10', lib:'Balance provisoire',
    fichiers:'balance_2025_provisoire.csv · 999888777FEC20251231.txt',
    par:'Delphine Martin', ecritures:[],
    note:'Premier envoi, avant les écritures d’inventaire. L’écriture de situation figure à la '
       + 'balance et pas au fichier des écritures : c’est l’écart de rapprochement d’origine.' },

  { n:2, date:'2026-03-04', lib:'Après écritures d’inventaire et de clôture',
    fichiers:'balance_2025_v2.csv · 999888777FEC20251231_v2.txt',
    par:'Paul Nguyen',
    note:'Quatre écritures de clôture. L’écriture de situation est enfin reprise au fichier : '
       + 'l’écart de rapprochement de la version 1 disparaît de lui-même.',
    ecritures:[
      { ref:'OD-V2-001', date:'2025-12-31', cible:'gl', nature:'inventaire',
        justif:'Journal des à-nouveaux et de situation — export du 3 mars 2026',
        par:'Paul Nguyen (comptable général)',
        lib:'Écriture de situation — reprise au fichier des écritures',
        motif:'l’écriture figurait à la balance depuis le premier envoi ; elle est désormais au grand livre',
        lignes:[['411000', 2500000, 0], ['706000', 0, 2500000]] },
      { ref:'OD-V2-002', date:'2025-12-31', cible:'deux', nature:'inventaire',
        justif:'Feuille de dépouillement de l’inventaire physique du 31/12/2025, signée',
        par:'Paul Nguyen (comptable général)',
        lib:'Valorisation définitive des stocks de produits finis',
        motif:'inventaire physique du 31/12 dépouillé : écart de 4 % sur le stock comptable de produits finis',
        lignes:[['355000', 1520000, 0], ['713500', 0, 1520000]] },
      { ref:'OD-V2-003', date:'2025-12-31', cible:'deux', nature:'retraitement',
        justif:'Note du directeur technique du 12/02/2026 sur la durée d’usage des fours',
        par:'Delphine Martin (directrice administrative et financière)',
        lib:'Dotation complémentaire — durée d’usage des fours révisée',
        motif:'durée d’usage des fours ramenée de 12 à 10 ans : une annuité de rattrapage sur les installations techniques',
        lignes:[['681100', 4000000, 0], ['281350', 0, 4000000]] },
      { ref:'OD-V2-004', date:'2025-12-31', cible:'deux', nature:'inventaire',
        justif:'Requête prud’homale notifiée le 06/02/2026 et lettre de l’avocat du 20/02/2026',
        par:'Delphine Martin (directrice administrative et financière)',
        lib:'Provision pour litige prud’homal',
        motif:'requête notifiée en février 2026 pour un licenciement de novembre 2025 ; provision à hauteur d’une année de rémunération et des frais',
        lignes:[['681500', 5500000, 0], ['151000', 0, 5500000]] },
    ] },

  { n:3, date:'2026-03-12', lib:'Après revue de l’expert-comptable',
    fichiers:'balance_2025_v3.csv · 999888777FEC20251231_v2.txt',
    par:'Julien Lefèvre (expert-comptable)',
    note:'Trois corrections issues de la revue du cabinet. L’avoir n’est passé qu’à la balance : '
       + 'le fichier des écritures transmis reste celui de la version 2, ce qui rouvre un écart.',
    ecritures:[
      { ref:'OD-V3-001', date:'2025-12-31', cible:'deux', nature:'retraitement',
        justif:'Contrat de licence pluriannuel du 04/04/2025 et facture FF2025-2211',
        par:'Julien Lefèvre (expert-comptable)',
        lib:'Immobilisation d’une licence logicielle comptabilisée en honoraires',
        motif:'licence pluriannuelle portée en honoraires de conseil ; elle répond à la définition d’une immobilisation incorporelle',
        lignes:[['205000', 1800000, 0], ['622600', 0, 1800000]] },
      { ref:'OD-V3-002', date:'2025-12-31', cible:'tb', nature:'retraitement',
        justif:'Avoir AV2025-0118 du 19/12/2025, retrouvé au parapheur du service commercial',
        par:'Julien Lefèvre (expert-comptable)',
        lib:'Avoir client de fin d’exercice non comptabilisé',
        motif:'avoir accordé en décembre et retrouvé lors de la revue ; passé à la balance, le fichier des écritures transmis lui est antérieur',
        lignes:[['709000', 620000, 0], ['411000', 0, 620000]] },
      { ref:'OD-V3-003', date:'2025-12-31', cible:'deux', nature:'retraitement',
        justif:'Rapprochement du compte 401 du fournisseur, édition du 10/03/2026',
        par:'Julien Lefèvre (expert-comptable)',
        lib:'Extourne d’une facture fournisseur comptabilisée deux fois',
        motif:'double intégration relevée par le cabinet sur les consommables',
        lignes:[['401000', 1250000, 0], ['602100', 0, 1250000]] },
    ] },

  { n:4, date:'2026-03-14', lib:'Après les constats de l’audit',
    fichiers:'balance_2025_v4.csv · 999888777FEC20251231_v3.txt',
    par:'Delphine Martin',
    note:'Quatre écritures passées par le client APRÈS communication de nos constats. Trois '
       + 'répondent à une anomalie relevée au test des écritures ; la quatrième dit répondre à '
       + 'un constat que notre dossier ne porte pas. La réconciliation le signale sans trancher.',
    ecritures:[
      { ref:'OD-V4-001', date:'2025-12-31', cible:'deux', nature:'correction_audit',
        repond:'FA2025-0702',
        justif:'Extrait du grand livre 411/701 montrant la double intégration, et notre constat transmis le 13/03/2026',
        par:'Paul Nguyen (comptable général)',
        lib:'Extourne de la facture FA2025-0702 comptabilisée deux fois',
        motif:'anomalie relevée au test des écritures : la même facture est intégrée deux fois, en juin et en juillet',
        lignes:[['701000', 3680000, 0], ['411000', 0, 3680000]] },
      { ref:'OD-V4-002', date:'2025-12-31', cible:'deux', nature:'correction_audit',
        repond:'FA2025-0706',
        justif:'Facture FA2025-0706 et bon de livraison du 08/01/2026',
        par:'Paul Nguyen (comptable général)',
        lib:'Contre-passation d’un produit de 2026 rattaché à 2025',
        motif:'anomalie relevée au test des écritures : facture comptabilisée au 31/12 pour une livraison de janvier',
        lignes:[['701000', 3633000, 0], ['411000', 0, 3633000]] },
      { ref:'OD-V4-003', date:'2025-12-31', cible:'deux', nature:'correction_audit',
        repond:'OD-2025-089',
        justif:'Contrat de prestation du 02/11/2025 et planning d’intervention',
        par:'Delphine Martin (directrice administrative et financière)',
        lib:'Produit constaté d’avance sur la prestation OD-2025-089 — correction PARTIELLE',
        motif:'le client ne diffère que la part de la prestation exécutée en 2026 : 30 000 € sur les 50 000 € '
            + 'comptabilisés en produit, la part de 2025 étant selon lui acquise. Notre constat portait sur la totalité.',
        lignes:[['706000', 3000000, 0], ['487000', 0, 3000000]] },
      { ref:'OD-V4-004', date:'2025-12-31', cible:'deux', nature:'correction_audit',
        repond:'FF2025-0355',
        justif:'Courriel du fournisseur du 11/03/2026 annulant la facture',
        par:'Paul Nguyen (comptable général)',
        lib:'Annulation d’une facture d’honoraires de conseil non due',
        motif:'présentée comme une réponse à un constat d’audit — notre dossier ne porte aucune anomalie sur cette pièce',
        lignes:[['401000', 210000, 0], ['622600', 0, 210000]] },
    ] },
];

/* Libellés des comptes que les versions font apparaître. */
const COMPTES_NOUVEAUX = {
  '713500':'Variation des stocks de produits finis',
  '681500':'Dotations aux provisions pour risques',
  '487000':'Produits constatés d’avance',
};

function versionsPrises(){ return VERSIONS.filter(v => v.n <= S.version); }
function versionCourante(){ return VERSIONS.find(v => v.n === S.version) || VERSIONS[0]; }
function versionsRecues(){ return VERSIONS.filter(v => v.date <= S.aujourdhui); }
function versionsEnAttente(){ return versionsRecues().filter(v => v.n > S.version); }
function ecrituresJusqua(n){
  return VERSIONS.filter(v => v.n > 1 && v.n <= n).flatMap(v => v.ecritures.map(e => ({ ...e, v:v.n })));
}

/** Empreinte d'un fichier : déterministe, calculée sur ce qu'il contient. */
function empreinteVersion(n){
  const src = JSON.stringify([n, tbVersion(n), ledgerVersion(n).entries.length]);
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++){ h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const g = (x) => x.toString(16).padStart(8, '0');
  return (g(h) + g(Math.imul(h, 0x85ebca6b) >>> 0) + g(Math.imul(h ^ n, 0xc2b2ae35) >>> 0)).slice(0, 20);
}

/* ── balance d'une version ────────────────────────────────────────────────
   La balance de la version n, c'est celle de la version 1 augmentée des
   écritures des versions suivantes qui la touchent. Rien n'est écrasé.     */
const _tbCache = new Map();
function tbVersion(n){
  if (_tbCache.has(n)) return _tbCache.get(n);
  const m = new Map(TB_2025.map(r => [r[0], [r[0], r[1], r[2], r[3]]]));
  for (const e of ecrituresJusqua(n)){
    if (e.cible === 'gl') continue;
    for (const [c, d, cr] of e.lignes){
      const r = m.get(c) || [c, COMPTES_NOUVEAUX[c] || c, 0, 0];
      r[2] += d; r[3] += cr; m.set(c, r);
    }
  }
  const out = [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  _tbCache.set(n, out);
  return out;
}
/* ── grand livre d'une version ───────────────────────────────────────────── */
const _lgCache = new Map();
function ledgerVersion(n){
  if (_lgCache.has(n)) return _lgCache.get(n);
  const base = ledgerBase();
  const sup = ecrituresJusqua(n).filter(e => e.cible !== 'tb').map(e => ({
    journal:'OD', date:e.date, pieceRef:e.ref, pieceDate:e.date, libelle:e.lib,
    validDate:VERSIONS.find(v => v.n === e.v).date, saisiePar:VERSIONS.find(v => v.n === e.v).par,
    num:e.ref, tag:'', version:e.v,
    lines:e.lignes.map(([c, d, cr]) => ({
      compte:c, libelleCompte:libelleCompte(c), debit:d, credit:cr, auxNum:'', auxLib:'' })),
  }));
  const entries = [...base.entries, ...sup];
  const rows = [...base.rows];
  for (const e of sup) e.lines.forEach((l, i) => rows.push({
    JournalCode:'OD', JournalLib:'Opérations diverses', EcritureNum:e.num, EcritureDate:e.date,
    CompteNum:l.compte, CompteLib:l.libelleCompte, CompAuxNum:'', CompAuxLib:'',
    PieceRef:e.pieceRef, PieceDate:e.pieceDate, EcritureLib:e.libelle, Debit:l.debit, Credit:l.credit,
    EcritureLet:'', DateLet:'', ValidDate:e.validDate, Montantdevise:'', Idevise:'',
    saisiePar:e.saisiePar, tag:'', ligne:i + 1 }));
  const r = { entries, rows };
  _lgCache.set(n, r);
  return r;
}
function libelleCompte(c){
  const r = TB_2025.find(x => x[0] === c);
  return r ? r[1] : (COMPTES_NOUVEAUX[c] || c);
}

/* ── accès à la version active : tout le reste du prototype passe par là ─── */
function tb(){ return tbVersion(S.version); }
function lg(){ return ledgerVersion(S.version); }
function fec(){ return lg().rows; }
const _balCache = new Map(), _bmCache = new Map(), _glBalCache = new Map();
function bal(){
  if (!_balCache.has(S.version)) _balCache.set(S.version, soldes(tb()));
  return _balCache.get(S.version);
}
function bm(){
  if (!_bmCache.has(S.version)) _bmCache.set(S.version, benchmarks(bal()));
  return _bmCache.get(S.version);
}
function glBal(){
  if (!_glBalCache.has(S.version)) _glBalCache.set(S.version, balanceFromLedger(fec()));
  return _glBalCache.get(S.version);
}
/** Bascule de version : elle vide les caches dérivés, jamais l'état saisi. */
function prendreEnCompte(n){
  const av = S.version;
  S.version = n;
  viderCachesDerives();
  logEvent('version prise en compte', 'version ' + n + ' — ' + VERSIONS.find(v => v.n === n).lib,
           'version précédente : ' + av + ' · empreinte ' + empreinteVersion(n));
}

/** Tout ce qui se DÉRIVE du fichier est recalculé ; rien de ce qui a été SAISI
 *  n'est touché. C'est la frontière que la bascule de version ne franchit pas. */
function viderCachesDerives(){
  _postesCache = null;
  _echProcCache.clear(); _popCache.clear(); _regleCache.clear(); _statCache.clear();
  _regCache = null; _regCle = '';
  _travCache.cle = ''; _travCache.v = null;
  _depIdx.cle = ''; _depIdx.m = null;
  _refSeq = {};
}

/* ── ce que chaque papier cite : la version sur laquelle il a été exécuté ── */
/** Signature de la sélection d'une procédure : si elle change, l'échantillon
 *  n'est plus le même et le papier ne porte plus sur la même population. */
function empreinteSelection(p, pr){
  const e = echantillonProc(p, pr);
  if (!e) return '';
  return e.retenus.length + ':' + e.retenus.map(x => x.cle).join('|');
}
/** Stampe la version d'exécution au premier travail réellement saisi. */
function marquerExecution(p, pr){
  const st = proc(p.code, pr.code);
  if (st.execVersion === undefined || st.execVersion === null){
    st.execVersion = S.version;
    st.execEmpreinte = empreinteSelection(p, pr);
  }
}
/** Un papier est périmé si la version a changé ET que sa population a bougé,
 *  ou s'il a été exécuté sur une version antérieure à celle du dossier. */
function peremption(p, pr){
  const st = proc(p.code, pr.code);
  if (st.execVersion === undefined || st.execVersion === null) return null;
  if (st.execVersion === S.version) return null;
  const emp = empreinteSelection(p, pr);
  return { de:st.execVersion, a:S.version, populationChangee:emp !== st.execEmpreinte };
}
