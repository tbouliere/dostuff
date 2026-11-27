// Recherche multi-cœurs : une chaîne de recherche par worker (graine dérivée) ; les redémarrages sont distribués
// dynamiquement (chaque worker prend le suivant dès qu'il est libre, leur durée variant beaucoup), puis toutes
// les solutions trouvées sont fusionnées pour choisir les propositions.
// Avec workers = 1, le résultat est identique à optimise() (optimiseur.js) ; avec plusieurs workers, il dépend
// de l'ordre d'arrivée des redémarrages et n'est donc pas exactement reproductible d'un lancement à l'autre.

import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { choisirPropositions } from './optimiseur.js';

export async function optimiseParallele(cible, {
  restarts = 20, seed = 1, workers = os.availableParallelism(), log = () => {}, ...opts
} = {}) {
  const n = Math.max(1, Math.min(workers, restarts));
  const compteur = new SharedArrayBuffer(4);
  log(`${n} chaîne(s) en parallèle, ${restarts} redémarrages`);

  let done = 0;
  let best = -Infinity;
  const workersList = [];
  const run = (w) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimiseur-worker.js', import.meta.url), {
      workerData: { cible, ...opts, restarts, compteur, seed: seed + w * 1000003 },
    });
    workersList.push(worker);
    let result = null;
    worker.on('message', (m) => {
      if (m.type === 'depart') {
        // Le départ (stuff vide) est le même pour toutes les chaînes : affiché une seule fois.
        if (w === 0) log(`départ : ${m.value.toFixed(1)}`);
        best = Math.max(best, m.value);
      } else if (m.type === 'redemarrage') {
        done++;
        log(`redémarrage ${done}/${restarts} [chaîne ${w + 1}] : ${m.value.toFixed(1)}${m.value > best ? ' ★' : ''}`);
        best = Math.max(best, m.value);
      } else if (m.type === 'fin') result = m;
    });
    worker.on('error', reject);
    worker.on('exit', (code) => (result ? resolve(result) : reject(new Error(`chaîne ${w + 1} arrêtée (code ${code})`))));
  });

  let results;
  try {
    results = await Promise.all(Array.from({ length: n }, (_, w) => run(w)));
  } catch (e) {
    for (const wk of workersList) wk.terminate();
    throw e;
  }
  const found = results.flatMap((r) => r.found);
  return {
    propositions: choisirPropositions(found, cible, opts),
    evals: results.reduce((s, r) => s + r.evals, 0),
  };
}
