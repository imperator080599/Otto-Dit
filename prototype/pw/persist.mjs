/* La persistance : un rafraîchissement accidentel ne doit plus rien coûter. */
import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
let ko=0; const ok=(c,m)=>{ if(!c){ console.log('ÉCHEC —',m); ko++; } };
const F = cible();
const errs=[], net=[];
const ctx = await b.newContext({viewport:{width:1500,height:1000}});
const p = await ctx.newPage();
p.on('pageerror',e=>errs.push(e.message));
p.on('request',r=>{ if(!r.url().startsWith('file://')) net.push(r.url()); });
await p.goto(F,{waitUntil:'networkidle'});

// 1 — l'indicateur et le bouton existent, hors du flux du dossier
const ind = await p.evaluate(()=>{
  const el=document.getElementById('sauvegarde');
  return { present:!!el, raz:!!document.getElementById('raz-etat'),
           position:el?getComputedStyle(el).position:'' };
});
console.log('indicateur :', JSON.stringify(ind));
ok(ind.present && ind.raz, 'indicateur ou bouton « repartir de zéro » absent');
ok(ind.position==='fixed', 'l’indicateur doit être fixe, hors du flux du dossier');

// 2 — quatre gestes de natures différentes, dont un qui ne re-rend rien
const CODE = await p.evaluate(async ()=>{
  aller('plan.mat','auditeur');
  const bm=document.getElementById('bm'); bm.value='ca'; bm.dispatchEvent(new Event('input',{bubbles:true}));
  aller('plan.jalons','auditeur');
  const j=document.querySelector('#main input[data-jalon="rapport"]');
  j.value='30/04/2026'; j.dispatchEvent(new Event('change',{bubbles:true}));
  aller('plan.programme','auditeur');
  const t=document.querySelector('#main input[data-tech]');
  const code=t.dataset.tech; t.value='31/12/2026'; t.dispatchEvent(new Event('change',{bubbles:true}));
  // un geste qui ne re-rend RIEN : le germe d'une sélection
  aller('fsli:CA','auditeur'); S.dest.CA='plan'; S.procOuverte='CA/DETAIL'; renderMain();
  const g=document.querySelector('#main [data-pseed]');
  if (g){ g.value='germe-de-demonstration'; g.dispatchEvent(new Event('input',{bubbles:true})); }
  aller('plan.moi','auditeur');
  await new Promise(r=>setTimeout(r,1400));
  return code;
});
const avant = await p.evaluate(c=>({
  bench:S.benchmark, rapport:S.jalons.rapport, ech:trav(c).echeance,
  germe:proc('CA','DETAIL').seed, vue:S.vue,
  ecrit:!!localStorage.getItem('otto.prototype.etat'),
  ko:Math.round((localStorage.getItem('otto.prototype.etat')||'').length/1024),
  dit:document.getElementById('sauvegarde').innerText.replace(/\s+/g,' ').trim(),
}), CODE);
console.log('avant rechargement :', JSON.stringify(avant));
ok(avant.ecrit, 'rien n’a été écrit dans localStorage');
ok(/enregistré/.test(avant.dit), 'l’indicateur ne dit pas que c’est enregistré : ' + avant.dit);
ok(avant.germe==='germe-de-demonstration', 'le germe n’a pas été posé — le harnais ne teste rien');

// 3 — RECHARGEMENT : tout doit revenir
await p.reload({waitUntil:'networkidle'});
const apres = await p.evaluate(c=>({
  bench:S.benchmark, rapport:S.jalons.rapport, ech:trav(c).echeance,
  germe:proc('CA','DETAIL').seed, vue:S.vue,
  dit:document.getElementById('sauvegarde').innerText.replace(/\s+/g,' ').trim(),
  titre:document.querySelector('#main .hd h1').textContent.trim(),
}), CODE);
console.log('après rechargement :', JSON.stringify(apres));
ok(apres.bench===avant.bench, 'la référence de matérialité n’a pas survécu');
ok(apres.rapport==='2026-04-30', 'le jalon n’a pas survécu : ' + apres.rapport);
ok(apres.ech==='2026-12-31', 'l’échéance écrite n’a pas survécu : ' + apres.ech);
ok(apres.germe==='germe-de-demonstration', 'un geste qui ne re-rend rien a été perdu : ' + apres.germe);
ok(apres.vue===avant.vue, 'on ne revient pas sur l’écran qu’on regardait : ' + apres.vue);

