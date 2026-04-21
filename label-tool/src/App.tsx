import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const API_BASE = 'http://localhost:8000';

type AssetType = 'materials' | 'operators' | 'weapons';

const ASSET_LABELS: Record<AssetType, string> = {
  materials: '材料',
  operators: '干员',
  weapons: '武器',
};

const ASSET_TYPES: AssetType[] = ['materials', 'operators', 'weapons'];

type Mode = 'auto' | 'manual';

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

type NameEntry = { name: string; labeled: boolean };

async function fetchNames(assetType: AssetType): Promise<NameEntry[]> {
  const r = await fetch(`${API_BASE}/dev/${assetType}/names`);
  if (!r.ok) throw new Error(`names failed: ${r.status}`);
  const j = (await r.json()) as { names: NameEntry[] };
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
): Promise<{ saved: number; skipped: string[] }> {
  const r = await fetch(`${API_BASE}/dev/${assetType}/save-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`save failed (${r.status}): ${text}`);
  }
  return (await r.json()) as { saved: number; skipped: string[] };
}

async function deleteTemplate(assetType: AssetType, name: string): Promise<void> {
  const r = await fetch(
    `${API_BASE}/dev/${assetType}/templates/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`delete failed (${r.status}): ${text}`);
  }
}

function templateImageUrl(assetType: AssetType, name: string, cacheBust?: number): string {
  const base = `${API_BASE}/dev/${assetType}/templates/${encodeURIComponent(name)}/image`;
  return cacheBust ? `${base}?t=${cacheBust}` : base;
}

/**
 * Compact, searchable name picker that replaces a native <select>.
 *
 * Why: materials asset list is 36+ items, weapons is 68 — scrolling a native
 * dropdown to find one is slow. This shows the current selection as a button;
 * when focused it reveals a text input + filtered list (case-insensitive
 * substring match). Keyboard: ↑/↓ to navigate, Enter to pick, Esc to close,
 * click-outside also closes without mutating selection. Clearing the text
 * and pressing Enter on the "— 不导入 —" row (always first) resets to empty
 * (i.e. skip).
 */
