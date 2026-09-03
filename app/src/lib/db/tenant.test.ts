import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, tx, _setDbForTests } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { withTenant, locataireCourant } from '@/lib/db/tenant';
import { armerLeGarde, gardeArme, sansLocataire, CHEMINS_SANS_LOCATAIRE } from '@/lib/db/sans-locataire';

/**
 * LA FUITE ENTRE CABINETS, ÉPROUVÉE SOUS UN RÔLE QUI NE CONTOURNE PAS LA RLS
 * (docs/PLAN_RLS.md, étape 1 ; mandat du jour n°3 §1.1).
 *
 * CE QUE CE FICHIER MESURE, ET QU'AUCUN AUTRE NE MESURAIT : la production
 * tourne sous un rôle BYPASSRLS — les cent-deux politiques du schéma sont
 * INERTES, et rien dans la suite ne les exerçait. Ici on crée un rôle SANS
 * bypass, on lui donne les droits de l'application, et on regarde ce que la
 * BASE laisse passer. C'est la répétition, en local, de ce que l'étape 3 fera
 * en production.
 *
 * LA QUESTION QUE LE PLAN POSAIT DE TRAVERS (addendum A.5) : « une politique
 * en `using` seul empêche de LIRE chez le voisin mais laisse ÉCRIRE chez lui ».
 * Les 101 politiques du schéma sont `for all … using (…)` sans `with check`.
 * La documentation de PostgreSQL dit que, `with check` omis, c'est `using` qui
 * sert AUSSI de contrôle à l'écriture. Une documentation n'est pas une
 * observation (règle 15) : le cas 4 ci-dessous TENTE l'insertion et regarde.
 */
