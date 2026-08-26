
/* ═══ 39. CRITÈRES DU TEST DES ÉCRITURES ═══════════════════════════════════
   « 457 écritures en journal d'OD » ne veut rien dire isolément. Ce qui a un
   sens, c'est l'ENTONNOIR : d'où l'on part, ce que chaque critère retient,
   ce qu'il ajoute que les autres n'avaient pas vu, et combien d'écritures
   réunissent au moins N critères.

   Un critère est un objet : identité, ce qu'il cherche, ses PARAMÈTRES
   déclarés, son prédicat, et — quand il ne peut pas s'exécuter sur les
   données disponibles — la raison écrite de son indisponibilité. On peut en
   activer, en désactiver, en créer, et enregistrer l'ensemble en modèle.
   ═══════════════════════════════════════════════════════════════════════ */

const mtEcr = e => Math.max(...e.lines.map(l => Math.max(l.debit, l.credit)));

/* ── jours fériés ─────────────────────────────────────────────────────────
   [UNVERIFIED] La liste des fêtes légales relève du code du travail,
   art. L. 3133-1. Le texte primaire n'a pas pu être atteint depuis cet
   environnement — l'accès à legifrance.gouv.fr y est bloqué. La liste
   ci-dessous n'est donc PAS vérifiée sur le texte en vigueur et le critère
   qui s'en sert le déclare à l'écran. Les dates mobiles de 2025 sont
   calculées, pas recopiées. */
const FERIES_2025 = [
  '2025-01-01', '2025-04-21', '2025-05-01', '2025-05-08', '2025-05-29',
  '2025-06-09', '2025-07-14', '2025-08-15', '2025-11-01', '2025-11-11', '2025-12-25',
];
const FERIES_SOURCE = 'code du travail, art. L. 3133-1';
const FERIES_VERIFIE = false;

/* ── statistiques de population, mémoïsées par version ────────────────────
   Plusieurs critères ont besoin de connaître la population entière : un
   compte « rarement mouvementé » n'a de sens qu'au regard des autres. */
const _jeStat = new Map();
function statsJE(){
  const cle = S.version + '|' + (S.jeSansAN ? 'sansAN' : 'avecAN');
  if (_jeStat.has(cle)) return _jeStat.get(cle);
  const pop = populationJE();
  const parCompte = new Map(), parCouple = new Map(), parAuteurCompte = new Map();
  const parMontantTiers = new Map();
  for (const e of pop){
    const comptes = e.lines.map(l => l.compte);
    for (const c of comptes){
      parCompte.set(c, (parCompte.get(c) || 0) + 1);
      const k = e.saisiePar + '§' + c;
      parAuteurCompte.set(k, (parAuteurCompte.get(k) || 0) + 1);
    }
    const d = e.lines.filter(l => l.debit).map(l => l.compte).sort().join(',');
    const c2 = e.lines.filter(l => l.credit).map(l => l.compte).sort().join(',');
    const couple = d + ' → ' + c2;
    parCouple.set(couple, (parCouple.get(couple) || 0) + 1);
    const tiers = e.lines.map(l => l.auxLib).find(Boolean);
    if (tiers){
      const k = tiers + '§' + mtEcr(e);
      parMontantTiers.set(k, (parMontantTiers.get(k) || 0) + 1);
    }
  }
  const r = { pop, parCompte, parCouple, parAuteurCompte, parMontantTiers };
  if (_jeStat.size > 8) _jeStat.clear();
  _jeStat.set(cle, r);
  return r;
}
function coupleDe(e){
  const d = e.lines.filter(l => l.debit).map(l => l.compte).sort().join(',');
  const c = e.lines.filter(l => l.credit).map(l => l.compte).sort().join(',');
  return d + ' → ' + c;
}
function populationJE(){
  return lg().entries.filter(e => !(S.jeSansAN && e.journal === 'AN'));
}

/* ── le catalogue ─────────────────────────────────────────────────────────
   `params` : ce que l'auditeur règle. `indispo` : la raison, écrite, pour
   laquelle un critère ne peut pas tourner sur les données disponibles. */
