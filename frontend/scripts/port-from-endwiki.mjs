#!/usr/bin/env node
// frontend/scripts/port-from-endwiki.mjs
// Scrapes end.wiki (明日方舟：终末地 Wiki) and generates frontend TS data files.
//
// Usage:
//   node scripts/port-from-endwiki.mjs operators        — generates .endwiki-out/operators.ts
//   node scripts/port-from-endwiki.mjs weapons          — generates .endwiki-out/weapons.ts
//   node scripts/port-from-endwiki.mjs database         — generates .endwiki-out/database.ts
//   node scripts/port-from-endwiki.mjs verify-materials — checks materials.ts against end.wiki
//   node scripts/port-from-endwiki.mjs all              — runs all

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(__dirname, '..');
const CACHE_DIR = resolve(FRONTEND_DIR, '.endwiki-cache');
const OUT_DIR = resolve(__dirname, '.endwiki-out');
const BASE_URL = 'https://end.wiki';
const LANG_PREFIX = '/zh-Hans';

// ─── Cache layer ─────────────────────────────────────────────────────────────

function cacheKey(url) {
  return url.replace(/https?:\/\/end\.wiki/, '').replace(/\//g, '__').replace(/^__/, '') || 'root';
}

async function fetchPage(url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(url);
  const cachePath = resolve(CACHE_DIR, `${key}.html`);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf8');
  }
  console.log(`  GET ${url}`);
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh-Hans,zh;q=0.9', 'User-Agent': 'ZMD-endwiki-scraper/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  writeFileSync(cachePath, html, 'utf8');
  await sleep(200);
  return html;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/** Parse a number that may contain commas (e.g. "1,000") */
function parseNum(s) {
  if (!s) return 0;
  const clean = s.replace(/,/g, '').replace(/[×x]/gu, '').trim();
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
}

/** Parse item name + quantity from a mat-item text like "协议棱柱 ×6" */
function parseMaterialQty(text) {
  const norm = text.replace(/\s+/g, ' ').trim();
  // Pattern: "材料名 ×N" where N is a number possibly with commas
  const m = norm.match(/^(.+?)\s*[×x×]\s*([\d,]+)/u);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, '').trim();
  const qty = parseInt(m[2].replace(/,/g, ''), 10);
  if (isNaN(qty) || qty <= 0) return null;
  return { name, qty };
}

/** Parse material name from an <a href="/items/..."> link text.
 *  Link text format: "材料名 ×N    材料名 ★★★   description › "
 *  We want the first occurrence only. */
function parseLinkMaterialQty(text) {
  const norm = text.replace(/\s+/g, ' ').trim();
  // Match material name and quantity at start
  const m = norm.match(/^(.+?)\s+[×x]\s*([\d,]+)/u);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, '').trim();
  const qty = parseInt(m[2].replace(/,/g, ''), 10);
  if (isNaN(qty) || qty <= 0) return null;
  return { name, qty };
}

// ─── Canonical materials ──────────────────────────────────────────────────────

const CANONICAL_MATERIALS = [
  "折金票", "作战记录经验值", "认知载体经验值", "武器经验值",
  "高级认知载体", "初级认知载体",
  "高级作战记录", "中级作战记录", "初级作战记录",
  "协议圆盘组", "协议圆盘",
  "三相纳米片", "象限拟合液", "快子遴捡晶格", "D96钢样品四", "超距辉映管",
  "协议棱柱组", "协议棱柱",
  "轻红柱状菌", "中红柱状菌", "重红柱状菌",
  "晶化多齿叶", "纯晶多齿叶", "至晶多齿叶",
  "轻黯石", "中黯石", "重黯石",
  "血菌", "受蚀玉化叶", "燎石", "星门菌", "岩天使叶", "武陵石",
  "存续的痕迹",
  "武器检查单元", "武器检查装置", "武器检查套组",
  "强固模具", "重型强固模具",
];
const CANONICAL_SET = new Set(CANONICAL_MATERIALS);
const VIRTUAL_EXP = new Set(['作战记录经验值', '认知载体经验值', '武器经验值']);

