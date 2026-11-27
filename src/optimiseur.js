// Recherche du meilleur stuff pour une cible (docs/config-cible.md).
//
// Recherche locale avec redémarrages :
//  1. valeur linéaire de chaque objet = Σ gradient(score) × caractéristiques de l'objet, le gradient étant
//     mesuré autour du stuff courant (il tient donc compte des plafonds, des contraintes et des dégâts) ;
//  2. pour chaque emplacement, essai des K meilleurs objets selon cette valeur, évalués exactement ;
//  3. mouvements « panoplie » : poser d'un coup 2..n objets d'une même panoplie ;
//  4. répartition des points recalculée à chaque passe (bestPoints) ;
//  5. redémarrages depuis le meilleur stuff perturbé.
// Ce n'est pas une recherche exhaustive : le résultat est un très bon stuff, pas une preuve d'optimalité.

import { loadEligibleItems, SLOTS } from './stuff.js';
import { loadItem, evaluate, bestPoints, setBonus } from './evaluation.js';
import { RUNES, TRANS_SLOTS, bestRune, options as forgeOptions } from './forgemagie.js';

const POSITIONS = Object.entries(SLOTS).flatMap(([slot, d]) =>
  Array.from({ length: d.count }, (_, i) => ({ slot, index: d.count > 1 ? i : null })));
const CHARAC_CONDITION = /C[SVWICA]>/;

const get = (stuff, p) => (p.index === null ? stuff[p.slot] : stuff[p.slot]?.[p.index]);
function put(stuff, p, item) {
  const s = { ...stuff };
  if (p.index === null) s[p.slot] = item;
  else {
    const list = [...(s[p.slot] ?? [])];
    while (list.length < SLOTS[p.slot].count) list.push(null);
    list[p.index] = item;
    s[p.slot] = list;
  }
  return s;
}
const clean = (stuff) => Object.fromEntries(Object.entries(stuff).map(([k, v]) => [k, Array.isArray(v) ? v.filter(Boolean) : v]));

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Objectif de recherche : score, très pénalisé si une règle stricte n'est pas respectée. */
function objective(r) {
  const autres = r.erreurs.filter((e) => !e.startsWith('contrainte ')).length;
  return r.score - 2000 * r.manqueStrict - 100000 * autres;
}

