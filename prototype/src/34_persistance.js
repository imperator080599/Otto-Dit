/* ═══ 50. PERSISTANCE — LE PROTOTYPE SURVIT À UN RAFRAÎCHISSEMENT ══════════
   Elle a été refusée sept fois, et pour une bonne raison : un prototype qui
   garde un état est un prototype dont on ne sait plus dans quel état il est,
   et la fidélité au produit ne se joue pas là. Ce n'est plus l'argument qui
   compte. Le prototype n'a plus qu'un emploi — être montré à des auditeurs —
   et un rafraîchissement accidenté en pleine démonstration renvoyait tout le
   dossier à son état d'amorce, devant le confrère.

   Ce qui est écrit : TOUT l'état, `S` en entier, plus l'horloge. Pas de liste
   blanche — une liste blanche oublie un jour une décision, et l'oubli est
   silencieux. Mesuré : 1,3 Mo, ~13 ms de sérialisation et ~35 ms d'écriture,
   sous le plafond usuel de localStorage (≈ 5 Mo) et invisible derrière une
   temporisation d'inactivité.

   Ce qui N'EST PAS écrit : les caches dérivés. Ils se recalculent — les
   ranger serait garantir qu'un jour ils reviennent périmés.

   L'EMPREINTE. Un instantané pris sur une version antérieure du fichier
   rendrait un dossier à moitié cohérent, et c'est pire qu'un dossier vide.
   L'instantané porte donc la liste des clés de `S` et un numéro de schéma ;
   au moindre écart il est ÉCARTÉ, et l'écran le dit.
   ═══════════════════════════════════════════════════════════════════════ */
const CLE_ETAT = 'otto.prototype.etat';
const SCHEMA_ETAT = 1;
/** Les clés de l'état de départ. Un instantané qui n'a pas exactement
 *  celles-là vient d'une autre version du prototype. */
const CLES_ETAT = Object.keys(S).sort().join(',');

/* Ce que l'écran a le droit de dire de la sauvegarde. Un « enregistré » qui
   mentirait serait la pire des trois. */
const SAUVE = { etat:'vierge', quand:null, pourquoi:'' };

/* Une remise à zéro efface puis RECHARGE. Or le rechargement déclenche
   `pagehide`, donc une dernière écriture — qui remettait aussitôt en place
   l'état qu'on venait d'effacer. « Repartir de zéro » ne repartait de rien.
   Le harnais l'a relevé : dès que la remise à zéro est engagée, on n'écrit
   plus, quoi qu'il arrive. */
let _razEnCours = false;

/** Écrit l'état. Rend false et DIT pourquoi — jamais un échec muet. */
function sauverEtat(){
  if (_razEnCours) return false;
  let charge;
  try {
    charge = JSON.stringify({ schema:SCHEMA_ETAT, cles:CLES_ETAT, horloge:HORLOGE, s:S });
  } catch (e){
    SAUVE.etat = 'erreur'; SAUVE.pourquoi = 'état non sérialisable : ' + (e && e.message);
    return rendreSauvegarde(), false;
  }
  try {
    localStorage.setItem(CLE_ETAT, charge);
    SAUVE.etat = 'ok'; SAUVE.quand = new Date(); SAUVE.pourquoi = '';
  } catch (e){
    /* Mode privé, stockage désactivé, quota dépassé : trois causes réelles et
       trois messages différents. « Échec » tout court n'aide personne. */
    const q = e && (e.name === 'QuotaExceededError' || e.code === 22);
    SAUVE.etat = 'erreur';
    SAUVE.pourquoi = q ? 'espace de stockage du navigateur saturé (' + Math.round(charge.length / 1024) + ' Ko à écrire)'
                       : 'stockage refusé par le navigateur (' + (e && e.name ? e.name : 'inconnu') + ')';
    return rendreSauvegarde(), false;
  }
  rendreSauvegarde();
  return true;
}

