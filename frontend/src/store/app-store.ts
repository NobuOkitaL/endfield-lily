// frontend/src/store/app-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deductStock, type Stock } from '@/logic/stock';
import type { MaterialName } from '@/data/materials';

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

export const DEFAULT_OPERATOR_STATE: OperatorState = {
  精英阶段: 0, 等级: 1, 装备适配: 0, 天赋: 0, 基建: 0, 信赖: 0,
  技能1: 1, 技能2: 1, 技能3: 1, 技能4: 1,
};

export const DEFAULT_WEAPON_STATE: WeaponState = {
  破限阶段: 0, 等级: 1,
};

export interface OperatorGoal {
  id: string;
  operator: string;       // operator name (中文)
  target: OperatorState;  // full target state — all 10 fields
  hidden: boolean;
}

export interface WeaponGoal {
  id: string;
  weapon: string;
  target: WeaponState;    // 2 fields (破限阶段, 等级)
  hidden: boolean;
}

// ---------------------------------------------------------------------------
// Legacy type kept for backward-compat with existing tests only
// ---------------------------------------------------------------------------
export type PlanProject = string;
export interface PlanRow {
  id: string;
  干员: string;
  项目: PlanProject;
  现等级: number;
  目标等级: number;
  materials: Record<string, number>;
  hidden: boolean;
}

interface Settings {
  darkMode: boolean;
}

interface AppState {
  stock: Stock;
  ownedOperators: Record<string, OperatorState>;
  ownedWeapons: Record<string, WeaponState>;
  operatorGoals: OperatorGoal[];
  weaponGoals: WeaponGoal[];
  settings: Settings;
  farmSelectedWeapons: string[];

  // --- Stock ---
  setStock: (name: MaterialName, count: number) => void;
  replaceStock: (s: Stock) => void;

  // --- Owned operators ---
  setOwnedOperator: (name: string, state: OperatorState) => void;
  removeOwnedOperator: (name: string) => void;

  // --- Owned weapons ---
  setOwnedWeapon: (name: string, state: WeaponState) => void;
  removeOwnedWeapon: (name: string) => void;

  // --- Operator goals ---
  addOperatorGoal: (operator: string) => void;
  updateOperatorGoalTarget: (id: string, patch: Partial<OperatorState>) => void;
  removeOperatorGoal: (id: string) => void;
  toggleOperatorGoalHidden: (id: string) => void;
  /** Apply target state, deduct spent stock, remove goal. Caller must verify affordability first. */
  applyOperatorGoal: (id: string, spentStock: Stock) => void;

  // --- Weapon goals ---
  addWeaponGoal: (weapon: string) => void;
  updateWeaponGoalTarget: (id: string, patch: Partial<WeaponState>) => void;
  removeWeaponGoal: (id: string) => void;
  toggleWeaponGoalHidden: (id: string) => void;
  /** Apply target state, deduct spent stock, remove goal. Caller must verify affordability first. */
  applyWeaponGoal: (id: string, spentStock: Stock) => void;

  /** Bulk: deduct aggregate stock and apply all visible goals atomically. */
  completeAllGoals: (aggregateCost: Stock) => void;

  // --- Farm planner ---
  toggleFarmWeapon: (weapon: string) => void;
  clearFarmWeapons: () => void;

  // --- Legacy stubs (for backward-compat with old tests) ---
  planRows: PlanRow[];
  addPlanRow: (row: PlanRow) => void;
  updatePlanRow: (id: string, patch: Partial<PlanRow>) => void;
  removePlanRow: (id: string) => void;

  toggleDarkMode: () => void;

  exportSnapshot: () => string;
  importSnapshot: (json: string) => void;
}

const INITIAL: Pick<
  AppState,
  'stock' | 'ownedOperators' | 'ownedWeapons' | 'operatorGoals' | 'weaponGoals' | 'planRows' | 'settings' | 'farmSelectedWeapons'
> = {
  stock: {},
  ownedOperators: {},
  ownedWeapons: {},
  operatorGoals: [],
  weaponGoals: [],
  planRows: [],
  settings: { darkMode: false },
  farmSelectedWeapons: [],
};

