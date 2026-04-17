import { describe, expect, it } from 'vitest';
import { DATABASE } from './database';
import { MATERIAL_COLUMNS } from './materials';
import { CHARACTER_LIST } from './operators';

describe('DATABASE', () => {
  it('has at least 400 rows', () => {
    expect(DATABASE.length).toBeGreaterThanOrEqual(400);
  });

  it('every row has basic structure', () => {
    for (const row of DATABASE) {
      expect(typeof row.干员).toBe('string');
      expect(typeof row.升级项目).toBe('string');
      expect(typeof row.现等级).toBe('number');
      expect(typeof row.目标等级).toBe('number');
      expect(row.目标等级).toBeGreaterThan(row.现等级);
    }
  });

  it('every material field key is in MATERIAL_COLUMNS', () => {
    const meta = new Set(['干员', '升级项目', '现等级', '目标等级']);
    const allowed = new Set<string>([...MATERIAL_COLUMNS, ...meta]);
    for (const row of DATABASE) {
      for (const key of Object.keys(row)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it('includes rows for all 精0-精4等级', () => {
    for (const band of ['精0等级', '精1等级', '精2等级', '精3等级', '精4等级']) {
      expect(DATABASE.some((r) => r.升级项目 === band)).toBe(true);
    }
  });

  it('has 精英阶段 stage 3→4 entries for every character', () => {
    for (const name of CHARACTER_LIST) {
      expect(
        DATABASE.some((r) => r.干员 === name && r.升级项目 === '精英阶段' && r.现等级 === 3 && r.目标等级 === 4),
      ).toBe(true);
    }
  });

  it('has 技能1-4 rows', () => {
    for (const skill of ['技能1', '技能2', '技能3', '技能4']) {
      expect(DATABASE.some((r) => r.升级项目 === skill)).toBe(true);
    }
  });
});
