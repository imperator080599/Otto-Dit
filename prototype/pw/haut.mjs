import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
await p.goto(cible(),{waitUntil:'networkidle'});
const vues = process.argv[3] ? process.argv[3].split(',') : ['fsli:CA','fsli:CLIENTS','pil.avance','pil.mission','cli.vue','ach.cloture','plan.donnees','plan.je','plan.programme','plan.versions','plan.ajust'];
for (const v of vues){
  await p.evaluate(x=>{ S.espace = x.startsWith('cli.')?'client':x.startsWith('pil.')?'pilotage':'auditeur'; aller(x); }, v);
  await p.waitForTimeout(120);
  const r = await p.evaluate(()=>({
    doc: document.documentElement.scrollHeight,
    main: document.getElementById('main')?.scrollHeight || 0,
    ecrans: Math.round((document.getElementById('main')?.scrollHeight || 0) / window.innerHeight * 10)/10,
  }));
  console.log(`${v.padEnd(16)} page ${String(r.doc).padStart(6)} px · contenu ${String(r.main).padStart(6)} px · ${r.ecrans} écrans de téléphone`);
}
await b.close();
