import { q01 } from '@/lib/db/client';
import { validate as materialityValidate } from '../materiality';
import { decideDeficiency } from '../sox';
import { statuerEcartWalkthrough } from '../walkthrough-analyse';
import { verifyExtraction } from '../extraction/ladder';
import type { ExtractedField } from '../extraction/fields';
import type { ObjectType } from './types';
import { refus } from '@/lib/core/refus';

// P1-01 — UN APPLICATEUR PAR TYPE BRANCHÉ, JAMAIS UNE RÈGLE MÉTIER DUPLIQUÉE ICI : chaque
// applicateur appelle la fonction de décision qui existait DÉJÀ avant `proposition`
// (`materiality.validate`, `sox.decideDeficiency`, `statuerEcartWalkthrough`, `verifyExtraction`)
// — c'est TOUJOURS elle qui écrit, jamais une seconde écriture inventée ici. `proposition` est
// un INDEX par-dessus ces écritures, pas un remplacement (§797 du plan maître : double vérité
// assumée jusqu'à P3-01).
//
// `valeurRetenue === undefined` signifie « accepter tel que proposé, aucune correction » —
// `propositions.ts::accepter()` passe toujours `undefined` ; `modifier()` passe toujours la
// valeur corrigée par l'humain, jamais `undefined`. Un applicateur qui n'a pas de sens en
// acceptation nue (une décision de branchement, sans valeur par défaut à accepter) le REFUSE
// nommément plutôt que de deviner une décision.
//
// OÙ CE FICHIER S'ARRÊTE DE REGARDER : il ne connaît que les QUATRE types de `types.ts::WIRED`.
// Un type absent d'ici est un type dont `propositions.ts` refuse la statuation (PROP-03) — voir
// `types.ts` et R136 (docs/BACKLOG_REPORTE.md).

export interface Applicateur {
  /**
   * Le rôle, PAR TYPE, au-delà de l'appartenance à l'équipe (`assertMembre`, déjà vérifiée par
   * `propositions.ts` avant d'atteindre ce fichier). Optionnel : « tout membre » (le défaut du
   * mandat pour tout type qui ne le définit pas) n'a rien à ajouter ici. Appelé par
   * `accepter`/`modifier` ET `refuser` — trouvé manquant sur `refuser` par la revue hostile
   * (voix 2, P1-01) : sans cet appel là aussi, un membre sans droit de signer pouvait REFUSER une
   * proposition de matérialité qu'il n'aurait pas eu le droit d'accepter.
   */
  verifierRole?(engagementId: string, userId: string): Promise<void>;
  appliquer(engagementId: string, objectId: string, userId: string, valeurRetenue: unknown): Promise<void>;
}

async function assertRoleSignataireOuManager(engagementId: string, userId: string, geste: string): Promise<void> {
  const r = await q01<{ can_sign: boolean; eng_role: string }>(
    `select can_sign, eng_role from engagement_member where engagement_id = $1 and user_id = $2 and exited_on is null`,
    [engagementId, userId],
  );
  if (!r || !(r.can_sign || r.eng_role === 'manager' || r.eng_role === 'partner')) {
    throw new Error(
      `PROP-04 : ${geste} — seul un signataire (can_sign) ou un manager/partner de ce dossier peut statuer sur une proposition de matérialité`,
    );
  }
}

export const APPLICATEURS: Partial<Record<ObjectType, Applicateur>> = {
  materiality: {
    async verifierRole(engagementId, userId) {
      await assertRoleSignataireOuManager(engagementId, userId, 'statuer sur une proposition de matérialité');
    },
    async appliquer(_engagementId, objectId, userId, valeurRetenue) {
      if (valeurRetenue === undefined) {
        await materialityValidate(objectId, userId);
        return;
      }
      const v = valeurRetenue as { benchmarkCode: string; pct: number };
      await materialityValidate(objectId, userId, { benchmarkCode: v.benchmarkCode, pct: v.pct });
    },
  },

  deficiency: {
    async appliquer(_engagementId, objectId, userId, valeurRetenue) {
      if (valeurRetenue === undefined) {
        const row = await q01<{ severity_proposed: 'deficiency' | 'significant_deficiency' | 'material_weakness' }>(
          `select severity_proposed from deficiency where id = $1`, [objectId],
        );
        if (!row) throw refus('PROP-03B', 'déficience inconnue — la proposition pointe un objet disparu');
        await decideDeficiency(objectId, userId, row.severity_proposed);
        return;
      }
      const v = valeurRetenue as { severity: 'deficiency' | 'significant_deficiency' | 'material_weakness'; rationale?: string };
      await decideDeficiency(objectId, userId, v.severity, v.rationale);
    },
  },

  extraction_field: {
    async appliquer(_engagementId, objectId, userId, valeurRetenue) {
      if (valeurRetenue === undefined) {
        await verifyExtraction(objectId, userId);
        return;
      }
      const v = valeurRetenue as { fields: ExtractedField[] };
      await verifyExtraction(objectId, userId, v.fields);
    },
  },

  walkthrough_gap: {
    async appliquer(_engagementId, objectId, userId, valeurRetenue) {
      if (valeurRetenue === undefined) {
        throw new Error(
          'PROP-05 : un écart de walkthrough n’a pas de valeur par défaut à accepter — statuez la décision '
          + '(question, tâche ou écarté) avec modifier(), jamais un accepter() nu',
        );
      }
      const v = valeurRetenue as { decision: 'question' | 'task' | 'dismissed'; reason?: string };
      await statuerEcartWalkthrough({ gapId: objectId, decision: v.decision, reason: v.reason, userId });
    },
  },
};
