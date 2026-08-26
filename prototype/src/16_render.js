/* ═══ 18. NAVIGATION ═══════════════════════════════════════════════════════
   Trois espaces. Dans l'espace auditeur, deux groupes : la planification
   transverse, puis UNE SECTION PAR POSTE RETENU AU SCOPING. Le rail suit le
   travail — il n'y a plus de liste de fonctions.
   ═══════════════════════════════════════════════════════════════════════ */
/* Trois espaces = trois AUDIENCES, avec des droits distincts. L'achèvement
   n'est pas une audience mais une PHASE : en faire un espace mélangeait deux
   axes — la preuve étant que la planification, phase elle aussi, vivait déjà
   dans l'espace auditeur. L'espace auditeur porte donc le dossier entier,
   ordonné par phase. */
const ESPACES = [
  { id:'auditeur', lib:'Espace auditeur', defaut:'plan.programme' },
  { id:'client',   lib:'Portail client',  defaut:'cli.vue' },
  { id:'pilotage', lib:'Pilotage',        defaut:'pil.mission' },
];
const DOSSIER = [
  { id:'plan.programme', lib:'Programme de travail' },
  { id:'plan.donnees',   lib:'Jeu de données' },
  { id:'plan.principes', lib:'Principes de conception' },
];
const TRANSVERSES = [
  { id:'plan.equipe',  lib:'Équipe et indépendance' },
  { id:'plan.versions',lib:'Versions du fichier' },
  { id:'plan.ajust',   lib:'Ajustements et retraitements' },
  { id:'plan.rappro',  lib:'Import et rapprochement' },
  { id:'plan.mat',     lib:'Matérialité' },
  { id:'plan.scope',   lib:'Scoping des postes' },
  { id:'plan.ra',      lib:'Revue analytique préliminaire' },
  { id:'plan.facteurs',lib:'Facteurs de risque' },
  { id:'plan.secteur', lib:'Analyse sectorielle',      lot2:true },
  { id:'plan.parties', lib:'Parties liées',            lot2:true },
  { id:'plan.lcbft',   lib:'LCB-FT et bénéficiaires',  lot2:true },
  { id:'plan.je',      lib:'Test des écritures' },
  { id:'plan.circ',    lib:'Circularisations' },
  { id:'plan.synth',   lib:'Synthèse des anomalies' },
  { id:'plan.piste',   lib:'Piste d’audit' },
];
const ACHEVEMENT = [
  { id:'ach.pointage', lib:'Pointage des états financiers' },
  { id:'ach.ra',       lib:'Revue analytique finale' },
  { id:'ach.evenements',lib:'Événements postérieurs' },
  { id:'ach.continuite',lib:'Continuité d’exploitation' },
  { id:'ach.anomalies',lib:'Anomalies non corrigées et opinion' },
  { id:'ach.affirmation',lib:'Lettre d’affirmation' },
  { id:'ach.gouvernance',lib:'Communication à la gouvernance' },
  { id:'ach.cloture',  lib:'Assemblage et clôture du dossier' },
];
const VUES_CLIENT = [
  { id:'cli.vue',      lib:'Vue client — les demandes' },
  { id:'cli.contacts', lib:'Contacts de la mission' },
  { id:'cli.params',   lib:'Paramétrage du portail' },
];
const VUES_PILOTAGE = [
  { id:'pil.mission',  lib:'Vue globale de la mission' },
  { id:'pil.avance',   lib:'Avancement et demandes' },
  { id:'pil.requetes', lib:'Requêtes — toutes sections' },
  { id:'pil.notes',    lib:'Notes de revue — transverse' },
  { id:'pil.export',   lib:'Exports et envoi' },
];

/** Le rail de l'espace auditeur suit les PHASES du dossier. */
function railItems(){
  if (S.espace === 'client')   return [{ grp:'Portail', items:VUES_CLIENT }];
  if (S.espace === 'pilotage') return [{ grp:'Pilotage', items:VUES_PILOTAGE }];
  const g = m => postesDeMasse(m).map(p => ({ id:'fsli:' + p.code, lib:p.lib, poste:p,
                                              second:masseDe(p) !== m }));
  const nCI = travaux().filter(t => t.nature === 'controle_interne').length;
  return [
    { grp:'Dossier', items:DOSSIER },
    { grp:'1 · Planification', items:TRANSVERSES },
    { grp:'2 · Contrôle interne', items:nCI ? [] : [{ id:'plan.ci', lib:'Revues de processus', lot2:true }] },
    { grp:'3 · Bilan — ' + postesDeMasse('bilan').length + ' poste(s)', items:g('bilan') },
    { grp:'4 · Compte de résultat — ' + postesDeMasse('resultat').length + ' poste(s)', items:g('resultat') },
    { grp:'5 · Achèvement', items:ACHEVEMENT },
  ];
}
function badgeRail(it){
  if (it.lot2) return '<span class="b warn">lot 2</span>';
  if (it.id === 'plan.facteurs'){
    const n = registre().filter(f => f.statut === 'propose').length;
    return n ? `<span class="b bad">${n}</span>` : '<span class="b ok">0</span>';
  }
  if (it.id === 'plan.programme'){
    const n = travaux().filter(t => !t.preparateur || !t.reviseur).length;
    return n ? `<span class="b bad">${n}</span>` : '<span class="b ok">0</span>';
  }
  if (!it.poste) return '';
  const p = it.poste, st = sec(p.code);
  if (it.second) return '<span class="b">aussi</span>';
  if (st.visa) return '<span class="b ok">visée</span>';
  const bl = notesBloquantesOuvertes(p.code).length;
  if (bl) return `<span class="b bad">${bl} ⚑</span>`;
  const o = obstaclesVisa(p).length;
  return `<span class="b">${o}</span>`;
}
function renderRail(){
  const html = railItems().map(g => `<div class="grp">${esc(g.grp)}</div>` +
    g.items.map(it => `<a data-vue="${it.id}" class="${S.vue === it.id ? 'on' : ''}">
        <span class="t">${esc(it.lib)}</span>${badgeRail(it)}</a>`).join('')).join('');
  document.getElementById('rail').innerHTML = html;
  const opts = railItems().map(g => `<optgroup label="${esc(g.grp)}">` +
    g.items.map(it => `<option value="${it.id}" ${S.vue === it.id ? 'selected' : ''}>${esc(it.lib)}</option>`).join('') +
    '</optgroup>').join('');
  return `<div class="railm"><div class="ctrl"><label>Section</label>
    <select id="railm">${opts}</select></div></div>`;
}

/* ═══ 19. CHROME ═══════════════════════════════════════════════════════════ */
function renderBrand(){
  // un identifiant d'espace inconnu ne doit pas faire tomber le chrome
  if (!ESPACES.some(x => x.id === S.espace)) S.espace = 'auditeur';
  const e = ESPACES.find(x => x.id === S.espace);
  const qui = S.espace === 'client'
    ? `<select id="whoclient" class="cell txt" style="width:auto;border-color:var(--line)">
         ${S.contacts.map(c => `<option value="${c.id}" ${c.id === S.moiClient ? 'selected' : ''}>${esc(c.nom)} — ${esc(ROLES_CLIENT[c.role])}</option>`).join('')}</select>`
    : `<select id="whoaud" class="cell txt" style="width:auto;border-color:var(--line)">
         ${Object.entries(USERS).map(([k, u]) => `<option value="${k}" ${k === S.moi ? 'selected' : ''}>${esc(u.nom)} — ${esc(ROLE_LIB[u.role])}</option>`).join('')}</select>`;
  document.getElementById('brand').innerHTML = `
    <span class="esp">${esc(e.lib)}</span>
    <b>Altiverre SAS</b>
    <span>SIREN 999${NBSP}888${NBSP}777 (fictif)</span>
    <span>exercice du 01/01/2025 au 31/12/2025</span>
    ${S.espace === 'client' ? '' : '<span class="pill">audit légal · NEP</span>'}
    <span class="pill">prototype déterministe — aucun appel modèle</span>`;
  document.getElementById('spaces').innerHTML = ESPACES.map(x =>
    `<button data-espace="${x.id}" class="${x.id === S.espace ? 'on' : ''}">${esc(x.lib)}</button>`).join('')
    + '<span class="qui">' + qui + '</span>';
  document.body.dataset.espace = S.espace;
}

