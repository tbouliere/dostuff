// Tests de src/forgemagie.js (docs/forgemagie.md). Lancement : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestRune, validateForgemagie, forgemagieStats, applyDraco, dracoOptions, itemStatsAfter, toPublishFormat } from '../src/forgemagie.js';
import { loadItem, loadStuff, evaluate } from '../src/evaluation.js';

const item = (stats) => ({ id: 1, name: 'x', stats });

test('rune Cri : seuils TA ≤ 6 %, Pa ≤ 4 %, pas de Ra', () => {
  assert.deepEqual(bestRune(item({}), 'criticalHit'), { stat: 'criticalHit', taille: 'Pa', value: 2 });
  assert.equal(bestRune(item({ criticalHit: 4 }), 'criticalHit').taille, 'Pa');
  assert.equal(bestRune(item({ criticalHit: 5 }), 'criticalHit').taille, 'TA');
  assert.equal(bestRune(item({ criticalHit: 7 }), 'criticalHit'), null);
});

test('rune Agilité : Ra ≤ 21, Pa ≤ 41, TA ≤ 61 ; Vitalité Ra ≤ 105', () => {
  assert.deepEqual(bestRune(item({ agility: 21 }), 'agility'), { stat: 'agility', taille: 'Ra', value: 20 });
  assert.equal(bestRune(item({ agility: 22 }), 'agility').taille, 'Pa');
  assert.equal(bestRune(item({ agility: 62 }), 'agility'), null);
  assert.equal(bestRune(item({ vitality: 105 }), 'vitality').taille, 'Ra');
  assert.equal(bestRune(item({ vitality: 106 }), 'vitality').taille, 'Pa');
});

