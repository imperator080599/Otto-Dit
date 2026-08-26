
/* ═══ 46. ÉQUIPE, ANCIENNETÉ ET INDÉPENDANCE ═══════════════════════════════
   Trois choses qu'un dossier doit porter et qu'aucun outil ne suit :

   1. QUI est sur la mission, à quel grade, avec quel rôle, entré quand et
      sorti quand. Une liste figée dans le code n'est pas une équipe.
   2. DEPUIS COMBIEN D'EXERCICES chacun est sur ce client. La familiarité est
      une menace à documenter, et la rotation du signataire est encadrée.
      C'est déterministe : ça se compte, ça ne se juge pas.
   3. SA DÉCLARATION D'INDÉPENDANCE, une par membre et par exercice, datée et
      signée.

   LA RÈGLE QUI REND TOUT CELA RÉEL, et c'est le seul point qui compte :
   AUCUN TRAVAIL NE PEUT ÊTRE ATTRIBUÉ à un membre dont la déclaration n'est
   pas signée, et un travail attribué à quelqu'un dont la déclaration est
   devenue caduque est un OBSTACLE AU VISA de sa section. Même famille de
   règle que « on ne clôt pas sa propre note » : le système refuse, il ne
   rappelle pas.

   Une déclaration se SIGNE SOI-MÊME — personne ne signe pour un autre. Elle
   se RÉVISE en cours de mission si les circonstances changent : la révision
   n'écrase rien, elle empile une version, et l'ancienne reste lisible avec sa
   signature. Tant que la révision n'est pas signée, la déclaration du membre
   est caduque et ses travaux bloquent le visa.

   RÉSERVE. Les seuils portés ici — durée de rotation du signataire, seuil de
   familiarité, plafond du ratio d'honoraires, liste des services interdits —
   sont des PARAMÈTRES DÉCLARÉS et modifiables, marqués [UNVERIFIED] : aucun
   texte primaire n'a pu être atteint depuis cet environnement. Ils doivent
   être confrontés au texte avant tout usage réel. C'est la même règle que
   pour le catalogue méthodologique.
   ═══════════════════════════════════════════════════════════════════════ */

const EXERCICE = '2025';

/* ── les rubriques de la déclaration ──────────────────────────────────────
   Le minimum demandé, dans l'ordre où on le remplit. Chacune se répond par
   oui ou par non ; un « oui » exige une précision écrite, sans quoi la
   déclaration n'est pas signable. Un formulaire qu'on peut signer vide est
   un formulaire qui ne dit rien. */
const RUBRIQUES_INDEP = [
  { code:'interets', lib:'Intérêts financiers, directs ou indirects',
    d:'titres du client ou d’une entité liée, détenus par vous, votre conjoint ou une personne à charge, '
     + 'y compris par l’intermédiaire d’un placement dont vous choisissez la composition' },
  { code:'familiaux', lib:'Liens familiaux avec les dirigeants ou le personnel comptable',
    d:'lien de parenté ou d’alliance avec un dirigeant, un administrateur, ou toute personne du client '
     + 'occupant une fonction comptable ou financière' },
  { code:'emploi', lib:'Emploi antérieur chez le client',
    d:'poste occupé chez le client ou une entité liée, à quelque date que ce soit, et fonction occupée' },
  { code:'sacc', lib:'Services autres que la certification rendus par vous au client',
    d:'toute prestation autre que l’audit à laquelle vous avez personnellement pris part, y compris une '
     + 'mission antérieure ou une intervention ponctuelle' },
  { code:'affaires', lib:'Relations d’affaires',
    d:'relation commerciale avec le client ou ses dirigeants, hors relation courante aux conditions du marché' },
  { code:'prets', lib:'Prêts et garanties',
    d:'prêt consenti au client ou reçu de lui, caution ou garantie donnée ou reçue, dans un sens ou dans l’autre' },
  { code:'cadeaux', lib:'Cadeaux et invitations au-delà du seuil déclaré',
    d:'cadeau, avantage ou invitation reçu du client dont la valeur dépasse le seuil paramétré ci-dessus' },
];

/* ── accès ─────────────────────────────────────────────────────────────── */
function membres(){
  return Object.entries(USERS).map(([id, u]) => ({ id, ...u }));
}
function membresActifs(){ return membres().filter(m => !m.sortie); }
function declarations(uid){
  if (!S.declarations[uid]) S.declarations[uid] = [];
  return S.declarations[uid];
}
function declarationCourante(uid){
  const l = declarations(uid);
  return l.length ? l[l.length - 1] : null;
}
function declarationVide(motif){
  return { exercice:EXERCICE, reponses:{}, precisions:{}, signee:null, motif:motif || '', t:tick() };
}
/** Ce qui manque pour qu'une déclaration soit signable — la liste EST la règle. */
function manquesDeclaration(d){
  const m = [];
  if (!d) return ['déclaration non ouverte'];
  for (const r of RUBRIQUES_INDEP){
    const v = d.reponses[r.code];
    if (v === undefined) m.push('« ' + r.lib +' » sans réponse');
    else if (v === 'oui' && !(d.precisions[r.code] || '').trim())
      m.push('« ' + r.lib + ' » déclaré, sans précision écrite');
  }
  return m;
}
/** Une déclaration vaut si elle est signée et n'a pas été remplacée. */
function declarationValide(uid){
  const d = declarationCourante(uid);
  return !!(d && d.signee);
}
function etatDeclaration(uid){
  const l = declarations(uid), d = declarationCourante(uid);
  if (!d) return { cle:'absente', lib:'aucune déclaration', cls:'bad' };
  if (d.signee) return { cle:'signee', lib:'signée le ' + horo(d.signee.t), cls:'' };
  if (l.length > 1) return { cle:'caduque', lib:'révision ouverte, non signée', cls:'bad' };
  return { cle:'ouverte', lib:'ouverte, non signée', cls:'warn' };
}
/** LA règle : un membre sans déclaration signée ne reçoit aucun travail. */
function peutRecevoirTravail(uid){ return !uid || declarationValide(uid); }