/** Les seuils ne sont construits QUE dans l'espace auditeur : le portail client
 *  n'a pas de bandeau à masquer, il n'en a pas. */
function renderTopExtra(){
  const box = document.getElementById('topextra');
  if (S.espace !== 'auditeur'){ box.innerHTML = ''; return; }
  if (!document.getElementById('seuils')){
    box.innerHTML = '<div class="seuils" id="seuils"></div><div class="seuilbox" id="seuilbox"></div><div class="impact" id="impact"></div>';
    buildSeuils();
  }
  renderSeuils(); renderImpact();
}
/* Les curseurs sont construits UNE SEULE FOIS. Les reconstruire à chaque
   événement « input » détruirait l'élément en cours de glissement : au doigt,
   le drag s'arrêterait au premier mouvement. Seuls les libellés sont réécrits. */
function buildSeuils(){
  document.getElementById('seuils').innerHTML = `
    <div class="ctrl"><label>Référence de matérialité</label>
      <select id="bm">${Object.values(bm()).map(b => `<option value="${b.code}" ${b.code === S.benchmark ? 'selected' : ''}>${esc(b.lib)} — ${eur0(b.val)}</option>`).join('')}</select></div>
    <div class="ctrl"><label>Taux : <b id="lab-pm"></b></label>
      <input type="range" id="pm" min="0.5" max="10" step="0.1" value="${S.pctM}"></div>
    <div class="ctrl"><label>Seuil de planification : <b id="lab-ppm"></b> du seuil</label>
      <input type="range" id="ppm" min="50" max="90" step="5" value="${S.pctPM}"></div>
    <div class="ctrl"><label>Seuil de remontée : <b id="lab-pctt"></b> du seuil</label>
      <input type="range" id="pctt" min="1" max="10" step="1" value="${S.pctCTT}"></div>`;
}
function renderSeuils(){
  // le bandeau n'existe QUE dans l'espace auditeur : appelé depuis le portail
  // client, ce rendu n'a rien à écrire — et ne doit pas faire tomber la page.
  if (!document.getElementById('seuilbox')) return;
  const s = seuils();
  document.getElementById('lab-pm').textContent   = pct(S.pctM / 100, 1);
  document.getElementById('lab-ppm').textContent  = S.pctPM + NBSP + '%';
  document.getElementById('lab-pctt').textContent = S.pctCTT + NBSP + '%';
  const pmEl = document.getElementById('pm');
  if (parseFloat(pmEl.value) !== S.pctM) pmEl.value = S.pctM;
  document.getElementById('seuilbox').innerHTML = `
    <div class="s ref"><div class="k">Référence</div><div class="v">${eur0(s.bench.val)}</div><div class="d">${esc(s.bench.lib)}</div></div>
    <div class="s"><div class="k">Seuil de signification</div><div class="v">${eur0(s.M)}</div><div class="d">${pct(S.pctM / 100, 1)} · brut ${eur0(s.brut)}</div></div>
    <div class="s"><div class="k">Seuil de planification</div><div class="v">${eur0(s.PM)}</div><div class="d">${S.pctPM}${NBSP}% du seuil</div></div>
    <div class="s"><div class="k">Seuil de remontée</div><div class="v">${eur0(s.CTT)}</div><div class="d">${S.pctCTT}${NBSP}% du seuil</div></div>`;
}
let lastImpact = {};
function renderImpact(){
  if (!document.getElementById('impact')) return;   // idem : absent du portail client
  /* Dans une section, le bandeau collant porte l'état de CETTE section — le
     reste de la mission n'y apprend rien. La hauteur collante est la même :
     ce sont les mêmes cellules, pas une bande de plus. */
  if (S.vue.startsWith('fsli:')){
    const p = postesCalcules().find(x => x.code === S.vue.slice(5));
    if (p) return peindreImpact(cellulesSection(p));
  }
  const s = seuils(), postes = postesEnPerimetre();
  let procs = 0, sel = 0, couvert = 0, total = 0;
  for (const p of postes){
    const prs = proceduresRequises(p);
    procs += prs.length;
    for (const pr of prs){
      const e = echantillonProc(p, pr);
      if (!e) continue;
      sel += e.retenus.length; couvert += e.couvert; total += e.pop.masse;
    }
  }
  const a = anomalies(), nc = a.filter(x => !x.souSeuil).reduce((t, x) => t + x.montant, 0);
  const cells = {
    'sections de travail':                       [postes.length + '/' + postesCalcules().length, 'sections', true],
    'procédures requises':                       [String(procs),                                 'procédures'],
    'éléments sélectionnés':                     [String(sel),                                   'éléments'],
    'couverture des sélections':                 [pct(total ? couvert / total : 0, 1),           'couverture'],
    'facteurs de risque à statuer':              [String(registre().filter(f => f.statut === 'propose').length), 'facteurs'],
    'requêtes en retard':                        [String(S.requetes.filter(retard).length),      'retards'],
    'notes bloquantes ouvertes':                 [String(notesBloquantesOuvertes().length),      'bloquantes', true],
    'cumul non corrigé':                         [eur0(nc),                                      'cumul'],
    'conclusion':                                [Math.abs(nc) > s.M ? 'au-dessus du seuil' : 'sous le seuil', 'conclusion', true],
  };
  peindreImpact(cells);
}
/** Peint les compteurs. Le troisième élément d'une cellule la marque
 *  ESSENTIELLE : c'est elle, et elle seule, qui survit au bandeau réduit. */
function peindreImpact(cells){
  document.getElementById('impact').innerHTML = Object.entries(cells).map(([k, [v, court, essentiel]]) =>
    `<div class="c ${lastImpact[k] !== undefined && lastImpact[k] !== v ? 'flash' : ''}"${essentiel ? ` data-cle="1"` : ''}>`
    + `<div class="k"><span class="lg">${k}</span><span class="sm">${court}</span></div>`
    + `<div class="v" data-k="${esc(court)}">${v}</div></div>`).join('');
  lastImpact = Object.fromEntries(Object.entries(cells).map(([k, [v]]) => [k, v]));
}

/* ── réduction du bandeau au défilement ────────────────────────────────────
   Le bandeau est dans le flux : le réduire raccourcit le document et le
   contenu remonterait d'autant sous les yeux. On compense le défilement de la
   différence de hauteur, sinon la page saute à chaque bascule. */
let _bandeauReduit = false, _dernierY = 0, _bandeauTick = false;
const BANDEAU_DECLENCHE = 48;   // px de défilement avant réduction
const BANDEAU_REMONTE = 24;     // px de remontée avant rétablissement
function majBandeau(){
  _bandeauTick = false;
  const top = document.querySelector('.top');
  if (!top) return;
  const y = window.scrollY;
  let cible = _bandeauReduit;
  if (y <= BANDEAU_DECLENCHE) cible = false;
  else if (y > _dernierY) cible = true;
  else if (y < _dernierY - BANDEAU_REMONTE) cible = false;
  if (cible !== _bandeauReduit){
    const av = top.getBoundingClientRect().height;
    document.documentElement.dataset.bandeau = cible ? 'reduit' : '';
    _bandeauReduit = cible;
    const ap = top.getBoundingClientRect().height;
    syncTopHeight();
    const d = Math.round(av - ap);
    if (d && y > 0){ window.scrollTo(0, Math.max(0, y - d)); _dernierY = Math.max(0, y - d); return; }
  }
  _dernierY = y;
}
window.addEventListener('scroll', () => {
  if (_bandeauTick) return;
  _bandeauTick = true;
  requestAnimationFrame(majBandeau);
}, { passive:true });

