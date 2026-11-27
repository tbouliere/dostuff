#!/usr/bin/env node
// Évalue un stuff pour une cible : total final, conditions, dégâts par sort, score.
//
// Usage : npm run evaluate -- cibles/<nom>.json (--stuff stuff.json | --seed 42) [--points auto|points.json] [--publish]
//   --stuff    fichier JSON { helmet, cape, amulet, rings: [], belt, boots, weapon, shield, pet, dofus: [] } (ids),
//              ou un payload DofusDB (clé "items")
//   --seed     stuff aléatoire (npm run random) ; les objets imposés par la cible y sont placés
//   --points   "auto" (défaut : meilleure répartition, heuristique gloutonne) ou fichier { agility: 300, … }
//   --publish  publie le stuff et la répartition sur DofusDB (identifiants dans .env)
//   --forgemagie fichier.json  forgemagie du stuff (format de src/forgemagie.js : exo PA/PM, transcendance) ;
//              prise en compte dans l'évaluation et dans la publication

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadStuff, loadItem, evaluate, bestPoints } from '../src/evaluation.js';
import { SLOTS, toDofusDbPayload } from '../src/stuff.js';
import { CHARACS, CHARAC_LABELS, PARCHMENT } from '../src/personnage.js';
import { publishStuff, toDofusDbForgemagie } from '../src/dofusdb-publish.js';
import { describe as describeFm, toPublishFormat } from '../src/forgemagie.js';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../src/stuff.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ciblePath = process.argv[2];
if (!ciblePath || ciblePath.startsWith('--')) {
  console.error('Usage : npm run evaluate -- cibles/<nom>.json (--stuff stuff.json | --seed 42) [--points auto|fichier] [--publish]');
  process.exit(1);
}
const cible = JSON.parse(fs.readFileSync(ciblePath, 'utf8'));

// --- stuff
let ids;
if (arg('stuff')) {
  const raw = JSON.parse(fs.readFileSync(arg('stuff'), 'utf8'));
  ids = raw.items ?? raw;
} else {
  const seed = arg('seed') ?? String(Date.now() % 2 ** 32);
  ids = JSON.parse(execFileSync(process.execPath, ['--no-warnings', 'scripts/random-stuff.js', '--seed', seed, '--json'])).items;
  // Place les objets imposés par la cible dans leur emplacement.
  for (const id of cible.objets?.imposes ?? []) {
    const it = loadItem(id);
    const slot = Object.entries(SLOTS).find(([, d]) => d.typeIds.includes(it.typeId))?.[0];
    if (!slot) continue;
    if (SLOTS[slot].count > 1) {
      const list = ids[slot] ?? [];
      if (list.includes(id)) continue;
      const free = list.findIndex((x) => !(cible.objets.imposes ?? []).includes(x));
      if (free >= 0) list[free] = id; else list.push(id);
      ids[slot] = list.slice(0, SLOTS[slot].count);
    } else {
      ids[slot] = id;
    }
  }
  console.log(`Stuff aléatoire (seed ${seed}), objets imposés de la cible placés.`);
}
const stuff = loadStuff(ids);

// --- points
const fm = arg('forgemagie') ? JSON.parse(fs.readFileSync(arg('forgemagie'), 'utf8')) : {};
const pointsArg = arg('points') ?? 'auto';
const points = pointsArg === 'auto'
  ? bestPoints(stuff, cible, fm)
  : { ...Object.fromEntries(CHARACS.map((c) => [c, 0])), ...JSON.parse(fs.readFileSync(pointsArg, 'utf8')) };

const r = evaluate(stuff, cible, points, fm);

// --- affichage
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
console.log(`\nCible : ${cible.nom} (${cible.classe?.nom})\n`);
console.log('Stuff :');
for (const [slot, def] of Object.entries(SLOTS)) {
  for (const it of [stuff[slot]].flat().filter(Boolean)) {
    console.log(`  ${def.label.padEnd(31)} ${String(it.id).padStart(6)}  ${it.name}${it.criterions ? `  [${it.criterions}]` : ''}`);
  }
}
console.log(`\nPoints investis (${pointsArg === 'auto' ? 'auto' : pointsArg}) : `
  + CHARACS.filter((c) => points[c]).map((c) => `${CHARAC_LABELS[c]} ${points[c]}`).join(', ')
  + ` — ${r.detail.points_depenses}/995 points`);