/* ── écriture ─────────────────────────────────────────────────────────── */
function ouvrirDeclaration(uid){
  const l = declarations(uid);
  if (l.length && !l[l.length - 1].signee) return { ok:false, why:'une déclaration est déjà ouverte' };
  l.push(declarationVide(''));
  logEvent('déclaration d’indépendance ouverte', USERS[uid].nom, 'exercice ' + EXERCICE);
  return { ok:true };
}
/** Révision en cours de mission : elle N'ÉCRASE RIEN. La version signée reste
 *  lisible, la nouvelle part de ses réponses, et le membre est caduque tant
 *  qu'il ne l'a pas signée. */
function reviserDeclaration(uid, motif){
  const d = declarationCourante(uid);
  if (!d || !d.signee) return { ok:false, why:'aucune déclaration signée à réviser' };
  if (!(motif || '').trim()) return { ok:false, why:'une révision sans motif écrit n’est pas une révision' };
  d.remplacee = true;
  const n = declarationVide(motif);
  n.reponses = { ...d.reponses }; n.precisions = { ...d.precisions };
  declarations(uid).push(n);
  logEvent('déclaration d’indépendance révisée', USERS[uid].nom, motif.slice(0, 90));
  return { ok:true };
}
/** On signe SA déclaration, jamais celle d'un autre. */
function signerDeclaration(uid){
  if (uid !== S.moi) return { ok:false, why:'une déclaration d’indépendance se signe soi-même' };
  const d = declarationCourante(uid);
  const m = manquesDeclaration(d);
  if (m.length) return { ok:false, why:'déclaration incomplète : ' + m.join(' ; ') };
  d.signee = { par:uid, t:tick() };
  S.independance.confirmation = null;   // la confirmation d'ensemble retombe
  logEvent('déclaration d’indépendance signée', USERS[uid].nom,
           RUBRIQUES_INDEP.filter(r => d.reponses[r.code] === 'oui').length + ' rubrique(s) déclarée(s)');
  return { ok:true };
}
/** Confirmation de l'associé signataire POUR L'ENSEMBLE de l'équipe.
 *  Elle ne peut pas précéder les déclarations individuelles : une confirmation
 *  qui porterait sur des déclarations manquantes ne confirmerait rien. */
function confirmerEquipe(){
  const u = USERS[S.moi];
  if (!u || u.role !== 'associe') return { ok:false, why:'seul l’associé signataire confirme pour l’équipe' };
  const sans = membresActifs().filter(m => !declarationValide(m.id));
  if (sans.length) return { ok:false,
    why:sans.length + ' membre(s) sans déclaration signée : ' + sans.map(m => m.nom).join(', ') };
  const men = menacesNonTraitees();
  if (men.length) return { ok:false, why:men.length + ' menace(s) sans sauvegarde décrite' };
  S.independance.confirmation = { par:S.moi, t:tick() };
  logEvent('indépendance confirmée pour l’équipe', CABINET,
           membresActifs().length + ' membre(s) · exercice ' + EXERCICE);
  return { ok:true };
}

/* ── mouvements d'équipe ──────────────────────────────────────────────────
   On n'efface pas quelqu'un qui a signé quelque chose. Un membre qui porte
   une trace au dossier — un travail, une note, un visa, un événement — ne se
   retire pas : il reçoit une DATE DE SORTIE, et le dossier garde son nom. */
function tracesDe(uid){
  const t = travaux().filter(x => x.preparateur === uid || x.reviseur === uid).length;
  const n = S.notes.filter(x => x.auteur === uid || (x.clos && x.clos.par === uid)).length;
  const v = postesEnPerimetre().filter(p => (sec(p.code).visa || {}).par === uid).length;
  const e = S.events.filter(x => x.qui === (USERS[uid] || {}).nom).length;
  const d = declarations(uid).filter(x => x.signee).length;
  return { travaux:t, notes:n, visas:v, events:e, declarations:d,
           total:t + n + v + e + d };
}
function ajouterMembre(nom, grade, role, mail){
  if (!(nom || '').trim()) return { ok:false, why:'un membre sans nom n’est pas un membre' };
  if (!ORDRE_GRADE.includes(grade)) return { ok:false, why:'grade inconnu' };
  if (!ROLE_LIB[role]) return { ok:false, why:'rôle inconnu' };
  const id = 'm' + (++S.seqMembre);
  USERS[id] = { nom:nom.trim(), grade, role, cote:'audit',
                mail:(mail || '').trim(), entree:S.aujourdhui, sortie:'', exercices:1 };
  _repCache.cle = '';
  logEvent('membre ajouté à l’équipe', nom.trim(), grade + ' · ' + ROLE_LIB[role]);
  return { ok:true, id };
}
function retirerMembre(uid){
  const u = USERS[uid]; if (!u) return { ok:false, why:'membre inconnu' };
  if (uid === S.moi) return { ok:false, why:'on ne se retire pas soi-même de la mission' };
  const tr = tracesDe(uid);
  if (tr.total) return { ok:false, why:'ce membre porte ' + tr.total + ' trace(s) au dossier ('
    + [tr.travaux && tr.travaux + ' travail/travaux', tr.notes && tr.notes + ' note(s)',
       tr.visas && tr.visas + ' visa(s)', tr.declarations && tr.declarations + ' déclaration(s) signée(s)',
       tr.events && tr.events + ' événement(s)'].filter(Boolean).join(', ')
    + ') : datez sa sortie, ne l’effacez pas' };
  delete USERS[uid];
  _repCache.cle = '';
  logEvent('membre retiré de l’équipe', u.nom, 'aucune trace au dossier');
  return { ok:true };
}
function majMembre(uid, champ, valeur){
  const u = USERS[uid]; if (!u) return { ok:false, why:'membre inconnu' };
  const av = u[champ];
  if (champ === 'exercices') u.exercices = Math.max(0, parseInt(valeur, 10) || 0);
  else u[champ] = valeur;
  if (champ === 'grade' || champ === 'role') _repCache.cle = '';
  logEvent('fiche de membre modifiée', u.nom, champ + ' : ' + (av || '—') + ' → ' + (u[champ] || '—'));
  return { ok:true };
}