/* ═══ 20. RENDU PRINCIPAL ══════════════════════════════════════════════════ */
function contenu(){
  _refSeq = {}; _panSeq = 0;        // références de papier et panneaux repartent à chaque vue
  const v = S.vue;
  if (VUES_PANNEAUX.has(v)) return barreReplis(v) + contenuVue(v);
  return contenuVue(v);
}
function contenuVue(v){
  if (v.startsWith('fsli:')) return vueFsli(v.slice(5));
  if (LOT2[v]) return vueLot2(v);
  switch (v){
    case 'plan.rappro': return vueRappro();
    case 'plan.mat':    return vueMaterialite();
    case 'plan.scope':  return vueScoping();
    case 'plan.ra':     return vueRAPrelim();
    case 'plan.facteurs': return vueFacteurs();
    case 'plan.equipe': return vueEquipe();
    case 'plan.versions': return vueVersions();
    case 'plan.ajust':  return vueAjustements();
    case 'plan.donnees': return vueJeuDonnees();
    case 'plan.programme': return vueProgramme();
    case 'plan.principes': return vuePrincipes();
    case 'plan.ci':     return vueCI();
    case 'pil.mission': return vueMission();
    case 'plan.je':     return vueJE();
    case 'plan.circ':   return vueCirc();
    case 'plan.synth':  return vueSynthese();
    case 'plan.piste':  return vuePiste();
    case 'plan.ia':     return vueIA();
    case 'ach.pointage':   return vueAchPointage();
    case 'ach.ra':         return vueAchRA();
    case 'ach.evenements': return vueAchSimple('evenements');
    case 'ach.continuite': return vueAchSimple('continuite');
    case 'ach.anomalies':  return vueAchAnomalies();
    case 'ach.affirmation':return vueAchSimple('affirmation');
    case 'ach.gouvernance':return vueAchSimple('gouvernance');
    case 'ach.cloture':    return vueAchCloture();
    case 'cli.vue':      return vueClientDemandes();
    case 'cli.contacts': return vueClientContacts();
    case 'cli.params':   return vueClientParams();
    case 'pil.avance':  return vuePilotage();
    case 'pil.requetes':return vueRequetes();
    case 'pil.notes':   return vueNotes();
    case 'pil.export':  return vueExports();
  }
  return '<p class="note">Vue inconnue.</p>';
}
/** Mémorise le champ actif pour le rendre après reconstruction du DOM. */
function focusKey(){
  const el = document.activeElement;
  if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return null;
  const pos = el.selectionStart;
  if (el.id) return { sel:'#' + el.id, pos };
  const ds = [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => `[${a.name}="${a.value}"]`).join('');
  return ds ? { sel:el.tagName.toLowerCase() + ds, pos } : null;
}
function focusRestore(k){
  if (!k) return;
  const el = document.querySelector(k.sel);
  if (!el) return;
  el.focus();
  try { if (k.pos !== null && el.setSelectionRange) el.setSelectionRange(k.pos, k.pos); } catch (e) {}
}
function renderMain(){
  const k = focusKey();
  const main = document.getElementById('main');
  main.innerHTML = renderRail() + contenu();
  focusRestore(k);
}
function render(){
  renderBrand(); renderTopExtra(); renderMain(); syncTopHeight();
}
/** Rendu différé pour la saisie au clavier : l'état est mis à jour tout de
 *  suite, l'écran se recompose une fois la frappe retombée. Sans cela, chaque
 *  touche redessine une section de plus de cent lignes et la saisie accroche. */
/** Pendant le glissement d'un curseur, les seuils et le bandeau se recalculent
 *  immédiatement (3 ms) ; le rendu de la section, plus lourd, est ramené à un
 *  par image d'écran au lieu de s'empiler derrière chaque événement. */
let _raf = null;
function renderMainRaf(){
  if (_raf) return;
  _raf = requestAnimationFrame(() => { _raf = null; renderMain(); });
}
let _deb = null;
function renderMainDiff(){
  clearTimeout(_deb);
  _deb = setTimeout(() => { renderImpact(); renderMain(); }, 220);
}
/** Hauteur réelle de la barre collante → décalage des ancres de navigation. */
function syncTopHeight(){
  const h = Math.round(document.querySelector('.top').getBoundingClientRect().height);
  document.documentElement.style.setProperty('--topH', h + 'px');
}

function aller(vue, espace){
  if (espace && espace !== S.espace) S.espace = espace;
  S.vue = vue; S.noteCible = null;
  render();
  const m = document.getElementById('main');
  if (m) m.scrollIntoView({ block:'start' });
}
/** Ouvre la section d'un poste, depuis n'importe où. */
function ouvrirSection(code){ aller('fsli:' + code, 'auditeur'); }

/* ═══ 21. ENCHAÎNEMENT ═════════════════════════════════════════════════════
   Règle → requête DANS la section → portail client → dépôt → papier de
   travail de la même section → écart → synthèse. Chaque maillon est ici.
   ═══════════════════════════════════════════════════════════════════════ */
function requeteJustificatifsProc(p, pr){
  const e = echantillonProc(p, pr); if (!e) return null;
  const cat = catalogue(p, pr), docs = docsAttendusProc(p, pr);
  const items = e.retenus.map(x => ({
    desc:`${pr.tiers ? 'Tiers' : 'Écriture'} ${x.cle}${x.e ? ' — pièce ' + x.e.pieceRef : ''}`
       + `${x.e ? ' du ' + frDate(x.e.date) : ''} (${eur(x.montant)}) — à fournir : ${docs.join(' + ')}`,
    ref:x.cle }));
  const r = creerRequete(p.code, 'Justificatifs — ' + pr.lib, items, 12);
  r.proc = pr.code;
  r.origine = 'catalogue de preuve';
  // ce que le client doit trouver sur chaque document : rédigé par le catalogue
  r.detail = cat ? cat.map(d => d.doc + ' — ' + d.champs.map(c => c.lib.toLowerCase()).join(', ')).join(' ; ') : '';
  return r;
}
function requeteVariation(p, compte, l){
  const r = creerRequete(p.code, 'Explication de variation — compte ' + compte, [{
    desc:`Le compte ${compte} « ${l.lib} » passe de ${eur(l.n1)} au 31/12/2024 à ${eur(l.n)} au 31/12/2025, `
       + `soit ${eur(l.d)}${l.pr === null ? '' : ' (' + pct(l.pr, 1) + ')'}. Merci d’en indiquer l’explication et `
       + `de préciser les éléments justificatifs disponibles.`, ref:compte }], 10);
  r.origine = 'revue analytique substantive';
  return r;
}
/** Dépôt d'une pièce par le client : il rend testable la ligne du papier de
 *  travail de LA PROCÉDURE qui a demandé la pièce. */
function deposer(reqId, itemId){
  const r = S.requetes.find(x => x.id === reqId); if (!r) return;
  const it = r.items.find(i => i.id === itemId); if (!it) return;
  const p = postesCalcules().find(x => x.code === r.section);
  const pr = r.proc ? PROCEDURES.find(x => x.code === r.proc) : null;
  const docs = (p && pr && docsAttendusProc(p, pr).length) ? docsAttendusProc(p, pr) : ['pièce justificative'];
  const doc = docs[Math.min(it.depots.length, docs.length - 1)];
  const base = it.ref ? String(it.ref).replace(/[^\w-]+/g, '') : r.id;
  const nom = base + '_' + doc.toLowerCase().replace(/[^a-zà-ÿ0-9]+/gi, '-').replace(/^-|-$/g, '') + '.pdf';
  it.depots.push({ nom, doc, t:tick(), par:contactCourant().nom });
  it.statut = it.depots.length >= docs.length ? 'depose' : 'partiel';
  logEvent('pièce déposée', r.id + ' · ' + nom, contactCourant().nom);
  /* Aucun drapeau n'est posé sur le papier de travail : la ligne devient
     testable parce que le dépôt existe, et le papier le lit. Une case
     « pièce reçue » aurait pu être cochée sans qu'aucune pièce n'arrive. */
}

