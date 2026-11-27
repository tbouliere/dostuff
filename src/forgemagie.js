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

/** Emplacements forgemageables (tout sauf Dofus / trophées / Prysmaradites et familiers / montures / montiliers). */
export const TRANS_SLOTS = Object.keys(SLOTS).filter((s) => s !== 'dofus' && s !== 'pet');

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

/** Options de forgemagie de la cible (exos et transcendance activés, Dracorunes désactivées par défaut). */
export const options = (cible) => ({ exo_pa: true, exo_pm: true, transcendance: true, dracorunes: false, ...(cible.forgemagie ?? {}) });

// ---------------------------------------------------------------------------
// Dracorunes (docs/forgemagie.md)
// ---------------------------------------------------------------------------

const ELEM = {
  Terre: { carac: 'strength', dmg: 'earthDamageBonus', resPct: 'earthElementResistPercent', resFix: 'earthElementReduction' },
  Feu: { carac: 'intelligence', dmg: 'fireDamageBonus', resPct: 'fireElementResistPercent', resFix: 'fireElementReduction' },
  Eau: { carac: 'chance', dmg: 'waterDamageBonus', resPct: 'waterElementResistPercent', resFix: 'waterElementReduction' },
  Air: { carac: 'agility', dmg: 'airDamageBonus', resPct: 'airElementResistPercent', resFix: 'airElementReduction' },
  Neutre: { resPct: 'neutralElementResistPercent', resFix: 'neutralElementReduction' },
};
/** Dracorunes élémentaires → élément cible. */
export const DRACO_ELEMENTS = { Ocre: 'Terre', Pourpre: 'Feu', Turquoise: 'Eau', Emeraude: 'Air' };
const OFFENSIVE = ['Terre', 'Feu', 'Eau', 'Air']; // le Neutre n'est jamais touché

const has = (st, k) => !!k && (st[k] ?? 0) !== 0;
function move(st, from, to, keys) {
  const out = { ...st };
  for (const k of keys) {
    if (!has(st, ELEM[from][k])) continue;
    out[ELEM[to][k]] = st[ELEM[from][k]];
    delete out[ELEM[from][k]];
  }
  return out;
}

/**
 * Applique une Dracorune à des caractéristiques d'objet (après transcendance).
 * d = { rune: 'Ocre'|'Pourpre'|'Turquoise'|'Emeraude', from } | { rune: 'Ivoire', from, to } | { rune: 'Ebene' }
 * @returns nouvelles caractéristiques, ou null si la rune n'est pas applicable
 */
export function applyDraco(st, d) {
  if (DRACO_ELEMENTS[d.rune]) {
    const to = DRACO_ELEMENTS[d.rune];
    const from = d.from;
    if (!OFFENSIVE.includes(from) || from === to) return null;
    if (!has(st, ELEM[from].carac) && !has(st, ELEM[from].dmg)) return null;
    if (has(st, ELEM[to].carac) || has(st, ELEM[to].dmg)) return null; // élément cible déjà présent
    return move(st, from, to, ['carac', 'dmg']);
  }
  if (d.rune === 'Ivoire') {
    if (!ELEM[d.from] || !ELEM[d.to] || d.from === d.to) return null;
    if (!has(st, ELEM[d.from].resPct) && !has(st, ELEM[d.from].resFix)) return null;
    if (has(st, ELEM[d.to].resPct) || has(st, ELEM[d.to].resFix)) return null;
    return move(st, d.from, d.to, ['resPct', 'resFix']);
  }
  if (d.rune === 'Ebene') {
    const caracs = OFFENSIVE.map((e) => ELEM[e].carac).filter((k) => (st[k] ?? 0) > 0);
    const dmgs = OFFENSIVE.map((e) => ELEM[e].dmg).filter((k) => (st[k] ?? 0) > 0);
    if (!caracs.length && !dmgs.length) return null;
    const out = { ...st };
    const maxC = Math.max(0, ...caracs.map((k) => st[k]));
    const maxD = Math.max(0, ...dmgs.map((k) => st[k]));
    for (const k of [...caracs, ...dmgs]) delete out[k]; // valeurs négatives conservées
    if (maxC) out.damagePercent = (out.damagePercent ?? 0) + Math.floor(maxC * 0.7);
    if (maxD) out.allDamageBonus = (out.allDamageBonus ?? 0) + Math.floor(maxD * 0.7);
    return out;
  }
  return null;
}

