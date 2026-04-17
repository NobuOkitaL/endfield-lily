// frontend/src/data/materials.ts
// Auto-generated from reference/zmdgraph/js/data.js — do not edit by hand.

export const MATERIAL_COLUMNS = [
  "折金票",
  "作战记录经验值",
  "认知载体经验值",
  "武器经验值",
  "高级认知载体",
  "初级认知载体",
  "高级作战记录",
  "中级作战记录",
  "初级作战记录",
  "协议圆盘组",
  "协议圆盘",
  "三相纳米片",
  "象限拟合液",
  "快子遴捡晶格",
  "D96钢样品四",
  "超距辉映管",
  "协议棱柱组",
  "协议棱柱",
  "轻红柱状菌",
  "中红柱状菌",
  "重红柱状菌",
  "晶化多齿叶",
  "纯晶多齿叶",
  "至晶多齿叶",
  "轻黯石",
  "中黯石",
  "重黯石",
  "血菌",
  "受蚀玉化叶",
  "燎石",
  "星门菌",
  "岩天使叶",
  "武陵石",
  "存续的痕迹",
  "武器检查单元",
  "武器检查装置",
  "武器检查套组",
  "强固模具",
  "重型强固模具"
] as const;
export type MaterialName = typeof MATERIAL_COLUMNS[number];
export const MATERIAL_ICONS: Record<MaterialName, string> = {
  "折金票": "images/icons/折金票.png",
  "作战记录经验值": "images/icons/作战记录经验值.png",
  "认知载体经验值": "images/icons/认知载体经验值.png",
  "武器经验值": "images/icons/武器经验值.png",
  "高级认知载体": "images/icons/高级认知载体.png",
  "初级认知载体": "images/icons/初级认知载体.png",
  "高级作战记录": "images/icons/高级作战记录.png",
  "中级作战记录": "images/icons/中级作战记录.png",
  "初级作战记录": "images/icons/初级作战记录.png",
  "协议圆盘组": "images/icons/协议圆盘组.png",
  "协议圆盘": "images/icons/协议圆盘.png",
  "三相纳米片": "images/icons/三相纳米片.png",
  "象限拟合液": "images/icons/象限拟合液.png",
  "快子遴捡晶格": "images/icons/快子遴捡晶格.png",
  "D96钢样品四": "images/icons/D96钢样品四.png",
  "超距辉映管": "images/icons/超距辉映管.png",
  "协议棱柱组": "images/icons/协议棱柱组.png",
  "协议棱柱": "images/icons/协议棱柱.png",
  "轻红柱状菌": "images/icons/轻红柱状菌.png",
  "中红柱状菌": "images/icons/中红柱状菌.png",
  "重红柱状菌": "images/icons/重红柱状菌.png",
  "晶化多齿叶": "images/icons/晶化多齿叶.png",
  "纯晶多齿叶": "images/icons/纯晶多齿叶.png",
  "至晶多齿叶": "images/icons/至晶多齿叶.png",
  "轻黯石": "images/icons/轻黯石.png",
  "中黯石": "images/icons/中黯石.png",
  "重黯石": "images/icons/重黯石.png",
  "血菌": "images/icons/血菌.png",
  "受蚀玉化叶": "images/icons/受蚀玉化叶.png",
  "燎石": "images/icons/燎石.png",
  "星门菌": "images/icons/星门菌.png",
  "岩天使叶": "images/icons/岩天使叶.png",
  "武陵石": "images/icons/武陵石.png",
  "存续的痕迹": "images/icons/存续的痕迹.png",
  "武器检查单元": "images/icons/武器检查单元.png",
  "武器检查装置": "images/icons/武器检查装置.png",
  "武器检查套组": "images/icons/武器检查套组.png",
  "强固模具": "images/icons/强固模具.png",
  "重型强固模具": "images/icons/重型强固模具.png"
};
export const VIRTUAL_EXP_MATERIALS = new Set<MaterialName>(['作战记录经验值', '认知载体经验值', '武器经验值']);
export const EXP_CARD_VALUES = {
  "record": {
    "高级作战记录": 10000,
    "中级作战记录": 1000,
    "初级作战记录": 200
  },
  "cognition": {
    "高级认知载体": 10000,
    "初级认知载体": 1000
  },
  "weapon": {
    "武器检查套组": 10000,
    "武器检查装置": 1000,
    "武器检查单元": 200
  }
} as const;
export type ExpType = keyof typeof EXP_CARD_VALUES;
