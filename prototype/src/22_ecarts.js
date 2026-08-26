
/* ═══ 35. ÉTATS DÉRIVÉS ET RÉSOLUTION D'ÉCART ══════════════════════════════
   Deux règles, une seule idée : un état ne se saisit pas, il se DÉDUIT de ce
   qui existe. « Pièce reçue » se déduit du dépôt du client sur la requête qui
   la demandait ; l'état d'une ligne de papier se déduit de sa pièce, de sa
   saisie et de sa résolution. Une case à cocher aurait permis de déclarer
   reçue une pièce que personne n'a déposée.

   La résolution d'écart REPREND la contrainte probante déjà écrite pour les
   exceptions (migration 0009, NEP 500) : explication du client mot pour mot,
   conclusion de l'auditeur, qualification, LIEN vers ce qui corrobore, auteur
   et horodatage. Aucun second chemin : sans ces six éléments, l'écart reste
   entier au cumul des anomalies.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── 1. réception : dérivée du portail, jamais cochée ─────────────────────── */
const _depIdx = { cle:'', m:null };
function indexDepots(){
  const n = S.requetes.reduce((a, r) => a + r.items.reduce((b, i) => b + i.depots.length, 0), 0);
  const cle = S.requetes.length + '/' + n;
  if (_depIdx.cle === cle && _depIdx.m) return _depIdx.m;
  const m = new Map();
  for (const r of S.requetes){
    if (!r.proc) continue;
    for (const it of r.items){
      if (it.ref === null || it.ref === undefined) continue;
      const k = r.section + '|' + r.proc + '|' + it.ref;
      const l = m.get(k) || [];
      for (const d of it.depots) l.push({ ...d, req:r.id, item:it.id });
      if (l.length) m.set(k, l);
    }
  }
  _depIdx.cle = cle; _depIdx.m = m;
  return m;
}
/** Les dépôts du client rattachés à un élément d'échantillon. */
function depotsElement(p, pr, cle){
  return indexDepots().get(p.code + '|' + pr.code + '|' + cle) || [];
}
function ligneRecue(p, pr, cle){ return depotsElement(p, pr, cle).length > 0; }
function docRecu(p, pr, cle, doc){ return depotsElement(p, pr, cle).some(d => d.doc === doc); }

/* ── 2. les cinq états d'une ligne de papier de travail ───────────────────── */
const ETATS_LIGNE = [
  { id:'attente',  lib:'en attente',         mk:'n',
    d:'la requête est émise, le client n’a rien déposé pour cet élément' },
  { id:'recue',    lib:'reçue',              mk:'a',
    d:'la pièce est déposée, le contrôle n’est pas encore saisi' },
  { id:'traitee',  lib:'traitée sans écart', mk:'p',
    d:'valeur relevée conforme à la référence, dans la tolérance déclarée' },
  { id:'ecart',    lib:'écart à expliquer',  mk:'x',
    d:'valeur relevée hors tolérance, aucune résolution probante acquise' },
  { id:'explique', lib:'écart expliqué',     mk:'e',
    d:'écart résolu : explication, corroboration liée, qualification et auteur' },
];
const ETAT = Object.fromEntries(ETATS_LIGNE.map(e => [e.id, e]));
/* Une ligne porte plusieurs contrôles, qui peuvent être dans des états
   différents. L'état retenu pour la ligne est le premier de cette liste
   qu'un de ses contrôles atteint : on montre d'abord ce qui appelle une
   action de l'auditeur (un écart), puis ce qui appelle une action du client
   (une pièce), puis ce qui reste à faire, et seulement ensuite ce qui est
   terminé. Ce n'est pas le plus fréquent qui gagne : c'est le plus exigeant. */
const PRIORITE_ETAT = ['ecart', 'attente', 'recue', 'explique', 'traitee'];

function etatControle(c){
  if (!c.recu)     return 'attente';
  if (!c.saisi)    return 'recue';
  if (c.conforme)  return 'traitee';
  return resolutionAcquise(c) ? 'explique' : 'ecart';
}
function etatLigne(ctrLigne){
  const s = new Set(ctrLigne.map(etatControle));
  return PRIORITE_ETAT.find(e => s.has(e)) || 'attente';
}
/** Compte des cinq états sur un ensemble de contrôles. */
function comptesEtats(ctr){
  const c = { attente:0, recue:0, traitee:0, ecart:0, explique:0 };
  for (const x of ctr) c[etatControle(x)]++;
  return c;
}
function marqueEtat(id, titre){ return marque(ETAT[id].mk, titre || ETAT[id].d); }

