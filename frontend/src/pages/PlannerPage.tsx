// frontend/src/pages/PlannerPage.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanRowList } from '@/components/planner/PlanRowList';
import { AddPlanRowDialog } from '@/components/planner/AddPlanRowDialog';
import { CostSummary } from '@/components/planner/CostSummary';

export default function PlannerPage() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex justify-between items-center mb-2">
          <div>
            <div
              className="font-mono uppercase text-mint"
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
        <PlanRowList />
      </div>
      <CostSummary />
      <AddPlanRowDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
