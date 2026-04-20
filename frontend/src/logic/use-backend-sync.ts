// frontend/src/logic/use-backend-sync.ts
//
// Lifecycle hook that wires the Zustand store to the backend's /state
// endpoints. Called once at the app root (in App.tsx). Always on — there is
// no toggle. If the backend is unreachable we surface `offline` status and
// fall back to localStorage-only behavior; this is the graceful degradation
// path and does not lose data.
//
// Flow:
//   1. On mount: fetch /state. If non-null `data`, `useAppStore.setState(data)`
//      — remote wins over local on first load. Backend down → stay on
//      localStorage, show `offline`.
//   2. Subscribe to store changes. Any mutation starts a 1500ms debounce
//      timer; when it fires, PUT the current persisted slice to /state.
//   3. Status lives in a dedicated (non-persisted) Zustand store so any
//      component (e.g. SettingsPage) can read it without the hook needing
//      to run in multiple places — the App.tsx mount is canonical.

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  PERSISTED_KEYS,
  pickPersisted,
  useAppStore,
  type PersistedSnapshot,
} from '@/store/app-store';
import {
  fetchBackendState,
  pushBackendState,
} from '@/logic/backend-sync';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

export interface UseBackendSyncReturn {
  status: SyncStatus;
  lastSyncedAt: string | null;
}

/**
 * Shared (non-persisted) store for sync status so UI components can read it
 * without each mounting their own `useBackendSync`. The hook itself is only
 * called once, at the app root (App.tsx); all other consumers use
 * `useSyncStatus()` to read the current value.
 */
interface SyncStatusState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  _set: (patch: Partial<Pick<SyncStatusState, 'status' | 'lastSyncedAt'>>) => void;
}

const useSyncStatusStore = create<SyncStatusState>((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  _set: (patch) => set(patch),
}));

/** Read-only accessor for the current sync status. Safe to call anywhere. */
export function useSyncStatus(): UseBackendSyncReturn {
  const status = useSyncStatusStore((s) => s.status);
  const lastSyncedAt = useSyncStatusStore((s) => s.lastSyncedAt);
  return { status, lastSyncedAt };
}

const DEBOUNCE_MS = 1500;

/**
 * True when two persisted snapshots are value-equal. Prevents re-push loops
 * when we hydrate from backend and Zustand fires a change event for an
 * identical object reference swap.
 *
 * We use JSON stringify as a cheap structural compare. The persisted slice
 * is small (KBs, not MBs) so this is fine; avoids bringing in a deep-equals
 * dep purely for sync.
 */
function snapshotsEqual(a: PersistedSnapshot, b: PersistedSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useBackendSync(): UseBackendSyncReturn {
  const statusSet = useSyncStatusStore((s) => s._set);

  // Track the last snapshot we successfully PUT so we can short-circuit
  // subscriber fires that are round-trip echoes of our own hydration.
  const lastPushedRef = useRef<PersistedSnapshot | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;

    // Step 1: initial hydrate.
    statusSet({ status: 'syncing' });
    fetchBackendState().then((payload) => {
      if (cancelled || !activeRef.current) return;
      if (payload === null) {
        // Backend unreachable → keep localStorage, surface offline.
        statusSet({ status: 'offline' });
        return;
      }
      if (payload.data !== null && typeof payload.data === 'object') {
        // Remote has real data → overwrite local state with it. Importantly
        // we DON'T merge: cross-browser semantics are last-write-wins, and
        // merging would silently resurrect goals the user deleted elsewhere.
        useAppStore.setState(payload.data as Partial<PersistedSnapshot>);
        lastPushedRef.current = pickPersisted(useAppStore.getState());
      }
      statusSet({ status: 'synced', lastSyncedAt: payload.updated_at });
    });

    // Step 2: subscribe + debounce PUT on changes.
    const unsub = useAppStore.subscribe((state) => {
      if (!activeRef.current) return;
      const snapshot = pickPersisted(state);
      if (lastPushedRef.current && snapshotsEqual(snapshot, lastPushedRef.current)) {
        return; // No real change since last successful push — skip.
      }

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      statusSet({ status: 'syncing' });
      debounceTimerRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        pushBackendState(snapshot).then((res) => {
          if (!activeRef.current) return;
          if (res === null) {
            statusSet({ status: 'offline' });
            return;
          }
          lastPushedRef.current = snapshot;
          statusSet({ status: 'synced', lastSyncedAt: res.updated_at });
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      activeRef.current = false;
      unsub();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [statusSet]);

  const status = useSyncStatusStore((s) => s.status);
  const lastSyncedAt = useSyncStatusStore((s) => s.lastSyncedAt);
  return { status, lastSyncedAt };
}

// Re-export for ergonomics — SettingsPage wants the key list for its UI too.
export { PERSISTED_KEYS };