/** Normalize a scraped material name to our canonical form */
function canonicalize(rawName) {
  const name = rawName.replace(/\s+/g, '').trim();
  if (CANONICAL_SET.has(name)) return name;
  // Try matching without whitespace
  for (const c of CANONICAL_MATERIALS) {
    if (c.replace(/\s+/g, '') === name) return c;
  }
  return name; // Return as-is if no canonical match
}

// ─── Character list ───────────────────────────────────────────────────────────

async function fetchCharacterList() {
  const html = await fetchPage(`${BASE_URL}${LANG_PREFIX}/characters/`);
  const $ = cheerio.load(html);
  const chars = [];
  const seen = new Set();

  $('a[href*="/characters/chr-"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.match(/\/characters\/chr-[^/]+\/$/)) return;
    // Must be exactly 3 path segments: zh-Hans / characters / chr-xxx
    const parts = href.split('/').filter(Boolean);
    if (parts.length !== 3) return;
    if (seen.has(href)) return;
    seen.add(href);

    const slug = href.match(/\/characters\/(chr-[^/]+)\/?$/)?.[1];
    // Name from img alt preferred
    let name = '';
    const img = $(el).find('img');
    if (img.length) name = (img.attr('alt') || '').trim();
    if (!name) name = $(el).text().replace(/NEW\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!name || !slug) return;

    chars.push({ name, slug, href });
  });

  return chars;
}

// ─── Character materials page ──────────────────────────────────────────────────
// DOM structure (from end.wiki):
//   <section.detail-section>
//     <h2>干员培养材料汇总</h2>
//     <div class="total-summary-grid">...</div>
//   </section>
//   <section.detail-section>
//     <h2>突破材料</h2>
//     <div class="break-summary">
//       <div>...</div> × 4 stages (stage 1..4 based on order)
//     </div>
//   </section>
//   <section.detail-section>
//     <h2>技能升级材料</h2>
//     <div> [h3 + div>table] </div> × 4 skills
//   </section>
//   <section.detail-section>
//     <h2>潜能与天赋升级材料</h2>
//     <div class="break-row"> × N levels, each has .break-stage text + .break-items > .mat-item
//   </section>
//   <section.detail-section>
//     <h2>好感度加成材料</h2>
//     <div class="break-row"> × N
//   </section>

