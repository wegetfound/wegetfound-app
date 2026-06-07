import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Business, Fix, MeResponse, Score } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Onboarding } from '../onboarding/Onboarding';
import { PromptTester } from './PromptTester';

function scoreColor(score: number): string {
  if (score >= 67) return '#1f9d55';
  if (score >= 34) return '#d97706';
  return '#dc2626';
}

// ---------- Per-engine breakdown ----------
const ENGINES: { key: keyof Score; label: string }[] = [
  { key: 'chatgptScore', label: 'ChatGPT' },
  { key: 'perplexityScore', label: 'Perplexity' },
  { key: 'claudeScore', label: 'Claude' },
  { key: 'geminiScore', label: 'Gemini' },
  { key: 'googleAioScore', label: 'Google AI Overviews' },
];

function EngineBreakdown({ score }: { score: Score }) {
  const rows = ENGINES.filter((e) => score[e.key] != null);
  if (rows.length === 0) return null;
  return (
    <div className="engine-breakdown">
      {rows.map(({ key, label }) => {
        const val = score[key] as number;
        return (
          <div key={key} className="engine-row">
            <span className="engine-name muted">{label}</span>
            <div className="engine-bar">
              <div
                className="engine-fill"
                style={{ width: `${val}%`, background: scoreColor(val) }}
              />
            </div>
            <span className="engine-val">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Score history chart ----------
const CHART_H = 80;
const CHART_PAD = 8;

function HistoryChart({ history }: { history: Score[] }) {
  // API returns newest-first; chart wants oldest-first
  const points = [...history].reverse();

  if (points.length < 2) {
    return (
      <section className="card history-card">
        <h3>Your Findability Score over time</h3>
        <p className="muted">Run a few audits to see your trend.</p>
      </section>
    );
  }

  const n = points.length;
  // Build polyline coords in a 0..1000 × CHART_H viewBox
  const xStep = 1000 / (n - 1);
  const coords = points
    .map((p, i) => {
      const x = i * xStep;
      const y = CHART_PAD + (1 - p.overallScore / 100) * (CHART_H - CHART_PAD * 2);
      return `${x},${y}`;
    })
    .join(' ');

  // n >= 2 is guaranteed by the early-return above
  const lastScore = points[n - 1]!.overallScore;
  const firstScore = points[0]!.overallScore;
  const delta = lastScore - firstScore;
  const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;

  return (
    <section className="card history-card">
      <div className="history-header">
        <h3>Your Findability Score over time</h3>
        <span className="history-delta" style={{ color: scoreColor(lastScore) }}>
          {deltaLabel} pts
        </span>
      </div>
      <svg
        className="history-svg"
        viewBox={`0 0 1000 ${CHART_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={coords}
          fill="none"
          stroke={scoreColor(lastScore)}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={i * xStep}
            cy={CHART_PAD + (1 - p.overallScore / 100) * (CHART_H - CHART_PAD * 2)}
            r="6"
            fill={scoreColor(p.overallScore)}
          />
        ))}
      </svg>
    </section>
  );
}

// ---------- Dashboard ----------
export function Dashboard() {
  const { session, signOut } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [history, setHistory] = useState<Score[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    api
      .listBusinesses()
      .then((bs) => {
        setBusinesses(bs);
        setSelectedId((cur) => cur ?? bs[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    api.getMe().then(setMe).catch(() => {/* swallow — non-critical */});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setError(null);
    Promise.all([
      api.getScore(selectedId),
      api.getFixes(selectedId),
      api.getScoreHistory(selectedId),
    ])
      .then(([s, f, h]) => {
        setScore(s);
        setFixes(f);
        setHistory(h);
      })
      .catch((e) => setError(String(e)));
  }, [selectedId]);

  const refreshFixes = () => {
    if (selectedId) api.getFixes(selectedId).then(setFixes).catch((e) => setError(String(e)));
  };

  const act = async (fixId: string, action: 'complete' | 'skip') => {
    await (action === 'complete' ? api.completeFix(fixId) : api.skipFix(fixId));
    refreshFixes();
  };

  const runAudit = async () => {
    if (!selectedId) return;
    setAuditing(true);
    setError(null);
    try {
      await api.triggerAudit(selectedId);
      const [s, f, h] = await Promise.all([
        api.getScore(selectedId),
        api.getFixes(selectedId),
        api.getScoreHistory(selectedId),
      ]);
      setScore(s);
      setFixes(f);
      setHistory(h);
    } catch (e) {
      const errStr = String(e);
      // Check for 429 (daily cap exceeded)
      if (errStr.includes('429') || errStr.includes('Daily audit limit')) {
        setShowUpgradeModal(true);
        setError(null);
      } else {
        setError(errStr);
      }
    } finally {
      setAuditing(false);
    }
  };

  const handleUpgradeClick = async (plan: 'starter' | 'growth' | 'agency') => {
    setUpgrading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/stripe/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error('Failed to create checkout session');
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch (err) {
      setError(String(err));
      setUpgrading(false);
    }
  };

  const handleBusinessCreated = async (b: Business) => {
    setBusinesses((prev) => [...prev, b]);
    setSelectedId(b.id);
    // Auto-run the first audit so the user gets an immediate score after onboarding.
    setAuditing(true);
    setError(null);
    try {
      await api.triggerAudit(b.id);
      const [s, f, h] = await Promise.all([
        api.getScore(b.id),
        api.getFixes(b.id),
        api.getScoreHistory(b.id),
      ]);
      setScore(s);
      setFixes(f);
      setHistory(h);
    } catch (e) {
      // Non-fatal — user can always click "Re-run audit" manually.
      setError(String(e));
    } finally {
      setAuditing(false);
    }
  };

  const selected = businesses.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand small">wegetfound<span className="dot">.ai</span></span>
        {me && (
          <span className="org-chip muted">
            {me.organization.name} · {me.organization.plan}
          </span>
        )}
        <span className="muted">{session?.user.email}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>

      {loading && <p className="muted pad">Loading…</p>}
      {error && <p className="status error pad">{error}</p>}

      {!loading && businesses.length === 0 && !error && (
        <Onboarding onCreated={handleBusinessCreated} />
      )}

      {!loading && businesses.length > 0 && (
        <div className="layout">
          <nav className="sidebar">
            {businesses.map((b) => (
              <button
                key={b.id}
                className={`biz ${b.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(b.id)}
              >
                <strong>{b.name}</strong>
                <span className="muted">{b.category}</span>
              </button>
            ))}
          </nav>

          <main className="content">
            {selected && (
              <>
                <div className="biz-head">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="muted">{selected.websiteUrl}</p>
                  </div>
                  <button className="btn primary" onClick={runAudit} disabled={auditing}>
                    {auditing ? 'Checking…' : 'Re-run audit'}
                  </button>
                </div>

                <section className="card score-card">
                  <div className="score-ring" style={{ borderColor: scoreColor(score?.overallScore ?? 0) }}>
                    <span className="score-num">{score?.overallScore ?? '—'}</span>
                    <span className="score-of">/100</span>
                  </div>
                  <div className="score-meta">
                    <h3>Your Findability Score</h3>
                    {score ? (
                      <>
                        <p className="muted">
                          Surfaced in {score.promptsWinning} of {score.promptsTested} AI answers tested.
                        </p>
                        {score.signals.breakdown && (
                          <p className="muted">Signal multiplier ×{score.signals.breakdown.multiplier}</p>
                        )}
                      </>
                    ) : (
                      <p className="muted">No score yet — run an audit.</p>
                    )}
                  </div>
                </section>

                {score && <EngineBreakdown score={score} />}

                <HistoryChart history={history} />

                <section>
                  <h3>What to fix next <span className="muted">({fixes.length})</span></h3>
                  {fixes.length === 0 ? (
                    <p className="muted">Nothing in the queue right now.</p>
                  ) : (
                    <ul className="fixes">
                      {fixes.map((f) => (
                        <li key={f.id} className="card fix">
                          <div className="fix-head">
                            <span className="prio">+{f.estimatedScoreImpact}</span>
                            <strong>{f.title}</strong>
                          </div>
                          <p className="muted">{f.description}</p>
                          <div className="fix-actions">
                            <span className="muted">~{f.estimatedMinutes} min</span>
                            <span className="spacer" />
                            <button className="btn small" onClick={() => act(f.id, 'skip')}>Skip</button>
                            <button className="btn small primary" onClick={() => act(f.id, 'complete')}>Done</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <PromptTester businessId={selected.id} />
              </>
            )}
          </main>
        </div>
      )}

      {showUpgradeModal && (
        <div className="modal-backdrop">
          <div className="card modal">
            <h2>Daily limit reached</h2>
            <p className="muted">Upgrade to keep tracking your AI visibility.</p>
            <div className="plan-options">
              <button
                className="btn plan-btn"
                onClick={() => handleUpgradeClick('starter')}
                disabled={upgrading}
              >
                <strong>Starter</strong>
                <span className="muted">$19/mo • 10 audits/day</span>
              </button>
              <button
                className="btn plan-btn"
                onClick={() => handleUpgradeClick('growth')}
                disabled={upgrading}
              >
                <strong>Growth</strong>
                <span className="muted">$49/mo • 30 audits/day</span>
              </button>
              <button
                className="btn plan-btn"
                onClick={() => handleUpgradeClick('agency')}
                disabled={upgrading}
              >
                <strong>Agency</strong>
                <span className="muted">$149/mo • Unlimited</span>
              </button>
            </div>
            <button className="btn ghost" onClick={() => setShowUpgradeModal(false)} disabled={upgrading}>
              {upgrading ? 'Redirecting...' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
