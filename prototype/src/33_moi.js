
/* ═══ 49. MES TRAVAUX — LA PORTE D'ENTRÉE ══════════════════════════════════
   Le rail est organisé selon la structure du DOSSIER : mission, données,
   planification, travaux transverses, sections, achèvement. C'est la bonne
   organisation pour retrouver un objet — ce n'est pas celle avec laquelle on
   travaille.

   Un préparateur qui ouvre l'outil ne veut pas quarante-cinq destinations : il
   veut LES SIENNES, triées par échéance, avec ce qui les bloque et le lien
   direct vers le papier. Un réviseur veut ce qui attend sa revue, ses notes
   ouvertes et les visas qu'il peut poser. C'est ainsi qu'on se sert d'un
   logiciel d'audit : on ouvre sa liste, pas l'arborescence du dossier.

   Rien n'est saisi ici. Tout est une LECTURE de ce que les autres écrans ont
   produit — affectations, statuts, obstacles, notes, visas. Un tableau de bord
   personnel qui porterait un état à lui serait un second dossier.
   ═══════════════════════════════════════════════════════════════════════ */

/** Ce qui empêche d'avancer sur un travail, en toutes lettres. */
function blocagesTravail(t){
  const o = [];
  if (!peutRecevoirTravail(t.preparateur)) o.push('déclaration d’indépendance non signée');
  if (t.sansObjet) return ['marqué sans objet'];
  const rc = aReconfirmer(t);
  if (rc) o.push('à reconfirmer : ' + rc.motif);
  if (t.nature === 'section' && t.poste && t.proc){
    const p = postesCalcules().find(x => x.code === t.poste);
    const pr = PROCEDURES.find(x => x.code === t.proc);
    if (p && pr) for (const x of obstaclesProcedure(p, pr)) o.push(x);
  }
  if (!t.reviseur) o.push('aucun réviseur affecté');
  const notes = S.notes.filter(n => !n.clos && n.ancre.section === t.poste
    && n.ancre.objet === 'procedure' && String(n.ancre.ref) === String(t.proc));
  if (notes.length) o.push(notes.length + ' note(s) de revue ouverte(s)');
  return o;
}
/** Retard d'un travail sur son échéance, en jours. */
function retardTravail(t){
  return Math.round((Date.parse(S.aujourdhui) - Date.parse(t.echeance)) / 86400000);
}
/** L'ordre d'une liste de travaux : le plus en retard d'abord, à égalité le
 *  plus bloqué. C'est l'ordre dans lequel on les prend, pas l'ordre du code. */
function trierParUrgence(l){
  return [...l].sort((a, b) => (a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : 0)
                            || (b.blocages.length - a.blocages.length)
                            || (a.code < b.code ? -1 : 1));
}

function vueMoi(){
  const u = USERS[S.moi];
  const l = travaux().filter(t => !t.sansObjet).map(t => ({ ...t, blocages:blocagesTravail(t) }));
  const prep = trierParUrgence(l.filter(t => t.preparateur === S.moi && t.statut !== 'revu'));
  const aRevoir = trierParUrgence(l.filter(t => t.reviseur === S.moi && t.statut === 'acheve'));
  const enCours = trierParUrgence(l.filter(t => t.reviseur === S.moi && t.statut !== 'acheve' && t.statut !== 'revu'));
  const notes = S.notes.filter(n => !n.clos && (n.pour === S.moi || n.auteur === S.moi));
  const visas = postesEnPerimetre().filter(p => !sec(p.code).visa && obstaclesVisa(p).length === 0);
  const decl = declarationValide(S.moi);

  return entete('Mes travaux — ' + u.nom,
                esc(u.grade) + ' · ' + esc(ROLE_LIB[u.role]) + ' — ce qui vous revient, dans l’ordre où le prendre') +
    (!decl ? `<div class="callout bad"><b>Votre déclaration d’indépendance n’est pas signée.</b>
      ${esc(etatDeclaration(S.moi).lib)} — tant qu’elle ne l’est pas, aucun travail ne peut vous être
      attribué et ceux qui le sont déjà bloquent le visa de leur section.
      <button class="btn mini" data-vue="plan.equipe">signer ma déclaration ↗</button></div>` : '') +
    blocMesTravaux(prep) +
    (u.role === 'preparateur' && !aRevoir.length && !enCours.length ? '' : blocARevoir(aRevoir, enCours)) +
    blocMesNotes(notes) +
    blocMesVisas(visas);
}

