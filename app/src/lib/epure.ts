// P0-06 (EPURE-01, S-1). CE QUE CE MODULE VÉRIFIE : le TEXTE effectivement rendu à l'écran
// (`document.body.innerText`, jamais le code source) porte-t-il un motif que ce dépôt a promis de
// ne jamais montrer à l'auditeur — un mot de méthode interne qui a fui dans une phrase publique
// (« déterministe », « Arbitrate »), un niveau HITL entre parenthèses affiché nu (« (L2) »), un
// code de refus interne en tête de phrase (« CTRL-04 : »), ou un gabarit de traduction non rempli
// (« {nom} », S-1). CE QU'IL NE VÉRIFIE PAS (règle 19) : il ne lit rien du CODE source, seulement
// le texte rendu ; il ne sait pas si un motif trouvé est un faux positif dans un contexte légitime
// (un commentaire cité verbatim dans une pièce jointe, par exemple) — c'est pourquoi ce garde
// avertit avec un plafond figé (P0-06), pas encore un refus bloquant à zéro (P5-05).

export interface MotifInterdit {
  id: string;
  motif: RegExp;
  raison: string;
}

/** Liste NORMATIVE (plan maître §P0-06). Chaque motif porte SA raison — pourquoi il ne doit
 *  jamais atteindre un écran servi à l'auditeur. */
export const MOTIFS_INTERDITS: MotifInterdit[] = [
  { id: 'arbitrate', motif: /\bArbitrat(e|er|ion)\b/,
    raison: 'vocabulaire de méthode interne (arbitrage humain L3), jamais un mot qu\'un auditeur lit à l\'écran' },
  { id: 'deterministic-en', motif: /\bdeterministic\b/i,
    raison: 'jargon technique interne (échelon L0/déterministe), pas un mot d\'audit' },
  { id: 'deterministe-fr', motif: /\bdéterministe\b/i,
    raison: 'jargon technique interne (échelon L0/déterministe), pas un mot d\'audit' },
  { id: 'drawn', motif: /\bDrawn\b/,
    raison: 'reliquat de libellé de tirage non traduit/non catalogué' },
  { id: 'niveau-parenthese', motif: /\(L[0-3]\)/,
    raison: 'le niveau HITL (L0-L3) est un concept de méthode interne, jamais affiché nu entre parenthèses' },
  { id: 'niveau-ponctuation', motif: /\bL[0-3]\b(?=\s*[—:·])/,
    raison: 'le niveau HITL en tête de segment (« L2 : », « L2 — ») — même défaut que ci-dessus, sous une autre forme' },
  { id: 'propose-l3', motif: /propose \(L3\)/i,
    raison: 'formulation de méthode interne pour l\'arbitrage humain, jamais un texte d\'écran' },
  { id: 'not-a-copy', motif: /not a copy/i,
    raison: 'phrase de commentaire de code échappée dans un texte servi' },
  { id: 'counted-whole-file', motif: /counted on the whole file/i,
    raison: 'phrase de commentaire de code échappée dans un texte servi' },
  { id: 'pas-un-jugement', motif: /Ce n['’]est PAS un jugement/i,
    raison: 'phrase de commentaire de code échappée dans un texte servi' },
  { id: 'code-refus-tete-paragraphe', motif: /^(NOTIF|CTRL|MAT|EXTRAP|AUTO|POP|TEST|ANA|RISK|VISA|PORTAIL|ETANCH|BLOB|LOC|REPLI)-\d{2}\s*:/m,
    raison: 'un code de refus interne (D.6 point 1) affiché nu en tête de paragraphe — l\'auditeur lit un texte, jamais un identifiant de règle' },
  { id: 'variable-non-remplie', motif: /\{[a-z_]+\}/,
    raison: 'un gabarit de traduction non rempli (S-1) — le signe qu\'une variable attendue n\'a jamais été fournie' },
];

/** Les identifiants des motifs trouvés dans `texte`, un par motif présent (jamais un compte
 *  d'occurrences — un écran qui répète la même faute dix fois n'est pas dix fautes distinctes). */
export function verifierEpure(texte: string): string[] {
  const trouves: string[] = [];
  for (const m of MOTIFS_INTERDITS) {
    if (m.motif.test(texte)) trouves.push(m.id);
  }
  return trouves;
}
