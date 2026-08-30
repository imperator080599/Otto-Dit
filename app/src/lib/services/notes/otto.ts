import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { extractAll, extractEvidence } from '@/lib/services/extraction/ladder';
import { runMatching } from '@/lib/services/matching';
import { resoudreAncre, type Ancre } from './ancres';

// UNE NOTE ATTRIBUÉE À OTTO EST UNE INSTRUCTION QU'IL EXÉCUTE — sous trois
// règles non négociables :
//   1. OTTO RÉPOND, IL NE CLÔT PAS. Sa réponse fait passer la note
//      « adressée » ; seul un humain clôt (transitionNote exige un app_user —
//      OTTO n'en est pas un, la contrainte le dit).
//   2. OTTO REFUSE CE QUI N'EST PAS DE SON RESSORT — conclure, estimer,
//      juger, signer — avec la liste de ce qu'il sait faire. Même discipline
//      que l'interface Interroger : un catalogue FERMÉ, un refus typé, jamais
//      un service rendu à moitié.
//   3. SA RÉPONSE ENTRE AU DOSSIER : ce qui a été demandé, ce qu'il a fait,
//      sur quelles pièces, ce qui reste à vérifier — en clair dans la réponse
//      et en structuré dans payload. C'est ce que les guidances sur l'IA en
//      audit demandent : chaque instruction donnée à la machine documentée.
//
// LA COMPRÉHENSION EST DÉTERMINISTE (P4) : des mots-clés, comme
// query/rules.ts — pas de LLM pour deviner une intention quand une règle
// suffit. Un LLM viendra peut-être proposer une interprétation À CONFIRMER
// (le modèle de la colonne ajoutée) ; il ne viendra jamais exécuter sur une
// simple ressemblance.

export interface Capacite {
  code: 'relancer_extraction' | 'relancer_vouching' | 'etat_completude';
  libelle: string;
  motifs: RegExp;
}

export const CAPACITES: Capacite[] = [
  {
    code: 'relancer_extraction',
    libelle: 'reprendre la lecture des pièces (extraction) — résultats en file de vérification humaine',
    motifs: /extra(ction|is|ire)|relev[eé]|relire|lecture|ocr|oubli[ée].{0,20}(champ|quantit|montant|date)|champ.{0,20}(manqu|vide)|reprends?.{0,20}(la lecture|l['']extraction)/i,
  },
  {
    code: 'relancer_vouching',
    libelle: 'rejouer le vouching déterministe (L0) de l\'échantillon contre les pièces reçues',
    motifs: /vouching|rapproch|rejou|contr[oô]les?\s+(automatiq|l0|de coh[ée]rence)/i,
  },
  {
    code: 'etat_completude',
    libelle: 'dresser l\'état d\'un élément : pièces reçues, champs relevés, contrôles passés',
    motifs: /compl[ée]tude|o[uù] en (est|sommes)|manque|[ée]tat des lieux|r[ée]sume|inventaire des pi[eè]ces/i,
  },
];

/** Ce qui appartient à l'HUMAIN — refusé par principe, pas par incapacité. */
const RESSORT_HUMAIN = /conclu|estim|jug|raisonnable|opinion|appr[ée]ci|signe|vise|visa|cl[oô]t|clore|valide (la|le|l['']) |approuv/i;

export type Comprehension =
  | { verdict: 'execute'; capacite: Capacite }
  | { verdict: 'refuse'; motif: string };

function listeCapacites(): string {
  return CAPACITES.map((c) => `« ${c.libelle} »`).join(' ; ');
}

/** Déterministe, et REFUSE le doute : mieux vaut redemander qu'exécuter autre
 *  chose que ce qui a été demandé — une donnée fausse dans un papier de
 *  travail est le pire défaut possible de ce produit. */
