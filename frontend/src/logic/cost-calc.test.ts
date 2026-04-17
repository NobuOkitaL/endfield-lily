// frontend/src/logic/cost-calc.test.ts
import { describe, expect, it } from 'vitest';
import {
  calculateProjectMaterials,
  calculateLevelMaterials,
  calculateWeaponLevelCost,
  calculateWeaponBreakCost,
  aggregateCosts,
  emptyCost,
  addCost,
} from './cost-calc';

describe('addCost / aggregateCosts', () => {
  it('addCost sums two maps', () => {
    expect(addCost({ 折金票: 100, 协议棱柱: 5 }, { 折金票: 50, 协议圆盘: 2 }))
      .toEqual({ 折金票: 150, 协议棱柱: 5, 协议圆盘: 2 });
  });

  it('aggregateCosts empty → empty', () => {
    expect(aggregateCosts([])).toEqual({});
  });

  it('aggregateCosts combines multiple', () => {
    expect(
      aggregateCosts([
        { 折金票: 100, 协议棱柱: 5 },
        { 折金票: 50, 协议棱柱: 3, 协议圆盘: 2 },
      ]),
    ).toEqual({ 折金票: 150, 协议棱柱: 8, 协议圆盘: 2 });
  });
});

describe('calculateProjectMaterials', () => {
  it('精英阶段 0→1 uses generic row', () => {
    const c = calculateProjectMaterials('洛茜', '精英阶段', 0, 1);
    expect(c).toBeTruthy();
    expect(c!.折金票).toBe(1600);
    // 精英阶段 0→1 generic 还有 协议圆盘:8 和 轻红柱状菌:3
    expect(c!.协议圆盘).toBe(8);
  });

  it('精英阶段 3→4 uses operator-specific row', () => {
    const c = calculateProjectMaterials('洛茜', '精英阶段', 3, 4);
    expect(c).toBeTruthy();
    expect(c!.折金票).toBe(100000);
  });

  it('equal from and to returns empty', () => {
    expect(calculateProjectMaterials('洛茜', '精英阶段', 2, 2)).toEqual({});
  });
});

describe('calculateLevelMaterials', () => {
  it('equal from and to → empty-ish', () => {
    const c = calculateLevelMaterials('洛茜', 30, 30);
    // 返回 {} 或 { 折金票: 0 }都算 pass：没有任何大于 0 的开销
    expect((c.折金票 ?? 0)).toBe(0);
    expect((c.作战记录经验值 ?? 0)).toBe(0);
  });

  it('1→3 within 精0等级', () => {
    const c = calculateLevelMaterials('洛茜', 1, 3);
    // 1→2: exp 20, coin 0;  2→3: exp 30, coin 0 → total exp 50
    expect(c.作战记录经验值).toBe(50);
    expect((c.折金票 ?? 0)).toBe(0);
  });

  it('crosses band boundary (18→22 spans 精0→精1)', () => {
    const c = calculateLevelMaterials('洛茜', 18, 22);
    expect((c.作战记录经验值 ?? 0)).toBeGreaterThan(0);
    expect((c.折金票 ?? 0)).toBeGreaterThan(0);
  });
});

describe('calculateWeaponLevelCost', () => {
  it('equal → empty', () => {
    expect(calculateWeaponLevelCost(10, 10)).toEqual({});
  });

  it('1→3 sums first two stages', () => {
    const c = calculateWeaponLevelCost(1, 3);
    expect((c.武器经验值 ?? 0)).toBeGreaterThan(0);
    expect((c.折金票 ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateWeaponBreakCost', () => {
  it('stage 1 returns generic', () => {
    const c = calculateWeaponBreakCost('任意武器名', 1);
    expect(c.折金票).toBe(2200);
    expect(c.强固模具).toBe(5);
    expect(c.轻黯石).toBe(3);
  });

  it('stage 2 returns generic', () => {
    const c = calculateWeaponBreakCost('任意武器名', 2);
    expect(c.折金票).toBe(8500);
  });

  it('stage 3 returns generic', () => {
    const c = calculateWeaponBreakCost('任意武器名', 3);
    expect(c.折金票).toBe(25000);
  });

  it('stage 4 returns base + special', async () => {
    // 用 WEAPON_LIST 第一个真实武器名
    const { WEAPON_LIST } = await import('@/data/weapons');
    const wp = WEAPON_LIST[0];
    const c = calculateWeaponBreakCost(wp.name, 4);
    expect(c.折金票).toBe(90000);
    expect(c.重型强固模具).toBe(30);
    // 特殊材料也应该在（具体材料依赖该武器）
    // 至少 BASE 里没有的字段应该是 special 加进来的
  });
});