const CATALOGUE_JE = [
  { code:'rond', lib:'Montant rond',
    quoi:'un montant exactement multiple d’un pas, au-dessus d’un plancher — signature d’une écriture estimée plutôt que constatée',
    params:[{ code:'pas', lib:'Multiple de', type:'euros', def:100000 },
            { code:'plancher', lib:'À partir de', type:'euros', def:500000 }],
    f:(e, p) => { const m = mtEcr(e); return m >= p.plancher && p.pas > 0 && m % p.pas === 0; } },

  { code:'weekend', lib:'Comptabilisée un week-end',
    quoi:'une écriture datée d’un samedi ou d’un dimanche',
    params:[], f:e => isWeekend(e.date) },

  { code:'ferie', lib:'Comptabilisée un jour férié',
    quoi:'une écriture datée d’une fête légale',
    marque:FERIES_VERIFIE ? null : 'UNVERIFIED',
    note:'La liste des fêtes légales (' + FERIES_SOURCE + ') n’a pas pu être vérifiée sur le texte '
       + 'primaire depuis cet environnement. Le critère fonctionne, sa liste est à confirmer.',
    params:[], f:e => FERIES_2025.includes(e.date) },

  { code:'hors_heures', lib:'Saisie hors heures ouvrées',
    quoi:'une écriture enregistrée la nuit ou pendant le week-end, d’après l’horodatage de saisie',
    indispo:'Le fichier des écritures comptables ne porte que la DATE de validation (champ ValidDate), '
          + 'jamais l’heure. Ce critère exige le journal applicatif de l’ERP, pas le FEC. Il est '
          + 'catalogué et désactivé plutôt que fabriqué : une heure inventée ferait un critère qui '
          + 'trouve toujours quelque chose.',
    params:[{ code:'debut', lib:'Début des heures ouvrées', type:'heure', def:8 },
            { code:'fin', lib:'Fin des heures ouvrées', type:'heure', def:20 }],
    f:() => false },

  { code:'apres_cloture', lib:'Validée après la clôture, datée avant',
    quoi:'une écriture datée de l’exercice mais enregistrée après le 31/12 — la fenêtre où se logent les ajustements de dernière minute',
    params:[{ code:'jours', lib:'Au-delà de la clôture, en jours', type:'entier', def:0 }],
    f:(e, p) => e.date <= CLOTURE && e.validDate > addDays(CLOTURE, p.jours) },

  { code:'libelle', lib:'Libellé vide, trop court ou suspect',
    quoi:'un libellé qui n’explique rien, ou qui emploie un mot de la liste surveillée',
    params:[{ code:'mini', lib:'Longueur minimale', type:'entier', def:12 },
            { code:'mots', lib:'Mots surveillés', type:'liste', def:'divers,régularisation,ajustement,od,correction,à ventiler,pour solde' }],
    f:(e, p) => { const l = (e.libelle || '').trim();
      if (l.length < p.mini) return true;
      const b = l.toLowerCase();
      return p.mots.some(m => m && b.includes(m)); } },

  { code:'compte_rare', lib:'Compte rarement mouvementé',
    quoi:'un compte qui ne bouge presque jamais — l’écriture unique de l’année s’y cache bien',
    params:[{ code:'max', lib:'Au plus, mouvements dans l’exercice', type:'entier', def:3 }],
    f:(e, p) => { const st = statsJE();
      return e.lines.some(l => (st.parCompte.get(l.compte) || 0) <= p.max); } },

  { code:'combinaison', lib:'Combinaison de comptes inhabituelle',
    quoi:'un couple débit → crédit qui n’apparaît presque jamais dans l’exercice',
    params:[{ code:'max', lib:'Au plus, occurrences du couple', type:'entier', def:2 }],
    f:(e, p) => (statsJE().parCouple.get(coupleDe(e)) || 0) <= p.max },

  { code:'contrepassee', lib:'Contrepassée peu après',
    quoi:'une écriture annulée par son symétrique dans les jours qui suivent — ce qui a été passé puis repris mérite d’être lu',
    params:[{ code:'jours', lib:'Dans un délai de, en jours', type:'entier', def:15 }],
    f:(e, p) => { const m = mtEcr(e), c = coupleDe(e).split(' → ');
      const inverse = c[1] + ' → ' + c[0];
      return statsJE().pop.some(x => x !== e && mtEcr(x) === m && coupleDe(x) === inverse
        && Math.abs(Date.parse(x.date) - Date.parse(e.date)) <= p.jours * 86400000); } },

  { code:'sans_piece', lib:'Référence de pièce absente',
    quoi:'une écriture sans pièce citée : rien à demander, rien à rapprocher',
    params:[], f:e => !e.pieceRef || !String(e.pieceRef).trim() },

  { code:'derniers_jours', lib:'Dans les derniers jours de l’exercice',
    quoi:'la fenêtre de clôture, où se concentrent les écritures d’ajustement',
    params:[{ code:'n', lib:'Derniers jours', type:'entier', def:10 }],
    f:(e, p) => e.date > addDays(CLOTURE, -p.n) && e.date <= CLOTURE },

  { code:'meme_montant_tiers', lib:'Montant identique au même tiers',
    quoi:'le même montant, au même tiers, plusieurs fois — doublon ou fractionnement',
    params:[{ code:'min', lib:'À partir de, occurrences', type:'entier', def:2 }],
    f:(e, p) => { const t = e.lines.map(l => l.auxLib).find(Boolean);
      if (!t) return false;
      return (statsJE().parMontantTiers.get(t + '§' + mtEcr(e)) || 0) >= p.min; } },

  { code:'auteur_inhabituel', lib:'Auteur inhabituel sur ce compte',
    quoi:'une écriture passée sur un compte par quelqu’un qui n’y touche presque jamais',
    params:[{ code:'max', lib:'Au plus, écritures de cet auteur sur ce compte', type:'entier', def:2 }],
    f:(e, p) => { const st = statsJE();
      return e.lines.some(l => (st.parCompte.get(l.compte) || 0) > p.max * 3
        && (st.parAuteurCompte.get(e.saisiePar + '§' + l.compte) || 0) <= p.max); } },

  { code:'gros', lib:'Montant supérieur au seuil de planification',
    quoi:'une écriture qui, à elle seule, pourrait porter une anomalie significative',
    params:[], f:e => mtEcr(e) > seuils().PM },

  { code:'od', lib:'Journal d’opérations diverses',
    quoi:'le journal qui ne correspond à aucun flux automatisé',
    params:[], f:e => e.journal === 'OD' },

  { code:'direction', lib:'Saisie par la direction',
    quoi:'une écriture passée par quelqu’un qui n’a pas de rôle comptable quotidien',
    params:[], f:e => /direction/.test(e.saisiePar) },
];

