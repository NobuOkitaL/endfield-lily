#!/usr/bin/env node
// frontend/scripts/port-data.mjs
// Data porting script: extracts constants from reference/zmdgraph/js/data.js
// and writes typed TS files to frontend/src/data/.
//
// Usage:
//   node scripts/port-data.mjs materials   — generate src/data/materials.ts
//   node scripts/port-data.mjs operators   — generate src/data/operators.ts  (Task 5)
//   node scripts/port-data.mjs weapons     — generate src/data/weapons.ts    (Task 6)
//   node scripts/port-data.mjs database    — generate src/data/database.ts   (Task 7)
//   node scripts/port-data.mjs all         — run all sub-commands in order

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const DATA_JS = resolve(ROOT, 'reference/zmdgraph/js/data.js');
const OUT_DIR = resolve(__dirname, '../src/data');

/** Load data.js and extract the requested top-level const names via new Function. */
function extractConsts(names) {
  const fileContent = readFileSync(DATA_JS, 'utf8');
  const fn = new Function(fileContent + `\nreturn { ${names.join(', ')} };`);
  return fn();
}

/** Ensure the output directory exists. */
function ensureOutDir() {
  mkdirSync(OUT_DIR, { recursive: true });
}

/** Write a file and report to stdout. */
function writeOut(filename, content) {
  const outPath = resolve(OUT_DIR, filename);
  writeFileSync(outPath, content, 'utf8');
  console.log(`  wrote ${outPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// materials case
// ─────────────────────────────────────────────────────────────────────────────

function portMaterials() {
  console.log('Porting materials...');

  const { MATERIAL_ICONS, WEAPON_EXP_VALUES } = extractConsts([
    'MATERIAL_ICONS',
    'WEAPON_EXP_VALUES',
  ]);

  const materialColumns = Object.keys(MATERIAL_ICONS);
  const count = materialColumns.length;
  console.log(`  Found ${count} materials in MATERIAL_ICONS.`);

  // Validation: virtual EXP materials must be present
  const requiredVirtualMaterials = [
    '\u4f5c\u6218\u8bb0\u5f55\u7ecf\u9a8c\u503c', // 作战记录经验值
    '\u8ba4\u77e5\u8f7d\u4f53\u7ecf\u9a8c\u503c', // 认知载体经验值
    '\u6b66\u5668\u7ecf\u9a8c\u503c',             // 武器经验值
  ];
  for (const name of requiredVirtualMaterials) {
    if (!MATERIAL_ICONS[name]) {
      throw new Error(`Validation failed: missing virtual EXP material "${name}"`);
    }
  }

  // Validation: all icon paths must be non-empty
  for (const [name, icon] of Object.entries(MATERIAL_ICONS)) {
    if (!icon) {
      throw new Error(`Validation failed: icon path is empty for material "${name}"`);
    }
  }

  // EXP card values:
  //   weapon values sourced from WEAPON_EXP_VALUES in data.js (verified below)
  //   record/cognition values sourced from utils.js:
  //     convertRecordExpToMaterials uses 10000 / 1000 / 200
  //     convertCognitionExpToMaterials uses 10000 / 1000
  const EXP_CARD_VALUES = {
    record: {
      '\u9ad8\u7ea7\u4f5c\u6218\u8bb0\u5f55': 10000,   // 高级作战记录
      '\u4e2d\u7ea7\u4f5c\u6218\u8bb0\u5f55': 1000,    // 中级作战记录
      '\u521d\u7ea7\u4f5c\u6218\u8bb0\u5f55': 200,     // 初级作战记录
    },
    cognition: {
      '\u9ad8\u7ea7\u8ba4\u77e5\u8f7d\u4f53': 10000,   // 高级认知载体
      '\u521d\u7ea7\u8ba4\u77e5\u8f7d\u4f53': 1000,    // 初级认知载体
    },
    weapon: {
      '\u6b66\u5668\u68c0\u67e5\u5957\u7ec4': 10000,   // 武器检查套组
      '\u6b66\u5668\u68c0\u67e5\u88c5\u7f6e': 1000,    // 武器检查装置
      '\u6b66\u5668\u68c0\u67e5\u5355\u5143': 200,     // 武器检查单元
    },
  };

  // Cross-validate weapon EXP against WEAPON_EXP_VALUES in data.js
  const weaponNameMap = {
    '\u6b66\u5668\u68c0\u67e5\u5957\u7ec4': 10000,  // 武器检查套组
    '\u6b66\u5668\u68c0\u67e5\u88c5\u7f6e': 1000,   // 武器检查装置
    '\u6b66\u5668\u68c0\u67e5\u5355\u5143': 200,    // 武器检查单元
  };
  for (const [name, expected] of Object.entries(weaponNameMap)) {
    if (WEAPON_EXP_VALUES[name] !== expected) {
      throw new Error(
        `Validation failed: EXP_CARD_VALUES.weapon["${name}"] is ${expected} ` +
          `but WEAPON_EXP_VALUES["${name}"] in data.js is ${WEAPON_EXP_VALUES[name]}`,
      );
    }
  }

  const columnsJson = JSON.stringify(materialColumns, null, 2);
  const iconsJson = JSON.stringify(MATERIAL_ICONS, null, 2);
  const expJson = JSON.stringify(EXP_CARD_VALUES, null, 2);

  const virtualSet = requiredVirtualMaterials.map(n => `'${n}'`).join(', ');

  const output = [
    `// frontend/src/data/materials.ts`,
    `// Auto-generated from reference/zmdgraph/js/data.js \u2014 do not edit by hand.`,
    ``,
    `export const MATERIAL_COLUMNS = ${columnsJson} as const;`,
    `export type MaterialName = typeof MATERIAL_COLUMNS[number];`,
    `export const MATERIAL_ICONS: Record<MaterialName, string> = ${iconsJson};`,
    `export const VIRTUAL_EXP_MATERIALS = new Set<MaterialName>([${virtualSet}]);`,
    `export const EXP_CARD_VALUES = ${expJson} as const;`,
    `export type ExpType = keyof typeof EXP_CARD_VALUES;`,
    ``,
  ].join('\n');

  ensureOutDir();
  writeOut('materials.ts', output);
  console.log('  materials done.');
}

