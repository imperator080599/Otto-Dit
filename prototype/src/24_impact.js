
/* ═══ 37. RAPPORT D'IMPACT D'UNE VERSION ═══════════════════════════════════
   Afficher trois colonnes de balance ne coûte rien et ne dit rien. La
   question d'un chef de mission qui reçoit un nouveau fichier est : QU'EST-CE
   QUE ÇA CASSE ? Six réponses, toutes calculées en évaluant réellement le
   dossier sur les deux versions, jamais annoncées.
   ═══════════════════════════════════════════════════════════════════════ */

/** Évalue une fonction comme si la version n était prise en compte, puis
 *  rétablit l'état. Les caches dérivés sont vidés de part et d'autre : sans
 *  cela le rapport comparerait une version aux nombres de l'autre. */
function auVersion(n, fn){
  const av = S.version;
  if (av === n) return fn();
  S.version = n; viderCachesDerives();
  let r;
  try { r = fn(); } finally { S.version = av; viderCachesDerives(); }
  return r;
}

/** Photographie de ce qui dépend du fichier, à une version donnée. */
function photo(n){
  return auVersion(n, () => {
    const s = seuils();
    const comptes = new Map(tb().map(r => [r[0], { lib:r[1], solde:r[2] - r[3] }]));
    const postes = postesCalcules().map(p => ({ code:p.code, lib:p.lib, solde:p.solde }));
    const perim = postesEnPerimetre().map(p => p.code);
    const ech = {};
    for (const p of postesEnPerimetre()) for (const pr of proceduresRequises(p)){
      if (!pr.ech) continue;
      const e = echantillonProc(p, pr);
      if (e) ech[p.code + '/' + pr.code] = { n:e.retenus.length, masse:e.pop.masse,
        pop:e.pop.items.length, cles:e.retenus.map(x => x.cle).join('|') };
    }
    const rap = rapprochement(n).filter(r => r.ecart !== 0)
      .map(r => ({ compte:r.compte, lib:r.lib, ecart:r.ecart }));
    return { n, s, comptes, postes, perim, ech, rap,
             ecritures:ledgerVersion(n).entries.length, empreinte:empreinteVersion(n) };
  });
}

/* Le rapport dépend de la version ET de l'état saisi (travaux achevés, version
   d'exécution des papiers, réglage des seuils). La clé du cache le dit, plutôt
   que de compter sur un vidage posé au bon endroit. */
