/* Portail client : la DETTE d'abord — retard, puis proche, puis le reste,
   déjà déposé replié en bas. Filtres par domaine métier, statut, échéance. */
import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
let ko=0; const ok=(c,m)=>{ if(!c){ console.log('ÉCHEC —',m); ko++; } };
const errs=[], net=[];
const p = await (await b.newContext({viewport:{width:1400,height:1000}})).newPage();
p.on('pageerror',e=>errs.push(e.message));
p.on('request',r=>{ if(!r.url().startsWith('file://')) net.push(r.url()); });
await p.goto(cible(),{waitUntil:'networkidle'});
await p.evaluate(()=>aller('cli.vue','client'));
await p.waitForTimeout(150);

// A — l'ordre à l'écran est celui de la dette
const o = await p.evaluate(()=>{
  const rangs=[...document.querySelectorAll('#main .rangc')].map(x=>({
    titre:x.querySelector('b').textContent.trim(),
    replie:x.tagName==='DETAILS' ? !x.open : false,
    n:x.querySelectorAll('section.blk').length }));
  const ids=[...document.querySelectorAll('#main section.blk .num')].map(x=>x.textContent.trim());
  return { rangs, ids, etats:ids.map(id=>{
    const r=S.requetes.find(x=>x.id===id); return [id, rangClient(r), r.echeance]; }) };
});
console.log('rangs :', JSON.stringify(o.rangs));
console.log('ordre :', JSON.stringify(o.etats));
const ordreAttendu = ['retard','bientot','suite','fait'];
const rang = o.etats.map(x=>ordreAttendu.indexOf(x[1]));
ok(rang.every((v,i)=>i===0||rang[i-1]<=v), 'les demandes ne sont pas dans l’ordre de la dette');
ok(o.rangs.length>=2, 'au moins deux rangs attendus, ' + o.rangs.length);
const fait = o.rangs.find(x=>/Déjà déposées/.test(x.titre));
ok(!fait || fait.replie, 'le rang « déjà déposées » doit être REPLIÉ');
// à l'intérieur d'un rang, échéance croissante
for (const r of ordreAttendu){
  const e = o.etats.filter(x=>x[1]===r).map(x=>x[2]);
  ok(e.every((v,i)=>i===0||e[i-1]<=v), 'rang ' + r + ' : échéances non croissantes');
}

// A bis — aucun bouton qui n'agit sur rien
const morts = await p.evaluate(()=>{
  const b=[...document.querySelectorAll('#main [data-replis]')];
  return b.map(x=>({ cible:x.dataset.replis,
    n:document.querySelectorAll('[data-repli^="'+x.dataset.replis.split('|')[0]+'/"]').length }));
});
console.log('boutons de repli :', JSON.stringify(morts));
ok(morts.every(x=>x.n>0), 'le portail affiche un bouton de repli qui n’agit sur rien');

// B — la dette est chiffrée en tête
const dette = await p.evaluate(()=>{
  const c=document.querySelector('#main .callout');
  return { texte:c?c.textContent.replace(/\s+/g,' ').trim():'',
           attendus:S.requetes.filter(r=>!requeteSoldee(r))
             .reduce((a,r)=>a+elementsDus(r),0) };
});
console.log('dette :', JSON.stringify(dette));
ok(/reste \d+ document/.test(dette.texte) || /à jour/.test(dette.texte),
   'le portail doit s’ouvrir sur ce qui est dû : ' + dette.texte.slice(0,80));
ok(dette.texte.includes(String(dette.attendus)) || /à jour/.test(dette.texte),
   'le nombre de documents dus doit être celui du modèle (' + dette.attendus + ')');

// C — filtre par DOMAINE métier, jamais par code de section
const dom = await p.evaluate(()=>{
  const sel=document.getElementById('f-domaine');
  const opts=[...sel.options].map(o=>[o.value,o.textContent.trim()]);
  sel.value='ventes'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  const apres=[...document.querySelectorAll('#main section.blk .num')].map(x=>x.textContent.trim());
  const bons=apres.every(id=>domaineDe(S.requetes.find(r=>r.id===id).section)==='ventes');
  const s=document.getElementById('f-section');
  // le rendu a remplacé le DOM : on reprend l'élément courant, jamais l'ancien
  const sel2=document.getElementById('f-domaine');
  sel2.value=''; sel2.dispatchEvent(new Event('change',{bubbles:true}));
  return { opts, n:apres.length, bons, sectionPresente:!!s,
           reste:S.filtres.domaine };
});
console.log('domaine :', JSON.stringify(dom));
ok(!dom.sectionPresente, 'le portail client ne doit JAMAIS filtrer par code de section d’audit');
ok(dom.opts.every(([, lib]) => !/^[A-Z_]+$/.test(lib)), 'les domaines doivent porter un libellé métier');
ok(dom.n>0 && dom.bons, 'le filtre par domaine ne retient pas les bonnes demandes');
ok(dom.reste==='', 'le filtre par domaine n’a pas été remis à zéro');

// D — statut et échéance filtrent aussi
const f2 = await p.evaluate(()=>{
  const e=document.getElementById('f-echeance');
  e.value='retard'; e.dispatchEvent(new Event('change',{bubbles:true}));
  const ids=[...document.querySelectorAll('#main section.blk .num')].map(x=>x.textContent.trim());
  const tousEnRetard=ids.every(id=>retard(S.requetes.find(r=>r.id===id)));
  const e2=document.getElementById('f-echeance');
  e2.value=''; e2.dispatchEvent(new Event('change',{bubbles:true}));
  const s=document.getElementById('f-statut');
  const statuts=[...s.options].map(o=>o.value).filter(Boolean);
  const interdits=statuts.filter(k=>!STATUTS[k].client);
  return { n:ids.length, tousEnRetard, interdits };
});
console.log('échéance/statut :', JSON.stringify(f2));
ok(f2.n>0 && f2.tousEnRetard, 'le filtre « en retard » ne retient pas les bonnes demandes');
ok(f2.interdits.length===0, 'un statut interne est proposé au client : ' + f2.interdits.join(','));

// E — la règle des jours ouvrés du portail est unique et juste
const jo = await p.evaluate(()=>{
  const avant=S.portail.samediOuvre;
  S.portail.samediOuvre=true;
  const dim = ouvrePortail('2026-03-15'), sam = ouvrePortail('2026-03-14');
  S.portail.samediOuvre=false;
  const dim2 = ouvrePortail('2026-03-15'), sam2 = ouvrePortail('2026-03-14');
  S.portail.samediOuvre=avant;
  return { samediOuvert:[sam,dim], samediFerme:[sam2,dim2] };
});
console.log('jours ouvrés :', JSON.stringify(jo));
ok(jo.samediOuvert[0]===true && jo.samediOuvert[1]===false,
   'samedi ouvré : le samedi compte, le DIMANCHE jamais');
ok(jo.samediFerme[0]===false && jo.samediFerme[1]===false, 'samedi fermé : ni samedi ni dimanche');

console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau :', net.length?net.join(','):'aucun');
ok(errs.length===0,'erreurs page'); ok(net.length===0,'requête réseau');
console.log(ko?ko+' échec(s)':'portail : tout est vert');
await b.close();
process.exit(ko?1:0);
