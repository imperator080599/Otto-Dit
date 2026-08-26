
/* ═══ 41. RÉPARTITION PROPOSÉE ═════════════════════════════════════════════
   « La meilleure attribution en lot est celle qu'on n'a pas à faire. »
   Le système propose, l'auditeur corrige. Deux règles se composent :

   1. QUI, par GRADE — ce que le travail demande, pas qui est disponible.
   2. LEQUEL, à grade égal — celui dont la charge est la plus faible, les
      travaux étant parcourus dans un ordre fixe. La répartition est donc
      rejouable à l'identique, et l'équilibre des heures en découle.

   Rien n'est écrit tant que personne n'a accepté : la proposition est
   affichée à côté de l'affectation réelle, jamais à sa place.
   ═══════════════════════════════════════════════════════════════════════ */

const REGLE_REPARTITION = [
  { cas:'Travail de niveau 2 — matérialité, arrêté de l’opinion, clôture du dossier',
    prep:'superviseur', rev:'associée',
    quoi:t => t.niveauRevue === 2 && t.nature !== 'section' },
  { cas:'Procédure de section répondant à une assertion évaluée « élevé »',
    prep:'senior', rev:'associée',
    quoi:t => t.nature === 'section' && t.niveauRevue === 2 },
  { cas:'Procédure de section avec sélection, risque moyen',
    prep:'senior', rev:'superviseur',
    quoi:t => t.nature === 'section' && t.ech && t.assertion && t.poste
           && niveau(postesCalcules().find(p => p.code === t.poste) || {}, t.assertion) === 'moyen' },
  { cas:'Procédure de section avec sélection, risque faible',
    prep:'assistant', rev:'superviseur',
    quoi:t => t.nature === 'section' && t.ech },
  { cas:'Procédure de section sans sélection',
    prep:'assistant', rev:'superviseur',
    quoi:t => t.nature === 'section' },
  { cas:'Travail de planification',
    prep:'senior', rev:'superviseur',
    quoi:t => t.nature === 'planification' },
  { cas:'Travail d’achèvement',
    prep:'superviseur', rev:'associée',
    quoi:t => t.nature === 'achevement' },
  { cas:'Tout autre travail',
    prep:'senior', rev:'superviseur', quoi:() => true },
];
function regleDe(t){ return REGLE_REPARTITION.find(r => r.quoi(t)) || REGLE_REPARTITION[REGLE_REPARTITION.length - 1]; }
/* La proposition ne propose que des gens à qui l'on peut RÉELLEMENT attribuer
   un travail : proposer quelqu'un que l'affectation refusera ensuite serait
   une proposition fausse. Le filtre est le même que la règle. */
function gensDuGrade(g){
  return Object.entries(USERS)
    .filter(([k, u]) => u.grade === g && !u.sortie && peutRecevoirTravail(k))
    .map(([k]) => k);
}

