import type { Signals } from '@wegetfound/scoring';
import { analyzeCrawlerAccess } from './crawler.js';
import { analyzeSchema } from './schema.js';
import { analyzeNap } from './nap.js';
import { fetchSite } from './fetch-site.js';
import type {
  BusinessAuditInput,
  CrawlerAnalysis,
  Finding,
  NapAnalysis,
  SchemaAnalysis,
  SiteFetch,
} from './types.js';

export interface AuditResult {
  signals: Signals;
  findings: Finding[];
  fetched: boolean;
  finalUrl: string;
  foundSchemaTypes: string[];
  detail: { crawler: CrawlerAnalysis; schema: SchemaAnalysis; nap: NapAnalysis };
}

// Plain-language findings only (non-negotiable #4 — no jargon to the user).
function buildFindings(
  site: SiteFetch,
  crawler: CrawlerAnalysis,
  schema: SchemaAnalysis,
  nap: NapAnalysis,
): Finding[] {
  const findings: Finding[] = [];

  if (!site.ok) {
    findings.push({
      dedupKey: 'site_unreachable',
      fixType: 'listing_update',
      title: "We couldn't load your website",
      detail: `The site didn't respond properly${site.error ? ` (${site.error})` : ''}. AI assistants can't recommend a business they can't read.`,
      estimatedScoreImpact: 40,
      estimatedMinutes: 30,
    });
    return findings; // nothing else is measurable without the page
  }

  if (crawler.blockedBots.length > 0) {
    findings.push({
      dedupKey: 'crawler_blocked',
      fixType: 'crawler_blocked',
      title: 'AI assistants are blocked from reading your site',
      detail: `Your site tells ${crawler.blockedBots.length} AI assistant${crawler.blockedBots.length > 1 ? 's' : ''} to stay out (${crawler.blockedBots.join(', ')}). They literally cannot see your business.`,
      estimatedScoreImpact: 35,
      estimatedMinutes: 10,
    });
  }

  if (!schema.hasLocalBusiness) {
    findings.push({
      dedupKey: 'schema_local_business',
      fixType: 'schema_missing',
      title: 'Your business details are missing in a format AI can read',
      detail: 'Add structured business information (name, address, phone) so AI assistants can confidently identify and recommend you.',
      estimatedScoreImpact: 25,
      estimatedMinutes: 30,
    });
  }

  if (!schema.hasFaq) {
    findings.push({
      dedupKey: 'schema_faq',
      fixType: 'missing_faq',
      title: 'No questions-and-answers section AI can quote',
      detail: 'A short FAQ is the single thing AI assistants quote most often. Adding 4–6 common questions makes you far easier to recommend.',
      estimatedScoreImpact: 15,
      estimatedMinutes: 45,
    });
  }

  if (nap.hasMajorMismatch) {
    findings.push({
      dedupKey: 'nap_mismatch',
      fixType: 'nap_mismatch',
      title: 'Your business name or details disagree with our records',
      detail: `What's on your site doesn't match your records: ${nap.mismatches.join('; ')}. Inconsistent details make AI assistants unsure which business you are.`,
      estimatedScoreImpact: 30,
      estimatedMinutes: 20,
    });
  }

  return findings;
}

// The on-site audit: fetches the homepage + robots.txt, derives the four signals
// and a prioritised list of findings. reviewHealth is a weak proxy from on-page
// rating markup until the reviews integration lands (Places API, billing-gated).
export async function auditBusiness(
  business: BusinessAuditInput,
  fetchImpl: (url: string) => Promise<SiteFetch> = fetchSite,
): Promise<AuditResult> {
  if (!business.websiteUrl) {
    const signals: Signals = {
      schemaCompleteness: 0,
      napConsistency: 0,
      reviewHealth: 0,
      crawlerAccessibility: 0,
      hasMajorNapMismatch: false,
    };
    return {
      signals,
      findings: [
        {
          dedupKey: 'no_website',
          fixType: 'listing_update',
          title: 'No website on record',
          detail: 'AI assistants need a website to read before they can recommend you. Add one to start improving your score.',
          estimatedScoreImpact: 50,
          estimatedMinutes: 120,
        },
      ],
      fetched: false,
      finalUrl: '',
      foundSchemaTypes: [],
      detail: {
        crawler: { score: 0, blockedBots: [], hadRobotsTxt: false },
        schema: { score: 0, foundTypes: [], hasLocalBusiness: false, hasFaq: false, hasReview: false, extractedNap: {} },
        nap: { score: 0, hasMajorMismatch: false, mismatches: [], noDataOnSite: true },
      },
    };
  }

  const site = await fetchImpl(business.websiteUrl);
  const crawler = analyzeCrawlerAccess(site.robotsTxt);
  const schema = analyzeSchema(site.html);
  const nap = analyzeNap(schema.extractedNap, business);
  const reviewHealth = schema.hasReview ? 0.5 : 0;

  const signals: Signals = {
    schemaCompleteness: schema.score,
    napConsistency: nap.score,
    reviewHealth,
    crawlerAccessibility: crawler.score,
    hasMajorNapMismatch: nap.hasMajorMismatch,
  };

  return {
    signals,
    findings: buildFindings(site, crawler, schema, nap),
    fetched: site.ok,
    finalUrl: site.finalUrl,
    foundSchemaTypes: schema.foundTypes,
    detail: { crawler, schema, nap },
  };
}
