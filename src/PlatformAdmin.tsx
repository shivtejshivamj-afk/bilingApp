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

type CafeExport = {
  exported_at?: string;
  restaurant: { name?: string; slug?: string; status?: string; tax_rate?: number; currency?: string; table_count?: number; created_at?: string; categories?: string[] };
  summary: { menu_items: number; orders: number; sales_records: number; sales_total: number };
  menu_items: Array<{ name?: string; description?: string; category?: string; price?: number; available?: boolean; is_veg?: boolean }>;
  orders: Array<{ table_number?: number; items?: Array<{ name?: string; quantity?: number; price?: number; status?: string }>; subtotal?: number; tax?: number; total?: number; status?: string; customer_note?: string; created_at?: string | number }>;
  sales: Array<{ table_number?: number; items?: Array<{ name?: string; quantity?: number; price?: number }>; subtotal?: number; tax?: number; total?: number; payment_method?: string; paid_at?: number | string }>;
};

function xmlCell(value: unknown, type: 'String' | 'Number' = 'String') {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;');
  return `<Cell><Data ss:Type=\"${type}\">${escaped}</Data></Cell>`;
}

function xmlSheet(name: string, rows: unknown[][]) {
  const safeRows = rows.map((row, index) => `<Row>${row.map((value) => xmlCell(value, index > 0 && typeof value === 'number' ? 'Number' : 'String')).join('')}</Row>`).join('');
  return `<Worksheet ss:Name=\"${name}\"><Table>${safeRows}</Table></Worksheet>`;
}

