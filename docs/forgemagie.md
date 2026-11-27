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

- Objets éligibles : **tous les équipements sauf Dofus, trophées et Prysmaradites** (familiers et montures compris),
  soit les 10 emplacements hors Dofus.
- **Une transcendance par objet**, sans autre limite : au plus 10 par stuff (moins les anneaux exo PA / PM).
- On suppose toujours la **taille la plus forte applicable** : Ra TA si le seuil le permet, sinon Pa TA, sinon TA.
- **À gain égal, préférer les % Dommages sorts** (validé avec l'utilisateur, 2026-11-27) : ex. pièges posés à
  distance, où % sorts et % distance s'additionnent et valent autant ; les % sorts restent utiles au contact.
  Sauf contre-indication de l'utilisateur. Implémentation : ordre des caractéristiques dans `RUNES`
  (`src/forgemagie.js`), l'optimiseur gardant la première rune à valeur égale.
