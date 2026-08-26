function arSeuilMontant(){ return S.arMontant === null ? seuils().PM : S.arMontant; }

function revueAnalytique(){
  const comptes = [...new Set([...TB_2025.map(r => r[0]), ...TB_2024.map(r => r[0])])].sort();
  return comptes.map(c => {
    const n = B25.get(c) ? B25.get(c).solde : 0;
    const n1 = B24.get(c) ? B24.get(c).solde : 0;
    const lib = (B25.get(c) || B24.get(c)).lib;
    const d = n - n1;
    const p = n1 === 0 ? (n === 0 ? 0 : null) : d / Math.abs(n1);   // null = pas de base N-1
    const parMontant = Math.abs(d) >= arSeuilMontant();
    const parPct = p !== null && Math.abs(p) >= S.arPct / 100;
    return { compte:c, lib, n, n1, d, p, parMontant, parPct, flag:parMontant || parPct };
  });
}
/** Sens naturel d'un compte : -1 s'il est normalement créditeur (produits,
 *  capitaux, dettes). Sans cela, une hausse du chiffre d'affaires — qui rend le
 *  solde PLUS créditeur, donc plus négatif en convention signée — serait
 *  décrite comme une baisse. C'est le genre d'erreur qu'un associé voit en
 *  trois secondes et qui décrédibilise tout le reste. */
function sensNaturel(l){ return ((l.n1 || l.n) < 0) ? -1 : 1; }

/** Question composée automatiquement — assemblage déterministe, aucun texte de modèle. */
function questionVariation(l){
  const k = sensNaturel(l);
  const mouvement = l.d * k;                       // > 0 = augmentation, dans le sens du compte
  const sens = mouvement > 0 ? 'une augmentation' : 'une diminution';
  const nature = k < 0 ? 'solde créditeur' : 'solde débiteur';
  const pctTxt = l.p === null ? 'sans base comparative en N-1' : 'soit ' + pct(Math.abs(l.p), 1);
  const motif = l.parMontant && l.parPct ? 'seuil en montant et seuil en pourcentage'
              : l.parMontant ? 'seuil en montant' : 'seuil en pourcentage';
  return `Le compte ${l.compte} « ${l.lib} » (${nature}) présente ${sens} de ${eur(Math.abs(l.d))} entre le `
       + `31/12/2024 (${eur(Math.abs(l.n1))}) et le 31/12/2025 (${eur(Math.abs(l.n))}), ${pctTxt}. Cette variation `
       + `dépasse le ${motif} retenu pour la revue analytique (${eur(arSeuilMontant())} / ${S.arPct}${NBSP}%). `
       + `Merci d’en indiquer l’explication et de préciser les éléments justificatifs disponibles.`;
}
