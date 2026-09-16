import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { constatEtPointAction, assignerProprietairePointAction, relancerPointAction } from './matching';
import { demanderDetailDeCompte, approveSend } from './requests';

// H-2, slice 1 (Lot 7 — docs/REGISTRE_IDEES.md ligne 270 : « le cycle de vie du constat
// vis-à-vis du client »). `constatEtPointAction` ne fait qu'AFFICHER, côte à côte, deux objets
// que le code tient déjà séparés — cette suite prouve que la JOINTURE elle-même est correcte et
// que les deux statuts (exception vs request_item) restent bien deux champs distincts, jamais
// fusionnés. Fixture auto-suffisante par insertion SQL directe (comme obstacles-demandes.test.ts
// pour ses cas connus mauvais) plutôt que le cycle complet runMatching/draftClarificationRequest
// (trop lourd pour ce qui est prouvé ici : la jointure, pas le moteur de rapprochement).

describe('constatEtPointAction (H-2 slice 1) : le constat et le point d’action client restent deux objets distincts', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);

  it('un constat OUVERT sans clarification envoyée n’apparaît pas ici (aucun request_item ne le porte encore)', async () => {
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'open', 'sonde H-2 : constat sans clarification') returning id::text`,
      [IDS.engNep],
    );
    try {
      const rows = await constatEtPointAction(IDS.engNep);
      expect(rows.find((r) => r.exception_id === exc.id)).toBeUndefined();
    } finally {
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it('une clarification envoyée fait apparaître les DEUX objets, avec leurs DEUX statuts distincts', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 : constat clarifié') returning id::text`,
      [IDS.engNep],
    );
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 : merci d’expliquer', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      const rows = await constatEtPointAction(IDS.engNep);
      const trouve = rows.find((r) => r.exception_id === exc.id);
      expect(trouve, 'la ligne doit apparaître dès qu’un request_item la porte').toBeDefined();
      expect(trouve?.item_id).toBe(item.id);
      expect(trouve?.exception_status, 'le constat reste au statut du DOSSIER').toBe('clarification_requested');
      expect(trouve?.item_status, 'le point d’action reste au statut du CLIENT — jamais fusionné').toBe('pending');
      // le client répond : SEUL le point d'action bouge, jamais le dossier (règle H-2 :
      // « le point d'action client ne remplace jamais l'exception d'audit »)
      await q(`update request_item set status = 'complete', client_note = 'Réponse du client.' where id = $1`, [item.id]);
      const apres = (await constatEtPointAction(IDS.engNep)).find((r) => r.exception_id === exc.id);
      expect(apres?.item_status).toBe('complete');
      expect(apres?.exception_status, 'le dossier ne se referme QUE par un humain (resolveException), jamais par la réponse client').toBe('clarification_requested');
    } finally {
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it('un request_item d’un AUTRE genre pointant exception_id (règle 17 : jamais posé par le chemin gardé, mais la garde le rejette quand même)', async () => {
    /* Trouvé par la revue hostile : la requête ne filtrait pas i.kind = 'explanation', alors
       que son propre docstring et la lecture sœur /api/sante l'affirment — non exploitable en
       pratique (seul draftClarificationRequest pose exception_id, toujours avec kind=
       'explanation'), mais un défaut de cohérence réel. Corrigé (i.kind = 'explanation' ajouté) ;
       ce test le fige. */
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 : genre inattendu') returning id::text`,
      [IDS.engNep],
    );
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'document', 'sonde H-2 : jamais posé ainsi par le produit', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      const rows = await constatEtPointAction(IDS.engNep);
      expect(rows.find((r) => r.exception_id === exc.id), 'un request_item hors kind=explanation ne doit jamais apparaître ici').toBeUndefined();
    } finally {
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it('H-2 slice 2 : assigner un propriétaire (client_contact de l’entité) et une échéance au point d’action, jamais au constat', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 slice 2 : assignation') returning id::text`,
      [IDS.engNep],
    );
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 slice 2', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      await assignerProprietairePointAction(item.id, IDS.contacts.sophie, '2026-10-01', IDS.users.karim);
      const trouve = (await constatEtPointAction(IDS.engNep)).find((r) => r.item_id === item.id);
      expect(trouve?.owner_contact_id).toBe(IDS.contacts.sophie);
      expect(trouve?.owner_name).toBeTruthy();
      expect(trouve?.item_due_date).toBe('2026-10-01');
      expect(trouve?.exception_status, 'assigner un propriétaire ne touche JAMAIS le dossier').toBe('clarification_requested');
      // effacer : ownerContactId=null, dueDate=null
      await assignerProprietairePointAction(item.id, null, null, IDS.users.karim);
      const apres = (await constatEtPointAction(IDS.engNep)).find((r) => r.item_id === item.id);
      expect(apres?.owner_contact_id).toBeNull();
      expect(apres?.item_due_date).toBeNull();
    } finally {
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it('H-2 slice 2, cas connus mauvais (règle 17) : un item non-point-d’action et un contact d’une AUTRE entité sont refusés', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const item = await q1<{ id: string }>(`select id::text from request_item where request_id = $1`, [requestId]);
    await expect(
      assignerProprietairePointAction(item.id, null, '2026-10-01', IDS.users.karim),
      'demanderDetailDeCompte crée un item kind=document, jamais un point d’action',
    ).rejects.toThrow();

    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 slice 2 : contact étranger') returning id::text`,
      [IDS.engNep],
    );
    const explItem = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 slice 2', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    const autreEntite = await q1<{ id: string }>(
      `insert into entity (tenant_id, name, country, registry_type) values ($1, 'sonde H-2 : autre entité', 'FR', 'fictional') returning id::text`,
      [IDS.tenant],
    );
    const contactEtranger = await q1<{ id: string }>(
      `insert into client_contact (entity_id, name, email, portal_token) values ($1, 'Contact étranger', 'etranger@sonde.example', 'sonde-h2-etranger') returning id::text`,
      [autreEntite.id],
    );
    try {
      await expect(
        assignerProprietairePointAction(explItem.id, contactEtranger.id, null, IDS.users.karim),
        'un contact d’une autre entité ne doit jamais être assignable comme propriétaire',
      ).rejects.toThrow();
    } finally {
      await q(`delete from request_item where id = $1`, [explItem.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
      await q(`delete from client_contact where id = $1`, [contactEtranger.id]);
      await q(`delete from entity where id = $1`, [autreEntite.id]);
    }
  });

  it('migration 0167 (revue hostile voix 1, règle 17) : la base elle-même refuse owner_contact_id/due_date hors kind=explanation', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const item = await q1<{ id: string }>(`select id::text from request_item where request_id = $1`, [requestId]);
    /* Mutation SQL DIRECTE, hors du chemin gardé (jamais assignerProprietairePointAction) — le
       seul moyen de prouver que le FILET tient même sans passer par le service applicatif,
       exactement ce que la revue hostile a trouvé absent avant ce correctif. */
    await expect(
      q(`update request_item set owner_contact_id = $2, due_date = '2026-10-01' where id = $1`, [item.id, IDS.contacts.sophie]),
      'la contrainte request_item_owner_only_for_explanation doit refuser un item kind=document',
    ).rejects.toThrow();
  });

  it('H-2 slice 3 : relancer un point d’action assigné écrit une relance PROPRE à l’item, jamais confondue avec celles de la demande', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 slice 3 : relance') returning id::text`,
      [IDS.engNep],
    );
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 slice 3', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      await assignerProprietairePointAction(item.id, IDS.contacts.sophie, '2026-10-15', IDS.users.karim);
      const resultat = await relancerPointAction(item.id, IDS.users.karim);
      expect(resultat.remis, 'transport SIMULÉ — jamais un envoi réel').toBe(false);
      const rem = await q1<{ request_id: string; request_item_id: string }>(
        `select request_id::text, request_item_id::text from reminder where request_item_id = $1`,
        [item.id],
      );
      expect(rem.request_id, 'request_id dénormalisé doit coïncider avec celui du point d’action').toBe(requestId);
      const trouve = (await constatEtPointAction(IDS.engNep)).find((r) => r.item_id === item.id);
      expect(trouve?.derniere_relance, 'la relance doit apparaître dans constatEtPointAction').toBeTruthy();
    } finally {
      await q(`delete from reminder where request_item_id = $1`, [item.id]);
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it('H-2 slice 3, cas connus mauvais (règle 17) : sans propriétaire, sur un item déjà répondu, ou hors kind=explanation, la relance est refusée', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const docItem = await q1<{ id: string }>(`select id::text from request_item where request_id = $1`, [requestId]);
    await expect(
      relancerPointAction(docItem.id, IDS.users.karim),
      'un item kind=document n’est pas un point d’action',
    ).rejects.toThrow();

    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 slice 3 : cas mauvais') returning id::text`,
      [IDS.engNep],
    );
    const sansProprietaire = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 slice 3 : sans propriétaire', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    const dejaRepondu = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status, owner_contact_id)
       values ($1, 'explanation', 'sonde H-2 slice 3 : déjà répondu', $2, 'complete', $3) returning id::text`,
      [requestId, exc.id, IDS.contacts.sophie],
    );
    try {
      await expect(
        relancerPointAction(sansProprietaire.id, IDS.users.karim),
        'sans propriétaire assigné, personne à relancer',
      ).rejects.toThrow();
      await expect(
        relancerPointAction(dejaRepondu.id, IDS.users.karim),
        'un point d’action déjà répondu (complete) n’a rien à relancer',
      ).rejects.toThrow();
    } finally {
      await q(`delete from request_item where id in ($1, $2)`, [sansProprietaire.id, dejaRepondu.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });
});
