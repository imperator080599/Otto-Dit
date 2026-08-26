import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});
const r = await p.evaluate(()=>{
  // relever toutes les valeurs sur toutes les procédures, sans rien résoudre
  for (const p0 of postesEnPerimetre()) for (const pr of proceduresRequises(p0)){
    if (!pr.ech) continue;
    requeteJustificatifsProc(p0,pr);
    const docs = docsAttendusProc(p0,pr).length||1;
    for (const q of S.requetes.filter(x=>x.section===p0.code&&x.proc===pr.code))
      for (const it of q.items) for (let k=0;k<docs;k++) deposer(q.id,it.id);
    for (const c of controles(p0,pr)){
      if (etatControle(c)!=='recue') continue;
      const v = c.ch.val(c.ligne.x);
      c.ligne.champs[c.cle] = c.ch.type==='montant'?(v/100).toFixed(2).replace('.',','):c.ch.type==='bool'?(v?'oui':'non'):String(v);
    }
  }
  const a = anomalies(), ret = a.filter(x=>!x.souSeuil);
  const d = doublesCumul();
  return { total:a.length, retenues:ret.length, cumul:ret.reduce((t,x)=>t+x.montant,0),
    M:seuils().M, doubles:d.length, doublesMt:d.reduce((t,x)=>t+x.montant,0),
    pieces:d.map(x=>x.piece+' ×'+x.comptees) };
});
console.log(r);
await p.evaluate(()=>aller('plan.synth','auditeur'));
const h = await p.evaluate(()=>document.querySelector('#main').innerHTML);
console.log('bandeau doublons affiché :', h.includes('comptée(s) plusieurs fois'));
console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
await b.close();
