/* ═══ 33. LE TRAVAIL — OBJET UNIQUE DE LA MISSION ══════════════════════════
   « Détermination de la matérialité », « test de détail sur le chiffre
   d'affaires » et « événements postérieurs » sont trois instances du même
   objet. Ajouter des responsabilités aux seules sections aurait créé deux
   structures parallèles ; les procédures construites au lot précédent sont
   donc MIGRÉES en travaux de nature « procédure de section », pas dupliquées :
   leur casier d'exécution (population, germe, papier) reste dans proc(), leur
   casier d'organisation (affectation, heures, statut) vit ici.
   ═══════════════════════════════════════════════════════════════════════ */

const PHASES = [
  { id:'planification',    lib:'Planification' },
  { id:'controle_interne', lib:'Contrôle interne' },
  { id:'bilan',            lib:'Bilan' },
  { id:'resultat',         lib:'Compte de résultat' },
  { id:'achevement',       lib:'Achèvement' },
];
const NATURE_TRAVAIL = {
  planification:'planification', controle_interne:'contrôle interne',
  section:'procédure de section', achevement:'achèvement',
};

/* ── barème de budget : une décision affichée, pas une constante cachée ──── */
const BAREME_HEURES = [
  { nature:'planification', lib:'Travail de planification', base:4, parElement:0 },
  { nature:'controle_interne', lib:'Travail de contrôle interne', base:6, parElement:0 },
  { nature:'section', ech:false, lib:'Procédure de section sans sélection', base:2, parElement:0 },
  { nature:'section', ech:true, lib:'Procédure de section avec sélection', base:1.5, parElement:0.05 },
  { nature:'achevement', lib:'Travail d’achèvement', base:3, parElement:0 },
];
function baremeDe(t){
  return BAREME_HEURES.find(b => b.nature === t.nature && (b.ech === undefined || b.ech === !!t.ech))
      || BAREME_HEURES[0];
}
function budgetBareme(t){
  const b = baremeDe(t);
  return Math.round((b.base + b.parElement * (t.elements || 0)) * 4) / 4;   // au quart d'heure
}

/* ── règle de niveau de revue : elle DÉCOULE du risque ───────────────────── */
const REGLE_REVUE = [
  { si:'Procédure répondant à une assertion évaluée « élevé »', niveau:2 },
  { si:'Section dont le risque le plus élevé est « élevé »', niveau:2 },
  { si:'Détermination de la matérialité, arrêté de l’opinion, clôture du dossier', niveau:2 },
  { si:'Tout autre travail', niveau:1 },
];
const NIVEAU_REVUE_LIB = { 1:'revue de premier niveau (réviseur)', 2:'revue de second niveau (associé)' };
const TRAVAUX_NIVEAU2 = ['PLAN-01', 'ACH-05', 'ACH-08'];
function niveauRevueExige(t){
  if (TRAVAUX_NIVEAU2.includes(t.code)) return 2;
  if (t.nature === 'section' && t.poste){
    const p = postesCalcules().find(x => x.code === t.poste);
    if (p && t.assertion && niveau(p, t.assertion) === 'eleve') return 2;
    if (p && NIVEAUX[niveauMax(p)] === 'eleve') return 2;
  }
  return 1;
}
function peutReviser(uid, t){
  const u = USERS[uid]; if (!u) return false;
  if (niveauRevueExige(t) === 2) return u.role === 'associe';
  return u.role === 'reviseur' || u.role === 'associe';
}