export function comprendreInstruction(texte: string): Comprehension {
  if (RESSORT_HUMAIN.test(texte)) {
    return {
      verdict: 'refuse',
      motif: 'hors de mon ressort : conclure, estimer, juger, signer ou clore appartient '
        + `à l'équipe (plafond L2). Ce que je sais faire : ${listeCapacites()}.`,
    };
  }
  const touchees = CAPACITES.filter((c) => c.motifs.test(texte));
  if (touchees.length === 0) {
    return {
      verdict: 'refuse',
      motif: `je ne reconnais pas cette instruction. Ce que je sais faire : ${listeCapacites()}. `
        + 'Reformulez avec l\'un de ces gestes, ou adressez la note à un membre de l\'équipe.',
    };
  }
  if (touchees.length > 1) {
    return {
      verdict: 'refuse',
      motif: `l'instruction peut vouloir dire ${touchees.map((c) => `« ${c.libelle} »`).join(' ou ')} — `
        + 'précisez, je n\'exécute pas sur un doute.',
    };
  }
  return { verdict: 'execute', capacite: touchees[0] };
}

export interface CompteRenduOtto {
  demande: string;
  verdict: 'execute' | 'refuse';
  capacite?: string;
  motif_refus?: string;
  fait: string[];
  pieces: { id: string; filename: string }[];
  reste_a_verifier: string;
}

/**
 * Exécute (ou refuse) une note attribuée à OTTO, et ÉCRIT SA RÉPONSE AU
 * DOSSIER. Un refus laisse la note OUVERTE — rien n'a été traité ; une
 * exécution la passe « adressée », et un humain clôt.
 */
