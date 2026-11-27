// Tests de src/forgemagie.js (docs/forgemagie.md). Lancement : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestRune, validateForgemagie, forgemagieStats } from '../src/forgemagie.js';
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
  assert.deepEqual(forgemagieStats({ 1: { exo: 'actionPoints' }, 2: { trans: { stat: 'chance', taille: 'Ra', value: 20 } } }),
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