/** La proposition complète, dérivée. Jamais écrite tant qu'on ne l'accepte pas. */
const _repCache = { cle:'', v:null };
function repartitionProposee(){
  const l = travaux();
  const cle = l.length + '|' + JSON.stringify(l.map(t => t.code + t.niveauRevue))
    + '|' + membres().map(m => m.id + m.grade + (declarationValide(m.id) ? '1' : '0') + (m.sortie ? 'x' : '')).join(',');
  if (_repCache.cle === cle && _repCache.v) return _repCache.v;
  const chargePrep = {}, chargeRev = {};
  for (const k of Object.keys(USERS)){ chargePrep[k] = 0; chargeRev[k] = 0; }
  const out = new Map();
  /* Ordre fixe : par phase puis par code. La proposition est rejouable. */
  const ordre = [...l].sort((a, b) => {
    const pa = PHASES.findIndex(x => x.id === a.phase), pb = PHASES.findIndex(x => x.id === b.phase);
    return pa !== pb ? pa - pb : (a.code < b.code ? -1 : 1);
  });
  for (const t of ordre){
    const r = regleDe(t), h = budget(t);
    const cand = g => { const g2 = gensDuGrade(g); return g2.length ? g2 : gensDuGrade('senior'); };
    const moins = (liste, charge, exclu) => liste.filter(k => k !== exclu)
      .sort((a, b) => charge[a] - charge[b] || (a < b ? -1 : 1))[0];
    const prep = moins(cand(r.prep), chargePrep, null);
    /* Le réviseur ne peut être le préparateur, et un niveau 2 exige un associé. */
    const gradeRev = t.niveauRevue === 2 ? 'associée' : r.rev;
    const rev = moins(cand(gradeRev).filter(k => peutReviser(k, t)), chargeRev, prep);
    if (prep) chargePrep[prep] += h;
    if (rev) chargeRev[rev] += h * 0.2;      // la revue coûte le cinquième de la préparation
    out.set(t.code, { prep, rev, regle:r.cas, heures:h });
  }
  _repCache.cle = cle; _repCache.v = out;
  return out;
}
function propositionDe(code){ return repartitionProposee().get(code) || null; }
/** Un travail s'écarte-t-il de la proposition ? C'est la correction humaine. */
function ecartProposition(t){
  const p = propositionDe(t.code); if (!p) return null;
  const dp = t.preparateur && t.preparateur !== p.prep;
  const dr = t.reviseur && t.reviseur !== p.rev;
  return dp || dr ? { prep:dp, rev:dr, p } : null;
}

/** Applique la proposition. `quoi` : 'vides' ou 'selection'. */
function appliquerRepartition(quoi, codes){
  const l = travaux();
  const cibles = quoi === 'selection'
    ? l.filter(t => codes.includes(t.code))
    : l.filter(t => !t.preparateur || !t.reviseur);
  let n = 0, refus = 0;
  for (const t of cibles){
    const p = propositionDe(t.code); if (!p) continue;
    if (quoi === 'vides'){
      if (!t.preparateur && p.prep){ if (affecter(t.code, 'preparateur', p.prep).ok) n++; else refus++; }
      if (!trav(t.code).reviseur && p.rev){ if (affecter(t.code, 'reviseur', p.rev).ok) n++; else refus++; }
    } else {
      if (p.prep){ if (affecter(t.code, 'preparateur', p.prep).ok) n++; else refus++; }
      if (p.rev){ if (affecter(t.code, 'reviseur', p.rev).ok) n++; else refus++; }
    }
  }
  logEvent('répartition proposée appliquée',
           quoi === 'selection' ? cibles.length + ' travail/travaux sélectionné(s)' : 'travaux non affectés',
           n + ' affectation(s)' + (refus ? ', ' + refus + ' refusée(s) par la règle' : ''));
  return { n, refus, cibles:cibles.length };
}
/** Attribution en lot d'une personne choisie à la main, sur la sélection. */
function affecterEnLot(codes, role, uid){
  let n = 0; const refus = [];
  for (const c of codes){
    const r = affecter(c, role, uid);
    if (r.ok) n++; else refus.push(c + ' : ' + r.why);
  }
  logEvent('attribution en lot', codes.length + ' travail/travaux',
           (role === 'preparateur' ? 'préparateur : ' : 'réviseur : ') + (uid ? USERS[uid].nom : 'retiré')
           + ' · ' + n + ' appliquée(s)' + (refus.length ? ', ' + refus.length + ' refusée(s)' : ''));
  return { n, refus };
}

