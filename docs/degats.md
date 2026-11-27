# Calcul des dégâts

Source : guides fournis par l'utilisateur, validé le 2026-11-27.

## 1. Jet

- Le jeu détermine d'abord s'il y a coup critique, puis tire le jet **uniformément** dans la fourchette correspondante
  (normale ou critique). En base : `spell_effects.dice_num` (min) et `dice_side` (max, 0 si fixe), `critical` = 0/1.
- Exceptions de combat (Poisse → jet min, Brokle → jet max) : hors périmètre.

## 2. Dégâts bruts (lanceur)

```
Multiplicateur = (100 + Caractéristique + Puissance) / 100
Fixe           = Dommages + Dommages élémentaires (+ Dommages critiques si coup critique)
Dégâts bruts   = ⌊ Multiplicateur × Jet + Fixe ⌋
```

| Élément du sort | Caractéristique | Dommages élémentaires |
|---|---|---|
| Terre | Force | Dommages Terre |
| Feu | Intelligence | Dommages Feu |
| Eau | Chance | Dommages Eau |
| Air | Agilité | Dommages Air |
| Neutre | Force | Dommages Neutre |

Exemple : Flamiche critique, jet 12, 777 Int, 100 Puissance, 9 Dommages, 78 Dommages Feu, 41 Dommages critiques
→ 9,77 × 12 + 128 = 245,24 → **245**.

## 3. Dégâts subis (résistances de la cible)

```
Bonus fixes   = Résistance fixe élémentaire + Résistance fixe aux sorts (+ Résistance critique si coup critique)
Dégâts subis  = ⌊ max(0, Dégâts bruts − Bonus fixes) × max(0, 100 − Résistance %) / 100 ⌋
```

La résistance fixe s'applique **avant** le pourcentage. Les résistances peuvent être négatives.
Plafond de 50 % de résistance pour un personnage (aucun plafond pour un monstre).

## 4. Dégâts finaux

```
Bonus %       = Dommages sorts % (ou armes %) + Dommages distance % (ou mêlée %) du lanceur
                − Résistance distance % (ou mêlée %) de la cible
Dégâts finaux = Dégâts subis × (100 + Bonus %) / 100 × Π (% de dommages subis / 100)
```

Les % sorts / armes / distance / mêlée (lanceur et cible) **s'additionnent tous** en un seul pourcentage ;
ensuite seulement on applique les % de dommages finaux, qui eux se multiplient.

Une attaque est **mêlée** si la cible est au contact (1 case), **distance** sinon.

Les multiplicateurs (Vulnérabilité, Bouclier Féca…) se **multiplient** entre eux, ils ne s'additionnent pas.

Caractéristiques des objets : lanceur 120 Distance (%), 122 Armes (%), 123 Sorts (%), 125 Mêlée (%) ;
cible 121 Résistance distance (%), 124 Résistance mêlée (%).

## 5. Zone

Même jet pour toutes les cibles de la zone (sauf Brokle). Puis
`Dégâts réels = Dégâts finaux × (10 − Éloignement) / 10`, l'éloignement étant compté depuis la case ciblée.

Exceptions (source : l'utilisateur, 2026-11-27) :
- **Calamité** (Sram) : aucune réduction de zone.
- **Piège à Fragmentation** (Sram) : les lignes en anneau (zones `O1`, `O2`, `O3`) ne sont pas réduites ; la ligne
  en cercle (`C3`) l'est normalement. Ex. cible à 3 cases : 30 × 0,7 + 49 = 70 de jet moyen.

Modélisation dans un fichier cible : une ligne par cible touchée, `poids` multiplié par (10 − Éloignement) / 10
(équivalent exact, la réduction étant un multiplicateur des dégâts finaux).

## Pièges, glyphes, runes, poisons

- **Pièges** : Puissance pièges s'ajoute à la Puissance (multiplicateur) ; Dommages pièges s'ajoutent aux
  Dommages (fixe). Le % Dommages sorts s'applique. Mêlée ou distance selon la position de la cible par rapport
  au lanceur **au moment où le piège se déclenche**.
- **Glyphes, runes** : comme un sort.
- **Poisons** : même formule qu'un sort ; **pas** de bonus pièges, y compris pour le poison d'un piège.

Formule pièges :

```
Multiplicateur = (100 + Caractéristique + Puissance + Puissance pièges) / 100
Fixe           = Dommages + Dommages élémentaires + Dommages pièges
```

## Dommages de poussée

Source : article de la mise à jour 2.17 fourni par l'utilisateur, **toujours valable**. Formule **déterministe**.
Seuls interviennent le niveau, les **Dommages poussée** du lanceur et la **Résistance poussée** de la cible :
aucune caractéristique, Puissance, Dommages, % de dommages finaux (§4) ni autre résistance ne s'applique.

```
1re cible       : (Niveau / 2 + Dommages poussée − Résistance poussée de la cible + 32) × Cases / 4
cible suivante  : même formule avec la résistance poussée de cette cible, × Cases / 8 (puis ÷ 2 à chaque cible suivante)
```

- `Cases` = nombre de cases de poussée restantes au moment du choc (cases que la cible aurait dû parcourir sans obstacle).
- Au niveau 200 : (132 + Dommages poussée − Résistance poussée) × Cases / 4.
  → 1 point de Dommages poussée vaut Cases / 4 dégâts (0,25 pour 1 case, 1 pour 4 cases).

## Hors calcul

- **Vol de vie** : ignoré (ne change pas les dégâts).

## Points ouverts

Aucun.
