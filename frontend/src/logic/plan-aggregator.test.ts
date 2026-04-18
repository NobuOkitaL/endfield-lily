// frontend/src/logic/plan-aggregator.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore, type OperatorGoal, type WeaponGoal, DEFAULT_OPERATOR_STATE, DEFAULT_WEAPON_STATE } from '@/store/app-store';
import { computeOperatorGoalCost, computeWeaponGoalCost, computeAllGoalsCost } from './plan-aggregator';
import { WEAPON_LIST } from '@/data/weapons';

function makeOpGoal(overrides: Partial<OperatorGoal> = {}): OperatorGoal {
  return {
    id: 'test-op',
    operator: '洛茜',
    target: { ...DEFAULT_OPERATOR_STATE },
    hidden: false,
    ...overrides,
  };
}

function makeWpGoal(overrides: Partial<WeaponGoal> = {}): WeaponGoal {
  return {
    id: 'test-wp',
    weapon: WEAPON_LIST[0].name,
    target: { ...DEFAULT_WEAPON_STATE },
    hidden: false,
    ...overrides,
  };
}

describe('computeOperatorGoalCost', () => {
  it('returns empty cost when target equals current', () => {
    const goal = makeOpGoal({ target: { ...DEFAULT_OPERATOR_STATE } });
    const cost = computeOperatorGoalCost(goal, DEFAULT_OPERATOR_STATE);
    expect(Object.keys(cost).length).toBe(0);
  });

  it('operator 等级 bump → non-empty cost', () => {
    const goal = makeOpGoal({ target: { ...DEFAULT_OPERATOR_STATE, 等级: 3 } });
    const cost = computeOperatorGoalCost(goal, DEFAULT_OPERATOR_STATE);
    expect(Object.keys(cost).length).toBeGreaterThan(0);
  });

  it('operator 精英阶段 0→1 → 折金票 1600', () => {
    const goal = makeOpGoal({ target: { ...DEFAULT_OPERATOR_STATE, 精英阶段: 1 } });
    const cost = computeOperatorGoalCost(goal, DEFAULT_OPERATOR_STATE);
    expect(cost.折金票).toBe(1600);
  });
});

describe('computeWeaponGoalCost', () => {
  it('returns empty cost when target equals current', () => {
    const goal = makeWpGoal({ target: { ...DEFAULT_WEAPON_STATE } });
    const cost = computeWeaponGoalCost(goal, DEFAULT_WEAPON_STATE);
    expect(Object.keys(cost).length).toBe(0);
  });

  it('weapon 破限 0→1 → 折金票 2200', () => {
    const goal = makeWpGoal({ target: { ...DEFAULT_WEAPON_STATE, 破限阶段: 1 } });
    const cost = computeWeaponGoalCost(goal, DEFAULT_WEAPON_STATE);
    expect(cost.折金票).toBe(2200);
  });
});

describe('computeAllGoalsCost', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('returns empty when no goals', () => {
    expect(computeAllGoalsCost()).toEqual({});
  });

  it('aggregates visible operator goals; skips hidden', () => {
    useAppStore.getState().addOperatorGoal('洛茜');
    // Set the target to 精英阶段 1
    const goals = useAppStore.getState().operatorGoals;
    useAppStore.getState().updateOperatorGoalTarget(goals[0].id, { 精英阶段: 1 });

    // Add a hidden goal for the same operator — but operator must be different since
    // each operator can only have one goal. Use second operator.
    useAppStore.getState().addOperatorGoal('汤汤');
    const goals2 = useAppStore.getState().operatorGoals;
    const hiddenGoal = goals2.find((g) => g.operator === '汤汤')!;
    useAppStore.getState().updateOperatorGoalTarget(hiddenGoal.id, { 精英阶段: 1 });
    useAppStore.getState().toggleOperatorGoalHidden(hiddenGoal.id);

    const cost = computeAllGoalsCost();
    // Only the visible 洛茜 goal should be counted: 1600 折金票
    expect(cost.折金票).toBe(1600);
  });
});