/* ── menaces déduites de l'ancienneté ─────────────────────────────────────
   Deux menaces, deux seuils déclarés. Elles ne bloquent pas : elles exigent
   une SAUVEGARDE ÉCRITE. Une menace sans sauvegarde reste non traitée, et
   c'est ce qui empêche la confirmation d'ensemble. */
function menacesIndependance(){
  const s = S.independance, out = [];
  for (const m of membresActifs()){
    if (m.role === 'associe' && m.exercices > s.rotationSignataire)
      out.push({ id:'ROT:' + m.id, membre:m, type:'rotation',
        lib:`${m.nom} signe ce mandat depuis ${m.exercices} exercices consécutifs, au-delà de la durée de `
          + `rotation paramétrée (${s.rotationSignataire}).`,
        exige:'Rotation du signataire, ou sauvegarde décrite et acceptée par le cabinet.' });
    else if (m.exercices > s.seuilFamiliarite)
      out.push({ id:'FAM:' + m.id, membre:m, type:'familiarite',
        lib:`${m.nom} est sur ce client depuis ${m.exercices} exercices consécutifs, au-delà du seuil de `
          + `familiarité paramétré (${s.seuilFamiliarite}).`,
        exige:'Sauvegarde décrite : revue supplémentaire, rotation partielle, ou changement d’affectation.' });
  }
  return out.map(x => ({ ...x, sauvegarde:(S.independance.sauvegardes[x.id] || '') }));
}
function menacesNonTraitees(){ return menacesIndependance().filter(x => !x.sauvegarde.trim()); }

/* ── services autres que la certification ────────────────────────────────
   Obligation française à part entière : le registre des SACC rendus au client,
   leur nature, leur montant, et le ratio d'honoraires rapporté à la mission de
   certification. La colonne « admissibilité » est un PARAMÈTRE DÉCLARÉ, pas un
   avis juridique : la liste des services interdits n'a pas pu être confrontée
   au texte primaire depuis cet environnement. [UNVERIFIED] */
const NATURES_SACC = {
  tenue:        { lib:'Tenue ou établissement de la comptabilité', adm:'interdit' },
  evaluation:   { lib:'Évaluation entrant dans les comptes',        adm:'interdit' },
  audit_interne:{ lib:'Externalisation de l’audit interne',         adm:'interdit' },
  recrutement:  { lib:'Recrutement de dirigeants ou de cadres financiers', adm:'interdit' },
  juridique_rep:{ lib:'Représentation du client dans un contentieux', adm:'interdit' },
  si:           { lib:'Conception ou mise en œuvre de systèmes d’information financière', adm:'interdit' },
  fiscal_consult:{ lib:'Consultation fiscale sans effet sur les comptes', adm:'a_examiner' },
  due_diligence:{ lib:'Diligences d’acquisition',                    adm:'a_examiner' },
  attestation:  { lib:'Attestation ou rapport lié à la mission légale', adm:'admis' },
  formation:    { lib:'Formation technique',                          adm:'admis' },
  autre:        { lib:'Autre prestation',                             adm:'a_examiner' },
};
const ADM_LIB = { interdit:{ lib:'interdit', cls:'bad' }, a_examiner:{ lib:'à examiner', cls:'warn' },
                  admis:{ lib:'admis', cls:'' } };
function ajouterSacc(nature, lib, montant, date, prestataire){
  if (!NATURES_SACC[nature]) return { ok:false, why:'nature inconnue' };
  if (!(lib || '').trim()) return { ok:false, why:'un service sans intitulé ne s’inscrit pas au registre' };
  const m = Math.round((parseFloat(String(montant).replace(/\s/g, '').replace(',', '.')) || 0) * 100);
  if (m <= 0) return { ok:false, why:'un montant nul ne se déclare pas' };
  S.sacc.push({ id:'SACC-' + String(++S.seqSacc).padStart(3, '0'), nature, lib:lib.trim(),
                montant:m, date:date || S.aujourdhui, prestataire:(prestataire || CABINET).trim() });
  logEvent('service autre que la certification inscrit', lib.trim(),
           NATURES_SACC[nature].lib + ' · ' + eur(m));
  return { ok:true };
}
function retirerSacc(id){
  const i = S.sacc.findIndex(x => x.id === id); if (i < 0) return;
  const x = S.sacc[i];
  S.sacc.splice(i, 1);
  logEvent('service retiré du registre', x.lib, eur(x.montant));
}
function totalSacc(){ return S.sacc.reduce((t, x) => t + x.montant, 0); }
function ratioSacc(){ return S.honorairesMission ? totalSacc() / S.honorairesMission : 0; }
function saccInterdits(){ return S.sacc.filter(x => NATURES_SACC[x.nature].adm === 'interdit'); }
function saccAExaminer(){ return S.sacc.filter(x => NATURES_SACC[x.nature].adm === 'a_examiner'); }

