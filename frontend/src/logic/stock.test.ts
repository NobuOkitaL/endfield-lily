// frontend/src/logic/stock.test.ts
import { describe, expect, it } from 'vitest';
import {
  mergeStock,
  diffStock,
  deductStock,
  isAffordable,
  computeVirtualExp,
  type Stock,
} from './stock';

describe('mergeStock', () => {
  it('adds counts (mode=add)', () => {
    const merged = mergeStock({ 折金票: 100 }, { 折金票: 50, 协议棱柱: 5 }, { mode: 'add' });
    expect(merged).toEqual({ 折金票: 150, 协议棱柱: 5 });
  });
  it('replaces counts (mode=replace)', () => {
    expect(mergeStock({ 折金票: 100, 协议棱柱: 3 }, { 折金票: 50 }, { mode: 'replace' }))
      .toEqual({ 折金票: 50, 协议棱柱: 3 });
  });
});

describe('diffStock', () => {
  it('returns missing amounts', () => {
    expect(diffStock({ 折金票: 100 }, { 折金票: 150, 协议棱柱: 3 }))
      .toEqual({ 折金票: 50, 协议棱柱: 3 });
  });
  it('returns empty when fully covered', () => {
    expect(diffStock({ 折金票: 200 }, { 折金票: 150 })).toEqual({});
  });
});

describe('isAffordable', () => {
  it('true when diff empty', () => {
    expect(isAffordable({ 折金票: 100 }, { 折金票: 50 })).toBe(true);
  });
  it('false otherwise', () => {
    expect(isAffordable({ 折金票: 50 }, { 折金票: 100 })).toBe(false);
  });
});

describe('deductStock', () => {
  it('subtracts and drops zero/negative', () => {
    expect(deductStock({ 折金票: 100, 协议棱柱: 5 }, { 折金票: 30, 协议棱柱: 5 }))
      .toEqual({ 折金票: 70 });
  });
  it('unaffected materials unchanged', () => {
    expect(deductStock({ 折金票: 100, 协议圆盘: 3 }, { 折金票: 10 }))
      .toEqual({ 折金票: 90, 协议圆盘: 3 });
  });
});

describe('computeVirtualExp', () => {
  it('sums record cards to record EXP', () => {
    const stock: Stock = { '高级作战记录': 2, '中级作战记录': 3 };
    expect(computeVirtualExp(stock, 'record')).toBe(2 * 10000 + 3 * 1000);
  });
  it('returns 0 when no relevant cards', () => {
    expect(computeVirtualExp({ 折金票: 100 }, 'record')).toBe(0);
  });
  it('sums weapon check items to weapon EXP', () => {
    const stock: Stock = { '武器检查套组': 1, '武器检查装置': 2 };
    expect(computeVirtualExp(stock, 'weapon')).toBe(10000 + 2 * 1000);
  });
});