/* ── 3. résolution d'écart : UN SEUL chemin, où que l'écart soit né ───────
   Écart de papier de travail, écart de rapprochement, écriture relevée au
   test des écritures : la même contrainte, le même objet, la même carte.
   Un second chemin, plus commode, serait un chemin sans preuve. */
/* Les quatre qualifications sont celles de la contrainte existante : elles
   disent ce qu'il est advenu de l'argent. Tout le reste doit être escaladé. */
const DISPOSITIONS = {
  corrigee:     { lib:'corrigée', d:'une écriture de correction existe — elle est citée en corroboration' },
  pas_anomalie: { lib:'pas d’anomalie', d:'la pièce corroborante démontre qu’il n’y avait pas d’anomalie' },
  compensee:    { lib:'compensée', d:'un autre élément probant couvre l’assertion sur le même montant' },
  deja_cumulee: { lib:'déjà cumulée', d:'le même fait est déjà porté au cumul par un autre écart' },
};
function resolVide(){
  return { explique:0, expl:'', concl:'', disposition:'',
           corrobPiece:'', corrobEcriture:'', par:null, t:null };
}
/** Casier de résolution d'un contrôle de papier de travail. */
function resol(c){
  const l = c.ligne;
  if (!l.res) l.res = {};
  if (!l.res[c.cle]) l.res[c.cle] = resolVide();
  return l.res[c.cle];
}
function resolLue(c){ return (c.ligne.res || {})[c.cle] || null; }
/** Casier de résolution d'un écart né hors papier de travail.
 *  `explInitiale` : l'explication déjà REÇUE du client, si elle l'a été. Elle
 *  est enregistrée comme explication, jamais comme résolution : à elle seule
 *  elle ne retire pas un centime du cumul. */
function resolHors(ref, explInitiale){
  if (!S.resolutionsHors[ref]){
    S.resolutionsHors[ref] = resolVide();
    if (explInitiale) S.resolutionsHors[ref].expl = explInitiale;
  }
  return S.resolutionsHors[ref];
}
/** Ce qui manque pour que la résolution soit probante — la liste est la règle. */
function manquesResolution(r){
  const m = [];
  if (!r || !(r.expl || '').trim())  m.push('explication reçue du client, mot pour mot');
  if (!r || !(r.concl || '').trim()) m.push('conclusion de l’auditeur sur cette explication');
  if (!r || !r.disposition)          m.push('qualification de l’écart');
  if (!r || !((r.corrobPiece || '').trim() || (r.corrobEcriture || '').trim()))
    m.push('lien vers la pièce ou l’écriture qui corrobore');
  if (!r || !r.par)                  m.push('auteur et date de la conclusion');
  return m;
}
/** Un écart CHIFFRÉ n'est résolu que si une part est réellement retirée du
 *  cumul : c'est la règle « une exception quantifiée doit dire ce qu'il est
 *  advenu de l'argent ». Un écart NON CHIFFRÉ — une date de pièce, un tiers,
 *  une référence — n'a rien à retirer d'un cumul : il exige les mêmes
 *  éléments probants, et rien de plus. Les deux passent par le même casier. */
function resolutionAcquiseR(r, constate){
  if (!r || manquesResolution(r).length) return false;
  if (!constate) return true;
  return partRetenue(constate, r) !== 0;
}
function partRetenue(constate, r){
  const brut = r ? r.explique : 0;
  return constate >= 0 ? Math.max(0, Math.min(brut, constate))
                       : Math.min(0, Math.max(brut, constate));
}
/** L'écart d'un contrôle, en euros quand il en porte un, zéro sinon. */
function constateDe(c){ return c.ch.type === 'montant' ? -c.ecart : 0; }
function resolutionAcquise(c){ return resolutionAcquiseR(resolLue(c), constateDe(c)); }
/** Une corroboration est un LIEN : l'écriture citée doit exister au grand livre. */
function ecritureExiste(ref){
  const v = String(ref || '').trim().toUpperCase();
  if (!v) return null;
  return LEDGER.entries.find(e => e.num.toUpperCase() === v || String(e.pieceRef).toUpperCase() === v) || null;
}

