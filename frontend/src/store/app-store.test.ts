import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('app store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('initial state is empty', () => {
    const s = useAppStore.getState();
    expect(s.stock).toEqual({});
    expect(s.ownedOperators).toEqual({});
    expect(s.ownedWeapons).toEqual({});
    expect(s.planRows).toEqual([]);
    expect(s.settings.darkMode).toBe(false);
  });

  it('sets stock by material name', () => {
    useAppStore.getState().setStock('折金票', 100);
    expect(useAppStore.getState().stock['折金票']).toBe(100);
  });

  it('replaces stock wholesale', () => {
    useAppStore.getState().setStock('折金票', 100);
    useAppStore.getState().replaceStock({ 协议棱柱: 50 });
    const s = useAppStore.getState();
    expect(s.stock['折金票']).toBeUndefined();
    expect(s.stock['协议棱柱']).toBe(50);
  });

  it('sets/removes owned operator', () => {
    useAppStore.getState().setOwnedOperator('洛茜', {
      精英阶段: 2, 等级: 45, 装备适配: 1, 天赋: 2, 基建: 1, 信赖: 2,
      技能1: 7, 技能2: 7, 技能3: 5, 技能4: 7,
    });
    expect(useAppStore.getState().ownedOperators['洛茜']?.等级).toBe(45);
    useAppStore.getState().removeOwnedOperator('洛茜');
    expect(useAppStore.getState().ownedOperators['洛茜']).toBeUndefined();
  });

  it('sets/removes owned weapon', () => {
    useAppStore.getState().setOwnedWeapon('晨光之刃', { 破限阶段: 2, 等级: 60 });
    expect(useAppStore.getState().ownedWeapons['晨光之刃']?.等级).toBe(60);
    useAppStore.getState().removeOwnedWeapon('晨光之刃');
    expect(useAppStore.getState().ownedWeapons['晨光之刃']).toBeUndefined();
  });

  it('adds/updates/removes plan rows', () => {
    const row = {
      id: 'p1', 干员: '洛茜', 项目: '精英阶段' as const,
      现等级: 0, 目标等级: 1, materials: { 折金票: 1600 }, hidden: false,
    };
    useAppStore.getState().addPlanRow(row);
    expect(useAppStore.getState().planRows).toHaveLength(1);
    useAppStore.getState().updatePlanRow('p1', { hidden: true });
    expect(useAppStore.getState().planRows[0].hidden).toBe(true);
    useAppStore.getState().removePlanRow('p1');
    expect(useAppStore.getState().planRows).toHaveLength(0);
  });

  it('toggles dark mode', () => {
    const before = useAppStore.getState().settings.darkMode;
    useAppStore.getState().toggleDarkMode();
    expect(useAppStore.getState().settings.darkMode).toBe(!before);
  });

  it('exports and imports snapshot', () => {
    useAppStore.getState().setStock('折金票', 100);
    useAppStore.getState().setOwnedOperator('洛茜', {
      精英阶段: 1, 等级: 30, 装备适配: 0, 天赋: 0, 基建: 0, 信赖: 0,
      技能1: 1, 技能2: 1, 技能3: 1, 技能4: 1,
    });
    const json = useAppStore.getState().exportSnapshot();
    useAppStore.setState(useAppStore.getInitialState());
    expect(useAppStore.getState().stock).toEqual({});
    useAppStore.getState().importSnapshot(json);
    expect(useAppStore.getState().stock['折金票']).toBe(100);
    expect(useAppStore.getState().ownedOperators['洛茜']?.等级).toBe(30);
  });
});