/* ── travaux de planification et d'achèvement : liste fixe ───────────────── */
const TRAVAUX_FIXES = [
  { code:'PLAN-01', nature:'planification', phase:'planification', intitule:'Détermination de la matérialité', vue:'plan.mat' },
  { code:'PLAN-02', nature:'planification', phase:'planification', intitule:'Import du grand livre et rapprochement à la balance', vue:'plan.rappro' },
  { code:'PLAN-03', nature:'planification', phase:'planification', intitule:'Scoping des postes', vue:'plan.scope' },
  { code:'PLAN-04', nature:'planification', phase:'planification', intitule:'Revue analytique préliminaire', vue:'plan.ra' },
  { code:'PLAN-05', nature:'planification', phase:'planification', intitule:'Tenue du registre des facteurs de risque', vue:'plan.facteurs' },
  { code:'PLAN-06', nature:'planification', phase:'planification', intitule:'Test des écritures', vue:'plan.je' },
  { code:'PLAN-07', nature:'planification', phase:'planification', intitule:'Exhaustivité des circularisations', vue:'plan.circ' },
  { code:'ACH-01', nature:'achevement', phase:'achevement', intitule:'Pointage des états financiers', vue:'ach.pointage' },
  { code:'ACH-02', nature:'achevement', phase:'achevement', intitule:'Revue analytique finale', vue:'ach.ra' },
  { code:'ACH-03', nature:'achevement', phase:'achevement', intitule:'Événements postérieurs à la clôture', vue:'ach.evenements' },
  { code:'ACH-04', nature:'achevement', phase:'achevement', intitule:'Continuité d’exploitation', vue:'ach.continuite' },
  { code:'ACH-05', nature:'achevement', phase:'achevement', intitule:'Anomalies non corrigées et incidence sur l’opinion', vue:'ach.anomalies' },
  { code:'ACH-06', nature:'achevement', phase:'achevement', intitule:'Lettre d’affirmation', vue:'ach.affirmation' },
  { code:'ACH-07', nature:'achevement', phase:'achevement', intitule:'Communication aux organes de gouvernance', vue:'ach.gouvernance' },
  { code:'ACH-08', nature:'achevement', phase:'achevement', intitule:'Assemblage et clôture du dossier', vue:'ach.cloture' },
];

/** Casier d'organisation d'un travail — affectation, heures, statut. */
function trav(code){
  if (!S.travaux[code]) S.travaux[code] = {
    preparateur:null, reviseur:null, heuresBudget:null, heuresReel:0,
    statut:'a_faire', acheve:null, revu:null,
  };
  return S.travaux[code];
}
const STATUT_TRAVAIL = { a_faire:'à faire', en_cours:'en cours', acheve:'achevé', revu:'revu' };

/** La liste complète des travaux de la mission, dérivée. */
const _travCache = { cle:'', v:null };
function travaux(){
  const s = seuils();
  const cle = JSON.stringify([s.PM, s.CTT, Object.keys(S.scopingOverride), S.decisionsFacteurs, S.sections && Object.keys(S.sections).length]);
  if (_travCache.cle === cle && _travCache.v) return _travCache.v.map(t => ({ ...t, ...trav(t.code), code:t.code }));
  const out = [];
  for (const f of TRAVAUX_FIXES){
    out.push({ ...f, echeance:f.phase === 'planification' ? '2026-02-20' : addDays(DATE_RAPPORT, -10) });
  }
  for (const p of postesEnPerimetre()){
    const phase = masseDe(p);
    for (const pr of proceduresRequises(p)){
      const e = pr.ech ? echantillonProc(p, pr) : null;
      out.push({
        code:'SEC-' + p.code + '-' + pr.code, nature:'section', phase,
        intitule:pr.lib, poste:p.code, posteLib:p.lib, proc:pr.code,
        assertion:pr.a, ech:pr.ech, elements:e ? e.retenus.length : 0,
        wpRef:procRef(p, pr), vue:'fsli:' + p.code, echeance:'2026-03-25',
      });
    }
  }
  const base = out.map(t => ({ ...t, niveauRevue:niveauRevueExige(t) }));
  base.forEach(t => { t.budgetBareme = budgetBareme(t); });
  _travCache.cle = cle; _travCache.v = base;
  return base.map(t => ({ ...t, ...trav(t.code), code:t.code, niveauRevue:t.niveauRevue, budgetBareme:t.budgetBareme }));
}
function budget(t){ return t.heuresBudget === null || t.heuresBudget === undefined ? t.budgetBareme : t.heuresBudget; }
function travauxDe(code){ return travaux().filter(t => t.poste === code); }
function travailDe(code){ return travaux().find(t => t.code === code); }
function hFmt(h){ return (Math.round(h * 4) / 4).toFixed(2).replace('.', ',') + NBSP + 'h'; }

/* ── règles déterministes sur les responsabilités ─────────────────────────
   Préparateur et réviseur sont obligatoirement deux personnes différentes —
   refusé par le système, comme la clôture d'une note par son auteur.       */
