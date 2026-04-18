// frontend/src/components/planner/CostSummary.tsx
import { useAppStore } from '@/store/app-store';
import { computeAllGoalsCost } from '@/logic/plan-aggregator';
import { diffStock, type Stock } from '@/logic/stock';
import { Button } from '@/components/ui/button';
import { MATERIAL_COLUMNS, MATERIAL_ICONS, VIRTUAL_EXP_MATERIALS, type MaterialName } from '@/data/materials';
import { CornerBrackets } from '@/components/decor/CornerBrackets';

export function CostSummary() {
  const stock = useAppStore((s) => s.stock);
  const operatorGoals = useAppStore((s) => s.operatorGoals);
  const weaponGoals = useAppStore((s) => s.weaponGoals);
  const completeAllGoals = useAppStore((s) => s.completeAllGoals);

  const cost = computeAllGoalsCost();

  // Real cost excludes virtual EXP materials
  const realCost: Record<string, number> = {};
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number' && !VIRTUAL_EXP_MATERIALS.has(k as MaterialName)) {
      realCost[k] = v;
    }
  }

  const missing = diffStock(stock, realCost as Stock);
  const hasGoals =
    operatorGoals.some((g) => !g.hidden) || weaponGoals.some((g) => !g.hidden);

  function completeAll() {
    completeAllGoals(realCost as Stock);
  }

  return (
    <div
      className="relative rounded-feature p-6 bg-canvas/90 backdrop-blur-sm border border-signal/40 flex flex-col gap-4"
      style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}
    >
      <CornerBrackets />

      {/* Section kicker */}
      <div>
        <div
          className="font-mono uppercase text-signal mb-1"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          COST SUMMARY
        </div>
        <h3 className="font-sans font-bold text-white text-xl">消耗汇总</h3>
      </div>

      {/* Cost rows */}
      <div className="flex flex-col gap-1.5">
        {MATERIAL_COLUMNS.map((m) => {
          const need = cost[m as MaterialName];
          if (!need) return null;
          const isExp = VIRTUAL_EXP_MATERIALS.has(m as MaterialName);
          const have = stock[m as MaterialName] ?? 0;
          const short = !isExp && have < need;
          return (
            <div key={m} className="flex items-center gap-2">
              <img
                src={`/${MATERIAL_ICONS[m as MaterialName]}`}
                alt={m}
                className="w-6 h-6 rounded-sm shrink-0"
                loading="lazy"
              />
              <div className="font-sans text-[13px] text-[#e9e9e9] flex-1 truncate">{m}</div>
              <div
                className={`text-right font-mono text-[13px] ${short ? 'text-alert font-bold' : 'text-white'}`}
              >
                {isExp
                  ? need.toLocaleString()
                  : `${have} / ${need}${short ? ` (缺 ${need - have})` : ''}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk complete — only visible when all materials are available */}
      {hasGoals && Object.keys(missing).length === 0 && (
        <Button className="w-full mt-2" onClick={completeAll}>
          完成全部规划（扣减库存）
        </Button>
      )}

      {!hasGoals && (
        <div
          className="font-mono uppercase text-[#5a5a5a] text-center"
          style={{ fontSize: '11px', letterSpacing: '1.5px' }}
        >
          暂无规划
        </div>
      )}
    </div>
  );
}