/* ── formes de critères que l'auditeur peut instancier ────────────────────
   Créer un critère, ce n'est pas écrire du code : c'est instancier une forme
   avec ses paramètres. Les cinq formes couvrent ce qu'un auditeur ajoute
   réellement en cours de mission. */
const FORMES_JE = {
  montant_entre:{ lib:'Montant compris entre deux bornes',
    params:[{ code:'min', lib:'Au moins', type:'euros', def:1000000 },
            { code:'max', lib:'Au plus', type:'euros', def:5000000 }],
    f:(e, p) => { const m = mtEcr(e); return m >= p.min && m <= p.max; },
    nom:p => 'Montant entre ' + eur0(p.min) + ' et ' + eur0(p.max) },
  compte_prefixe:{ lib:'Compte commençant par',
    params:[{ code:'prefixe', lib:'Préfixe de compte', type:'texte', def:'627' }],
    f:(e, p) => e.lines.some(l => String(l.compte).startsWith(p.prefixe)),
    nom:p => 'Compte commençant par ' + p.prefixe },
  journal:{ lib:'Journal',
    params:[{ code:'code', lib:'Code journal', type:'texte', def:'OD' }],
    f:(e, p) => e.journal === p.code, nom:p => 'Journal ' + p.code },
  libelle_contient:{ lib:'Libellé contenant',
    params:[{ code:'mots', lib:'Mots', type:'liste', def:'exceptionnel,provision' }],
    f:(e, p) => { const b = (e.libelle || '').toLowerCase(); return p.mots.some(m => m && b.includes(m)); },
    nom:p => 'Libellé contenant : ' + p.mots.join(', ') },
  auteur:{ lib:'Auteur de la saisie',
    params:[{ code:'qui', lib:'Contient', type:'texte', def:'intérim' }],
    f:(e, p) => new RegExp(p.qui, 'i').test(e.saisiePar), nom:p => 'Saisie par « ' + p.qui + ' »' },
};

/* ── résolution des paramètres et des critères actifs ─────────────────── */
function critereJEDef(code){
  const base = CATALOGUE_JE.find(c => c.code === code);
  if (base) return base;
  const cree = (S.jeCrees || []).find(c => c.code === code);
  if (!cree) return null;
  const forme = FORMES_JE[cree.forme];
  return { code:cree.code, lib:cree.nom, quoi:'critère créé pour cette mission — forme « ' + forme.lib + ' »',
           params:forme.params, f:forme.f, cree:true, forme:cree.forme };
}
function tousCriteresJE(){
  return [...CATALOGUE_JE, ...(S.jeCrees || []).map(c => critereJEDef(c.code))];
}
function paramsJE(code){
  const def = critereJEDef(code); if (!def) return {};
  const saisis = (S.jeParams || {})[code] || {};
  const out = {};
  for (const pr of def.params){
    const v = saisis[pr.code];
    out[pr.code] = v === undefined ? (pr.type === 'liste' ? String(pr.def).split(',').map(x => x.trim()) : pr.def)
      : (pr.type === 'liste' ? String(v).split(',').map(x => x.trim().toLowerCase()).filter(Boolean) : v);
  }
  return out;
}
function critereActif(code){
  const def = critereJEDef(code);
  if (!def || def.indispo) return false;
  return !!S.jeCrit[code];
}
function criteresActifs(){ return tousCriteresJE().filter(c => critereActif(c.code)); }
/** Les critères remplis par une écriture. */
function critRemplis(e){
  return criteresActifs().filter(c => { try { return c.f(e, paramsJE(c.code)); } catch { return false; } })
    .map(c => c.code);
}

