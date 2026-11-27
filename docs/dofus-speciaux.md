# Dofus à effets conditionnels

Certains Dofus ont, en plus de leurs caractéristiques fixes (présentes en base), un **effet conditionnel ou
cumulable** que la base ne décrit pas (ligne d'effet vide dans `item_effects`). Source : l'utilisateur (2026-11-27).

## Règle

- Pendant le profilage, Claude **propose** ces Dofus à l'utilisateur, avec leur condition de jeu.
- S'il les accepte, leur effet est converti en **bonus équivalents** (`objets.effets_conditionnels`, clés
  définies dans `docs/config-cible.md`) et ils sont, au choix de l'utilisateur :
  - **imposés** (`objets.imposes`) : toujours portés ;
  - ou seulement **valorisés** : l'optimiseur les essaie toujours et compte leur effet quand il les retient
    (ex. Argenté Scintillant, ajouté le 2026-11-27 pour qu'il soit comparé à ses concurrents à sa juste valeur).
- Sinon, ils ne sont considérés que pour leurs caractéristiques fixes.
- On retient toujours le **cumul maximal** de l'effet.
- Seuls ces 8 Dofus sont traités (les plus importants ; d'autres objets similaires existent peut-être).

## Liste

| id | Dofus | Fixe (base) | Effet conditionnel | Modélisation proposée |
|---|---|---|---|---|
| 23237 | Domakuro | +1 Invocation | jusqu'à **+64 Dommages** si le porteur ne subit aucun dommage pendant 4 tours | `allDamageBonus: +64` |
| 29136 | Dofus Sylvestre | +2 Portée | +8 Puissance par PM utilisé, pendant 2 tours, sans maximum | `puissance_par_pm: 16`, soit +8 × PM × 2 (tous les PM utilisés sur les 2 tours : +96 avec 6 PM) ; dépend des PM du stuff, recalculé par l'optimiseur pour chaque stuff |
| 7115 | Dofus Ivoire | +4 % rés. tous éléments | 1 attaque reçue sur 5 réduite de 50 % | défensif (≈ −10 % de dégâts subis) |
| 694 | Dofus Pourpre | +80 Puissance | attaqué → +1 % dommages finaux 2 tours, cumulable 10 fois | `multiplicateur_final: 1.10` (docs/degats.md §4) |
| 7114 | Dofus Ébène | +40 Fuite | attaque mêlée → +2 % dommages distance ; attaque distance → +2 % dommages mêlée ; 3 tours, cumulable 5 fois. Les 2 dans le tour → poison 16 dans l'élément 2 tours (cumulable 2, relance 2 tours) | +10 % distance et +10 % mêlée (somme des %, docs/degats.md §4) ; poison = ligne de dégâts supplémentaire de 16 dans l'élément (type `poison` dans `degats.sorts`). À **proposer seulement si la classe alterne mêlée et distance** |
| 18043 | Dofus Abyssal | — | début de tour : +1 PM si aucun ennemi au contact, sinon +1 PA | `pm_contrainte: 1` : +1 PM pour la contrainte PM (6 PM avec 5 PM de stuff) |
| 8698 | Dofus Nébuleux | — | tours impairs : −10 % soins finaux, **+20 % dommages finaux** ; tours pairs : **−10 % dommages finaux**, +20 % soins finaux | multiplicateur final (docs/degats.md §4) : choix posé à l'utilisateur au profilage : ×1,05 en moyenne (×1,20 / ×0,90) ou ×1,20 si la rotation concentre les dégâts sur les tours impairs (`multiplicateur_final`) ; soins ignorés |
| 20286 | Dofus Argenté Scintillant | +300 Vitalité | passage sous 20 % de PV → soigné de 30 % de ses PV, et +20 % dommages finaux pendant 1 tour au début du tour suivant ; 1 fois par combat | `soin_pv_pct: 30` (PV effectifs : 30 % des PV valorisés au poids de la Vitalité, hors contrainte de PV) + `multiplicateur_final: 1.02` (+20 % sur 1 tour d'un combat de référence de 10 tours) |
