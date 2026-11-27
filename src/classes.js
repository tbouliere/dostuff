// Accès aux classes et sorts depuis la base locale (aucun appel à l'API).
// Conventions : docs/dofusdb-sync.md (section Sorts) ; formules : docs/degats.md.
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './stuff.js';
import { LEVEL } from './personnage.js';

export const ELEMENTS = { '-1': null, 0: 'Neutre', 1: 'Terre', 2: 'Feu', 3: 'Eau', 4: 'Air' };

/** Effets de dégâts directs (formule docs/degats.md) : effect_id → élément. */
const DAMAGE_EFFECTS = new Map([
  [100, 'Neutre'], [97, 'Terre'], [99, 'Feu'], [96, 'Eau'], [98, 'Air'],
  [2822, 'meilleur élément'], [2832, 'pire élément'],
]);
/** Vols de vie : mêmes dégâts, le soin est ignoré. */
const STEAL_EFFECTS = new Map([
  [95, 'Neutre'], [92, 'Terre'], [94, 'Feu'], [91, 'Eau'], [93, 'Air'], [2828, 'meilleur élément'],
]);
const PUSH_EFFECTS = new Map([[5, 'repousse'], [1103, 'repousse (sans dommages)'], [6, 'attire']]);
/** Effets dont dice_num = id d'un sort lancé, dice_side = grade. */
const SPELL_REF_EFFECTS = new Map([
  [400, 'piège'], [401, 'glyphe (début de tour)'], [402, 'glyphe (fin de tour)'], [1091, 'glyphe-aura'],
  [1165, 'glyphe'], [2022, 'rune'], [4040, 'glyphe-prison'],
  [792, 'lance le sort'], [1017, 'lance le sort'], [1160, 'lance le sort'], [2160, 'lance le sort'],
  [2794, 'lance le sort'], [2960, 'lance le sort'],
]);
/** Effets modifiant un autre sort : dice_num = id du sort modifié. */
const SPELL_MOD_EFFECTS = new Set([280, 281, 285, 286, 290, 291, 292, 293, 296, 1035, 1036, 1045]);

let db;
const conn = () => (db ??= new DatabaseSync(DB_PATH, { readOnly: true }));
const all = (sql, ...p) => conn().prepare(sql).all(...p);
const get = (sql, ...p) => conn().prepare(sql).get(...p);

/** Requête SQL libre en lecture seule (SELECT / WITH uniquement). */
export function readOnlyQuery(sql, limit = 200) {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('Seules les requêtes SELECT / WITH sont autorisées');
  return all(sql).slice(0, limit);
}

export function listClasses() {
  return all(`SELECT b.id, b.name, COUNT(bs.spell_id) AS spells
              FROM breeds b LEFT JOIN breed_spells bs ON bs.breed_id = b.id GROUP BY b.id ORDER BY b.id`);
}

export function findClass(nameOrId) {
  const row = /^\d+$/.test(String(nameOrId))
    ? get('SELECT id, name FROM breeds WHERE id = ?', Number(nameOrId))
    : all('SELECT id, name FROM breeds').find(
      (b) => b.name.localeCompare(String(nameOrId), 'fr', { sensitivity: 'base' }) === 0,
    );
  if (!row) throw new Error(`Classe inconnue : ${nameOrId}. Classes : ${listClasses().map((c) => c.name).join(', ')}`);
  return row;
}

/** Niveau de sort : grade donné, sinon le plus haut accessible au niveau 200. */
function spellLevel(spellId, grade) {
  return grade
    ? get('SELECT * FROM spell_levels WHERE spell_id = ? AND grade = ?', spellId, grade)
    : get(`SELECT * FROM spell_levels WHERE spell_id = ? AND min_player_level <= ?
           ORDER BY grade DESC LIMIT 1`, spellId, LEVEL);
}

const spellName = (id) => get('SELECT name FROM spells WHERE id = ?', id)?.name ?? `#${id}`;

/** Rend une description d'effet DofusDB lisible (#1, #2, #3 et gabarits {{…}}). */
function render(desc, e) {
  if (!desc) return null;
  const hasRange = e.dice_side && e.dice_side !== e.dice_num;
  let s = desc
    .replace(/\{\{~1~2 à (-?)\}\}/g, hasRange ? ' à $1' : '')
    .replace(/\{\{~1~2[^}]*\}\}/g, hasRange ? ' à ' : '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<sprite[^>]*>/g, '');
  const ref = SPELL_MOD_EFFECTS.has(e.effect_id) ? spellName(e.dice_num) : e.dice_num;
  s = s.replace('#1', String(ref)).replace('#2', hasRange ? String(e.dice_side) : '').replace('#3', String(e.value));
  return s.replace(/\s+/g, ' ').trim();
}

function effectsOf(levelId, critical) {
  return all(`SELECT se.*, e.description FROM spell_effects se LEFT JOIN effects e ON e.id = se.effect_id
              WHERE se.spell_level_id = ? AND se.critical = ? ORDER BY se.position`, levelId, critical);
}

function damageLine(e) {
  const kind = DAMAGE_EFFECTS.has(e.effect_id) ? 'dommages' : 'vol';
  const element = (DAMAGE_EFFECTS.get(e.effect_id) ?? STEAL_EFFECTS.get(e.effect_id));
  const min = e.dice_num;
  const max = e.dice_side || e.dice_num;
  return { type: kind, element, min, max, moyenne: (min + max) / 2, ...(e.duration ? { duree: e.duration } : {}) };
}

/**
 * Résumé d'un sort au niveau 200 (ou au grade donné) : coûts, portée, dégâts normaux/critiques,
 * poussées, autres effets ; les sorts secondaires (pièges, glyphes, « lance le sort »…) sont résolus.
 */