/* ── logique de combinaison ───────────────────────────────────────────────
   Trois modes. « au moins N » est le réglage courant d'un test d'écritures ;
   l'expression sert quand le raisonnement est précis — « un montant rond ET
   passé un week-end », et non « l'un ou l'autre ». */
const MODES_COMBI = {
  un:{ lib:'au moins un critère', d:'la sélection est l’union des critères' },
  auN:{ lib:'au moins N critères', d:'ne retient que ce que plusieurs signaux désignent ensemble' },
  expression:{ lib:'expression explicite', d:'ET, OU, NON et parenthèses sur les codes de critères' },
};
function combiJE(){ return S.jeCombi || { mode:'un', n:2, expr:'' }; }
function retenue(e){
  const c = combiJE(), rem = critRemplis(e);
  if (c.mode === 'expression'){
    const r = evalExpr(c.expr, rem);
    return r.ok ? r.v : false;
  }
  if (c.mode === 'auN') return rem.length >= Math.max(1, c.n);
  return rem.length >= 1;
}
/** Petit évaluateur booléen : codes de critères, ET / OU / NON, parenthèses.
 *  Toute expression qu'il ne comprend pas est REFUSÉE. Une expression mal
 *  formée qui s'évaluerait à « faux » donnerait une sélection vide et
 *  d'apparence normale : c'est le pire des deux résultats possibles. */
const OPS = ['ET', 'OU', 'NON'];
function evalExpr(expr, remplis){
  const src = String(expr || '').trim();
  if (!src) return { ok:false, why:'expression vide' };
  const toks = src.match(/\(|\)|[A-Za-zÀ-ÿ_][\w_]*/g) || [];
  if (!toks.length) return { ok:false, why:'aucun critère reconnu dans l’expression' };
  let i = 0, inconnu = [], manque = null;
  const mot = () => toks[i];
  const est = m => (toks[i] || '').toUpperCase() === m;
  function ou(){ let v = et(); while (est('OU')){ i++; const w = et(); v = v || w; } return v; }
  function et(){ let v = non(); while (est('ET')){ i++; const w = non(); v = v && w; } return v; }
  function non(){ if (est('NON')){ i++; return !non(); } return atome(); }
  function atome(){
    if (mot() === '('){
      i++; const v = ou();
      if (mot() === ')') i++; else manque = manque || 'une parenthèse fermante manque';
      return v;
    }
    const m = toks[i++];
    if (m === undefined){ manque = manque || 'l’expression s’arrête sur un opérateur : il manque un critère'; return false; }
    if (m === ')'){ manque = manque || 'une parenthèse fermante en trop'; return false; }
    if (OPS.includes(m.toUpperCase())){ manque = manque || 'deux opérateurs se suivent'; return false; }
    if (!tousCriteresJE().some(c => c.code === m)) inconnu.push(m);
    return remplis.includes(m);
  }
  const v = ou();
  if (manque) return { ok:false, why:manque };
  if (i < toks.length) return { ok:false, why:'expression incomplète : « ' + toks.slice(i).join(' ') +' » n’est pas rattaché' };
  if (inconnu.length) return { ok:false, why:'inconnu dans l’expression : ' + [...new Set(inconnu)].join(', ') };
  return { ok:true, v };
}

/* ── l'entonnoir ──────────────────────────────────────────────────────────
   Pour chaque critère : ce qu'il retient seul, et ce qu'il AJOUTE que les
   précédents n'avaient pas vu. Un critère qui n'ajoute rien coûte du temps
   de lecture sans rien apporter — et cela ne se voit que dans cet ordre. */
