// frontend/src/components/planner/PlanRowList.tsx
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';

export function PlanRowList() {
  const rows = useAppStore((s) => s.planRows);
  const remove = useAppStore((s) => s.removePlanRow);
  const update = useAppStore((s) => s.updatePlanRow);

  if (rows.length === 0) {
    return (
      <div
        className="font-mono uppercase text-[#949494]"
        style={{ fontSize: '11px', letterSpacing: '1.5px' }}
      >
        暂无规划。点击"新增规划"添加。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className={[
            'border border-white/20 rounded-card p-5 bg-canvas',
            'border-l-4 border-l-mint',
            'flex items-center justify-between gap-4',
            r.hidden ? 'opacity-50' : '',
          ].join(' ')}
        >
          <div className="flex-1 min-w-0">
            {/* Mono kicker: project type */}
            <div
              className="font-mono uppercase text-mint mb-1"
              style={{ fontSize: '11px', letterSpacing: '1.5px' }}
            >
              {r.项目}
            </div>
            {/* Operator/weapon name */}
            <div className="font-sans font-bold text-white text-base">{r.干员}</div>
            {/* Level range */}
            <div
              className="font-mono text-[#949494] mt-0.5"
              style={{ fontSize: '11px', letterSpacing: '1.1px' }}
            >
              {r.现等级} → {r.目标等级}
            </div>
          </div>

          {/* Action buttons — right aligned */}
          <div className="flex gap-2 ml-auto shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update(r.id, { hidden: !r.hidden })}
            >
              {r.hidden ? '启用' : '禁用'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => remove(r.id)}
            >
              移除
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