async function fetchCharacterMaterials(slug, charName) {
  const url = `${BASE_URL}${LANG_PREFIX}/characters/${slug}/materials/`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const result = {
    charName,
    skills: [],       // [{skillName, rows: [{level, 折金票, materials}]}]
    talents: [],      // [{stageName, materials}]  talent levels
    favorability: [], // [{stageName, materials}]
    breakthroughs: [], // [{stage: 1..4, materials}]
  };

  // Helper: parse mat-item spans to get {name: qty} dict
  function parseMatItems(container) {
    const mats = {};
    $(container).find('.mat-item').each((_, matEl) => {
      // Text nodes inside .mat-item contain "材料名 ×N"
      const txt = $(matEl).contents()
        .filter((_, n) => n.nodeType === 3 /* text */)
        .map((_, n) => n.nodeValue || '').get()
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const parsed = parseMaterialQty(txt);
      if (parsed) {
        const canonical = canonicalize(parsed.name);
        mats[canonical] = (mats[canonical] || 0) + parsed.qty;
      }
    });
    return mats;
  }

  // Helper: parse item links in a table cell
  function parseItemLinks(cell) {
    const mats = {};
    $(cell).find('a[href*="/items/"]').each((_, a) => {
      const linkText = $(a).text().replace(/\s+/g, ' ').trim();
      const parsed = parseLinkMaterialQty(linkText);
      if (parsed && parsed.qty > 0) {
        const canonical = canonicalize(parsed.name);
        mats[canonical] = (mats[canonical] || 0) + parsed.qty;
      }
    });
    return mats;
  }

  // Find all sections by h2 text
  const sections = {};
  $('section.detail-section, section').each((_, sec) => {
    const h2 = $(sec).find('h2').first().text().trim();
    if (h2) sections[h2] = sec;
  });

  // ── Breakthroughs ──
  const breakSec = sections['突破材料'];
  if (breakSec) {
    // Each child div of break-summary (or direct children) = one stage
    const container = $(breakSec).find('.break-summary, div').first();
    let stageNum = 0;
    $(container).children('div').each((_, stageDiv) => {
      stageNum++;
      const mats = parseMatItems(stageDiv);
      // Also parse item links as fallback
      if (Object.keys(mats).length === 0) {
        $(stageDiv).find('a[href*="/items/"]').each((_, a) => {
          const txt = $(a).text().replace(/\s+/g, ' ').trim();
          const parsed = parseLinkMaterialQty(txt);
          if (parsed) {
            const canonical = canonicalize(parsed.name);
            mats[canonical] = (mats[canonical] || 0) + parsed.qty;
          }
        });
      }
      if (Object.keys(mats).length > 0) {
        result.breakthroughs.push({ stage: stageNum, materials: mats });
      }
    });
  }

  // ── Skills ──
  const skillSec = sections['技能升级材料'];
  if (skillSec) {
    // Each skill is in a direct child div of the section (after h2)
    // Each such div contains: h3 (skill name) + div > table
    $(skillSec).children('div').each((_, skillDiv) => {
      const skillName = $(skillDiv).find('h3').first().text().trim();
      if (!skillName) return;

      const rows = [];
      $(skillDiv).find('table').first().find('tr').each((rIdx, tr) => {
        if (rIdx === 0) return; // skip header
        const cells = $(tr).find('td');
        if (cells.length < 3) return;
        const lv = parseInt($(cells[0]).text().trim(), 10);
        const goldText = $(cells[1]).text().trim().replace(/,/g, '');
        const gold = parseInt(goldText, 10) || 0;
        if (isNaN(lv)) return;

        const materials = parseItemLinks(cells[2]);
        rows.push({ level: lv, 折金票: gold, materials });
      });

      if (rows.length > 0) {
        result.skills.push({ skillName, rows });
      }
    });
  }

  // ── Talent/潜能 ──
  const talentSec = sections['潜能与天赋升级材料'] || sections['天赋升级材料'];
  if (talentSec) {
    $(talentSec).find('.break-row').each((_, row) => {
      const stageName = $(row).find('.break-stage').text().trim();
      const mats = parseMatItems(row);
      if (Object.keys(mats).length > 0) {
        result.talents.push({ stageName, materials: mats });
      }
    });
  }

  // ── Favorability ──
  const favorSec = sections['好感度加成材料'];
  if (favorSec) {
    $(favorSec).find('.break-row').each((_, row) => {
      const stageName = $(row).find('.break-stage').text().trim();
      const mats = parseMatItems(row);
      if (Object.keys(mats).length > 0) {
        result.favorability.push({ stageName, materials: mats });
      }
    });
  }

  return result;
}

// ─── Weapons list ─────────────────────────────────────────────────────────────

async function fetchWeaponList() {
  const html = await fetchPage(`${BASE_URL}${LANG_PREFIX}/weapons/`);
  const $ = cheerio.load(html);
  const weapons = [];
  const seen = new Set();

  $('a[href*="/weapons/wpn-"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.match(/\/weapons\/wpn-[^/]+\/$/)) return;
    const parts = href.split('/').filter(Boolean);
    if (parts.length !== 3) return;
    if (seen.has(href)) return;
    seen.add(href);

    const slug = href.match(/\/weapons\/(wpn-[^/]+)\/?$/)?.[1] || '';

    // Star rating: look in link text or nearby text
    const linkText = $(el).text().replace(/NEW\s*/i, '').replace(/\s+/g, ' ').trim();
    const starMatch = linkText.match(/(\d+)[★*]/);
    const star = starMatch ? parseInt(starMatch[1], 10) : 0;

    // Name from img alt or text after star
    let name = '';
    const img = $(el).find('img');
    if (img.length) name = (img.attr('alt') || '').trim();
    if (!name) name = linkText.replace(/^\d+[★*]\s*/, '').trim();

    if (name && star >= 3 && star <= 6) {
      weapons.push({ name, star, slug });
    }
  });

  return weapons;
}

