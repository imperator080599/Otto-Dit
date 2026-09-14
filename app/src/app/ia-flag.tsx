import type { ReactNode, CSSProperties } from 'react';

// LE MARQUEUR « PRÉPARÉ PAR L'IA » (R59/ADR-103, mandat du fondateur du 2026-09-13, option b :
// « Fold it into the token system, and re-express ADR-103's intent as a mechanical test — an
// AI-prepared item must be impossible to miss — so the test carries it, not the stylesheet.
// Freeze the property, never the appearance. »).
//
// Avant ce composant, la seule preuve qu'un champ venait de l'IA était la classe CSS
// `.ai-flag` (globals.css) — une APPARENCE (couleur, fond), jamais une PROPRIÉTÉ testable :
// rien n'empêchait un écran de citer `.ai-flag` sans que l'élément porte aucune trace dans le
// DOM qu'un outil puisse chercher sans deviner une couleur. Ce composant EST désormais la
// SEULE façon de marquer un contenu préparé par l'IA : l'attribut `data-ia-prepare="true"` est
// posé ICI, une fois, et c'est LUI que la garde structurelle cherche
// (`scripts/audit/ia-flag-source.ts`, `scripts/clics/scenario.ts`) — jamais le nom d'une
// classe, qui peut changer avec le jeton de design (§ci-dessous) sans que la garantie ne bouge.
//
// CE QUE CE COMPOSANT NE FAIT PAS (règle 19) : il ne décide PAS quel contenu est « préparé par
// l'IA » — c'est à l'écran appelant de le savoir (un champ `redigeParIa`, une cellule non
// vérifiée, un écart de walkthrough candidat, une sévérité de déficience proposée) et de
// conditionner l'appel. Un écran qui omet d'envelopper un champ AI-préparé reste invisible à ce
// composant seul ; la garde de régression (`ia-flag-source.ts`) n'attrape que le cas où
// quelqu'un revient à `className="ai-flag"` SANS passer par ici — elle ne peut pas, par
// construction, prouver qu'AUCUN site n'a été oublié (ça, c'est la responsabilité de chaque
// écran, revue à la main comme le reste de ce dépôt).
export function IaFlag({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="ai-flag" {...IA_PREPARE_ATTRS} style={style}>
      {children}
    </span>
  );
}

/** Pour les éléments qui ne peuvent pas être un `<span>` (une ligne `<tr>` entière, par
 *  exemple `rcm/[cid]/page.tsx` — les écarts de walkthrough candidats, un objet PAR LIGNE plutôt
 *  qu'un badge en ligne) : même attribut, même constante, jamais retapé à la main pour ne pas
 *  risquer une faute de frappe que la garde de régression ne pourrait pas rattraper (elle ne
 *  cherche que la classe `.ai-flag`, pas l'orthographe de cet attribut ailleurs). */
export const IA_PREPARE_ATTRS = { 'data-ia-prepare': 'true' } as const;
