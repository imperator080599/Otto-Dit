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
  manuel:'ajouté à la main',
};

/* ═══ JALONS DE MISSION ════════════════════════════════════════════════════
   Une échéance par travail, saisie cent fois, n'est pas un planning : c'est
   une corvée qui finit remplie au hasard. On pose QUATRE dates — l'intérim,
   l'intervention finale, la date du rapport, et l'échéance d'assemblage qui
   s'en déduit — et l'échéance de chaque travail s'en déduit à son tour, par
   une règle écrite. Chaque échéance reste modifiable travail par travail, et
   en lot sur la sélection : la règle propose, elle n'impose pas.

   L'échéance d'assemblage n'est PAS saisie : c'est un délai légal compté
   depuis la date du rapport. Une date qu'on peut taper à la main est une date
   qu'on peut taper fausse.                                                 */
const JALONS = [
  { id:'interim',    lib:'Intervention intérimaire', d:'ce qui se fait avant la clôture : contrôle interne, tests d’opérations sur la période écoulée' },
  { id:'final',      lib:'Intervention finale',      d:'les travaux sur les comptes arrêtés' },
  { id:'rapport',    lib:'Date du rapport',          d:'la date de signature' },
  { id:'assemblage', lib:'Échéance d’assemblage',    d:'délai légal compté depuis la date du rapport — déduite, jamais saisie',
    derive:() => addDays(S.jalons.rapport, DELAI_ASSEMBLAGE) },
];
function jalon(id){
  const j = JALONS.find(x => x.id === id);
  return j && j.derive ? j.derive() : S.jalons[id];
}
function fixerJalon(id, date){
  const j = JALONS.find(x => x.id === id);
  if (!j || j.derive) return { ok:false, why:'cette date se déduit, elle ne se saisit pas' };
  if (!date) return { ok:false, why:'une date vide n’est pas un jalon' };
  const av = S.jalons[id];
  S.jalons[id] = date;
  _travCache.cle = '';
  logEvent('jalon de mission déplacé', j.lib, frDate(av) + ' → ' + frDate(date));
  return { ok:true };
}
/* Ce dont chaque travail dépend. La règle est lisible et se lit à l'écran. */
const REGLE_ECHEANCE = [
  { cas:'Assemblage et clôture du dossier', jalon:'assemblage', dec:0,
    quoi:t => t.code === 'ACH-08' },
  { cas:'Travail de planification',   jalon:'interim', dec:0,  quoi:t => t.phase === 'planification' },
  { cas:'Travail de contrôle interne', jalon:'interim', dec:0, quoi:t => t.phase === 'controle_interne' },
  { cas:'Procédure de section',       jalon:'final',   dec:0,  quoi:t => t.phase === 'bilan' || t.phase === 'resultat' },
  { cas:'Travail d’achèvement',       jalon:'rapport', dec:-10, quoi:() => true },
];
function regleEcheance(t){ return REGLE_ECHEANCE.find(r => r.quoi(t)) || REGLE_ECHEANCE[REGLE_ECHEANCE.length - 1]; }
function echeanceDeduite(t){
  const r = regleEcheance(t);
  return addDays(jalon(r.jalon), r.dec);
}
/** L'échéance retenue : celle qu'on a écrite, sinon celle que la règle déduit. */
function echeanceDe(t){
  const st = trav(t.code);
  return st.echeance || echeanceDeduite(t);
}
function fixerEcheance(code, date){
  const st = trav(code), t = travailDe(code);
  if (!t) return { ok:false, why:'travail inconnu' };
  const av = echeanceDe(t);
  st.echeance = date || null;
  logEvent('échéance modifiée', t.code + ' — ' + t.intitule,
           frDate(av) + ' → ' + frDate(echeanceDe(t)) + (date ? '' : ' (retour à la règle)'));
  return { ok:true };
}
function fixerEcheanceEnLot(codes, date){
  let n = 0;
  for (const c of codes){ if (fixerEcheance(c, date).ok) n++; }
  return { n };
}

