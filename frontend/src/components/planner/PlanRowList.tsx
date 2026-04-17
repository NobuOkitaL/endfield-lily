// frontend/src/components/planner/PlanRowList.tsx
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';

export function PlanRowList() {
  const rows = useAppStore((s) => s.planRows);
  const remove = useAppStore((s) => s.removePlanRow);
  const update = useAppStore((s) => s.updatePlanRow);

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">暂无规划。点击"新增规划"添加。</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className={`border rounded-md p-3 flex items-center justify-between ${r.hidden ? 'opacity-50' : ''}`}
        >
          <div>
            <div className="font-medium">{r.干员} · {r.项目}</div>
            <div className="text-xs text-muted-foreground">{r.现等级} → {r.目标等级}</div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => update(r.id, { hidden: !r.hidden })}>
              {r.hidden ? '启用' : '禁用'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>移除</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
