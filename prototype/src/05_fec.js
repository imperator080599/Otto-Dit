const CHAMPS_FEC = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib',
  'CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet',
  'DateLet','ValidDate','Montantdevise','Idevise'];

/** Contrôles de forme du fichier des écritures comptables.
 *  Chaque contrôle renvoie le nombre de lignes ou d'écritures en anomalie. */
function controlesFec(){
  const tot = { d:0, c:0 };
  let deuxColonnes = 0, horsExercice = 0, compteInvalide = 0, validAvant = 0, auxIncomplet = 0, pieceHors = 0;
  const parEcriture = new Map();
  for (const r of FEC){
    tot.d += r.Debit; tot.c += r.Credit;
    if ((r.Debit > 0 && r.Credit > 0) || (r.Debit === 0 && r.Credit === 0)) deuxColonnes++;
    if (r.EcritureDate < '2025-01-01' || r.EcritureDate > '2025-12-31') horsExercice++;
    if (!/^\d{3,}$/.test(r.CompteNum)) compteInvalide++;
    if (r.ValidDate && r.ValidDate < r.EcritureDate) validAvant++;
    if ((r.CompAuxNum === '') !== (r.CompAuxLib === '')) auxIncomplet++;
    if (r.PieceDate && (r.PieceDate < '2025-01-01' || r.PieceDate > '2025-12-31')) pieceHors++;
    const e = parEcriture.get(r.EcritureNum) || { d:0, c:0 };
    e.d += r.Debit; e.c += r.Credit; parEcriture.set(r.EcritureNum, e);
  }
  let ecrituresDesequilibrees = 0;
  for (const [, v] of parEcriture) if (v.d !== v.c) ecrituresDesequilibrees++;
  const champsManquants = CHAMPS_FEC.filter(f => FEC.some(r => r[f] === undefined));
  return { tot, deuxColonnes, horsExercice, compteInvalide, validAvant, auxIncomplet, pieceHors,
           ecrituresDesequilibrees, nbEcritures:parEcriture.size, champsManquants };
}

/** Rapprochement balance client ↔ grand livre, compte par compte. */
function rapprochement(){
  const gl = new Map(GL_BAL.map(r => [r.compte, r]));
  const comptes = [...new Set([...TB_2025.map(r => r[0]), ...GL_BAL.map(r => r.compte)])].sort();
  return comptes.map(c => {
    const t = B25.get(c), g = gl.get(c);
    const sTB = t ? t.solde : 0, sGL = g ? g.debit - g.credit : 0;
    return { compte:c, lib:(t ? t.lib : g.lib), sTB, sGL, ecart:sTB - sGL,
             presentTB:!!t, presentGL:!!g };
  });
}
