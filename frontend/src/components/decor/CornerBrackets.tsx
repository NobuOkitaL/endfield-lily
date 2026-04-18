export function CornerBrackets({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-white/40" />
      <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-white/40" />
      <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-white/40" />
      <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-white/40" />
    </div>
  );
}
