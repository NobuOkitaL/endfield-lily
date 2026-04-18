// frontend/src/pages/PlannerPage.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { OperatorGoalCard } from '@/components/planner/OperatorGoalCard';
import { WeaponGoalCard } from '@/components/planner/WeaponGoalCard';
import { AddGoalDialog } from '@/components/planner/AddGoalDialog';
import { CostSummary } from '@/components/planner/CostSummary';
import { useAppStore } from '@/store/app-store';

export default function PlannerPage() {
  const [addOpen, setAddOpen] = useState(false);
  const operatorGoals = useAppStore((s) => s.operatorGoals);
  const weaponGoals = useAppStore((s) => s.weaponGoals);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex justify-between items-center mb-2">
          <div>
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              PLANNER / 养成规划
            </div>
            <h1
              className="font-display text-white"
              style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
            >
              规划
            </h1>
          </div>
          <Button onClick={() => setAddOpen(true)}>新增规划</Button>
        </div>
        <p className="text-[#949494] font-sans text-[15px] -mt-4">
          创建干员和武器的养成目标，自动计算所需材料。
        </p>

        {/* Operator goals section */}
        {operatorGoals.length > 0 && (
          <div className="space-y-3">
            <div
              className="font-mono uppercase text-[#5a5a5a] border-b border-white/10 pb-2"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              ── 干员规划 ({operatorGoals.length})
            </div>
            {operatorGoals.map((goal) => (
              <OperatorGoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}

        {/* Weapon goals section */}
        {weaponGoals.length > 0 && (
          <div className="space-y-3">
            <div
              className="font-mono uppercase text-[#5a5a5a] border-b border-white/10 pb-2"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              ── 武器规划 ({weaponGoals.length})
            </div>
            {weaponGoals.map((goal) => (
              <WeaponGoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {operatorGoals.length === 0 && weaponGoals.length === 0 && (
          <div
            className="font-mono uppercase text-[#949494]"
            style={{ fontSize: '11px', letterSpacing: '1.5px' }}
          >
            暂无规划。点击"新增规划"添加。
          </div>
        )}
      </div>

      <CostSummary />
      <AddGoalDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
