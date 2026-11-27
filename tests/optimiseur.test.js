// Tests de src/optimiseur.js. Lancement : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimise } from '../src/optimiseur.js';

// Stuff Huppermage complet : chapeau, cape, amulette, 2 anneaux, ceinture, bottes, arme, bouclier, familier, 6 Dofus.
const IMPOSES = [21235, 21230, 14094, 14092, 24035, 14095, 14093, 21229, 18718, 13673, 7115, 7754, 7043, 6980, 739, 29136];

test('toutes les positions imposées : pas de redémarrage, forgemagie et points optimisés', () => {
  const cible = {
    nom: 'test-tout-impose',
    classe: 17,
    bonus: { vitality: 1, agility: 1, actionPoints: 100, movementPoints: 50 },
    objets: { imposes: IMPOSES },
  };
  const { propositions, evals } = optimise(cible, { restarts: 3 });
  assert.ok(evals > 0);
  assert.ok(propositions.length >= 1);
  const ids = Object.values(propositions[0].stuff).flat().filter(Boolean).map((it) => it.id);
  assert.deepEqual([...ids].sort((a, b) => a - b), [...IMPOSES].sort((a, b) => a - b));
  assert.ok(Object.values(propositions[0].points).some((v) => v > 0), 'points répartis');
});
