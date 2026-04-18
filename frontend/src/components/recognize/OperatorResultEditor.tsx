// frontend/src/components/recognize/OperatorResultEditor.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { CHARACTER_LIST } from '@/data/operators';
import type { OperatorsResponse } from '@/api/recognition';
import type { OperatorState } from '@/store/app-store';

interface OperatorResultEditorProps {
  result: OperatorsResponse;
  onApplied: () => void;
}

const DEFAULT_STATE: OperatorState = {
  精英阶段: 0,
  等级: 1,
  装备适配: 0,
  天赋: 0,
  基建: 0,
  信赖: 0,
  技能1: 1,
  技能2: 1,
  技能3: 1,
  技能4: 1,
};

export function OperatorResultEditor({ result, onApplied }: OperatorResultEditorProps) {
  const ownedOperators = useAppStore((s) => s.ownedOperators);
  const setOwnedOperator = useAppStore((s) => s.setOwnedOperator);

  // Editable entries: name + level
  const [entries, setEntries] = useState(() =>
    result.items.map((item) => ({
      name: item.name,
      level: item.level,
    })),
  );

  function setEntryName(i: number, name: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, name } : e)));
  }

  function setEntryLevel(i: number, level: number) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, level } : e)));
  }

  function handleApply() {
    for (const entry of entries) {
      if (!entry.name) continue;
      const prev = ownedOperators[entry.name] ?? DEFAULT_STATE;
      setOwnedOperator(entry.name, { ...prev, 等级: entry.level });
    }
    onApplied();
  }

  return (
    <div className="space-y-6">
      {/* Recognized operators */}
      {result.items.length > 0 && (
        <div className="space-y-3">
          <div
            className="font-mono uppercase text-signal"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            RECOGNIZED OPERATORS / 识别结果
          </div>
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border border-white/10 rounded-sm px-4 py-2"
              >
                <span
                  className="font-mono text-[#949494]"
                  style={{ fontSize: '11px', letterSpacing: '1px' }}
                >
                  {Math.round((result.items[i]?.confidence ?? 0) * 100)}%
                </span>
                <select
                  value={entry.name}
                  onChange={(e) => setEntryName(i, e.target.value)}
                  className="flex-1 bg-[#1e1e1e] border border-white/20 rounded-sm px-2 py-1 font-sans text-white text-sm focus:outline-none focus:border-signal"
                >
                  {CHARACTER_LIST.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className="font-sans text-[#949494] text-sm">Lv.</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={entry.level}
                  onChange={(e) => setEntryLevel(i, Number(e.target.value))}
                  className="w-16 bg-transparent border border-white/20 rounded-sm px-2 py-1 text-right font-mono text-white text-sm focus:outline-none focus:border-signal"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unknown operator slots */}
      {result.unknowns.length > 0 && (
        <div className="space-y-3">
          <div
            className="font-mono uppercase text-alert"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            UNRECOGNIZED / 未识别 ({result.unknowns.length})
          </div>
          <div className="border border-alert/40 rounded-card p-4 space-y-2">
            {result.unknowns.map((u, i) => (
              <div key={i} className="flex items-center gap-4">
                {u.icon_thumbnail_base64 && (
                  <img
                    src={`data:image/png;base64,${u.icon_thumbnail_base64}`}
                    alt="unknown"
                    className="w-10 h-10 rounded-sm border border-white/10 object-cover"
                  />
                )}
                <span className="font-sans text-[#949494] text-sm flex-1">
                  OCR: {u.raw_ocr_text || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      <div className="flex justify-end">
        <Button variant="default" onClick={handleApply}>
          合并到干员
        </Button>
      </div>
    </div>
  );
}
