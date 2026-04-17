// frontend/src/pages/PlannerPage.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanRowList } from '@/components/planner/PlanRowList';
import { AddPlanRowDialog } from '@/components/planner/AddPlanRowDialog';
import { CostSummary } from '@/components/planner/CostSummary';

export default function PlannerPage() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">规划</h2>
          <Button onClick={() => setAddOpen(true)}>新增规划</Button>
        </div>
        <PlanRowList />
      </div>
      <CostSummary />
      <AddPlanRowDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
