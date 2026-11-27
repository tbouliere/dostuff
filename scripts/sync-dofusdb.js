#!/usr/bin/env node
// Synchronise les équipements de l'API DofusDB dans une base SQLite locale.
//
// Usage : node scripts/sync-dofusdb.js [--refresh]
//   --refresh   ignore le cache local et retélécharge depuis l'API
// Env :
//   DELAY_MS    pause entre deux requêtes (défaut 1000)
//   DB_PATH     chemin de la base (défaut data/dofus.db)
//
// L'API est respectée : requêtes strictement séquentielles, pause entre chaque,
// backoff sur 429/5xx, et cache disque des réponses brutes pour ne pas la
// re-solliciter quand on relance le script.
// Licence des données : voir l'en-tête x-license de https://api.dofusdb.fr/

import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const API = 'https://api.dofusdb.fr';
const PAGE_SIZE = 50; // maximum accepté par l'API
const DELAY_MS = Number(process.env.DELAY_MS ?? 1000);
const MAX_RETRIES = 5;
const USER_AGENT = 'dostuff-sync/0.1';
const CACHE_DIR = '.cache/dofusdb';
const DB_PATH = process.env.DB_PATH ?? 'data/dofus.db';
const REFRESH = process.argv.includes('--refresh');

// Groupes de super-types gardés. Chaque groupe fait l'objet d'une requête
// paginée distincte, ce qui permet d'en ajouter un sans invalider le cache
// des autres.
const ITEM_GROUPS = [
  // 1 Amulette, 2 Arme, 3 Anneau, 4 Ceinture, 5 Bottes, 7 Bouclier,
  // 10 Chapeau, 11 Cape, 13 Dofus/Trophée/Prysmaradite
  { label: 'stuff', superTypes: [1, 2, 3, 4, 5, 7, 10, 11, 13] },
  // 12 Familier (familiers, montiliers, montures)
  { label: 'familiers/montures', superTypes: [12] },
];
const SUPER_TYPES = new Set(ITEM_GROUPS.flatMap((g) => g.superTypes));
// Types exclus dans ces super-types : outils de métier (pelle, pioche, hache…
// sont des armes mais la pioche/l'outil ne servent qu'aux métiers).
const EXCLUDED_TYPES = new Set([20 /* Outil */, 21 /* Pioche */]);

const ITEM_FIELDS = [
  'id', 'name', 'level', 'typeId', 'itemSetId', 'iconId', 'img',
  'criterions', 'effects', 'isLegendary', 'exchangeable', 'etheral',
  // armes
  'apCost', 'minRange', 'range', 'criticalHitProbability',
  'criticalHitBonus', 'maxCastPerTurn', 'twoHanded', 'castInLine',
  'castInDiagonal', 'castTestLos',
];

// ---------------------------------------------------------------------------
// HTTP : séquentiel, throttlé, avec cache disque
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
let requestCount = 0;
let cacheHits = 0;

function buildUrl(endpoint, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const x of v) qs.append(`${k}[]`, String(x));
    else qs.append(k, String(v));
  }
  return `${API}/${endpoint}?${qs}`;
}

