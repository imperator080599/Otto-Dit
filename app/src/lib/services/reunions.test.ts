import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { genererIcs } from '@/lib/kernel/ics';
import { SimulatedAgendaAdapter } from './agenda/adapters';
import {
  declarerContactCle, declarerContactDomaine, contactsDeLaMission,
  creneauxCommuns, proposerCreneaux, copiesCalculees, choisirCreneau, envoyer, invitations,
} from './reunions';

// LES RÈGLES DES RÉUNIONS SE PROUVENT EN LES EXERÇANT : l'ordre exact des
// copies, l'intersection des libertés, le refus sans contact clé, le refus
// du double envoi — et la contrainte de fond : l'adaptateur d'agenda ne PEUT
// pas rendre autre chose que libre/occupé.

describe('invitations de réunion — la partie déterministe (ADR-101)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  it('l\'intersection des libertés est pure et déterministe : jamais un créneau sur un bloc occupé', () => {
    const occupations = [
      [{ debut: '2026-03-02T09:00:00.000Z', fin: '2026-03-02T12:00:00.000Z' }],
      [{ debut: '2026-03-02T14:00:00.000Z', fin: '2026-03-02T15:00:00.000Z' }],
    ];
    const c = creneauxCommuns(occupations, new Date('2026-03-02T00:00:00Z'), new Date('2026-03-02T23:00:00Z'), 60);
    expect(c.length).toBeGreaterThan(0);
    for (const cr of c) {
      for (const blocs of occupations) {
        for (const b of blocs) {
          const chevauche = Date.parse(b.debut) < Date.parse(cr.fin) && Date.parse(b.fin) > Date.parse(cr.debut);
          expect(chevauche).toBe(false);
        }
      }
    }
    /* Le week-end n'a pas de créneau : le samedi 2026-03-07. */
    const we = creneauxCommuns([], new Date('2026-03-07T00:00:00Z'), new Date('2026-03-08T23:00:00Z'), 60);
    expect(we).toHaveLength(0);
  });

  it('l\'adaptateur simulé est déterministe, et son TYPE interdit le contenu d\'agenda', async () => {
    const a = new SimulatedAgendaAdapter();
    const x = await a.occupations(['karim.benali@vermeil-audit.example'], new Date('2026-03-02T00:00:00Z'), new Date('2026-03-04T00:00:00Z'));
    const y = await a.occupations(['karim.benali@vermeil-audit.example'], new Date('2026-03-02T00:00:00Z'), new Date('2026-03-04T00:00:00Z'));
    expect(x).toEqual(y);
    for (const bloc of x['karim.benali@vermeil-audit.example']) {
      expect(Object.keys(bloc).sort()).toEqual(['debut', 'fin']); // rien d'autre — pas de champ pour un titre
    }
  });

  it('sans contact clé, l\'invitation est REFUSÉE en nommant le geste manquant', async () => {
    await expect(copiesCalculees(IDS.engNep)).rejects.toThrow(/contact client clé/);
  });

  it('les copies suivent l\'ORDRE EXACT : clé, puis partner > manager > senior, à grade égal l\'alphabet', async () => {
    await declarerContactCle(IDS.engNep, IDS.contacts.sophie, IDS.users.claire);
    await declarerContactDomaine(IDS.engNep, IDS.contacts.theo, 'comptabilité clients', IDS.users.claire);
    /* Un second manager, pour éprouver l'alphabet à grade égal. */
    await q(
      `insert into app_user (id, tenant_id, name, email, firm_role)
       values ('bbbb2222-0000-4000-8000-000000000001', $1, 'Anne Aubry', 'anne.aubry@vermeil-audit.example', 'manager')`,
      [IDS.tenant],
    );
    await q(
      `insert into engagement_member (engagement_id, user_id, eng_role, can_sign) values ($1, 'bbbb2222-0000-4000-8000-000000000001', 'manager', true)`,
      [IDS.engNep],
    );
    const copies = await copiesCalculees(IDS.engNep);
    expect(copies.map((c) => c.nom)).toEqual([
      'Sophie Marchand',   // contact client clé — toujours première
      'Claire Fontaine',   // partner
      'Anne Aubry',        // manager — Aubry avant Moreau, alphabet à grade égal
      'Léa Moreau',        // manager
      'Karim Benali',      // senior
    ]);
    const contacts = await contactsDeLaMission(IDS.engNep);
    expect(contacts[0].role).toBe('cle');
  });

  it('proposer des créneaux lit les disponibilités de TOUTE l\'équipe via l\'adaptateur', async () => {
    const res = await proposerCreneaux(IDS.engNep, new Date('2026-03-02T00:00:00Z'), new Date('2026-03-06T00:00:00Z'), 60);
    expect(res.adaptateur).toBe('simulated');
    expect(res.creneaux.length).toBeGreaterThan(0);
    expect(res.equipe.length).toBeGreaterThanOrEqual(4);
  });

  it('le choix du créneau est HUMAIN et complet ; le .ics sort au format standard', async () => {
    await expect(choisirCreneau({
      engagementId: IDS.engNep, userId: IDS.users.claire,
      debut: '2026-03-02T13:00:00Z', fin: '2026-03-02T14:00:00Z', objet: 'Point d\'étape', destinataireContactId: '',
    })).rejects.toThrow(/choix est humain/);
    const id = await choisirCreneau({
      engagementId: IDS.engNep, userId: IDS.users.claire,
      debut: '2026-03-02T13:00:00Z', fin: '2026-03-02T14:00:00Z',
      objet: 'Point d\'étape ; revue des demandes', destinataireContactId: IDS.contacts.sophie,
    });
    const [inv] = await invitations(IDS.engNep);
    expect(inv.id).toBe(id);
    expect(inv.statut).toBe('choisie');
    const ics = (await q<{ ics: string }>(`select ics from meeting_invitation where id = $1`, [id]))[0].ics;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260302T130000Z');
    expect(ics).toContain('SUMMARY:Point d\'étape \; revue des demandes'.replace('\\\;', '\;'));
    /* destinataire + clé + 4 membres = 6 participants. */
    expect((ics.match(/ATTENDEE/g) ?? []).length).toBe(6);
  });

  it('l\'envoi est SIMULÉ, le dit, et refuse la seconde fois', async () => {
    const [inv] = await invitations(IDS.engNep);
    const res = await envoyer(inv.id, IDS.users.claire);
    expect(res.remis).toBe(false); // le simulé n'affirme pas plus que ce qu'il fait
    expect(res.detail).toMatch(/simulé/);
    await expect(envoyer(inv.id, IDS.users.claire)).rejects.toThrow(/deux fois/);
  });

  it('l\'isolation : un contact d\'une autre entité ne devient ni clé ni destinataire', async () => {
    await q(
      `insert into entity (id, tenant_id, name, country, registry_type, registry_no, currency)
       values ('bbbb2222-0000-4000-8000-000000000002', $1, 'Autre Entité SAS', 'FR', 'fictional', '444555666', 'EUR')`,
      [IDS.tenant],
    );
    await q(
      `insert into client_contact (id, entity_id, name, email, title, portal_token)
       values ('bbbb2222-0000-4000-8000-000000000003', 'bbbb2222-0000-4000-8000-000000000002',
               'Contact Étranger', 'etranger@autre.example', null, 'jeton-etranger-test')`,
    );
    await expect(declarerContactCle(IDS.engNep, 'bbbb2222-0000-4000-8000-000000000003', IDS.users.claire))
      .rejects.toThrow(/isolation.*autre entité/);
  });

  it('le générateur .ics replie les lignes longues et échappe le texte (RFC 5545)', () => {
    const ics = genererIcs({
      uid: 'x@otto.example', tampon: new Date('2026-01-01T00:00:00Z'),
      debut: new Date('2026-03-02T13:00:00Z'), fin: new Date('2026-03-02T14:00:00Z'),
      objet: 'a, b; c', description: 'ligne1\nligne2 ' + 'x'.repeat(200),
      organisateur: { nom: 'Claire', email: 'c@v.example' },
      participants: [{ nom: 'Sophie', email: 's@a.example' }],
    });
    expect(ics).toContain('SUMMARY:a\\, b\; c');
    expect(ics).toContain('ligne1\\nligne2');
    for (const l of ics.split('\r\n')) expect(l.length).toBeLessThanOrEqual(75);
    expect(() => genererIcs({
      uid: 'x', tampon: new Date(), debut: new Date('2026-01-02'), fin: new Date('2026-01-01'),
      objet: 'x', description: '', organisateur: { nom: 'a', email: 'a@a' }, participants: [],
    })).toThrow(/fin précède/);
  });
});
