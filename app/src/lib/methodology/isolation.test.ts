// « Votre méthode reste la vôtre, vous la chargez, je ne la vois jamais. »
//
// Ce fichier ne vérifie pas que la phrase est écrite : il TENTE de la faire
// mentir. Calqué sur team.test.ts, pour la même raison — en local les
// politiques RLS sont inertes (PGlite tourne en propriétaire de la table), donc
// ce qui tient doit tenir sans elles, et le prouver (ADR-007).
//
// Trois choses se tentent ici, et aucune ne doit passer :
//   1. désigner la méthode d'un AUTRE cabinet sur sa propre mission ;
//   2. faire tourner une mission qui ne désigne aucune méthode — le repli
//      silencieux sur le catalogue de l'éditeur serait la vraie fuite ;
//   3. charger un paquet qui contient son propre SCHÉMA, donc capable de
//      désactiver tous les contrôles.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import {
  publierMethodologie, designerMethodologie, catalogueDeLaMission, catalogueParId,
  methodologies, methodologieCourante, contenuDuDepot, oublierMethodologies,
  MethodologyError,
} from './depot';
import { requiredProcedures } from '@/lib/services/risk';

/* ── un SECOND cabinet, avec SA méthode ───────────────────────────────────
   Cabinet Lambert travaille à DEUX niveaux nommés autrement. C'est ce qui rend
   la fuite visible : si une mission Vermeil lisait la méthode de Lambert, elle
   afficherait « surveillé » et « approfondi », des mots qui n'existent nulle
   part chez Vermeil.                                                        */
const LAMBERT = {
  tenant: '00000000-0000-4000-8000-0000000000c1',
  user: '00000000-0000-4000-8000-0000000000c2',
  entity: '00000000-0000-4000-8000-0000000000c3',
  period: '00000000-0000-4000-8000-0000000000c4',
  engagement: '00000000-0000-4000-8000-0000000000c5',
  /** Mission SANS méthodologie désignée : elle existe pour être refusée. */
  engagementNu: '00000000-0000-4000-8000-0000000000c6',
};

let methLambert = '';

async function seedLambert(): Promise<void> {
  await q(`insert into tenant (id, name, issuer_reports_2024) values ($1, 'Cabinet Lambert (fictif)', 0)`, [LAMBERT.tenant]);
  await q(
    `insert into app_user (id, tenant_id, name, email, firm_role)
     values ($1, $2, 'Paul Lambert', 'paul.lambert@lambert.example', 'partner')`,
    [LAMBERT.user, LAMBERT.tenant],
  );
  await q(
    `insert into entity (id, tenant_id, name, country, registry_type, currency)
     values ($1, $2, 'Cliente de Lambert (fictive)', 'FR', 'fictional', 'EUR')`,
    [LAMBERT.entity, LAMBERT.tenant],
  );
  await q(
    `insert into period (id, entity_id, label, start_date, end_date)
     values ($1, $2, 'FY2025', '2025-01-01', '2025-12-31')`,
    [LAMBERT.period, LAMBERT.entity],
  );

  // La méthode de Lambert : deux niveaux, nommés autrement.
  const contenu = await contenuDuDepot();
  const risque = JSON.parse(JSON.stringify(contenu['risque.json'])) as Record<string, never>;
  const r = risque as unknown as {
    echelle: { niveaux: string[]; paliers: { facteurs_min: number; niveau: string }[] };
    tailles_echantillon: Record<string, unknown>;
  };
  r.echelle = {
    niveaux: ['surveille', 'approfondi'],
    paliers: [{ facteurs_min: 0, niveau: 'surveille' }, { facteurs_min: 1, niveau: 'approfondi' }],
  };
  r.tailles_echantillon = { surveille: 15, approfondi: 40 };
  const procs = JSON.parse(JSON.stringify(contenu['procedures.json'])) as {
    procedures: { risque_minimum: string }[];
  };
  for (const p of procs.procedures) p.risque_minimum = 'surveille';

  const row = await publierMethodologie({
    tenantId: LAMBERT.tenant,
    label: 'Méthode Lambert — deux niveaux',
    contenu: { ...contenu, 'risque.json': risque, 'procedures.json': procs },
    actorUserId: LAMBERT.user,
  });
  methLambert = row.id;

  for (const [id, meth] of [[LAMBERT.engagement, methLambert], [LAMBERT.engagementNu, null]] as const) {
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
       values ($1, $2, $3, $4, 'statutory_audit', 'Mission Lambert (fictive)',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork', $5)`,
      [id, LAMBERT.tenant, LAMBERT.entity, LAMBERT.period, meth],
    );
  }
}

