// frontend/src/logic/stock.ts
import type { MaterialName, ExpType } from '@/data/materials';
import { sumExpCards } from './exp-conversion';

export type Stock = Partial<Record<MaterialName, number>>;

export type MergeMode = 'add' | 'replace';

export function mergeStock(base: Stock, patch: Stock, opts: { mode: MergeMode }): Stock {
  const out: Stock = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v !== 'number') continue;
    if (opts.mode === 'add') {
      out[k as MaterialName] = (out[k as MaterialName] ?? 0) + v;
    } else {
      out[k as MaterialName] = v;
    }
  }
  return out;
}

export function diffStock(have: Stock, need: Stock): Stock {
  const out: Stock = {};
  for (const [k, v] of Object.entries(need)) {
    if (typeof v !== 'number') continue;
    const missing = v - (have[k as MaterialName] ?? 0);
    if (missing > 0) out[k as MaterialName] = missing;
  }
  return out;
}

export function isAffordable(have: Stock, need: Stock): boolean {
  return Object.keys(diffStock(have, need)).length === 0;
}

export function deductStock(have: Stock, spent: Stock): Stock {
  const out: Stock = {};
  for (const [k, v] of Object.entries(have)) {
    if (typeof v !== 'number') continue;
    const remain = v - (spent[k as MaterialName] ?? 0);
    if (remain > 0) out[k as MaterialName] = remain;
  }
  return out;
}

export function computeVirtualExp(stock: Stock, type: ExpType): number {
  return sumExpCards(stock, type);
}
