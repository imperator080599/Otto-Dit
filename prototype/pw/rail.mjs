/* Rail : partition par nature, un seul groupe déployé, « Mes travaux »,
   recherche et filtre sur les sections. Mesure + non-régressions. */
import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const F=cible();
let ko=0; const ok=(c,m)=>{ if(!c){ console.log('ÉCHEC —',m); ko++; } };
const errs=[]; const net=[];

// A — grand écran : ce qui est visible au premier écran du rail
const ctx = await b.newContext({viewport:{width:1500,height:900}});
let p = await ctx.newPage();
p.on('pageerror',e=>errs.push(e.message));
p.on('request',r=>{ if(!r.url().startsWith('file://')) net.push(r.url()); });
await p.goto(F,{waitUntil:'networkidle'});
await p.evaluate(()=>aller('plan.programme','auditeur'));
await p.waitForTimeout(150);
const grand = await p.evaluate(()=>{
  const r=document.getElementById('rail');
  const liens=[...r.querySelectorAll('a')].filter(a=>!a.hidden);
  const vp=window.innerHeight;
  const dans=x=>{const b=x.getBoundingClientRect(); return b.top>=0 && b.bottom<=vp && b.height>0;};
  const grp=[...r.querySelectorAll('.grp')];
  return { liens:liens.length, entetes:grp.length,
    destinationsVisibles:liens.filter(dans).length + grp.filter(dans).length,
    hauteur:Math.round(r.scrollHeight), fenetre:vp,
    ouverts:grp.filter(g=>g.getAttribute('aria-expanded')==='true').length,
    total:toutesDestinations().length,
    groupes:grp.map(g=>g.querySelector('.t').textContent.trim()
      + ' [' + g.querySelector('.n').textContent.trim() + ']') };
});
console.log('grand écran 1500×900 :', JSON.stringify(grand));
ok(grand.ouverts===1, 'un seul groupe doit être déployé, ' + grand.ouverts + ' le sont');
ok(grand.entetes===7, 'sept en-têtes de groupe attendus, ' + grand.entetes);
ok(grand.hauteur <= grand.fenetre, 'le rail dépasse la fenêtre : ' + grand.hauteur + ' px');
ok(grand.destinationsVisibles === grand.entetes + grand.liens,
   'tout le rail doit tenir au premier écran');

// B — un groupe à la fois, et le choix est mémorisé
const g2 = await p.evaluate(async ()=>{
  document.querySelector('[data-railg="achevement"]').click();
  const grp=[...document.querySelectorAll('#rail .grp')];
  const ouvert=grp.find(g=>g.getAttribute('aria-expanded')==='true');
  const avant = ouvert ? ouvert.dataset.railg : null;
  aller('plan.mat');                                  // on change de destination
  const grp2=[...document.querySelectorAll('#rail .grp')];
  const o2=grp2.find(g=>g.getAttribute('aria-expanded')==='true');
  return { avant, ouverts:grp.filter(g=>g.getAttribute('aria-expanded')==='true').length,
           apres:o2?o2.dataset.railg:null };
});
console.log('groupe :', JSON.stringify(g2));
ok(g2.avant==='achevement', 'cliquer un en-tête doit le déployer');
ok(g2.ouverts===1, 'un seul groupe déployé après clic, ' + g2.ouverts);
ok(g2.apres==='planif', 'aller à plan.mat doit déployer « Planification », pas ' + g2.apres);

// C — « Mes travaux » : présente hors portail, absente du portail
const moi = await p.evaluate(()=>{
  aller('plan.moi','auditeur');
  const a=document.querySelector('#rail a.moi');
  const h=document.querySelector('#main .hd h1').textContent;
  const blocs=[...document.querySelectorAll('#main .blk > header h2, #main details.blk summary h2')].map(x=>x.textContent.trim());
  const papier=document.querySelectorAll('#main [data-gopapier]').length;
  aller('cli.vue','client');
  const cli=document.querySelectorAll('#rail a.moi').length
          + [...document.querySelectorAll('#railm option')].filter(o=>o.value==='plan.moi').length;
  aller('plan.moi','auditeur');
  return { present:!!a, titre:h, blocs, papier, fuiteClient:cli };
});
console.log('mes travaux :', JSON.stringify(moi));
ok(moi.present, '« Mes travaux » doit être la première entrée du rail');
ok(/^Mes travaux/.test(moi.titre), 'la vue « Mes travaux » ne s’ouvre pas');
ok(moi.blocs.length>=3, 'quatre blocs attendus dans « Mes travaux », ' + moi.blocs.length);
ok(moi.papier>0, 'aucun lien direct « ouvrir le papier »');
ok(moi.fuiteClient===0, '« Mes travaux » ne doit JAMAIS apparaître dans le portail client');

