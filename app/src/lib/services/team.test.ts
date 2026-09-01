// Équipe, indépendance, et l'isolation par cabinet.
//
// Ce fichier ne vérifie pas que les règles sont écrites : il TENTE de les
// violer. Une isolation qu'on suppose n'est pas une isolation — et en local les
// politiques RLS sont inertes (PGlite tourne en propriétaire de la table), donc
// c'est la couche de service qui doit tenir, seule, et le prouver.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { chargerCatalogue } from '@/lib/methodology/catalogue';
import {
  openDeclaration, answerRubric, signDeclaration, declarations, currentDeclaration,
  missingForSignature, declarationState, independenceHolds, assignMember, exitMember,
  members, independenceObstacles, recordNonAuditService, feeRatio, assertSameFirm,
} from './team';

/* ── un SECOND cabinet, entièrement distinct ─────────────────────────────
   Il n'existe que pour être une cible : c'est sur lui qu'on essaie de fuir. */
const AUTRE = {
  tenant: '00000000-0000-4000-8000-0000000000b1',
  user: '00000000-0000-4000-8000-0000000000b2',
  entity: '00000000-0000-4000-8000-0000000000b3',
  period: '00000000-0000-4000-8000-0000000000b4',
  engagement: '00000000-0000-4000-8000-0000000000b5',
};

