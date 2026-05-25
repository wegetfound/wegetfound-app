import { useEffect, useState } from 'react';
import { api } from '../api';
import type { EngineTestResult, TrackedPrompt } from '../api';

// ---------- Badge ----------
function StatusBadge({ status }: { status: EngineTestResult['status'] }) {
  if (status === 'mentioned') {
    return <span className="engine-badge is-mentioned">Recommends you</span>;
  }
  if (status === 'absent') {
    return <span className="engine-badge is-absent">Didn't mention you</span>;
  }
  return <span className="engine-badge is-unavailable">Couldn't reach</span>;
}

// ---------- Single engine result row ----------
function EngineResult({ result, addedPrompt }: { result: EngineTestResult; addedPrompt: string | null }) {
  return (
    <div className="engine-result">
      <div className="engine-result-head">
        <span className="engine-result-name">{result.engineName}</span>
        <StatusBadge status={result.status} />
      </div>
      {result.status === 'unavailable' && !result.answerExcerpt && (
        <p className="muted answer-excerpt">This engine isn't connected yet — contact us to enable it.</p>
      )}
      {result.answerExcerpt && (
        <p className="muted answer-excerpt">{result.answerExcerpt}</p>
      )}
      {result.citations.length > 0 && (
        <div className="citation-list">
          {result.citations.map((c, i) => (
            <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="citation-link muted">
              {c.title ?? c.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Main component ----------
export function PromptTester({ businessId }: { businessId: string }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<EngineTestResult[] | null>(null);
  const [testedPrompt, setTestedPrompt] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addedPrompts, setAddedPrompts] = useState<Set<string>>(new Set());

  const [trackedPrompts, setTrackedPrompts] = useState<TrackedPrompt[]>([]);
  const [trackedLoading, setTrackedLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Load tracked prompts on mount or when businessId changes
  useEffect(() => {
    setTrackedLoading(true);
    api
      .listTrackedPrompts(businessId)
      .then(setTrackedPrompts)
      .catch((e) => setError(String(e)))
      .finally(() => setTrackedLoading(false));
  }, [businessId]);

  const refreshTracked = () => {
    api
      .listTrackedPrompts(businessId)
      .then(setTrackedPrompts)
      .catch((e) => setError(String(e)));
  };

  const runTest = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setTestedPrompt(null);
    try {
      const res = await api.testPrompt(businessId, prompt.trim());
      setResults(res.results);
      setTestedPrompt(res.prompt);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!testedPrompt || adding) return;
    setAdding(true);
    setError(null);
    try {
      await api.addTrackedPrompt(businessId, testedPrompt);
      setAddedPrompts((prev) => new Set(prev).add(testedPrompt));
      refreshTracked();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (promptId: string) => {
    if (removingId) return;
    setRemovingId(promptId);
    setError(null);
    try {
      await api.deleteTrackedPrompt(promptId);
      refreshTracked();
    } catch (e) {
      setError(String(e));
    } finally {
      setRemovingId(null);
    }
  };

  const isAdded = testedPrompt != null && addedPrompts.has(testedPrompt);

  return (
    <section className="card prompt-tester">
      <h3>Test what AI says about you</h3>
      <p className="muted">
        Type a question a customer might ask, and we'll check ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews.
      </p>

      <div className="prompt-input-row">
        <input
          className="prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="best off-grid land consultant in northern Thailand"
          disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') void runTest(); }}
        />
        <button
          className="btn primary"
          onClick={() => void runTest()}
          disabled={busy || !prompt.trim()}
        >
          {busy ? 'Checking the AI engines…' : 'Test across AI'}
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      {results && testedPrompt && (
        <div className="prompt-results">
          <div className="prompt-results-header">
            <p className="muted tested-prompt-label">Results for: <em>{testedPrompt}</em></p>
            <button
              className="btn small"
              onClick={() => void handleAdd()}
              disabled={adding || isAdded}
            >
              {isAdded ? 'Added to tracked' : adding ? 'Adding…' : 'Add to tracked prompts'}
            </button>
          </div>
          <div className="engine-results-list">
            {results.map((r) => (
              <EngineResult key={r.engineId} result={r} addedPrompt={testedPrompt} />
            ))}
          </div>
        </div>
      )}

      <div className="tracked-list">
        <h4>Tracked prompts</h4>
        {trackedLoading ? (
          <p className="muted">Loading…</p>
        ) : trackedPrompts.length === 0 ? (
          <p className="muted">No tracked prompts yet — test one above and add it.</p>
        ) : (
          <ul className="tracked-items">
            {trackedPrompts.map((tp) => (
              <li key={tp.id} className="tracked-item">
                <span className="tracked-text">{tp.promptText}</span>
                <button
                  className="btn small ghost"
                  onClick={() => void handleRemove(tp.id)}
                  disabled={removingId === tp.id}
                >
                  {removingId === tp.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