// 4 — les dérivés sont recalculés, pas restitués périmés
const der = await p.evaluate(()=>{
  const s=seuils();
  return { bench:S.benchmark, M:s.M, refLib:s.bench.lib,
           postes:postesCalcules().length, travaux:travaux().length };
});
console.log('dérivés :', JSON.stringify(der));
ok(der.postes>0 && der.travaux>0, 'les caches dérivés ne se sont pas reconstruits');
ok(/affaires/i.test(der.refLib), 'le seuil n’a pas été recalculé sur la référence restaurée : ' + der.refLib);

// 5 — « repartir de zéro » efface et rend l'amorce
p.once('dialog', d=>d.accept());
await Promise.all([
  p.waitForNavigation({ waitUntil:'networkidle' }),
  p.click('#raz-etat'),
]);
const zero = await p.evaluate(c=>({
  bench:S.benchmark, rapport:S.jalons.rapport, ech:trav(c).echeance,
  reste:localStorage.getItem('otto.prototype.etat')===null,
}), CODE);
console.log('après remise à zéro :', JSON.stringify(zero));
ok(zero.bench==='pbt', 'la remise à zéro n’a pas rendu la référence d’amorce : ' + zero.bench);
ok(zero.rapport==='2026-04-15', 'la remise à zéro n’a pas rendu les jalons d’amorce');
ok(zero.ech!=='2026-12-31', 'la remise à zéro n’a pas rendu l’échéance déduite');

/* 6 — un instantané d'une AUTRE version est écarté, et l'écran le dit.
      Il est semé AVANT le script de la page : le semer puis recharger le
      ferait écraser par la dernière sauvegarde de la page sortante. */
const p3 = await ctx.newPage();
await p3.addInitScript(()=>{
  try { localStorage.setItem('otto.prototype.etat',
    JSON.stringify({ schema:99, cles:'autre', horloge:'2020-01-01T00:00', s:{ benchmark:'ca' } })); } catch {}
});
const errs3=[]; p3.on('pageerror',e=>errs3.push(e.message));
await p3.goto(F,{waitUntil:'networkidle'});
const ec = await p3.evaluate(()=>({
  bench:S.benchmark, efface:localStorage.getItem('otto.prototype.etat')===null,
  dit:document.getElementById('sauvegarde').innerText.replace(/\s+/g,' ').trim(),
}));
console.log('instantané étranger :', JSON.stringify(ec));
ok(ec.bench==='pbt', 'un instantané d’une autre version a été chargé — le dossier serait à moitié cohérent');
ok(ec.efface, 'l’instantané écarté n’a pas été effacé : il reviendrait au rechargement suivant');
ok(/autre version/.test(ec.dit), 'l’écran ne dit pas que l’instantané a été écarté : ' + ec.dit);
ok(errs3.length===0, 'un instantané étranger fait tomber la page : ' + errs3.join(' | '));
await p3.close();

// 7 — stockage refusé : le prototype MARCHE, et le dit
const p2 = await ctx.newPage();
await p2.addInitScript(()=>{
  Object.defineProperty(window, 'localStorage', {
    configurable:true,
    get(){ throw new DOMException('refusé', 'SecurityError'); },
  });
});
const errs2=[]; p2.on('pageerror',e=>errs2.push(e.message));
await p2.goto(F,{waitUntil:'networkidle'});
const sans = await p2.evaluate(async ()=>{
  const bm=document.getElementById('bm');
  if (bm){ bm.value='ca'; bm.dispatchEvent(new Event('input',{bubbles:true})); }
  await new Promise(r=>setTimeout(r,1200));
  return { rend:!!document.querySelector('#main .hd h1'),
           bench:S.benchmark,
           dit:document.getElementById('sauvegarde').innerText.replace(/\s+/g,' ').trim() };
});
console.log('stockage refusé :', JSON.stringify(sans), '· erreurs :', errs2.length?errs2.join(' | '):'aucune');
ok(sans.rend && errs2.length===0, 'le prototype tombe quand le stockage est refusé');
ok(/NON ENREGISTRÉ/.test(sans.dit), 'le refus de stockage doit être DIT, pas tu : ' + sans.dit);
await p2.close();

console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau :', net.length?net.join(','):'aucun');
ok(errs.length===0,'erreurs page'); ok(net.length===0,'requête réseau');
console.log(ko?ko+' échec(s)':'persistance : tout est vert');
await b.close();
process.exit(ko?1:0);
