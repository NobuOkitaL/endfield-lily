// frontend/src/components/recognize/WeaponResultEditor.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore, DEFAULT_WEAPON_STATE } from '@/store/app-store';
import { WEAPON_LIST } from '@/data/weapons';
import type { WeaponsResponse } from '@/api/recognition';

interface WeaponResultEditorProps {
  result: WeaponsResponse;
  onApplied: () => void;
}

export function WeaponResultEditor({ result, onApplied }: WeaponResultEditorProps) {
  const ownedWeapons = useAppStore((s) => s.ownedWeapons);
  const setOwnedWeapon = useAppStore((s) => s.setOwnedWeapon);

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
      const prev = ownedWeapons[entry.name] ?? DEFAULT_WEAPON_STATE;
      setOwnedWeapon(entry.name, { ...prev, 等级: entry.level });
    }
    onApplied();
  }

  return (
    <div className="space-y-6">
      {result.items.length > 0 && (
        <div className="space-y-3">
          <div
            className="font-mono uppercase text-signal"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            RECOGNIZED WEAPONS / 识别结果
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
                  {WEAPON_LIST.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.name}
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

      <div className="flex justify-end">
        <Button variant="default" onClick={handleApply}>
          合并到武器
        </Button>
      </div>
    </div>
  );
}
