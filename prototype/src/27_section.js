
/* ═══ 43. LA SECTION COMME LIEU, ET NON COMME PAGE ═════════════════════════
   Une section rendait ses sept blocs d'un seul tenant : sur le chiffre
   d'affaires, sept mille pixels d'un seul défilement. Un bouton « replier »
   aurait masqué le défaut sans le corriger — on aurait encore eu une page,
   simplement pliée.

   La correction est structurelle : la section devient un LIEU où l'on se
   déplace. Six destinations, une seule affichée à la fois. Le plan de travail
   est l'atterrissage, parce que c'est ce qu'un réviseur ouvre en premier.
   Une procédure ouverte REMPLACE le plan au lieu de s'y ajouter. Et ce qui
   dit où l'on en est — risque, obstacles, visa, avancement des justificatifs —
   quitte le corps de la page pour le bandeau collant : on ne fait jamais
   défiler pour savoir où l'on en est.
   ═══════════════════════════════════════════════════════════════════════ */

const DESTINATIONS = [
  { id:'comptes',  lib:'Comptes',           ref:'CPT-01' },
  { id:'risque',   lib:'Risque',            ref:'RSQ-01' },
  { id:'plan',     lib:'Plan de travail',   ref:'PGM-01' },
  { id:'requetes', lib:'Requêtes',          ref:'REQ-01' },
  { id:'notes',    lib:'Notes de revue',    ref:'NDR-01' },
  { id:'concl',    lib:'Conclusion et visa',ref:'CCL-01' },
];
const DEST_DEFAUT = 'plan';
function destCourante(code){ return S.dest[code] || DEST_DEFAUT; }

/** Ce qui demande attention dans chaque destination. C'est ce nombre qui
 *  commande à la fois le compteur de la navigation et l'ouverture par défaut
 *  des replis : la place occupée à l'écran suit les problèmes, comme la
 *  couleur (ADR-038). */
function attentionDest(p, id){
  const st = sec(p.code);
  switch (id){
    case 'comptes': {
      const sansMotif = p.comptes.filter(c => st.ns[c] && !(st.nsMotif[c] || '').trim()).length;
      const ra = revueAnalytique().filter(l => p.re.test(l.compte) && l.flag).length;
      return sansMotif + ra;
    }
    case 'risque': {
      const fp = facteursProposes(p.code).length;
      const fsm = facteursDe(p.code).filter(f => f.statut === 'ecarte' && !f.motif.trim()).length;
      const niv = ASSERTIONS.filter(a => st.override[a.code] && !(st.overrideMotif[a.code] || '').trim()).length;
      return fp + fsm + niv;
    }
    case 'plan': {
      let n = 0;
      for (const pr of proceduresRequises(p)){
        if (obstaclesProcedure(p, pr).length) n++;
        if (peremption(p, pr)) n++;
      }
      return n;
    }
    case 'requetes': return requetesDe(p.code).filter(retard).length;
    case 'notes':    return notesBloquantesOuvertes(p.code).length;
    case 'concl': {
      let n = 0;
      if (!st.conclusion.trim()) n++;
      n += (PAPIERS_N1[p.code] || []).filter(x => !st.reprisN1Vues[x.id]).length;
      if (!st.visa && obstaclesVisa(p).length) n++;
      if (visaPerime(p.code)) n++;
      return n;
    }
  }
  return 0;
}

/* ── replis : l'état par défaut est dérivé, celui que l'on change est retenu ─
   `attention` : nombre de choses à traiter dans ce repli. Non nul, il s'ouvre.
   Le repli que l'auditeur ouvre ou ferme lui-même est mémorisé pour la
   session, par section — sa décision l'emporte sur la règle jusqu'à ce qu'il
   change d'avis. */
/* Quelques replis s'ouvrent par défaut sans porter d'obstacle : ce sont ceux
   où l'on TRAVAILLE — on ne cache pas l'outil qu'on est venu régler. */
