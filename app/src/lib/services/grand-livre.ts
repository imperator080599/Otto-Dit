import { q, q1 } from '@/lib/db/client';
import { numToCents } from '@/lib/util/num';
import type { JeFlag } from '@/lib/kernel/types';

/**
 * H-3, SLICE 1 (Lot 7, `docs/REGISTRE_IDEES.md` §H) : « l'analytique en population COMPLÈTE à
 * côté du sondage, avec l'énoncé honnête de ce qu'un test exhaustif couvre et ne couvre pas ».
 *
 * NE CRÉE RIEN DE NOUVEAU : `computeFlags` (ADR-003, `kernel/flags.ts`) tourne déjà, à l'IMPORT,
 * sur TOUT le grand livre importé (`imports.ts`, `computeFlags(parsed.rows, …)` — pas un
 * sous-ensemble filtré par cycle ni par poste). Le résultat est stocké sur CHAQUE `gl_entry`
 * (`flags` jsonb), mais AUCUN écran ne le rendait visible sur la population entière avant cette
 * slice — seul le sous-ensemble déjà repris par un TIRAGE (MANUEL/FRAUDE, Lot 6 tranche 3,
 * `sampling-je.ts`) l'exploitait, au grain d'un `sample`, jamais celui de « 100% des écritures ».
 * Cette fonction ne fait que LIRE et AGRÉGER ce qui existe déjà — zéro nouvelle règle de
 * détection, zéro migration.
 *
 * L'ÉNONCÉ HONNÊTE (le second volet du critère d'admission H-3, ce qu'une règle couvre et ne
 * couvre pas) vit dans le CATALOGUE (`i18n/catalogue.ts`, clés `gl.regle.<code>.*`), jamais ici —
 * un service ne porte pas de libellé en dur (langue.ts le détecte et le refuse). Cette fonction
 * ne renvoie que le CODE de chaque règle (`JeFlag`) ; l'écran traduit.
 *
 * CE QUE CETTE FONCTION NE FAIT PAS (règle 19) : elle ne recalcule PAS les flags depuis les
 * colonnes brutes — elle LIT la colonne `gl_entry.flags` déjà écrite à l'import. Si cette colonne
 * dérivait de la vraie règle (bug, migration de données, edit manuel hors du chemin gardé), cette
 * fonction ne le verrait pas — c'est le rôle de la lecture `/api/sante` sœur (route.ts), qui
 * RE-DÉRIVE une règle indépendamment en SQL et compare (règle 16).
 */

const REGLES: JeFlag[] = ['weekend', 'round_amount', 'manual_journal', 'period_end', 'credit_note_pattern', 'late_validation'];

export interface ReglesGL {
  regle: JeFlag;
  nombre: number;
  exemples: {
    entryNo: string; entryDate: string; accountNo: string; label: string | null;
    montantCents: number; pieceRef: string | null;
  }[];
}

export async function testExhaustifGrandLivre(engagementId: string): Promise<{ total: number; regles: ReglesGL[] }> {
  const totalRow = await q1<{ n: string }>(
    `select count(*) n from gl_entry where engagement_id = $1 and status = 'active'`,
    [engagementId],
  );
  const total = Number(totalRow.n);
  const regles: ReglesGL[] = [];
  for (const code of REGLES) {
    const countRow = await q1<{ n: string }>(
      `select count(*) n from gl_entry where engagement_id = $1 and status = 'active' and flags @> $2::jsonb`,
      [engagementId, JSON.stringify([code])],
    );
    const exemples = await q<{
      entry_no: string; entry_date: string; account_no: string; label: string | null;
      debit: string; credit: string; piece_ref: string | null;
    }>(
      `select entry_no, entry_date::text, account_no, label, debit::text, credit::text, piece_ref
       from gl_entry where engagement_id = $1 and status = 'active' and flags @> $2::jsonb
       order by entry_date desc, entry_no limit 10`,
      [engagementId, JSON.stringify([code])],
    );
    regles.push({
      regle: code,
      nombre: Number(countRow.n),
      exemples: exemples.map((e) => ({
        entryNo: e.entry_no,
        entryDate: e.entry_date,
        accountNo: e.account_no,
        label: e.label,
        montantCents: numToCents(e.debit) > 0 ? numToCents(e.debit) : numToCents(e.credit),
        pieceRef: e.piece_ref,
      })),
    });
  }
  return { total, regles };
}