// ─────────────────────────────────────────────────────────────────────────────
// operators case (Task 5)
// ─────────────────────────────────────────────────────────────────────────────

function portOperators() {
  console.log('Porting operators...');

  const { CHARACTER_LIST, SKILL_MAPPING, EXCEPTIONS, OPERATOR_AVATARS } = extractConsts([
    'CHARACTER_LIST',
    'SKILL_MAPPING',
    'EXCEPTIONS',
    'OPERATOR_AVATARS',
  ]);

  // Validate CHARACTER_LIST
  if (CHARACTER_LIST.length !== 25) {
    throw new Error(
      `Validation failed: expected CHARACTER_LIST.length === 25, got ${CHARACTER_LIST.length}`,
    );
  }
  console.log(`  Found ${CHARACTER_LIST.length} characters in CHARACTER_LIST.`);

  // Validate SKILL_MAPPING length matches CHARACTER_LIST
  if (SKILL_MAPPING.length !== CHARACTER_LIST.length) {
    throw new Error(
      `Validation failed: SKILL_MAPPING.length (${SKILL_MAPPING.length}) !== CHARACTER_LIST.length (${CHARACTER_LIST.length})`,
    );
  }
  console.log(`  SKILL_MAPPING has ${SKILL_MAPPING.length} rows.`);

  // Validate OPERATOR_AVATARS covers every character in CHARACTER_LIST
  for (const name of CHARACTER_LIST) {
    if (!OPERATOR_AVATARS[name]) {
      throw new Error(
        `Validation failed: OPERATOR_AVATARS is missing key for character "${name}"`,
      );
    }
  }
  console.log(`  OPERATOR_AVATARS covers all ${CHARACTER_LIST.length} characters.`);

  // Note: EXCEPTIONS length is intentionally NOT validated (currently 1, may grow)
  console.log(`  EXCEPTIONS has ${EXCEPTIONS.length} entries.`);

  const characterListJson = JSON.stringify(CHARACTER_LIST, null, 2);
  const skillMappingJson = JSON.stringify(SKILL_MAPPING, null, 2);
  const exceptionsJson = JSON.stringify(EXCEPTIONS, null, 2);
  const operatorAvatarsJson = JSON.stringify(OPERATOR_AVATARS, null, 2);

  const output = [
    `// frontend/src/data/operators.ts`,
    `// Auto-generated from reference/zmdgraph/js/data.js \u2014 do not edit by hand.`,
    ``,
    `export const CHARACTER_LIST = ${characterListJson} as const;`,
    ``,
    `export type OperatorSkillMapping = {`,
    `  \u5e72\u5458: string;`,
    `  \u6280\u80fd1: string;`,
    `  \u6280\u80fd2: string;`,
    `  \u6280\u80fd3: string;`,
    `  \u6280\u80fd4: string;`,
    `};`,
    ``,
    `export const SKILL_MAPPING: OperatorSkillMapping[] = ${skillMappingJson};`,
    ``,
    `export const EXCEPTIONS: { \u5e72\u5458: string; \u6392\u9664\u9879\u76ee: string }[] = ${exceptionsJson};`,
    ``,
    `export const OPERATOR_AVATARS: Record<string, string> = ${operatorAvatarsJson};`,
    ``,
  ].join('\n');

  ensureOutDir();
  writeOut('operators.ts', output);
  console.log('  operators done.');
}

// ─────────────────────────────────────────────────────────────────────────────
// weapons case (Task 6 — placeholder)
// ─────────────────────────────────────────────────────────────────────────────

function portWeapons() {
  throw new Error('portWeapons: not yet implemented (Task 6)');
}

// ─────────────────────────────────────────────────────────────────────────────
// database case (Task 7 — placeholder)
// ─────────────────────────────────────────────────────────────────────────────

function portDatabase() {
  throw new Error('portDatabase: not yet implemented (Task 7)');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

const subcommand = process.argv[2];

switch (subcommand) {
  case 'materials':
    portMaterials();
    break;
  case 'operators':
    portOperators();
    break;
  case 'weapons':
    portWeapons();
    break;
  case 'database':
    portDatabase();
    break;
  case 'all':
    portMaterials();
    portOperators();
    portWeapons();
    portDatabase();
    break;
  default:
    console.error(
      `Usage: node scripts/port-data.mjs <subcommand>\n` +
        `  subcommand: materials | operators | weapons | database | all`,
    );
    process.exit(1);
}
