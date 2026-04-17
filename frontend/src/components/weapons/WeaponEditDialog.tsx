// frontend/src/components/weapons/WeaponEditDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import type { WeaponState } from '@/store/app-store';

const DEFAULT: WeaponState = { 破限阶段: 0, 等级: 1 };

export function WeaponEditDialog({
  weaponName, open, onOpenChange, initial, onSave, onRemove,
}: {
  weaponName: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: WeaponState;
  onSave: (state: WeaponState) => void;
  onRemove?: () => void;
}) {
  const [state, setState] = useState<WeaponState>(initial ?? DEFAULT);
  useEffect(() => { setState(initial ?? DEFAULT); }, [initial, open]);
  if (!weaponName) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{weaponName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>破限阶段</Label>
            <Input
              type="number" min={0} max={4}
              value={state.破限阶段}
              onChange={(e) => setState((s) => ({ ...s, 破限阶段: Math.max(0, Math.min(4, Number(e.target.value) || 0)) }))}
            />
          </div>
          <div>
            <Label>等级</Label>
            <Input
              type="number" min={1} max={90}
              value={state.等级}
              onChange={(e) => setState((s) => ({ ...s, 等级: Math.max(1, Math.min(90, Number(e.target.value) || 1)) }))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {onRemove && <Button variant="destructive" onClick={onRemove}>移除</Button>}
          <Button onClick={() => onSave(state)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
