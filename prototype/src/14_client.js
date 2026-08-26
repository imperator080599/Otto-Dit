/* ═══ 13. PORTAIL CLIENT ═══════════════════════════════════════════════════
   Un environnement distinct, pas un filtre d'affichage. Deux différences
   structurelles avec l'espace auditeur :
     · les seuils n'y sont jamais rendus — le client n'a pas à connaître la
       matérialité, et ce n'est pas une case à décocher : le bandeau de seuils
       n'est tout simplement pas construit dans cet espace ;
     · le statut interne « en attente de revue par X » est replié avant
       affichage par statutVisibleClient() — le client ne peut pas déduire
       l'avancement du dossier d'audit.
   ═══════════════════════════════════════════════════════════════════════ */

/** Requêtes visibles par le contact connecté. Le référent général voit tout. */
function requetesVisiblesClient(){
  const c = contactCourant();
  return S.requetes.filter(r => c.role === 'referent_general' || r.contact === c.id);
}

function vueClientDemandes(){
  const c = contactCourant(), rs = requetesVisiblesClient();
  const enRetard = rs.filter(retard);
  return `
    <div class="hd"><h1>Vos demandes de documents</h1>
      <span class="sub">Altiverre SAS — exercice clos le 31/12/2025 · ${esc(c.nom)}, ${esc(c.fonction)}</span></div>
    <p class="note">Dépôt sur cette page ou par courriel à <span class="mono">${esc(S.portail.adresse)}</span>.
      Le bouton « tout est déposé » signale à l’équipe que la demande est complète.</p>
    ${enRetard.length ? `<div class="callout warn"><b>${enRetard.length} demande(s) en retard.</b>
      Une relance automatique part tous les ${S.portail.cadence} jours ouvrés ; passé ${S.portail.escalade} jours,
      elle est adressée à ${esc(S.contacts.find(x => x.role === 'referent_general').nom)}.</div>` : ''}
    ${barreFiltres('client', rs.length, filtrer(rs, 'client').length)}
    ${rs.length ? (filtrer(rs, 'client').length
        ? filtrer(rs, 'client').map(r => carteRequeteClient(r)).join('')
        : '<p class="note">Aucune demande ne correspond aux filtres.</p>')
      : '<p class="note">Aucune demande ne vous est adressée pour le moment.</p>'}`;
}

const CLI_PAR_PAGE = 15;
function carteRequeteClient(r){
  const tousDeposes = r.items.every(i => i.statut !== 'non_recu' && i.statut !== 'partiel');
  const ret = retard(r);
  // une sélection d'audit peut compter plus de cent éléments : on en affiche une
  // page à la fois. Rien n'est masqué — le compte total est écrit, et le reste
  // s'ouvre d'un bouton.
  const tout = S.cliTout && S.cliTout[r.id];
  const restants = r.items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel');
  const vus = tout ? r.items : (restants.length > CLI_PAR_PAGE ? restants.slice(0, CLI_PAR_PAGE)
                                                               : r.items.slice(0, Math.max(CLI_PAR_PAGE, restants.length)));
  return `<section class="blk">
    <header><span class="num">${r.id}</span><h2>${esc(r.titre)}</h2>
      <span class="why">à fournir avant le ${frDate(r.echeance)}${ret ? ' — en retard de ' + ancienneteRetard(r) + ' jours ouvrés' : ''}</span></header>
    <div class="body">
      ${r.items.length > vus.length ? `<div class="row"><span class="pill">${r.items.length} demandés</span>
        <span class="pill">${r.items.length - restants.length} déposés</span>
        <span class="pill warn">${restants.length} restants</span>
        <button class="btn mini sec" data-clitout="${r.id}">tout afficher</button></div>` : ''}
      ${vus.map(i => {
        const v = statutVisibleClient(i);
        return `<div class="cli-item">
          <div class="g"><b>${esc(i.desc)}</b>
            ${i.depots.length ? `<div class="dep">Déposé : ${i.depots.map(d => `<span class="f">${esc(d.nom)}</span>`).join('')}
              <div>Accusé de réception — ${i.depots.map(d => horo(d.t)).join(', ')}</div></div>` : ''}
          </div>
          <div class="a">
            <span class="pill ${STATUTS[v].cls}">${STATUTS[v].lib}</span>
            <button class="btn mini sec" data-depot="${r.id}|${i.id}">déposer un document</button>
          </div>
        </div>`;
      }).join('')}
      ${tout && r.items.length > CLI_PAR_PAGE ? `<button class="btn mini sec" data-clitout="${r.id}" style="margin-top:8px">replier la liste</button>` : ''}
      <div class="row" style="margin:10px 0 0">
        ${r.clotureClient
          ? '<span class="pill">vous avez signalé que tout est déposé</span>'
          : `<button class="btn" data-clot="${r.id}" ${tousDeposes ? '' : 'disabled'}>tout est déposé</button>
             ${tousDeposes ? '' : '<span class="smallcaps">le bouton s’active quand chaque élément a reçu au moins un document</span>'}`}
      </div>
      <div class="msg">
        <h3>Échanges sur cette demande</h3>
        ${r.messages.length ? r.messages.map(m => `<div class="m ${m.cote}">
            <span class="w">${esc(m.par)} · ${horo(m.t)}</span>${esc(m.texte)}</div>`).join('')
          : '<p class="note">Aucun message.</p>'}
        <div class="row" style="margin:8px 0 0">
          <div class="ctrl" style="flex:1 1 300px"><input type="text" data-msg="${r.id}" placeholder="écrire à l’équipe d’audit"></div>
          <button class="btn sec" data-msgok="${r.id}">envoyer</button>
        </div>
      </div>
    </div></section>`;
}