function dateText(value: unknown) {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(n) && n > 0 ? new Date(n) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function money(value: unknown, currency = 'INR') {
  const n = Number(value ?? 0);
  return `${currency} ${n.toFixed(2)}`;
}

function downloadCafeReport(data: CafeExport) {
  const r = data.restaurant;
  const currency = r.currency || 'INR';
  const allSales = data.sales || [];

  // Cafe Reports opens on "Last 7 days" by default. Use the same local-day
  // boundaries and the same settled-sales source (sales, not live orders).
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rangeStart = today.getTime() - 6 * 86400000;
  const rangeEnd = now + 1;
  const reportSales = allSales.filter((sale) => {
    const paidAt = Number(sale.paid_at || 0);
    return paidAt >= rangeStart && paidAt < rangeEnd;
  });

  const revenue = reportSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const billCount = reportSales.length;
  const averageBill = billCount ? revenue / billCount : 0;
  const itemsSold = reportSales.reduce(
    (sum, sale) => sum + (sale.items || []).reduce((n, item) => n + Number(item.quantity || 0), 0),
    0,
  );

  const overview = [
    ['ScannBite Café Revenue Report'],
    ['Revenue report period', 'Last 7 days (same default period as the café Reports page)'],
    ['Restaurant', r.name || ''],
    ['Restaurant URL slug', r.slug || ''],
    ['Account status', r.status || ''],
    ['Created on', dateText(r.created_at)],
    ['Number of tables', Number(r.table_count || 0)],
    ['Tax rate (%)', Number(r.tax_rate || 0)],
    ['Currency', currency],
    ['Menu items', Number(data.summary?.menu_items || 0)],
    ['Orders recorded (all statuses)', Number(data.summary?.orders || 0)],
    ['Bills in last 7 days', billCount],
    ['Revenue in last 7 days', money(revenue, currency)],
    ['Average bill in last 7 days', money(averageBill, currency)],
    ['Items sold in last 7 days', itemsSold],
    ['All-time recorded bills', allSales.length],
    ['All-time recorded sales', money(allSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0), currency)],
    ['Report generated', dateText(data.exported_at || new Date().toISOString())],
    ['Note', 'Revenue metrics match the café Reports page default: Last 7 days. All historical settled bills are also included in the All Sales Records sheet.'],
  ];

  const menuRows: unknown[][] = [['Item name', 'Category', 'Description', 'Price', 'Availability', 'Food type']];
  (data.menu_items || []).forEach((item) => menuRows.push([
    item.name || '', item.category || '', item.description || '', Number(item.price || 0),
    item.available === false ? 'Unavailable' : 'Available', item.is_veg === false ? 'Non-vegetarian' : 'Vegetarian',
  ]));

  const orderRows: unknown[][] = [['Order date', 'Table', 'Status', 'Items', 'Subtotal', 'Tax', 'Total', 'Customer note']];
  (data.orders || []).forEach((order) => {
    const items = (order.items || []).map((item) => `${item.name || 'Item'} x${Number(item.quantity || 0)} (${money(Number(item.price || 0), currency)} each${item.status ? `, ${item.status}` : ''})`).join('; ');
    orderRows.push([dateText(order.created_at), order.table_number ?? '', order.status || '', items, Number(order.subtotal || 0), Number(order.tax || 0), Number(order.total || 0), order.customer_note || '']);
  });

  // Same calculations as Reports.tsx: revenue by paid date, item revenue and
  // quantity, and payment-method totals. Unknown legacy methods stay unrecorded.
  const paymentTotals: Record<string, { amount: number; count: number }> = {
    cash: { amount: 0, count: 0 },
    upi: { amount: 0, count: 0 },
    card: { amount: 0, count: 0 },
    unspecified: { amount: 0, count: 0 },
  };
  const itemTotals = new Map<string, { revenue: number; quantity: number }>();
  const dayTotals = new Map<number, number>();

  reportSales.forEach((sale) => {
    const method = ['cash', 'upi', 'card'].includes(String(sale.payment_method)) ? String(sale.payment_method) : 'unspecified';
    paymentTotals[method].amount += Number(sale.total || 0);
    paymentTotals[method].count += 1;
    const paidAt = Number(sale.paid_at || 0);
    const day = new Date(paidAt);
    day.setHours(0, 0, 0, 0);
    dayTotals.set(day.getTime(), (dayTotals.get(day.getTime()) || 0) + Number(sale.total || 0));
    (sale.items || []).forEach((item) => {
      const name = item.name || 'Item';
      const current = itemTotals.get(name) || { revenue: 0, quantity: 0 };
      current.revenue += Number(item.price || 0) * Number(item.quantity || 0);
      current.quantity += Number(item.quantity || 0);
      itemTotals.set(name, current);
    });
  });

  const salesRows: unknown[][] = [['Bill date', 'Table', 'Items sold', 'Payment method', 'Subtotal', 'Tax', 'Total']];
  allSales.forEach((sale) => {
    const items = (sale.items || []).map((item) => `${item.name || 'Item'} x${Number(item.quantity || 0)} @ ${money(Number(item.price || 0), currency)}`).join('; ');
    salesRows.push([dateText(sale.paid_at), sale.table_number ?? '', items, sale.payment_method || 'Not recorded', Number(sale.subtotal || 0), Number(sale.tax || 0), Number(sale.total || 0)]);
  });

  const paymentRows: unknown[][] = [['Payment method', 'Revenue in last 7 days', 'Bill count']];
  [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['unspecified', 'Not recorded']].forEach(([key, label]) => {
    const value = paymentTotals[key];
    if (key !== 'unspecified' || value.count > 0) paymentRows.push([label, Number(value.amount.toFixed(2)), value.count]);
  });

  const topItemRows: unknown[][] = [['Item name', 'Revenue in last 7 days', 'Quantity sold']];
  Array.from(itemTotals.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8).forEach(([name, values]) => {
    topItemRows.push([name, Number(values.revenue.toFixed(2)), values.quantity]);
  });

  const dailyRows: unknown[][] = [['Date', 'Revenue']];
  Array.from(dayTotals.entries()).sort((a, b) => a[0] - b[0]).forEach(([day, amount]) => {
    dailyRows.push([new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), Number(amount.toFixed(2))]);
  });

  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${xmlSheet('Overview', overview)}${xmlSheet('Menu', menuRows)}${xmlSheet('Orders', orderRows)}${xmlSheet('Revenue Report 7 Days', [['Metric', 'Value'], ['Revenue', money(revenue, currency)], ['Bills', billCount], ['Average Bill', money(averageBill, currency)], ['Items Sold', itemsSold], ['Period', 'Last 7 days'], ['Payment methods', 'See Payment Methods sheet'], ['Top items', 'See Top Items sheet'], ['Daily trend', 'See Daily Revenue sheet']])}${xmlSheet('Payment Methods', paymentRows)}${xmlSheet('Top Items', topItemRows)}${xmlSheet('Daily Revenue', dailyRows)}${xmlSheet('All Sales Records', salesRows)}</Workbook>`;
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileName = (r.name || 'Cafe').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'Cafe';
  a.href = url;
  a.download = `${fileName}-ScannBite-Report.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

  const exportCafe = async (restaurant: RestaurantRecord) => {
    setExportingId(restaurant.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('platform_export_restaurant_data', { target_id: restaurant.id });
      if (error) throw error;
      if (!data || !data.restaurant) throw new Error('No café report data was returned.');
      downloadCafeReport(data as CafeExport);
    } catch (e: any) {
      setActionError(e?.message || 'Could not download the café report.');
    } finally {
      setExportingId(null);
    }
  };
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
                      onClick={() => exportCafe(r)}
                      disabled={exportingId === r.id}
                      className="px-3 py-2 rounded-lg bg-sky-50 text-sky-700 text-sm font-semibold hover:bg-sky-100 transition flex items-center gap-1.5 disabled:opacity-50"
                      title="Download a readable Excel café report"
                    >
                      {exportingId === r.id ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                      {exportingId === r.id ? 'Preparing…' : 'Download Report'}
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
                    onClick={() => exportCafe(r)}
                    disabled={exportingId === r.id}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold hover:bg-sky-100 transition flex items-center gap-1.5 disabled:opacity-50"
                    title="Download a readable Excel café report"
                  >
                    {exportingId === r.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                    {exportingId === r.id ? 'Preparing…' : 'Download Report'}
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
