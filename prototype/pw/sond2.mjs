import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// l'intervalle trop large est dit, et la taille adéquate est une division
let r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA'), pr=PROCEDURES.find(x=>x.code==='DETAIL');
  proc('CA','DETAIL').methode='sum'; proc('CA','DETAIL').taille=null; _echProcCache.clear();
  const e = echantillonProc(p0,pr);
  S.dest.CA='plan'; S.procOuverte='CA/DETAIL'; aller('fsli:CA','auditeur');
  const h = document.querySelector('#main').innerHTML;
  return { large:e.intervalleLarge, interv:e.intervalle, pm:e.strate, nAd:e.nAdequate,
    masse:e.pop.masse, items:e.pop.items.length,
    dit:h.includes('dépasse le seuil de planification'),
    arith:h.includes('arithmétique de la mission'),
    btn:!!document.querySelector('[data-ptaillen]') };
});
ok('un intervalle plus large que le seuil est signalé', r.large&&r.dit,
   `intervalle ${(r.interv/100).toFixed(0)} € vs seuil ${(r.pm/100).toFixed(0)} €`);
ok('la taille adéquate est masse ÷ seuil', r.nAd===Math.ceil(r.masse/r.pm), `${r.nAd} éléments`);
ok('le cas « aucune méthode ne convient » est nommé pour ce qu’il est', r.arith);

// porter la taille à la valeur adéquate ramène l'intervalle sous le seuil
r = await p.evaluate(()=>{
  document.querySelector('[data-ptaillen]').click();
  const e = echantillonProc(postesCalcules().find(x=>x.code==='CA'),PROCEDURES.find(x=>x.code==='DETAIL'));
  return { n:e.n, interv:e.intervalle, pm:e.strate, large:e.intervalleLarge,
    ret:e.retenus.length, couv:e.taux, items:e.pop.items.length, dOffice:e.exhaustif.length };
});
ok('porter la taille ramène l’intervalle au seuil', !r.large&&r.interv<=r.pm,
   `n=${r.n} → intervalle ${(r.interv/100).toFixed(0)} € ≤ ${(r.pm/100).toFixed(0)} €`);
console.log(`     à taille adéquate : ${r.ret} éléments retenus sur ${r.items} (${(r.couv*100).toFixed(1)} % de la masse), dont ${r.dOffice} d’office`);

// la taille imposée est bien par procédure, et revient à la règle si on l'efface
r = await p.evaluate(()=>{
  const a = echantillonProc(postesCalcules().find(x=>x.code==='CA'),PROCEDURES.find(x=>x.code==='CUTOFF')).n;
  proc('CA','DETAIL').taille=null; _echProcCache.clear();
  const b = echantillonProc(postesCalcules().find(x=>x.code==='CA'),PROCEDURES.find(x=>x.code==='DETAIL'));
  return { autre:a, revenu:b.n, regle:b.nRegle };
});
ok('la taille imposée ne déborde pas sur les autres procédures', r.autre===15, `CUTOFF n=${r.autre}`);
ok('effacer la taille imposée rend la règle de risque', r.revenu===r.regle, `n=${r.revenu}`);

// le rapport d'impact et les versions continuent de fonctionner
r = await p.evaluate(()=>{ const i=impact(2,3); return { ech:i.echantillons.length, ok:!!i }; });
ok('le rapport d’impact fonctionne toujours', r.ok, `${r.ech} sélections modifiées v2→v3`);

console.log('erreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
await b.close();
