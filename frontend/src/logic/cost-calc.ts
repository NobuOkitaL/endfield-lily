// frontend/src/logic/cost-calc.ts
import { DATABASE } from '@/data/database';
import {
  WEAPON_LEVEL_STAGES,
  WEAPON_BREAK_GENERAL,
  WEAPON_BREAK_4_BASE,
  WEAPON_BREAK_4_SPECIAL,
} from '@/data/weapons';
import { MATERIAL_COLUMNS, type MaterialName } from '@/data/materials';
import type { CostMap, UpgradeProject, OperatorName, WeaponName } from '@/data/types';

export function emptyCost(): CostMap {
  return {};
}

export function addCost(a: CostMap, b: CostMap): CostMap {
  const out: Record<string, number> = { ...(a as Record<string, number>) };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number' && v !== 0) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out as CostMap;
}

export function aggregateCosts(costs: CostMap[]): CostMap {
  return costs.reduce((acc, c) => addCost(acc, c), emptyCost());
}

function extractRowCost(row: Record<string, number | string | undefined>): CostMap {
  const out: Record<string, number> = {};
  for (const col of MATERIAL_COLUMNS) {
    const v = row[col];
    if (typeof v === 'number' && v !== 0) out[col] = v;
  }
  return out as CostMap;
}

/**
 * 查某干员某升级项目从 from 到 to 的消耗。
 * 先试 operator-specific 精确匹配；再试 generic 精确匹配；再按单级累加。找不到返回 null。
 */
export function calculateProjectMaterials(
  operator: OperatorName,
  project: UpgradeProject,
  from: number,
  to: number,
): CostMap | null {
  if (from === to) return emptyCost();

  // 匹配干员特有行
  const opSpec = DATABASE.find(
    (r) =>
      r.干员 === operator &&
      r.升级项目 === project &&
      r.现等级 === from &&
      r.目标等级 === to,
  );
  if (opSpec) return extractRowCost(opSpec as Record<string, number | string | undefined>);

  // 匹配通用行
  const generic = DATABASE.find(
    (r) =>
      (r.干员 === '' || r.干员 === '通用') &&
      r.升级项目 === project &&
      r.现等级 === from &&
      r.目标等级 === to,
  );
  if (generic) return extractRowCost(generic as Record<string, number | string | undefined>);

  // 逐级累加
  let acc: CostMap = emptyCost();
  for (let lv = from; lv < to; lv++) {
    const row =
      DATABASE.find(
        (r) =>
          r.干员 === operator &&
          r.升级项目 === project &&
          r.现等级 === lv &&
          r.目标等级 === lv + 1,
      ) ??
      DATABASE.find(
        (r) =>
          (r.干员 === '' || r.干员 === '通用') &&
          r.升级项目 === project &&
          r.现等级 === lv &&
          r.目标等级 === lv + 1,
      );
    if (!row) return null;
    acc = addCost(acc, extractRowCost(row as Record<string, number | string | undefined>));
  }
  return acc;
}

// Minimum-overflow exp converter (matches upstream convertRecordExpToMaterials)
function convertRecordExpToMaterials(exp: number): Partial<Record<MaterialName, number>> {
  const maxHigh = Math.ceil(exp / 10000);
  let bestOverflow = Infinity;
  let bestCount = Infinity;
  let bestH = 0, bestM = 0, bestL = 0;
  for (let h = 0; h <= maxHigh; h++) {
    const highExp = h * 10000;
    let rem1 = exp - highExp;
    if (rem1 < 0) rem1 = 0;
    const maxMid = Math.ceil(rem1 / 1000);
    for (let m = 0; m <= maxMid; m++) {
      const midExp = m * 1000;
      let rem2 = rem1 - midExp;
      if (rem2 < 0) rem2 = 0;
      const low = Math.ceil(rem2 / 200);
      const totalExp = highExp + midExp + low * 200;
      const overflow = totalExp - exp;
      const totalCount = h + m + low;
      if (overflow < bestOverflow || (overflow === bestOverflow && totalCount < bestCount)) {
        bestOverflow = overflow;
        bestCount = totalCount;
        bestH = h; bestM = m; bestL = low;
      }
    }
  }
  const out: Partial<Record<MaterialName, number>> = {};
  if (bestH > 0) out['高级作战记录'] = bestH;
  if (bestM > 0) out['中级作战记录'] = bestM;
  if (bestL > 0) out['初级作战记录'] = bestL;
  return out;
}

// Minimum-overflow cognition exp converter (matches upstream convertCognitionExpToMaterials)
function convertCognitionExpToMaterials(exp: number): Partial<Record<MaterialName, number>> {
  const maxHigh = Math.ceil(exp / 10000);
  let bestOverflow = Infinity;
  let bestCount = Infinity;
  let bestH = 0, bestL = 0;
  for (let h = 0; h <= maxHigh; h++) {
    const highExp = h * 10000;
    let rem1 = exp - highExp;
    if (rem1 < 0) rem1 = 0;
    const low = Math.ceil(rem1 / 1000);
    const totalExp = highExp + low * 1000;
    const overflow = totalExp - exp;
    const totalCount = h + low;
    if (overflow < bestOverflow || (overflow === bestOverflow && totalCount < bestCount)) {
      bestOverflow = overflow;
      bestCount = totalCount;
      bestH = h; bestL = low;
    }
  }
  const out: Partial<Record<MaterialName, number>> = {};
  if (bestH > 0) out['高级认知载体'] = bestH;
  if (bestL > 0) out['初级认知载体'] = bestL;
  return out;
}

