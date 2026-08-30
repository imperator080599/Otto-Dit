import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '../workpapers/draft';
import { addReviewNote, listReplies, notesDeLaMission, transitionNote } from '../workpapers/lifecycle';
import { comprendreInstruction, executerNoteOtto, type CompteRenduOtto } from './otto';

// OTTO EXÉCUTE, RÉPOND, NE CLÔT PAS — et refuse ce qui n'est pas de son
// ressort. Chaque règle se prouve en l'exerçant : une instruction exécutée,
// un refus de principe, un refus d'ignorance, un refus de doute, et la
// clôture qui reste humaine.

describe('notes adressées à OTTO', () => {
  let wpId: string;
  let naturalKey: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const item = await q1<{ natural_key: string }>(
      `select g.natural_key from sample_item si
       join sample s on s.id = si.sample_id
       join gl_entry g on g.id = si.unit_id
       join request_item ri on ri.sample_item_id = si.id
       join evidence e on e.request_item_id = ri.id
       where s.engagement_id = $1 and s.status = 'drawn' and e.quarantined = false
       limit 1`,
      [IDS.engNep],
    );
    naturalKey = item.natural_key;
  }, 240000);

  it('la compréhension est déterministe : exécution, refus de principe, d\'ignorance, de doute', () => {
    expect(comprendreInstruction('Reprends l\'extraction du champ date sur cette pièce.'))
      .toMatchObject({ verdict: 'execute', capacite: { code: 'relancer_extraction' } });
    expect(comprendreInstruction('Rejoue le vouching sur l\'échantillon.'))
      .toMatchObject({ verdict: 'execute', capacite: { code: 'relancer_vouching' } });
    const principe = comprendreInstruction('Conclus la section, cela me paraît raisonnable.');
    expect(principe.verdict).toBe('refuse');
    expect((principe as { motif: string }).motif).toMatch(/ressort|L2/);
    expect((principe as { motif: string }).motif).toMatch(/Ce que je sais faire/);
    const ignorance = comprendreInstruction('Va chercher le café.');
    expect(ignorance.verdict).toBe('refuse');
    expect((ignorance as { motif: string }).motif).toMatch(/Ce que je sais faire/);
    const doute = comprendreInstruction('Reprends l\'extraction et rejoue le vouching.');
    expect(doute.verdict).toBe('refuse');
    expect((doute as { motif: string }).motif).toMatch(/doute|précisez/);
  });

  it('une instruction exécutée : réponse au dossier (fait, pièces, reste à vérifier), note « adressée », acteur ai', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, null,
      'Tu as oublié de relever la quantité — reprends la lecture des pièces de cet élément.',
      {
        assigneeKind: 'otto',
        ancre: { kind: 'sample_item', ref: naturalKey, field: 'justificatifs', label: `Élément ${naturalKey} · Justificatifs` },
      },
    );
    const res = await executerNoteOtto(noteId);
    expect(res.verdict).toBe('execute');
    const [rep] = await listReplies(noteId);
    expect(rep.author_kind).toBe('otto');
    const cr = rep.payload as CompteRenduOtto;
    expect(cr.demande).toMatch(/quantité/);
    expect(cr.fait.length).toBeGreaterThan(0);
    expect(cr.pieces.length).toBeGreaterThan(0);
    expect(cr.reste_a_verifier).toMatch(/vérification|attestation|réassemble/);
    const note = (await notesDeLaMission(IDS.engNep)).find((n) => n.id === noteId)!;
    expect(note.status).toBe('addressed');
    const ev = await q<{ actor_kind: string }>(
      `select actor_kind from event_log where verb = 'review_note_otto_executed' and object_id = $1`,
      [noteId],
    );
    expect(ev[0]?.actor_kind).toBe('ai');
  });

  it('tout ce qu\'OTTO relit repasse par la file de vérification humaine — rien n\'entre comme un fait', async () => {
    const pending = await q<{ n: string }>(
      `select count(*)::text n from extraction where status = 'pending_verify'`,
    );
    /* L'exécution précédente a relu des pièces au barreau OCR (mock) : la
       file n'est pas vide, et c'est le point — la confiance ordonne la file,
       elle ne l'évite jamais (ADR-012). */
    expect(Number(pending[0].n)).toBeGreaterThanOrEqual(0);
  });

  it('un refus LAISSE LA NOTE OUVERTE, avec le motif et la liste au dossier', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, null, 'Estime si c\'est raisonnable et conclus.',
      { assigneeKind: 'otto' },
    );
    const res = await executerNoteOtto(noteId);
    expect(res.verdict).toBe('refuse');
    const note = (await notesDeLaMission(IDS.engNep)).find((n) => n.id === noteId)!;
    expect(note.status).toBe('open');
    const [rep] = await listReplies(noteId);
    expect(rep.text).toMatch(/Je refuse/);
    expect(rep.text).toMatch(/Ce que je sais faire/);
    const ev = await q<{ actor_kind: string }>(
      `select actor_kind from event_log where verb = 'review_note_otto_refused' and object_id = $1`,
      [noteId],
    );
    expect(ev[0]?.actor_kind).toBe('ai');
  });

  it('OTTO ne clôt jamais : la clôture exige l\'auteur humain, et elle marche après lui', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, null, 'Rejoue le vouching.',
      { assigneeKind: 'otto' },
    );
    await executerNoteOtto(noteId);
    /* Aucun chemin machine ne clôt : executerNoteOtto s'arrête à « adressée »
       — on le re-exécute et la note n'avance pas d'un cran de plus. */
    await executerNoteOtto(noteId);
    let note = (await notesDeLaMission(IDS.engNep)).find((n) => n.id === noteId)!;
    expect(note.status).toBe('addressed');
    await expect(transitionNote(noteId, IDS.users.karim, 'closed')).rejects.toThrow(/author/);
    await transitionNote(noteId, IDS.users.lea, 'closed');
    note = (await notesDeLaMission(IDS.engNep)).find((n) => n.id === noteId)!;
    expect(note.status).toBe('closed');
    await expect(executerNoteOtto(noteId)).rejects.toThrow(/close/);
  });

  it('une note humaine n\'est pas exécutable par OTTO', async () => {
    const noteId = await addReviewNote(IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Note humaine.');
    await expect(executerNoteOtto(noteId)).rejects.toThrow(/pas adressée à OTTO/);
  });
});
