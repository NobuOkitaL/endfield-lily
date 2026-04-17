// frontend/src/components/stock/StockGrid.tsx
import { useState } from 'react';
import { MATERIAL_COLUMNS, VIRTUAL_EXP_MATERIALS, type MaterialName } from '@/data/materials';
import { useAppStore } from '@/store/app-store';
import { computeVirtualExp } from '@/logic/stock';
import { Input } from '@/components/ui/input';

const EXP_TYPE_FOR_VIRTUAL: Record<string, 'record' | 'cognition' | 'weapon'> = {
  '作战记录经验值': 'record',
  '认知载体经验值': 'cognition',
  '武器经验值': 'weapon',
};

export function StockGrid() {
  const stock = useAppStore((s) => s.stock);
  const setStock = useAppStore((s) => s.setStock);
  const [filter, setFilter] = useState('');

  const rows = MATERIAL_COLUMNS.filter((n) => (filter ? n.includes(filter) : true));

  return (
    <div className="space-y-3">
      <Input
        placeholder="搜索材料..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {rows.map((name) => {
          if (VIRTUAL_EXP_MATERIALS.has(name)) {
            const val = computeVirtualExp(stock, EXP_TYPE_FOR_VIRTUAL[name]);
            return (
              <div key={name} className="border rounded-md p-3 bg-muted/30">
                <div className="text-sm font-medium">{name}</div>
                <div className="text-xs text-muted-foreground mt-1">计算值</div>
                <div className="text-lg font-mono mt-1">{val.toLocaleString()}</div>
              </div>
            );
          }
          const current = stock[name as MaterialName] ?? 0;
          return (
            <div key={name} className="border rounded-md p-3">
              <div className="text-sm font-medium">{name}</div>
              <Input
                type="number"
                min={0}
                value={current}
                onChange={(e) =>
                  setStock(name as MaterialName, Math.max(0, Number(e.target.value) || 0))
                }
                className="mt-2"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
