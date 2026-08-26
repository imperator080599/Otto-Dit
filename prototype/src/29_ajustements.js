
/* ═══ 45. AJUSTEMENTS ET RETRAITEMENTS ═════════════════════════════════════
   Le rapport d'impact d'une version dit CE QUI a changé : quels comptes ont
   bougé, quels seuils sont franchis, quels papiers sont périmés. Il ne dit
   pas POURQUOI. Cette section le dit, écriture par écriture.

   Trois natures, et c'est la distinction qui compte :

     — écriture d'INVENTAIRE : le client termine son exercice. Normale.
     — RETRAITEMENT : un reclassement, un changement d'estimation, une
       correction que le client ou son expert-comptable a trouvée seul.
     — CORRECTION SUR CONSTAT D'AUDIT : le client corrige parce que NOUS
       avons relevé quelque chose. Celle-là n'est pas une écriture comme les
       autres : elle doit se réconcilier avec l'état de nos anomalies.

   La réconciliation est AUTOMATIQUE. Une correction d'audit nomme la pièce
   qu'elle corrige ; l'anomalie portée sur cette pièce quitte le cumul non
   corrigé à hauteur de ce qui a réellement été passé. Personne ne coche
   « corrigée » : une case à cocher aurait fait disparaître un montant du
   cumul sans qu'aucune écriture ne le porte — c'est la règle déjà écrite
   pour la résolution d'écart, appliquée ici.

   Deux signaux, et ils ne disent pas la même chose :

     1. ANOMALIE QUALIFIÉE « CORRIGÉE » SANS ÉCRITURE IDENTIFIÉE. Le dossier
        affirme qu'une correction existe ; aucune écriture de version ne la
        porte. Soit la correction n'a pas été passée, soit elle l'a été sans
        nous être transmise. Dans les deux cas le cumul est faux.
     2. ÉCRITURE DE CORRECTION SANS ANOMALIE CORRESPONDANTE. Le client dit
        répondre à un constat que notre dossier ne porte pas. Soit nous avons
        omis de le consigner, soit il corrige autre chose. Dans les deux cas
        il y a une question à poser.

   Et une troisième situation, qui n'est pas un défaut mais l'application de
   la règle du versionnement : une correction ANNONCÉE dans une version reçue
   et NON PRISE EN COMPTE n'a rien corrigé. Le cumul ne bouge pas tant que la
   version n'est pas prise en compte, et l'écran dit de combien il bougerait.
   ═══════════════════════════════════════════════════════════════════════ */

const NATURES_AJUSTEMENT = {
  inventaire: { lib:'écriture d’inventaire', cls:'',
    d:'le client termine son exercice : dépouillement d’inventaire, dotations, provisions, cut-off. '
     + 'Elle n’appelle rien de particulier de notre part au-delà du contrôle de la procédure concernée.' },
  retraitement:{ lib:'retraitement', cls:'warn',
    d:'reclassement, changement d’estimation, ou correction trouvée par le client ou son '
     + 'expert-comptable. Elle change les comptes sans venir de nous : elle est à contrôler comme '
     + 'une écriture d’inventaire, et son motif est à obtenir.' },
  correction_audit:{ lib:'correction sur constat d’audit', cls:'bad',
    d:'le client corrige parce que nous avons relevé quelque chose. Elle se réconcilie avec l’état '
     + 'de nos anomalies : elle fait sortir du cumul non corrigé ce qu’elle porte réellement, et '
     + 'rien de plus.' },
};
function natureAj(a){ return NATURES_AJUSTEMENT[a.nature] || NATURES_AJUSTEMENT.inventaire; }

/* ── la liste des ajustements, dérivée des versions ───────────────────────
   Rien n'est saisi ici : un ajustement EST une écriture de version. La
   section ne tient pas un second registre — elle lit celui qui existe. */
function ajustements(){
  return VERSIONS.filter(v => v.n > 1).flatMap(v => v.ecritures.map(e => ({
    ...e, v:v.n, vLib:v.lib, vDate:v.date,
    par:e.par || v.par, nature:e.nature || 'inventaire',
    prise:v.n <= S.version, recue:v.date <= S.aujourdhui,
  })));
}
/** Montant d'une écriture : la somme de ses débits — elle est équilibrée. */
function montantAjustement(a){ return a.lignes.reduce((t, l) => t + l[1], 0); }

