type Props = {
  className?: string;
  /** Distance (px) brackets are pushed outside the parent. Default 6 so they clear rounded borders. */
  offset?: number;
  /** Bracket arm length (px). Default 12. */
  size?: number;
};

export function CornerBrackets({ className = '', offset = 6, size = 12 }: Props) {
  const pos = `-${offset}px`;
  const dim = `${size}px`;
  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      style={{ top: pos, left: pos, right: pos, bottom: pos }}
    >
      <span
        className="absolute border-t border-l border-white/40"
        style={{ top: 0, left: 0, width: dim, height: dim }}
      />
      <span
        className="absolute border-t border-r border-white/40"
        style={{ top: 0, right: 0, width: dim, height: dim }}
      />
      <span
        className="absolute border-b border-l border-white/40"
        style={{ bottom: 0, left: 0, width: dim, height: dim }}
      />
      <span
        className="absolute border-b border-r border-white/40"
        style={{ bottom: 0, right: 0, width: dim, height: dim }}
      />
    </div>
  );
}