/* ═══ 23. INTERACTIONS ═════════════════════════════════════════════════════ */
function posteCourant(){ return S.vue.startsWith('fsli:') ? postesCalcules().find(p => p.code === S.vue.slice(5)) : null; }
/** Retrouve une résolution d'écart depuis la clé portée par l'écran.
 *  Deux formes, un seul casier : « POSTE#PROC#élément|document|champ » pour un
 *  écart de papier de travail, « hors#référence » pour un écart né ailleurs
 *  (rapprochement, test des écritures). L'écran n'a pas à savoir laquelle. */
function resolDeCle(k){
  const s = String(k);
  if (s.startsWith('hors#')){
    const ref = s.slice(5), a = anomalies().find(x => x.cleRes === s);
    return a ? { r:resolHors(ref), constate:a.constate, lib:a.lib } : null;
  }
  const parts = s.split('#');
  if (parts.length < 3) return null;
  const p = postesCalcules().find(x => x.code === parts[0]);
  const pr = PROCEDURES.find(x => x.code === parts[1]);
  if (!p || !pr) return null;
  const cle = parts.slice(2).join('#');
  const c = controles(p, pr).find(x => x.cle === cle);
  return c ? { r:resol(c), constate:-c.ecart, lib:c.doc + ' — ' + c.ligne.cle } : null;
}

document.addEventListener('input', e => {
  const t = e.target, d = t.dataset, p = posteCourant();
  if (t.id === 'bm'){ S.benchmark = t.value; S.pctM = bm()[t.value].defaut; return render(); }
  if (t.id === 'pm'){ S.pctM = parseFloat(t.value); renderSeuils(); renderImpact(); return renderMainRaf(); }
  if (t.id === 'ppm'){ S.pctPM = parseInt(t.value, 10); renderSeuils(); renderImpact(); return renderMainRaf(); }
  if (t.id === 'pctt'){ S.pctCTT = parseInt(t.value, 10); renderSeuils(); renderImpact(); return renderMainRaf(); }
  if (d.pseed !== undefined && p){ proc(p.code, d.pseed).seed = t.value; proc(p.code, d.pseed).wp = null; return; }
  if (d.pconcl !== undefined && p){ proc(p.code, d.pconcl).conclusion = t.value;
    marquerExecution(p, PROCEDURES.find(x => x.code === d.pconcl)); return renderMainDiff(); }
  if (d.ctr !== undefined && p){
    const pr = PROCEDURES.find(x => x.code === d.pcode);
    const wp = wpProc(p, pr) || [];
    const cle = String(d.ctr).split('|')[0];
    const l = wp.find(x => String(x.cle) === cle);
    if (l){ l.champs[d.ctr] = t.value; marquerExecution(p, pr); }
    return renderMainDiff();
  }
  /* Équipe et indépendance */
  if (d.sauve !== undefined){ S.independance.sauvegardes[d.sauve] = t.value; return renderMainDiff(); }
  if (d.declp !== undefined){
    const dc = declarationCourante(S.moi); if (dc && !dc.signee) dc.precisions[d.declp] = t.value;
    return renderMainDiff();
  }
  if (d.mem !== undefined){
    const [uid, champ] = d.mem.split('|');
    if (champ === 'mail' || champ === 'exercices'){ majMembre(uid, champ, t.value); return renderMainDiff(); }
    return;
  }
  if (t.id === 'hon-mission'){ S.honorairesMission = eurCents(t.value); return renderMainDiff(); }
  if (t.id === 'sacc-plaf' || t.id === 'ind-plaf'){ S.plafondSacc = Math.max(0, parseFloat(t.value.replace(',', '.')) || 0); return renderMainDiff(); }
  if (t.id === 'ind-rot'){ S.independance.rotationSignataire = Math.max(0, parseInt(t.value, 10) || 0); return renderMainDiff(); }
  if (t.id === 'ind-fam'){ S.independance.seuilFamiliarite = Math.max(0, parseInt(t.value, 10) || 0); return renderMainDiff(); }
  if (t.id === 'ind-cad'){ S.independance.seuilCadeau = eurCents(t.value); return renderMainDiff(); }
  if (d.rexpl !== undefined){ const x = resolDeCle(d.rexpl); if (x) x.r.expl = t.value; return renderMainDiff(); }
  if (d.rconcl !== undefined){ const x = resolDeCle(d.rconcl); if (x) x.r.concl = t.value; return renderMainDiff(); }
  if (d.recr !== undefined){ const x = resolDeCle(d.recr); if (x) x.r.corrobEcriture = t.value; return renderMainDiff(); }
  if (d.rmont !== undefined){
    const x = resolDeCle(d.rmont);
    if (x) x.r.explique = Math.round((parseFloat(String(t.value).replace(/\s/g, '').replace(',', '.')) || 0) * 100);
    return renderMainDiff();
  }
  if (d.ptaille !== undefined && p){
    const v = parseInt(t.value, 10);
    const pr = PROCEDURES.find(x => x.code === d.ptaille);
    proc(p.code, d.ptaille).taille = v > 0 && v !== tailleEchantillon(p, pr) ? v : null;
    _echProcCache.clear();
    return renderMainDiff();
  }
  if (t.id === 'ar-montant'){ S.arMontant = Math.round((parseFloat(t.value) || 0) * 100); return renderMainDiff(); }
  if (t.id === 'ar-pct'){ S.arPct = parseFloat(t.value) || 0; return renderMainDiff(); }
  if (t.id === 'sec-concl' && p){ sec(p.code).conclusion = t.value; return renderMainDiff(); }
  if (t.id === 'pp-adr'){ S.portail.adresse = t.value; return; }
  if (d.jep !== undefined){
    const [code, pcode, type] = d.jep.split('|');
    S.jeParams[code] = S.jeParams[code] || {};
    S.jeParams[code][pcode] = type === 'euros'
      ? Math.round((parseFloat(String(t.value).replace(/\s/g, '').replace(',', '.')) || 0) * 100)
      : type === 'entier' || type === 'heure' ? (parseInt(t.value, 10) || 0) : t.value;
    _entCache.clear();
    return renderMainDiff();
  }
  if (t.id === 'je-n'){ S.jeCombi = { ...combiJE(), n:Math.max(1, parseInt(t.value, 10) || 1) }; _entCache.clear(); return renderMainDiff(); }
  if (t.id === 'je-expr'){ S.jeCombi = { ...combiJE(), expr:t.value }; _entCache.clear(); return renderMainDiff(); }
  if (t.id === 'f-q'){ S.filtres.q = t.value; return renderMainDiff(); }
  if (t.id === 'ft-q'){ S.filtreTrav.q = t.value; return renderMainDiff(); }
  const hrs = v => Math.max(0, Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 4) / 4);
  if (d.hb !== undefined){ trav(d.hb).heuresBudget = t.value.trim() === '' ? null : hrs(t.value); return renderMainDiff(); }
  if (d.tech !== undefined){ fixerEcheance(d.tech, t.value); return renderMainDiff(); }
  if (t.id === 'tv-lotech' && t.value){
    const r = fixerEcheanceEnLot(S.selTrav, t.value);
    S.travErreur = r.n ? '' : 'aucun travail sélectionné';
    return renderMain();
  }
  if (d.jalon !== undefined){ const r = fixerJalon(d.jalon, t.value); S.travErreur = r.ok ? '' : r.why; return renderMain(); }
  if (d.hr !== undefined){ trav(d.hr).heuresReel = hrs(t.value); return renderMainDiff(); }
  const cts = v => Math.round((parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0) * 100);
  if (d.plaq !== undefined){ S.achevement.plaquette[d.plaq] = t.value.trim() === '' ? undefined : cts(t.value); return renderMainDiff(); }
  if (d.calcm !== undefined){ const c = S.achevement.calculs[d.calcm] = S.achevement.calculs[d.calcm] || {};
    c.montant = t.value.trim() === '' ? undefined : cts(t.value); return renderMainDiff(); }
  if (d.calcd !== undefined){ const c = S.achevement.calculs[d.calcd] = S.achevement.calculs[d.calcd] || {};
    c.doc = t.value; return renderMainDiff(); }
  if (t.id === 'ach-ra'){ S.achevement.raFinale = t.value; return renderMainDiff(); }
  if (t.id === 'ach-opm'){ S.achevement.opinionMotif = t.value; return renderMainDiff(); }
  if (d.achc !== undefined){ S.achevement.concl[d.achc] = t.value; return renderMainDiff(); }
  if (d.fseuil !== undefined){ S.seuilsFacteurs[d.fseuil] = parseFloat(t.value) || 0; return renderMainDiff(); }
  if (d.scopem !== undefined){ S.scopingMotif[d.scopem] = t.value; return renderMainDiff(); }
  if (d.nsm !== undefined && p){ sec(p.code).nsMotif[d.nsm] = t.value; return renderMainDiff(); }
  if (d.nivm !== undefined && p){ sec(p.code).overrideMotif[d.nivm] = t.value; return renderMainDiff(); }
});

