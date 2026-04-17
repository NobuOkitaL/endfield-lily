// frontend/src/components/weapons/WeaponGrid.tsx
import { useState } from 'react';
import { WEAPON_LIST } from '@/data/weapons';
import { useAppStore } from '@/store/app-store';
import { WeaponEditDialog } from './WeaponEditDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <div className="space-y-4">
      <Input placeholder="搜索武器..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      {groups.map((g) => g.items.length > 0 && (
        <section key={g.star} className="space-y-2">
          <h3 className="font-semibold">{g.star}★</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.items.map((w) => {
              const has = owned[w.name];
              return (
                <div key={w.name} className={`border rounded-md p-3 flex items-center justify-between ${has ? 'bg-accent/40' : ''}`}>
                  <div>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{has ? `破${has.破限阶段} Lv.${has.等级}` : '未持有'}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditing(w.name)}>{has ? '编辑' : '添加'}</Button>
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
