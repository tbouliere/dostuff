---
name: profil-stuff
description: Génère le fichier de configuration « cible » (cibles/<nom>.json) d'une recherche de stuff Dofus à partir d'une description de personnage en langage naturel (ex. « Sram pièges Air/Eau », « Iop Terre mêlée crit »). Analyse les sorts de la classe via le MCP dofus, valide les seuils et compromis avec l'utilisateur, puis écrit la configuration. À utiliser dès que l'utilisateur décrit un personnage ou un style de jeu pour lequel il veut un stuff.
---

# Profilage d'un stuff → fichier cible

Objectif : transformer une demande (« Sram pièges Air/Eau ») en `cibles/<nom>.json`, au format de
`docs/config-cible.md`, lu ensuite par l'optimiseur.

## Règles

- Données : **uniquement** le MCP `dofus` (`class_spells`, `spell_detail`, `query`). Jamais d'appel à l'API DofusDB.
- Ne rien inventer : toute hypothèse non couverte par les docs est **posée à l'utilisateur**.
- Lire d'abord : `docs/degats.md`, `docs/config-cible.md`, `docs/dofus-speciaux.md`, `docs/personnage.md`.

## Étapes

### 1. Comprendre la demande
Classe, élément(s), mécanique (pièges, glyphes, mêlée, distance, poussée…), rôle. Si un de ces points
est ambigu, demander.

### 2. Analyser les sorts (`class_spells`)
- Retenir les sorts **cohérents avec la demande** (élément, mécanique). Une seule variante par paire :
  choisir la plus pertinente et le dire.
- Pour chaque sort retenu : PA, portée, portée modifiable, lignes de dégâts (jet moyen normal / critique),
  % critique de base, lancers par tour, mêlée ou distance, poussée.
- Ignorer les invocations et le vol de vie (soin).

### 3. En tirer la typologie (justifier chiffres à l'appui, cf. `docs/degats.md`)
- **Puissance ou dommages fixes** : 1 Puissance vaut jet_moyen / 100 ; 1 Dommage vaut 1 par ligne de dégâts.
  Calculer le jet moyen pondéré des sorts retenus → seuil d'équivalence.
- **Critique** : utile seulement si les sorts principaux ont des effets critiques (absent = ne critique pas,
  ex. pièges) ; regarder l'écart normal / critique et le % de base.
- **Portée** : si aucun sort majeur n'a de portée modifiable, la Portée est inutile → le signaler.
- **Mêlée / distance** : quels % de dommages comptent (sorts %, distance %, mêlée %).
- **Spécifiques** : Puissance / Dommages pièges pour les pièges, Dommages poussée si poussées
  (1 Dommage poussée = cases / 4 dégâts), etc.

### 4. Valider avec l'utilisateur (AskUserQuestion)
- **Seuils** : par défaut 12 PA, 6 PM, +6 Portée (Portée = bonus total du stuff). Pour chacun : nécessaire ?
  strict ou compromis accepté (et à quel coût) ? Adapter selon l'analyse (ex. Portée inutile).
- **Dofus à effets conditionnels** (`docs/dofus-speciaux.md`) : proposer ceux qui conviennent, avec leur
  condition de jeu. L'Ébène seulement si la classe alterne mêlée et distance. Acceptés → `objets.effets_conditionnels`
  et, si l'utilisateur veut les porter à coup sûr, `objets.imposes` (cumul maximal), avec **uniquement** les clés listées dans
  `docs/config-cible.md` (« Valeurs autorisées »). Nébuleux : demander l'hypothèse (×1,20 ou ×1,05).
- **Critique** : stuff critique ou non critique (l'entre-deux est rarement bon). Si les sorts de dégâts retenus
  critiquent et que le jet critique / les Dommages critiques valent le coup → proposer `"critique": "oui"`
  (contrainte stricte : 100 % de critique sur ces sorts) ; sinon `"non"` ; en cas de doute `"auto"`
  (l'optimiseur compare les deux).
- **Défensif** : quelle importance donner à la Vitalité et aux résistances (poids de `bonus`). Les résistances
  distance/mêlée sont valorisées automatiquement (`docs/config-cible.md`, « Score d'un stuff ») ; ne les mettre
  dans `bonus` que pour s'écarter de cette valeur par défaut.
- **Poids des sorts** : présenter la rotation supposée (part de chaque sort dans un tour type) et la faire valider.

### 5. Écrire `cibles/<nom>.json`
- Respecter exactement `docs/config-cible.md`, y compris les **valeurs autorisées** (`type`, `portee`, clés
  d'`effets_conditionnels`) ; si un besoin n'y entre pas, le signaler à l'utilisateur au lieu d'inventer une
  valeur. (`points.mode = "auto"`, contraintes, `degats.sorts` avec
  jets réels issus du MCP, `bonus`, `objets`, `analyse`).
- Sorts de zone : une ligne par cas joué, réduction de zone dans le `poids` (section « Sorts de zone » de
  `docs/config-cible.md`).
- `analyse` : résumé des conclusions de l'étape 3 et des choix de l'étape 4.
- **Vérifier** : `npm run check-cibles -- cibles/<nom>.json` (format, valeurs autorisées, ids présents en base).
  Corriger toute erreur et relancer jusqu'à obtenir ✔ ; ne pas terminer sur un fichier non conforme.
- Terminer par un récapitulatif court : sorts retenus, typologie, seuils, Dofus imposés, chemin du fichier.