/* ── 4. écart constaté, expliqué, résiduel ────────────────────────────────
   Le résiduel n'est jamais saisi : c'est une soustraction. Et la part
   expliquée ne peut ni dépasser l'écart, ni en inverser le sens — une
   résolution qui rendrait l'écart plus grand n'est pas une résolution. */
function residuelR(constate, r){
  const brut = r ? r.explique : 0;
  const borne = partRetenue(constate, r);
  const acquis = resolutionAcquiseR(r, constate);
  const explique = acquis ? borne : 0;
  return { constate, explique, residuel:constate - explique, acquis, retenu:borne, chiffre:constate !== 0,
           saisi:brut, borne:brut !== borne, res:r, manques:manquesResolution(r) };
}
function residuel(c){ return residuelR(constateDe(c), resolLue(c)); }
/** Enregistre la conclusion : c'est elle, et rien d'autre, qui porte l'auteur. */
function conclureResolution(r, constate, libelle){
  const m = manquesResolution({ ...r, par:'x' });
  if (m.length) return { ok:false, why:'résolution incomplète : ' + m.join(' ; ') };
  if ((r.corrobEcriture || '').trim() && !ecritureExiste(r.corrobEcriture))
    return { ok:false, why:'l’écriture « ' + r.corrobEcriture.trim() + ' » n’existe pas au grand livre' };
  if (constate && partRetenue(constate, r) === 0)
    return { ok:false, why:'une part expliquée nulle ne résout rien : escaladez l’écart ou laissez-le au cumul' };
  r.par = S.moi; r.t = tick();
  logEvent('écart résolu', libelle, DISPOSITIONS[r.disposition].lib
           + (constate ? ' · ' + eur(partRetenue(constate, r)) + ' expliqué(s)' : ' · écart non chiffré'));
  return { ok:true };
}
function annulerResolutionR(r, libelle){
  r.par = null; r.t = null;
  logEvent('résolution retirée', libelle, USERS[S.moi].nom);
}

/* ── 4b. la carte de résolution, une seule pour tous les écarts ──────────── */
function carteResolution(cle, entete, constate, r, depots){
  const d = residuelR(constate, r);
  const ecr = ecritureExiste(r.corrobEcriture);
  const manquesHorsAuteur = d.manques.filter(x => !x.startsWith('auteur'));
  return `<div class="nl ${d.acquis ? '' : 'warn'}" style="margin-top:8px">
    <div class="m">${entete} ${d.acquis ? marqueEtat('explique') : marqueEtat('ecart')}</div>
    ${d.chiffre ? `<div class="kv">
      <span class="k">Écart constaté</span><span class="v">${eur(d.constate)}</span>
      <span class="k">Part expliquée</span><span class="v"><input class="cell" data-rmont="${esc(cle)}"
        value="${d.saisi ? (d.saisi / 100).toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></span>
      <span class="k">Écart résiduel</span><span class="v"${d.residuel ? ' style="color:var(--anomalie)"' : ''}>${eur(d.residuel)}</span>
    </div>
    ${d.borne ? `<div class="callout warn">La part expliquée est bornée à l’écart constaté et à son sens :
      ${eur(d.saisi)} saisi, ${eur(d.retenu)} retenu.</div>` : ''}`
    : `<p class="note">Écart non chiffré : il ne porte aucun montant et n’entre pas au cumul des anomalies.
       Les éléments probants exigés sont les mêmes.</p>`}
    <div class="ctrl"><label>Explication reçue du client — mot pour mot, pas un résumé</label>
      <textarea data-rexpl="${esc(cle)}" rows="2" placeholder="ce que le client a écrit ou dit, tel quel">${esc(r.expl)}</textarea></div>
    <div class="ctrl"><label>Conclusion de l’auditeur sur cette explication</label>
      <textarea data-rconcl="${esc(cle)}" rows="2" placeholder="pourquoi cette explication tient, au vu de la corroboration">${esc(r.concl)}</textarea></div>
    <div class="row">
      <div class="ctrl"><label>Qualification</label>
        <select data-rdisp="${esc(cle)}">
          <option value="">— à qualifier —</option>
          ${Object.entries(DISPOSITIONS).map(([id, x]) => `<option value="${id}" ${r.disposition === id ? 'selected' : ''}>${esc(x.lib)}</option>`).join('')}
        </select></div>
      ${depots && depots.length ? `<div class="ctrl"><label>Pièce corroborante déposée</label>
        <select data-rpiece="${esc(cle)}">
          <option value="">— aucune —</option>
          ${depots.map(x => `<option value="${esc(x.nom)}" ${r.corrobPiece === x.nom ? 'selected' : ''}>${esc(x.doc)} — ${esc(x.nom)}</option>`).join('')}
        </select></div>` : ''}
      <div class="ctrl"><label>${depots && depots.length ? 'ou é' : 'É'}criture du grand livre</label>
        <input class="cell txt" data-recr="${esc(cle)}" value="${esc(r.corrobEcriture)}" placeholder="n° d’écriture ou de pièce"></div>
    </div>
    ${r.disposition ? `<p class="note">${esc(DISPOSITIONS[r.disposition].d)}</p>` : ''}
    ${(r.corrobEcriture || '').trim() ? (ecr
      ? `<p class="note">Écriture <span class="mono">${esc(ecr.num)}</span> du ${frDate(ecr.date)} — ${esc(ecr.libelle)}.</p>`
      : `<div class="callout bad">Aucune écriture « ${esc(r.corrobEcriture)} » au grand livre :
          une corroboration est un lien, pas une mention.</div>`) : ''}
    ${r.par
      ? `<div class="callout"><b>Conclu</b> par ${esc(USERS[r.par].nom)} (${esc(ROLE_LIB[USERS[r.par].role])})
          le ${horo(r.t)} — ${esc(DISPOSITIONS[r.disposition].lib)}, ${eur(d.explique)} retiré(s) du cumul.
          <button class="btn mini sec" data-rannul="${esc(cle)}">retirer la conclusion</button></div>`
      : `<div class="callout ${manquesHorsAuteur.length ? 'warn' : ''}">
          ${manquesHorsAuteur.length
            ? `<b>Il manque :</b> ${esc(manquesHorsAuteur.join(' ; '))}.
               ${d.chiffre ? 'Tant que ces éléments manquent, l’écart reste au cumul pour ' + eur(d.constate) + '.'
                           : 'Tant que ces éléments manquent, l’écart reste ouvert.'}`
            : 'Les éléments probants sont réunis.'}</div>
        <button class="btn" data-rconclure="${esc(cle)}" ${manquesHorsAuteur.length ? 'disabled' : ''}>conclure — engage ${esc(USERS[S.moi].nom)}</button>`}
  </div>`;
}

