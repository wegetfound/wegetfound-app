/**
 * Email template builders.
 * Simple HTML generators for Resend emails.
 */

interface ScoreChangeEmailParams {
  businessName: string;
  oldScore: number;
  newScore: number;
  delta: number;
}

export function scoreChangeEmailHTML(params: ScoreChangeEmailParams): string {
  const { businessName, oldScore, newScore, delta } = params;
  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
  const improved = delta > 0;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1d23; margin: 0; padding: 0; background: #f7f8fa;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e6e8eb;">
        <h1 style="font-size: 24px; margin: 0 0 16px; font-weight: 600;">
          ${improved ? '🎉' : '📊'} ${businessName}'s Findability Score ${improved ? 'improved!' : 'updated'}
        </h1>

        <div style="background: #f7f8fa; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">
            Score Update
          </p>
          <p style="margin: 0; font-size: 32px; font-weight: 700;">
            <span style="color: #2563eb;">${oldScore}</span>
            <span style="color: #6b7280; font-size: 24px; margin: 0 8px;">→</span>
            <span style="color: ${improved ? '#1f9d55' : '#d97706'};">${newScore}</span>
          </p>
          <p style="margin: 8px 0 0; font-size: 16px; color: ${improved ? '#1f9d55' : '#d97706'}; font-weight: 600;">
            ${deltaStr} points
          </p>
        </div>

        <p style="margin-bottom: 20px; color: #6b7280; font-size: 15px;">
          Your Findability Score measures how visible your business is across ChatGPT, Perplexity, Claude, Gemini, and Google AI. ${
            improved
              ? 'Your recent improvements are paying off!'
              : "We're tracking how your visibility changes over time."
          }
        </p>

        <a href="https://wegetfound.ai/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">
          See your full report
        </a>

        <hr style="border: none; border-top: 1px solid #e6e8eb; margin: 32px 0;" />

        <p style="font-size: 13px; color: #6b7280; margin: 0; line-height: 1.8;">
          <strong>wegetfound.ai</strong><br />
          Your AI visibility coach
        </p>
      </div>

      <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 16px;">
        You're receiving this email because your organization tracks Findability Scores.
      </p>
    </div>
  </body>
</html>`;
}

export interface WelcomeEmailParams {
  firstName?: string;
}

export function welcomeEmailHTML(params?: WelcomeEmailParams): string {
  const name = params?.firstName || 'there';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1d23; margin: 0; padding: 0; background: #f7f8fa;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e6e8eb;">
        <h1 style="font-size: 24px; margin: 0 0 16px; font-weight: 600;">
          Welcome to wegetfound.ai, ${name}!
        </h1>

        <p style="margin-bottom: 16px; color: #6b7280;">
          You're now tracking how visible your business is to AI. Every day, we check ChatGPT, Perplexity, Claude, Gemini, and Google AI to see if they recommend you to customers.
        </p>

        <p style="margin-bottom: 24px; color: #6b7280;">
          <strong>Next steps:</strong>
        </p>

        <ol style="margin-bottom: 24px; color: #6b7280; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Log in to your dashboard</li>
          <li style="margin-bottom: 8px;">Complete your business profile</li>
          <li style="margin-bottom: 8px;">Run your first audit (we'll show you your Findability Score)</li>
          <li>Fix one thing each day to improve your visibility</li>
        </ol>

        <a href="https://wegetfound.ai/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">
          Go to your dashboard
        </a>

        <hr style="border: none; border-top: 1px solid #e6e8eb; margin: 32px 0;" />

        <p style="font-size: 13px; color: #6b7280; margin: 0;">
          Questions? We're here to help. Reply to this email or visit our help center.
        </p>
      </div>
    </div>
  </body>
</html>`;
}
