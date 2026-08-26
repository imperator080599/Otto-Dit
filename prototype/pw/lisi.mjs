import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// a) la section s'ouvre sur son plan de travail
await p.evaluate(()=>aller('fsli:CA','auditeur'));
await p.waitForTimeout(120);
let r = await p.evaluate(()=>({
  dest: document.querySelector('.destnav .dest.on')?.textContent.trim(),
  titre: document.querySelector('#main .blk header h2')?.textContent.trim(),
  nDest: document.querySelectorAll('.destnav .dest').length,
}));
ok('a) la section atterrit sur le plan de travail', /Procédures d’audit/.test(r.dest||'')&&/Procédures d’audit/.test(r.titre||''), r.dest+' / '+r.titre);
ok('b) six destinations dans la navigation interne', r.nDest===6, String(r.nDest));

// b) une seule destination affichée à la fois
r = await p.evaluate(()=>document.querySelectorAll('#main .blk').length);
ok('b) une seule destination affichée', r===1, r+' bloc(s)');

// d) bandeau permanent : les cellules de section, pas celles de la mission
r = await p.evaluate(()=>{
  const c=[...document.querySelectorAll('#impact .c .k .lg')].map(e=>e.textContent);
  const top=document.querySelector('.top').getBoundingClientRect();
  return { c, colle:getComputedStyle(document.querySelector('.top')).position, h:Math.round(top.height) };
});
const attendu=['poste','risque retenu','solde / planification','obstacles au visa','visa',
  'justificatifs attendus','reçus','contrôles traités','écarts à expliquer'];
ok('d) le bandeau porte l’état de la section', attendu.every(x=>r.c.includes(x)), r.c.join(' · '));
ok('d) il est collant et ne grandit pas', r.colle==='sticky'&&r.h<=300, `${r.colle}, ${r.h} px`);

// le bandeau reste identique depuis n'importe quelle destination
r = await p.evaluate(()=>{
  const lu=()=>[...document.querySelectorAll('#impact .c .k .lg')].map(e=>e.textContent).join('|');
  const out={};
  for (const d of ['comptes','risque','plan','requetes','notes','concl']){
    S.dest.CA=d; renderImpact(); renderMain(); out[d]=lu();
  }
  return Object.values(out).every(x=>x===Object.values(out)[0]);
});
ok('d) le même bandeau depuis les six destinations', r);

// la première chose de la vue n'est jamais cachée par la barre collante
r = await p.evaluate(()=>{
  const out=[];
  for (const v of ['fsli:CA','plan.je','plan.versions','pil.mission','cli.vue']){
    S.espace = v.startsWith('cli.')?'client':v.startsWith('pil.')?'pilotage':'auditeur';
    aller(v);
    const top=document.querySelector('.top').getBoundingClientRect();
    const prem=document.querySelector('#main > *:not(script)')?.getBoundingClientRect();
    out.push({ v, ok: prem ? prem.top >= top.bottom - 1 : true, y:Math.round(window.scrollY) });
  }
  S.espace='auditeur'; aller('fsli:CA');
  return out;
});
ok('à l’arrivée, rien n’est caché sous la barre collante', r.every(x=>x.ok),
   r.map(x=>x.v+(x.ok?'':' ✗')).join(' · '));

// c) une procédure ouverte REMPLACE le plan, avec fil d'Ariane
r = await p.evaluate(()=>{
  S.dest.CA='plan'; renderMain();
  const btn=document.querySelector('[data-proc="CA/DETAIL"]');
  btn.click();
  return { ariane:!!document.querySelector('.ariane'),
    plan:!!document.querySelector('[data-repli$="/plan/procedures"]'),
    titre:document.querySelector('.ariane b')?.textContent.trim(),
    retour:!!document.querySelector('.ariane [data-dest="CA|plan"]') };
});
ok('c) la procédure remplace le plan de travail', r.ariane&&!r.plan, r.titre||'');
ok('c) un fil d’Ariane ramène au plan', r.retour);
r = await p.evaluate(()=>{ document.querySelector('.ariane [data-dest="CA|plan"]').click();
  return { plan:!!document.querySelector('[data-repli$="/plan/procedures"]'), ariane:!!document.querySelector('.ariane') }; });
