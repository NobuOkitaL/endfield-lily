// frontend/src/pages/OperatorsPage.tsx
import { OperatorGrid } from '@/components/operators/OperatorGrid';

export default function OperatorsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div
          className="font-mono uppercase text-signal"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          OPERATORS / 干员管理
        </div>
        <h1
          className="font-display text-white"
          style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
        >
          干员
        </h1>
      </div>
      <p className="text-[#949494] font-sans text-[15px] -mt-2">
        记录你持有的每个干员的当前状态（10 个成长维度）。
      </p>
      <OperatorGrid />
    </div>
  );
}
