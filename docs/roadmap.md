# Feuille de route

Le projet avance par étapes validées une à une par l'utilisateur. Ne pas implémenter une étape future sans accord.

## Fait

1. Définition d'un stuff → `docs/stuff.md`
2. Stuff aléatoire valide + publication DofusDB → `npm run random -- --publish`
3. Définition du personnage → `docs/personnage.md`

## En cours

4. Profil de stuff piloté par Claude :
   - 4a. Formule de dégâts → `docs/degats.md` (validée)
   - 4b. Format du fichier de configuration (cible) → `docs/config-cible.md` (validé),
     Dofus à effets conditionnels → `docs/dofus-speciaux.md` (validé)
   - 4c. MCP d'accès aux classes/sorts (base locale) → `mcp/server.js` (fait, à valider sur un cas réel)
   - 4d. Procédure de profilage : Claude analyse la classe via le MCP, **vérifie avec l'utilisateur** les seuils
     et les compromis acceptés, puis écrit le fichier de configuration → skill `.claude/skills/profil-stuff`
     (première version, à tester)
   - Seuils par défaut (sauf exception, à confirmer à chaque fois avec l'utilisateur) :
     **12 PA, 6 PM, +6 Portée** (Portée = bonus total apporté par le stuff).
   - Exemple d'analyse : si aucun sort majeur n'a de portée modifiable, la Portée est inutile.
   - Les invocations ne sont **pas** prises en compte dans l'analyse (décision utilisateur).

5. Évaluation d'un stuff pour une cible (total final, conditions, dégâts, score, répartition des points
   heuristique) → `src/evaluation.js`, `npm run evaluate`, `npm test` (à valider)

6. Optimiseur : recherche locale guidée par le gradient du score + mouvements panoplie + redémarrages,
   jusqu'à 3 propositions à moins de 3 % du meilleur score → `src/optimiseur.js`, `npm run optimise`,
   résultats dans `resultats/<nom>-<n>.json`, orchestré par la skill `optimise-stuff` (à valider)

7. Forgemagie (exo PA, exo PM, runes de transcendance) → règles `docs/forgemagie.md` (validées),
   publication DofusDB `--forgemagie` (testée), intégrée à l'évaluation et à l'optimiseur (à valider) ;
   Dracorunes (désactivées par défaut) intégrées, publication par la forgemagie (lignes converties à 0,
   lignes créées en exos) : à vérifier sur DofusDB

## Idées notées (non planifiées)

(aucune)
