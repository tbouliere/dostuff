#!/usr/bin/env node
// Cherche les meilleurs stuffs pour une cible (jusqu'à 3 propositions de score équivalent), les enregistre
// dans resultats/<nom>-<n>.json et les affiche.
//
// Usage : npm run optimise -- cibles/<nom>.json [--restarts 20] [--seed 1] [--ecart 0.03] [--publish]
//   --ecart    écart de score maximal d'une proposition par rapport à la meilleure (défaut 3 %)
//   --publish  publie chaque proposition sur DofusDB (identifiants dans .env)
// Ré-évaluation : npm run evaluate -- cibles/<nom>.json --stuff resultats/<nom>-1.json --points resultats/<nom>-1.points.json
//                 --forgemagie resultats/<nom>-1.forgemagie.json

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { optimise } from '../src/optimiseur.js';
import { SLOTS } from '../src/stuff.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const ciblePath = process.argv[2];
if (!ciblePath || ciblePath.startsWith('--')) {
  console.error('Usage : npm run optimise -- cibles/<nom>.json [--restarts 20] [--seed 1] [--ecart 0.03] [--publish]');
  process.exit(1);
}
const cible = JSON.parse(fs.readFileSync(ciblePath, 'utf8'));

const t0 = Date.now();
const { propositions, evals } = optimise(cible, {
  restarts: Number(arg('restarts', 20)),
  seed: Number(arg('seed', 1)),
  ecart: Number(arg('ecart', 0.03)),
  log: (m) => console.log(`  ${m}`),
});
console.log(`Recherche terminée : ${evals.toLocaleString('fr-FR')} évaluations en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (!propositions.length) {
  console.log('✖ Aucun stuff valide trouvé.');
  process.exit(1);
}

// Enregistrement.
fs.mkdirSync('resultats', { recursive: true });
// Uniquement <nom>-<n>.json / <nom>-<n>.points.json : ne pas toucher aux cibles dont le nom prolonge celui-ci.
const own = new RegExp(`^${cible.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+(\\.points)?\\.json$`);
for (const f of fs.readdirSync('resultats')) if (own.test(f)) fs.rmSync(`resultats/${f}`);
const files = propositions.map((p, i) => {
  const ids = Object.fromEntries(Object.entries(p.stuff).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => x.id) : v?.id]));
  const base = `resultats/${cible.nom}-${i + 1}`;
  fs.writeFileSync(`${base}.json`, JSON.stringify({ cible: cible.nom, rang: i + 1, score: p.result.score, valide: p.result.valide, ...ids }, null, 2));
  fs.writeFileSync(`${base}.points.json`, JSON.stringify(p.points, null, 2));
  fs.writeFileSync(`${base}.forgemagie.json`, JSON.stringify(p.fm ?? {}, null, 2));
  return base;
});

// Comparatif.
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const best = propositions[0].result.score;
console.log(`\n${propositions.length} proposition(s) à moins de ${Number(arg('ecart', 0.03)) * 100} % du meilleur score :\n`);
for (const [i, p] of propositions.entries()) {
  const t = p.result.totals;
  console.log(`  #${i + 1}  score ${fmt(p.result.score)} (${((p.result.score / best - 1) * 100).toFixed(1)} %)`
    + `  · dégâts ${fmt(p.result.detail.degats)} · bonus ${fmt(p.result.detail.bonus)} · pénalités ${fmt(p.result.detail.penalites)}`
    + `  · ${t.actionPoints} PA / ${t.movementPoints} PM / ${t.range ?? 0} PO  → ${files[i]}.json`);
}
if (propositions.length > 1) {
  console.log('\n  Différences avec #1 :');
  const list = (st) => Object.entries(SLOTS).flatMap(([slot]) => [st[slot]].flat().filter(Boolean).map((it) => `${it.name}`));
  const ref = list(propositions[0].stuff);
  for (const [i, p] of propositions.entries()) {
    if (!i) continue;
    const cur = list(p.stuff);
    const plus = cur.filter((n) => !ref.includes(n));
    const moins = ref.filter((n) => !cur.includes(n));
    console.log(`    #${i + 1} : + ${plus.join(', ')}\n         − ${moins.join(', ')}`);
  }
}

// Détail de chaque proposition via l'évaluateur (même calcul).
const extra = process.argv.includes('--publish') ? ['--publish'] : [];
for (const [i, base] of files.entries()) {
  console.log(`\n================ Proposition #${i + 1} ================`);
  process.stdout.write(execFileSync(process.execPath,
    ['--no-warnings', '--env-file-if-exists=.env', 'scripts/evaluate-stuff.js', ciblePath, '--stuff', `${base}.json`, '--points', `${base}.points.json`, '--forgemagie', `${base}.forgemagie.json`, ...extra]));
}
