// GÉNÉRATION iCalendar (RFC 5545) — PURE : pas de base, pas d'horloge, pas
// de réseau. L'invitation de réunion sort d'OTTO dans le format que tous les
// agendas lisent ; l'ENVOI, lui, vit derrière un adaptateur (ADR-101).

export interface EvenementIcs {
  uid: string;
  /** Horodatage de production (DTSTAMP), fourni par l'appelant — jamais lu ici. */
  tampon: Date;
  debut: Date;
  fin: Date;
  objet: string;
  description: string;
  organisateur: { nom: string; email: string };
  participants: { nom: string; email: string }[];
}

/** RFC 5545 §3.3.11 : virgules, points-virgules et antislashs s'échappent. */
function echappe(texte: string): string {
  return texte.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 §3.1 : les lignes se replient à 75 octets, suite indentée d'une espace. */
function replie(ligne: string): string {
  const morceaux: string[] = [];
  let reste = ligne;
  while (reste.length > 73) {
    morceaux.push(reste.slice(0, 73));
    reste = ' ' + reste.slice(73);
  }
  morceaux.push(reste);
  return morceaux.join('\r\n');
}

export function genererIcs(e: EvenementIcs): string {
  if (e.fin <= e.debut) throw new Error('ics : la fin précède le début');
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OTTO//Invitations//FR',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.tampon)}`,
    `DTSTART:${utc(e.debut)}`,
    `DTEND:${utc(e.fin)}`,
    `SUMMARY:${echappe(e.objet)}`,
    `DESCRIPTION:${echappe(e.description)}`,
    `ORGANIZER;CN=${echappe(e.organisateur.nom)}:mailto:${e.organisateur.email}`,
    ...e.participants.map((p) =>
      `ATTENDEE;ROLE=REQ-PARTICIPANT;CN=${echappe(p.nom)}:mailto:${p.email}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lignes.map(replie).join('\r\n') + '\r\n';
}
