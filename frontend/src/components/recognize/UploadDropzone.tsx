// frontend/src/components/recognize/UploadDropzone.tsx
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  label: string;
}

export function UploadDropzone({ onFiles, label }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) onFiles(files);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = '';
  }

  return (
    <label
      className={cn(
        'block border-2 border-dashed rounded-card p-12 text-center cursor-pointer transition-colors duration-150',
        dragging
          ? 'border-signal bg-signal/5'
          : 'border-white/20 hover:border-white/40',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <div className="space-y-2">
        <div
          className="font-mono uppercase text-signal"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          DRAG &amp; DROP / 点击上传
        </div>
        <div className="font-sans text-[#949494] text-sm">{label}</div>
        <div
          className="font-mono uppercase text-white/30"
          style={{ fontSize: '10px', letterSpacing: '1.5px' }}
        >
          支持多张 · 同名取最大值
        </div>
      </div>
    </label>
  );
}
