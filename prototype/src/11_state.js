/* ═══ 4. ÉQUIPE, HORLOGE, JOURNAL D'ÉVÉNEMENTS ═════════════════════════════
   L'horloge de mission est SIMULÉE et déterministe : elle part du 15/03/2026
   à 09:12 et avance de sept minutes à chaque événement. Recharger la page
   rejoue exactement la même chronologie — c'est la condition pour qu'un
   horodatage soit vérifiable dans un prototype sans base de données.
   ═══════════════════════════════════════════════════════════════════════ */
/* L'équipe. Le GRADE dit ce qu'on sait faire, le RÔLE ce qu'on a le droit de
   faire. La répartition proposée s'appuie sur le premier, les règles de visa
   sur le second. Deux seniors et deux superviseurs : sans cela, la question
   de l'équilibrage de charge ne se pose pas et la règle est décorative. */
const USERS = {
  hugo  : { nom:'Hugo Vasseur',    grade:'assistant',    role:'preparateur', cote:'audit' },
  karim : { nom:'Karim Benali',    grade:'senior',       role:'preparateur', cote:'audit' },
  ines  : { nom:'Inès Rodrigues',  grade:'senior',       role:'preparateur', cote:'audit' },
  lea   : { nom:'Léa Moreau',      grade:'superviseur',  role:'reviseur',    cote:'audit' },
  sonia : { nom:'Sonia Da Costa',  grade:'superviseur',  role:'reviseur',    cote:'audit' },
  claire: { nom:'Claire Fontaine', grade:'associée',     role:'associe',     cote:'audit' },
};
const ORDRE_GRADE = ['assistant', 'senior', 'superviseur', 'associée'];
const ROLE_LIB = { preparateur:'préparateur', reviseur:'réviseur', associe:'associé signataire' };
/** Seuls le réviseur et l'associé peuvent clore une note — et jamais la leur. */
function peutClore(uid, note){
  const u = USERS[uid];
  return !!u && (u.role === 'reviseur' || u.role === 'associe') && note.auteur !== uid;
}

let HORLOGE = '2026-03-15T09:12';
function tick(){
  const d = new Date(HORLOGE + ':00Z');
  d.setUTCMinutes(d.getUTCMinutes() + 7);
  HORLOGE = d.toISOString().slice(0, 16);
  return HORLOGE;
}
function horo(t){ return frDate(t.slice(0, 10)) + ' ' + t.slice(11, 16); }
/* ═══ 5. ÉTAT ══════════════════════════════════════════════════════════════
   Un seul objet d'état. Les seuils y sont la source unique de vérité ;
   chaque section de travail y a son propre casier.
   ═══════════════════════════════════════════════════════════════════════ */
const S = {
  espace:'auditeur',                        // auditeur | client | pilotage
  vue:'plan.programme',                     // identifiant de vue, ou 'fsli:<CODE>'
  moi:'karim',                              // auditeur connecté (espace auditeur)
  moiClient:'dmartin',                      // contact connecté (portail client)
  benchmark:'pbt', pctM:5, pctPM:75, pctCTT:5,
  scopingOverride:{},                       // code poste -> 'in' | 'out'
  scopingMotif:{},
  arMontant:null, arPct:10,                 // null = suit le seuil de planification
  jeCrit:{ rond:true, weekend:true, apres_cloture:true, direction:true, gros:true, sans_piece:true },
  jeParams:{}, jeCrees:[], jeModeles:[], jeCombi:{ mode:'auN', n:2, expr:'' },
  jeTout:false, jeErreur:'', jeSansAN:true,
  sections:{},                              // code poste -> casier de section (voir sec())
  requetes:[], seqReq:0,
  notes:[], seqNote:0,
  contacts:[], portail:null, cliTout:{},
  // registre des facteurs de risque : les candidats sont re-dérivés par les
  // règles, seule la DÉCISION humaine est conservée — bouger un seuil ne perd
  // jamais un arbitrage.
  seuilsFacteurs:{}, decisionsFacteurs:{}, facteursManuels:[], seqFacteurManuel:0,
  procOuverte:null, ctrTout:{}, filtres:{ statut:'', section:'', contact:'', echeance:'', q:'' },
  dest:{},        // destination courante par section
  replis:{},      // replis que l'auditeur a ouverts ou fermés lui-même
  selTrav:[], lotErreur:'', travaux:{}, filtreTrav:{ phase:'', nature:'', personne:'', statut:'', q:'' }, affErreur:'',
  resolutionsHors:{},
  version:2,   // version du fichier prise en compte ; la 3 est reçue et en attente
  impactDe:null, impactVers:null, balTout:false,
  achevement:{ calculs:{}, plaquette:{}, points:{}, concl:{},
               opinion:'', opinionMotif:'', raFinale:'', clos:null },
  envoi:{ cadence:'hebdo', jour:1, destinataires:[], perimetre:'client' },
  premierRendu:'2026-03-15T09:12',
  events:[],
  aujourdhui:'2026-03-15',                  // date de référence pour les relances
  dossierClos:false,
};

