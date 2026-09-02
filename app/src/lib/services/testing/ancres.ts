import { getDocumentProxy } from 'unpdf';

// LES ANCRES — l'endroit EXACT de la pièce où se lit la valeur comparée
// (mandat du jour, W1). Une cellule verte sans ancre est refusée (TEST-01) :
// « la valeur concorde » ne suffit pas, il faut que la pièce la MONTRE, et
// qu'un clic l'y amène — page et rectangle, en points PDF (origine en bas à
// gauche, comme le fichier).
//
// D'où viennent les rectangles : de la couche texte du PDF, lue par le même
// lecteur que l'échelon 2 de l'extraction (unpdf → pdf.js). Chaque élément de
// texte porte sa matrice de placement et sa largeur ; on cherche le libellé de
// la colonne (« Total HT », « Client », « Numero »…) et on prend la ligne
// entière — libellé et valeur — en fusionnant les éléments qui partagent la
// même ligne de base.
//
// CE QUE CE MODULE NE FAIT PAS, ET LE DIT : il ne lit pas d'image. Une pièce
// scannée (échelon OCR) n'a pas de couche texte : aucune ancre, donc aucune
// cellule verte sur cette pièce tant qu'un humain n'a pas disposé — et c'est
// voulu (une pièce lue par un modèle ne se prouve pas par le modèle).

export interface Rect { x: number; y: number; w: number; h: number }

export interface ElementTexte { str: string; x: number; y: number; w: number; h: number }

/** Les éléments de texte d'UNE page, avec leur boîte (points PDF). */
export async function elementsDePage(bytes: Uint8Array, page: number): Promise<ElementTexte[]> {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  if (page < 1 || page > doc.numPages) return [];
  const p = await doc.getPage(page);
  const contenu = await p.getTextContent();
  const out: ElementTexte[] = [];
  for (const it of contenu.items as unknown[]) {
    const e = it as { str?: string; transform?: number[]; width?: number; height?: number };
    if (typeof e.str !== 'string' || !e.transform || e.str.trim() === '') continue;
    const [a, , , d, x, y] = e.transform;
    /* La hauteur d'un élément est la taille de police (d, ou a si la matrice
       est tournée) ; pdf.js la donne aussi en `height` sur les versions
       récentes. La largeur est déjà mise à l'échelle. */
    const h = e.height && e.height > 0 ? e.height : Math.abs(d || a || 10);
    out.push({ str: e.str, x, y, w: e.width ?? 0, h });
  }
  return out;
}

/**
 * Le rectangle de la LIGNE qui commence par le motif : l'élément qui
 * correspond, étendu à tous les éléments de la même ligne de base (± 1 pt).
 * `null` si le motif n'apparaît nulle part : la cellule sera « sans ancre ».
 */
export function rectangleDe(elements: ElementTexte[], motif: RegExp): Rect | null {
  const depart = elements.find((e) => motif.test(e.str.trim()));
  if (!depart) return null;
  const memeLigne = elements.filter((e) => Math.abs(e.y - depart.y) <= 1 && e.x >= depart.x - 1);
  const x = Math.min(...memeLigne.map((e) => e.x));
  const droite = Math.max(...memeLigne.map((e) => e.x + e.w));
  const h = Math.max(...memeLigne.map((e) => e.h));
  return {
    x: arrondi(x), y: arrondi(depart.y - h * 0.22),
    w: arrondi(Math.max(droite - x, 8)), h: arrondi(h * 1.25),
  };
}

function arrondi(n: number): number { return Math.round(n * 100) / 100; }

/** Le rectangle d'un motif sur une page donnée d'un PDF — ou null. */
export async function ancre(bytes: Uint8Array, page: number, motif: RegExp): Promise<Rect | null> {
  return rectangleDe(await elementsDePage(bytes, page), motif);
}