/* ── barème de budget : une décision affichée, pas une constante cachée ──── */
const BAREME_HEURES = [
  { nature:'planification', lib:'Travail de planification', base:4, parElement:0 },
  { nature:'controle_interne', lib:'Travail de contrôle interne', base:6, parElement:0 },
  { nature:'section', ech:false, lib:'Procédure de section sans sélection', base:2, parElement:0 },
  { nature:'section', ech:true, lib:'Procédure de section avec sélection', base:1.5, parElement:0.05 },
  { nature:'achevement', lib:'Travail d’achèvement', base:3, parElement:0 },
  { nature:'manuel', lib:'Travail ajouté à la main', base:3, parElement:0 },
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
    echeance:null,      // null = celle que la règle des jalons déduit
    sansObjet:null,     // { motif, par, t } — jamais une suppression
  };
  return S.travaux[code];
}
/* ── « sans objet » plutôt qu'une suppression ────────────────────────────
   Un travail qui ne s'applique pas à ce dossier ne s'efface pas : il se
   MARQUE, avec un motif écrit. Un programme dont on a retiré des lignes ne
   dit pas pourquoi elles ne sont plus là ; un programme qui les garde
   barrées le dit. Le motif est obligatoire — sans lui, la marque est
   indistinguable d'une erreur de manipulation. */
function sansObjet(code){ return trav(code).sansObjet; }
function marquerSansObjet(code, motif){
  const t = travailDe(code); if (!t) return { ok:false, why:'travail inconnu' };
  const st = trav(code);
  if (!(motif || '').trim()) return { ok:false, why:'un travail marqué « sans objet » sans motif écrit reste au programme' };
  if (st.statut === 'acheve' || st.statut === 'revu')
    return { ok:false, why:'un travail déjà ' + STATUT_TRAVAIL[st.statut] + ' n’est pas sans objet : c’est une diligence exécutée' };
  st.sansObjet = { motif:motif.trim(), par:S.moi, t:tick() };
  logEvent('travail marqué sans objet', t.code + ' — ' + t.intitule, motif.trim().slice(0, 90));
  return { ok:true };
}
function annulerSansObjet(code){
  const t = travailDe(code), st = trav(code);
  if (!st.sansObjet) return { ok:false, why:'ce travail n’est pas marqué' };
  st.sansObjet = null;
  logEvent('marque « sans objet » retirée', t.code + ' — ' + t.intitule, USERS[S.moi].nom);
  return { ok:true };
}

/* ── travaux ajoutés à la main ────────────────────────────────────────────
   Aucun catalogue ne couvre tous les dossiers. Un travail ajouté à la main
   porte les mêmes règles que les autres : affectation, budget, échéance
   déduite d'un jalon, revue, statuts. Il n'a pas de chemin à lui. */
function ajouterTravail(intitule, phase, poste, natureVoulue){
  if (!(intitule || '').trim()) return { ok:false, why:'un travail sans intitulé n’est pas un travail' };
  if (!PHASES.some(x => x.id === phase)) return { ok:false, why:'phase inconnue' };
  const code = 'MAN-' + String(++S.seqTravManuel).padStart(2, '0');
  S.travauxManuels.push({ code, nature:natureVoulue || 'manuel', phase,
    intitule:intitule.trim(), poste:poste || null,
    posteLib:poste ? (POSTES.find(p => p.code === poste) || {}).lib : null,
    vue:poste ? 'fsli:' + poste : 'plan.programme', ajoutePar:S.moi, t:tick() });
  _travCache.cle = '';
  logEvent('travail ajouté au programme', code + ' — ' + intitule.trim(),
           PHASES.find(x => x.id === phase).lib + (poste ? ' · ' + poste : ''));
  return { ok:true, code };
}
function retirerTravailManuel(code){
  const i = S.travauxManuels.findIndex(x => x.code === code);
  if (i < 0) return { ok:false, why:'ce travail n’a pas été ajouté à la main : marquez-le « sans objet »' };
  const st = trav(code);
  if (st.preparateur || st.reviseur || st.statut !== 'a_faire')
    return { ok:false, why:'ce travail est engagé : marquez-le « sans objet » plutôt que de l’effacer' };
  const x = S.travauxManuels[i];
  S.travauxManuels.splice(i, 1);
  delete S.travaux[code];
  _travCache.cle = '';
  logEvent('travail retiré du programme', code + ' — ' + x.intitule, 'ajouté à la main, jamais engagé');
  return { ok:true };
}
const STATUT_TRAVAIL = { a_faire:'à faire', en_cours:'en cours', acheve:'achevé', revu:'revu' };

