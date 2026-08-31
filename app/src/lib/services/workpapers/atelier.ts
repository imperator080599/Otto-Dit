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

export interface ExtractionDePiece {
  id: string; statut: string; rung: string;
  fields: { name: string; value: string; confidence: number }[];
  verifiePar: string | null; verifieLe: string | null;
  /** Coût réel de la lecture (ai_run), en dollars — 0 pour les échelons gratuits et le rejeu. */
  coutUsd: number;
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
  /* CHAQUE PIÈCE PORTE SA LECTURE. La première version n'exposait que
     l'extraction de la FACTURE : un bon de livraison en attente d'attestation
     était invisible — un objet créé qu'aucun chemin de lecture n'atteignait
     (règle 13), trouvé en conduisant le mode IA réelle. L'attestation
     appartient à la pièce OUVERTE, pas à un type privilégié. Les pièces les
     plus récentes d'un même type passent devant : c'est ce que le vouching
     utilise (loadItemContext, la plus récente attestée). */
  evidences: {
    id: string; filename: string; docType: string | null; sha256: string;
    extraction: ExtractionDePiece | null;
  }[];
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
    /* Les plus récentes d'abord, par type — l'ordre du vouching. */
    const evidences = await q<PieceDeLigne & { sha256: string }>(
      `select e.id, e.sha256, e.doc_type, e.filename from evidence e
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.quarantined = false
       order by e.doc_type, e.created_at desc`,
      [it.id],
    );
    /* CHAQUE pièce porte sa lecture — y compris celles en attente : c'est ICI
       qu'elles deviennent atteignables et attestables (règle 13). */
    const parPiece: (ExtractionDePiece | null)[] = [];
    for (const ev of evidences) {
      const x = await latestExtraction(ev.id);
      if (!x) { parPiece.push(null); continue; }
      const verif = x.verified_by
        ? await q01<{ nom: string; quand: string }>(
            `select u.name nom, e.verified_at::text quand from extraction e join app_user u on u.id = e.verified_by where e.id = $1`,
            [x.id],
          )
        : null;
      const cout = await q01<{ usd: string }>(
        `select r.cost_usd::text usd from extraction e join ai_run r on r.id = e.ai_run_id where e.id = $1`,
        [x.id],
      );
      parPiece.push({
        id: x.id, statut: x.status, rung: x.rung,
        fields: x.fields.map((f) => ({ name: f.name, value: f.value, confidence: f.confidence })),
        verifiePar: verif?.nom ?? null, verifieLe: verif?.quand ?? null,
        coutUsd: Number(cout?.usd ?? 0),
      });
    }
    /* Le papier cite la lecture que le VOUCHING utilise : la facture la plus
       récente dont la lecture n'est PAS en attente — même règle que
       loadItemContext et que draft.ts (règle 16 : même formateur, même choix). */
    let xPapier: { rung: string; verified_by: string | null; fields: { name: string; value: string; confidence: number; page: number }[] } | null = null;
    for (let i = 0; i < evidences.length; i++) {
      const e = evidences[i];
      if (e.doc_type !== 'invoice' && e.doc_type !== 'credit_note') continue;
      const px = parPiece[i];
      if (px && px.statut !== 'pending_verify') {
        const brut = await latestExtraction(e.id);
        if (brut) xPapier = { rung: brut.rung, verified_by: brut.verified_by, fields: brut.fields };
        break;
      }
    }
    const match = await q01<{ status: string; checks: { check: string; pass: boolean; expected: string; found: string; tolerance: string }[] }>(
      `select status, checks from match where sample_item_id = $1`, [it.id],
    );
    const exceptions = await q<{ id: string; taxonomy_code: string; status: string }>(
      `select id::text id, taxonomy_code, status from exception where sample_item_id = $1`, [it.id],
    );
    const cle = await q01<{ natural_key: string }>(
      `select g.natural_key from gl_entry g where g.id = $1`, [it.unit_id],
    );

    const aExtraireOuVerifier = parPiece.some((x) => x?.statut === 'pending_verify');
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
      evidences: evidences.map((e, i) => ({
        id: e.id, filename: e.filename, docType: e.doc_type, sha256: e.sha256,
        extraction: parPiece[i],
      })),
      comparaisons: (match?.checks ?? []).map((c) => ({
        regle: libelleRegle(c.check, c.tolerance),
        attendu: c.expected, trouve: c.found, tolerance: c.tolerance, conforme: c.pass,
      })),
      exceptions: exceptions.map((e) => ({ id: e.id, taxonomy: e.taxonomy_code, statut: e.status })),
      papier: champsLigneEchantillon({
        fr, eur, it, evidences,
        extraction: xPapier,
        match, exceptions: exceptions.map((e) => ({ taxonomy_code: e.taxonomy_code, status: e.status })),
      }),
    });
  }
  /* « Non finie » : une ligne encore à traiter/vérifier, OU une ligne — même
     en écart — dont une pièce porte une lecture en attente d'attestation. */
  const nonFini = lignes.find((l) =>
    l.statut === 'a_traiter' || l.statut === 'a_verifier'
    || l.evidences.some((e) => e.extraction?.statut === 'pending_verify'));
  return { lignes, premierNonFini: nonFini?.sampleItemId ?? null };
}
