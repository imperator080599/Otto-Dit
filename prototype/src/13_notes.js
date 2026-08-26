/* ═══ 12. NOTES DE REVUE — INTERFACE ═══════════════════════════════════════
   Il n'existe aucun chemin pour créer une note flottante : le bouton porte
   toujours l'objet sur lequel la note se pose, et c'est cet objet qui est
   enregistré dans l'ancre.
   ═══════════════════════════════════════════════════════════════════════ */
function boutonNote(section, objet, ref, lib){
  const n = notesDe(section, objet, ref), ouvertes = n.filter(x => !x.clos);
  const bl = ouvertes.some(x => TYPES_NOTE[x.type].bloque);
  return `<button class="note-i ${ouvertes.length ? 'has' : ''}"
    data-note-cible="${esc(section)}|${esc(objet)}|${esc(String(ref))}|${esc(lib)}"
    title="${ouvertes.length ? ouvertes.length + ' note(s) ouverte(s)' : 'poser une note de revue sur cet objet'}"
    >${bl ? '⚑' : '✎'}${n.length ? ' ' + n.length : ''}</button>`;
}

function ligneNote(n, contexte){
  const t = TYPES_NOTE[n.type], u = USERS[n.auteur], pour = USERS[n.pour];
  const peut = peutClore(S.moi, n);
  const age = ancienneteNote(n);
  return `<div class="nl ${t.cls} ${n.clos ? 'clos' : ''}" data-note="${n.id}">
    <div class="m">
      <span class="tag ${t.bloque ? 'abs' : ''}">${esc(t.lib)}</span>
      <span class="mono">#${n.id}</span>
      <span>${esc(u.nom)} → ${esc(pour ? pour.nom : '—')}</span>
      <span>${horo(n.t)}</span>
      ${!n.clos ? `<span class="pill ${age >= 10 ? 'bad' : age >= 5 ? 'warn' : ''}">${age} j ouvrés</span>` : ''}
      ${n.recurrente ? '<span class="pill warn">récurrente — déjà relevée en N-1</span>' : ''}
      ${n.clos ? `<span class="pill">close par ${esc(USERS[n.clos.par].nom)} le ${horo(n.clos.t)}</span>` : ''}
      ${contexte ? `<button class="btn mini sec" data-goanc="${n.id}">${esc(n.ancre.lib)} ↗</button>`
                 : `<span class="smallcaps">sur : ${esc(n.ancre.lib)}</span>`}
    </div>
    <div class="txt">${esc(n.texte)}</div>
    ${n.reponses.map(r => `<div class="rep"><b>${esc(USERS[r.par].nom)}</b>
        <span class="smallcaps">${horo(r.t)}</span> — ${esc(r.texte)}</div>`).join('')}
    ${n.clos ? '' : `<div class="row" style="margin:6px 0 0">
      <div class="ctrl" style="flex:1 1 240px"><input type="text" class="cell txt" data-rep="${n.id}"
        placeholder="répondre en tant que ${esc(USERS[S.moi].nom)}" style="border-color:var(--line)"></div>
      <button class="btn mini sec" data-repok="${n.id}">répondre</button>
      ${peut ? `<button class="btn mini" data-clos="${n.id}">clore</button>`
             : `<span class="smallcaps">clôture réservée au réviseur${n.auteur === S.moi ? ' — et jamais à l’auteur de la note' : ''}</span>`}
    </div>`}
  </div>`;
}
/** Ancienneté d'une note, en jours ouvrés depuis sa création. */
function ancienneteNote(n){
  let d = n.t.slice(0, 10), k = 0;
  while (d < S.aujourdhui){ d = addDays(d, 1); if (!isWeekend(d) || S.portail.samediOuvre) k++; }
  return k;
}

/** À qui une note s'adresse par défaut : celui qui doit AGIR sur le travail
 *  visé — son préparateur, à défaut son réviseur, à défaut quelqu'un de la
 *  section. Une liste ordonnée par grade prenait le premier venu : depuis que
 *  l'équipe compte un assistant, les notes bloquantes lui étaient adressées
 *  par défaut, ce qui n'est pas la personne qui doit répondre. */
function destinataireProbable(anc){
  const cands = [];
  if (anc.objet === 'procedure'){
    const t = trav('SEC-' + anc.section + '-' + anc.ref);
    cands.push(t.preparateur, t.reviseur);
  }
  for (const x of travauxDe(anc.section)) cands.push(x.preparateur, x.reviseur);
  const k = cands.find(x => x && x !== S.moi);
  if (k) return k;
  /* Rien n'est encore affecté : la note remonte plutôt qu'elle ne descend.
     À défaut de savoir qui prépare, on s'adresse au grade le plus élevé —
     jamais à l'assistant par le seul hasard de l'ordre de la liste. */
  return Object.entries(USERS).filter(([x]) => x !== S.moi)
    .sort((a, b) => ORDRE_GRADE.indexOf(b[1].grade) - ORDRE_GRADE.indexOf(a[1].grade))
    .map(([x]) => x)[0];
}

