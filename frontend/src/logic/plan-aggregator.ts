// frontend/src/logic/plan-aggregator.ts
import { useAppStore, type PlanRow } from '@/store/app-store';
import {
  calculateProjectMaterials,
  calculateLevelMaterials,
  calculateWeaponLevelCost,
  calculateWeaponBreakCost,
  aggregateCosts,
  addCost,
} from './cost-calc';
import { WEAPON_LIST } from '@/data/weapons';
import { CHARACTER_LIST } from '@/data/operators';
import type { CostMap, UpgradeProject } from '@/data/types';

function isWeapon(name: string): boolean {
  return WEAPON_LIST.some((w) => w.name === name);
}

function isOperator(name: string): boolean {
  return (CHARACTER_LIST as readonly string[]).includes(name);
}

export function computeRowCost(row: PlanRow): CostMap {
  if (isOperator(row.干员)) {
    if (row.项目 === '等级') {
      return calculateLevelMaterials(row.干员, row.现等级, row.目标等级);
    }
    const c = calculateProjectMaterials(row.干员, row.项目 as UpgradeProject, row.现等级, row.目标等级);
    return c ?? {};
  }
  if (isWeapon(row.干员)) {
    if (row.项目 === '等级') return calculateWeaponLevelCost(row.现等级, row.目标等级);
    if (row.项目 === '破限') {
      let acc: CostMap = {};
      for (let stage = row.现等级 + 1; stage <= row.目标等级; stage++) {
        if (stage < 1 || stage > 4) continue;
        acc = addCost(acc, calculateWeaponBreakCost(row.干员, stage as 1 | 2 | 3 | 4));
      }
      return acc;
    }
  }
  return {};
}

export function computeAllPlanCost(): CostMap {
  const rows = useAppStore.getState().planRows.filter((r) => !r.hidden);
  return aggregateCosts(rows.map(computeRowCost));
}
