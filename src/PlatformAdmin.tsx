import { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Lock, Check, X, Clock, Store, RefreshCw, RotateCcw, Trash2, Search, Users, CheckCircle2, Ban, ChevronDown, Download } from 'lucide-react';
import {
  fetchAllRestaurants,
  setRestaurantStatus,
  deleteRestaurant,
  signIn,
  signOut,
  type RestaurantRecord,
} from '@/lib/sync';
import { supabase } from '@/lib/supabase';

async function checkPlatformAdmin(): Promise<boolean> {
  await supabase.auth.getSession();
  const { data, error } = await supabase.rpc('is_platform_admin');
  return !error && data === true;
}

export default function PlatformAdmin() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    checkPlatformAdmin().then((ok) => {
      if (!cancelled) {
        setAuthed(ok);
        setChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center">
        <RefreshCw className="animate-spin text-basil-400" size={28} />
      </div>
    );
  }

  if (!authed) {
    return (
      <PlatformAdminGate
        onSuccess={() => setAuthed(true)}
      />
    );
  }

  return <PlatformAdminDashboard onLogout={async () => { await signOut(); setAuthed(false); }} />;
}

function PlatformAdminGate({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn(email.trim(), password);
    if ('error' in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    const allowed = await checkPlatformAdmin();
    if (!allowed) {
      await signOut();
      setError('This account is not authorized as a platform administrator.');
      setSubmitting(false);
      return;
    }

    onSuccess();
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-basil-500 flex items-center justify-center mb-4 shadow-ticket-lg">
            <ShieldCheck className="text-white" size={30} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-white">Platform Admin</h1>
          <p className="text-ink-500 text-xs mt-2 text-center">Use your Supabase administrator account.</p>
        </div>

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
                className="w-full pl-10 pr-3 py-3.5 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-basil-400"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-11 py-3.5 rounded-xl bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-basil-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <p className="text-paprika-300 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="w-full py-3.5 rounded-xl bg-basil-500 text-white font-bold hover:bg-basil-600 disabled:opacity-50 transition"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PlatformAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RestaurantRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'suspended'>('all');

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRestaurants(await fetchAllRestaurants());
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load restaurants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, status: 'approved' | 'rejected' | 'suspended') => {
    setBusyId(id);
    setActionError(null);
    try {
      await setRestaurantStatus(id, status);
      setRestaurants((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e: any) {
      setActionError(e?.message || 'Failed to update restaurant status.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadRestaurantBackup = async (restaurant: RestaurantRecord) => {
    setExportingId(restaurant.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('platform_export_restaurant_data', { target_id: restaurant.id });
      if (error) throw error;
      if (!data) throw new Error('No backup data was returned.');

      const safeName = (restaurant.settings.restaurantName || restaurant.slug || 'cafe')
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cafe';
      const backup = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(backup);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scannbite-${safeName}-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setActionError(e?.message || 'Could not download this café backup. Check the backup migration and permissions.');
    } finally {
      setExportingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteRestaurant(deleteTarget.id);
      setRestaurants((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) {
      setActionError(e?.message || 'Failed to delete restaurant.');
    } finally {
      setDeleting(false);
    }
  };

  const pending = restaurants.filter((r) => r.status === 'pending');
  const approved = restaurants.filter((r) => r.status === 'approved');
  const rejected = restaurants.filter((r) => r.status === 'rejected');
  const suspended = restaurants.filter((r) => r.status === 'suspended');
  const query = search.trim().toLowerCase();
  const matches = (r: RestaurantRecord) => {
    const name = r.settings.restaurantName?.toLowerCase() ?? '';
    const slug = r.slug?.toLowerCase() ?? '';
    const owner = r.ownerId?.toLowerCase() ?? '';
    return (statusFilter === 'all' || r.status === statusFilter) &&
      (!query || name.includes(query) || slug.includes(query) || owner.includes(query));
  };
  const filteredPending = pending.filter(matches);
  const filteredOthers = restaurants.filter((r) => r.status !== 'pending' && matches(r));
  const filteredRestaurants = restaurants.filter(matches);

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
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 rounded-lg hover:bg-ink-800 text-ink-300 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-lg border border-ink-700 text-sm text-ink-300 hover:text-white hover:bg-ink-800 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {(loadError || actionError) && (
          <div className="bg-paprika-50 border border-paprika-200 text-paprika-700 rounded-xl p-3 text-sm">
            {loadError || actionError}
          </div>
        )}

        <section className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-ink-200 p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink-500">Total</span><Users size={17} className="text-ink-400" /></div><p className="text-2xl font-bold text-ink-900 mt-2">{restaurants.length}</p></div>
            <div className="bg-white rounded-2xl border border-saffron-200 p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-saffron-700">Pending</span><Clock size={17} className="text-saffron-500" /></div><p className="text-2xl font-bold text-ink-900 mt-2">{pending.length}</p></div>
            <div className="bg-white rounded-2xl border border-basil-200 p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-basil-700">Approved</span><CheckCircle2 size={17} className="text-basil-500" /></div><p className="text-2xl font-bold text-ink-900 mt-2">{approved.length}</p></div>
            <div className="bg-white rounded-2xl border border-ink-200 p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink-500">Suspended</span><Ban size={17} className="text-ink-400" /></div><p className="text-2xl font-bold text-ink-900 mt-2">{suspended.length}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-ink-200 p-3 sm:p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search restaurant name, URL, or owner ID…" className="w-full pl-10 pr-4 py-3 rounded-xl bg-ink-50 border border-ink-200 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-basil-400" /></div>
              <div className="relative lg:w-48"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="w-full appearance-none px-3.5 py-3 pr-9 rounded-xl bg-ink-50 border border-ink-200 text-ink-700 focus:outline-none focus:ring-2 focus:ring-basil-400"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} /></div>
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-ink-500"><span>Showing {filteredRestaurants.length} of {restaurants.length} restaurants</span>{(search || statusFilter !== 'all') && <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="font-semibold text-basil-700 hover:text-basil-800">Clear filters</button>}</div>
          </div>
        </section>

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
              {filteredPending.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-saffron-200 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 truncate">{r.settings.restaurantName}</p>
                    <p className="text-xs text-ink-500 font-mono truncate">/{r.slug}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => downloadRestaurantBackup(r)}
                      disabled={exportingId === r.id}
                      className="px-3 py-2 rounded-lg bg-ink-100 text-ink-700 text-sm font-semibold hover:bg-ink-200 transition flex items-center gap-1.5 disabled:opacity-40"
                      title="Download this café's backup report"
                    >
                      <Download size={15} /> {exportingId === r.id ? 'Preparing…' : 'Backup'}
                    </button>
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
            {filteredOthers.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink-900 truncate">{r.settings.restaurantName}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">{r.settings.currency || 'INR'}</span>
                  </div>
                  <p className="text-xs text-ink-500 truncate mt-1">/{r.slug} · {r.settings.tableCount ?? 0} tables · {r.settings.taxRate ?? 0}% tax</p>
                  <p className="text-[11px] text-ink-400 font-mono truncate mt-1">ID: {r.id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => downloadRestaurantBackup(r)}
                    disabled={exportingId === r.id}
                    className="px-2.5 py-1.5 rounded-lg bg-basil-50 text-basil-700 text-xs font-semibold hover:bg-basil-100 transition flex items-center gap-1 disabled:opacity-40"
                    title="Download this café's backup report"
                  >
                    <Download size={13} /> {exportingId === r.id ? 'Preparing…' : 'Backup'}
                  </button>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    r.status === 'approved'
                      ? 'bg-basil-100 text-basil-700'
                      : r.status === 'suspended'
                      ? 'bg-ink-200 text-ink-600'
                      : 'bg-paprika-100 text-paprika-700'
                  }`}>
                    {r.status}
                  </span>
                  {r.status === 'rejected' && (
                    <button onClick={() => act(r.id, 'approved')} disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-basil-50 text-basil-700 text-xs font-semibold hover:bg-basil-100 transition flex items-center gap-1 disabled:opacity-40">
                      <RotateCcw size={13} /> Re-approve
                    </button>
                  )}
                  {r.status === 'approved' && (
                    <button onClick={() => act(r.id, 'suspended')} disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-ink-100 text-ink-600 text-xs font-semibold hover:bg-ink-200 transition flex items-center gap-1 disabled:opacity-40">
                      <Lock size={13} /> Suspend
                    </button>
                  )}
                  {r.status === 'suspended' && (
                    <button onClick={() => act(r.id, 'approved')} disabled={busyId === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-basil-50 text-basil-700 text-xs font-semibold hover:bg-basil-100 transition flex items-center gap-1 disabled:opacity-40">
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
            {filteredOthers.length === 0 && !loading && (
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
            <p className="text-sm text-ink-500 mb-4">
              This permanently deletes this restaurant's menu, orders, sales, and the restaurant record. This can't be undone.
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
