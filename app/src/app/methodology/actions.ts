'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/core/auth';
import {
  methodologieCourante, publierMethodologie, designerMethodologie,
  verifierPaquet, contenuDeLaMethodologie, contenuDuDepot, fichiersAttendus,
  MethodologyError,
} from '@/lib/methodology/depot';
import type { Retour } from './import-form';

// LES ACTIONS SONT DANS LEUR PROPRE FICHIER, ET CE N'EST PAS UN RANGEMENT.
//
// Elles étaient définies à l'intérieur du composant serveur, marquées
// « use server » sur place, et passées au composant client. En développement
// cela rendait ; dans un BUILD DE PRODUCTION le serveur levait « Functions
// cannot be passed directly to Client Components » à chaque chargement de
// l'écran — sans qu'aucune route ne sorte autre chose qu'un 200. C'est le
// balayage qui l'a vu, en lisant le journal du serveur (ADR-078).
//
// Le fichier séparé règle la cause, et corrige au passage un défaut de fond :
// une action définie dans le rendu CAPTURE l'état du rendu. Si le cabinet
// publie une version entre l'affichage et l'envoi, la fermeture porte l'ancienne.
// L'action relit donc elle-même la version en vigueur.

export async function soumettreMethode(_etat: Retour, formData: FormData): Promise<Retour> {
  const u = await requireUser();
  const attendus = await fichiersAttendus();
  const texte = String(formData.get('paquet') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const publier = String(formData.get('intention') ?? '') === 'publier';
  const cible = String(formData.get('fichier') ?? '*');

  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch (e) {
    /* Une erreur de syntaxe est une erreur comme une autre : elle se rend dans
       la même liste, pas dans une bannière séparée qu'on lit ailleurs. */
    return { erreurs: [`JSON illisible : ${(e as Error).message}`], message: '', fichiers: attendus };
  }
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    return {
      erreurs: ['le texte doit être un objet dont les clés sont des noms de fichiers, '
        + 'par exemple { "risque.json": … }'],
      message: '', fichiers: attendus,
    };
  }
  const patch = valeur as Record<string, unknown>;

  // Relue ICI, pas capturée au rendu.
  const courante = await methodologieCourante(u.tenant_id);
  /* Le correctif se pose SUR la version en vigueur ; le paquet entier remplace
     tout et doit se suffire. Dans les deux cas la vérification porte sur le
     RÉSULTAT fusionné, jamais sur le morceau. */
  const socle = cible === '*'
    ? {}
    : courante ? await contenuDeLaMethodologie(courante.id) : await contenuDuDepot();
  const contenu = { ...socle, ...patch };

  const erreurs = await verifierPaquet(contenu);
  if (erreurs.length) return { erreurs, message: '', fichiers: attendus };
  if (!publier) {
    return {
      erreurs: [],
      message: 'paquet valide — rien n’a été écrit. Le bouton « Publier » créera une version.',
      fichiers: attendus,
    };
  }
  if (!label) {
    return {
      erreurs: ['la version doit porter un nom : un dossier doit pouvoir dire sous quelle méthode '
        + 'il a été exécuté'],
      message: '', fichiers: attendus,
    };
  }

  try {
    const row = await publierMethodologie({ tenantId: u.tenant_id, label, contenu, actorUserId: u.id });
    revalidatePath('/methodology');
    return {
      erreurs: [],
      message: `publiée : « ${row.label} », empreinte ${row.content_hash.slice(0, 12)}…. `
        + 'Les missions gardent la leur tant qu’on ne les redésigne pas.',
      fichiers: attendus,
    };
  } catch (e) {
    const m = e instanceof MethodologyError ? e.message : String(e);
    return { erreurs: m.split('\n').map((x) => x.trim()).filter(Boolean), message: '', fichiers: attendus };
  }
}

export async function designerAction(formData: FormData): Promise<void> {
  const u = await requireUser();
  await designerMethodologie({
    engagementId: String(formData.get('engagement_id') ?? ''),
    methodologyId: String(formData.get('methodology_id') ?? ''),
    actorUserId: u.id,
  });
  revalidatePath('/methodology');
}