// ─── Weapon detail page ───────────────────────────────────────────────────────
// The weapon detail page has breakthrough sections with materials.
// We only need the 4th breakthrough special materials.

async function fetchWeaponDetail(weaponSlug) {
  const url = `${BASE_URL}${LANG_PREFIX}/weapons/${weaponSlug}/`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  // Weapon page DOM structure:
  //   div.breakthrough-stage × 4 (one per stage E1..E4)
  //     div.breakthrough-stage-header (contains "E4 Lv.80" text)
  //     div.breakthrough-materials
  //       span.mat-item × N
  //
  // Generic mats appear in all stages; special mats only in E4.
  const GENERIC_BREAK_MATS = new Set([
    '强固模具', '重型强固模具', '折金票', '轻黯石', '中黯石', '重黯石'
  ]);

  const break4Special = {};

  // Find the 4th breakthrough stage (E4)
  const stages = $('div.breakthrough-stage');
  if (stages.length >= 4) {
    const stage4 = stages.eq(3); // 0-indexed
    stage4.find('.mat-item').each((_, matEl) => {
      const txt = $(matEl).contents()
        .filter((_, n) => n.nodeType === 3)
        .map((_, n) => n.nodeValue || '').get()
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const parsed = parseMaterialQty(txt);
      if (parsed && parsed.qty > 0) {
        const canonical = canonicalize(parsed.name);
        if (!GENERIC_BREAK_MATS.has(canonical)) {
          break4Special[canonical] = Math.max(break4Special[canonical] || 0, parsed.qty);
        }
      }
    });
  }

  return { break4Special };
}

// ─── Items list ───────────────────────────────────────────────────────────────

async function fetchItemsList() {
  const html = await fetchPage(`${BASE_URL}${LANG_PREFIX}/items/`);
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('a[href*="/items/item-"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const slug = href.match(/\/items\/(item-[^/]+)\/?$/)?.[1];
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    let name = '';
    const img = $(el).find('img');
    if (img.length) name = (img.attr('alt') || '').trim();
    if (!name) name = $(el).text().replace(/\s+/g, ' ').trim();
    if (!name) return;

    items.push({ slug, name: name.trim() });
  });

  return items;
}

// ─── Operators subcommand ─────────────────────────────────────────────────────