function affecter(code, role, uid){
  const t = travailDe(code); if (!t) return { ok:false, why:'travail inconnu' };
  const st = trav(code);
  const autre = role === 'preparateur' ? st.reviseur : st.preparateur;
  if (uid && uid === autre) return { ok:false, why:'le préparateur et le réviseur doivent être deux personnes différentes' };
  if (role === 'reviseur' && uid && !peutReviser(uid, t))
    return { ok:false, why:'ce travail exige une ' + NIVEAU_REVUE_LIB[t.niveauRevue] };
  st[role] = uid || null;
  logEvent('affectation', t.code + ' — ' + t.intitule,
           (role === 'preparateur' ? 'préparateur : ' : 'réviseur : ') + (uid ? USERS[uid].nom : 'retiré'));
  return { ok:true };
}
/** Un travail ne passe « achevé » que par son préparateur, « revu » que par son réviseur. */
function changerStatut(code, statut){
  const t = travailDe(code), st = trav(code);
  if (statut === 'acheve' && st.preparateur !== S.moi) return { ok:false, why:'seul le préparateur affecté peut achever ce travail' };
  if (statut === 'revu'){
    if (st.reviseur !== S.moi) return { ok:false, why:'seul le réviseur affecté peut porter ce travail « revu »' };
    if (st.statut !== 'acheve') return { ok:false, why:'le travail doit d’abord être achevé par son préparateur' };
  }
  st.statut = statut;
  if (statut === 'acheve') st.acheve = { par:S.moi, t:tick() };
  if (statut === 'revu') st.revu = { par:S.moi, t:tick() };
  logEvent('travail ' + STATUT_TRAVAIL[statut], t.code + ' — ' + t.intitule, USERS[S.moi].nom);
  return { ok:true };
}
function obstaclesTravaux(code){
  const o = [];
  const l = travauxDe(code);
  const sansPrep = l.filter(t => !t.preparateur), sansRev = l.filter(t => !t.reviseur);
  if (sansPrep.length) o.push(`${sansPrep.length} travail/travaux sans préparateur affecté`);
  if (sansRev.length) o.push(`${sansRev.length} travail/travaux sans réviseur affecté`);
  const nonRevus = l.filter(t => t.preparateur && t.reviseur && t.statut !== 'revu');
  if (nonRevus.length) o.push(`${nonRevus.length} travail/travaux non revus`);
  return o;
}