/* ── charge par personne, proposée et réelle ──────────────────────────── */
function chargeParPersonne(source){
  const l = travaux(), prop = repartitionProposee();
  return Object.entries(USERS).map(([k, u]) => {
    const p = source === 'proposee'
      ? l.filter(t => (prop.get(t.code) || {}).prep === k)
      : l.filter(t => t.preparateur === k);
    const r = source === 'proposee'
      ? l.filter(t => (prop.get(t.code) || {}).rev === k)
      : l.filter(t => t.reviseur === k);
    return { k, u, nPrep:p.length, nRev:r.length,
             /* Quelqu'un qui ne peut pas recevoir de travail apparaît à zéro
                AVEC SA RAISON : le faire disparaître de la charge donnerait
                une équipe plus petite qu'elle n'est. */
             indispo:!peutRecevoirTravail(k) ? etatDeclaration(k).lib : u.sortie ? 'sorti le ' + frDate(u.sortie) : '',
             h:p.reduce((a, t) => a + budget(t), 0) + r.reduce((a, t) => a + budget(t) * 0.2, 0) };
  });
}

/* ═══ 42. BLOCS D'ÉCRAN ════════════════════════════════════════════════════ */
function blocRepartition(vus){
  const prop = chargeParPersonne('proposee'), reel = chargeParPersonne('reelle');
  const l = travaux();
  const nonAffectes = l.filter(t => !t.preparateur || !t.reviseur).length;
  const corriges = l.map(t => ecartProposition(t)).filter(Boolean).length;
  const tot = prop.reduce((a, x) => a + x.h, 0);
  return blk('Répartition proposée', nonAffectes + ' travail/travaux non affecté(s) sur ' + l.length,
    table([{k:'c',t:'Cas',cls:'wrapcell'},{k:'p',t:'Préparateur proposé'},{k:'r',t:'Réviseur proposé'},{k:'n',t:'Travaux',n:1}],
      REGLE_REPARTITION.map(r => ({ c:esc(r.cas), p:esc(r.prep), r:esc(r.rev),
        n:String(l.filter(t => regleDe(t).cas === r.cas).length) })),
      { foot:{ c:'Total', n:String(l.length) } }) +
    `<p class="note">À grade égal, le travail va à la personne dont la charge est la plus faible, les travaux
    étant parcourus dans un ordre fixe : la proposition est rejouable à l’identique. La revue est comptée pour
    un cinquième de la préparation. Rien n’est écrit tant que vous n’acceptez pas.</p>
    ${prop.some(x => x.indispo) ? `<div class="callout warn">
      <b>${prop.filter(x => x.indispo).length} membre(s) ne reçoivent aucune proposition</b> —
      ${prop.filter(x => x.indispo).map(x => esc(x.u.nom) + ' (' + esc(x.indispo) + ')').join(', ')}.
      La proposition ne propose que ce que l’affectation accepterait : proposer quelqu’un qu’elle
      refuserait ensuite serait une proposition fausse.
      <button class="btn mini sec" data-vue="plan.equipe">Équipe et indépendance ↗</button></div>` : ''}
    ${diagnosticRepartition()}
    <h3>Charge — proposée et réelle</h3>
    ${table([{k:'n',t:'Personne',cls:'wrapcell'},{k:'g',t:'Grade'},
             {k:'pp',t:'Prépare (proposé)',n:1},{k:'pr',t:'Revoit (proposé)',n:1},{k:'ph',t:'Heures (proposé)',n:1},
             {k:'rp',t:'Prépare (réel)',n:1},{k:'rr',t:'Revoit (réel)',n:1},{k:'rh',t:'Heures (réel)',n:1}],
      prop.map((x, i) => ({ n:`<b>${esc(x.u.nom)}</b>`
          + (x.indispo ? `<div class="smallcaps" style="color:var(--anomalie)">${esc(x.indispo)} — aucun travail attribuable</div>` : ''),
        g:esc(x.u.grade),
        pp:String(x.nPrep), pr:String(x.nRev), ph:hFmt(x.h),
        rp:String(reel[i].nPrep), rr:String(reel[i].nRev), rh:hFmt(reel[i].h) })),
      { foot:{ n:'Total', ph:hFmt(tot), rh:hFmt(reel.reduce((a, x) => a + x.h, 0)) } })}
    <div class="row" style="margin-top:8px">
      <button class="btn" id="tv-auto">appliquer la proposition aux ${nonAffectes} travaux non affectés</button>
      <button class="btn sec" id="tv-prop-sel" ${S.selTrav.length ? '' : 'disabled'}>appliquer aux ${S.selTrav.length} sélectionné(s)</button>
      ${corriges ? `<span class="pill warn">${corriges} affectation(s) s’écartent de la proposition</span>` : ''}
      ${S.affErreur ? `<span class="pill bad">${esc(S.affErreur)}</span>` : ''}
    </div>`);
}