describe('la fuite entre cabinets, sous un rôle sans BYPASSRLS', () => {
  const ROLE = 'otto_app_essai';
  let autreCabinet = '';
  let dossierEtranger = '';

  beforeAll(async () => {
    await initTestDb();
    const t = await q1<{ id: string }>(
      `insert into tenant (name) values ('Cabinet Étranger (fictif)') returning id::text`);
    autreCabinet = t.id;
    const e = await q1<{ id: string }>(
      `insert into entity (tenant_id, name, country, registry_type, registry_no)
       values ($1, 'Étrangère SAS (fictive)', 'FR', 'siren', '000000000') returning id::text`,
      [autreCabinet]);
    const p = await q1<{ id: string }>(
      `insert into period (entity_id, label, start_date, end_date)
       values ($1, 'FY2025', '2025-01-01', '2025-12-31') returning id::text`, [e.id]);
    /* La méthode appartient au CABINET (contrainte engagement_methodology_same_firm) :
       le cabinet étranger a la sienne, copie de celle de la démonstration. */
    const m = await q1<{ id: string }>(
      `insert into firm_methodology (tenant_id, label, content, content_hash, versions, published_by)
       select $1, label, content, content_hash, versions, published_by from firm_methodology
       where tenant_id = $2 order by published_at desc limit 1 returning id::text`,
      [autreCabinet, IDS.tenant]);
    const d = await q1<{ id: string }>(
      `insert into engagement (tenant_id, entity_id, period_id, kind, name, status, classe, framework_set, methodology_id)
       select $1, $2, $3, kind, 'Étrangère FY2025 — Audit (fictif)', 'setup', classe,
              framework_set, $5 from engagement where id = $4 returning id::text`,
      [autreCabinet, e.id, p.id, IDS.engNep, m.id]);
    dossierEtranger = d.id;

    /* LE RÔLE APPLICATIF D'ESSAI : les mêmes droits que `otto_app` recevra en
       production (0140), et surtout PAS de BYPASSRLS. */
    await q(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${ROLE}') then
        create role ${ROLE} nobypassrls nosuperuser noinherit;
      end if;
    end $$`);
    await q(`grant usage on schema public to ${ROLE}`);
    await q(`grant select, insert, update, delete on all tables in schema public to ${ROLE}`);
    await q(`grant usage, select on all sequences in schema public to ${ROLE}`);
    await q(`grant execute on all functions in schema public to ${ROLE}`);
  }, 600000);

  /** Conduire une requête SOUS le rôle applicatif, dans une transaction. */
  async function sousLeRole<T>(fn: (run: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<T>): Promise<T> {
    return tx(async (run) => {
      await run(`set local role ${ROLE}`);
      try {
        return await fn(run);
      } finally {
        await run(`reset role`).catch(() => undefined);
      }
    });
  }

  it('CAS 1 — sans locataire posé, la base ne rend RIEN (et c’est le silence que la règle 13 nomme)', async () => {
    const n = await sousLeRole(async (run) => {
      const r = await run(`select count(*)::text n from engagement`) as { n: string }[];
      return Number(r[0].n);
    });
    expect(n, 'sans locataire, le rôle applicatif lit des dossiers').toBe(0);
    /* Ce zéro N'EST PAS une erreur : c'est exactement pourquoi le garde de
       `q()` existe (voir sans-locataire.ts) — une page vide sans message. */
  });

  it('CAS 2 — avec le locataire d’un AUTRE cabinet, zéro ligne du cabinet de démonstration', async () => {
    const vus = await sousLeRole(async (run) => {
      await run(`select set_config('otto.tenant_id', $1, true)`, [autreCabinet]);
      const r = await run(`select id::text from engagement where id = $1`, [IDS.engNep]) as { id: string }[];
      return r.length;
    });
    expect(vus, 'un cabinet étranger voit le dossier de démonstration').toBe(0);
  });

  it('CAS 3 — avec le bon locataire, les lignes attendues, et un événement s’écrit', async () => {
    const r = await sousLeRole(async (run) => {
      await run(`select set_config('otto.tenant_id', $1, true)`, [IDS.tenant]);
      const dossiers = await run(`select id::text from engagement where id = $1`, [IDS.engNep]) as { id: string }[];
      const ev = await run(
        `insert into event_log (tenant_id, engagement_id, actor_kind, verb, object_type, payload, hash, prev_hash)
         values ($1, $2, 'system', 'essai_locataire', 'engagement', '{}'::jsonb, 'h-essai', 'racine-essai')
         returning id::text`, [IDS.tenant, IDS.engNep]) as { id: string }[];
      return { dossiers: dossiers.length, ev: ev.length };
    });
    expect(r.dossiers).toBe(1);
    expect(r.ev, 'le locataire posé n’autorise pas l’écriture de son propre journal').toBe(1);
  });

  it('CAS 4 — écrire CHEZ LE VOISIN est refusé : `using` sert aussi de contrôle à l’écriture (OBSERVÉ, pas supposé)', async () => {
    let refus = '';
    await sousLeRole(async (run) => {
      await run(`select set_config('otto.tenant_id', $1, true)`, [IDS.tenant]);
      try {
        await run(
          `insert into event_log (tenant_id, engagement_id, actor_kind, verb, object_type, payload, hash, prev_hash)
           values ($1, $2, 'system', 'fuite', 'engagement', '{}'::jsonb, 'h-fuite', 'racine-fuite')`,
          [autreCabinet, dossierEtranger]);
      } catch (e) {
        refus = e instanceof Error ? e.message : String(e);
      }
    });
    expect(refus, 'une ligne au nom d’un AUTRE cabinet a été acceptée — la politique ne contrôle pas l’écriture')
      .toMatch(/row-level security|violates|policy/i);
    /* Et rien n'est resté. */
    const reste = await q<{ n: string }>(`select count(*)::text n from event_log where verb = 'fuite'`);
    expect(Number(reste[0].n)).toBe(0);
  });

  it('CAS 4 bis — DÉPLACER une ligne chez le voisin est refusé aussi (l’`update`, pas seulement l’`insert`)', async () => {
    /* Le cas 4 éprouve l'INSERT. Une politique pourrait contrôler l'insertion
       et laisser un `update` faire glisser une ligne existante chez le voisin
       — c'est le second visage de la même question, et il se mesure.
       LA TABLE A ÉTÉ CHOISIE, ET LE PREMIER CHOIX ÉTAIT FAUX : sur `event_log`
       c'est la garde APPEND-ONLY (0003) qui refuse, pas la politique — on
       aurait présenté le refus d'un autre objet comme preuve de celui-ci
       (règle 16). `app_user` porte `tenant_id`, sa politique est directe, et
       aucune garde de verrou ne l'interdit d'écriture. */
    let refus = '';
    let touchees = -1;
    await sousLeRole(async (run) => {
      await run(`select set_config('otto.tenant_id', $1, true)`, [IDS.tenant]);
      try {
        const r = await run(`update app_user set tenant_id = $1 where id = $2 returning id::text`,
          [autreCabinet, IDS.users.karim]) as { id: string }[];
        touchees = r.length;
      } catch (e) {
        refus = e instanceof Error ? e.message : String(e);
      }
    });
    expect(refus || `aucun refus, ${touchees} ligne(s) déplacée(s)`,
      'une ligne a été DÉPLACÉE chez un autre cabinet').toMatch(/row-level security|violates|policy/i);
    expect(refus, 'le refus vient d’une garde append-only, pas de la politique — mauvaise mesure')
      .not.toMatch(/append-only/i);
    const reste = await q1<{ t: string }>(
      `select tenant_id::text t from app_user where id = $1`, [IDS.users.karim]);
    expect(reste.t, 'la personne a changé de cabinet').toBe(IDS.tenant);
  });

  it('CAS 5 — `withTenant` pose le locataire pour toute la transaction, et le rend', async () => {
    expect(await locataireCourant(), 'un locataire traîne hors transaction').toBeNull();
    const lu = await withTenant(IDS.tenant, async () => locataireCourant());
    expect(lu).toBe(IDS.tenant);
    expect(await locataireCourant(), 'le locataire a survécu à la transaction').toBeNull();
  });

  it('withTenant refuse un locataire vide — une chaîne vide n’est pas un cabinet', async () => {
    await expect(withTenant('', async () => 1)).rejects.toThrow(/locataire vide/);
  });

  /**
   * LE GARDE LOC-01, ÉPROUVÉ CONTRE UN CAS CONNU MAUVAIS (règle 17).
   *
   * Le garde est DÉSARMÉ dans toutes les exécutions d'aujourd'hui — le rôle
   * servi contourne la RLS. Un garde qui n'a jamais refusé n'est pas un garde :
   * ces cas l'ARMENT et le font refuser, puis vérifient qu'il se tait quand il
   * doit se taire.
   */
  describe('le garde de locataire (LOC-01 / LOC-02)', () => {
    afterEach(() => { armerLeGarde(true); });

    it('DÉSARMÉ par défaut sous le rôle propriétaire — sinon toute la suite d’aujourd’hui refuserait', () => {
      armerLeGarde(true);
      expect(gardeArme()).toBe(false);
    });

    it('ARMÉ, une lecture sans locataire est REFUSÉE, et le refus NOMME la table', async () => {
      armerLeGarde(false);
      expect(gardeArme()).toBe(true);
      await expect(q(`select count(*) from engagement`)).rejects.toThrow(/LOC-01/);
      await expect(q(`select count(*) from engagement`)).rejects.toThrow(/engagement/);
      /* Et le zéro silencieux du CAS 1 n'est plus possible : on ne rend plus
         zéro ligne, on refuse. */
    });

    it('ARMÉ, OUVRIR UNE TRANSACTION sans locataire est refusé aussi — `run()` ne passe pas par `q()`', async () => {
      /* LE TROU QUE LE GARDE DE `q()` SEUL LAISSAIT : trois services écrivent
         par `tx(async run => run('insert …'))`, et `run` parle au pilote sans
         passer par `q()`. Le garde tient donc les DEUX entrées. */
      armerLeGarde(false);
      await expect(tx(async (run) => run(`select 1`))).rejects.toThrow(/LOC-01/);
      /* Et il DIT ce qu'il refuse : « (table indéterminée) » sur le chemin
         d'écriture laissait le développeur sans diagnostic. */
      await expect(tx(async (run) => run(`select 1`))).rejects.toThrow(/ouverture d’une transaction/);
      /* Et sous withTenant, la même transaction passe. */
      const r = await withTenant(IDS.tenant, () => tx(async (run) => run(`select 1 as un`)));
      expect((r as { un: number }[])[0].un).toBe(1);
    });

    it('ARMÉ, la même lecture passe sous withTenant, et sous une dérogation LISTÉE', async () => {
      armerLeGarde(false);
      const sousBail = await withTenant(IDS.tenant, () => q<{ n: string }>(`select count(*)::text n from engagement`));
      expect(Number(sousBail[0].n)).toBeGreaterThan(0);
      const sousDerogation = await sansLocataire('session', () => q<{ n: string }>(`select count(*)::text n from app_user`));
      expect(Number(sousDerogation[0].n)).toBeGreaterThan(0);
    });

    it('CE QUE L’ARMEMENT COÛTERAIT AUJOURD’HUI : deux chemins RÉELS du produit lèvent — donc on ne peut pas l’armer', async () => {
      /* LE CONSTAT LE PLUS GRAVE DE LA REVUE HOSTILE n°9 (n°2), mesuré ici au
         lieu d'être supposé. `withTenant` n'a AUCUN appelant de production : le
         câblage de l'étape 1 de PLAN_RLS n'est pas fait. Armer le garde
         n'« empêcherait pas l'oubli » — il éteindrait l'application. Ce test
         existe pour que ce fait soit une MESURE dans la suite, et pour qu'il
         devienne rouge le jour où le câblage sera fait (il faudra alors le
         réécrire, et ce sera la bonne nouvelle). */
      armerLeGarde(false);
      const { missionsParClient } = await import('@/lib/services/bascule');
      await expect(missionsParClient(IDS.users.karim), 'l’écran d’accueil ne lève plus : le câblage a-t-il été fait ?')
        .rejects.toThrow(/LOC-01/);
      const { logEvent } = await import('@/lib/core/events');
      await expect(logEvent({
        tenantId: IDS.tenant, engagementId: IDS.engNep, actorKind: 'system',
        verb: 'essai_garde', objectType: 'engagement', payload: {},
      } as never), 'logEvent ne lève plus : tout changement d’état passait par lui').rejects.toThrow(/LOC-01/);
    });

    it('ARMÉ OU NON, une dérogation dont la clé n’est pas ÉCRITE est refusée (LOC-02)', async () => {
      armerLeGarde(true);
      await expect(sansLocataire('je-fais-ce-que-je-veux', async () => 1)).rejects.toThrow(/LOC-02/);
      armerLeGarde(false);
      await expect(sansLocataire('je-fais-ce-que-je-veux', async () => 1)).rejects.toThrow(/LOC-02/);
    });

    it('l’ARMEMENT se déduit du rôle SERVI, pas d’une variable — un pilote sans bypass arme le garde', async () => {
      /* LA BRANCHE QUE RIEN N'EXÉCUTERAIT AUTREMENT : en local le rôle
         contourne toujours, donc l'armement automatique ne se joue jamais.
         On lui tend un pilote qui RÉPOND « rolbypassrls = false », et on
         regarde ce que `_setDbForTests` en fait. */
      const vrai = (globalThis as { __ottoDb?: unknown }).__ottoDb;
      const menteur = {
        async query<T>(sql: string) {
          if (/rolbypassrls/.test(sql)) return { rows: [{ b: false }] as unknown as T[] };
          return { rows: [] as T[] };
        },
        async exec() {}, async transaction() { return undefined; }, async close() {},
      };
      try {
        /* ON ATTEND LA MESURE, on ne dort pas : un `setTimeout(20)` comme
           instrument de synchronisation sur un état GLOBAL de processus est
           un pari, pas une vérification (revue hostile n°9, constat 13). */
        await _setDbForTests(menteur as never);
        expect(gardeArme(), 'un rôle sans BYPASSRLS n’a pas armé le garde').toBe(true);
      } finally {
        await _setDbForTests(vrai as never);
      }
    });
  });

  it('LA LISTE elle-même : sept chemins, six câblés — le COMPTE est asserté, pas récité', () => {
    /* La première rédaction disait « six chemins, cinq câblés » et énumérait
       six clés câblées dans la même parenthèse : elle se contredisait, et rien
       ne comptait (revue hostile n°9, constat 16). */
    expect(CHEMINS_SANS_LOCATAIRE.length).toBe(7);
    expect(CHEMINS_SANS_LOCATAIRE.filter((c) => c.etat === 'cable').length).toBe(6);
    expect(CHEMINS_SANS_LOCATAIRE.filter((c) => c.etat === 'a-cabler').map((c) => c.cle)).toEqual(['scripts']);
    const cles = CHEMINS_SANS_LOCATAIRE.map((c) => c.cle);
    expect(new Set(cles).size, 'deux chemins portent la même clé').toBe(cles.length);
    for (const c of CHEMINS_SANS_LOCATAIRE) {
      expect(c.ou.trim().length, `${c.cle} : sans lieu`).toBeGreaterThan(10);
      expect(c.raison.trim().length, `${c.cle} : sans raison écrite`).toBeGreaterThan(40);
      expect(c.lit.trim().length, `${c.cle} : sans dire ce qu’il lit`).toBeGreaterThan(5);
    }
  });
});