const _entCache = new Map();
function entonnoir(){
  const c = combiJE();
  const cle = [S.version, S.jeSansAN, JSON.stringify(S.jeCrit), JSON.stringify(S.jeParams),
               JSON.stringify(S.jeCrees), JSON.stringify(c), seuils().PM].join('§');
  if (_entCache.has(cle)) return _entCache.get(cle);
  const pop = populationJE(), actifs = criteresActifs();
  const parEcriture = pop.map(e => ({ e, rem:critRemplis(e) }));
  const vus = new Set();
  const etapes = actifs.map(cr => {
    const seuls = parEcriture.filter(x => x.rem.includes(cr.code));
    const nouveaux = seuls.filter(x => !vus.has(x.e.num));
    for (const x of nouveaux) vus.add(x.e.num);
    return { code:cr.code, lib:cr.lib, seul:seuls.length, ajoute:nouveaux.length,
             cumul:vus.size, masse:seuls.reduce((a, x) => a + mtEcr(x.e), 0) };
  });
  const distribution = {};
  for (const x of parEcriture) distribution[x.rem.length] = (distribution[x.rem.length] || 0) + 1;
  const retenues = parEcriture.filter(x => retenue(x.e));
  const auMoins = [];
  for (let n = 1; n <= Math.max(1, actifs.length); n++){
    const l = parEcriture.filter(x => x.rem.length >= n);
    auMoins.push({ n, n_:l.length, masse:l.reduce((a, x) => a + mtEcr(x.e), 0) });
  }
  const r = { pop, actifs, etapes, distribution, auMoins,
              retenues:retenues.map(x => x.e), parEcriture,
              masseRetenue:retenues.reduce((a, x) => a + mtEcr(x.e), 0),
              masseTotale:pop.reduce((a, e) => a + mtEcr(e), 0) };
  if (_entCache.size > 6) _entCache.clear();
  _entCache.set(cle, r);
  return r;
}

/* ── modèles réutilisables ────────────────────────────────────────────── */
/* Le paramétrage par défaut exige DEUX critères, et ce n'est pas un réglage
   de confort. « Montant supérieur au seuil de planification » retient à lui
   seul 441 écritures sur 1 609 : sur une entreprise dont la facture médiane
   approche le seuil, ce critère décrit un tiers du grand livre, il ne désigne
   rien. Un signal isolé n'est pas un signal ; ce qui mérite d'être lu, c'est
   ce que plusieurs signaux désignent ensemble. Le nombre qui en résulte est
   une conséquence, pas une cible — l'entonnoir affiche ce que donnerait
   « au moins un ». */
const MODELES_LIVRES = [
  { nom:'Test des écritures — paramétrage courant',
    crit:{ rond:true, weekend:true, apres_cloture:true, direction:true, gros:true, sans_piece:true },
    params:{}, combi:{ mode:'auN', n:2, expr:'' } },
  { nom:'Écritures de clôture',
    crit:{ apres_cloture:true, derniers_jours:true, od:true, libelle:true },
    params:{ derniers_jours:{ n:15 } }, combi:{ mode:'auN', n:2, expr:'' } },
  { nom:'Ciblé — manipulation du résultat',
    crit:{ rond:true, direction:true, combinaison:true, apres_cloture:true, libelle:true },
    params:{ rond:{ pas:100000, plancher:1000000 } },
    combi:{ mode:'expression', expr:'direction ET (rond OU combinaison OU apres_cloture)' } },
];
function modelesJE(){ return [...MODELES_LIVRES, ...(S.jeModeles || [])]; }
function appliquerModele(nom){
  const m = modelesJE().find(x => x.nom === nom); if (!m) return;
  S.jeCrit = { ...m.crit };
  S.jeParams = JSON.parse(JSON.stringify(m.params || {}));
  S.jeCombi = { ...m.combi };
  _entCache.clear();
  logEvent('modèle de critères appliqué', nom,
           Object.keys(S.jeCrit).filter(k => S.jeCrit[k]).length + ' critère(s) actif(s)');
}
function enregistrerModele(nom){
  if (!nom.trim()) return { ok:false, why:'un modèle sans nom ne se retrouve pas' };
  if (modelesJE().some(m => m.nom === nom.trim())) return { ok:false, why:'un modèle porte déjà ce nom' };
  S.jeModeles.push({ nom:nom.trim(), crit:{ ...S.jeCrit },
    params:JSON.parse(JSON.stringify(S.jeParams || {})), combi:{ ...combiJE() },
    crees:JSON.parse(JSON.stringify(S.jeCrees || [])) });
  logEvent('modèle de critères enregistré', nom.trim(),
           criteresActifs().length + ' critère(s) · ' + MODES_COMBI[combiJE().mode].lib);
  return { ok:true };
}
function creerCritereJE(forme, nom){
  const f = FORMES_JE[forme]; if (!f) return { ok:false, why:'forme inconnue' };
  const code = 'x_' + forme + '_' + ((S.jeCrees || []).length + 1);
  const params = {};
  for (const p of f.params) params[p.code] = p.def;
  S.jeCrees.push({ code, forme, nom:nom.trim() || f.nom(params) });
  S.jeParams[code] = params;
  S.jeCrit[code] = true;
  _entCache.clear();
  logEvent('critère créé', S.jeCrees[S.jeCrees.length - 1].nom, 'forme « ' + f.lib + ' »');
  return { ok:true, code };
}
function supprimerCritereJE(code){
  S.jeCrees = (S.jeCrees || []).filter(c => c.code !== code);
  delete S.jeCrit[code]; delete S.jeParams[code];
  _entCache.clear();
}