/* ── obstacles ────────────────────────────────────────────────────────────
   Deux portées. Au dossier : ce qui empêche de confirmer l'indépendance de
   l'équipe. À la section : les travaux attribués à quelqu'un dont la
   déclaration ne vaut plus. */
function obstaclesIndependance(){
  const o = [];
  const sans = membresActifs().filter(m => !declarationValide(m.id));
  if (sans.length) o.push(`${sans.length} membre(s) sans déclaration d’indépendance signée : `
    + sans.map(m => m.nom).join(', '));
  const men = menacesNonTraitees();
  if (men.length) o.push(`${men.length} menace(s) d’indépendance sans sauvegarde décrite`);
  const int = saccInterdits();
  if (int.length) o.push(`${int.length} service(s) inscrit(s) au registre et paramétré(s) « interdit »`);
  if (ratioSacc() * 100 > S.plafondSacc)
    o.push(`ratio d’honoraires SACC ${pct(ratioSacc(), 0)} au-delà du plafond paramétré (${S.plafondSacc}${NBSP}%)`);
  if (!S.independance.confirmation) o.push('indépendance de l’équipe non confirmée par l’associé signataire');
  return o;
}
/** Travaux d'une section attribués à un membre dont la déclaration ne vaut plus. */
function travauxIndependanceSection(code){
  const out = [];
  for (const t of travauxDe(code)){
    for (const role of ['preparateur', 'reviseur']){
      const uid = t[role];
      if (uid && !declarationValide(uid)) out.push({ t, role, uid, etat:etatDeclaration(uid) });
    }
  }
  return out;
}
function obstaclesIndependanceSection(code){
  const l = travauxIndependanceSection(code);
  if (!l.length) return [];
  const gens = [...new Set(l.map(x => USERS[x.uid].nom))];
  return [`${l.length} travail/travaux attribué(s) à ${gens.join(', ')} — déclaration d’indépendance non valide`];
}

/* ═══════════════════════════════════════════════════════════════════════
   LA VUE
   ═══════════════════════════════════════════════════════════════════════ */
function vueEquipe(){
  return entete('Équipe et indépendance',
                'qui est sur la mission, depuis combien d’exercices, et ce qu’il a déclaré') +
    blocEquipe() + blocAnciennete() + blocDeclarations() + blocSacc() + blocParamIndep();
}

