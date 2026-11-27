# Définition du personnage

Règles validées avec l'utilisateur (étape 3, 2026-11-27). Toute règle absente de ce document n'est **pas**
prise en compte ; ne pas en inventer sans validation. Voir aussi `docs/stuff.md`.

## Classe

- La classe **n'influe pas** sur les caractéristiques ni sur la validité d'un stuff.
- Elle oriente l'**objectif** de la recherche (étape future) : élément(s) mono/multi, stuff critique ou non,
  Puissance ou dommages fixes.
- Les objets de classe sont exclus (voir `docs/stuff.md`).

## Niveau et base

Tous les personnages sont **niveau 200**.

| Caractéristique | Base |
|---|---|
| PA | 7 |
| PM | 3 |
| Vie | 1050 |

## Points de caractéristiques

**995 points** à répartir. Coût en points pour +1 :

| Caractéristique | Coût |
|---|---|
| Vitalité | 1 |
| Sagesse | 3 |
| Force, Intelligence, Chance, Agilité | 1 de 0 à 100 ; 2 de 101 à 200 ; 3 de 201 à 300 ; 4 au-delà de 300 |

Les paliers se calculent **uniquement sur les points investis** (ni les parchemins ni le stuff ne les font monter).
Exemple : 995 points en Agilité → 100 + 100 + 100 + 173 = +473 Agilité.

## Parchemins

Personnage **entièrement parchotté** : +100 en Vitalité, Sagesse, Force, Intelligence, Chance et Agilité.

## Autres sources

Aucune. Total final = base + points investis + parchemins + objets du stuff + bonus de panoplie.

## Caractéristiques dérivées

- **Sagesse** (validé le 2026-11-27) : chaque tranche de 10 points de Sagesse totale (base + parchemin + stuff,
  arrondi inférieur) donne **+1 Retrait PA, +1 Retrait PM, +1 Esquive PA, +1 Esquive PM**.
  Ex. 100 de parchemin + 150 de stuff = 250 Sagesse → +25 Retrait PM.

## Plafonds

| Caractéristique | Maximum |
|---|---|
| PA | 12 |
| PM | 12 |
| % Critique | 100 |
| % Résistance | 50 |

- Le plafond de % Résistance s'applique **à chaque élément séparément** (Terre, Feu, Eau, Air, Neutre).
- Conditions d'équipement et plafonds : une condition `CP<12` est fausse dès que le total atteint 12 PA
  (ex. Cape des Justiciers non équipable à 12 PA). Toutes les conditions de plafond PA/PM des données ont un seuil
  ≤ 12, donc comparer le total brut ou plafonné donne le même résultat.
- **Pas d'astuce d'ordre d'équipement** : les conditions se vérifient toujours sur le total final du stuff complet
  (objet porteur compris). La limite PA/PM imposée par une condition est absolue.
