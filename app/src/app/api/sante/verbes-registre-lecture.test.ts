import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { q } from '@/lib/db/client';
import { GET } from './route';

// LE REGISTRE DES VERBES, CONTRE CE QUI EST RÉELLEMENT ÉCRIT (P1-10, AUD-12, R155) — LA
// LECTURE /api/sante.
//
// `logEvent` n'avertit qu'en `console.warn` pour un verbe hors registre EN PRODUCTION
// (l'événement s'écrit quand même) — cette lecture existe pour rendre ce cas visible sans
// attendre qu'une session le cherche à la main. Rien en base n'empêche STRUCTURELLEMENT un
// verbe hors registre (la colonne est un simple `text`) : le cas connu mauvais (règle 17) se
// construit par une insertion DIRECTE, hors de `logEvent`, comme p1-08-lecture.test.ts le
// fait pour ses index — SAUF que `event_log` est APPEND-ONLY (un trigger de ce dépôt refuse
// tout DELETE, règle d'audit) : pas de nettoyage possible après coup, donc pas de vérification
// « retour au vert » ici. Chaque fichier vitest tient sa propre base en mémoire (CLAUDE.md §7) :
// cette insertion ne pollue que la base isolée de CE fichier, jamais les autres — d'où l'ordre
// des deux tests ci-dessous : le cas connu mauvais est délibérément le DERNIER.

function trouver(body: { lectures: unknown[] }) {
  const lectures = body.lectures as { nom: string; ok: boolean; detail: string }[];
  return lectures.find((l) => l.nom.includes('registre des verbes (P1-10, AUD-12)'))!;
}

describe('registre des verbes (P1-10, AUD-12) : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
  }, 60000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('le monde de démonstration n’écrit que des verbes du registre : la lecture passe', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = trouver(body);
    expect(lecture).toBeDefined();
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('0 verbe hors registre');
    expect(res.status).toBe(200);
  });

  it('cas connu mauvais (règle 17), DERNIER de ce fichier (event_log est append-only, pas de retour au vert possible) : un événement au verbe hors registre, inséré hors de logEvent, fait rougir /api/sante', async () => {
    await q(
      `insert into event_log (tenant_id, actor_kind, verb, object_type, hash)
       values ($1, 'system', 'sonde_verbe_qui_nexiste_jamais_au_registre', 'sonde', 'x-sonde-verbe')`,
      [IDS.tenant],
    );
    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = trouver(bodyRouge);
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('sonde_verbe_qui_nexiste_jamais_au_registre');
    expect(rouge.status).toBe(500);
  });
});
