function critereJE(seuilGros){
  return {
    weekend:   { lib:'Comptabilisée un week-end', f:e => isWeekend(e.date) },
    rond:      { lib:'Montant rond (multiple de 1 000 €)', f:e => { const m = e.lines[0].debit || e.lines[0].credit; return m >= 100000 && m % 100000 === 0; } },
    od:        { lib:'Journal d’opérations diverses', f:e => e.journal === 'OD' },
    valid:     { lib:'Validée après la clôture', f:e => e.validDate > '2025-12-31' },
    direction: { lib:'Saisie par la direction', f:e => /direction/.test(e.saisiePar) },
    gros:      { lib:'Montant supérieur au seuil de planification', f:e => (e.lines[0].debit || e.lines[0].credit) > seuilGros },
  };
}