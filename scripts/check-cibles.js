#!/usr/bin/env node
// Vérifie la conformité des fichiers cibles au format de docs/config-cible.md.
//
// Usage : npm run check-cibles [-- cibles/a.json cibles/b.json]   (sans argument : tout le dossier cibles/)
// Code de sortie 1 si au moins un fichier est non conforme.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../src/stuff.js';
import { CHARACS } from '../src/personnage.js';

const TYPES = new Set(['sort', 'piege', 'glyphe', 'rune', 'arme', 'poison']);
const PORTEES = new Set(['melee', 'distance']);
const ELEMENTS = new Set(['Neutre', 'Terre', 'Feu', 'Eau', 'Air', 'meilleur élément', 'pire élément']);
const SPECIAL_KEYS = new Set(['multiplicateur_final', 'puissance_par_pm', 'pm_contrainte', 'soin_pv_pct']);
const REQUIRED = ['version', 'nom', 'demande', 'classe', 'points', 'contraintes', 'degats', 'bonus', 'objets', 'analyse'];

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const keywords = new Set(db.prepare('SELECT keyword FROM characteristics').all().map((r) => r.keyword));
const one = (sql, ...p) => db.prepare(sql).get(...p);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isRange = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] <= v[1];

function check(file) {
  const errors = [];
  const err = (m) => errors.push(m);
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [`JSON invalide : ${e.message}`];
  }

  for (const k of REQUIRED) if (!(k in d)) err(`clé manquante : ${k}`);
  if (d.version !== 1) err(`version ${d.version} (attendu 1)`);
  if (d.nom && `${d.nom}.json` !== path.basename(file)) err(`nom « ${d.nom} » ≠ nom du fichier`);
  if (typeof d.analyse !== 'string' || d.analyse.trim().length < 20) err('analyse absente ou trop courte');

  // classe
  const cls = d.classe && one('SELECT id, name FROM breeds WHERE id = ?', d.classe.id);
  if (!cls) err(`classe inconnue : ${JSON.stringify(d.classe)}`);
  else if (d.classe.nom !== cls.name) err(`classe ${d.classe.id} = « ${cls.name} », pas « ${d.classe.nom} »`);

  // points
  if (d.points?.mode !== 'auto') err(`points.mode = ${d.points?.mode} (attendu "auto")`);
  for (const [k, v] of Object.entries(d.points?.minimum ?? {})) {
    if (!CHARACS.includes(k)) err(`points.minimum : caractéristique inconnue ${k}`);
    if (!isNum(v) || v < 0) err(`points.minimum.${k} invalide`);
  }

  // contraintes
  for (const [k, c] of Object.entries(d.contraintes ?? {})) {
    if (!keywords.has(k)) err(`contraintes : caractéristique inconnue ${k}`);
    if (!isNum(c.min)) err(`contraintes.${k}.min invalide`);
    if (typeof c.strict !== 'boolean') err(`contraintes.${k}.strict doit être true/false`);
    if (c.strict === false && !(isNum(c.penalite) && c.penalite > 0)) err(`contraintes.${k} : penalite > 0 requise si non strict`);
  }

  // dégâts
  const sorts = d.degats?.sorts;
  if (!Array.isArray(sorts) || !sorts.length) err('degats.sorts vide');
  for (const [i, s] of (sorts ?? []).entries()) {
    const at = `degats.sorts[${i}] « ${s.sort ?? '?'} »`;
    if (!s.sort) err(`${at} : nom manquant`);
    if (!TYPES.has(s.type)) err(`${at} : type « ${s.type} » non autorisé`);
    if (!PORTEES.has(s.portee)) err(`${at} : portee « ${s.portee} » non autorisée`);
    if (!ELEMENTS.has(s.element)) err(`${at} : element « ${s.element} » inconnu`);
    if (!isRange(s.normal)) err(`${at} : normal doit être [min, max]`);
    if (s.critique !== null && s.critique !== undefined && !isRange(s.critique)) err(`${at} : critique doit être [min, max] ou null`);
    if (!(isNum(s.poids) && s.poids > 0)) err(`${at} : poids > 0 requis`);
    if (s.id !== undefined && !one('SELECT 1 FROM spells WHERE id = ?', s.id)) err(`${at} : sort id ${s.id} absent de la base`);
  }
  const cible = d.degats?.cible ?? {};
  const RES_KEYS = {
    resistances_pct: new Set(['Terre', 'Feu', 'Eau', 'Air', 'Neutre', 'distance', 'melee']),
    resistances_fixes: new Set(['Terre', 'Feu', 'Eau', 'Air', 'Neutre', 'critique']),
  };
  for (const [k, allowed] of Object.entries(RES_KEYS)) {
    if (cible[k] === undefined) continue;
    if (typeof cible[k] !== 'object' || Array.isArray(cible[k])) { err(`degats.cible.${k} doit être un objet`); continue; }
    for (const [rk, v] of Object.entries(cible[k])) {
      if (!allowed.has(rk)) err(`degats.cible.${k} : clé « ${rk} » non autorisée`);
      if (!isNum(v)) err(`degats.cible.${k}.${rk} doit être un nombre`);
    }
  }

  // bonus
  for (const [k, v] of Object.entries(d.bonus ?? {})) {
    if (!keywords.has(k)) err(`bonus : caractéristique inconnue ${k}`);
    if (!isNum(v)) err(`bonus.${k} doit être un nombre`);
  }

  // objets
  const imposes = d.objets?.imposes ?? [];
  for (const id of [...imposes, ...(d.objets?.interdits ?? [])]) {
    if (!one('SELECT 1 FROM items WHERE id = ?', id)) err(`objets : id ${id} absent de la base`);
  }
  for (const [id, eff] of Object.entries(d.objets?.effets_conditionnels ?? {})) {
    if (!one('SELECT 1 FROM items WHERE id = ?', Number(id))) err(`effets_conditionnels : id ${id} absent de la base`);
    for (const [k, v] of Object.entries(eff)) {
      if (!keywords.has(k) && !SPECIAL_KEYS.has(k)) err(`effets_conditionnels.${id} : clé « ${k} » non autorisée`);
      if (!isNum(v)) err(`effets_conditionnels.${id}.${k} doit être un nombre`);
    }
  }
  // forgemagie (optionnel)
  if (d.forgemagie !== undefined) {
    for (const [k, v] of Object.entries(d.forgemagie)) {
      if (!['exo_pa', 'exo_pm', 'transcendance', 'dracorunes'].includes(k)) err(`forgemagie : clé « ${k} » non autorisée`);
      if (typeof v !== 'boolean') err(`forgemagie.${k} doit être true/false`);
    }
  }
  return errors;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync('cibles').filter((f) => f.endsWith('.json')).map((f) => path.join('cibles', f));

let failed = 0;
for (const f of files) {
  const errors = check(f);
  if (errors.length) {
    failed++;
    console.log(`✖ ${f}`);
    for (const e of errors) console.log(`    - ${e}`);
  } else {
    console.log(`✔ ${f}`);
  }
}
process.exit(failed ? 1 : 0);
