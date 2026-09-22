import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Mail, Check, X, Clock, Store, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { fetchAllRestaurants, setRestaurantStatus, deleteRestaurant, isPlatformAdmin, signIn, signUp, signOut, type RestaurantRecord } from '@/lib/sync';

// Real, database-enforced auth: sign in with a normal Supabase Auth
// account, then the `platform_admins` table (checked both here and, more
// importantly, inside every platform-admin database function) decides
// whether that account can actually do anything. See
// 20260922000000_platform_admin_auth.sql for how to add an admin — there
// is no password stored in this app anymore.

type GateState = 'checking' | 'signed-out' | 'not-admin' | 'admin';

export default function PlatformAdmin() {
  const [state, setState] = useState<GateState>('checking');

  const recheck = async () => {
    const admin = await isPlatformAdmin();
    setState(admin ? 'admin' : 'signed-out');
  };

  useEffect(() => {
    recheck();
  }, []);

  if (state === 'checking') {
    return <div className="min-h-screen bg-ink-900" />;
  }
  if (state === 'admin') {
    return <PlatformAdminDashboard onSignOut={async () => { await signOut(); setState('signed-out'); }} />;
  }
  return (
    <PlatformAdminGate
      notAdmin={state === 'not-admin'}
      onSignedIn={async () => {
        const admin = await isPlatformAdmin();
        setState(admin ? 'admin' : 'not-admin');
      }}
    />
  );
}

