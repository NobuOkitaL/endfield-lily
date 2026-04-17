// frontend/src/components/weapons/WeaponGrid.tsx
import { useState } from 'react';
import { WEAPON_LIST } from '@/data/weapons';
import { useAppStore } from '@/store/app-store';
import { WeaponEditDialog } from './WeaponEditDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STAR_UNDERLINE: Record<number, string> = {
  6: '2px solid #3cffd0',
  5: '1px solid rgba(60,255,208,0.5)',
  4: '1px solid rgba(255,255,255,0.3)',
  3: '1px solid rgba(255,255,255,0.15)',
};

export function WeaponGrid() {
  const owned = useAppStore((s) => s.ownedWeapons);
  const setOwned = useAppStore((s) => s.setOwnedWeapon);
  const removeOwned = useAppStore((s) => s.removeOwnedWeapon);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const filteredList = WEAPON_LIST.filter((w) => (filter ? w.name.includes(filter) : true));

  const groups: Array<{ star: 3 | 4 | 5 | 6; items: typeof filteredList }> = [
    { star: 6, items: filteredList.filter((w) => w.star === 6) },
    { star: 5, items: filteredList.filter((w) => w.star === 5) },
    { star: 4, items: filteredList.filter((w) => w.star === 4) },
    { star: 3, items: filteredList.filter((w) => w.star === 3) },
  ];

  return (
    <div className="space-y-8">
      <Input
        placeholder="搜索武器..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      {groups.map((g) => g.items.length > 0 && (
        <section key={g.star} className="space-y-3">
          {/* Star group header */}
          <div className="pb-2" style={{ borderBottom: STAR_UNDERLINE[g.star] }}>
            <div
              className="font-mono uppercase text-[#949494] mb-1"
              style={{ fontSize: '10px', letterSpacing: '1.5px' }}
            >
              {g.items.length} WEAPONS
            </div>
            <h3
              className="font-display text-white uppercase"
              style={{ fontSize: '32px', lineHeight: '0.90' }}
            >
              {g.star}★
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.items.map((w) => {
              const has = owned[w.name];
              return (
                <div
                  key={w.name}
                  className={[
                    'border border-white/20 rounded-card p-4 bg-canvas',
                    'flex items-center justify-between gap-3',
                    has ? 'border-l-4 border-l-mint' : '',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-sans font-bold text-white text-base leading-tight">
                      {w.name}
                    </div>
                    <div
                      className="font-mono uppercase text-[#949494] mt-1"
                      style={{ fontSize: '10px', letterSpacing: '1.5px' }}
                    >
                      {has ? `破${has.破限阶段} LV.${has.等级}` : '未持有'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto shrink-0"
                    onClick={() => setEditing(w.name)}
                  >
                    {has ? '编辑' : '添加'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <WeaponEditDialog
        weaponName={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ? owned[editing] : undefined}
        onSave={(state) => { if (editing) { setOwned(editing, state); setEditing(null); } }}
        onRemove={editing && owned[editing] ? () => { removeOwned(editing); setEditing(null); } : undefined}
      />
    </div>
  );
}