function blocMesTravaux(l){
  const enRetard = l.filter(t => retardTravail(t) > 0);
  const rows = l.map(t => {
    const r = retardTravail(t);
    return {
      e:`<span class="mono">${frDate(t.echeance)}</span>`
        + (r > 0 ? `<div class="smallcaps" style="color:var(--anomalie)">${r} j de retard</div>`
                 : `<div class="smallcaps">dans ${-r} j</div>`),
      i:`<b>${esc(t.intitule)}</b><div class="smallcaps mono">${t.code}</div>`,
      s:t.posteLib ? esc(t.posteLib) : `<span class="smallcaps">${esc(PHASES.find(x => x.id === t.phase).lib)}</span>`,
      st:`<span class="pill ${t.statut === 'a_faire' ? 'warn' : ''}">${esc(STATUT_TRAVAIL[t.statut])}</span>`,
      b:t.blocages.length
        ? t.blocages.map(x => `<div class="smallcaps">${esc(x)}</div>`).join('')
        : '<span class="smallcaps">rien ne bloque</span>',
      h:`<span class="mono">${hFmt(budget(t))}</span>`,
      a:t.wpRef
        ? `<button class="btn mini" data-gopapier="${t.poste}|${t.proc}">ouvrir le papier</button>`
        : `<button class="btn mini sec" data-vue="${esc(t.vue)}">ouvrir</button>`,
    };
  });
  return blk('À préparer', l.length + ' travail/travaux'
      + (enRetard.length ? ' · ' + enRetard.length + ' en retard' : ''),
    l.length
      ? table([{k:'e',t:'Échéance'},{k:'i',t:'Travail',cls:'wrapcell'},{k:'s',t:'Section'},
               {k:'st',t:'Statut'},{k:'b',t:'Ce qui bloque',cls:'wrapcell'},{k:'h',t:'Budget',n:1},{k:'a',t:''}], rows)
        + `<p class="note">Triés par échéance, et à échéance égale par le nombre d’obstacles.
           Le lien ouvre directement le papier de travail, pas la section.</p>`
      : '<p class="note">Aucun travail ne vous est affecté comme préparateur.</p>',
    enRetard.length ? enRetard.length + ' en retard' : '');
}

function blocARevoir(aRevoir, enCours){
  const rows = t => ({
    e:`<span class="mono">${frDate(t.echeance)}</span>`,
    i:`<b>${esc(t.intitule)}</b><div class="smallcaps mono">${t.code}</div>`,
    s:t.posteLib ? esc(t.posteLib) : `<span class="smallcaps">${esc(PHASES.find(x => x.id === t.phase).lib)}</span>`,
    p:t.preparateur ? esc(USERS[t.preparateur].nom) : '<span class="smallcaps">—</span>',
    n:`<span class="pill ${t.niveauRevue === 2 ? 'warn' : ''}">niveau ${t.niveauRevue}</span>`,
    b:t.blocages.length ? t.blocages.map(x => `<div class="smallcaps">${esc(x)}</div>`).join('')
                        : '<span class="smallcaps">rien ne bloque</span>',
    a:t.wpRef ? `<button class="btn mini" data-gopapier="${t.poste}|${t.proc}">ouvrir le papier</button>`
              : `<button class="btn mini sec" data-vue="${esc(t.vue)}">ouvrir</button>`,
  });
  return blk('À revoir', aRevoir.length + ' achevé(s) en attente de votre revue · '
      + enCours.length + ' encore en cours',
    (aRevoir.length
      ? table([{k:'e',t:'Échéance'},{k:'i',t:'Travail',cls:'wrapcell'},{k:'s',t:'Section'},
               {k:'p',t:'Préparé par'},{k:'n',t:'Revue'},{k:'b',t:'Ce qui bloque',cls:'wrapcell'},{k:'a',t:''}],
        aRevoir.map(rows))
      : '<p class="note">Rien n’attend votre revue.</p>')
    + (enCours.length ? `<h3>Encore en cours chez leur préparateur</h3>`
        + table([{k:'e',t:'Échéance'},{k:'i',t:'Travail',cls:'wrapcell'},{k:'s',t:'Section'},
                 {k:'p',t:'Préparé par'},{k:'n',t:'Revue'},{k:'b',t:'Ce qui bloque',cls:'wrapcell'},{k:'a',t:''}],
          enCours.map(rows)) : ''),
    aRevoir.length ? aRevoir.length + ' à revoir' : '');
}

function blocMesNotes(l){
  const bloq = l.filter(n => TYPES_NOTE[n.type].bloque);
  return blk('Mes notes de revue ouvertes', l.length + ' ouverte(s)'
      + (bloq.length ? ' · ' + bloq.length + ' bloquante(s)' : ''),
    l.length
      ? l.map(n => ligneNote(n, 'transverse')).join('')
      : '<p class="note">Aucune note ouverte à votre nom, ni posée par vous.</p>',
    bloq.length ? bloq.length + ' bloquante(s)' : '');
}

function blocMesVisas(l){
  const peut = peutViser(S.moi);
  return blk('Visas que je peux poser', l.length + ' section(s) sans obstacle',
    !peut
      ? `<p class="note">Le visa d’une section appartient au réviseur ou à l’associé signataire.
         Vous êtes ${esc(ROLE_LIB[USERS[S.moi].role])} : cette liste ne vous concerne pas.</p>`
      : l.length
        ? table([{k:'s',t:'Section'},{k:'r',t:'Risque retenu'},{k:'t',t:'Travaux'},{k:'a',t:''}],
            l.map(p => ({ s:`<b>${esc(p.lib)}</b>`,
              r:`<span class="pill">${NIV_LIB[NIVEAUX[niveauMax(p)]]}</span>`,
              t:`<span class="mono">${travauxDe(p.code).filter(t => t.statut === 'revu').length} / ${travauxDe(p.code).length}</span> revus`,
              a:`<button class="btn mini" data-open="${p.code}">ouvrir la section</button>` })))
          + '<p class="note">Une section n’apparaît ici que si <b>aucun</b> obstacle ne subsiste. Le visa se pose dans la section, sur sa conclusion — jamais depuis une liste.</p>'
        : `<p class="note">Aucune section n’est en état d’être visée : toutes portent encore au moins un obstacle.
           <button class="btn mini sec" data-vue="pil.mission">voir les obstacles ↗</button></p>`);
}
