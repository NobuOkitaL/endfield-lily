// frontend/src/components/planner/AddGoalDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CHARACTER_LIST } from '@/data/operators';
import { WEAPON_LIST } from '@/data/weapons';
import { useAppStore } from '@/store/app-store';

const selectClass = [
  'w-full rounded-form px-2 py-1.5 font-sans text-[15px] text-white',
  'bg-canvas border border-white/30',
  'focus:outline-none focus:border-signal transition-colors duration-150',
].join(' ');

type GoalType = 'operator' | 'weapon';

export function AddGoalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const addOperatorGoal = useAppStore((s) => s.addOperatorGoal);
  const addWeaponGoal = useAppStore((s) => s.addWeaponGoal);
  const operatorGoals = useAppStore((s) => s.operatorGoals);
  const weaponGoals = useAppStore((s) => s.weaponGoals);

  const [goalType, setGoalType] = useState<GoalType>('operator');
  const [selected, setSelected] = useState('');

  // Reset on close
  useEffect(() => {
    if (!open) {
      setGoalType('operator');
      setSelected('');
    }
  }, [open]);

  // Operators and weapons that already have an active goal
  const activeOperators = new Set(operatorGoals.map((g) => g.operator));
  const activeWeapons = new Set(weaponGoals.map((g) => g.weapon));

  const availableOperators = CHARACTER_LIST.filter((n) => !activeOperators.has(n));
  const availableWeapons = WEAPON_LIST.filter((w) => !activeWeapons.has(w.name));

  function handleSave() {
    if (!selected) return;
    if (goalType === 'operator') {
      addOperatorGoal(selected);
    } else {
      addWeaponGoal(selected);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增规划</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(['operator', 'weapon'] as GoalType[]).map((t) => (
              <button
                key={t}
                onClick={() => { setGoalType(t); setSelected(''); }}
                className={[
                  'flex-1 rounded-pill py-1.5 font-mono text-[12px] uppercase tracking-widest transition-colors duration-150',
                  goalType === t
                    ? 'bg-signal text-black font-bold'
                    : 'border border-white/20 text-[#949494] hover:text-white hover:border-white/40',
                ].join(' ')}
              >
                {t === 'operator' ? '干员' : '武器'}
              </button>
            ))}
          </div>

          {/* Selector */}
          <div className="space-y-1.5">
            <Label>{goalType === 'operator' ? '选择干员' : '选择武器'}</Label>
            <select
              className={selectClass}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">-- 选择 --</option>
              {goalType === 'operator'
                ? availableOperators.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))
                : availableWeapons.map((w) => (
                    <option key={w.name} value={w.name}>{w.name}（{w.star}★）</option>
                  ))}
            </select>
            {goalType === 'operator' && availableOperators.length === 0 && (
              <p className="text-[#949494] font-sans text-[13px]">所有干员均已有规划</p>
            )}
            {goalType === 'weapon' && availableWeapons.length === 0 && (
              <p className="text-[#949494] font-sans text-[13px]">所有武器均已有规划</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!selected}>
            添加规划
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
