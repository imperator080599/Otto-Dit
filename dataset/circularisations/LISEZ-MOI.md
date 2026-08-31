# Listings de circularisation — 100 % fictifs

Ce que le CLIENT fournit, tel qu'il le fournit : un tableau `Tiers;Contact;Reference;Compte`.

- `banques.csv` — le listing **initial**, avec le défaut que la complétude doit trouver :
  le compte du grand livre `512100` (Banque Lyonnaise de Crédit) n'y est **pas** — la ligne
  le rattache à `512900`, qui n'existe pas — et `Crédit Méridien` annonce un compte `512200`
  qu'aucune écriture ne porte. Les deux sens du contrôle sont donc démontrables sur le même
  fichier.
- `banques-corrige.csv` — ce que le client renvoie après la question : le bon compte, et le
  compte non comptabilisé retiré (il était clos).
- `avocats.csv` — le cabinet qui suit le litige provisionné au compte `151000`.

Aucune banque, aucun cabinet, aucun IBAN et aucune adresse ne correspondent à quoi que ce
soit de réel : les domaines sont en `.example`, réservé par la RFC 2606 précisément pour ça.
