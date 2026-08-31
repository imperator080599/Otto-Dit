import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { q, q01, closeDb, repoRoot } from '../../src/lib/db/client';
import { sha256 } from '../../src/lib/core/hash';
import { Bitmap, blur, drawText, encodePng, gradient, line, mulberry32, noise, quantize, rotate, speckle } from '../eval/raster';

// LES PIÈCES NEUVES DU MODE « IA RÉELLE » (point 12, ADR-105).
//
// Le rejeu est indiscernable d'une vraie lecture SI la pièce déposée est déjà
// dans le cache d'extraction : pour VOIR le modèle lire, il faut des
// justificatifs que le système n'a jamais vus. Ce script les engendre DEPUIS
// le monde de démonstration qui vient d'être semé (déterministe : mêmes
// lignes, mêmes octets à chaque fois) : chaque pièce vise une ligne PRÉCISE de
// l'échantillon tiré, pour que le vouching la compare vraiment.
//
// Des pièces normales, et des pièces PIÉGÉES — montant qui diffère de
// l'écriture, date hors exercice, quantité livrée inférieure à la facturation,
// bon de livraison sans signature, un scan dégradé. Le piège est dans le
// DOCUMENT face au grand livre : l'extraction doit lire fidèlement ce qui est
// imprimé, et c'est le VOUCHING qui lève l'écart. VERITE.md dit quelle pièce
// va où et ce qui doit se passer ; verite.json porte la vérité champ par
// champ pour la métrologie (`npm run eval:pieces-neuves`).
//
// Tout est fabriqué et marqué SPECIMEN (règle 2). Presque tout est rendu en
// SCAN (aucune couche texte) : c'est ce qui force l'échelon OCR — en mode
// rejeu ces pièces tombent à l'échelon humain, honnêtement.

export interface LigneCible {
  piece: string;
  tiers: string | null;
  montantCents: number;
  dateGl: string;         // date de pièce (ou d'écriture) au grand livre, ISO
  docs: number;           // nb d'éléments « document » demandés (2 = facture + BL)
  qteFacturee?: number;   // somme des quantités de la facture déjà lue (pour le piège quantité)
}

export type Role =
  | 'normale-scan' | 'normale-texte' | 'piege-montant' | 'piege-date'
  | 'degradee' | 'piege-quantite' | 'piege-signature';

export interface Cible { role: Role; ligne: LigneCible }

/** Le choix des lignes — PUR, pour être testé sans base : d'abord les lignes à
 *  deux documents (pièges quantité et signature), puis les plus grosses pour
 *  le reste. Une ligne ne sert qu'une fois. */
export function choisirCibles(lignes: LigneCible[]): Cible[] {
  const factures = lignes.filter((l) => l.piece.toUpperCase().startsWith('FA'));
  const prises = new Set<string>();
  const prendre = (pred: (l: LigneCible) => boolean): LigneCible | null => {
    const l = factures.find((x) => !prises.has(x.piece) && pred(x));
    if (l) prises.add(l.piece);
    return l ?? null;
  };
  const cibles: Cible[] = [];
  const qte = prendre((l) => l.docs >= 2 && (l.qteFacturee ?? 0) > 1);
  if (qte) cibles.push({ role: 'piege-quantite', ligne: qte });
  const sig = prendre((l) => l.docs >= 2);
  if (sig) cibles.push({ role: 'piege-signature', ligne: sig });
  for (const role of ['normale-scan', 'normale-texte', 'piege-montant', 'piege-date', 'degradee'] as Role[]) {
    const l = prendre(() => true);
    if (l) cibles.push({ role, ligne: l });
  }
  return cibles;
}

const DATE_FIGEE = new Date('2026-03-01T09:00:00Z');

