import { describe, expect, it } from 'vitest';
import { CHARACTER_LIST, SKILL_MAPPING, EXCEPTIONS, OPERATOR_AVATARS } from './operators';
import { mapSkillDisplayToGeneric, isProjectExcluded } from './operators-helpers';

describe('operators data', () => {
  it('has 26 characters', () => {
    expect(CHARACTER_LIST.length).toBe(26);
  });

  it('SKILL_MAPPING covers every character', () => {
    for (const name of CHARACTER_LIST) {
      expect(SKILL_MAPPING.find((r) => r.干员 === name)).toBeDefined();
    }
  });

  it('OPERATOR_AVATARS covers every character', () => {
    for (const name of CHARACTER_LIST) {
      expect(OPERATOR_AVATARS[name]).toBeTruthy();
    }
  });

  it('mapSkillDisplayToGeneric resolves display names', () => {
    const row = SKILL_MAPPING[0];
    expect(mapSkillDisplayToGeneric(row.干员, row.技能1)).toBe('技能1');
    expect(mapSkillDisplayToGeneric(row.干员, '不存在的技能')).toBeNull();
  });

  it('isProjectExcluded matches known exception', () => {
    // EXCEPTIONS 里至少有 {干员: "管理员", 排除项目: "基建"}
    expect(isProjectExcluded('管理员', '基建')).toBe(true);
    expect(isProjectExcluded('洛茜', '基建')).toBe(false);
  });
});