/* ═══ 40. VUE « TEST DES ÉCRITURES » ═══════════════════════════════════════ */
function vueJE(){
  const ent = entonnoir(), c = combiJE();
  const ex = c.mode === 'expression' ? evalExpr(c.expr, []) : { ok:true };
  return entete('Test des écritures', 'transverse : il porte sur tout le grand livre, pas sur un poste') +
    cite('Un journal entry testing sem-automatisé, un agent IA pré-rempli des tests qui vont faire ressortir des écritures dont il faudra demander les justificatifs au client, un être humain auditeur doit venir valider les paramètres puis l’agent IA sélectionne automatiquement sur le GL les écritures.') +
    blocCriteres(ent) +
    blocCombinaison(c, ex, ent) +
    blocEntonnoir(ent) +
    blocRetenues(ent) +
    blocEcartsHors('je');
}

function champParam(code, pr){
  const v = paramsJE(code)[pr.code];
  const val = pr.type === 'euros' ? (v / 100).toFixed(2).replace('.', ',')
            : pr.type === 'liste' ? (Array.isArray(v) ? v.join(', ') : v) : v;
  const large = pr.type === 'liste' ? ' style="width:320px"' : '';
  return `<label class="prm"><span>${esc(pr.lib)}${pr.type === 'euros' ? ' (€)' : pr.type === 'heure' ? ' (h)' : ''}</span>
    <input class="cell ${pr.type === 'liste' || pr.type === 'texte' ? 'txt' : ''}" data-jep="${code}|${pr.code}|${pr.type}"
      value="${esc(val)}"${large}></label>`;
}

function blocCriteres(ent){
  const carte = c => {
    const actif = critereActif(c.code), n = c.indispo ? null : ent.etapes.find(e => e.code === c.code);
    return `<div class="crit ${c.indispo ? 'off' : ''}">
      <div class="m">
        <label class="chk"><input type="checkbox" data-je="${c.code}" ${actif ? 'checked' : ''} ${c.indispo ? 'disabled' : ''}>
          <span><b>${esc(c.lib)}</b></span></label>
        ${c.marque ? `<span class="pill warn">${esc(c.marque)}</span>` : ''}
        ${c.cree ? `<span class="tag">créé</span><button class="btn mini sec" data-jesup="${c.code}">retirer</button>` : ''}
        ${n ? `<span class="cnt">${n.seul}</span>` : ''}
      </div>
      <div class="txt">${esc(c.quoi)}</div>
      ${c.params.length ? `<div class="row">${c.params.map(pr => champParam(c.code, pr)).join('')}</div>` : ''}
      ${c.note ? `<div class="callout warn">${esc(c.note)}</div>` : ''}
      ${c.indispo ? `<div class="callout"><b>Indisponible sur ce jeu de données.</b> ${esc(c.indispo)}</div>` : ''}
    </div>`;
  };
  /* Trois groupes : ce qui est en service, ce qui est disponible, ce qui ne
     peut pas tourner ici. Seize fiches d'un bloc, c'est la moitié de l'écran
     pour un réglage qu'on ne touche qu'une fois. */
  const tous = tousCriteresJE();
  const actifs = tous.filter(c => critereActif(c.code));
  const dispo = tous.filter(c => !critereActif(c.code) && !c.indispo);
  const indispo = tous.filter(c => c.indispo);
  const grille = l => `<div class="crits">${l.map(carte).join('')}</div>`;
  const formes = Object.entries(FORMES_JE).map(([k, f]) => `<option value="${k}">${esc(f.lib)}</option>`).join('');
  return blk('Critères', criteresActifs().length + ' actif(s) sur ' + tousCriteresJE().length,
    `<div class="row">
      <label class="chk"><input type="checkbox" id="je-an" ${S.jeSansAN ? 'checked' : ''}>
        <span>exclure les à-nouveaux</span><span class="cnt">${lg().entries.filter(e => e.journal === 'AN').length}</span></label>
      <div class="ctrl"><label>Modèle</label>
        <select id="je-modele"><option value="">— appliquer un modèle —</option>
          ${modelesJE().map(m => `<option value="${esc(m.nom)}">${esc(m.nom)}</option>`).join('')}</select></div>
      <div class="ctrl"><label>Enregistrer le paramétrage courant</label>
        <input type="text" id="je-mnom" placeholder="nom du modèle"></div>
      <div class="ctrl"><label>&nbsp;</label><button class="btn sec" id="je-msave">enregistrer</button></div>
    </div>
    ${S.jeErreur ? `<div class="callout bad">${esc(S.jeErreur)}</div>` : ''}
    ${repli('plan.je/crit/actifs', 'Critères en service', actifs.length + ' critère(s)',
      grille(actifs), 0)}
    ${repli('plan.je/crit/dispo', 'Critères disponibles, non retenus', dispo.length + ' critère(s)',
      grille(dispo), 0)}
    ${indispo.length ? repli('plan.je/crit/indispo', 'Critères que ce jeu de données ne permet pas',
      indispo.length + ' critère(s)', grille(indispo), 0) : ''}
    <div class="row" style="margin-top:10px">
      <div class="ctrl"><label>Créer un critère — forme</label>
        <select id="je-forme">${formes}</select></div>
      <div class="ctrl"><label>Nom (facultatif)</label><input type="text" id="je-cnom" placeholder="nom du critère"></div>
      <div class="ctrl"><label>&nbsp;</label><button class="btn sec" id="je-creer">créer</button></div>
    </div>
    <p class="note">Un critère se règle, se désactive et se crée. Le compteur à droite de chaque critère est
    le nombre d’écritures qu’il retient <b>à lui seul</b> ; ce qu’il apporte réellement se lit dans l’entonnoir.</p>`);
}

