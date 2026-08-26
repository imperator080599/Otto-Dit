#!/bin/sh
# Lance tous les harnais sur le fichier livré et sort en échec au moindre
# problème. Un harnais MUET est un échec : il n'a rien vérifié.
P="$1"
[ -n "$P" ] || { echo "usage : sh tout.sh <chemin du fichier html>"; exit 2; }
fail=0
for h in smoke2 verif lot4 lot2v lot3je lot1rep lisi sond sond2 chaine2 perf design mob theme doubl couv couv2 toutes haut final bandeau cat2 ajust libelles equipe jalons qualitatif deroule graphes rail portail; do
  out=$(node "$h.mjs" "$P" 2>&1)
  n=$(printf '%s' "$out" | grep -cE "^ÉCHEC")
  crash=$(printf '%s' "$out" | grep -cE "triggerUncaughtException|TimeoutError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND")
  lignes=$(printf '%s' "$out" | grep -c .)
  if [ "$crash" != "0" ]; then st="PLANTAGE"; fail=1
  elif [ "$lignes" = "0" ]; then st="MUET — n'a rien vérifié"; fail=1
  elif [ "$n" != "0" ]; then st="$n échec(s)"; fail=1
  else st="ok"; fi
  printf "%-9s %s\n" "$h" "$st"
done
exit $fail
