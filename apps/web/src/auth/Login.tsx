import { useState } from 'react';
import { supabase, SUPABASE_PROJECT_REF } from '../supabase';

// How long we wait for Supabase before telling the user something is wrong.
// signInWithOtp normally resolves in <2s; if it hangs past this, the network or
// config is broken and the user deserves an actionable message instead of silence.
const REQUEST_TIMEOUT_MS = 15000;

type Phase = 'idle' | 'sending' | 'sent' | 'error';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// Two paths: magic link (production — passwordless, what real users use) and an
// email+password fallback used in development to sign in without the email round-trip.
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const busy = phase === 'sending';

  const sendMagicLink = async () => {
    setPhase('sending');
    setMessage(null);
    console.info(`[login] requesting magic link for ${email} (project: ${SUPABASE_PROJECT_REF})`);

    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        }),
        REQUEST_TIMEOUT_MS,
        'Sign-in request',
      );

      if (error) {
        console.error('[login] signInWithOtp returned error:', error);
        setPhase('error');
        setMessage(error.message || 'Could not send the sign-in link. Please try again.');
        return;
      }

      console.info('[login] magic link request accepted by Supabase');
      setPhase('sent');
      setMessage(`We sent a sign-in link to ${email}. Check your inbox (and spam folder).`);
    } catch (err) {
      console.error('[login] signInWithOtp threw:', err);
      setPhase('error');
      const detail = err instanceof Error ? err.message : 'Unexpected error';
      setMessage(
        `Couldn't reach the sign-in service (${detail}). Check your connection and try again, ` +
          'or use the password option below.',
      );
    }
  };

  const signInWithPassword = async () => {
    setPhase('sending');
    setMessage(null);
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        REQUEST_TIMEOUT_MS,
        'Password sign-in',
      );
      if (error) {
        console.error('[login] signInWithPassword error:', error);
        setPhase('error');
        setMessage(error.message);
        return;
      }
      // On success, AuthProvider's onAuthStateChange swaps the view; nothing more to do.
      setPhase('idle');
    } catch (err) {
      console.error('[login] signInWithPassword threw:', err);
      setPhase('error');
      const detail = err instanceof Error ? err.message : 'Unexpected error';
      setMessage(`Couldn't sign in (${detail}). Please try again.`);
    }
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
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email && !busy) sendMagicLink();
            }}
          />
        </label>

        <button className="btn primary" onClick={sendMagicLink} disabled={busy || !email}>
          {busy ? 'Sending…' : 'Email me a sign-in link'}
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
              disabled={busy}
            />
          </label>
          <button className="btn" onClick={signInWithPassword} disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </details>

        {message && (
          <p
            className={`status ${phase === 'error' ? 'error' : phase === 'sent' ? 'success' : ''}`}
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
