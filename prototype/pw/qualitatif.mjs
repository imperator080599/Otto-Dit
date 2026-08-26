import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// 1. LA MESURE : la part de règles quantitatives
let r = await p.evaluate(()=>{
  const q=REGLES_FACTEUR.filter(x=>x.nature==='quantitatif').map(x=>x.code);
  const l=REGLES_FACTEUR.filter(x=>x.nature==='qualitatif').map(x=>x.code);
  const reg=registre();
  return { q, l, n:REGLES_FACTEUR.length,
    part:Math.round(q.length/REGLES_FACTEUR.length*1000)/10,
    levesQ:reg.filter(f=>f.nature==='quantitatif').length,
    levesL:reg.filter(f=>f.nature==='qualitatif').length,
    total:reg.length, cible:CIBLE_VOLUME };
});
console.log(`     règles quantitatives : ${r.q.join(' · ')}`);
console.log(`     règles qualitatives  : ${r.l.join(' · ')}`);
console.log(`     RATIO : ${r.part} % de règles quantitatives (${r.q.length}/${r.n})`);
console.log(`     facteurs levés : ${r.levesQ} quantitatifs · ${r.levesL} qualitatifs sur ${r.total}`);
ok('la majorité des règles de levée sont désormais qualitatives', r.l.length>r.q.length,
   `${r.l.length} qualitatives contre ${r.q.length} quantitatives`);
ok('et elles lèvent réellement plus de facteurs que les quantitatives', r.levesL>r.levesQ,
   `${r.levesL} / ${r.levesQ}`);

// 2. chaque règle qualitative lève depuis une procédure qui la capte
r = await p.evaluate(()=>REGLES_FACTEUR.filter(x=>x.nature==='qualitatif')
  .map(x=>({code:x.code, src:x.srcLib, vue:x.srcVue, seuil:x.seuilLib,
            leves:candidatsRegle(x).length})));
for (const x of r) console.log(`       ${x.code.padEnd(14)} ${String(x.leves).padStart(2)} levé(s) · source « ${x.src} » · seuil : ${x.seuil}`);
ok('chaque règle qualitative nomme sa source et son seuil de pertinence',
   r.every(x=>x.src&&x.vue&&x.seuil), r.filter(x=>!x.src||!x.seuil).map(x=>x.code).join(',')||'toutes');
ok('elles remontent depuis des procédures différentes',
   new Set(r.map(x=>x.src)).size>=4, [...new Set(r.map(x=>x.src))].join(' · '));

// 3. le questionnaire est RÉSIDUEL
r = await p.evaluate(()=>({
  total:QUESTIONNAIRE.length, entite:QUEST_ENTITE.length, section:QUEST_SECTION.length,
  sansPourquoi:QUESTIONNAIRE.filter(q=>!q.pourquoi||q.pourquoi.length<40).map(q=>q.code),
  natures:[...new Set(QUESTIONNAIRE.map(q=>q.nat))],
  declares:FACTEURS.filter(f=>f.declare).length,
}));
ok('moins de dix questions par section', r.section<10, `${r.section} par section · ${r.entite} pour l’entité`);
ok('chacune porte la raison pour laquelle aucune autre source ne la couvre',
   r.sansPourquoi.length===0, r.sansPourquoi.join(',')||'toutes');
ok('les anciennes cases à cocher « déclarées » ont disparu', r.declares===0, `${r.declares} restante(s)`);
ok('les questions sont classées par nature de risque inhérent',
   r.natures.length>=4, r.natures.join(' · '));

// 4. une réponse « oui » CRÉE un facteur au registre, avec sa source
r = await p.evaluate(()=>{
  const av=registre().length;
  repondreQuestion(QUESTIONNAIRE.find(q=>q.code==='SI'),'CA','oui');
  sec('CA').questPrec.SI='Migration du logiciel de facturation en juillet 2025, reprise des en-cours à la main.';
  _regCache=null;
  const f=registre().find(x=>x.id==='QUEST:SI:CA');
  const niv=niveauCalcule(postesEnPerimetre().find(x=>x.code==='CA'),'exhaustivite');
  return { av, ap:registre().length, f:f&&{id:f.id,statut:f.statut,src:f.source.lib,nature:f.nature,
    cibles:f.cibles.map(c=>c.fsli+':'+c.assertions.join('/')), motif:f.description.length}, niv };
});
ok('une réponse « oui » crée un facteur au registre', r.ap===r.av+1 && !!r.f, r.f?r.f.id:'aucun');
ok('le facteur porte sa source et sa nature', r.f&&r.f.src&&r.f.nature==='qualitatif',
   r.f?`${r.f.src} · ${r.f.nature}`:'');
ok('il naît confirmé — la réponse EST la décision humaine', r.f&&r.f.statut==='confirme', r.f&&r.f.statut);
ok('il vise la section et l’assertion de la question', r.f&&r.f.cibles.join()==='CA:exhaustivite', r.f&&r.f.cibles.join());