function blocNotesSection(code){
  const list = S.notes.filter(n => n.ancre.section === code);
  const ouvertes = list.filter(n => !n.clos);
  const c = S.noteCible && S.noteCible.section === code ? S.noteCible : null;
  return `
    ${c ? `<div class="callout" style="margin-top:8px">
      <b>Nouvelle note sur :</b> ${esc(c.lib)}
      <div class="smallcaps">destinataire proposé : celui qui doit agir sur ce travail</div>
      <div class="row" style="margin:7px 0 0">
        <div class="ctrl"><label>Type</label><select id="nt-type">
          ${Object.entries(TYPES_NOTE).map(([k, v]) => `<option value="${k}">${esc(v.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>À l’attention de</label><select id="nt-pour">
          ${Object.entries(USERS).filter(([k]) => k !== S.moi)
            .sort((a, b) => ORDRE_GRADE.indexOf(a[1].grade) - ORDRE_GRADE.indexOf(b[1].grade))
            .map(([k, u]) => `<option value="${k}" ${k === destinataireProbable(c) ? 'selected' : ''}>${esc(u.nom)} — ${esc(ROLE_LIB[u.role])}</option>`).join('')}</select></div>
        <div class="ctrl" style="flex:1 1 300px"><label>Note</label>
          <input type="text" id="nt-txt" placeholder="ce qui doit être corrigé, documenté ou expliqué"></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn" id="nt-add">poser la note</button></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn sec" id="nt-annul">annuler</button></div>
      </div></div>`
      : '<p class="note">Bouton ✎ en regard de l’objet, dans n’importe quel bloc ci-dessus.</p>'}
    ${list.length ? `<div style="margin-top:8px">
        <div class="row"><span class="pill ${ouvertes.length ? 'warn' : ''}">${ouvertes.length} ouverte(s)</span>
          <span class="pill">${list.length - ouvertes.length} close(s)</span>
          ${notesBloquantesOuvertes(code).length ? `<span class="pill bad">${notesBloquantesOuvertes(code).length} bloquante(s) — visa impossible</span>` : ''}</div>
        ${list.map(n => ligneNote(n, false)).join('')}</div>`
      : '<p class="note">Aucune note sur cette section.</p>'}`;
}

/* ── vue transverse : la vraie vue de travail d'un chef de mission ───────── */
function vueNotes(){
  const ouvertes = S.notes.filter(n => !n.clos);
  const parPersonne = {};
  for (const n of ouvertes){ (parPersonne[n.pour] = parPersonne[n.pour] || []).push(n); }
  const parType = {};
  for (const n of ouvertes){ (parType[n.type] = parType[n.type] || []).push(n); }
  const parSection = {};
  for (const n of ouvertes){ (parSection[n.ancre.section] = parSection[n.ancre.section] || []).push(n); }
  const libSection = c => (POSTES.find(p => p.code === c) || {}).lib || c;
  const tri = [...ouvertes].sort((a, b) => {
    const bl = (TYPES_NOTE[b.type].bloque ? 1 : 0) - (TYPES_NOTE[a.type].bloque ? 1 : 0);
    return bl || (ancienneteNote(b) - ancienneteNote(a));
  });
  return `
    <div class="hd"><h1>Notes de revue — vue transverse</h1>
      <span class="sub">toutes les notes ouvertes du dossier, par responsable, ancienneté, type et section</span></div>
    <section class="blk"><header><h2>Répartition</h2></header><div class="body">
      <div class="grid3">
        <div><h3>Par responsable</h3>${Object.keys(USERS).map(u => {
          const l = parPersonne[u] || [], b = l.filter(n => TYPES_NOTE[n.type].bloque).length;
          return `<div class="kv"><span class="k">${esc(USERS[u].nom)}</span>
            <span class="v">${l.length}${b ? ' · ' + b + ' bloquante(s)' : ''}</span></div>`; }).join('')}</div>
        <div><h3>Par type</h3>${Object.entries(TYPES_NOTE).map(([k, v]) =>
          `<div class="kv"><span class="k">${esc(v.lib)}</span><span class="v">${(parType[k] || []).length}</span></div>`).join('')}</div>
        <div><h3>Par section</h3>${Object.keys(parSection).length
          ? Object.entries(parSection).map(([c, l]) => `<div class="kv"><span class="k">${esc(libSection(c))}</span>
              <span class="v">${l.length}</span></div>`).join('')
          : '<p class="note">Aucune.</p>'}</div>
      </div>
      ${ouvertes.filter(n => n.recurrente).length ? `<div class="callout warn" style="margin-top:10px">
        <b>${ouvertes.filter(n => n.recurrente).length} note(s) récurrente(s)</b> — même section et même type qu’en N-1.</div>` : ''}
    </div></section>
    <section class="blk"><header><h2>Notes ouvertes — bloquantes d’abord, puis les plus anciennes</h2>
      <span class="why">${ouvertes.length} note(s)</span></header><div class="body">
      ${tri.length ? tri.map(n => ligneNote(n, true)).join('')
        : '<p class="note">Aucune note ouverte sur le dossier.</p>'}
    </div></section>
    <section class="blk"><header><h2>Clôture du dossier</h2></header><div class="body">
      ${notesBloquantesOuvertes().length
        ? `<div class="callout bad"><b>Clôture impossible.</b> ${notesBloquantesOuvertes().length} note(s) bloquante(s)
            restent ouvertes : ${notesBloquantesOuvertes().map(n => '#' + n.id + ' (' + esc(n.ancre.lib) + ')').join(', ')}.
</div>
           <button class="btn" disabled>clôturer le dossier</button>`
        : `<div class="callout">Aucune note bloquante ouverte.</div>
           <button class="btn" id="clore-dossier" ${S.dossierClos ? 'disabled' : ''}>${S.dossierClos ? 'dossier clôturé' : 'clôturer le dossier'}</button>`}
    </div></section>`;
}