function PlatformAdminGate({ notAdmin, onSignedIn }: { notAdmin: boolean; onSignedIn: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    if (mode === 'signup') {
      const result = await signUp(email, password);
      setSubmitting(false);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      // If email confirmation is turned on for this Supabase project, this
      // account has no session yet — it can't sign in until confirmed. If
      // it's turned off, signUp already leaves the user signed in.
      const admin = await isPlatformAdmin();
      if (!admin) {
        setInfo(
          'Account created. Copy this account\'s ID from Supabase → Authentication → Users, then run the ' +
          'platform_admins insert for it (see the migration notes). If your project requires email confirmation, ' +
          'confirm the email first, then come back and sign in.'
        );
        setMode('signin');
        return;
      }
      onSignedIn();
      return;
    }

    const result = await signIn(email, password);
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSignedIn();
  };

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-basil-500 flex items-center justify-center mb-4 shadow-ticket-lg">
            <ShieldCheck className="text-white" size={30} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-white">Platform Admin</h1>
        </div>
        <form onSubmit={submit} className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700 space-y-4">
          {notAdmin && (
            <p className="text-saffron-300 text-sm">
              Signed in, but that account isn't a platform admin yet. Add its ID to the platform_admins table, then
              sign in again.
            </p>
          )}
          {info && <p className="text-basil-300 text-sm">{info}</p>}
          <div>
            <label className="block text-sm font-medium text-ink-300 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-3 py-3.5 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-basil-400 transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-300 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full pl-10 pr-3 py-3.5 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-basil-400 transition ${error ? 'ring-2 ring-paprika-500 animate-[shake_0.4s]' : ''}`}
              />
            </div>
          </div>
          {error && <p className="text-paprika-300 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-basil-500 text-white font-bold hover:bg-basil-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {submitting ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setInfo(null);
            }}
            className="w-full text-center text-sm text-ink-400 hover:text-white transition-colors"
          >
            {mode === 'signin' ? "Don't have an account yet? Create one" : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PlatformAdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RestaurantRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRestaurants(await fetchAllRestaurants());
    } catch (e) {
      console.error('Failed to load restaurants:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, status: 'approved' | 'rejected' | 'suspended') => {
    setBusyId(id);
    try {
      await setRestaurantStatus(id, status);
      setRestaurants((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      console.error('Failed to update restaurant status:', e);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRestaurant(deleteTarget.id);
      setRestaurants((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      console.error('Failed to delete restaurant:', e);
    } finally {
      setDeleting(false);
    }
  };

  const pending = restaurants.filter((r) => r.status === 'pending');
  const others = restaurants.filter((r) => r.status !== 'pending');

  return (
    <div className="min-h-screen bg-parchment-100">
      <header className="bg-ink-900 text-white px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-basil-500 flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <h1 className="font-display font-semibold text-lg">Platform Admin</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={load}
              className="p-2 rounded-lg hover:bg-ink-800 text-ink-300 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onSignOut}
              className="px-3 py-2 rounded-lg hover:bg-ink-800 text-ink-300 hover:text-white transition-colors text-sm font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-bold font-display text-ink-900 mb-4 flex items-center gap-2">
            <Clock size={19} className="text-saffron-500" />
            Pending Approval
            {pending.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-saffron-100 text-saffron-800 text-xs font-bold">{pending.length}</span>
            )}
          </h2>
          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-200 py-10 text-center text-ink-400">
              No restaurants waiting for approval.
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-saffron-200 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 truncate">{r.settings.restaurantName}</p>
                    <p className="text-xs text-ink-500 font-mono truncate">/{r.slug}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => act(r.id, 'rejected')}
                      disabled={busyId === r.id}
                      className="px-3 py-2 rounded-lg bg-paprika-50 text-paprika-600 text-sm font-semibold hover:bg-paprika-100 transition flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <X size={15} /> Reject
                    </button>
                    <button
                      onClick={() => act(r.id, 'approved')}
                      disabled={busyId === r.id}
                      className="px-3 py-2 rounded-lg bg-basil-500 text-white text-sm font-semibold hover:bg-basil-600 transition flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Check size={15} /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold font-display text-ink-900 mb-4 flex items-center gap-2">
            <Store size={19} />
            All Restaurants
          </h2>
          <div className="bg-white rounded-2xl border border-ink-200 divide-y divide-ink-100">
            {others.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900 truncate">{r.settings.restaurantName}</p>
                  <p className="text-xs text-ink-500 font-mono truncate">/{r.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      r.status === 'approved'
                        ? 'bg-basil-100 text-basil-700'
                        : r.status === 'suspended'
                        ? 'bg-ink-200 text-ink-600'
                        : 'bg-paprika-100 text-paprika-700'
                    }`}
                  >
                    {r.status}
                  </span>
                  {r.status === 'rejected' && (
                    <button
                      onClick={() => act(r.id, 'approved')}
                      disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-basil-50 text-basil-700 text-xs font-semibold hover:bg-basil-100 transition flex items-center gap-1 disabled:opacity-40"
                      title="Re-approve this restaurant"
                    >
                      <RotateCcw size={13} /> Re-approve
                    </button>
                  )}
                  {r.status === 'approved' && (
                    <button
                      onClick={() => act(r.id, 'suspended')}
                      disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-ink-100 text-ink-600 text-xs font-semibold hover:bg-ink-200 transition flex items-center gap-1 disabled:opacity-40"
                      title="Suspend this restaurant (e.g. payment not received) — blocks their dashboard and customer ordering without deleting anything"
                    >
                      <Lock size={13} /> Suspend
                    </button>
                  )}
                  {r.status === 'suspended' && (
                    <button
                      onClick={() => act(r.id, 'approved')}
                      disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-basil-50 text-basil-700 text-xs font-semibold hover:bg-basil-100 transition flex items-center gap-1 disabled:opacity-40"
                      title="Reactivate this restaurant"
                    >
                      <RotateCcw size={13} /> Reactivate
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget(r)}
                    className="p-1.5 rounded-lg text-ink-300 hover:text-paprika-600 hover:bg-paprika-50 transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {others.length === 0 && !loading && (
              <div className="p-6 text-center text-ink-400 text-sm">No other restaurants yet.</div>
            )}
          </div>
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-ticket-lg p-6">
            <h3 className="text-lg font-bold font-display text-ink-900 mb-2">
              Delete "{deleteTarget.settings.restaurantName}"?
            </h3>
            <p className="text-sm text-ink-500 mb-2">
              This permanently deletes this restaurant's menu, orders, and the restaurant record itself. This can't be undone.
            </p>
            <p className="text-xs text-ink-400 mb-4">
              Note: their login account itself isn't deleted by this (that requires separate access Supabase doesn't allow safely from this panel) — but with no restaurant left, it won't be usable to access anything here.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-paprika-600 hover:bg-paprika-700 disabled:opacity-40 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
