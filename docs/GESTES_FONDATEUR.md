# Les gestes du fondateur — recette exacte, engendrée depuis le code

Engendré le 2026-09-19, sur le commit `f9651273522` (`HEAD` au moment de la rédaction). **Chaque
ligne ci-dessous cite un fichier et une ligne** — rien n'est écrit de mémoire ni approximé (règle
8/13). Si le code cité change, ce document ment jusqu'à être régénéré : il n'est pas maintenu à la
main, il est vérifié à chaque lecture contre les fichiers qu'il cite.

**La clé n'est JAMAIS imprimée** dans ce document, dans aucune commande qu'il recommande, ni dans
aucune sortie qu'il produit. Toute vérification proposée ici prouve que la clé est VUE (un appel
qui ne lève pas l'erreur « absente »), jamais sa valeur, sa longueur ni son préfixe.

---

## Constat qui prime sur les trois gestes : `demoPublique()` coupe AVANT eux

**C'est la découverte la plus importante de ce document — elle change ce que le geste 3 peut
accomplir aujourd'hui.** `app/src/lib/core/demo-public.ts:8-14` :

```ts
export function demoPublique(): boolean {
  return process.env.OTTO_DEMO_PUBLIC === '1' || process.env.VERCEL === '1';
}
```

Vercel pose `VERCEL=1` lui-même, sur TOUT déploiement (production ET preview) — ce n'est pas un
réglage de tableau de bord qu'on peut oublier ou omettre. `demoPublique()` est donc TOUJOURS vraie
sur `otto-dit.vercel.app`, aujourd'hui, quoi que portent les autres variables.

Les QUATRE fabriques d'adaptateur réel de ce dépôt (voir Geste 3) commencent TOUTES par ce test,
AVANT même de lire leur sélecteur :

- `app/src/lib/services/extraction/adapters.ts:175` — `if (demoPublique()) return new ReplayOcrAdapter();`
- `app/src/lib/services/entretiens-analyste.ts:188` — `if (demoPublique()) return new RejeuAnalyste();`
- `app/src/lib/services/entretiens-analyste.ts:200` — `if (demoPublique()) return new RejeuAnalyste('walkthroughs.json');`
- `app/src/lib/services/query/adapter.ts:113` — `if (demoPublique()) return new DisabledQueryPlanner();`