/** Journal d'événements : append-only, horodaté, jamais réécrit. */
function logEvent(quoi, objet, detail){
  S.events.push({ t:tick(), qui:S.espace === 'client' ? contactCourant().nom + ' (client)' : USERS[S.moi].nom,
                  quoi, objet, detail:detail || '' });
}

/* ── casier d'une section de travail ─────────────────────────────────────── */
function sec(code){
  if (!S.sections[code]) S.sections[code] = {
    code,
    ns:{},            // compte -> 'ns' | 'sig'  (surcharge du statut proposé)
    nsMotif:{},
    declares:{},      // code facteur déclaré -> true/false
    override:{},      // assertion -> niveau forcé par l'auditeur
    overrideMotif:{},
    seed:'otto-' + code.toLowerCase() + '-01',
    wp:null,          // papiers de travail (construits à la première ouverture)
    conclusion:'',
    visa:null,        // { par, t }
    reprisN1Vues:{},  // id papier N-1 -> true si reconfirmé
  };
  return S.sections[code];
}

/* ═══ 6. ASSERTIONS, FACTEURS DE RISQUE, PROCÉDURES ════════════════════════
   La chaîne que ce prototype doit rendre visible :
     facteurs (observés OU déclarés) → niveau de risque par assertion
       → liste des procédures requises → taille d'échantillon → couverture.
   Un questionnaire de risque qui ne commande rien est décoratif ; ici il
   commande, et l'écran le montre.
   ═══════════════════════════════════════════════════════════════════════ */
const ASSERTIONS = [
  { code:'realite',      lib:'Réalité',                    d:'les opérations enregistrées ont eu lieu' },
  { code:'exhaustivite', lib:'Exhaustivité',               d:'toutes les opérations sont enregistrées' },
  { code:'separation',   lib:'Séparation des exercices',   d:'les opérations sont rattachées au bon exercice' },
  { code:'evaluation',   lib:'Évaluation',                 d:'les montants sont correctement évalués' },
  { code:'presentation', lib:'Présentation',               d:'la ventilation et l’information sont correctes' },
];

