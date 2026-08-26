import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const errs=[];
for (const theme of ['clair','sombre']){
  for (const [w,h,mob] of [[1600,1100,false],[390,844,true]]){
    const ctx = await b.newContext({viewport:{width:w,height:h},isMobile:mob,hasTouch:mob});
    const p = await ctx.newPage();
    p.on('pageerror',e=>errs.push(`${theme}/${w}: ${e.message}`));
    p.on('console',m=>{if(m.type()==='error')errs.push(`${theme}/${w}: ${m.text()}`);});
    await p.goto(cible(),{waitUntil:'networkidle'});
    await p.evaluate(x=>document.documentElement.dataset.theme=x, theme==='sombre'?'dark':'light');
    const applique = await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    const vues = await p.evaluate(()=>toutesDestinations());
    let over=0; const faibles = new Set();
    for (const v of vues){
      await p.evaluate(x=>aller(x), v);
      await p.waitForTimeout(30);
      const r = await p.evaluate(()=>{
        const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
        // contraste grossier : texte de couleur identique au fond
        const lum = c => { const m = c.match(/\d+/g); return m ? (0.299*m[0]+0.587*m[1]+0.114*m[2]) : null; };
        const fond = e => { let x = e; while (x){ const b = getComputedStyle(x).backgroundColor;
          if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return b; x = x.parentElement; } return 'rgb(255,255,255)'; };
        // tout le document, contrôles de formulaire compris — pas seulement #main
        const bad = [...document.querySelectorAll('body *')].filter(e=>{
          const t = e.tagName, ty = (e.type || '').toLowerCase();
          if (t === 'INPUT' && !['text','number','email','search',''].includes(ty)) return false;  // curseurs et cases : pas de texte
          if (!e.textContent.trim() && t !== 'SELECT' && t !== 'INPUT') return false;
          if (e.children.length && t !== 'SELECT') return false;                                   // seulement les feuilles
          const s = getComputedStyle(e);
          const lc = lum(s.color), lf = lum(fond(e));
          return lc !== null && lf !== null && Math.abs(lc - lf) < 25;
        }).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : ''));
        return { over: sw > iw + 1, bad };
      });
      if (r.over) over++;
      for (const x of r.bad) faibles.add(v + ' ' + x);
    }
    console.log(`${theme.padEnd(7)} ${String(w).padStart(4)}px — fond ${applique} · ${vues.length} vues · débordement ${over} · contraste faible ${faibles.size}${faibles.size?' : '+[...faibles].slice(0,6).join(', '):''}`);
    await ctx.close();
  }
}
console.log('erreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
await b.close();
