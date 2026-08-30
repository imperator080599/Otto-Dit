// LES DEUX ADAPTATEURS DES RÉUNIONS (ADR-101) — le modèle de l'échelle
// d'extraction : une interface réelle, un défaut SIMULÉ et hors ligne, un nom
// inconnu qui LÈVE au lieu de dégrader.
//
// CONTRAINTE DE FOND, à garder au branchement Microsoft réel : on lit les
// DISPONIBILITÉS (libre/occupé), JAMAIS le contenu des agendas — c'est de la
// donnée personnelle des collègues, et le minimum nécessaire suffit. Le TYPE
// même de l'interface l'impose : un créneau occupé n'a ni titre, ni lieu, ni
// participants — il n'y a pas de champ pour les mettre.

export interface CreneauOccupe {
  /** ISO 8601 UTC. RIEN d'autre : ni objet, ni lieu, ni qui. */
  debut: string;
  fin: string;
}

export interface AgendaAdapter {
  readonly name: string;
  /** Les blocs occupés de chaque adresse sur la fenêtre demandée. */
  occupations(emails: string[], de: Date, a: Date): Promise<Record<string, CreneauOccupe[]>>;
}

export interface TransportInvitationAdapter {
  readonly name: string;
  /** Remet l'invitation (.ics + corps). Le simulé ne remet RIEN — et le dit. */
  envoyer(destinataires: string[], objet: string, corps: string, ics: string): Promise<{ remis: boolean; detail: string }>;
}

/* Un hachage FNV-1a — DÉTERMINISTE : mêmes adresses, même fenêtre, mêmes
   occupations, à chaque exécution et sur toute machine. Pas de Math.random :
   une démonstration qui change d'occupations à chaque ouverture ne se
   rejoue pas (règle 12). */
function fnv(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export class SimulatedAgendaAdapter implements AgendaAdapter {
  readonly name = 'simulated';
  async occupations(emails: string[], de: Date, a: Date): Promise<Record<string, CreneauOccupe[]>> {
    const out: Record<string, CreneauOccupe[]> = {};
    for (const email of emails) {
      const blocs: CreneauOccupe[] = [];
      const jour = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()));
      while (jour <= a) {
        const dow = jour.getUTCDay();
        if (dow !== 0 && dow !== 6) {
          /* Deux blocs occupés par jour ouvré, placés par hachage : assez
             pour que la proposition ait quelque chose à contourner, assez
             peu pour qu'un créneau commun existe. */
          const g = fnv(`${email}|${jour.toISOString().slice(0, 10)}`);
          const h1 = 9 + (g % 4);            // 9..12
          const h2 = 14 + ((g >> 8) % 3);    // 14..16
          for (const h of [h1, h2]) {
            const debut = new Date(jour); debut.setUTCHours(h, 0, 0, 0);
            const fin = new Date(jour); fin.setUTCHours(h + 1, 0, 0, 0);
            blocs.push({ debut: debut.toISOString(), fin: fin.toISOString() });
          }
        }
        jour.setUTCDate(jour.getUTCDate() + 1);
      }
      out[email] = blocs;
    }
    return out;
  }
}

export class SimulatedTransportAdapter implements TransportInvitationAdapter {
  readonly name = 'simulated';
  async envoyer(): Promise<{ remis: boolean; detail: string }> {
    /* remis: false — le simulé n'affirme pas plus que ce qu'il fait. */
    return { remis: false, detail: 'transport simulé — aucune invitation réelle n\'est partie (Q12)' };
  }
}

export function getAgendaAdapter(): AgendaAdapter {
  const choix = process.env.OTTO_AGENDA_ADAPTER ?? 'simulated';
  if (choix === 'simulated') return new SimulatedAgendaAdapter();
  throw new Error(
    `OTTO_AGENDA_ADAPTER « ${choix} » inconnu. Le branchement d'un agenda réel (Microsoft Graph) `
    + 'est un chantier séparé : inscription d\'application, consentement administrateur, permission '
    + 'déléguée de type libre/occupé seulement — voir docs/DECISIONS.md ADR-101.',
  );
}

export function getTransportInvitation(): TransportInvitationAdapter {
  const choix = process.env.OTTO_INVITATION_TRANSPORT ?? 'simulated';
  if (choix === 'simulated') return new SimulatedTransportAdapter();
  throw new Error(`OTTO_INVITATION_TRANSPORT « ${choix} » inconnu.`);
}
