// frontend/src/components/planner/OperatorGoalDetailDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore, DEFAULT_OPERATOR_STATE } from '@/store/app-store';
import type { OperatorGoal, OperatorState } from '@/store/app-store';
import { computeOperatorGoalCost } from '@/logic/plan-aggregator';
import { isAffordable } from '@/logic/stock';
import type { Stock } from '@/logic/stock';
import { MATERIAL_ICONS, VIRTUAL_EXP_MATERIALS } from '@/data/materials';
import type { MaterialName } from '@/data/materials';

const FIELDS: {
  key: keyof OperatorState;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: '精英阶段', label: '精英阶段', min: 0, max: 4 },
  { key: '等级', label: '等级', min: 1, max: 90 },
  { key: '装备适配', label: '装备适配', min: 0, max: 3 },
  { key: '天赋', label: '天赋', min: 0, max: 4 },
  { key: '基建', label: '基建', min: 0, max: 4 },
  { key: '信赖', label: '信赖', min: 0, max: 4 },
  { key: '技能1', label: '技能1', min: 1, max: 12 },
  { key: '技能2', label: '技能2', min: 1, max: 12 },
  { key: '技能3', label: '技能3', min: 1, max: 12 },
  { key: '技能4', label: '技能4', min: 1, max: 12 },
];

interface Props {
  goal: OperatorGoal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OperatorGoalDetailDialog({ goal, open, onOpenChange }: Props) {
  const updateTarget = useAppStore((s) => s.updateOperatorGoalTarget);
  const removeGoal = useAppStore((s) => s.removeOperatorGoal);
  const toggleHidden = useAppStore((s) => s.toggleOperatorGoalHidden);
  const applyGoal = useAppStore((s) => s.applyOperatorGoal);
  const stock = useAppStore((s) => s.stock);
  const ownedOps = useAppStore((s) => s.ownedOperators);

  const current = ownedOps[goal.operator] ?? DEFAULT_OPERATOR_STATE;
  const notOwned = !ownedOps[goal.operator];

  const costFull = computeOperatorGoalCost(goal, current);
  const realCost: Record<string, number> = {};
  for (const [k, v] of Object.entries(costFull)) {
    if (typeof v === 'number' && v > 0 && !VIRTUAL_EXP_MATERIALS.has(k as MaterialName)) {
      realCost[k] = v;
    }
  }
  const affordable = isAffordable(stock, realCost as never);
  const hasCost = Object.keys(realCost).length > 0;

  const allItems = Object.entries(realCost).sort(([, a], [, b]) => b - a);

  function handleTargetChange(key: keyof OperatorState, value: number, min: number, max: number) {
    const clamped = Math.max(min, Math.min(max, isNaN(value) ? min : value));
    updateTarget(goal.id, { [key]: clamped });
  }

  function handleComplete() {
    applyGoal(goal.id, realCost as Stock);
    onOpenChange(false);
  }

  function handleRemove() {
    removeGoal(goal.id);
    onOpenChange(false);
  }

  function handleToggleHidden() {
    toggleHidden(goal.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-sm bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <span className="font-mono text-[9px] text-[#949494] uppercase leading-none text-center px-1">
                {goal.operator.slice(0, 2)}
              </span>
            </div>
            <div className="min-w-0">
              <div
                className="font-mono uppercase text-signal mb-0.5"
                style={{ fontSize: '10px', letterSpacing: '1.8px' }}
              >
                OPERATOR / 干员规划
              </div>
              <DialogTitle>{goal.operator}</DialogTitle>
              {notOwned && (
                <p className="font-mono text-[10px] text-[#949494] mt-0.5">
                  未添加到已持有 — 以默认值计算
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Dimension rows: current → target */}
        <div className="grid grid-cols-1 gap-y-1.5">
          {/* Header labels */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-1 mb-1">
            <div className="font-mono uppercase text-[#5a5a5a]" style={{ fontSize: '10px', letterSpacing: '1.4px' }}>维度</div>
            <div className="font-mono uppercase text-[#5a5a5a] w-10 text-center" style={{ fontSize: '10px', letterSpacing: '1.4px' }}>当前</div>
            <div className="font-mono uppercase text-signal w-16 text-center" style={{ fontSize: '10px', letterSpacing: '1.4px' }}>目标</div>
          </div>

          {FIELDS.map((f) => {
            const currentVal = current[f.key] as number;
            const targetVal = goal.target[f.key] as number;
            const hasUpgrade = targetVal > currentVal;

            return (
              <div
                key={f.key}
                className={[
                  'grid grid-cols-[1fr_auto_auto] gap-x-3 items-center rounded-sm px-2 py-1',
                  hasUpgrade ? 'bg-white/5' : '',
                ].join(' ')}
              >
                <span className="font-sans text-[13px] text-[#c9c9c9]">{f.label}</span>
                <span className="font-mono text-[13px] text-[#666] w-10 text-center">
                  {currentVal}
                </span>
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={targetVal}
                  onChange={(e) => handleTargetChange(f.key, parseInt(e.target.value, 10), f.min, f.max)}
                  className={[
                    'w-16 rounded-form bg-canvas border text-center font-mono text-[13px] text-white',
                    'px-1 py-0.5 focus:outline-none transition-colors duration-150',
                    hasUpgrade
                      ? 'border-signal/50 focus:border-signal'
                      : 'border-white/20 focus:border-white/40',
                  ].join(' ')}
                />
              </div>
            );
          })}
        </div>

        {/* Cost summary */}
        {hasCost && (
          <div className="border-t border-white/10 pt-3">
            <div
              className="font-mono uppercase text-[#5a5a5a] mb-2"
              style={{ fontSize: '10px', letterSpacing: '1.4px' }}
            >
              所需材料
            </div>
            <div className="flex flex-wrap gap-2">
              {allItems.map(([name, qty]) => {
                const icon = MATERIAL_ICONS[name as MaterialName];
                const have = stock[name as MaterialName] ?? 0;
                const short = have < qty;
                return (
                  <div
                    key={name}
                    className={[
                      'flex items-center gap-1.5 rounded-sm px-2 py-1 border',
                      short ? 'border-alert/40 bg-alert/5' : 'border-white/10 bg-white/5',
                    ].join(' ')}
                    title={`${name}: 需要 ${qty}，持有 ${have}`}
                  >
                    {icon && (
                      <img
                        src={`/${icon}`}
                        alt={name}
                        className="w-4 h-4 rounded-sm shrink-0"
                        loading="lazy"
                      />
                    )}
                    <span className={`font-mono text-[11px] ${short ? 'text-alert font-bold' : 'text-[#c9c9c9]'}`}>
                      {qty.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center">
          {/* Destructive left */}
          <Button
            variant="destructive"
            size="sm"
            className="mr-auto"
            onClick={handleRemove}
          >
            移除
          </Button>
          {/* Right side actions */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleHidden}
          >
            {goal.hidden ? '启用' : '禁用'}
          </Button>
          <Button
            disabled={!hasCost || !affordable}
            size="sm"
            onClick={handleComplete}
            title={
              !hasCost
                ? '目标与当前相同，无需完成'
                : !affordable
                ? '材料不足，无法完成'
                : '扣减材料并更新干员状态'
            }
          >
            完成规划
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
