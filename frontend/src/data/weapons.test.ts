import { describe, expect, it } from 'vitest';
import {
  WEAPON_LIST,
  WEAPON_AVATARS,
  WEAPON_LEVEL_STAGES,
  WEAPON_BREAK_GENERAL,
  WEAPON_BREAK_4_BASE,
  WEAPON_BREAK_4_SPECIAL,
} from './weapons';

describe('weapons data', () => {
  it('has a reasonable number of weapons (>= 50)', () => {
    expect(WEAPON_LIST.length).toBeGreaterThanOrEqual(50);
  });

  it('every weapon has star in {3,4,5,6}', () => {
    for (const w of WEAPON_LIST) {
      expect([3, 4, 5, 6]).toContain(w.star);
    }
  });

  it('WEAPON_AVATARS covers every weapon', () => {
    for (const w of WEAPON_LIST) {
      expect(WEAPON_AVATARS[w.name]).toBeTruthy();
    }
  });

  it('WEAPON_BREAK_4_SPECIAL covers every weapon', () => {
    for (const w of WEAPON_LIST) {
      expect(WEAPON_BREAK_4_SPECIAL[w.name]).toBeDefined();
    }
  });

  it('WEAPON_LEVEL_STAGES is sorted 1→N and covers full range', () => {
    expect(WEAPON_LEVEL_STAGES.length).toBeGreaterThanOrEqual(80);
    expect(WEAPON_LEVEL_STAGES[0].from).toBe(1);
    // 最后一段 to 应该是 90（终末地武器最高等级）
    expect(WEAPON_LEVEL_STAGES[WEAPON_LEVEL_STAGES.length - 1].to).toBe(90);
  });

  it('WEAPON_BREAK_GENERAL has stages 1-3', () => {
    expect(Object.keys(WEAPON_BREAK_GENERAL).sort()).toEqual(['1', '2', '3']);
  });

  it('WEAPON_BREAK_4_BASE is non-empty', () => {
    expect(Object.keys(WEAPON_BREAK_4_BASE).length).toBeGreaterThan(0);
  });
});
