import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Business, Fix, Score } from '../api';
import { useAuth } from '../auth/AuthProvider';

function scoreColor(score: number): string {
  if (score >= 67) return '#1f9d55';
  if (score >= 34) return '#d97706';
  return '#dc2626';
}

export function Dashboard() {
  const { session, signOut } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  useEffect(() => {
    api
      .listBusinesses()
      .then((bs) => {
        setBusinesses(bs);
        setSelectedId((cur) => cur ?? bs[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setError(null);
    Promise.all([api.getScore(selectedId), api.getFixes(selectedId)])
      .then(([s, f]) => {
        setScore(s);
        setFixes(f);
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
      const [s, f] = await Promise.all([api.getScore(selectedId), api.getFixes(selectedId)]);
      setScore(s);
      setFixes(f);
    } catch (e) {
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
        <span className="muted">{session?.user.email}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>

      {loading && <p className="muted pad">Loading…</p>}
      {error && <p className="status error pad">{error}</p>}

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
                    <h3>Findability Score</h3>
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
              </>
            )}
          </main>
        </div>
      )}

      {!loading && businesses.length === 0 && !error && (
        <p className="muted pad">No businesses yet.</p>
      )}
    </div>
  );
}
