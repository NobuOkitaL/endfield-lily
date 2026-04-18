// frontend/src/logic/essence-recommend.ts
// Algorithm independently re-implemented; inspired by Arknights-yituliu/ef-frontend-v1 (GPL-3.0).

import { WEAPON_ESSENCE_STATS } from '@/data/weapon-essence-stats';
import { ENERGY_ALLUVIUM_MAPS } from '@/data/essence-maps';
import { ALL_ATTRIBUTE_STATS } from '@/data/essence-stats';

export interface FarmPlan {
  mapId: string;
  mapName: string;
  /** 3 pre-engraved main attributes */
  engraveAttributes: [string, string, string];
  /** null when locking a skill affix instead */
  lockedSecondary: string | null;
  /** null when locking a secondary stat instead */
  lockedSkill: string | null;
  /** weapon names fully satisfied by this plan */
  matchedWeapons: string[];
}

/**
 * For a given selection of weapon names, compute the top farming plans ranked
 * by number of weapons fully covered.
 *
 * A weapon is "covered" when:
 *  - its ideal attribute is among the 3 pre-engraved attributes, AND
 *  - (if locking secondary) its ideal secondary matches the locked secondary,
 *    AND its ideal skill is available in the map's skill pool, OR
 *  - (if locking skill)     its ideal skill matches the locked skill,
 *    AND its ideal secondary is available in the map's secondary pool.
 */
export function computeFarmPlans(selectedWeaponNames: string[]): FarmPlan[] {
  if (selectedWeaponNames.length === 0) return [];

  const result: FarmPlan[] = [];

  for (const map of ENERGY_ALLUVIUM_MAPS) {
    for (const attrCombo of combinations(ALL_ATTRIBUTE_STATS, 3)) {
      // --- lock secondary ---
      for (const lockedSecondary of map.secondaryStats) {
        const matched: string[] = [];
        for (const name of selectedWeaponNames) {
          const stats = WEAPON_ESSENCE_STATS[name];
          if (!stats) continue;
          if (
            stats.attribute &&
            attrCombo.includes(stats.attribute) &&
            stats.secondary === lockedSecondary &&
            stats.skill &&
            (map.skillStats as readonly string[]).includes(stats.skill)
          ) {
            matched.push(name);
          }
        }
        if (matched.length > 0) {
          result.push({
            mapId: map.id,
            mapName: map.name,
            engraveAttributes: attrCombo as [string, string, string],
            lockedSecondary,
            lockedSkill: null,
            matchedWeapons: matched,
          });
        }
      }

      // --- lock skill ---
      for (const lockedSkill of map.skillStats) {
        const matched: string[] = [];
        for (const name of selectedWeaponNames) {
          const stats = WEAPON_ESSENCE_STATS[name];
          if (!stats) continue;
          if (
            stats.attribute &&
            attrCombo.includes(stats.attribute) &&
            stats.secondary &&
            (map.secondaryStats as readonly string[]).includes(stats.secondary) &&
            stats.skill === lockedSkill
          ) {
            matched.push(name);
          }
        }
        if (matched.length > 0) {
          result.push({
            mapId: map.id,
            mapName: map.name,
            engraveAttributes: attrCombo as [string, string, string],
            lockedSecondary: null,
            lockedSkill,
            matchedWeapons: matched,
          });
        }
      }
    }
  }

  // Deduplicate: same map + same matched weapon set → keep first occurrence
  const seen = new Set<string>();
  const deduped: FarmPlan[] = [];
  for (const plan of result) {
    const key = `${plan.mapId}||${[...plan.matchedWeapons].sort().join(',')}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(plan);
    }
  }

  // Sort: primarily by coverage count DESC, secondarily keep stable order
  deduped.sort((a, b) => b.matchedWeapons.length - a.matchedWeapons.length);

  return deduped.slice(0, 20);
}

/** Yield all n-element combinations of arr (order of output matches input order). */
function* combinations<T>(arr: readonly T[], n: number): Generator<T[]> {
  if (n === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - n; i++) {
    for (const rest of combinations(arr.slice(i + 1), n - 1)) {
      yield [arr[i]!, ...rest];
    }
  }
}
