# Synchronisation DofusDB → SQLite

Référence pour tout agent ou développeur qui doit **lancer**, **interroger** ou **modifier**
la synchronisation des équipements Dofus depuis l'API publique DofusDB.

- Script : `scripts/sync-dofusdb.js` (Node ≥ 22.13, ESM, **aucune dépendance** : `node:sqlite` + `fetch` natifs)
- Sortie : `data/dofus.db` (SQLite, ignoré par git)
- Cache HTTP : `.cache/dofusdb/` (ignoré par git)
- Source : `https://api.dofusdb.fr` (licence des données : en-tête `x-license` de l'API)

## Lancer

```bash
npm run sync            # utilise le cache disque s'il existe (rapide, 0 requête si tout est en cache)
npm run sync:refresh    # ignore le cache et retélécharge tout depuis l'API
DELAY_MS=2000 npm run sync          # pause entre requêtes (défaut 1000 ms)
DB_PATH=/tmp/test.db npm run sync   # autre chemin de base
```

Une sync complète sans cache fait ~150 requêtes, donc ~2–3 min avec la pause par défaut.

### Règles de politesse envers l'API (à conserver)

- Requêtes **strictement séquentielles**, au moins `DELAY_MS` entre deux appels.
- Retry avec backoff exponentiel (2 s, 4 s, 8 s…, max 5 essais) sur 429 / 5xx / erreur réseau ; respecte `Retry-After`.
- `User-Agent: dostuff-sync/0.1`.
- Chaque réponse brute est mise en cache : `.cache/dofusdb/<endpoint>/<sha1(url)>.json`.
  La clé est l'URL complète : changer un paramètre (`$select`, liste de `typeId`…) invalide uniquement les pages concernées.
- Ne pas paralléliser les appels, ne pas baisser `DELAY_MS` sous 1000 ms.

## Pipeline

1. **Référentiels** : `breeds`, `item-super-types`, `item-types` (filtrés), `characteristics`, `effects`.
2. **Équipements** : `items` filtrés par `typeId[$in]`, une requête paginée par groupe (`ITEM_GROUPS`).
3. **Panoplies** : `item-sets` uniquement pour les `itemSetId` référencés par les objets récupérés (`id[$in]` par lots de 50).
4. **Sorts** : sorts de classe (`breeds.breedSpellsId` + `spell-variants`) puis, récursivement (10 niveaux max), les sorts référencés par
   leurs effets (`SPELL_REF_EFFECTS` : pose de piège/glyphe/rune, « lance le sort »), avec leurs `spell-levels`.
5. **Écriture SQLite** dans une seule transaction : `DELETE` de toutes les tables puis réinsertion
   (la sync est la source de vérité ; ne pas stocker de données manuelles dans ces tables).

### Requêtes API (Feathers.js)

| Paramètre | Usage |
|---|---|
| `$limit=50` | taille de page **max** acceptée par l'API |
| `$skip=N` | pagination ; la réponse contient `total`, `data` |
| `$sort[id]=1` | ordre stable pour la pagination |
| `$select[]=champ` | ne récupérer que les champs utiles |
| `typeId[$in][]=…`, `id[$in][]=…` | filtres |

Les textes localisés sont des objets `{ fr, en, de, es, pt }` : seul `fr` est conservé.

### Périmètre des objets

Défini en haut du script :

```js
ITEM_GROUPS = [
  { label: 'stuff', superTypes: [1, 2, 3, 4, 5, 7, 10, 11, 13] },
  { label: 'familiers/montures', superTypes: [12] },
];
EXCLUDED_TYPES = [20 /* Outil */, 21 /* Pioche */];
```

Super-types : 1 Amulette, 2 Arme, 3 Anneau, 4 Ceinture, 5 Bottes, 7 Bouclier, 10 Chapeau, 11 Cape,
12 Familier (familiers, montiliers, montures), 13 Dofus / Trophée / Prysmaradite.

Pour ajouter une catégorie : ajouter **un nouveau groupe** à `ITEM_GROUPS` (plutôt que d'étendre un groupe existant),
afin de ne pas invalider le cache des groupes déjà téléchargés.
Pour ajouter un champ d'objet : l'ajouter à `ITEM_FIELDS`, au `CREATE TABLE items`, à l'`INSERT` (le nombre de `?` est
en dur : `Array(21)`) et au `insItem.run(...)`. Attention : changer `ITEM_FIELDS` change les URL → retéléchargement de tous les objets.
Le schéma utilise `CREATE TABLE IF NOT EXISTS` : après un changement de colonnes, supprimer `data/dofus.db` avant de relancer.

## Schéma SQLite (`data/dofus.db`)

Volumétrie de la dernière sync (2026-11-27) : 3 796 items, 27 084 item_effects, 521 panoplies,
8 057 bonus de panoplie, 26 types, 123 caractéristiques, 884 effets.

```
breeds (id, name)          -- classes : 1 Féca … 18 Ouginak, 20 Forgelance (pas de 19)
breed_spells (breed_id → breeds, position, spell_id)        -- 1 sort par paire de variantes (22 par classe)
spell_variants (id, breed_id, position, spell_id)          -- paires de variantes (2 sorts par id, une seule utilisable)
spells (id, name, description, type_id)                     -- sorts de classe + sorts secondaires
spell_levels (id, spell_id → spells, grade, min_player_level, ap_cost, min_range, range,
              range_can_be_boosted, crit_probability, max_cast_per_turn, max_cast_per_target,
              min_cast_interval, initial_cooldown, global_cooldown, cast_in_line, cast_in_diagonal,
              cast_test_los, need_free_cell, need_taken_cell, need_free_trap_cell)
spell_effects (spell_level_id → spell_levels, critical, position, effect_id → effects, dice_num, dice_side,
               value, element_id, target_mask, triggers, duration, delay, random, effect_group,
               zone_shape, zone_param1, zone_param2)        PK (spell_level_id, critical, position)
item_types (id, super_type_id, name, super_type)
characteristics (id, keyword, name, category_id)
effects (id, characteristic_id, category, element_id, description, bonus_type)
item_sets (id, name, is_cosmetic)
items (id, name, level, type_id → item_types, set_id → item_sets, icon_id, img, criterions,
       is_legendary, exchangeable, etheral,
       -- armes uniquement, NULL sinon :
       ap_cost, min_range, range, crit_probability, crit_bonus, max_cast_per_turn,
       two_handed, cast_in_line, cast_in_diagonal, cast_test_los)
item_effects (item_id → items, position, effect_id → effects, characteristic_id, min, max,
              element_id, category)                     PK (item_id, position)
item_set_bonuses (set_id → item_sets, item_count, position, effect_id → effects,
                  characteristic_id, value, element_id)  PK (set_id, item_count, position)
sync_meta (key, value)   -- synced_at, source, item_count
```

Index : `items(type_id)`, `items(level)`, `items(set_id)`, `item_effects(characteristic_id)`, `spell_levels(spell_id)`.

### Sorts : conventions

- **Variantes** : chaque classe a 22 paires (`spell_variants`) ; `breed_spells` ne contient qu'un sort par paire.
  Ex. Sram : Truanderie / Chausse-trappe, Sournoiserie / Coupe-gorge. `breed_id = 19` (13 paires) ne correspond
  à aucune classe de `breeds`.

- **Grade utilisable au niveau 200** : pour un sort, le `grade` max parmi les `spell_levels` où `min_player_level <= 200`.
- **`spell_effects.critical`** : 0 = effets normaux, 1 = effets en coup critique (absents = le sort ne peut pas critiquer,
  ex. les dégâts de piège).
- **Dégâts** : `dice_num` = min, `dice_side` = max (0 si valeur fixe) ; `element_id` comme pour les objets.
- **Sorts secondaires** : pour `effect_id` ∈ {400 piège, 401/402/1091/1165 glyphes, 2022 rune, 4040 glyphe-prison,
  792/1017/1160/2160/2794/2960 « lance le sort »}, `dice_num` = id du sort lancé, `dice_side` = son grade.
  4 références (runes de l'Huppermage, effet 2794 → 13692, 13735, 13737, 13739, branche conditionnée par l'état 600 du lanceur) pointent vers des sorts absents de l'API : effets de déplacement sans dégâts (confirmé par l'utilisateur), sans impact.
