import { q, q1 } from '../../src/lib/db/client';
import { contexte } from '../clics/contexte';

// CE QUE LE PANNEAU DE FIN AFFICHE — lu dans la base, jamais écrit en dur.
//
// Les identités, le jeton du portail et le nom du dossier sont des DONNÉES du
// monde de démonstration. Les recopier dans le script d'accueil créerait deux
// vérités : le jour où le peuplement change, l'écran d'accueil dirait de se
// connecter avec quelqu'un qui n'existe plus. On les demande à la base, et le
// lancement échoue franchement si elle ne les a pas (règle 16 : une preuve
// empruntée est la forme la plus convaincante du silence lu comme un succès).
//
// Tout est lu AVANT que le serveur ne prenne la base : PGlite n'admet qu'un
// écrivain.

async function main() {
  const c = await contexte();
  const eng = await q1<{ nom: string; entite: string; exercice: string; pack: string }>(
    `select e.name nom, en.name entite, p.label exercice,
            (e.framework_set->'assurance_packs'->>0) pack
     from engagement e
     join entity en on en.id = e.entity_id
     join period p on p.id = e.period_id
     where e.id = $1`, [c.eng]);
  const contact = await q1<{ nom: string; titre: string | null }>(
    `select name nom, title titre from client_contact where portal_token = $1`, [c.jeton]);

  /* Un compte de contrôle : le panneau ne doit pas annoncer un monde peuplé
     qu'il n'a pas vérifié. */
  const n = await q1<{ dossiers: string; papiers: string; pieces: string; evenements: string }>(
    `select (select count(*) from engagement)::text dossiers,
            (select count(*) from workpaper)::text papiers,
            (select count(*) from evidence)::text pieces,
            (select count(*) from event_log)::text evenements`);

  console.log(JSON.stringify({
    engagementId: c.eng,
    dossier: eng.nom,
    entite: eng.entite,
    exercice: eng.exercice,
    pack: eng.pack,
    roles: [
      { role: 'préparateur', ...c.preparateur },
      { role: 'réviseur', ...c.reviewer },
      { role: 'associé signataire', ...c.associe },
    ],
    portail: { jeton: c.jeton, contact: contact.nom, titre: contact.titre },
    comptes: n,
  }));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
