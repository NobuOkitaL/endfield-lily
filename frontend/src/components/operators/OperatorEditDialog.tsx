// frontend/src/components/operators/OperatorEditDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import type { OperatorState } from '@/store/app-store';

const DEFAULT_STATE: OperatorState = {
  精英阶段: 0, 等级: 1, 装备适配: 0, 天赋: 0, 基建: 0, 信赖: 0,
  技能1: 1, 技能2: 1, 技能3: 1, 技能4: 1,
};

const FIELDS: { key: keyof OperatorState; label: string; min: number; max: number }[] = [
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

export function OperatorEditDialog({
  operatorName, open, onOpenChange, initial, onSave, onRemove,
}: {
  operatorName: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: OperatorState;
  onSave: (state: OperatorState) => void;
  onRemove?: () => void;
}) {
  const [state, setState] = useState<OperatorState>(initial ?? DEFAULT_STATE);
  useEffect(() => { setState(initial ?? DEFAULT_STATE); }, [initial, open]);
  if (!operatorName) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{operatorName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number" min={f.min} max={f.max}
                value={state[f.key]}
                onChange={(e) => {
                  const v = Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min));
                  setState((s) => ({ ...s, [f.key]: v }));
                }}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          {onRemove && <Button variant="destructive" onClick={onRemove}>移除</Button>}
          <Button onClick={() => onSave(state)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
