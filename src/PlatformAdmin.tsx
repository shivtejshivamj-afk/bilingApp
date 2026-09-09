import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Check, X, Clock, Store, RefreshCw } from 'lucide-react';
import { fetchAllRestaurants, setRestaurantStatus, type RestaurantRecord } from '@/lib/sync';

// Gates this panel client-side, the same trade-off already used for the
// legacy PIN system elsewhere in this app — set VITE_PLATFORM_ADMIN_PASSWORD
// in Vercel's environment variables so it's not baked into the source code.
// Falls back to a default only so the panel isn't completely inaccessible
// if that variable was never set — change it immediately if you're relying
// on the fallback.
const PLATFORM_PASSWORD = import.meta.env.VITE_PLATFORM_ADMIN_PASSWORD || 'changeme';

export default function PlatformAdmin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('rbs_platform_admin_auth') === '1');

  if (!authed) {
    return <PlatformAdminGate onSuccess={() => {
      sessionStorage.setItem('rbs_platform_admin_auth', '1');
      setAuthed(true);
    }} />;
  }
  return <PlatformAdminDashboard />;
}

function PlatformAdminGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === PLATFORM_PASSWORD) {
      onSuccess();
    } else {
      setError(true);
      setPassword('');
      setTimeout(() => setError(false), 600);
    }
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
        <form onSubmit={submit} className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700">
          <label className="block text-sm font-medium text-ink-300 mb-2">Admin Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className={`w-full pl-10 pr-3 py-3.5 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-basil-400 transition ${error ? 'ring-2 ring-paprika-500 animate-[shake_0.4s]' : ''}`}
            />
          </div>
          {error && <p className="text-paprika-300 text-sm mt-2">Incorrect password.</p>}
          <button
            type="submit"
            className="w-full mt-5 py-3.5 rounded-xl bg-basil-500 text-white font-bold hover:bg-basil-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md hover:shadow-lg"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

function PlatformAdminDashboard() {
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const act = async (id: string, status: 'approved' | 'rejected') => {
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
          <button
            onClick={load}
            className="p-2 rounded-lg hover:bg-ink-800 text-ink-300 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
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
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                    r.status === 'approved' ? 'bg-basil-100 text-basil-700' : 'bg-paprika-100 text-paprika-700'
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
            {others.length === 0 && !loading && (
              <div className="p-6 text-center text-ink-400 text-sm">No other restaurants yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
