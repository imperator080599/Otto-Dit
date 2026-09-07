import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import { GET } from './route';

// LOT 3, TRANCHE 1 (mandat, Partie C.1) — LA LECTURE « nature du test
// cohérente avec le catalogue » DE /api/sante, cas connu mauvais (règle 17) :
// preuve rejouable (règle 12) qu'elle rougit bien quand une ligne en base
// porte une nature qui ne correspond plus à celle du catalogue pour son
// template — un décalage silencieux (règle 13) que ni la contrainte CHECK
// (elle ne connaît que les huit valeurs, pas leur correspondance PAR
// template) ni le typage TypeScript (effacé à l'exécution) n'attrapent.
// Atteint ici par un contournement DIRECT de la base, comme la lecture
// elle-même le documente en tête de fichier.

describe('nature du test : la lecture /api/sante rougit sur un décalage avec le catalogue', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune procédure d’un template catalogué : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('nature du test'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune procédure instanciée');
  });

  it('une procédure RAPPRO (catalogue : nature rapprochement) écrite en base avec une AUTRE nature fait rougir la lecture — puis la correction la fait repasser au vert', async () => {
    /* CONTOURNEMENT DIRECT : la voie réelle (programme.ts::planifierProcedure)
       pose TOUJOURS `p.nature` depuis le catalogue — elle ne peut donc
       jamais produire ce décalage elle-même. On simule ici l'état qu'une
       régression ou un catalogue reclassé produirait. */
    await q(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, nature)
       values ($1, 'nep-fr', 'RAPPRO', 'substantive', 'REVENUE', 'sonde nature — décalage', 'sondage_pieces')`,
      [IDS.engNep],
    );

    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('nature du test'));
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('RAPPRO');
    expect(lectureRouge.detail).toContain('rapprochement');
    expect(rouge.status).toBe(500);

    await q(`update procedure_instance set nature = 'rapprochement' where engagement_id = $1 and template_code = 'RAPPRO'`, [IDS.engNep]);

    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('nature du test'));
    expect(lectureVerte.ok).toBe(true);
    expect(lectureVerte.detail).toContain('cohérentes');
    expect(vert.status).toBe(200);
  });
});
