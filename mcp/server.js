#!/usr/bin/env node
// Serveur MCP « dofus » : accès en lecture aux classes, sorts et objets de la base locale
// data/dofus.db (aucun appel à l'API DofusDB). Transport stdio.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listClasses, classSpells, spellDetail, readOnlyQuery } from '../src/classes.js';

const server = new McpServer({ name: 'dofus', version: '0.1.0' });

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const safe = (fn) => async (args) => {
  try {
    return json(await fn(args));
  } catch (err) {
    return { content: [{ type: 'text', text: `Erreur : ${err.message}` }], isError: true };
  }
};

server.registerTool('list_classes', {
  title: 'Lister les classes',
  description: 'Liste les classes jouables (id, nom, nombre de sorts).',
  inputSchema: {},
}, safe(() => listClasses()));

server.registerTool('class_spells', {
  title: 'Sorts d\'une classe',
  description:
    'Résumé de tous les sorts d\'une classe au niveau 200, groupés par paire de variantes (une seule utilisable par paire) : coût PA, portée et portée modifiable, % critique de base, '
    + 'limites de lancer, lignes de dégâts (élément, min, max, moyenne) en normal et en critique (absent = ne critique pas), '
    + 'poussées (cases), sorts secondaires résolus (pièges, glyphes, runes, « lance le sort ») et autres effets. '
    + 'Formules de dégâts : docs/degats.md.',
  inputSchema: { classe: z.string().describe('Nom (ex. « Sram ») ou id de la classe') },
}, safe(({ classe }) => classSpells(classe)));

server.registerTool('spell_detail', {
  title: 'Détail d\'un sort',
  description:
    'Détail brut d\'un sort : niveau de sort complet et tous les effets normaux / critiques '
    + '(effect_id, min, max, élément, cibles, déclencheurs, durée, zone). Grade max accessible au niveau 200 par défaut.',
  inputSchema: {
    spell_id: z.number().int().describe('Id du sort'),
    grade: z.number().int().optional().describe('Grade précis (sinon le plus haut accessible au niveau 200)'),
  },
}, safe(({ spell_id, grade }) => spellDetail(spell_id, grade)));

server.registerTool('query', {
  title: 'Requête SQL (lecture seule)',
  description:
    'Exécute une requête SELECT/WITH sur data/dofus.db (base ouverte en lecture seule, 200 lignes max). '
    + 'Schéma et conventions : docs/dofusdb-sync.md. Tables : breeds, breed_spells, spells, spell_levels, '
    + 'spell_effects, effects, characteristics, items, item_effects, item_types, item_sets, item_set_bonuses, sync_meta.',
  inputSchema: { sql: z.string().describe('Requête SELECT ou WITH') },
}, safe(({ sql }) => readOnlyQuery(sql)));

await server.connect(new StdioServerTransport());
