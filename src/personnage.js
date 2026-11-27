// Définition du personnage — implémente les règles de docs/personnage.md.
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './stuff.js';

export const LEVEL = 200;
export const BASE = { ap: 7, mp: 3, hp: 1050 };
export const CHARAC_POINTS = 995;
export const CAPS = { ap: 12, mp: 12, critPercent: 100, resistPercent: 50 };

/** Caractéristiques répartissables (clés au format DofusDB). */
export const CHARACS = ['vitality', 'wisdom', 'strength', 'intelligence', 'chance', 'agility'];
export const CHARAC_LABELS = {
  vitality: 'Vitalité', wisdom: 'Sagesse', strength: 'Force',
  intelligence: 'Intelligence', chance: 'Chance', agility: 'Agilité',
};
export const PARCHMENT = Object.fromEntries(CHARACS.map((c) => [c, 100]));

/** Coût en points pour passer de `value` à `value + 1`. */
export function pointCost(charac, value) {
  if (charac === 'vitality') return 1;
  if (charac === 'wisdom') return 3;
  if (value < 100) return 1;
  if (value < 200) return 2;
  if (value < 300) return 3;
  return 4;
}

/** Points dépensés pour une répartition { charac: valeur investie }. */
export function spentPoints(base) {
  let total = 0;
  for (const [c, v] of Object.entries(base)) for (let i = 0; i < v; i++) total += pointCost(c, i);
  return total;
}

export function loadBreeds(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare('SELECT id, name FROM breeds ORDER BY id').all();
  } finally {
    db.close();
  }
}

/**
 * Personnage aléatoire : classe, sexe, et répartition des 995 points sur 1 à 3
 * caractéristiques tirées au hasard (+1 à la fois, jusqu'à épuisement).
 * @param {() => number} rand générateur dans [0, 1)
 */
export function randomCharacter(rand, breeds = loadBreeds()) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const pool = [...CHARACS];
  const chosen = [];
  const n = 1 + Math.floor(rand() * 3);
  while (chosen.length < n) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);

  const base = Object.fromEntries(CHARACS.map((c) => [c, 0]));
  let left = CHARAC_POINTS;
  for (;;) {
    const affordable = chosen.filter((c) => pointCost(c, base[c]) <= left);
    if (!affordable.length) break;
    const c = pick(affordable);
    left -= pointCost(c, base[c]);
    base[c]++;
  }
  return {
    level: LEVEL,
    breed: pick(breeds),
    sexe: rand() < 0.5 ? 'male' : 'female',
    base,
    parchment: { ...PARCHMENT },
    unspent: left,
  };
}

/** Champs personnage au format DofusDB (POST /stuffs). */
export const toDofusDbCharacter = (perso) => ({
  level: perso.level,
  breed: perso.breed.id,
  sexe: perso.sexe,
  base: perso.base,
  parchment: perso.parchment,
});
