import type { SiteFetch } from './types.js';

const TIMEOUT_MS = 12_000;
const UA = 'wegetfound-audit/1.0 (+https://wegetfound.ai)';

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function getText(url: string, signal: AbortSignal): Promise<{ status: number; text: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal });
  return { status: res.status, text: await res.text(), finalUrl: res.url };
}

// Fetches the homepage HTML and robots.txt for a business site. Network failures
// degrade gracefully into an `ok: false` result so the audit can still score
// (an unreachable site is itself a finding).
export async function fetchSite(rawUrl: string): Promise<SiteFetch> {
  const base = normalizeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const page = await getText(base, controller.signal);
    const origin = new URL(page.finalUrl).origin;

    let robotsTxt: string | null = null;
    try {
      const robots = await getText(`${origin}/robots.txt`, controller.signal);
      robotsTxt = robots.status >= 200 && robots.status < 300 ? robots.text : null;
    } catch {
      robotsTxt = null; // missing robots.txt = nothing blocked
    }

    return {
      ok: page.status >= 200 && page.status < 400,
      status: page.status,
      finalUrl: page.finalUrl,
      html: page.text,
      robotsTxt,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      finalUrl: base,
      html: '',
      robotsTxt: null,
      error: String(err).split('\n')[0],
    };
  } finally {
    clearTimeout(timer);
  }
}
