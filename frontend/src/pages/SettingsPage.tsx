import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';

export default function SettingsPage() {
  const darkMode = useAppStore((s) => s.settings.darkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
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
    <div className="p-6 space-y-6 max-w-xl">
      <h2 className="text-2xl font-semibold">设置</h2>

      <section className="space-y-2">
        <h3 className="font-semibold">外观</h3>
        <Button variant="outline" onClick={toggleDarkMode}>
          {darkMode ? '切换为浅色模式' : '切换为深色模式'}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">备份与恢复</h3>
        <p className="text-sm text-muted-foreground">
          所有数据存在浏览器 localStorage。换浏览器或清除数据前请导出。
        </p>
        <div className="flex gap-2">
          <Button onClick={handleExport}>导出 JSON</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>导入 JSON</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
        {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
      </section>
    </div>
  );
}