export async function executerNoteOtto(noteId: string): Promise<{ verdict: 'execute' | 'refuse'; replyId: string }> {
  const note = await q1<{
    id: string; engagement_id: string; status: string; assignee_kind: string; text: string;
    anchor_kind: string | null; anchor_ref: string | null; anchor_field: string | null; anchor_label: string | null;
  }>(
    `select id, engagement_id, status, assignee_kind, text,
            anchor_kind, anchor_ref, anchor_field, anchor_label
     from review_note where id = $1`,
    [noteId],
  );
  if (note.assignee_kind !== 'otto') throw new Error('cette note n\'est pas adressée à OTTO');
  if (note.status === 'closed') throw new Error('note close — une note close ne se rouvre pas');
  const ctx = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [note.engagement_id]);

  const compr = comprendreInstruction(note.text);
  const cr: CompteRenduOtto = {
    demande: note.text, verdict: compr.verdict, fait: [], pieces: [],
    reste_a_verifier: '',
  };
  let texteReponse: string;

  if (compr.verdict === 'refuse') {
    cr.motif_refus = compr.motif;
    cr.reste_a_verifier = 'tout — rien n\'a été exécuté.';
    texteReponse = `Je refuse : ${compr.motif}`;
  } else {
    cr.capacite = compr.capacite.code;
    /* Le périmètre d'exécution : l'ANCRE de la note quand elle en a une —
       « ces trois lignes », c'est l'ancre qui le dit — sinon la mission. */
    const cibles = note.anchor_kind === 'sample_item'
      ? (await resoudreAncre(note.engagement_id, {
          kind: 'sample_item', ref: note.anchor_ref!, field: note.anchor_field, label: note.anchor_label ?? '',
        } as Ancre)).cibles
      : [];

    switch (compr.capacite.code) {
      case 'relancer_extraction': {
        const evidences = cibles.length
          ? await q<{ id: string; filename: string }>(
              `select e.id::text id, e.filename from evidence e
               join request_item ri on ri.id = e.request_item_id
               where ri.sample_item_id = any($1::uuid[]) and e.quarantined = false`,
              [cibles],
            )
          : [];
        if (cibles.length && evidences.length === 0) {
          cr.fait.push('aucune pièce reçue sur l\'élément visé — rien à relire.');
          cr.reste_a_verifier = 'la pièce elle-même : demandez-la au client (écran Demandes).';
        } else if (cibles.length) {
          let enFile = 0;
          for (const ev of evidences) {
            const res = await extractEvidence(ev.id, null);
            cr.pieces.push({ id: ev.id, filename: ev.filename });
            cr.fait.push(`${ev.filename} : relu (échelon ${res.rung}), ${res.fieldCount} champ(s) relevé(s).`);
            if (res.status === 'pending_verify') enFile += 1;
          }
          cr.reste_a_verifier = enFile > 0
            ? `${enFile} extraction(s) en file de vérification humaine — rien n'entre au papier sans attestation (L2).`
            : 'les champs relevés aux échelons déterministes ; le papier se réassemble sur demande.';
        } else {
          const res = await extractAll(note.engagement_id, null);
          cr.fait.push(`extraction relancée sur toutes les pièces : ${res.processed} document(s) traité(s).`);
          cr.reste_a_verifier = `${res.pendingVerify} extraction(s) en file de vérification humaine — rien n'entre au papier sans attestation (L2).`;
        }
        break;
      }
      case 'relancer_vouching': {
        const res = await runMatching(note.engagement_id, null);
        cr.fait.push(`vouching déterministe rejoué : ${res.matched} rapproché(s), ${res.exceptions} exception(s), ${res.pending} en attente.`);
        cr.reste_a_verifier = res.exceptions > 0
          ? `${res.exceptions} exception(s) à instruire par l'équipe (écran Exceptions).`
          : 'la revue humaine des rapprochements.';
        break;
      }
      case 'etat_completude': {
        const etats = cibles.length
          ? await q<{ id: string; pieces: string; extraites: string; verifiees: string; statut: string | null }>(
              `select si.id::text id,
                      (select count(*) from evidence e join request_item ri on ri.id = e.request_item_id
                        where ri.sample_item_id = si.id and e.quarantined = false)::text pieces,
                      (select count(*) from extraction x join evidence e on e.id = x.evidence_id
                        join request_item ri on ri.id = e.request_item_id
                        where ri.sample_item_id = si.id)::text extraites,
                      (select count(*) from extraction x join evidence e on e.id = x.evidence_id
                        join request_item ri on ri.id = e.request_item_id
                        where ri.sample_item_id = si.id and x.status = 'verified')::text verifiees,
                      (select m.status from match m where m.sample_item_id = si.id) statut
               from sample_item si where si.id = any($1::uuid[])`,
              [cibles],
            )
          : [];
        if (!etats.length) {
          cr.fait.push('la note ne vise aucun élément d\'échantillon actuel — l\'état de complétude se dresse par élément.');
          cr.reste_a_verifier = 'ancrez la note sur une ligne du tableau de testing.';
        } else {
          for (const e of etats) {
            cr.fait.push(`élément ${e.id.slice(0, 8)} : ${e.pieces} pièce(s), ${e.extraites} extraction(s) dont ${e.verifiees} vérifiée(s), vouching « ${e.statut ?? 'non testé'} ».`);
          }
          cr.reste_a_verifier = 'les vérifications d\'extraction en attente, et l\'instruction des exceptions.';
        }
        break;
      }
    }
    texteReponse = `Fait — ${compr.capacite.libelle}. ${cr.fait.join(' ')} Reste à vérifier : ${cr.reste_a_verifier}`;
  }

  const reply = await q1<{ id: string }>(
    `insert into review_note_reply (note_id, engagement_id, author_kind, author_id, text, payload)
     values ($1, $2, 'otto', null, $3, $4::jsonb) returning id`,
    [noteId, note.engagement_id, texteReponse, JSON.stringify(cr)],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: note.engagement_id, actorKind: 'ai', actorId: null,
    verb: compr.verdict === 'execute' ? 'review_note_otto_executed' : 'review_note_otto_refused',
    objectType: 'review_note', objectId: noteId,
    payload: { replyId: reply.id, capacite: cr.capacite ?? null, motifRefus: cr.motif_refus ?? null },
  });

  /* Exécuté → « adressée » (OTTO a répondu ; un humain clôt). Refusé → la
     note RESTE OUVERTE : rien n'a été traité, et un refus qui ferait avancer
     l'état serait un silence lu comme un succès. */
  if (compr.verdict === 'execute' && note.status === 'open') {
    await q(`update review_note set status = 'addressed', addressed_at = now() where id = $1`, [noteId]);
    await logEvent({
      tenantId: ctx.tenant_id, engagementId: note.engagement_id, actorKind: 'ai', actorId: null,
      verb: 'review_note_addressed', objectType: 'review_note', objectId: noteId, payload: { par: 'otto' },
    });
  }
  return { verdict: compr.verdict, replyId: reply.id };
}
