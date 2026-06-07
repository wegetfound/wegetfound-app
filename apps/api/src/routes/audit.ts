// Public free-audit endpoint (§9.1, §10.1). No auth — this is the anonymous
// top-of-funnel: we run a fast on-site audit and return a readiness teaser.
// NO AI engine calls here — those are the paid value. We only analyse what
// the site itself exposes (robots.txt, structured data, on-page signals) so
// the response is cheap, instant, and safe to expose without a paywall.
import type { FastifyInstance } from 'fastify';
import { auditBusiness } from '@wegetfound/audit';
import { db, leads } from '@wegetfound/db';
import { validateUrl, validateOptionalString, validateOptionalEmail } from '../validation.js';
import { auditFreeLimiter, throwRateLimitError } from '../rate-limit.js';

const TEASER_FIX_TYPES = new Set(['crawler_blocked', 'schema_missing', 'missing_faq']);

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { websiteUrl: string; businessName?: string; email?: string } }>(
    '/audit/free',
    async (req, reply) => {
      // Rate limit by IP
      const ip = req.ip || 'unknown';
      const limit = await auditFreeLimiter(ip);
      if (!limit.allowed) {
        throwRateLimitError(limit.retryAfter || 60);
      }

      const { websiteUrl, businessName, email } = req.body ?? {};

      // Validate required URL
      const urlValidation = validateUrl(websiteUrl);
      if (!urlValidation.ok) {
        return reply.code(400).send({ error: urlValidation.error });
      }

      // Validate optional fields
      const nameValidation = await validateOptionalString(businessName, { maxLength: 200, field: 'businessName' });
      if (!nameValidation.ok) {
        return reply.code(400).send({ error: nameValidation.error });
      }

      const emailValidation = await validateOptionalEmail(email);
      if (!emailValidation.ok) {
        return reply.code(400).send({ error: emailValidation.error });
      }

      const result = await auditBusiness({
        name: nameValidation.value ?? 'this business',
        websiteUrl: urlValidation.url,
      });

      // If we couldn't load the site, say so plainly — never show a hollow score
      // (an unreachable site otherwise reads as "crawler 100%, no issues").
      if (!result.fetched) {
        return { reachable: false, websiteUrl: urlValidation.url, businessName: nameValidation.value ?? null };
      }

      const { signals } = result;

      const readinessScore = Math.round(
        (signals.crawlerAccessibility * 0.4 +
          signals.schemaCompleteness * 0.4 +
          signals.reviewHealth * 0.2) *
          100,
      );

      const filteredFindings = result.findings
        .filter((f) => TEASER_FIX_TYPES.has(f.fixType))
        .map(({ fixType, title, detail, estimatedScoreImpact, estimatedMinutes }) => ({
          fixType,
          title,
          detail,
          estimatedScoreImpact,
          estimatedMinutes,
        }));

      let leadCaptured = false;
      if (emailValidation.value) {
        await db.insert(leads).values({
          email: emailValidation.value,
          websiteUrl: urlValidation.url,
          businessName: nameValidation.value ?? null,
          auditSnapshot: {
            signals,
            readinessScore,
            findings: filteredFindings,
          },
        });
        leadCaptured = true;
      }

      return {
        reachable: true,
        websiteUrl: urlValidation.url,
        businessName: nameValidation.value ?? null,
        readinessScore,
        signals: {
          crawlerAccessibility: signals.crawlerAccessibility,
          schemaCompleteness: signals.schemaCompleteness,
          napConsistency: signals.napConsistency,
          reviewHealth: signals.reviewHealth,
        },
        findings: filteredFindings,
        leadCaptured,
      };
    },
  );
}
