// frontend/src/components/operators/OperatorGrid.tsx
import { useState } from 'react';
import { CHARACTER_LIST, OPERATOR_AVATARS } from '@/data/operators';
import { useAppStore } from '@/store/app-store';
import { OperatorEditDialog } from './OperatorEditDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function OperatorGrid() {
  const owned = useAppStore((s) => s.ownedOperators);
  const setOwned = useAppStore((s) => s.setOwnedOperator);
  const removeOwned = useAppStore((s) => s.removeOwnedOperator);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const names = CHARACTER_LIST.filter((n) => (filter ? n.includes(filter) : true));

  return (
    <div className="space-y-4">
      <Input
        placeholder="搜索干员..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {names.map((n) => {
          const has = owned[n];
          return (
            <div
              key={n}
              className={[
                'border border-white/20 rounded-card p-4 bg-canvas',
                'flex items-center justify-between gap-3',
                // Owned: signal yellow left rail
                has ? 'border-l-4 border-l-signal' : '',
              ].join(' ')}
            >
              <img
                src={`/${OPERATOR_AVATARS[n]}`}
                alt={n}
                className="w-14 h-14 rounded-md shrink-0 object-cover"
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <div className="font-sans font-bold text-white text-base leading-tight">
                  {n}
                </div>
                <div
                  className="font-mono uppercase text-[#949494] mt-1"
                  style={{ fontSize: '10px', letterSpacing: '1.5px' }}
                >
                  {has
                    ? `精${has.精英阶段} LV.${has.等级} 装${has.装备适配} 潜${has.天赋} 建${has.基建} 信${has.信赖}`
                    : '未持有'}
                </div>
              </div>
              {/* Button right-aligned */}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => setEditing(n)}
              >
                {has ? '编辑' : '添加'}
              </Button>
            </div>
          );
        })}
      </div>

      <OperatorEditDialog
        operatorName={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ? owned[editing] : undefined}
        onSave={(state) => { if (editing) { setOwned(editing, state); setEditing(null); } }}
        onRemove={editing && owned[editing] ? () => { removeOwned(editing); setEditing(null); } : undefined}
      />
    </div>
  );
}
