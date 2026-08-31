import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '../workpapers/draft';
import {
  addReviewNote, repondreNote, listReplies, notesDeLaMission, notesPourEcran,
} from '../workpapers/lifecycle';
import { resoudreAncre } from './ancres';

// L'ANCRE EST L'IDENTITÉ MÉTIER, ET ELLE SE PROUVE EN L'EXERÇANT (règle 15) :
// on pose, on résout, on retire l'objet, on re-résout. Un test qui lirait la
// colonne anchor_ref sans jamais résoudre vérifierait que le code se souvient
// de lui-même.

describe('notes ancrées (ADR-097)', () => {
  let wpId: string;
  let naturalKey: string;
  let sampleItemId: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const item = await q1<{ id: string; natural_key: string }>(
      `select si.id::text id, g.natural_key from sample_item si
       join sample s on s.id = si.sample_id
       join gl_entry g on g.id = si.unit_id
       where s.engagement_id = $1 and s.status = 'drawn' and si.unit_kind = 'gl_entry'
       limit 1`,
      [IDS.engNep],
    );
    naturalKey = item.natural_key;
    sampleItemId = item.id;
  }, 240000);

  it('une note se pose sur une cellule par l\'identité de l\'écriture, et l\'écran la retrouve', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim,
      'La date relevée ne correspond pas au bon de livraison.',
      { ancre: { kind: 'sample_item', ref: naturalKey, field: 'date', label: `Élément ${naturalKey} · Date` } },
    );
    expect(noteId).toBeTruthy();
    const marques = await notesPourEcran(IDS.engNep);
    const cle = `sample_item|${sampleItemId}|date`;
    expect(marques[cle]?.some((m) => m.noteId === noteId)).toBe(true);
  });

  it('poser sur un objet qui n\'existe pas est refusé — l\'ancre n\'est pas une position d\'écran', async () => {
    await expect(addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, null, 'x',
      { ancre: { kind: 'sample_item', ref: 'JX|9999|1', field: 'date', label: 'fantôme' } },
    )).rejects.toThrow(/objet qui existe/);
    await expect(addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, null, 'x',
      { ancre: { kind: 'workpaper_section', ref: 'REV-01:section_inexistante', field: null, label: 'fantôme' } },
    )).rejects.toThrow(/objet qui existe/);
  });

  it('la base refuse une ancre à moitié posée (ceinture sous les bretelles)', async () => {
    await expect(q(
      `insert into review_note (engagement_id, author_id, text, anchor_kind, anchor_ref)
       values ($1, $2, 'x', 'sample_item', 'VE|1|1')`,
      [IDS.engNep, IDS.users.lea],
    )).rejects.toThrow(/anchor_complete/);
  });

  it('l\'élément sorti de l\'échantillon : la note ne disparaît pas, elle passe « objet retiré »', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Note sur un élément qui va sortir.',
      { ancre: { kind: 'sample_item', ref: naturalKey, field: 'montant', label: `Élément ${naturalKey} · Montant` } },
    );
    /* Le re-tirage qui ne reprend pas l'écriture : l'échantillon courant est
       remplacé. On le simule par la transition d'état réelle du sondage. */
    await q(`update sample set status = 'superseded' where engagement_id = $1 and status = 'drawn'`, [IDS.engNep]);
    const apres = await notesDeLaMission(IDS.engNep);
    const note = apres.find((n) => n.id === noteId)!;
    expect(note).toBeTruthy();
    expect(note.etat_ancre).toBe('retire');
    /* Et l'écran ne marque plus rien : l'objet n'est plus là. */
    const marques = await notesPourEcran(IDS.engNep);
    expect(Object.keys(marques).filter((k) => k.startsWith('sample_item|'))).toEqual([]);
    /* Le tirage revient (même écriture) : la note se ré-attache TOUTE SEULE —
       l'ancre est l'identité métier, pas le uuid de la ligne. */
    await q(`update sample set status = 'drawn' where engagement_id = $1 and status = 'superseded'`, [IDS.engNep]);
    const r = await resoudreAncre(IDS.engNep, { kind: 'sample_item', ref: naturalKey, field: 'montant', label: '' });
    expect(r.etat).toBe('present');
    expect(r.cibles).toContain(sampleItemId);
  });

  it('la conclusion et les seuils sont annotables ; répondre fait passer « addressed »', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Renvoyer vers l\'état des anomalies.',
      { ancre: { kind: 'workpaper_section', ref: 'REV-01:conclusion', field: null, label: 'REV-01 · Conclusion' } },
    );
    await repondreNote(noteId, IDS.users.karim, 'Renvoi ajouté au troisième paragraphe.');
    const notes = await notesDeLaMission(IDS.engNep);
    const n = notes.find((x) => x.id === noteId)!;
    expect(n.status).toBe('addressed');
    expect(n.reponses).toBe(1);
    const rep = await listReplies(noteId);
    expect(rep[0].author_kind).toBe('user');

    const seuils = await addReviewNote(
      IDS.engNep, null, IDS.users.claire, null, 'Le seuil de travail me paraît haut pour ce dossier.',
      { ancre: { kind: 'materiality_param', ref: 'seuil_travail', field: null, label: 'Seuils · Seuil de travail' } },
    );
    expect(seuils).toBeTruthy();
  });

  it('un ÉCART s\'annote par son identité métier — taxonomie + écriture (ADR-102)', async () => {
    const x = await q1<{ id: string; aref: string }>(
      `select x.id::text id, x.taxonomy_code || '|' || g.natural_key aref
       from exception x
       join sample_item si on si.id = x.sample_item_id
       join gl_entry g on g.id = si.unit_id
       where x.engagement_id = $1 limit 1`,
      [IDS.engNep],
    );
    const noteId = await addReviewNote(
      IDS.engNep, null, IDS.users.lea, IDS.users.karim,
      'Pourquoi as-tu considéré celui-ci comme résolu ?',
      { ancre: { kind: 'exception', ref: x.aref, field: null, label: `Écart ${x.aref.split('|')[0]}` } },
    );
    const marques = await notesPourEcran(IDS.engNep);
    expect(marques[`exception|${x.id}`]?.some((m) => m.noteId === noteId)).toBe(true);
    /* Un écart imaginaire est refusé à la pose, comme tout objet inexistant. */
    await expect(addReviewNote(
      IDS.engNep, null, IDS.users.lea, null, 'x',
      { ancre: { kind: 'exception', ref: 'taxo_fantome|JX|9999|1', field: null, label: 'fantôme' } },
    )).rejects.toThrow(/objet qui existe/);
  });

  it('une note attribuée à OTTO se stocke sans identifiant humain — et jamais avec', async () => {
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, null, 'Relever la quantité sur les trois dernières lignes.',
      { assigneeKind: 'otto' },
    );
    const n = (await notesDeLaMission(IDS.engNep)).find((x) => x.id === noteId)!;
    expect(n.assignee_kind).toBe('otto');
    expect(n.assignee_name).toBeNull();
    await expect(addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'x', { assigneeKind: 'otto' },
    )).rejects.toThrow(/identifiant utilisateur/);
  });

  it('répondre à une note close est refusé — une note close ne se rouvre pas', async () => {
    const noteId = await addReviewNote(IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'À clore.');
    await repondreNote(noteId, IDS.users.karim, 'Fait.');
    const { transitionNote } = await import('../workpapers/lifecycle');
    await transitionNote(noteId, IDS.users.claire, 'closed');
    await expect(repondreNote(noteId, IDS.users.karim, 'Encore ?')).rejects.toThrow(/close/);
  });
});
