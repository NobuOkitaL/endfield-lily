// frontend/src/pages/WeaponsPage.tsx
import { WeaponGrid } from '@/components/weapons/WeaponGrid';

export default function WeaponsPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">武器</h2>
      <p className="text-sm text-muted-foreground">记录你持有的武器和当前破限/等级。</p>
      <WeaponGrid />
    </div>
  );
}