test('exos : un PA et un PM, sur deux anneaux différents sans la caractéristique', () => {
  const stuff = loadStuff({ rings: [14879, 14077], dofus: [7115] }); // Anneau Tique, Anneau du Comte Harebourg, Ivoire
  const [a, b] = [14879, 14077];
  const withAP = [a, b].filter((id) => (loadItem(id).stats.actionPoints ?? 0) > 0);
  const free = [a, b].filter((id) => !withAP.includes(id));
  assert.deepEqual(validateForgemagie({ [free[0]]: { exo: 'movementPoints' } }, stuff), []);
  assert.match(validateForgemagie({ [a]: { exo: 'actionPoints' }, [b]: { exo: 'actionPoints' } }, stuff).join(), /plus d'un exo PA/);
  assert.match(validateForgemagie({ 7115: { exo: 'actionPoints' } }, stuff).join(), /exo hors anneau/);
  assert.match(validateForgemagie({ 7115: { trans: { stat: 'vitality', taille: 'Ra', value: 100 } } }, stuff).join(), /impossible sur ce type/);
});

test('forgemagie ajoutée au total final', () => {
  const fake = { rings: [{ id: 1, stats: {} }], helmet: { id: 2, stats: {} } };
  assert.deepEqual(forgemagieStats({ 1: { exo: 'actionPoints' }, 2: { trans: { stat: 'chance', taille: 'Ra', value: 20 } } }, fake),
    { actionPoints: 1, chance: 20 });
  const stuff = loadStuff({ rings: [14879] });
  const cible = { degats: { sorts: [] }, contraintes: {} };
  const ap = loadItem(14879).stats.actionPoints ?? 0;
  const r = evaluate(stuff, cible, {}, ap ? {} : { 14879: { exo: 'actionPoints' } });
  assert.equal(r.totals.actionPoints, 7 + ap + (ap ? 0 : 1));
});

test('toPublishFormat : rune sur une caractéristique absente de l\'objet → exo', async () => {
  const { toPublishFormat } = await import('../src/forgemagie.js');
  const stuff = { helmet: { id: 1, stats: { vitality: 300 } }, cape: { id: 2, stats: { damagePercent: 10 } } };
  const out = toPublishFormat({
    1: { trans: { stat: 'dealtDamageMultiplierDistance', taille: 'TA', value: 1 } },
    2: { trans: { stat: 'damagePercent', taille: 'TA', value: 6 } },
  }, stuff);
  assert.deepEqual(out['1'], { stats: {}, exos: [{ stat: 'dealtDamageMultiplierDistance', value: 1 }] });
  assert.deepEqual(out['2'], { stats: { damagePercent: 16 }, exos: [] });
});

test('Dracorunes élémentaires : caractéristique + dommages convertis, cible déjà présente interdite', () => {
  const st = { strength: 80, earthDamageBonus: 10, vitality: 300 };
  assert.deepEqual(applyDraco(st, { rune: 'Emeraude', from: 'Terre' }), { agility: 80, airDamageBonus: 10, vitality: 300 });
  assert.equal(applyDraco({ strength: 80, agility: 40 }, { rune: 'Emeraude', from: 'Terre' }), null);
  assert.equal(applyDraco({ neutralDamageBonus: 10 }, { rune: 'Ocre', from: 'Terre' }), null); // Neutre jamais touché
  assert.deepEqual(applyDraco({ strength: -50 }, { rune: 'Pourpre', from: 'Terre' }), { intelligence: -50 }); // malus converti
});

test('Dracorune Ivoire : rés. fixe et % d\'un élément vers un élément absent', () => {
  const st = { earthElementResistPercent: 10, earthElementReduction: 15, fireElementResistPercent: 5 };
  assert.deepEqual(applyDraco(st, { rune: 'Ivoire', from: 'Terre', to: 'Air' }),
    { airElementResistPercent: 10, airElementReduction: 15, fireElementResistPercent: 5 });
  assert.equal(applyDraco(st, { rune: 'Ivoire', from: 'Terre', to: 'Feu' }), null);
});

test('Dracorune Ébène : 70 % du max, arrondi inférieur, négatifs conservés, Neutre ignoré', () => {
  assert.deepEqual(applyDraco({ strength: 100, chance: 100 }, { rune: 'Ebene' }), { damagePercent: 70 });
  assert.deepEqual(applyDraco({ strength: 100, earthDamageBonus: 10, chance: 50, waterDamageBonus: 5 }, { rune: 'Ebene' }),
    { damagePercent: 70, allDamageBonus: 7 });
  assert.deepEqual(applyDraco({ strength: 55, agility: -20, neutralDamageBonus: 4 }, { rune: 'Ebene' }),
    { agility: -20, neutralDamageBonus: 4, damagePercent: 38 });
});

test('transcendance puis Dracorune : bonus conservé, élément transcendé = déjà présent', () => {
  const it = { id: 9, name: 'x', stats: { strength: 80 } };
  assert.deepEqual(itemStatsAfter(it, { trans: { stat: 'strength', taille: 'TA', value: 10 }, draco: { rune: 'Emeraude', from: 'Terre' } }),
    { agility: 90 });
  const afterTrans = { strength: 80, agility: 20 };
  assert.ok(!dracoOptions(afterTrans).some((d) => d.rune === 'Emeraude'));
});

test('publication : lignes converties à 0, lignes nouvelles en exos', () => {
  const it = { id: 9, name: 'x', stats: { strength: 80, vitality: 300 } };
  const out = toPublishFormat({ 9: { draco: { rune: 'Emeraude', from: 'Terre' } } }, { helmet: it });
  assert.deepEqual(out, { 9: { stats: { strength: 0 }, exos: [{ stat: 'agility', value: 80 }] } });
});

test('familier / monture / montilier : aucune forgemagie possible', () => {
  const stuff = loadStuff({ pet: 1728 }); // Chacha
  assert.match(validateForgemagie({ 1728: { trans: { stat: 'vitality', taille: 'Ra', value: 100 } } }, stuff).join(), /transcendance impossible sur ce type/);
  assert.match(validateForgemagie({ 1728: { draco: { rune: 'Ébène' } } }, stuff, { forgemagie: { dracorunes: true } }).join(), /Dracorune impossible sur ce type/);
});
