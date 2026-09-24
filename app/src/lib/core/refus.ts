// LA CLASSE `Refus`, LE REGISTRE DES CODES (P1-09, AUD-14).
//
// AVANT CE FICHIER : chaque service levait `new Error('CODE : phrase française
// complète')` — `app/refus.ts::executer()` attrapait TOUT, sans distinguer un
// refus MÉTIER (l'utilisateur doit changer quelque chose) d'une PANNE (SQL,
// réseau, bogue) ; les deux affichaient le même message brut à l'écran. Un
// vrai crash SQL pouvait donc fuiter jusqu'à l'auditeur — exactement ce que
// D.6 interdit (« aucun message technique brut à l'écran »).
//
// CE QUE `Refus` CHANGE : un refus métier porte désormais un CODE (déjà écrit
// par convention en tête du message), un DÉTAIL (le reste de la phrase
// française, préservé mot pour mot — aucune information perdue dans la
// migration des ~63 sites d'appel existants), et des VARS optionnelles pour
// un futur rendu structuré. `executer()` (app/refus.ts) distingue désormais
// un `Refus` (code + détail affichés) d'une AUTRE erreur (PANNE + une ligne
// `server_error`, jamais le message SQL).
//
// CE QUE CE REGISTRE NE FAIT PAS ENCORE (règle 19, où ce fichier cesse de
// regarder) : `cle` pointe une entrée `refus.<CODE>` du catalogue i18n dont le
// texte est **UN PASSE-PLAT** (`'{detail}'`, en et fr) — le DÉTAIL reste en
// français au clic, quelle que soit la langue de session. Traduire chaque
// détail en anglais dépasse le périmètre mécanique de cette tranche (des
// dizaines de phrases FR, plusieurs par code) ; la limite est disclosed,
// jamais tue (R151, docs/BACKLOG_REPORTE.md), et se referme code par code, le
// jour où un besoin réel de bilinguisme sur CE refus précis se présente.
//
// UN CODE ABSENT DU REGISTRE EST UN REFUS QUI NE PEUT PAS SE POSER — `refus()`
// lève immédiatement plutôt que de laisser filer un code jamais catalogué
// (même doctrine que `assertBudgetActifEnBase`, `LIBELLES` : le registre est
// la SEULE source vraie, jamais un code deviné au site d'appel).

export interface DefinitionRefus {
  /** Clé du catalogue i18n (`src/lib/i18n/catalogue.ts`) — un passe-plat sur `detail`
   *  pour l'instant (voir l'en-tête). */
  cle: string;
  /** Regroupement pour la lecture humaine du registre (docs, `langue.ts`) — jamais
   *  utilisé pour une décision de code. */
  famille: string;
}

/** LE REGISTRE — une entrée par code, jamais par site d'appel (plusieurs sites
 *  peuvent lever le MÊME code avec un détail différent ; `refus()` s'en assure). */
