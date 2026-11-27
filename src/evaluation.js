// Évaluation d'un stuff pour une cible : total final, conditions, dégâts, score.
// Règles : docs/stuff.md, docs/personnage.md, docs/degats.md, docs/config-cible.md, docs/dofus-speciaux.md.
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, SLOTS, validate, equippedSetCount } from './stuff.js';
import { BASE, CAPS, CHARACS, CHARAC_POINTS, PARCHMENT, pointCost } from './personnage.js';
import { forgemagieStats, validateForgemagie } from './forgemagie.js';

let db;
const conn = () => (db ??= new DatabaseSync(DB_PATH, { readOnly: true }));
const all = (sql, ...p) => conn().prepare(sql).all(...p);

// ---------------------------------------------------------------------------
// Chargement des objets
// ---------------------------------------------------------------------------

const itemCache = new Map();
/** Objet avec ses caractéristiques (jets max) indexées par keyword. */
export function loadItem(id) {
  if (itemCache.has(id)) return itemCache.get(id);
  const [it] = all(`SELECT id, name, level, type_id AS typeId, set_id AS setId, criterions FROM items WHERE id = ?`, id);
  if (!it) throw new Error(`Objet inconnu : ${id}`);
  it.stats = {};
  for (const r of all(`SELECT c.keyword, ie.max FROM item_effects ie JOIN characteristics c ON c.id = ie.characteristic_id
                       WHERE ie.item_id = ? AND ie.characteristic_id > 0`, id)) {
    it.stats[r.keyword] = (it.stats[r.keyword] ?? 0) + r.max;
  }
  itemCache.set(id, it);
  return it;
}

/** Stuff au format { helmet: id, rings: [id, id], dofus: [ids…], … } → objets chargés. */
export function loadStuff(ids) {
  const stuff = {};
  for (const slot of Object.keys(SLOTS)) {
    const v = ids[slot];
    if (Array.isArray(v)) stuff[slot] = v.filter((x) => x != null).map(loadItem);
    else if (v != null) stuff[slot] = loadItem(v);
  }
  return stuff;
}

const setBonusCache = new Map();
/** Bonus d'une panoplie pour `count` objets différents portés (palier total, non cumulatif). */
export function setBonus(setId, count) {
  const key = `${setId}/${count}`;
  if (!setBonusCache.has(key)) {
    const stats = {};
    for (const r of all(`SELECT c.keyword, b.value FROM item_set_bonuses b JOIN characteristics c ON c.id = b.characteristic_id
                         WHERE b.set_id = ? AND b.item_count = ? AND b.characteristic_id > 0`, setId, count)) {
      stats[r.keyword] = (stats[r.keyword] ?? 0) + r.value;
    }
    setBonusCache.set(key, stats);
  }
  return setBonusCache.get(key);
}

// ---------------------------------------------------------------------------
// Total final
// ---------------------------------------------------------------------------

const add = (acc, stats, factor = 1) => {
  for (const [k, v] of Object.entries(stats)) acc[k] = (acc[k] ?? 0) + v * factor;
};

/**
 * Caractéristiques finales (avant plafonds) : base + points + parchemins + objets + panoplies
 * + effets conditionnels des objets imposés (clés = keywords).
 */
export function rawTotals(items, points, effets = {}) {
  const t = { actionPoints: BASE.ap, movementPoints: BASE.mp };
  add(t, points);
  add(t, PARCHMENT);
  for (const it of items) add(t, it.stats);
  const perSet = new Map();
  for (const it of new Map(items.map((i) => [i.id, i])).values()) {
    if (it.setId) perSet.set(it.setId, (perSet.get(it.setId) ?? 0) + 1);
  }
  for (const [setId, n] of perSet) if (n >= 2) add(t, setBonus(setId, n));
  for (const it of items) {
    for (const [k, v] of Object.entries(effets[it.id] ?? {})) {
      if (!['multiplicateur_final', 'puissance_par_pm', 'pm_contrainte'].includes(k)) t[k] = (t[k] ?? 0) + v;
    }
  }
  t.hitPoints = BASE.hp + (t.vitality ?? 0);
  return t;
}

const RES_PCT = ['earthElementResistPercent', 'fireElementResistPercent', 'waterElementResistPercent',
  'airElementResistPercent', 'neutralElementResistPercent'];

