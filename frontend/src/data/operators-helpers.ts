// frontend/src/data/operators-helpers.ts
// Hand-written helpers around auto-generated operators data.

import { SKILL_MAPPING, EXCEPTIONS } from './operators';
import type { OperatorName } from './types';

/**
 * 把技能显示名（如 "战技:血红之影"）映射回 generic key "技能2"。
 * 找不到返回 null。
 */
export function mapSkillDisplayToGeneric(
  operator: OperatorName,
  displayName: string,
): '技能1' | '技能2' | '技能3' | '技能4' | null {
  const row = SKILL_MAPPING.find((r) => r.干员 === operator);
  if (!row) return null;
  for (const key of ['技能1', '技能2', '技能3', '技能4'] as const) {
    if (row[key] === displayName) return key;
  }
  return null;
}

/** 给定干员和升级项目，判断是否被 EXCEPTIONS 排除。 */
export function isProjectExcluded(operator: OperatorName, project: string): boolean {
  return EXCEPTIONS.some((e) => e.干员 === operator && e.排除项目 === project);
}
