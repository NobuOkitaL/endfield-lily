// frontend/src/components/recognize/UploadDropzone.tsx
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  onFile: (f: File) => void;
  label: string;
}

export function UploadDropzone({ onFile, label }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
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
        ref={inputRef}
        type="file"
        accept="image/*"
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
      </div>
    </label>
  );
}
