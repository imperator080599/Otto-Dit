'use server';

// L'ACTION QUI MÉMORISE UN REPLI (1.2). Appelée depuis le client au moment du
// geste, hors du chemin de rendu : la section se replie tout de suite, la
// mémoire suit. Sous la sonde, conduite puis annulée (rien n'est écrit — le
// témoin compte ui_repli). Un refus REVIENT au client, qui l'affiche à côté du
// titre : un rangement que la base n'a pas retenu ne doit pas passer pour
// retenu (règle 13).

export async function memoriserRepliAction(cle: string, ouvert: boolean): Promise<{ ok: true } | { ok: false; raison: string }> {
  /* LES IMPORTS SONT DIFFÉRÉS, ET C'EST UNE RÈGLE DU DÉPÔT : un composant
     CLIENT importe ce fichier ; la garde `client-serveur.test.ts` suit les
     chaînes d'import statiques et refuse qu'une d'elles atteigne la base
     depuis le navigateur. Le corps d'une action serveur ne s'exécute jamais
     côté client — mais la chaîne d'import, elle, se lit à la compilation. */
  const { getSessionUser } = await import('@/lib/core/auth');
  const { memoriserRepli } = await import('@/lib/services/replis');
  const { conduire } = await import('@/lib/core/sonde');
  const user = await getSessionUser();
  if (!user) return { ok: false, raison: 'REPLI-02 : personne n’est connecté — rien à mémoriser' };
  try {
    await conduire(() => memoriserRepli({ tenantId: user.tenant_id, userId: user.id, cle: String(cle), ouvert: Boolean(ouvert) }));
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}
