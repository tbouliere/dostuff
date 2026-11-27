# dostuff

Outils autour des équipements Dofus. Node ≥ 22.13, ESM. Seules dépendances npm : `@modelcontextprotocol/sdk` et `zod`
(pour le MCP) ; le script de sync n'en utilise aucune.

## Données Dofus (DofusDB)

- `npm run sync` alimente `data/dofus.db` (SQLite) depuis l'API DofusDB, avec cache dans `.cache/dofusdb/`.
- **Avant d'interroger la base ou de modifier `scripts/sync-dofusdb.js`, lire `docs/dofusdb-sync.md`** :
  schéma, conventions (malus négatifs, `characteristic_id` -1/0, catégories d'effets, éléments),
  ids de caractéristiques, requêtes d'exemple et règles de politesse envers l'API.
- Ne jamais paralléliser les appels à l'API ni baisser `DELAY_MS` sous 1000 ms.
- `data/` et `.cache/` sont générés : ne pas les éditer à la main.

## Objectif du projet

Générer un stuff (ensemble d'équipements) optimal pour un personnage Dofus, et si possible produire un lien
DofusDB ou DofusBook pour visualiser le résultat. Le projet avance **par étapes** : on part d'un cas simple
et on ajoute des règles une par une. Ne pas anticiper les étapes suivantes sans validation de l'utilisateur.
Règles validées : stuff `docs/stuff.md`, personnage `docs/personnage.md`, dégâts `docs/degats.md`, fichier cible `docs/config-cible.md`, Dofus conditionnels `docs/dofus-speciaux.md`, forgemagie `docs/forgemagie.md`.
Avancement et idées notées : `docs/roadmap.md`.

## MCP « dofus » (`.mcp.json` → `mcp/server.js`)

Accès en lecture seule à `data/dofus.db`, à utiliser plutôt que de requêter la base à la main :
- `list_classes`, `class_spells(classe)` : sorts d'une classe au niveau 200 (PA, portée modifiable, dégâts
  normal/critique, poussées, sorts secondaires résolus — pièges, glyphes…) ;
- `spell_detail(spell_id, grade?)` : effets bruts d'un sort ;
- `query(sql)` : SELECT libre (schéma : `docs/dofusdb-sync.md`).
Logique dans `src/classes.js`. Formules de dégâts : `docs/degats.md`.

## Profilage (skill `profil-stuff`)

Une demande du type « Sram pièges Air/Eau » → skill `.claude/skills/profil-stuff/SKILL.md` : analyse des sorts via
le MCP, validation des seuils/compromis avec l'utilisateur, écriture de `cibles/<nom>.json` (`docs/config-cible.md`).

## Commandes

`npm run sync` · `npm run random` · `npm run check-cibles` · `npm run evaluate -- cibles/<nom>.json --seed 3` ·
`npm run optimise -- cibles/<nom>.json [--publish]` (3 propositions → `resultats/`) · `npm test`

## Optimisation (skill `optimise-stuff`)

« Le meilleur stuff pour <cible> » → skill `.claude/skills/optimise-stuff/SKILL.md` : vérification de la cible,
`npm run optimise`, présentation des 3 propositions, publication DofusDB sur demande, ajustements.
Sans cible existante, elle enchaîne d'abord avec `profil-stuff`.