/**
 * Keys from `AppState` that are persisted AND mirrored to the backend when
 * cross-browser sync is on. Single source of truth so the `persist` middleware
 * and `use-backend-sync` hook never drift from each other. Action functions
 * are deliberately excluded — they're re-created from the store factory on
 * every load, serializing them would just bloat the blob.
 */
export const PERSISTED_KEYS = [
  'stock',
  'ownedOperators',
  'ownedWeapons',
  'operatorGoals',
  'weaponGoals',
  'planRows',
  'settings',
  'farmSelectedWeapons',
] as const satisfies ReadonlyArray<keyof AppState>;

export type PersistedKey = (typeof PERSISTED_KEYS)[number];
export type PersistedSnapshot = Pick<AppState, PersistedKey>;

/** Extract the persisted slice from the full store state. */
export function pickPersisted(state: AppState): PersistedSnapshot {
  const out = {} as Record<PersistedKey, unknown>;
  for (const key of PERSISTED_KEYS) {
    out[key] = state[key];
  }
  return out as PersistedSnapshot;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      // --- Stock ---
      setStock: (name, count) => set((s) => ({ stock: { ...s.stock, [name]: count } })),
      replaceStock: (newStock) => set({ stock: newStock }),

      // --- Owned operators ---
      setOwnedOperator: (name, state) =>
        set((s) => ({ ownedOperators: { ...s.ownedOperators, [name]: state } })),
      removeOwnedOperator: (name) =>
        set((s) => {
          const { [name]: _drop, ...rest } = s.ownedOperators;
          return { ownedOperators: rest };
        }),

      // --- Owned weapons ---
      setOwnedWeapon: (name, state) =>
        set((s) => ({ ownedWeapons: { ...s.ownedWeapons, [name]: state } })),
      removeOwnedWeapon: (name) =>
        set((s) => {
          const { [name]: _drop, ...rest } = s.ownedWeapons;
          return { ownedWeapons: rest };
        }),

      // --- Operator goals ---
      addOperatorGoal: (operator) => {
        const current = get().ownedOperators[operator] ?? DEFAULT_OPERATOR_STATE;
        const goal: OperatorGoal = {
          id: crypto.randomUUID(),
          operator,
          target: { ...current },
          hidden: false,
        };
        set((s) => ({ operatorGoals: [...s.operatorGoals, goal] }));
      },

      updateOperatorGoalTarget: (id, patch) =>
        set((s) => ({
          operatorGoals: s.operatorGoals.map((g) =>
            g.id === id ? { ...g, target: { ...g.target, ...patch } } : g,
          ),
        })),

      removeOperatorGoal: (id) =>
        set((s) => ({ operatorGoals: s.operatorGoals.filter((g) => g.id !== id) })),

      toggleOperatorGoalHidden: (id) =>
        set((s) => ({
          operatorGoals: s.operatorGoals.map((g) =>
            g.id === id ? { ...g, hidden: !g.hidden } : g,
          ),
        })),

      applyOperatorGoal: (id, spentStock) => {
        const { operatorGoals, stock } = get();
        const goal = operatorGoals.find((g) => g.id === id);
        if (!goal) return;
        set((s) => ({
          stock: deductStock(stock, spentStock),
          ownedOperators: { ...s.ownedOperators, [goal.operator]: goal.target },
          operatorGoals: s.operatorGoals.filter((g) => g.id !== id),
        }));
      },

      // --- Weapon goals ---
      addWeaponGoal: (weapon) => {
        const current = get().ownedWeapons[weapon] ?? DEFAULT_WEAPON_STATE;
        const goal: WeaponGoal = {
          id: crypto.randomUUID(),
          weapon,
          target: { ...current },
          hidden: false,
        };
        set((s) => ({ weaponGoals: [...s.weaponGoals, goal] }));
      },

      updateWeaponGoalTarget: (id, patch) =>
        set((s) => ({
          weaponGoals: s.weaponGoals.map((g) =>
            g.id === id ? { ...g, target: { ...g.target, ...patch } } : g,
          ),
        })),

      removeWeaponGoal: (id) =>
        set((s) => ({ weaponGoals: s.weaponGoals.filter((g) => g.id !== id) })),

      toggleWeaponGoalHidden: (id) =>
        set((s) => ({
          weaponGoals: s.weaponGoals.map((g) =>
            g.id === id ? { ...g, hidden: !g.hidden } : g,
          ),
        })),

      applyWeaponGoal: (id, spentStock) => {
        const { weaponGoals, stock } = get();
        const goal = weaponGoals.find((g) => g.id === id);
        if (!goal) return;
        set((s) => ({
          stock: deductStock(stock, spentStock),
          ownedWeapons: { ...s.ownedWeapons, [goal.weapon]: goal.target },
          weaponGoals: s.weaponGoals.filter((g) => g.id !== id),
        }));
      },

      // --- Bulk complete ---
      completeAllGoals: (aggregateCost) => {
        set((s) => {
          const visibleOpGoalIds = new Set(s.operatorGoals.filter((g) => !g.hidden).map((g) => g.id));
          const visibleWpGoalIds = new Set(s.weaponGoals.filter((g) => !g.hidden).map((g) => g.id));

          const newOwnedOps = { ...s.ownedOperators };
          for (const goal of s.operatorGoals) {
            if (visibleOpGoalIds.has(goal.id)) {
              newOwnedOps[goal.operator] = goal.target;
            }
          }

          const newOwnedWps = { ...s.ownedWeapons };
          for (const goal of s.weaponGoals) {
            if (visibleWpGoalIds.has(goal.id)) {
              newOwnedWps[goal.weapon] = goal.target;
            }
          }

          return {
            stock: deductStock(s.stock, aggregateCost),
            ownedOperators: newOwnedOps,
            ownedWeapons: newOwnedWps,
            operatorGoals: s.operatorGoals.filter((g) => !visibleOpGoalIds.has(g.id)),
            weaponGoals: s.weaponGoals.filter((g) => !visibleWpGoalIds.has(g.id)),
          };
        });
      },

      // --- Legacy plan rows (stub) ---
      addPlanRow: (row) => set((s) => ({ planRows: [...s.planRows, row] })),
      updatePlanRow: (id, patch) =>
        set((s) => ({ planRows: s.planRows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removePlanRow: (id) => set((s) => ({ planRows: s.planRows.filter((r) => r.id !== id) })),

      toggleDarkMode: () =>
        set((s) => ({ settings: { ...s.settings, darkMode: !s.settings.darkMode } })),

      // --- Farm planner ---
      toggleFarmWeapon: (weapon) =>
        set((s) => ({
          farmSelectedWeapons: s.farmSelectedWeapons.includes(weapon)
            ? s.farmSelectedWeapons.filter((w) => w !== weapon)
            : [...s.farmSelectedWeapons, weapon],
        })),
      clearFarmWeapons: () => set({ farmSelectedWeapons: [] }),

      exportSnapshot: () =>
        JSON.stringify(
          {
            stock: get().stock,
            ownedOperators: get().ownedOperators,
            ownedWeapons: get().ownedWeapons,
            operatorGoals: get().operatorGoals,
            weaponGoals: get().weaponGoals,
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
          operatorGoals: parsed.operatorGoals ?? [],
          weaponGoals: parsed.weaponGoals ?? [],
          planRows: parsed.planRows ?? [],
          settings: {
            darkMode: parsed.settings?.darkMode ?? false,
          },
        });
      },
    }),
    {
      name: 'zmd-planner-state',
      version: 5,
      // Only persist data — not action functions. Shared with backend sync.
      partialize: (state) => pickPersisted(state as AppState),
      // v4 → v5: drop settings.syncToBackend (backend sync is now always on,
      // no toggle). Any stray field on older persisted state is simply ignored.
      migrate: (persisted, version) => {
        if (version < 5) {
          const p = (persisted ?? {}) as Partial<AppState> & {
            settings?: Partial<Settings> & { syncToBackend?: boolean };
          };
          return {
            ...p,
            settings: { darkMode: p.settings?.darkMode ?? false },
          };
        }
        return persisted as AppState;
      },
    },
  ),
);
