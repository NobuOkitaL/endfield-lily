// frontend/src/pages/OperatorsPage.tsx
import { OperatorGrid } from '@/components/operators/OperatorGrid';

export default function OperatorsPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">干员</h2>
      <p className="text-sm text-muted-foreground">记录你持有的每个干员的当前状态（10 个成长维度）。</p>
      <OperatorGrid />
    </div>
  );
}