// Résistances distance / mêlée (% de dommages subis) : valorisées par défaut à partir des poids des résistances
// élémentaires (docs/config-cible.md, « Score d'un stuff ») : avec ≈ 50 % de résistances élémentaires, 1 % de
// résistance distance vaut 0,5 % de résistance dans tous les éléments sur les attaques à distance, soit
// la moitié des attaques reçues → 0,25 × Σ poids élémentaires. Surchargeable dans `bonus`.
const RES_PORTEE = ['receivedDamageMultiplierDistance', 'receivedDamageMultiplierMelee'];
export const RES_PORTEE_FACTEUR = 0.25;

/** Poids effectifs des bonus d'une cible (bonus explicites + valeur par défaut des résistances distance/mêlée). */
export function bonusWeights(cible) {
  const w = { ...(cible.bonus ?? {}) };
  const sumRes = RES_PCT.reduce((s, k) => s + (w[k] ?? 0), 0);
  for (const k of RES_PORTEE) w[k] ??= RES_PORTEE_FACTEUR * sumRes;
  return w;
}

/** Applique les plafonds de docs/personnage.md. */
export function capped(t) {
  const c = { ...t };
  c.actionPoints = Math.min(c.actionPoints ?? 0, CAPS.ap);
  c.movementPoints = Math.min(c.movementPoints ?? 0, CAPS.mp);
  for (const k of RES_PCT) if (c[k] !== undefined) c[k] = Math.min(c[k], CAPS.resistPercent);
  return c;
}

// ---------------------------------------------------------------------------
// Conditions d'équipement
// ---------------------------------------------------------------------------

const CRIT_CODES = {
  CP: 'actionPoints', CM: 'movementPoints', CS: 'strength', CV: 'vitality', CW: 'wisdom',
  CI: 'intelligence', CA: 'agility', CC: 'chance',
};

/**
 * Évalue une condition (`CP<12|CM<6`, `(CS>89&CI>89)`, `pk<2`…) sur le total final.
 * Renvoie true / false, ou null si un code n'est pas géré (quêtes, métiers…), traité comme satisfait.
 */
export function evalCriterion(expr, ctx) {
  const tokens = expr.match(/\(|\)|&|\||[A-Za-z]{2}[<>=!~][^&|()]*/g) ?? [];
  let i = 0;
  const unknown = new Set();
  const atom = (tok) => {
    const m = tok?.match(/^([A-Za-z]{2})([<>=!~])(.*)$/);
    if (!m) { unknown.add(String(tok)); return null; }
    const [, code, op, raw] = m;
    if (code === 'PN') return false; // objet réservé à un personnage nommé : jamais équipable
    if (code === 'PX') return false; // droits d'administration (objets de MJ) : jamais équipable
    let value;
    if (CRIT_CODES[code]) value = ctx.totals[CRIT_CODES[code]] ?? 0;
    else if (code === 'pk') value = ctx.setCount;
    else if (code === 'PL') value = 200;
    else if (code === 'PK') return true; // ignoré (docs/stuff.md)
    else { unknown.add(code); return null; }
    const n = Number(raw);
    return op === '<' ? value < n : op === '>' ? value > n : op === '=' ? value === n : value !== n;
  };
  // Logique à trois valeurs : null = inconnu.
  const and = (a, b) => (a === false || b === false ? false : a === null || b === null ? null : true);
  const or = (a, b) => (a === true || b === true ? true : a === null || b === null ? null : false);
  const parseOr = () => { let v = parseAnd(); while (tokens[i] === '|') { i++; v = or(v, parseAnd()); } return v; };
  const parseAnd = () => { let v = parseTerm(); while (tokens[i] === '&') { i++; v = and(v, parseTerm()); } return v; };
  const parseTerm = () => {
    const tok = tokens[i++];
    if (tok === '(') { const v = parseOr(); i++; return v; }
    return atom(tok);
  };
  const result = tokens.length ? parseOr() : true;
  return { ok: result, unknown: [...unknown] };
}

/** Minimums investis requis par les conditions simples (conjonctions de CX>n) des objets. */
function pointMinimums(items, totalsWithoutPoints) {
  const min = {};
  for (const it of items) {
    if (!it.criterions || it.criterions.includes('|')) continue;
    for (const m of it.criterions.matchAll(/C([SVWICA])>(\d+)/g)) {
      const key = CRIT_CODES[`C${m[1]}`];
      if (!CHARACS.includes(key)) continue;
      const need = Number(m[2]) + 1 - (totalsWithoutPoints[key] ?? 0);
      if (need > 0) min[key] = Math.max(min[key] ?? 0, need);
    }
  }
  return min;
}

// ---------------------------------------------------------------------------
// Dégâts (docs/degats.md)
// ---------------------------------------------------------------------------

