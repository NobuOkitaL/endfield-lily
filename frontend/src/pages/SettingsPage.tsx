import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';

export default function SettingsPage() {
  const exportSnapshot = useAppStore((s) => s.exportSnapshot);
  const importSnapshot = useAppStore((s) => s.importSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function handleExport() {
    const json = exportSnapshot();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zmd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('已导出备份');
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importSnapshot(reader.result as string);
        setMsg('已导入备份');
      } catch {
        setMsg('导入失败：JSON 格式不正确');
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  }

  return (
    <div className="max-w-xl space-y-10">
      {/* Page header */}
      <div>
        <div
          className="font-mono uppercase text-signal"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          SETTINGS / 设置
        </div>
        <h1
          className="font-display text-white"
          style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
        >
          设置
        </h1>
      </div>

      {/* Backup section */}
      <section className="space-y-4">
        <div>
          <div
            className="font-mono uppercase text-signal mb-1"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            BACKUP & RESTORE
          </div>
          <h2
            className="font-display text-white"
            style={{ fontSize: '32px', lineHeight: '0.90' }}
          >
            备份
          </h2>
        </div>
        <p className="font-sans text-[15px] text-[#949494]">
          所有数据存在浏览器 localStorage。换浏览器或清除数据前请导出。
        </p>
        <div className="flex gap-3 flex-wrap">
          <Button variant="default" onClick={handleExport}>导出 JSON</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>导入 JSON</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
        {msg && (
          <div
            className="font-mono uppercase text-signal"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            {msg}
          </div>
        )}
      </section>
    </div>
  );
}
