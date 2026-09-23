import { useMemo, useState } from 'react';
import { TrendingUp, IndianRupee, Receipt, Package } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useSales, useSettings } from '@/lib/useLocalData';
import { formatMoney } from '@/lib/billing';

type RangeKey = 'today' | '7d' | '30d' | 'all' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const PIE_COLORS = ['#0f172a', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6'];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rangeStart(range: RangeKey): number {
  const now = Date.now();
  if (range === 'today') return startOfDay(now);
  if (range === '7d') return startOfDay(now) - 6 * 86400000;
  if (range === '30d') return startOfDay(now) - 29 * 86400000;
  return 0;
}

// Native <input type="date"> gives/takes "YYYY-MM-DD" strings — these two
// helpers convert that to/from a local-midnight timestamp.
function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export default function Reports() {
  const { sales } = useSales();
  const { settings } = useSettings();
  const [range, setRange] = useState<RangeKey>('7d');
  const [customStart, setCustomStart] = useState(() => toDateInputValue(Date.now()));
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(Date.now()));

  // The window of time actually being reported on. For custom, "end" runs
  // to the end of the selected end day (not just its midnight), so picking
  // the same day for start and end still includes that whole day's sales.
  const { start, end } = useMemo(() => {
    if (range === 'custom') {
      const s = parseDateInput(customStart);
      const e = parseDateInput(customEnd) + 86400000;
      return { start: Math.min(s, e), end: Math.max(s, e) };
    }
    return { start: rangeStart(range), end: Date.now() + 1 };
  }, [range, customStart, customEnd]);

  const filtered = useMemo(() => sales.filter((s) => s.paidAt >= start && s.paidAt < end), [sales, start, end]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((sum, s) => sum + s.total, 0);
    const bills = filtered.length;
    const avg = bills > 0 ? revenue / bills : 0;
    const itemsSold = filtered.reduce(
      (sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0),
      0
    );
    return { revenue, bills, avg, itemsSold };
  }, [filtered]);

  // Revenue grouped by day, for the trend chart. For "Today", pull in a
  // little extra history (last 7 days) purely for chart context, so a
  // single-day selection doesn't look like an empty chart with one dot.
  const dailySeries = useMemo(() => {
    const contextStart = range === 'today' ? rangeStart('7d') : start;
    const source = sales.filter((s) => s.paidAt >= contextStart && s.paidAt < end);

    const map = new Map<number, number>();
    source.forEach((s) => {
      const day = startOfDay(s.paidAt);
      map.set(day, (map.get(day) ?? 0) + s.total);
    });

    return Array.from(map.keys())
      .sort((a, b) => a - b)
      .map((d) => ({
        day: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        revenue: Math.round((map.get(d) ?? 0) * 100) / 100,
      }));
  }, [sales, range, start, end]);

  // Top items by revenue within the selected range
  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; quantity: number }>();
    filtered.forEach((s) => {
      s.items.forEach((i) => {
        const existing = map.get(i.name) ?? { name: i.name, revenue: 0, quantity: 0 };
        existing.revenue += i.price * i.quantity;
        existing.quantity += i.quantity;
        map.set(i.name, existing);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filtered]);

  const hasData = filtered.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
          <TrendingUp size={22} />
          Revenue Reports
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5 bg-ink-100 rounded-xl p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  range === opt.key ? 'bg-white shadow text-ink-900' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 bg-white rounded-xl border border-ink-200 px-3 py-1.5">
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-sm text-ink-700 bg-transparent focus:outline-none"
              />
              <span className="text-ink-400 text-sm">to</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={toDateInputValue(Date.now())}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-sm text-ink-700 bg-transparent focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<IndianRupee size={18} />}
          label="Revenue"
          value={formatMoney(totals.revenue, settings.currency)}
          accent="emerald"
        />
        <SummaryCard icon={<Receipt size={18} />} label="Bills" value={String(totals.bills)} accent="sky" />
        <SummaryCard
          icon={<TrendingUp size={18} />}
          label="Avg. Bill"
          value={formatMoney(totals.avg, settings.currency)}
          accent="amber"
        />
        <SummaryCard icon={<Package size={18} />} label="Items Sold" value={String(totals.itemsSold)} accent="violet" />
      </div>

      {!hasData ? (
        <div className="bg-white rounded-2xl border border-ink-200 p-16 text-center text-ink-400">
          <TrendingUp size={40} className="mx-auto mb-3 text-ink-300" />
          <p className="font-medium">No sales in this period yet.</p>
          <p className="text-sm mt-1">Bills you generate will show up here automatically.</p>
        </div>
      ) : (
        <>
          {/* Revenue trend */}
          <div className="bg-white rounded-2xl border border-ink-200 p-5">
            <h3 className="font-semibold text-ink-900 mb-4">Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailySeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickFormatter={(v) => `${settings.currency}${v}`}
                  width={60}
                />
                <Tooltip
                  formatter={(value: any) => [formatMoney(Number(value ?? 0), settings.currency), 'Revenue']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0f172a' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Top items bar chart */}
            <div className="bg-white rounded-2xl border border-ink-200 p-5">
              <h3 className="font-semibold text-ink-900 mb-4">Top Items by Revenue</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topItems} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${settings.currency}${v}`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    width={90}
                  />
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => [
                      `${formatMoney(Number(value ?? 0), settings.currency)} (${props.payload.quantity} sold)`,
                      'Revenue',
                    ]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Item mix pie chart */}
            <div className="bg-white rounded-2xl border border-ink-200 p-5">
              <h3 className="font-semibold text-ink-900 mb-4">Item Mix (by quantity)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={topItems}
                    dataKey="quantity"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    label={(entry) => entry.name}
                    labelLine={false}
                    fontSize={11}
                  >
                    {topItems.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => [`${value} sold`, name]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'emerald' | 'sky' | 'amber' | 'violet';
}) {
  const accentClasses: Record<typeof accent, string> = {
    emerald: 'bg-basil-100 text-basil-700',
    sky: 'bg-ink-100 text-ink-700',
    amber: 'bg-saffron-100 text-saffron-700',
    violet: 'bg-basil-100 text-basil-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-ink-200 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${accentClasses[accent]}`}>
        {icon}
      </div>
      <p className="text-xs text-ink-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-ink-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}
