import type { BusinessAuditInput, ExtractedNap, NapAnalysis } from './types.js';

const normName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\b(llc|ltd|inc|co|company|the)\b/g, '')
    .replace(/[^a-z0-9฀-๿]+/g, ' ') // keep Thai range for TH businesses
    .trim();

// Compare the last 9 (subscriber) digits so country/trunk prefixes that vary by
// format don't read as mismatches — e.g. TH "+66922864775" === local "0922864775".
const normPhone = (s: string): string => s.replace(/\D/g, '').slice(-9);

// Compares the NAP we record (DB source of truth) against what the site actually
// exposes in structured data. Drives the napConsistency signal + the ×0.5 penalty
// on a major mismatch (§8.1). If the site exposes no machine-readable NAP, AI
// engines can't extract a consistent identity — that's itself a low score.
export function analyzeNap(extracted: ExtractedNap, db: BusinessAuditInput): NapAnalysis {
  const hasAny = Boolean(extracted.name || extracted.phone || extracted.streetAddress);
  if (!hasAny) {
    return { score: 0, hasMajorMismatch: false, mismatches: [], noDataOnSite: true };
  }

  const mismatches: string[] = [];
  let checked = 0;
  let matched = 0;
  let majorMismatch = false;

  // Name — the identity anchor. A name mismatch is "major".
  if (extracted.name && db.name) {
    checked += 1;
    const a = normName(extracted.name);
    const b = normName(db.name);
    if (a && b && (a === b || a.includes(b) || b.includes(a))) {
      matched += 1;
    } else {
      mismatches.push(`name: site "${extracted.name}" vs record "${db.name}"`);
      majorMismatch = true;
    }
  }

  // Phone — strong identity signal.
  if (extracted.phone && db.phone) {
    checked += 1;
    if (normPhone(extracted.phone) === normPhone(db.phone)) {
      matched += 1;
    } else {
      mismatches.push(`phone: site "${extracted.phone}" vs record "${db.phone}"`);
    }
  }

  // Postal code — loose locality check.
  if (extracted.postalCode && db.postalCode) {
    checked += 1;
    if (extracted.postalCode.replace(/\s/g, '') === db.postalCode.replace(/\s/g, '')) {
      matched += 1;
    } else {
      mismatches.push(`postalCode: site "${extracted.postalCode}" vs record "${db.postalCode}"`);
    }
  }

  // Nothing comparable on both sides (site has NAP but we have no record fields to match).
  const score = checked === 0 ? 0.5 : matched / checked;
  return { score, hasMajorMismatch: majorMismatch, mismatches, noDataOnSite: false };
}