const REPLIS_OUVERTS = new Set(['plan.je/crit/actifs']);
function ouvertParDefaut(cle, attention){
  const v = S.replis[cle];
  if (v !== undefined) return v;
  return !!attention || REPLIS_OUVERTS.has(cle);
}
function repli(cle, titre, sousTitre, contenu, attention){
  const o = ouvertParDefaut(cle, attention);
  return `<details class="repli" data-repli="${esc(cle)}" ${o ? 'open' : ''}>
    <summary>
      <span class="t">${esc(titre)}</span>
      ${sousTitre ? `<span class="s">${sousTitre}</span>` : ''}
      ${attention ? `<span class="pill bad">${attention}</span>` : ''}
    </summary>
    <div class="c">${contenu}</div>
  </details>`;
}
function barreReplis(prefixe){
  return `<div class="row replis-cmd">
    <button class="btn mini sec" data-replis="${esc(prefixe)}|1">tout déplier</button>
    <button class="btn mini sec" data-replis="${esc(prefixe)}|0">tout replier</button>
    <span class="smallcaps">ce qui demande attention est déjà ouvert</span>
  </div>`;
}

/* ── le bandeau collant de la section ─────────────────────────────────────
   Il remplace les compteurs de mission tant qu'on est dans une section : ce
   qu'il faut savoir ici, c'est l'état de CETTE section. La hauteur collante
   ne change donc pas. */
/** Un rapport au seuil se lit en multiples, pas en pourcentage : « 235 × »
 *  se comprend d'un coup d'œil, « 23 466 % » ne dit rien. */
function multiple(x){
  if (!isFinite(x)) return '—';
  return (x >= 10 ? Math.round(x) : (Math.round(x * 10) / 10).toString().replace('.', ',')) + NBSP + '×';
}
function cellulesSection(p){
  const s = seuils(), st = sec(p.code), o = obstaclesVisa(p), t = avancementSection(p);
  const niv = NIVEAUX[niveauMax(p)];
  return {
    'poste':                    [esc(p.lib), esc(p.code)],
    'risque retenu':            [NIV_LIB[niv], 'risque'],
    'solde / planification':    [multiple(Math.abs(p.solde) / s.PM), '/ planif.'],
    'obstacles au visa':        [String(o.length), 'obstacles'],
    'visa':                     [st.visa ? 'visée' : (o.length ? 'bloqué' : 'prête'), 'visa'],
    'justificatifs attendus':   [String(t.elements), 'attendus'],
    'reçus':                    [String(t.recus), 'reçus'],
    'contrôles traités':        [String(t.traitee + t.explique), 'traités'],
    'écarts à expliquer':       [String(t.ecart), 'écarts'],
  };
}