/* ── ligne d'affectation, réutilisée partout ─────────────────────────────── */
function ligneAffectation(t){
  const st = trav(t.code);
  const sel = (role, val) => `<select class="cell txt" data-aff="${t.code}|${role}" style="width:150px">
      <option value="">— non affecté —</option>
      ${Object.entries(USERS).map(([k, u]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(u.nom)}</option>`).join('')}
    </select>`;
  return { prep:sel('preparateur', st.preparateur), rev:sel('reviseur', st.reviseur) };
}
function boutonsStatut(t){
  const st = trav(t.code);
  if (st.statut === 'revu') return `<span class="pill">revu par ${esc(USERS[st.revu.par].nom)}</span>`;
  const b = [];
  if (st.statut !== 'acheve' && st.preparateur === S.moi) b.push(`<button class="btn mini" data-tstat="${t.code}|acheve">achever</button>`);
  if (st.statut === 'acheve'){
    b.push(`<span class="pill">achevé par ${esc(USERS[st.acheve.par].nom)}</span>`);
    if (st.reviseur === S.moi) b.push(`<button class="btn mini" data-tstat="${t.code}|revu">porter « revu »</button>`);
  }
  if (!b.length) b.push(`<span class="smallcaps">${st.statut === 'acheve' ? 'en attente de revue' : 'réservé au préparateur affecté'}</span>`);
  return b.join(' ');
}

/* ═══ 34. PROGRAMME DE TRAVAIL — livrable du dossier ═══════════════════════ */
function vueProgramme(){
  const f = S.filtreTrav, l = travaux();
  const vus = l.filter(t => (!f.phase || t.phase === f.phase) && (!f.nature || t.nature === f.nature)
    && (!f.personne || t.preparateur === f.personne || t.reviseur === f.personne)
    && (!f.statut || t.statut === f.statut)
    && (!f.q || (t.code + ' ' + t.intitule + ' ' + (t.posteLib || '')).toLowerCase().includes(f.q.toLowerCase())));
  const rows = vus.map(t => {
    const a = ligneAffectation(t);
    return {
      c:`<span class="mono">${t.code}</span>`,
      n:`<span class="tag">${esc(NATURE_TRAVAIL[t.nature])}</span>`,
      i:`<b>${esc(t.intitule)}</b>${t.posteLib ? '<div class="smallcaps">' + esc(t.posteLib) + '</div>' : ''}`,
      r:esc(PHASES.find(x => x.id === t.phase).lib),
      as:t.assertion ? esc(libAssertion(t.assertion)) : '<span class="smallcaps">—</span>',
      p:a.prep, v:a.rev,
      nr:`<span class="pill ${t.niveauRevue === 2 ? 'warn' : ''}">niveau ${t.niveauRevue}</span>`,
      e:`<span class="mono">${frDate(t.echeance)}</span>`,
      hb:`<input class="cell" data-hb="${t.code}" value="${budget(t).toFixed(2).replace('.', ',')}">`,
      hr:`<input class="cell" data-hr="${t.code}" value="${t.heuresReel.toFixed(2).replace('.', ',')}">`,
      s:boutonsStatut(t),
      w:t.wpRef ? `<span class="mono">${esc(t.wpRef)}</span>` : '<span class="smallcaps">—</span>',
      g:t.vue ? `<button class="btn mini sec" data-gotrav="${esc(t.vue)}">ouvrir</button>` : '',
    };
  });
  const tb = vus.reduce((a, t) => a + budget(t), 0), tr = vus.reduce((a, t) => a + t.heuresReel, 0);
  return entete('Programme de travail', 'tout travail de la mission est le même objet — livrable du dossier') +
    blk('Filtres', vus.length + ' / ' + l.length,
      `<div class="row">
        <div class="ctrl"><label>Phase</label><select id="ft-phase"><option value="">toutes</option>
          ${PHASES.map(x => `<option value="${x.id}" ${f.phase === x.id ? 'selected' : ''}>${esc(x.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>Nature</label><select id="ft-nature"><option value="">toutes</option>
          ${Object.entries(NATURE_TRAVAIL).map(([k, v]) => `<option value="${k}" ${f.nature === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>Personne</label><select id="ft-personne"><option value="">toutes</option>
          ${Object.entries(USERS).map(([k, u]) => `<option value="${k}" ${f.personne === k ? 'selected' : ''}>${esc(u.nom)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>Statut</label><select id="ft-statut"><option value="">tous</option>
          ${Object.entries(STATUT_TRAVAIL).map(([k, v]) => `<option value="${k}" ${f.statut === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="ctrl" style="flex:1 1 180px"><label>Recherche</label>
          <input type="text" id="ft-q" value="${esc(f.q)}" placeholder="code, intitulé, poste"></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn sec" id="ft-imprime">imprimer</button></div>
      </div>`) +
    blk('Règles d’affectation', 'elles découlent du risque',
      table([{k:'s',t:'Cas',cls:'wrapcell'},{k:'n',t:'Revue exigée'}],
        REGLE_REVUE.map(r => ({ s:esc(r.si), n:esc(NIVEAU_REVUE_LIB[r.niveau]) }))) +
      `<p class="note">Le préparateur et le réviseur sont obligatoirement deux personnes différentes.
      Un travail de niveau 2 ne peut être revu que par un associé. Un travail passe « achevé » par son
      préparateur seul, « revu » par son réviseur seul.</p>
      <div class="row"><button class="btn sec" id="tv-auto">affecter les travaux non affectés selon la règle</button>
        ${S.affErreur ? `<span class="pill bad">${esc(S.affErreur)}</span>` : ''}</div>`) +
    blk('Barème de budget', 'base + heures par élément sélectionné',
      table([{k:'l',t:'Nature',cls:'wrapcell'},{k:'b',t:'Base',n:1},{k:'p',t:'Par élément',n:1}],
        BAREME_HEURES.map(b => ({ l:esc(b.lib), b:hFmt(b.base), p:b.parElement ? hFmt(b.parElement) : '—' }))) +
      `<p class="note">Le budget proposé par le barème est modifiable travail par travail : c’est une décision de
      chef de mission, pas une constante.</p>`) +
    blk('Travaux', vus.length + ' · budget ' + hFmt(tb) + ' · réalisé ' + hFmt(tr),
      table([{k:'c',t:'Code'},{k:'n',t:'Nature'},{k:'i',t:'Intitulé',cls:'wrapcell'},{k:'r',t:'Phase'},
             {k:'as',t:'Assertion'},{k:'p',t:'Préparateur'},{k:'v',t:'Réviseur'},{k:'nr',t:'Revue'},
             {k:'e',t:'Échéance'},{k:'hb',t:'Budget',n:1},{k:'hr',t:'Réalisé',n:1},
             {k:'s',t:'Statut',cls:'wrapcell'},{k:'w',t:'Papier'},{k:'g',t:''}], rows,
        { foot:{ c:'Total', hb:hFmt(tb), hr:hFmt(tr) } }));
}

/* ═══ 35. VUE GLOBALE DE LA MISSION ════════════════════════════════════════
   Dans l'ordre des questions d'un chef de mission.
   ═══════════════════════════════════════════════════════════════════════ */
function vueMission(){
  const l = travaux(), postes = postesEnPerimetre();
  /* 1 — avancement par phase et par section */
  const parPhase = PHASES.map(ph => {
    const t = l.filter(x => x.phase === ph.id);
    return { ph, t, acheves:t.filter(x => x.statut === 'acheve').length, revus:t.filter(x => x.statut === 'revu').length };
  });
  /* 2 — charge par personne */
  const charge = Object.entries(USERS).map(([k, u]) => {
    const prep = l.filter(t => t.preparateur === k), rev = l.filter(t => t.reviseur === k);
    return { k, u, prep, rev, b:prep.reduce((a, t) => a + budget(t), 0),
             r:prep.reduce((a, t) => a + t.heuresReel, 0),
             bRev:rev.reduce((a, t) => a + budget(t) * 0.2, 0) };
  });
  const bMoyen = charge.reduce((a, c) => a + c.b, 0) / charge.length;
  /* 3 — notes de revue */
  const notes = S.notes.filter(n => !n.clos);
  /* 4 — facteurs non statués */
  const fp = registre().filter(f => f.statut === 'propose');
  /* 5 — demandes en retard par contact */
  const parContact = {};
  for (const r of S.requetes.filter(retard)){
    const c = S.contacts.find(x => x.id === r.contact); if (!c) continue;
    parContact[c.id] = parContact[c.id] || { c, n:0, items:0, age:0 };
    parContact[c.id].n++;
    parContact[c.id].items += r.items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length;
    parContact[c.id].age = Math.max(parContact[c.id].age, ancienneteRetard(r));
  }
  /* 6 — obstacles au visa agrégés */
  const obst = postes.map(p => ({ p, o:obstaclesVisa(p) })).filter(x => x.o.length);
  /* 7 — jalons */
  const ech = addDays(DATE_RAPPORT, DELAI_ASSEMBLAGE);
  const jours = d => Math.round((Date.parse(d) - Date.parse(S.aujourdhui)) / 86400000);
  const jalons = [
    { j:'Intérim', d:'2026-01-19' }, { j:'Clôture de l’exercice', d:CLOTURE },
    { j:'Réception de la balance définitive', d:'2026-02-16' }, { j:'Date du rapport', d:DATE_RAPPORT },
    { j:'Échéance d’assemblage du dossier', d:ech },
  ];
  const tb = l.reduce((a, t) => a + budget(t), 0), tr = l.reduce((a, t) => a + t.heuresReel, 0);
  return entete('Vue globale de la mission', 'Altiverre SAS — exercice clos le ' + frDate(CLOTURE)) +
    blk('Avancement par phase', l.length + ' travaux · budget ' + hFmt(tb) + ' · réalisé ' + hFmt(tr),
      table([{k:'p',t:'Phase'},{k:'n',t:'Travaux',n:1},{k:'a',t:'Achevés',n:1},{k:'r',t:'Revus',n:1},
             {k:'x',t:'Restants',n:1},{k:'b',t:'Budget',n:1},{k:'e',t:'Réalisé',n:1},{k:'d',t:'Écart',n:1}],
        parPhase.map(x => ({ p:esc(x.ph.lib), n:String(x.t.length), a:String(x.acheves), r:String(x.revus),
          x:String(x.t.length - x.acheves - x.revus),
          b:hFmt(x.t.reduce((a, t) => a + budget(t), 0)), e:hFmt(x.t.reduce((a, t) => a + t.heuresReel, 0)),
          d:hFmt(x.t.reduce((a, t) => a + t.heuresReel - budget(t), 0)) })),
        { foot:{ p:'Total', n:String(l.length), b:hFmt(tb), e:hFmt(tr), d:hFmt(tr - tb) } })) +
    blk('Avancement par section', postes.length + ' sections',
      table([{k:'s',t:'Section',cls:'wrapcell'},{k:'n',t:'Travaux',n:1},{k:'r',t:'Revus',n:1},
             {k:'b',t:'Budget',n:1},{k:'e',t:'Réalisé',n:1},{k:'v',t:'Visa'},{k:'g',t:''}],
        postes.map(p => {
          const t = travauxDe(p.code), st = sec(p.code), o = obstaclesVisa(p);
          return { s:esc(p.lib), n:String(t.length), r:String(t.filter(x => x.statut === 'revu').length),
            b:hFmt(t.reduce((a, x) => a + budget(x), 0)), e:hFmt(t.reduce((a, x) => a + x.heuresReel, 0)),
            v:st.visa ? '<span class="pill">visée</span>' : `<span class="pill ${o.length ? 'bad' : 'warn'}">${o.length || 'prête'}</span>`,
            g:`<button class="btn mini sec" data-open="${p.code}">ouvrir</button>` };
        }))) +
    blk('Charge par personne', 'budget, réalisé, surcharge',
      table([{k:'p',t:'Personne',cls:'wrapcell'},{k:'np',t:'Travaux préparés',n:1},{k:'nr',t:'Travaux à revoir',n:1},
             {k:'b',t:'Budget préparation',n:1},{k:'e',t:'Réalisé',n:1},{k:'d',t:'Écart',n:1},{k:'c',t:'Charge'}],
        charge.map(c => ({ p:`<b>${esc(c.u.nom)}</b><div class="smallcaps">${esc(ROLE_LIB[c.u.role])}</div>`,
          np:String(c.prep.length), nr:String(c.rev.length), b:hFmt(c.b), e:hFmt(c.r), d:hFmt(c.r - c.b),
          c:c.b > bMoyen * 1.3 ? '<span class="pill bad">surcharge</span>'
            : c.b < bMoyen * 0.7 ? '<span class="pill">sous-charge</span>' : '<span class="smallcaps">équilibrée</span>' })),
        { foot:{ p:'Total', np:String(l.filter(t => t.preparateur).length),
                 b:hFmt(charge.reduce((a, c) => a + c.b, 0)), e:hFmt(charge.reduce((a, c) => a + c.r, 0)) } }) +
      `<p class="note">La charge de revue est comptée à 20 % du budget de préparation du travail revu.
      ${l.filter(t => !t.preparateur).length} travail/travaux ne sont affectés à personne.</p>`) +
    blk('Notes de revue ouvertes', notes.length + ' — bloquantes en tête',
      notes.length ? table([{k:'t',t:'Type'},{k:'p',t:'Destinataire'},{k:'a',t:'Ancienneté',n:1},
             {k:'s',t:'Section'},{k:'x',t:'Note',cls:'wrapcell'},{k:'g',t:''}],
        [...notes].sort((a, b) => (TYPES_NOTE[b.type].bloque ? 1 : 0) - (TYPES_NOTE[a.type].bloque ? 1 : 0)
          || ancienneteNote(b) - ancienneteNote(a)).map(n => ({
          t:`<span class="tag ${TYPES_NOTE[n.type].bloque ? 'abs' : ''}">${esc(TYPES_NOTE[n.type].lib)}</span>`,
          p:esc(USERS[n.pour] ? USERS[n.pour].nom : '—'), a:ancienneteNote(n) + ' j',
          s:esc(libFsli(n.ancre.section)), x:esc(n.texte),
          g:`<button class="btn mini sec" data-goanc="${n.id}">objet ↗</button>` })))
        : '<p class="note">Aucune note ouverte.</p>') +
    blk('Facteurs de risque non statués', fp.length,
      fp.length ? table([{k:'i',t:'Facteur'},{k:'s',t:'Sections touchées',cls:'wrapcell'},{k:'p',t:'Pertinence',cls:'wrapcell'},{k:'g',t:''}],
        fp.map(f => ({ i:`<span class="mono">${esc(f.id)}</span>`,
          s:[...new Set(f.cibles.map(c => libFsli(c.fsli)))].map(esc).join(', '),
          p:esc(f.pertinence || '—'),
          g:'<button class="btn mini sec" data-vue="plan.facteurs">registre ↗</button>' })))
        : '<p class="note">Aucun facteur en attente.</p>') +
    blk('Demandes clients en retard', Object.keys(parContact).length + ' contact(s)',
      Object.keys(parContact).length
        ? table([{k:'p',t:'Personne',cls:'wrapcell'},{k:'n',t:'Demandes',n:1},{k:'i',t:'Éléments',n:1},{k:'a',t:'Ancienneté',n:1},{k:'g',t:''}],
            Object.values(parContact).sort((a, b) => b.age - a.age).map(x => ({
              p:`<b>${esc(x.c.nom)}</b><div class="smallcaps">${esc(x.c.societe)}</div>`,
              n:String(x.n), i:String(x.items), a:x.age + ' j ouvrés',
              g:'<button class="btn mini sec" data-vue="pil.requetes">requêtes ↗</button>' })))
        : '<p class="note">Aucune demande en retard.</p>') +
    blk('Obstacles au visa', obst.reduce((a, x) => a + x.o.length, 0) + ' sur ' + obst.length + ' section(s)',
      obst.length ? table([{k:'s',t:'Section'},{k:'o',t:'Obstacles',cls:'wrapcell'},{k:'g',t:''}],
        obst.map(x => ({ s:esc(x.p.lib), o:x.o.map(esc).join(' · '),
          g:`<button class="btn mini sec" data-open="${x.p.code}">ouvrir</button>` })))
        : '<p class="note">Aucun obstacle.</p>') +
    blk('Jalons', jours(ech) >= 0 ? jours(ech) + ' jours avant l’échéance d’assemblage' : 'échéance dépassée',
      table([{k:'j',t:'Jalon'},{k:'d',t:'Date'},{k:'r',t:'Décompte',n:1}],
        jalons.map(x => ({ j:esc(x.j), d:`<span class="mono">${frDate(x.d)}</span>`,
          r:jours(x.d) >= 0 ? 'dans ' + jours(x.d) + ' j' : 'il y a ' + (-jours(x.d)) + ' j' }))) +
      `<p class="note">Échéance d’assemblage : ${DELAI_ASSEMBLAGE} jours après la date du rapport
      (C. com., art. D. 821-186, III et IV). Conservation ${RETENTION_ANS} ans (C. com., art. R. 820-42).</p>`) +
    blk('Export', 'trois périmètres de destinataire',
      `<div class="row">
        ${Object.entries(PERIMETRES).map(([k, v]) => `<button class="btn sec" data-xlsm="${k}">classeur ${esc(v.lib)}</button>`).join('')}
        <button class="btn sec" id="mi-imprime">imprimer</button>
      </div><div id="exp-out"></div>`);
}

/** Phase « contrôle interne » : la structure existe, le module est au lot B. */
function vueCI(){
  return entete('Revues de processus et contrôle interne', 'phase 2 du dossier — module au lot B') +
    `<div class="callout warn">Cette phase n’est pas alimentée. Aucun processus n’est décrit, aucun entretien n’est
    documenté, aucun contrôle n’est testé. Ce qui existe déjà et lui appartient : la procédure « entretien avec le
    responsable du cycle » dans les sections à risque élevé, et le facteur déclaré « contrôle interne non testé ou
    jugé non fiable » qui pèse sur l’exhaustivité.</div>` +
    blk('Structure prévue', 'lot B',
      `<ol style="margin:0 0 0 18px;padding:0">
        <li>Description structurée du processus — étapes, acteurs, systèmes, entrées/sorties, contrôles rattachés
        avec fréquence et propriétaire — en <b>données</b>, le diagramme étant généré ;</li>
        <li>version N et version N-1, avec la différence exacte et chaque changement à statuer ;</li>
        <li>entretien : participants, date, support, compréhension documentée ;</li>
        <li>transcript : écarts candidats entre ce qui est dit et ce qui est documenté, en cherchant d’abord les
        omissions ; chaque écart devient une question au client ou un facteur de risque, après confirmation ;</li>
        <li>tout changement statué « significatif » lève un facteur de risque sur les postes concernés.</li>
      </ol>`) +
    blk('Précaution juridique', 'à vérifier avant écriture de code',
      `<p class="note">Enregistrer une réunion client suppose le consentement explicite des participants, et un
      transcript contient des données personnelles : étape de consentement tracée, durée de conservation, et
      fonctionnement du module sans enregistrement. L’état du droit applicable n’a pas pu être vérifié sur le texte
      primaire depuis cet environnement : le point est porté <span class="tag abs">UNVERIFIED</span> et aucune
      constante ne sera écrite tant qu’il ne l’est pas.</p>`);
}
