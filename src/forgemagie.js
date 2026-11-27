// Forgemagie limitée : exo PA, exo PM, runes de transcendance (docs/forgemagie.md).
//
// Format interne (et fichier resultats/<nom>-<n>.forgemagie.json), par id d'objet :
//   { "<itemId>": { "exo": "actionPoints" | "movementPoints" } }
//   { "<itemId>": { "trans": { "stat": "<keyword>", "taille": "TA" | "Pa" | "Ra", "value": <bonus> } } }
// Simplification : si les deux anneaux sont le même objet, aucune forgemagie sur les anneaux
// (le format par id ne distingue pas les deux exemplaires).

import { SLOTS } from './stuff.js';

const DENSITES = { TA: 40, Pa: 60, Ra: 80 };
const TAILLES = ['Ra', 'Pa', 'TA']; // de la plus forte à la plus faible

/** Runes de transcendance : caractéristique → poids et valeur par taille (null = taille inexistante). */
export const RUNES = Object.fromEntries([
  [['agility', 'chance', 'intelligence', 'strength'], 1, [10, 15, 20]],
  [['vitality'], 0.2, [50, 75, 100]],
  [['initiative'], 0.1, [100, 150, 200]],
  [['damagePercent'], 2, [6, 9, 12]],
  [['earthElementResistPercent', 'fireElementResistPercent', 'waterElementResistPercent',
    'airElementResistPercent', 'neutralElementResistPercent'], 6, [1, 2, null]],
  [['pushDamageReduction', 'criticalDamageReduction'], 2, [6, 9, 12]],
  [['apReduction', 'mpReduction'], 7, [2, 3, 4]],
  [['DodgeApLostProbability', 'DodgeMpLostProbability'], 7, [2, 4, 6]],
  [['weight'], 0.25, [100, 200, 400]],
  [['tackleBlock', 'tackleEvade'], 4, [4, 6, 8]],
  [['earthDamageBonus', 'fireDamageBonus', 'waterDamageBonus', 'airDamageBonus', 'neutralDamageBonus'], 5, [2, 4, 6]],
  [['criticalDamageBonus', 'pushDamageBonus'], 5, [4, 6, 8]],
  [['healBonus'], 10, [4, 7, 10]],
  [['criticalHit'], 10, [1, 2, null]],
  // Ordre = préférence à gain égal (l'optimiseur garde la première) : % sorts en tête, car ils restent utiles
  // quelle que soit la position de la cible (docs/forgemagie.md).
  [['dealtDamageMultiplierSpells', 'dealtDamageMultiplierDistance', 'dealtDamageMultiplierMelee',
    'dealtDamageMultiplierWeapon', 'receivedDamageMultiplierMelee', 'receivedDamageMultiplierDistance'], 15, [1, null, null]],
].flatMap(([keywords, poids, [TA, Pa, Ra]]) => keywords.map((k) => [k, { poids, valeurs: { TA, Pa, Ra } }])));

/** Emplacements dont les objets sont transcendables (tout sauf Dofus / trophées / Prysmaradites). */
export const TRANS_SLOTS = Object.keys(SLOTS).filter((s) => s !== 'dofus');

/** Rune la plus forte applicable sur un objet pour une caractéristique, ou null. */
export function bestRune(item, stat) {
  const r = RUNES[stat];
  if (!r) return null;
  const existing = item.stats[stat] ?? 0;
  for (const taille of TAILLES) {
    const value = r.valeurs[taille];
    if (value != null && existing * r.poids + DENSITES[taille] <= 101) return { stat, taille, value };
  }
  return null;
}

/** Options de forgemagie de la cible (tout activé par défaut). */
export const options = (cible) => ({ exo_pa: true, exo_pm: true, transcendance: true, ...(cible.forgemagie ?? {}) });

/** Positions des objets du stuff : [{ slot, item }]. */
const placed = (stuff) => Object.entries(stuff).filter(([s]) => SLOTS[s])
  .flatMap(([slot, v]) => [v].flat().filter(Boolean).map((item) => ({ slot, item })));

