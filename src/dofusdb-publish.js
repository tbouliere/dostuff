// Publication d'un stuff sur DofusDB (création via l'API, compte requis).
// Identifiants lus dans l'environnement (.env, ignoré par git) :
//   DOFUSDB_USERNAME, DOFUSDB_PASSWORD
// Le jeton n'est jamais stocké : on se reconnecte à chaque publication.

const API = 'https://api.dofusdb.fr';
const HEADERS = { 'User-Agent': 'dostuff-sync/0.1', Accept: 'application/json', 'Content-Type': 'application/json' };

async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: token ? { ...HEADERS, Authorization: `Bearer ${token}` } : HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DofusDB ${method} ${path} : HTTP ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function login() {
  const username = process.env.DOFUSDB_USERNAME;
  const password = process.env.DOFUSDB_PASSWORD;
  if (!username || !password) {
    throw new Error('DOFUSDB_USERNAME / DOFUSDB_PASSWORD manquants (voir .env.example)');
  }
  const { accessToken } = await call('POST', '/authentication', { strategy: 'local', username, password });
  return accessToken;
}

/** Crée le stuff sur DofusDB et renvoie son URL. */
export async function publishStuff(payload) {
  const token = await login();
  const created = await call('POST', '/stuffs', payload, token);
  return `https://dofusdb.fr/fr/tools/stuff/${created._id}`;
}

/**
 * Convertit une forgemagie au format du projet vers le format DofusDB.
 * Projet : { "<itemId>": { stats: { <keyword>: valeur }, exos: [{ stat: <keyword>, value }] } }
 *   - stats : valeurs finales des caractéristiques modifiées (les autres gardent leur jet max) ;
 *   - exos  : caractéristiques ajoutées hors jet (ex. +1 PA).
 * DofusDB : { "<itemId>": { stats: [ <valeur indexée par id de caractéristique> ], exos: [{ charac: <id>, value }] } }
 *   - stats doit contenir TOUTES les caractéristiques de l'objet (le site les affiche toutes).
 * @param {(id: number) => { stats: Record<string, number> }} loadItem objets à jets max (src/evaluation.js)
 * @param {Record<string, number>} keywordToId keyword → id de caractéristique
 */
export function toDofusDbForgemagie(forgemagie, loadItem, keywordToId) {
  const out = {};
  for (const [itemId, fm] of Object.entries(forgemagie ?? {})) {
    const values = { ...loadItem(Number(itemId)).stats, ...(fm.stats ?? {}) };
    const stats = [];
    for (const [kw, v] of Object.entries(values)) {
      const id = keywordToId[kw];
      if (id === undefined) throw new Error(`Forgemagie ${itemId} : caractéristique inconnue ${kw}`);
      stats[id] = v;
    }
    const exos = (fm.exos ?? []).map((e) => {
      const id = keywordToId[e.stat];
      if (id === undefined) throw new Error(`Forgemagie ${itemId} : exo sur caractéristique inconnue ${e.stat}`);
      return { charac: id, value: e.value };
    });
    out[itemId] = { stats: Array.from(stats, (v) => v ?? null), exos };
  }
  return out;
}
