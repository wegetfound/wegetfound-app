import { describe, it, expect } from 'vitest';
import { analyzeCrawlerAccess, AI_BOTS } from './crawler.js';
import { analyzeSchema } from './schema.js';
import { analyzeNap } from './nap.js';
import { auditBusiness } from './audit.js';
import type { SiteFetch } from './types.js';

describe('analyzeCrawlerAccess', () => {
  it('treats a missing robots.txt as fully accessible', () => {
    const r = analyzeCrawlerAccess(null);
    expect(r.score).toBe(1);
    expect(r.blockedBots).toEqual([]);
    expect(r.hadRobotsTxt).toBe(false);
  });

  it('treats an empty robots.txt as fully accessible', () => {
    expect(analyzeCrawlerAccess('   ').score).toBe(1);
  });

  it('detects a specific AI bot being blocked', () => {
    const robots = 'User-agent: GPTBot\nDisallow: /';
    const r = analyzeCrawlerAccess(robots);
    expect(r.blockedBots).toContain('GPTBot');
    expect(r.score).toBeCloseTo((AI_BOTS.length - 1) / AI_BOTS.length);
  });

  it('blocks all AI bots when wildcard disallows root', () => {
    const r = analyzeCrawlerAccess('User-agent: *\nDisallow: /');
    expect(r.blockedBots.length).toBe(AI_BOTS.length);
    expect(r.score).toBe(0);
  });

  it('respects an Allow:/ override of a wildcard block', () => {
    const robots = 'User-agent: *\nDisallow: /\nAllow: /';
    expect(analyzeCrawlerAccess(robots).blockedBots).toEqual([]);
  });

  it('does not block when only a subpath is disallowed', () => {
    const robots = 'User-agent: *\nDisallow: /admin';
    expect(analyzeCrawlerAccess(robots).score).toBe(1);
  });

  it('ignores comments and blank lines', () => {
    const robots = '# comment\n\nUser-agent: ClaudeBot\nDisallow: /  # block all';
    expect(analyzeCrawlerAccess(robots).blockedBots).toContain('ClaudeBot');
  });
});

describe('analyzeSchema', () => {
  const ld = (obj: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head></html>`;

  it('detects LocalBusiness and extracts NAP', () => {
    const html = ld({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Pai Living',
      telephone: '+66 92 286 4775',
      address: { '@type': 'PostalAddress', streetAddress: '123 Road', addressLocality: 'Pai', postalCode: '58130' },
    });
    const r = analyzeSchema(html);
    expect(r.hasLocalBusiness).toBe(true);
    expect(r.extractedNap.name).toBe('Pai Living');
    expect(r.extractedNap.phone).toBe('+66 92 286 4775');
    expect(r.extractedNap.city).toBe('Pai');
    expect(r.score).toBeGreaterThanOrEqual(0.4);
  });

  it('detects FAQ and review markup, raising the score', () => {
    const html = ld([
      { '@type': 'Organization', name: 'X' },
      { '@type': 'FAQPage' },
      { '@type': 'Restaurant', aggregateRating: { ratingValue: 4.8 } },
    ]);
    const r = analyzeSchema(html);
    expect(r.hasFaq).toBe(true);
    expect(r.hasReview).toBe(true);
    expect(r.hasLocalBusiness).toBe(true);
  });

  it('walks @graph nodes', () => {
    const html = ld({ '@graph': [{ '@type': 'LocalBusiness', name: 'G' }] });
    expect(analyzeSchema(html).hasLocalBusiness).toBe(true);
  });

  it('returns an empty result for a page with no JSON-LD', () => {
    const r = analyzeSchema('<html><body>hi</body></html>');
    expect(r.score).toBe(0);
    expect(r.hasLocalBusiness).toBe(false);
    expect(r.foundTypes).toEqual([]);
  });

  it('skips malformed JSON-LD without throwing', () => {
    const html = '<script type="application/ld+json">{ not valid json }</script>';
    expect(() => analyzeSchema(html)).not.toThrow();
    expect(analyzeSchema(html).score).toBe(0);
  });
});

describe('analyzeNap', () => {
  const db = { name: 'Pai Living', phone: '+66922864775', postalCode: '58130' };

  it('scores a full match as 1 with no mismatch', () => {
    const r = analyzeNap({ name: 'Pai Living', phone: '0922864775', postalCode: '58130' }, db);
    expect(r.score).toBe(1);
    expect(r.hasMajorMismatch).toBe(false);
  });

  it('flags a name mismatch as major', () => {
    const r = analyzeNap({ name: 'Completely Different Co', phone: '+66922864775' }, db);
    expect(r.hasMajorMismatch).toBe(true);
    expect(r.mismatches.some((m) => m.startsWith('name'))).toBe(true);
  });

  it('treats a phone mismatch as minor (not major)', () => {
    const r = analyzeNap({ name: 'Pai Living', phone: '+66 99 999 9999' }, db);
    expect(r.hasMajorMismatch).toBe(false);
    expect(r.score).toBeLessThan(1);
  });

  it('matches names ignoring suffixes and punctuation', () => {
    const r = analyzeNap({ name: 'Pai Living, LLC' }, { name: 'Pai Living' });
    expect(r.hasMajorMismatch).toBe(false);
    expect(r.score).toBe(1);
  });

  it('reports noDataOnSite when nothing is extractable', () => {
    const r = analyzeNap({}, db);
    expect(r.noDataOnSite).toBe(true);
    expect(r.score).toBe(0);
  });
});

describe('auditBusiness', () => {
  const fakeSite = (over: Partial<SiteFetch>): SiteFetch => ({
    ok: true,
    status: 200,
    finalUrl: 'https://example.com',
    html: '',
    robotsTxt: null,
    ...over,
  });

  it('returns a no-website finding when no URL is set', async () => {
    const r = await auditBusiness({ name: 'X' });
    expect(r.fetched).toBe(false);
    expect(r.findings[0]?.title).toMatch(/no website/i);
    expect(r.signals.crawlerAccessibility).toBe(0);
  });

  it('produces signals + findings from a fetched page', async () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({ '@type': 'LocalBusiness', name: 'Pai Living', telephone: '+66922864775' }) +
      '</script>';
    const r = await auditBusiness(
      { name: 'Pai Living', websiteUrl: 'pailiving.com', phone: '+66922864775' },
      async () => fakeSite({ html, robotsTxt: 'User-agent: *\nDisallow: /' }),
    );
    expect(r.signals.crawlerAccessibility).toBe(0); // robots blocks everyone
    expect(r.signals.schemaCompleteness).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.fixType === 'crawler_blocked')).toBe(true);
    expect(r.findings.some((f) => f.fixType === 'missing_faq')).toBe(true);
  });

  it('emits a single unreachable finding when the site fails to load', async () => {
    const r = await auditBusiness(
      { name: 'X', websiteUrl: 'broken.example' },
      async () => fakeSite({ ok: false, status: 0, html: '', error: 'timeout' }),
    );
    expect(r.fetched).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.fixType).toBe('listing_update');
  });
});
