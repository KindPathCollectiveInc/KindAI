import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

export function LoginPage() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password, fullName);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else if (mode === 'signup') {
      setSignedUp(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand px-4">
      <div className="w-full max-w-sm rounded-2xl border border-sand-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-forest-700">KindPath Operations</h1>
        <p className="mt-1 text-sm text-slate">Sign in to continue.</p>

        {signedUp ? (
          <p className="mt-6 rounded-lg bg-sage-50 p-4 text-sm text-forest-700">
            Check your email to confirm your account, then sign in. New accounts start with
            minimal access — an admin needs to grant you the right role.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-forest-700" htmlFor="fullName">
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm focus:border-forest focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-forest-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm focus:border-forest focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-forest-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-sand-200 px-3 py-2 text-sm focus:border-forest focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-terracotta">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white transition hover:bg-forest-600 disabled:opacity-60"
            >
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        )}

        {!signedUp && (
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="mt-4 text-sm text-slate underline underline-offset-2"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        )}
      </div>
    </div>
  );
}
