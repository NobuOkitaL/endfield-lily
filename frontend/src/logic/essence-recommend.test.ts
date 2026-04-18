// frontend/src/logic/essence-recommend.test.ts
import { describe, it, expect } from 'vitest';
import { computeFarmPlans } from './essence-recommend';
import { WEAPON_ESSENCE_STATS } from '@/data/weapon-essence-stats';

describe('computeFarmPlans', () => {
  it('returns empty array when no weapons are selected', () => {
    const plans = computeFarmPlans([]);
    expect(plans).toEqual([]);
  });

  it('returns at least one plan for a single valid weapon', () => {
    // 典范: attribute=主能力提升, secondary=攻击提升, skill=压制
    const plans = computeFarmPlans(['典范']);
    expect(plans.length).toBeGreaterThan(0);
    // Every plan should cover 典范
    for (const plan of plans) {
      expect(plan.matchedWeapons).toContain('典范');
    }
  });

  it('top plan for 典范 has correct attribute and lock', () => {
    const plans = computeFarmPlans(['典范']);
    const best = plans[0]!;
    // 典范 needs 主能力提升 in engrave set
    expect(best.engraveAttributes).toContain('主能力提升');
    // locked secondary OR skill must align with the weapon
    const stats = WEAPON_ESSENCE_STATS['典范']!;
    if (best.lockedSecondary !== null) {
      expect(best.lockedSecondary).toBe(stats.secondary);
    } else {
      expect(best.lockedSkill).toBe(stats.skill);
    }
  });

  it('each plan has exactly 3 engrave attributes', () => {
    const plans = computeFarmPlans(['典范', '热熔切割器', '黯色火炬']);
    for (const plan of plans) {
      expect(plan.engraveAttributes).toHaveLength(3);
    }
  });

  it('each plan has exactly one of lockedSecondary or lockedSkill set', () => {
    const plans = computeFarmPlans(['宏愿', '落草', '领航者']);
    for (const plan of plans) {
      const hasSecondary = plan.lockedSecondary !== null;
      const hasSkill = plan.lockedSkill !== null;
      expect(hasSecondary !== hasSkill).toBe(true);
    }
  });

  it('two weapons sharing attribute+secondary combo appear together in a plan', () => {
    // 典范 and J.E.T. both have: attribute includes 主能力提升, secondary=攻击提升, skill=压制
    // They can both appear in the same plan when locking secondary=攻击提升
    const plans = computeFarmPlans(['典范', 'J.E.T.']);
    const bothCovered = plans.find(
      (p) => p.matchedWeapons.includes('典范') && p.matchedWeapons.includes('J.E.T.'),
    );
    expect(bothCovered).toBeDefined();
  });

  it('returns at most 20 plans', () => {
    // Select many weapons to generate many plans
    const many = Object.keys(WEAPON_ESSENCE_STATS).slice(0, 20);
    const plans = computeFarmPlans(many);
    expect(plans.length).toBeLessThanOrEqual(20);
  });

  it('plans are sorted by coverage descending', () => {
    const many = Object.keys(WEAPON_ESSENCE_STATS).slice(0, 15);
    const plans = computeFarmPlans(many);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.matchedWeapons.length).toBeLessThanOrEqual(
        plans[i - 1]!.matchedWeapons.length,
      );
    }
  });
});
