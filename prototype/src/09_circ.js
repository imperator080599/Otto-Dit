const LISTING_BANQUES = [{ compte:'512100', banque:'Banque Lyonnaise de Crédit (fictive)', contact:'confirmations@blc.example' }];
const LISTING_AVOCATS = [{ cabinet:'Cabinet Vasseur & Associés', contact:'contentieux@vasseur-avocats.example' }];

function exhaustiviteBanques(){
  const enCompta = glBal().filter(r => /^(512|53)/.test(r.compte))
    .map(r => ({ compte:r.compte, lib:r.lib, solde:r.debit - r.credit }));
  const declares = new Set(LISTING_BANQUES.map(b => b.compte));
  return enCompta.map(c => ({ ...c, declare:declares.has(c.compte) }));
}
function exhaustiviteAvocats(){
  const parTiers = new Map();
  for (const r of fec()) if (/^622/.test(r.CompteNum) && r.Debit > 0){
    parTiers.set(r.CompAuxLib || '(sans tiers)', (parTiers.get(r.CompAuxLib || '(sans tiers)') || 0) + r.Debit);
  }
  const declares = new Set(LISTING_AVOCATS.map(a => a.cabinet));
  return [...parTiers.entries()].map(([tiers, montant]) => ({ tiers, montant, declare:declares.has(tiers) }));
}
function requeteExplication(objet, detail){
  return `Requête d’explication — ${objet}. ${detail} Merci de préciser la nature de ce compte/tiers, `
       + `de confirmer s’il doit faire l’objet d’une demande de confirmation à la clôture, et de communiquer `
       + `le cas échéant le contact (nom, adresse électronique) à circulariser.`;
}