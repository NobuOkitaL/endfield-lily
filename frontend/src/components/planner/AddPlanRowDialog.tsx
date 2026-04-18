// frontend/src/components/planner/AddPlanRowDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CHARACTER_LIST } from '@/data/operators';
import { WEAPON_LIST } from '@/data/weapons';
import { useAppStore, type PlanProject } from '@/store/app-store';
import { computeRowCost } from '@/logic/plan-aggregator';

const OP_PROJECTS: PlanProject[] = ['等级', '精英阶段', '装备适配', '天赋', '基建', '能力值（信赖）', '技能1', '技能2', '技能3', '技能4'];
const WP_PROJECTS: PlanProject[] = ['等级', '破限'];

const selectClass = [
  'w-full rounded-form px-2 py-1.5 font-sans text-[15px] text-white',
  'bg-canvas border border-white/30',
  'focus:outline-none focus:border-signal transition-colors duration-150',
].join(' ');

export function AddPlanRowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const addRow = useAppStore((s) => s.addPlanRow);
  const ownedOps = useAppStore((s) => s.ownedOperators);
  const ownedWps = useAppStore((s) => s.ownedWeapons);

  const [target, setTarget] = useState('');
  const [project, setProject] = useState<PlanProject>('等级');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);

  const isWeapon = WEAPON_LIST.some((w) => w.name === target);
  const isOp = (CHARACTER_LIST as readonly string[]).includes(target);
  const projects = isWeapon ? WP_PROJECTS : OP_PROJECTS;

  // Reset on close
  useEffect(() => {
    if (!open) { setTarget(''); setProject('等级'); setFrom(0); setTo(1); }
  }, [open]);

  // Initialize from based on owned state
  useEffect(() => {
    if (!target) return;
    if (!projects.includes(project)) { setProject(projects[0]); return; }
    if (isOp && ownedOps[target]) {
      const st = ownedOps[target];
      if (project === '等级') setFrom(st.等级);
      else if (project === '精英阶段') setFrom(st.精英阶段);
      else if (project === '装备适配') setFrom(st.装备适配);
      else if (project === '天赋') setFrom(st.天赋);
      else if (project === '基建') setFrom(st.基建);
      else if (project === '能力值（信赖）') setFrom(st.信赖);
      else if (project === '技能1') setFrom(st.技能1);
      else if (project === '技能2') setFrom(st.技能2);
      else if (project === '技能3') setFrom(st.技能3);
      else if (project === '技能4') setFrom(st.技能4);
    } else if (isWeapon && ownedWps[target]) {
      const st = ownedWps[target];
      if (project === '等级') setFrom(st.等级);
      else if (project === '破限') setFrom(st.破限阶段);
    }
  }, [target, project, isOp, isWeapon, ownedOps, ownedWps, projects]);

  function handleSave() {
    if (!target || !project || from >= to) return;
    const row = {
      id: crypto.randomUUID(),
      干员: target,
      项目: project,
      现等级: from,
      目标等级: to,
      materials: {},
      hidden: false,
    };
    const materials = computeRowCost(row);
    addRow({ ...row, materials });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增规划</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>干员 / 武器</Label>
            <select
              className={selectClass}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">-- 选择 --</option>
              <optgroup label="干员">
                {CHARACTER_LIST.map((n) => <option key={n} value={n}>{n}</option>)}
              </optgroup>
              <optgroup label="武器">
                {WEAPON_LIST.map((w) => <option key={w.name} value={w.name}>{w.name}（{w.star}★）</option>)}
              </optgroup>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>升级项目</Label>
            <select
              className={selectClass}
              value={project}
              onChange={(e) => setProject(e.target.value as PlanProject)}
            >
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>当前</Label>
              <Input type="number" value={from} onChange={(e) => setFrom(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>目标</Label>
              <Input type="number" value={to} onChange={(e) => setTo(Number(e.target.value) || 0)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!target || from >= to}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
