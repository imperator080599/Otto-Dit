// LE BANDEAU DE REFUS, le même partout : un refus qui s'affiche différemment
// selon l'écran se lit comme un incident, pas comme une règle.

export function BandeauRefus({ erreur }: { erreur?: string }) {
  if (!erreur) return null;
  return (
    <div className="panel warn">
      <p><span className="badge amber">refusé</span> {erreur}</p>
      <p className="faint">
        Rien n’a été enregistré. Le refus vient du service, pas de l’écran — et il s’affiche
        ici plutôt que de faire tomber la page.
      </p>
    </div>
  );
}
