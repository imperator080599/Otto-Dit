/* Les dates sont françaises PARTOUT, et refusent au lieu de deviner. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
let ko=0; const ok=(c,m)=>{ if(!c){ console.log('ÉCHEC —',m); ko++; } };
const errs=[];

// 0 — plus un seul type="date" dans le fichier livré
const src = fs.readFileSync(path.resolve(process.argv[2]),'utf8');
const natifs = (src.match(/type="date"/g) || []).length;
const dansCommentaire = (src.match(/`type="date"`|<input type="date">/g) || []).length;
console.log('type="date" dans le fichier :', natifs, '· dont cités en commentaire :', dansCommentaire);
ok(natifs === dansCommentaire, natifs - dansCommentaire + ' champ(s) de date natif(s) subsistent');

const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});

// 1 — toute date affichée est en JJ/MM/AAAA
const vues = ['plan.jalons','plan.programme','plan.equipe','pil.mission','plan.piste','ach.cloture','cli.vue'];
const mauvaises = [];
for (const v of vues){
  await p.evaluate(x=>aller(x), v);
  await p.waitForTimeout(80);
  const r = await p.evaluate(()=>{
    const champs=[...document.querySelectorAll('#main input.dt')].map(i=>i.value).filter(Boolean);
    const texte=document.getElementById('main').innerText;
    // AAAA-MM-JJ visible à l'écran, ou MM/JJ/AAAA impossible en français
    const iso=(texte.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[]);
    const us=champs.filter(x=>!/^\d{2}\/\d{2}\/\d{4}$/.test(x));
    return { champs:champs.length, iso, us };
  });
  if (r.iso.length || r.us.length) mauvaises.push([v, r.iso.slice(0,3), r.us.slice(0,3)]);
  console.log(`  ${v.padEnd(16)} ${r.champs} champ(s) de date`);
}
console.log('vues fautives :', JSON.stringify(mauvaises));
ok(mauvaises.length===0, 'date non formatée à l’écran : ' + JSON.stringify(mauvaises));

// 2 — le parseur : accepte le français, refuse l'impossible
const par = await p.evaluate(()=>({
  bon:  ['14/06/2026','1/2/2026','14.06.2026','29/02/2024'].map(isoDepuisFr),
  vide: isoDepuisFr(''),
  faux: ['31/02/2026','29/02/2025','32/01/2026','14/13/2026','2026-06-14','demain'].map(isoDepuisFr),
}));
console.log('parseur :', JSON.stringify(par));
ok(par.bon.join()==='2026-06-14,2026-02-01,2026-06-14,2024-02-29', 'dates valides mal lues');
ok(par.vide==='', 'un champ vide est une valeur, pas une erreur');
ok(par.faux.every(x=>x===null), 'une date impossible doit être REFUSÉE, pas devinée');

// 3 — une date impossible marque le champ et n'écrit rien
const refus = await p.evaluate(async ()=>{
  aller('plan.jalons','auditeur');
  const el=document.querySelector('#main input[data-jalon="final"]');
  const avant=S.jalons.final;
  el.value='31/02/2026';
  el.dispatchEvent(new Event('change',{bubbles:true}));
  const marque=document.querySelector('#main input[data-jalon="final"]');
  return { avant, apres:S.jalons.final, faux:marque.classList.contains('faux'),
           garde:marque.value, titre:marque.title };
});
console.log('refus :', JSON.stringify(refus));
ok(refus.avant===refus.apres, 'une date impossible a été écrite dans l’état');
ok(refus.faux, 'le champ fautif n’est pas marqué');
ok(refus.garde==='31/02/2026', 'la saisie fautive a été effacée — elle doit rester visible pour être corrigée');
ok(/JJ\/MM\/AAAA/.test(refus.titre), 'le champ ne dit pas le format attendu');

// 4 — une date valide s'applique, et se relit en français
const app = await p.evaluate(()=>{
  const el=document.querySelector('#main input[data-jalon="final"]');
  el.value='02/04/2026';
  el.dispatchEvent(new Event('change',{bubbles:true}));
  const apres=document.querySelector('#main input[data-jalon="final"]');
  return { etat:S.jalons.final, champ:apres.value, faux:apres.classList.contains('faux') };
});
console.log('application :', JSON.stringify(app));
ok(app.etat==='2026-04-02', 'le 2 avril doit être lu 2026-04-02, lu : ' + app.etat);
ok(app.champ==='02/04/2026', 'la relecture doit rester française : ' + app.champ);
ok(!app.faux, 'le champ reste marqué fautif après une date valide');

// 5 — l'échéance d'un travail, dans le tableau de 147 lignes
const tv = await p.evaluate(()=>{
  aller('plan.programme','auditeur');
  const el=document.querySelector('#main input[data-tech]');
  const code=el.dataset.tech;
  el.value='31/12/2026';
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return { code, ecrit:trav(code).echeance,
           relu:document.querySelector(`#main input[data-tech="${code}"]`).value };
});
console.log('échéance :', JSON.stringify(tv));
ok(tv.ecrit==='2026-12-31', 'échéance mal écrite : ' + tv.ecrit);
ok(tv.relu==='31/12/2026', 'échéance mal relue : ' + tv.relu);

console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
ok(errs.length===0,'erreurs page');
console.log(ko?ko+' échec(s)':'dates : tout est vert');
await b.close();
process.exit(ko?1:0);
