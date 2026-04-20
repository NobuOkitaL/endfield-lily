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
    <div className="space-y-5">
      <Input
        placeholder="搜索材料..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 gap-x-4 gap-y-6">
        {rows.map((name) => {
          const iconSrc = `/${MATERIAL_ICONS[name]}`;
          const isVirtual = VIRTUAL_EXP_MATERIALS.has(name);

          return (
            <div
              key={name}
              className="group flex flex-col items-center text-center"
              title={name}
            >
              {/* Circular icon with ring */}
              <div
                className={
                  isVirtual
                    ? 'relative w-16 h-16 rounded-full bg-canvas border border-signal/70 flex items-center justify-center overflow-hidden'
                    : 'relative w-16 h-16 rounded-full bg-canvas border border-white/25 flex items-center justify-center overflow-hidden transition-colors group-hover:border-signal/70'
                }
              >
                <img
                  src={iconSrc}
                  alt={name}
                  className="w-[88%] h-[88%] object-contain"
                  loading="lazy"
                />
              </div>

              {/* Value — input for real, readonly for virtual EXP */}
              {isVirtual ? (
                <div
                  className="mt-2 w-full h-7 flex items-center justify-center bg-white/5 rounded-form font-mono text-signal"
                  style={{ fontSize: '13px' }}
                >
                  {computeVirtualExp(stock, EXP_TYPE_FOR_VIRTUAL[name]).toLocaleString()}
                </div>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={stock[name as MaterialName] ?? 0}
                  onChange={(e) =>
                    setStock(name as MaterialName, Math.max(0, Number(e.target.value) || 0))
                  }
                  onFocus={(e) => e.target.select()}
                  className="mt-2 w-full h-7 px-1 bg-white/5 border border-transparent rounded-form
                             text-center font-mono text-white text-[13px]
                             focus:outline-none focus:border-signal focus:bg-canvas transition-colors
                             [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              )}

              {/* Name caption */}
              <div
                className="mt-1.5 font-sans text-white/75 leading-tight w-full truncate"
                style={{ fontSize: '11px' }}
              >
                {name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