// D — le lien « ouvrir le papier » ouvre bien la section SUR sa procédure
const pap = await p.evaluate(()=>{
  const btn=document.querySelector('#main [data-gopapier]');
  const cible=btn.dataset.gopapier;
  btn.click();
  return { cible, vue:S.vue, dest:S.dest[cible.split('|')[0]], proc:S.procOuverte };
});
console.log('papier :', JSON.stringify(pap));
ok(pap.vue==='fsli:'+pap.cible.split('|')[0], 'la section visée ne s’ouvre pas : ' + pap.vue);
ok(pap.dest==='plan', 'la destination « Procédures d’audit » n’est pas sélectionnée');
ok(pap.proc===pap.cible.replace('|','/'), 'la procédure n’est pas dépliée : ' + pap.proc);

// E — recherche et filtre : masquent sans re-rendre, le curseur reste
await p.evaluate(()=>{ aller('plan.mat','auditeur');
  document.querySelector('[data-railg="bilan"]').click(); });
await p.waitForTimeout(80);
await p.click('#rail-q');
await p.type('#rail-q', '411');
await p.waitForTimeout(80);
const rech = await p.evaluate(()=>{
  const lst=document.querySelector('#rail .lst');
  const vus=[...lst.querySelectorAll('a[data-vue^="fsli:"]')].filter(a=>!a.hidden).map(a=>a.dataset.vue);
  return { vus, focus:document.activeElement.id, valeur:document.querySelector('#rail-q').value,
           entete:document.querySelector('[data-railg="bilan"] .n').textContent.trim() };
});
console.log('recherche « 411 » :', JSON.stringify(rech));
ok(rech.focus==='rail-q', 'le curseur a quitté le champ de recherche (' + rech.focus + ')');
ok(rech.valeur==='411', 'la valeur saisie a été perdue');
ok(rech.vus.length===1 && rech.vus[0]==='fsli:CLIENTS',
   'la recherche par n° de compte doit isoler « Clients », vu : ' + rech.vus.join(','));
ok(/^1 \/ \d+$/.test(rech.entete), 'le compteur du groupe doit dire « x / y » : ' + rech.entete);

const filtre = await p.evaluate(()=>{
  document.querySelector('#rail-q').value=''; S.railQ=''; appliquerFiltreRail();
  const f=document.querySelector('#rail-f'); f.value='hors';
  f.dispatchEvent(new Event('change',{bubbles:true}));
  const lst=document.querySelector('#rail .lst');
  return { hors:[...lst.querySelectorAll('a[data-vue^="fsli:"]')].filter(a=>!a.hidden).length,
           options:[...f.options].map(o=>o.value) };
});
console.log('filtre :', JSON.stringify(filtre));
ok(filtre.options.includes('hors'), 'le filtre doit pouvoir montrer les sections HORS périmètre');
ok(filtre.hors>=1, 'un poste sorti du périmètre doit rester atteignable depuis le rail');
await p.evaluate(()=>{ S.railFiltre=''; render(); });

// F — téléphone 390 px
await p.close();
const ctxm = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
p = await ctxm.newPage();
p.on('pageerror',e=>errs.push(e.message));
await p.goto(F,{waitUntil:'networkidle'});
await p.evaluate(()=>aller('plan.programme','auditeur'));
await p.waitForTimeout(150);
const tel = await p.evaluate(()=>{
  const r=document.getElementById('rail');
  r.style.display='block'; r.style.maxHeight='none';
  const h=Math.round(r.getBoundingClientRect().height);
  r.style.display=''; r.style.maxHeight='';
  return { affiche:getComputedStyle(r).display, hauteurSiAffiche:h,
           menu:!!document.getElementById('railm'),
           options:document.getElementById('railm').options.length,
           destinations:toutesDestinations().length };
});
console.log('téléphone 390 px :', JSON.stringify(tel));
ok(tel.affiche==='none', 'à 390 px le rail doit céder la place au sélecteur');
ok(tel.hauteurSiAffiche < 700, 'rail trop haut à 390 px : ' + tel.hauteurSiAffiche + ' px');
ok(tel.options===tel.destinations, 'le sélecteur mobile doit porter TOUTES les destinations : '
   + tel.options + ' / ' + tel.destinations);

console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau :', net.length?net.join(','):'aucun');
ok(errs.length===0,'erreurs page'); ok(net.length===0,'requête réseau');
console.log(ko?ko+' échec(s)':'rail : tout est vert');
await b.close();
process.exit(ko?1:0);