async function seedOtherFirm(): Promise<void> {
  await q(`insert into tenant (id, name, issuer_reports_2024) values ($1, 'Cabinet Lambert (fictif)', 0)`, [AUTRE.tenant]);
  await q(
    `insert into app_user (id, tenant_id, name, email, firm_role)
     values ($1, $2, 'Paul Lambert', 'paul.lambert@lambert.example', 'partner')`,
    [AUTRE.user, AUTRE.tenant],
  );
  const src = await q1<Record<string, unknown>>(`select * from entity where id = $1`, [IDS.entity]);
  await q(
    `insert into entity (id, tenant_id, name, country, registry_type, registry_no, currency)
     values ($1, $2, 'Cliente de Lambert (fictive)', $3, 'fictional', null, 'EUR')`,
    [AUTRE.entity, AUTRE.tenant, src.country],
  );
  const per = await q1<Record<string, unknown>>(`select * from period where id = $1`, [IDS.periodFY2025]);
  await q(
    `insert into period (id, entity_id, label, start_date, end_date)
     values ($1, $2, $3, $4, $5)`,
    [AUTRE.period, AUTRE.entity, per.label, per.start_date, per.end_date],
  );
  const eng = await q1<Record<string, unknown>>(`select * from engagement where id = $1`, [IDS.engNep]);
  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status)
     values ($1, $2, $3, $4, $5, 'Mission Lambert (fictive)', $6, $7)`,
    [AUTRE.engagement, AUTRE.tenant, AUTRE.entity, AUTRE.period, eng.kind,
     JSON.stringify(eng.framework_set), eng.status],
  );
}

describe('équipe et indépendance', () => {
  beforeAll(async () => {
    await initTestDb();
    await seedOtherFirm();
  });

  /* ═══ 1. la déclaration ═══════════════════════════════════════════════
     Hugo Vasseur est au cabinet et n'a rien signé : c'est sur lui que le
     cycle de vie complet se joue, sans toucher au dossier semé.            */

  it('le dossier semé démarre SANS obstacle : chaque membre affecté a signé', async () => {
    expect(await independenceObstacles(IDS.engNep)).toEqual([]);
    expect(await independenceHolds(IDS.engNep, IDS.users.karim)).toBe(true);
    expect(await independenceHolds(IDS.engNep, IDS.users.hugo)).toBe(false);
  });

  it('une déclaration vide n’est pas signable, et la liste de ce qui manque EST la règle', async () => {
    const cat = await chargerCatalogue();
    const d = await openDeclaration(IDS.engNep, IDS.users.hugo);
    expect(missingForSignature(cat, d)).toHaveLength(cat.independance.rubriques.length);
    await expect(signDeclaration(d.id, IDS.users.hugo)).rejects.toThrow(/incomplète/);
  });

  it('un « oui » sans précision écrite ne se signe pas', async () => {
    const cat = await chargerCatalogue();
    const d = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    for (const r of cat.independance.rubriques) await answerRubric(d!.id, IDS.users.hugo, r.code, 'non');
    await answerRubric(d!.id, IDS.users.hugo, 'interets', 'oui', '');
    const after = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    expect(missingForSignature(cat, after)).toEqual([
      expect.stringContaining('sans précision écrite'),
    ]);
    await expect(signDeclaration(d!.id, IDS.users.hugo)).rejects.toThrow(/sans précision écrite/);

    // la précision lève l'obstacle, et rien d'autre
    await answerRubric(d!.id, IDS.users.hugo, 'interets', 'oui',
      'Parts de SCPI détenues par mon conjoint, sans lien avec le client ni avec ses filiales.');
    expect(missingForSignature(cat, await currentDeclaration(IDS.engNep, IDS.users.hugo))).toEqual([]);
  });

  it('une rubrique inconnue du référentiel du cabinet est refusée', async () => {
    const d = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    await expect(answerRubric(d!.id, IDS.users.hugo, 'cryptomonnaies', 'non'))
      .rejects.toThrow(/inconnue de la déclaration du cabinet/);
  });

  it('ON SIGNE POUR SOI — personne ne signe pour un autre, ni par le service ni par la base', async () => {
    const d = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    await expect(signDeclaration(d!.id, IDS.users.lea)).rejects.toThrow(/se signe soi-même/);
    // et la contrainte de base refuse la même chose, contournement du service compris
    await expect(
      q(`update independence_declaration set signed_at = now(), signed_by = $2 where id = $1`,
        [d!.id, IDS.users.lea]),
    ).rejects.toThrow();
    // la vraie signature, elle, passe
    await signDeclaration(d!.id, IDS.users.hugo);
    expect(await independenceHolds(IDS.engNep, IDS.users.hugo)).toBe(true);
  });

  it('on ne remplit pas la déclaration d’un autre', async () => {
    const d = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    await expect(answerRubric(d!.id, IDS.users.karim, 'interets', 'non'))
      .rejects.toThrow(/déjà signée/);
    const rev = await openDeclaration(IDS.engNep, IDS.users.lea, 'Test : remplissage par un tiers.');
    await expect(answerRubric(rev.id, IDS.users.karim, 'interets', 'non'))
      .rejects.toThrow(/sa propre déclaration/);
    // on referme proprement : Léa signe sa révision
    const cat = await chargerCatalogue();
    for (const r of cat.independance.rubriques) await answerRubric(rev.id, IDS.users.lea, r.code, 'non');
    await signDeclaration(rev.id, IDS.users.lea);
  });

  it('une déclaration signée ne se réécrit pas — la base refuse, pas seulement le service', async () => {
    const d = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    expect(d!.signed_at).not.toBeNull();
    await expect(
      q(`update independence_declaration set answers = '{}'::jsonb where id = $1`, [d!.id]),
    ).rejects.toThrow(/ne se réécrit pas/);
    await expect(
      q(`delete from independence_declaration where id = $1`, [d!.id]),
    ).rejects.toThrow(/ne se supprime pas/);
  });

  /* ═══ 2. la révision EMPILE, elle n'écrase pas ════════════════════════ */

  it('une révision empile une version et laisse la précédente lisible, signée', async () => {
    const avant = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    await expect(openDeclaration(IDS.engNep, IDS.users.hugo, '')).rejects.toThrow(/sans motif écrit/);

    const rev = await openDeclaration(IDS.engNep, IDS.users.hugo,
      'Le client a annoncé le 12 mars l’acquisition d’une société dont mon frère est directeur financier.');
    expect(rev.version).toBe(avant!.version + 1);

    const pile = await declarations(IDS.engNep, IDS.users.hugo);
    expect(pile).toHaveLength(2);
    const ancienne = pile.find((x) => x.id === avant!.id)!;
    expect(ancienne.signed_at).not.toBeNull();          // l'ancienne reste signée
    expect(ancienne.superseded_by).toBe(rev.id);        // et dit par quoi elle est remplacée
    expect(ancienne.answers.interets.detail).toContain('SCPI'); // et son contenu est intact
    expect(rev.reason).toContain('directeur financier');        // la révision dit POURQUOI
  });

  it('tant que la révision n’est pas signée, l’indépendance ne tient plus', async () => {
    expect(await independenceHolds(IDS.engNep, IDS.users.hugo)).toBe(false);
    const st = await declarationState(IDS.engNep, IDS.users.hugo);
    expect(st.label).toContain('la précédente est caduque');
  });

  /* ═══ 3. LE REFUS D'AFFECTER ══════════════════════════════════════════ */

  it('AUCUN travail n’est attribué à qui n’a pas signé — le système refuse, il ne rappelle pas', async () => {
    await expect(
      assignMember({ engagementId: IDS.engNep, userId: IDS.users.hugo, engRole: 'staff',
                     actorUserId: IDS.users.claire }),
    ).rejects.toThrow(/aucun travail ne peut lui être attribué/);
    // et rien n'a été écrit au passage : un refus ne laisse pas de demi-membre
    const rows = await members(IDS.engNep);
    expect(rows.some((r) => r.user_id === IDS.users.hugo)).toBe(false);
  });

  it('la révision signée rouvre l’affectation', async () => {
    const cat = await chargerCatalogue();
    const rev = await currentDeclaration(IDS.engNep, IDS.users.hugo);
    for (const r of cat.independance.rubriques) await answerRubric(rev!.id, IDS.users.hugo, r.code, 'non');
    await answerRubric(rev!.id, IDS.users.hugo, 'familiaux', 'oui',
      'Frère directeur financier d’une société acquise par le client le 12 mars 2026 ; retrait du dossier proposé.');
    await signDeclaration(rev!.id, IDS.users.hugo);
    const m = await assignMember({ engagementId: IDS.engNep, userId: IDS.users.hugo,
      engRole: 'staff', enteredOn: '2026-03-16', actorUserId: IDS.users.claire });
    expect(m.id).toBeTruthy();
    expect(await independenceObstacles(IDS.engNep)).toEqual([]);
  });

  it('un membre affecté dont la déclaration devient caduque BLOQUE le visa', async () => {
    // Léa est affectée depuis l'amorce et a signé. Elle révise : ses travaux bloquent.
    await openDeclaration(IDS.engNep, IDS.users.lea,
      'Prise de participation de mon conjoint dans un fournisseur du client, déclarée le 18 mars.');
    const obstacles = await independenceObstacles(IDS.engNep);
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0].cle).toBe('obst.declarationNonSignee');
    expect(obstacles[0].vars?.nom).toBe('Léa Moreau');
  });

  it('un membre sorti ne bloque plus rien, et n’est pas supprimé du dossier', async () => {
    await exitMember(IDS.engNep, IDS.users.lea, '2026-03-20', IDS.users.claire);
    expect(await independenceObstacles(IDS.engNep)).toEqual([]);
    const rows = await members(IDS.engNep);
    const lea = rows.find((r) => r.user_id === IDS.users.lea)!;
    expect(lea.exited_on).toBe('2026-03-20');           // toujours au dossier
    expect(lea.entered_on).toBe('2025-11-03');
    await expect(
      assignMember({ engagementId: IDS.engNep, userId: IDS.users.lea, engRole: 'manager',
                     actorUserId: IDS.users.claire }),
    ).rejects.toThrow(/sorti de la mission/);
  });

  /* ═══ 4. L'ISOLATION — on essaie de fuir, pas de la supposer ══════════ */

  describe('isolation par cabinet : on TENTE la fuite', () => {
    it('affecter un collaborateur d’un autre cabinet est refusé', async () => {
      await expect(
        assignMember({ engagementId: IDS.engNep, userId: AUTRE.user, engRole: 'senior',
                       actorUserId: IDS.users.claire }),
      ).rejects.toThrow(/autre cabinet/);
    });

    it('affecter un des nôtres à la mission d’un autre cabinet est refusé', async () => {
      await expect(
        assignMember({ engagementId: AUTRE.engagement, userId: IDS.users.karim, engRole: 'senior',
                       actorUserId: IDS.users.claire }),
      ).rejects.toThrow(/autre cabinet/);
    });

    it('ouvrir une déclaration en travers des cabinets est refusé, dans les deux sens', async () => {
      await expect(openDeclaration(IDS.engNep, AUTRE.user)).rejects.toThrow(/autre cabinet/);
      await expect(openDeclaration(AUTRE.engagement, IDS.users.karim)).rejects.toThrow(/autre cabinet/);
    });

    it('un service non-audit ne s’enregistre pas sur la mission d’un autre cabinet', async () => {
      await expect(
        recordNonAuditService({ engagementId: AUTRE.engagement, nature: 'formation',
          label: 'Formation', amountCents: 1000, providedOn: '2026-01-05',
          provider: 'Vermeil Audit', actorUserId: IDS.users.karim }),
      ).rejects.toThrow(/autre cabinet/);
    });

    it('l’acteur d’une opération est vérifié lui aussi, pas seulement sa cible', async () => {
      // Paul (cabinet Lambert) tente d'affecter Karim (Vermeil) sur la mission de Vermeil.
      await expect(
        assignMember({ engagementId: IDS.engNep, userId: IDS.users.karim, engRole: 'senior',
                       actorUserId: AUTRE.user }),
      ).rejects.toThrow(/autre cabinet/);
    });

    it('la garde nomme le cabinet du dossier, et refuse une personne inconnue', async () => {
      const ctx = await assertSameFirm(IDS.engNep, IDS.users.karim);
      expect(ctx.tenant_id).toBe(IDS.tenant);
      await expect(assertSameFirm(IDS.engNep, AUTRE.entity)).rejects.toThrow(/personne inconnue/);
    });

    it('rien du second cabinet n’a pu être écrit dans le premier', async () => {
      const fuites = await q<{ n: string }>(
        `select count(*)::text as n from engagement_member m
         join app_user u on u.id = m.user_id
         join engagement e on e.id = m.engagement_id
         where u.tenant_id <> e.tenant_id`,
      );
      expect(fuites[0].n).toBe('0');
      const decl = await q<{ n: string }>(
        `select count(*)::text as n from independence_declaration d
         join app_user u on u.id = d.user_id
         join engagement e on e.id = d.engagement_id
         where u.tenant_id <> e.tenant_id or d.tenant_id <> e.tenant_id`,
      );
      expect(decl[0].n).toBe('0');
    });
  });

  /* ═══ 5. services non-audit : un ratio, pas une appréciation ══════════ */

  it('le ratio n’est PAS calculé tant que les honoraires d’audit ne sont pas saisis', async () => {
    await recordNonAuditService({ engagementId: IDS.engNep, nature: 'si',
      label: 'Paramétrage du reporting de consolidation', amountCents: 950_000,
      providedOn: '2025-09-30', provider: 'Revisia Conseil (entité liée au cabinet)',
      actorUserId: IDS.users.claire });
    const r = await feeRatio(IDS.engNep);
    expect(r.nonAuditCents).toBe(950_000);
    expect(r.auditFeeCents).toBeNull();
    expect(r.ratioPct).toBeNull();      // pas d'estimation sur un dénominateur supposé
    expect(r.overCap).toBe(false);
  });

  it('saisis, il se calcule — et le dépassement du plafond se voit', async () => {
    await q(`update engagement set audit_fee_cents = $2 where id = $1`, [IDS.engNep, 1_000_000]);
    const r = await feeRatio(IDS.engNep);
    expect(r.ratioPct).toBeCloseTo(95, 6);
    expect(r.capPct).toBe(70);
    expect(r.overCap).toBe(true);
  });

  it('le plafond est un paramètre de cabinet, et il est marqué NON VÉRIFIÉ', async () => {
    const r = await feeRatio(IDS.engNep);
    expect(r.capUnverified).toBe(true);
    const cat = await chargerCatalogue();
    expect(cat.independance.parametres.plafond_sacc_pct.sources.length).toBeGreaterThan(0);
    for (const s of cat.independance.parametres.plafond_sacc_pct.sources) {
      expect(cat.sources[s].verifie).toBe(false);
    }
  });

  it('une nature de service inconnue du référentiel est refusée', async () => {
    await expect(
      recordNonAuditService({ engagementId: IDS.engNep, nature: 'divination',
        label: 'x', amountCents: 1, providedOn: '2026-01-01', provider: 'y',
        actorUserId: IDS.users.claire }),
    ).rejects.toThrow(/inconnue du référentiel du cabinet/);
  });

  /* ═══ 6. la piste ═════════════════════════════════════════════════════ */

  it('chaque geste est au journal, chaîné, avec son auteur', async () => {
    const rows = await q<{ verb: string; actor_id: string | null }>(
      `select verb, actor_id from event_log
       where engagement_id = $1 and (verb like 'independence.%' or verb like 'team.%')
       order by id`,
      [IDS.engNep],
    );
    const verbs = rows.map((r) => r.verb);
    expect(verbs).toContain('independence.declaration.opened');
    expect(verbs).toContain('independence.declaration.revised');
    expect(verbs).toContain('independence.declaration.signed');
    expect(verbs).toContain('team.member.assigned');
    expect(verbs).toContain('team.member.exited');
    expect(verbs).toContain('independence.nas.recorded');
    expect(rows.every((r) => r.actor_id !== null)).toBe(true);
  });

  it('la déclaration est du contenu de cabinet, pas du code', async () => {
    const cat = await chargerCatalogue();
    expect(cat.independance.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cat.independance.rubriques.length).toBeGreaterThanOrEqual(5);
    for (const r of cat.independance.rubriques) {
      expect(r.definition.length).toBeGreaterThan(40); // elle dit ce qu'elle couvre
    }
    for (const [, p] of Object.entries(cat.independance.parametres)) {
      expect(p.sources.length).toBeGreaterThan(0);     // et tout seuil nomme sa source
      expect(p.pourquoi.length).toBeGreaterThan(40);   // et ce qu'il commande
    }
  });
});