const _impCache = new Map();
function cleImpact(a, b){
  const t = travaux().filter(x => x.statut === 'acheve' || x.statut === 'revu')
    .map(x => x.code + ':' + (x.poste && x.proc ? proc(x.poste, x.proc).execVersion : '')).join(',');
  return [a, b, S.benchmark, S.pctM, S.pctPM, S.pctCTT,
          Object.keys(S.scopingOverride).join('|'), t].join('§');
}
function impact(a, b){
  const cle = cleImpact(a, b);
  if (_impCache.has(cle)) return _impCache.get(cle);
  if (_impCache.size > 40) _impCache.clear();
  const A = photo(a), B = photo(b);

  /* 1. quels comptes ont bougé, et de combien */
  const tous = [...new Set([...A.comptes.keys(), ...B.comptes.keys()])].sort();
  const mouvements = tous.map(c => {
    const x = A.comptes.get(c), y = B.comptes.get(c);
    return { compte:c, lib:(y || x).lib, av:x ? x.solde : null, ap:y ? y.solde : null,
             delta:(y ? y.solde : 0) - (x ? x.solde : 0),
             nouveau:!x && !!y, disparu:!!x && !y };
  }).filter(m => m.delta !== 0 || m.nouveau || m.disparu);

  /* 2. lesquels franchissent un seuil — dans un sens ou dans l'autre.
        Le seuil BOUGE aussi : un compte peut franchir sans avoir bougé, et
        c'est précisément le cas qu'on ne voit pas à l'œil nu. */
  const franchit = [];
  for (const c of tous){
    const x = A.comptes.get(c), y = B.comptes.get(c);
    const sa = x ? Math.abs(x.solde) : 0, sb = y ? Math.abs(y.solde) : 0;
    const da = sa >= A.s.CTT, db = sb >= B.s.CTT;
    if (da !== db) franchit.push({ compte:c, lib:(y || x).lib, seuil:'remontée',
      seuilAv:A.s.CTT, seuilAp:B.s.CTT, av:x ? x.solde : 0, ap:y ? y.solde : 0,
      sens:db ? 'entre' : 'sort', bouge:(x ? x.solde : 0) !== (y ? y.solde : 0) });
  }

  /* 3. quels postes entrent ou sortent du périmètre */
  const perimetre = [];
  for (const p of B.postes){
    const dedans = B.perim.includes(p.code), avant = A.perim.includes(p.code);
    if (dedans !== avant){
      const q = A.postes.find(x => x.code === p.code);
      perimetre.push({ code:p.code, lib:p.lib, sens:dedans ? 'entre' : 'sort',
        av:q ? q.solde : 0, ap:p.solde, pmAv:A.s.PM, pmAp:B.s.PM,
        bouge:!q || q.solde !== p.solde });
    }
  }

  /* 4. quels échantillons deviennent périmés parce que leur population a changé */
  const echantillons = [];
  for (const k of new Set([...Object.keys(A.ech), ...Object.keys(B.ech)])){
    const x = A.ech[k], y = B.ech[k];
    if (!x && y){ echantillons.push({ k, cause:'procédure nouvelle', y }); continue; }
    if (x && !y){ echantillons.push({ k, cause:'procédure disparue', x }); continue; }
    if (x.cles !== y.cles){
      const ax = new Set(x.cles.split('|')), ay = new Set(y.cles.split('|'));
      echantillons.push({ k, x, y,
        cause:'sélection modifiée',
        entres:[...ay].filter(v => !ax.has(v)).length,
        sortis:[...ax].filter(v => !ay.has(v)).length });
    } else if (x.pop !== y.pop || x.masse !== y.masse){
      echantillons.push({ k, x, y, cause:'population modifiée, sélection inchangée', entres:0, sortis:0 });
    }
  }

  /* 5. quels travaux achevés ou revus reposent sur une version périmée */
  const travauxTouches = [];
  for (const t of travaux()){
    if (t.statut !== 'acheve' && t.statut !== 'revu') continue;
    const st = t.proc && t.poste ? proc(t.poste, t.proc) : null;
    const ver = st && st.execVersion !== undefined && st.execVersion !== null ? st.execVersion : a;
    if (ver >= b) continue;
    const k = t.poste + '/' + t.proc;
    const e = echantillons.find(x => x.k === k);
    travauxTouches.push({ code:t.code, intitule:t.intitule, posteLib:t.posteLib, statut:t.statut,
      version:ver, cause:e ? e.cause : 'version du fichier plus récente' });
  }

  /* 6. quelles anomalies levées sur une version antérieure sont déjà corrigées */
  const corrigees = A.rap.filter(x => !B.rap.some(y => y.compte === x.compte))
    .map(x => ({ ...x, quoi:'écart de rapprochement' }));
  const nouvelles = B.rap.filter(x => !A.rap.some(y => y.compte === x.compte))
    .map(x => ({ ...x, quoi:'écart de rapprochement' }));

  const r = { a, b, A, B, mouvements, franchit, perimetre, echantillons, travauxTouches,
              corrigees, nouvelles,
              seuilsBougent:A.s.M !== B.s.M || A.s.PM !== B.s.PM || A.s.CTT !== B.s.CTT };
  _impCache.set(cle, r);
  return r;
}

/* ── travaux à reconfirmer : DÉRIVÉ, jamais écrit dans le statut ──────────
   Un travail achevé sur une version antérieure n'est pas « encore achevé » :
   il est à reconfirmer, et le motif est celui du rapport d'impact. Le statut
   stocké n'est pas modifié — si l'on revient à la version d'exécution, le
   travail redevient achevé de lui-même, sans qu'aucune écriture d'état n'ait
   eu lieu. */