/* LE SCAN NE SAIT PAS ÉCRIRE LES ACCENTS : la fonte 5×7 du rasteriseur rend
   tout caractère inconnu comme une ESPACE — « Bâtiplace » s'imprimerait
   « B tiplace », et le modèle, qui lit fidèlement, serait compté FAUX pour
   avoir lu ce qui est imprimé (trouvé à la première mesure réelle). Les
   textes des scans sont donc APLATIS, et la vérité porte le texte imprimé —
   jamais autre chose que ce que la pièce montre. Le rapprochement de tiers
   normalise les accents : « Batiplace » retrouve « Bâtiplace ». */
const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Vérité d'une pièce SCANNÉE : les champs textuels portent le texte imprimé (aplati). */
const platChamps = <T extends { buyerName?: string; sellerName?: string }>(v: T): T => ({
  ...v,
  ...(v.buyerName !== undefined ? { buyerName: plat(v.buyerName) } : {}),
  ...(v.sellerName !== undefined ? { sellerName: plat(v.sellerName) } : {}),
});
const fmtEur = (c: number) => `${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(c % 100).padStart(2, '0')} EUR`;
const fmtFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

interface VeriteFacture {
  docType: 'invoice';
  invoiceNumber: string; invoiceDate: string; buyerName: string; sellerName: string;
  totalNetCents: string; vatCents: string; totalGrossCents: string;
}
interface VeriteBl {
  docType: 'delivery_note';
  deliveryNoteNumber: string; deliveryDate: string; invoiceRef: string; buyerName: string; qtyTotal: string;
}

function lignesFacture(v: VeriteFacture): string[] {
  return [
    `Numero : ${v.invoiceNumber}`,
    `Date : ${fmtFr(v.invoiceDate)}`,
    `Client : ${v.buyerName}`,
    '',
    `Total HT : ${fmtEur(Number(v.totalNetCents))}`,
    `TVA (20%) : ${fmtEur(Number(v.vatCents))}`,
    `Total TTC : ${fmtEur(Number(v.totalGrossCents))}`,
  ];
}
function lignesBl(v: VeriteBl, signe: boolean): string[] {
  return [
    `Numero de BL : ${v.deliveryNoteNumber}`,
    `Date de livraison : ${fmtFr(v.deliveryDate)}`,
    `Facture : ${v.invoiceRef}`,
    `Client : ${v.buyerName}`,
    '',
    `Quantite totale livree : ${v.qtyTotal}`,
    '',
    signe ? 'Signature du receptionnaire : R. Caillat' : '(sans signature)',
  ];
}

async function pdfTexte(titre: string, entete: string, corps: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(DATE_FIGEE); doc.setModificationDate(DATE_FIGEE);
  doc.setProducer('OTTO pieces neuves (synthetique)'); doc.setCreator('OTTO (donnees fictives)');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  let y = 790;
  const put = (text: string, size = 10, b = false) => {
    page.drawText(text, { x: 50, y, size, font: b ? bold : font, color: rgb(0.1, 0.12, 0.16) });
    y -= size + 8;
  };
  put(entete, 12, true);
  put('SPECIMEN — donnees fictives / fictional specimen', 8);
  y -= 12;
  put(titre, 18, true);
  y -= 6;
  for (const l of corps) { if (l === '') { y -= 10; continue; } put(l); }
  return doc.save({ useObjectStreams: false });
}

