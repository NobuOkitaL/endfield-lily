// frontend/src/logic/plan-aggregator.ts
import { useAppStore, type OperatorGoal, type WeaponGoal, type OperatorState, type WeaponState, DEFAULT_OPERATOR_STATE, DEFAULT_WEAPON_STATE } from '@/store/app-store';
import {
  calculateProjectMaterials,
  calculateLevelMaterials,
  calculateWeaponLevelCost,
  calculateWeaponBreakCost,
  aggregateCosts,
  addCost,
} from './cost-calc';
import type { CostMap } from '@/data/types';

export function computeOperatorGoalCost(goal: OperatorGoal, current: OperatorState): CostMap {
  let acc: CostMap = {};

  // 等级
  if (goal.target.等级 > current.等级) {
    acc = addCost(acc, calculateLevelMaterials(goal.operator, current.等级, goal.target.等级));
  }

  // 精英阶段 — per-stage loop
  for (let s = current.精英阶段 + 1; s <= goal.target.精英阶段; s++) {
    const c = calculateProjectMaterials(goal.operator, '精英阶段', s - 1, s);
    if (c) acc = addCost(acc, c);
  }

  // 装备适配
  for (let s = current.装备适配 + 1; s <= goal.target.装备适配; s++) {
    const c = calculateProjectMaterials(goal.operator, '装备适配', s - 1, s);
    if (c) acc = addCost(acc, c);
  }

  // 天赋 (潜能) — 不计入规划：游戏机制是抽卡获取信物，无法 farm，规划器不应展示成本
  // 字段仍保留在 OperatorState 里用于"干员页"记录当前潜能值

  // 基建
  for (let s = current.基建 + 1; s <= goal.target.基建; s++) {
    const c = calculateProjectMaterials(goal.operator, '基建', s - 1, s);
    if (c) acc = addCost(acc, c);
  }

  // 能力值（信赖）
  for (let s = current.信赖 + 1; s <= goal.target.信赖; s++) {
    const c = calculateProjectMaterials(goal.operator, '能力值（信赖）', s - 1, s);
    if (c) acc = addCost(acc, c);
  }

  // 技能1-4
  const skills: Array<keyof OperatorState> = ['技能1', '技能2', '技能3', '技能4'];
  for (const skill of skills) {
    const fromLv = current[skill] as number;
    const toLv = goal.target[skill] as number;
    if (toLv > fromLv) {
      const c = calculateProjectMaterials(
        goal.operator,
        skill as '技能1' | '技能2' | '技能3' | '技能4',
        fromLv,
        toLv,
      );
      if (c) acc = addCost(acc, c);
    }
  }

  return acc;
}

export function computeWeaponGoalCost(goal: WeaponGoal, current: WeaponState): CostMap {
  let acc: CostMap = {};

  // 等级
  if (goal.target.等级 > current.等级) {
    acc = addCost(acc, calculateWeaponLevelCost(current.等级, goal.target.等级));
  }

  // 破限阶段 — per-stage loop
  for (let s = current.破限阶段 + 1; s <= goal.target.破限阶段; s++) {
    if (s < 1 || s > 4) continue;
    acc = addCost(acc, calculateWeaponBreakCost(goal.weapon, s as 1 | 2 | 3 | 4));
  }

  return acc;
}

export function computeAllGoalsCost(): CostMap {
  const state = useAppStore.getState();
  const costs: CostMap[] = [];

  for (const goal of state.operatorGoals) {
    if (goal.hidden) continue;
    const current = state.ownedOperators[goal.operator] ?? DEFAULT_OPERATOR_STATE;
    costs.push(computeOperatorGoalCost(goal, current));
  }

  for (const goal of state.weaponGoals) {
    if (goal.hidden) continue;
    const current = state.ownedWeapons[goal.weapon] ?? DEFAULT_WEAPON_STATE;
    costs.push(computeWeaponGoalCost(goal, current));
  }

  return aggregateCosts(costs);
}

// ---------------------------------------------------------------------------
// Legacy export — kept so old tests continue to pass
// ---------------------------------------------------------------------------
export { computeAllGoalsCost as computeAllPlanCost };
