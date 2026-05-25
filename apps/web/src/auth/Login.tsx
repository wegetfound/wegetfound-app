import { useState } from 'react';
import { supabase } from '../supabase';

// Two paths: magic link (production — passwordless, what real users use) and an
// email+password fallback used in development to sign in without the email round-trip.
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendMagicLink = async () => {
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? error.message : 'Check your email for a sign-in link.');
    setBusy(false);
  };

  const signInWithPassword = async () => {
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setStatus(error.message);
    setBusy(false);
  };

  return (
    <div className="centered">
      <div className="card auth-card">
        <h1 className="brand">wegetfound<span className="dot">.ai</span></h1>
        <p className="muted">See how findable your business is across AI assistants.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            autoComplete="email"
          />
        </label>

        <button className="btn primary" onClick={sendMagicLink} disabled={busy || !email}>
          Email me a sign-in link
        </button>

        <details className="dev-login">
          <summary>Sign in with a password (dev)</summary>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="btn" onClick={signInWithPassword} disabled={busy || !email || !password}>
            Sign in
          </button>
        </details>

        {status && <p className="status">{status}</p>}
      </div>
    </div>
  );
}