async function pdfScan(
  titre: string, entete: string, corps: string[],
  degradation: 'propre' | 'photo', graine: number,
): Promise<Uint8Array> {
  const rnd = mulberry32(graine);
  const W = 1000, H = 1414;
  let bm = new Bitmap(W, H);
  drawText(bm, 70, 80, entete, { scale: 4, bold: true });
  drawText(bm, 70, 130, 'SPECIMEN - donnees fictives', { scale: 2, ink: 90 });
  drawText(bm, 70, 200, titre, { scale: 6, bold: true });
  line(bm, 70, 250, W - 70);
  let y = 300;
  for (const l of corps) {
    if (l === '') { y += 30; continue; }
    const [etiquette, ...reste] = l.split(' : ');
    const x = drawText(bm, 70, y, reste.length ? `${etiquette} : ` : etiquette, { scale: 3 });
    if (reste.length) drawText(bm, x, y, reste.join(' : '), { scale: 3, ink: 25 });
    y += 46;
  }
  if (degradation === 'photo') {
    bm = rotate(bm, -1.1); bm = blur(bm); bm = gradient(bm, 0.42); bm = noise(bm, 26, rnd);
  } else {
    bm = noise(bm, 6, rnd);
  }
  bm = quantize(bm, 16);
  const doc = await PDFDocument.create();
  doc.setCreationDate(DATE_FIGEE); doc.setModificationDate(DATE_FIGEE);
  doc.setProducer('OTTO pieces neuves (scan synthetique)'); doc.setCreator('OTTO (donnees fictives)');
  const png = await doc.embedPng(encodePng(bm));
  const page = doc.addPage([595, 842]);
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save({ useObjectStreams: false });
}

