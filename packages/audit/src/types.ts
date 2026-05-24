import type { FixType } from '@wegetfound/shared';

// The lightweight business shape the audit engine needs — decoupled from the DB row.
export interface BusinessAuditInput {
  name: string;
  websiteUrl?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

// NAP (name / address / phone) extracted from a website's structured data.
export interface ExtractedNap {
  name?: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
}

// A concrete, actionable problem the audit surfaced. Maps 1:1 to a Fix-queue entry.
export interface Finding {
  fixType: FixType;
  title: string;
  detail: string;
  estimatedScoreImpact: number; // rough 1-100, used to prioritise the Fix queue
}

// What fetching the homepage + robots.txt produced.
export interface SiteFetch {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  robotsTxt: string | null;
  error?: string;
}

// Per-signal detail, kept alongside the normalized 0..1 value for explainability.
export interface CrawlerAnalysis {
  score: number;
  blockedBots: string[];
  hadRobotsTxt: boolean;
}

export interface SchemaAnalysis {
  score: number;
  foundTypes: string[];
  hasLocalBusiness: boolean;
  hasFaq: boolean;
  hasReview: boolean;
  extractedNap: ExtractedNap;
}

export interface NapAnalysis {
  score: number;
  hasMajorMismatch: boolean;
  mismatches: string[];
  /** No machine-readable NAP found on the site at all. */
  noDataOnSite: boolean;
}
