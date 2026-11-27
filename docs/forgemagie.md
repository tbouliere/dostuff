# Forgemagie

Validé avec l'utilisateur (2026-11-27). Périmètre volontairement limité : **exo PA, exo PM, runes de transcendance**.
Le reste de la forgemagie (overs, jets modifiés, autres exos) n'est pas traité : les objets restent à jets max.

## Exo PA / exo PM

- **Un seul exo PA et un seul exo PM par stuff**.
- Faits **sur les anneaux** (exception éventuelle : donnée par l'utilisateur).
- Possible seulement si l'anneau **n'a pas déjà** de PA (resp. de PM).
- Un objet exotique ne peut plus recevoir de rune de transcendance (voir ci-dessous).
- Exo PA et exo PM sur **deux anneaux différents** (pas les deux sur le même anneau).

## Runes de transcendance

Source : tableau fourni par l'utilisateur (valeur actuelle quand il indique « ancienne ➔ nouvelle ») ;
règle de seuil vérifiée sur toutes ses lignes et identique à celle du site DofusDB.

### Règle d'application

```
valeur existante de la caractéristique sur l'objet × poids + densité de la rune ≤ 101
densité : TA 40, Pa TA 60, Ra TA 80   →   seuil = ⌊(101 − densité) / poids⌋
```

- L'objet ne doit avoir **ni exo ni over** (jet parfait accepté) → incompatible avec un anneau exo PA/PM.
- La rune **verrouille** l'objet : une seule transcendance par objet.
- Valeur existante = valeur de la caractéristique sur l'objet (jet max ici), 0 si l'objet ne l'a pas.

### Runes

| Rune | Caractéristique(s) (`keyword`) | Poids | Valeur TA / Pa / Ra | Seuil TA / Pa / Ra |
|---|---|---|---|---|
| Age, Cha, Ine, Fo | agility, chance, intelligence, strength | 1 | 10 / 15 / 20 | 61 / 41 / 21 |
| Vi | vitality | 0,2 | 50 / 75 / 100 | 305 / 205 / 105 |
| Ini | initiative | 0,1 | 100 / 150 / 200 | 610 / 410 / 210 |
| Pui | damagePercent | 2 | 6 / 9 / 12 | 30 / 20 / 10 |
| Ré Per (élément) | earth/fire/water/air/neutralElementResistPercent | 6 | 1 / 2 / — | 10 / 6 / — |
| Ré Pou | pushDamageReduction | 2 | 6 / 9 / 12 | 30 / 20 / 10 |
| Ré Cri | criticalDamageReduction | 2 | 6 / 9 / 12 | 30 / 20 / 10 |
| Ret PA / Ret PM | apReduction, mpReduction | 7 | 2 / 3 / 4 | 8 / 5 / 3 |
| Ré PA / Ré PM | DodgeApLostProbability, DodgeMpLostProbability | 7 | 2 / 4 / 6 | 8 / 5 / 3 |
| Pod | weight | 0,25 | 100 / 200 / 400 | 244 / 164 / 84 |
| Tac, Fui | tackleBlock, tackleEvade | 4 | 4 / 6 / 8 | 15 / 10 / 5 |
| Do (élément) | earth/fire/water/air/neutralDamageBonus | 5 | 2 / 4 / 6 | 12 / 8 / 4 |
| Do Cri, Do Pou | criticalDamageBonus, pushDamageBonus | 5 | 4 / 6 / 8 | 12 / 8 / 4 |
| So | healBonus | 10 | 4 / 7 / 10 | 6 / 4 / 2 |
| Cri | criticalHit | 10 | 1 / 2 / — | 6 / 4 / — |
| Do Per Mé/Di/Ar/So, Ré Per Mé/Di | dealtDamageMultiplierMelee/Distance/Weapon/Spells, receivedDamageMultiplierMelee/Distance | 15 | 1 / — / — | 4 / — / — |

(— : la rune n'existe pas dans cette taille.) Pas de rune de transcendance PA, PM ou Portée.

### Hypothèses retenues

- Objets éligibles : **tous les équipements sauf Dofus, trophées, Prysmaradites, familiers, montures et
  montiliers** (aucune forgemagie possible sur ces derniers, précisé par l'utilisateur le 2026-11-27),
  soit 9 emplacements.
- **Une transcendance par objet**, sans autre limite : au plus 9 par stuff (moins les anneaux exo PA / PM).
- On suppose toujours la **taille la plus forte applicable** : Ra TA si le seuil le permet, sinon Pa TA, sinon TA.
- **À gain égal, préférer les % Dommages sorts** (validé avec l'utilisateur, 2026-11-27) : ex. pièges posés à
  distance, où % sorts et % distance s'additionnent et valent autant ; les % sorts restent utiles au contact.
  Sauf contre-indication de l'utilisateur. Implémentation : ordre des caractéristiques dans `RUNES`
  (`src/forgemagie.js`), l'optimiseur gardant la première rune à valeur égale.

## Dracorunes (mise à jour 3.8)

Validé avec l'utilisateur (2026-11-27), sauf mention.

Source : texte officiel fourni par l'utilisateur. Une Dracorune **convertit** des caractéristiques d'un objet.

### Les 6 runes

| Dracorune | Effet |
|---|---|
| Émeraude | ligne élémentaire → **Agilité** (+ dommages associés → Dommages Air) |
| Turquoise | → **Chance** (+ Dommages Eau) |
| Pourpre | → **Intelligence** (+ Dommages Feu) |
| Ocre | → **Force** (+ Dommages Terre) |
| Ivoire | résistances d'un élément (fixes **et** %) → un autre élément au choix, absent de l'objet (hors rés. critiques, poussée, distance, mêlée) |
| Ébène | supprime toutes les caractéristiques élémentaires et dommages élémentaires **positifs** → une ligne Puissance = 70 % de la plus haute caractéristique, une ligne Dommages = 70 % des plus hauts dommages élémentaires |

### Règles

- Runes élémentaires : la caractéristique (Force / Intelligence / Chance / Agilité) **et** les dommages de cet
  élément sont convertis ensemble ; si l'objet n'a que l'un des deux, seul celui-là est converti.
  Impossible de convertir vers un élément **déjà présent** sur l'objet.
- Valeurs négatives : converties par les runes élémentaires et Ivoire ; **conservées telles quelles** par Ébène
  (et ignorées dans son calcul).
- Ébène : 100 Force + 100 Chance → 70 Puissance (pas 140) ; 100 Force, 10 Do Terre, 50 Chance, 5 Do Eau →
  70 Puissance et 7 Dommages.
- **Une seule Dracorune par objet** ; l'objet n'est plus modifiable ensuite.
- Compatible avec un objet transcendé, over ou exo.
- **Neutre jamais touché** : les Dommages Neutre ne sont ni convertis par les runes élémentaires, ni pris en
  compte ou supprimés par l'Ébène.
- Ébène : valeurs **arrondies à l'inférieur** (70 % de 55 → 38).
- Objets éligibles : comme la transcendance (tous les équipements sauf Dofus, trophées, Prysmaradites,
  familiers, montures, montiliers).
- **Ordre** : la transcendance se fait avant (l'objet draconisé n'est plus modifiable) ; la Dracorune convertit
  la ligne **avec** le bonus de transcendance (Force 80 + 20 transcendée → Agilité 100).
- « Déjà présent » s'entend **après** transcendance : une rune de transcendance Agilité sur un objet sans Agilité
  interdit ensuite l'Émeraude sur cet objet.
- Condition de métier (niveau du métier ≥ niveau de l'objet) : ignorée (personnage supposé équipé des métiers).
- L'optimiseur choisit librement la meilleure Dracorune (et la ligne convertie) par objet, avec la transcendance.
- **Désactivées par défaut** : option `"forgemagie": { "dracorunes": true }` dans le fichier de cible pour les activer.
- **[hypothèse]** Ébène : si l'objet a déjà de la Puissance (ou des Dommages), la ligne créée s'y ajoute.

## Matérialisation sur DofusDB

La forgemagie publiée (`--publish`) décrit l'objet final : ses lignes d'origine avec leur valeur finale
(0 si convertie par une Dracorune) et, en **exos**, toutes les lignes absentes de l'objet d'origine
(exo PA / PM, transcendance d'une caractéristique absente, lignes créées par une Dracorune).