/* ── impact d'un ajustement : par poste, et par masse ─────────────────────
   Δ résultat = Σ (crédit − débit) sur les comptes 6 et 7.
   Δ situation nette = Σ (débit − crédit) sur les comptes 1 à 5.
   Les deux sont ÉGAUX par construction — c'est la partie double, et l'écran
   le vérifie plutôt que de l'affirmer.
   Δ capitaux propres = Δ résultat + les mouvements portés directement aux
   comptes de capitaux (10, 11), qui ne passent pas par le résultat. */
function impactAjustement(a){
  const parPoste = new Map();
  const hors = [];
  let resultat = 0, nette = 0, capitauxDirects = 0;
  for (const [c, d, cr] of a.lignes){
    const delta = d - cr;
    const p = POSTES.find(x => x.re.test(c));
    if (p){
      const cur = parPoste.get(p.code) || { code:p.code, lib:p.lib, masse:p.masse, delta:0 };
      cur.delta += delta; parPoste.set(p.code, cur);
    } else hors.push({ compte:c, lib:libelleCompte(c), delta });
    if (/^[67]/.test(c)) resultat += cr - d; else nette += delta;
    if (/^(10|11)/.test(c)) capitauxDirects += cr - d;
  }
  return { postes:[...parPoste.values()].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)),
           hors, resultat, nette, capitaux:resultat + capitauxDirects,
           equilibre:resultat === nette, montant:montantAjustement(a) };
}

/* ── corrections d'audit : en vigueur, ou seulement annoncées ─────────────
   « Reçue » n'est pas « prise en compte » : c'est la règle du versionnement,
   et elle vaut ici aussi. Une correction annoncée n'a rien corrigé. */
function correctionsEnVigueur(){ return ajustements().filter(a => a.nature === 'correction_audit' && a.prise); }
function correctionsAnnoncees(){
  return ajustements().filter(a => a.nature === 'correction_audit' && a.recue && !a.prise);
}

/** Allocation d'une correction aux anomalies de la pièce qu'elle nomme.
 *  Bornée au résiduel de chaque anomalie et à son sens : une correction ne
 *  peut ni retirer plus que l'anomalie, ni en inverser le signe. C'est la
 *  même borne que la part expliquée d'une résolution. Les anomalies sont
 *  servies du plus gros résiduel au plus petit — sans quoi l'ordre de la
 *  liste déciderait de ce qui reste au cumul. */
function appliquerCorrections(out){
  for (const a of correctionsEnVigueur()){
    let reste = montantAjustement(a);
    const cibles = out.filter(x => x.piece === a.repond && x.montant !== 0)
                      .sort((x, y) => Math.abs(y.montant) - Math.abs(x.montant));
    for (const x of cibles){
      if (reste <= 0) break;
      const dispo = Math.min(reste, Math.abs(x.montant));
      const part = x.montant >= 0 ? dispo : -dispo;
      x.corrige = (x.corrige || 0) + part;
      x.montant -= part;
      (x.corrigePar = x.corrigePar || []).push({ ref:a.ref, v:a.v, montant:part });
      reste -= dispo;
    }
  }
  return out;
}

/* ── réconciliation ───────────────────────────────────────────────────────
   Elle ne tranche rien : elle apparie ce qui s'apparie et NOMME ce qui ne
   s'apparie pas. Les deux listes non appariées sont les deux signaux. */
const _recAjCache = { cle:'', v:null };
function reconciliation(){
  const anos = anomalies();
  const cle = S.version + '|' + anos.length + '|' + anos.map(x => x.cleRes + ':' + x.montant).join(',');
  if (_recAjCache.cle === cle) return _recAjCache.v;
  const appariees = [], sansAnomalie = [];
  for (const a of correctionsEnVigueur()){
    const l = anos.filter(x => x.piece === a.repond);
    const affecte = l.reduce((t, x) => t + (x.corrigePar || [])
      .filter(c => c.ref === a.ref).reduce((u, c) => u + Math.abs(c.montant), 0), 0);
    const montant = montantAjustement(a);
    if (l.length) appariees.push({ a, l, affecte, montant, nonAffecte:montant - affecte });
    else sansAnomalie.push({ a, montant });
  }
  /* Signal 1 : le dossier dit « corrigée », aucune écriture ne le porte. */
  const sansEcriture = anos.filter(x => !x.souSeuil && x.acquis && x.res
    && x.res.disposition === 'corrigee' && !(x.corrigePar || []).length);
  const r = { appariees, sansAnomalie, sansEcriture, annoncees:correctionsAnnoncees(), anos };
  _recAjCache.cle = cle; _recAjCache.v = r;
  return r;
}

