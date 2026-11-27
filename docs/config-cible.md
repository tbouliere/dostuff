# Fichier de configuration « cible »

Validé avec l'utilisateur (étape 4b, 2026-11-27).

Produit par Claude (procédure de profilage), lu par l'optimiseur de stuff. Format JSON, un fichier par profil,
rangé dans `cibles/<nom>.json` (le nom du fichier = champ `nom`). Vérification : `npm run check-cibles`. Les caractéristiques sont désignées par leur `keyword` (table `characteristics`).

## Structure

```jsonc
{
  "version": 1,
  "nom": "sram-pieges-air-eau",
  "demande": "Sram jouant avec des pièges dans la voie Air et Eau",   // prompt d'origine
  "classe": { "id": 4, "nom": "Sram" },

  // 1. Répartition des 995 points (docs/personnage.md) : cherchée par l'OPTIMISEUR, car elle dépend du stuff
  //    (conditions d'équipement de type CS>89…). Parchemins +100 partout, implicites.
  //    "minimum" (optionnel) : valeurs investies minimales imposées par l'utilisateur.
  "points": { "mode": "auto", "minimum": {} },

  // 2. Contraintes : seuils sur le total final (base + points + parchemins + stuff + panoplies).
  //    "strict": true  → stuff invalide si non atteint ;
  //    "strict": false → compromis accepté, chaque point manquant coûte "penalite" points de score.
  "contraintes": {
    "actionPoints":   { "min": 12, "strict": true },
    "movementPoints": { "min": 6,  "strict": false, "penalite": 400 },
    "range":          { "min": 6,  "strict": false, "penalite": 150 }
  },

  // 3. Dégâts : lignes de sorts de référence. L'optimiseur calcule le dégât moyen de chaque ligne avec la
  //    formule de docs/degats.md (jet moyen normal/critique pondéré par la probabilité de critique, plafond
  //    100 %) et les pondère par "poids" (part d'utilisation dans un tour type).
  "degats": {
    // cible de référence (Poutch par défaut). Clés : "Terre", "Feu", "Eau", "Air", "Neutre" ;
    // en plus "distance" / "melee" dans resistances_pct et "critique" dans resistances_fixes.
    "cible": { "resistances_pct": {}, "resistances_fixes": {} },
    "sorts": [
      { "sort": "Piège Fangeux", "id": 12916, "element": "Eau", "type": "piege", "portee": "distance",
        "normal": [33, 37], "critique": null, "critique_base_pct": 0, "poids": 1 },
      { "sort": "Piège Répulsif", "id": 12914, "element": "Air", "type": "piege", "portee": "distance",
        "normal": [14, 17], "critique": null, "critique_base_pct": 0, "poids": 1,
        "poussee_cases": 2 },
      { "sort": "Perfidie", "id": 12909, "element": "Terre", "type": "sort", "portee": "melee",
        "normal": [56, 60], "critique": [62, 66], "critique_base_pct": 10, "poids": 1 }
    ]
  },

  // 4. Autres caractéristiques valorisées linéairement : score += valeur × poids
  //    (échelle : 1 point de score ≈ 1 dégât moyen par tour).
  "bonus": {
    "vitality": 0.3,
    "earthElementResistPercent": 8, "fireElementResistPercent": 8, "waterElementResistPercent": 8,
    "airElementResistPercent": 8, "neutralElementResistPercent": 8,
    "tackleEvade": 1
  },

  // 5. Objets forcés / interdits (ids), optionnel. Les Dofus à effet conditionnel acceptés par l'utilisateur
  //    (docs/dofus-speciaux.md) sont imposés et leur effet converti en bonus ajoutés aux stats finales.
  //    Clé spéciale "multiplicateur_final" (ex. 1.2) : multiplie les dégâts finaux (docs/degats.md §4,
  //    multiplicatif avec les autres multiplicateurs). Ex. Pourpre 1.1, Nébuleux 1.05 ou 1.2.
  "objets": {
    "imposes": [23237],
    "interdits": [],
    "effets_conditionnels": { "23237": { "allDamageBonus": 64 } }
  },

  // 5 bis. Mode critique, optionnel (défaut "non") :
  //    "oui"  → stuff critique : contrainte STRICTE Critique ≥ 100 − (plus petit % de critique de base des sorts
  //             de degats.sorts qui peuvent critiquer), pour être à 100 % de critique sur tous ces sorts ;
  //    "non"  → pas de seuil ; le critique compte pour ce qu'il rapporte (probabilité × gain du jet critique) ;
  //    "auto" → l'optimiseur fait les deux recherches et présente le meilleur stuff de chaque mode.
  "critique": "non",

  // 6. Forgemagie (docs/forgemagie.md), optionnel. Par défaut : exos et transcendance activés, Dracorunes
  //    désactivées. Mettre false / true selon ce que l'utilisateur veut (ou peut) forgemager.
  "forgemagie": { "exo_pa": true, "exo_pm": true, "transcendance": true, "dracorunes": false },

  // 7. Justification lisible (analyse des sorts, choix faits avec l'utilisateur).
  "analyse": "…"
}
```

## Valeurs autorisées

### `degats.sorts[].type`

| Valeur | Usage | Bonus spécifiques appliqués |
|---|---|---|
| `sort` | sort lancé directement | % Dommages sorts |
| `piege` | dégâts d'un piège | % Dommages sorts + Puissance pièges + Dommages pièges (docs/degats.md) |
| `glyphe` | dégâts d'un glyphe | comme `sort` |
| `rune` | dégâts d'une rune | comme `sort` |
| `arme` | coup d'arme | % Dommages armes (au lieu de % sorts) |
| `poison` | dégâts sur la durée (poison de sort, de piège, Dofus Ébène) | comme `sort` (même formule) ; **jamais** de bonus pièges, même pour le poison d'un piège |

