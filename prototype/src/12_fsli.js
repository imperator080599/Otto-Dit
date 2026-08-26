/* ── marques de pointage : la convention du papier de travail ─────────────
   Une marque en chasse fixe, soulignée de pointillés, avec sa légende sous le
   tableau. Elle n'est pas une pastille d'état saisie à côté : c'est
   l'AFFICHAGE des cinq états dérivés (voir ETATS_LIGNE), dans l'ordre du
   cycle de vie d'un justificatif. Seuls « écart » et « en attente » portent
   une couleur : elles appellent une action. */
const CLS_MARQUE = { x:'x', n:'n' };
const MARQUES = Object.fromEntries(ETATS_LIGNE.map(e =>
  [e.mk, { lib:e.lib, d:e.d, cls:CLS_MARQUE[e.mk] || '' }]));
function marque(k, titre){
  const m = MARQUES[k];
  return `<span class="mk ${m.cls || ''}" title="${esc(titre || m.d)}">${k}</span>`;
}
const LEGENDE_MARQUES = '<div class="legende">' + Object.entries(MARQUES)
  .map(([k, m]) => `<span><b>${k}</b> ${esc(m.lib)} — ${esc(m.d)}</span>`).join('')
  + '<span>Aucun de ces états ne se saisit : chacun se déduit du dépôt du client, '
  + 'de la valeur relevée et de la résolution documentée.</span></div>';

/* ═══ 11. SECTION DE TRAVAIL PAR FSLI ══════════════════════════════════════
   Un poste, et dans ce poste tout ce qu'il faut pour le boucler. Les
   sélections et les papiers appartiennent aux PROCÉDURES, pas à la section :
   une section porte plusieurs procédures, chacune avec sa population, son
   germe et son papier.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── papiers et notes de l'exercice précédent : visibles, jamais repris ──── */
const PAPIERS_N1 = {
  CA:    [{ id:'CA-01', lib:'Test de détail des ventes — 22 éléments', concl:'Aucune anomalie au-delà du seuil de remontée.' },
          { id:'CA-02', lib:'Séparation des exercices — 10 jours autour de la clôture', concl:'Deux factures reclassées, corrigées par le client.' }],
  CLIENTS:[{ id:'CL-01', lib:'Circularisation clients — 8 tiers', concl:'Taux de retour 62 %, procédures alternatives sur le solde.' }],
  TRESO: [{ id:'TR-01', lib:'Confirmations bancaires', concl:'Toutes les banques confirmées, aucun écart.' }],
  ACHATS:[{ id:'AC-01', lib:'Test de détail des achats — 18 éléments', concl:'Un avoir non comptabilisé, sous le seuil de remontée.' }],
  STOCKS:[{ id:'ST-01', lib:'Assistance à l’inventaire physique', concl:'Écarts d’inventaire non significatifs.' }],
};

/* ─────────────────────────────────────────────────────────────────────────
   1. COMPTES DE LA SECTION
   Deux indicateurs distincts : position du compte / seuil de remontée
   (triage interne) et poids / seuil de planification (périmètre).
   ───────────────────────────────────────────────────────────────────────── */
function blocComptes(p){
  const s = seuils(), st = sec(p.code);
  const rows = p.comptes.map(c => {
    const n = bal().get(c).solde, n1 = B24.get(c) ? B24.get(c).solde : 0, d = n - n1;
    const pr = n1 === 0 ? null : d / Math.abs(n1);
    const propose = Math.abs(n) < s.CTT ? 'ns' : 'sig';
    return { c, lib:bal().get(c).lib, n, n1, d, pr, propose, retenu:st.ns[c] || propose,
             rCTT:Math.abs(n) / s.CTT, rPM:Math.abs(n) / s.PM };
  });
  const tot = rows.reduce((a, r) => a + r.n, 0), totN1 = rows.reduce((a, r) => a + r.n1, 0);
  const body = rows.map(r => ({
    c:`<span class="mono">${r.c}</span>`, lib:esc(r.lib),
    n1:eur(r.n1), n:eur(r.n), d:eur(r.d),
    pr:r.pr === null ? '<span class="smallcaps">—</span>' : pct(r.pr, 1),
    ctt:`${r.rCTT >= 1 ? '<b>' : ''}${pct(r.rCTT, 0)}${r.rCTT >= 1 ? '</b>' : ''}`,
    pm:pct(r.rPM, 0),
    st:`<select class="cell txt" data-ns="${r.c}" style="width:140px">
          <option value="auto" ${!st.ns[r.c] ? 'selected' : ''}>proposé : ${r.propose === 'ns' ? 'non significatif' : 'significatif'}</option>
          <option value="sig" ${st.ns[r.c] === 'sig' ? 'selected' : ''}>significatif (surchargé)</option>
          <option value="ns"  ${st.ns[r.c] === 'ns'  ? 'selected' : ''}>non significatif (surchargé)</option>
        </select>` +
        (st.ns[r.c] ? `<input class="cell txt" data-nsm="${r.c}" placeholder="motif obligatoire" value="${esc(st.nsMotif[r.c] || '')}" style="margin-top:3px">` : ''),
    nt:boutonNote(p.code, 'compte', r.c, 'Compte ' + r.c + ' — ' + r.lib),
  }));
  const sansMotif = rows.filter(r => st.ns[r.c] && !(st.nsMotif[r.c] || '').trim());
  return `
    <p class="note">Soldes signés · « / remontée » ${eur0(s.CTT)} · « / planification » ${eur0(s.PM)}</p>
    ${table([{k:'c',t:'Compte'},{k:'lib',t:'Intitulé',cls:'wrapcell'},{k:'n1',t:'31/12/2024',n:1},
             {k:'n',t:'31/12/2025',n:1},{k:'d',t:'Variation',n:1},{k:'pr',t:'%',n:1},
             {k:'ctt',t:'/ remontée',n:1},{k:'pm',t:'/ planification',n:1},
             {k:'st',t:'Statut'},{k:'nt',t:''}], body,
            { foot:{ c:'Total', n1:eur(totN1), n:eur(tot), d:eur(tot - totN1) } })}
    ${sansMotif.length ? `<div class="callout bad"><b>Surcharge sans motif</b> : ${sansMotif.map(r => r.c).join(', ')}.</div>` : ''}
    ${blocRevueAnalytique(p)}`;
}

