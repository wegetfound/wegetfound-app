import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from './client';
import { events, organizations } from './schema';
import { getCapsForPlan } from '@wegetfound/shared';

// Blended per-engine-call cost estimate (OpenAI gpt-4o-mini + Perplexity sonar).
// Used for display only — actual spend may vary. Update as pricing changes.
export const EST_COST_PER_ENGINE_CALL_USD = 0.01;

// AI usage event types that count against the daily cap.
const AI_RUN_TYPES = ['audit.run', 'prompt.tested'] as const;

/**
 * Inserts one metering row into the events table after a successful AI run.
 * engineCalls = promptsTested × liveEngines.length (audit) or results.length (prompt test).
 */
export async function recordAiRun(input: {
  organizationId: string;
  userId?: string | null;
  businessId?: string | null;
  kind: 'audit.run' | 'prompt.tested';
  engineCalls: number;
}): Promise<void> {
  await db.insert(events).values({
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    businessId: input.businessId ?? null,
    eventType: input.kind,
    payload: { engineCalls: input.engineCalls },
  });
}

/**
 * Returns today + month run counts, summed engine calls, estimated cost,
 * the configured daily cap (from plan), and how many runs remain today.
 */
export async function getOrgUsage(organizationId: string): Promise<{
  today: { runs: number; engineCalls: number };
  month: { runs: number; engineCalls: number };
  estCostTodayUsd: number;
  estCostMonthUsd: number;
  capPerDay: number;
  remainingToday: number;
}> {
  // Get organization plan to determine cap
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (!org) throw new Error(`Organization ${organizationId} not found`);

  const caps = getCapsForPlan(org.plan as any);
  const capPerDay = caps.aiRunsPerDay === Infinity ? 999_999 : caps.aiRunsPerDay;

  const now = new Date();
  // Start of today UTC (midnight)
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Start of current month UTC
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Single query: aggregate both windows in parallel via conditional sums.
  // Casting the jsonb field to int so Postgres can sum it.
  const [row] = await db
    .select({
      runsToday: sql<number>`count(*) filter (where ${events.createdAt} >= ${startOfDay.toISOString()})`,
      callsToday: sql<number>`coalesce(sum((${events.payload}->>'engineCalls')::int) filter (where ${events.createdAt} >= ${startOfDay.toISOString()}), 0)`,
      runsMonth: sql<number>`count(*)`,
      callsMonth: sql<number>`coalesce(sum((${events.payload}->>'engineCalls')::int), 0)`,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        inArray(events.eventType, [...AI_RUN_TYPES]),
        gte(events.createdAt, startOfMonth),
      ),
    );

  const runsToday = Number(row?.runsToday ?? 0);
  const callsToday = Number(row?.callsToday ?? 0);
  const runsMonth = Number(row?.runsMonth ?? 0);
  const callsMonth = Number(row?.callsMonth ?? 0);

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    today: { runs: runsToday, engineCalls: callsToday },
    month: { runs: runsMonth, engineCalls: callsMonth },
    estCostTodayUsd: round2(callsToday * EST_COST_PER_ENGINE_CALL_USD),
    estCostMonthUsd: round2(callsMonth * EST_COST_PER_ENGINE_CALL_USD),
    capPerDay,
    remainingToday: Math.max(0, capPerDay - runsToday),
  };
}

/**
 * Cheap cap check: only counts today's run rows (no payload parsing needed).
 * Call this BEFORE the expensive AI work to gate the request.
 * Uses per-plan caps from getCapsForPlan().
 */
export async function isOverDailyCap(
  organizationId: string,
): Promise<{ over: boolean; capPerDay: number; runsToday: number }> {
  // Get organization plan to determine cap
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (!org) throw new Error(`Organization ${organizationId} not found`);

  const caps = getCapsForPlan(org.plan as any);
  const capPerDay = caps.aiRunsPerDay === Infinity ? 999_999 : caps.aiRunsPerDay;

  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        inArray(events.eventType, [...AI_RUN_TYPES]),
        gte(events.createdAt, startOfDay),
      ),
    );

  const runsToday = Number(row?.count ?? 0);
  return { over: runsToday >= capPerDay, capPerDay, runsToday };
}
