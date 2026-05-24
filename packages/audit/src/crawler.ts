import type { CrawlerAnalysis } from './types.js';

// The AI crawlers that matter for findability. If a site blocks these in
// robots.txt, the AI engines literally cannot read it — the single most
// damaging accessibility problem (§8.1, crawlerAccessibility signal).
export const AI_BOTS = [
  'GPTBot', // OpenAI training
  'OAI-SearchBot', // ChatGPT search
  'ChatGPT-User', // ChatGPT browsing
  'ClaudeBot', // Anthropic
  'PerplexityBot', // Perplexity
  'Google-Extended', // Gemini / AI Overviews
  'CCBot', // Common Crawl (feeds many models)
] as const;

interface RobotsGroup {
  disallows: string[];
  allows: string[];
}

// Minimal robots.txt parser: groups directives by user-agent (lowercased).
function parseRobots(robotsTxt: string): Map<string, RobotsGroup> {
  const groups = new Map<string, RobotsGroup>();
  let current: string[] = [];
  let sawDirective = false;

  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === 'user-agent') {
      // A new user-agent line after directives starts a fresh group block.
      if (sawDirective) {
        current = [];
        sawDirective = false;
      }
      const ua = value.toLowerCase();
      current.push(ua);
      if (!groups.has(ua)) groups.set(ua, { disallows: [], allows: [] });
    } else if (field === 'disallow' || field === 'allow') {
      sawDirective = true;
      for (const ua of current) {
        const group = groups.get(ua);
        if (group) (field === 'disallow' ? group.disallows : group.allows).push(value);
      }
    }
  }
  return groups;
}

// A bot is blocked from the whole site if its governing group disallows "/"
// with no overriding allow of "/".
function isBlocked(groups: Map<string, RobotsGroup>, bot: string): boolean {
  const group = groups.get(bot.toLowerCase()) ?? groups.get('*');
  if (!group) return false; // no rule = allowed
  const blocksRoot = group.disallows.some((d) => d === '/');
  const allowsRoot = group.allows.some((a) => a === '/');
  return blocksRoot && !allowsRoot;
}

// score = fraction of AI bots that can reach the site. Missing robots.txt means
// nothing is blocked → fully accessible (the desired state).
export function analyzeCrawlerAccess(robotsTxt: string | null): CrawlerAnalysis {
  if (robotsTxt === null || robotsTxt.trim() === '') {
    return { score: 1, blockedBots: [], hadRobotsTxt: false };
  }
  const groups = parseRobots(robotsTxt);
  const blockedBots = AI_BOTS.filter((bot) => isBlocked(groups, bot));
  const score = (AI_BOTS.length - blockedBots.length) / AI_BOTS.length;
  return { score, blockedBots: [...blockedBots], hadRobotsTxt: true };
}
