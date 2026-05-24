import type { EngineId } from '@wegetfound/shared';

// All five engine sub-scores, each 0-100 (inclusion rate across tested prompts).
export type EngineScores = Record<EngineId, number>;

// Signal inputs, each normalized 0..1, plus the hard NAP penalty flag (§8.1).
export interface Signals {
  /** LocalBusiness + FAQ + Service coverage. Up to +0.10 multiplier. */
  schemaCompleteness: number;
  /** Name/address/phone agreement across directories. Up to +0.10. */
  napConsistency: number;
  /** Review velocity + language diversity. Up to +0.05. */
  reviewHealth: number;
  /** robots.txt / llms.txt / schema accessibility to AI. Up to +0.05. */
  crawlerAccessibility: number;
  /** A major name/address/phone mismatch. Applies a ×0.5 penalty. */
  hasMajorNapMismatch: boolean;
}

export interface SignalContribution {
  label: string;
  /** Multiplier delta this signal contributed (e.g. +0.08, -0.50). */
  delta: number;
}

export interface ScoreBreakdown {
  methodologyVersion: string;
  overallScore: number; // 0-100
  perEngine: EngineScores;
  /** Weighted engine base before signal multipliers, 0-100. */
  weightedBase: number;
  /** Final applied multiplier, clamped to [0.5, 1.2]. */
  multiplier: number;
  topPositive: SignalContribution[];
  topNegative: SignalContribution[];
}