/** Revue analytique SUBSTANTIVE du poste — l'un des trois moments (voir
 *  vueRAPrelim en planification et vueRAFinale à l'achèvement). */
function blocRevueAnalytique(p){
  const lignes = revueAnalytique().filter(l => p.re.test(l.compte));
  const flags = lignes.filter(l => l.flag);
  const deja = c => requetesDe(p.code).some(r => r.origine === 'revue analytique substantive'
                                              && r.items.some(i => i.ref === c));
  return `
    <h3>Revue analytique substantive du poste</h3>
    <div class="row">
      <div class="ctrl"><label>Seuil en montant</label>
        <input type="number" id="ar-montant" value="${(arSeuilMontant() / 100).toFixed(0)}" step="1000"></div>
      <div class="ctrl"><label>Seuil en pourcentage</label>
        <input type="number" id="ar-pct" value="${S.arPct}" step="1"></div>
      <div class="ctrl"><label>&nbsp;</label>
        <span class="pill ${flags.length ? 'warn' : ''}">${flags.length} compte(s) au-dessus d’un seuil</span></div>
    </div>
    ${flags.length ? `<div class="tw"><table>
      <thead><tr><th>Compte</th><th class="n">Variation (sens du compte)</th><th class="n">%</th><th>Ressort</th>
        <th>Question composée</th><th></th></tr></thead>
      <tbody>${flags.map(l => `<tr>
        <td class="mono">${l.compte}<div class="smallcaps">${sensNaturel(l) < 0 ? 'créditeur' : 'débiteur'}</div></td>
        <td class="n">${eur(l.d * sensNaturel(l))}</td>
        <td class="n">${l.p === null ? '—' : pct(Math.abs(l.p) * (l.d * sensNaturel(l) > 0 ? 1 : -1), 1)}</td>
        <td>${l.parMontant ? '<span class="tag">montant</span> ' : ''}${l.parPct ? '<span class="tag">%</span>' : ''}</td>
        <td class="wrapcell">${esc(questionVariation(l))}</td>
        <td>${deja(l.compte) ? '<span class="pill">requête émise</span>'
              : `<button class="btn mini" data-ravar="${l.compte}">créer la requête d’explication</button>`}
            ${boutonNote(p.code, 'ra', l.compte, 'Revue analytique — compte ' + l.compte)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="note">Aucune variation au-dessus des seuils sur ce poste.</p>'}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   2. ÉVALUATION DU RISQUE → PROCÉDURES → TAILLE D'ÉCHANTILLON
   ───────────────────────────────────────────────────────────────────────── */
function blocRisque(p){
  const st = sec(p.code), fa = facteursActifs(p), procs = proceduresRequises(p);
  const parA = a => fa.filter(f => f.a === a);
  const lignes = ASSERTIONS.map(a => {
    const fs = parA(a.code), actifs = fs.filter(f => f.actif);
    const calc = niveauCalcule(p, a.code), ret = niveau(p, a.code), forced = !!st.override[a.code];
    return `
      <tr>
        <td><b>${esc(a.lib)}</b><div class="smallcaps" style="white-space:normal">${esc(a.d)}</div></td>
        <td class="wrapcell">${fs.map(f => f.registre ? `
          <span class="chk" style="margin:2px 3px 2px 0;border-color:var(--anomalie);background:var(--bad-soft)">
            <span>⇄ ${esc(f.lib.length > 90 ? f.lib.slice(0, 90) + '…' : f.lib)}</span>
            <span class="cnt">${esc(f.preuve)}</span></span>` : `
          <label class="chk" style="${f.declare ? '' : 'cursor:default;opacity:' + (f.actif ? 1 : .55)}">
            <input type="checkbox" ${f.actif ? 'checked' : ''} ${f.declare ? `data-fac="${f.code}"` : 'disabled'}>
            <span>${esc(f.lib)}</span>
            <span class="cnt">${f.declare ? 'déclaré' : (f.preuve ? esc(f.preuve) : 'observé')}</span>
          </label>`).join('')}</td>
        <td><span class="pill ${calc === 'eleve' ? 'bad' : calc === 'moyen' ? 'warn' : ''}">${actifs.length} → ${NIV_LIB[calc]}</span></td>
        <td>
          <select class="cell txt" data-niv="${a.code}" style="width:150px">
            <option value="">retenu = calculé (${NIV_LIB[calc]})</option>
            ${NIVEAUX.map(n => `<option value="${n}" ${st.override[a.code] === n ? 'selected' : ''}>forcé : ${NIV_LIB[n]}</option>`).join('')}
          </select>
          ${forced ? `<input class="cell txt" data-nivm="${a.code}" placeholder="motif obligatoire" value="${esc(st.overrideMotif[a.code] || '')}" style="margin-top:3px">` : ''}
        </td>
        <td><span class="pill ${ret === 'eleve' ? 'bad' : ret === 'moyen' ? 'warn' : ''}">${NIV_LIB[ret]}</span></td>
        <td>${boutonNote(p.code, 'risque', a.code, 'Évaluation du risque — ' + a.lib)}</td>
      </tr>`;
  }).join('');
  const forcedSansMotif = ASSERTIONS.filter(a => st.override[a.code] && !(st.overrideMotif[a.code] || '').trim());
  return `
    <h3>Constatations venues d’autres procédures</h3>
    ${blocFacteursSection(p)}
    <h3>Évaluation par assertion</h3>
    <div class="tw"><table>
      <thead><tr><th>Assertion</th><th>Facteurs de risque</th><th>Calculé</th><th>Jugement de l’auditeur</th><th>Retenu</th><th></th></tr></thead>
      <tbody>${lignes}</tbody>
    </table></div>
    ${forcedSansMotif.length ? `<div class="callout bad"><b>Niveau forcé sans motif</b> : ${forcedSansMotif.map(a => esc(a.lib)).join(', ')}.</div>` : ''}
    <h3>Étendue des travaux, par assertion</h3>
    ${table([{k:'a',t:'Assertion'},{k:'r',t:'Risque retenu'},{k:'n',t:'Tirage aléatoire',n:1},
             {k:'s',t:'Seuil de la strate exhaustive',n:1},{k:'p',t:'Procédures servies',cls:'wrapcell'}],
      ASSERTIONS.map(a => {
        const niv = niveau(p, a.code), pr = procs.filter(x => x.a === a.code);
        return { a:esc(a.lib),
                 r:`<span class="pill ${niv === 'eleve' ? 'bad' : niv === 'moyen' ? 'warn' : ''}">${NIV_LIB[niv]}</span>`,
                 n:String(TAILLE[niv]),
                 s:eur0(Math.round(seuils().PM * STRATE[niv])) + ' <span class="smallcaps">' + esc(STRATE_LIB[niv]) + '</span>',
                 p:pr.length ? pr.map(x => `<span class="tag">${esc(procRef(p, x))}</span>`).join(' ') : '<span class="smallcaps">aucune</span>' };
      }))}
    <p class="note">Tirage : faible ${TAILLE.faible} · moyen ${TAILLE.moyen} · élevé ${TAILLE.eleve} éléments.
    Strate exhaustive : ${STRATE_LIB.faible} · ${STRATE_LIB.moyen} · ${STRATE_LIB.eleve}, soit
    ${eur0(seuils().PM)} · ${eur0(Math.round(seuils().PM / 2))} · ${eur0(Math.round(seuils().PM / 3))}.
    Une section porte donc des échantillons de tailles différentes.</p>`;
}

/* ─────────────────────────────────────────────────────────────────────────
   3. PLAN DE TRAVAIL — la vue qu'un réviseur ouvre en premier
   Sélection → procédure → papier de travail → statut.
   ───────────────────────────────────────────────────────────────────────── */
function etatProc(p, pr){
  if (!pr.ech) return { lib:'sans sélection', cls:'', ok:true, n:null };
  const wp = wpProc(p, pr) || [], recus = wp.filter(r => ligneRecue(p, pr, r.cle)).length;
  const ctr = controles(p, pr), n = comptesEtats(ctr);
  const saisis = n.traitee + n.ecart + n.explique;
  const b = { wp, ctr, n, recus, saisis, ec:n.ecart };
  if (!recus)                return { ...b, lib:'pièces non reçues', cls:'bad', ok:false };
  if (n.attente || n.recue)  return { ...b, lib:saisis + '/' + ctr.length + ' contrôles', cls:'warn', ok:false };
  if (n.ecart)               return { ...b, lib:n.ecart + ' écart(s) à expliquer', cls:'bad', ok:false };
  return { ...b, lib:n.explique ? n.explique + ' écart(s) expliqué(s)' : 'exécutée', cls:'', ok:true };
}
function blocPlan(p){
  const procs = proceduresRequises(p);
  const rows = procs.map(pr => {
    const e = echantillonProc(p, pr), st = etatProc(p, pr);
    const ouvert = S.procOuverte === p.code + '/' + pr.code;
    return {
      pr:`<b>${esc(pr.lib)}</b><div class="smallcaps">${esc(procRef(p, pr))} · requise à partir de « ${NIV_LIB[pr.min]} »</div>`,
      a:esc(libAssertion(pr.a)) + `<div class="smallcaps">risque ${NIV_LIB[niveau(p, pr.a)]}${e ? ' · tirage ' + e.n + ' · strate ' + eur0(e.strate) : ''}</div>`,
      sel:e ? `<span class="mono">${e.retenus.length}</span> ${esc(pr.unite)}(s)
               <div class="smallcaps">${e.exhaustif.length} exhaustifs + ${e.alea.length} tirés · ${pct(e.taux, 1)} de la masse</div>`
            : '<span class="smallcaps">sans sélection</span>',
      pop:e ? `<span class="mono">${e.pop.items.length}</span><div class="smallcaps">${eur0(e.pop.masse)}</div>` : '—',
      wp:pr.ech ? `<span class="mono">${esc(procRef(p, pr))}</span>` : '<span class="smallcaps">—</span>',
      st:`<span class="pill ${st.cls}">${st.lib}</span>`
         + (pr.unidirectionnel ? ' <span class="pill warn">unidirectionnel</span>' : ''),
      act:`<button class="btn mini ${ouvert ? '' : 'sec'}" data-proc="${p.code}/${pr.code}">${ouvert ? 'ouverte' : 'ouvrir'}</button>
           ${boutonNote(p.code, 'procedure', pr.code, 'Procédure ' + procRef(p, pr))}`,
    };
  });
  return procs.length ? table([{k:'pr',t:'Procédure',cls:'wrapcell'},{k:'a',t:'Assertion'},
    {k:'pop',t:'Population',n:1},{k:'sel',t:'Sélection',cls:'wrapcell'},{k:'wp',t:'Papier'},
    {k:'st',t:'Statut'},{k:'act',t:''}], rows)
    : '<p class="note">Aucune procédure requise au niveau de risque retenu.</p>';
}

/* ─────────────────────────────────────────────────────────────────────────
   4. UNE PROCÉDURE : sa population, sa sélection, son papier
   ───────────────────────────────────────────────────────────────────────── */
const CTR_PAR_PAGE = 40;
function blocProcedure(p, pr){
  const stp = proc(p.code, pr.code), e = echantillonProc(p, pr), s = seuils();
  const cat = catalogue(p, pr), spec = catalogueSpecifique(p, pr);
  const deja = requetesDe(p.code).some(r => r.proc === pr.code);
  if (!pr.ech) return `
    <div class="row"><span class="pill">${esc(libAssertion(pr.a))}</span>
      <span class="pill">sans sélection</span><span class="smallcaps">${esc(procRef(p, pr))}</span></div>
    <p class="note">${esc(pr.lib)} — procédure exécutée sur la population entière, sans échantillonnage.</p>
    <div class="ctrl"><label>Conclusion de la procédure</label>
      <textarea data-pconcl="${pr.code}" rows="2" placeholder="résultat de la procédure">${esc(stp.conclusion)}</textarea></div>`;

  /* ── définition de la population, affichée telle quelle ── */
  const defPop = `
    <h3>Population</h3>
    <div class="kv">
      <span class="k">Définition</span><span class="v" style="font-family:var(--sans)">${esc(e.pop.lib)}</span>
      <span class="k">Comptes</span><span class="v">${p.comptes.join(' · ')}</span>
      <span class="k">Période</span><span class="v">${esc(e.pop.periode)}</span>
      <span class="k">Filtre appliqué</span><span class="v" style="font-family:var(--sans)">${esc(e.pop.filtre)}</span>
      <span class="k">Unité d’échantillonnage</span><span class="v" style="font-family:var(--sans)">${esc(pr.unite)}</span>
      <span class="k">Éléments</span><span class="v">${e.pop.items.length}</span>
      <span class="k">Masse</span><span class="v">${eur(e.pop.masse)}</span>
      <span class="k">Procédure servie</span><span class="v" style="font-family:var(--sans)">${esc(pr.lib)}</span>
      <span class="k">Assertion visée</span><span class="v" style="font-family:var(--sans)">${esc(libAssertion(pr.a))}</span>
      <span class="k">Papier alimenté</span><span class="v">${esc(procRef(p, pr))}</span>
    </div>
    ${pr.unidirectionnel ? `<div class="callout warn"><b>Test unidirectionnel.</b> ${esc(pr.unidirectionnel)}</div>` : ''}`;

  /* ── paramètres de tirage ── */
  const params = `
    <h3>Sélection</h3>
    <div class="row">
      <div class="ctrl"><label>Méthode</label>
        <select disabled><option>strate exhaustive au-dessus du seuil + tirage aléatoire</option></select></div>
      <div class="ctrl"><label>Strate exhaustive — ${esc(STRATE_LIB[e.niv])}</label>
        <input class="cell" value="${eur0(e.strate)}" disabled style="text-align:left"></div>
      <div class="ctrl"><label>Germe</label>
        <input type="text" data-pseed="${pr.code}" value="${esc(stp.seed)}"></div>
      <div class="ctrl"><label>&nbsp;</label><button class="btn sec" data-pnouveau="${pr.code}">nouveau germe</button></div>
      <div class="ctrl"><label>&nbsp;</label>
        <button class="btn" data-preq="${pr.code}" ${deja ? 'disabled' : ''}>${deja ? 'requête émise' : 'générer la requête depuis le catalogue'}</button></div>
    </div>
    <div class="grid3">
      <div class="kv"><span class="k">Strate exhaustive (≥ ${eur0(e.strate)})</span><span class="v">${e.exhaustif.length}</span>
        <span class="k">Tirage aléatoire</span><span class="v">${e.alea.length} / ${e.n} — risque ${NIV_LIB[e.niv]}</span></div>
      <div class="kv"><span class="k">Retenus</span><span class="v">${e.retenus.length}</span>
        <span class="k">Montant couvert</span><span class="v">${eur(e.couvert)}</span></div>
      <div class="kv"><span class="k">Couverture</span><span class="v">${pct(e.taux, 1)}</span>
        <span class="k">Papier</span><span class="v">${esc(procRef(p, pr))}</span></div>
    </div>`;

  /* ── catalogue de preuve appliqué ── */
  const catBloc = cat ? `
    <h3>Justificatifs attendus <span class="tag ${spec ? 'det' : ''}">${spec ? 'catalogue du cycle' : 'catalogue générique'}</span></h3>
    ${table([{k:'d',t:'Document'},{k:'c',t:'Champ à relever'},{k:'r',t:'Contrôlé contre',cls:'wrapcell'},{k:'t',t:'Tolérance'}],
      cat.flatMap(d => d.champs.map((ch, i) => ({
        d:i === 0 ? '<b>' + esc(d.doc) + '</b>' : '', c:esc(ch.lib),
        r:esc(ch.contre) + (ch.regle ? ' <span class="smallcaps">(' + esc(ch.regle) + ')</span>' : ''),
        t:esc(ch.tolLib) }))))}` : '';

  /* ── papier de travail : un contrôle par ligne ── */
  const ctr = controles(p, pr);
  const tout = S.ctrTout && S.ctrTout[p.code + '/' + pr.code];
  const vus = tout ? ctr : ctr.slice(0, CTR_PAR_PAGE);
  const wp = wpProc(p, pr), recus = wp.filter(r => ligneRecue(p, pr, r.cle)).length;
  const nEtat = comptesEtats(ctr);
  const ecarts = ctr.filter(c => c.saisi && !c.conforme);
  const rows = vus.map((c, i) => ({
    el:`<span class="mono">${esc(String(c.ligne.cle))}</span>` +
       (c.ligne.x.e ? `<div class="smallcaps">${esc(c.ligne.x.e.pieceRef)} · ${eur0(c.ligne.x.montant)}</div>`
                    : `<div class="smallcaps">${eur0(c.ligne.x.montant)}</div>`),
    doc:esc(c.doc) + (c.recu ? '' : ' ' + marque('n', 'document non reçu')),
    ch:esc(c.ch.lib),
    v:c.recu ? champInput(p, pr, c) : '<span class="smallcaps">—</span>',
    contre:esc(c.ch.contre),
    ref:c.saisi ? esc(c.refLib) : (c.recu ? esc(String(refLisible(c))) : '<span class="smallcaps">—</span>'),
    ec:marqueEtat(etatControle(c), c.saisi && !c.conforme ? 'écart : ' + c.ecartLib : null),
    tol:esc(c.ch.tolLib),
    nt:i % Math.max(1, cat ? cat.reduce((a, d) => a + d.champs.length, 0) : 1) === 0
       ? boutonNote(p.code, 'papier', c.ligne.cle, 'Papier ' + procRef(p, pr) + ' — ' + c.ligne.cle) : '',
  }));
  const st = proc(p.code, pr.code), per = peremption(p, pr);
  const papier = `
    <h3>Papier de travail <span class="mono">${esc(procRef(p, pr))}</span></h3>
    <div class="kv">
      <span class="k">Version du fichier</span><span class="v">v${S.version} — ${esc(versionCourante().lib)}</span>
      <span class="k">Empreinte</span><span class="v">${esc(empreinteVersion(S.version))}</span>
      <span class="k">Papier exécuté sur</span><span class="v">${st.execVersion === undefined || st.execVersion === null
        ? '<span class="smallcaps" style="font-family:var(--sans)">rien de saisi pour l’instant</span>'
        : 'v' + st.execVersion}</span>
    </div>
    ${per ? `<div class="callout bad"><b>Ce papier a été exécuté sur la version ${per.de}, le dossier est à la version ${per.a}.</b>
      ${per.populationChangee
        ? 'La population de la sélection a changé : les éléments testés ne sont plus ceux que la procédure retiendrait aujourd’hui.'
        : 'La sélection est identique ; seule la version du fichier diffère.'}
      Voir le <a data-vue="plan.versions" style="cursor:pointer">rapport d’impact</a>.</div>` : ''}
    <div class="row">
      <span class="pill ${recus === wp.length ? '' : 'bad'}">${recus}/${wp.length} éléments avec pièce</span>
      ${ETATS_LIGNE.map(e => `<span class="pill ${e.id === 'ecart' && nEtat[e.id] ? 'bad'
          : e.id === 'attente' && nEtat[e.id] ? 'warn' : ''}">${nEtat[e.id]} ${esc(e.lib)}</span>`).join('')}
      ${recus ? `<button class="btn sec mini" data-plire="${pr.code}">remplir comme si vous lisiez les pièces</button>` : ''}
    </div>
    ${table([{k:'el',t:'Élément'},{k:'doc',t:'Document'},{k:'ch',t:'Champ relevé'},{k:'v',t:'Valeur relevée',n:1},
             {k:'contre',t:'Contrôlé contre',cls:'wrapcell'},{k:'ref',t:'Référence',n:1},
             {k:'ec',t:'État'},{k:'tol',t:'Tolérance'},{k:'nt',t:''}], rows)}
    ${LEGENDE_MARQUES}
    ${ctr.length > vus.length ? `<button class="btn mini sec" data-ctrtout="${p.code}/${pr.code}" style="margin-top:6px">afficher les ${ctr.length} contrôles</button>`
      : tout && ctr.length > CTR_PAR_PAGE ? `<button class="btn mini sec" data-ctrtout="${p.code}/${pr.code}" style="margin-top:6px">replier</button>` : ''}
    ${blocResolutions(p, pr, ecarts)}
    <div class="ctrl" style="margin-top:8px"><label>Conclusion de la procédure</label>
      <textarea data-pconcl="${pr.code}" rows="2" placeholder="résultat de la procédure au regard des contrôles exécutés">${esc(stp.conclusion)}</textarea></div>
    ${blocFinTesting(p, pr)}`;

  return `<div class="row"><span class="pill">${esc(libAssertion(pr.a))}</span>
      <span class="smallcaps">${esc(pr.lib)}</span></div>
    ${defPop}${params}${catBloc}${papier}`;
}

/* ── résolution documentée des écarts ─────────────────────────────────────
   Un écart n'est pas résolu parce qu'on l'a commenté. Il l'est quand six
   éléments existent : l'explication du client mot pour mot, la conclusion de
   l'auditeur, la qualification, le LIEN vers ce qui corrobore, l'auteur et la
   date. C'est la contrainte déjà écrite pour les exceptions ; ce bloc la
   réutilise et n'ouvre aucun second chemin. */
function blocResolutions(p, pr, ecarts){
  if (!ecarts.length) return '';
  const chiffres = ecarts.filter(c => constateDe(c) !== 0);
  const ouverts = ecarts.filter(c => !resolutionAcquise(c));
  const cumul = chiffres.reduce((a, c) => a + residuel(c).residuel, 0);
  const expl = chiffres.reduce((a, c) => a + residuel(c).explique, 0);
  return `<h3>Écarts relevés et leur résolution</h3>
    <div class="row">
      <span class="pill ${ouverts.length ? 'bad' : ''}">${ouverts.length} écart(s) sans résolution</span>
      <span class="pill">${chiffres.length} chiffré(s) · ${ecarts.length - chiffres.length} non chiffré(s)</span>
      <span class="pill">expliqué ${eur(expl)}</span>
      <span class="pill ${cumul ? 'bad' : ''}">résiduel porté au cumul ${eur(cumul)}</span>
    </div>
    <p class="note">Un écart non chiffré — une date de pièce, un tiers, une référence — n’entre pas au cumul
    des anomalies, mais il exige les mêmes éléments probants : c’est le même casier, pas un second chemin.</p>
    ${ecarts.map(c => carteResolution(
      p.code + '#' + pr.code + '#' + c.cle,
      `<span class="mono">${esc(String(c.ligne.cle))}</span> · ${esc(c.doc)} · ${esc(c.ch.lib)}
       <span class="smallcaps">relevé ${esc(c.valLib)} · référence ${esc(c.refLib)} · ${esc(c.ecartLib)}</span>`,
      constateDe(c), resol(c), depotsElement(p, pr, c.ligne.cle))).join('')}`;
}
/* ── l'action de la section : déclarer le testing terminé ─────────────────
   L'affectation appartient au programme de travail, une seule fois. Ce que la
   section porte, c'est l'action : elle fait passer le travail à « achevé » et
   le soumet à la revue de son réviseur. Elle est refusée tant que le papier
   n'est pas en état de l'être — le bouton ne ment pas sur ce qu'il fait. */
function blocFinTesting(p, pr){
  const code = 'SEC-' + p.code + '-' + pr.code, st = trav(code), o = obstaclesProcedure(p, pr);
  const prep = st.preparateur ? USERS[st.preparateur] : null;
  const rev = st.reviseur ? USERS[st.reviseur] : null;
  const lien = `<button class="btn mini sec" data-gotrav="trav.programme">ouvrir le programme de travail</button>`;
  const t0 = travailDe(code), rc = t0 ? aReconfirmer({ ...t0, ...st }) : null;
  if (rc) return `<div class="callout bad"><b>À reconfirmer.</b> Ce travail est ${esc(STATUT_TRAVAIL[st.statut])},
      mais il a été exécuté sur la version ${rc.de} du fichier et le dossier est à la version ${rc.a} —
      ${esc(rc.motif)}. Il n’est pas conservé en silence.
      <button class="btn" data-recon="${code}">reconfirmer sur la version ${rc.a} — engage ${esc(USERS[S.moi].nom)}</button></div>`;
  if (st.statut === 'revu') return `<div class="callout"><b>Travail revu</b> par ${esc(USERS[st.revu.par].nom)} le ${horo(st.revu.t)}
      <span class="smallcaps">sur la version ${proc(p.code, pr.code).execVersion || S.version}</span>.</div>`;
  if (st.statut === 'acheve') return `<div class="callout">
      <b>Testing déclaré terminé</b> par ${esc(USERS[st.acheve.par].nom)} le ${horo(st.acheve.t)} —
      ${rev ? 'en attente de la revue de ' + esc(rev.nom) : 'aucun réviseur affecté'}.
      ${st.reviseur === S.moi ? `<button class="btn mini" data-tstat="${code}|revu">porter « revu »</button>` : ''}
      <button class="btn mini sec" data-tstat="${code}|en_cours">rouvrir le testing</button></div>`;
  if (!prep) return `<div class="callout warn"><b>Aucun préparateur affecté</b> à ce travail —
      l’affectation se fait au programme de travail, pas ici. ${lien}</div>`;
  if (st.preparateur !== S.moi) return `<div class="callout warn">
      Le testing de ce travail est confié à <b>${esc(prep.nom)}</b> ; seul son préparateur peut le déclarer terminé. ${lien}</div>`;
  if (o.length) return `<div class="callout warn"><b>Le testing ne peut pas être déclaré terminé :</b>
      <ul style="margin:5px 0 0 16px;padding:0">${o.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <button class="btn" disabled>le testing est terminé</button>`;
  return `<button class="btn" data-tstat="${code}|acheve">le testing est terminé —
    ${rev ? 'soumettre à la revue de ' + esc(rev.nom) : 'aucun réviseur affecté, à corriger au programme'}</button>`;
}
function refLisible(c){
  const r = c.ch.ref(c.ligne.x);
  return c.ch.type === 'montant' ? eur(r) : c.ch.type === 'date' ? frDate(r) : c.ch.type === 'bool' ? (r ? 'exigée' : '—') : r;
}
function champInput(p, pr, c){
  const v = c.ligne.champs[c.cle];
  if (c.ch.type === 'bool') return `<select class="cell txt" data-ctr="${esc(c.cle)}" data-pcode="${pr.code}" style="width:80px">
      <option value="">—</option><option value="oui" ${v === 'oui' ? 'selected' : ''}>oui</option>
      <option value="non" ${v === 'non' ? 'selected' : ''}>non</option></select>`;
  return `<input class="cell ${c.ch.type === 'texte' ? 'txt' : ''}" data-ctr="${esc(c.cle)}" data-pcode="${pr.code}"
    value="${esc(v === undefined ? '' : v)}" placeholder="${c.ch.type === 'date' ? 'aaaa-mm-jj' : ''}">`;
}

/* ─────────────────────────────────────────────────────────────────────────
   5. REQUÊTES DE LA SECTION
   ───────────────────────────────────────────────────────────────────────── */
function blocRequetes(p){
  const rs = requetesDe(p.code);
  const form = `<div class="row" style="margin-top:10px">
    <div class="ctrl" style="flex:1 1 320px"><label>Nouvelle requête (saisie manuelle)</label>
      <input type="text" id="req-titre" placeholder="ex. : détail du compte 706000 avec les contrats associés"></div>
    <div class="ctrl"><label>Échéance dans</label>
      <select id="req-delai"><option value="7">7 jours</option><option value="12" selected>12 jours</option><option value="20">20 jours</option></select></div>
    <div class="ctrl"><label>&nbsp;</label><button class="btn" id="req-add">créer</button></div>
  </div>`;
  if (!rs.length) return '<p class="note">Aucune requête sur cette section.</p>' + form;
  const rows = rs.map(r => {
    const a = avancement(r.items), ret = retard(r), c = S.contacts.find(x => x.id === r.contact);
    return {
      id:`<span class="mono">${r.id}</span>`, t:esc(r.titre),
      pr:r.proc ? `<span class="tag">${esc(r.proc)}</span>` : '<span class="smallcaps">—</span>',
      dest:c ? esc(c.nom) + '<div class="smallcaps">' + esc(c.fonction) + '</div>' : '—',
      ech:`<span class="mono">${frDate(r.echeance)}</span>` + (ret ? `<div class="smallcaps" style="color:var(--anomalie)">retard ${ancienneteRetard(r)} j</div>` : ''),
      av:`<div class="bar" style="width:90px"><i style="width:${(a * 100).toFixed(0)}%"></i></div><span class="smallcaps">${pct(a, 0)}</span>`,
      st:r.items.map(i => STATUTS[i.statut].lib).filter((v, i, s) => s.indexOf(v) === i)
          .map(l => `<span class="pill">${esc(l)}</span>`).join(' '),
      nt:boutonNote(p.code, 'requete', r.id, 'Requête ' + r.id) +
         ` <button class="btn mini sec" data-goreq="${r.id}">portail</button>`,
    };
  });
  return table([{k:'id',t:'N°'},{k:'t',t:'Objet',cls:'wrapcell'},{k:'pr',t:'Procédure'},
                {k:'dest',t:'Destinataire',cls:'wrapcell'},{k:'ech',t:'Échéance'},
                {k:'av',t:'Avancement'},{k:'st',t:'États',cls:'wrapcell'},{k:'nt',t:''}], rows) + form;
}

/* ─────────────────────────────────────────────────────────────────────────
   6. CONCLUSION, VISA, REPRISE N-1
   ───────────────────────────────────────────────────────────────────────── */
function obstaclesVisa(p){
  const st = sec(p.code), o = [];
  const bl = notesBloquantesOuvertes(p.code);
  if (bl.length) o.push(`${bl.length} note(s) de revue bloquante(s) ouverte(s)`);
  const fp = facteursProposes(p.code);
  if (fp.length) o.push(`${fp.length} facteur(s) de risque non statué(s)`);
  const fsm = facteursDe(p.code).filter(f => f.statut === 'ecarte' && !f.motif.trim());
  if (fsm.length) o.push(`${fsm.length} facteur(s) écarté(s) sans motif écrit`);
  for (const x of obstaclesTravaux(p.code)) o.push(x);
  let manq = 0, nonSaisis = 0, sansConcl = 0, ecarts = 0, nonAcheves = 0, perimes = 0;
  for (const pr of proceduresRequises(p)){
    if (!pr.ech){ if (!proc(p.code, pr.code).conclusion.trim()) sansConcl++; continue; }
    const wp = wpProc(p, pr) || [];
    manq += wp.filter(r => !ligneRecue(p, pr, r.cle)).length;
    const n = comptesEtats(controles(p, pr));
    nonSaisis += n.recue; ecarts += n.ecart;
    if (!proc(p.code, pr.code).conclusion.trim()) sansConcl++;
    const t = trav('SEC-' + p.code + '-' + pr.code);
    if (t.statut !== 'acheve' && t.statut !== 'revu') nonAcheves++;
    if (peremption(p, pr)) perimes++;
  }
  if (manq) o.push(`${manq} élément(s) sans pièce justificative`);
  if (nonSaisis) o.push(`${nonSaisis} contrôle(s) non exécuté(s) alors que la pièce est reçue`);
  if (ecarts) o.push(`${ecarts} écart(s) sans résolution probante`);
  if (sansConcl) o.push(`${sansConcl} procédure(s) sans conclusion`);
  if (nonAcheves) o.push(`${nonAcheves} procédure(s) dont le testing n’est pas déclaré terminé`);
  if (perimes) o.push(`${perimes} papier(s) exécuté(s) sur une version antérieure du fichier — à reconfirmer`);
  const sansMotif = p.comptes.filter(c => st.ns[c] && !(st.nsMotif[c] || '').trim());
  if (sansMotif.length) o.push(`statut forcé sans motif sur ${sansMotif.join(', ')}`);
  const nivSansMotif = ASSERTIONS.filter(a => st.override[a.code] && !(st.overrideMotif[a.code] || '').trim());
  if (nivSansMotif.length) o.push(`niveau de risque forcé sans motif (${nivSansMotif.map(a => a.lib).join(', ')})`);
  if (!st.conclusion.trim()) o.push('conclusion de section non rédigée');
  const n1 = (PAPIERS_N1[p.code] || []).filter(x => !st.reprisN1Vues[x.id]);
  if (n1.length) o.push(`${n1.length} papier(s) N-1 non reconfirmé(s)`);
  return o;
}
function blocConclusion(p){
  const st = sec(p.code), o = obstaclesVisa(p), n1 = PAPIERS_N1[p.code] || [];
  const notesN1 = NOTES_N1.filter(n => n.section === p.code);
  return `
    <h3>Reprise de l’exercice précédent</h3>
    ${n1.length || notesN1.length ? `
      ${n1.map(x => `<div class="nl n1">
        <div class="m"><span class="mono">${x.id}</span> · exercice 2024
          ${st.reprisN1Vues[x.id] ? '<span class="pill">reconfirmé</span>' : '<span class="pill warn">à reconfirmer</span>'}</div>
        <div class="txt"><b>${esc(x.lib)}</b> — ${esc(x.concl)}</div>
        ${st.reprisN1Vues[x.id] ? `<div class="smallcaps">${esc(st.reprisN1Vues[x.id])}</div>`
          : `<button class="btn mini sec" data-n1="${x.id}">reconfirmer pour 2025</button>`}
      </div>`).join('')}
      ${notesN1.map(n => `<div class="nl ${TYPES_NOTE[n.type].cls}" style="opacity:.8">
        <div class="m"><span class="tag">note N-1</span> ${TYPES_NOTE[n.type].lib}</div>
        <div class="txt">${esc(n.texte)}</div></div>`).join('')}
    ` : '<p class="note">Aucun travail N-1 enregistré sur cette section.</p>'}

    <h3>Conclusion de section</h3>
    <textarea id="sec-concl" rows="3" placeholder="conclusion de l’auditeur sur le poste, au regard des procédures exécutées et des écarts relevés">${esc(st.conclusion)}</textarea>
    ${boutonNote(p.code, 'conclusion', 'concl', 'Conclusion de la section ' + p.lib)}

    <h3>Visa</h3>
    ${st.visa ? `<div class="callout"><b>Section visée</b> par ${esc(USERS[st.visa.par].nom)}
        (${ROLE_LIB[USERS[st.visa.par].role]}) le ${horo(st.visa.t)}.
        <button class="btn mini sec" id="sec-devisa">retirer le visa</button></div>`
      : o.length ? `<div class="callout bad"><b>${o.length} obstacle(s) :</b>
          <ul style="margin:5px 0 0 16px;padding:0">${o.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <button class="btn" disabled>viser la section</button>`
      : `<button class="btn" id="sec-visa">viser la section — engage ${esc(USERS[S.moi].nom)}</button>`}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   ASSEMBLAGE
   ───────────────────────────────────────────────────────────────────────── */
function vueFsli(code){
  const p = postesCalcules().find(x => x.code === code);
  if (!p) return '<p class="note">Poste inconnu.</p>';
  const s = seuils(), procs = proceduresRequises(p), st = sec(p.code), o = obstaclesVisa(p);
  const ouvertKey = S.procOuverte && S.procOuverte.startsWith(p.code + '/') ? S.procOuverte.slice(p.code.length + 1) : null;
  const prOuverte = procs.find(x => x.code === ouvertKey) || null;
  // signature : la référence du papier, en chasse fixe, coin supérieur droit
  const bloc = (n, titre, ref, html) => `<section class="blk" id="b${n}">
      <header><span class="num">${n}</span><h2>${esc(titre)}</h2><span class="why">${esc(ref)}</span></header>
      <div class="body">${html}</div></section>`;
  const nSel = procs.filter(x => x.ech).length;
  return `
    <div class="hd">
      <h1>${esc(p.lib)}</h1>
      <span class="pill">${esc(MASSE_LIB[masseDe(p)])}</span>
      <span class="pill ${NIVEAUX[niveauMax(p)] === 'eleve' ? 'bad' : NIVEAUX[niveauMax(p)] === 'moyen' ? 'warn' : ''}">risque ${NIV_LIB[NIVEAUX[niveauMax(p)]]}</span>
      ${st.visa ? '<span class="pill">visée</span>' : `<span class="pill ${o.length ? 'bad' : 'warn'}">${o.length ? o.length + ' obstacle(s)' : 'prête à viser'}</span>`}
      <span class="sub">solde ${eur(p.solde)} · ${p.comptes.length} compte(s) · ${procs.length} procédure(s) · ${nSel} sélection(s)</span>
    </div>
    ${S.affErreur ? `<div class="callout bad">${esc(S.affErreur)}</div>` : ''}
    ${(() => { const vp = visaPerime(p.code); return vp ? `<div class="callout bad">
      <b>Visa posé sur la version ${vp.de} du fichier ; le dossier est à la version ${vp.a}.</b>
      Le visa n’est pas effacé — il est remis en cause : il engage ${esc(USERS[sec(p.code).visa.par].nom)}
      sur des travaux qui ne portent plus sur le même fichier. Reconfirmez les travaux touchés, puis le visa.
      <button class="btn mini sec" id="sec-devisa">retirer le visa</button></div>` : ''; })()}
    ${bloc(1, 'Comptes de la section', p.code + '-CPT-01', blocComptes(p))}
    ${bloc(2, 'Évaluation du risque par assertion', p.code + '-RSQ-01', blocRisque(p))}
    ${bloc(3, 'Plan de travail', p.code + '-PGM-01', blocPlan(p) + blocSuiviSection(p))}
    ${prOuverte ? bloc(4, 'Procédure : ' + prOuverte.lib, procRef(p, prOuverte), blocProcedure(p, prOuverte))
      : (procs.filter(x => x.ech).length
        ? `<section class="blk" id="b4"><header><span class="num">4</span><h2>Procédure</h2></header>
           <div class="body"><p class="note">Ouvrez une procédure dans le plan de travail ci-dessus pour voir sa population,
           sa sélection et son papier.</p></div></section>` : '')}
    ${bloc(5, 'Requêtes de la section', p.code + '-REQ-01', blocRequetes(p))}
    ${bloc(6, 'Notes de revue de la section', p.code + '-NDR-01', blocNotesSection(p.code))}
    ${bloc(7, 'Conclusion, visa et reprise N-1', p.code + '-CCL-01', blocConclusion(p))}`;
}

/* ── avancement des justificatifs de la section ───────────────────────────
   Les cinq états dérivés du papier de travail, agrégés. L'affectation et les
   heures ne sont PAS ici : elles vivent au programme de travail, une seule
   fois. Ce que la section montre, c'est où en sont les pièces. */
function blocSuiviSection(p){
  const t = avancementSection(p);
  if (!t.total) return '';
  const procs = proceduresRequises(p).filter(x => x.ech);
  return `<h3>Avancement des justificatifs</h3>
    ${bandeauAvancement(t)}
    ${table([{k:'pr',t:'Procédure',cls:'wrapcell'},{k:'e',t:'Éléments',n:1},{k:'r',t:'Avec pièce',n:1},
             ...ETATS_LIGNE.map(x => ({ k:x.id, t:x.lib, n:1 })), {k:'st',t:'Travail'}],
      procs.map(pr => {
        const ctr = controles(p, pr), n = comptesEtats(ctr), wp = wpProc(p, pr) || [];
        const st = trav('SEC-' + p.code + '-' + pr.code);
        const row = { pr:esc(pr.lib) + '<div class="smallcaps">' + esc(procRef(p, pr)) + '</div>',
                      e:String(wp.length), r:String(wp.filter(x => ligneRecue(p, pr, x.cle)).length),
                      st:`<span class="pill ${st.statut === 'a_faire' ? 'warn' : ''}">${esc(STATUT_TRAVAIL[st.statut])}</span>` };
        for (const x of ETATS_LIGNE) row[x.id] = x.id === 'ecart' && n[x.id]
          ? `<span style="color:var(--anomalie)">${n[x.id]}</span>` : String(n[x.id]);
        return row;
      }),
      { foot:{ pr:'Total', e:String(t.elements), r:String(t.recus),
               ...Object.fromEntries(ETATS_LIGNE.map(x => [x.id, String(t[x.id])])) } })}
    <p class="note">Aucun de ces nombres n’est saisi : « avec pièce » se lit sur les dépôts du portail,
    les cinq états se déduisent de la pièce, de la valeur relevée et de la résolution documentée.
    L’affectation et les heures de ces travaux se tiennent au
    <a data-vue="trav.programme" style="cursor:pointer">programme de travail</a>, une seule fois.</p>`;
}
