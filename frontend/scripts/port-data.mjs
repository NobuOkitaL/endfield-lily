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
const WEAPON_ADD_JS = resolve(ROOT, 'reference/zmdgraph/js/weaponAdd.js');
const OUT_DIR = resolve(__dirname, '../src/data');

/** Load a JS file and extract the requested top-level const names via new Function. */
function extractConstsFromFile(filePath, names) {
  const fileContent = readFileSync(filePath, 'utf8');
  const fn = new Function(fileContent + `\nreturn { ${names.join(', ')} };`);
  return fn();
}

/** Load data.js and extract the requested top-level const names via new Function. */
function extractConsts(names) {
  return extractConstsFromFile(DATA_JS, names);
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
// weapons case (Task 6)
// ─────────────────────────────────────────────────────────────────────────────

function portWeapons() {
  console.log('Porting weapons...');

  // Extract from data.js
  const {
    WEAPON_LEVEL_STAGES,
    WEAPON_BREAK_GENERAL,
    WEAPON_BREAK_4_BASE,
    WEAPON_AVATARS,
  } = extractConstsFromFile(DATA_JS, [
    'WEAPON_LEVEL_STAGES',
    'WEAPON_BREAK_GENERAL',
    'WEAPON_BREAK_4_BASE',
    'WEAPON_AVATARS',
  ]);

  // Extract from weaponAdd.js
  const { WEAPON_LIST, WEAPON_BREAK_4_SPECIAL } = extractConstsFromFile(
    WEAPON_ADD_JS,
    ['WEAPON_LIST', 'WEAPON_BREAK_4_SPECIAL'],
  );

  // Validation: WEAPON_LIST has a reasonable count (>= 50)
  if (!Number.isInteger(WEAPON_LIST.length) || WEAPON_LIST.length < 50) {
    throw new Error(
      `Validation failed: WEAPON_LIST.length (${WEAPON_LIST.length}) is not a positive integer >= 50`,
    );
  }
  console.log(`  Found ${WEAPON_LIST.length} weapons in WEAPON_LIST.`);

  // Validation: WEAPON_BREAK_GENERAL must have exactly keys '1', '2', '3'
  const generalKeys = Object.keys(WEAPON_BREAK_GENERAL).sort();
  if (JSON.stringify(generalKeys) !== JSON.stringify(['1', '2', '3'])) {
    throw new Error(
      `Validation failed: WEAPON_BREAK_GENERAL keys are ${JSON.stringify(generalKeys)}, expected ["1","2","3"]`,
    );
  }

  // Validation: WEAPON_LEVEL_STAGES length >= 80
  if (WEAPON_LEVEL_STAGES.length < 80) {
    throw new Error(
      `Validation failed: WEAPON_LEVEL_STAGES.length (${WEAPON_LEVEL_STAGES.length}) < 80`,
    );
  }
  console.log(`  WEAPON_LEVEL_STAGES has ${WEAPON_LEVEL_STAGES.length} entries (max level: ${WEAPON_LEVEL_STAGES[WEAPON_LEVEL_STAGES.length - 1].to}).`);

  // Validation: every weapon in WEAPON_LIST must have an entry in WEAPON_AVATARS and WEAPON_BREAK_4_SPECIAL
  for (const w of WEAPON_LIST) {
    if (!WEAPON_AVATARS[w.name]) {
      throw new Error(
        `Validation failed: WEAPON_AVATARS is missing key for weapon "${w.name}"`,
      );
    }
    if (WEAPON_BREAK_4_SPECIAL[w.name] === undefined) {
      throw new Error(
        `Validation failed: WEAPON_BREAK_4_SPECIAL is missing key for weapon "${w.name}"`,
      );
    }
  }
  console.log(`  WEAPON_AVATARS and WEAPON_BREAK_4_SPECIAL cover all ${WEAPON_LIST.length} weapons.`);

  const weaponListJson = JSON.stringify(WEAPON_LIST, null, 2);
  const weaponAvatarsJson = JSON.stringify(WEAPON_AVATARS, null, 2);
  const weaponLevelStagesJson = JSON.stringify(WEAPON_LEVEL_STAGES, null, 2);
  const weaponBreakGeneralJson = JSON.stringify(WEAPON_BREAK_GENERAL, null, 2);
  const weaponBreak4BaseJson = JSON.stringify(WEAPON_BREAK_4_BASE, null, 2);
  const weaponBreak4SpecialJson = JSON.stringify(WEAPON_BREAK_4_SPECIAL, null, 2);

  const output = [
    `// frontend/src/data/weapons.ts`,
    `// Auto-generated from reference/zmdgraph/js/{data,weaponAdd}.js \u2014 do not edit by hand.`,
    ``,
    `import type { MaterialName } from './materials';`,
    ``,
    `export type WeaponStar = 3 | 4 | 5 | 6;`,
    ``,
    `export type Weapon = { name: string; star: WeaponStar };`,
    ``,
    `export const WEAPON_LIST: Weapon[] = ${weaponListJson};`,
    ``,
    `export const WEAPON_AVATARS: Record<string, string> = ${weaponAvatarsJson};`,
    ``,
    `export type WeaponLevelStage = {`,
    `  from: number;`,
    `  to: number;`,
    `  \u6b66\u5668\u7ecf\u9a8c\u503c: number;`,
    `  \u6298\u91d1\u7968: number;`,
    `};`,
    ``,
    `export const WEAPON_LEVEL_STAGES: WeaponLevelStage[] = ${weaponLevelStagesJson};`,
    ``,
    `export const WEAPON_BREAK_GENERAL: Record<'1' | '2' | '3', Partial<Record<MaterialName, number>>> = ${weaponBreakGeneralJson};`,
    ``,
    `export const WEAPON_BREAK_4_BASE: Partial<Record<MaterialName, number>> = ${weaponBreak4BaseJson};`,
    ``,
    `export const WEAPON_BREAK_4_SPECIAL: Record<string, Partial<Record<MaterialName, number>>> = ${weaponBreak4SpecialJson};`,
    ``,
  ].join('\n');

  ensureOutDir();
  writeOut('weapons.ts', output);
  console.log('  weapons done.');
}

// ─────────────────────────────────────────────────────────────────────────────
// database case (Task 7)
// ─────────────────────────────────────────────────────────────────────────────

function portDatabase() {
  console.log('Porting database...');

  const { DATABASE } = extractConsts(['DATABASE']);

  if (!Array.isArray(DATABASE) || DATABASE.length === 0) {
    throw new Error('Validation failed: DATABASE is not a non-empty array');
  }
  console.log(`  Found ${DATABASE.length} rows in DATABASE.`);

  // Validate basic structure of each row
  for (let i = 0; i < DATABASE.length; i++) {
    const row = DATABASE[i];
    if (typeof row['干员'] !== 'string') {
      throw new Error(`Validation failed: row[${i}] 干员 is not a string: ${JSON.stringify(row)}`);
    }
    if (typeof row['升级项目'] !== 'string') {
      throw new Error(`Validation failed: row[${i}] 升级项目 is not a string: ${JSON.stringify(row)}`);
    }
    if (typeof row['现等级'] !== 'number') {
      throw new Error(`Validation failed: row[${i}] 现等级 is not a number: ${JSON.stringify(row)}`);
    }
    if (typeof row['目标等级'] !== 'number') {
      throw new Error(`Validation failed: row[${i}] 目标等级 is not a number: ${JSON.stringify(row)}`);
    }
    if (row['目标等级'] <= row['现等级']) {
      throw new Error(
        `Validation failed: row[${i}] 目标等级 (${row['目标等级']}) <= 现等级 (${row['现等级']}): ${JSON.stringify(row)}`,
      );
    }
  }

  // Count unique 升级项目 values
  const projects = new Set(DATABASE.map((r) => r['升级项目']));
  console.log(`  Unique 升级项目 values (${projects.size}): ${[...projects].join(', ')}`);

  // Sort by (升级项目, 干员, 现等级) for stable git diffs
  const rows = [...DATABASE];
  rows.sort((a, b) => {
    if (a['升级项目'] !== b['升级项目']) return a['升级项目'].localeCompare(b['升级项目']);
    if (a['干员'] !== b['干员']) return a['干员'].localeCompare(b['干员']);
    return a['现等级'] - b['现等级'];
  });

  // Render each row as a TS object literal with properly quoted keys
  // Keys that are not valid JS identifiers (contain digits, etc.) need quoting.
  function needsQuoting(key) {
    return !/^[a-zA-Z_$\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff][\w$\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff]*$/.test(key);
  }

  function renderRow(row) {
    const pairs = Object.entries(row).map(([k, v]) => {
      const keyStr = needsQuoting(k) ? JSON.stringify(k) : k;
      const valStr = typeof v === 'string' ? JSON.stringify(v) : String(v);
      return `${keyStr}: ${valStr}`;
    });
    return `  { ${pairs.join(', ')} },`;
  }

  const rowLines = rows.map(renderRow).join('\n');

  const output = [
    `// frontend/src/data/database.ts`,
    `// Auto-generated from reference/zmdgraph/js/data.js \u2014 do not edit by hand.`,
    `// ${rows.length} rows total.`,
    ``,
    `import type { MaterialName } from './materials';`,
    `import type { UpgradeProject } from './types';`,
    ``,
    `export interface UpgradeCostRow {`,
    `  \u5e72\u5458: string; // "" = generic`,
    `  \u5347\u7ea7\u9879\u76ee: UpgradeProject;`,
    `  \u73b0\u7b49\u7ea7: number;`,
    `  \u76ee\u6807\u7b49\u7ea7: number;`,
    `  // \u4ee5\u4e0b\u6240\u6709\u6750\u6599\u5b57\u6bb5\u5747\u53ef\u9009\u3001\u7a00\u758f\u5b58\u5728`,
    `  \u6298\u91d1\u7968?: number;`,
    `  \u4f5c\u6218\u8bb0\u5f55\u7ecf\u9a8c\u503c?: number;`,
    `  \u8ba4\u77e5\u8f7d\u4f53\u7ecf\u9a8c\u503c?: number;`,
    `  [mat: string]: number | string | undefined;`,
    `}`,
    ``,
    `export const DATABASE: UpgradeCostRow[] = [`,
    rowLines,
    `];`,
    ``,
  ].join('\n');

  ensureOutDir();
  writeOut('database.ts', output);
  console.log(`  database done (${rows.length} rows).`);
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
