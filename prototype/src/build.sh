#!/bin/sh
# Assemblage du prototype : un seul fichier, aucune dépendance, aucun réseau.
set -e
cd "$(dirname "$0")"

# Le catalogue méthodologique est engendré depuis methodology/, versionné à part.
# Le prototype ne le contient pas : il l'intègre à la construction, et refuse
# de s'assembler si le catalogue ne valide pas contre son schéma.
RACINE="${OTTO_RACINE:-$(cd ../.. 2>/dev/null && pwd)}"
[ -d "$RACINE/methodology" ] || RACINE=/home/user/Otto-Dit
node gen-catalogue.mjs "$RACINE" .

ORDRE="00_head.html 01_data.js 02_util.js 11_state.js _catalogue.gen.js 23_versions.js 03_agg.js 04_table.js 05_fec.js \
06_ra.js 09_circ.js 10_ia.js 28_resolveurs.js 18_procedures.js 22_ecarts.js 12_fsli.js 13_notes.js \
14_client.js 15_views.js 17_facteurs.js 19_achevement.js 20_export.js \
21_travaux.js 30_equipe.js 27_section.js 26_repartition.js 24_impact.js 29_ajustements.js 32_graphes.js 31_deroule.js 25_je.js 16_render.js"
cat $ORDRE > otto-prototype.html
printf '\n</script>\n</body>\n</html>\n' >> otto-prototype.html
wc -c otto-prototype.html