C'est **délibéré et déjà décrit** — `docs/DECISIONS.md`, ADR-109, point 4 : « Sur Vercel, tout
déploiement EST la démo publique (DA-10, `VERCEL=1`) : IA réelle coupée dans les trois fabriques
d'adaptateurs (testé), aucune clé requise ni lue... » et le commentaire du code lui-même (`demo-
public.ts:9-12`) : « Le jour d'une vraie production hébergée, cette ligne se REVOIT — elle ne se
contourne pas. »

**Conséquence directe, à dire sans détour** : poser les trois sélecteurs du geste 3 sur
`otto-dit.vercel.app` aujourd'hui n'aura AUCUN EFFET observable — le code ne les lira jamais, parce
qu'il retourne avant. Ce n'est PAS un geste 4 manquant dans la liste du mandat — c'est une garde
ARCHITECTURALE, testée, au-dessus des trois gestes eux-mêmes, et sa levée n'est écrite nulle part
dans ce dépôt ni dans le mandat qui a demandé ce document. **Je ne la lève pas de ma propre
initiative** — « vous ne basculez pas un sélecteur... de votre propre initiative » couvre
exactement ce geste-ci, et il en est le PREMIER, avant même les trois nommés. Si le fondateur veut
un jour un déploiement où l'IA réelle peut tourner, la question à trancher d'abord est CELLE-CI —
revoir `demoPublique()` elle-même (un déploiement non-Vercel, ou une variable d'échappement
explicite à écrire et à motiver) — pas les sélecteurs qui la suivent.

---

## Geste 1 — la clé (FAIT, mesuré par le fondateur contre l'API Vercel)

Rien à faire ici. Un seul avertissement, déjà donné par le fondateur et reconfirmé en lisant le
code : les deux entrées `preview` sont bornées par branche (`gitBranch`). Une session qui ouvrirait
une branche neuve n'aurait PAS la clé sur ses previews — ce serait à nommer comme tel, jamais lu
comme « le geste 1 n'a pas eu lieu ».

**Vérification possible aujourd'hui** : aucune, de bout en bout. Les trois constructeurs qui
liraient réellement `ANTHROPIC_API_KEY` (`AnthropicDocAdapter.sdk()`, `adapters.ts:93` ;
`AnthropicAnalyste.analyser()`, `entretiens-analyste.ts:118` ; le planificateur de requête,
`query/adapter.ts`) ne sont jamais construits sur Vercel — `demoPublique()` retourne avant, comme
ci-dessus. Chacun lève une erreur qui NOMME l'absence sans jamais imprimer la valeur
(`'ANTHROPIC_API_KEY absente — ...'` / `'ANTHROPIC_API_KEY is not set — ...'`) — c'est la forme sûre
déjà en place dans ce dépôt pour une future vérification, mais elle ne peut être EXERCÉE que le
jour où le constat ci-dessus est levé.

---

## Geste 2 — la garde de budget EN BASE

**Réponse à la question posée : (a) — construite, sous un NOM et une FORME différents de
`ia_vivante_budget` en tant que TABLE.** Ce n'est pas une table. C'est une LIGNE dans `app_state`
(table déjà existante depuis `0005_app_state.sql` — `key text primary key, value jsonb not null,
updated_at timestamptz not null default now()`), sous la clé `'ia_vivante_budget'`.

Code : `app/src/lib/services/extraction/budget.ts`.

- `gardeBudgetEnBase()` (ligne 69) LIT la ligne, jamais ne décide.
- `assertBudgetActifEnBase()` (ligne 119) est LA garde — appelée AVANT tout appel réel, sur les
  QUATRE chemins qui peuvent en tenter un :
  - `app/src/lib/services/entretiens.ts:177`
  - `app/src/lib/services/walkthrough-analyse.ts:103`
  - `app/src/lib/services/extraction/ladder.ts:130`
  - `app/src/lib/services/query/ask.ts:150`
- Elle refuse (`IA-BUDGET-01`, `budget.ts:119-129`) si la ligne est ABSENTE, ou si l'un des quatre
  champs manque : `actif !== true`, `plafondUsd` nul/≤0, `activePar` absent, `activeLe` absent.
  **Fermée par défaut, deux fois** : la ligne n'existe tout simplement pas tant que personne ne
  l'écrit, et un état incomplet refuse aussi — jamais lu comme « à moitié activé ».
- **Aucun chemin de ce dépôt n'écrit `actif:true`** (vérifié : `grep -rn "actif.*true" app/src` ne
  trouve que les tests, qui la posent puis la retirent via `_reinitialiserGardeBudgetEnBasePourSonde`).
  Seule une écriture SQL directe sur la base de PRODUCTION peut la poser — c'est le déverrouillage
  lui-même, au sens du mandat du 9 septembre §4.

**La mesure indépendante du superviseur (« exactement une ligne, `key='clock_offset'` ») est
cohérente avec le code : la ligne `ia_vivante_budget` n'existe pas encore en production.** Ce n'est
ni un manque de construction ni un oubli — c'est l'état ATTENDU avant que le fondateur ne pose la
ligne lui-même.

### La recette (à exécuter par le fondateur, en accès direct à la base de production — jamais par ce dépôt)

```sql
insert into app_state (key, value)
values (
  'ia_vivante_budget',
  jsonb_build_object(
    'actif', true,
    'plafondUsd', 2,
    'activePar', 'Tuan',        -- une chaîne libre (règle 3 : provenance, pas une FK réelle — voir budget.ts:110-118)
    'activeLe', now()::text
  )
)
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Remplacer `'Tuan'` par l'identifiant que le fondateur veut voir apparaître dans la provenance — rien
ne vérifie que c'est un `app_user` réel (c'est écrit et assumé dans `budget.ts:110-118`, un moindre
mal documenté, pas une lacune tue).

### Vérification (jamais la clé, jamais un accès direct répété à la base)

`GET /api/sante` porte déjà une lecture nommée `IA-BUDGET-01` (`app/src/app/api/sante/route.ts:
1737-1748`), avec son propre cas connu mauvais testé (`ia-budget-lecture.test.ts`, six cas). Elle
répond, sans jamais lire ni exposer la clé :

