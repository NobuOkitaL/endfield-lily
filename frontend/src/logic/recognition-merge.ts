// frontend/src/logic/recognition-merge.ts
// Merge multiple recognition responses, de-duplicating items by id and taking max value.

import type {
  InventoryItem,
  InventoryResponse,
  OperatorItem,
  OperatorsResponse,
} from '@/api/recognition';

export function mergeInventoryResponses(responses: InventoryResponse[]): InventoryResponse {
  const byId = new Map<string, InventoryItem>();
  for (const r of responses) {
    for (const item of r.items) {
      const prev = byId.get(item.material_id);
      if (!prev) {
        byId.set(item.material_id, { ...item });
        continue;
      }
      // Take max quantity; keep the bbox/confidence from whichever sample had the higher confidence
      const merged: InventoryItem = {
        ...prev,
        quantity: Math.max(prev.quantity, item.quantity),
      };
      if (item.confidence > prev.confidence) {
        merged.confidence = item.confidence;
        merged.bbox = item.bbox;
      }
      byId.set(item.material_id, merged);
    }
  }
  return {
    items: Array.from(byId.values()),
    unknowns: responses.flatMap((r) => r.unknowns),
  };
}

export function mergeOperatorsResponses(responses: OperatorsResponse[]): OperatorsResponse {
  const byId = new Map<string, OperatorItem>();
  for (const r of responses) {
    for (const item of r.items) {
      const prev = byId.get(item.operator_id);
      if (!prev) {
        byId.set(item.operator_id, { ...item });
        continue;
      }
      const merged: OperatorItem = {
        ...prev,
        level: Math.max(prev.level, item.level),
      };
      if (item.confidence > prev.confidence) {
        merged.confidence = item.confidence;
        merged.bbox = item.bbox;
      }
      byId.set(item.operator_id, merged);
    }
  }
  return {
    items: Array.from(byId.values()),
    unknowns: responses.flatMap((r) => r.unknowns),
  };
}
