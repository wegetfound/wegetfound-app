import * as cheerio from 'cheerio';
import type { ExtractedNap, SchemaAnalysis } from './types.js';

// schema.org LocalBusiness subtypes we treat as "business identity" present.
const LOCAL_BUSINESS_TYPES = new Set([
  'localbusiness',
  'organization',
  'restaurant',
  'hotel',
  'store',
  'professionalservice',
  'homeandconstructionbusiness',
  'generalcontractor',
  'realestateagent',
  'healthandbeautybusiness',
  'lodgingbusiness',
]);

type JsonValue = unknown;

const typesOf = (node: Record<string, JsonValue>): string[] => {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
};

// Walk a parsed JSON-LD value, collecting every node object (handles @graph, arrays, nesting).
function collectNodes(value: JsonValue, out: Record<string, JsonValue>[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectNodes(v, out);
  } else if (value && typeof value === 'object') {
    const node = value as Record<string, JsonValue>;
    out.push(node);
    if (Array.isArray(node['@graph'])) collectNodes(node['@graph'], out);
  }
}

function extractNapFrom(node: Record<string, JsonValue>): ExtractedNap {
  const nap: ExtractedNap = {};
  if (typeof node.name === 'string') nap.name = node.name;
  if (typeof node.telephone === 'string') nap.phone = node.telephone;
  const addr = node.address;
  if (typeof addr === 'string') {
    nap.streetAddress = addr;
  } else if (addr && typeof addr === 'object') {
    const a = addr as Record<string, JsonValue>;
    if (typeof a.streetAddress === 'string') nap.streetAddress = a.streetAddress;
    if (typeof a.addressLocality === 'string') nap.city = a.addressLocality;
    if (typeof a.postalCode === 'string') nap.postalCode = a.postalCode;
  }
  return nap;
}

export function analyzeSchema(html: string): SchemaAnalysis {
  const $ = cheerio.load(html);
  const nodes: Record<string, JsonValue>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;
    try {
      collectNodes(JSON.parse(raw), nodes);
    } catch {
      // Malformed JSON-LD is common in the wild; skip it rather than failing the audit.
    }
  });

  const foundTypeSet = new Set<string>();
  let hasLocalBusiness = false;
  let hasFaq = false;
  let hasReview = false;
  let hasService = false;
  let extractedNap: ExtractedNap = {};

  for (const node of nodes) {
    const types = typesOf(node);
    for (const t of types) foundTypeSet.add(t);
    const lower = types.map((t) => t.toLowerCase());

    if (lower.some((t) => LOCAL_BUSINESS_TYPES.has(t))) {
      hasLocalBusiness = true;
      const nap = extractNapFrom(node);
      // Prefer the most complete NAP across candidate nodes.
      if (Object.keys(nap).length > Object.keys(extractedNap).length) extractedNap = nap;
    }
    if (lower.includes('faqpage') || lower.includes('question')) hasFaq = true;
    if (lower.includes('review') || lower.includes('aggregaterating') || 'aggregateRating' in node) {
      hasReview = true;
    }
    if (lower.includes('service') || 'makesOffer' in node || 'hasOfferCatalog' in node) {
      hasService = true;
    }
  }

  const score =
    (hasLocalBusiness ? 0.4 : 0) +
    (hasFaq ? 0.2 : 0) +
    (hasService ? 0.2 : 0) +
    (hasReview ? 0.2 : 0);

  return {
    score: Math.min(1, score),
    foundTypes: [...foundTypeSet],
    hasLocalBusiness,
    hasFaq,
    hasReview,
    extractedNap,
  };
}
