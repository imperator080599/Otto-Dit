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

/** Les clés « _note » documentent le fichier pour qui le relit ; elles ne sont
 *  pas de la donnée. Les laisser passer ferait apparaître « _note » comme un
 *  niveau de risque dans la table des tailles. */
function sansNotes(o){
  return Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));
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
          /* Une règle de DATE inconnue du moteur tomberait silencieusement sur
             la comparaison à la tolérance et relèverait comme anomalie des
             pièces parfaitement normales. Le catalogue ne doit pas pouvoir
             nommer une règle que personne n'implémente : c'est un défaut de
             construction, il arrête l'assemblage. L'apostrophe est normalisée,
             parce que la typographique et la droite désignent la même règle. */
          if (ch.type === 'date' && ch.regle && Array.isArray(schema.regles_date)){
            const norm = x => String(x).replace(/[’‘]/g, "'");
            if (!schema.regles_date.map(norm).includes(norm(ch.regle)))
              erreurs.push(`${oud} · ${ch.code} : règle de date « ${ch.regle} » inconnue du moteur `
                + `(connues : ${schema.regles_date.join(' | ')})`);
          }
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

/**
 * Erreurs du questionnaire résiduel de risque, liste vide s'il est valide.
 *
 * Le questionnaire est de la MÉTHODE, pas du code de démonstration : les
 * questions, la raison de leur survivance et l'effet d'un « oui » se relisent
 * et se versionnent comme les procédures. Il est donc validé ici, par le même
 * moteur et les mêmes règles — dont celle qui compte le plus : une portée ou
 * une nature inconnue ARRÊTE l'assemblage. Un `portee` mal orthographié
 * tomberait sinon du côté « section » sans que rien ne le dise, et la question
 * d'entité serait posée dix-neuf fois au lieu d'une.
 *
 * @param {object} q       contenu de questionnaire.json
 * @param {object} src     contenu de sources.json
 * @param {object} schema  contenu de schema-questionnaire.json
 * @returns {string[]}
 */
export function validerQuestionnaire(q, src, schema){
  const erreurs = [];
  const defQ = schema.definitions.question, defN = schema.definitions.nature_ri;
  if (!q.version) erreurs.push('questionnaire : version manquante');
  if (!q.natures_ri) erreurs.push('questionnaire : natures_ri manquant');

  for (const [code, n] of Object.entries(q.natures_ri || {})){
    validerObjet(n, defN, `nature ${code}`, erreurs);
    for (const s of n.sources || [])
      if (!src.sources[s]) erreurs.push(`nature ${code} : source « ${s} » absente du registre`);
  }
  for (const x of q.questions || []){
    const ou = `question ${x.code || '(sans code)'}`;
    validerObjet(x, defQ, ou, erreurs);
    if (x.nature && !(q.natures_ri || {})[x.nature])
      erreurs.push(`${ou} : nature « ${x.nature} » absente de natures_ri`);
    for (const s of x.sources || [])
      if (!src.sources[s]) erreurs.push(`${ou} : source « ${s} » absente du registre`);
  }
  const codes = (q.questions || []).map(x => x.code);
  const dbl = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dbl.length) erreurs.push('codes de question en double : ' + [...new Set(dbl)].join(', '));
  /* Une portée sans aucune question n'est pas une erreur de données, mais elle
     rend un écran vide : on le dit à l'assemblage plutôt qu'à l'écran. */
  for (const portee of defQ.properties.portee.enum)
    if (!codes.length || !(q.questions || []).some(x => x.portee === portee))
      erreurs.push(`questionnaire : aucune question de portée « ${portee} »`);
  return erreurs;
}

/**
 * Erreurs de la déclaration d'indépendance, liste vide si elle est valide.
 *
 * Les rubriques et les seuils sont du CONTENU DE CABINET : chaque cabinet a les
 * siens et les remplace. Ils sont donc validés comme le reste de la méthode —
 * et les seuils, qui sont des règles juridiques, doivent NOMMER LEUR SOURCE et
 * ce qu'ils commandent. Un seuil sans source ni justification écrite est un
 * chiffre qu'on affichera un jour à l'écran sans savoir d'où il vient.
 *
 * @param {object} ind     contenu de independance.json
 * @param {object} src     contenu de sources.json
 * @param {object} schema  contenu de schema-independance.json
 * @returns {string[]}
 */
