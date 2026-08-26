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

/**
 * Les clés « _note » documentent le fichier pour qui le relit ; elles ne sont
 * pas de la donnée. Les laisser passer ferait apparaître « _note » comme un
 * niveau de risque dans la table des tailles.
 *
 * RÉCURSIF, et il ne l'était pas : une note posée dans un objet imbriqué —
 * « pourquoi ce niveau utilise une formule » — traversait jusqu'au moteur. Rien
 * n'aurait planté ; le paramètre inconnu serait simplement passé au calcul.
 */
function sansNotes(o){
  if (Array.isArray(o)) return o.map(sansNotes);
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(
    Object.entries(o).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, sansNotes(v)]),
  );
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
export function validerCatalogue(cat, src, schema, echelle, assertions){
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
    /* Le niveau exigé se valide contre L'ÉCHELLE DU CABINET, pas contre une
       liste figée dans le schéma. C'est ce qui autorise quatre niveaux, deux,
       ou « limité / normal / accru » — et c'est plus strict qu'une énumération,
       parce que cela attrape en plus une divergence entre les deux fichiers. */
    if (assertions && p.assertion && !assertions.includes(p.assertion))
      erreurs.push(`${ou} : assertion « ${p.assertion} » absente du jeu du cabinet `
        + `(${assertions.join(' | ')})`);
    if (echelle && p.risque_minimum && !echelle.includes(p.risque_minimum))
      erreurs.push(`${ou} : risque_minimum « ${p.risque_minimum} » absent de l’échelle du cabinet `
        + `(${echelle.join(' | ')})`);
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
export function validerQuestionnaire(q, src, schema, assertions){
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
    if (assertions && x.assertion && !assertions.includes(x.assertion))
      erreurs.push(`${ou} : assertion « ${x.assertion} » absente du jeu du cabinet`);
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
export function validerRisque(r, src, schema, assertions){
  const erreurs = [];
  const defF = schema.definitions.facteur;
  if (!r.version) erreurs.push('risque : version manquante');

  const connus = schema.predicats_facteur || [];
  for (const f of r.facteurs_observes || []){
    const ou = `facteur ${f.code || '(sans code)'}`;
    validerObjet(f, defF, ou, erreurs);
    if (assertions && f.assertion && !assertions.includes(f.assertion))
      erreurs.push(`${ou} : assertion « ${f.assertion} » absente du jeu du cabinet`);
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
     échantillon vide là où le risque est le plus élevé.
     UN NIVEAU PORTE SOIT UN NOMBRE, SOIT UNE FORMULE NOMMÉE. La frontière est
     celle des prédicats : la méthode nomme, le code calcule — et elle joue
     dans les DEUX SENS, parce qu'une formule nommée et non implémentée rendrait
     une taille silencieusement absente, tandis qu'une formule implémentée et
     jamais nommée serait du code mort qu'aucune méthode ne peut atteindre. */
  const formulesConnues = Object.keys(schema.formules_taille || {});
  const formulesNommees = new Set();
  for (const n of niveaux){
    const t = (r.tailles_echantillon || {})[n];
    if (typeof t === 'number'){
      if (!Number.isInteger(t) || t < 1)
        erreurs.push(`risque : niveau « ${n} » — taille « ${t} » n'est pas un entier positif`);
      continue;
    }
    if (!t || typeof t !== 'object'){
      erreurs.push(`risque : niveau « ${n} » sans taille d’échantillon`);
      continue;
    }
    const def = schema.formules_taille[t.formule];
    if (!def){
      erreurs.push(`risque : niveau « ${n} » — formule « ${t.formule} » inconnue du moteur `
        + `(connues : ${formulesConnues.join(' | ') || 'aucune'}) — la taille serait silencieusement absente`);
      continue;
    }
    formulesNommees.add(t.formule);
    const donnes = Object.keys(t.parametres || {});
    for (const attendu of def.parametres){
      if (typeof (t.parametres || {})[attendu] !== 'number')
        erreurs.push(`risque : niveau « ${n} », formule « ${t.formule} » — paramètre « ${attendu} » manquant ou non numérique`);
    }
    for (const donne of donnes){
      if (!def.parametres.includes(donne))
        erreurs.push(`risque : niveau « ${n} », formule « ${t.formule} » — paramètre « ${donne} » inconnu `
          + `(attendus : ${def.parametres.join(' | ')}) — il serait ignoré en silence`);
    }
    const mini = (t.parametres || {}).minimum, maxi = (t.parametres || {}).maximum;
    if (typeof mini === 'number' && typeof maxi === 'number' && mini > maxi)
      erreurs.push(`risque : niveau « ${n} » — minimum ${mini} supérieur au maximum ${maxi}`);
  }
  /* PAS D'AUTRE SENS ICI, et c'est une correction : la première version exigeait
     qu'un niveau nomme chaque formule connue. C'était faux, et du même défaut
     que tout le reste — cela aurait forcé CHAQUE cabinet à utiliser TOUTES les
     formules que le moteur implémente, donc laissé l'implémentation du produit
     dicter la méthode du cabinet. Un cabinet qui travaille à trois tailles
     fixes est parfaitement en règle.
     Le contrôle « implémenté mais non déclaré » existe bien, mais un cran plus
     haut, entre le SCHÉMA du produit et le MOTEUR : c'est
     `assertFormulasImplemented`, et là il a un sens — une formule que le moteur
     calcule sans que le schéma la déclare serait inatteignable par toute
     méthode. */
  void formulesNommees;
  return erreurs;
}

/**
 * Erreurs du jeu d'assertions, liste vide s'il est valide.
 *
 * Les assertions sont un DÉCOUPAGE DE MÉTHODE, pas une constante du produit :
 * certains cabinets séparent « présentation » et « informations à fournir »,
 * d'autres suivent le découpage PCAOB. Les figer dans un schéma reviendrait à
 * dire « votre méthode reste la vôtre, à condition qu'elle ressemble à la
 * nôtre » — le même défaut que l'échelle de risque, découvert par un auditeur
 * en trente secondes.
 *
 * Ce qui remplace l'énumération est PLUS strict : procédures, questions et
 * facteurs sont tous comparés à CE jeu, donc une divergence entre deux
 * fichiers arrête l'assemblage.
 */
export function validerAssertions(a, cat, schema){
  const erreurs = [];
  const def = schema.definitions.assertion;
  if (!a.version) erreurs.push('assertions : version manquante');
  for (const x of a.assertions || []){
    validerObjet(x, def, `assertion ${x.code || '(sans code)'}`, erreurs);
    /* Le sens naturel est indicatif, mais il doit exister : nommer un sens que
       le catalogue ne connaît pas ferait un libellé vide à l'écran. */
    if (x.sens_naturel && cat.sens_de_test && !cat.sens_de_test[x.sens_naturel])
      erreurs.push(`assertion ${x.code} : sens naturel « ${x.sens_naturel} » absent de sens_de_test`);
  }
  const codes = (a.assertions || []).map(x => x.code);
  const dbl = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dbl.length) erreurs.push('assertions en double : ' + [...new Set(dbl)].join(', '));
  if (!codes.length) erreurs.push('assertions : le jeu est vide — aucune procédure ne pourrait viser quoi que ce soit');
  return erreurs;
}


/**
 * Erreurs du GABARIT DE PAPIER DE TRAVAIL, liste vide s'il est valide.
 *
 * Le format d'un papier n'est ni un nom ni un calcul : c'est de la
 * PRÉSENTATION. Le laisser dans le code exigeait un déploiement pour changer
 * une colonne — contraire au principe du produit, et à l'endroit le plus
 * visible pour un client : le papier entre dans SON dossier et se fait relire
 * par SON réviseur.
 *
 * LA FRONTIÈRE RESTE LA MÊME. La méthode NOMME un bloc, le code sait le
 * REMPLIR. Le contrôle joue DANS LES DEUX SENS, pour la raison habituelle :
 *   · un bloc déclaré et non implémenté sortirait une section VIDE ;
 *   · un bloc implémenté et non déclaré DISPARAÎTRAIT du papier ;
 * et dans les deux cas aucun écran ne le dirait.
 */
export function validerPapier(pap, schema){
  const erreurs = [];
  if (!pap.version) erreurs.push('papier : version manquante');

  const natures = Object.keys(pap.papiers || {});
  if (!natures.length) erreurs.push('papier : aucun gabarit — aucun papier de travail ne pourrait être produit');
  for (const n of natures){
    if (!schema.natures_implementees.includes(n))
      erreurs.push(`papier : nature « ${n} » inconnue du moteur (connues : ${schema.natures_implementees.join(' | ')})`);
  }
  for (const n of schema.natures_implementees){
    if (!natures.includes(n))
      erreurs.push(`papier : la nature « ${n} » est implémentée mais n'est pas déclarée — le moteur sait produire ce papier et le gabarit ne le décrit pas`);
  }

  for (const [nom, g] of Object.entries(pap.papiers || {})){
    const ou = `papier ${nom}`;
    const sections = g.sections || [];
    if (!sections.length) erreurs.push(`${ou} : aucune section`);
    const blocs = [];
    for (const sec of sections){
      validerObjet(sec, schema.definitions.section, `${ou} section « ${sec.bloc || '(sans bloc)'} »`, erreurs);
      if (sec.bloc && !schema.blocs_implementes.includes(sec.bloc))
        erreurs.push(`${ou} : bloc « ${sec.bloc} » inconnu du moteur (connus : ${schema.blocs_implementes.join(' | ')}) `
          + `— une section nommée que le moteur ne sait pas remplir sortirait VIDE`);
      blocs.push(sec.bloc);
    }
    const dbl = blocs.filter((b, i) => blocs.indexOf(b) !== i);
    if (dbl.length) erreurs.push(`${ou} : bloc(s) en double : ${[...new Set(dbl)].join(', ')}`);
    for (const b of schema.blocs_implementes){
      if (!blocs.includes(b))
        erreurs.push(`${ou} : le bloc « ${b} » est implémenté mais absent du gabarit — il disparaîtrait du papier `
          + `sans que rien ne le dise. Retirez-le du moteur, ou déclarez-le.`);
    }

    for (const [tab, champsOk] of [['echantillon', schema.champs_echantillon], ['exceptions', schema.champs_exceptions]]){
      const t = (g.tableaux || {})[tab];
      if (!t || !(t.colonnes || []).length){ erreurs.push(`${ou} : tableau « ${tab} » sans colonnes`); continue; }
      const vus = [];
      for (const c of t.colonnes){
        validerObjet(c, schema.definitions.colonne, `${ou} tableau ${tab} colonne « ${c.champ || '(sans champ)'} »`, erreurs);
        if (c.champ && !champsOk.includes(c.champ))
          erreurs.push(`${ou} tableau ${tab} : champ « ${c.champ} » non relevé par la procédure `
            + `(disponibles : ${champsOk.join(' | ')}) — la colonne sortirait vide`);
        vus.push(c.champ);
      }
      const d2 = vus.filter((x, i) => vus.indexOf(x) !== i);
      if (d2.length) erreurs.push(`${ou} tableau ${tab} : champ(s) en double : ${[...new Set(d2)].join(', ')}`);
    }
  }

  /* Les annexes et les mentions portent ce qui rend l'export AUTO-PORTANT :
     visas, version, empreinte de population. Leur libellé est au cabinet ;
     leur présence, non — un papier incapable de dire qui l'a signé et sur
     quelle population n'est plus relisible sans nous. */
  for (const a of schema.annexes_implementees){
    if (!(pap.annexes || {})[a])
      erreurs.push(`papier : annexe « ${a} » sans libellé — son libellé est à vous, sa présence non : `
        + `c'est elle qui rend l'export relisible sans OTTO`);
  }
  for (const m of schema.mentions_requises){
    if (!(pap.mentions || {})[m])
      erreurs.push(`papier : mention « ${m} » manquante`);
  }

  validerObjet(pap.entete || {}, schema.definitions.entete, 'papier entete', erreurs);
  if (pap.entete && pap.entete.logo_data_uri && !/^data:image\//.test(pap.entete.logo_data_uri)){
    erreurs.push('papier entete : le logo doit être une data: URI d\'image — rien n\'est chargé depuis le réseau, '
      + 'un papier qui dépend d\'un serveur pour s\'afficher n\'est pas auto-portant');
  }

  const mep = pap.mise_en_page || {};
  for (const [cle, [min, max]] of Object.entries(schema.bornes)){
    const v = mep[cle];
    if (typeof v !== 'number') { erreurs.push(`papier mise_en_page : « ${cle} » manquant`); continue; }
    if (v < min || v > max) erreurs.push(`papier mise_en_page : « ${cle} » = ${v} hors bornes [${min}, ${max}]`);
  }
  for (const cle of ['couleur_titre', 'couleur_texte', 'couleur_discrete']){
    const c = mep[cle];
    if (!Array.isArray(c) || c.length !== 3 || c.some(x => typeof x !== 'number' || x < 0 || x > 1))
      erreurs.push(`papier mise_en_page : « ${cle} » doit être trois nombres RVB entre 0 et 1`);
  }

  const ref = pap.referencement || {};
  if (typeof ref.modele !== 'string' || !ref.modele.trim()){
    erreurs.push('papier referencement : modèle manquant');
  } else {
    const vars = [...ref.modele.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    if (!vars.length) erreurs.push('papier referencement : le modèle ne porte aucune variable — tous les papiers auraient la même référence');
    for (const v of vars){
      if (!schema.variables_reference.includes(v))
        erreurs.push(`papier referencement : variable « ${v} » inconnue (connues : ${schema.variables_reference.join(' | ')}) `
          + `— elle laisserait un trou dans la référence, et une référence trouée ne se cherche pas dans un dossier`);
    }
  }
  if (!(ref.lettres_par_poste || {})._defaut)
    erreurs.push('papier referencement : « _defaut » manquant dans lettres_par_poste — un poste non listé n\'aurait pas de lettre');

  return erreurs;
}

/* ── les deux entrées, et une seule validation ─────────────────────────────

   Le catalogue peut venir de DEUX endroits : le dépôt (méthode livrée avec le
   produit, lue par le prototype et par les tests) ou une LIGNE DE BASE (méthode
   d'un cabinet, chargée par lui). Ces deux chemins passent par la même
   orchestration : un second chemin de validation serait un chemin non testé,
   et c'est celui-là qui laisserait passer une méthode invalide.

   LES SCHÉMAS NE SONT JAMAIS FOURNIS PAR LE CABINET. Ils énumèrent ce que le
   MOTEUR sait faire — les prédicats implémentés, les règles de date, les sens
   de test. Un cabinet qui livrerait son propre schéma pourrait désactiver tous
   les contrôles en une ligne, et le fichier invalide passerait sans bruit.
   `assemblerCatalogue` n'a donc AUCUN paramètre par lequel un schéma pourrait
   arriver : il les lit lui-même dans le produit.                             */

/** Les six fichiers de CONTENU qu'un cabinet fournit. */
export const FICHIERS_CONTENU = [
  'procedures.json', 'sources.json', 'questionnaire.json',
  'independance.json', 'risque.json', 'assertions.json', 'papier.json',
];

/** Les cinq schémas, propriété du PRODUIT. Jamais fournis par un cabinet. */
export const FICHIERS_SCHEMA = [
  'schema.json', 'schema-questionnaire.json', 'schema-independance.json',
  'schema-risque.json', 'schema-assertions.json', 'schema-papier.json',
];

function lireDossier(dir, noms){
  const out = {};
  for (const f of noms) out[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return out;
}

/** Les schémas du produit, lus depuis le dépôt. */
export function schemasDuProduit(racine){
  return lireDossier(path.join(racine || racineDepot(), 'methodology'), FICHIERS_SCHEMA);
}

/**
 * TOUTES les erreurs d'un paquet, liste vide s'il est valide.
 *
 * C'est la SEULE fonction qui produit des erreurs de paquet. L'assemblage
 * l'appelle, l'écran d'import l'appelle : le cabinet qui colle un fichier voit
 * exactement la liste que le moteur refuserait, pas une liste re-dérivée
 * ailleurs qui pourrait diverger d'une version à l'autre.
 */
export function erreursDuPaquet(contenu, schemas){
  const manquants = FICHIERS_CONTENU.filter(f => !contenu[f]);
  if (manquants.length) return ['fichiers manquants : ' + manquants.join(', ')];
  const cat = contenu['procedures.json'], src = contenu['sources.json'];
  const quest = contenu['questionnaire.json'], ind = contenu['independance.json'];
  const risq = contenu['risque.json'], asrt = contenu['assertions.json'];
  const pap = contenu['papier.json'];
  const schema = schemas['schema.json'], schemaQ = schemas['schema-questionnaire.json'];
  const schemaI = schemas['schema-independance.json'], schemaR = schemas['schema-risque.json'];
  const schemaA = schemas['schema-assertions.json'], schemaP = schemas['schema-papier.json'];
  /* L'échelle est lue AVANT le catalogue : c'est elle qui dit quels niveaux
     une procédure a le droit d'exiger. */
  const echelle = ((risq || {}).echelle || {}).niveaux || [];
  /* Le jeu d'assertions est lu AVANT tout le reste : c'est lui qui dit ce
     qu'une procédure, une question ou un facteur a le droit de viser. */
  const codesAssertions = (asrt.assertions || []).map(x => x.code);
  return validerAssertions(asrt, cat, schemaA)
    .concat(validerCatalogue(cat, src, schema, echelle, codesAssertions))
    .concat(validerQuestionnaire(quest, src, schemaQ, codesAssertions))
    .concat(validerIndependance(ind, src, schemaI))
    .concat(validerRisque(risq, src, schemaR, codesAssertions))
    .concat(validerPapier(pap, schemaP));
}

function assembler(contenu, schemas){
  const erreurs = erreursDuPaquet(contenu, schemas);
  if (erreurs.length){
    throw new Error('CATALOGUE INVALIDE :\n  ' + erreurs.join('\n  '));
  }
  const cat = contenu['procedures.json'], src = contenu['sources.json'];
  const quest = contenu['questionnaire.json'], ind = contenu['independance.json'];
  const risq = contenu['risque.json'], asrt = contenu['assertions.json'];
  const pap = contenu['papier.json'];
  /* Seuls ces deux schémas servent à l'ASSEMBLAGE : le premier voyage avec le
     catalogue, le second porte l'énumération des prédicats implémentés. Les
     trois autres n'existent que pour valider, et la validation est faite. */
  const schema = schemas['schema.json'], schemaR = schemas['schema-risque.json'];
  return { version:cat.version, sensDeTest:cat.sens_de_test,
           procedures:cat.procedures, sources:src.sources, schema,
           questionnaire:{ version:quest.version, naturesRi:quest.natures_ri,
                           questions:quest.questions },
           independance:{ version:ind.version, rubriques:ind.rubriques,
                          parametres:ind.parametres, naturesSacc:ind.natures_sacc },
           risque:{ version:risq.version, facteurs:risq.facteurs_observes,
                    niveaux:risq.echelle.niveaux, paliers:risq.echelle.paliers,
                    tailles:sansNotes(risq.tailles_echantillon),
                    predicats:schemaR.predicats_facteur,
                    formules:schemaR.formules_taille },
           assertions:{ version:asrt.version, liste:asrt.assertions },
           papier:{ version:pap.version, papiers:sansNotes(pap.papiers),
                    annexes:pap.annexes, mentions:pap.mentions, entete:pap.entete,
                    miseEnPage:pap.mise_en_page, referencement:pap.referencement } };
}

/**
 * Valide et assemble un catalogue à partir de son CONTENU seul — le paquet de
 * six fichiers qu'un cabinet fournit. Les schémas viennent du produit.
 * Lève si les données sont invalides.
 */
export function assemblerCatalogue(contenu, racineSchemas){
  return assembler(contenu, schemasDuProduit(racineSchemas));
}

/** Lit, valide et rend le catalogue du DÉPÔT. Lève si les données sont invalides. */
export function chargerCatalogue(racine){
  const dir = path.join(racine || racineDepot(), 'methodology');
  return assembler(lireDossier(dir, FICHIERS_CONTENU), lireDossier(dir, FICHIERS_SCHEMA));
}

/** Le contenu du dépôt, tel qu'un cabinet le fournirait. Sert au peuplement. */
export function contenuDuDepot(racine){
  return lireDossier(path.join(racine || racineDepot(), 'methodology'), FICHIERS_CONTENU);
}
