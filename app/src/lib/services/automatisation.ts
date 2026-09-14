import { q, q01 } from '@/lib/db/client';
import { assertMembre } from '@/lib/core/membre';
import { frameworkSet } from './fsli';
import { primaryPack } from '@/lib/packs';
import type { NiveauAutomatisation } from '@/lib/packs/types';

// LE DEGRÉ D'AUTOMATISATION DE L'AGENT IA — mandat 2026-09-14, §2.
//
// UNE ÉCHELLE FERMÉE ET NOMMÉE (§2.1) : L0 (l'agent est éteint pour ce
// périmètre), L1 (il suggère À CÔTÉ, rien n'entre jamais dans un champ du
// dossier — ce niveau n'est pas encore CONSOMMÉ par un écran : le poser
// aujourd'hui n'empêcherait rien de plus que L2, puisqu'aucun écran ne
// distingue encore « suggéré à côté » de « proposé dans les champs ». Le
// type l'accepte pour que le refus AUTO-01 puisse le nommer et pour qu'un
// futur écran ait où se brancher — CE QU'IL NE FAIT PAS AUJOURD'HUI (règle
// 19) : changer le comportement d'aucun écran existant.), L2 (il propose
// DANS les champs, chaque élément exige une validation humaine tracée — LE
// PLAFOND PERMANENT, déjà en vigueur PARTOUT dans ce produit avant même ce
// mandat, CLAUDE.md règle 7). `L3` n'existe pas dans le type
// (`NiveauAutomatisation`, packs/types.ts) : AUCUN refus n'a jamais besoin
// de s'exercer contre une valeur que rien ne peut produire.
//
// DEUX NIVEAUX, DEUX RÔLES (§2.2, §2.3) :
//   - LE PLAFOND DU PACK (`AssurancePack.automationLevel`, packs/types.ts) —
//     du CONTENU de pack, jamais une bifurcation de code (règle 9). Absent
//     ⇒ L2 (le défaut SÛR déjà en vigueur, pas un refus — voir le
//     commentaire du champ lui-même).
//   - LE RÉGLAGE DE LA MISSION (`engagement.automation_level`, migration
//     0164) — réglable UNIQUEMENT vers le bas par rapport au plafond du
//     pack (§2.2). `definirNiveauMission` est le SEUL chemin qui l'écrit ;
//     AUTO-01 refuse tout ce qui dépasserait le plafond.
//
// LA DONNÉE IMMUABLE (§2.3, AUTO-02) : `ai_run.niveau_automatisation`
// (migration 0164, NOT NULL, sans défaut) porte le niveau RÉELLEMENT en
// vigueur à l'INSTANT où CET élément précis a été produit — jamais
// recalculé après coup, jamais réécrit quand le réglage de la mission
// change plus tard. `recordAiRun` (core/airuns.ts) refuse (AUTO-02) tout
// appel sans cette valeur ; la colonne NOT NULL est la défense en
// profondeur si un chemin futur contournait le typage TypeScript.
//
// CE QUE CE SERVICE NE FAIT PAS (règle 19) : il ne distingue pas encore L1
// de L2 à l'exécution (aucun écran ne consomme L1 aujourd'hui — voir plus
// haut) ; il ne dit rien de QUI a le droit de poser le réglage de mission
// au-delà de l'appartenance au dossier (`assertMembre`) — le même flou,
// assumé, que la publication de `firm_methodology` (aucun rôle plus fin
// n'existe encore dans ce dépôt, revue de recherche du 2026-09-14).

const ORDRE: Record<NiveauAutomatisation, number> = { L0: 0, L1: 1, L2: 2 };

/** Le plafond posé par le pack — jamais `verifie:false` (voir le commentaire
 *  du champ, packs/types.ts) : `undefined` veut dire L2, le défaut déjà sûr. */
export function plafondDuPack(pack: { automationLevel?: NiveauAutomatisation }): NiveauAutomatisation {
  return pack.automationLevel ?? 'L2';
}

/** Défense en profondeur, ISOLÉE pour s'éprouver seule (règle 17) : un
 *  réglage de mission qui dépasserait le plafond (une écriture SQL directe,
 *  jamais un chemin de ce dépôt — `definirNiveauMission` refuse déjà à
 *  l'écriture) est plafonné, jamais lu tel quel. */
export function capperNiveau(mission: NiveauAutomatisation, plafond: NiveauAutomatisation): NiveauAutomatisation {
  return ORDRE[mission] <= ORDRE[plafond] ? mission : plafond;
}

