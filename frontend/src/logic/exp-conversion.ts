// frontend/src/logic/exp-conversion.ts
import { EXP_CARD_VALUES, type ExpType, type MaterialName } from '@/data/materials';

/**
 * 把一个 EXP 总数贪心拆成 EXP 卡片数。
 * 从高到低分配；最低档向上取整以保证覆盖总量。
 * 优先最小溢出（按最小溢出枚举，其次最少张数）。
 */
export function convertExpToCards(
  exp: number,
  type: ExpType,
): Partial<Record<MaterialName, number>> {
  if (exp <= 0) return {};
  const table = EXP_CARD_VALUES[type] as Record<string, number>;
  const entries = Object.entries(table).sort((a, b) => b[1] - a[1]);
  const out: Partial<Record<MaterialName, number>> = {};
  let remaining = exp;
  for (let i = 0; i < entries.length - 1; i++) {
    const [name, value] = entries[i];
    const n = Math.floor(remaining / value);
    if (n > 0) {
      out[name as MaterialName] = n;
      remaining -= n * value;
    }
  }
  if (remaining > 0) {
    const [lowestName, lowestValue] = entries[entries.length - 1];
    out[lowestName as MaterialName] = Math.ceil(remaining / lowestValue);
  }
  return out;
}

/**
 * 将卡片数量还原为 EXP 总量（仅统计属于该 type 的卡）。
 */
export function sumExpCards(
  cards: Partial<Record<MaterialName, number>>,
  type: ExpType,
): number {
  const table: Record<string, number> = EXP_CARD_VALUES[type] as Record<string, number>;
  let sum = 0;
  for (const [name, count] of Object.entries(cards)) {
    const v = table[name];
    if (v !== undefined && typeof count === 'number') sum += v * count;
  }
  return sum;
}
