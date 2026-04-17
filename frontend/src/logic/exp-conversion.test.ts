// frontend/src/logic/exp-conversion.test.ts
import { describe, expect, it } from 'vitest';
import { convertExpToCards, sumExpCards } from './exp-conversion';

describe('convertExpToCards (record/作战记录)', () => {
  it('returns empty for zero exp', () => {
    expect(convertExpToCards(0, 'record')).toEqual({});
  });

  it('greedy fills highest tier first', () => {
    // 21000 EXP = 2 张高级 (20000) + 1 张中级 (1000)
    expect(convertExpToCards(21000, 'record')).toEqual({
      '高级作战记录': 2,
      '中级作战记录': 1,
    });
  });

  it('rounds up the lowest tier when not divisible', () => {
    // 250 EXP → 至少 2 张初级（400）覆盖
    const cards = convertExpToCards(250, 'record');
    expect(cards['初级作战记录']).toBe(2);
  });
});

describe('sumExpCards', () => {
  it('sums card counts to EXP', () => {
    expect(sumExpCards({ '高级作战记录': 1, '中级作战记录': 2 }, 'record')).toBe(12000);
  });
  it('returns 0 for unrelated keys', () => {
    expect(sumExpCards({ '折金票': 100 }, 'record')).toBe(0);
  });
});
