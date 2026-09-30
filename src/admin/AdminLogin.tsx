import { useState } from 'react';
import { Lock, Mail, Utensils, Eye, EyeOff, ShieldCheck, KeyRound, ArrowLeft, MailCheck } from 'lucide-react';
import type { Settings } from '@/types';
import { signIn, requestPasswordReset, updatePassword } from '@/lib/sync';
import { buildRestaurantUrl, getSlugFromPath } from '@/lib/restaurantContext';

interface Props {
  settings: Settings;
  restaurantId: string;
  /** null if this restaurant was created before real accounts existed and
   * nobody has secured it yet — still reachable with the old PIN in the
   * meantime, with a prompt to set up a real login. */
  ownerId: string | null;
  /** Shown as a banner above the form — used when someone lands here
   * because they were just signed out automatically (e.g. suspended while
   * actively using the dashboard), so it's clear this wasn't a normal
   * logout they chose themselves. */
  notice?: string;
  onSuccess: (userId: string) => void;
}

export default function AdminLogin({ settings, restaurantId, ownerId, notice, onSuccess }: Props) {
  if (ownerId === null) {
    return <UnconfiguredLogin settings={settings} />;
  }
  return <SecureLogin settings={settings} notice={notice} onSuccess={onSuccess} />;
}

// ---------------------------------------------------------------------------
// Normal case: this restaurant already has a real account. Email + password.
// ---------------------------------------------------------------------------

function SecureLogin({
  settings,
  notice,
  onSuccess,
}: {
  settings: Settings;
  notice?: string;
  onSuccess: (userId: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    if ('error' in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    onSuccess(result.userId);
  };

  if (mode === 'reset') {
    return <ResetPasswordRequest restaurantName={settings.restaurantName} initialEmail={email} onBack={() => setMode('login')} />;
  }

  return (
    <AuthShell restaurantName={settings.restaurantName}>
      {notice && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-paprika-900/50 border border-paprika-800 text-paprika-200 text-sm leading-snug">
          {notice}
        </div>
      )}
      <form onSubmit={submit} className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-300 mb-1.5">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              placeholder="you@restaurant.com"
              className="w-full pl-10 pr-3 py-3 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-ink-300">Password</label>
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="text-xs text-paprika-400 hover:text-paprika-300 font-medium"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-12 py-3 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white transition-colors"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <p className="text-paprika-300 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
// Forgot password: send a reset link to the account's email.
// ---------------------------------------------------------------------------

function ResetPasswordRequest({
  restaurantName,
  initialEmail,
  onBack,
}: {
  restaurantName: string;
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const slug = getSlugFromPath() ?? '';
    // Deliberately no #admin here — Supabase appends its own recovery data
    // (#access_token=...&type=recovery) onto this URL when the email link
    // is clicked. If the URL we hand it already has a #admin fragment,
    // that collides with Supabase's own hash and the recovery token can't
    // be parsed correctly, so the reset silently fails. The app already
    // sends the user to #admin on its own once the password is actually
    // set (see SetNewPassword's onDone in App.tsx).
    const redirectTo = buildRestaurantUrl(slug);
    const result = await requestPasswordReset(email, redirectTo);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setSent(true);
    setSubmitting(false);
  };

  return (
    <AuthShell restaurantName={restaurantName}>
      <div className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-ink-400 hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft size={15} /> Back to sign in
        </button>

        {sent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-basil-500/20 flex items-center justify-center mx-auto mb-4">
              <MailCheck size={22} className="text-basil-400" />
            </div>
            <h2 className="font-semibold text-white mb-1.5">Check your email</h2>
            <p className="text-ink-400 text-sm">
              If an account exists for <span className="text-white">{email}</span>, a password reset link is on its way.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="font-semibold text-white mb-1">Reset your password</h2>
              <p className="text-ink-400 text-sm">We'll email you a link to set a new one.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  placeholder="you@restaurant.com"
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
                />
              </div>
            </div>
            {error && <p className="text-paprika-300 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full py-3.5 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
// Safety fallback: restaurants without an owner account cannot use the old
// Master PIN flow anymore. They must be configured with a real Supabase Auth
// owner account before the dashboard can be accessed.
// ---------------------------------------------------------------------------

function UnconfiguredLogin({ settings }: { settings: Settings }) {
  return (
    <AuthShell restaurantName={settings.restaurantName}>
      <div className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700 text-center">
        <div className="w-12 h-12 rounded-full bg-paprika-500/20 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={22} className="text-paprika-300" />
        </div>
        <h2 className="font-semibold text-white mb-1.5">Restaurant login not configured</h2>
        <p className="text-ink-400 text-sm">
          This restaurant does not have a staff account assigned yet. Please contact the platform owner to finish the account setup.
        </p>
      </div>
    </AuthShell>
  );
}

function AuthShell({ restaurantName, children }: { restaurantName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center mb-8 animate-[pop_0.4s_cubic-bezier(0.22,1,0.36,1)]">
          <div className="w-16 h-16 rounded-2xl bg-paprika-500 flex items-center justify-center mb-4 shadow-ticket-lg">
            <Utensils className="text-white" size={30} />
          </div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tight">{restaurantName}</h1>
          <p className="text-ink-400 text-sm mt-1.5 tracking-wide uppercase">Staff Dashboard</p>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shown after clicking the link in a password-reset email — Supabase has
// already established a temporary recovery session by this point; this
// screen just asks for (and sets) the new password.
// ---------------------------------------------------------------------------

export function SetNewPassword({
  restaurantName,
  onDone,
}: {
  restaurantName: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await updatePassword(password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
  };

  return (
    <AuthShell restaurantName={restaurantName}>
      <div className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700">
        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-basil-500/20 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={22} className="text-basil-400" />
            </div>
            <h2 className="font-semibold text-white mb-1.5">Password updated</h2>
            <p className="text-ink-400 text-sm mb-5">You're all set — continue to your dashboard.</p>
            <button
              onClick={onDone}
              className="w-full py-3 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="font-semibold text-white mb-1">Set a new password</h2>
              <p className="text-ink-400 text-sm">Choose something you haven't used before.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-300 mb-1.5">New password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white transition-colors"
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <p className="text-paprika-300 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
