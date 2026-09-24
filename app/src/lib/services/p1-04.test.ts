import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '@/lib/services/workpapers/draft';
import { signWorkpaper, etatDuVisa, editSection } from '@/lib/services/workpapers/lifecycle';
import { assignMember, openDeclaration, answerRubric, signDeclaration } from '@/lib/services/team';
import { closeFile } from '@/lib/services/retention';
import { chargerCatalogue } from '@/lib/methodology/catalogue';

// P1-04 (AUD-05, AUD-09 partie modèle) : VISA-01..04, EQUIPE-01 — la même discipline que le
// reste du dépôt (règle 15) : chaque refus se PROUVE en l'exerçant, jamais lu en base.

describe('P1-04 : visa (VISA-01..04, EQUIPE-01)', () => {
  let wpId: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    // EQUIPE-01 affecte Hugo plus bas : assignMember exige une déclaration d'indépendance
    // SIGNÉE avant toute affectation (team.ts, même hors du périmètre P1-04) — sans quoi
    // hugo.aucuneDeclaration bloque, un refus réel mais orthogonal à ce que ce fichier teste.
    const cat = await chargerCatalogue();
    const decl = await openDeclaration(IDS.engNep, IDS.users.hugo);
    for (const r of cat.independance.rubriques) await answerRubric(decl.id, IDS.users.hugo, r.code, 'non');
    await signDeclaration(decl.id, IDS.users.hugo);
  }, 120000);

  it('signWorkpaper pose sections_hash sur chaque visa', async () => {
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    const s = await q1<{ sections_hash: string | null }>(
      `select sections_hash from signoff where workpaper_id = $1 and sign_role = 'preparer_validator'`, [wpId]);
    expect(s.sections_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('VISA-02 : la même personne ne vise pas deux rôles — refusé côté service, isolé de VISA-03', async () => {
    // Isolation de VISA-02 : un papier À PART, préparé ET revisé par LÉA (manager — passe
    // toujours la règle de rôle VISA-03), pour que le second visa de léa heurte SEULEMENT
    // VISA-02 (même personne, deux rôles) — jamais VISA-03 (signWorkpaper vérifie le rôle
    // AVANT l'identité, donc karim sur wpId lève VISA-03, pas VISA-02 : lifecycle.ts:400-413).
    const wp3 = await q1<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'nep-fr', 'G-VISA02', 'Papier de sonde VISA-02', 'draft', '[]'::jsonb) returning id::text`,
      [IDS.engNep]);
    await signWorkpaper(wp3.id, IDS.users.lea, 'preparer_validator');
    await expect(signWorkpaper(wp3.id, IDS.users.lea, 'reviewer')).rejects.toThrow(/VISA-02/);
  });

  it('VISA-03 : reviewer exige manager/partner — karim (senior) refusé, isolé de VISA-02', async () => {
    // Isolation de VISA-03 : un DEUXIÈME papier (insert SQL direct, JAMAIS draftRevenueWorkpaper
    // — qui marquerait wpId 'outdated' et casserait la suite de ce fichier, code REV-01 unique
    // par mission), préparé et visé par léa (pas karim), pour que la tentative de karim ne heurte
    // QUE la règle de rôle — jamais VISA-02 (karim n'a signé aucun rôle sur CE papier-ci).
    const wp2 = await q1<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'nep-fr', 'G-VISA03', 'Papier de sonde VISA-03', 'draft', '[]'::jsonb) returning id::text`,
      [IDS.engNep]);
    await signWorkpaper(wp2.id, IDS.users.lea, 'preparer_validator');
    await expect(signWorkpaper(wp2.id, IDS.users.karim, 'reviewer')).rejects.toThrow(/VISA-03/);
  });

  it('VISA-03 : reviewer par léa (manager) accepté, sections_hash posée', async () => {
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    const s = await q1<{ sections_hash: string | null }>(
      `select sections_hash from signoff where workpaper_id = $1 and sign_role = 'reviewer'`, [wpId]);
    expect(s.sections_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('VISA-04 : éditer une section DÈS le premier visa (in_review) est refusé, pas seulement une fois signé', async () => {
    await expect(editSection(wpId, IDS.users.karim, 'conclusion', 'texte modifié', 'justification'))
      .rejects.toThrow(/VISA-04/);
  });

  it('etatDuVisa : pas encore signé au niveau partner → signe=false', async () => {
    const e = await etatDuVisa(wpId);
    expect(e.signe).toBe(false);
  });

  it('VISA-01 : un rôle déjà visé ne se revise pas — refusé côté service (même erreur historique)', async () => {
    await expect(signWorkpaper(wpId, IDS.users.lea, 'reviewer')).rejects.toThrow(/already signed/);
  });

  it('partner (claire, can_sign) vise — etatDuVisa devient signe=true', async () => {
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
    const e = await etatDuVisa(wpId);
    expect(e.signe).toBe(true);
    expect(e.perime).toBe(false);
  });

  it('cas connu mauvais (règle 17) : un signoff sans sections_hash, posé par SQL direct hors signWorkpaper', async () => {
    // `signoff` est append-only (0003_infra.sql) : ni l'update ni le delete ne sont possibles,
    // même pour la sonde elle-même — le papier et son visa orphelins restent donc en base après
    // ce test (résidu délibéré, jamais nettoyé, exactement comme le reste du dossier synthétique).
    const nouveauWp = await q1<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title, status, sections)
       values ($1, 'nep-fr', 'G-P104', 'Papier de sonde', 'draft', '[]'::jsonb) returning id::text`,
      [IDS.engNep]);
    await q(
      `insert into signoff (workpaper_id, user_id, sign_role) values ($1, $2, 'preparer_validator')`,
      [nouveauWp.id, IDS.users.karim]);
    const sansHash = await q1<{ n: string }>(
      `select count(*)::text n from signoff where workpaper_id = $1 and sections_hash is null`, [nouveauWp.id]);
    expect(Number(sansHash.n)).toBe(1);
  });

  it('EQUIPE-01 (service) : un acteur staff/senior ne peut pas affecter un NOUVEAU membre en partner — élévation trouvée par la revue hostile, fermée côté service', async () => {
    // Le déclencheur SQL (0176) ne garde que l'UPDATE (04 §1 littéral) : la revue hostile de
    // P1-04 (deux voix indépendantes) a trouvé que l'INSERT (première affectation) restait donc
    // sans AUCUN contrôle de rôle, ATTEIGNABLE par team/page.tsx::assignAction (requireMember
    // seul, jamais un contrôle de rôle) — n'importe quel membre pouvait affecter un COLLÈGUE
    // JAMAIS ENCORE MEMBRE en partner+can_sign. Fermé dans team.ts::assignMember : même contrôle
    // manager/partner que l'UPDATE, sauf le bootstrap d'un dossier ENCORE SANS AUCUN membre (où
    // la personne s'affecte elle-même — flows/prior-year.ts, jamais atteignable par l'écran
    // puisque requireMember exige déjà une adhésion active). P2-02 (AUD-05) : ce contrôle est
    // désormais un `refus('EQUIPE-01', …)` enregistré (`Refus`), plus un `TeamRuleError` nu — le
    // même code que le déclencheur SQL `equipe01_acteur_manager_partner`.
    //
    // CORRECTIF (P2-02) : le sonde a besoin d'une déclaration d'indépendance SIGNÉE — sans
    // elle, `assignMember` refuse plus tôt (`independenceHolds`, un `TeamRuleError` sans
    // rapport) et l'assertion `/EQUIPE-01/` ci-dessous échoue pour la MAUVAISE raison. L'ancienne
    // assertion (`toThrow(TeamRuleError)`, avant P2-02) passait quand même : les deux refus sont
    // de la même classe, donc le test ne prouvait pas ce que son propre énoncé affirmait
    // (règle 18 : une assertion plausible n'est pas un diagnostic) — trouvé en migrant vers un
    // contrôle plus précis, corrigé ici plutôt que la précision relâchée.
    const sonde = await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role)
       values ($1, 'Sonde P1-04 (fictif)', 'sonde.p104@vermeil-audit.example', 'staff')
       returning id::text`,
      [IDS.tenant]);
    const cat = await chargerCatalogue();
    const decl = await openDeclaration(IDS.engNep, sonde.id);
    for (const r of cat.independance.rubriques) await answerRubric(decl.id, sonde.id, r.code, 'non');
    await signDeclaration(decl.id, sonde.id);
    await expect(
      assignMember({
        engagementId: IDS.engNep, userId: sonde.id, engRole: 'partner', canSign: true,
        actorUserId: IDS.users.karim,
      }),
    ).rejects.toThrow(/EQUIPE-01/);
    const m = await q01<{ id: string }>(
      `select id from engagement_member where engagement_id = $1 and user_id = $2`, [IDS.engNep, sonde.id]);
    expect(m).toBeNull();
  });

  it('EQUIPE-01 : un acteur staff/senior ne peut pas remanier un membre déjà affecté', async () => {
    // Léa (manager, déjà membre d'engNep) affecte Hugo pour la première fois — INSERT sur un
    // dossier qui a DÉJÀ une équipe : exige désormais un acteur manager/partner (léa l'est), le
    // même contrôle que l'UPDATE. On tente ENSUITE de le remanier avec un acteur karim (senior).
    await assignMember({ engagementId: IDS.engNep, userId: IDS.users.hugo, engRole: 'staff', canSign: false, actorUserId: IDS.users.lea });
    await expect(
      assignMember({ engagementId: IDS.engNep, userId: IDS.users.hugo, engRole: 'manager', canSign: false, actorUserId: IDS.users.karim }),
    ).rejects.toThrow(/EQUIPE-01/);
  });

  it('EQUIPE-01 : un manager PEUT remanier un membre déjà affecté', async () => {
    const r = await assignMember({ engagementId: IDS.engNep, userId: IDS.users.hugo, engRole: 'senior', canSign: false, actorUserId: IDS.users.lea });
    expect(r.id).toBeTruthy();
    const m = await q1<{ eng_role: string }>(`select eng_role from engagement_member where id = $1`, [r.id]);
    expect(m.eng_role).toBe('senior');
  });

  it('closeFile exige can_sign — karim (senior, can_sign=false) refusé (EQUIPE-02)', async () => {
    await expect(closeFile(IDS.engNep, IDS.users.karim, '2026-03-31')).rejects.toThrow(/EQUIPE-02/);
  });
});
