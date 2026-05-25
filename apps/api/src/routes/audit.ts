// Public free-audit endpoint (§9.1, §10.1). No auth — this is the anonymous
// top-of-funnel: we run a fast on-site audit and return a readiness teaser.
// NO AI engine calls here — those are the paid value. We only analyse what
// the site itself exposes (robots.txt, structured data, on-page signals) so
// the response is cheap, instant, and safe to expose without a paywall.
import type { FastifyInstance } from 'fastify';
import { auditBusiness } from '@wegetfound/audit';
import { db, leads } from '@wegetfound/db';

const TEASER_FIX_TYPES = new Set(['crawler_blocked', 'schema_missing', 'missing_faq']);

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { websiteUrl: string; businessName?: string; email?: string } }>(
    '/audit/free',
    async (req, reply) => {
      const { websiteUrl, businessName, email } = req.body ?? {};

      if (!websiteUrl || websiteUrl.trim() === '') {
        return reply.code(400).send({ error: 'Provide a website to audit.' });
      }

      const result = await auditBusiness({
        name: businessName ?? 'this business',
        websiteUrl,
      });

      // If we couldn't load the site, say so plainly — never show a hollow score
      // (an unreachable site otherwise reads as "crawler 100%, no issues").
      if (!result.fetched) {
        return { reachable: false, websiteUrl, businessName: businessName ?? null };
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
      if (email && email.trim() !== '') {
        await db.insert(leads).values({
          email,
          websiteUrl,
          businessName: businessName ?? null,
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
        websiteUrl,
        businessName: businessName ?? null,
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