function blocEquipe(){
  const sel = (uid, champ, options) => `<select class="cell txt" data-mem="${uid}|${champ}">
    ${options.map(([v, l]) => `<option value="${v}" ${USERS[uid][champ] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
  </select>`;
  const rows = membres().map(m => {
    const e = etatDeclaration(m.id), tr = tracesDe(m.id);
    return {
      n:`<b>${esc(m.nom)}</b>${m.id === S.moi ? ' <span class="pill">vous</span>' : ''}
         <div class="smallcaps mono">${esc(m.id)}</div>`,
      g:sel(m.id, 'grade', ORDRE_GRADE.map(g => [g, g])),
      r:sel(m.id, 'role', Object.entries(ROLE_LIB)),
      c:`<input class="cell txt" data-mem="${m.id}|mail" value="${esc(m.mail || '')}" placeholder="courriel">`,
      en:`<input class="cell txt" type="date" data-mem="${m.id}|entree" value="${esc(m.entree || '')}">`,
      so:`<input class="cell txt" type="date" data-mem="${m.id}|sortie" value="${esc(m.sortie || '')}">`,
      x:`<input class="cell" data-mem="${m.id}|exercices" value="${m.exercices}" style="width:52px">`,
      d:`<span class="pill ${e.cls}">${esc(e.lib)}</span>`,
      t:tr.total ? `<span class="smallcaps">${tr.total} trace(s)</span>` : '<span class="smallcaps">aucune</span>',
      a:tr.total || m.id === S.moi
        ? `<span class="smallcaps">non retirable</span>`
        : `<button class="btn mini sec" data-memdel="${m.id}">retirer</button>`,
    };
  });
  return blk('Équipe de la mission', membres().length + ' membre(s) · ' + membresActifs().length + ' en fonction',
    table([{k:'n',t:'Membre',cls:'wrapcell'},{k:'g',t:'Grade'},{k:'r',t:'Rôle'},{k:'c',t:'Courriel',cls:'wrapcell'},
           {k:'en',t:'Entrée'},{k:'so',t:'Sortie'},{k:'x',t:'Exercices',n:1},
           {k:'d',t:'Déclaration',cls:'wrapcell'},{k:'t',t:'Traces'},{k:'a',t:''}], rows) +
    `<div class="row" style="margin-top:8px">
      <div class="ctrl" style="flex:1 1 180px"><label>Nom du nouveau membre</label>
        <input type="text" id="mem-nom" placeholder="Prénom Nom"></div>
      <div class="ctrl"><label>Grade</label><select id="mem-grade">
        ${ORDRE_GRADE.map(g => `<option value="${g}">${esc(g)}</option>`).join('')}</select></div>
      <div class="ctrl"><label>Rôle</label><select id="mem-role">
        ${Object.entries(ROLE_LIB).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="ctrl" style="flex:1 1 180px"><label>Courriel</label>
        <input type="text" id="mem-mail" placeholder="p.nom@revisia-audit.example"></div>
      <div class="ctrl"><label>&nbsp;</label><button class="btn" id="mem-add">ajouter à la mission</button></div>
    </div>
    ${S.memErreur ? `<div class="callout bad">${esc(S.memErreur)}</div>` : ''}
    <p class="note">On ne retire pas quelqu’un qui a signé quelque chose : un membre portant une trace au
    dossier — un travail, une note, un visa, une déclaration — reçoit une <b>date de sortie</b>, et le
    dossier garde son nom. C’est la même règle que le journal d’événements, qui ne se réécrit pas.</p>`);
}

function blocAnciennete(){
  const men = menacesIndependance(), s = S.independance;
  const rows = membresActifs().sort((a, b) => b.exercices - a.exercices).map(m => {
    const mm = men.find(x => x.membre.id === m.id);
    return {
      n:`<b>${esc(m.nom)}</b><div class="smallcaps">${esc(m.grade)} · ${esc(ROLE_LIB[m.role])}</div>`,
      x:`<span class="mono">${m.exercices}</span>`,
      s:m.role === 'associe' ? `<span class="mono">${s.rotationSignataire}</span>
          <div class="smallcaps">rotation du signataire</div>`
        : `<span class="mono">${s.seuilFamiliarite}</span><div class="smallcaps">familiarité</div>`,
      e:mm ? `<span class="pill bad">${mm.type === 'rotation' ? 'rotation dépassée' : 'familiarité'}</span>`
           : '<span class="pill">sous le seuil</span>',
      g:mm ? `<textarea data-sauve="${esc(mm.id)}" rows="2"
                placeholder="sauvegarde décrite : ce qui est mis en place, et par qui">${esc(mm.sauvegarde)}</textarea>`
           : '<span class="smallcaps">—</span>',
    };
  });
  return blk('Ancienneté sur le client et menaces qui en découlent',
    men.length + ' menace(s) · ' + menacesNonTraitees().length + ' sans sauvegarde',
    table([{k:'n',t:'Membre',cls:'wrapcell'},{k:'x',t:'Exercices consécutifs',n:1},
           {k:'s',t:'Seuil applicable',n:1},{k:'e',t:'État'},{k:'g',t:'Sauvegarde décrite',cls:'wrapcell'}], rows) +
    (menacesNonTraitees().length ? `<div class="callout bad">
      <b>${menacesNonTraitees().length} menace(s) sans sauvegarde décrite.</b>
      ${menacesNonTraitees().map(x => esc(x.lib) + ' <span class="smallcaps">' + esc(x.exige) + '</span>').join('<br>')}
      <br>Tant qu’une sauvegarde n’est pas écrite, l’associé signataire ne peut pas confirmer
      l’indépendance de l’équipe.</div>` : '') +
    `<p class="note">Le nombre d’exercices consécutifs se compte, il ne se juge pas — et c’est précisément
    pour cela qu’aucun outil ne le suit. Les deux seuils sont des <b>paramètres déclarés</b>, modifiables
    plus bas et marqués <b>[UNVERIFIED]</b> : ils n’ont pas pu être confrontés au texte primaire depuis cet
    environnement.</p>`,
    menacesNonTraitees().length ? menacesNonTraitees().length + ' sans sauvegarde' : '');
}

function blocDeclarations(){
  const conf = S.independance.confirmation;
  const moi = S.moi, d = declarationCourante(moi), hist = declarations(moi);
  const manques = manquesDeclaration(d);
  const rows = membresActifs().map(m => {
    const e = etatDeclaration(m.id), dm = declarationCourante(m.id);
    const decl = dm ? RUBRIQUES_INDEP.filter(r => dm.reponses[r.code] === 'oui') : [];
    return {
      n:`<b>${esc(m.nom)}</b><div class="smallcaps">${esc(ROLE_LIB[m.role])}</div>`,
      e:`<span class="pill ${e.cls}">${esc(e.lib)}</span>`,
      v:`<span class="mono">${declarations(m.id).length || '—'}</span>`,
      r:decl.length ? decl.map(r => `<span class="tag">${esc(r.lib)}</span>`).join(' ')
                    : '<span class="smallcaps">rien à déclarer</span>',
      p:dm && dm.signee ? `<span class="smallcaps">${esc(USERS[dm.signee.par].nom)}<br>${horo(dm.signee.t)}</span>`
                        : '<span class="smallcaps">—</span>',
      a:m.id === moi ? '<span class="pill">à vous</span>'
        : declarationValide(m.id)
          ? `<button class="btn mini sec" data-revis="${m.id}">ouvrir une révision</button>`
          : '<span class="smallcaps">en attente de sa signature</span>',
    };
  });
  const histo = hist.length > 1 ? `<h3>Historique de vos déclarations</h3>` +
    table([{k:'v',t:'Version'},{k:'t',t:'Ouverte le'},{k:'m',t:'Motif de la révision',cls:'wrapcell'},
           {k:'s',t:'Signature',cls:'wrapcell'},{k:'e',t:'État'}],
      hist.map((x, i) => ({ v:`<span class="mono">v${i + 1}</span>`, t:horo(x.t),
        m:esc(x.motif || 'déclaration initiale de l’exercice'),
        s:x.signee ? horo(x.signee.t) : '<span class="smallcaps">—</span>',
        e:x.remplacee ? '<span class="smallcaps">remplacée, conservée</span>'
          : x.signee ? '<span class="pill">en vigueur</span>' : '<span class="pill bad">à signer</span>' }))) : '';

  return blk('Déclarations d’indépendance — exercice ' + EXERCICE,
    membresActifs().filter(m => declarationValide(m.id)).length + ' / ' + membresActifs().length + ' signée(s)',
    table([{k:'n',t:'Membre',cls:'wrapcell'},{k:'e',t:'État',cls:'wrapcell'},{k:'v',t:'Versions',n:1},
           {k:'r',t:'Rubriques déclarées',cls:'wrapcell'},{k:'p',t:'Signée par',cls:'wrapcell'},{k:'a',t:''}], rows) +
    `<div class="callout ${conf ? '' : 'warn'}">
      <b>Confirmation de l’associé signataire pour l’ensemble de l’équipe.</b>
      ${conf ? ` Confirmée par ${esc(USERS[conf.par].nom)} le ${horo(conf.t)}.`
             : ' Non confirmée. Elle exige que chaque membre en fonction ait signé, et que chaque menace '
               + 'porte une sauvegarde écrite : une confirmation d’ensemble posée sur des déclarations '
               + 'manquantes ne confirmerait rien.'}
      ${USERS[S.moi].role === 'associe' && !conf
        ? '<br><button class="btn" id="ind-conf">confirmer — engage ' + esc(USERS[S.moi].nom) + '</button>' : ''}
      ${S.indErreur ? '<br><span style="color:var(--anomalie)">' + esc(S.indErreur) + '</span>' : ''}
    </div>

    <h3>Votre déclaration — ${esc(USERS[moi].nom)}</h3>
    ${d ? `<div class="nl ${d.signee ? '' : 'warn'}">
      <div class="m">
        <span class="pill ${d.signee ? '' : 'warn'}">${d.signee ? 'signée le ' + horo(d.signee.t) : 'à signer'}</span>
        ${d.motif ? `<span class="smallcaps">révision : ${esc(d.motif)}</span>` : ''}
      </div>
      ${RUBRIQUES_INDEP.map(r => `<div class="ctrl" style="margin-top:6px">
        <label>${esc(r.lib)}${r.code === 'cadeaux' ? ' — seuil ' + eur(S.independance.seuilCadeau) : ''}</label>
        <div class="row">
          <select data-decl="${esc(r.code)}" ${d.signee ? 'disabled' : ''} style="width:210px">
            <option value="" ${d.reponses[r.code] === undefined ? 'selected' : ''}>— à répondre —</option>
            <option value="non" ${d.reponses[r.code] === 'non' ? 'selected' : ''}>non — rien à déclarer</option>
            <option value="oui" ${d.reponses[r.code] === 'oui' ? 'selected' : ''}>oui — à déclarer</option>
          </select>
          <input class="cell txt" style="flex:1 1 240px" data-declp="${esc(r.code)}"
            ${d.signee ? 'disabled' : ''} value="${esc(d.precisions[r.code] || '')}"
            placeholder="${d.reponses[r.code] === 'oui' ? 'précision obligatoire' : 'précision, si nécessaire'}">
        </div>
        <span class="smallcaps">${esc(r.d)}</span>
      </div>`).join('')}
      ${d.signee ? `<div class="callout"><b>Signée</b> par ${esc(USERS[d.signee.par].nom)} le ${horo(d.signee.t)}.
        Pour la modifier, ouvrez une révision : elle n’écrase pas celle-ci.
        <button class="btn mini sec" data-revis="${moi}">ouvrir une révision</button></div>`
        : `<div class="callout ${manques.length ? 'warn' : ''}">
            ${manques.length ? '<b>Il manque :</b> ' + esc(manques.join(' ; ')) + '.'
                             : 'Toutes les rubriques sont renseignées.'}</div>
           <button class="btn" id="decl-sign" ${manques.length ? 'disabled' : ''}>signer — engage ${esc(USERS[moi].nom)}</button>`}
    </div>` : `<div class="callout warn">Aucune déclaration ouverte pour l’exercice ${EXERCICE}.
      <button class="btn mini" data-declopen="${moi}">ouvrir ma déclaration</button></div>`}
    ${histo}
    <p class="note">Une déclaration se signe <b>soi-même</b> : personne ne signe pour un autre, et le bouton
    n’est pas rendu ailleurs. Une révision n’écrase rien — la version signée reste lisible, et tant que la
    nouvelle n’est pas signée, les travaux du membre bloquent le visa de leur section.</p>`,
    membresActifs().filter(m => !declarationValide(m.id)).length
      ? membresActifs().filter(m => !declarationValide(m.id)).length + ' non signée(s)' : '');
}

function blocSacc(){
  const t = totalSacc(), r = ratioSacc(), int = saccInterdits(), ex = saccAExaminer();
  const rows = S.sacc.map(x => {
    const n = NATURES_SACC[x.nature], a = ADM_LIB[n.adm];
    return {
      i:`<span class="mono">${esc(x.id)}</span>`,
      l:`<b>${esc(x.lib)}</b><div class="smallcaps">${esc(x.prestataire)}</div>`,
      n:esc(n.lib),
      a:`<span class="pill ${a.cls}">${esc(a.lib)}</span>`,
      d:`<span class="mono">${frDate(x.date)}</span>`,
      m:eur(x.montant),
      p:pct(S.honorairesMission ? x.montant / S.honorairesMission : 0, 1),
      g:`<button class="btn mini sec" data-saccdel="${esc(x.id)}">retirer</button>`,
    };
  });
  return blk('Registre des services autres que la certification',
    S.sacc.length + ' service(s) · ratio ' + pct(r, 1),
    (S.sacc.length ? table([{k:'i',t:'Réf.'},{k:'l',t:'Service rendu',cls:'wrapcell'},{k:'n',t:'Nature',cls:'wrapcell'},
           {k:'a',t:'Admissibilité'},{k:'d',t:'Date'},{k:'m',t:'Honoraires',n:1},
           {k:'p',t:'/ mission',n:1},{k:'g',t:''}], rows,
        { foot:{ l:'Total', m:eur(t), p:pct(r, 1) } })
      : '<p class="note">Aucun service inscrit au registre.</p>') +
    `<div class="grid3" style="margin-top:8px">
      <div class="kv"><span class="k">Honoraires de certification</span>
        <span class="v"><input class="cell" id="hon-mission" value="${(S.honorairesMission / 100).toFixed(2).replace('.', ',')}"></span>
        <span class="k">Total des services autres</span><span class="v">${eur(t)}</span></div>
      <div class="kv"><span class="k">Ratio d’honoraires</span>
        <span class="v"${r * 100 > S.plafondSacc ? ' style="color:var(--anomalie)"' : ''}>${pct(r, 1)}</span>
        <span class="k">Plafond paramétré</span>
        <span class="v"><input class="cell" id="sacc-plaf" value="${S.plafondSacc}" style="width:60px"> %</span></div>
      <div class="kv"><span class="k">Paramétrés « interdit »</span>
        <span class="v"${int.length ? ' style="color:var(--anomalie)"' : ''}>${int.length}</span>
        <span class="k">« à examiner »</span><span class="v">${ex.length}</span></div>
    </div>
    ${int.length ? `<div class="callout bad"><b>${int.length} service(s) paramétré(s) « interdit ».</b>
      ${int.map(x => esc(x.lib) + ' — ' + esc(NATURES_SACC[x.nature].lib) + ', ' + eur(x.montant)).join('<br>')}
      <br>La liste des services interdits est un <b>paramètre déclaré [UNVERIFIED]</b>, pas un avis juridique :
      elle n’a pas pu être confrontée au texte primaire. Ce qui est certain, c’est qu’un service de cette
      nature au registre appelle une décision écrite avant la signature du rapport.</div>` : ''}
    ${r * 100 > S.plafondSacc ? `<div class="callout bad">Le ratio ${pct(r, 1)} dépasse le plafond
      paramétré de ${S.plafondSacc}${NBSP}%. [UNVERIFIED]</div>` : ''}
    <div class="row" style="margin-top:8px">
      <div class="ctrl"><label>Nature</label><select id="sacc-nat">
        ${Object.entries(NATURES_SACC).map(([k, v]) => `<option value="${k}">${esc(v.lib)}</option>`).join('')}</select></div>
      <div class="ctrl" style="flex:1 1 200px"><label>Service rendu</label>
        <input type="text" id="sacc-lib" placeholder="intitulé de la prestation"></div>
      <div class="ctrl"><label>Honoraires</label><input class="cell" id="sacc-mont" placeholder="0,00"></div>
      <div class="ctrl"><label>Date</label><input class="cell txt" type="date" id="sacc-date" value="${S.aujourdhui}"></div>
      <div class="ctrl"><label>&nbsp;</label><button class="btn" id="sacc-add">inscrire au registre</button></div>
    </div>
    ${S.saccErreur ? `<div class="callout bad">${esc(S.saccErreur)}</div>` : ''}`,
    int.length ? int.length + ' interdit(s)' : '');
}

function blocParamIndep(){
  const s = S.independance;
  return blk('Paramètres déclarés', 'quatre nombres, quatre décisions — tous [UNVERIFIED]',
    `<div class="row">
      <div class="ctrl"><label>Rotation du signataire — exercices</label>
        <input class="cell" id="ind-rot" value="${s.rotationSignataire}" style="width:70px"></div>
      <div class="ctrl"><label>Seuil de familiarité — exercices</label>
        <input class="cell" id="ind-fam" value="${s.seuilFamiliarite}" style="width:70px"></div>
      <div class="ctrl"><label>Seuil de déclaration des cadeaux</label>
        <input class="cell" id="ind-cad" value="${(s.seuilCadeau / 100).toFixed(2).replace('.', ',')}" style="width:90px"></div>
      <div class="ctrl"><label>Plafond du ratio SACC — %</label>
        <input class="cell" id="ind-plaf" value="${S.plafondSacc}" style="width:70px"></div>
    </div>
    <div class="callout warn"><b>[UNVERIFIED] — à lire avant d’utiliser ces nombres.</b>
    La durée de rotation du signataire, le seuil de familiarité, le seuil de déclaration des cadeaux, le
    plafond du ratio d’honoraires et la liste des services interdits sont des <b>paramètres déclarés</b>.
    Aucun texte normatif primaire n’a pu être atteint depuis l’environnement de développement : ces valeurs
    ne sont pas des références, elles sont des réglages par défaut à confronter au texte. C’est la même
    réserve que celle portée par le catalogue méthodologique, et elle vaut ici avec la même force —
    l’indépendance est le sujet où une valeur fausse coûte le plus cher.</div>
    <div class="kv">
      <span class="k">Obstacles d’indépendance au dossier</span>
      <span class="v"${obstaclesIndependance().length ? ' style="color:var(--anomalie)"' : ''}>${obstaclesIndependance().length}</span>
    </div>
    ${obstaclesIndependance().length ? `<ul style="margin:6px 0 0 18px;padding:0">
      ${obstaclesIndependance().map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`);
}

/* ── amorce ───────────────────────────────────────────────────────────────
   Les déclarations de l'exercice ont été signées avant le début des travaux,
   en novembre et décembre 2025 : elles portent donc des dates ANTÉRIEURES à
   l'horloge de mission, et n'entrent pas au journal d'événements de la
   session — le journal enregistre ce qui se passe pendant la mission, il ne
   se réécrit pas en arrière.

   Deux membres sont volontairement dans un autre état, parce que la règle ne
   se démontre pas sur un dossier parfait :
     — Hugo Vasseur, arrivé en janvier, n'a pas encore signé : AUCUN travail
       ne peut lui être attribué, et l'écran refuse ;
     — Inès Rodrigues a signé puis ouvert une RÉVISION (son conjoint a rejoint
       une filiale du client) : sa déclaration est caduque tant qu'elle n'a pas
       signé la nouvelle, et ses travaux bloquent le visa de leurs sections. */
const AMORCE_DECL = {
  claire:{ t:'2025-11-04T10:20', oui:{} },
  lea   :{ t:'2025-11-05T09:05', oui:{} },
  karim :{ t:'2025-11-06T14:40', oui:{ cadeaux:'Invitation à un déjeuner professionnel le 12/09/2025, 62 € — au-dessus du seuil déclaré, sans influence sur la conduite des travaux.' } },
  ines  :{ t:'2025-11-06T16:15', oui:{ emploi:'Stage de six mois chez Altiverre SAS en 2018, au service logistique — sans fonction comptable ni financière.' } },
  sonia :{ t:'2026-02-03T11:30', oui:{} },
};
function seedEquipe(){
  for (const [uid, a] of Object.entries(AMORCE_DECL)){
    if (!USERS[uid]) continue;
    const d = { exercice:EXERCICE, reponses:{}, precisions:{}, motif:'', t:a.t, signee:{ par:uid, t:a.t } };
    for (const r of RUBRIQUES_INDEP){
      d.reponses[r.code] = a.oui[r.code] ? 'oui' : 'non';
      if (a.oui[r.code]) d.precisions[r.code] = a.oui[r.code];
    }
    S.declarations[uid] = [d];
  }
  /* Inès : révision ouverte, non signée — la déclaration est caduque. */
  const di = S.declarations.ines;
  if (di && di.length === 1){
    di[0].remplacee = true;
    di.push({ exercice:EXERCICE, t:'2026-03-09T08:45',
      motif:'Le conjoint a rejoint en février 2026 la direction financière d’Altiverre Industrie, filiale du client.',
      reponses:{ ...di[0].reponses }, precisions:{ ...di[0].precisions }, signee:null });
  }
  /* Registre des services autres que la certification. */
  S.sacc = [
    { id:'SACC-001', nature:'due_diligence', lib:'Diligences d’acquisition sur la cible Verrerie du Forez',
      montant:1200000, date:'2025-06-18', prestataire:CABINET },
    { id:'SACC-002', nature:'si', lib:'Paramétrage du reporting de consolidation',
      montant:950000, date:'2025-09-30', prestataire:'Revisia Conseil (entité liée au cabinet)' },
    { id:'SACC-003', nature:'fiscal_consult', lib:'Consultation sur le crédit d’impôt recherche',
      montant:450000, date:'2025-04-02', prestataire:CABINET },
    { id:'SACC-004', nature:'formation', lib:'Formation à la nouvelle norme de présentation',
      montant:180000, date:'2025-11-14', prestataire:CABINET },
  ];
  S.seqSacc = 4;
  for (const a of AFFECTATIONS_AMORCE) a.poser();
}

/* ── affectations posées à l'amorce, et pourquoi ──────────────────────────
   Le dossier ne part pas d'une feuille blanche : certaines affectations ont
   été faites AVANT le moment où l'on ouvre l'outil. Elles sont écrites ici,
   nommées et motivées, pour qu'on puisse vérifier qu'il n'y en a pas
   d'autres — la proposition de répartition, elle, n'écrit toujours rien.

   Elles sont posées SANS passer par affecter(), qui refuserait aujourd'hui
   l'affectation d'Inès : c'est le fait même que la règle ne s'appliquait pas
   au moment où elles ont été faites qui rend l'obstacle au visa nécessaire. */
const AFFECTATIONS_AMORCE = [
  { section:'CLIENTS', prep:'ines', rev:t => t.niveauRevue === 2 ? 'claire' : 'lea',
    pourquoi:'attribuées à Inès en novembre 2025, quand sa déclaration d’indépendance valait ; '
           + 'la révision de mars 2026 les rend caduques et bloque le visa de la section',
    poser(){ for (const t of travauxDe(this.section)){
      const st = trav(t.code); st.preparateur = this.prep; st.reviseur = this.rev(t); } },
  },
];
/** Codes des travaux affectés à l'amorce — pour vérifier qu'il n'y en a pas d'autres. */
function codesAffectesAmorce(){
  return AFFECTATIONS_AMORCE.flatMap(a => travauxDe(a.section).map(t => t.code));
}