const t = r.totals;
const show = [
  ['PA', 'actionPoints'], ['PM', 'movementPoints'], ['Portée', 'range'], ['PV', 'hitPoints'],
  ['Force', 'strength'], ['Intelligence', 'intelligence'], ['Chance', 'chance'], ['Agilité', 'agility'],
  ['Sagesse', 'wisdom'], ['Puissance', 'damagePercent'], ['Dommages', 'allDamageBonus'],
  ['Do Terre', 'earthDamageBonus'], ['Do Feu', 'fireDamageBonus'], ['Do Eau', 'waterDamageBonus'],
  ['Do Air', 'airDamageBonus'], ['Do Neutre', 'neutralDamageBonus'], ['Critique %', 'criticalHit'],
  ['Do Critiques', 'criticalDamageBonus'], ['Puissance pièges', 'trapDamageBonusPercent'],
  ['Do pièges', 'trapDamageBonus'], ['% Do sorts', 'dealtDamageMultiplierSpells'],
  ['% Do distance', 'dealtDamageMultiplierDistance'], ['% Do mêlée', 'dealtDamageMultiplierMelee'],
  ['Do poussée', 'pushDamageBonus'], ['Rés. Terre %', 'earthElementResistPercent'],
  ['Rés. Feu %', 'fireElementResistPercent'], ['Rés. Eau %', 'waterElementResistPercent'],
  ['Rés. Air %', 'airElementResistPercent'], ['Rés. Neutre %', 'neutralElementResistPercent'],
  ['Fuite', 'tackleEvade'], ['Tacle', 'tackleBlock'], ['Initiative', 'initiative'],
  ['Pods', 'weight'], ['Soins', 'healBonus'], ['Rés. poussée', 'pushDamageReduction'],
  ['Rés. critiques', 'criticalDamageReduction'], ['Retrait PA', 'apReduction'], ['Retrait PM', 'mpReduction'],
  ['Esquive PA', 'DodgeApLostProbability'], ['Esquive PM', 'DodgeMpLostProbability'],
  ['% Do armes', 'dealtDamageMultiplierWeapon'], ['Rés. mêlée %', 'receivedDamageMultiplierMelee'],
  ['Rés. distance %', 'receivedDamageMultiplierDistance'],
];
if (Object.keys(fm).length) {
  console.log('\nForgemagie :');
  const labels = { vitality: 'Vitalité', ...Object.fromEntries(show.map(([l, k]) => [k, l])) };
  for (const l of describeFm(fm, stuff)) console.log(`  ${l.replace(/ (\w+) \+/, (m, k) => ` ${labels[k] ?? k} +`)}`);
}
console.log('\nTotal final (après plafonds) :');
const cells = show.filter(([, k]) => t[k]).map(([l, k]) => `${l} ${fmt(t[k])}`);
for (let i = 0; i < cells.length; i += 6) console.log('  ' + cells.slice(i, i + 6).join(' · '));

console.log('\nDégâts moyens (cible de référence) :');
for (const d of r.degats) {
  const crit = d.critique === null ? 'pas de critique' : `critique ${fmt(d.critique)} à ${fmt(d.pCrit * 100)} %`;
  console.log(`  ${d.sort.padEnd(55)} ${d.element.padEnd(7)} normal ${fmt(d.normal).padStart(6)} · ${crit} → moyenne ${fmt(d.moyenne)} × poids ${d.poids}`);
}

console.log(`\nScore : ${fmt(r.score)}  (dégâts ${fmt(r.detail.degats)} + bonus ${fmt(r.detail.bonus)} − pénalités ${fmt(r.detail.penalites)})`);
console.log(r.valide ? '✔ Stuff valide' : '✖ Stuff invalide :');
for (const e of r.erreurs) console.log(`    - ${e}`);
for (const w of r.avertissements) console.log(`  ⚠ ${w}`);

if (process.argv.includes('--publish')) {
  const payload = {
    ...toDofusDbPayload(stuff, { name: `dostuff ${cible.nom} (score ${Math.round(r.score)})` }),
    breed: cible.classe?.id, sexe: 'male', base: points, parchment: { ...PARCHMENT },
  };
  if (arg('forgemagie')) {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const keywordToId = Object.fromEntries(db.prepare('SELECT keyword, id FROM characteristics').all().map((r) => [r.keyword, r.id]));
    payload.forgemagie = toDofusDbForgemagie(toPublishFormat(fm, stuff), loadItem, keywordToId);
    payload.name += ' + forgemagie';
  }
  try {
    console.log(`\nLien DofusDB : ${await publishStuff(payload)}`);
  } catch (err) {
    console.error(`\n✖ Publication impossible : ${err.message}`);
    process.exit(1);
  }
}