async function cmdOperators() {
  console.log('=== Scraping operators from end.wiki ===');
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching character list...');
  const chars = await fetchCharacterList();
  console.log(`  Found ${chars.length} characters`);

  const characterList = [];
  const skillMapping = [];
  const seenNames = new Set();

  for (const char of chars) {
    const { name: charName, slug } = char;

    // Add to character list (first occurrence of each name)
    if (!seenNames.has(charName)) {
      seenNames.add(charName);
      characterList.push(charName);
    }

    console.log(`  Fetching materials for ${charName} (${slug})...`);
    const matData = await fetchCharacterMaterials(slug, charName);

    // Extract skill names from the skills section
    const skillNames = matData.skills.map(s => s.skillName);

    // Only add skill mapping for first occurrence of each char name
    if (!skillMapping.find(e => e['干员'] === charName)) {
      const entry = {
        '干员': charName,
        '技能1': skillNames[0] || '',
        '技能2': skillNames[1] || '',
        '技能3': skillNames[2] || '',
        '技能4': skillNames[3] || '',
      };
      skillMapping.push(entry);
    }
  }

  // EXCEPTIONS: preserve known exception
  const exceptions = [{ '干员': '管理员', '排除项目': '基建' }];

  // OPERATOR_AVATARS
  const avatars = {};
  for (const name of characterList) {
    avatars[name] = `images/avatars/${name}.png`;
  }

  const lines = [
    '// frontend/src/data/operators.ts',
    '// Auto-generated from end.wiki — do not edit by hand.',
    '',
    'export const CHARACTER_LIST = [',
    ...characterList.map(n => `  ${JSON.stringify(n)},`),
    '] as const;',
    '',
    'export type OperatorSkillMapping = {',
    '  干员: string;',
    '  技能1: string;',
    '  技能2: string;',
    '  技能3: string;',
    '  技能4: string;',
    '};',
    '',
    'export const SKILL_MAPPING: OperatorSkillMapping[] = [',
    ...skillMapping.map(e => `  ${JSON.stringify(e)},`),
    '];',
    '',
    'export const EXCEPTIONS: { 干员: string; 排除项目: string }[] = [',
    ...exceptions.map(e => `  ${JSON.stringify(e)},`),
    '];',
    '',
    'export const OPERATOR_AVATARS: Record<string, string> = {',
    ...Object.entries(avatars).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '};',
    '',
  ];

  const outPath = resolve(OUT_DIR, 'operators.ts');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\n  Wrote ${outPath}`);
  console.log(`  CHARACTER_LIST: ${characterList.length} entries`);
  console.log(`  SKILL_MAPPING: ${skillMapping.length} entries`);
}

// ─── Weapons subcommand ───────────────────────────────────────────────────────

async function cmdWeapons() {
  console.log('=== Scraping weapons from end.wiki ===');
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching weapon list...');
  const weapons = await fetchWeaponList();
  console.log(`  Found ${weapons.length} weapons`);

  // Fetch weapon detail pages for break4Special data
  const weaponDetails = [];
  for (const wpn of weapons) {
    console.log(`  Fetching details for ${wpn.name} (${wpn.slug})...`);
    const detail = await fetchWeaponDetail(wpn.slug);
    weaponDetails.push({
      name: wpn.name,
      star: wpn.star,
      slug: wpn.slug,
      break4Special: detail.break4Special,
    });
  }

  const weaponList = weaponDetails.map(w => ({ name: w.name, star: w.star }));

  const weaponAvatars = {};
  for (const w of weaponDetails) {
    weaponAvatars[w.name] = `images/weapons/${w.name}.png`;
  }

  // Build WEAPON_BREAK_4_SPECIAL from scraped data
  const break4Special = {};
  for (const w of weaponDetails) {
    if (Object.keys(w.break4Special).length > 0) {
      break4Special[w.name] = w.break4Special;
    }
  }

  // WEAPON_LEVEL_STAGES, WEAPON_BREAK_GENERAL, WEAPON_BREAK_4_BASE are static
  // — re-use from existing weapons.ts (same data, not scraped)
  const existingWeaponsTs = readFileSync(resolve(FRONTEND_DIR, 'src/data/weapons.ts'), 'utf8');

  const stagesMatch = existingWeaponsTs.match(/export const WEAPON_LEVEL_STAGES[\s\S]+?^];/m);
  const stagesBlock = stagesMatch ? stagesMatch[0] : 'export const WEAPON_LEVEL_STAGES: WeaponLevelStage[] = [];';

  const breakGenMatch = existingWeaponsTs.match(/export const WEAPON_BREAK_GENERAL[\s\S]+?^};/m);
  const breakGenBlock = breakGenMatch ? breakGenMatch[0] : 'export const WEAPON_BREAK_GENERAL: Record<\'1\'|\'2\'|\'3\', Partial<Record<MaterialName, number>>> = {};';

  const break4BaseMatch = existingWeaponsTs.match(/export const WEAPON_BREAK_4_BASE[\s\S]+?^};/m);
  const break4BaseBlock = break4BaseMatch ? break4BaseMatch[0] : 'export const WEAPON_BREAK_4_BASE: Partial<Record<MaterialName, number>> = {};';

  const lines = [
    '// frontend/src/data/weapons.ts',
    '// Auto-generated from end.wiki — do not edit by hand.',
    '',
    "import type { MaterialName } from './materials';",
    '',
    'export type WeaponStar = 3 | 4 | 5 | 6;',
    '',
    'export type Weapon = { name: string; star: WeaponStar };',
    '',
    'export const WEAPON_LIST: Weapon[] = [',
    ...weaponList.map(w => `  ${JSON.stringify(w)},`),
    '];',
    '',
    'export const WEAPON_AVATARS: Record<string, string> = {',
    ...Object.entries(weaponAvatars).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '};',
    '',
    'export type WeaponLevelStage = {',
    '  from: number;',
    '  to: number;',
    '  武器经验值: number;',
    '  折金票: number;',
    '};',
    '',
    stagesBlock,
    '',
    breakGenBlock,
    '',
    break4BaseBlock,
    '',
    'export const WEAPON_BREAK_4_SPECIAL: Record<string, Partial<Record<MaterialName, number>>> = {',
    ...Object.entries(break4Special).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '};',
    '',
  ];

  const outPath = resolve(OUT_DIR, 'weapons.ts');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\n  Wrote ${outPath}`);
  console.log(`  WEAPON_LIST: ${weaponList.length} entries`);
  console.log(`  WEAPON_BREAK_4_SPECIAL: ${Object.keys(break4Special).length} entries`);
}