/* `toggle` ne se propage pas : on l'écoute en capture. Ouvrir ou fermer un
   repli ne redessine rien — le navigateur s'en charge — on retient seulement
   la décision, qui l'emportera sur la règle au prochain rendu. */
document.addEventListener('toggle', e => {
  const el = e.target;
  if (el && el.dataset && el.dataset.repli !== undefined) S.replis[el.dataset.repli] = el.open;
}, true);

document.addEventListener('change', e => {
  const t = e.target, d = t.dataset, p = posteCourant();
  if (t.id === 'railm') return aller(t.value);
  if (t.id === 'whoaud'){ S.moi = t.value; return render(); }
  if (d.decl !== undefined){
    const dc = declarationCourante(S.moi);
    if (dc && !dc.signee){ if (t.value) dc.reponses[d.decl] = t.value; else delete dc.reponses[d.decl]; }
    return renderMain();
  }
  if (d.mem !== undefined){
    const [uid, champ] = d.mem.split('|');
    const r = majMembre(uid, champ, t.value);
    S.memErreur = r.ok ? '' : r.why;
    return render();
  }
  if (t.id === 'whoclient'){ S.moiClient = t.value; return render(); }
  if (d.scope !== undefined){
    if (t.value) S.scopingOverride[d.scope] = t.value; else { delete S.scopingOverride[d.scope]; delete S.scopingMotif[d.scope]; }
    logEvent('périmètre modifié', d.scope, t.value ? 'forcé : ' + t.value : 'retour à la proposition');
    return render();
  }
  if (d.ns !== undefined && p){
    const st = sec(p.code);
    if (t.value === 'auto'){ delete st.ns[d.ns]; delete st.nsMotif[d.ns]; } else st.ns[d.ns] = t.value;
    logEvent('statut de compte modifié', d.ns, t.value);
    return renderMain();
  }
  if (d.fac !== undefined && p){
    sec(p.code).declares[d.fac] = t.checked;
    logEvent('facteur de risque déclaré', p.lib, (FACTEURS.find(f => f.code === d.fac) || {}).lib + ' : ' + (t.checked ? 'oui' : 'non'));
    renderImpact(); return renderMain();
  }
  if (d.niv !== undefined && p){
    const st = sec(p.code);
    if (t.value) st.override[d.niv] = t.value; else { delete st.override[d.niv]; delete st.overrideMotif[d.niv]; }
    logEvent('niveau de risque arbitré', p.lib + ' · ' + d.niv, t.value ? 'forcé : ' + NIV_LIB[t.value] : 'retour au calcul');
    renderImpact(); return renderMain();
  }
  if (d.ctr !== undefined && p){
    const pr = PROCEDURES.find(x => x.code === d.pcode);
    const l = (wpProc(p, pr) || []).find(x => String(x.cle) === String(d.ctr).split('|')[0]);
    if (l) l.champs[d.ctr] = t.value;
    return renderMain();
  }
  if (d.achpt !== undefined){ const [k, i] = d.achpt.split('|');
    (S.achevement.points[k] = S.achevement.points[k] || {})[i] = t.checked;
    logEvent('point de diligence ' + (t.checked ? 'exécuté' : 'décoché'), ACH[k].t, ACH[k].pts[+i].slice(0, 60));
    return renderMain(); }
  if (t.id === 'ach-op'){ S.achevement.opinion = t.value;
    logEvent('opinion arrêtée', 'Altiverre SAS FY2025', t.value); return renderMain(); }
  if (d.rdisp !== undefined){ const x = resolDeCle(d.rdisp); if (x) x.r.disposition = t.value; return renderMain(); }
  if (d.rpiece !== undefined){ const x = resolDeCle(d.rpiece); if (x) x.r.corrobPiece = t.value; return renderMain(); }
  if (d.selt !== undefined){
    S.selTrav = t.checked ? [...new Set([...S.selTrav, d.selt])] : S.selTrav.filter(x => x !== d.selt);
    return renderMain();
  }
  if (d.lot !== undefined){
    if (!t.value) return;
    const r = affecterEnLot(S.selTrav, d.lot, t.value);
    S.lotErreur = r.refus.length ? r.refus.length + ' refus : ' + r.refus.slice(0, 3).join(' · ')
      + (r.refus.length > 3 ? ' …' : '') : '';
    return renderMain();
  }
  if (d.je !== undefined){ S.jeCrit[d.je] = t.checked; _entCache.clear(); return renderMain(); }
  if (t.id === 'je-mode'){ S.jeCombi = { ...combiJE(), mode:t.value }; _entCache.clear(); return renderMain(); }
  if (t.id === 'je-modele' && t.value){ appliquerModele(t.value); return renderMain(); }
  if (t.id === 'je-forme') return;
  if (t.id === 'je-an'){ S.jeSansAN = t.checked; _entCache.clear(); _jeStat.clear(); return renderMain(); }
  if (d.aff !== undefined){
    const [code, role] = d.aff.split('|');
    const r = affecter(code, role, t.value);
    S.affErreur = r.ok ? '' : r.why;
    return renderMain();
  }
  if (t.id === 'imp-de'){ S.impactDe = +t.value; return renderMain(); }
  if (t.id === 'imp-vers'){ S.impactVers = +t.value; return renderMain(); }
  if (d.pmeth !== undefined && p){
    proc(p.code, d.pmeth).methode = t.value;
    _echProcCache.clear();
    logEvent('méthode de sélection modifiée', p.lib + ' · ' + d.pmeth, METHODES[t.value].lib);
    renderImpact(); return renderMain();
  }
  if (t.id === 'ft-phase'){ S.filtreTrav.phase = t.value; return renderMain(); }
  if (t.id === 'ft-nature'){ S.filtreTrav.nature = t.value; return renderMain(); }
  if (t.id === 'ft-personne'){ S.filtreTrav.personne = t.value; return renderMain(); }
  if (t.id === 'ft-statut'){ S.filtreTrav.statut = t.value; return renderMain(); }
  if (t.id === 'f-statut'){ S.filtres.statut = t.value; return renderMain(); }
  if (t.id === 'f-section'){ S.filtres.section = t.value; return renderMain(); }
  if (t.id === 'f-contact'){ S.filtres.contact = t.value; return renderMain(); }
  if (t.id === 'f-echeance'){ S.filtres.echeance = t.value; return renderMain(); }
  if (t.id === 'env-cad'){ S.envoi.cadence = t.value; return renderMain(); }
  if (t.id === 'env-dest'){ S.envoi.destinataires = [...t.selectedOptions].map(o => o.value); return renderMain(); }
  if (d.crole !== undefined){ const c = S.contacts.find(x => x.id === d.crole); if (c) c.role = t.value; return renderMain(); }
  if (t.id === 'pp-cad'){ S.portail.cadence = +t.value; return renderMain(); }
  if (t.id === 'pp-esc'){ S.portail.escalade = +t.value; return renderMain(); }
  if (t.id === 'pp-sam'){ S.portail.samediOuvre = t.value === '1'; return renderMain(); }
  if (t.id === 'pp-lang'){ S.portail.langue = t.value; return renderMain(); }
});

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-vue]');
  if (a) return aller(a.dataset.vue);
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, p = posteCourant();

  if (t.id === 'themebtn'){
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
    return;
  }
  if (t.id === 'tv-lotech-rgl'){ fixerEcheanceEnLot(S.selTrav, ''); return renderMain(); }
  if (t.id === 'tv-add'){
    const r = ajouterTravail(document.getElementById('tv-add-lib').value,
                             document.getElementById('tv-add-phase').value,
                             document.getElementById('tv-add-poste').value);
    S.travErreur = r.ok ? '' : r.why;
    return render();
  }
  if (d.tdel !== undefined){ const r = retirerTravailManuel(d.tdel); S.travErreur = r.ok ? '' : r.why; return render(); }
  if (d.tso !== undefined){
    const motif = prompt('Motif — pourquoi ce travail est-il sans objet sur ce dossier ?', '');
    if (motif === null) return;
    const r = marquerSansObjet(d.tso, motif);
    S.travErreur = r.ok ? '' : r.why;
    return render();
  }
  if (d.tso0 !== undefined){ annulerSansObjet(d.tso0); return render(); }
  if (t.id === 'mem-add'){
    const g = document.getElementById('mem-grade'), r = document.getElementById('mem-role');
    const res = ajouterMembre(document.getElementById('mem-nom').value, g.value, r.value,
                              document.getElementById('mem-mail').value);
    S.memErreur = res.ok ? '' : res.why;
    return render();
  }
  if (d.memdel !== undefined){ const r = retirerMembre(d.memdel); S.memErreur = r.ok ? '' : r.why; return render(); }
  if (d.declopen !== undefined){ ouvrirDeclaration(d.declopen); return renderMain(); }
  if (t.id === 'decl-sign'){ const r = signerDeclaration(S.moi); S.indErreur = r.ok ? '' : r.why; return render(); }
  if (d.revis !== undefined){
    const motif = prompt('Motif de la révision — ce qui a changé dans les circonstances :', '');
    if (motif === null) return;
    const r = reviserDeclaration(d.revis, motif);
    S.indErreur = r.ok ? '' : r.why;
    return render();
  }
  if (t.id === 'ind-conf'){ const r = confirmerEquipe(); S.indErreur = r.ok ? '' : r.why; return render(); }
  if (t.id === 'sacc-add'){
    const res = ajouterSacc(document.getElementById('sacc-nat').value,
                            document.getElementById('sacc-lib').value,
                            document.getElementById('sacc-mont').value,
                            document.getElementById('sacc-date').value);
    S.saccErreur = res.ok ? '' : res.why;
    return renderMain();
  }
  if (d.saccdel !== undefined){ retirerSacc(d.saccdel); return renderMain(); }
  if (d.espace){ const x = ESPACES.find(y => y.id === d.espace); return aller(x.defaut, x.id); }
  if (d.open) return ouvrirSection(d.open);
  if (d.goreq){ const r = S.requetes.find(x => x.id === d.goreq);
    if (r){ const c = S.contacts.find(x => x.id === r.contact); if (c) S.moiClient = c.id; }
    return aller('cli.vue', 'client'); }

  /* ── sélection et enchaînement ── */
  if (d.proc){
    S.procOuverte = S.procOuverte === d.proc ? null : d.proc;
    S.dest[d.proc.split('/')[0]] = 'plan';
    renderMain();
    window.scrollTo({ top:0 });
    return;
  }
  if (d.ctrtout){ S.ctrTout[d.ctrtout] = !S.ctrTout[d.ctrtout]; return renderMain(); }
  if (d.ptaillen && p){
    const [code, n] = d.ptaillen.split('|');
    proc(p.code, code).taille = parseInt(n, 10);
    _echProcCache.clear();
    logEvent('taille de tirage imposée', p.lib + ' · ' + code, n + ' éléments — intervalle ramené au seuil');
    renderImpact(); return renderMain();
  }
  if (d.psum && p){
    proc(p.code, d.psum).methode = 'sum';
    _echProcCache.clear();
    logEvent('méthode de sélection modifiée', p.lib + ' · ' + d.psum,
             'sondage en unités monétaires — garde-fou de strate exhaustive');
    renderImpact(); return renderMain();
  }
  if (d.pnouveau && p){
    const st = proc(p.code, d.pnouveau);
    st.seed = 'otto-' + p.code.toLowerCase() + '-' + d.pnouveau.toLowerCase() + '-' + String(seedOf(st.seed) % 9000 + 1000);
    st.wp = null;
    logEvent('nouveau germe', p.lib + ' · ' + d.pnouveau, st.seed);
    renderImpact(); return renderMain();
  }
  if (d.preq && p){
    const pr = PROCEDURES.find(x => x.code === d.preq);
    if (pr) requeteJustificatifsProc(p, pr);
    renderImpact(); return renderMain();
  }
  if (d.plire && p){
    const pr = PROCEDURES.find(x => x.code === d.plire);
    let n = 0;
    for (const c of controles(p, pr)){
      if (etatControle(c) !== 'recue') continue;
      const v = c.ch.val(c.ligne.x);
      c.ligne.champs[c.cle] = c.ch.type === 'montant' ? (v / 100).toFixed(2).replace('.', ',')
                            : c.ch.type === 'bool' ? (v ? 'oui' : 'non') : String(v);
      n++;
    }
    marquerExecution(p, pr);
    logEvent('valeurs relevées saisies', p.lib + ' · ' + procRef(p, pr),
             n + ' champ(s) · version ' + S.version);
    renderImpact(); return renderMain();
  }
  if (d.ravar && p){
    const l = revueAnalytique().find(x => x.compte === d.ravar);
    if (l) requeteVariation(p, d.ravar, l);
    renderImpact(); return renderMain();
  }
  if (t.id === 'req-add' && p){
    const ti = document.getElementById('req-titre'), dl = document.getElementById('req-delai');
    if (!ti.value.trim()) return;
    creerRequete(p.code, ti.value.trim(), ['Éléments demandés'], +dl.value);
    renderImpact(); return renderMain();
  }

  /* ── notes de revue ── */
  if (d.noteCible){
    const [section, objet, ref, lib] = d.noteCible.split('|');
    S.noteCible = { section, objet, ref, lib };
    /* Le formulaire vit dans la destination « notes » : poser une ancre depuis
       une autre destination doit y emmener, sinon le clic n'a aucun effet
       visible et l'auditeur reste sur place sans savoir que l'ancre est prise. */
    if (S.vue === 'fsli:' + section) S.dest[section] = 'notes';
    renderImpact();
    renderMain();
    window.scrollTo({ top:0 });
    const i = document.getElementById('nt-txt'); if (i) i.focus();
    return;
  }
  if (t.id === 'nt-annul'){ S.noteCible = null; return renderMain(); }
  if (t.id === 'nt-add'){
    const txt = document.getElementById('nt-txt');
    if (!txt || !txt.value.trim() || !S.noteCible) return;
    const n = ajouterNote(document.getElementById('nt-type').value, S.noteCible, txt.value.trim());
    n.pour = document.getElementById('nt-pour').value;
    S.noteCible = null; renderImpact(); return renderMain();
  }
  if (d.repok){
    const i = document.querySelector(`input[data-rep="${d.repok}"]`);
    const n = S.notes.find(x => x.id === +d.repok);
    if (i && n && i.value.trim()){ n.reponses.push({ par:S.moi, t:tick(), texte:i.value.trim() });
      logEvent('réponse à une note', '#' + n.id + ' — ' + n.ancre.lib, USERS[S.moi].nom); }
    return renderMain();
  }
  if (d.clos){
    const n = S.notes.find(x => x.id === +d.clos);
    if (n && peutClore(S.moi, n)){ n.clos = { par:S.moi, t:tick() };
      logEvent('note close', '#' + n.id + ' — ' + n.ancre.lib, USERS[S.moi].nom + ' (' + ROLE_LIB[USERS[S.moi].role] + ')'); }
    renderImpact(); return renderMain();
  }
  if (d.goanc){
    const n = S.notes.find(x => x.id === +d.goanc);
    if (!n) return;
    if (n.ancre.section === 'JE') aller('plan.je', 'auditeur'); else ouvrirSection(n.ancre.section);
    setTimeout(() => {
      const el = [...document.querySelectorAll('[data-note-cible]')]
        .find(x => x.dataset.noteCible.startsWith(n.ancre.section + '|' + n.ancre.objet + '|' + n.ancre.ref + '|'));
      if (el){ const tr = el.closest('tr') || el.closest('div');
        if (tr){ tr.scrollIntoView({ block:'center' }); tr.style.outline = '2px solid var(--accent)';
                 setTimeout(() => { tr.style.outline = ''; }, 1800); } }
    }, 60);
    return;
  }

  /* ── conclusion, visa, reprise N-1, clôture ── */
  if (d.n1 && p){ sec(p.code).reprisN1Vues[d.n1] = 'Reconfirmé par ' + USERS[S.moi].nom + ' le ' + horo(tick());
    logEvent('travail N-1 reconfirmé', p.lib + ' · ' + d.n1, USERS[S.moi].nom); return renderMain(); }
  if (t.id === 'sec-visa' && p){
    if (obstaclesVisa(p).length) return;
    sec(p.code).visa = { par:S.moi, t:tick(), version:S.version };
    logEvent('section visée', p.lib, USERS[S.moi].nom + ' (' + ROLE_LIB[USERS[S.moi].role] + ')');
    return renderMain();
  }
  if (t.id === 'sec-devisa' && p){ sec(p.code).visa = null;
    logEvent('visa retiré', p.lib, USERS[S.moi].nom); return renderMain(); }
  if (t.id === 'clore-dossier'){
    if (notesBloquantesOuvertes().length) return;
    S.dossierClos = true; logEvent('dossier clôturé', 'Altiverre SAS FY2025', USERS[S.moi].nom);
    return renderMain();
  }

  /* ── portail client ── */
  if (d.clitout){ S.cliTout = S.cliTout || {}; S.cliTout[d.clitout] = !S.cliTout[d.clitout]; return renderMain(); }
  if (d.depot){ const [rid, iid] = d.depot.split('|'); deposer(rid, +iid); renderImpact(); return renderMain(); }
  if (d.clot){
    const r = S.requetes.find(x => x.id === d.clot);
    if (r && r.items.every(i => i.statut !== 'non_recu' && i.statut !== 'partiel')){
      r.clotureClient = true;
      for (const i of r.items) i.statut = 'traitement';
      logEvent('client : tout est déposé', r.id + ' — ' + r.titre, contactCourant().nom);
      // côté auditeur, la demande complète passe en attente de revue
      for (const i of r.items){ i.statut = 'attente_revue'; i.revoyeur = USERS.lea.nom; }
    }
    renderImpact(); return renderMain();
  }
  if (d.msgok){
    const i = document.querySelector(`input[data-msg="${d.msgok}"]`), r = S.requetes.find(x => x.id === d.msgok);
    if (i && r && i.value.trim()){
      r.messages.push({ cote:S.espace === 'client' ? 'cli' : 'aud',
                        par:S.espace === 'client' ? contactCourant().nom : USERS[S.moi].nom,
                        t:tick(), texte:i.value.trim() });
      logEvent('message sur requête', r.id, i.value.trim().slice(0, 60));
    }
    return renderMain();
  }
  if (t.id === 'ct-add'){
    const g = id => document.getElementById(id);
    const nom = g('ct-nom').value.trim(); if (!nom) return;
    const id = 'c' + (S.contacts.length + 1) + seedOf(nom) % 100;
    S.contacts.push({ id, nom, fonction:g('ct-fct').value.trim() || 'contact', mail:g('ct-mail').value.trim() || '—',
                      societe:g('ct-soc').value, role:'contributeur',
                      sections:g('ct-sec').value ? [g('ct-sec').value] : [] });
    logEvent('contact ajouté', nom, g('ct-soc').value);
    return renderMain();
  }
  /* ── registre des facteurs de risque ── */
  if (d.gosrc) return aller(d.gosrc, 'auditeur');
  if (d.fconf || d.fecart){
    const id = d.fconf || d.fecart;
    const mi = document.querySelector(`input[data-fmotif="${CSS.escape(id)}"]`);
    const se = document.querySelector(`select[data-feff="${CSS.escape(id)}"]`);
    const motif = mi ? mi.value.trim() : '', effet = se ? se.value : 'majore';
    // écarter, ou confirmer en neutralisant, sont des décisions qui doivent s'écrire
    if (!motif && (d.fecart || effet === 'neutre')){
      if (mi){ mi.focus(); mi.style.borderColor = 'var(--anomalie)'; mi.placeholder = 'motif obligatoire pour cette décision'; }
      return;
    }
    statuerFacteur(id, d.fconf ? 'confirme' : 'ecarte', motif, effet);
    renderImpact(); return renderMain();
  }
  if (d.frouvre){ delete S.decisionsFacteurs[d.frouvre];
    logEvent('facteur de risque remis en attente', d.frouvre, USERS[S.moi].nom);
    renderImpact(); return renderMain(); }
  if (t.id === 'mf-add'){
    const g = x => document.getElementById(x);
    const desc = g('mf-desc').value.trim();
    const fsli = [...g('mf-fsli').selectedOptions].map(o => o.value);
    const ass  = [...g('mf-ass').selectedOptions].map(o => o.value);
    if (!desc || !fsli.length || !ass.length){
      const manque = !desc ? 'mf-desc' : !fsli.length ? 'mf-fsli' : 'mf-ass';
      const el = g(manque); if (el){ el.focus(); el.style.borderColor = 'var(--anomalie)'; }
      return;
    }
    const id = 'MANUEL:' + String(++S.seqFacteurManuel).padStart(3, '0');
    S.facteursManuels.push({ id, regle:'MANUEL', regleLib:'Facteur levé à la main',
      nature:g('mf-nat').value, description:desc,
      cibles:fsli.map(c => ({ fsli:c, assertions:ass })),
      pertinence:'jugement de l’auditeur',
      source:{ lib:g('mf-src').value.trim() || 'saisi à la main', vue:null, ref:'' },
      cree:tick() });
    logEvent('facteur de risque levé à la main', id, desc.slice(0, 80) + ' → ' + fsli.join(', '));
    renderImpact(); return renderMain();
  }
  if (t.id === 'ach-clore'){ S.achevement.clos = { par:S.moi, t:tick() };
    logEvent('dossier clôturé et verrouillé', 'Altiverre SAS FY2025',
             USERS[S.moi].nom + ' — assemblage dans les ' + DELAI_ASSEMBLAGE + ' jours du rapport');
    return renderMain(); }
  if (d.raprelim){
    const l = revueAnalytique().find(x => x.compte === d.raprelim);
    if (l){
      const ps = postesDuCompte(d.raprelim);
      const r = creerRequete(ps.length ? ps[0].code : 'CA', 'Explication de variation — compte ' + d.raprelim,
        [{ desc:questionVariation(l), ref:d.raprelim }], 10);
      r.origine = 'revue analytique préliminaire';
    }
    renderImpact(); return renderMain();
  }
  if (d.rconclure){
    const x = resolDeCle(d.rconclure);
    if (x){ const r = conclureResolution(x.r, x.constate, x.lib); S.affErreur = r.ok ? '' : r.why; }
    renderImpact(); return renderMain();
  }
  if (d.rannul){
    const x = resolDeCle(d.rannul);
    if (x) annulerResolutionR(x.r, x.lib);
    renderImpact(); return renderMain();
  }
  if (d.tstat){
    const [code, st] = d.tstat.split('|');
    const r = changerStatut(code, st);
    S.affErreur = r.ok ? '' : r.why;
    return renderMain();
  }
  if (t.id === 'je-tout'){ S.jeTout = !S.jeTout; return renderMain(); }
  if (t.id === 'je-creer'){
    const forme = document.getElementById('je-forme').value;
    const nom = document.getElementById('je-cnom').value;
    const r = creerCritereJE(forme, nom);
    S.jeErreur = r.ok ? '' : r.why;
    return renderMain();
  }
  if (d.jesup){ supprimerCritereJE(d.jesup); return renderMain(); }
  if (t.id === 'je-msave'){
    const r = enregistrerModele(document.getElementById('je-mnom').value);
    S.jeErreur = r.ok ? '' : r.why;
    return renderMain();
  }
  if (d.dest){
    const [code, id] = d.dest.split('|');
    S.dest[code] = id;
    if (id === 'plan') S.procOuverte = null;
    renderImpact();
    renderMain();
    window.scrollTo({ top:0 });
    return;
  }
  if (d.replis){
    const [prefixe, ouvrir] = d.replis.split('|');
    for (const el of document.querySelectorAll('[data-repli^="' + prefixe + '/"]'))
      S.replis[el.dataset.repli] = ouvrir === '1';
    return renderMain();
  }
  if (d.vers){
    prendreEnCompte(+d.vers);
    _impCache.clear();
    return render();
  }
  if (t.id === 'bal-tout'){ S.balTout = !S.balTout; return renderMain(); }
  if (d.recon){
    const r = reconfirmer(d.recon);
    S.affErreur = r.ok ? '' : r.why;
    return renderMain();
  }
  if (d.goecart){
    if (d.goecart.startsWith('fsli:')) return ouvrirSection(d.goecart.slice(5));
    return aller(d.goecart, 'auditeur');
  }
  if (d.gotrav) return aller(d.gotrav, 'auditeur');
  if (t.id === 'tv-auto'){
    const r = appliquerRepartition('vides');
    S.affErreur = r.refus ? r.refus + ' affectation(s) refusée(s) par la règle' : '';
    return renderMain();
  }
  if (t.id === 'tv-prop-sel'){
    const r = appliquerRepartition('selection', S.selTrav);
    S.affErreur = r.refus ? r.refus + ' affectation(s) refusée(s) par la règle' : '';
    return renderMain();
  }
  if (t.id === 'tv-tout'){
    const f = S.filtreTrav;
    const vus = travaux().filter(x => (!f.phase || x.phase === f.phase) && (!f.nature || x.nature === f.nature)
      && (!f.personne || x.preparateur === f.personne || x.reviseur === f.personne)
      && (!f.statut || x.statut === f.statut)
      && (!f.q || (x.code + ' ' + x.intitule + ' ' + (x.posteLib || '')).toLowerCase().includes(f.q.toLowerCase())));
    const tous = vus.length && vus.every(x => S.selTrav.includes(x.code));
    S.selTrav = tous ? [] : vus.map(x => x.code);
    return renderMain();
  }
  if (t.id === 'ft-imprime' || t.id === 'mi-imprime'){ window.print(); return; }
  if (d.xlsm){
    const c = classeur(d.xlsm);
    telecharger('mission-altiverre-2025-' + d.xlsm + '.xls', c.xml, 'application/vnd.ms-excel');
    logEvent('classeur généré', 'vue globale — ' + PERIMETRES[d.xlsm].lib, c.feuilles.length + ' feuille(s)');
    const o = document.getElementById('exp-out');
    if (o) o.innerHTML = `<div class="callout">Classeur « ${esc(PERIMETRES[d.xlsm].lib)} » — ${c.feuilles.length} feuille(s).</div>`;
    return;
  }
  if (t.id === 'f-raz'){ S.filtres = { statut:'', section:'', contact:'', echeance:'', q:'' }; return renderMain(); }
  if (d.perim){ S.envoi.perimetre = d.perim; return renderMain(); }
  if (d.xls){
    const c = classeur(d.xls);
    const ok = telecharger('suivi-altiverre-2025-' + d.xls + '.xls', c.xml, 'application/vnd.ms-excel');
    logEvent('classeur généré', 'statut de mission — ' + PERIMETRES[d.xls].lib,
             c.feuilles.length + ' feuille(s)');
    document.getElementById('exp-out').innerHTML = ok
      ? `<div class="callout">Classeur généré : ${c.feuilles.length} feuille(s), format SpreadsheetML lisible par
         Excel et LibreOffice. Si rien ne s’est téléchargé, c’est que la page est ouverte dans un cadre qui bloque les
         téléchargements : ouvrez le fichier directement dans le navigateur.</div>`
      : '<div class="callout bad">Le téléchargement a été refusé par le navigateur.</div>';
    return;
  }
  if (d.csv){
    const l = [PERIMETRES[d.csv].cols, ...lignesExport(d.csv, S.requetes)];
    const csv = l.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
    telecharger('suivi-altiverre-2025-' + d.csv + '.csv', '\uFEFF' + csv, 'text/csv');
    logEvent('export CSV généré', PERIMETRES[d.csv].lib, l.length - 1 + ' ligne(s)');
    document.getElementById('exp-out').innerHTML =
      `<div class="callout"><b>${l.length - 1} ligne(s)</b></div><textarea rows="8" readonly>${esc(csv)}</textarea>`;
    return;
  }
  if (d.imprime){ window.print(); return; }
});

