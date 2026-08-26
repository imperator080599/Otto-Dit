#!/bin/sh
# Assemblage du prototype : un seul fichier, aucune dépendance, aucun réseau.
set -e
cd "$(dirname "$0")"
ORDRE="00_head.html 01_data.js 02_util.js 11_state.js 23_versions.js 03_agg.js 04_table.js 05_fec.js \
06_ra.js 09_circ.js 10_ia.js 18_procedures.js 22_ecarts.js 12_fsli.js 13_notes.js \
14_client.js 15_views.js 17_facteurs.js 19_achevement.js 20_export.js \
21_travaux.js 24_impact.js 25_je.js 16_render.js"
cat $ORDRE > otto-prototype.html
printf '\n</script>\n</body>\n</html>\n' >> otto-prototype.html
wc -c otto-prototype.html