export function validerIndependance(ind, src, schema){
  const erreurs = [];
  const defR = schema.definitions.rubrique, defP = schema.definitions.parametre;
  if (!ind.version) erreurs.push('indépendance : version manquante');

  for (const r of ind.rubriques || []) validerObjet(r, defR, `rubrique ${r.code || '(sans code)'}`, erreurs);
  const codes = (ind.rubriques || []).map(r => r.code);
  const dbl = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dbl.length) erreurs.push('rubriques en double : ' + [...new Set(dbl)].join(', '));
  if (!codes.length) erreurs.push('indépendance : aucune rubrique — une déclaration vide ne déclare rien');

  for (const [code, p] of Object.entries(ind.parametres || {})){
    validerObjet(p, defP, `paramètre ${code}`, erreurs);
    for (const s of p.sources || [])
      if (!src.sources[s]) erreurs.push(`paramètre ${code} : source « ${s} » absente du registre`);
  }
  if (!Object.keys(ind.natures_sacc || {}).length)
    erreurs.push('indépendance : aucune nature de service autre que la certification');
  return erreurs;
}

/**
 * Erreurs de l'évaluation du risque, liste vide si elle est valide.
 *
 * La règle qui compte : un `predicat` hors de l'énumération du schéma ARRÊTE
 * l'assemblage. Sans elle, un facteur nommé mais non implémenté serait
 * silencieusement TOUJOURS INACTIF — le risque serait sous-évalué, donc
 * l'étendue des travaux aussi, et rien à l'écran ne le dirait. C'est la leçon
 * de l'ADR-057 appliquée à un endroit où elle coûterait plus cher encore.
 *
 * @param {object} r       contenu de risque.json
 * @param {object} src     contenu de sources.json
 * @param {object} schema  contenu de schema-risque.json
 * @returns {string[]}
 */
export function validerRisque(r, src, schema){
  const erreurs = [];
  const defF = schema.definitions.facteur;
  if (!r.version) erreurs.push('risque : version manquante');

  const connus = schema.predicats_facteur || [];
  for (const f of r.facteurs_observes || []){
    const ou = `facteur ${f.code || '(sans code)'}`;
    validerObjet(f, defF, ou, erreurs);
    if (f.predicat && !connus.includes(f.predicat))
      erreurs.push(`${ou} : prédicat « ${f.predicat} » inconnu du moteur (connus : ${connus.join(' | ')})`);
    for (const s of f.sources || [])
      if (!src.sources[s]) erreurs.push(`${ou} : source « ${s} » absente du registre`);
  }
  const codes = (r.facteurs_observes || []).map(f => f.code);
  const dbl = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dbl.length) erreurs.push('facteurs en double : ' + [...new Set(dbl)].join(', '));

  /* L'échelle doit couvrir zéro facteur, sinon un poste sans facteur n'aurait
     aucun niveau — et « aucun niveau » se lirait comme « pas de risque ». */
  const niveaux = (r.echelle || {}).niveaux || [];
  const paliers = (r.echelle || {}).paliers || [];
  if (!niveaux.length) erreurs.push('risque : échelle sans niveaux');
  if (!paliers.some(p => p.facteurs_min === 0))
    erreurs.push('risque : aucun palier pour zéro facteur actif — un poste sans facteur n’aurait pas de niveau');
  for (const p of paliers)
    if (!niveaux.includes(p.niveau))
      erreurs.push(`risque : palier vers un niveau « ${p.niveau} » absent de l’échelle`);
  /* Chaque niveau doit avoir une taille : un niveau sans taille rendrait un
     échantillon vide là où le risque est le plus élevé. */
  for (const n of niveaux)
    if (typeof (r.tailles_echantillon || {})[n] !== 'number')
      erreurs.push(`risque : niveau « ${n} » sans taille d’échantillon`);
  return erreurs;
}

/** Lit, valide et rend le catalogue. Lève si les données sont invalides. */
export function chargerCatalogue(racine){
  const dir = path.join(racine || racineDepot(), 'methodology');
  const lire = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const cat = lire('procedures.json'), src = lire('sources.json'), schema = lire('schema.json');
  const quest = lire('questionnaire.json'), schemaQ = lire('schema-questionnaire.json');
  const ind = lire('independance.json'), schemaI = lire('schema-independance.json');
  const risq = lire('risque.json'), schemaR = lire('schema-risque.json');
  const erreurs = validerCatalogue(cat, src, schema)
    .concat(validerQuestionnaire(quest, src, schemaQ))
    .concat(validerIndependance(ind, src, schemaI))
    .concat(validerRisque(risq, src, schemaR));
  if (erreurs.length){
    throw new Error('CATALOGUE INVALIDE :\n  ' + erreurs.join('\n  '));
  }
  return { version:cat.version, sensDeTest:cat.sens_de_test,
           procedures:cat.procedures, sources:src.sources, schema,
           questionnaire:{ version:quest.version, naturesRi:quest.natures_ri,
                           questions:quest.questions },
           independance:{ version:ind.version, rubriques:ind.rubriques,
                          parametres:ind.parametres, naturesSacc:ind.natures_sacc },
           risque:{ version:risq.version, facteurs:risq.facteurs_observes,
                    niveaux:risq.echelle.niveaux, paliers:risq.echelle.paliers,
                    tailles:sansNotes(risq.tailles_echantillon),
                    predicats:schemaR.predicats_facteur } };
}