export function optimise(cible, {
  restarts = 20, topK = 30, seed = 1, propositions = 3, ecart = 0.03, difference = 3, log = () => {},
} = {}) {
  const rand = mulberry32(seed);
  const pools = loadEligibleItems();
  for (const slot of Object.keys(pools)) pools[slot] = pools[slot].map((it) => loadItem(it.id));
  const keywords = [...new Set(Object.values(pools).flat().flatMap((it) => Object.keys(it.stats)))];
  const sets = new Map();
  for (const [slot, list] of Object.entries(pools)) {
    for (const it of list) {
      if (!it.setId) continue;
      if (!sets.has(it.setId)) sets.set(it.setId, []);
      sets.get(it.setId).push({ slot, it });
    }
  }

  const withEffects = new Set(Object.keys(cible.objets?.effets_conditionnels ?? {}).map(Number));

  // Objets imposés : placés et verrouillés.
  const locked = new Set();
  let stuff = {};
  for (const id of cible.objets?.imposes ?? []) {
    const it = loadItem(id);
    const pos = POSITIONS.find((p) => SLOTS[p.slot].typeIds.includes(it.typeId) && !locked.has(p) && !get(stuff, p));
    if (!pos) throw new Error(`Impossible de placer l'objet imposé ${id}`);
    stuff = put(stuff, pos, it);
    locked.add(pos);
  }
  const free = POSITIONS.filter((p) => !locked.has(p));

  let evals = 0;
  const run = (s, points, fm = {}) => { evals++; return evaluate(clean(s), cible, points, fm); };
  const fopt = forgeOptions(cible);
  const RUNE_STATS = Object.keys(RUNES);
  const EXO_STATS = [fopt.exo_pa && 'actionPoints', fopt.exo_pm && 'movementPoints'].filter(Boolean);

  /** Gradient du score par caractéristique autour du stuff courant (différences finies). */
  function gradient(s, points, fm) {
    const base = objective(run(s, points, fm));
    const g = {};
    for (const k of new Set([...keywords, ...RUNE_STATS, ...EXO_STATS])) {
      const delta = k === 'actionPoints' || k === 'movementPoints' || k === 'range' ? 1 : 10;
      const probe = { ...s, _delta: { id: -1, name: 'delta', stats: { [k]: delta } } };
      g[k] = (objective(run(probe, points, fm)) - base) / delta;
    }
    return g;
  }
  const linear = (g, stats) => Object.entries(stats).reduce((v, [k, x]) => v + (g[k] ?? 0) * x, 0);
  /** Valeur linéaire du palier de panoplie atteint avec n objets différents (0 sous 2 objets). */
  const setValue = (g, setId, n) => (n >= 2 ? linear(g, setBonus(setId, n)) : 0);
  /** Nombre d'objets différents par panoplie dans un stuff, en ignorant éventuellement une position. */
  function setCounts(st, skip) {
    const seen = new Map();
    for (const p of POSITIONS) {
      if (p === skip) continue;
      const it = get(st, p);
      if (it?.setId) seen.set(it.id, it.setId);
    }
    const counts = new Map();
    for (const setId of seen.values()) counts.set(setId, (counts.get(setId) ?? 0) + 1);
    return { counts, ids: new Set(seen.keys()) };
  }

  // ---- Forgemagie (docs/forgemagie.md) ----
  /** Meilleure rune de transcendance d'un objet selon le gradient : { trans, v } ou null. */
  function bestTrans(g, item) {
    let best = null;
    for (const stat of RUNE_STATS) {
      const r = bestRune(item, stat);
      const v = r ? (g[stat] ?? 0) * r.value : 0;
      if (r && v > 0 && (!best || v > best.v)) best = { trans: r, v };
    }
    return best;
  }
  const transValue = (g, item, slot) => (fopt.transcendance && TRANS_SLOTS.includes(slot) ? bestTrans(g, item)?.v ?? 0 : 0);

  /**
   * Forgemagie estimée (gradient) d'un stuff, en partant de la forgemagie courante : exos gardés sur leur anneau
   * si possible, sinon placés sur l'anneau où ils coûtent le moins de transcendance ; meilleure rune ailleurs.
   * `force` : { actionPoints: ringId | null, movementPoints: … } impose le placement des exos (null = pas d'exo).
   */
  function adapt(fm, s, g, force = {}) {
    const out = {};
    const rings = (s.rings ?? []).filter(Boolean);
    const sameRings = rings.length === 2 && rings[0].id === rings[1].id;
    if (!sameRings) {
      for (const stat of EXO_STATS) {
        const ok = rings.filter((r) => !(r.stats[stat] > 0) && !out[r.id]);
        let ring;
        if (stat in force) ring = ok.find((r) => r.id === force[stat]);
        else {
          ring = ok.find((r) => fm[r.id]?.exo === stat);
          if (!ring) {
            const scored = ok.map((r) => ({ r, v: (g[stat] ?? 0) - transValue(g, r, 'rings') })).sort((a, b) => b.v - a.v);
            if (scored[0]?.v > 0) ring = scored[0].r;
          }
        }
        if (ring) out[ring.id] = { exo: stat };
      }
    }
    if (fopt.transcendance) {
      for (const slot of TRANS_SLOTS) {
        if (slot === 'rings' && sameRings) continue;
        for (const item of [s[slot]].flat().filter(Boolean)) {
          if (out[item.id]) continue;
          const keep = fm[item.id]?.trans;
          const b = keep && bestRune(item, keep.stat) ? { trans: bestRune(item, keep.stat) } : bestTrans(g, item);
          if (b) out[item.id] = { trans: b.trans };
        }
      }
    }
    return out;
  }

  /** Forgemagie optimisée exactement : placements d'exos essayés, puis meilleure rune objet par objet. */
  function optimiseFm(s, points, g, fm) {
    const rings = (s.rings ?? []).filter(Boolean);
    const choices = (stat) => [null, ...rings.filter((r) => !(r.stats[stat] > 0)).map((r) => r.id)];
    let best = { fm: adapt(fm, s, g), value: objective(run(s, points, adapt(fm, s, g))) };
    const pa = EXO_STATS.includes('actionPoints') ? choices('actionPoints') : [null];
    const pm = EXO_STATS.includes('movementPoints') ? choices('movementPoints') : [null];
    for (const a of pa) {
      for (const m of pm) {
        if (a !== null && a === m) continue; // exo PA et PM sur deux anneaux différents
        const force = {};
        if (EXO_STATS.includes('actionPoints')) force.actionPoints = a;
        if (EXO_STATS.includes('movementPoints')) force.movementPoints = m;
        const cand = adapt({}, s, g, force);
        const v = objective(run(s, points, cand));
        if (v > best.value + 1e-6) best = { fm: cand, value: v };
      }
    }
    // Runes : pour chaque objet, les 3 meilleures selon le gradient, évaluées exactement.
    for (const [id, f] of Object.entries(best.fm)) {
      if (!f.trans) continue;
      const item = Object.values(s).flat().find((it) => it?.id === Number(id));
      const runes = RUNE_STATS.map((stat) => bestRune(item, stat)).filter(Boolean)
        .map((r) => ({ r, v: (g[r.stat] ?? 0) * r.value })).sort((x, y) => y.v - x.v).slice(0, 3);
      for (const { r } of runes) {
        const cand = { ...best.fm, [id]: { trans: r } };
        const v = objective(run(s, points, cand));
        if (v > best.value + 1e-6) best = { fm: cand, value: v };
      }
    }
    return best.fm;
  }

  /** Évalue un stuff ; recalcule les points si un objet a une condition sur une caractéristique. */
  function score(s, points, fm) {
    const needsPoints = Object.values(s).flat().some((it) => it?.criterions && CHARAC_CONDITION.test(it.criterions));
    const pts = needsPoints ? bestPoints(clean(s), cible, fm) : points;
    return { value: objective(run(s, pts, fm)), points: pts };
  }

  function localSearch(start, startPoints) {
    let cur = start;
    let points = startPoints;
    let fm = {};
    let curVal;
    for (let pass = 0; pass < 30; pass++) {
      points = bestPoints(clean(cur), cible, fm);
      const g = gradient(cur, points, fm);
      fm = optimiseFm(cur, points, g, fm);
      curVal = score(cur, points, fm).value;
      let improved = false;
      // Essai d'un stuff candidat avec sa forgemagie adaptée (estimée au gradient).
      const tryCand = (cand) => {
        const cfm = adapt(fm, cand, g);
        const r = score(cand, points, cfm);
        if (r.value > curVal + 1e-6) { cur = cand; curVal = r.value; points = r.points; fm = cfm; improved = true; }
      };

      // Mouvements objet par objet. Classement des candidats : valeur propre de l'objet + gain du palier de
      // panoplie qu'il fait franchir compte tenu des autres objets portés.
      for (const p of free) {
        const { counts, ids } = setCounts(cur, p);
        const ranked = pools[p.slot].map((it) => {
          let v = linear(g, it.stats);
          // Potentiel de forgemagie : exo de l'anneau remplacé conservable, sinon meilleure transcendance.
          const exo = fm[get(cur, p)?.id]?.exo;
          v += exo && !(it.stats[exo] > 0) ? (g[exo] ?? 0) : transValue(g, it, p.slot);
          if (it.setId && !ids.has(it.id)) {
            const n = counts.get(it.setId) ?? 0;
            v += setValue(g, it.setId, n + 1) - setValue(g, it.setId, n);
          }
          return { it, v };
        }).sort((a, b) => b.v - a.v).slice(0, topK);
        // Objets à effet conditionnel non imposés (ex. Argenté Scintillant) : leur effet n'entre pas dans la
        // valeur linéaire, ils sont donc toujours essayés.
        for (const it of pools[p.slot]) if (withEffects.has(it.id) && !ranked.some((r) => r.it === it)) ranked.push({ it, v: 0 });
        for (const { it } of ranked) {
          if (it === get(cur, p)) continue;
          tryCand(put(cur, p, it));
        }
      }

      // Mouvements panoplie : poser d'un coup 2..n objets d'une même panoplie. Estimation : valeur des objets
      // posés − valeur des objets remplacés + palier de panoplie atteint ; les meilleures sont évaluées exactement.
      const estimates = [];
      for (const [setId, members] of sets) {
        const ranked = members.map((m) => ({ ...m, v: linear(g, m.it.stats) })).sort((a, b) => b.v - a.v);
        const used = new Set();
        const placed = [];
        let delta = 0;
        for (const m of ranked) {
          const p = free.find((q) => q.slot === m.slot && !used.has(q));
          if (!p) continue; // emplacement déjà pris par un meilleur objet de la panoplie
          used.add(p);
          const replaced = get(cur, p);
          delta += m.v - (replaced ? linear(g, replaced.stats) : 0);
          placed.push({ p, it: m.it });
          if (placed.length >= 2) estimates.push({ moves: [...placed], est: delta + setValue(g, setId, placed.length) });
          if (placed.length >= 8) break;
        }
      }
      estimates.sort((a, b) => b.est - a.est);
      for (const { moves } of estimates.slice(0, 100)) {
        let cand = cur;
        for (const { p, it } of moves) cand = put(cand, p, it);
        const variants = [cand];
        // Une 2e panoplie est interdite par les trophées « pk<2 » : variante où ces trophées sont remplacés
        // par les meilleurs Dofus/trophées sans cette condition.
        const pkPositions = free.filter((q) => get(cand, q)?.criterions?.includes('pk<2'));
        if (pkPositions.length && [...setCounts(cand).counts.values()].filter((n) => n >= 2).length >= 2) {
          const present = new Set(POSITIONS.map((q) => get(cand, q)?.id));
          const replacements = pools.dofus
            .filter((it) => !it.criterions?.includes('pk<2') && !present.has(it.id))
            .map((it) => ({ it, v: linear(g, it.stats) })).sort((a, b) => b.v - a.v);
          let alt = cand;
          pkPositions.forEach((q, i) => { if (replacements[i]) alt = put(alt, q, replacements[i].it); });
          variants.push(alt);
        }
        for (const v of variants) tryCand(v);
      }
      if (!improved) break;
    }
    points = bestPoints(clean(cur), cible, fm);
    fm = optimiseFm(cur, points, gradient(cur, points, fm), fm);
    points = bestPoints(clean(cur), cible, fm);
    return { stuff: cur, points, fm, value: score(cur, points, fm).value };
  }

  // Départ : stuff vide (hors imposés), répartition calculée dessus.
  const found = [localSearch(stuff, bestPoints(clean(stuff), cible))];
  let best = found[0];
  log(`départ : ${best.value.toFixed(1)}`);
  for (let r = 0; r < restarts; r++) {
    // Un redémarrage sur deux part d'une solution déjà trouvée prise au hasard, avec une perturbation plus forte,
    // pour explorer d'autres combinaisons (et proposer des alternatives).
    const from = r % 2 === 0 ? best : found[Math.floor(rand() * found.length)];
    let s = from.stuff;
    for (let i = 0; i < (r % 2 === 0 ? 4 : 7); i++) {
      const p = free[Math.floor(rand() * free.length)];
      const pool = pools[p.slot];
      s = put(s, p, pool[Math.floor(rand() * pool.length)]);
    }
    const res = localSearch(s, from.points);
    found.push(res);
    log(`redémarrage ${r + 1}/${restarts} : ${res.value.toFixed(1)}${res.value > best.value ? ' ★' : ''}`);
    if (res.value > best.value) best = res;
  }

  // Propositions : jusqu'à `propositions` solutions valides, à moins de `ecart` du meilleur score,
  // différant entre elles d'au moins `difference` objets.
  const ids = (st) => POSITIONS.map((p) => get(st, p)?.id ?? 0);
  const diff = (a, b) => {
    const count = (st) => ids(st).reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map());
    const ca = count(a.stuff);
    let same = 0;
    for (const [id, n] of count(b.stuff)) same += Math.min(n, ca.get(id) ?? 0);
    return POSITIONS.length - same;
  };
  const chosen = [];
  for (const f of [...found].sort((a, b) => b.value - a.value)) {
    if (chosen.length >= propositions) break;
    if (f.value < best.value * (1 - ecart)) break;
    if (chosen.every((c) => diff(c, f) >= difference)) chosen.push(f);
  }
  return {
    propositions: chosen.map((c) => {
      const st = clean(c.stuff);
      return { stuff: st, points: c.points, fm: c.fm, result: evaluate(st, cible, c.points, c.fm) };
    }),
    evals,
  };
}