/** Toutes les Dracorunes applicables à des caractéristiques d'objet. */
export function dracoOptions(st) {
  const opts = [];
  for (const rune of Object.keys(DRACO_ELEMENTS)) for (const from of OFFENSIVE) opts.push({ rune, from });
  for (const from of Object.keys(ELEM)) for (const to of Object.keys(ELEM)) opts.push({ rune: 'Ivoire', from, to });
  opts.push({ rune: 'Ebene' });
  return opts.filter((d) => applyDraco(st, d));
}

/** Caractéristiques finales d'un objet avec sa forgemagie (transcendance puis Dracorune ; exo inclus). */
export function itemStatsAfter(item, f = {}) {
  let st = { ...item.stats };
  if (f.trans) st[f.trans.stat] = (st[f.trans.stat] ?? 0) + f.trans.value;
  if (f.draco) st = applyDraco(st, f.draco) ?? st;
  if (f.exo) st[f.exo] = (st[f.exo] ?? 0) + 1;
  return st;
}

/** Positions des objets du stuff : [{ slot, item }]. */
const placed = (stuff) => Object.entries(stuff).filter(([s]) => SLOTS[s])
  .flatMap(([slot, v]) => [v].flat().filter(Boolean).map((item) => ({ slot, item })));

/** Variation des caractéristiques apportée par la forgemagie (à ajouter au total des objets). */
export function forgemagieStats(fm, stuff) {
  const stats = {};
  const pos = placed(stuff);
  for (const [id, f] of Object.entries(fm ?? {})) {
    const item = pos.find((x) => x.item.id === Number(id))?.item;
    if (!item) continue;
    const after = itemStatsAfter(item, f);
    for (const k of new Set([...Object.keys(item.stats), ...Object.keys(after)])) {
      const d = (after[k] ?? 0) - (item.stats[k] ?? 0);
      if (d) stats[k] = (stats[k] ?? 0) + d;
    }
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
    if (f.draco) {
      if (!opt.dracorunes) errors.push(`${name} : Dracorunes désactivées par la cible`);
      if (!TRANS_SLOTS.includes(p.slot)) errors.push(`${name} : Dracorune impossible sur ce type d'objet`);
      const st = { ...p.item.stats };
      if (f.trans) st[f.trans.stat] = (st[f.trans.stat] ?? 0) + f.trans.value;
      if (!applyDraco(st, f.draco)) errors.push(`${name} : Dracorune ${f.draco.rune} non applicable`);
    }
  }
  if (exoCount.actionPoints > 1) errors.push('plus d\'un exo PA');
  if (exoCount.movementPoints > 1) errors.push('plus d\'un exo PM');
  return errors;
}

/**
 * Format de publication DofusDB du projet (src/dofusdb-publish.js, toDofusDbForgemagie) : lignes d'origine avec
 * leur valeur finale (0 si convertie par une Dracorune) ; lignes absentes de l'objet d'origine en exos
 * (DofusDB n'affiche dans « stats » que les lignes de l'objet).
 */
export function toPublishFormat(fm, stuff) {
  const out = {};
  for (const [id, f] of Object.entries(fm ?? {})) {
    const item = placed(stuff).find((x) => x.item.id === Number(id))?.item;
    if (!item) continue;
    const after = itemStatsAfter(item, f);
    const stats = {};
    for (const k of Object.keys(item.stats)) if ((after[k] ?? 0) !== item.stats[k]) stats[k] = after[k] ?? 0;
    const exos = Object.entries(after).filter(([k, v]) => !(k in item.stats) && v).map(([stat, value]) => ({ stat, value }));
    out[id] = { stats, exos };
  }
  return out;
}

/** Description lisible. */
export function describe(fm, stuff) {
  return Object.entries(fm ?? {}).map(([id, f]) => {
    const item = placed(stuff).find((x) => x.item.id === Number(id))?.item;
    const name = item?.name ?? `#${id}`;
    const parts = [];
    if (f.exo) parts.push(`exo +1 ${f.exo === 'actionPoints' ? 'PA' : 'PM'}`);
    if (f.trans) parts.push(`rune ${f.trans.taille === 'TA' ? 'TA' : `${f.trans.taille} TA`} ${f.trans.stat} +${f.trans.value}`);
    if (f.draco) {
      const d = f.draco;
      parts.push(d.rune === 'Ebene' ? 'Dracorune Ébène (élémentaire → Puissance / Dommages)'
        : d.rune === 'Ivoire' ? `Dracorune Ivoire (rés. ${d.from} → ${d.to})`
          : `Dracorune ${d.rune === 'Emeraude' ? 'Émeraude' : d.rune} (${d.from} → ${DRACO_ELEMENTS[d.rune]})`);
    }
    return `${name} : ${parts.join(' + ')}`;
  });
}