/** La liste complète des travaux de la mission, dérivée. */
const _travCache = { cle:'', v:null };
function travaux(){
  const s = seuils();
  const cle = JSON.stringify([s.PM, s.CTT, Object.keys(S.scopingOverride), S.decisionsFacteurs,
    S.sections && Object.keys(S.sections).length, S.jalons, S.travauxManuels.length]);
  if (_travCache.cle === cle && _travCache.v) return _travCache.v.map(habiller);
  const out = [];
  for (const f of TRAVAUX_FIXES) out.push({ ...f });
  for (const m of S.travauxManuels) out.push({ ...m });
  for (const p of postesEnPerimetre()){
    const phase = masseDe(p);
    for (const pr of proceduresRequises(p)){
      const e = pr.ech ? echantillonProc(p, pr) : null;
      out.push({
        code:'SEC-' + p.code + '-' + pr.code, nature:'section', phase,
        intitule:pr.lib, poste:p.code, posteLib:p.lib, proc:pr.code,
        assertion:pr.a, ech:pr.ech, elements:e ? e.retenus.length : 0,
        wpRef:procRef(p, pr), vue:'fsli:' + p.code,
      });
    }
  }
  const base = out.map(t => ({ ...t, niveauRevue:niveauRevueExige(t) }));
  base.forEach(t => { t.budgetBareme = budgetBareme(t); });
  _travCache.cle = cle; _travCache.v = base;
  return base.map(habiller);
}
/** Le casier d'organisation vient se poser sur la définition du travail, et
 *  l'échéance se déduit des jalons quand personne ne l'a écrite. Un seul
 *  chemin : le cache ne doit pas rendre un objet plus pauvre que le calcul. */