function blocCombinaison(c, ex, ent){
  const codes = criteresActifs().map(x => x.code);
  return blk('Logique de combinaison', MODES_COMBI[c.mode].lib,
    `<div class="row">
      <div class="ctrl"><label>Mode</label>
        <select id="je-mode">${Object.entries(MODES_COMBI).map(([k, m]) =>
          `<option value="${k}" ${c.mode === k ? 'selected' : ''}>${esc(m.lib)}</option>`).join('')}</select></div>
      ${c.mode === 'auN' ? `<div class="ctrl"><label>N — nombre de critères exigés</label>
        <input class="cell" id="je-n" value="${c.n}"></div>` : ''}
      ${c.mode === 'expression' ? `<div class="ctrl" style="flex:1 1 420px"><label>Expression — ET, OU, NON, parenthèses</label>
        <input class="cell txt" id="je-expr" value="${esc(c.expr)}" placeholder="direction ET (rond OU apres_cloture)"></div>` : ''}
    </div>
    <p class="note">${esc(MODES_COMBI[c.mode].d)}. Le paramétrage livré exige <b>deux critères</b> :
    « montant supérieur au seuil de planification » retient à lui seul ${ent.etapes.find(x => x.code === 'gros') ? ent.etapes.find(x => x.code === 'gros').seul : '—'}
    écritures sur ${ent.pop.length}, parce que la facture médiane de cette entreprise approche le seuil.
    Un signal isolé n’est pas un signal. Le nombre finalement retenu est une conséquence de cette règle,
    pas une cible — l’entonnoir montre ce que donnerait chaque valeur de N.</p>
    ${c.mode === 'expression' ? (ex.ok
      ? `<div class="callout">Expression valide. Codes utilisables : ${codes.map(x => `<span class="mono">${esc(x)}</span>`).join(' · ')}.</div>`
      : `<div class="callout bad"><b>Expression refusée :</b> ${esc(ex.why)}.
         Codes utilisables : ${codes.map(x => `<span class="mono">${esc(x)}</span>`).join(' · ')}.
         Tant qu’elle est refusée, aucune écriture n’est retenue — plutôt qu’un résultat faux.</div>`) : ''}`);
}

