// frontend/src/pages/FarmPage.tsx
import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { computeFarmPlans, type FarmPlan } from '@/logic/essence-recommend';
import { WEAPON_ESSENCE_STATS } from '@/data/weapon-essence-stats';
import { WEAPON_LIST, WEAPON_AVATARS } from '@/data/weapons';
import { cn } from '@/lib/utils';

// ── weapon type classification (from reference data) ────────────────────────
const WEAPON_TYPE_MAP: Record<string, string> = {
  工业零点一: '双手剑', 典范: '双手剑', 昔日精品: '双手剑', 大雷斑: '双手剑',
  破碎君王: '双手剑', 淬火者: '双手剑', 达尔霍夫7: '双手剑', 探骊: '双手剑',
  终点之声: '双手剑', 赫拉芬格: '双手剑', 古渠: '双手剑', 'O.B.J.重荷': '双手剑',
  全自动骇新星: '施术单元', 吉米尼12: '施术单元', 荧光雷羽: '施术单元',
  迷失荒野: '施术单元', 悼亡诗: '施术单元', '作品：蚀迹': '施术单元',
  莫奈何: '施术单元', 爆破单元: '施术单元', 遗忘: '施术单元', 骑士精神: '施术单元',
  使命必达: '施术单元', 布道自由: '施术单元', 沧溟星梦: '施术单元',
  'O.B.J.术识': '施术单元', 孤舟: '施术单元', 雾中微光: '施术单元',
  寻路者道标: '长柄武器', 嵌合正义: '长柄武器', 向心之引: '长柄武器',
  天使杀手: '长柄武器', 奥佩罗77: '长柄武器', 骁勇: '长柄武器',
  'J.E.T.': '长柄武器', 负山: '长柄武器', 'O.B.J.尖峰': '长柄武器',
  佩科5: '手铳', 呼啸守卫: '手铳', 长路: '手铳', 理性告别: '手铳',
  领航者: '手铳', '作品：众生': '手铳', 望乡: '手铳', 楔子: '手铳',
  同类相食: '手铳', 艺术暴君: '手铳', 落草: '手铳', 'O.B.J.迅极': '手铳',
  塔尔11: '单手剑', 钢铁余音: '单手剑', 熔铸火焰: '单手剑', 坚城铸造者: '单手剑',
  显锋: '单手剑', 浪潮: '单手剑', 黯色火炬: '单手剑', 扶摇: '单手剑',
  热熔切割器: '单手剑', 显赫声名: '单手剑', 白夜新星: '单手剑', 仰止: '单手剑',
  不知归: '单手剑', 光荣记忆: '单手剑', 十二问: '单手剑', 'O.B.J.轻芒': '单手剑',
  '逐鳞3.0': '单手剑', 宏愿: '单手剑', 狼之绯: '单手剑',
};

const WEAPON_TYPES = ['全部', '单手剑', '双手剑', '长柄武器', '手铳', '施术单元'] as const;
type WeaponTypeFilter = (typeof WEAPON_TYPES)[number];

const STAR_COLORS: Record<number, string> = {
  6: 'text-signal border-signal/50',
  5: 'text-[#8fd5b0] border-[#8fd5b0]/40',
  4: 'text-white/70 border-white/30',
  3: 'text-white/40 border-white/20',
};

// ── sub-components ───────────────────────────────────────────────────────────

function WeaponCard({
  name,
  star,
  selected,
  onToggle,
}: {
  name: string;
  star: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const stats = WEAPON_ESSENCE_STATS[name];
  const avatar = WEAPON_AVATARS[name];

  return (
    <button
      onClick={onToggle}
      className={cn(
        'group relative flex items-center gap-2 p-2 rounded-tag transition-all duration-150',
        'border bg-white/[0.03] hover:bg-white/[0.07] text-left w-full',
        selected
          ? 'border-l-4 border-l-signal border-t-signal/30 border-r-signal/30 border-b-signal/30 bg-signal/[0.06]'
          : 'border-white/10',
      )}
    >
      {/* Avatar */}
      <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-white/5">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px]">
            ?
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="font-sans text-white text-[13px] font-medium truncate"
          >
            {name}
          </span>
          <span
            className={cn(
              'shrink-0 text-[9px] font-mono uppercase px-1 border rounded-sm',
              STAR_COLORS[star] ?? 'text-white/40 border-white/20',
            )}
          >
            {star}★
          </span>
        </div>
        {stats && (
          <div className="text-[9px] font-mono text-white/35 mt-0.5 truncate">
            {stats.attribute}
            {stats.secondary ? ` · ${stats.secondary}` : ''}
          </div>
        )}
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-signal" />
      )}
    </button>
  );
}

