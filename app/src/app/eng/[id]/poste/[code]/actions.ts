'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/core/auth';
import { enregistrerAnalytique, proposerAnalytique } from '@/lib/services/analytique';
import { conduire } from '@/lib/core/sonde';
import { estUnSignalDeNext } from '@/app/refus';

// LES ACTIONS DE LA PAGE DE POSTE (ADR-078 : les actions vivent dans leur
// propre fichier). L'identité vient de la session, jamais du formulaire.
//
// Les deux actions redirigent avec un CONTENU (le texte saisi, la proposition) :
// elles n'empruntent donc pas `executer`, qui ne redirige que sur le chemin nu,
// mais tiennent la même règle — un refus s'AFFICHE (`?erreur=`), jamais en
// page 500 ; un signal de Next (redirection, 404) n'est pas un refus ; sous la
// sonde, le geste est conduit puis annulé.

function cheminDuPoste(engagementId: string, code: string): string {
  return `/eng/${engagementId}/poste/${encodeURIComponent(code)}`;
}

async function tenter<T>(fn: () => Promise<T>): Promise<{ resultat: T } | { erreur: string }> {
  try {
    return { resultat: await conduire(fn) };
  } catch (e) {
    if (estUnSignalDeNext(e)) throw e;
    return { erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** ENREGISTRER la revue analytique : une version nouvelle, humaine ou proposée-validée. */
export async function enregistrerAnalytiqueAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const code = String(fd.get('code') ?? '');
  const chemin = cheminDuPoste(engagementId, code);
  const texte = String(fd.get('texte') ?? '');
  const issue = await tenter(async () => {
    const { user } = await requireMember(engagementId);
    const origine = String(fd.get('origine') ?? '') === 'proposee_validee' ? 'proposee_validee' : 'humaine';
    await enregistrerAnalytique(engagementId, code, user.id, texte, {
      origine, engineRunId: String(fd.get('engine_run_id') ?? '') || null,
    });
  });
  revalidatePath(chemin);
  if ('erreur' in issue) {
    /* LE TEXTE SAISI REVIENT AVEC LE REFUS : un refus qui efface la saisie
       fait payer la règle deux fois (revue hostile de la soirée). */
    redirect(`${chemin}?${new URLSearchParams([['erreur', issue.erreur], ['texte', texte]]).toString()}#analytique`);
  }
  redirect(`${chemin}#analytique`);
}

/**
 * PROPOSER une rédaction d'après les chiffres (plafond L2) : elle revient à
 * l'écran par l'URL, pré-remplie et marquée « proposée » ; rien n'est
 * enregistré tant qu'une personne n'a pas cliqué. Le run qui l'a produite
 * voyage avec elle, pour que l'enregistrement le cite — et sous la sonde, ce
 * run est annulé : l'enregistrement qui le citerait est refusé, nommé (ANA-02).
 */
export async function proposerAnalytiqueAction(fd: FormData): Promise<never> {
  const engagementId = String(fd.get('engagement_id') ?? '');
  const code = String(fd.get('code') ?? '');
  const chemin = cheminDuPoste(engagementId, code);
  const issue = await tenter(async () => {
    await requireMember(engagementId);
    return proposerAnalytique(engagementId, code);
  });
  if ('erreur' in issue) {
    redirect(`${chemin}?${new URLSearchParams([['erreur', issue.erreur]]).toString()}`);
  }
  const requete = new URLSearchParams({ propose: '1', texte: issue.resultat.texte, run: issue.resultat.engineRunId });
  redirect(`${chemin}?${requete.toString()}#analytique`);
}