/** Bonus de caractéristiques apportés par la forgemagie. */
export function forgemagieStats(fm) {
  const stats = {};
  for (const f of Object.values(fm ?? {})) {
    if (f.exo) stats[f.exo] = (stats[f.exo] ?? 0) + 1;
    if (f.trans) stats[f.trans.stat] = (stats[f.trans.stat] ?? 0) + f.trans.value;
  }
  return stats;
}

/** Vérifie la forgemagie d'un stuff (docs/forgemagie.md). @returns {string[]} erreurs */
export function validateForgemagie(fm, stuff, cible = {}) {
  const errors = [];
  const opt = options(cible);
  const pos = placed(stuff);
  const rings = (stuff.rings ?? []).filter(Boolean);
  const sameRings = rings.length === 2 && rings[0].id === rings[1].id;
  const exoCount = { actionPoints: 0, movementPoints: 0 };
  for (const [id, f] of Object.entries(fm ?? {})) {
    const p = pos.find((x) => x.item.id === Number(id));
    if (!p) { errors.push(`forgemagie sur un objet absent : ${id}`); continue; }
    const name = p.item.name;
    if (p.slot === 'rings' && sameRings) errors.push(`${name} : forgemagie impossible sur deux anneaux identiques`);
    if (f.exo && f.trans) errors.push(`${name} : exo et transcendance sur le même objet`);
    if (f.exo) {
      if (!['actionPoints', 'movementPoints'].includes(f.exo)) errors.push(`${name} : exo ${f.exo} non géré`);
      if (p.slot !== 'rings') errors.push(`${name} : exo hors anneau`);
      if ((p.item.stats[f.exo] ?? 0) > 0) errors.push(`${name} : exo ${f.exo} sur un anneau qui en a déjà`);
      if ((f.exo === 'actionPoints' && !opt.exo_pa) || (f.exo === 'movementPoints' && !opt.exo_pm)) errors.push(`${name} : exo ${f.exo} désactivé par la cible`);
      exoCount[f.exo] = (exoCount[f.exo] ?? 0) + 1;
    }
    if (f.trans) {
      if (!opt.transcendance) errors.push(`${name} : transcendance désactivée par la cible`);
      if (!TRANS_SLOTS.includes(p.slot)) errors.push(`${name} : transcendance impossible sur ce type d'objet`);
      const best = bestRune(p.item, f.trans.stat);
      if (!best || best.taille !== f.trans.taille || best.value !== f.trans.value) {
        errors.push(`${name} : rune ${f.trans.taille} ${f.trans.stat} non applicable (attendu ${best ? `${best.taille} +${best.value}` : 'aucune'})`);
      }
    }
  }
  if (exoCount.actionPoints > 1) errors.push('plus d\'un exo PA');
  if (exoCount.movementPoints > 1) errors.push('plus d\'un exo PM');
  return errors;
}

/** Format de publication DofusDB du projet (src/dofusdb-publish.js, toDofusDbForgemagie). */
export function toPublishFormat(fm, stuff) {
  const out = {};
  for (const [id, f] of Object.entries(fm ?? {})) {
    const item = placed(stuff).find((x) => x.item.id === Number(id))?.item;
    if (!item) continue;
    out[id] = { stats: {}, exos: [] };
    // Rune sur une caractéristique que l'objet a déjà → nouvelle valeur dans stats ; sinon la caractéristique
    // est ajoutée : DofusDB ne l'affiche que déclarée en exo (stats ne couvre que les lignes de l'objet).
    if (f.trans) {
      if (item.stats[f.trans.stat]) out[id].stats[f.trans.stat] = item.stats[f.trans.stat] + f.trans.value;
      else out[id].exos.push({ stat: f.trans.stat, value: f.trans.value });
    }
    if (f.exo) out[id].exos.push({ stat: f.exo, value: 1 });
  }
  return out;
}

/** Description lisible. */
export function describe(fm, stuff) {
  return Object.entries(fm ?? {}).map(([id, f]) => {
    const item = placed(stuff).find((x) => x.item.id === Number(id))?.item;
    const name = item?.name ?? `#${id}`;
    if (f.exo) return `${name} : exo +1 ${f.exo === 'actionPoints' ? 'PA' : 'PM'}`;
    return `${name} : rune ${f.trans.taille === 'TA' ? 'TA' : `${f.trans.taille} TA`} ${f.trans.stat} +${f.trans.value}`;
  });
}