describe('la méthode d’un cabinet est à lui', () => {
  beforeAll(async () => {
    await initTestDb();
    await seedLambert();
  });

  /* ═══ 1. chaque cabinet lit SA méthode ══════════════════════════════════ */

  it('deux cabinets, deux échelles — chacun voit la sienne', async () => {
    const vermeil = await catalogueDeLaMission(IDS.engNep);
    const lambert = await catalogueDeLaMission(LAMBERT.engagement);
    expect(vermeil.risque.niveaux).toEqual(['faible', 'moyen', 'eleve']);
    expect(lambert.risque.niveaux).toEqual(['surveille', 'approfondi']);
    // Et le contenu ne fuit pas : aucun niveau de l'un n'apparaît chez l'autre.
    for (const n of lambert.risque.niveaux) expect(vermeil.risque.niveaux).not.toContain(n);
  });

  it('la méthode du dépôt n’est plus lue par les services : c’est la ligne du cabinet', async () => {
    // La preuve est indirecte et c'est la bonne : les tailles d'échantillon de
    // Lambert (15/40) n'existent nulle part dans methodology/.
    const lambert = await catalogueDeLaMission(LAMBERT.engagement);
    expect(lambert.risque.tailles).toMatchObject({ surveille: 15, approfondi: 40 });
  });

  /* ═══ 2. LA FUITE, TENTÉE ═══════════════════════════════════════════════ */

  it('désigner la méthode d’un AUTRE cabinet est refusé par le service', async () => {
    await expect(designerMethodologie({
      engagementId: IDS.engNep,
      methodologyId: methLambert,
      actorUserId: IDS.users.claire,
    })).rejects.toThrow(/isolation/);
  });

  it('… et reste impossible même en contournant le service : la BASE refuse', async () => {
    /* La garde applicative pourrait être retirée un jour par mégarde. La clé
       étrangère composite (methodology_id, tenant_id), elle, n'est pas inerte
       en local — contrairement aux politiques RLS. C'est la ceinture sous les
       bretelles, et elle se vérifie en tentant l'écriture directe. */
    await expect(
      q(`update engagement set methodology_id = $1 where id = $2`, [methLambert, IDS.engNep]),
    ).rejects.toThrow(/engagement_methodology_same_firm/);   // par NOM : pas n'importe quelle erreur
    // et la mission n'a pas bougé
    const row = await q01<{ methodology_id: string }>(
      `select methodology_id from engagement where id = $1`, [IDS.engNep]);
    expect(row?.methodology_id).toBe(IDS.methodology);
  });

  it('désigner la méthode de SON cabinet fonctionne — sans quoi les refus ci-dessus ne prouveraient rien', async () => {
    /* Un service qui refuse TOUT refuserait aussi les fuites. Le chemin normal
       doit donc être exercé, ou les quatre tests d'isolation passeraient à
       vide. */
    const seconde = await publierMethodologie({
      tenantId: LAMBERT.tenant,
      label: 'Méthode Lambert — révision de désignation',
      contenu: await contenuDuDepot(),
      actorUserId: LAMBERT.user,
    });
    await designerMethodologie({
      engagementId: LAMBERT.engagementNu,
      methodologyId: seconde.id,
      actorUserId: LAMBERT.user,
    });
    // la mission qui refusait de charger charge maintenant, et c'est CELLE-LÀ
    const cat = await catalogueDeLaMission(LAMBERT.engagementNu);
    expect(cat.risque.niveaux).toEqual(['faible', 'moyen', 'eleve']);   // le contenu du dépôt
    const row = await q01<{ methodology_id: string }>(
      `select methodology_id from engagement where id = $1`, [LAMBERT.engagementNu]);
    expect(row?.methodology_id).toBe(seconde.id);
    // on la remet à nu : les tests suivants comptent dessus
    await q(`update engagement set methodology_id = null where id = $1`, [LAMBERT.engagementNu]);
    await q(`delete from firm_methodology where id = $1`, [seconde.id]);
  });

  it('publier pour un cabinet dont on n’est pas est refusé', async () => {
    await expect(publierMethodologie({
      tenantId: LAMBERT.tenant,
      label: 'Méthode volée',
      contenu: await contenuDuDepot(),
      actorUserId: IDS.users.claire,   // Claire est chez Vermeil
    })).rejects.toThrow(/isolation/);
  });

  it('un cabinet ne voit que ses propres méthodes dans la liste', async () => {
    const vermeil = await methodologies(IDS.tenant);
    const lambert = await methodologies(LAMBERT.tenant);
    expect(vermeil.map((m) => m.id)).toEqual([IDS.methodology]);
    expect(lambert.map((m) => m.id)).toEqual([methLambert]);
    expect((await methodologieCourante(LAMBERT.tenant))?.id).toBe(methLambert);
  });

  /* ═══ 3. LE REPLI SILENCIEUX, qui serait la vraie fuite ═════════════════ */

  it('une mission SANS méthodologie est REFUSÉE, pas repliée sur celle de l’éditeur', async () => {
    /* Le défaut qu'on interdit ici : `?? chargerCatalogue()`. Le dossier
       tournerait sur la méthode de l'éditeur, les travaux requis seraient les
       siens, et aucun écran ne le dirait. */
    await expect(catalogueDeLaMission(LAMBERT.engagementNu))
      .rejects.toThrow(/ne désigne aucune méthodologie/);
  });

  it('… et le refus remonte jusqu’au service qui commande les travaux', async () => {
    await expect(requiredProcedures(LAMBERT.engagementNu, 'REVENUE'))
      .rejects.toThrow(/ne désigne aucune méthodologie/);
  });

  /* ═══ 4. le paquet ne peut pas apporter ses propres CONTRÔLES ═══════════ */

  it('un paquet qui livre son propre SCHÉMA est refusé', async () => {
    /* Le schéma énumère ce que le MOTEUR sait calculer — les prédicats
       implémentés, les règles de date. Un cabinet qui livrerait le sien
       désactiverait tous les contrôles en une ligne, et son fichier invalide
       passerait sans bruit. */
    const contenu = await contenuDuDepot();
    await expect(publierMethodologie({
      tenantId: LAMBERT.tenant,
      label: 'Méthode avec schéma maison',
      contenu: { ...contenu, 'schema-risque.json': { predicats_facteur: [] } },
      actorUserId: LAMBERT.user,
    })).rejects.toThrow(/schéma\(s\) dans le paquet/);
  });

  it('un paquet INVALIDE n’entre pas en base — il est refusé au moment de publier', async () => {
    const contenu = await contenuDuDepot();
    const procs = JSON.parse(JSON.stringify(contenu['procedures.json'])) as {
      procedures: { assertion: string }[];
    };
    procs.procedures[0].assertion = 'intuition';
    await expect(publierMethodologie({
      tenantId: LAMBERT.tenant,
      label: 'Méthode invalide',
      contenu: { ...contenu, 'procedures.json': procs },
      actorUserId: LAMBERT.user,
    })).rejects.toThrow(/absente du jeu du cabinet/);
    // et rien n'a été écrit : Lambert n'a toujours qu'une seule méthode
    expect(await methodologies(LAMBERT.tenant)).toHaveLength(1);
  });

  it('un paquet AMPUTÉ d’un fichier est refusé, pas complété en silence', async () => {
    const contenu = await contenuDuDepot();
    delete contenu['assertions.json'];
    await expect(publierMethodologie({
      tenantId: LAMBERT.tenant,
      label: 'Méthode incomplète',
      contenu,
      actorUserId: LAMBERT.user,
    })).rejects.toThrow(/fichiers manquants/);
  });

  /* ═══ 5. une méthode publiée est IMMUABLE, et le dossier la cite ════════ */

  it('publier une seconde fois crée une ligne — la première ne bouge pas', async () => {
    const avant = await catalogueParId(methLambert);
    const contenu = await contenuDuDepot();
    const seconde = await publierMethodologie({
      tenantId: LAMBERT.tenant,
      label: 'Méthode Lambert — millésime suivant',
      contenu,
      actorUserId: LAMBERT.user,
    });
    expect(seconde.id).not.toBe(methLambert);
    // la mission garde la SIENNE : une méthode publiée en mars ne change pas
    // rétroactivement les travaux requis d'un dossier planifié en janvier
    const apres = await catalogueDeLaMission(LAMBERT.engagement);
    expect(apres.risque.niveaux).toEqual(avant.risque.niveaux);
    expect(apres.risque.niveaux).toEqual(['surveille', 'approfondi']);
    expect((await methodologieCourante(LAMBERT.tenant))?.id).toBe(seconde.id);
  });

  it('l’empreinte du contenu est stable et citable', async () => {
    const [m] = await methodologies(IDS.tenant);
    expect(m.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.versions).toHaveProperty('assertions');
  });

  it('la publication et la désignation laissent une trace au journal', async () => {
    const rows = await q<{ verb: string; object_id: string }>(
      `select verb, object_id from event_log where verb like 'methodology.%' order by id`,
    );
    expect(rows.map((r) => r.verb)).toContain('methodology.published');
    expect(rows.some((r) => r.object_id === IDS.methodology)).toBe(true);
  });

  /* ═══ 6. le cache ne peut pas rendre une méthode fausse ═════════════════ */

  it('vider le cache ne change rien au catalogue rendu', async () => {
    const avant = await catalogueParId(methLambert);
    oublierMethodologies();
    const apres = await catalogueParId(methLambert);
    expect(apres.risque.niveaux).toEqual(avant.risque.niveaux);
    expect(apres.procedures.length).toBe(avant.procedures.length);
  });

  it('MethodologyError est levée sur un identifiant inconnu, pas un catalogue vide', async () => {
    await expect(catalogueParId('00000000-0000-4000-8000-0000000000ff'))
      .rejects.toThrow(MethodologyError);
  });
});
