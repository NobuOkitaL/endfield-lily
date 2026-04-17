// frontend/src/components/planner/CostSummary.tsx
import { useAppStore } from '@/store/app-store';
import { computeAllPlanCost } from '@/logic/plan-aggregator';
import { diffStock, deductStock } from '@/logic/stock';
import { Button } from '@/components/ui/button';
import { MATERIAL_COLUMNS, MATERIAL_ICONS, VIRTUAL_EXP_MATERIALS, type MaterialName } from '@/data/materials';

export function CostSummary() {
  const stock = useAppStore((s) => s.stock);
  const planRows = useAppStore((s) => s.planRows);
  const replaceStock = useAppStore((s) => s.replaceStock);
  const setOwnedOp = useAppStore((s) => s.setOwnedOperator);
  const setOwnedWp = useAppStore((s) => s.setOwnedWeapon);
  const removeRow = useAppStore((s) => s.removePlanRow);
  const ownedOps = useAppStore((s) => s.ownedOperators);
  const ownedWps = useAppStore((s) => s.ownedWeapons);

  const cost = computeAllPlanCost();

  // Compute missing ignoring virtual EXP materials
  const realCost: Record<string, number> = {};
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number' && !VIRTUAL_EXP_MATERIALS.has(k as MaterialName)) {
      realCost[k] = v;
    }
  }
  const missing = diffStock(stock, realCost as any);
  const hasPlans = planRows.some((r) => !r.hidden);

  function completeAll() {
    replaceStock(deductStock(stock, realCost as any));
    for (const r of planRows) {
      if (r.hidden) continue;
      if (ownedOps[r.干员] && r.项目 !== '破限') {
        const st = { ...ownedOps[r.干员] };
        if (r.项目 === '等级') st.等级 = r.目标等级;
        else if (r.项目 === '精英阶段') st.精英阶段 = r.目标等级;
        else if (r.项目 === '装备适配') st.装备适配 = r.目标等级;
        else if (r.项目 === '天赋') st.天赋 = r.目标等级;
        else if (r.项目 === '基建') st.基建 = r.目标等级;
        else if (r.项目 === '能力值（信赖）') st.信赖 = r.目标等级;
        else if (r.项目 === '技能1') st.技能1 = r.目标等级;
        else if (r.项目 === '技能2') st.技能2 = r.目标等级;
        else if (r.项目 === '技能3') st.技能3 = r.目标等级;
        else if (r.项目 === '技能4') st.技能4 = r.目标等级;
        setOwnedOp(r.干员, st);
      }
      if (ownedWps[r.干员]) {
        const st = { ...ownedWps[r.干员] };
        if (r.项目 === '等级') st.等级 = r.目标等级;
        else if (r.项目 === '破限') st.破限阶段 = r.目标等级;
        setOwnedWp(r.干员, st);
      }
      removeRow(r.id);
    }
  }

  return (
    <div
      className="rounded-feature p-6 bg-canvas border border-mint flex flex-col gap-4"
      style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}
    >
      {/* Section kicker */}
      <div>
        <div
          className="font-mono uppercase text-mint mb-1"
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
                className={`text-right font-mono text-[13px] ${short ? 'text-ultraviolet font-bold' : 'text-white'}`}
              >
                {isExp
                  ? need.toLocaleString()
                  : `${have} / ${need}${short ? ` (缺 ${need - have})` : ''}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Complete all button — full width at bottom */}
      {hasPlans && Object.keys(missing).length === 0 && (
        <Button className="w-full mt-2" onClick={completeAll}>
          完成全部规划（扣减库存）
        </Button>
      )}
    </div>
  );
}