function blocEntonnoir(ent){
  const pop = ent.pop.length;
  const rows = ent.etapes.map(e => ({
    c:`<b>${esc(e.lib)}</b>`,
    s:String(e.seul),
    p:pct(e.seul / pop, 1),
    a:e.ajoute ? String(e.ajoute) : '<span style="color:var(--attention)">0</span>',
    cu:String(e.cumul),
    m:eur0(e.masse),
  }));
  const vides = ent.etapes.filter(e => e.seul === 0);
  const redondants = ent.etapes.filter(e => e.seul > 0 && e.ajoute === 0);
  return blk('Entonnoir', pop + ' écritures au départ',
    `<div class="kv">
      <span class="k">Population de départ</span><span class="v">${pop} écritures</span>
      <span class="k">Périmètre</span><span class="v" style="font-family:var(--sans)">grand livre v${S.version}${S.jeSansAN ? ', à-nouveaux exclus' : ', à-nouveaux compris'}</span>
      <span class="k">Masse de la population</span><span class="v">${eur0(ent.masseTotale)}</span>
      <span class="k">Union de tous les critères</span><span class="v">${ent.etapes.length ? ent.etapes[ent.etapes.length - 1].cumul : 0} écritures</span>
    </div>
    ${table([{k:'c',t:'Critère, dans l’ordre d’application',cls:'wrapcell'},{k:'s',t:'Retient seul',n:1},
             {k:'p',t:'Part de la population',n:1},{k:'a',t:'Ajoute',n:1},{k:'cu',t:'Cumul',n:1},
             {k:'m',t:'Masse retenue',n:1}], rows)}
    <p class="note">La colonne « cumul » n’est pas une somme : c’est le nombre d’écritures distinctes
    désignées par ce critère ou par l’un des précédents. Sa dernière valeur est l’union de tous les critères.</p>
    ${vides.length ? `<div class="callout warn"><b>${vides.length} critère(s) ne retiennent aucune écriture</b>
      sur cette population : ${vides.map(e => esc(e.lib)).join(', ')}. Soit le réglage est trop
      serré, soit la donnée qu’ils cherchent n’existe pas dans ce fichier.</div>` : ''}
    ${redondants.length ? `<div class="callout warn"><b>${redondants.length} critère(s) n’ajoutent rien</b>
      que les précédents n’avaient pas déjà désigné : ${redondants.map(e => esc(e.lib)).join(', ')}.
      Ils retiennent des écritures, mais aucune qui leur soit propre.</div>` : ''}
    <h3>Écritures par nombre de critères remplis</h3>
    ${table([{k:'n',t:'Critères remplis'},{k:'e',t:'Écritures',n:1},{k:'p',t:'Part',n:1},
             {k:'c',t:'Au moins ce nombre',n:1},{k:'m',t:'Masse « au moins »',n:1}],
      [{ n:'aucun', e:String(ent.distribution[0] || 0), p:pct((ent.distribution[0] || 0) / pop, 1),
         c:String(pop), m:eur0(ent.masseTotale) },
       ...ent.auMoins.map(x => ({ n:String(x.n), e:String(ent.distribution[x.n] || 0),
         p:pct((ent.distribution[x.n] || 0) / pop, 1), c:String(x.n_), m:eur0(x.masse) }))])}
    <p class="note">Les deux dernières colonnes sont cumulatives : « au moins ce nombre » compte les
    écritures qui remplissent ce nombre de critères ou davantage. Aucune ligne n’est un total.</p>
    <p class="note">C’est cette table qui répond à « combien d’écritures faut-il vraiment lire ». Un nombre
    isolé — « 457 écritures en journal d’OD » — ne dit ni ce qu’il ajoute aux autres critères, ni combien
    d’écritures plusieurs signaux désignent ensemble.</p>`);
}

const JE_PAR_PAGE = 60;
function blocRetenues(ent){
  const sel = ent.retenues;
  const tout = S.jeTout;
  const vus = tout ? sel : sel.slice(0, JE_PAR_PAGE);
  const rem = new Map(ent.parEcriture.map(x => [x.e.num, x.rem]));
  const rows = vus.map(e => ({
    num:`<span class="mono">${e.num}</span>`, d:`<span class="mono">${frDate(e.date)}</span>`, j:e.journal,
    l:esc(e.libelle), m:eur(mtEcr(e)), s:esc(e.saisiePar),
    mo:(rem.get(e.num) || []).map(k => `<span class="tag">${esc((critereJEDef(k) || {}).lib || k)}</span>`).join(' '),
    nt:boutonNote('JE', 'je', e.num, 'Écriture ' + e.num),
  }));
  return blk('Écritures retenues', sel.length + ' sur ' + ent.pop.length,
    `<div class="callout ${sel.length > 200 ? 'warn' : ''}"><b>${sel.length} écriture(s) retenue(s)</b>
      sur ${ent.pop.length} (${pct(sel.length / ent.pop.length, 1)} de la population) — masse
      ${eur(ent.masseRetenue)}, soit ${pct(ent.masseTotale ? ent.masseRetenue / ent.masseTotale : 0, 1)} de la masse.
      ${sel.length > 200 ? 'À ce volume, la sélection n’est plus lisible : resserrez les paramètres ou exigez plusieurs critères.' : ''}
      <span class="tag det">déterministe</span> Ce sont des prédicats, pas un agent.</div>
    ${table([{k:'num',t:'Écriture'},{k:'d',t:'Date'},{k:'j',t:'Jrn'},{k:'l',t:'Libellé',cls:'wrapcell'},
             {k:'m',t:'Montant',n:1},{k:'s',t:'Saisie par'},{k:'mo',t:'Critères remplis',cls:'wrapcell'},{k:'nt',t:''}], rows)}
    ${sel.length > vus.length ? `<button class="btn mini sec" id="je-tout">afficher les ${sel.length} écritures</button>`
      : tout && sel.length > JE_PAR_PAGE ? '<button class="btn mini sec" id="je-tout">replier</button>' : ''}`);
}
