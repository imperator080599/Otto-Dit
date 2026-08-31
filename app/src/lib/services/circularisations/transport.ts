// LE TRANSPORT D'UNE CIRCULARISATION — simulé, et qui le DIT.
//
// Même forme que le transport d'invitation (ADR-101) : l'envoi vit derrière un
// adaptateur, le défaut ne fait RIEN et l'annonce. Le jour où le SMTP sortant
// existe (point 8a du mandat), il s'branche ici — et nulle part ailleurs.
//
// `remis: false` est le cœur : un simulé qui répondrait « remis » ferait croire
// à une demande partie. Une demande qu'on croit partie et qui n'est pas partie
// est pire qu'une demande qu'on sait à faire.

export interface Courrier {
  destinataire: string;
  copies: string[];
  objet: string;
  corps: string;
}

export interface TransportCircularisation {
  readonly name: string;
  envoyer(c: Courrier): Promise<{ remis: boolean; detail: string }>;
}

export class TransportSimule implements TransportCircularisation {
  readonly name = 'simule';
  async envoyer(c: Courrier): Promise<{ remis: boolean; detail: string }> {
    return {
      remis: false,
      detail: `transport simulé — aucun courriel n'est parti vers ${c.destinataire}`
        + `${c.copies.length ? ` (${c.copies.length} copie(s) calculée(s))` : ''}`,
    };
  }
}

export function getTransportCircularisation(): TransportCircularisation {
  const choix = process.env.OTTO_CIRCULARISATION_TRANSPORT ?? 'simule';
  if (choix === 'simule') return new TransportSimule();
  throw new Error(
    `OTTO_CIRCULARISATION_TRANSPORT « ${choix} » inconnu. Le SMTP sortant réel est un chantier `
    + 'à part (point 8a) : serveur, compte d\'envoi, et une configuration PAR DOSSIER — rien ne '
    + 'part tant qu\'elle n\'est pas posée.',
  );
}