export const REGISTRE_REFUS: Record<string, DefinitionRefus> = {
  // Étanchéité (membre.ts) — sécurité, deux réfuteurs à toute modification (règle 30).
  // `ETANCH` (sans numéro) : sections.ts et workpapers/lifecycle.ts, un papier qui
  // n'appartient pas au dossier désigné — trouvé lors du balayage complet de P1-09
  // (règle 31 : la mesure d'origine, « 52 codes » du plan, ne comptait pas les
  // suffixes lettre — PROP-02R, PROP-03B — ni ce code sans numéro ; corrigé ici).
  'ETANCH': { cle: 'refus.ETANCH', famille: 'etancheite' },
  'ETANCH-01': { cle: 'refus.ETANCH-01', famille: 'etancheite' },
  'ETANCH-02': { cle: 'refus.ETANCH-02', famille: 'etancheite' },
  'ETANCH-03': { cle: 'refus.ETANCH-03', famille: 'etancheite' },
  'ETANCH-04': { cle: 'refus.ETANCH-04', famille: 'etancheite' },
  'ETANCH-05': { cle: 'refus.ETANCH-05', famille: 'etancheite' },
  'ETANCH-06': { cle: 'refus.ETANCH-06', famille: 'etancheite' },
  'ETANCH-07': { cle: 'refus.ETANCH-07', famille: 'etancheite' },
  // SOX / contrôle interne (sox.ts).
  'CTRL-01': { cle: 'refus.CTRL-01', famille: 'sox' },
  'CTRL-02': { cle: 'refus.CTRL-02', famille: 'sox' },
  'CTRL-03': { cle: 'refus.CTRL-03', famille: 'sox' },
  'CTRL-04': { cle: 'refus.CTRL-04', famille: 'sox' },
  'CTRL-06': { cle: 'refus.CTRL-06', famille: 'sox' },
  // Programme de procédures (programme.ts).
  'PROG-01': { cle: 'refus.PROG-01', famille: 'programme' },
  'PROG-02': { cle: 'refus.PROG-02', famille: 'programme' },
  'PROG-03': { cle: 'refus.PROG-03', famille: 'programme' },
  'PROG-04': { cle: 'refus.PROG-04', famille: 'programme' },
  'PROG-05': { cle: 'refus.PROG-05', famille: 'programme' },
  'PROG-06': { cle: 'refus.PROG-06', famille: 'programme' },
  'PROG-07': { cle: 'refus.PROG-07', famille: 'programme' },
  'PROG-08': { cle: 'refus.PROG-08', famille: 'programme' },
  // Test d'attributs / grille (testing/grille.ts).
  'COL-01': { cle: 'refus.COL-01', famille: 'test' },
  'TEST-02': { cle: 'refus.TEST-02', famille: 'test' },
  'TEST-03': { cle: 'refus.TEST-03', famille: 'test' },
  'TEST-04': { cle: 'refus.TEST-04', famille: 'test' },
  // Échantillonnage (sampling.ts, account-detail.ts).
  'TIRAGE-02': { cle: 'refus.TIRAGE-02', famille: 'echantillonnage' },
  'TIRAGE-03': { cle: 'refus.TIRAGE-03', famille: 'echantillonnage' },
  'TIRAGE-04': { cle: 'refus.TIRAGE-04', famille: 'echantillonnage' },
  'POP-02': { cle: 'refus.POP-02', famille: 'echantillonnage' },
  'POP-03': { cle: 'refus.POP-03', famille: 'echantillonnage' },
  // Visa / signature (workpapers/lifecycle.ts).
  'VISA-01': { cle: 'refus.VISA-01', famille: 'visa' },
  'VISA-02': { cle: 'refus.VISA-02', famille: 'visa' },
  'VISA-03': { cle: 'refus.VISA-03', famille: 'visa' },
  'VISA-04': { cle: 'refus.VISA-04', famille: 'visa' },
  'NOTE-01': { cle: 'refus.NOTE-01', famille: 'visa' },
  // Demandes (requests.ts).
  'REQ-01': { cle: 'refus.REQ-01', famille: 'demandes' },
  'REQ-02': { cle: 'refus.REQ-02', famille: 'demandes' },
  // Propositions (propositions.ts, propositions/applicateurs.ts).
  'PROP-02': { cle: 'refus.PROP-02', famille: 'propositions' },
  'PROP-02R': { cle: 'refus.PROP-02R', famille: 'propositions' },
  'PROP-03': { cle: 'refus.PROP-03', famille: 'propositions' },
  'PROP-03B': { cle: 'refus.PROP-03B', famille: 'propositions' },
  // Replis mémorisés (replis.ts).
  'REPLI-01': { cle: 'refus.REPLI-01', famille: 'repli' },
  'REPLI-04': { cle: 'refus.REPLI-04', famille: 'repli' },
  // Revue analytique (analytique.ts).
  'ANA-01': { cle: 'refus.ANA-01', famille: 'analytique' },
  'ANA-02': { cle: 'refus.ANA-02', famille: 'analytique' },
};

export class Refus extends Error {
  readonly code: string;
  readonly cle: string;
  readonly vars: Record<string, string | number>;

  constructor(code: string, detail: string, vars: Record<string, string | number> = {}) {
    const def = REGISTRE_REFUS[code];
    if (!def) {
      /* Refuse de laisser passer un code jamais catalogué — un `refus()` mal
         orthographié ou un code neuf jamais ajouté au registre serait sinon
         une PANNE muette (aucune trace de quel refus a été VOULU), au lieu
         d'un signal clair au moment où on l'écrit, pas au moment où un
         auditeur clique dessus. */
      throw new Error(
        `refus() : code « ${code} » absent de REGISTRE_REFUS (lib/core/refus.ts) — `
        + `l'ajouter avant de lever ce refus, jamais un code inconnu du registre.`,
      );
    }
    super(`${code} : ${detail}`);
    this.name = 'Refus';
    this.code = code;
    this.cle = def.cle;
    this.vars = { ...vars, detail };
  }
}

/** Lève un `Refus` — mêmes arguments positionnels que l'ancien `new Error('CODE :
 *  détail')`, migration mécanique : `throw new Error(\`CODE : ${x}\`)` devient
 *  `throw refus('CODE', \`${x}\`)`. */
export function refus(code: string, detail: string, vars?: Record<string, string | number>): Refus {
  return new Refus(code, detail, vars);
}
