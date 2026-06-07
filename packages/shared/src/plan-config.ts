/**
 * Plan limits and feature gates (CLAUDE.md §3.1, Phase 2).
 */

export type Plan = 'free' | 'starter' | 'growth' | 'agency' | 'enterprise';

export interface PlanLimits {
  aiRunsPerDay: number;
  businesses: number;
  trackedPrompts: number;
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    aiRunsPerDay: 3,
    businesses: 1,
    trackedPrompts: 1,
    features: [],
  },
  starter: {
    aiRunsPerDay: 10,
    businesses: 1,
    trackedPrompts: 10,
    features: ['nap-fix'],
  },
  growth: {
    aiRunsPerDay: 30,
    businesses: 3,
    trackedPrompts: 30,
    features: ['nap-fix', 'schema-autopilot', 'competitor-ghost'],
  },
  agency: {
    aiRunsPerDay: Infinity,
    businesses: 10,
    trackedPrompts: Infinity,
    features: ['all'],
  },
  enterprise: {
    aiRunsPerDay: Infinity,
    businesses: Infinity,
    trackedPrompts: Infinity,
    features: ['all', 'white-label'],
  },
};

export function getCapsForPlan(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function hasFeature(plan: Plan, feature: string): boolean {
  const caps = getCapsForPlan(plan);
  return caps.features.includes(feature) || caps.features.includes('all');
}
