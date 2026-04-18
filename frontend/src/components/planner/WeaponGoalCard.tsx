// frontend/src/components/planner/WeaponGoalCard.tsx
import { useAppStore, DEFAULT_WEAPON_STATE } from '@/store/app-store';
import type { WeaponGoal } from '@/store/app-store';
import { computeWeaponGoalCost } from '@/logic/plan-aggregator';
import { isAffordable } from '@/logic/stock';
import { VIRTUAL_EXP_MATERIALS } from '@/data/materials';
import type { MaterialName } from '@/data/materials';
import { WEAPON_AVATARS } from '@/data/weapons';

/** Build a one-line target summary: 破2 Lv.45 */
function buildSummary(goal: WeaponGoal): string {
  const t = goal.target;
  return `破${t['破限阶段']} Lv.${t['等级']}`;
}

export function WeaponGoalCard({
  goal,
  onClick,
}: {
  goal: WeaponGoal;
  onClick: () => void;
}) {
  const stock = useAppStore((s) => s.stock);
  const ownedWps = useAppStore((s) => s.ownedWeapons);

  const current = ownedWps[goal.weapon] ?? DEFAULT_WEAPON_STATE;

  const costFull = computeWeaponGoalCost(goal, current);
  const realCost: Record<string, number> = {};
  for (const [k, v] of Object.entries(costFull)) {
    if (typeof v === 'number' && v > 0 && !VIRTUAL_EXP_MATERIALS.has(k as MaterialName)) {
      realCost[k] = v;
    }
  }
  const affordable = isAffordable(stock, realCost as never);
  const hasCost = Object.keys(realCost).length > 0;
  const shortCount = Object.entries(realCost).filter(
    ([name, qty]) => (stock[name as MaterialName] ?? 0) < qty
  ).length;

  const summary = buildSummary(goal);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={[
        'relative flex items-center gap-3 rounded-card border border-white/20 bg-canvas px-4',
        'cursor-pointer transition-colors duration-150',
        'hover:border-signal/60',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-signal',
        goal.hidden ? 'opacity-50' : '',
      ].join(' ')}
      style={{ minHeight: '64px' }}
    >
      {/* Avatar */}
      <img
        src={`/${WEAPON_AVATARS[goal.weapon]}`}
        alt={goal.weapon}
        className="w-10 h-10 rounded-sm shrink-0 object-cover border border-white/20"
        loading="lazy"
      />

      {/* Name + summary */}
      <div className="flex-1 min-w-0 py-3">
        <div className="font-sans font-bold text-white text-[15px] leading-tight truncate">
          {goal.weapon}
        </div>
        <div className="font-mono text-[11px] text-[#949494] mt-0.5 truncate">
          {summary}
        </div>
      </div>

      {/* Status kicker */}
      <div className="shrink-0 pl-3">
        {goal.hidden ? (
          <span className="font-mono text-[11px] text-[#949494] border border-white/20 rounded px-2 py-0.5">
            已禁用
          </span>
        ) : !hasCost ? (
          <span className="font-mono text-[11px] text-[#949494] uppercase tracking-widest">
            NO CHANGE
          </span>
        ) : affordable ? (
          <span className="font-mono text-[11px] text-signal uppercase tracking-widest">
            READY ✓
          </span>
        ) : (
          <span className="font-mono text-[11px] text-alert uppercase tracking-widest">
            缺 {shortCount} 项
          </span>
        )}
      </div>
    </div>
  );
}