export function spellSummary(spellId, { grade, depth = 0, seen = new Set() } = {}) {
  const sp = get('SELECT id, name, description FROM spells WHERE id = ?', spellId);
  if (!sp) return { id: spellId, absent: true };
  const l = spellLevel(spellId, grade);
  if (!l) return { id: sp.id, nom: sp.name, inaccessible_niveau_200: true };
  seen.add(`${spellId}/${l.grade}`);

  const out = {
    id: sp.id, nom: sp.name, description: sp.description, grade: l.grade,
    pa: l.ap_cost, portee: `${l.min_range}-${l.range}`, portee_modifiable: !!l.range_can_be_boosted,
    critique_base_pct: l.crit_probability,
    lancers_par_tour: l.max_cast_per_turn || null, lancers_par_cible: l.max_cast_per_target || null,
    relance: l.min_cast_interval || null, relance_initiale: l.initial_cooldown || null,
    ligne: !!l.cast_in_line, diagonale: !!l.cast_in_diagonal, ligne_de_vue: !!l.cast_test_los,
  };

  for (const [critical, key] of [[0, 'normal'], [1, 'critique']]) {
    const effects = effectsOf(l.id, critical);
    if (critical && !effects.length) continue; // le sort ne critique pas
    const block = { degats: [], poussees: [], sorts_secondaires: [], autres: [] };
    for (const e of effects) {
      if (DAMAGE_EFFECTS.has(e.effect_id) || STEAL_EFFECTS.has(e.effect_id)) block.degats.push(damageLine(e));
      else if (PUSH_EFFECTS.has(e.effect_id)) block.poussees.push({ type: PUSH_EFFECTS.get(e.effect_id), cases: e.dice_num });
      else if (SPELL_REF_EFFECTS.has(e.effect_id) && e.dice_num > 0) {
        const key2 = `${e.dice_num}/${e.dice_side}`;
        if (depth >= 3 || seen.has(key2)) {
          block.sorts_secondaires.push({ via: SPELL_REF_EFFECTS.get(e.effect_id), id: e.dice_num, nom: spellName(e.dice_num), deja_detaille: true });
        } else {
          block.sorts_secondaires.push({
            via: SPELL_REF_EFFECTS.get(e.effect_id),
            ...spellSummary(e.dice_num, { grade: e.dice_side || undefined, depth: depth + 1, seen }),
          });
        }
      } else {
        const txt = render(e.description, e);
        if (txt) block.autres.push(txt + (e.duration ? ` (${e.duration} tour(s))` : ''));
      }
    }
    for (const k of Object.keys(block)) if (!block[k].length) delete block[k];
    out[key] = block;
  }
  if (depth) {
    // Sort secondaire : seuls ses effets comptent (il n'est pas lancé par le joueur).
    for (const k of ['description', 'pa', 'portee', 'portee_modifiable', 'critique_base_pct', 'lancers_par_tour',
      'lancers_par_cible', 'relance', 'relance_initiale', 'ligne', 'diagonale', 'ligne_de_vue']) delete out[k];
  }
  return compact(out);
}

/** Retire les valeurs null / false / objets vides pour alléger la sortie. */
function compact(o) {
  for (const [k, v] of Object.entries(o)) if (v === null || v === false || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete o[k];
  return o;
}

/**
 * Tous les sorts d'une classe au niveau 200, groupés par paire de variantes (on n'équipe qu'une
 * variante par paire). Un sort secondaire commun à plusieurs sorts (ex. la chaîne « Pièges » du Sram)
 * n'est détaillé qu'une fois (`deja_detaille` ensuite).
 */
export function classSpells(nameOrId) {
  const cls = findClass(nameOrId);
  const pairs = all(`
    SELECT v.id AS pair, v.spell_id, v.position
    FROM spell_variants v
    LEFT JOIN breed_spells bs ON bs.breed_id = v.breed_id AND bs.spell_id IN
      (SELECT spell_id FROM spell_variants WHERE id = v.id)
    WHERE v.breed_id = ?
    ORDER BY COALESCE(bs.position, 99), v.id, v.position`, cls.id);
  const grouped = new Map();
  for (const r of pairs) {
    if (!grouped.has(r.pair)) grouped.set(r.pair, []);
    grouped.get(r.pair).push(r.spell_id);
  }
  const seen = new Set();
  return {
    classe: cls.name, id: cls.id, niveau: LEVEL,
    legende: 'paires de variantes (une seule variante utilisable par paire) ; portee "min-max" ; '
      + 'critique absent = le sort ne peut pas critiquer ; degats.moyenne = jet moyen (docs/degats.md)',
    paires: [...grouped.entries()].map(([pair, ids]) => ({
      paire: pair,
      variantes: ids.map((id) => spellSummary(id, { seen })),
    })),
  };
}

/** Détail brut d'un sort (tous les effets, zones, déclencheurs) au grade donné ou max niveau 200. */
export function spellDetail(spellId, grade) {
  const sp = get('SELECT * FROM spells WHERE id = ?', spellId);
  if (!sp) throw new Error(`Sort inconnu : ${spellId}`);
  const l = spellLevel(spellId, grade);
  if (!l) return { ...sp, inaccessible_niveau_200: true };
  const fx = (c) => effectsOf(l.id, c).map((e) => ({
    effet: render(e.description, e), effect_id: e.effect_id, min: e.dice_num, max: e.dice_side, value: e.value,
    element: ELEMENTS[e.element_id] ?? e.element_id, cibles: e.target_mask, declencheurs: e.triggers,
    duree: e.duration, delai: e.delay, zone: e.zone_shape ? `${e.zone_shape}${e.zone_param1}` : null,
  }));
  return { ...sp, niveau: l, effets: fx(0), effets_critiques: fx(1) };
}