/* Ce que la répartition proposée révèle de la MISSION, et non d'elle-même :
   la part du budget qui va à chaque grade est une conséquence de l'évaluation
   du risque, pas un choix de dotation. Si elle déplaît, le levier est le
   niveau de risque des assertions, pas le grade inscrit dans la règle. */
function diagnosticRepartition(){
  const l = travaux(), tot = l.reduce((a, t) => a + budget(t), 0);
  const parGrade = {};
  for (const t of l){
    const g = regleDe(t).prep;
    parGrade[g] = (parGrade[g] || 0) + budget(t);
  }
  const eleve = l.filter(t => t.nature === 'section' && t.niveauRevue === 2);
  const hEleve = eleve.reduce((a, t) => a + budget(t), 0);
  const mortes = REGLE_REPARTITION.filter(r => !l.some(t => regleDe(t).cas === r.cas));
  return `<div class="callout">
    <b>Ce que la proposition dit de la mission.</b> ${Object.entries(parGrade)
      .sort((a, b) => b[1] - a[1])
      .map(([g, h]) => `${esc(g)} ${pct(h / tot, 0)}`).join(' · ')} du budget de préparation.
    ${hEleve ? `La part senior tient à l’évaluation du risque : <b>${eleve.length} procédures de section
      répondent à une assertion évaluée « élevé »</b>, soit ${pct(hEleve / tot, 0)} du budget, et une telle
      assertion se prépare au niveau senior et se revoit par l’associée. Conséquence directe :
      <b>l’associée revoit ${l.filter(t => t.niveauRevue === 2).length} travaux sur ${l.length}</b>.
      Si cette dotation ne convient pas, le levier est le niveau de risque des assertions —
      pas le grade inscrit dans la règle.` : ''}
    ${mortes.length ? `<br><span class="smallcaps">${mortes.length} cas de la règle ne s’appliquent à aucun
      travail de cette mission : ${mortes.map(r => esc(r.cas)).join(' · ')}.</span>` : ''}
  </div>`;
}

function barreSelection(vus){
  const n = S.selTrav.length;
  const tous = vus.length && vus.every(t => S.selTrav.includes(t.code));
  const opt = (role) => `<select data-lot="${role}">
      <option value="">— ${role === 'preparateur' ? 'préparateur' : 'réviseur'} —</option>
      ${Object.entries(USERS).filter(([, u]) => role === 'preparateur' || u.role !== 'preparateur')
        .map(([k, u]) => `<option value="${k}">${esc(u.nom)} — ${esc(u.grade)}</option>`).join('')}
    </select>`;
  return `<div class="row" style="margin-bottom:8px">
    <button class="btn mini sec" id="tv-tout">${tous ? 'tout désélectionner' : 'tout sélectionner (' + vus.length + ' du résultat filtré)'}</button>
    <span class="pill ${n ? '' : ''}">${n} sélectionné(s)</span>
    <div class="ctrl"><label>Affecter en lot — préparateur</label>${opt('preparateur')}</div>
    <div class="ctrl"><label>Réviseur</label>${opt('reviseur')}</div>
    ${n ? '' : '<span class="smallcaps">cochez des travaux, ou sélectionnez tout le résultat filtré</span>'}
    ${S.lotErreur ? `<div class="callout bad" style="flex:1 1 100%">${esc(S.lotErreur)}</div>` : ''}
  </div>`;
}