// ─── Database subcommand ──────────────────────────────────────────────────────

async function cmdDatabase() {
  console.log('=== Scraping database from end.wiki ===');
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching character list...');
  const chars = await fetchCharacterList();
  console.log(`  Found ${chars.length} characters`);

  const rows = [];
  // Track which "generic" rows we've already emitted (keyed by "project:fromLv:toLv:matHash")
  const genericEmitted = new Set();

  // Helper: emit a row if it's generic and not yet seen, or if it's char-specific
  function emitGenericOnce(project, fromLv, toLv, materials) {
    const hash = `${project}:${fromLv}:${toLv}:${JSON.stringify(materials)}`;
    if (genericEmitted.has(hash)) return false;
    genericEmitted.add(hash);
    const row = { 干员: '', 升级项目: project, 现等级: fromLv, 目标等级: toLv };
    for (const [mat, qty] of Object.entries(materials)) {
      if (qty > 0) row[mat] = qty;
    }
    rows.push(row);
    return true;
  }

  // Also track which skills we've seen generics for (levels 2-9)
  const genericSkillsSeen = new Set();

  for (const char of chars) {
    const { name: charName, slug } = char;
    console.log(`  Processing ${charName} (${slug})...`);

    const matData = await fetchCharacterMaterials(slug, charName);

    const skillKeys = ['技能1', '技能2', '技能3', '技能4'];

    // ── Skill rows ──
    for (let si = 0; si < matData.skills.length && si < 4; si++) {
      const skill = matData.skills[si];
      const skillKey = skillKeys[si];

      for (const skillRow of skill.rows) {
        const lv = skillRow.level;
        const fromLv = lv - 1;
        const toLv = lv;
        const gold = skillRow['折金票'];
        const mats = skillRow.materials;

        const matWithGold = gold > 0 ? { 折金票: gold, ...mats } : { ...mats };

        if (lv <= 9) {
          // Generic row — same for all chars at levels 1-9
          const genericKey = `${skillKey}:${fromLv}:${toLv}`;
          if (!genericSkillsSeen.has(genericKey)) {
            genericSkillsSeen.add(genericKey);
            emitGenericOnce(skillKey, fromLv, toLv, matWithGold);
          }
        } else {
          // Char-specific specialization rows (levels 10-12)
          const row = { 干员: charName, 升级项目: skillKey, 现等级: fromLv, 目标等级: toLv };
          if (gold > 0) row['折金票'] = gold;
          for (const [mat, qty] of Object.entries(mats)) {
            if (qty > 0) row[mat] = qty;
          }
          rows.push(row);
        }
      }
    }

    // ── Talent rows ──
    // Stages: "氏族的礼仪 Lv.1" = talent for first talent, "狩猎嗅觉 Lv.1" = second talent
    // Map to level 0→1, 1→2, 2→3, 3→4 (talent levels)
    // We skip the "信物" (operator-specific collectibles) rows — those are in 潜能 section
    const talentRows = matData.talents.filter(t => {
      // Only include rows that have materials we care about (协议棱柱/组 etc.)
      return Object.keys(t.materials).some(m => m.includes('协议'));
    });

    for (let ti = 0; ti < talentRows.length; ti++) {
      const tlvl = talentRows[ti];
      const fromLv = ti;
      const toLv = ti + 1;

      // Try to emit as generic; if materials differ, emit as char-specific
      const mats = tlvl.materials;
      const genericHash = `天赋:${fromLv}:${toLv}:${JSON.stringify(mats)}`;
      if (!genericEmitted.has(genericHash)) {
        // First time seeing this level — check if there's already a different generic
        const levelKey = `天赋:${fromLv}:${toLv}:LEVEL_CLAIMED`;
        if (!genericEmitted.has(levelKey)) {
          // Emit as generic
          genericEmitted.add(genericHash);
          genericEmitted.add(levelKey);
          const row = { 干员: '', 升级项目: '天赋', 现等级: fromLv, 目标等级: toLv };
          for (const [mat, qty] of Object.entries(mats)) {
            if (qty > 0) row[mat] = qty;
          }
          rows.push(row);
        } else {
          // Already have a generic for this level — emit as char-specific
          const row = { 干员: charName, 升级项目: '天赋', 现等级: fromLv, 目标等级: toLv };
          for (const [mat, qty] of Object.entries(mats)) {
            if (qty > 0) row[mat] = qty;
          }
          rows.push(row);
        }
      }
      // If generic already emitted with exact same materials, skip
    }

    // ── Favorability (能力值（信赖）) rows ──
    for (let fi = 0; fi < matData.favorability.length; fi++) {
      const flvl = matData.favorability[fi];
      const fromLv = fi;
      const toLv = fi + 1;
      const mats = flvl.materials;

      const genericKey = `能力值（信赖）:${fromLv}:${toLv}:LEVEL_CLAIMED`;
      if (!genericEmitted.has(genericKey)) {
        genericEmitted.add(genericKey);
        const hash = `能力值（信赖）:${fromLv}:${toLv}:${JSON.stringify(mats)}`;
        genericEmitted.add(hash);
        const row = { 干员: '', 升级项目: '能力值（信赖）', 现等级: fromLv, 目标等级: toLv };
        for (const [mat, qty] of Object.entries(mats)) {
          if (qty > 0) row[mat] = qty;
        }
        rows.push(row);
      }
    }
  }

  // Add static generic rows from existing database.ts (基建, 精X等级, 精英阶段, 装备适配)
  // Read them from the existing file
  const existingDbTs = readFileSync(resolve(FRONTEND_DIR, 'src/data/database.ts'), 'utf8');
  const staticProjects = new Set(['基建', '精0等级', '精1等级', '精2等级', '精3等级', '精4等级', '精英阶段', '装备适配']);

  // Extract all row objects from existing DB
  const rowRegex = /\{[^{}]+\}/g;
  let match;
  while ((match = rowRegex.exec(existingDbTs)) !== null) {
    try {
      const rowStr = match[0]
        .replace(/(\w+):/g, '"$1":')  // quote unquoted keys
        .replace(/'/g, '"');           // single to double quotes
      const row = JSON.parse(rowStr);
      if (row['升级项目'] && staticProjects.has(row['升级项目'])) {
        rows.push(row);
      }
    } catch (_e) {
      // skip
    }
  }

  // Sort
  const projectOrder = [
    '精0等级', '精1等级', '精2等级', '精3等级', '精4等级',
    '精英阶段', '装备适配', '能力值（信赖）', '天赋', '基建',
    '技能1', '技能2', '技能3', '技能4',
  ];
  rows.sort((a, b) => {
    const ai = projectOrder.indexOf(a['升级项目']);
    const bi = projectOrder.indexOf(b['升级项目']);
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    if (a['干员'] !== b['干员']) {
      if (a['干员'] === '') return -1;
      if (b['干员'] === '') return 1;
      return a['干员'].localeCompare(b['干员']);
    }
    return (a['现等级'] || 0) - (b['现等级'] || 0);
  });

  const tsLines = [
    '// frontend/src/data/database.ts',
    '// Auto-generated from end.wiki — do not edit by hand.',
    `// ${rows.length} rows total.`,
    '',
    "import type { MaterialName } from './materials';",
    "import type { UpgradeProject } from './types';",
    '',
    'export interface UpgradeCostRow {',
    '  干员: string; // "" = generic',
    '  升级项目: UpgradeProject;',
    '  现等级: number;',
    '  目标等级: number;',
    '  // 以下所有材料字段均可选、稀疏存在',
    '  折金票?: number;',
    '  作战记录经验值?: number;',
    '  认知载体经验值?: number;',
    '  [mat: string]: number | string | undefined;',
    '}',
    '',
    'export const DATABASE: UpgradeCostRow[] = [',
    ...rows.map(r => `  ${JSON.stringify(r)},`),
    '];',
    '',
  ];

  const outPath = resolve(OUT_DIR, 'database.ts');
  writeFileSync(outPath, tsLines.join('\n'), 'utf8');
  console.log(`\n  Wrote ${outPath}`);
  console.log(`  DATABASE: ${rows.length} rows`);
}

// ─── verify-materials subcommand ──────────────────────────────────────────────

async function cmdVerifyMaterials() {
  console.log('=== Verifying materials.ts against end.wiki ===');

  console.log('Fetching items list from end.wiki...');
  const items = await fetchItemsList();
  console.log(`  Found ${items.length} items on end.wiki`);

  const wikiNamesNorm = new Set(items.map(i => i.name.replace(/\s+/g, '')));

  const realMaterials = CANONICAL_MATERIALS.filter(m => !VIRTUAL_EXP.has(m));

  const missing = [];
  const present = [];
  for (const mat of realMaterials) {
    const normMat = mat.replace(/\s+/g, '');
    if (wikiNamesNorm.has(normMat)) {
      present.push(mat);
    } else {
      missing.push(mat);
    }
  }

  console.log(`\n  Present in end.wiki: ${present.length}/${realMaterials.length}`);
  if (missing.length > 0) {
    console.log(`  MISSING from end.wiki: ${missing.length}`);
    for (const m of missing) console.log(`    - ${m}`);
  } else {
    console.log('  All materials present!');
  }

  // Check for new potentially relevant items on end.wiki
  const relevantNewItems = items.filter(i => {
    const n = i.name.replace(/\s+/g, '');
    const s = i.slug;
    const inCanonical = CANONICAL_MATERIALS.some(c => c.replace(/\s+/g, '') === n);
    const seemsRelevant = s.includes('item-char') || s.includes('item-plant') ||
      s.includes('item-wpn') || s.includes('item-weapon') || s.includes('item-stone') ||
      s.includes('item-ore');
    return !inCanonical && seemsRelevant;
  });

  if (relevantNewItems.length > 0) {
    console.log(`\n  Potential new materials on end.wiki (${relevantNewItems.length}):`);
    for (const i of relevantNewItems) console.log(`    + ${i.name} (${i.slug})`);
  } else {
    console.log('\n  No new relevant materials found on end.wiki.');
  }

  if (missing.length === 0) {
    console.log('\n  VERDICT: materials.ts is up to date. No changes needed.');
  } else {
    console.log(`\n  VERDICT: ${missing.length} canonical materials not found on end.wiki. Review needed.`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
if (!cmd) {
  console.error('Usage: node scripts/port-from-endwiki.mjs <operators|weapons|database|verify-materials|all>');
  process.exit(1);
}

const handlers = {
  operators: cmdOperators,
  weapons: cmdWeapons,
  database: cmdDatabase,
  'verify-materials': cmdVerifyMaterials,
  all: async () => {
    await cmdVerifyMaterials();
    await cmdOperators();
    await cmdWeapons();
    await cmdDatabase();
  },
};

if (!handlers[cmd]) {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

handlers[cmd]().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