function aReconfirmer(t){
  if (t.statut !== 'acheve' && t.statut !== 'revu') return null;
  if (!t.poste || !t.proc) return null;
  const st = proc(t.poste, t.proc);
  if (st.execVersion === undefined || st.execVersion === null) return null;
  if (st.execVersion >= S.version) return null;
  if (st.reconfirme === S.version) return null;
  const p = postesCalcules().find(x => x.code === t.poste);
  const pr = PROCEDURES.find(x => x.code === t.proc);
  const per = p && pr ? peremption(p, pr) : null;
  return { de:st.execVersion, a:S.version,
    motif:per && per.populationChangee
      ? 'la population de la sélection a changé avec la version ' + S.version
      : 'exécuté sur la version ' + st.execVersion + ', le dossier est à la version ' + S.version };
}
function reconfirmer(code){
  const t = travailDe(code);
  if (!t || !t.poste || !t.proc) return { ok:false, why:'travail sans papier de travail' };
  const st = proc(t.poste, t.proc), r = aReconfirmer(t);
  if (!r) return { ok:false, why:'ce travail n’est pas à reconfirmer' };
  const tr = trav(code);
  if (tr.statut === 'revu' && tr.reviseur !== S.moi) return { ok:false, why:'seul le réviseur affecté peut reconfirmer un travail revu' };
  if (tr.statut === 'acheve' && tr.preparateur !== S.moi) return { ok:false, why:'seul le préparateur affecté peut reconfirmer ce travail' };
  st.reconfirme = S.version;
  st.execVersion = S.version;
  const p = postesCalcules().find(x => x.code === t.poste);
  const pr = PROCEDURES.find(x => x.code === t.proc);
  st.execEmpreinte = empreinteSelection(p, pr);
  logEvent('travail reconfirmé', t.code + ' — ' + t.intitule,
           'version ' + r.de + ' → ' + r.a + ' · ' + USERS[S.moi].nom);
  return { ok:true };
}
/** Un visa posé sur une version antérieure est signalé, pas effacé. */
function visaPerime(code){
  const st = sec(code);
  if (!st.visa || st.visa.version === undefined) return null;
  return st.visa.version < S.version ? { de:st.visa.version, a:S.version } : null;
}

/* ═══ 38. VUE « VERSIONS DU FICHIER » ══════════════════════════════════════ */
function vueVersions(){
  const attente = versionsEnAttente();
  const courante = versionCourante();
  const cible = S.impactVers || (attente.length ? attente[0].n : Math.max(1, S.version));
  const source = S.impactDe || Math.max(1, cible - 1);
  return entete('Versions de la balance et du grand livre',
                'un mandat en reçoit trois à cinq — rien n’est écrasé, et une version reçue n’est pas une version prise en compte') +
    blocVersions(attente, courante) +
    (cible > 1 ? blocImpact(source, cible) : '') +
    blocBalanceVersions() +
    blocRapproVersions();
}

function blocVersions(attente, courante){
  const rows = VERSIONS.map(v => {
    const recue = v.date <= S.aujourdhui;
    const etat = v.n === S.version ? '<span class="pill">prise en compte</span>'
      : v.n < S.version ? '<span class="smallcaps">antérieure</span>'
      : recue ? '<span class="pill warn">reçue, en attente</span>'
      : '<span class="smallcaps">non reçue</span>';
    return {
      n:`<span class="mono">v${v.n}</span>`,
      l:`<b>${esc(v.lib)}</b><div class="smallcaps">${esc(v.note)}</div>`,
      d:`<span class="mono">${frDate(v.date)}</span><div class="smallcaps">${esc(v.par)}</div>`,
      f:`<span class="smallcaps">${esc(v.fichiers)}</span>`,
      e:`<span class="mono">${esc(empreinteVersion(v.n))}</span>`,
      w:String(v.ecritures.length),
      s:etat,
      a:recue && v.n !== S.version
        ? `<button class="btn mini ${v.n > S.version ? '' : 'sec'}" data-vers="${v.n}">${v.n > S.version ? 'prendre en compte' : 'revenir à cette version'}</button>`
        : '',
    };
  });
  return blk('Versions reçues', VERSIONS.length,
    table([{k:'n',t:'Version'},{k:'l',t:'Objet',cls:'wrapcell'},{k:'d',t:'Reçue le'},
           {k:'f',t:'Fichiers',cls:'wrapcell'},{k:'e',t:'Empreinte'},{k:'w',t:'Écritures',n:1},
           {k:'s',t:'État'},{k:'a',t:''}], rows) +
    (attente.length ? `<div class="callout warn"><b>Version ${attente[0].n} reçue le ${frDate(attente[0].date)}, pas encore prise en compte.</b>
      Lisez le rapport d’impact ci-dessous avant de basculer : prendre en compte une version change les seuils,
      le périmètre et les sélections, et remet en cause les travaux déjà achevés.</div>` : '') +
    `<p class="note">Une version n’est jamais une régénération : c’est le grand livre précédent
    <b>plus</b> les écritures passées depuis. L’empreinte est calculée sur le contenu du fichier ;
    deux versions identiques auraient la même. Le dossier est à la version ${S.version}
    — ${esc(courante.lib)}.</p>`);
}

