import { q, q01 } from '@/lib/db/client';
import { currentRevenueSample } from '@/lib/services/sampling';
import { latestExtraction } from '@/lib/services/extraction/ladder';
import { frameworkSet } from '@/lib/services/fsli';
import { primaryPack } from '@/lib/packs';
import { fmtEur } from '@/lib/kernel/canon';
import { champsLigneEchantillon, type PieceDeLigne } from './draft';

// L'ATELIER DU CONTRÔLE SUR PIÈCES (point 10, ADR-104). Une seule assemblée
// de données pour l'écran où l'auditeur passera son temps : chaque ligne de
// l'échantillon avec sa pièce, sa comparaison LISIBLE (valeur pièce, valeur
// GL, écart, tolérance, règle), son motif de sélection, sa provenance, et la
// ligne de papier qu'elle produira — formatée par LE MÊME formateur que le
// papier lui-même.

export interface ComparaisonLigne {
  regle: string;           // « montant (tolérance 1 %) », « rattachement (± 5 j) »…
  attendu: string;         // la valeur du grand livre (ou de la règle)
  trouve: string;          // la valeur relevée sur la pièce
  tolerance: string;
  conforme: boolean;
}

export interface LigneAtelier {
  sampleItemId: string;
  piece: string;                     // référence métier (piece_ref/entry_no)
  naturalKey: string;
  tiers: string;
  dateGl: string;
  montantGl: string;                 // formaté
  motif: string;                     // couverture exhaustive / tirage / marqueur de risque / reporté
  statut: 'a_traiter' | 'a_verifier' | 'complete' | 'ecart';
  evidences: { id: string; filename: string; docType: string | null; sha256: string }[];
  extraction: {
    id: string; statut: string; rung: string;
    fields: { name: string; value: string; confidence: number }[];
    verifiePar: string | null; verifieLe: string | null;
  } | null;
  comparaisons: ComparaisonLigne[];
  exceptions: { id: string; taxonomy: string; statut: string }[];
  /** La ligne telle qu'elle sortira au papier — même formateur que le papier. */
  papier: Record<string, string>;
}

const MOTIFS: Record<string, string> = {
  high_value: 'couverture exhaustive (≥ seuil)',
  random: 'tirage en unités monétaires',
  risk_flag: 'marqueur de risque',
  carried_forward: 'reporté de N-1',
};

const REGLES: Record<string, (tol: string) => string> = {
  document_present: () => 'pièce présente',
  amount: (t) => `montant (tolérance ${t})`,
  date: () => 'date dans l\'exercice',
  cutoff: (t) => `rattachement (${t})`,
  counterparty: () => 'tiers de la facture',
  delivery_present: () => 'bon de livraison présent',
  qty: (t) => `quantité livrée (${t})`,
  price: (t) => `prix unitaire (${t})`,
};

export function libelleRegle(check: string, tolerance: string): string {
  return (REGLES[check] ?? (() => check))(tolerance);
}

export async function lignesAtelier(engagementId: string): Promise<{
  lignes: LigneAtelier[];
  premierNonFini: string | null;
}> {
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const fr = pack.language === 'fr';
  const eur = (c: number) => fmtEur(c, pack.language);
  const sample = await currentRevenueSample(engagementId);
  if (!sample || sample.status !== 'drawn') return { lignes: [], premierNonFini: null };

  const lignes: LigneAtelier[] = [];
  for (const it of sample.items) {
    const evidences = await q<PieceDeLigne & { sha256: string }>(
      `select e.id, e.sha256, e.doc_type, e.filename from evidence e
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.quarantined = false
       order by e.doc_type`,
      [it.id],
    );
    const inv = evidences.find((e) => e.doc_type === 'invoice' || e.doc_type === 'credit_note');
    const x = inv ? await latestExtraction(inv.id) : null;
    const verif = x?.verified_by
      ? await q01<{ nom: string; quand: string }>(
          `select u.name nom, e.verified_at::text quand from extraction e join app_user u on u.id = e.verified_by where e.id = $1`,
          [x.id],
        )
      : null;
    const match = await q01<{ status: string; checks: { check: string; pass: boolean; expected: string; found: string; tolerance: string }[] }>(
      `select status, checks from match where sample_item_id = $1`, [it.id],
    );
    const exceptions = await q<{ id: string; taxonomy_code: string; status: string }>(
      `select id::text id, taxonomy_code, status from exception where sample_item_id = $1`, [it.id],
    );
    const cle = await q01<{ natural_key: string }>(
      `select g.natural_key from gl_entry g where g.id = $1`, [it.unit_id],
    );

    const aExtraireOuVerifier = Boolean(x && x.status === 'pending_verify');
    const aEcartOuvert = exceptions.some((e) => e.status !== 'resolved');
    const statut: LigneAtelier['statut'] = aEcartOuvert ? 'ecart'
      : aExtraireOuVerifier ? 'a_verifier'
      : match && (it.status === 'tested' || it.status === 'complete') ? 'complete'
      : 'a_traiter';

    lignes.push({
      sampleItemId: it.id,
      piece: it.piece_ref ?? it.entry_no,
      naturalKey: cle?.natural_key ?? '',
      tiers: it.aux_label ?? '',
      dateGl: it.entry_date,
      montantGl: eur(Math.round(Number(it.amount) * 100)),
      motif: MOTIFS[it.selection_reason] ?? it.selection_reason,
      statut,
      evidences: evidences.map((e) => ({ id: e.id, filename: e.filename, docType: e.doc_type, sha256: e.sha256 })),
      extraction: x ? {
        id: x.id, statut: x.status, rung: x.rung,
        fields: x.fields.map((f) => ({ name: f.name, value: f.value, confidence: f.confidence })),
        verifiePar: verif?.nom ?? null, verifieLe: verif?.quand ?? null,
      } : null,
      comparaisons: (match?.checks ?? []).map((c) => ({
        regle: libelleRegle(c.check, c.tolerance),
        attendu: c.expected, trouve: c.found, tolerance: c.tolerance, conforme: c.pass,
      })),
      exceptions: exceptions.map((e) => ({ id: e.id, taxonomy: e.taxonomy_code, statut: e.status })),
      papier: champsLigneEchantillon({
        fr, eur, it, evidences,
        extraction: x ? { rung: x.rung, verified_by: x.verified_by, fields: x.fields } : null,
        match, exceptions: exceptions.map((e) => ({ taxonomy_code: e.taxonomy_code, status: e.status })),
      }),
    });
  }
  const nonFini = lignes.find((l) => l.statut === 'a_traiter' || l.statut === 'a_verifier');
  return { lignes, premierNonFini: nonFini?.sampleItemId ?? null };
}
