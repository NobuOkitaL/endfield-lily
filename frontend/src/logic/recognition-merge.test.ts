import { describe, it, expect } from 'vitest';
import { mergeInventoryResponses, mergeOperatorsResponses } from './recognition-merge';
import type { InventoryResponse, OperatorsResponse } from '@/api/recognition';

function invItem(id: string, qty: number, conf = 0.9, bbox: [number, number, number, number] = [0, 0, 50, 50]) {
  return { material_id: id, material_name: id, quantity: qty, confidence: conf, bbox };
}

function opItem(id: string, level: number, conf = 0.9, bbox: [number, number, number, number] = [0, 0, 50, 50]) {
  return { operator_id: id, name: id, level, confidence: conf, bbox };
}

describe('mergeInventoryResponses', () => {
  it('deduplicates by material_id and keeps max quantity', () => {
    const r1: InventoryResponse = { items: [invItem('m1', 5), invItem('m2', 10)], unknowns: [] };
    const r2: InventoryResponse = { items: [invItem('m1', 12), invItem('m3', 3)], unknowns: [] };
    const merged = mergeInventoryResponses([r1, r2]);
    const byId = Object.fromEntries(merged.items.map((i) => [i.material_id, i.quantity]));
    expect(byId).toEqual({ m1: 12, m2: 10, m3: 3 });
  });

  it('adopts higher-confidence bbox on merge but still maxes quantity', () => {
    const r1: InventoryResponse = { items: [invItem('m1', 100, 0.6, [0, 0, 10, 10])], unknowns: [] };
    const r2: InventoryResponse = { items: [invItem('m1', 50, 0.95, [5, 5, 20, 20])], unknowns: [] };
    const merged = mergeInventoryResponses([r1, r2]);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].quantity).toBe(100);
    expect(merged.items[0].confidence).toBe(0.95);
    expect(merged.items[0].bbox).toEqual([5, 5, 20, 20]);
  });

  it('concatenates all unknowns across responses', () => {
    const mkUnknown = (id: string) => ({
      bbox: [0, 0, 50, 50] as [number, number, number, number],
      icon_thumbnail_base64: id,
      best_guess_material_id: null,
      best_guess_confidence: 0,
      raw_ocr_text: '',
    });
    const r1: InventoryResponse = { items: [], unknowns: [mkUnknown('u1')] };
    const r2: InventoryResponse = { items: [], unknowns: [mkUnknown('u2'), mkUnknown('u3')] };
    const merged = mergeInventoryResponses([r1, r2]);
    expect(merged.unknowns).toHaveLength(3);
  });

  it('returns empty response for empty input', () => {
    const merged = mergeInventoryResponses([]);
    expect(merged.items).toEqual([]);
    expect(merged.unknowns).toEqual([]);
  });
});

describe('mergeOperatorsResponses', () => {
  it('deduplicates by operator_id and keeps max level', () => {
    const r1: OperatorsResponse = { items: [opItem('lily', 40), opItem('chen', 55)], unknowns: [] };
    const r2: OperatorsResponse = { items: [opItem('lily', 70), opItem('chen', 50)], unknowns: [] };
    const merged = mergeOperatorsResponses([r1, r2]);
    const byId = Object.fromEntries(merged.items.map((i) => [i.operator_id, i.level]));
    expect(byId).toEqual({ lily: 70, chen: 55 });
  });
});
