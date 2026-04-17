// frontend/src/store/app-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Stock } from '@/logic/stock';
import type { MaterialName } from '@/data/materials';
import type { UpgradeProject, CostMap } from '@/data/types';

export interface OperatorState {
  精英阶段: number; // 0-4
  等级: number;     // 1-90
  装备适配: number; // 0-3
  天赋: number;     // 0-4
  基建: number;     // 0-4
  信赖: number;     // 0-4
  技能1: number;    // 1-12
  技能2: number;
  技能3: number;
  技能4: number;
}

export interface WeaponState {
  破限阶段: number; // 0-4
  等级: number;     // 1-90
}

export type PlanProject = UpgradeProject | '等级' | '破限';

export interface PlanRow {
  id: string;
  干员: string;           // operator or weapon name
  项目: PlanProject;
  现等级: number;
  目标等级: number;
  materials: CostMap;
  hidden: boolean;
}

interface Settings { darkMode: boolean }

interface AppState {
  stock: Stock;
  ownedOperators: Record<string, OperatorState>;
  ownedWeapons: Record<string, WeaponState>;
  planRows: PlanRow[];
  settings: Settings;

  setStock: (name: MaterialName, count: number) => void;
  replaceStock: (s: Stock) => void;

  setOwnedOperator: (name: string, state: OperatorState) => void;
  removeOwnedOperator: (name: string) => void;

  setOwnedWeapon: (name: string, state: WeaponState) => void;
  removeOwnedWeapon: (name: string) => void;

  addPlanRow: (row: PlanRow) => void;
  updatePlanRow: (id: string, patch: Partial<PlanRow>) => void;
  removePlanRow: (id: string) => void;

  toggleDarkMode: () => void;

  exportSnapshot: () => string;
  importSnapshot: (json: string) => void;
}

const INITIAL: Pick<AppState, 'stock' | 'ownedOperators' | 'ownedWeapons' | 'planRows' | 'settings'> = {
  stock: {},
  ownedOperators: {},
  ownedWeapons: {},
  planRows: [],
  settings: { darkMode: false },
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setStock: (name, count) => set((s) => ({ stock: { ...s.stock, [name]: count } })),
      replaceStock: (newStock) => set({ stock: newStock }),

      setOwnedOperator: (name, state) =>
        set((s) => ({ ownedOperators: { ...s.ownedOperators, [name]: state } })),
      removeOwnedOperator: (name) =>
        set((s) => {
          const { [name]: _drop, ...rest } = s.ownedOperators;
          return { ownedOperators: rest };
        }),

      setOwnedWeapon: (name, state) =>
        set((s) => ({ ownedWeapons: { ...s.ownedWeapons, [name]: state } })),
      removeOwnedWeapon: (name) =>
        set((s) => {
          const { [name]: _drop, ...rest } = s.ownedWeapons;
          return { ownedWeapons: rest };
        }),

      addPlanRow: (row) => set((s) => ({ planRows: [...s.planRows, row] })),
      updatePlanRow: (id, patch) =>
        set((s) => ({ planRows: s.planRows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removePlanRow: (id) => set((s) => ({ planRows: s.planRows.filter((r) => r.id !== id) })),

      toggleDarkMode: () =>
        set((s) => ({ settings: { ...s.settings, darkMode: !s.settings.darkMode } })),

      exportSnapshot: () =>
        JSON.stringify(
          {
            stock: get().stock,
            ownedOperators: get().ownedOperators,
            ownedWeapons: get().ownedWeapons,
            planRows: get().planRows,
            settings: get().settings,
          },
          null,
          2,
        ),
      importSnapshot: (json) => {
        const parsed = JSON.parse(json);
        set({
          stock: parsed.stock ?? {},
          ownedOperators: parsed.ownedOperators ?? {},
          ownedWeapons: parsed.ownedWeapons ?? {},
          planRows: parsed.planRows ?? [],
          settings: parsed.settings ?? { darkMode: false },
        });
      },
    }),
    { name: 'zmd-planner-state', version: 1 },
  ),
);
