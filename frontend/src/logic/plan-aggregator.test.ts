// frontend/src/logic/plan-aggregator.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { computeAllPlanCost, computeRowCost } from './plan-aggregator';
import { WEAPON_LIST } from '@/data/weapons';

describe('computeRowCost', () => {
  it('operator 等级 range → non-empty cost', () => {
    const c = computeRowCost({
      id: 'x', 干员: '洛茜', 项目: '等级', 现等级: 1, 目标等级: 3,
      materials: {}, hidden: false,
    });
    expect(Object.keys(c).length).toBeGreaterThan(0);
  });

  it('operator 精英阶段 0→1 → generic row match', () => {
    const c = computeRowCost({
      id: 'x', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: false,
    });
    expect(c.折金票).toBe(1600);
  });

  it('weapon 破限 stage 1 → generic break cost', () => {
    const wp = WEAPON_LIST[0];
    const c = computeRowCost({
      id: 'x', 干员: wp.name, 项目: '破限', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: false,
    });
    expect(c.折金票).toBe(2200);
  });
});

describe('computeAllPlanCost', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('returns empty when no rows', () => {
    expect(computeAllPlanCost()).toEqual({});
  });

  it('aggregates visible rows; skips hidden', () => {
    useAppStore.getState().addPlanRow({
      id: 'a', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: false,
    });
    useAppStore.getState().addPlanRow({
      id: 'b', 干员: '洛茜', 项目: '精英阶段', 现等级: 0, 目标等级: 1,
      materials: {}, hidden: true,
    });
    expect(computeAllPlanCost().折金票).toBe(1600);
  });
});
