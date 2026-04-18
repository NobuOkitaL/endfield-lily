// frontend/src/data/essence-stats.ts
// Data sourced from Arknights-yituliu/ef-frontend-v1 (GPL-3.0) — game mechanic facts.

/** 全部的主属性 (5 items) */
export const ALL_ATTRIBUTE_STATS: readonly string[] = [
  '敏捷提升',
  '力量提升',
  '意志提升',
  '智识提升',
  '主能力提升',
] as const;

/** 全部的副属性 (12 items) */
export const ALL_SECONDARY_STATS: readonly string[] = [
  '攻击提升',
  '生命提升',
  '物理伤害提升',
  '灼热伤害提升',
  '电磁伤害提升',
  '寒冷伤害提升',
  '自然伤害提升',
  '暴击率提升',
  '源石技艺提升',
  '终结技充能效率提升',
  '法术伤害提升',
  '治疗效率提升',
] as const;

/** 全部的技能词 (14 items) */
export const ALL_SKILL_STATS: readonly string[] = [
  '强攻',
  '压制',
  '追袭',
  '粉碎',
  '昂扬',
  '巧技',
  '残暴',
  '附术',
  '医疗',
  '切骨',
  '迸发',
  '夜幕',
  '流转',
  '效益',
] as const;