/* ── navigation interne ───────────────────────────────────────────────── */
function navSection(p){
  const d = destCourante(p.code);
  return `<nav class="destnav">${DESTINATIONS.map(x => {
    const n = attentionDest(p, x.id);
    return `<button class="dest ${x.id === d ? 'on' : ''}" data-dest="${p.code}|${x.id}">
      ${esc(x.lib)}${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
  }).join('')}</nav>`;
}

/* ── les six destinations ─────────────────────────────────────────────── */
function destinationSection(p, id){
  const k = s => p.code + '/' + id + '/' + s;
  switch (id){
    case 'comptes':
      return barreReplis(p.code + '/comptes') +
        repli(k('table'), 'Comptes de la section', p.comptes.length + ' compte(s)',
          partComptes(p), p.comptes.filter(c => sec(p.code).ns[c] && !(sec(p.code).nsMotif[c] || '').trim()).length) +
        repli(k('ra'), 'Revue analytique substantive du poste',
          revueAnalytique().filter(l => p.re.test(l.compte) && l.flag).length + ' compte(s) au-dessus d’un seuil',
          blocRevueAnalytique(p), revueAnalytique().filter(l => p.re.test(l.compte) && l.flag).length);

    case 'risque': {
      const st = sec(p.code);
      const nivSansMotif = ASSERTIONS.filter(a => st.override[a.code] && !(st.overrideMotif[a.code] || '').trim()).length;
      const fp = facteursProposes(p.code).length
        + facteursDe(p.code).filter(f => f.statut === 'ecarte' && !f.motif.trim()).length;
      return barreReplis(p.code + '/risque') +
        repli(k('facteurs'), 'Constatations venues d’autres procédures',
          facteursDe(p.code).length + ' facteur(s) au registre', blocFacteursSection(p), fp) +
        repli(k('assertions'), 'Évaluation par assertion', 'jugement de l’auditeur',
          partAssertions(p), nivSansMotif) +
        repli(k('etendue'), 'Étendue des travaux, par assertion', 'ce que le risque commande',
          partEtendue(p), 0);
    }

    case 'plan': {
      const ouvertKey = S.procOuverte && S.procOuverte.startsWith(p.code + '/')
        ? S.procOuverte.slice(p.code.length + 1) : null;
      const pr = proceduresRequises(p).find(x => x.code === ouvertKey);
      if (pr) return filAriane(p, pr) + blocProcedure(p, pr);
      const t = avancementSection(p);
      return barreReplis(p.code + '/plan') +
        repli(k('procedures'), 'Procédures et sélections',
          proceduresRequises(p).length + ' procédure(s)', blocPlan(p),
          proceduresRequises(p).filter(x => obstaclesProcedure(p, x).length).length) +
        repli(k('suivi'), 'Avancement des justificatifs',
          t.recus + ' / ' + t.elements + ' éléments avec pièce', blocSuiviSection(p), t.ecart + t.attente);
    }

    case 'requetes':
      return barreReplis(p.code + '/requetes') +
        repli(k('liste'), 'Requêtes de la section', requetesDe(p.code).length + ' requête(s)',
          blocRequetes(p), requetesDe(p.code).filter(retard).length);

    case 'notes':
      return barreReplis(p.code + '/notes') +
        repli(k('liste'), 'Notes de revue de la section',
          notesDe(p.code).length + ' note(s)', blocNotesSection(p.code),
          notesBloquantesOuvertes(p.code).length);

    case 'concl': {
      const st = sec(p.code), n1 = (PAPIERS_N1[p.code] || []).filter(x => !st.reprisN1Vues[x.id]).length;
      return barreReplis(p.code + '/concl') +
        repli(k('n1'), 'Reprise de l’exercice précédent',
          (PAPIERS_N1[p.code] || []).length + ' papier(s) N-1', partN1(p), n1) +
        repli(k('concl'), 'Conclusion de section',
          st.conclusion.trim() ? 'rédigée' : 'non rédigée', partConclusion(p),
          st.conclusion.trim() ? 0 : 1) +
        repli(k('visa'), 'Visa',
          st.visa ? 'visée par ' + USERS[st.visa.par].nom : obstaclesVisa(p).length + ' obstacle(s)',
          partVisa(p), st.visa ? (visaPerime(p.code) ? 1 : 0) : obstaclesVisa(p).length);
    }
  }
  return '';
}

/** Fil d'Ariane : une procédure ouverte remplace le plan de travail. */
function filAriane(p, pr){
  return `<div class="ariane">
    <button class="btn mini sec" data-dest="${p.code}|plan">← Plan de travail</button>
    <span class="sep">/</span>
    <b>${esc(pr.lib)}</b>
    <span class="smallcaps">${esc(procRef(p, pr))} · ${esc(libAssertion(pr.a))}</span>
  </div>`;
}

/* ── assemblage ───────────────────────────────────────────────────────── */
function vueFsli(code){
  const p = postesCalcules().find(x => x.code === code);
  if (!p) return '<p class="note">Poste inconnu.</p>';
  const d = destCourante(code), dd = DESTINATIONS.find(x => x.id === d) || DESTINATIONS[2];
  const vp = visaPerime(code);
  return `
    ${navSection(p)}
    ${S.affErreur ? `<div class="callout bad">${esc(S.affErreur)}</div>` : ''}
    ${vp ? `<div class="callout bad">
      <b>Visa posé sur la version ${vp.de} du fichier ; le dossier est à la version ${vp.a}.</b>
      Le visa n’est pas effacé — il est remis en cause : il engage ${esc(USERS[sec(code).visa.par].nom)}
      sur des travaux qui ne portent plus sur le même fichier. Reconfirmez les travaux touchés, puis le visa.
      <button class="btn mini sec" id="sec-devisa">retirer le visa</button></div>` : ''}
    <section class="blk dest-blk">
      <header><h2>${esc(dd.lib)}</h2><span class="why">${esc(p.code + '-' + dd.ref)}</span></header>
      <div class="body">${destinationSection(p, d)}</div>
    </section>`;
}