### `degats.sorts[].portee`

`melee` (cible au contact) ou `distance` : choisit le % Dommages mêlée ou distance (docs/degats.md §4).
Pour un piège, c'est la position de la cible **par rapport au lanceur au moment où le piège se déclenche** :
le profilage choisit la valeur la plus représentative de la façon de jouer (en général `distance`).

### Sorts de zone

Le format n'a pas de champ de zone : un sort dont les dégâts varient selon la case (zones à plusieurs anneaux,
cibles à distance du centre) est découpé en **une ligne par cas joué** (le nom précise le cas, ex.
« Piège à Fragmentation - cible à 3 cases, cercle »). La réduction de zone (docs/degats.md §5,
`(10 − éloignement) / 10`) est reportée dans le **`poids`** : poids = part d'utilisation × facteur de réduction
(ex. 1 × 0,7 pour une cible à 3 cases). C'est exact car la réduction multiplie les dégâts finaux.

### `objets.effets_conditionnels`

Par id d'objet, des clés parmi :

| Clé | Sens | Exemple |
|---|---|---|
| `keyword` d'une caractéristique | bonus ajouté au total | Domakuro `{ "allDamageBonus": 64 }` |
| `multiplicateur_final` | multiplicateur de dommages finaux (docs/degats.md §4) | Pourpre `1.10`, Nébuleux `1.20` ou `1.05` |
| `puissance_par_pm` | Puissance × PM finaux du stuff | Sylvestre `16` (8 × 2 tours) |
| `pm_contrainte` | PM ajoutés pour la seule contrainte de PM | Abyssal `1` |
| `soin_pv_pct` | soin unique en % des PV finaux : score += (poids `vitality` + poids `hitPoints`) × PV × % / 100 ; ne compte pas pour une contrainte de PV | Argenté Scintillant `30` |

Un objet de `effets_conditionnels` peut être imposé ou non (docs/dofus-speciaux.md) : non imposé, l'optimiseur
l'essaie toujours et ne compte son effet que s'il le retient.

## Score d'un stuff

```
score = Σ poids_sort × dégât_moyen(sort, stats finales)          (formule docs/degats.md)
      + Σ poids_bonus × valeur(caractéristique)                   (après plafonds)
      − Σ penalite × points manquants (contraintes non strictes)
Résistances distance / mêlée (receivedDamageMultiplierDistance / Melee, ex. malus −6 % de l'Arcaniste) : sans
poids explicite dans bonus, chacune vaut 0,25 × Σ poids des 5 résistances élémentaires (avec ≈ 50 % de
résistances élémentaires, 1 % de rés. distance ≈ 0,5 % de rés. tous éléments sur la moitié des attaques reçues).
La répartition des points fait partie de la recherche : le score d'un stuff est celui de sa meilleure répartition.
stuff invalide si une contrainte stricte, une règle de docs/stuff.md ou une condition d'objet n'est pas respectée
```

## Implémentation

- `src/evaluation.js` : total final (objets à jets max, panoplies, effets conditionnels, plafonds), conditions
  d'équipement (`evalCriterion`, codes non gérés — quêtes, métiers… — supposés respectés avec avertissement),
  dégâts moyens exacts par ligne (moyenne sur tous les jets entiers, arrondis de docs/degats.md), score.
- Répartition des points `auto` : `bestPoints`, **heuristique gloutonne** (minimums imposés par la cible et par
  les conditions simples des objets, puis meilleur gain de score par point dépensé, pas de 5 / 20 / 50).
- `npm run evaluate -- cibles/<nom>.json (--stuff stuff.json | --seed N) [--points auto|fichier] [--publish]`.
- Optimiseur (`src/optimiseur.js`, `npm run optimise`) : recherche locale, candidats classés par valeur
  linéaire (gradient du score) **+ gain de palier de panoplie** ; mouvements « panoplie » (2..8 objets d'un coup,
  estimation incluant le palier), avec variante sans trophées `pk<2` pour autoriser plusieurs panoplies ;
  20 redémarrages ; 3 propositions à moins de 3 % du meilleur. Non exhaustif : le résultat dépend de `--seed`.
  Multi-cœurs (`src/optimiseur-parallele.js`) : les redémarrages sont répartis entre `--workers` chaînes
  indépendantes (défaut : nombre de cœurs ; graine dérivée par chaîne), dont les solutions sont fusionnées ;
  le résultat dépend donc aussi de `--workers` (`--workers 1` = recherche mono-thread d'origine).
- Forgemagie (`src/forgemagie.js`) : à chaque passe, l'optimiseur essaie tous les placements d'exo PA / PM
  sur les anneaux, puis retient pour chaque objet transcendable la meilleure rune (3 meilleures selon le
  gradient, évaluées exactement) et, si activées, les meilleures Dracorunes (combinées à la transcendance) ;
  les candidats sont évalués avec une forgemagie adaptée. Les Dracorunes triplent environ la durée de recherche. Sortie :
  `resultats/<nom>-<n>.forgemagie.json` (`{ "<itemId>": { "exo"?: …, "trans"?: { stat, taille, value }, "draco"?: { rune, from?, to? } } }`).
- Tests : `npm test` (exemples chiffrés des guides, règles de forgemagie).
