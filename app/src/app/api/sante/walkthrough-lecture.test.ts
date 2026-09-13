import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { GET } from './route';

// §4 POINT 3 (mandat du 10 septembre 2026, point 1 ; R74) — LA LECTURE « walkthrough » DE
// /api/sante : un écart candidat devenu « task » (statuerEcartWalkthrough) doit citer une
// VRAIE tâche réelle, jamais un lien pendu. Éprouvée au refus (règle 17), pas seulement
// affirmée — le chemin réel (statuerEcartWalkthrough) pose toujours le lien dans la MÊME
// écriture que le statut ; cette lecture ne peut rougir que si ce chemin a été contourné.

async function poserControle(code: string): Promise<string> {
  return (await q1<{ id: string }>(
    `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
     values ($1, $2, 'Contrôle de sonde walkthrough', 'fictif', 'monthly', 'manual', 'preventive', 'not_assessed')
     returning id::text`,
    [IDS.engNep, code])).id;
}

describe('walkthrough : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucun écart de walkthrough, la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('walkthrough'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun écart de walkthrough devenu tâche');
  });

  it('cas connu mauvais — un écart « task » SANS control_task_id fait rougir /api/sante entier', async () => {
    const controlId = await poserControle('SONDE-WALKTHROUGH-A');
    const gap = await q1<{ id: string }>(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, description, status, decided_by, decided_at)
       values ($1,$2,1,'omission_doc','écart de sonde','task',$3,now()) returning id::text`,
      [IDS.engNep, controlId, IDS.users.karim],
    );
    try {
      const rouge = await GET();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('walkthrough'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('sans tâche réelle liée');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from control_walkthrough_gap where id = $1`, [gap.id]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  /* UN SECOND CAS ENVISAGÉ (le control_task_id pointe une tâche SUPPRIMÉE) N'EST PAS
     CONSTRUCTIBLE : `control_walkthrough_gap.control_task_id references control_task(id)`
     (0158) SANS `on delete cascade` — Postgres refuse de son propre chef la suppression d'une
     tâche encore référencée (RESTRICT par défaut), avant même que cette lecture n'ait à en
     juger. Une garantie du SCHÉMA, jamais affirmée à sa place par un test qui simulerait un
     état que la base elle-même rend impossible (rouvre l'erreur trouvée en l'écrivant : une
     première version tentait `delete from control_task` sur une ligne encore référencée, et
     la vraie exception — le rejet du SCHÉMA — était masquée par l'échec du nettoyage `finally`
     qui suivait). Le seul cas RÉEL est le premier ci-dessus : `control_task_id` jamais posé. */

  it('défaut retiré — un écart « task » CORRECTEMENT lié à une tâche réelle reste vert', async () => {
    const controlId = await poserControle('SONDE-WALKTHROUGH-C');
    const tache = await q1<{ id: string }>(
      `insert into control_task (engagement_id, control_id, seq_no, description) values ($1,$2,1,'tâche de sonde, réelle') returning id::text`,
      [IDS.engNep, controlId],
    );
    const gap = await q1<{ id: string }>(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, description, status, decided_by, decided_at, control_task_id)
       values ($1,$2,1,'omission_doc','écart de sonde','task',$3,now(),$4) returning id::text`,
      [IDS.engNep, controlId, IDS.users.karim, tache.id],
    );
    try {
      const vert = await GET();
      const bodyVert = await vert.json();
      const lectureVert = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('walkthrough'));
      expect(lectureVert.ok).toBe(true);
      expect(lectureVert.detail).toContain('1 écart(s) devenu(s) tâche, tous liés');
      expect(vert.status).toBe(200);
    } finally {
      await q(`delete from control_walkthrough_gap where id = $1`, [gap.id]);
      await q(`delete from control_task where id = $1`, [tache.id]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });

  it('un écart CANDIDAT (jamais statué) ou écarté/question ne compte pas — seul « task » est regardé', async () => {
    const controlId = await poserControle('SONDE-WALKTHROUGH-D');
    const candidat = await q1<{ id: string }>(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, description, status)
       values ($1,$2,1,'omission_doc','candidat non statué','candidate') returning id::text`,
      [IDS.engNep, controlId],
    );
    const ecarte = await q1<{ id: string }>(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, description, status, decided_by, decided_at, decision_reason)
       values ($1,$2,2,'contradiction','écarté','dismissed',$3,now(),'motif de sonde') returning id::text`,
      [IDS.engNep, controlId, IDS.users.karim],
    );
    try {
      const vert = await GET();
      const bodyVert = await vert.json();
      const lectureVert = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('walkthrough'));
      expect(lectureVert.ok).toBe(true);
      expect(lectureVert.detail).toContain('aucun écart de walkthrough devenu tâche');
    } finally {
      await q(`delete from control_walkthrough_gap where id in ($1,$2)`, [candidat.id, ecarte.id]);
      await q(`delete from control where id = $1`, [controlId]);
    }
  });
});
