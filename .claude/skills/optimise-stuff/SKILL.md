---
name: optimise-stuff
description: Cherche les meilleurs stuffs Dofus pour une cible (cibles/<nom>.json) et présente jusqu'à 3 propositions de score équivalent, avec analyse et publication DofusDB sur demande. À utiliser quand l'utilisateur veut « le meilleur stuff », « optimiser », « générer le stuff » pour un personnage ou une cible ; si aucune cible n'existe encore, enchaîner d'abord avec la skill profil-stuff.
---

# Optimisation d'un stuff → propositions

Enchaîne : cible → vérification → optimiseur → analyse → (publication) → ajustements.
Références : `docs/config-cible.md` (format, score, implémentation), `docs/roadmap.md`.

## Règles

- Ne jamais appeler l'API DofusDB directement ; seule la publication passe par `--publish` (compte de l'utilisateur).
- **Publier uniquement si l'utilisateur le demande ou l'accepte** : c'est une action sur son compte DofusDB.
- Ne pas modifier une cible sans l'accord de l'utilisateur ; toute modification repasse par `npm run check-cibles`.

## Étapes

### 1. Trouver la cible
- L'utilisateur nomme une cible ou un personnage : chercher dans `cibles/` (`ls cibles/`).
- Aucune cible ne correspond → lancer la skill **profil-stuff** pour la créer, puis revenir ici.
- Plusieurs candidates → demander laquelle.

### 2. Vérifier
`npm run check-cibles -- cibles/<nom>.json` ; en cas d'erreur, corriger avec l'utilisateur avant d'optimiser.

### 3. Optimiser
`npm run optimise -- cibles/<nom>.json` (Bash, timeout 600000 : compter 1 à 2 minutes).
La recherche n'est pas exhaustive et dépend de `--seed` : pour un résultat important, lancer 2 ou 3 seeds
et garder le meilleur (les fichiers `resultats/` sont écrasés à chaque lancement : noter les scores).
Options : `--restarts N` (défaut 20 ; plus = plus long, meilleur), `--seed N` (autre exploration), `--ecart 0.05`
(propositions jusqu'à 5 % du meilleur), `--workers N` (chaînes en parallèle, défaut : nombre de cœurs).
Résultats : `resultats/<nom>-<n>.json` + `.points.json` + `.forgemagie.json` (exo PA / PM, runes de
transcendance, Dracorunes si activées, `docs/forgemagie.md`) ; le script affiche un comparatif
puis le détail de chaque proposition.

### 4. Présenter (réponse courte, chiffres à l'appui)
- Tableau des propositions : score, part dégâts / bonus / pénalités, PA / PM / PO.
- Ce qui distingue chaque proposition (objets qui changent, ex. « #2 : plus de dégâts, moins de résistances »).
- Répartition des points retenue et forgemagie (anneaux exo, runes de transcendance).
- **Signaler** :
  - un déséquilibre dû aux poids de la cible (ex. bonus défensif ≫ dégâts) ;
  - les compromis pris (contrainte non stricte non atteinte → pénalité) ;
  - les avertissements « condition non évaluable » (objet supposé équipable : à vérifier en jeu) ;
  - aucune proposition valide → dire quelle règle bloque (souvent une contrainte stricte).

### 5. Publier (si demandé)
Relancer avec `--publish` seulement si nécessaire ; sinon, pour une proposition déjà calculée :
`npm run evaluate -- cibles/<nom>.json --stuff resultats/<nom>-<n>.json --points resultats/<nom>-<n>.points.json --forgemagie resultats/<nom>-<n>.forgemagie.json --publish`
Donner les liens `https://dofusdb.fr/fr/tools/stuff/<id>` obtenus.

### 6. Ajuster
Proposer les leviers pertinents et relancer après accord :
- poids de `bonus` (offensif ↔ défensif), `poids` des sorts (rotation) ;
- contraintes (strict ↔ compromis, pénalité) ; mode `critique` (`oui` / `non` / `auto` : `auto` lance les deux
  recherches, résultats `resultats/<nom>-critique-<n>` et `-non-critique-<n>`, temps doublé) ;
- forgemagie (`forgemagie.exo_pa / exo_pm / transcendance` à false si l'utilisateur ne veut pas ;
  `forgemagie.dracorunes` à true pour autoriser les Dracorunes, désactivées par défaut — recherche ~3× plus longue) ;
- objets imposés / interdits (ex. l'utilisateur n'a pas tel Dofus) ;
- paramètres de recherche (`--restarts`, `--seed`, `--ecart`).
Toute modification de cible : éditer `cibles/<nom>.json`, `npm run check-cibles`, puis retour à l'étape 3.
