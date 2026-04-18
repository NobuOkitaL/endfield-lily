// frontend/src/components/planner/OperatorGoalCard.tsx
import { useAppStore, DEFAULT_OPERATOR_STATE } from '@/store/app-store';
import type { OperatorGoal } from '@/store/app-store';
import { computeOperatorGoalCost } from '@/logic/plan-aggregator';
import { isAffordable } from '@/logic/stock';
import { VIRTUAL_EXP_MATERIALS } from '@/data/materials';
import type { MaterialName } from '@/data/materials';
import { OPERATOR_AVATARS } from '@/data/operators';

/** Build a one-line target summary: 精3 Lv.60 · 装2 天3 · 技能 7/7/5/7 */
function buildSummary(goal: OperatorGoal): string {
  const t = goal.target;
  const parts: string[] = [];
  parts.push(`精${t['精英阶段']} Lv.${t['等级']}`);
  parts.push(`装${t['装备适配']} 建${t['基建']} 信${t['信赖']}`);
  parts.push(`技能 ${t['技能1']}/${t['技能2']}/${t['技能3']}/${t['技能4']}`);
  return parts.join(' · ');
}

export function OperatorGoalCard({
  goal,
  onClick,
}: {
  goal: OperatorGoal;
  onClick: () => void;
}) {
  const stock = useAppStore((s) => s.stock);
  const ownedOps = useAppStore((s) => s.ownedOperators);

  const current = ownedOps[goal.operator] ?? DEFAULT_OPERATOR_STATE;

  const costFull = computeOperatorGoalCost(goal, current);
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
        src={`/${OPERATOR_AVATARS[goal.operator]}`}
        alt={goal.operator}
        className="w-10 h-10 rounded-sm shrink-0 object-cover border border-white/20"
        loading="lazy"
      />

      {/* Name + summary */}
      <div className="flex-1 min-w-0 py-3">
        <div className="font-sans font-bold text-white text-[15px] leading-tight truncate">
          {goal.operator}
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
