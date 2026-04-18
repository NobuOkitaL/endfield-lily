// frontend/src/pages/WeaponsPage.tsx
import { WeaponGrid } from '@/components/weapons/WeaponGrid';

export default function WeaponsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div
          className="font-mono uppercase text-signal"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          WEAPONS / 武器管理
        </div>
        <h1
          className="font-display text-white"
          style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
        >
          武器
        </h1>
      </div>
      <p className="text-[#949494] font-sans text-[15px] -mt-2">
        记录你持有的武器和当前破限/等级。
      </p>
      <WeaponGrid />
    </div>
  );
}