/* ── cumul corrigé / non corrigé, et sa bascule ───────────────────────────
   Aucune de ces trois lignes n'est saisie : le constaté vient des écarts,
   l'expliqué d'une résolution probante, le corrigé d'une écriture de
   version. Le résiduel est la soustraction. */
function cumulAnomalies(){
  const anos = anomalies().filter(x => !x.souSeuil);
  return {
    n:anos.length,
    constate:anos.reduce((t, x) => t + x.constate, 0),
    explique:anos.reduce((t, x) => t + x.explique, 0),
    corrige:anos.reduce((t, x) => t + (x.corrige || 0), 0),
    residuel:anos.reduce((t, x) => t + x.montant, 0),
    nCorrigees:anos.filter(x => (x.corrigePar || []).length).length,
  };
}
/** Le même cumul, évalué comme si la version n était prise en compte.
 *  C'est un calcul, pas une promesse : la bascule est réellement jouée. */
function cumulAuVersion(n){ return auVersion(n, cumulAnomalies); }

/* ── impact cumulé de tous les ajustements pris en compte ─────────────── */
function cumulAjustements(){
  const l = ajustements().filter(a => a.prise);
  const parPoste = new Map();
  let resultat = 0, capitaux = 0, nette = 0;
  const parNature = {};
  for (const a of l){
    const i = impactAjustement(a);
    resultat += i.resultat; capitaux += i.capitaux; nette += i.nette;
    const k = parNature[a.nature] = parNature[a.nature] || { n:0, montant:0, resultat:0 };
    k.n++; k.montant += i.montant; k.resultat += i.resultat;
    for (const p of i.postes){
      const cur = parPoste.get(p.code) || { ...p, delta:0 };
      cur.delta += p.delta; parPoste.set(p.code, cur);
    }
  }
  return { l, parPoste:[...parPoste.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
           resultat, capitaux, nette, parNature, equilibre:resultat === nette };
}

/* ═══════════════════════════════════════════════════════════════════════
   LA VUE
   ═══════════════════════════════════════════════════════════════════════ */
function vueAjustements(){
  return entete('Ajustements et retraitements',
                'le rapport d’impact dit ce qui a changé — ici on dit pourquoi, écriture par écriture') +
    blocNatures() +
    blocAjustements() +
    blocImpactCumule() +
    blocReconciliation() +
    blocCumulBascule();
}

function blocNatures(){
  const c = cumulAjustements();
  return blk('Les trois natures', Object.keys(NATURES_AJUSTEMENT).length,
    table([{k:'n',t:'Nature'},{k:'d',t:'Ce que c’est, et ce que ça exige de nous',cls:'wrapcell'},
           {k:'c',t:'Écritures',n:1},{k:'m',t:'Montant',n:1},{k:'r',t:'Effet résultat',n:1}],
      Object.entries(NATURES_AJUSTEMENT).map(([id, x]) => {
        const k = c.parNature[id] || { n:0, montant:0, resultat:0 };
        return { n:`<span class="pill ${x.cls}">${esc(x.lib)}</span>`, d:esc(x.d),
                 c:String(k.n), m:k.n ? eur(k.montant) : '<span class="smallcaps">—</span>',
                 r:k.n ? eur(k.resultat) : '<span class="smallcaps">—</span>' };
      })) +
    `<p class="note">Les compteurs portent sur les versions <b>prises en compte</b> — le dossier est
    à la version ${S.version}. Une écriture d’une version reçue et non prise en compte n’a rien changé
    aux comptes : elle figure plus bas, sous « corrections annoncées ».</p>`);
}

function blocAjustements(){
  const l = ajustements();
  const rows = l.map(a => {
    const i = impactAjustement(a), x = natureAj(a);
    const etat = a.prise ? '<span class="pill">prise en compte</span>'
      : a.recue ? '<span class="pill warn">annoncée, v' + a.v + ' non prise en compte</span>'
      : '<span class="smallcaps">non reçue</span>';
    return {
      v:`<span class="mono">v${a.v}</span><div class="smallcaps">${frDate(a.vDate)}</div>`,
      r:`<span class="mono">${esc(a.ref)}</span>`,
      l:`<b>${esc(a.lib)}</b><div class="smallcaps">${esc(a.motif || '—')}</div>`,
      n:`<span class="pill ${x.cls}">${esc(x.lib)}</span>`
        + (a.repond ? `<div class="smallcaps">répond sur la pièce <span class="mono">${esc(a.repond)}</span></div>` : ''),
      m:eur(i.montant),
      p:i.postes.map(p => `${esc(p.lib)} <span class="mono">${eur(p.delta)}</span>`).join('<br>')
        + (i.hors.length ? `<br><span class="smallcaps">hors poste cartographié : `
            + i.hors.map(h => esc(h.compte) + ' ' + eur(h.delta)).join(', ') + '</span>' : ''),
      b:`<span class="smallcaps">résultat</span> ${eur(i.resultat)}<br><span class="smallcaps">situation nette</span> ${eur(i.nette)}`,
      j:`${esc(a.justif || '—')}<div class="smallcaps">${esc(a.par)}</div>`,
      s:etat,
    };
  });
  const desequilibres = l.filter(a => !impactAjustement(a).equilibre);
  return blk('Ajustements passés, version par version', l.length + ' écriture(s)',
    table([{k:'v',t:'Version'},{k:'r',t:'Réf.'},{k:'l',t:'Libellé et motif',cls:'wrapcell'},
           {k:'n',t:'Nature',cls:'wrapcell'},{k:'m',t:'Montant',n:1},
           {k:'p',t:'Impact par poste',cls:'wrapcell'},{k:'b',t:'Par masse',cls:'wrapcell'},
           {k:'j',t:'Justificatif et auteur côté client',cls:'wrapcell'},{k:'s',t:'État'}], rows) +
    (desequilibres.length
      ? `<div class="callout bad"><b>${desequilibres.length} écriture(s) dont l’effet résultat ne répond pas
         à l’effet sur la situation nette.</b> ${esc(desequilibres.map(a => a.ref).join(', '))} —
         une écriture équilibrée ne peut pas produire deux nombres différents : c’est la donnée qui est fausse.</div>`
      : `<p class="note">Pour chaque écriture, l’effet sur le résultat et l’effet sur la situation nette
         sont <b>égaux</b> : c’est la partie double, et c’est vérifié ici plutôt qu’affirmé.</p>`));
}

function blocImpactCumule(){
  const c = cumulAjustements();
  return blk('Impact cumulé sur le résultat et les capitaux propres',
    c.l.length + ' écriture(s) prise(s) en compte',
    `<div class="grid3">
      <div class="kv"><span class="k">Variation du résultat</span>
        <span class="v"${c.resultat ? ' style="color:var(--anomalie)"' : ''}>${eur(c.resultat)}</span>
        <span class="k">Variation des capitaux propres</span><span class="v">${eur(c.capitaux)}</span></div>
      <div class="kv"><span class="k">Variation de la situation nette</span><span class="v">${eur(c.nette)}</span>
        <span class="k">Contrôle de partie double</span>
        <span class="v">${c.equilibre ? 'résultat = situation nette' : '<span style="color:var(--anomalie)">divergents</span>'}</span></div>
      <div class="kv"><span class="k">Postes touchés</span><span class="v">${c.parPoste.length}</span>
        <span class="k">Rapport au seuil de signification</span>
        <span class="v">${pct(Math.abs(c.resultat) / Math.max(1, seuils().M), 0)}</span></div>
    </div>
    ${table([{k:'p',t:'Poste'},{k:'m',t:'Masse'},{k:'d',t:'Mouvement cumulé',n:1}],
      c.parPoste.map(p => ({ p:esc(p.lib), m:p.masse === 'bilan' ? 'bilan' : 'compte de résultat',
                             d:eur(p.delta) })))}
    <p class="note">La variation des capitaux propres est celle du résultat, augmentée des mouvements
    portés directement aux comptes de capitaux — il n’y en a aucun ici. Ces nombres ne sont pas saisis :
    ils se recalculent à chaque bascule de version, comme tout ce qui dépend du fichier.</p>`);
}

function blocReconciliation(){
  const r = reconciliation();
  const app = r.appariees.map(x => ({
    r:`<span class="mono">${esc(x.a.ref)}</span><div class="smallcaps">v${x.a.v}</div>`,
    l:`<b>${esc(x.a.lib)}</b><div class="smallcaps">pièce <span class="mono">${esc(x.a.repond)}</span></div>`,
    a:x.l.map(y => `${esc(y.lib)}<div class="smallcaps">${esc(y.src)} — constaté ${eur(y.constate)}</div>`).join('<br>'),
    m:eur(x.montant),
    c:eur(x.affecte),
    e:x.nonAffecte
      ? `<span style="color:var(--anomalie)">${eur(x.nonAffecte)}</span>
         <div class="smallcaps">écriture au-delà de l’anomalie</div>`
      : (x.l.reduce((t, y) => t + y.montant, 0)
        ? `<span style="color:var(--anomalie)">${eur(x.l.reduce((t, y) => t + y.montant, 0))}</span>
           <div class="smallcaps">reste au cumul</div>`
        : '<span class="smallcaps">soldée</span>'),
  }));
  const signaux = r.sansEcriture.length + r.sansAnomalie.length;
  /* Le panneau porte son alerte : le nombre de SIGNAUX, ou à défaut les
     corrections annoncées qui attendent une prise en compte de version. */
  const alerte = signaux
    ? signaux + ' signal' + (signaux > 1 ? 'aux' : '') + ' à traiter'
    : r.annoncees.length ? r.annoncees.length + ' correction(s) annoncée(s)' : '';
  return blk('Réconciliation des corrections avec l’état des anomalies',
    r.appariees.length + ' correction(s) appariée(s)'
    + (signaux ? '' : ' · aucun signal'),
    (r.appariees.length
      ? table([{k:'r',t:'Écriture'},{k:'l',t:'Correction',cls:'wrapcell'},
               {k:'a',t:'Anomalie répondue',cls:'wrapcell'},{k:'m',t:'Passé',n:1},
               {k:'c',t:'Imputé au cumul',n:1},{k:'e',t:'Reste',cls:'wrapcell'}], app)
      : `<p class="note">Aucune correction d’audit dans les versions prises en compte.
         ${r.annoncees.length ? 'Il y en a ' + r.annoncees.length + ' d’annoncée(s) — voir ci-dessous.' : ''}</p>`) +

    /* signal 1 */
    `<div class="callout ${r.sansEcriture.length ? 'bad' : ''}" style="margin-top:10px">
      <b>Signal 1 — anomalie qualifiée « corrigée » sans écriture identifiée : ${r.sansEcriture.length}.</b>
      ${r.sansEcriture.length
        ? '<br>' + r.sansEcriture.map(x => `${esc(x.lib)} — ${eur(x.constate)}
            <span class="smallcaps">(${esc(x.src)}, qualifiée par ${esc(USERS[x.res.par].nom)})</span>`).join('<br>')
          + `<br>Le dossier affirme qu’une correction existe ; aucune écriture de version ne la porte.
             Soit elle n’a pas été passée, soit elle ne nous a pas été transmise — dans les deux cas le cumul est faux.`
        : `<br>Ce signal s’allume dès qu’un écart est qualifié « corrigée » dans une carte de résolution
           alors qu’aucune écriture de correction, dans une version prise en compte, ne porte la pièce
           concernée. Il vaut zéro aujourd’hui parce qu’aucun écart n’a encore été qualifié ainsi.`}
    </div>

    <div class="callout ${r.sansAnomalie.length ? 'bad' : ''}">
      <b>Signal 2 — écriture de correction sans anomalie correspondante : ${r.sansAnomalie.length}.</b>
      ${r.sansAnomalie.length
        ? '<br>' + r.sansAnomalie.map(x => `<span class="mono">${esc(x.a.ref)}</span> ${esc(x.a.lib)} —
            ${eur(x.montant)}, présentée comme répondant à la pièce
            <span class="mono">${esc(x.a.repond)}</span>, sur laquelle notre dossier ne porte aucune anomalie.
            <span class="smallcaps">${esc(x.a.par)}</span>`).join('<br>')
          + `<br>Soit nous avons omis de consigner le constat, soit le client corrige autre chose.
             La plateforme ne tranche pas : elle pose la question.`
        : '<br>Aucune correction ne se présente comme répondant à un constat absent de notre dossier.'}
    </div>` +

    /* corrections annoncées */
    (r.annoncees.length ? `<div class="callout warn">
      <b>${r.annoncees.length} correction(s) annoncée(s) dans une version reçue et non prise en compte.</b>
      ${r.annoncees.map(a => `<br><span class="mono">${esc(a.ref)}</span> ${esc(a.lib)} — ${eur(montantAjustement(a))}
        <span class="smallcaps">(version ${a.v}, reçue le ${frDate(a.vDate)})</span>`).join('')}
      <br>Elles n’ont rien corrigé : le cumul ne bouge pas tant que la version n’est pas prise en compte.
      La bascule ci-dessous dit de combien il bougerait.</div>` : '') +

    `<p class="note">L’appariement se fait sur la <b>pièce</b> que la correction nomme, et le montant imputé
    est borné à l’anomalie et à son sens : une correction ne peut ni retirer plus que ce qui a été relevé,
    ni en inverser le signe. Une correction partielle laisse le reste au cumul — c’est le cas de
    <span class="mono">OD-V4-003</span> lorsque la version 4 est prise en compte.</p>`,
    alerte);
}

function blocCumulBascule(){
  const c = cumulAnomalies(), s = seuils();
  const autres = VERSIONS.filter(v => v.n !== S.version && v.date <= S.aujourdhui)
    .map(v => ({ v, c:cumulAuVersion(v.n) }));
  return blk('Cumul corrigé et non corrigé — la bascule',
    c.n + ' anomalie(s) au-dessus du seuil de remontée',
    `<div class="grid3">
      <div class="kv"><span class="k">Constaté</span><span class="v">${eur(c.constate)}</span>
        <span class="k">Expliqué — résolution probante</span><span class="v">${eur(c.explique)}</span></div>
      <div class="kv"><span class="k">Corrigé — écriture de version</span><span class="v">${eur(c.corrige)}</span>
        <span class="k">Anomalies corrigées</span><span class="v">${c.nCorrigees} sur ${c.n}</span></div>
      <div class="kv"><span class="k">Résiduel au cumul</span>
        <span class="v"${c.residuel ? ' style="color:var(--anomalie)"' : ''}>${eur(c.residuel)}</span>
        <span class="k">Rapport au seuil de signification</span>
        <span class="v">${pct(Math.abs(c.residuel) / Math.max(1, s.M), 0)}</span></div>
    </div>
    ${table([{k:'v',t:'Si le dossier était à…'},{k:'n',t:'Anomalies',n:1},{k:'c',t:'Constaté',n:1},
             {k:'x',t:'Corrigé par écriture',n:1},{k:'m',t:'Résiduel au cumul',n:1},{k:'d',t:'Écart',n:1}],
      [{ v:`<b>version ${S.version} — état actuel</b>`, n:String(c.n), c:eur(c.constate),
         x:eur(c.corrige), m:`<b>${eur(c.residuel)}</b>`, d:'<span class="smallcaps">—</span>' }]
      .concat(autres.map(x => ({
        v:`version ${x.v.n} — ${esc(x.v.lib)}`, n:String(x.c.n), c:eur(x.c.constate),
        x:eur(x.c.corrige), m:eur(x.c.residuel),
        d:x.c.residuel !== c.residuel
          ? `<span style="color:var(--anomalie)">${eur(x.c.residuel - c.residuel)}</span>` : '—' }))))}
    <p class="note">Chaque ligne est un calcul réel : la version y est réellement prise en compte, le dossier
    réévalué, puis l’état rétabli. Ce n’est pas une estimation. Une anomalie ne quitte le cumul que de deux
    façons — une <b>résolution probante</b> enregistrée là où l’écart est né, ou une <b>écriture de correction</b>
    présente dans une version prise en compte. Il n’y a pas de troisième chemin, et pas de case à cocher.</p>`);
}