function PlanCard({ plan, index }: { plan: FarmPlan; index: number }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10">
        <span className="font-mono text-white/50 uppercase" style={{ fontSize: '10px', letterSpacing: '1.5px' }}>
          方案 {index + 1}
        </span>
        <span className="font-mono text-signal" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
          {plan.matchedWeapons.length} 把覆盖
        </span>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Map name */}
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-sm bg-signal/15 border border-signal/30 text-signal font-mono"
            style={{ fontSize: '10px', letterSpacing: '0.5px' }}
          >
            {plan.mapName}
          </span>
        </div>

        {/* 3 engrave attributes */}
        <div>
          <div className="font-mono text-white/35 mb-1" style={{ fontSize: '9px', letterSpacing: '1px' }}>
            预刻主属性
          </div>
          <div className="flex flex-wrap gap-1">
            {plan.engraveAttributes.map((attr) => (
              <span
                key={attr}
                className="px-2 py-0.5 rounded-sm bg-white/5 border border-white/15 text-white/70 font-mono"
                style={{ fontSize: '10px' }}
              >
                {attr}
              </span>
            ))}
          </div>
        </div>

        {/* Locked stat */}
        <div>
          <div className="font-mono text-white/35 mb-1" style={{ fontSize: '9px', letterSpacing: '1px' }}>
            {plan.lockedSecondary !== null ? '锁定副属性' : '锁定技能词'}
          </div>
          <span
            className="px-2 py-0.5 rounded-sm bg-signal/20 border border-signal/40 text-signal font-mono"
            style={{ fontSize: '11px', letterSpacing: '0.3px' }}
          >
            {plan.lockedSecondary ?? plan.lockedSkill}
          </span>
        </div>

        {/* Covered weapons */}
        <div>
          <div className="font-mono text-white/35 mb-1.5" style={{ fontSize: '9px', letterSpacing: '1px' }}>
            覆盖武器
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plan.matchedWeapons.map((wName) => {
              const avatar = WEAPON_AVATARS[wName];
              const stats = WEAPON_ESSENCE_STATS[wName];
              return (
                <div
                  key={wName}
                  className="relative group/weapon"
                  title={stats
                    ? `${wName}\n${stats.attribute} · ${stats.secondary ?? '—'} · ${stats.skill}`
                    : wName
                  }
                >
                  <div className="w-8 h-8 rounded overflow-hidden border border-white/15 bg-white/5">
                    {avatar ? (
                      <img src={avatar} alt={wName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-[8px] font-mono">
                        {wName.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 hidden group-hover/weapon:block pointer-events-none">
                    <div className="bg-[#1a1a1a] border border-white/20 rounded px-2 py-1 whitespace-nowrap">
                      <div className="font-sans text-white text-[11px] font-medium">{wName}</div>
                      {stats && (
                        <div className="font-mono text-white/50 text-[9px] mt-0.5">
                          {stats.attribute} · {stats.secondary ?? '—'} · {stats.skill}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function FarmPage() {
  const selected = useAppStore((s) => s.farmSelectedWeapons);
  const toggleWeapon = useAppStore((s) => s.toggleFarmWeapon);
  const clearWeapons = useAppStore((s) => s.clearFarmWeapons);

  const [typeFilter, setTypeFilter] = useState<WeaponTypeFilter>('全部');

  const filteredWeapons = useMemo(
    () =>
      WEAPON_LIST.filter((w) =>
        typeFilter === '全部' ? true : WEAPON_TYPE_MAP[w.name] === typeFilter,
      ),
    [typeFilter],
  );

  const plans = useMemo(() => computeFarmPlans(selected), [selected]);

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div>
        <div
          className="font-mono uppercase text-signal"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          ESSENCE FARMING / 基质刷取
        </div>
        <h1
          className="font-display text-white"
          style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
        >
          基质规划
        </h1>
      </div>
      <p className="text-[#949494] font-sans text-[15px] -mt-2">
        选择目标武器，获取最优刷取地点、预刻属性和锁定词条推荐。
      </p>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Left: weapon selector ── */}
        <div className="space-y-3">
          {/* Selection summary + clear */}
          <div className="flex items-center justify-between">
            <div className="font-mono text-white/50 uppercase" style={{ fontSize: '10px', letterSpacing: '1.5px' }}>
              已选{' '}
              <span className="text-signal">{selected.length}</span>
              {' '}/ {WEAPON_LIST.length}
            </div>
            {selected.length > 0 && (
              <button
                onClick={clearWeapons}
                className="font-mono text-white/30 hover:text-white/70 transition-colors uppercase"
                style={{ fontSize: '9px', letterSpacing: '1.2px' }}
              >
                清空选择
              </button>
            )}
          </div>

          {/* Type filter tabs */}
          <div className="flex flex-wrap gap-1.5">
            {WEAPON_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'px-3 py-1 rounded-tag font-mono uppercase transition-colors duration-100',
                  'border text-[10px]',
                  typeFilter === t
                    ? 'border-signal text-signal bg-signal/10'
                    : 'border-white/15 text-white/40 hover:text-white/70 hover:border-white/30',
                )}
                style={{ letterSpacing: '1px' }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Weapon grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {filteredWeapons.map((w) => (
              <WeaponCard
                key={w.name}
                name={w.name}
                star={w.star}
                selected={selected.includes(w.name)}
                onToggle={() => toggleWeapon(w.name)}
              />
            ))}
          </div>
        </div>

        {/* ── Right: farm plans ── */}
        <div className="space-y-3 xl:sticky xl:top-6">
          <div className="font-mono text-white/50 uppercase" style={{ fontSize: '10px', letterSpacing: '1.5px' }}>
            推荐刷取方案
          </div>

          {selected.length === 0 ? (
            /* Empty state */
            <div className="rounded-card border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
              <div className="font-mono text-white/25 uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '1.5px' }}>
                NO WEAPONS SELECTED
              </div>
              <p className="font-sans text-white/35 text-[13px]">
                选择上方武器以查看推荐方案
              </p>
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-card border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
              <div className="font-mono text-white/25 uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '1.5px' }}>
                NO PLANS FOUND
              </div>
              <p className="font-sans text-white/35 text-[13px]">
                当前选择的武器没有匹配的刷取方案
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan, i) => (
                <PlanCard key={`${plan.mapId}-${i}`} plan={plan} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
