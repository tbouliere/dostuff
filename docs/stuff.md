# Définition d'un stuff

Règles validées avec l'utilisateur (étape 1, 2026-11-27). Toute règle absente de ce document n'est **pas** encore
prise en compte ; ne pas en inventer sans validation. Données : voir `docs/dofusdb-sync.md`.

## Modèle

Un **stuff** associe à chaque emplacement au plus un objet (un emplacement peut rester vide).
Il est **théorique** : on ne stocke que des identifiants d'objets (`items.id`) et on considère les **jets max**
(`item_effects.max`). Exos et forgemagie : hors périmètre pour l'instant.

## Emplacements (16)

| Emplacement | Nb | `item_types.id` acceptés |
|---|---|---|
| Chapeau | 1 | 16 |
| Cape | 1 | 17 |
| Amulette | 1 | 1 |
| Anneau | 2 | 9 |
| Ceinture | 1 | 10 |
| Bottes | 1 | 11 |
| Arme | 1 | 2 Arc, 3 Baguette, 4 Bâton, 5 Dague, 6 Épée, 7 Marteau, 8 Pelle, 19 Hache, 22 Faux, 271 Lance |
| Bouclier | 1 | 82 |
| Familier / monture | 1 | 18 Familier, 121 Montilier, 331 Dragodinde, 332 Muldo, 333 Volkorne |
| Dofus / Trophée / Prysmaradite | 6 | 23 Dofus, 151 Trophée, 217 Prysmaradite |

## Objets exclus

- Type 114 « Arme magique » (Peluches-boules, Boufballe).
- Objets de MJ : nom contenant `(MJ)` (ex. 6894, 6895, 7913), ou condition `PX` (droits d'administration,
  ex. 9031 Annobusé de Maître Jarbo, 9396 Le sceau des Zewouan) : condition jamais satisfaite.
- Objets réservés à un personnage nommé (condition `PN~<pseudo>`) : condition jamais satisfaite.
- Bouclier Fi'Squale (18691).
- Objets de classe :
  - objets ayant au moins un effet de modification de sort (`item_effects.category = 3`) :
    les 19 panoplies de classe (ex. 89 Panoplie Criminelle), 95 objets ;
  - objets dont la condition contient `PG` (classe), ex. 6839 Épée de Yingnitié, 6840 Épée de Yanguru.

## Règles de validité

1. **Niveau** : `items.level` ≤ niveau du personnage.
2. **Anneaux** :
   - un anneau **sans panoplie** (`set_id IS NULL`) peut être porté en double (ex. 24035 Anneau Rtograf) ;
   - un anneau **de panoplie** ne peut être porté qu'en un exemplaire ;
   - deux anneaux **différents** de la même panoplie : autorisé.
3. **Dofus / Trophées / Prysmaradites** : chaque objet est unique (pas de doublon) ;
   **au plus une Prysmaradite** par stuff.
4. **Pas d'incompatibilité entre emplacements** : arme + bouclier toujours possible
   (le champ `two_handed` est ignoré). Aucune limite sur les objets légendaires.
5. **Conditions d'équipement** (`items.criterions`) : expression booléenne (`&`, `|`, parenthèses,
   comparaisons `<`, `>`, `=`, `!`), évaluée sur le **total final** du personnage :
   base + parchemins + **tous** les objets du stuff (y compris l'objet porteur de la condition)
   + bonus de panoplie.
   - `CP` = PA, `CM` = PM ; ex. `CP<12|CM<6` (Cape des Justiciers 14937) : ≤ 11 PA **ou** ≤ 5 PM.
   - Autres codes vus : `CV` Vitalité, `CW` Sagesse, `CS` Force, `CI` Intelligence, `CA` Agilité, `CC` Chance.
   - `pk<2` (73 trophées) : nombre de **panoplies équipées** < 2. Une panoplie est équipée dès que
     **2 objets différents** de cette panoplie sont portés. Donc avec un tel trophée : au plus une panoplie équipée.
   - `PK` (majuscules) : ignoré.
   - Les autres codes (quêtes `Qa`/`Qo`, `PE`, …) ne sont pas traités : supposés respectés, avec avertissement.

## Code

- `src/stuff.js` : emplacements (`SLOTS`), chargement des objets éligibles, `validate()` (règles structurelles + `pk<2`),
  `toDofusDbPayload()`.
- `scripts/random-stuff.js` (`npm run random -- --seed 42 [--json] [--publish]`) : stuff aléatoire valide, avec classe, sexe et répartition de points aléatoires (`src/personnage.js`).
  Écarte les objets à conditions sur les caractéristiques tant que le personnage n'est pas défini.

## Export DofusDB (observé dans le code du site, 2026-11-27)

- Page d'un stuff : `https://dofusdb.fr/fr/tools/stuff/<_id>` ; créateur : `/fr/tools/stuff/creator`.
- Création : `POST https://api.dofusdb.fr/stuffs`, en-tête `Authorization: Bearer <token>` (compte DofusDB requis),
  réponse contenant `_id`. Lecture publique : `GET /stuffs/<_id>`.
- Corps : `{ name, level, shared: "public"|"unreferenced"|"private", items: { amulet, rings: [id, id], boots, helmet, cape, belt, pet, dofus: [6 ids], weapon, shield } }`
  (+ champs optionnels du site : `stats`, `base`, `parchment`, `exo`, `breed`, `sexe`, `forgemagie`…).
- Pas de format « stuff dans l'URL » : un lien nécessite de créer le stuff via l'API.
- Connexion : `POST https://api.dofusdb.fr/authentication` `{ strategy: "local", username, password }` → `accessToken` (JWT avec expiration).
- Implémenté dans `src/dofusdb-publish.js` : identifiants dans `.env` (ignoré par git, modèle `.env.example`),
  reconnexion à chaque publication, jeton jamais écrit sur disque. Usage : `npm run random -- --publish`.