/* ═══ 24. DÉMARRAGE ════════════════════════════════════════════════════════ */
initPortail();
seedEquipe();
/* Quelques requêtes préexistantes, pour que le dossier ne parte pas d'un écran
   vide : elles sont créées par le même chemin que celles de l'enchaînement. */
(function amorce(){
  const r1 = creerRequete('TRESO', 'Confirmations bancaires et relevés au 31/12/2025',
    ['Listing des banques et contacts', 'Relevés au 31/12/2025', 'Explication du compte 512200 hors listing'], -20);
  r1.origine = 'enchaînement : exhaustivité';
  r1.items[0].statut = 'depose'; r1.items[0].depots = [{ nom:'listing-banques-2025.pdf', t:tick(), par:'Delphine Martin' }];
  r1.items[1].statut = 'partiel'; r1.items[1].depots = [{ nom:'releve-blc-decembre.pdf', t:tick(), par:'Delphine Martin' }];
  const r2 = creerRequete('PERSONNEL', 'Justificatifs de paie', ['Journal de paie annuel', 'Contrats des entrées de l’exercice'], -6);
  r2.items[0].statut = 'attente_revue'; r2.items[0].revoyeur = USERS.lea.nom;
  r2.items[0].depots = [{ nom:'journal-paie-2025.pdf', t:tick(), par:'Sophie Brun' }];
  S.events.length = 0; HORLOGE = '2026-03-15T09:12';   // l'amorce n'est pas un événement de la session
})();
render();
if (window.ResizeObserver) new ResizeObserver(syncTopHeight).observe(document.querySelector('.top'));
addEventListener('resize', syncTopHeight);
