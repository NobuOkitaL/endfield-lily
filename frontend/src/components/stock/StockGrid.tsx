// frontend/src/components/stock/StockGrid.tsx
import { useState } from 'react';
import { MATERIAL_COLUMNS, MATERIAL_ICONS, VIRTUAL_EXP_MATERIALS, type MaterialName } from '@/data/materials';
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
    <div className="space-y-4">
      <Input
        placeholder="搜索材料..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {rows.map((name) => {
          const iconSrc = `/${MATERIAL_ICONS[name]}`;
          if (VIRTUAL_EXP_MATERIALS.has(name)) {
            const val = computeVirtualExp(stock, EXP_TYPE_FOR_VIRTUAL[name]);
            return (
              <div
                key={name}
                className="border border-white/20 rounded-card p-3 bg-canvas border-l-2 border-l-mint"
              >
                <div className="flex items-center gap-2 mb-1">
                  <img src={iconSrc} alt={name} className="w-8 h-8 rounded-sm shrink-0" loading="lazy" />
                  <div className="font-sans text-sm font-bold text-white truncate">{name}</div>
                </div>
                <div
                  className="font-mono uppercase text-[#949494] mt-0.5"
                  style={{ fontSize: '10px', letterSpacing: '1.1px' }}
                >
                  计算值
                </div>
                <div className="font-mono text-mint mt-1.5" style={{ fontSize: '18px' }}>
                  {val.toLocaleString()}
                </div>
              </div>
            );
          }
          const current = stock[name as MaterialName] ?? 0;
          return (
            <div key={name} className="border border-white/20 rounded-card p-3 bg-canvas">
              <div className="flex items-center gap-2 mb-2">
                <img src={iconSrc} alt={name} className="w-8 h-8 rounded-sm shrink-0" loading="lazy" />
                <div className="font-sans text-sm font-bold text-white truncate">{name}</div>
              </div>
              <Input
                type="number"
                min={0}
                value={current}
                placeholder="0"
                onChange={(e) =>
                  setStock(name as MaterialName, Math.max(0, Number(e.target.value) || 0))
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