const LEVEL_BANDS: {
  project: UpgradeProject;
  min: number;
  max: number;
  expType: '作战记录经验值' | '认知载体经验值';
}[] = [
  { project: '精0等级', min: 1, max: 20, expType: '作战记录经验值' },
  { project: '精1等级', min: 20, max: 40, expType: '作战记录经验值' },
  { project: '精2等级', min: 40, max: 60, expType: '作战记录经验值' },
  { project: '精3等级', min: 60, max: 80, expType: '认知载体经验值' },
  { project: '精4等级', min: 80, max: 90, expType: '认知载体经验值' },
];

/**
 * 计算干员等级从 from 到 to 的升级材料（跨阶段时分段处理）。
 * 与上游 calculateLevelMaterials 对齐：
 *   - 只查通用行（干员=""或"通用"）
 *   - 收集区间内所有行的 exp 并一次性转换为卡片
 *   - 同时记录原始 exp 总量（作战记录经验值 / 认知载体经验值）
 */
export function calculateLevelMaterials(operator: OperatorName, from: number, to: number): CostMap {
  if (from >= to) return {};

  const total: Record<string, number> = {};
  let totalRecordExp = 0;
  let totalCognitionExp = 0;

  for (const band of LEVEL_BANDS) {
    if (from < band.max && to > band.min) {
      const stageCur = Math.max(from, band.min);
      const stageTar = Math.min(to, band.max);
      if (stageCur < stageTar) {
        // 收集通用行 exp 和 折金票
        const rows = DATABASE.filter(
          (r) =>
            (r.干员 === '' || r.干员 === '通用') &&
            r.升级项目 === band.project &&
            (r.现等级 as number) >= stageCur &&
            (r.目标等级 as number) <= stageTar,
        );
        let stageExp = 0;
        for (const row of rows) {
          const coin = typeof row['折金票'] === 'number' ? row['折金票'] : 0;
          if (coin !== 0) total['折金票'] = (total['折金票'] ?? 0) + coin;
          if (band.expType === '作战记录经验值') {
            stageExp += (typeof row['作战记录经验值'] === 'number' ? row['作战记录经验值'] : 0);
          } else {
            stageExp += (typeof row['认知载体经验值'] === 'number' ? row['认知载体经验值'] : 0);
          }
        }
        if (stageExp > 0) {
          if (band.expType === '作战记录经验值') {
            totalRecordExp += stageExp;
            const expMats = convertRecordExpToMaterials(stageExp);
            for (const [mat, val] of Object.entries(expMats)) {
              if (typeof val === 'number') total[mat] = (total[mat] ?? 0) + val;
            }
          } else {
            totalCognitionExp += stageExp;
            const expMats = convertCognitionExpToMaterials(stageExp);
            for (const [mat, val] of Object.entries(expMats)) {
              if (typeof val === 'number') total[mat] = (total[mat] ?? 0) + val;
            }
          }
        }
      }
    }
  }

  // 记录原始经验总量（供上层显示用）
  total['作战记录经验值'] = totalRecordExp;
  total['认知载体经验值'] = totalCognitionExp;

  return total as CostMap;
}

/**
 * 武器等级升级消耗（上游 calculateWeaponLevelMaterials 的 TS 版）。
 * 遍历每一级，找到覆盖该级的阶段并累加。
 */
export function calculateWeaponLevelCost(from: number, to: number): CostMap {
  if (from >= to) return {};
  let totalExp = 0;
  let totalCoin = 0;
  for (let lv = from; lv < to; lv++) {
    const stage = WEAPON_LEVEL_STAGES.find((s) => lv >= s.from && lv < s.to);
    if (stage) {
      totalExp += stage.武器经验值;
      totalCoin += stage.折金票;
    }
  }
  const out: CostMap = {};
  if (totalExp > 0) (out as Record<string, number>)['武器经验值'] = totalExp;
  if (totalCoin > 0) (out as Record<string, number>)['折金票'] = totalCoin;
  return out;
}

/**
 * 武器突破消耗（对应上游 calculateWeaponBreakMaterials 单阶段版）。
 */
export function calculateWeaponBreakCost(weaponName: WeaponName, stage: 1 | 2 | 3 | 4): CostMap {
  if (stage <= 3) {
    const key = String(stage) as '1' | '2' | '3';
    return { ...(WEAPON_BREAK_GENERAL[key] as CostMap) };
  }
  // stage 4: base + special
  const special = (WEAPON_BREAK_4_SPECIAL[weaponName] ?? {}) as CostMap;
  return addCost(WEAPON_BREAK_4_BASE as CostMap, special);
}
