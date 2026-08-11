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

type RangeKey = 'today' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
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

export default function Reports() {
  const { sales } = useSales();
  const { settings } = useSettings();
  const [range, setRange] = useState<RangeKey>('7d');

  const filtered = useMemo(() => {
    const start = rangeStart(range);
    return sales.filter((s) => s.paidAt >= start);
  }, [sales, range]);

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

  // Revenue grouped by day, for the trend chart. For "Today" we still show
  // a single-day bucket so the chart doesn't look empty.
  const dailySeries = useMemo(() => {
    const map = new Map<string, number>();
    const start = rangeStart(range === 'today' ? '7d' : range); // give a little more context for very short ranges
    const effectiveSales = range === 'today' ? filtered : sales.filter((s) => s.paidAt >= start);

    effectiveSales.forEach((s) => {
      const day = new Date(startOfDay(s.paidAt));
      const key = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      map.set(key, (map.get(key) ?? 0) + s.total);
    });

    // Ensure chronological order by re-deriving from sorted unique day starts
    const dayStarts = Array.from(
      new Set(effectiveSales.map((s) => startOfDay(s.paidAt)))
    ).sort((a, b) => a - b);

    return dayStarts.map((d) => {
      const key = new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return { day: key, revenue: Math.round((map.get(key) ?? 0) * 100) / 100 };
    });
  }, [sales, filtered, range]);

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
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp size={22} />
          Revenue Reports
        </h2>
        <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                range === opt.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
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
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
          <TrendingUp size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No sales in this period yet.</p>
          <p className="text-sm mt-1">Bills you generate will show up here automatically.</p>
        </div>
      ) : (
        <>
          {/* Revenue trend */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Revenue Trend</h3>
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
                  formatter={(value: number) => [formatMoney(value, settings.currency), 'Revenue']}
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
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Top Items by Revenue</h3>
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
                    formatter={(value: number, name: string, props: any) => [
                      `${formatMoney(value, settings.currency)} (${props.payload.quantity} sold)`,
                      'Revenue',
                    ]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Item mix pie chart */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Item Mix (by quantity)</h3>
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
                    formatter={(value: number, name: string) => [`${value} sold`, name]}
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
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${accentClasses[accent]}`}>
        {icon}
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}
