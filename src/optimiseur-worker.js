// Worker d'optimiseParallele : exécute une chaîne de recherche et renvoie ses solutions au thread principal.
import { parentPort, workerData } from 'node:worker_threads';
import { chaine } from './optimiseur.js';

const { cible, compteur, ...opts } = workerData;
// Redémarrages distribués : chaque worker prend le suivant dès qu'il est libre (compteur partagé).
const pris = new Int32Array(compteur);
const { found, evals } = chaine(cible, {
  ...opts,
  prendre: () => Atomics.add(pris, 0, 1) < opts.restarts,
  onStart: (value) => parentPort.postMessage({ type: 'depart', value }),
  onRestart: (value) => parentPort.postMessage({ type: 'redemarrage', value }),
});
parentPort.postMessage({ type: 'fin', found, evals });