ok('c) le retour rétablit le plan', r.plan&&!r.ariane);

// e) l'ouverture par défaut suit ce qui demande attention
r = await p.evaluate(()=>{
  S.replis={}; S.dest.CA='risque'; renderMain();
  const p0=postesCalcules().find(x=>x.code==='CA');
  const l=[...document.querySelectorAll('.repli')].map(e=>({k:e.dataset.repli.split('/').pop(),o:e.open}));
  // Ce qui demande attention dans chaque repli de la destination « risque ».
  const porte = {
    facteurs:facteursProposes('CA').length,
    assertions:ASSERTIONS.filter(a=>sec('CA').override[a.code]&&!(sec('CA').overrideMotif[a.code]||'').trim()).length,
    questionnaire:questionsSansReponse('CA').section.length
      + facteursQuestionnaire().filter(f=>f.incomplet&&f.cibles.some(c=>c.fsli==='CA')).length,
    etendue:0,
  };
  const att={}; for (const d of ['comptes','risque','plan','requetes','notes','concl']) att[d]=attentionDest(postesCalcules().find(x=>x.code==='CA'),d);
  return { l, att, porte };
});
// Les replis ouverts sont EXACTEMENT ceux qui portent quelque chose à traiter,
// ni plus ni moins. Il y en avait un ; le questionnaire résiduel en ajoute un
// second tant qu'il n'a pas de réponse. La règle n'a pas changé, le dossier si.
ok('e) sur « risque », les replis ouverts sont exactement ceux qui portent un obstacle',
   r.l.every(x=>x.o === (r.porte[x.k] > 0)),
   r.l.map(x=>x.k+(x.o?'▾':'▸')+'('+r.porte[x.k]+')').join(' '));
console.log('     attention par destination :', Object.entries(r.att).map(([k,v])=>k+':'+v).join(' · '));

// e) l'état que je change est mémorisé, par section
r = await p.evaluate(()=>{
  const el=document.querySelector('[data-repli="CA/risque/etendue"]');
  el.open=true; el.dispatchEvent(new Event('toggle'));
  const memo=S.replis['CA/risque/etendue'];
  aller('fsli:CLIENTS','auditeur'); S.dest.CLIENTS='risque'; renderMain();
  const autre=document.querySelector('[data-repli="CLIENTS/risque/etendue"]')?.open;
  aller('fsli:CA','auditeur'); S.dest.CA='risque'; renderMain();
  const revenu=document.querySelector('[data-repli="CA/risque/etendue"]')?.open;
  return { memo, autre, revenu };
});
ok('e) le repli que j’ouvre est mémorisé', r.memo===true&&r.revenu===true);
ok('e) la mémoire est par section, pas globale', r.autre===false);

// f) tout déplier / tout replier
r = await p.evaluate(()=>{
  document.querySelector('[data-replis="CA/risque|1"]').click();
  const tous=[...document.querySelectorAll('.repli')].every(e=>e.open);
  document.querySelector('[data-replis="CA/risque|0"]').click();
  const aucun=[...document.querySelectorAll('.repli')].every(e=>!e.open);
  return { tous, aucun };
});
ok('f) tout déplier et tout replier fonctionnent', r.tous&&r.aucun);

// hauteur : avant / après
r = await p.evaluate(()=>{ S.replis={}; S.dest={}; S.procOuverte=null; aller('fsli:CA','auditeur');
  return { doc:document.documentElement.scrollHeight, main:document.getElementById('main').scrollHeight }; });
console.log(`     hauteur section CA à l’atterrissage : page ${r.doc} px · contenu ${r.main} px`);

console.log('\nerreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
console.log('réseau  :', net.length?net.join(','):'aucun');
await b.close();
