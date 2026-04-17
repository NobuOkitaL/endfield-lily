import { describe, expect, it } from 'vitest';
import { MATERIAL_COLUMNS, MATERIAL_ICONS, VIRTUAL_EXP_MATERIALS, EXP_CARD_VALUES } from './materials';

describe('materials data', () => {
  it('has exactly 39 materials', () => {
    // NOTE: upstream data.js has 39 materials, not 38 as originally assumed.
    expect(MATERIAL_COLUMNS.length).toBe(39);
  });

  it('MATERIAL_ICONS has icon for every column', () => {
    for (const m of MATERIAL_COLUMNS) {
      expect(MATERIAL_ICONS[m]).toBeTruthy();
    }
  });

  it('includes the three virtual EXP materials', () => {
    expect(VIRTUAL_EXP_MATERIALS.has('作战记录经验值')).toBe(true);
    expect(VIRTUAL_EXP_MATERIALS.has('认知载体经验值')).toBe(true);
    expect(VIRTUAL_EXP_MATERIALS.has('武器经验值')).toBe(true);
  });

  it('EXP card values from WEAPON_EXP_VALUES upstream', () => {
    expect(EXP_CARD_VALUES.weapon['武器检查单元']).toBe(200);
    expect(EXP_CARD_VALUES.weapon['武器检查装置']).toBe(1000);
    expect(EXP_CARD_VALUES.weapon['武器检查套组']).toBe(10000);
  });

  it('has no duplicate columns', () => {
    expect(new Set(MATERIAL_COLUMNS).size).toBe(MATERIAL_COLUMNS.length);
  });
});
