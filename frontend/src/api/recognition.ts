const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Inventory response types
// ---------------------------------------------------------------------------

export interface InventoryItem {
  material_id: string;
  material_name: string;
  quantity: number;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
}

export interface UnknownSlot {
  bbox: [number, number, number, number];
  icon_thumbnail_base64: string;
  best_guess_material_id: string | null;
  best_guess_confidence: number;
  raw_ocr_text: string;
  best_guess_quantity: number | null;
}

export interface InventoryResponse {
  items: InventoryItem[];
  unknowns: UnknownSlot[];
}

// ---------------------------------------------------------------------------
// Operators response types
// ---------------------------------------------------------------------------

export interface OperatorItem {
  operator_id: string;
  name: string;
  level: number;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
}

export interface UnknownOpSlot {
  bbox: [number, number, number, number];
  icon_thumbnail_base64: string;
  best_guess_operator_id: string | null;
  best_guess_confidence: number;
  raw_ocr_text: string;
  best_guess_level: number | null;
}

export interface OperatorsResponse {
  items: OperatorItem[];
  unknowns: UnknownOpSlot[];
}

// ---------------------------------------------------------------------------
// Weapons response types
// ---------------------------------------------------------------------------

export interface WeaponItem {
  weapon_id: string;
  name: string;
  level: number;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface UnknownWeaponSlot {
  bbox: [number, number, number, number];
  icon_thumbnail_base64: string;
  best_guess_weapon_id: string | null;
  best_guess_confidence: number;
  raw_ocr_text: string;
  best_guess_level: number | null;
}

export interface WeaponsResponse {
  items: WeaponItem[];
  unknowns: UnknownWeaponSlot[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * POST multipart/form-data to /recognize/inventory
 * Returns structured inventory recognition results.
 */
export async function recognizeInventory(file: File): Promise<InventoryResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${API_BASE}/recognize/inventory`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`recognizeInventory failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<InventoryResponse>;
}

/**
 * POST multipart/form-data to /recognize/operators
 * Returns structured operator recognition results.
 */
export async function recognizeOperators(file: File): Promise<OperatorsResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${API_BASE}/recognize/operators`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`recognizeOperators failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<OperatorsResponse>;
}

/**
 * POST multipart/form-data to /recognize/weapons
 * Returns structured weapon recognition results.
 */
export async function recognizeWeapons(file: File): Promise<WeaponsResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${API_BASE}/recognize/weapons`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`recognizeWeapons failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<WeaponsResponse>;
}

/**
 * GET /health — returns true if the backend is reachable, false otherwise.
 * Uses a 2-second timeout and swallows all errors.
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
