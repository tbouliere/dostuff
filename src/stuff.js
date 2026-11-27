// Définition d'un stuff — implémente les règles de docs/stuff.md.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Chemin absolu (le serveur MCP peut être lancé depuis un autre répertoire).
export const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL('../data/dofus.db', import.meta.url));

/** Emplacements : clé → nombre de places et types d'objets acceptés. */
export const SLOTS = {
  helmet: { label: 'Chapeau', count: 1, typeIds: [16] },
  cape: { label: 'Cape', count: 1, typeIds: [17] },
  amulet: { label: 'Amulette', count: 1, typeIds: [1] },
  rings: { label: 'Anneau', count: 2, typeIds: [9] },
  belt: { label: 'Ceinture', count: 1, typeIds: [10] },
  boots: { label: 'Bottes', count: 1, typeIds: [11] },
  weapon: { label: 'Arme', count: 1, typeIds: [2, 3, 4, 5, 6, 7, 8, 19, 22, 271] },
  shield: { label: 'Bouclier', count: 1, typeIds: [82] },
  pet: { label: 'Familier / monture', count: 1, typeIds: [18, 121, 331, 332, 333] },
  dofus: { label: 'Dofus / Trophée / Prysmaradite', count: 6, typeIds: [23, 151, 217] },
};

export const PRYSMARADITE_TYPE = 217;
export const EXCLUDED_ITEM_IDS = new Set([18691 /* Bouclier Fi'Squale */]);

const slotOfType = new Map(
  Object.entries(SLOTS).flatMap(([slot, s]) => s.typeIds.map((t) => [t, slot])),
);

/**
 * Charge les objets éligibles (types d'emplacement, exclusions, niveau ≤ maxLevel),
 * groupés par emplacement.
 */
export function loadEligibleItems({ maxLevel = 200, dbPath = DB_PATH } = {}) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const typeIds = [...slotOfType.keys()];
    const rows = db.prepare(`
      SELECT id, name, level, type_id AS typeId, set_id AS setId, criterions
      FROM items
      WHERE type_id IN (${typeIds.join(',')})
        AND level <= ?
        AND name NOT LIKE '%(MJ)%'
        -- objets de classe : effets de modification de sort (catégorie 3) ou condition de classe (PG)
        AND id NOT IN (SELECT item_id FROM item_effects WHERE category = 3)
        AND COALESCE(criterions, '') NOT LIKE '%PG%'
    `).all(maxLevel);
    const bySlot = Object.fromEntries(Object.keys(SLOTS).map((s) => [s, []]));
    for (const it of rows) {
      if (EXCLUDED_ITEM_IDS.has(it.id)) continue;
      bySlot[slotOfType.get(it.typeId)].push(it);
    }
    return bySlot;
  } finally {
    db.close();
  }
}

/** Nombre de panoplies équipées (au moins 2 objets différents de la même panoplie). */
export function equippedSetCount(items) {
  const perSet = new Map();
  for (const it of new Map(items.map((i) => [i.id, i])).values()) {
    if (it.setId) perSet.set(it.setId, (perSet.get(it.setId) ?? 0) + 1);
  }
  return [...perSet.values()].filter((n) => n >= 2).length;
}

/** Liste plate des objets portés. */
export const stuffItems = (stuff) => Object.values(stuff).flat().filter(Boolean);

/**
 * Vérifie les règles structurelles de docs/stuff.md.
 * Les conditions d'équipement sur les caractéristiques (CP, CM, …) ne sont pas
 * vérifiées ici : elles demandent le total du personnage (étape ultérieure).
 * @returns {string[]} liste des violations (vide si valide)
 */
export function validate(stuff, { level = 200 } = {}) {
  const errors = [];
  for (const [slot, def] of Object.entries(SLOTS)) {
    const v = stuff[slot];
    const list = def.count > 1 ? (v ?? []) : v ? [v] : [];
    if (list.length > def.count) errors.push(`${def.label} : ${list.length} objets pour ${def.count} places`);
    for (const it of list) {
      if (!def.typeIds.includes(it.typeId)) errors.push(`${it.name} : type ${it.typeId} interdit en ${def.label}`);
      if (it.level > level) errors.push(`${it.name} : niveau ${it.level} > ${level}`);
    }
  }

  const rings = stuff.rings ?? [];
  if (rings.length === 2 && rings[0].id === rings[1].id && rings[0].setId) {
    errors.push(`${rings[0].name} : anneau de panoplie porté en double`);
  }

  const dofus = stuff.dofus ?? [];
  if (new Set(dofus.map((d) => d.id)).size !== dofus.length) errors.push('Dofus/trophée en double');
  if (dofus.filter((d) => d.typeId === PRYSMARADITE_TYPE).length > 1) errors.push('Plus d\'une Prysmaradite');

  const items = stuffItems(stuff);
  const sets = equippedSetCount(items);
  for (const it of items) {
    if (it.criterions?.includes('pk<2') && !(sets < 2)) {
      errors.push(`${it.name} : condition pk<2 non respectée (${sets} panoplies équipées)`);
    }
  }
  return errors;
}

/** Format attendu par l'API DofusDB (POST /stuffs). */
export function toDofusDbPayload(stuff, { level = 200, name = 'dostuff' } = {}) {
  const id = (it) => it?.id ?? null;
  return {
    name,
    level,
    shared: 'unreferenced', // public | unreferenced (accessible par lien, non listé) | private
    items: {
      amulet: id(stuff.amulet),
      rings: (stuff.rings ?? []).map(id),
      boots: id(stuff.boots),
      helmet: id(stuff.helmet),
      cape: id(stuff.cape),
      belt: id(stuff.belt),
      pet: id(stuff.pet),
      dofus: (stuff.dofus ?? []).map(id),
      weapon: id(stuff.weapon),
      shield: id(stuff.shield),
    },
  };
}
