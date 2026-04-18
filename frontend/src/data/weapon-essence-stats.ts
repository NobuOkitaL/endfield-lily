// frontend/src/data/weapon-essence-stats.ts
// Data sourced from Arknights-yituliu/ef-frontend-v1 (GPL-3.0) — game mechanic facts.
// Weapons with rarity 3 have null secondary in the reference; we omit them from this map
// since they cannot be meaningfully targeted in essence farming.

export interface WeaponEssenceStats {
  attribute: string;  // one of ALL_ATTRIBUTE_STATS
  secondary: string | null;  // one of ALL_SECONDARY_STATS, or null for rarity-3 weapons
  skill: string;      // one of ALL_SKILL_STATS
}

export const WEAPON_ESSENCE_STATS: Readonly<Record<string, WeaponEssenceStats>> = {
  // 双手剑
  '工业零点一': { attribute: '力量提升', secondary: '攻击提升', skill: '压制' },
  '典范':       { attribute: '主能力提升', secondary: '攻击提升', skill: '压制' },
  '昔日精品':   { attribute: '意志提升', secondary: '生命提升', skill: '效益' },
  '大雷斑':     { attribute: '力量提升', secondary: '生命提升', skill: '医疗' },
  '破碎君王':   { attribute: '力量提升', secondary: '暴击率提升', skill: '粉碎' },
  '淬火者':     { attribute: '意志提升', secondary: '生命提升', skill: '粉碎' },
  '达尔霍夫7':  { attribute: '主能力提升', secondary: null, skill: '强攻' },
  '探骊':       { attribute: '力量提升', secondary: '终结技充能效率提升', skill: '迸发' },
  '终点之声':   { attribute: '力量提升', secondary: '生命提升', skill: '医疗' },
  '赫拉芬格':   { attribute: '力量提升', secondary: '攻击提升', skill: '迸发' },
  '古渠':       { attribute: '力量提升', secondary: '源石技艺提升', skill: '残暴' },
  'O.B.J.重荷': { attribute: '力量提升', secondary: '生命提升', skill: '效益' },
  // 施术单元
  '全自动骇新星': { attribute: '智识提升', secondary: '法术伤害提升', skill: '昂扬' },
  '吉米尼12':   { attribute: '主能力提升', secondary: null, skill: '强攻' },
  '荧光雷羽':   { attribute: '意志提升', secondary: '攻击提升', skill: '压制' },
  '迷失荒野':   { attribute: '智识提升', secondary: '电磁伤害提升', skill: '附术' },
  '悼亡诗':     { attribute: '智识提升', secondary: '攻击提升', skill: '夜幕' },
  '作品：蚀迹': { attribute: '意志提升', secondary: '自然伤害提升', skill: '压制' },
  '莫奈何':     { attribute: '意志提升', secondary: '终结技充能效率提升', skill: '昂扬' },
  '爆破单元':   { attribute: '主能力提升', secondary: '源石技艺提升', skill: '迸发' },
  '遗忘':       { attribute: '智识提升', secondary: '法术伤害提升', skill: '夜幕' },
  '骑士精神':   { attribute: '意志提升', secondary: '生命提升', skill: '医疗' },
  '使命必达':   { attribute: '意志提升', secondary: '终结技充能效率提升', skill: '追袭' },
  '布道自由':   { attribute: '意志提升', secondary: '治疗效率提升', skill: '医疗' },
  '沧溟星梦':   { attribute: '智识提升', secondary: '治疗效率提升', skill: '附术' },
  'O.B.J.术识': { attribute: '智识提升', secondary: '源石技艺提升', skill: '追袭' },
  '孤舟':       { attribute: '意志提升', secondary: '攻击提升', skill: '压制' },
  '雾中微光':   { attribute: '意志提升', secondary: '电磁伤害提升', skill: '效益' },
  // 长柄武器
  '寻路者道标': { attribute: '敏捷提升', secondary: '攻击提升', skill: '昂扬' },
  '嵌合正义':   { attribute: '力量提升', secondary: '终结技充能效率提升', skill: '残暴' },
  '向心之引':   { attribute: '意志提升', secondary: '电磁伤害提升', skill: '压制' },
  '天使杀手':   { attribute: '意志提升', secondary: '法术伤害提升', skill: '压制' },
  '奥佩罗77':   { attribute: '主能力提升', secondary: null, skill: '强攻' },
  '骁勇':       { attribute: '敏捷提升', secondary: '物理伤害提升', skill: '巧技' },
  'J.E.T.':     { attribute: '主能力提升', secondary: '攻击提升', skill: '压制' },
  '负山':       { attribute: '敏捷提升', secondary: '物理伤害提升', skill: '效益' },
  'O.B.J.尖峰': { attribute: '意志提升', secondary: '物理伤害提升', skill: '附术' },
  // 手铳
  '佩科5':      { attribute: '主能力提升', secondary: null, skill: '强攻' },
  '呼啸守卫':   { attribute: '智识提升', secondary: '攻击提升', skill: '压制' },
  '长路':       { attribute: '力量提升', secondary: '法术伤害提升', skill: '追袭' },
  '理性告别':   { attribute: '力量提升', secondary: '灼热伤害提升', skill: '追袭' },
  '领航者':     { attribute: '智识提升', secondary: '寒冷伤害提升', skill: '附术' },
  '作品：众生': { attribute: '敏捷提升', secondary: '法术伤害提升', skill: '附术' },
  '望乡':       { attribute: '敏捷提升', secondary: '寒冷伤害提升', skill: '压制' },
  '楔子':       { attribute: '主能力提升', secondary: '暴击率提升', skill: '附术' },
  '同类相食':   { attribute: '主能力提升', secondary: '法术伤害提升', skill: '附术' },
  '艺术暴君':   { attribute: '智识提升', secondary: '暴击率提升', skill: '切骨' },
  '落草':       { attribute: '敏捷提升', secondary: '攻击提升', skill: '迸发' },
  'O.B.J.迅极': { attribute: '敏捷提升', secondary: '终结技充能效率提升', skill: '迸发' },
  // 单手剑
  '塔尔11':     { attribute: '主能力提升', secondary: null, skill: '强攻' },
  '钢铁余音':   { attribute: '敏捷提升', secondary: '物理伤害提升', skill: '巧技' },
  '熔铸火焰':   { attribute: '智识提升', secondary: '攻击提升', skill: '夜幕' },
  '坚城铸造者': { attribute: '智识提升', secondary: '终结技充能效率提升', skill: '昂扬' },
  '显锋':       { attribute: '敏捷提升', secondary: '物理伤害提升', skill: '压制' },
  '浪潮':       { attribute: '智识提升', secondary: '攻击提升', skill: '追袭' },
  '黯色火炬':   { attribute: '智识提升', secondary: '灼热伤害提升', skill: '附术' },
  '扶摇':       { attribute: '主能力提升', secondary: '暴击率提升', skill: '夜幕' },
  '热熔切割器': { attribute: '意志提升', secondary: '攻击提升', skill: '流转' },
  '显赫声名':   { attribute: '主能力提升', secondary: '物理伤害提升', skill: '残暴' },
  '白夜新星':   { attribute: '主能力提升', secondary: '源石技艺提升', skill: '附术' },
  '仰止':       { attribute: '敏捷提升', secondary: '物理伤害提升', skill: '夜幕' },
  '不知归':     { attribute: '意志提升', secondary: '攻击提升', skill: '流转' },
  '光荣记忆':   { attribute: '敏捷提升', secondary: '暴击率提升', skill: '夜幕' },
  '十二问':     { attribute: '敏捷提升', secondary: '攻击提升', skill: '附术' },
  'O.B.J.轻芒': { attribute: '敏捷提升', secondary: '攻击提升', skill: '流转' },
  '逐鳞3.0':    { attribute: '力量提升', secondary: '寒冷伤害提升', skill: '压制' },
  '宏愿':       { attribute: '敏捷提升', secondary: '攻击提升', skill: '附术' },
  '狼之绯':     { attribute: '敏捷提升', secondary: '暴击率提升', skill: '切骨' },
};