const ELEMENT_KEYS = {
  Terre: { carac: 'strength', dmg: 'earthDamageBonus' },
  Feu: { carac: 'intelligence', dmg: 'fireDamageBonus' },
  Eau: { carac: 'chance', dmg: 'waterDamageBonus' },
  Air: { carac: 'agility', dmg: 'airDamageBonus' },
  Neutre: { carac: 'strength', dmg: 'neutralDamageBonus' },
};

/** Dégât moyen d'une ligne de `degats.sorts` sur la cible de référence. */
export function lineDamage(line, t, { cible = {}, multFinal = 1 } = {}) {
  const elements = line.element === 'meilleur élément' || line.element === 'pire élément'
    ? Object.keys(ELEMENT_KEYS) : [line.element];
  const resPct = cible.resistances_pct ?? {};
  const resFix = cible.resistances_fixes ?? {};

  const perElement = elements.map((el) => {
    const k = ELEMENT_KEYS[el];
    let power = (t[k.carac] ?? 0) + (t.damagePercent ?? 0);
    let fixe = (t.allDamageBonus ?? 0) + (t[k.dmg] ?? 0);
    if (line.type === 'piege') {
      power += t.trapDamageBonusPercent ?? 0;
      fixe += t.trapDamageBonus ?? 0;
    }
    const mult = (100 + power) / 100;
    const pct = (line.type === 'arme' ? (t.dealtDamageMultiplierWeapon ?? 0) : (t.dealtDamageMultiplierSpells ?? 0))
      + (line.portee === 'melee' ? (t.dealtDamageMultiplierMelee ?? 0) : (t.dealtDamageMultiplierDistance ?? 0))
      - (line.portee === 'melee' ? (resPct.melee ?? 0) : (resPct.distance ?? 0));

    const avg = ([min, max], crit) => {
      let sum = 0;
      for (let j = min; j <= max; j++) {
        const brut = Math.floor(mult * j + fixe + (crit ? (t.criticalDamageBonus ?? 0) : 0));
        const fixes = (resFix[el] ?? 0) + (crit ? (resFix.critique ?? 0) : 0);
        const subis = Math.floor(Math.max(0, brut - fixes) * Math.max(0, 100 - (resPct[el] ?? 0)) / 100);
        sum += Math.floor(subis * (100 + pct) / 100 * multFinal);
      }
      return sum / (max - min + 1);
    };
    const normal = avg(line.normal, false);
    if (!line.critique) return { element: el, normal, critique: null, pCrit: 0, moyenne: normal };
    const pCrit = Math.min(CAPS.critPercent, (line.critique_base_pct ?? 0) + (t.criticalHit ?? 0)) / 100;
    const critique = avg(line.critique, true);
    return { element: el, normal, critique, pCrit, moyenne: (1 - pCrit) * normal + pCrit * critique };
  });
  perElement.sort((a, b) => b.moyenne - a.moyenne);
  return line.element === 'pire élément' ? perElement.at(-1) : perElement[0];
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/**
 * Évalue un stuff (objets chargés) pour une cible et une répartition de points donnée.
 * @returns {{ valide, erreurs, avertissements, totals, degats, score, detail }}
 */
/** @param fm forgemagie au format de src/forgemagie.js (optionnelle) */
export function evaluate(stuff, cible, points, fm = {}) {
  const items = Object.values(stuff).flat().filter(Boolean);
  const effets = cible.objets?.effets_conditionnels ?? {};
  const erreurs = validate(stuff).filter((e) => !e.includes('pk<2')); // pk<2 traité avec les conditions
  erreurs.push(...validateForgemagie(fm, stuff, cible));
  const avertissements = [];

  for (const id of cible.objets?.imposes ?? []) if (!items.some((i) => i.id === id)) erreurs.push(`objet imposé absent : ${id}`);
  for (const id of cible.objets?.interdits ?? []) if (items.some((i) => i.id === id)) erreurs.push(`objet interdit présent : ${id}`);

  const spent = Object.entries(points).reduce((s, [c, v]) => { for (let i = 0; i < v; i++) s += pointCost(c, i); return s; }, 0);
  if (spent > CHARAC_POINTS) erreurs.push(`${spent} points dépensés > ${CHARAC_POINTS}`);

  const raw = rawTotals([...items, { id: -2, stats: forgemagieStats(fm) }], points, effets);
  const ctx = { totals: raw, setCount: equippedSetCount(items) };
  for (const it of items) {
    if (!it.criterions) continue;
    const { ok, unknown } = evalCriterion(it.criterions, ctx);
    if (ok === false) erreurs.push(`${it.name} : condition ${it.criterions} non respectée`);
    if (unknown.length) avertissements.push(`${it.name} : condition ${it.criterions} non évaluable (${unknown.join(', ')}), supposée respectée`);
  }

  const t = capped(raw);
  let multFinal = 1;
  let pmBonus = 0;
  let soinPct = 0; // soin unique en % des PV (Argenté Scintillant) → PV effectifs, hors contrainte de PV
  for (const it of items) {
    const e = effets[it.id] ?? {};
    if (e.multiplicateur_final) multFinal *= e.multiplicateur_final;
    if (e.puissance_par_pm) t.damagePercent = (t.damagePercent ?? 0) + e.puissance_par_pm * t.movementPoints;
    if (e.pm_contrainte) pmBonus += e.pm_contrainte;
    if (e.soin_pv_pct) soinPct += e.soin_pv_pct;
  }

  const degats = (cible.degats?.sorts ?? []).map((l) => ({ sort: l.sort, poids: l.poids, ...lineDamage(l, t, { cible: cible.degats.cible, multFinal }) }));
  const scoreDegats = degats.reduce((s, d) => s + d.poids * d.moyenne, 0);
  const weights = bonusWeights(cible);
  const scoreSoin = ((weights.vitality ?? 0) + (weights.hitPoints ?? 0)) * (t.hitPoints ?? 0) * soinPct / 100;
  const scoreBonus = Object.entries(weights).reduce((s, [k, w]) => s + w * (t[k] ?? 0), 0) + scoreSoin;

  let penalites = 0;
  let manqueStrict = 0; // points manquants sur les contraintes strictes (guide l'optimiseur)
  for (const [k, c] of Object.entries(cible.contraintes ?? {})) {
    const value = (t[k] ?? 0) + (k === 'movementPoints' ? pmBonus : 0);
    const missing = Math.max(0, c.min - value);
    if (!missing) continue;
    if (c.strict) { erreurs.push(`contrainte ${k} : ${value} < ${c.min}`); manqueStrict += missing; }
    else penalites += missing * c.penalite;
  }

  return {
    valide: erreurs.length === 0, erreurs, avertissements, totals: t, degats,
    score: scoreDegats + scoreBonus - penalites,
    manqueStrict,
    detail: { degats: scoreDegats, bonus: scoreBonus, penalites, points_depenses: spent },
  };
}

/**
 * Meilleure répartition des 995 points (heuristique gloutonne) : minimums imposés par la cible et par les
 * conditions des objets, puis +1 à la caractéristique au meilleur gain de score par point dépensé.
 */
export function bestPoints(stuff, cible, fm = {}) {
  const items = Object.values(stuff).flat().filter(Boolean);
  const points = Object.fromEntries(CHARACS.map((c) => [c, 0]));
  const noPoints = rawTotals([...items, { id: -2, stats: forgemagieStats(fm) }], points, cible.objets?.effets_conditionnels ?? {});
  const mins = { ...pointMinimums(items, noPoints) };
  for (const [k, v] of Object.entries(cible.points?.minimum ?? {})) mins[k] = Math.max(mins[k] ?? 0, v);

  let left = CHARAC_POINTS;
  for (const [c, v] of Object.entries(mins)) {
    while (points[c] < v && pointCost(c, points[c]) <= left) { left -= pointCost(c, points[c]); points[c]++; }
  }
  let current = evaluate(stuff, cible, points, fm).score;
  // Plusieurs tailles de pas : les arrondis des dégâts rendent le gain d'un petit pas bruité.
  const STEPS = [5, 20, 50];
  for (;;) {
    let best = null;
    for (const c of CHARACS) {
      for (const step of STEPS) {
        let cost = 0;
        for (let i = 0; i < step; i++) cost += pointCost(c, points[c] + i);
        if (cost > left) break;
        points[c] += step;
        const s = evaluate(stuff, cible, points, fm).score;
        points[c] -= step;
        const gain = (s - current) / cost;
        if (!best || gain > best.gain) best = { c, step, cost, s, gain };
      }
    }
    if (!best || best.gain <= 0) break;
    points[best.c] += best.step;
    left -= best.cost;
    current = best.s;
  }
  // Reste (< 5 points) : +1 tant que ça améliore.
  for (let improved = true; improved;) {
    improved = false;
    for (const c of CHARACS) {
      const cost = pointCost(c, points[c]);
      if (cost > left) continue;
      points[c]++;
      const s = evaluate(stuff, cible, points, fm).score;
      if (s > current) { current = s; left -= cost; improved = true; } else points[c]--;
    }
  }
  return points;
}
