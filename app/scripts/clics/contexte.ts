import { q01, q1 } from '../../src/lib/db/client';

// LES IDENTIFIANTS DU PARCOURS CLIQUÉ, résolus AVANT que le serveur ne prenne
// la base : PGlite n'admet qu'un écrivain, donc le harnais lit tout ce dont il
// a besoin, ferme, puis lance le serveur.

export interface Contexte {
  /** Le dossier de démonstration — celui qui porte le cycle complet. */
  eng: string;
  /** Les trois identités du visa : préparateur, reviewer, associé signataire. */
  preparateur: { id: string; nom: string };
  reviewer: { id: string; nom: string };
  associe: { id: string; nom: string };
  /** Le jeton du portail client — l'autre moitié du produit. */
  jeton: string;
}

export async function contexte(): Promise<Contexte> {
  /* Le dossier le plus RICHE, pas « le premier » : le dossier N-1 existe aussi
     et n'a ni demande ni papier — le choisir ferait échouer la moitié des
     étapes pour une raison qui n'a rien à voir avec le produit (ADR-076). */
  const eng = await q1<{ id: string }>(
    `select e.id::text id from engagement e join period p on p.id = e.period_id
     where e.kind = 'statutory_audit'
     order by (select count(*) from workpaper w where w.engagement_id = e.id) desc,
              p.end_date desc, e.id
     limit 1`);

  /* Les rôles viennent de l'AFFECTATION sur la mission, pas du rôle cabinet :
     c'est l'affectation qui commande le visa. */
  const par = async (role: string) => q01<{ id: string; nom: string }>(
    `select u.id::text id, u.name nom from engagement_member m
     join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.eng_role = $2 and m.exited_on is null
     order by m.can_sign desc, u.name limit 1`,
    [eng.id, role]);

  const senior = await par('senior') ?? await par('staff');
  const manager = await par('manager');
  const partner = await par('partner');
  if (!senior || !manager || !partner) {
    throw new Error(
      'le parcours cliqué a besoin des trois rôles du visa sur la mission '
      + `(senior/staff, manager, partner) — trouvés : ${[senior, manager, partner].map((x) => x?.nom ?? '—').join(', ')}`,
    );
  }

  const contact = await q1<{ jeton: string }>(
    `select c.portal_token jeton from client_contact c
     join engagement e on e.entity_id = c.entity_id
     where e.id = $1 and c.active order by c.name limit 1`,
    [eng.id]);

  return {
    eng: eng.id,
    preparateur: senior, reviewer: manager, associe: partner,
    jeton: contact.jeton,
  };
}