async function throttledFetch(url) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    requestCount++;

    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch (err) {
      res = { ok: false, status: 0, statusText: err.message, headers: new Headers() };
    }
    if (res.ok) return res.json();

    const retryable = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`HTTP ${res.status} ${res.statusText} sur ${url}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
    console.warn(`  ⚠ HTTP ${res.status}, nouvel essai dans ${backoff / 1000}s…`);
    await sleep(backoff);
  }
}

async function getJson(endpoint, params) {
  const url = buildUrl(endpoint, params);
  const key = createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, endpoint, `${key}.json`);
  if (!REFRESH) {
    try {
      const cached = JSON.parse(await readFile(file, 'utf8'));
      cacheHits++;
      return cached;
    } catch { /* pas en cache */ }
  }
  const json = await throttledFetch(url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(json));
  return json;
}

/** Récupère toutes les pages d'un endpoint. */
async function fetchAll(endpoint, params = {}, label = endpoint) {
  const all = [];
  let total = Infinity;
  for (let skip = 0; skip < total; skip += PAGE_SIZE) {
    const page = await getJson(endpoint, { ...params, $limit: PAGE_SIZE, $skip: skip, '$sort[id]': 1 });
    total = page.total;
    all.push(...page.data);
    process.stdout.write(`\r  ${label} : ${all.length}/${total}`);
    if (page.data.length === 0) break;
  }
  process.stdout.write('\n');
  return all;
}

/** Récupère des documents par id, par lots de PAGE_SIZE. */
async function fetchByIds(endpoint, ids, params = {}, label = endpoint) {
  const all = [];
  const sorted = [...ids].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += PAGE_SIZE) {
    const chunk = sorted.slice(i, i + PAGE_SIZE);
    const page = await getJson(endpoint, { ...params, 'id[$in]': chunk, $limit: PAGE_SIZE });
    all.push(...page.data);
    process.stdout.write(`\r  ${label} : ${all.length}/${sorted.length}`);
  }
  process.stdout.write('\n');
  return all;
}

// Effets dont dice_num désigne un autre sort (dice_side = grade). Les dégâts réels
// sont souvent dans ce sort secondaire, on le récupère aussi.
const SPELL_REF_EFFECTS = new Set([
  400, 401, 402, 1091, 1165, 2022, 4040, // pose piège / glyphes / rune / glyphe-prison
  792, 1017, 1160, 2160, 2794, 2960,     // lance le sort #1 (sur la cible, le lanceur…)
]);
const SPELL_FIELDS = ['id', 'name', 'description', 'typeId', 'spellLevels'];
const SPELL_LEVEL_FIELDS = [
  'id', 'spellId', 'grade', 'minPlayerLevel', 'apCost', 'minRange', 'range', 'rangeCanBeBoosted',
  'criticalHitProbability', 'maxCastPerTurn', 'maxCastPerTarget', 'minCastInterval', 'initialCooldown',
  'globalCooldown', 'castInLine', 'castInDiagonal', 'castTestLos', 'needFreeCell', 'needTakenCell',
  'needFreeTrapCell', 'effects', 'criticalEffect',
];

/** Ids des sorts d'une paire de variantes. */
const variantSpellIds = (v) => v.spellIds ?? (v.spells ?? []).map((sp) => (typeof sp === 'object' ? sp.id : sp));

/** Sorts de classe + sorts référencés par leurs effets (récursif). */
async function fetchSpells(rootIds) {
  const spells = new Map();
  const spellLevels = [];
  let todo = new Set(rootIds);
  for (let depth = 0; todo.size && depth < 10; depth++) {
    const batch = (await fetchByIds('spells', todo, { $select: SPELL_FIELDS }, `sorts (niveau ${depth})`))
      .filter((sp) => !spells.has(sp.id));
    for (const sp of batch) spells.set(sp.id, sp);
    const levels = await fetchByIds('spell-levels', new Set(batch.flatMap((sp) => sp.spellLevels ?? [])),
      { $select: SPELL_LEVEL_FIELDS }, `niveaux de sort (niveau ${depth})`);
    spellLevels.push(...levels);
    todo = new Set();
    for (const l of levels) {
      for (const e of [...(l.effects ?? []), ...(l.criticalEffect ?? [])]) {
        if (SPELL_REF_EFFECTS.has(e.effectId) && e.diceNum > 0 && !spells.has(e.diceNum)) todo.add(e.diceNum);
      }
    }
  }
  return { spells: [...spells.values()], spellLevels };
}

// ---------------------------------------------------------------------------
// Base SQLite
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS characteristics (
  id          INTEGER PRIMARY KEY,
  keyword     TEXT,
  name        TEXT,
  category_id INTEGER
);
CREATE TABLE IF NOT EXISTS effects (
  id                INTEGER PRIMARY KEY,
  characteristic_id INTEGER,
  category          INTEGER,
  element_id        INTEGER,
  description       TEXT,
  bonus_type        INTEGER
);
CREATE TABLE IF NOT EXISTS breeds (
  id   INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE IF NOT EXISTS breed_spells (
  breed_id INTEGER NOT NULL REFERENCES breeds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  spell_id INTEGER NOT NULL,
  PRIMARY KEY (breed_id, position)
);
CREATE TABLE IF NOT EXISTS spell_variants (
  id       INTEGER NOT NULL,              -- id de la paire de variantes
  breed_id INTEGER,
  position INTEGER NOT NULL,              -- 0 / 1 : rang dans la paire
  spell_id INTEGER NOT NULL,
  PRIMARY KEY (id, position)
);
CREATE TABLE IF NOT EXISTS spells (
  id          INTEGER PRIMARY KEY,
  name        TEXT,
  description TEXT,
  type_id     INTEGER
);
CREATE TABLE IF NOT EXISTS spell_levels (
  id                    INTEGER PRIMARY KEY,
  spell_id              INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
  grade                 INTEGER,
  min_player_level      INTEGER,
  ap_cost               INTEGER,
  min_range             INTEGER,
  range                 INTEGER,
  range_can_be_boosted  INTEGER,
  crit_probability      INTEGER,
  max_cast_per_turn     INTEGER,
  max_cast_per_target   INTEGER,
  min_cast_interval     INTEGER,
  initial_cooldown      INTEGER,
  global_cooldown       INTEGER,
  cast_in_line          INTEGER,
  cast_in_diagonal      INTEGER,
  cast_test_los         INTEGER,
  need_free_cell        INTEGER,
  need_taken_cell       INTEGER,
  need_free_trap_cell   INTEGER
);
CREATE TABLE IF NOT EXISTS spell_effects (
  spell_level_id INTEGER NOT NULL REFERENCES spell_levels(id) ON DELETE CASCADE,
  critical       INTEGER NOT NULL,          -- 0 = effet normal, 1 = effet en coup critique
  position       INTEGER NOT NULL,
  effect_id      INTEGER,
  dice_num       INTEGER,
  dice_side      INTEGER,
  value          INTEGER,
  element_id     INTEGER,
  target_mask    TEXT,
  triggers       TEXT,
  duration       INTEGER,
  delay          INTEGER,
  random         INTEGER,
  effect_group   INTEGER,
  zone_shape     TEXT,
  zone_param1    INTEGER,
  zone_param2    INTEGER,
  PRIMARY KEY (spell_level_id, critical, position)
);
CREATE TABLE IF NOT EXISTS item_types (
  id            INTEGER PRIMARY KEY,
  super_type_id INTEGER,
  name          TEXT,
  super_type    TEXT
);
CREATE TABLE IF NOT EXISTS item_sets (
  id          INTEGER PRIMARY KEY,
  name        TEXT,
  is_cosmetic INTEGER
);
CREATE TABLE IF NOT EXISTS items (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  level              INTEGER,
  type_id            INTEGER REFERENCES item_types(id),
  set_id             INTEGER REFERENCES item_sets(id),
  icon_id            INTEGER,
  img                TEXT,
  criterions         TEXT,
  is_legendary       INTEGER,
  exchangeable       INTEGER,
  etheral            INTEGER,
  -- armes (NULL sinon)
  ap_cost            INTEGER,
  min_range          INTEGER,
  range              INTEGER,
  crit_probability   INTEGER,
  crit_bonus         INTEGER,
  max_cast_per_turn  INTEGER,
  two_handed         INTEGER,
  cast_in_line       INTEGER,
  cast_in_diagonal   INTEGER,
  cast_test_los      INTEGER
);
CREATE TABLE IF NOT EXISTS item_effects (
  item_id           INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  effect_id         INTEGER REFERENCES effects(id),
  characteristic_id INTEGER,
  min               INTEGER,
  max               INTEGER,
  element_id        INTEGER,
  category          INTEGER,
  PRIMARY KEY (item_id, position)
);
CREATE TABLE IF NOT EXISTS item_set_bonuses (
  set_id            INTEGER NOT NULL REFERENCES item_sets(id) ON DELETE CASCADE,
  item_count        INTEGER NOT NULL,
  position          INTEGER NOT NULL,
  effect_id         INTEGER REFERENCES effects(id),
  characteristic_id INTEGER,
  value             INTEGER,
  element_id        INTEGER,
  PRIMARY KEY (set_id, item_count, position)
);
CREATE INDEX IF NOT EXISTS idx_items_type   ON items(type_id);
CREATE INDEX IF NOT EXISTS idx_items_level  ON items(level);
CREATE INDEX IF NOT EXISTS idx_items_set    ON items(set_id);
CREATE INDEX IF NOT EXISTS idx_ie_charac    ON item_effects(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_sl_spell     ON spell_levels(spell_id);
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

const fr = (t) => t?.fr ?? null;
const bool = (b) => (b === undefined || b === null ? null : b ? 1 : 0);
const num = (n) => (n === undefined ? null : n);

// Dans l'API, "to" vaut 0 quand la valeur est fixe.
const range = (e) => ({ min: e.from, max: e.to && e.to !== 0 ? e.to : e.from });

function writeDb({ breeds, variants, spells, spellLevels, characteristics, effects, itemTypes, items, sets }) {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  db.exec('BEGIN');
  try {
    // On remplace entièrement les données : la sync est la source de vérité.
    for (const t of ['spell_effects', 'spell_levels', 'spells', 'spell_variants', 'breed_spells', 'item_set_bonuses', 'item_effects', 'items', 'item_sets', 'item_types', 'effects', 'characteristics', 'breeds']) {
      db.exec(`DELETE FROM ${t}`);
    }

    const insBreed = db.prepare('INSERT INTO breeds VALUES (?, ?)');
    const insBS = db.prepare('INSERT INTO breed_spells VALUES (?, ?, ?)');
    for (const b of breeds) {
      insBreed.run(b.id, fr(b.shortName));
      (b.breedSpellsId ?? []).forEach((sid, pos) => insBS.run(b.id, pos, sid));
    }

    const insVar = db.prepare('INSERT INTO spell_variants VALUES (?, ?, ?, ?)');
    for (const v of variants) variantSpellIds(v).forEach((sid, pos) => insVar.run(v.id, num(v.breedId), pos, sid));

    const insSpell = db.prepare('INSERT INTO spells VALUES (?, ?, ?, ?)');
    for (const sp of spells) insSpell.run(sp.id, fr(sp.name), fr(sp.description), num(sp.typeId));

    const spellIds = new Set(spells.map((sp) => sp.id));
    const insSL = db.prepare(`INSERT INTO spell_levels VALUES (${Array(20).fill('?').join(', ')})`);
    const insSE = db.prepare(`INSERT INTO spell_effects VALUES (${Array(17).fill('?').join(', ')})`);
    for (const l of spellLevels) {
      if (!spellIds.has(l.spellId)) continue;
      insSL.run(
        l.id, l.spellId, num(l.grade), num(l.minPlayerLevel), num(l.apCost), num(l.minRange), num(l.range),
        bool(l.rangeCanBeBoosted), num(l.criticalHitProbability), num(l.maxCastPerTurn), num(l.maxCastPerTarget),
        num(l.minCastInterval), num(l.initialCooldown), num(l.globalCooldown),
        bool(l.castInLine), bool(l.castInDiagonal), bool(l.castTestLos),
        bool(l.needFreeCell), bool(l.needTakenCell), bool(l.needFreeTrapCell),
      );
      for (const [critical, list] of [[0, l.effects], [1, l.criticalEffect]]) {
        (list ?? []).forEach((e, pos) => {
          const z = e.zoneDescr ?? {};
          insSE.run(
            l.id, critical, pos, num(e.effectId), num(e.diceNum), num(e.diceSide), num(e.value),
            num(e.effectElement), e.targetMask ?? null, e.triggers ?? null, num(e.duration), num(e.delay),
            num(e.random), num(e.group),
            z.shape !== undefined ? String.fromCharCode(z.shape) : null, num(z.param1), num(z.param2),
          );
        });
      }
    }

    const insChar = db.prepare('INSERT INTO characteristics VALUES (?, ?, ?, ?)');
    for (const c of characteristics) insChar.run(c.id, c.keyword ?? null, fr(c.name), num(c.categoryId));

    const insEff = db.prepare('INSERT INTO effects VALUES (?, ?, ?, ?, ?, ?)');
    for (const e of effects) {
      insEff.run(e.id, num(e.characteristic), num(e.category), num(e.elementId), fr(e.description), num(e.bonusType));
    }

    const insType = db.prepare('INSERT INTO item_types VALUES (?, ?, ?, ?)');
    for (const t of itemTypes) insType.run(t.id, t.superTypeId, fr(t.name), t.superTypeName ?? null);

    const insSet = db.prepare('INSERT INTO item_sets VALUES (?, ?, ?)');
    const insBonus = db.prepare('INSERT INTO item_set_bonuses VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const s of sets) {
      insSet.run(s.id, fr(s.name), bool(s.isCosmetic));
      // effects[i] = bonus quand on porte i+1 objets (effects[0] est toujours vide).
      (s.effects ?? []).forEach((bonuses, i) => {
        (bonuses ?? []).forEach((e, pos) => {
          insBonus.run(s.id, i + 1, pos, e.effectId, e.characteristic, e.from, e.elementId);
        });
      });
    }

    const setIds = new Set(sets.map((s) => s.id));
    const insItem = db.prepare(`INSERT INTO items VALUES (${Array(21).fill('?').join(', ')})`);
    const insIE = db.prepare('INSERT INTO item_effects VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const it of items) {
      insItem.run(
        it.id, fr(it.name) ?? `#${it.id}`, it.level, it.typeId,
        setIds.has(it.itemSetId) ? it.itemSetId : null,
        num(it.iconId), it.img ?? null, it.criterions || null,
        bool(it.isLegendary), bool(it.exchangeable), bool(it.etheral),
        num(it.apCost), num(it.minRange), num(it.range),
        num(it.criticalHitProbability), num(it.criticalHitBonus), num(it.maxCastPerTurn),
        bool(it.twoHanded), bool(it.castInLine), bool(it.castInDiagonal), bool(it.castTestLos),
      );
      (it.effects ?? []).forEach((e, pos) => {
        const { min, max } = range(e);
        insIE.run(it.id, pos, e.effectId, e.characteristic, min, max, e.elementId, e.category);
      });
    }

    const insMeta = db.prepare('INSERT OR REPLACE INTO sync_meta VALUES (?, ?)');
    insMeta.run('synced_at', new Date().toISOString());
    insMeta.run('source', API);
    insMeta.run('item_count', String(items.length));
    insMeta.run('spell_count', String(spells.length));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log(`Sync DofusDB → ${DB_PATH} (pause ${DELAY_MS} ms${REFRESH ? ', --refresh' : ''})`);

  console.log('1. Référentiels');
  const superTypes = await fetchAll('item-super-types', { $select: ['id', 'name'] }, 'super-types');
  const superName = new Map(superTypes.map((s) => [s.id, fr(s.name)]));
  const allTypes = await fetchAll('item-types', { $select: ['id', 'superTypeId', 'name'] }, 'types');
  const itemTypes = allTypes
    .filter((t) => SUPER_TYPES.has(t.superTypeId) && !EXCLUDED_TYPES.has(t.id))
    .map((t) => ({ ...t, superTypeName: superName.get(t.superTypeId) }));
  console.log(`  → ${itemTypes.length} types gardés : ${itemTypes.map((t) => fr(t.name)).join(', ')}`);

  const breeds = await fetchAll('breeds', { $select: ['id', 'shortName', 'breedSpellsId'] }, 'classes');
  const characteristics = await fetchAll('characteristics', { $select: ['id', 'keyword', 'name', 'categoryId'] });
  const effects = await fetchAll('effects', {
    $select: ['id', 'characteristic', 'category', 'elementId', 'description', 'bonusType'],
  });

  console.log('2. Équipements');
  const items = [];
  for (const group of ITEM_GROUPS) {
    const typeIds = itemTypes.filter((t) => group.superTypes.includes(t.superTypeId)).map((t) => t.id);
    items.push(...await fetchAll('items', { 'typeId[$in]': typeIds, $select: ITEM_FIELDS }, group.label));
  }

  console.log('3. Panoplies');
  const setIds = new Set(items.map((i) => i.itemSetId).filter((id) => id > 0));
  const sets = await fetchByIds('item-sets', setIds, { $select: ['id', 'name', 'isCosmetic', 'effects'] }, 'panoplies');

  console.log('4. Sorts de classe');
  const variants = await fetchAll('spell-variants', {}, 'variantes');
  const { spells, spellLevels } = await fetchSpells([
    ...breeds.flatMap((b) => b.breedSpellsId ?? []),
    ...variants.flatMap(variantSpellIds),
  ]);

  console.log('5. Écriture SQLite');
  await mkdir(path.dirname(DB_PATH), { recursive: true });
  writeDb({ breeds, variants, spells, spellLevels, characteristics, effects, itemTypes, items, sets });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✔ ${items.length} objets, ${sets.length} panoplies, ${spells.length} sorts — ${requestCount} requêtes API, ${cacheHits} depuis le cache, ${secs}s`);
}

main().catch((err) => {
  console.error('✖', err.message);
  process.exit(1);
});
