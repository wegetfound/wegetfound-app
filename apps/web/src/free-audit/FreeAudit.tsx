import { useState } from 'react';

interface AuditSignals {
  crawlerAccessibility: number;
  schemaCompleteness: number;
  napConsistency: number;
  reviewHealth: number;
}

interface AuditFinding {
  fixType: string;
  title: string;
  detail: string;
  estimatedScoreImpact: number;
  estimatedMinutes: number;
}

interface AuditResult {
  reachable: boolean;
  websiteUrl: string;
  businessName: string | null;
  readinessScore: number;
  signals: AuditSignals;
  findings: AuditFinding[];
  leadCaptured: boolean;
}

function scoreColor(score: number): string {
  if (score >= 67) return '#1f9d55';
  if (score >= 34) return '#d97706';
  return '#dc2626';
}

export function FreeAudit() {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);

  // Email capture state
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [leadCaptured, setLeadCaptured] = useState(false);

  const runAudit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/audit/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl,
          businessName: businessName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }
      const data = (await res.json()) as AuditResult;
      if (!data.reachable) {
        throw new Error("We couldn't load that site — double-check the URL and try again.");
      }
      setResult(data);
      setLeadCaptured(data.leadCaptured);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async () => {
    if (!result) return;
    setEmailError(null);
    setEmailBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/audit/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: result.websiteUrl,
          businessName: result.businessName ?? undefined,
          email,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }
      const data = (await res.json()) as AuditResult;
      if (data.leadCaptured) setLeadCaptured(true);
    } catch (e) {
      setEmailError(String(e));
    } finally {
      setEmailBusy(false);
    }
  };

  const signalLabels: Record<keyof AuditSignals, string> = {
    crawlerAccessibility: 'AI crawler access',
    schemaCompleteness: 'Structured data',
    napConsistency: 'Business info',
    reviewHealth: 'Reviews',
  };

  return (
    <div className="centered">
      <div className="card audit-card">
        <h1 className="brand">wegetfound<span className="dot">.ai</span></h1>
        <p className="muted">See how ready your website is for AI assistants — free, in seconds.</p>

        <label className="field">
          <span>Website URL</span>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourbusiness.com"
            autoComplete="url"
          />
        </label>

        <label className="field">
          <span>Business name (optional)</span>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Co."
          />
        </label>

        <button
          className="btn primary"
          onClick={runAudit}
          disabled={busy || !websiteUrl.trim()}
        >
          {busy ? 'Checking…' : 'Check my site'}
        </button>

        {error && <p className="status error">{error}</p>}

        {result && (
          <div className="audit-result">
            <div className="score-card" style={{ marginTop: '1.5rem' }}>
              <div
                className="score-ring"
                style={{ borderColor: scoreColor(result.readinessScore) }}
              >
                <span className="score-num">{result.readinessScore}</span>
                <span className="score-of">/100</span>
              </div>
              <div>
                <h3>AI Readiness</h3>
                <p className="muted">{result.businessName ?? result.websiteUrl}</p>
              </div>
            </div>

            <div className="audit-signals">
              {(Object.keys(signalLabels) as (keyof AuditSignals)[]).map((key) => (
                <div key={key} className="signal-row">
                  <span className="signal-label">{signalLabels[key]}</span>
                  <span className="signal-pct">{Math.round(result.signals[key] * 100)}%</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <h3>Findings</h3>
              {result.findings.length === 0 ? (
                <p className="muted">Your site covers the basics — great foundation for AI visibility.</p>
              ) : (
                <ul className="fixes" style={{ marginTop: '0.5rem' }}>
                  {result.findings.map((f, i) => (
                    <li key={i} className="card">
                      <strong>{f.title}</strong>
                      <p className="muted" style={{ margin: '0.25rem 0 0' }}>{f.detail}</p>
                      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        +{f.estimatedScoreImpact} pts · ~{f.estimatedMinutes} min
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {leadCaptured ? (
              <p className="status" style={{ marginTop: '1.25rem', color: '#1f9d55' }}>
                Thanks — we'll send your full report and how to start tracking your AI visibility.
              </p>
            ) : (
              <div className="card audit-email-block">
                <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>Get the full report</p>
                <label className="field" style={{ margin: '0 0 0.75rem' }}>
                  <span>Your email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    autoComplete="email"
                  />
                </label>
                <button
                  className="btn primary"
                  onClick={submitEmail}
                  disabled={emailBusy || !email.trim()}
                >
                  {emailBusy ? 'Sending…' : 'Email me the full report'}
                </button>
                {emailError && <p className="status error">{emailError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