- **Modificateurs** : 280/281 portée min/max, 293 dégâts de base, 1045/1036 relance… : `dice_num` = id du sort modifié.
- Les invocations (181 « Invoque : #1 ») référencent des monstres, non synchronisés : hors périmètre (décision utilisateur).

### Conventions et pièges

- **Booléens** : `0/1`, `NULL` si absent de l'API.
- **`items.name`** : nom FR, ou `#<id>` si l'API n'en fournit pas.
- **`items.set_id`** : `NULL` si pas de panoplie (≈ la moitié des objets).
- **`items.img`** : URL de l'icône sur le CDN DofusDB.
- **`items.criterions`** : conditions d'équipement brutes au format Dofus, ex. `CP<12&CM<6&CW>99`
  (`&` = et, `|` = ou, `CP`/`CM` = PA/PM, `CS` Force, `CV` Vitalité, `CW` Sagesse, `CI` Intelligence, `CC` Chance, `CA` Agilité, `PL` niveau…). Non parsé.
- **`item_effects.min/max`** : jet de l'objet. L'API renvoie `to = 0` quand la valeur est fixe → on stocke `max = min`.
  Les **malus sont négatifs** (ex. `-12 Fuite` → `min = max = -12`).
- **`item_set_bonuses.item_count`** : nombre d'objets de la panoplie portés pour obtenir le bonus (presque toujours ≥ 2 ; quelques panoplies ont un palier à 1).
  Les bonus ne sont pas cumulatifs entre paliers : chaque palier liste le bonus total.
- **`effects.description`** : gabarit d'affichage Dofus, ex. `#1{{~1~2 à }}#2 Force`
  (`#1` = min, `#2` = max, `#3` = valeur ; `{{~1~2 à }}` n'est affiché que si min ≠ max).
- **`item_effects.category`** :
  | valeur | sens |
  |---|---|
  | 0 | caractéristique (stats, malus inclus) |
  | 1 | résistances |
  | 2 | lignes de dégâts / vols d'arme (`characteristic_id = -1`) |
  | 3 | modificateurs de sort (`characteristic_id = 0`) |
  | 6 | effets divers / non affichés (familiers, montures…) |
  | 7 | rare (21 lignes) |
- **`characteristic_id`** : `-1` = « Inconnue » (lignes de dégâts d'arme), `0` = pas une caractéristique
  dans `item_effects` (malgré le libellé « Points de vie » dans `characteristics`). Pour les stats, utiliser les ids > 0.
- **`element_id`** : -1 aucun, 0 Neutre, 1 Terre, 2 Feu, 3 Eau, 4 Air, 5 multi / tous éléments.

### Caractéristiques utiles (`characteristics.id` → keyword)

```
1 PA (actionPoints)          23 PM (movementPoints)      19 Portée (range)
10 Force   11 Vitalité   12 Sagesse   13 Chance   14 Agilité   15 Intelligence
16 Dommages   18 Critique   25 Puissance   26 Invocation   44 Initiative   48 Prospection   49 Soins
27/28 Esquive PA/PM   82/83 Retrait PA/PM   78 Fuite   79 Tacle
33–37 Résistances % (Terre, Feu, Eau, Air, Neutre)
54–58 Résistances fixes (Terre, Feu, Eau, Air, Neutre)
84/85 Dommages / Résistance Poussée   86/87 Dommages / Résistance Critiques
88–92 Dommages élémentaires (Terre, Feu, Eau, Air, Neutre)
120–125 Multiplicateurs % (distance, armes, sorts, mêlée)
```

Liste complète : `SELECT id, keyword, name FROM characteristics ORDER BY id;`

## Exemples de requêtes

Accès : `sqlite3 data/dofus.db` (installé par le devcontainer) ou `new DatabaseSync('data/dofus.db')` (`node:sqlite`).

```sql
-- Stats d'un objet, lisibles
SELECT i.name, c.name AS stat, ie.min, ie.max
FROM items i
JOIN item_effects ie ON ie.item_id = i.id
LEFT JOIN characteristics c ON c.id = ie.characteristic_id
WHERE i.name = 'Gelano';

-- Meilleurs chapeaux en Agilité (jet max) entre niveau 150 et 200
SELECT i.id, i.name, i.level, ie.max AS agi
FROM items i
JOIN item_types t ON t.id = i.type_id
JOIN item_effects ie ON ie.item_id = i.id AND ie.characteristic_id = 14
WHERE t.name = 'Chapeau' AND i.level BETWEEN 150 AND 200
ORDER BY agi DESC LIMIT 10;

-- Objets donnant au moins 1 PA
SELECT i.name, i.level, t.name AS type
FROM items i JOIN item_types t ON t.id = i.type_id
JOIN item_effects ie ON ie.item_id = i.id
WHERE ie.characteristic_id = 1 AND ie.min > 0;

-- Bonus d'une panoplie par palier
SELECT s.name, b.item_count, c.name AS stat, b.value
FROM item_sets s
JOIN item_set_bonuses b ON b.set_id = s.id
LEFT JOIN characteristics c ON c.id = b.characteristic_id
WHERE s.name LIKE 'Panoplie du Bouftou%'
ORDER BY b.item_count, b.position;

-- Fraîcheur des données
SELECT * FROM sync_meta;
```
