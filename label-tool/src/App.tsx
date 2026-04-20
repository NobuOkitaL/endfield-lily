import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = 'http://localhost:8000';

type AssetType = 'materials' | 'operators' | 'weapons';

const ASSET_LABELS: Record<AssetType, string> = {
  materials: '材料',
  operators: '干员',
  weapons: '武器',
};

const ASSET_TYPES: AssetType[] = ['materials', 'operators', 'weapons'];

type Slot = {
  index: number;
  bbox: [number, number, number, number];
  icon_base64: string;
};

type LabeledSlot = Slot & {
  uid: string;
  name: string;
  sourceFile: string;
};

type Toast = { kind: 'ok' | 'err'; msg: string } | null;

function useBackendHealth(): 'ok' | 'err' | 'loading' {
  const [status, setStatus] = useState<'ok' | 'err' | 'loading'>('loading');
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const r = await fetch(`${API_BASE}/health`);
        if (cancelled) return;
        setStatus(r.ok ? 'ok' : 'err');
      } catch {
        if (!cancelled) setStatus('err');
      }
    };
    ping();
    const t = setInterval(ping, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return status;
}

async function fetchNames(assetType: AssetType): Promise<string[]> {
  const r = await fetch(`${API_BASE}/dev/${assetType}/names`);
  if (!r.ok) throw new Error(`names failed: ${r.status}`);
  const j = (await r.json()) as { names: string[] };
  return j.names;
}

async function extractSlots(assetType: AssetType, file: File): Promise<Slot[]> {
  const form = new FormData();
  form.append('image', file);
  const r = await fetch(`${API_BASE}/dev/${assetType}/extract-slots`, {
    method: 'POST',
    body: form,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`extract failed (${r.status}): ${text}`);
  }
  const j = (await r.json()) as { slots: Slot[] };
  return j.slots;
}

