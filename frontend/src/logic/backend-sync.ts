// frontend/src/logic/backend-sync.ts
//
// Plain async helpers for talking to the backend's /state endpoints.
// These never throw — callers get `null` on any network/parse failure and
// keep their localStorage fallback. Keeping them bare (no classes, no
// top-level state) means they're trivially testable and the React hook
// in use-backend-sync.tsx owns all lifecycle / subscription concerns.

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';

export interface BackendStatePayload {
  data: unknown;
  updated_at: string | null;
}

/**
 * GET /state.
 *
 * Returns:
 *   - `{ data, updated_at }` when the backend responds (even with `data: null`,
 *     meaning the server is up but nothing saved yet — caller must distinguish).
 *   - `null` when the backend is unreachable / not 2xx / parse failure.
 *     Caller treats this as "offline, keep localStorage".
 */
export async function fetchBackendState(): Promise<BackendStatePayload | null> {
  try {
    const res = await fetch(`${API_BASE}/state`, { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json()) as BackendStatePayload;
    return body;
  } catch {
    return null;
  }
}

/**
 * PUT /state. Body is `{ data: <opaque blob> }` — the backend does not
 * validate shape. Returns `{ updated_at }` on success, `null` otherwise.
 */
export async function pushBackendState(
  data: unknown,
): Promise<{ updated_at: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { updated_at: string };
  } catch {
    return null;
  }
}

/**
 * Quick 2-second /health probe. Used by the UI status line to show "offline"
 * without waiting on a possibly-slow PUT. `AbortController` keeps the tab
 * snappy even if the backend is down and the OS retries SYNs for a while.
 */
export async function checkBackendHealthForSync(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
