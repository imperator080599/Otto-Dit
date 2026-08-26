import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const GRADES = await p.evaluate(()=>Object.fromEntries(Object.entries(USERS).map(([k,u])=>[k,u.grade])));
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));
const USERS_GRADE=k=>GRADES[k];

// 1. une note s'ancre sur un objet : il n'existe pas de note flottante.
// La règle « sans affectation, la note remonte au grade le plus élevé » se
// vérifie sur une procédure NON AFFECTÉE : le test de détail du chiffre
// d'affaires ne l'est plus depuis le testing déroulé de l'amorce, on prend
// donc une procédure du même poste que personne n'a prise.
await p.evaluate(()=>{ window.__sec='CA'; S.dest.CA='plan'; aller('fsli:CA','auditeur'); });
let r = await p.evaluate(()=>{
  const b=document.querySelector('#main [data-note-cible]');
  b.click();
  return { cible:S.noteCible, champ:!!document.getElementById('nt-txt') };
});
ok('poser une note exige une ancre, prise sur l’objet cliqué',
   !!r.cible && !!r.cible.objet && !!r.cible.ref, r.cible ? r.cible.objet+':'+r.cible.ref : 'aucune');
ok('le formulaire s’ouvre sur la destination « notes »', r.champ);

r = await p.evaluate(()=>{
  document.getElementById('nt-type').value='bloq';
  document.getElementById('nt-txt').value='Rapprocher le bon de livraison avant de conclure.';
  document.getElementById('nt-add').click();
  const n=S.notes[S.notes.length-1];
  return { auteur:USERS[n.auteur].nom, pour:USERS[n.pour].nom, type:n.type,
    ancre:n.ancre.objet+':'+n.ancre.ref, bloq:notesBloquantesOuvertes(window.__sec).length,
    prep:trav('SEC-'+window.__sec+'-'+n.ancre.ref).preparateur, pourCle:n.pour, sec:window.__sec,
    surSection:travauxDe('CA').some(t=>t.preparateur===n.pour||t.reviseur===n.pour) };
});
ok('la note est posée, typée et adressée', r.type==='bloq'&&r.bloq>0, `${r.auteur} → ${r.pour} sur ${r.ancre} (${r.sec})`);
ok('le destinataire proposé est quelqu’un qui travaille sur la section',
   r.surSection, `proposé : ${r.pour} (${USERS_GRADE(r.pourCle)})`);

// Et là où PERSONNE ne travaille encore, la note remonte au grade le plus élevé :
// une note sans destinataire naturel monte, elle ne descend pas.
const vierge = await p.evaluate(()=>{
  const p0 = postesEnPerimetre().find(x=>travauxDe(x.code).every(t=>!t.preparateur&&!t.reviseur));
  if (!p0) return null;
  S.dest[p0.code]='plan'; aller('fsli:'+p0.code,'auditeur');
  const b=document.querySelector('#main [data-note-cible]'); b.click();
  const sel=document.getElementById('nt-pour'); const v=sel.value;
  document.getElementById('nt-annul').click();
  return { poste:p0.code, pour:v, grade:USERS[v].grade, nom:USERS[v].nom };
});
ok('sans personne sur la section, la note remonte au grade le plus élevé',
   vierge && vierge.grade==='associée', vierge ? `${vierge.poste} → ${vierge.nom} (${vierge.grade})` : 'aucune section vierge');

r = await p.evaluate(()=>{
  // Inès est refusée : sa déclaration d'indépendance a été révisée et n'est
  // pas signée. C'est la règle, et on la vérifie ici plutôt que de la contourner.
  const refus = affecter('SEC-CA-DETAIL','preparateur','ines');
  // Le préparateur ne peut pas être l'auteur de la note (karim est connecté) :
  // sinon la note lui reviendrait à lui-même, ce que le système ne fait pas.
  affecter('SEC-CA-DETAIL','preparateur','lea'); affecter('SEC-CA-DETAIL','reviseur','sonia');
  S.dest.CA='plan'; aller('fsli:CA','auditeur');
  const b=[...document.querySelectorAll('#main [data-note-cible]')].find(x=>/DETAIL/.test(x.dataset.noteCible));
  b.click();
  const sel=document.getElementById('nt-pour');
  const choisi=sel.value;
  document.getElementById('nt-annul').click();
  return { choisi, prep:trav('SEC-CA-DETAIL').preparateur, refus };
});
ok('un membre sans déclaration valide ne reçoit aucun travail', !r.refus.ok, r.refus.why);
ok('quand le travail est affecté, la note va à son préparateur',
   r.choisi===r.prep, `proposé ${r.choisi}, préparateur ${r.prep}`);

// 2. une note bloquante bloque réellement le visa
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA');
  const o=obstaclesVisa(p0);
  S.dest.CA='concl'; renderMain();
  const btn=[...document.querySelectorAll('#main button')].find(x=>/viser la section/.test(x.textContent));
  return { obst:o.filter(x=>/bloquante/.test(x)), desactive:btn?btn.disabled:'absent',
    cnt:[...document.querySelectorAll('.destnav .dest')].find(x=>/Notes/.test(x.textContent))?.textContent.trim() };
});
ok('la note bloquante figure parmi les obstacles', r.obst.length>0, r.obst[0]||'');
ok('le bouton « viser la section » est désactivé', r.desactive===true);
ok('la navigation interne compte la note bloquante', /1/.test(r.cnt||''), r.cnt);

// 3. l'auteur ne peut pas clore sa propre note ; le destinataire, oui
r = await p.evaluate(()=>{
  S.dest.CA='notes'; renderMain();
  const auteurPeut=!!document.querySelector('#main button[data-clos]');
  const s=document.getElementById('whoaud'); s.value='lea'; s.dispatchEvent(new Event('change',{bubbles:true}));
  S.dest.CA='notes'; renderMain();
  const revPeut=!!document.querySelector('#main button[data-clos]');
  return { auteurPeut, revPeut };
});
ok('l’auteur ne peut pas clore sa propre note', r.auteurPeut===false);
ok('un réviseur, lui, peut la clore — la règle est le rôle, pas le destinataire', r.revPeut===true);
r = await p.evaluate(()=>{
  document.querySelector('#main button[data-clos]').click();
  const n=S.notes[S.notes.length-1];
  return { clos:n.clos?USERS[n.clos.par].nom:null, bloq:notesBloquantesOuvertes('CA').length };
});
ok('une fois close, elle ne bloque plus', r.clos&&r.bloq===0, 'close par '+r.clos);

// 4. ce que le client ne voit pas
r = await p.evaluate(()=>{
  S.espace='client'; S.vue='cli.vue'; render();
  /* On lit ce qui est PEINT — la balise <script> du prototype contient tout le
     code source, y compris les libellés internes : la scruter ferait croire à
     des fuites qui n'existent pas. */
  const h = ['.top', '#rail', '#main'].map(s => document.querySelector(s))
    .filter(Boolean).map(e => e.innerText).join('\n');
  return { notes:/Rapprocher le bon de livraison/.test(h),
    statutInterne:/en attente de revue par/.test(h),
    obstacles:/obstacle/i.test(h),
    vus:[...new Set([...document.querySelectorAll('#main .pill')].map(e=>e.textContent.trim()))].slice(0,6) };
});
ok('les notes de revue ne fuient pas au portail client', !r.notes);
ok('le statut interne « en attente de revue par » ne fuit pas', !r.statutInterne);
ok('les obstacles au visa ne fuient pas', !r.obstacles);
console.log('     pastilles visibles côté client :', r.vus.join(' · '));

console.log('erreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
await b.close();
