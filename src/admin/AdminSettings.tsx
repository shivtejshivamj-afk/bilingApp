import { useState } from 'react';
import { Settings as SettingsIcon, Save, Trash2, DollarSign } from 'lucide-react';
import { useSettings } from '@/lib/useLocalData';
import { clearAllData } from '@/lib/storage';
import { ConfirmDialog } from '@/components/ui';

export default function AdminSettings() {
  const { settings, setSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const save = () => {
    setSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetAll = () => {
    clearAllData();
    window.location.reload();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
        <SettingsIcon size={20} />
        Settings
      </h2>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Restaurant Name</label>
          <input
            value={form.restaurantName}
            onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Master PIN</label>
            <input
              value={form.masterPin}
              onChange={(e) => setForm({ ...form, masterPin: e.target.value })}
              inputMode="numeric"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 tracking-widest"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency Symbol</label>
            <input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              maxLength={3}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tax Rate (%)</label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Number of Tables</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.tableCount}
              onChange={(e) => setForm({ ...form, tableCount: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.soundEnabled}
            onChange={(e) => setForm({ ...form, soundEnabled: e.target.checked })}
            className="w-4 h-4 accent-slate-900"
          />
          <span className="text-sm text-slate-700">Audio alerts for new orders</span>
        </label>

        <button
          onClick={save}
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Sales summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <DollarSign size={18} />
          Today's Sales
        </h3>
        <SalesSummary currency={settings.currency} />
      </div>

      {/* Danger zone */}
      <div className="bg-rose-50 rounded-2xl border border-rose-200 p-5">
        <h3 className="font-semibold text-rose-900 mb-1">Reset All Data</h3>
        <p className="text-sm text-rose-700 mb-3">
          Permanently delete the menu, all orders, sales logs, and settings. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmReset(true)}
          className="px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition flex items-center gap-2"
        >
          <Trash2 size={16} />
          Reset Everything
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        message="This permanently deletes the menu, orders, sales, and settings. The app will reload with defaults."
        confirmLabel="Reset Everything"
        danger
        onConfirm={resetAll}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function SalesSummary({ currency }: { currency: string }) {
  let sales: { total: number; paidAt: number }[] = [];
  try {
    const raw = localStorage.getItem('rbs_sales');
    const parsed = raw ? JSON.parse(raw) : [];
    sales = Array.isArray(parsed) ? parsed : [];
  } catch {
    sales = [];
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySales = sales.filter((s) => s.paidAt >= todayStart.getTime());
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const allTotal = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <p className="text-xs text-slate-500">Today's Revenue</p>
        <p className="text-xl font-bold text-emerald-600">{currency}{todayTotal.toFixed(2)}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Today's Bills</p>
        <p className="text-xl font-bold text-slate-900">{todaySales.length}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">All-Time Revenue</p>
        <p className="text-xl font-bold text-slate-900">{currency}{allTotal.toFixed(2)}</p>
      </div>
    </div>
  );
}
