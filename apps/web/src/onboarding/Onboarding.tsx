import { useState } from 'react';
import { api } from '../api';
import type { Business } from '../api';

interface Props {
  onCreated: (b: Business) => void;
}

export function Onboarding({ onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToForm = () => setStep(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your business name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const business = await api.createBusiness({
        name: name.trim(),
        websiteUrl: websiteUrl.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        category: category.trim() || undefined,
      });
      onCreated(business);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  if (step === 0) {
    return (
      <div className="centered">
        <div className="card onboarding-card">
          <p className="step-label muted">Step 1 of 3</p>
          <h2>Welcome to your visibility coach</h2>
          <p className="muted">
            We track how often your business shows up when people ask ChatGPT, Perplexity,
            Claude, Gemini, and Google AI Overviews — and we tell you exactly what to fix first.
          </p>
          <div className="onboarding-actions">
            <button className="btn primary" onClick={() => setStep(1)}>Next</button>
            <button className="btn ghost" onClick={goToForm}>Skip intro</button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="centered">
        <div className="card onboarding-card">
          <p className="step-label muted">Step 2 of 3</p>
          <h2>Here&rsquo;s how it works</h2>
          <p className="muted">
            We check if ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews
            recommend your business when someone nearby asks a question you should answer.
          </p>
          <p className="muted">
            Your Findability Score shows how often you come up. Then we hand you
            one fix at a time — the thing most likely to move that number.
          </p>
          <div className="onboarding-actions">
            <button className="btn primary" onClick={() => setStep(2)}>Next</button>
            <button className="btn ghost" onClick={goToForm}>Skip intro</button>
          </div>
        </div>
      </div>
    );
  }

  // step === 2: the form
  return (
    <div className="centered">
      <div className="card onboarding-card">
        <p className="step-label muted">Step 3 of 3</p>
        <h2>Tell us about your business</h2>
        <p className="muted">We&rsquo;ll use this to run your first check.</p>
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Business name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Harbor Coffee Co."
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Website URL</span>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourbusiness.com"
            />
          </label>
          <label className="field">
            <span>City</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Austin"
            />
          </label>
          <label className="field">
            <span>Country</span>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United States"
            />
          </label>
          <label className="field">
            <span>Category</span>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Coffee shop, Plumber, Dentist…"
            />
          </label>
          {error && <p className="status error">{error}</p>}
          <div className="onboarding-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Setting up…' : 'Get my Findability Score'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