/** Relit l'état. Rend ce qui s'est passé, en toutes lettres. */
function restaurerEtat(){
  let brut;
  try { brut = localStorage.getItem(CLE_ETAT); }
  catch (e){ return { charge:false, why:'stockage illisible (' + (e && e.name) + ')' }; }
  if (!brut) return { charge:false, why:'aucun instantané' };
  let o;
  try { o = JSON.parse(brut); }
  catch { oublierEtat(); return { charge:false, why:'instantané illisible — écarté' }; }
  if (!o || o.schema !== SCHEMA_ETAT || o.cles !== CLES_ETAT || !o.s){
    oublierEtat();
    return { charge:false, why:'instantané d’une autre version du prototype — écarté' };
  }
  /* On n'écrase que les clés que l'état de départ connaît : un instantané ne
     doit pas pouvoir introduire un champ que le code ne lit jamais. */
  for (const k of Object.keys(S)) if (o.s[k] !== undefined) S[k] = o.s[k];
  if (typeof o.horloge === 'string') HORLOGE = o.horloge;
  oublierCaches();
  SAUVE.etat = 'ok'; SAUVE.quand = null;
  return { charge:true, why:'' };
}

/** Les caches dérivés, remis à zéro : ils ont été calculés sur l'état d'amorce. */
function oublierCaches(){
  _postesCache = null;
  _travCache.cle = ''; _travCache.v = null;
  _regCache = null; _regCle = '';
  _echProcCache.clear(); _entCache.clear(); _jeStat.clear(); _statCache.clear();
  _ledgerBase = null;
  _refSeq = {};
}

function oublierEtat(){
  try { localStorage.removeItem(CLE_ETAT); } catch { /* rien à faire, et rien à taire : voir l'indicateur */ }
}

/* ── quand écrire ─────────────────────────────────────────────────────────
   Pas dans render() : plusieurs gestes ne re-rendent rien (le germe d'une
   sélection, une conclusion en cours de frappe) et seraient perdus. On écoute
   donc les gestes eux-mêmes, en phase de capture pour passer avant tout le
   reste, avec une temporisation d'inactivité — puis un écrit immédiat quand la
   page part, qui est exactement le moment qu'on cherche à couvrir. */
const DELAI_SAUVEGARDE = 700;
let _sauveTimer = null;
function planifierSauvegarde(){
  if (_sauveTimer) clearTimeout(_sauveTimer);
  SAUVE.etat = SAUVE.etat === 'erreur' ? 'erreur' : 'attente';
  rendreSauvegarde();
  _sauveTimer = setTimeout(() => { _sauveTimer = null; sauverEtat(); }, DELAI_SAUVEGARDE);
}
function sauverMaintenant(){
  if (_sauveTimer){ clearTimeout(_sauveTimer); _sauveTimer = null; }
  sauverEtat();
}

/* ── l'indicateur, et le bouton qui remet tout à zéro ─────────────────────
   Discret et fixe en bas : il ne dispute aucune place au dossier, il ne peut
   pas être coupé par un bandeau, et il reste visible sur téléphone. Ce n'est
   pas du contenu d'audit — il ne s'imprime pas. */
function rendreSauvegarde(){
  const el = document.getElementById('sauvegarde');
  if (!el) return;
  const h = SAUVE.quand
    ? String(SAUVE.quand.getHours()).padStart(2, '0') + ':' + String(SAUVE.quand.getMinutes()).padStart(2, '0')
    : '';
  const dit = SAUVE.etat === 'erreur' ? 'NON ENREGISTRÉ'
            : SAUVE.etat === 'attente' ? 'enregistrement…'
            : SAUVE.quand ? 'enregistré ' + h
            : 'enregistré';
  el.className = 'sauve' + (SAUVE.etat === 'erreur' ? ' bad' : '');
  el.innerHTML =
    `<span class="e" title="${esc(SAUVE.pourquoi || 'l’état du dossier est gardé dans ce navigateur, sur cet appareil')}">${esc(dit)}</span>`
    + (SAUVE.pourquoi ? `<span class="p">${esc(SAUVE.pourquoi)}</span>` : '')
    + `<button class="btn mini sec" id="raz-etat" type="button">repartir de zéro</button>`;
}

/** Remise à zéro : on efface et on RECHARGE. Reconstruire l'état d'amorce à
 *  chaud laisserait derrière lui des caches et des replis d'une autre partie ;
 *  un rechargement rejoue exactement le chemin du premier ouvrant. */
function repartirDeZero(){
  if (!confirm('Repartir de zéro ?\n\nTout ce qui a été saisi dans ce navigateur — affectations, '
             + 'papiers de travail, notes, visas — sera effacé, et le dossier reviendra à son état d’amorce.'))
    return;
  _razEnCours = true;
  if (_sauveTimer){ clearTimeout(_sauveTimer); _sauveTimer = null; }
  oublierEtat();
  location.reload();
}
