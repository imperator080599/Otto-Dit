import { chromium, devices } from 'playwright';
import { NAV, cible } from './_nav.mjs';
import fs from 'fs';
const F=cible();
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(F,{waitUntil:'networkidle'});

// ── A. arithmétique de tous les pieds de tableau, sur TOUTES les vues ──────
const footAll = async () => p.evaluate(() => {
  const num = t => { const m = t.replace(/[\s ]/g,'').replace(/€|%/g,'').replace(/−/g,'-').replace(',','.');
                     return /^-?\d+(\.\d+)?$/.test(m) ? Math.round(parseFloat(m)*100) : null; };
  const expand = tr => { const a=[]; for (const c of tr.children){ const n=c.colSpan||1;
                          for(let k=0;k<n;k++) a.push(k===0?c:null); } return a; };
  const out=[];
  document.querySelectorAll('#main table').forEach(tb=>{
    const foot = tb.querySelector('tfoot tr'); if(!foot) return;
    const F = expand(foot), body=[...tb.querySelectorAll('tbody tr')].map(expand);
    F.forEach((td,ci)=>{ if(!td||(td.colSpan||1)>1) return;
      const f=num(td.textContent); if(f===null) return;
      let sum=0,n=0,bad=false;
      for(const row of body){ const c=row[ci]; if(c===undefined){bad=true;break;} if(c===null) continue;
        const inp=c.querySelector('input'); const v=num(inp?inp.value:c.textContent);
        if(v===null){ const t=c.textContent.trim(); if(t!=='—'&&t!==''){bad=true;break;} } else {sum+=v;n++;} }
      if(bad||n===0) return;
      out.push({ ci, foot:f/100, sum:sum/100, ok:f===sum });
    });
  });
  return out;
});
let nFoot=0, bad=[];
const vues = await p.evaluate(()=>{
  const v=new Set();
  for (const e of ESPACES){ S.espace=e.id; for (const g of railItems()) for (const it of g.items) v.add(it.id); }
  S.espace='auditeur'; return [...v];});
for (const v of ['plan.rappro','plan.mat','plan.scope','plan.ra','plan.je','plan.circ','plan.synth','plan.piste','plan.principes','plan.programme','plan.donnees',
                 'fsli:CA','fsli:CLIENTS','fsli:TRESO','fsli:ACHATS','fsli:PERSONNEL','fsli:STOCKS','fsli:FOURN',
                 'ach.pointage','ach.ra','ach.anomalies','ach.cloture']){
  await p.evaluate(x=>aller(x), v); await p.waitForTimeout(50);
  const r = await footAll(); nFoot += r.length; bad.push(...r.filter(x=>!x.ok).map(x=>({v,...x})));
}
console.log(`A. pieds de tableau vérifiés : ${nFoot} — faux : ${bad.length}`);
bad.forEach(x=>console.log('   ✗', x.v, 'col', x.ci, x.foot, '≠', x.sum));

// ── B. générateur, balance, seuils ────────────────────────────────────────
console.log('\nB. ' + await p.evaluate(() => {
  const L=lg(), s=seuils(), bb=bm()[S.benchmark];
  let d=0,c=0,unbal=0;
  for(const e of L.entries){let ed=0,ec=0;for(const l of e.lines){ed+=l.debit;ec+=l.credit;}if(ed!==ec)unbal++;d+=ed;c+=ec;}
  const T=tb(); const tot=T.reduce((a,x)=>({d:a.d+x[2],c:a.c+x[3]}),{d:0,c:0});
  const gl=Object.fromEntries(glBal().map(a=>[a.compte,a.debit-a.credit]));
  const ecarts=[]; const cpts=new Set([...T.map(t=>t[0]),...Object.keys(gl)]);
  for(const cpt of cpts){const t=T.find(x=>x[0]===cpt);const sTB=t?t[2]-t[3]:0;const g=gl[cpt]||0;if(g!==sTB)ecarts.push([cpt,(sTB-g)/100]);}
  const attM=Math.floor(Math.round(bb.val*S.pctM/100)/100000)*100000;
  return [`${L.entries.length} écritures / ${L.entries.reduce((a,e)=>a+e.lines.length,0)} lignes — ${unbal} déséquilibrée(s)`,
    `grand livre : débit ${d/100} = crédit ${c/100} → ${d===c}`,
    `balance client (v${S.version}) : débit ${tot.d/100} = crédit ${tot.c/100} → ${tot.d===tot.c}`,
    `écarts balance/grand livre : ${JSON.stringify(ecarts)}`,
    `M = ${s.M/100} → ${s.M===attM} ; SP = ${s.PM/100} → ${s.PM===Math.floor(Math.round(s.M*S.pctPM/100)/100000)*100000}`,
    `seuil de remontée = ${s.CTT/100} → ${s.CTT===Math.floor(Math.round(s.M*S.pctCTT/100)/10000)*10000}`].join('\n   ');
}));

// ── C. citations littérales ───────────────────────────────────────────────
const src = fs.readFileSync('/home/user/Otto-Dit/docs/00_FOUNDER_IDEAS.md','utf8');
const norm = t => t.replace(/[’']/g,"'").replace(/[«»"”“]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const SRC = norm(src);
let nq=0, kq=0, mauvaises=[];
for (const v of vues){
  await p.evaluate(x=>{ S.espace = x.startsWith('cli.')?'client':x.startsWith('pil.')?'pilotage':'auditeur'; aller(x); }, v);
  await p.waitForTimeout(40);
  const qs = await p.evaluate(()=>[...document.querySelectorAll('blockquote.idea')].map(q=>q.firstChild.textContent));
  for (const q of qs){
    const parts = q.split(/·|\[…\]|\[\.\.\.\]/).map(norm).map(x=>x.replace(/^«\s*/,'').replace(/\s*»$/,'')).filter(x=>x.length>12);
    for (const seg of parts){ nq++; if (SRC.includes(seg)) kq++; else mauvaises.push(v+' : « '+seg.slice(0,90)+' »'); }
  }
}
console.log(`\nC. segments de citation : ${kq}/${nq} littéraux`);
mauvaises.forEach(x=>console.log('   ✗', x));

// ── D. glyphes ────────────────────────────────────────────────────────────
console.log('\nD. ' + await p.evaluate(()=>{
  const set=new Set([...document.body.innerText].filter(c=>c.codePointAt(0)>126));
  const cvs=document.createElement('canvas'); cvs.width=48; cvs.height=48;
  const cv=cvs.getContext('2d',{willReadFrequently:true});
  const draw=(c,f)=>{cv.clearRect(0,0,48,48);cv.font='32px '+f;cv.fillStyle='#000';cv.fillText(c,4,36);
                     return cv.getImageData(0,0,48,48).data.join(',');};
  const fams=[getComputedStyle(document.body).fontFamily, getComputedStyle(document.querySelector('.mono')||document.body).fontFamily];
  const manq=[];
  for(const f of fams){ const tofu=draw('￿',f), vide=draw(' ',f);
    for(const c of set){ if(/\s/.test(c)) continue; const d=draw(c,f);
      if(d===tofu||d===vide) manq.push(c+' U+'+c.codePointAt(0).toString(16).toUpperCase()); } }
  return `caractères non-ASCII : ${set.size} · U+FFFD présent : ${document.body.innerText.includes('�')} · glyphes absents : ${manq.length?[...new Set(manq)].join(', '):'aucun'}`;
}));

console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune', '| réseau hors fichier :', net.length?net.join(','):'aucun');
await b.close();
