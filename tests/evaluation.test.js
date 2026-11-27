// Tests de src/evaluation.js sur les exemples chiffrés de docs/degats.md et les règles validées.
// Lancement : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineDamage, evalCriterion, loadStuff, evaluate, bonusWeights } from '../src/evaluation.js';

const line = (o) => ({ sort: 't', type: 'sort', portee: 'distance', element: 'Feu', normal: [10, 10], critique: null, poids: 1, ...o });

test('guide : Flamiche critique jet 12 → 245', () => {
  const t = { intelligence: 777, damagePercent: 100, allDamageBonus: 9, fireDamageBonus: 78, criticalDamageBonus: 41, criticalHit: 100 };
  const d = lineDamage(line({ normal: [8, 10], critique: [12, 12], critique_base_pct: 0 }), t);
  assert.equal(d.critique, 245);
  assert.equal(d.moyenne, 245); // 100 % de critique
});

test('guide : Pelle Massacrante jet 51 → 259', () => {
  const t = { chance: 257, damagePercent: 100, allDamageBonus: 9, waterDamageBonus: 17 };
  assert.equal(lineDamage(line({ element: 'Eau', type: 'arme', normal: [51, 51] }), t).normal, 259);
});

test('guide : résistances — Flamiche 245 sur 10 % / 15 fixes / −20 rés. critique → 225', () => {
  const t = { intelligence: 777, damagePercent: 100, allDamageBonus: 9, fireDamageBonus: 78, criticalDamageBonus: 41, criticalHit: 100 };
  const cible = { resistances_pct: { Feu: 10 }, resistances_fixes: { Feu: 15, critique: -20 } };
  // [245 − 15 − (−20)] × 90 / 100 = 225
  assert.equal(lineDamage(line({ critique: [12, 12] }), t, { cible }).critique, 225);
});

test('guide : Pelle Massacrante 259 sur −7 % / 12 fixes Eau → 264', () => {
  const t = { chance: 257, damagePercent: 100, allDamageBonus: 9, waterDamageBonus: 17 };
  const cible = { resistances_pct: { Eau: -7 }, resistances_fixes: { Eau: 12 } };
  assert.equal(lineDamage(line({ element: 'Eau', type: 'arme', normal: [51, 51] }), t, { cible }).normal, 264);
});

test('pièges : Puissance et Dommages pièges seulement pour type piege, pas pour poison', () => {
  const t = { chance: 0, trapDamageBonusPercent: 100, trapDamageBonus: 10 };
  assert.equal(lineDamage(line({ element: 'Eau', type: 'piege' }), t).normal, 30); // 10 × 2 + 10
  assert.equal(lineDamage(line({ element: 'Eau', type: 'poison' }), t).normal, 10);
});

test('% : sorts + distance − rés. distance additionnés, puis multiplicateur final', () => {
  const t = { dealtDamageMultiplierSpells: 10, dealtDamageMultiplierDistance: 10 };
  const cible = { resistances_pct: { distance: 5 } };
  assert.equal(lineDamage(line({ normal: [100, 100] }), t, { cible }).normal, 115);
  assert.equal(lineDamage(line({ normal: [100, 100] }), t, { cible, multFinal: 1.2 }).normal, 138);
});

test('conditions : Cape des Justiciers CP<12|CM<6', () => {
  const ok = (ap, mp) => evalCriterion('CP<12|CM<6', { totals: { actionPoints: ap, movementPoints: mp }, setCount: 0 }).ok;
  assert.equal(ok(12, 6), false);
  assert.equal(ok(11, 6), true);
  assert.equal(ok(12, 5), true);
});

test('conditions : parenthèses, pk<2, codes inconnus', () => {
  const ctx = { totals: { strength: 90, intelligence: 90, agility: 90, actionPoints: 12, movementPoints: 5 }, setCount: 1 };
  assert.equal(evalCriterion('(CS>89&CI>89&CA>89)&(CP<12|CM<6)', ctx).ok, true);
  assert.equal(evalCriterion('pk<2', { ...ctx, setCount: 2 }).ok, false);
  assert.equal(evalCriterion('PN~Lordsoth&BI=1', ctx).ok, false);
  const q = evalCriterion('Qa=2488', ctx);
  assert.equal(q.ok, null);
  assert.deepEqual(q.unknown, ['Qa']);
});

test('évaluation : base 7 PA / 3 PM / 1050 PV, parchemins +100, plafond 12 PA', () => {
  const cible = { degats: { sorts: [] }, contraintes: {} };
  const empty = evaluate(loadStuff({}), cible, {});
  assert.equal(empty.totals.actionPoints, 7);
  assert.equal(empty.totals.movementPoints, 3);
  assert.equal(empty.totals.hitPoints, 1150); // 1050 + 100 Vitalité de parchemin
  assert.equal(empty.totals.agility, 100);
});

test('rés. distance/mêlée : valorisées par défaut à 0,25 × Σ poids élémentaires, surchargeables', () => {
  const res = { earthElementResistPercent: 7, fireElementResistPercent: 7, waterElementResistPercent: 7, airElementResistPercent: 7, neutralElementResistPercent: 3 };
  assert.equal(bonusWeights({ bonus: res }).receivedDamageMultiplierDistance, 7.75);
  assert.equal(bonusWeights({ bonus: res }).receivedDamageMultiplierMelee, 7.75);
  assert.equal(bonusWeights({ bonus: { ...res, receivedDamageMultiplierMelee: 0 } }).receivedDamageMultiplierMelee, 0);
});

test('Arcaniste : malus rés. distance/mêlée compté ; Argenté : soin_pv_pct en PV effectifs', () => {
  const cible = { degats: { sorts: [] }, contraintes: {}, bonus: { vitality: 0.1, earthElementResistPercent: 10 },
    objets: { effets_conditionnels: { 20286: { soin_pv_pct: 30 } } } };
  const vide = evaluate(loadStuff({}), cible, {});
  const arca = evaluate(loadStuff({ dofus: [30455] }), cible, {});
  assert.equal(arca.score - vide.score, 2 * -6 * 2.5); // 2 résistances × −6 × (0,25 × 10)
  const arg = evaluate(loadStuff({ dofus: [20286] }), cible, {});
  // +300 Vitalité × 0,1, puis soin : 0,1 × (1150 + 300) PV × 30 %
  assert.ok(Math.abs(arg.score - vide.score - (30 + 0.1 * 1450 * 0.3)) < 1e-9);
});