/* ── administration du portail (côté auditeur) ───────────────────────────── */
function vueClientContacts(){
  const rows = S.contacts.map(c => ({
    nom:`<b>${esc(c.nom)}</b><div class="smallcaps">${esc(c.fonction)}</div>`,
    soc:esc(c.societe), mail:`<span class="mono">${esc(c.mail)}</span>`,
    role:`<select class="cell txt" data-crole="${c.id}" style="width:180px">
        ${Object.entries(ROLES_CLIENT).map(([k, v]) => `<option value="${k}" ${c.role === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`,
    sec:c.sections.map(s => `<span class="tag">${esc((POSTES.find(p => p.code === s) || {}).lib || s)}</span>`).join(' ') || '<span class="smallcaps">aucune</span>',
    n:String(S.requetes.filter(r => r.contact === c.id).length),
  }));
  const enScope = postesEnPerimetre();
  const sansRef = enScope.filter(p => !S.contacts.some(c => c.sections.includes(p.code)));
  return `
    <div class="hd"><h1>Contacts de la mission</h1>
      <span class="sub">administration du portail — écran auditeur, jamais visible du client</span></div>
    <section class="blk"><header><h2>Personnes déclarées</h2>
      <span class="why">${S.contacts.length} contact(s)</span></header><div class="body">
      ${table([{k:'nom',t:'Personne',cls:'wrapcell'},{k:'soc',t:'Société',cls:'wrapcell'},{k:'mail',t:'Courriel'},
               {k:'role',t:'Rôle sur la mission'},{k:'sec',t:'Sections dont elle répond',cls:'wrapcell'},
               {k:'n',t:'Requêtes',n:1}], rows)}
      <h3>Ajouter une personne</h3>
      <div class="row">
        <div class="ctrl"><label>Nom</label><input type="text" id="ct-nom" placeholder="Prénom Nom"></div>
        <div class="ctrl"><label>Fonction</label><input type="text" id="ct-fct" placeholder="ex. : contrôleur de gestion"></div>
        <div class="ctrl"><label>Courriel</label><input type="email" id="ct-mail" placeholder="prenom.nom@societe.example"></div>
        <div class="ctrl"><label>Société</label>
          <select id="ct-soc"><option>Altiverre SAS</option><option>Cabinet Lefèvre (expert-comptable)</option></select></div>
        <div class="ctrl"><label>Section dont elle répond</label>
          <select id="ct-sec"><option value="">— aucune —</option>
            ${enScope.map(p => `<option value="${p.code}">${esc(p.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn" id="ct-add">ajouter</button></div>
      </div>
    </div></section>
    <section class="blk"><header><h2>Référent par section</h2>
      <span class="why">c’est lui qui reçoit les requêtes de la section</span></header><div class="body">
      ${table([{k:'s',t:'Section'},{k:'r',t:'Référent',cls:'wrapcell'},{k:'n',t:'Requêtes ouvertes',n:1}],
        enScope.map(p => {
          const c = referentSection(p.code);
          const ouvertes = requetesDe(p.code).filter(r => !r.clotureClient).length;
          return { s:esc(p.lib),
                   r:S.contacts.some(x => x.sections.includes(p.code))
                     ? esc(c.nom) + ' <span class="smallcaps">' + esc(c.fonction) + '</span>'
                     : `<span class="pill warn">aucun référent — repli sur ${esc(c.nom)}</span>`,
                   n:String(ouvertes) };
        }))}
      ${sansRef.length ? `<div class="callout warn"><b>${sansRef.length} section(s) sans référent déclaré.</b>
        Les requêtes partent au référent général par défaut. C’est un repli, pas une organisation.</div>` : ''}
    </div></section>`;
}

function vueClientParams(){
  const p = S.portail;
  return `
    <div class="hd"><h1>Paramétrage du portail</h1>
      <span class="sub">administration — écran auditeur</span></div>
    <section class="blk"><header><h2>Relances et escalade</h2></header><div class="body">
      <div class="row">
        <div class="ctrl"><label>Cadence de relance (jours ouvrés)</label>
          <select id="pp-cad">${[3,5,7,10].map(v => `<option value="${v}" ${p.cadence === v ? 'selected' : ''}>${v} jours</option>`).join('')}</select></div>
        <div class="ctrl"><label>Escalade au référent après</label>
          <select id="pp-esc">${[7,10,15,20].map(v => `<option value="${v}" ${p.escalade === v ? 'selected' : ''}>${v} jours</option>`).join('')}</select></div>
        <div class="ctrl"><label>Samedi ouvré</label>
          <select id="pp-sam"><option value="0" ${!p.samediOuvre ? 'selected' : ''}>non</option><option value="1" ${p.samediOuvre ? 'selected' : ''}>oui</option></select></div>
        <div class="ctrl"><label>Langue des messages</label>
          <select id="pp-lang"><option value="fr" ${p.langue === 'fr' ? 'selected' : ''}>français</option>
            <option value="en" ${p.langue === 'en' ? 'selected' : ''}>anglais</option></select></div>
      </div>
      <div class="ctrl" style="max-width:460px"><label>Adresse de dépôt par courriel</label>
        <input type="text" id="pp-adr" value="${esc(p.adresse)}"></div>
      <div class="row" style="margin-top:8px">
        <span class="pill ${S.requetes.filter(retard).length ? 'warn' : ''}">${S.requetes.filter(retard).length} demande(s) en retard</span>
        <span class="pill ${S.requetes.filter(r => retard(r) && ancienneteRetard(r) >= p.escalade).length ? 'bad' : ''}">${S.requetes.filter(r => retard(r) && ancienneteRetard(r) >= p.escalade).length} au-delà du délai d’escalade</span>
        <span class="smallcaps">aucun message n’est envoyé : ni serveur, ni transport sortant</span>
      </div>
    </div></section>
    <section class="blk"><header><h2>Ce que le client voit, et ce qu’il ne voit pas</h2></header><div class="body">
      ${table([{k:'q',t:'Élément'},{k:'v',t:'Visible du client'},{k:'p',t:'Pourquoi',cls:'wrapcell'}], [
        { q:'Objet et éléments de chaque demande qui lui est adressée', v:'<span class="pill">oui</span>', p:'c’est l’objet du portail' },
        { q:'Statut « non reçu », « partiellement soumis », « tout est déposé »', v:'<span class="pill">oui</span>', p:'il doit savoir ce qui manque' },
        { q:'Statut « en cours de traitement »', v:'<span class="pill">oui</span>', p:'accusé que l’équipe a pris la main' },
        { q:'Statut « en attente de revue par X »', v:'<span class="pill bad">non</span>', p:'statut interne : il révélerait l’organisation et l’avancement de la revue' },
        { q:'Seuils de matérialité, de planification, de remontée', v:'<span class="pill bad">non</span>', p:'le bandeau de seuils n’est pas construit dans cet espace — ce n’est pas un masquage' },
        { q:'Papiers de travail, notes de revue, conclusions', v:'<span class="pill bad">non</span>', p:'documentation d’audit' },
        { q:'Fil de messages de sa propre demande', v:'<span class="pill">oui</span>', p:'distinct des notes de revue' },
        { q:'Demandes adressées à un autre contact', v:'<span class="pill warn">seulement le référent général</span>', p:'chacun voit ce dont il répond' },
      ])}
    </div></section>`;
}
