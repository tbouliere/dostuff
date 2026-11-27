#!/usr/bin/env node
// Génère un stuff aléatoire valide (règles structurelles de docs/stuff.md).
//
// Usage : npm run random -- [--seed 42] [--json] [--publish]
//   --json      affiche uniquement le JSON au format DofusDB (POST /stuffs)
//   --publish   crée le stuff sur DofusDB (identifiants dans .env) et affiche le lien
//
// Les objets à conditions sur les caractéristiques (CP<12, CM<6, CV>…, quêtes…)
// sont écartés : le personnage n'est pas encore défini, on ne peut pas les vérifier.
// Seule la condition pk<2 (trophées) est gérée.

import { publishStuff } from '../src/dofusdb-publish.js';
import { randomCharacter, toDofusDbCharacter, spentPoints, CHARAC_LABELS, CHARAC_POINTS } from '../src/personnage.js';
import { loadEligibleItems, validate, toDofusDbPayload, SLOTS, PRYSMARADITE_TYPE } from '../src/stuff.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const LEVEL = 200; // docs/personnage.md : tous les personnages sont niveau 200
const SEED = Number(arg('seed', Date.now() % 2 ** 32));
const JSON_ONLY = process.argv.includes('--json');
const PUBLISH = process.argv.includes('--publish');

// PRNG déterministe (mulberry32) pour pouvoir rejouer un tirage avec --seed.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (list) => list[Math.floor(rand() * list.length)];

const usable = (it) => !it.criterions || it.criterions === 'pk<2';
const bySlot = loadEligibleItems({ maxLevel: LEVEL });
for (const slot of Object.keys(bySlot)) bySlot[slot] = bySlot[slot].filter(usable);

function randomStuff() {
  const stuff = {};
  for (const [slot, def] of Object.entries(SLOTS)) {
    if (slot === 'rings') {
      const a = pick(bySlot.rings);
      // Le 2e anneau peut être le même seulement s'il n'est pas de panoplie.
      const b = pick(bySlot.rings.filter((r) => r.id !== a.id || !a.setId));
      stuff.rings = [a, b];
    } else if (slot === 'dofus') {
      const pool = [...bySlot.dofus];
      const chosen = [];
      while (chosen.length < def.count && pool.length) {
        const d = pool.splice(Math.floor(rand() * pool.length), 1)[0];
        if (d.typeId === PRYSMARADITE_TYPE && chosen.some((c) => c.typeId === PRYSMARADITE_TYPE)) continue;
        chosen.push(d);
      }
      stuff.dofus = chosen;
    } else {
      stuff[slot] = pick(bySlot[slot]);
    }
  }
  return stuff;
}

// Tirages jusqu'à obtenir un stuff valide (la règle pk<2 peut en invalider certains).
let stuff, errors, tries = 0;
do {
  stuff = randomStuff();
  errors = validate(stuff, { level: LEVEL });
  tries++;
} while (errors.length && tries < 1000);
if (errors.length) {
  console.error('✖ Aucun stuff valide trouvé :', errors);
  process.exit(1);
}

const perso = randomCharacter(rand);
const payload = {
  ...toDofusDbPayload(stuff, { level: LEVEL, name: `dostuff ${perso.breed.name} aléatoire (seed ${SEED})` }),
  ...toDofusDbCharacter(perso),
};
if (JSON_ONLY) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Stuff aléatoire niveau ${LEVEL} (seed ${SEED}, ${tries} tirage(s))\n`);
  console.log(`  Classe : ${perso.breed.name} (${perso.sexe === 'male' ? 'homme' : 'femme'})`);
  const invested = Object.entries(perso.base).filter(([, v]) => v > 0)
    .map(([c, v]) => `${CHARAC_LABELS[c]} ${v}`).join(', ');
  console.log(`  Points investis : ${invested} (${spentPoints(perso.base)}/${CHARAC_POINTS} points dépensés)`);
  console.log('  Parchemins : +100 partout\n');
  for (const [slot, def] of Object.entries(SLOTS)) {
    const list = [stuff[slot]].flat().filter(Boolean);
    for (const it of list) {
      console.log(`  ${def.label.padEnd(31)} ${String(it.id).padStart(6)}  niv ${String(it.level).padStart(3)}  ${it.name}`);
    }
  }
  console.log('\nJSON DofusDB :');
  console.log(JSON.stringify(payload));
}

if (PUBLISH) {
  try {
    console.log(`\nLien DofusDB : ${await publishStuff(payload)}`);
  } catch (err) {
    console.error(`\n✖ Publication impossible : ${err.message}`);
    process.exit(1);
  }
}