function habiller(t){
  const x = { ...t, ...trav(t.code), code:t.code,
              niveauRevue:t.niveauRevue, budgetBareme:t.budgetBareme };
  x.echeanceDeduite = echeanceDeduite(x);
  x.echeance = trav(t.code).echeance || x.echeanceDeduite;
  return x;
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
  /* AUCUN travail à qui n'a pas signé sa déclaration d'indépendance. Le
     système refuse — il ne rappelle pas. Voir 30_equipe.js. */
  if (uid && !peutRecevoirTravail(uid))
    return { ok:false, why:'déclaration d’indépendance de ' + USERS[uid].nom + ' : '
      + etatDeclaration(uid).lib + ' — aucun travail ne peut lui être attribué' };
  if (uid && USERS[uid].sortie && USERS[uid].sortie < S.aujourdhui)
    return { ok:false, why:USERS[uid].nom + ' est sorti de la mission le ' + frDate(USERS[uid].sortie) };
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
  const l = travauxDe(code).filter(t => !t.sansObjet);
  const rec = l.filter(t => aReconfirmer(t));
  if (rec.length) o.push(`${rec.length} travail/travaux à reconfirmer sur la version courante du fichier`);
  const sansPrep = l.filter(t => !t.preparateur), sansRev = l.filter(t => !t.reviseur);
  if (sansPrep.length) o.push(`${sansPrep.length} travail/travaux sans préparateur affecté`);
  if (sansRev.length) o.push(`${sansRev.length} travail/travaux sans réviseur affecté`);
  const nonRevus = l.filter(t => t.preparateur && t.reviseur && t.statut !== 'revu');
  if (nonRevus.length) o.push(`${nonRevus.length} travail/travaux non revus`);
  /* Un travail attribué à quelqu'un dont la déclaration est devenue caduque
     est un obstacle au visa : la diligence a été faite, mais pas par une
     personne dont l'indépendance est établie à ce jour. */
  for (const x of obstaclesIndependanceSection(code)) o.push(x);
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
  const rc = aReconfirmer({ ...t, ...st });
  if (rc) return `<span class="pill bad">à reconfirmer</span>
    <div class="smallcaps">${esc(rc.motif)}</div>
    <button class="btn mini" data-recon="${t.code}">reconfirmer</button>`;
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
    const pr = propositionDe(t.code), ec = ecartProposition(t);
    return {
      sel:`<label class="chk"><input type="checkbox" data-selt="${t.code}" ${S.selTrav.includes(t.code) ? 'checked' : ''}><span></span></label>`,
      c:`<span class="mono">${t.code}</span>`,
      pp:pr ? `<span class="smallcaps">${esc(pr.prep ? USERS[pr.prep].nom : '—')}</span>
              <div class="smallcaps">${esc(pr.rev ? USERS[pr.rev].nom : '—')}</div>`
            : '<span class="smallcaps">—</span>',
      n:`<span class="tag">${esc(NATURE_TRAVAIL[t.nature])}</span>`,
      i:`<b>${esc(t.intitule)}</b>${t.posteLib ? '<div class="smallcaps">' + esc(t.posteLib) + '</div>' : ''}`,
      r:esc(PHASES.find(x => x.id === t.phase).lib),
      as:t.assertion ? esc(libAssertion(t.assertion)) : '<span class="smallcaps">—</span>',
      p:a.prep, v:a.rev,
      nr:`<span class="pill ${t.niveauRevue === 2 ? 'warn' : ''}">niveau ${t.niveauRevue}</span>`,
      e:`<input class="cell txt" type="date" data-tech="${t.code}" value="${esc(t.echeance)}" style="width:132px">
         <div class="smallcaps">${t.echeance === t.echeanceDeduite
            ? esc(regleEcheance(t).jalon) : 'écrite — règle : ' + frDate(t.echeanceDeduite)}</div>`,
      hb:`<input class="cell" data-hb="${t.code}" value="${budget(t).toFixed(2).replace('.', ',')}">`,
      hr:`<input class="cell" data-hr="${t.code}" value="${t.heuresReel.toFixed(2).replace('.', ',')}">`,
      s:t.sansObjet
        ? `<span class="pill">sans objet</span>
           <div class="smallcaps">${esc(t.sansObjet.motif)}</div>
           <div class="smallcaps">${esc(USERS[t.sansObjet.par].nom)} · ${horo(t.sansObjet.t)}</div>
           <button class="btn mini sec" data-tso0="${t.code}">remettre au programme</button>`
        : boutonsStatut(t) + ` <button class="btn mini sec" data-tso="${t.code}">sans objet</button>`
          + (S.travauxManuels.some(x => x.code === t.code)
             ? ` <button class="btn mini sec" data-tdel="${t.code}">retirer</button>` : ''),
      ec:ec ? '<span class="pill warn">corrigé</span>' : '<span class="smallcaps">—</span>',
      w:t.wpRef ? `<span class="mono">${esc(t.wpRef)}</span>` : '<span class="smallcaps">—</span>',
      g:t.vue ? `<button class="btn mini sec" data-gotrav="${esc(t.vue)}">ouvrir</button>` : '',
    };
  });
  /* Un travail sans objet ne consomme pas de budget : le compter fausserait
     le seul chiffre que le chef de mission regarde. */
  const tb = vus.filter(t => !t.sansObjet).reduce((a, t) => a + budget(t), 0);
  const tr = vus.reduce((a, t) => a + t.heuresReel, 0);
  return entete('Programme de travail', 'tout travail de la mission est le même objet — livrable du dossier') +
    blocJalons(l) +
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
    /* Le barème de budget et les règles de revue ONT QUITTÉ cet écran : ce
       sont des explications de règles, pas des surfaces de travail. La règle
       doit agir — elle agit, dans la colonne « budget » et dans le refus
       d'affecter un réviseur de niveau insuffisant. Sa justification se lit
       dans « Principes de conception », avec les autres encadrés. */
    blocRepartition(vus) +
    blk('Travaux', vus.length + ' · budget ' + hFmt(tb) + ' · réalisé ' + hFmt(tr)
        + (l.filter(x => x.sansObjet).length ? ' · ' + l.filter(x => x.sansObjet).length + ' sans objet' : ''),
      barreSelection(vus) +
      `<div class="row" style="margin:-2px 0 8px">
        <div class="ctrl"><label>Échéance en lot — ${S.selTrav.length} sélectionné(s)</label>
          <input class="cell txt" type="date" id="tv-lotech" ${S.selTrav.length ? '' : 'disabled'}></div>
        <div class="ctrl"><label>&nbsp;</label>
          <button class="btn sec" id="tv-lotech-rgl" ${S.selTrav.length ? '' : 'disabled'}>rendre à la règle des jalons</button></div>
        <div class="ctrl" style="flex:1 1 220px"><label>Ajouter un travail — intitulé</label>
          <input type="text" id="tv-add-lib" placeholder="aucun catalogue ne couvre tous les dossiers"></div>
        <div class="ctrl"><label>Phase</label><select id="tv-add-phase">
          ${PHASES.map(x => `<option value="${x.id}">${esc(x.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>Section</label><select id="tv-add-poste">
          <option value="">— aucune —</option>
          ${postesEnPerimetre().map(x => `<option value="${x.code}">${esc(x.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn" id="tv-add">ajouter au programme</button></div>
      </div>
      ${S.travErreur ? `<div class="callout bad">${esc(S.travErreur)}</div>` : ''}` +
      table([{k:'sel',t:''},{k:'c',t:'Code'},{k:'n',t:'Nature'},{k:'i',t:'Intitulé',cls:'wrapcell'},{k:'r',t:'Phase'},
             {k:'as',t:'Assertion'},{k:'pp',t:'Proposé',cls:'wrapcell'},{k:'p',t:'Préparateur'},{k:'v',t:'Réviseur'},
             {k:'ec',t:''},{k:'nr',t:'Revue'},
             {k:'e',t:'Échéance'},{k:'hb',t:'Budget',n:1},{k:'hr',t:'Réalisé',n:1},
             {k:'s',t:'Statut',cls:'wrapcell'},{k:'w',t:'Papier'},{k:'g',t:''}], rows,
        { foot:{ c:'Total', hb:hFmt(tb), hr:hFmt(tr) } }) +
      `<p class="note">La colonne « proposé » porte le préparateur puis le réviseur que la règle désigne.
      Corriger une ligne ne change pas la proposition : l’écart reste visible, c’est votre décision.</p>`);
}

function blocJalons(l){
  const jours = d => Math.round((Date.parse(d) - Date.parse(S.aujourdhui)) / 86400000);
  const dec = n => n === 0 ? 'le jour même' : n > 0 ? '+' + n + ' j' : n + ' j';
  return blk('Jalons de la mission', 'quatre dates — les échéances des travaux s’en déduisent',
    `<div class="row">
      ${JALONS.map(j => `<div class="ctrl"><label>${esc(j.lib)}</label>
        <input class="cell txt" type="date" data-jalon="${j.id}" value="${esc(jalon(j.id))}"
          ${j.derive ? 'disabled' : ''} style="width:150px">
        <span class="smallcaps">${j.derive ? 'déduite — ' + DELAI_ASSEMBLAGE + ' jours après le rapport'
          : jours(jalon(j.id)) >= 0 ? 'dans ' + jours(jalon(j.id)) + ' j' : 'il y a ' + (-jours(jalon(j.id))) + ' j'}</span>
      </div>`).join('')}
    </div>
    ${table([{k:'c',t:'Cas',cls:'wrapcell'},{k:'j',t:'Jalon'},{k:'d',t:'Décalage'},{k:'e',t:'Échéance déduite'},{k:'n',t:'Travaux',n:1}],
      REGLE_ECHEANCE.map(r => {
        const n = l.filter(t => regleEcheance(t).cas === r.cas).length;
        return { c:esc(r.cas), j:esc((JALONS.find(x => x.id === r.jalon) || {}).lib || r.jalon),
                 d:dec(r.dec), e:`<span class="mono">${frDate(addDays(jalon(r.jalon), r.dec))}</span>`,
                 n:String(n) };
      }), { foot:{ c:'Total', n:String(l.length) } })}
    <p class="note">On pose <b>quatre dates</b>, pas cent. L’échéance de chaque travail s’en déduit par la
    règle ci-dessus ; elle reste modifiable ligne par ligne et en lot sur la sélection, et une échéance
    écrite le reste quand le jalon bouge — c’est une décision, elle ne se perd pas.
    L’échéance d’assemblage ne se saisit pas : c’est un délai légal compté depuis la date du rapport
    (${DELAI_ASSEMBLAGE} jours, C. com., art. D. 821-186, III et IV).
    ${l.filter(t => trav(t.code).echeance).length} échéance(s) écrite(s) à la main sur ${l.length}.</p>`);
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
  const ech = jalon('assemblage');
  const jours = d => Math.round((Date.parse(d) - Date.parse(S.aujourdhui)) / 86400000);
  /* Les jalons ne sont plus une liste d'affichage : ce sont LES dates de la
     mission, posées dans le programme de travail, et dont les échéances des
     travaux se déduisent. Ici on les relit, on ne les redéfinit pas. */
  const jalons = [{ j:'Clôture de l’exercice', d:CLOTURE }]
    .concat(JALONS.map(x => ({ j:x.lib, d:jalon(x.id) })))
    .sort((a, b) => a.d < b.d ? -1 : 1);
  const tb = l.filter(t => !t.sansObjet).reduce((a, t) => a + budget(t), 0);
  const tr = l.reduce((a, t) => a + t.heuresReel, 0);
  return entete('Vue globale de la mission', 'Altiverre SAS — exercice clos le ' + frDate(CLOTURE)) +
    blocGraphes() +
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
    blk('Exporter cette vue', 'classeur de pilotage, ou impression',
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