async function main() {
  const vendeur = await q01<{ nom: string }>(
    `select en.name nom from sample s
     join procedure_instance p on p.id = s.procedure_id
     join engagement e on e.id = s.engagement_id
     join entity en on en.id = e.entity_id
     where s.status = 'drawn' and p.template_code = 'REV-SUBST'`,
  );
  if (!vendeur) {
    console.error('aucun échantillon tiré : lancez `npm run demo:seed` d\'abord (le jeu se construit depuis le monde semé).');
    process.exit(1);
  }
  const brutes = await q<{ piece: string; tiers: string | null; montant: string; date_gl: string; docs: string; ev_facture: string | null }>(
    `select coalesce(g.piece_ref, g.entry_no) piece, g.aux_label tiers, si.amount::text montant,
            coalesce(g.piece_date, g.entry_date)::text date_gl,
            (select count(*)::text from request_item ri where ri.sample_item_id = si.id and ri.kind = 'document') docs,
            (select e.id::text from request_item ri join evidence e on e.request_item_id = ri.id
             where ri.sample_item_id = si.id and e.doc_type = 'invoice' and e.quarantined = false
             order by e.created_at desc limit 1) ev_facture
     from sample_item si join gl_entry g on g.id = si.unit_id
     join sample s on s.id = si.sample_id
     join procedure_instance p on p.id = s.procedure_id
     where s.status = 'drawn' and p.template_code = 'REV-SUBST'
     order by si.amount desc`,
  );
  const lignes: LigneCible[] = [];
  for (const b of brutes) {
    let qteFacturee: number | undefined;
    if (b.ev_facture) {
      const x = await q01<{ fields: { name: string; value: string }[] }>(
        `select fields from extraction where evidence_id = $1
         order by case status when 'verified' then 0 when 'complete' then 1 else 2 end, created_at desc limit 1`,
        [b.ev_facture],
      );
      if (x) {
        let somme = 0;
        for (const f of x.fields) {
          if (!f.name.startsWith('line')) continue;
          try { somme += Number(JSON.parse(f.value).qty ?? 0); } catch { /* ligne illisible */ }
        }
        if (somme > 0) qteFacturee = somme;
      }
    }
    lignes.push({
      piece: b.piece, tiers: b.tiers, montantCents: Math.round(Number(b.montant) * 100),
      dateGl: b.date_gl, docs: Number(b.docs), qteFacturee,
    });
  }
  const cibles = choisirCibles(lignes);

  const dossier = path.join(repoRoot(), 'dataset', 'pieces_neuves');
  fs.mkdirSync(dossier, { recursive: true });
  for (const f of fs.readdirSync(dossier)) if (f.endsWith('.pdf')) fs.unlinkSync(path.join(dossier, f));

  interface Sortie {
    filename: string; role: Role;
    ligne: { piece: string; tiers: string | null; montantGl: string; dateGl: string };
    attendu: string;
    truth: Record<string, string>;
  }
  const sorties: Sortie[] = [];
  let graine = 20260301;

  const facture = (l: LigneCible, netCents: number, dateIso: string): VeriteFacture => {
    const vat = Math.round(netCents * 0.2);
    return {
      docType: 'invoice', invoiceNumber: l.piece, invoiceDate: dateIso,
      buyerName: l.tiers ?? 'Client inconnu', sellerName: vendeur.nom,
      totalNetCents: String(netCents), vatCents: String(vat), totalGrossCents: String(netCents + vat),
    };
  };
  const poser = async (filename: string, octets: Uint8Array, role: Role, l: LigneCible, attendu: string, truth: Record<string, string>) => {
    fs.writeFileSync(path.join(dossier, filename), octets);
    sorties.push({
      filename, role,
      ligne: { piece: l.piece, tiers: l.tiers, montantGl: fmtEur(l.montantCents), dateGl: l.dateGl },
      attendu, truth,
    });
  };

  for (const c of cibles) {
    const l = c.ligne;
    graine += 1;
    switch (c.role) {
      case 'normale-scan': {
        const v = platChamps(facture(l, l.montantCents, l.dateGl));
        await poser(`FA-neuve-${l.piece}.pdf`, await pdfScan('FACTURE', v.sellerName, lignesFacture(v), 'propre', graine),
          c.role, l, 'lecture par le MODÈLE (scan, aucune couche texte) → attestation → vouching sans écart', v as never);
        break;
      }
      case 'normale-texte': {
        const v = facture(l, l.montantCents, l.dateGl);
        await poser(`FA-neuve-${l.piece}.pdf`, await pdfTexte('FACTURE', v.sellerName, lignesFacture(v)),
          c.role, l, 'lecture par la COUCHE TEXTE (déterministe, gratuite) — l\'échelle ne paie que quand il faut', v as never);
        break;
      }
      case 'piege-montant': {
        const net = Math.round(l.montantCents * 1.02); // 2 %, au-delà de la tolérance (0,5 %)
        const v = platChamps(facture(l, net, l.dateGl));
        await poser(`FA-neuve-${l.piece}.pdf`, await pdfScan('FACTURE', v.sellerName, lignesFacture(v), 'propre', graine),
          c.role, l, `montant imprimé ${fmtEur(net)} ≠ écriture ${fmtEur(l.montantCents)} → écart de montant au vouching`, v as never);
        break;
      }
      case 'piege-date': {
        const v = platChamps(facture(l, l.montantCents, '2026-01-20'));
        await poser(`FA-neuve-${l.piece}.pdf`, await pdfScan('FACTURE', v.sellerName, lignesFacture(v), 'propre', graine),
          c.role, l, 'facture datée 2026 sur un produit 2025 → écarts de date et de rattachement (cut-off)', v as never);
        break;
      }
      case 'degradee': {
        const v = platChamps(facture(l, l.montantCents, l.dateGl));
        await poser(`FA-neuve-${l.piece}.pdf`, await pdfScan('FACTURE', v.sellerName, lignesFacture(v), 'photo', graine),
          c.role, l, 'scan dégradé (photo, rotation, bruit) — le modèle lit ce qu\'il peut, s\'abstient sinon ; un champ non lu vaut mieux qu\'un champ faux', v as never);
        break;
      }
      case 'piege-quantite': {
        const livree = Math.max(1, (l.qteFacturee ?? 2) - 15);
        const v: VeriteBl = platChamps({
          docType: 'delivery_note' as const, deliveryNoteNumber: `BL-neuf-${l.piece.slice(-4)}`,
          deliveryDate: l.dateGl, invoiceRef: l.piece, buyerName: l.tiers ?? 'Client inconnu',
          qtyTotal: String(livree),
        });
        await poser(`BL-neuf-${l.piece}.pdf`, await pdfScan('BON DE LIVRAISON', vendeur.nom, lignesBl(v, true), 'propre', graine),
          c.role, l, `quantité livrée ${livree} < facturée ${l.qteFacturee ?? '?'} (tolérance 0) → écart de quantité au vouching`, v as never);
        break;
      }
      case 'piege-signature': {
        const v: VeriteBl = platChamps({
          docType: 'delivery_note' as const, deliveryNoteNumber: `BL-neuf-${l.piece.slice(-4)}`,
          deliveryDate: l.dateGl, invoiceRef: l.piece, buyerName: l.tiers ?? 'Client inconnu',
          qtyTotal: String(l.qteFacturee ?? 1),
        });
        await poser(`BL-neuf-${l.piece}.pdf`, await pdfScan('BON DE LIVRAISON', vendeur.nom, lignesBl(v, false), 'propre', graine),
          c.role, l, 'AUCUNE règle machine ne lit les signatures aujourd\'hui (contenu de catalogue, périmètre gelé) : ce piège se voit à l\'ŒIL, dans la visionneuse — pas en exception', v as never);
        break;
      }
    }
  }

  /* JAMAIS VUES : aucune de ces empreintes ne doit exister dans le cache de
     rejeu — sinon le rejeu serait indiscernable d'une vraie lecture. */
  const index = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'dataset', 'fixtures', 'evidence_index.json'), 'utf8')) as { sha256: string }[];
  const connues = new Set(index.map((e) => e.sha256));
  for (const s of sorties) {
    const empreinte = sha256(new Uint8Array(fs.readFileSync(path.join(dossier, s.filename))));
    if (connues.has(empreinte)) {
      console.error(`DÉFAUT : ${s.filename} porte une empreinte déjà connue du cache de rejeu — la pièce n'est pas neuve.`);
      process.exit(1);
    }
  }

  fs.writeFileSync(path.join(dossier, 'verite.json'), JSON.stringify(sorties, null, 2) + '\n');
  const md = [
    '# Pièces neuves — jamais vues du système (mode IA réelle, ADR-105)',
    '',
    'Chaque fichier se dépose AU PORTAIL CLIENT, sur la ligne indiquée (la demande de',
    'pièces la nomme par sa référence). Puis, côté auditeur : écran « Contrôle sur pièces',
    '(testing) » → « Run extraction ladder » (le modèle lit — le coût s\'affiche) →',
    'attester la lecture dans l\'atelier → « Run vouching (L0) » → l\'écart attendu se lève.',
    'Aucune de ces pièces n\'est dans le cache de rejeu : en mode rejeu (`npm run demo`),',
    'elles tombent honnêtement à l\'échelon humain.',
    '',
    '| Fichier | Ligne visée (portail) | Nature | Ce qui doit se passer |',
    '|---|---|---|---|',
    ...sorties.map((s) => `| ${s.filename} | ${s.ligne.piece} — ${s.ligne.tiers ?? '?'} — ${s.ligne.montantGl} | ${s.role} | ${s.attendu} |`),
    '',
    'Vérité champ par champ : `verite.json` (sert à `npm run eval:pieces-neuves`, qui mesure',
    'coût, latence et taux de champs corrects sur CES pièces).',
    '',
    'Toutes les données sont fabriquées et marquées SPECIMEN.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dossier, 'VERITE.md'), md);

  console.log(`pièces neuves : ${sorties.length} fichiers dans dataset/pieces_neuves/ · `
    + `${sorties.filter((s) => s.role.startsWith('piege')).length + sorties.filter((s) => s.role === 'degradee').length} piégées/dégradées · `
    + 'aucune dans le cache de rejeu · VERITE.md dit quoi déposer où');
  await closeDb();
  process.exit(0);
}

/* Exécution directe seulement — l'import de `choisirCibles` par les tests ne
   doit pas toucher la base. */
if (process.argv[1] && /pieces-neuves\.(ts|js)$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
