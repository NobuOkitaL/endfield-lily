// frontend/src/components/recognize/InventoryResultEditor.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { MATERIAL_COLUMNS } from '@/data/materials';
import type { InventoryResponse } from '@/api/recognition';
import type { MaterialName } from '@/data/materials';

interface InventoryResultEditorProps {
  result: InventoryResponse;
  onApplied: () => void;
}

export function InventoryResultEditor({ result, onApplied }: InventoryResultEditorProps) {
  const stock = useAppStore((s) => s.stock);
  const replaceStock = useAppStore((s) => s.replaceStock);

  // Editable quantities for recognized items
  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(result.items.map((item) => [item.material_id, item.quantity])),
  );

  // Editable unknowns: each has a chosen material name + quantity
  const [unknownMaterials, setUnknownMaterials] = useState<Record<number, MaterialName>>(
    () =>
      Object.fromEntries(
        result.unknowns.map((u, i) => [
          i,
          (u.best_guess_material_id as MaterialName | null) ?? MATERIAL_COLUMNS[0],
        ]),
      ),
  );
  const [unknownQuantities, setUnknownQuantities] = useState<Record<number, number>>(
    () => Object.fromEntries(result.unknowns.map((_, i) => [i, 0])),
  );

  function handleApply() {
    const patch: Record<string, number> = {};

    // Add recognized items
    for (const item of result.items) {
      const qty = quantities[item.material_id] ?? item.quantity;
      if (qty > 0) {
        patch[item.material_id] = qty;
      }
    }

    // Add resolved unknowns
    for (let i = 0; i < result.unknowns.length; i++) {
      const name = unknownMaterials[i];
      const qty = unknownQuantities[i] ?? 0;
      if (name && qty > 0) {
        patch[name] = (patch[name] ?? 0) + qty;
      }
    }

    replaceStock({ ...stock, ...patch });
    onApplied();
  }

  return (
    <div className="space-y-6">
      {/* Recognized items */}
      {result.items.length > 0 && (
        <div className="space-y-3">
          <div
            className="font-mono uppercase text-signal"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            RECOGNIZED ITEMS / 识别结果
          </div>
          <div className="space-y-2">
            {result.items.map((item) => (
              <div
                key={item.material_id}
                className="flex items-center gap-4 border border-white/10 rounded-sm px-4 py-2"
              >
                <span className="font-sans text-white text-sm flex-1">{item.material_name}</span>
                <span
                  className="font-mono text-[#949494]"
                  style={{ fontSize: '11px', letterSpacing: '1px' }}
                >
                  {Math.round(item.confidence * 100)}%
                </span>
                <input
                  type="number"
                  min={0}
                  value={quantities[item.material_id] ?? item.quantity}
                  onChange={(e) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [item.material_id]: Number(e.target.value),
                    }))
                  }
                  className="w-20 bg-transparent border border-white/20 rounded-sm px-2 py-1 text-right font-mono text-white text-sm focus:outline-none focus:border-signal"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unknown slots */}
      {result.unknowns.length > 0 && (
        <div className="space-y-3">
          <div
            className="font-mono uppercase text-alert"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            UNRECOGNIZED / 未识别
          </div>
          <div className="border border-alert/40 rounded-card p-4 space-y-3">
            {result.unknowns.map((u, i) => (
              <div key={i} className="flex items-center gap-4">
                {u.icon_thumbnail_base64 && (
                  <img
                    src={`data:image/png;base64,${u.icon_thumbnail_base64}`}
                    alt="unknown"
                    className="w-10 h-10 rounded-sm border border-white/10 object-cover"
                  />
                )}
                <select
                  value={unknownMaterials[i] ?? MATERIAL_COLUMNS[0]}
                  onChange={(e) =>
                    setUnknownMaterials((prev) => ({
                      ...prev,
                      [i]: e.target.value as MaterialName,
                    }))
                  }
                  className="flex-1 bg-[#1e1e1e] border border-white/20 rounded-sm px-2 py-1 font-sans text-white text-sm focus:outline-none focus:border-signal"
                >
                  {MATERIAL_COLUMNS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={unknownQuantities[i] ?? 0}
                  onChange={(e) =>
                    setUnknownQuantities((prev) => ({
                      ...prev,
                      [i]: Number(e.target.value),
                    }))
                  }
                  className="w-20 bg-transparent border border-white/20 rounded-sm px-2 py-1 text-right font-mono text-white text-sm focus:outline-none focus:border-signal"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      <div className="flex justify-end">
        <Button variant="default" onClick={handleApply}>
          合并到库存
        </Button>
      </div>
    </div>
  );
}
