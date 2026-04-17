// frontend/src/data/types.ts
import type { MaterialName } from './materials';

export type OperatorName = string;
export type WeaponName = string;

export type CostMap = Partial<Record<MaterialName, number>>;
export type FullCostMap = Partial<Record<MaterialName, number>>;

export type UpgradeProject =
  | '精0等级' | '精1等级' | '精2等级' | '精3等级' | '精4等级'
  | '精英阶段' | '装备适配' | '能力值（信赖）' | '天赋' | '基建'
  | '技能1' | '技能2' | '技能3' | '技能4';
