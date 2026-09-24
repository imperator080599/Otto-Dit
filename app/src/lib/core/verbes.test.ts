import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { verbeConnu, verbeCanonique, VERBES, ALIAS_VERBES } from '@/lib/core/verbes';
import { IDS } from '@/lib/seed';

// P1-10 (AUD-12) — LE REGISTRE DES VERBES.
//
// CE QUE CETTE TRANCHE A TROUVÉ EN SE CONSTRUISANT (règle 13, disclosed dans l'en-tête
// de verbes.ts) : la PREMIÈRE mesure du registre (158/159 verbes, un balayage de
// littéraux directs) manquait 26 verbes choisis par TERNAIRE et 2 par un gabarit
// interpolé fermé (`review_note_${to}`) — corrigée le jour même, 187 verbes réels.
// `logEvent` reste la seule porte : ces tests éprouvent qu'elle refuse RÉELLEMENT un
// verbe hors registre (règle 17), pas seulement en théorie.
describe('le registre des verbes (P1-10, AUD-12)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 60000);

  it('verbeConnu : un verbe du registre est connu, un alias est connu, un troisième mot ne l’est pas', () => {
    expect(verbeConnu('engagement.created')).toBe(true);
    expect(verbeConnu('engagement_created')).toBe(true); // l’alias
    expect(verbeConnu('automation_level.changed')).toBe(true); // posé par cette même tranche
    expect(verbeConnu('un_mot_qui_nexiste_nulle_part')).toBe(false);
  });

  it('verbeCanonique : un alias résout vers sa cible, un verbe déjà canonique se rend lui-même', () => {
    expect(verbeCanonique('engagement_created')).toBe('engagement.created');
    expect(verbeCanonique('engagement.created')).toBe('engagement.created');
  });

  it('aucun doublon normalisé (point/underscore, casse) au sein de VERBES lui-même', () => {
    const normalise = (v: string) => v.replace(/[._]/g, '').toLowerCase();
    const vus = new Map<string, string>();
    for (const v of VERBES) {
      const n = normalise(v);
      expect(vus.has(n), `« ${v} » et « ${vus.get(n)} » désignent le même fait normalisé`).toBe(false);
      vus.set(n, v);
    }
  });

  it('chaque alias pointe un verbe RÉELLEMENT au registre — pas un troisième mot inventé', () => {
    for (const [alias, cible] of Object.entries(ALIAS_VERBES)) {
      expect((VERBES as readonly string[]).includes(cible), `alias ${alias} -> ${cible}`).toBe(true);
    }
  });

  it('cas connu mauvais (règle 17) : logEvent REFUSE réellement un verbe hors registre, en test', async () => {
    await expect(logEvent({
      tenantId: IDS.tenant, engagementId: IDS.engNep, actorKind: 'system',
      verb: 'ceci_nest_jamais_passe_par_le_registre',
      objectType: 'sonde', payload: {},
    })).rejects.toThrow(/absent de VERBES\/ALIAS_VERBES/);
  });

  it('cas connu BON (règle 17, le régression-guard) : un verbe du registre s’écrit sans lever', async () => {
    await expect(logEvent({
      tenantId: IDS.tenant, engagementId: IDS.engNep, actorKind: 'system',
      verb: 'automation_level.changed', objectType: 'engagement', objectId: IDS.engNep,
      payload: { de: null, vers: 'L1' },
    })).resolves.toBeUndefined();
  });

  it('un alias posé en écriture est NORMALISÉ vers le verbe canonique dans la ligne stockée — jamais l’alias lui-même', async () => {
    await logEvent({
      tenantId: IDS.tenant, engagementId: IDS.engNep, actorKind: 'system',
      verb: 'engagement_created', objectType: 'engagement', objectId: IDS.engNep, payload: {},
    });
    const derniere = await q1<{ verb: string }>(
      `select verb from event_log where tenant_id = $1 and engagement_id = $2 order by id desc limit 1`,
      [IDS.tenant, IDS.engNep]);
    expect(derniere.verb).toBe('engagement.created');
  });
});