function blocImpact(a, b){
  const i = impact(a, b);
  const va = VERSIONS.find(v => v.n === a), vb = VERSIONS.find(v => v.n === b);
  const compte = (l, s) => `<span class="pill ${l ? s : ''}">${l} ${l > 1 ? '' : ''}</span>`;
  const sel = `<div class="row">
    <div class="ctrl"><label>De la version</label>
      <select id="imp-de">${VERSIONS.filter(v => v.n < Math.max(...VERSIONS.map(x => x.n))).map(v =>
        `<option value="${v.n}" ${v.n === a ? 'selected' : ''}>v${v.n} — ${esc(v.lib)}</option>`).join('')}</select></div>
    <div class="ctrl"><label>à la version</label>
      <select id="imp-vers">${VERSIONS.filter(v => v.n > 1).map(v =>
        `<option value="${v.n}" ${v.n === b ? 'selected' : ''}>v${v.n} — ${esc(v.lib)}</option>`).join('')}</select></div>
  </div>`;

  const seuilsRow = `
    <h3>Ce que la version fait aux seuils</h3>
    ${table([{k:'q',t:'Seuil'},{k:'a',t:'v' + a,n:1},{k:'b',t:'v' + b,n:1},{k:'d',t:'Écart',n:1},{k:'p',t:'Effet',cls:'wrapcell'}], [
      { q:'Référence — ' + esc(i.B.s.bench.lib), a:eur0(i.A.s.bench.val), b:eur0(i.B.s.bench.val),
        d:eur0(i.B.s.bench.val - i.A.s.bench.val),
        p:'les écritures de la version modifient la référence, donc les trois seuils' },
      { q:'Seuil de signification', a:eur0(i.A.s.M), b:eur0(i.B.s.M), d:eur0(i.B.s.M - i.A.s.M),
        p:'ce qui rend les comptes trompeurs' },
      { q:'Seuil de planification', a:eur0(i.A.s.PM), b:eur0(i.B.s.PM), d:eur0(i.B.s.PM - i.A.s.PM),
        p:'ce qui entre au périmètre et la strate exhaustive des sélections' },
      { q:'Seuil de remontée', a:eur0(i.A.s.CTT), b:eur0(i.B.s.CTT), d:eur0(i.B.s.CTT - i.A.s.CTT),
        p:'ce qui est cumulé plutôt que jugé trivial' },
    ])}
    ${i.seuilsBougent ? `<div class="callout warn"><b>Les seuils bougent avec la version</b> — la référence
      de matérialité est calculée sur la balance, et la balance a changé. Un compte peut donc changer de côté
      sans avoir bougé d’un centime, et un poste entrer au périmètre sans qu’aucune écriture ne l’ait touché.
      ${i.franchit.filter(x => !x.bouge).length || i.perimetre.filter(x => !x.bouge).length
        ? `<b>C’est le cas ici</b> pour ${i.franchit.filter(x => !x.bouge).length} compte(s) et
           ${i.perimetre.filter(x => !x.bouge).length} poste(s), signalés dans les tableaux 2 et 3.`
        : `Vérifié sur cette transition : <b>aucun compte ni poste n’est dans ce cas</b> — tous ceux qui
           changent de côté ont eux-mêmes bougé. Le contrôle est fait à chaque version, pas supposé.`}</div>` : ''}`;

  const q1 = `
    <h3>1. Comptes qui ont bougé <span class="tag">${i.mouvements.length}</span></h3>
    ${i.mouvements.length ? table([{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'},
      {k:'a',t:'v' + a,n:1},{k:'b',t:'v' + b,n:1},{k:'d',t:'Écart',n:1},{k:'q',t:''}],
      i.mouvements.map(m => ({ c:`<span class="mono">${m.compte}</span>`, l:esc(m.lib),
        a:m.av === null ? '<span class="smallcaps">absent</span>' : eur(m.av),
        b:m.ap === null ? '<span class="smallcaps">absent</span>' : eur(m.ap),
        d:'<b>' + eur(m.delta) + '</b>',
        q:m.nouveau ? '<span class="pill warn">compte apparu</span>' : m.disparu ? '<span class="pill warn">compte disparu</span>' : '' })),
      { foot:{ c:'Total', d:eur(i.mouvements.reduce((t, m) => t + m.delta, 0)) } })
      : '<p class="note">Aucun compte n’a bougé.</p>'}`;

  const q2 = `
    <h3>2. Comptes qui franchissent le seuil de remontée <span class="tag">${i.franchit.length}</span></h3>
    ${i.franchit.length ? table([{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'},
      {k:'a',t:'Solde v' + a,n:1},{k:'b',t:'Solde v' + b,n:1},{k:'s',t:'Seuil v' + a + ' → v' + b,n:1},{k:'q',t:'Sens',cls:'wrapcell'}],
      i.franchit.map(x => ({ c:`<span class="mono">${x.compte}</span>`, l:esc(x.lib),
        a:eur(x.av), b:eur(x.ap), s:eur0(x.seuilAv) + ' → ' + eur0(x.seuilAp),
        q:(x.sens === 'entre' ? '<span class="pill bad">entre au-dessus du seuil</span>' : '<span class="pill">passe en dessous</span>')
          + (x.bouge ? '' : ' <span class="smallcaps">le compte n’a pas bougé : c’est le seuil qui a bougé</span>') })))
      : '<p class="note">Aucun compte ne change de côté par rapport au seuil de remontée.</p>'}`;

  const q3 = `
    <h3>3. Postes qui entrent ou sortent du périmètre <span class="tag">${i.perimetre.length}</span></h3>
    ${i.perimetre.length ? table([{k:'p',t:'Poste',cls:'wrapcell'},{k:'a',t:'Solde v' + a,n:1},
      {k:'b',t:'Solde v' + b,n:1},{k:'s',t:'Seuil de planification',n:1},{k:'q',t:'Sens',cls:'wrapcell'},{k:'v',t:''}],
      i.perimetre.map(x => ({ p:esc(x.lib), a:eur(x.av), b:eur(x.ap),
        s:eur0(x.pmAv) + ' → ' + eur0(x.pmAp),
        q:x.sens === 'entre' ? '<span class="pill bad">entre au périmètre — une section entière à ouvrir</span>'
                             : '<span class="pill warn">sort du périmètre — travaux à archiver, pas à supprimer</span>',
        v:`<button class="btn mini sec" data-open="${x.code}">voir</button>` })))
      : '<p class="note">Le périmètre est inchangé.</p>'}`;

  const q4 = `
    <h3>4. Sélections périmées <span class="tag">${i.echantillons.length}</span></h3>
    ${i.echantillons.length ? table([{k:'k',t:'Procédure'},{k:'c',t:'Cause',cls:'wrapcell'},
      {k:'p',t:'Population v' + a + ' → v' + b,n:1},{k:'n',t:'Retenus',n:1},{k:'m',t:'Mouvement',cls:'wrapcell'}],
      i.echantillons.map(x => ({ k:`<span class="mono">${esc(x.k)}</span>`, c:esc(x.cause),
        p:x.x && x.y ? x.x.pop + ' → ' + x.y.pop : (x.y ? '— → ' + x.y.pop : x.x.pop + ' → —'),
        n:x.x && x.y ? x.x.n + ' → ' + x.y.n : (x.y ? '— → ' + x.y.n : x.x.n + ' → —'),
        m:x.entres === undefined ? '<span class="smallcaps">—</span>'
          : `${x.entres} élément(s) entré(s), ${x.sortis} sorti(s)` })))
      : '<p class="note">Aucune sélection n’est modifiée : les populations et les tirages sont identiques.</p>'}
    <p class="note">Le germe ne change pas : si la sélection bouge, c’est que la population a bougé.
    Un papier de travail exécuté sur une sélection qui n’existe plus ne prouve plus ce qu’il disait.</p>`;

  const q5 = `
    <h3>5. Travaux achevés ou revus sur une version antérieure <span class="tag">${i.travauxTouches.length}</span></h3>
    ${i.travauxTouches.length ? table([{k:'c',t:'Travail'},{k:'i',t:'Intitulé',cls:'wrapcell'},
      {k:'s',t:'Statut'},{k:'v',t:'Exécuté sur'},{k:'m',t:'Motif',cls:'wrapcell'}],
      i.travauxTouches.map(t => ({ c:`<span class="mono">${esc(t.code)}</span>`,
        i:`<b>${esc(t.intitule)}</b>${t.posteLib ? '<div class="smallcaps">' + esc(t.posteLib) + '</div>' : ''}`,
        s:`<span class="pill">${esc(STATUT_TRAVAIL[t.statut])}</span>`,
        v:`<span class="mono">v${t.version}</span>`, m:esc(t.cause) })))
      : `<p class="note">Aucun travail achevé ou revu ne repose sur une version antérieure — parce
         qu’aucun ne l’est encore, ou parce qu’ils ont été reconfirmés.</p>`}
    <p class="note">Ces travaux ne sont pas conservés en silence : ils passent à <b>« à reconfirmer »</b>
    dès la prise en compte, avec le motif ci-dessus. Le statut stocké n’est pas modifié — revenir à la
    version d’exécution les rend à leur état antérieur sans qu’aucune écriture n’ait eu lieu.</p>`;

  const q6 = `
    <h3>6. Anomalies déjà corrigées par la nouvelle version <span class="tag">${i.corrigees.length}</span></h3>
    ${i.corrigees.length ? table([{k:'q',t:'Nature'},{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'},{k:'m',t:'Écart v' + a,n:1}],
      i.corrigees.map(x => ({ q:esc(x.quoi), c:`<span class="mono">${x.compte}</span>`, l:esc(x.lib), m:eur(x.ecart) })))
      : '<p class="note">Aucune anomalie de la version ' + a + ' n’est résorbée par la version ' + b + '.</p>'}
    ${i.nouvelles.length ? `<h3>… et anomalies que la nouvelle version fait apparaître <span class="tag">${i.nouvelles.length}</span></h3>` +
      table([{k:'q',t:'Nature'},{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'},{k:'m',t:'Écart v' + b,n:1}],
        i.nouvelles.map(x => ({ q:esc(x.quoi), c:`<span class="mono">${x.compte}</span>`, l:esc(x.lib), m:eur(x.ecart) })))
      : ''}
    <p class="note">Une anomalie résorbée n’est pas effacée du dossier : le rapprochement de chaque version
    reste consultable plus bas, et la piste d’audit conserve la version sur laquelle elle avait été relevée.</p>`;

  return blk('Rapport d’impact — v' + a + ' → v' + b,
    `${i.mouvements.length} comptes · ${i.perimetre.length} postes · ${i.echantillons.length} sélections`,
    sel + `<p class="note"><b>${esc(vb.lib)}</b>, reçue le ${frDate(vb.date)} de ${esc(vb.par)}, comparée à
      <b>${esc(va.lib)}</b> du ${frDate(va.date)}. Tout ce qui suit est calculé en évaluant réellement le
      dossier sur les deux versions.</p>`
    + seuilsRow + q1 + q2 + q3 + q4 + q5 + q6);
}

