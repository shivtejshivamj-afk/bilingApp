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

function money(value: unknown, currency = '₹') {
  const n = Number(value ?? 0);
  return `${currency}${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function dateText(value: unknown) {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(n) && n > 0 ? new Date(n) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTimeText(value: unknown) {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(n) && n > 0 ? new Date(n) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function esc(s: unknown) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };
const PAYMENT_COLORS: Record<string, string> = { cash: '#5a8a3a', upi: '#d98a3d', card: '#2b2622', unspecified: '#c9c2b4' };

// Fetches the app's own logo and turns it into a data: URL, so the printed
// report carries the ScannBite mark without the HTML depending on the
// iframe being able to resolve a relative/site-root path (it can't — the
// iframe document is written in-memory, not navigated to a real URL). If
// the fetch fails for any reason, the report still renders fine without it.
async function getLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo192.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Builds the printable café backup report as a single self-contained HTML
// page. This is handed to the browser's own print dialog (printCafeReport,
// below) rather than built with a PDF library — "Save as PDF" in that
// dialog produces the actual PDF file, with zero extra dependencies.
function buildCafeReportHtml(data: CafeExport, logoDataUrl: string | null) {
  const r = data.restaurant;
  const currency = r.currency || '₹';
  const sales = data.sales || [];
  const revenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const billCount = sales.length;
  const avgBill = billCount ? revenue / billCount : 0;
  const itemsSold = sales.reduce((sum, s) => sum + (s.items || []).reduce((n, i) => n + Number(i.quantity || 0), 0), 0);

  const paymentTotals: Record<string, number> = { cash: 0, upi: 0, card: 0, unspecified: 0 };
  const paymentCounts: Record<string, number> = { cash: 0, upi: 0, card: 0, unspecified: 0 };
  sales.forEach((s) => {
    const bucket = s.payment_method && PAYMENT_LABELS[s.payment_method] ? s.payment_method : 'unspecified';
    paymentTotals[bucket] += Number(s.total || 0);
    paymentCounts[bucket] += 1;
  });

  const menuByCategory: Record<string, CafeExport['menu_items']> = {};
  (data.menu_items || []).forEach((item) => {
    const cat = item.category || 'Other';
    (menuByCategory[cat] = menuByCategory[cat] || []).push(item);
  });

  const sortedSales = [...sales].sort((a, b) => Number(b.paid_at || 0) - Number(a.paid_at || 0));

  const menuHtml = Object.entries(menuByCategory).map(([cat, items]) => `
    <div class="menu-cat">
      <h3>${esc(cat)}</h3>
      <table class="menu-table">
        <thead><tr><th>Item</th><th>Description</th><th class="num">Price</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td class="item-name">${esc(item.name)}</td>
              <td class="muted">${esc(item.description || '')}</td>
              <td class="num">${money(item.price, currency)}</td>
              <td><span class="tag ${item.is_veg === false ? 'tag-nonveg' : 'tag-veg'}">${item.is_veg === false ? 'Non-veg' : 'Veg'}</span></td>
              <td><span class="tag ${item.available === false ? 'tag-off' : 'tag-on'}">${item.available === false ? 'Unavailable' : 'Available'}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');

  const salesHtml = sortedSales.map((s) => {
    const items = (s.items || []).map((i) => `${esc(i.name)} ×${Number(i.quantity || 0)}`).join(', ');
    const method = s.payment_method && PAYMENT_LABELS[s.payment_method] ? PAYMENT_LABELS[s.payment_method] : 'Not recorded';
    return `
      <tr>
        <td class="muted">${dateTimeText(s.paid_at)}</td>
        <td>${esc(s.table_number ?? '')}</td>
        <td class="muted">${items}</td>
        <td><span class="pay-chip pay-${s.payment_method || 'unspecified'}">${method}</span></td>
        <td class="num strong">${money(s.total, currency)}</td>
      </tr>`;
  }).join('');

  const paymentTilesHtml = Object.keys(paymentTotals)
    .filter((k) => k !== 'unspecified' || paymentCounts.unspecified > 0)
    .map((k) => {
      const pct = revenue > 0 ? Math.round((paymentTotals[k] / revenue) * 100) : 0;
      const label = k === 'unspecified' ? 'Not recorded' : PAYMENT_LABELS[k];
      return `
        <div class="pay-tile">
          <div class="pay-dot" style="background:${PAYMENT_COLORS[k]}"></div>
          <div class="pay-tile-main">
            <div class="pay-tile-label">${label}</div>
            <div class="pay-tile-amount">${money(paymentTotals[k], currency)}</div>
            <div class="pay-tile-sub">${pct}% · ${paymentCounts[k]} ${paymentCounts[k] === 1 ? 'bill' : 'bills'}</div>
          </div>
        </div>`;
    }).join('');

  const barSegments = Object.keys(paymentTotals)
    .filter((k) => paymentTotals[k] > 0)
    .map((k) => `<div style="flex:${paymentTotals[k]};background:${PAYMENT_COLORS[k]}"></div>`)
    .join('');

  const logoImg = logoDataUrl ? `<img src="${logoDataUrl}" />` : '';

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(r.name)} — ScannBite backup report</title>
<style>
  @page { margin: 32px 40px 46px; size: A4; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #2b2622;
    background: #ffffff;
    font-size: 10.5px;
    line-height: 1.5;
  }

  /* Header */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 18px; border-bottom: 3px solid #1C1917; margin-bottom: 22px;
  }
  .brand { display:flex; align-items:center; gap:12px; }
  .brand img { width:40px; height:40px; }
  .brand-name { font-size: 15px; font-weight:700; color:#1C1917; letter-spacing:0.2px; }
  .brand-sub { font-size: 9px; color:#8a8378; text-transform:uppercase; letter-spacing:0.6px; margin-top:1px; }
  .header-right { text-align:right; }
  .alltime-badge {
    display:inline-block; background:#1C1917; color:#F5EFE6;
    font-size:9px; font-weight:700; letter-spacing:0.4px;
    padding:4px 10px; border-radius:100px; text-transform:uppercase;
  }
  .header-right .gendate { font-size:9px; color:#8a8378; margin-top:5px; }

  /* Title block */
  .title-row { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom: 20px; }
  .restaurant-name { font-size: 26px; font-weight: 700; color:#1C1917; }
  .restaurant-meta { font-size:10px; color:#6b655b; margin-top:4px; }
  .status-chip {
    display:inline-block; padding:4px 11px; border-radius:100px; font-size:9px; font-weight:700;
    text-transform:uppercase; letter-spacing:0.3px;
    background:#e8f0e2; color:#4a7230;
  }

  .note-box {
    background:#f7f4ee; border:1px solid #e8e2d4; border-left:3px solid #c4531f;
    border-radius:6px; padding:10px 14px; font-size:9.5px; color:#5c564c; margin-bottom:22px;
  }
  .note-box b { color:#2b2622; }

  /* Stat grid */
  .stat-grid { display:flex; gap:10px; margin-bottom: 24px; }
  .stat-card {
    flex:1; border:1px solid #e8e2d4; border-radius:10px; padding:12px 14px;
  }
  .stat-label { font-size:8.5px; color:#8a8378; text-transform:uppercase; letter-spacing:0.4px; font-weight:700; }
  .stat-value { font-size:18px; font-weight:700; color:#1C1917; margin-top:4px; }

  /* Section heading */
  .section-title {
    font-size:13px; font-weight:700; color:#1C1917; margin: 26px 0 12px;
    padding-bottom:6px; border-bottom: 1.5px solid #e8e2d4;
  }

  /* Payment methods */
  .pay-bar { display:flex; height:9px; border-radius:5px; overflow:hidden; background:#efeae0; margin-bottom:12px; }
  .pay-tiles { display:flex; gap:10px; }
  .pay-tile { flex:1; display:flex; align-items:flex-start; gap:8px; border:1px solid #e8e2d4; border-radius:8px; padding:10px 12px; }
  .pay-dot { width:9px; height:9px; border-radius:50%; margin-top:3px; flex-shrink:0; }
  .pay-tile-label { font-size:9px; color:#6b655b; font-weight:600; }
  .pay-tile-amount { font-size:14px; font-weight:700; color:#1C1917; margin-top:1px; }
  .pay-tile-sub { font-size:8.5px; color:#9c9284; margin-top:1px; }

  /* Menu */
  .menu-cat { margin-bottom: 14px; break-inside: avoid; }
  .menu-cat h3 { font-size:11px; font-weight:700; color:#c4531f; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.3px; }
  table { width:100%; border-collapse: collapse; }
  .menu-table th {
    text-align:left; font-size:8.5px; color:#8a8378; text-transform:uppercase; letter-spacing:0.3px;
    padding:5px 8px; border-bottom:1.5px solid #e8e2d4; font-weight:700;
  }
  .menu-table td { padding:6px 8px; border-bottom:1px solid #f0ece2; font-size:9.5px; }
  .item-name { font-weight:600; color:#1C1917; }
  .muted { color:#6b655b; }
  .num { text-align:right; font-variant-numeric: tabular-nums; }
  .strong { font-weight:700; color:#1C1917; }
  .tag { display:inline-block; padding:2px 7px; border-radius:100px; font-size:8px; font-weight:700; }
  .tag-veg { background:#e8f0e2; color:#4a7230; }
  .tag-nonveg { background:#fbe7de; color:#a8441f; }
  .tag-on { background:#e8f0e2; color:#4a7230; }
  .tag-off { background:#efeae0; color:#8a8378; }

  /* Sales table */
  .sales-table thead { display: table-header-group; }
  .sales-table tr { break-inside: avoid; }
  .sales-table th {
    text-align:left; font-size:8.5px; color:#8a8378; text-transform:uppercase; letter-spacing:0.3px;
    padding:6px 8px; border-bottom:1.5px solid #e8e2d4; font-weight:700;
    background:#fbf9f5;
  }
  .sales-table td { padding:7px 8px; border-bottom:1px solid #f0ece2; font-size:9.5px; }
  .pay-chip { display:inline-block; padding:2px 8px; border-radius:100px; font-size:8px; font-weight:700; color:#fff; }
  .pay-cash { background:#5a8a3a; }
  .pay-upi { background:#d98a3d; }
  .pay-card { background:#2b2622; }
  .pay-unspecified, .pay-undefined { background:#c9c2b4; }

  .footer {
    position: fixed; bottom: 0; left:0; right:0;
    padding-top: 8px; font-size:8px; color:#9c9284;
    display:flex; justify-content:space-between; border-top:1px solid #e8e2d4;
  }
</style>
</head>
<body>
  <div>
    <div class="header">
      <div class="brand">
        ${logoImg}
        <div>
          <div class="brand-name">ScannBite</div>
          <div class="brand-sub">Café Backup Report</div>
        </div>
      </div>
      <div class="header-right">
        <span class="alltime-badge">All-time report</span>
        <div class="gendate">Generated ${dateTimeText(data.exported_at || new Date().toISOString())}</div>
      </div>
    </div>

    <div class="title-row">
      <div>
        <div class="restaurant-name">${esc(r.name)}</div>
        <div class="restaurant-meta">${esc(r.table_count || 0)} tables · ${esc(r.tax_rate || 0)}% tax · On ScannBite since ${dateText(r.created_at)}</div>
      </div>
      <div class="status-chip">${esc(r.status || '')}</div>
    </div>

    <div class="note-box">
      <b>What this report covers:</b> every bill ever recorded for this café on ScannBite, start to finish — not a recent window. If you're comparing this to the café's own Reports page, set that page's date filter to "All time" first, since it defaults to the last 7 days.
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Lifetime Revenue</div><div class="stat-value">${money(revenue, currency)}</div></div>
      <div class="stat-card"><div class="stat-label">Completed Bills</div><div class="stat-value">${billCount}</div></div>
      <div class="stat-card"><div class="stat-label">Average Bill</div><div class="stat-value">${money(avgBill, currency)}</div></div>
      <div class="stat-card"><div class="stat-label">Items Sold</div><div class="stat-value">${itemsSold}</div></div>
    </div>

    <div class="section-title">Payment Methods (all-time)</div>
    <div class="pay-bar">${barSegments}</div>
    <div class="pay-tiles">${paymentTilesHtml}</div>

    <div class="section-title">Menu (${data.summary?.menu_items ?? (data.menu_items || []).length} items)</div>
    ${menuHtml || '<p class="muted">No menu items recorded.</p>'}

    <div class="section-title">Sales History (${billCount} bills)</div>
    <table class="sales-table">
      <thead><tr><th>Date &amp; time</th><th>Table</th><th>Items</th><th>Payment</th><th class="num">Total</th></tr></thead>
      <tbody>${salesHtml || '<tr><td colspan="5" class="muted">No completed bills recorded.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="footer">
    <span>ScannBite — café ordering &amp; billing</span>
    <span>Backup report for ${esc(r.name)} · keep this if the café leaves the platform</span>
  </div>
</body>
</html>`;
}

// Renders the report into a hidden iframe and opens the browser's print
// dialog on it — the same pattern this app already uses for bill receipts
// (see TableManagement.tsx). The admin picks "Save as PDF" there to get the
// actual file; this avoids adding a PDF-generation library as a dependency.
async function printCafeReport(data: CafeExport) {
  const logoDataUrl = await getLogoDataUrl();
  const html = buildCafeReportHtml(data, logoDataUrl);

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
  document.body.appendChild(iframe);
  const iDoc = iframe.contentWindow?.document;
  if (!iDoc) {
    document.body.removeChild(iframe);
    throw new Error('Could not open the print preview.');
  }
  iDoc.open();
  iDoc.write(html);
  iDoc.close();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 300);
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
      await printCafeReport(data as CafeExport);
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
                      title="Print or save a PDF café backup report"
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
                    title="Print or save a PDF café backup report"
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