/** Statistiques observées d'un poste — base des facteurs qui n'ont pas à être demandés. */
const _statCache = new Map();
function statsPoste(p){
  if (_statCache.has(p.code)) return _statCache.get(p.code);
  const re = p.re;
  const ecr = lg().entries.filter(e => e.lines.some(l => re.test(l.compte)));
  const mvt = e => e.lines.reduce((a, l) => a + (re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0);
  const st = {
    n:ecr.length,
    od:ecr.filter(e => e.journal === 'OD').length,
    direction:ecr.filter(e => /direction/.test(e.saisiePar)).length,
    tardives:ecr.filter(e => e.validDate > '2025-12-31').length,
    decembre:ecr.filter(e => e.date >= '2025-12-01').length,
    tiers:new Set(ecr.flatMap(e => e.lines.map(l => l.auxLib).filter(Boolean))).size,
    masse:ecr.reduce((a, e) => a + mvt(e), 0),
  };
  _statCache.set(p.code, st);
  return st;
}

/** Facteurs OBSERVÉS : calculés sur les données, jamais demandés à l'auditeur.
 *  Facteurs DÉCLARÉS : relèvent du jugement, l'auditeur répond lui-même. */
const FACTEURS = [
  { code:'variation', a:'realite', lib:'Variation N/N-1 supérieure au seuil de planification',
    obs:p => Math.abs(p.solde - p.soldeN1) >= seuils().PM,
    dit:p => `variation ${eur0(p.solde - p.soldeN1)} · seuil ${eur0(seuils().PM)}` },
  { code:'volume', a:'exhaustivite', lib:'Plus de 200 écritures sur l’exercice',
    obs:p => statsPoste(p).n > 200, dit:p => statsPoste(p).n + ' écritures' },
  { code:'manuel', a:'realite', lib:'Plus de 5 % d’écritures en journal d’opérations diverses',
    obs:p => statsPoste(p).n > 0 && statsPoste(p).od / statsPoste(p).n > 0.05,
    dit:p => statsPoste(p).od + ' OD sur ' + statsPoste(p).n },
  { code:'tardive', a:'separation', lib:'Écritures validées après la date de clôture',
    obs:p => statsPoste(p).tardives > 0, dit:p => statsPoste(p).tardives + ' écriture(s)' },
  { code:'concentration', a:'separation', lib:'Plus de 15 % des écritures concentrées en décembre',
    obs:p => statsPoste(p).n > 0 && statsPoste(p).decembre / statsPoste(p).n > 0.15,
    dit:p => statsPoste(p).decembre + ' écritures en décembre sur ' + statsPoste(p).n },
  { code:'estimation', a:'evaluation', lib:'Le poste comporte une estimation comptable', declare:true },
  { code:'fraude', a:'realite', lib:'Poste porteur d’un risque de fraude identifié', declare:true },
  { code:'ci_faible', a:'exhaustivite', lib:'Contrôle interne non testé ou jugé non fiable sur ce cycle', declare:true },
  { code:'complexe', a:'presentation', lib:'Règle de présentation ou d’annexe complexe sur ce poste', declare:true },
  { code:'litige', a:'evaluation', lib:'Poste exposé à un litige ou à une incertitude', declare:true },
];

/** Facteurs actifs d'un poste : les observés sont calculés, les déclarés sont lus dans le casier. */
function facteursActifs(p){
  const st = sec(p.code);
  const locaux = FACTEURS.map(f => ({ ...f,
    actif: f.declare ? !!st.declares[f.code] : !!f.obs(p),
    preuve: f.declare ? null : f.dit(p) }));
  // Les constatations venues d'ailleurs, CONFIRMÉES et retenues comme
  // majorantes, comptent comme des facteurs de la section : c'est là que la
  // circulation produit son effet, et pas seulement un affichage.
  const vus = new Set();
  for (const f of facteursRetenus(p.code)){
    for (const c of f.cibles.filter(x => x.fsli === p.code)){
      for (const a of c.assertions){
        const k = f.id + '|' + a;
        if (vus.has(k)) continue;
        vus.add(k);
        locaux.push({ code:'REG:' + k, a, lib:f.description, actif:true,
                      registre:true, facteur:f, preuve:f.source ? f.source.lib : 'saisi à la main' });
      }
    }
  }
  return locaux;
}
const NIVEAUX = ['faible', 'moyen', 'eleve'];
const NIV_LIB = { faible:'faible', moyen:'moyen', eleve:'élevé' };
/** Règle : 0 facteur → faible, 1 → moyen, 2 et plus → élevé. Surchargeable avec motif. */
function niveauCalcule(p, a){
  const n = facteursActifs(p).filter(f => f.a === a && f.actif).length;
  return n === 0 ? 'faible' : n === 1 ? 'moyen' : 'eleve';
}
function niveau(p, a){ return sec(p.code).override[a] || niveauCalcule(p, a); }
function niveauMax(p){
  return ASSERTIONS.reduce((m, a) => Math.max(m, NIVEAUX.indexOf(niveau(p, a.code))), 0);
}

/* ── étendue des travaux : elle suit l'assertion, pas le poste ─────────────
   Une procédure répond à UNE assertion. Lui appliquer le risque le plus élevé
   du poste revient à traiter la séparation des exercices comme l'exhaustivité
   sous prétexte qu'elles partagent un compte : sur le chiffre d'affaires, un
   test de cut-off recevait trente éléments alors que la séparation des
   exercices est évaluée « faible ». Les deux tables ci-dessous s'appliquent
   donc au niveau de risque de l'assertion TESTÉE, et une section porte des
   échantillons de tailles différentes — c'est la conséquence normale.       */
const TAILLE = { faible:6, moyen:15, eleve:30 };
/** Seuil de la strate exhaustive, en fraction du seuil de planification :
 *  plus le risque de l'assertion est élevé, plus le seuil descend, donc plus
 *  d'éléments sont couverts un par un. */
const STRATE = { faible:1, moyen:1 / 2, eleve:1 / 3 };
const STRATE_LIB = { faible:'seuil de planification', moyen:'moitié du seuil de planification',
                     eleve:'tiers du seuil de planification' };
function tailleEchantillon(p, pr){ return TAILLE[niveau(p, pr.a)]; }
function seuilStrate(p, pr){ return Math.round(seuils().PM * STRATE[niveau(p, pr.a)]); }

/* ═══ 8. NOTES DE REVUE ════════════════════════════════════════════════════
   Une note se pose SUR un objet. Il n'existe aucune note flottante : l'ancre
   est obligatoire à la construction, et cliquer la note ramène à l'objet.
   ═══════════════════════════════════════════════════════════════════════ */
const TYPES_NOTE = {
  bloq:{ lib:'à corriger (bloquante)', cls:'bloq', bloque:true },
  doc :{ lib:'à documenter',           cls:'doc',  bloque:false },
  q   :{ lib:'question',               cls:'q',    bloque:false },
  n1  :{ lib:'remarque pour N+1',      cls:'n1',   bloque:false },
};
/** Notes de l'exercice précédent : servent au repérage des récurrences. */
const NOTES_N1 = [
  { section:'CA',    type:'bloq', texte:'Séparation des exercices : deux factures de janvier N rattachées à N-1, extourne demandée.' },
  { section:'CA',    type:'doc',  texte:'Documenter le rapprochement du bon de livraison pour les ventes à installation différée.' },
  { section:'STOCKS',type:'doc',  texte:'Joindre la feuille d’inventaire physique signée par le responsable de site.' },
  { section:'FOURN', type:'q',    texte:'Pourquoi le solde du compte 401 auxiliaire « Énergie Rhône Sud » est-il débiteur ?' },
];
function ancre(section, objet, ref, lib){ return { section, objet, ref, lib }; }
function ajouterNote(type, anc, texte){
  const recurrente = NOTES_N1.some(n => n.section === anc.section && n.type === type);
  const n = { id:++S.seqNote, t:tick(), auteur:S.moi, type, ancre:anc, texte,
              reponses:[], clos:null, recurrente };
  S.notes.push(n);
  logEvent('note de revue créée', anc.lib, TYPES_NOTE[type].lib + (recurrente ? ' · récurrente N-1' : ''));
  return n;
}
function notesDe(section, objet, ref){
  return S.notes.filter(n => n.ancre.section === section
    && (objet === undefined || n.ancre.objet === objet)
    && (ref === undefined || String(n.ancre.ref) === String(ref)));
}
function notesBloquantesOuvertes(section){
  return S.notes.filter(n => !n.clos && TYPES_NOTE[n.type].bloque
    && (section === undefined || n.ancre.section === section));
}

/* ═══ 9. CONTACTS ET PARAMÉTRAGE DU PORTAIL ════════════════════════════════ */
function initPortail(){
  if (S.portail) return;
  S.portail = { cadence:5, escalade:10, samediOuvre:false, langue:'fr',
                adresse:'altiverre-fy2025@depot.otto.example' };
  S.contacts = [
    { id:'dmartin', nom:'Delphine Martin', fonction:'Directrice administrative et financière',
      mail:'d.martin@altiverre.example', societe:'Altiverre SAS', role:'referent_general',
      sections:['CA','CLIENTS','TRESO','FOURN'] },
    { id:'pnguyen', nom:'Paul Nguyen', fonction:'Chef comptable',
      mail:'p.nguyen@altiverre.example', societe:'Altiverre SAS', role:'contributeur',
      sections:['ACHATS','CHARGES_EXT','FISCAL','STOCKS'] },
    { id:'sbrun', nom:'Sophie Brun', fonction:'Responsable paie',
      mail:'s.brun@altiverre.example', societe:'Altiverre SAS', role:'contributeur',
      sections:['PERSONNEL','SOCIAL'] },
    { id:'jlefevre', nom:'Julien Lefèvre', fonction:'Expert-comptable',
      mail:'j.lefevre@cabinet-lefevre.example', societe:'Cabinet Lefèvre (expert-comptable)',
      role:'contributeur', sections:['IMMO_COR','IMMO_INC','AMORT','DETTES_FI','FINANCIER','CAPITAUX','PROV','AUTRES_PR'] },
  ];
}
const ROLES_CLIENT = { referent_general:'référent de la mission', contributeur:'contributeur' };
function contactCourant(){ return S.contacts.find(c => c.id === S.moiClient) || S.contacts[0]; }
/** Référent d'une section : le contact qui en répond ; à défaut, le référent général. */
function referentSection(code){
  return S.contacts.find(c => c.sections.includes(code))
      || S.contacts.find(c => c.role === 'referent_general') || S.contacts[0];
}

/* ═══ 10. REQUÊTES ═════════════════════════════════════════════════════════
   Statuts, mot pour mot ceux du document d'idées. « en attente de revue
   par X » est un statut INTERNE : il n'apparaît jamais côté client.
   ═══════════════════════════════════════════════════════════════════════ */
const STATUTS = {
  non_recu:      { lib:'non reçu',                cls:'bad',  client:true  },
  partiel:       { lib:'partiellement soumis',    cls:'warn', client:true  },
  depose:        { lib:'tout est déposé',         cls:'',     client:true  },
  traitement:    { lib:'en cours de traitement',  cls:'',     client:true  },
  attente_revue: { lib:'en attente de revue par', cls:'',     client:false },
};
/** Ce que le client a le droit de lire. Un statut interne est replié sur le
 *  dernier statut visible : le client ne doit pas déduire l'avancement du dossier. */
function statutVisibleClient(it){
  return STATUTS[it.statut].client ? it.statut : 'traitement';
}
function creerRequete(section, titre, items, echeanceJ){
  const r = { id:'R' + String(++S.seqReq).padStart(3, '0'), section, titre,
              echeance:addDays(S.aujourdhui, echeanceJ === undefined ? 12 : echeanceJ),
              contact:referentSection(section).id, clotureClient:false, messages:[],
              items:items.map((d, i) => ({ id:i + 1, desc:typeof d === 'string' ? d : d.desc,
                                           ref:typeof d === 'string' ? null : d.ref,
                                           statut:'non_recu', revoyeur:null, depots:[] })),
              cree:tick(), origine:null };
  S.requetes.push(r);
  logEvent('requête créée', r.id + ' — ' + titre, section + ' · ' + r.items.length + ' élément(s)');
  return r;
}
function avancement(items){
  const poids = { non_recu:0, partiel:.5, depose:.8, traitement:.9, attente_revue:1 };
  return items.length ? items.reduce((a, i) => a + poids[i.statut], 0) / items.length : 0;
}
function requetesDe(code){ return S.requetes.filter(r => r.section === code); }
function retard(r){
  return !r.clotureClient && r.echeance < S.aujourdhui && r.items.some(i => i.statut === 'non_recu' || i.statut === 'partiel');
}
function ancienneteRetard(r){
  if (!retard(r)) return 0;
  let n = 0, d = r.echeance;
  while (d < S.aujourdhui){ d = addDays(d, 1); if (!isWeekend(d) || S.portail.samediOuvre) n++; }
  return n;
}