/** Balance multi-colonnes : une colonne par version, l'écart entre deux versions successives. */
function blocBalanceVersions(){
  const ns = VERSIONS.map(v => v.n);
  const tbs = Object.fromEntries(ns.map(n => [n, new Map(tbVersion(n).map(r => [r[0], r]))]));
  const comptes = [...new Set(ns.flatMap(n => tbVersion(n).map(r => r[0])))].sort();
  const bouge = c => ns.some(n => n > 1 && solde(tbs[n].get(c)) !== solde(tbs[n - 1].get(c)));
  const seulsMouv = S.balTout !== true;
  const vus = seulsMouv ? comptes.filter(bouge) : comptes;
  const cols = [{k:'c',t:'Compte'},{k:'l',t:'Intitulé',cls:'wrapcell'}];
  for (const n of ns) cols.push({ k:'v' + n, t:'v' + n, n:1 });
  for (const n of ns) if (n > 1) cols.push({ k:'d' + n, t:'v' + (n - 1) + ' → v' + n, n:1 });
  const rows = vus.map(c => {
    const r = { c:`<span class="mono">${c}</span>`,
                l:esc((tbs[ns[ns.length - 1]].get(c) || tbs[1].get(c))[1]) };
    for (const n of ns){ const x = tbs[n].get(c); r['v' + n] = x ? eur(solde(x)) : '<span class="smallcaps">absent</span>'; }
    for (const n of ns) if (n > 1){
      const d = solde(tbs[n].get(c)) - solde(tbs[n - 1].get(c));
      r['d' + n] = d ? '<b>' + eur(d) + '</b>' : '<span class="smallcaps">—</span>';
    }
    return r;
  });
  const foot = { c:'Total', l:'' };
  for (const n of ns) foot['v' + n] = eur(vus.reduce((a, c) => a + solde(tbs[n].get(c)), 0));
  for (const n of ns) if (n > 1) foot['d' + n] = eur(vus.reduce((a, c) => a + solde(tbs[n].get(c)) - solde(tbs[n - 1].get(c)), 0));
  return blk('Balance, une colonne par version', vus.length + ' compte(s) affiché(s) sur ' + comptes.length,
    `<div class="row">
      <button class="btn mini sec" id="bal-tout">${seulsMouv ? 'afficher les ' + comptes.length + ' comptes' : 'n’afficher que les comptes qui bougent'}</button>
      <span class="smallcaps">rien n’est écrasé : chaque version reste lisible dans sa colonne</span>
    </div>` + table(cols, rows, { foot }));
}
function solde(r){ return r ? r[2] - r[3] : 0; }

