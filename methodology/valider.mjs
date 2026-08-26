/* ══ VALIDATION ET CHARGEMENT DU CATALOGUE MÉTHODOLOGIQUE ══════════════════
   UNE seule implémentation, versionnée avec les données qu'elle valide.
   Elle est appelée par :
     — l'application  (app/src/lib/methodology/catalogue.ts),
     — le générateur du prototype (prototype/src/gen-catalogue.mjs),
   pour que la méthode ne soit ni écrite deux fois, ni vérifiée deux fois,
   ni divergente entre la démonstration et le produit.

   Le validateur couvre le sous-ensemble de JSON Schema réellement employé
   par methodology/schema.json : champs requis, énumérations, refus des
   champs inconnus. Il n'a aucune dépendance : le dépôt doit se construire
   et se tester sans réseau.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/** Racine du dépôt, déduite de l'emplacement de ce fichier. */
export function racineDepot(){
  return path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
}

function validerObjet(obj, def, chemin, erreurs){
  for (const k of def.required || []){
    if (obj[k] === undefined) erreurs.push(`${chemin} : champ « ${k} » manquant`);
  }
  for (const [k, v] of Object.entries(def.properties || {})){
    if (obj[k] === undefined) continue;
    if (v.enum && !v.enum.includes(obj[k]))
      erreurs.push(`${chemin} : ${k} = « ${obj[k]} » hors énumération [${v.enum.join(', ')}]`);
    if (v.type === 'string' && typeof obj[k] !== 'string')
      erreurs.push(`${chemin} : ${k} devrait être une chaîne`);
    if (v.type === 'boolean' && typeof obj[k] !== 'boolean')
      erreurs.push(`${chemin} : ${k} devrait être un booléen`);
    if (v.type === 'array' && !Array.isArray(obj[k]))
      erreurs.push(`${chemin} : ${k} devrait être une liste`);
    if (v.minLength !== undefined && typeof obj[k] === 'string' && obj[k].length < v.minLength)
      erreurs.push(`${chemin} : ${k} fait ${obj[k].length} caractères, minimum ${v.minLength}`);
    if (v.minItems !== undefined && Array.isArray(obj[k]) && obj[k].length < v.minItems)
      erreurs.push(`${chemin} : ${k} compte ${obj[k].length} entrée(s), minimum ${v.minItems}`);
    if (v.pattern && typeof obj[k] === 'string' && !new RegExp(v.pattern).test(obj[k]))
      erreurs.push(`${chemin} : ${k} = « ${obj[k]} » ne suit pas le motif ${v.pattern}`);
  }
  if (def.additionalProperties === false){
    for (const k of Object.keys(obj)){
      if (!def.properties || !def.properties[k])
        erreurs.push(`${chemin} : champ « ${k} » inconnu du schéma`);
    }
  }
}

/**
 * Erreurs du catalogue, liste vide s'il est valide.
 * @param {object} cat     contenu de procedures.json
 * @param {object} src     contenu de sources.json
 * @param {object} schema  contenu de schema.json
 * @returns {string[]}
 */
export function validerCatalogue(cat, src, schema){
  const erreurs = [];
  const defProc = schema.definitions.procedure;
  const defJust = defProc.properties.justificatifs.items;
  const defChamp = defJust.properties.champs.items;
  const defPop = defProc.properties.population;

  if (!cat.version) erreurs.push('catalogue : version manquante');
  if (!cat.sens_de_test) erreurs.push('catalogue : sens_de_test manquant');

  for (const p of cat.procedures || []){
    const ou = `procédure ${p.code || '(sans code)'}`;
    validerObjet(p, defProc, ou, erreurs);
    if (p.population) validerObjet(p.population, defPop, `${ou} · population`, erreurs);
    const listes = [['justificatifs', p.justificatifs]];
    for (const [cle, par] of Object.entries(p.justificatifs_par_cycle || {}))
      listes.push([`justificatifs_par_cycle.${cle}`, par]);
    for (const [nom, liste] of listes){
      for (const d of liste || []){
        const oud = `${ou} · ${nom} · ${d.document || '(sans document)'}`;
        validerObjet(d, defJust, oud, erreurs);
        for (const ch of d.champs || []){
          validerObjet(ch, defChamp, `${oud} · ${ch.code || '(sans code)'}`, erreurs);
          /* Un champ RELEVÉ SEUL ne se compare à rien : il ne doit donc pas
             porter de règle de contrôle, sans quoi le catalogue dirait deux
             choses contraires au même endroit. */
          if (ch.releve_seul && ch.regle)
            erreurs.push(`${oud} · ${ch.code} : « relevé seul » et une règle de contrôle à la fois`);
        }
      }
    }
    /* La méthode ne se cite pas sans source, et pas depuis une source absente
       du registre : c'est ce qui rend l'état « non vérifié » opposable. */
    for (const s of p.sources || []){
      if (!src.sources[s]) erreurs.push(`${ou} : source « ${s} » absente du registre`);
    }
    if (p.sens && cat.sens_de_test && !cat.sens_de_test[p.sens])
      erreurs.push(`${ou} : sens « ${p.sens} » absent de sens_de_test`);
  }

  const codes = (cat.procedures || []).map(p => p.cycle + '/' + p.code);
  const dbl = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dbl.length) erreurs.push('codes en double : ' + [...new Set(dbl)].join(', '));

  for (const [code, s] of Object.entries(src.sources || {})){
    if (s.verifie === undefined) erreurs.push(`source ${code} : état de vérification non déclaré`);
    if (s.verifie === false && !s.raison_non_verifie)
      erreurs.push(`source ${code} : non vérifiée sans raison écrite`);
  }
  return erreurs;
}

/** Lit, valide et rend le catalogue. Lève si les données sont invalides. */
export function chargerCatalogue(racine){
  const dir = path.join(racine || racineDepot(), 'methodology');
  const lire = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const cat = lire('procedures.json'), src = lire('sources.json'), schema = lire('schema.json');
  const erreurs = validerCatalogue(cat, src, schema);
  if (erreurs.length){
    throw new Error('CATALOGUE INVALIDE :\n  ' + erreurs.join('\n  '));
  }
  return { version:cat.version, sensDeTest:cat.sens_de_test,
           procedures:cat.procedures, sources:src.sources, schema };
}
