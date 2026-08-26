// Le questionnaire RÉSIDUEL de risque est de la méthode versionnée, au même
// titre que le catalogue de procédures. Ces tests vérifient trois choses que
// personne ne peut lire à l'œil sur dix questions : qu'il est valide, qu'il
// reste RÉSIDUEL (chaque question porte la raison pour laquelle elle existe
// encore), et que le validateur ARRÊTE l'assemblage sur une portée ou une
// nature inconnue — deux fautes qui, sans lui, seraient silencieuses.
//
// Zéro appel réseau, comme tout le reste de la suite.

import { describe, expect, it } from 'vitest';
import {
  chargerCatalogue, natureRi, questions, questionsADurerLimitee, racineDepot,
  referencesNonVerifieesQuestion,
} from './catalogue';
import type { Catalogue } from './types';

const cat: Catalogue = await chargerCatalogue();

async function valideur() {
  const chemin = new URL('file://' + racineDepot() + '/methodology/valider.mjs').href;
  return (await import(/* @vite-ignore */ chemin)) as {
    validerQuestionnaire: (q: unknown, s: unknown, sch: unknown) => string[];
  };
}
async function lire(f: string) {
  const fs = await import('node:fs');
  return JSON.parse(fs.readFileSync(racineDepot() + '/methodology/' + f, 'utf8'));
}

describe('questionnaire résiduel de risque', () => {
  it('se charge et se valide contre son schéma', () => {
    expect(cat.questionnaire.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cat.questionnaire.questions.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(cat.questionnaire.naturesRi).length).toBeGreaterThanOrEqual(4);
  });

  it('porte les deux portées : l’entité une fois, la section à chaque cycle', () => {
    expect(questions(cat, 'entite').length).toBeGreaterThanOrEqual(3);
    expect(questions(cat, 'section').length).toBeGreaterThanOrEqual(5);
  });

  it('chaque question dit pourquoi elle existe ENCORE, et ce qu’un « oui » change', () => {
    // Pas de motif sur la prose : une expression régulière sur du français
    // recale les bonnes formulations et laisse passer les mauvaises. Ce qui se
    // vérifie vraiment, c'est qu'aucune raison n'est du remplissage recopié :
    // chacune est écrite pour SA question.
    const vus = new Map<string, string>();
    for (const q of cat.questionnaire.questions) {
      expect(q.pourquoi.length, `${q.code} : raison d’exister trop courte`).toBeGreaterThan(40);
      expect(q.effet.length, `${q.code} : effet non écrit`).toBeGreaterThan(40);
      const deja = vus.get(q.pourquoi);
      expect(deja, `${q.code} : raison d’exister recopiée de ${deja}`).toBeUndefined();
      vus.set(q.pourquoi, q.code);
      expect(q.effet, `${q.code} : l’effet répète la raison au lieu de dire ce qui change`)
        .not.toBe(q.pourquoi);
    }
  });

  it('chaque nature de risque inhérent est déclarée, jamais devinée', () => {
    for (const q of cat.questionnaire.questions) {
      expect(natureRi(cat, q), `${q.code} : nature « ${q.nature} » absente du registre`).toBeDefined();
    }
  });

  it('les questions à durée limitée nomment ce qui les fera disparaître', () => {
    const limitees = questionsADurerLimitee(cat);
    expect(limitees.length).toBeGreaterThanOrEqual(1);
    for (const q of limitees) expect(q.disparait_quand!.length).toBeGreaterThan(20);
    // celle du contrôle interne en fait partie : le module n'existe pas (lot B)
    expect(limitees.map((q) => q.code)).toContain('CI');
  });

  it('reste honnête : toute source citée est encore NON VÉRIFIÉE, et le dit', () => {
    for (const q of cat.questionnaire.questions) {
      expect(q.sources.length).toBeGreaterThanOrEqual(1);
      for (const code of q.sources) {
        expect(cat.sources[code], `${q.code} : source ${code} hors registre`).toBeDefined();
      }
      // état du dépôt aujourd'hui : aucun texte primaire n'a pu être atteint
      expect(referencesNonVerifieesQuestion(cat, q)).toEqual(q.sources);
    }
  });

  it('arrête l’assemblage sur une portée inconnue — jamais un repli silencieux', async () => {
    const { validerQuestionnaire } = await valideur();
    const src = await lire('sources.json');
    const schema = await lire('schema-questionnaire.json');
    const casse = {
      version: '0.0.0',
      natures_ri: cat.questionnaire.naturesRi,
      questions: [{ ...cat.questionnaire.questions[0], portee: 'entité' }],
    };
    expect(validerQuestionnaire(casse, src, schema).join(' | ')).toMatch(/hors énumération/);
  });

  it('arrête l’assemblage sur une nature inconnue et sur un champ inconnu', async () => {
    const { validerQuestionnaire } = await valideur();
    const src = await lire('sources.json');
    const schema = await lire('schema-questionnaire.json');
    const casse = {
      version: '0.0.0',
      natures_ri: cat.questionnaire.naturesRi,
      questions: [
        { ...cat.questionnaire.questions[0], nature: 'intuition', champ_inconnu: true },
        { ...cat.questionnaire.questions[1], sources: ['SOURCE-QUI-N-EXISTE-PAS'] },
      ],
    };
    const e = validerQuestionnaire(casse, src, schema).join(' | ');
    expect(e).toMatch(/nature « intuition » absente/);
    expect(e).toMatch(/inconnu du schéma/);
    expect(e).toMatch(/absente du registre/);
  });

  it('refuse un questionnaire dont une portée entière est vide', async () => {
    const { validerQuestionnaire } = await valideur();
    const src = await lire('sources.json');
    const schema = await lire('schema-questionnaire.json');
    const casse = {
      version: '0.0.0',
      natures_ri: cat.questionnaire.naturesRi,
      questions: questions(cat, 'section'),
    };
    expect(validerQuestionnaire(casse, src, schema).join(' | '))
      .toMatch(/aucune question de portée « entite »/);
  });
});