async function saveTemplates(
  assetType: AssetType,
  entries: { name: string; icon_base64: string }[],
): Promise<number> {
  const r = await fetch(`${API_BASE}/dev/${assetType}/save-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`save failed (${r.status}): ${text}`);
  }
  const j = (await r.json()) as { saved: number };
  return j.saved;
}

export default function App() {
  const health = useBackendHealth();
  const [assetType, setAssetType] = useState<AssetType>('materials');
  const [names, setNames] = useState<string[]>([]);
  const [namesErr, setNamesErr] = useState<string | null>(null);
  const [slots, setSlots] = useState<LabeledSlot[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Fetch names whenever asset type changes.
  useEffect(() => {
    let cancelled = false;
    setNames([]);
    setNamesErr(null);
    fetchNames(assetType)
      .then(ns => {
        if (!cancelled) setNames(ns);
      })
      .catch(e => {
        if (!cancelled) setNamesErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [assetType]);

  // When switching asset type, clear existing labeled slots (they're asset-type specific).
  useEffect(() => {
    setSlots([]);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [assetType]);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (t) {
      window.setTimeout(() => setToast(null), 3500);
    }
  }, []);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    setPendingFiles(Array.from(list));
  };

  const doExtract = async () => {
    if (pendingFiles.length === 0) return;
    setExtracting(true);
    try {
      let added = 0;
      for (const f of pendingFiles) {
        try {
          const res = await extractSlots(assetType, f);
          setSlots(prev => [
            ...prev,
            ...res.map((s, i) => ({
              ...s,
              uid: `${f.name}-${Date.now()}-${i}`,
              name: '',
              sourceFile: f.name,
            })),
          ]);
          added += res.length;
        } catch (err) {
          showToast({ kind: 'err', msg: `提取失败 ${f.name}: ${String(err)}` });
        }
      }
      if (added > 0) {
        showToast({ kind: 'ok', msg: `已提取 ${added} 个 slot` });
      }
    } finally {
      setExtracting(false);
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateName = (uid: string, name: string) => {
    setSlots(prev => prev.map(s => (s.uid === uid ? { ...s, name } : s)));
  };

  const removeSlot = (uid: string) => {
    setSlots(prev => prev.filter(s => s.uid !== uid));
  };

  const clearAll = () => {
    setSlots([]);
  };

  const labeledCount = useMemo(
    () => slots.filter(s => s.name.trim() !== '').length,
    [slots],
  );

  const doSave = async () => {
    const entries = slots
      .filter(s => s.name.trim() !== '')
      .map(s => ({ name: s.name, icon_base64: s.icon_base64 }));
    if (entries.length === 0) return;
    setSaving(true);
    try {
      const saved = await saveTemplates(assetType, entries);
      showToast({ kind: 'ok', msg: `已保存 ${saved} 条模板` });
      // Drop the successfully saved items so the list only keeps unlabeled/unsaved.
      setSlots(prev => prev.filter(s => s.name.trim() === ''));
    } catch (err) {
      showToast({ kind: 'err', msg: `保存失败: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-semibold tracking-wide">标注工具</h1>
        <span className="text-xs text-neutral-500">终末地模板截图</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span
            className={
              'inline-block w-2.5 h-2.5 rounded-full ' +
              (health === 'ok'
                ? 'bg-emerald-400'
                : health === 'err'
                ? 'bg-red-500'
                : 'bg-amber-400')
            }
          />
          <span className="text-neutral-400">
            backend {health === 'ok' ? 'online' : health === 'err' ? 'offline' : '...'}
          </span>
        </div>
      </header>

      {/* Controls */}
      <section className="px-6 py-4 border-b border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500 mr-2">资源类型</span>
          {ASSET_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setAssetType(t)}
              className={
                'px-3 py-1.5 text-sm rounded border transition-colors ' +
                (assetType === t
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-400/10'
                  : 'border-neutral-700 text-neutral-300 hover:border-neutral-500')
              }
            >
              {ASSET_LABELS[t]}
            </button>
          ))}
          <span className="ml-4 text-xs text-neutral-500">
            {namesErr
              ? `获取名称失败: ${namesErr}`
              : names.length > 0
              ? `${names.length} 个可选名称`
              : '加载名称中…'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesPicked}
            className="text-sm text-neutral-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-neutral-700 file:bg-neutral-900 file:text-neutral-200 file:text-xs hover:file:bg-neutral-800 file:cursor-pointer"
          />
          <button
            onClick={doExtract}
            disabled={extracting || pendingFiles.length === 0 || health !== 'ok'}
            className="px-4 py-1.5 text-sm rounded border border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {extracting ? '提取中…' : `提取 slot${pendingFiles.length > 0 ? ` (${pendingFiles.length} 张)` : ''}`}
          </button>
          {slots.length > 0 && (
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-sm rounded border border-neutral-700 text-neutral-400 hover:border-neutral-500"
            >
              清空
            </button>
          )}
        </div>
      </section>

      {/* Slots grid */}
      <main className="flex-1 overflow-auto px-6 py-4">
        {slots.length === 0 ? (
          <div className="text-neutral-500 text-sm py-16 text-center">
            上传一张或多张游戏截图，点击「提取 slot」开始。
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {slots.map(s => (
              <div
                key={s.uid}
                className="bg-neutral-900/60 border border-neutral-800 rounded p-2 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[10px] text-neutral-500 truncate">
                    {s.sourceFile}
                  </span>
                  <button
                    onClick={() => removeSlot(s.uid)}
                    className="text-neutral-500 hover:text-red-400 text-xs px-1"
                    aria-label="remove"
                    title="移除"
                  >
                    ×
                  </button>
                </div>
                <div className="bg-neutral-950 rounded h-[84px] flex items-center justify-center overflow-hidden">
                  <img
                    src={`data:image/png;base64,${s.icon_base64}`}
                    alt="slot"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <select
                  value={s.name}
                  onChange={e => updateName(s.uid, e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="">— 跳过 —</option>
                  {names.map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <footer className="border-t border-neutral-800 px-6 py-3 flex items-center gap-4 sticky bottom-0 bg-[#0b0b0b]">
        <span className="text-xs text-neutral-400">
          已标注 <span className="text-emerald-300">{labeledCount}</span> / {slots.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {toast && (
            <span
              className={
                'text-xs px-2 py-1 rounded border ' +
                (toast.kind === 'ok'
                  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                  : 'border-red-500/40 text-red-300 bg-red-500/10')
              }
            >
              {toast.msg}
            </span>
          )}
          <button
            onClick={doSave}
            disabled={saving || labeledCount === 0}
            className="px-4 py-1.5 text-sm rounded bg-emerald-400 text-neutral-950 font-medium hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '保存中…' : `保存 ${labeledCount} 条`}
          </button>
        </div>
      </footer>
    </div>
  );
}