/* ── 5. obstacles d'une procédure : ce qui empêche de la dire terminée ───── */
function obstaclesProcedure(p, pr){
  const o = [], st = proc(p.code, pr.code);
  if (!pr.ech){
    if (!st.conclusion.trim()) o.push('conclusion de la procédure non rédigée');
    return o;
  }
  const n = comptesEtats(controles(p, pr));
  if (n.attente) o.push(`${n.attente} justificatif(s) attendu(s) du client`);
  if (n.recue)   o.push(`${n.recue} contrôle(s) non saisi(s) alors que la pièce est reçue`);
  if (n.ecart)   o.push(`${n.ecart} écart(s) sans résolution probante`);
  if (!st.conclusion.trim()) o.push('conclusion de la procédure non rédigée');
  return o;
}

/* ── 6. avancement des justificatifs, par section ─────────────────────────
   Les cinq états s'agrègent : c'est le tableau de bord de suivi, dérivé des
   mêmes contrôles que le papier de travail — rien n'est compté deux fois. */
function avancementSection(p){
  const t = { attente:0, recue:0, traitee:0, ecart:0, explique:0, total:0, elements:0, recus:0 };
  for (const pr of proceduresRequises(p)){
    if (!pr.ech) continue;
    const ctr = controles(p, pr), n = comptesEtats(ctr);
    for (const k of Object.keys(n)) t[k] += n[k];
    t.total += ctr.length;
    const wp = wpProc(p, pr) || [];
    t.elements += wp.length;
    t.recus += wp.filter(r => ligneRecue(p, pr, r.cle)).length;
  }
  return t;
}
function bandeauAvancement(t){
  const c = (k, n) => `<span class="pill ${k === 'ecart' && n ? 'bad' : k === 'attente' && n ? 'warn' : ''}">`
    + `${n} ${esc(ETAT[k].lib)}</span>`;
  return `<div class="row">${ETATS_LIGNE.map(e => c(e.id, t[e.id])).join('')}
    <span class="smallcaps">${t.total} contrôle(s) sur ${t.elements} élément(s)</span></div>`;
}
