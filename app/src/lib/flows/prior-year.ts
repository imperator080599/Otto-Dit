import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { criteres } from '@/lib/methodology/catalogue';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { creerMission } from '@/lib/services/engagement';
import {
  ouvrirAcceptation, repondreCritere, decider, assurerJalons, poserJalon, currentAcceptation } from '@/lib/services/acceptance';
import { assignMember, openDeclaration, answerRubric, signDeclaration } from '@/lib/services/team';
import { detectTbMapping, importTb } from '@/lib/services/imports';
import { rebuildFslis, proposeScoping, confirmScoping, listFslis } from '@/lib/services/fsli';
import { propose, validate } from '@/lib/services/materiality';
import { assessFsli } from '@/lib/services/risk';
import { answerQuestion, questionsOfScope, decideFactor, register } from '@/lib/services/questionnaire';

// LE DOSSIER N-1, CONSTRUIT PAR LES MÊMES SERVICES QUE LES CLICS (point 2a).
//
// « On ne reprend pas des chiffres, on reprend des conclusions » : il fallait
// donc un dossier FY2024 qui PORTE des conclusions — un périmètre décidé, des
// facteurs statués, un questionnaire rempli. Les fabriquer en insérant des
// lignes aurait produit un dossier que les règles du produit n'auraient jamais
// accepté : pas de déclaration signée, pas d'acceptation, pas de motif de
// non-significativité. La reprise aurait alors repris… de la fiction.
//
// Tout ici passe donc par les services : acceptation, équipe, import de la
// balance N-1, périmètre, seuils, risque, questionnaire. Ce qui n'est PAS fait
// — grand livre, échantillon, vouching — ne l'est pas parce que la reprise n'en
// a pas besoin : ce qui se reprend ne vient pas du grand livre.

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

/** L'identifiant est déterministe : le dossier N-1 se retrouve d'un lancement à l'autre. */
export const ID_MISSION_N1 = IDS.engNepN1;

export async function construireDossierN1(): Promise<string> {
  /* REJOUABLE : le dossier N-1 déjà CONSTRUIT (une balance importée) n'est
     pas refait. La mission elle-même et son acceptation viennent désormais du
     monde de base (seedBase) ; le flux les crée seulement s'il tourne sur une
     base qui ne les porte pas. */
  const construit = await q01<{ n: string }>(`select count(*)::text n from import_file where engagement_id = $1`, [ID_MISSION_N1]);
  if (construit && construit.n !== '0') return ID_MISSION_N1;
  const deja = await q01<{ id: string }>(`select id from engagement where id = $1`, [ID_MISSION_N1]);
  if (!deja) {
    // 1. La mission FY2024, par le service — pas par une insertion.
    await creerMission({
      id: ID_MISSION_N1,
      tenantId: IDS.tenant, entityId: IDS.entity, periodId: IDS.periodFY2024,
      kind: 'statutory_audit', name: 'Altiverre FY2024 — Audit légal (NEP)',
      packs: ['nep-fr'], accountingMap: 'pcg', language: 'fr', actorUserId: IDS.users.claire,
    });
  }
  const id = ID_MISSION_N1;
  const cat = await catalogueDeLaMission(id);

  // 2. L'acceptation : première année sur cette entité, donc « acceptation ».
  if ((await currentAcceptation(id))?.status !== 'accepted') {
    const acc = await ouvrirAcceptation(id, IDS.users.claire);
    for (const c of criteres(cat, acc.kind)) {
      await repondreCritere(id, IDS.users.claire, c.code,
        c.reponse_defavorable === 'oui' ? 'non' : 'oui', '');
    }
    await decider(id, IDS.users.claire, 'accepted',
      'Première année : confrère précédent contacté sans réserve, compétences et disponibilité vérifiées.');
  }
  await assurerJalons(id);
  await poserJalon(id, IDS.users.claire, 'date_rapport', '2025-03-31');

  // 3. L'équipe, avec ses déclarations SIGNÉES — la règle du produit l'exige.
  for (const [uid, role] of [[IDS.users.claire, 'partner'], [IDS.users.lea, 'manager']] as const) {
    const d = await openDeclaration(id, uid, '');
    for (const r of cat.independance.rubriques) {
      await answerRubric(d.id, uid, r.code, 'non', '');
    }
    await signDeclaration(d.id, uid);
    await assignMember({
      engagementId: id, userId: uid, engRole: role, canSign: true,
      enteredOn: '2024-11-04', actorUserId: IDS.users.claire,
    });
  }

  // 4. La balance FY2024, importée comme balance COURANTE de ce dossier-là.
  const tb = fs.readFileSync(ds('tb_2024.csv'), 'utf8');
  await importTb({
    engagementId: id, userId: IDS.users.lea, filename: 'tb_2024.csv',
    content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current',
  });
  await rebuildFslis(id, IDS.users.lea);
  await validate(await propose(id, IDS.users.lea), IDS.users.lea);

  // 5. LE PÉRIMÈTRE — et c'est la première chose qui se reprend.
  await proposeScoping(id, IDS.users.lea);
  for (const f of await listFslis(id)) {
    if (f.confirmed_by) continue;
    if (f.scoping === 'ns_proposed') {
      await confirmScoping(f.id, IDS.users.lea, 'ns_confirmed',
        `Poste non significatif en 2024 : solde inférieur au seuil de planification, aucun indicateur de risque relevé.`);
    } else if (f.scoping === 'in_scope') {
      await confirmScoping(f.id, IDS.users.lea, 'in_scope',
        'Poste retenu au périmètre 2024.');
    }
  }

  // 6. LE RISQUE et LE QUESTIONNAIRE — les conclusions qualitatives de l'année.
  await assessFsli(id, 'REVENUE', IDS.users.lea);
  for (const qn of questionsOfScope(cat, 'entite')) {
    const oui = qn.code === questionsOfScope(cat, 'entite')[0].code;
    await answerQuestion({
      engagementId: id, fsliCode: null, questionCode: qn.code,
      answer: oui ? 'oui' : 'non',
      detail: oui
        ? 'Migration du système de facturation achevée en octobre 2024 ; contrôles de bascule revus.'
        : '',
      actorUserId: IDS.users.lea,
    });
  }
  // Le facteur né du « oui » est STATUÉ : une conclusion se reprend, une
  // proposition non statuée n'en est pas une.
  for (const f of await register(id)) {
    if (f.status === 'proposed') {
      await decideFactor(id, f.id, 'confirmed',
        'Facteur retenu pour 2024 : la bascule a porté sur la totalité du chiffre d’affaires.',
        IDS.users.claire);
    }
  }

  return id;
}