- avant la ligne : `"fermée — aucune garde de budget active en base (défaut, mandat §4)"`, `ok:true`.
- ligne incomplète (plafond nul, ou provenance à moitié posée) : `ok:false`, HTTP 500, la lecture
  ENTIÈRE de `/api/sante` rougit (règle 22 : elle peut rougir sur le cas qu'elle surveille).
- ligne complète et valide : `"ACTIVE — plafond 2 $, posée par Tuan le <horodatage>"`, `ok:true`.

C'est la SEULE vérification à faire après avoir posé la ligne : charger `/api/sante` et lire la
ligne `IA-BUDGET-01`.

### Le second plafond, DISTINCT, qui gouverne la dépense CUMULÉE — pas juste le droit de tenter

`assertBudgetActifEnBase()` ne compare JAMAIS son `plafondUsd` à la dépense réelle — c'est un
interrupteur binaire (ouvert/fermé), pas un compteur. Le compteur qui refuse quand le CUMUL dépasse
un plafond est une fonction SÉPARÉE, `gardeBudget()` (`budget.ts:40-44`), lue par les QUATRE mêmes
chemins juste après `assertBudgetActifEnBase()`. Son plafond vient d'une variable d'ENVIRONNEMENT
Vercel, PAS de la base :

```ts
export function plafondUsd(): number {
  const v = Number(process.env.OTTO_BUDGET_USD ?? '5');
  return Number.isFinite(v) && v > 0 ? v : 5;
}
```

**`OTTO_BUDGET_USD` n'existe pas aujourd'hui dans Vercel** (absent de l'inventaire du fondateur) —
son défaut est donc **5 $, pas 2 $**, tant qu'elle n'est pas posée. Pour que le premier plafond
observé soit bien 2 $ comme demandé, poser AUSSI, dans Vercel (Project Settings → Environment
Variables, `production`) :

```
OTTO_BUDGET_USD=2
```

### Un troisième réglage, sans lequel le compteur ne peut JAMAIS refuser — même à 2 $

`gardeBudget()` compare `depenseCumuleeUsd()` (la somme de `ai_run.cost_usd`) au plafond. Mais
`ai_run.cost_usd` est calculé par `costUsd()` (`app/src/lib/core/pricing.ts:20-23`), qui **rend
TOUJOURS 0** tant que `OTTO_PRICE_IN_PER_MTOK` et `OTTO_PRICE_OUT_PER_MTOK` ne sont PAS posées
toutes les deux (`pricing.ts:13-16` — pas de valeur par défaut non nulle dans le code, `DEFAULTS`
est un objet vide, ligne 8). **Ces deux variables sont également absentes de l'inventaire du
fondateur.** Sans elles, chaque appel réel coûterait réellement de l'argent chez le fournisseur,
mais `cost_usd` resterait 0 dans `ai_run` pour toujours — et `gardeBudget()` ne refuserait JAMAIS,
quel que soit `OTTO_BUDGET_USD`. Poser, avec le prix RÉEL au moment du geste (jamais une valeur de
mémoire, règle 8 — vérifier la grille tarifaire du fournisseur avant de les poser) :

```
OTTO_PRICE_IN_PER_MTOK=<prix réel, $/million tokens d'entrée>
OTTO_PRICE_OUT_PER_MTOK=<prix réel, $/million tokens de sortie>
```

**Résumé Geste 2 — trois réglages, pas un seul, pour que « 2 $ » soit une vraie limite observée :**
la ligne `app_state.ia_vivante_budget` (le droit de tenter), `OTTO_BUDGET_USD=2` (le plafond
comparé au cumul), et les deux prix (sans lesquels le cumul reste 0 pour toujours). Et même les
trois réunis restent inertes sur Vercel tant que le constat en tête de ce document n'est pas levé.

---

## Geste 3 — les sélecteurs d'adaptateur : QUATRE, pas trois

Le mandat en nomme trois. Le code en porte un QUATRIÈME, du même type (une fabrique qui choisit
entre un adaptateur de rejeu et un adaptateur Anthropic réel, gouvernée par une variable
d'environnement, gardée par `demoPublique()` ET par les deux fonctions du geste 2). Je le signale
plutôt que de le taire (règle 13) : le laisser hors de ce document serait un silence, pas une
fidélité au mandat.

| # | Variable | Défaut (code) | Valeur qui active le réel | Fichier:ligne | Gardé par `assertBudgetActifEnBase`+`gardeBudget` ? |
|---|---|---|---|---|---|
| 1 | `OTTO_OCR_ADAPTER` | `'mock'` | `'anthropic'` | `extraction/adapters.ts:176-178` | Oui — via `ladder.ts:130` |
| 2 | `OTTO_TRANSCRIPT_ADAPTER` | `'mock'` | `'anthropic'` | `entretiens-analyste.ts:189-192` | Oui — via `entretiens.ts:177` |
| 3 | `OTTO_WALKTHROUGH_ADAPTER` | `'mock'` | `'anthropic'` | `entretiens-analyste.ts:201-213` | Oui — via `walkthrough-analyse.ts:103` |
| 4 | `OTTO_QUERY_PLANNER` | `'disabled'` | `'anthropic'` | `query/adapter.ts:112-116` | Oui — via `query/ask.ts:150-151` |

Défaut-quand-absente confirmé en LISANT le code (jamais supposé) pour les quatre : chacune utilise
soit un `?? 'mock'` explicite (1-3), soit une comparaison stricte à `'anthropic'` qui échoue sur
`undefined` (4, `=== 'anthropic'`, `adapter.ts:114`) — dans les deux cas, l'absence de la variable
produit le mock/désactivé. **Confirmé : aucune des quatre n'est déclarée dans Vercel aujourd'hui
(inventaire du fondateur) — la plateforme tourne donc sur ces défauts, EN PLUS d'être coupée par
`demoPublique()` en amont.**

Modèles utilisés par chaque adaptateur réel (déjà en place dans le code, pas un identifiant neuf de
cette session — CLAUDE.md l'autorise explicitement pour ces fichiers) : `OTTO_EXTRACT_MODEL`
(`adapters.ts:87`), `OTTO_TRANSCRIPT_MODEL`/`OTTO_WALKTHROUGH_MODEL`
(`entretiens-analyste.ts:109,205`), `OTTO_QUERY_MODEL` (`query/adapter.ts:54`) — chacun avec son
propre défaut déjà écrit dans le code cité, surchargeable par variable d'environnement si le
fondateur le souhaite ; ce document ne recommande aucune valeur ici, ce n'est pas son objet.

**Avertissement séparé, pour éviter une confusion en lisant `DEPLOY.md` :** ce fichier documente
`OTTO_OCR_ADAPTER` et `OTTO_QUERY_PLANNER` (`DEPLOY.md:128,130`) mais **ne mentionne PAS**
`OTTO_TRANSCRIPT_ADAPTER`, `OTTO_WALKTHROUGH_ADAPTER`, ni la garde en base du geste 2
(`OTTO_BUDGET_USD`, `app_state.ia_vivante_budget`) — il est incomplet sur exactement les points que
ce document couvre. `DEPLOY.md` cite aussi un défaut `claude-sonnet-4-5` pour `OTTO_EXTRACT_MODEL`
(ligne 129) qui ne correspond PAS au défaut lu dans le code aujourd'hui (`adapters.ts:87`,
`'claude-opus-5'`) — un écart non corrigé par ce document (hors de son objet), signalé pour qu'il
ne soit pas lu comme une seconde source de vérité. **La source de vérité reste le code cité
ci-dessus, jamais `DEPLOY.md`.**

### La recette

Aucune tant que le constat en tête n'est pas résolu — poser ces quatre variables sur
`otto-dit.vercel.app` aujourd'hui ne change RIEN d'observable, pour la raison donnée en tête de ce
document. Si/quand cette garde est levée par un geste du fondateur, la recette est : Vercel →
Project Settings → Environment Variables → poser la variable choisie à `anthropic`, cible
`production` (ou `preview` + la branche voulue, comme pour la clé).

### Vérification (le jour où elle est possible)

Chaque adaptateur réel laisse une trace dans `ai_run.adapter` (`= 'anthropic'`) dès son premier
appel — visible en interrogeant `ai_run` (jamais la clé), ou en lisant `/api/sante` si une lecture
future en expose un résumé (aucune n'existe aujourd'hui pour CE point précis — seule IA-BUDGET-01,
geste 2, y est déjà). Ne PAS imprimer `ai_run.prompt_id`/`input_hash` publiquement sans réflexion :
ce ne sont pas des secrets, mais ce document ne tranche pas cette question, hors de son objet.

---

## Ordre des gestes, tel que le code le contraint réellement

1. **Déjà fait** : Geste 1 (la clé), Vercel, deux branches preview + production.
2. **Un geste PAS nommé par le mandat, mais un préalable réel à tout le reste** : lever ou revoir
   `demoPublique()` (`demo-public.ts:8-14`, ADR-109 point 4) — SEUL le fondateur en décide, ce
   document ne fait qu'exposer que ce préalable existe et bloque tout le reste tant qu'il n'est pas
   traité.
3. **Geste 2** : la ligne `app_state.ia_vivante_budget` (SQL ci-dessus) + `OTTO_BUDGET_USD=2` +
   les deux variables de prix réel — les trois ensemble, pas un sous-ensemble.
4. **Geste 3** : poser UN des quatre sélecteurs à `'anthropic'` (lequel, au choix du fondateur —
   ce document n'en recommande aucun) — sans effet avant le point 2.
5. **Vérification finale** : `/api/sante`, ligne `IA-BUDGET-01`, doit dire `ACTIVE — plafond 2 $...`
   — puis DÉCLENCHER un vrai appel (un vrai transcript/document/walkthrough/question selon le
   sélecteur choisi) une première fois pour voir `ai_run` s'écrire avec un `cost_usd` non nul, une
   seconde et une troisième fois jusqu'à dépasser 2 $ cumulés, et voir `gardeBudget()` refuser
   PROPREMENT (le message de `messageArretBudget()`, `budget.ts:27-37` — les deux chiffres, jamais
   une lecture de plus). C'est CE refus-là, observé, que le mandat demande de voir avant toute
   augmentation du plafond.