// 5. une question d'entité touche tous les postes retenus
r = await p.evaluate(()=>{
  repondreQuestion(QUESTIONNAIRE.find(q=>q.code==='PRESSION'),undefined,'oui');
  S.questEntite.PRESSION.prec='Covenant de levier testé au 31/12 avec une marge de 0,2 point.';
  _regCache=null;
  const f=registre().find(x=>x.id==='QUEST:PRESSION');
  return { n:f?f.cibles.length:0, postes:postesEnPerimetre().length,
    assertion:f&&[...new Set(f.cibles.map(c=>c.assertions.join()))] };
});
ok('une question d’entité pose un facteur sur tous les postes retenus',
   r.n===r.postes, `${r.n} cibles pour ${r.postes} postes en périmètre`);
ok('sur une seule assertion, celle de la question', r.assertion&&r.assertion.length===1, r.assertion&&r.assertion.join());

// 6. un « oui » sans précision est incomplet et bloque le visa
r = await p.evaluate(()=>{
  repondreQuestion(QUESTIONNAIRE.find(q=>q.code==='LITIGE'),'STOCKS','oui');
  _regCache=null;
  const p0=postesEnPerimetre().find(x=>x.code==='STOCKS');
  const av=obstaclesVisa(p0).filter(x=>/précision/.test(x));
  sec('STOCKS').questPrec.LITIGE='Contentieux sur la qualité d’un lot livré en octobre, non provisionné.';
  _regCache=null;
  const ap=obstaclesVisa(p0).filter(x=>/précision/.test(x));
  return { av, ap };
});
ok('un « oui » sans précision écrite bloque le visa', r.av.length===1, r.av.join());
ok('la précision écrite lève l’obstacle', r.ap.length===0);

// 7. une question sans réponse bloque aussi : sinon le questionnaire est décoratif
r = await p.evaluate(()=>{
  const p0=postesEnPerimetre().find(x=>x.code==='TRESO');
  const av=obstaclesVisa(p0).filter(x=>/sans réponse/.test(x)).length;
  for (const q of QUEST_SECTION) repondreQuestion(q,'TRESO','non');
  for (const q of QUEST_ENTITE) if(!(S.questEntite[q.code]||{}).rep) repondreQuestion(q,undefined,'non');
  const ap=obstaclesVisa(p0).filter(x=>/sans réponse/.test(x)).length;
  return { av, ap };
});
ok('une question sans réponse est un obstacle au visa', r.av>0, `${r.av} obstacle(s)`);
ok('y répondre les lève tous', r.ap===0);

// 8. l'écran porte le questionnaire aux deux portées
r = await p.evaluate(()=>{
  aller('plan.facteurs','auditeur');
  document.querySelectorAll('#main details.pan').forEach(d=>d.open=true);
  const ent=document.getElementById('main').innerText.includes('Questionnaire d’entité');
  const nq=document.querySelectorAll('#main [data-qrep]').length;
  aller('fsli:CA','auditeur'); S.dest.CA='risque'; renderMain();
  document.querySelectorAll('#main details.repli').forEach(d=>d.open=true);
  const h=document.getElementById('main').innerText;
  return { ent, nq, sect:document.querySelectorAll('#main [data-qrep]').length,
    pourquoi:(h.match(/Pourquoi cette question existe encore/g)||[]).length };
});
ok('le questionnaire d’entité est au registre', r.ent && r.nq===4, `${r.nq} question(s)`);
ok('le questionnaire de section est dans la destination « risque »', r.sect===6, `${r.sect} question(s)`);
ok('chaque question affiche sa raison d’exister', r.pourquoi===6, `${r.pourquoi}/6`);


/* Le questionnaire vient de methodology/ : il porte sa source, son état de
   vérification, et — quand elle est connue — la condition de sa disparition. */
r = await p.evaluate(()=>{
  aller('plan.facteurs','auditeur');
  document.querySelectorAll('#main details.pan').forEach(d=>d.open=true);
  const l=[...document.querySelectorAll('#main .nl')].map(x=>x.textContent);
  const q=l.filter(t=>/Pourquoi cette question existe encore/.test(t));
  return { n:q.length,
    source:q.filter(t=>/Source : /.test(t)).length,
    unverified:q.filter(t=>/\[UNVERIFIED\]/.test(t)).length,
    effet:q.filter(t=>/Effet d’un « oui »/.test(t)).length,
    dispar:q.filter(t=>/disparaîtra quand/.test(t)).length,
    version:QUESTIONNAIRE_VERSION, dur:QUESTIONNAIRE.length };
});
ok('le questionnaire est versionné dans methodology/, pas écrit dans le prototype',
   typeof r.version==='string' && /^\d+\.\d+\.\d+$/.test(r.version) && r.dur>=8,
   `version ${r.version} · ${r.dur} questions`);
ok('chaque question dit d’où elle vient et que ce n’est PAS vérifié',
   r.n>0 && r.source===r.n && r.unverified===r.n, `${r.source}/${r.n} sourcées · ${r.unverified} [UNVERIFIED]`);
ok('chaque question dit ce qu’un « oui » change', r.effet===r.n, `${r.effet}/${r.n}`);
ok('celles dont la raison est datée disent quand elles disparaîtront', r.dispar>=1,
   `${r.dispar} question(s) à durée limitée`);

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