function NameCombobox({
  value,
  names,
  onChange,
}: {
  value: string;
  names: NameEntry[];
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, [open]);

  // Filtered list: always include the sentinel "— 不导入 —" as item 0 so the
  // user can reset selection to empty via keyboard.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q === ''
      ? names
      : names.filter(n => n.name.toLowerCase().includes(q));
    return matched;
  }, [names, query]);

  // Reset highlight when the filter changes.
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  // Keep the highlighted item in view when navigating by keyboard.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`,
    );
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, open]);

  const commit = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery('');
  };

  const openAndFocus = () => {
    setOpen(true);
    setQuery('');
    // Defer focus until after render so the <input> exists.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // "— 不导入 —" row is index -1 (rendered above the filtered list);
    // filtered items are indices 0..filtered.length-1.
    const maxIdx = filtered.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h < maxIdx ? h + 1 : h));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h > -1 ? h - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight === -1) {
        commit('');
      } else if (filtered[highlight]) {
        commit(filtered[highlight].name);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const displayLabel = value
    ? value
    : <span className="text-neutral-500">点击选择</span>;

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={value || '搜索名称…'}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-neutral-950 border border-emerald-400 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={openAndFocus}
          className="w-full text-left bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 hover:border-neutral-500 focus:border-emerald-400 focus:outline-none truncate"
          title={value || '点击选择'}
        >
          {displayLabel}
        </button>
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-20 top-full left-0 right-0 mt-1 bg-neutral-950 border border-neutral-700 rounded shadow-lg max-h-56 overflow-y-auto text-xs"
        >
          {/* Sentinel "skip" row, always visible */}
          <div
            data-idx="-1"
            onMouseDown={e => {
              e.preventDefault();
              commit('');
            }}
            onMouseEnter={() => setHighlight(-1)}
            className={
              'px-2 py-1 cursor-pointer text-neutral-400 ' +
              (highlight === -1 ? 'bg-neutral-800' : 'hover:bg-neutral-800/60')
            }
          >
            — 不导入 —
          </div>
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-neutral-500 italic">无匹配项</div>
          ) : (
            filtered.map((n, i) => (
              <div
                key={n.name}
                data-idx={i}
                onMouseDown={e => {
                  e.preventDefault();
                  commit(n.name);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={
                  'px-2 py-1 cursor-pointer truncate ' +
                  (highlight === i
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'text-neutral-200 hover:bg-neutral-800/60') +
                  (n.labeled ? ' ' : '')
                }
                title={n.labeled ? `${n.name}（已标注）` : n.name}
              >
                {n.name}
                {n.labeled && (
                  <span className="text-neutral-500 ml-1">（已标注）</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Manual annotation mode — user drags a square box on the uploaded image
 * for each card, then names and saves. Shares the save pipeline and the
 * NameCombobox with auto mode but uses a completely separate UI.
 *
 * Why square: backend template_match normalizes to a 100×100 circular mask,
 * so non-square crops get squished. We enforce 1:1 at draw time so what the
 * user sees is what gets stored.
 *
 * Why store image-space coords (imgX/imgY/imgSize): zoom is just a display
 * concern; crops always come from the original HTMLImageElement at full
 * resolution via canvas.drawImage(img, sx, sy, sw, sh, 0, 0, 100, 100).
 */
type ManualBox = {
  uid: string;
  imgX: number;
  imgY: number;
  imgSize: number;
  name: string;
};

type ZoomMode = 'fit' | '100' | '50';

function ManualMode({
  assetType,
  names,
  disabled,
  onSaved,
  showToast,
}: {
  assetType: AssetType;
  names: NameEntry[];
  disabled: boolean;
  onSaved: () => void;
  showToast: (t: Toast) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string>('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<ZoomMode>('fit');
  const [fitZoom, setFitZoom] = useState<number>(1);
  const [boxes, setBoxes] = useState<ManualBox[]>([]);
  const [saving, setSaving] = useState(false);
  // Two-phase workflow:
  //  - 'draw': uploader + canvas; user draws / moves / resizes boxes.
  //  - 'name': grid of large thumbnails; user assigns names and saves.
  // Rationale: screenshots are tall (2868×1320 fit-to-width still scrolls),
  // so rendering a name-grid below the canvas makes the naming UI invisible.
  // Two separate views each fill the viewport on their own.
  const [phase, setPhase] = useState<'draw' | 'name'>('draw');

  // Unified interaction state machine. All coords are in IMAGE pixel space.
  //  - idle:     no pointer gesture in progress
  //  - drawing:  creating a new square from `start` to cursor
  //  - moving:   dragging an existing box; `offset` = (cursorAtStart - box.origin)
  //  - resizing: dragging a corner handle; `anchor` = the opposite (fixed) corner
  type Point = { x: number; y: number };
  type Interaction =
    | { kind: 'idle' }
    | { kind: 'drawing'; start: Point; current: Point }
    | { kind: 'moving'; uid: string; offset: Point; current: Point }
    | { kind: 'resizing'; uid: string; anchor: Point; current: Point };
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'idle' });
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgWrapperRef = useRef<HTMLDivElement | null>(null);

  // Resolve file → HTMLImageElement (decoded at original resolution).
  // Also resets phase back to 'draw' so loading a fresh screenshot always
  // lands on the drawing canvas.
  useEffect(() => {
    if (!file) {
      setImgUrl('');
      setImg(null);
      setBoxes([]);
      setSelectedUid(null);
      setInteraction({ kind: 'idle' });
      setPhase('draw');
      return;
    }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const im = new Image();
    im.onload = () => {
      setImg(im);
    };
    im.onerror = () => {
      showToast({ kind: 'err', msg: `图片加载失败: ${file.name}` });
      setImg(null);
    };
    im.src = url;
    setBoxes([]);
    setSelectedUid(null);
    setInteraction({ kind: 'idle' });
    setPhase('draw');
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, showToast]);

  // Compute fit-to-width zoom based on viewport width.
  useEffect(() => {
    if (!img || !viewportRef.current) return;
    const calc = () => {
      const vp = viewportRef.current;
      if (!vp || !img) return;
      // Leave a touch of padding so the scrollbar doesn't clip the right edge.
      const avail = Math.max(100, vp.clientWidth - 16);
      setFitZoom(Math.min(1, avail / img.naturalWidth));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [img]);

  const zoomValue = useMemo<number>(() => {
    if (zoom === 'fit') return fitZoom;
    if (zoom === '100') return 1;
    return 0.5;
  }, [zoom, fitZoom]);

  const displayW = img ? img.naturalWidth * zoomValue : 0;
  const displayH = img ? img.naturalHeight * zoomValue : 0;

  // Convert a pointer event on the image wrapper into IMAGE-space coords,
  // clamped to the image bounds.
  const pointerToImage = useCallback(
    (e: React.PointerEvent): Point | null => {
      if (!img || !imgWrapperRef.current) return null;
      const rect = imgWrapperRef.current.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const ix = dx / zoomValue;
      const iy = dy / zoomValue;
      return {
        x: Math.max(0, Math.min(img.naturalWidth, ix)),
        y: Math.max(0, Math.min(img.naturalHeight, iy)),
      };
    },
    [img, zoomValue],
  );

  // Hit-test radius (in IMAGE pixels) for corner resize handles. Handles
  // render as 10×10 display-px squares centered on each corner (so ±5 disp-px
  // reach). We slightly inflate for an easier grab target at low zoom.
  const HANDLE_HIT_IMG = useMemo(() => 8 / zoomValue, [zoomValue]);

  type CornerName = 'nw' | 'ne' | 'sw' | 'se';
  const CORNERS: CornerName[] = ['nw', 'ne', 'sw', 'se'];
  const cornerOf = (box: ManualBox, c: CornerName): Point => {
    switch (c) {
      case 'nw':
        return { x: box.imgX, y: box.imgY };
      case 'ne':
        return { x: box.imgX + box.imgSize, y: box.imgY };
      case 'sw':
        return { x: box.imgX, y: box.imgY + box.imgSize };
      case 'se':
        return { x: box.imgX + box.imgSize, y: box.imgY + box.imgSize };
    }
  };
  const oppositeCorner = (box: ManualBox, c: CornerName): Point => {
    const opp: Record<CornerName, CornerName> = {
      nw: 'se',
      ne: 'sw',
      sw: 'ne',
      se: 'nw',
    };
    return cornerOf(box, opp[c]);
  };
  const pointInsideBox = (p: Point, box: ManualBox): boolean =>
    p.x >= box.imgX &&
    p.x <= box.imgX + box.imgSize &&
    p.y >= box.imgY &&
    p.y <= box.imgY + box.imgSize;

  // In-progress drawing preview derived from interaction state. Square
  // anchored at `start`, extending in whichever quadrant the cursor is in.
  const previewRect = useMemo<{ x: number; y: number; size: number } | null>(() => {
    if (interaction.kind !== 'drawing') return null;
    const { start, current } = interaction;
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    if (size < 2) return null;
    const x = dx < 0 ? start.x - size : start.x;
    const y = dy < 0 ? start.y - size : start.y;
    return { x, y, size };
  }, [interaction]);

  // Given an interaction + image, compute the live geometry of the box under
  // edit (for 'moving' / 'resizing'). Returns null if the interaction isn't
  // editing an existing box.
  const liveEditedBox = useMemo<ManualBox | null>(() => {
    if (!img) return null;
    if (interaction.kind === 'moving') {
      const original = boxes.find(b => b.uid === interaction.uid);
      if (!original) return null;
      const size = original.imgSize;
      const rawX = interaction.current.x - interaction.offset.x;
      const rawY = interaction.current.y - interaction.offset.y;
      const x = Math.max(0, Math.min(img.naturalWidth - size, rawX));
      const y = Math.max(0, Math.min(img.naturalHeight - size, rawY));
      return { ...original, imgX: x, imgY: y };
    }
    if (interaction.kind === 'resizing') {
      const original = boxes.find(b => b.uid === interaction.uid);
      if (!original) return null;
      const { anchor, current } = interaction;
      const dx = current.x - anchor.x;
      const dy = current.y - anchor.y;
      // Force 1:1 driven by the larger axis, but clamp so the square stays
      // inside the image along the quadrant the cursor is in.
      const rawSize = Math.max(Math.abs(dx), Math.abs(dy));
      const maxOnX = dx < 0 ? anchor.x : img.naturalWidth - anchor.x;
      const maxOnY = dy < 0 ? anchor.y : img.naturalHeight - anchor.y;
      const size = Math.max(4, Math.min(rawSize, maxOnX, maxOnY));
      // Origin flips past the anchor when the cursor crosses into a
      // different quadrant (standard drag-corner behaviour).
      const finalX = dx < 0 ? anchor.x - size : anchor.x;
      const finalY = dy < 0 ? anchor.y - size : anchor.y;
      return { ...original, imgX: finalX, imgY: finalY, imgSize: size };
    }
    return null;
  }, [interaction, boxes, img]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    // Only left mouse / primary touch.
    if (e.button !== 0) return;
    const p = pointerToImage(e);
    if (!p) return;

    // Hit-test in top-most-first order (last-drawn wins on overlap) so the
    // visible box is the one that gets grabbed.
    // 1) corner handle of the currently selected box → resize
    if (selectedUid) {
      const selected = boxes.find(b => b.uid === selectedUid);
      if (selected) {
        const hit = HANDLE_HIT_IMG;
        for (const c of CORNERS) {
          const cp = cornerOf(selected, c);
          if (Math.abs(p.x - cp.x) <= hit && Math.abs(p.y - cp.y) <= hit) {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            const anchor = oppositeCorner(selected, c);
            setInteraction({ kind: 'resizing', uid: selected.uid, anchor, current: p });
            e.stopPropagation();
            return;
          }
        }
      }
    }

    // 2) inside some existing box → select + start moving (search top-most).
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (pointInsideBox(p, b)) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setSelectedUid(b.uid);
        setInteraction({
          kind: 'moving',
          uid: b.uid,
          offset: { x: p.x - b.imgX, y: p.y - b.imgY },
          current: p,
        });
        e.stopPropagation();
        return;
      }
    }

    // 3) empty canvas → deselect + start drawing a new box.
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelectedUid(null);
    setInteraction({ kind: 'drawing', start: p, current: p });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (interaction.kind === 'idle') return;
    const p = pointerToImage(e);
    if (!p) return;
    setInteraction(prev => {
      if (prev.kind === 'idle') return prev;
      return { ...prev, current: p };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!img) {
      setInteraction({ kind: 'idle' });
      return;
    }
    (e.target as Element).releasePointerCapture?.(e.pointerId);

    if (interaction.kind === 'drawing') {
      const rect = previewRect;
      setInteraction({ kind: 'idle' });
      if (!rect) return;
      const x = Math.max(0, Math.min(img.naturalWidth - 1, rect.x));
      const y = Math.max(0, Math.min(img.naturalHeight - 1, rect.y));
      const maxSize = Math.min(img.naturalWidth - x, img.naturalHeight - y);
      const size = Math.min(rect.size, maxSize);
      if (size < 4) return;
      const uid = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBoxes(prev => [...prev, { uid, imgX: x, imgY: y, imgSize: size, name: '' }]);
      return;
    }

    if (interaction.kind === 'moving' || interaction.kind === 'resizing') {
      // Commit the live geometry back into `boxes`.
      const edited = liveEditedBox;
      if (edited) {
        setBoxes(prev => prev.map(b => (b.uid === edited.uid ? edited : b)));
      }
      setInteraction({ kind: 'idle' });
      return;
    }

    setInteraction({ kind: 'idle' });
  };

  const onPointerCancel = () => {
    setInteraction({ kind: 'idle' });
  };

  const updateBoxName = (uid: string, name: string) => {
    setBoxes(prev => prev.map(b => (b.uid === uid ? { ...b, name } : b)));
  };

  const removeBox = (uid: string) => {
    setBoxes(prev => prev.filter(b => b.uid !== uid));
    setSelectedUid(prev => (prev === uid ? null : prev));
  };

  const clearBoxes = () => {
    setBoxes([]);
    setSelectedUid(null);
  };

  // Keyboard shortcuts: Delete / Backspace removes selected box; Escape
  // clears the selection. Guarded so typing in NameCombobox (or any input)
  // doesn't nuke a box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      const tag = t && 'tagName' in t ? (t as HTMLElement).tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((t as HTMLElement | null)?.isContentEditable) return;
      if (e.key === 'Escape') {
        if (selectedUid !== null) {
          setSelectedUid(null);
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedUid) {
          const uid = selectedUid;
          setBoxes(prev => prev.filter(b => b.uid !== uid));
          setSelectedUid(null);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUid]);

  const labeledCount = useMemo(
    () => boxes.filter(b => b.name.trim() !== '').length,
    [boxes],
  );

  // Crop a single box to a 100×100 PNG base64 string (no data-URL prefix).
  const cropToBase64 = useCallback(
    (box: ManualBox): string | null => {
      if (!img) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        box.imgX,
        box.imgY,
        box.imgSize,
        box.imgSize,
        0,
        0,
        100,
        100,
      );
      const dataUrl = canvas.toDataURL('image/png');
      const comma = dataUrl.indexOf(',');
      return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    },
    [img],
  );

  const doSave = async () => {
    const entries: { name: string; icon_base64: string }[] = [];
    for (const b of boxes) {
      if (b.name.trim() === '') continue;
      const base64 = cropToBase64(b);
      if (!base64) continue;
      entries.push({ name: b.name, icon_base64: base64 });
    }
    if (entries.length === 0) return;
    setSaving(true);
    try {
      const { saved, skipped } = await saveTemplates(assetType, entries);
      const msg = skipped.length > 0
        ? `已保存 ${saved} 条，跳过 ${skipped.length} 条（已标注）`
        : `已保存 ${saved} 条模板`;
      showToast({ kind: 'ok', msg });
      // Drop boxes whose name was handled (same convention as auto mode).
      const handled = new Set(entries.map(e => e.name));
      const remaining = boxes.filter(b => !handled.has(b.name));
      setBoxes(remaining);
      // If nothing's left, we're done with this screenshot: clear the file
      // and bounce back to the draw phase so the user can load the next one.
      // If some boxes are still unnamed, stay on the naming view so the user
      // can continue (or jump back to draw via the top button).
      if (remaining.length === 0) {
        setFile(null);
        setPhase('draw');
      }
      onSaved();
    } catch (err) {
      showToast({ kind: 'err', msg: `保存失败: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  // ---------- Phase 1 (draw): uploader + zoom controls + canvas ----------
  if (phase === 'draw') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-neutral-800">
          <input
            type="file"
            accept="image/*"
            onChange={e => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
            }}
            className="text-sm text-neutral-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-neutral-700 file:bg-neutral-900 file:text-neutral-200 file:text-xs hover:file:bg-neutral-800 file:cursor-pointer"
          />
          {img && (
            <>
              <span className="text-xs text-neutral-500 ml-2">
                {img.naturalWidth}×{img.naturalHeight}
              </span>
              <div className="flex items-center gap-1 ml-2">
                <span className="text-xs text-neutral-500 mr-1">缩放</span>
                {(['50', '100', 'fit'] as ZoomMode[]).map(z => (
                  <button
                    key={z}
                    onClick={() => setZoom(z)}
                    className={
                      'px-2 py-1 text-xs rounded border ' +
                      (zoom === z
                        ? 'border-emerald-400 text-emerald-300 bg-emerald-400/10'
                        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500')
                    }
                  >
                    {z === 'fit' ? '适应宽度' : z === '100' ? '100%' : '50%'}
                  </button>
                ))}
              </div>
              {boxes.length > 0 && (
                <button
                  onClick={clearBoxes}
                  className="ml-auto px-3 py-1.5 text-sm rounded border border-neutral-700 text-neutral-400 hover:border-neutral-500"
                >
                  清空框 ({boxes.length})
                </button>
              )}
            </>
          )}
          {!img && (
            <span className="text-[11px] text-neutral-500 ml-auto">
              手动标注：上传 1 张截图，在图上按住拖拽画正方形框
            </span>
          )}
        </div>

        {/* Canvas viewport */}
        <div
          ref={viewportRef}
          className="flex-1 overflow-auto bg-neutral-950"
        >
          {!img ? (
            <div className="text-neutral-500 text-sm py-16 text-center">
              上传一张游戏截图，按住鼠标在图上拖拽即可画出正方形框。
              <br />
              画完所有框后点底部「开始命名」进入命名阶段。
            </div>
          ) : (
            <div className="p-4 flex justify-center">
              <div
                ref={imgWrapperRef}
                className="relative select-none touch-none"
                style={{
                  width: displayW,
                  height: displayH,
                  cursor: 'crosshair',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                {imgUrl && (
                  <img
                    src={imgUrl}
                    alt="upload"
                    draggable={false}
                    style={{ width: displayW, height: displayH }}
                    className="block pointer-events-none"
                  />
                )}

                {/* Committed boxes. `liveEditedBox` overrides the saved
                    geometry while a move/resize drag is in progress so the
                    user sees the ghost in real time. */}
                {boxes.map((b, i) => {
                  const override =
                    liveEditedBox && liveEditedBox.uid === b.uid ? liveEditedBox : b;
                  const named = override.name.trim() !== '';
                  const isSelected = selectedUid === override.uid;
                  const baseColor = named
                    ? 'border-neutral-300 bg-neutral-300/5'
                    : 'border-emerald-400 bg-emerald-400/10';
                  const selectedColor =
                    'border-emerald-300 bg-emerald-300/10 ring-2 ring-emerald-400/30';
                  return (
                    <div
                      key={b.uid}
                      className={
                        'absolute border-2 ' +
                        (isSelected ? selectedColor : baseColor)
                      }
                      style={{
                        left: override.imgX * zoomValue,
                        top: override.imgY * zoomValue,
                        width: override.imgSize * zoomValue,
                        height: override.imgSize * zoomValue,
                        pointerEvents: 'auto',
                        cursor: isSelected ? 'move' : 'pointer',
                      }}
                    >
                      <span
                        className={
                          'absolute -top-5 left-0 text-[10px] px-1 rounded pointer-events-none ' +
                          (named
                            ? 'bg-neutral-800 text-neutral-200'
                            : 'bg-emerald-400 text-neutral-950 font-semibold')
                        }
                      >
                        {i + 1}
                        {named ? ` · ${override.name}` : ''}
                      </span>
                      {/* Corner resize handles — only on the selected box. */}
                      {isSelected &&
                        (['nw', 'ne', 'sw', 'se'] as const).map(corner => {
                          const cursor =
                            corner === 'nw' || corner === 'se'
                              ? 'nwse-resize'
                              : 'nesw-resize';
                          const posStyle: React.CSSProperties = {
                            position: 'absolute',
                            width: 10,
                            height: 10,
                            background: '#34d399',
                            border: '1px solid white',
                            cursor,
                          };
                          if (corner === 'nw') {
                            posStyle.left = -5;
                            posStyle.top = -5;
                          } else if (corner === 'ne') {
                            posStyle.right = -5;
                            posStyle.top = -5;
                          } else if (corner === 'sw') {
                            posStyle.left = -5;
                            posStyle.bottom = -5;
                          } else {
                            posStyle.right = -5;
                            posStyle.bottom = -5;
                          }
                          return (
                            <div
                              key={corner}
                              data-corner={corner}
                              style={posStyle}
                            />
                          );
                        })}
                    </div>
                  );
                })}

                {/* In-progress drag preview (only for new-box drawing) */}
                {previewRect && (
                  <div
                    className="absolute border-2 border-emerald-400 bg-emerald-400/10 pointer-events-none"
                    style={{
                      left: previewRect.x * zoomValue,
                      top: previewRect.y * zoomValue,
                      width: previewRect.size * zoomValue,
                      height: previewRect.size * zoomValue,
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Draw-phase footer: progress + "start naming" button (no save here) */}
        <footer className="border-t border-neutral-800 px-6 py-3 flex items-center gap-4 sticky bottom-0 bg-[#0b0b0b]">
          <span className="text-xs text-neutral-400">
            已画 <span className="text-emerald-300">{boxes.length}</span> 个框
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setPhase('name')}
              disabled={!img || boxes.length === 0}
              className="px-4 py-1.5 text-sm rounded bg-emerald-400 text-neutral-950 font-medium hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              开始命名 ({boxes.length}) →
            </button>
          </div>
        </footer>
      </>
    );
  }

  // ---------- Phase 2 (name): big thumbnail grid, no original image ----------
  return (
    <>
      {/* Top strip: back button · progress · asset-type readout */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-neutral-800">
        <button
          onClick={() => setPhase('draw')}
          className="px-3 py-1.5 text-sm rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
        >
          ← 返回画框
        </button>
        <span className="text-xs text-neutral-400 ml-4">
          已命名 <span className="text-emerald-300">{labeledCount}</span> / {boxes.length}
        </span>
        <span className="text-xs text-neutral-500 ml-auto">
          资源类型：{ASSET_LABELS[assetType]}
        </span>
      </div>

      {/* Thumbnail grid — bigger (h-[120px]) than draw-phase-era slot cards
          (h-[84px]) since this IS the primary interaction surface now. */}
      <div className="flex-1 overflow-auto bg-neutral-950/40 px-6 py-4">
        {boxes.length === 0 ? (
          <div className="text-neutral-500 text-sm py-16 text-center">
            还没有画任何框。点顶部「← 返回画框」回到画布。
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {boxes.map((b, i) => {
              const isSelected = selectedUid === b.uid;
              return (
                <div
                  key={b.uid}
                  className={
                    'rounded p-2 flex flex-col gap-2 border ' +
                    (isSelected
                      ? 'bg-neutral-900/80 border-emerald-400'
                      : 'bg-neutral-900/60 border-neutral-800')
                  }
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] text-neutral-500 truncate">
                      框 #{i + 1} · {Math.round(b.imgSize)}px
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        removeBox(b.uid);
                      }}
                      className="text-neutral-500 hover:text-red-400 text-xs px-1"
                      aria-label="remove"
                      title="移除"
                    >
                      ×
                    </button>
                  </div>
                  {/* Click the thumbnail area → jump back to the draw canvas
                      with this box pre-selected, so the user can fix a
                      mislabeled crop. Combobox + × button below stop
                      propagation to avoid triggering this. */}
                  <div
                    onClick={() => {
                      setSelectedUid(b.uid);
                      setPhase('draw');
                    }}
                    className="bg-neutral-950 rounded h-[120px] flex items-center justify-center overflow-hidden cursor-pointer hover:ring-1 hover:ring-emerald-400/40"
                    title="点击回到画布调整这个框"
                  >
                    <ManualBoxThumb img={img} box={b} />
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <NameCombobox
                      value={b.name}
                      names={names}
                      onChange={name => updateBoxName(b.uid, name)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save bar */}
      <footer className="border-t border-neutral-800 px-6 py-3 flex items-center gap-4 sticky bottom-0 bg-[#0b0b0b]">
        <span className="text-xs text-neutral-400">
          已命名 <span className="text-emerald-300">{labeledCount}</span> / {boxes.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={doSave}
            disabled={saving || labeledCount === 0 || disabled}
            className="px-4 py-1.5 text-sm rounded bg-emerald-400 text-neutral-950 font-medium hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '保存中…' : `保存 ${labeledCount} 条`}
          </button>
        </div>
      </footer>
    </>
  );
}

/**
 * Tiny inline thumbnail: renders the crop region of `img` into a 100×100
 * canvas so the user sees what the saved PNG will actually look like.
 */
function ManualBoxThumb({ img, box }: { img: HTMLImageElement | null; box: ManualBox }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    c.width = 100;
    c.height = 100;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 100, 100);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, box.imgX, box.imgY, box.imgSize, box.imgSize, 0, 0, 100, 100);
  }, [img, box.imgX, box.imgY, box.imgSize]);
  return (
    <canvas
      ref={canvasRef}
      width={100}
      height={100}
      className="max-h-full max-w-full object-contain"
    />
  );
}

export default function App() {
  const health = useBackendHealth();
  const [assetType, setAssetType] = useState<AssetType>('materials');
  const [mode, setMode] = useState<Mode>('auto');
  const [names, setNames] = useState<NameEntry[]>([]);
  const [namesErr, setNamesErr] = useState<string | null>(null);
  const [slots, setSlots] = useState<LabeledSlot[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const refreshNames = useCallback(() => {
    let cancelled = false;
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

  // Fetch names whenever asset type changes.
  useEffect(() => {
    setNames([]);
    const cancel = refreshNames();
    return cancel;
  }, [assetType, refreshNames]);

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

  const acceptDroppedFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const images = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (images.length === 0) {
      showToast({ kind: 'err', msg: '仅支持图片文件' });
      return;
    }
    setPendingFiles(prev => [...prev, ...images]);
  };

  // dragenter/dragleave fire per child element; track depth so the overlay
  // only disappears when the cursor has left the whole window.
  // Only wired up in auto mode — manual mode uses its own single-file input.
  const onDragEnter = (e: React.DragEvent) => {
    if (mode !== 'auto') return;
    e.preventDefault();
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (mode !== 'auto') return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (mode !== 'auto') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: React.DragEvent) => {
    if (mode !== 'auto') return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    acceptDroppedFiles(e.dataTransfer.files);
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

  const [showLabeled, setShowLabeled] = useState(false);
  const labeledNames = useMemo(() => names.filter(n => n.labeled), [names]);

  const doDelete = async (name: string) => {
    if (!window.confirm(`删除模板「${name}」？\n（PNG 文件和 labeled 记录都会清掉，之后可以重新标注。）`)) {
      return;
    }
    try {
      await deleteTemplate(assetType, name);
      showToast({ kind: 'ok', msg: `已删除「${name}」` });
      refreshNames();
    } catch (err) {
      showToast({ kind: 'err', msg: `删除失败: ${String(err)}` });
    }
  };

  const doSave = async () => {
    const entries = slots
      .filter(s => s.name.trim() !== '')
      .map(s => ({ name: s.name, icon_base64: s.icon_base64 }));
    if (entries.length === 0) return;
    setSaving(true);
    try {
      const { saved, skipped } = await saveTemplates(assetType, entries);
      const msg = skipped.length > 0
        ? `已保存 ${saved} 条，跳过 ${skipped.length} 条（已标注）`
        : `已保存 ${saved} 条模板`;
      showToast({ kind: 'ok', msg });
      // Drop any slot whose name was in this save batch (saved or skipped) —
      // the user already made a decision on it.
      const handled = new Set(entries.map(e => e.name));
      setSlots(prev => prev.filter(s => !handled.has(s.name)));
      // Refresh labeled state so newly-saved names show as 已标注 in dropdowns.
      refreshNames();
    } catch (err) {
      showToast({ kind: 'err', msg: `保存失败: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragging && mode === 'auto' && (
        <div className="fixed inset-0 z-50 pointer-events-none border-2 border-dashed border-emerald-400 bg-emerald-400/5 flex items-center justify-center">
          <div className="text-emerald-300 text-lg font-semibold tracking-wide bg-neutral-950/90 px-6 py-3 rounded border border-emerald-400/60">
            松开以加入 {ASSET_LABELS[assetType]} 截图
          </div>
        </div>
      )}
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

          {/* Mode toggle: auto vs manual */}
          <span className="text-xs text-neutral-500 ml-4 mr-2">模式</span>
          <div className="inline-flex rounded border border-neutral-700 overflow-hidden">
            {(['auto', 'manual'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  'px-3 py-1.5 text-sm transition-colors ' +
                  (mode === m
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900')
                }
              >
                {m === 'auto' ? '自动提取' : '手动标注'}
              </button>
            ))}
          </div>

          <span className="ml-4 text-xs text-neutral-500">
            {namesErr
              ? `获取名称失败: ${namesErr}`
              : names.length > 0
              ? `${names.length} 个可选名称（${names.filter(n => n.labeled).length} 个已标注）`
              : '加载名称中…'}
          </span>
          {labeledNames.length > 0 && (
            <button
              onClick={() => setShowLabeled(v => !v)}
              className="ml-auto text-xs text-neutral-400 hover:text-neutral-200 underline decoration-dotted underline-offset-2"
            >
              {showLabeled ? '隐藏' : '查看/管理'}已标注 ({labeledNames.length})
            </button>
          )}
        </div>

        {showLabeled && labeledNames.length > 0 && (
          <div className="border border-neutral-800 rounded p-3 bg-neutral-900/30">
            <div className="text-xs text-neutral-500 mb-2">
              点缩略图下方的 [删除] 来撤销标注。删除后可重新标注同一名字。
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
              {labeledNames.map(n => (
                <div
                  key={n.name}
                  className="bg-neutral-950 border border-neutral-800 rounded p-1.5 flex flex-col items-center gap-1"
                >
                  <img
                    src={templateImageUrl(assetType, n.name)}
                    alt={n.name}
                    className="w-full h-16 object-contain bg-neutral-900 rounded"
                  />
                  <div className="text-[11px] text-neutral-200 truncate w-full text-center" title={n.name}>
                    {n.name}
                  </div>
                  <button
                    onClick={() => doDelete(n.name)}
                    className="text-[10px] text-red-400 hover:text-red-300 hover:underline"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-mode file input + extract button (hidden in manual mode) */}
        {mode === 'auto' && (
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
            <span className="text-[11px] text-neutral-500 ml-auto">或拖拽图片到任意位置</span>
          </div>
        )}
      </section>

      {/* Mode-specific body */}
      {mode === 'auto' ? (
        <>
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
                    <NameCombobox
                      value={s.name}
                      names={names}
                      onChange={name => updateName(s.uid, name)}
                    />
                  </div>
                ))}
              </div>
            )}
          </main>

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
        </>
      ) : (
        <>
          <ManualMode
            assetType={assetType}
            names={names}
            disabled={health !== 'ok'}
            onSaved={refreshNames}
            showToast={showToast}
          />
          {/* Toast in manual mode — the ManualMode footer doesn't carry it, so
              surface it as a floating chip in the corner. */}
          {toast && (
            <div className="fixed bottom-16 right-6 z-40">
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
