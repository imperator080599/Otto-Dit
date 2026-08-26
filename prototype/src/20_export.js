/* ═══ 31. FILTRES DE REQUÊTES ══════════════════════════════════════════════
   Cumulables, et les mêmes des deux côtés : ce qui change entre l'auditeur et
   le client, c'est le jeu de requêtes visibles et les statuts lisibles, pas
   la façon de filtrer.
   ═══════════════════════════════════════════════════════════════════════ */
function filtrer(liste, cote){
  const f = S.filtres;
  return liste.filter(r => {
    if (f.section && r.section !== f.section) return false;
    if (f.contact && r.contact !== f.contact) return false;
    if (f.statut){
      const st = r.items.map(i => cote === 'client' ? statutVisibleClient(i) : i.statut);
      if (!st.includes(f.statut)) return false;
    }
    if (f.echeance === 'retard' && !retard(r)) return false;
    if (f.echeance === 'avenir' && (retard(r) || r.echeance < S.aujourdhui)) return false;
    if (f.q){
      const q = f.q.toLowerCase();
      const hay = (r.id + ' ' + r.titre + ' ' + r.items.map(i => i.desc).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function barreFiltres(cote, total, retenus){
  const f = S.filtres;
  const sections = [...new Set(S.requetes.map(r => r.section))];
  const statuts = Object.entries(STATUTS).filter(([, v]) => cote !== 'client' || v.client);
  return `<div class="row" style="align-items:flex-end">
    <div class="ctrl" style="flex:1 1 190px"><label>Recherche</label>
      <input type="text" id="f-q" value="${esc(f.q)}" placeholder="numéro, objet, élément"></div>
    <div class="ctrl"><label>Statut</label>
      <select id="f-statut"><option value="">tous</option>
        ${statuts.map(([k, v]) => `<option value="${k}" ${f.statut === k ? 'selected' : ''}>${esc(v.lib)}</option>`).join('')}</select></div>
    ${cote === 'client' ? '' : `<div class="ctrl"><label>Section</label>
      <select id="f-section"><option value="">toutes</option>
        ${sections.map(c => `<option value="${c}" ${f.section === c ? 'selected' : ''}>${esc(libFsli(c))}</option>`).join('')}</select></div>`}
    ${cote === 'client' ? '' : `<div class="ctrl"><label>Destinataire</label>
      <select id="f-contact"><option value="">tous</option>
        ${S.contacts.map(c => `<option value="${c.id}" ${f.contact === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></div>`}
    <div class="ctrl"><label>Échéance</label>
      <select id="f-echeance"><option value="">toutes</option>
        <option value="retard" ${f.echeance === 'retard' ? 'selected' : ''}>en retard</option>
        <option value="avenir" ${f.echeance === 'avenir' ? 'selected' : ''}>à venir</option></select></div>
    <div class="ctrl"><label>&nbsp;</label>
      <span class="pill">${retenus} / ${total}</span></div>
    ${Object.values(f).some(Boolean) ? '<div class="ctrl"><label>&nbsp;</label><button class="btn sec" id="f-raz">effacer</button></div>' : ''}
  </div>`;
}

/** Vue auditeur de toutes les requêtes, filtrable. */
function vueRequetes(){
  const vus = filtrer(S.requetes, 'auditeur');
  const rows = vus.map(r => {
    const a = avancement(r.items), c = S.contacts.find(x => x.id === r.contact), ret = retard(r);
    return {
      id:`<span class="mono">${r.id}</span>`,
      sec:esc(libFsli(r.section)),
      t:esc(r.titre) + (r.proc ? ` <span class="tag">${esc(r.proc)}</span>` : ''),
      dest:c ? esc(c.nom) : '—',
      ech:`<span class="mono">${frDate(r.echeance)}</span>` + (ret ? `<div class="smallcaps" style="color:var(--anomalie)">retard ${ancienneteRetard(r)} j</div>` : ''),
      n:`${r.items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length} / ${r.items.length}`,
      av:`<div class="bar" style="width:80px"><i style="width:${(a * 100).toFixed(0)}%"></i></div>`,
      st:[...new Set(r.items.map(i => i.statut))].map(k => `<span class="pill ${STATUTS[k].cls}">${STATUTS[k].lib}</span>`).join(' '),
      v:`<button class="btn mini sec" data-open="${r.section}">section</button>
         <button class="btn mini sec" data-goreq="${r.id}">portail</button>`,
    };
  });
  return entete('Requêtes de la mission', 'toutes sections, filtrables') +
    blk('Filtres', '', barreFiltres('auditeur', S.requetes.length, vus.length)) +
    blk('Requêtes', vus.length + ' affichée(s)',
      vus.length ? table([{k:'id',t:'N°'},{k:'sec',t:'Section',cls:'wrapcell'},{k:'t',t:'Objet',cls:'wrapcell'},
        {k:'dest',t:'Destinataire'},{k:'ech',t:'Échéance'},{k:'n',t:'En attente',n:1},
        {k:'av',t:'Avancement'},{k:'st',t:'États',cls:'wrapcell'},{k:'v',t:''}], rows)
      : '<p class="note">Aucune requête ne correspond aux filtres.</p>');
}

/* ═══ 32. EXPORT DU STATUT DE MISSION ══════════════════════════════════════
   Trois périmètres de destinataire. Le classeur porte une feuille par section
   et une feuille de synthèse.
   ═══════════════════════════════════════════════════════════════════════ */
const PERIMETRES = {
  equipe:{ lib:'équipe interne',
    cols:['N°','Objet','Procédure','Élément','Statut interne','En attente de revue par','Échéance','Retard (j ouvrés)','Responsable côté client'] },
  groupe:{ lib:'auditeur du groupe',
    cols:['N°','Objet','Éléments','Avancement','Échéance','Retard (j ouvrés)'] },
  client:{ lib:'client',
    cols:['N°','Objet','Élément','Statut','Échéance','Responsable côté client'] },
};
function lignesExport(kind, requetes){
  const out = [];
  for (const r of requetes){
    const c = S.contacts.find(x => x.id === r.contact);
    if (kind === 'groupe'){
      out.push([r.id, r.titre, String(r.items.length), pct(avancement(r.items), 0),
                frDate(r.echeance), String(ancienneteRetard(r))]);
      continue;
    }
    for (const i of r.items){
      if (kind === 'equipe') out.push([r.id, r.titre, r.proc || '', i.desc, STATUTS[i.statut].lib,
        i.revoyeur || '', frDate(r.echeance), String(ancienneteRetard(r)), c ? c.nom : '']);
      else out.push([r.id, r.titre, i.desc, STATUTS[statutVisibleClient(i)].lib,
        frDate(r.echeance), c ? c.nom : '']);
    }
  }
  return out;
}
/** Feuille de synthèse : avancement par section, et qui doit quoi. */
function feuilleSynthese(kind){
  /* Un export sorti du dossier doit dire de QUEL fichier il parle : sans la
     version et son empreinte, deux classeurs identiques d'apparence peuvent
     porter des chiffres différents. */
  const v = versionCourante();
  const l = [
    ['Version du fichier', 'v' + v.n + ' — ' + v.lib],
    ['Reçue le', frDate(v.date) + ' de ' + v.par],
    ['Fichiers', v.fichiers],
    ['Empreinte', empreinteVersion(v.n)],
    ['Seuils au moment de l’export', 'signification ' + eur0(seuils().M)
      + ' · planification ' + eur0(seuils().PM) + ' · remontée ' + eur0(seuils().CTT)],
    [],
    ['Section', 'Requêtes', 'Éléments', 'En attente', 'Avancement', 'Retard max (j ouvrés)']];
  const sections = [...new Set(S.requetes.map(r => r.section))];
  for (const c of sections){
    const rs = requetesDe(c);
    const items = rs.flatMap(r => r.items);
    l.push([libFsli(c), String(rs.length), String(items.length),
            String(items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length),
            pct(rs.length ? rs.reduce((a, r) => a + avancement(r.items), 0) / rs.length : 0, 0),
            String(Math.max(0, ...rs.map(ancienneteRetard)))]);
  }
  l.push([]);
  l.push(['Responsable côté client', 'Société', 'Demandes en retard', 'Éléments dus', 'Ancienneté max (j ouvrés)']);
  for (const ct of S.contacts){
    const rs = S.requetes.filter(r => r.contact === ct.id && retard(r));
    if (!rs.length) continue;
    l.push([ct.nom, ct.societe, String(rs.length),
            String(rs.flatMap(r => r.items).filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length),
            String(Math.max(...rs.map(ancienneteRetard)))]);
  }
  return l;
}
const xmlEsc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const nomFeuille = s => s.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31);
/** Classeur au format SpreadsheetML — plusieurs feuilles, aucune dépendance. */
function classeur(kind){
  const d = PERIMETRES[kind];
  const feuilles = [{ nom:'Synthèse', lignes:feuilleSynthese(kind) }];
  for (const c of [...new Set(S.requetes.map(r => r.section))]){
    feuilles.push({ nom:nomFeuille(libFsli(c)), lignes:[d.cols, ...lignesExport(kind, requetesDe(c))] });
  }
  const xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '
    + 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
    + feuilles.map(f => `<Worksheet ss:Name="${xmlEsc(f.nom)}"><Table>\n`
        + f.lignes.map(r => '<Row>' + r.map(v =>
            `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`).join('') + '</Row>').join('\n')
        + '\n</Table></Worksheet>').join('\n')
    + '\n</Workbook>';
  return { xml, feuilles };
}
function telecharger(nom, contenu, type){
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenu], { type }));
    a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    return true;
  } catch (e){ return false; }
}

/* ── message d'envoi : composé, montré, jamais envoyé ────────────────────── */
function messageEnvoi(kind){
  const d = PERIMETRES[kind], enRetard = S.requetes.filter(retard);
  const dest = S.envoi.destinataires.length
    ? S.contacts.filter(c => S.envoi.destinataires.includes(c.id))
    : (kind === 'client' ? S.contacts.filter(c => c.role === 'referent_general') : []);
  const objet = `Altiverre SAS — exercice 2025 — suivi des demandes au ${frDate(S.aujourdhui)}`;
  const corps = kind === 'client'
    ? `Bonjour,\n\nVous trouverez ci-joint l’état des demandes de documents au ${frDate(S.aujourdhui)}.\n\n`
      + `${S.requetes.reduce((a, r) => a + r.items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length, 0)} `
      + `élément(s) restent attendus, dont ${enRetard.reduce((a, r) => a + r.items.filter(i => i.statut === 'non_recu' || i.statut === 'partiel').length, 0)} `
      + `au-delà de l’échéance.\n\nLe dépôt se fait sur le portail ou par courriel à ${S.portail.adresse}.\n\n`
      + `Bien cordialement,\nL’équipe d’audit`
    : `Bonjour,\n\nÉtat d’avancement de la mission Altiverre SAS au ${frDate(S.aujourdhui)}.\n\n`
      + `${postesEnPerimetre().filter(p => sec(p.code).visa).length} section(s) visée(s) sur ${postesEnPerimetre().length}, `
      + `${notesBloquantesOuvertes().length} note(s) bloquante(s) ouverte(s), `
      + `${registre().filter(f => f.statut === 'propose').length} facteur(s) de risque à statuer.\n\n`
      + `Le détail figure dans le classeur joint.\n\nBien cordialement,\nL’équipe d’audit`;
  return { objet, corps, dest, piece:`suivi-altiverre-2025-${kind}.xls` };
}

function vueExports(){
  const st = S.envoi, m = messageEnvoi(st.perimetre), c = classeur(st.perimetre);
  return entete('Exports et envoi du statut de mission', 'trois périmètres de destinataire, un classeur par périmètre') +
    cite('J’ai envie de faire en sorte que l’on puisse directement à partir de la plateforme d’audit générer un excel ou autre fichier de suivi. Le fichier doit être modulable (par exemple on ne va pas montrer la même chose au client et à l’équipe d’audit).') +
    blk('Périmètre', PERIMETRES[st.perimetre].lib,
      `<div class="seg" style="margin-bottom:8px">
        ${Object.entries(PERIMETRES).map(([k, v]) =>
          `<button data-perim="${k}" class="${st.perimetre === k ? 'on' : ''}">${esc(v.lib)}</button>`).join('')}
      </div>
      ${table([{k:'c',t:'Colonne'},{k:'e',t:'équipe interne'},{k:'g',t:'auditeur du groupe'},{k:'l',t:'client'}],
        [...new Set(Object.values(PERIMETRES).flatMap(v => v.cols))].map(col => ({
          c:esc(col),
          e:PERIMETRES.equipe.cols.includes(col) ? '<span class="pill">✓</span>' : '<span class="pill">—</span>',
          g:PERIMETRES.groupe.cols.includes(col) ? '<span class="pill">✓</span>' : '<span class="pill">—</span>',
          l:PERIMETRES.client.cols.includes(col) ? '<span class="pill">✓</span>' : '<span class="pill">—</span>',
        })))}`) +
    blk('Classeur', c.feuilles.length + ' feuille(s) · ' + c.feuilles.reduce((a, f) => a + f.lignes.length - 1, 0) + ' ligne(s)',
      `<div class="row">
        <button class="btn" data-xls="${st.perimetre}">télécharger le classeur (.xls)</button>
        <button class="btn sec" data-csv="${st.perimetre}">télécharger en CSV</button>
        <button class="btn sec" data-imprime="1">version imprimable</button>
      </div>
      ${table([{k:'f',t:'Feuille'},{k:'n',t:'Lignes',n:1},{k:'a',t:'Aperçu de la première ligne',cls:'wrapcell'}],
        c.feuilles.map(f => ({ f:esc(f.nom), n:String(Math.max(0, f.lignes.length - 1)),
          a:'<span class="smallcaps">' + esc((f.lignes[1] || f.lignes[0] || []).join(' · ').slice(0, 120)) + '</span>' })))}
      <div id="exp-out"></div>`) +
    blk('Envoi automatique', st.cadence === 'aucun' ? 'désactivé' : 'cadence : ' + st.cadence,
      `<div class="row">
        <div class="ctrl"><label>Cadence</label>
          <select id="env-cad">
            <option value="hebdo" ${st.cadence === 'hebdo' ? 'selected' : ''}>hebdomadaire</option>
            <option value="bihebdo" ${st.cadence === 'bihebdo' ? 'selected' : ''}>deux fois par semaine</option>
            <option value="mensuel" ${st.cadence === 'mensuel' ? 'selected' : ''}>mensuelle</option>
            <option value="aucun" ${st.cadence === 'aucun' ? 'selected' : ''}>aucun envoi</option>
          </select></div>
        <div class="ctrl"><label>Destinataires (parmi les contacts du portail)</label>
          <select id="env-dest" multiple size="4" style="min-width:260px">
            ${S.contacts.map(x => `<option value="${x.id}" ${st.destinataires.includes(x.id) ? 'selected' : ''}>${esc(x.nom)} — ${esc(x.societe)}</option>`).join('')}</select></div>
      </div>
      <div class="callout">
        <div class="kv">
          <span class="k">À</span><span class="v" style="font-family:var(--sans)">${m.dest.length ? m.dest.map(x => esc(x.nom) + ' &lt;' + esc(x.mail) + '&gt;').join(', ') : '<i>aucun destinataire sélectionné</i>'}</span>
          <span class="k">Objet</span><span class="v" style="font-family:var(--sans)">${esc(m.objet)}</span>
          <span class="k">Pièce jointe</span><span class="v">${esc(m.piece)}</span>
        </div>
        <pre style="white-space:pre-wrap;font:12px/1.5 var(--mono);margin:8px 0 0">${esc(m.corps)}</pre>
      </div>
      <div class="callout warn"><b>Aucun envoi n’a lieu.</b> Ce fichier n’a ni serveur ni transport sortant : le message
      ci-dessus est <b>composé</b>, avec ses destinataires réels et sa pièce jointe réelle, et s’arrête là. L’envoi
      appartient à l’application.</div>`);
}