/** Un réglage de mission dépasse-t-il le plafond de SON pack ? PREND LE PACK
 *  DÉJÀ RÉSOLU plutôt que de le résoudre elle-même (revue hostile du
 *  2026-09-14, voix 1 ET 2, même constat ÉLEVÉ/MOYEN indépendamment) :
 *  aucun des deux packs réels (nep-fr, pcaob-sox) ne pose encore de plafond
 *  sous L2 — une version qui résolvait le pack par le REGISTRE réel ne
 *  pouvait donc jamais être éprouvée contre un dépassement authentique,
 *  seulement contre le cas trivial « L2 contre L2 ». Prendre le pack en
 *  paramètre rend la fonction testable avec un pack FICTIF qui pose un
 *  plafond bas — le cas connu mauvais que règle 17 exige — sans dépendre du
 *  contenu des packs d'aujourd'hui. `definirNiveauMission` et la lecture
 *  `/api/sante` AUTO-01 (route.ts) l'utilisent TOUTES LES DEUX — jamais un
 *  second calcul. */
export function depasseLePlafond(mission: NiveauAutomatisation, pack: { automationLevel?: NiveauAutomatisation }): boolean {
  return ORDRE[mission] > ORDRE[plafondDuPack(pack)];
}

/** Le niveau RÉELLEMENT en vigueur sur ce dossier, à l'instant de l'appel :
 *  le réglage de la mission s'il est posé, sinon le plafond du pack. */
export async function niveauEffectif(engagementId: string): Promise<NiveauAutomatisation> {
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const plafond = plafondDuPack(pack);
  const row = await q01<{ automation_level: NiveauAutomatisation | null }>(
    `select automation_level from engagement where id = $1`,
    [engagementId],
  );
  const mission = row?.automation_level ?? null;
  return mission ? capperNiveau(mission, plafond) : plafond;
}

/** LE SEUL CHEMIN qui écrit `engagement.automation_level`. AUTO-01 (§2.2) :
 *  une mission ne peut jamais être plus permissive que son cabinet. */
export async function definirNiveauMission(
  engagementId: string, niveau: NiveauAutomatisation, userId: string,
): Promise<void> {
  await assertMembre(engagementId, userId, 'définir le niveau d’automatisation de la mission');
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  if (depasseLePlafond(niveau, pack)) {
    throw new Error(
      `AUTO-01 : le niveau ${niveau} dépasse le plafond en vigueur (${plafondDuPack(pack)}, posé par `
      + `le pack ${pack.id}) — une mission peut être plus prudente que son cabinet, jamais plus `
      + 'permissive (mandat 2026-09-14, §2.2).',
    );
  }
  await q(`update engagement set automation_level = $2 where id = $1`, [engagementId, niveau]);
}

/** À appeler AVANT toute tentative d'appel IA réel, au même titre que
 *  `assertBudgetActifEnBase` (IA-BUDGET-01) — les DEUX gardes sont
 *  indépendantes, aucune ne remplace l'autre (§2.4). Refuse (AUTO-01) si le
 *  niveau effectif est L0 : l'agent est éteint pour ce périmètre.
 *
 *  `niveauDejaLu` (revue hostile du 2026-09-14, voix 1 ET 2, même constat
 *  ÉLEVÉ/MOYEN indépendamment) : l'appelant qui a DÉJÀ lu le niveau (pour la
 *  garde) doit passer CETTE valeur, jamais laisser cette fonction relire —
 *  une seconde lecture, après le vrai appel IA (parfois plusieurs secondes
 *  plus tard), ouvre une fenêtre où `definirNiveauMission` change le réglage
 *  ENTRE la garde et l'écriture de `ai_run.niveau_automatisation` : la ligne
 *  porterait alors un niveau qui n'a JAMAIS accompagné l'appel réel — l'exact
 *  contraire de ce qu'AUTO-02/§2.3 promet. Les quatre sites d'appel réels ne
 *  lisent donc plus qu'UNE fois, et réutilisent la même valeur pour la garde
 *  et pour le timbre. */
export async function assertNiveauOuvert(engagementId: string, niveauDejaLu?: NiveauAutomatisation): Promise<NiveauAutomatisation> {
  const niveau = niveauDejaLu ?? await niveauEffectif(engagementId);
  if (niveau === 'L0') {
    throw new Error(
      'AUTO-01 : l’agent IA est éteint (niveau L0) sur ce dossier — aucun appel ne part '
      + '(mandat 2026-09-14, §2.1).',
    );
  }
  return niveau;
}