/** Le rapprochement est rejoué à chaque version ; les écarts antérieurs restent lisibles. */
function blocRapproVersions(){
  const rows = VERSIONS.map(v => {
    const ec = rapprochement(v.n).filter(r => r.ecart !== 0);
    return { n:`<span class="mono">v${v.n}</span>`, l:esc(v.lib),
      e:ec.length ? `<span class="pill bad">${ec.length}</span>` : '<span class="pill">aucun</span>',
      d:ec.length ? ec.map(r => `<span class="mono">${r.compte}</span> ${eur(r.ecart)}`).join(' · ')
                  : '<span class="smallcaps">balance et grand livre concordent</span>',
      m:esc(v.n === 1 ? 'écriture de situation à la balance, absente du fichier des écritures'
          : (v.ecritures.some(x => x.cible === 'gl') && !ec.length) ? 'l’écriture manquante a été reprise : l’écart de la version précédente est résorbé'
          : ec.length ? 'écriture passée à la balance seule : le fichier des écritures transmis lui est antérieur'
          : 'aucune écriture à sens unique') };
  });
  return blk('Rapprochement rejoué à chaque version', VERSIONS.length + ' rapprochements',
    table([{k:'n',t:'Version'},{k:'l',t:'Objet',cls:'wrapcell'},{k:'e',t:'Écarts',n:1},
           {k:'d',t:'Détail',cls:'wrapcell'},{k:'m',t:'Cause',cls:'wrapcell'}], rows) +
    `<p class="note">Le rapprochement n’est pas refait « à la place » de l’ancien : chaque version garde le sien.
    Un écart résorbé se lit encore sur la version où il avait été relevé.</p>`);
}
