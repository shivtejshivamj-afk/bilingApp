import { useState } from 'react';
import { Settings as SettingsIcon, Save, Trash2, Wallet, Link2, Check, AlertCircle } from 'lucide-react';
import { useSettings, useSales } from '@/lib/useLocalData';
import { clearRestaurantLocalData } from '@/lib/storage';
import { resetRestaurantData, changeRestaurantSlug } from '@/lib/sync';
import { useRestaurantId, getSlugFromPath, buildRestaurantUrl, slugify } from '@/lib/restaurantContext';
import { ConfirmDialog } from '@/components/ui';

const CURRENCY_OPTIONS = [
  { label: 'Indian Rupee', symbol: '₹' },
  { label: 'US Dollar', symbol: '$' },
  { label: 'Euro', symbol: '€' },
  { label: 'British Pound', symbol: '£' },
  { label: 'Japanese Yen', symbol: '¥' },
  { label: 'UAE Dirham', symbol: 'AED' },
  { label: 'Saudi Riyal', symbol: 'SAR' },
  { label: 'Australian Dollar', symbol: 'A$' },
  { label: 'Canadian Dollar', symbol: 'C$' },
  { label: 'Singapore Dollar', symbol: 'S$' },
];

export default function AdminSettings() {
  const restaurantId = useRestaurantId();
  const { settings, setSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [customCurrency, setCustomCurrency] = useState(
    !CURRENCY_OPTIONS.some((c) => c.symbol === settings.currency)
  );

  const currentSlug = getSlugFromPath() ?? '';
  const [slugInput, setSlugInput] = useState(currentSlug);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'saving' | 'saved' | 'taken' | 'error'>('idle');

  const saveSlug = async () => {
    const next = slugify(slugInput);
    if (!next || next === currentSlug) return;
    setSlugStatus('saving');
    try {
      const ok = await changeRestaurantSlug(restaurantId, next);
      if (!ok) {
        setSlugStatus('taken');
        return;
      }
      setSlugStatus('saved');
      // The URL itself needs to change to the new slug — redirect there.
      setTimeout(() => {
        window.location.href = buildRestaurantUrl(next, { admin: true });
      }, 900);
    } catch {
      setSlugStatus('error');
    }
  };

  const save = () => {
    setSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetAll = async () => {
    setResetting(true);
    try {
      await resetRestaurantData(restaurantId);
      clearRestaurantLocalData(restaurantId);
      window.location.reload();
    } catch (e) {
      console.error('Failed to reset restaurant data:', e);
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
        <SettingsIcon size={20} />
        Settings
      </h2>

      <div className="bg-white rounded-2xl border border-ink-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Restaurant Name</label>
          <input
            value={form.restaurantName}
            onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Master PIN</label>
            <input
              value={form.masterPin}
              onChange={(e) => setForm({ ...form, masterPin: e.target.value })}
              inputMode="numeric"
              className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900 tracking-widest"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Currency</label>
            {!customCurrency ? (
              <select
                value={CURRENCY_OPTIONS.some((c) => c.symbol === form.currency) ? form.currency : '__custom__'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomCurrency(true);
                    return;
                  }
                  setForm({ ...form, currency: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900 bg-white"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.symbol} — {c.label}
                  </option>
                ))}
                <option value="__custom__">Other (type your own)</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  maxLength={5}
                  placeholder="e.g. Rs, kr, ₦"
                  className="flex-1 px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
                />
                <button
                  type="button"
                  onClick={() => setCustomCurrency(false)}
                  className="px-3 py-2.5 rounded-lg border border-ink-200 text-sm text-ink-600 hover:bg-ink-50 whitespace-nowrap"
                >
                  Choose from list
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Tax Rate (%)</label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Number of Tables</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.tableCount}
              onChange={(e) => setForm({ ...form, tableCount: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
            />
          </div>
        </div>

        <p className="text-xs text-ink-400 -mt-2">
          Sound alerts for new orders can be toggled per-device from the Orders page.
        </p>

        <button
          onClick={save}
          className="w-full py-3 rounded-xl bg-ink-900 text-white font-semibold text-sm hover:bg-ink-800 transition flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Restaurant URL */}
      <div className="bg-white rounded-2xl border border-ink-200 p-5">
        <h3 className="font-semibold text-ink-900 flex items-center gap-2 mb-1">
          <Link2 size={18} />
          Your Restaurant URL
        </h3>
        <p className="text-xs text-ink-400 mb-3">
          This is the web address customers and staff use to reach you. Changing it updates every QR code you've printed — you'll need to reprint them.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center rounded-lg border border-ink-200 overflow-hidden focus-within:ring-2 focus-within:ring-ink-900">
            <span className="pl-3 text-ink-400 text-sm whitespace-nowrap">{window.location.host}/</span>
            <input
              value={slugInput}
              onChange={(e) => {
                setSlugInput(slugify(e.target.value));
                setSlugStatus('idle');
              }}
              className="flex-1 min-w-0 py-2.5 pr-3 text-sm focus:outline-none"
            />
          </div>
          <button
            onClick={saveSlug}
            disabled={slugStatus === 'saving' || !slugInput || slugInput === currentSlug}
            className="px-4 py-2.5 rounded-lg bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {slugStatus === 'saving' ? 'Saving…' : 'Update'}
          </button>
        </div>
        {slugStatus === 'saved' && (
          <p className="text-basil-600 text-xs mt-2 flex items-center gap-1">
            <Check size={14} /> Saved — redirecting you to the new address…
          </p>
        )}
        {slugStatus === 'taken' && (
          <p className="text-paprika-600 text-xs mt-2 flex items-center gap-1">
            <AlertCircle size={14} /> That address is already taken by another restaurant.
          </p>
        )}
        {slugStatus === 'error' && (
          <p className="text-paprika-600 text-xs mt-2 flex items-center gap-1">
            <AlertCircle size={14} /> Something went wrong — please try again.
          </p>
        )}
      </div>

      {/* Sales summary */}
      <div className="bg-white rounded-2xl border border-ink-200 p-5">
        <h3 className="font-semibold text-ink-900 flex items-center gap-2 mb-3">
          <Wallet size={18} />
          Today's Sales
        </h3>
        <SalesSummary currency={settings.currency} />
      </div>

      {/* Danger zone */}
      <div className="bg-paprika-50 rounded-2xl border border-paprika-200 p-5">
        <h3 className="font-semibold text-paprika-900 mb-1">Reset All Data</h3>
        <p className="text-sm text-paprika-700 mb-3">
          Permanently delete the menu, all orders, sales logs, and settings. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmReset(true)}
          className="px-4 py-2.5 rounded-lg bg-paprika-600 text-white text-sm font-semibold hover:bg-paprika-700 transition flex items-center gap-2"
        >
          <Trash2 size={16} />
          Reset Everything
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        message="This permanently deletes the menu, orders, sales, and settings. The app will reload with defaults."
        confirmLabel={resetting ? 'Resetting…' : 'Reset Everything'}
        danger
        onConfirm={resetAll}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function SalesSummary({ currency }: { currency: string }) {
  const { sales } = useSales();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySales = sales.filter((s) => s.paidAt >= todayStart.getTime());
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const allTotal = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <p className="text-xs text-ink-500">Today's Revenue</p>
        <p className="text-xl font-bold text-basil-600">{currency}{todayTotal.toFixed(2)}</p>
      </div>
      <div>
        <p className="text-xs text-ink-500">Today's Bills</p>
        <p className="text-xl font-bold text-ink-900">{todaySales.length}</p>
      </div>
      <div>
        <p className="text-xs text-ink-500">All-Time Revenue</p>
        <p className="text-xl font-bold text-ink-900">{currency}{allTotal.toFixed(2)}</p>
      </div>
    </div>
  );
}
