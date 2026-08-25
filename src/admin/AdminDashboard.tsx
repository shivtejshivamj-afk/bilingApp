import { useEffect, useMemo, useRef, useState } from 'react';
import { Suspense, lazy } from 'react';
import {
  ClipboardList,
  Table2,
  UtensilsCrossed,
  QrCode,
  Settings as SettingsIcon,
  LogOut,
  Menu as MenuIcon,
  X,
  Bell,
  TrendingUp,
} from 'lucide-react';
import { useOrders, useSettings, useSoundPreference } from '@/lib/useLocalData';
import { playNewOrderChime } from '@/lib/audio';
import { OrderToastStack, ensureNotificationPermission, showOsNotification, type OrderToast } from '@/components/OrderToast';
import OrderManagement from './OrderManagement';
import TableManagement from './TableManagement';
import MenuManager from './MenuManager';
import QRGenerator from './QRGenerator';
import AdminSettings from './AdminSettings';

const Reports = lazy(() => import('./Reports'));

type Tab = 'orders' | 'tables' | 'menu' | 'qr' | 'reports' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'tables', label: 'Tables', icon: Table2 },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'qr', label: 'QR Codes', icon: QrCode },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { settings } = useSettings();
  const { orders } = useOrders();
  const { soundEnabled } = useSoundPreference();
  const [tab, setTab] = useState<Tab>('orders');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newFlash, setNewFlash] = useState(false);
  const prevNewCount = useRef(0);
  const [toasts, setToasts] = useState<OrderToast[]>([]);
  const audioReady = useRef(false);

  const newCount = useMemo(() => orders.filter((o) => o.status === 'New').length, [orders]);

  // This lives here — at the top of the whole admin shell, which stays
  // mounted no matter which tab (Orders, Tables, Menu, etc.) staff are
  // looking at — rather than inside the Orders tab itself. That way, a
  // customer placing an order through the QR menu triggers the sound/toast
  // even if staff currently have Tables or Menu open, not just Orders.

  // Orders created before this component mounted are "old" — only alert for
  // orders whose createdAt is after this timestamp, and only once per id.
  const mountedAt = useRef(Date.now());
  const alertedIds = useRef<Set<string>>(new Set());

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  // Ask for OS notification permission once, so alerts still show even if
  // this browser tab isn't focused at all.
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Unlock audio playback on the very first interaction anywhere in the
  // admin app (clicking a nav tab, tapping a button, etc.) — browsers block
  // audio until a real user gesture happens, so this only needs to fire once
  // per session, no matter which screen that first click happens on.
  useEffect(() => {
    const unlock = () => {
      audioReady.current = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Alert (sound + toast + OS notification) for any genuinely new order,
  // regardless of which admin tab is currently open.
  useEffect(() => {
    const freshOrders = orders.filter(
      (o) => o.createdAt > mountedAt.current && !alertedIds.current.has(o.id)
    );
    if (freshOrders.length === 0) return;

    freshOrders.forEach((o) => alertedIds.current.add(o.id));

    if (audioReady.current && soundEnabled) {
      playNewOrderChime();
    }
    setToasts((current) => [
      ...freshOrders.map((o) => ({ id: o.id, tableNumber: o.tableNumber, itemCount: o.items.length })),
      ...current,
    ]);
    freshOrders.forEach((o) => showOsNotification(o.tableNumber, o.items.length));
  }, [orders, soundEnabled]);

  // Flash banner when a new order arrives (count increases)
  useEffect(() => {
    if (newCount > prevNewCount.current) {
      setNewFlash(true);
      const timer = setTimeout(() => setNewFlash(false), 2000);
      prevNewCount.current = newCount;
      return () => clearTimeout(timer);
    }
    prevNewCount.current = newCount;
  }, [newCount]);

  const logout = () => {
    sessionStorage.removeItem('rbs_admin_auth');
    onLogout();
  };

  const navClick = (id: Tab) => {
    setTab(id);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-parchment-100 flex">
      <OrderToastStack toasts={toasts} onDismiss={dismissToast} />
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-60 bg-ink-900 flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent
          tab={tab}
          onNav={navClick}
          newCount={newCount}
          restaurantName={settings.restaurantName}
          onLogout={logout}
        />
      </aside>

      {/* Sidebar — mobile drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ink-900 flex flex-col animate-[slideRight_0.2s_ease]">
            <SidebarContent
              tab={tab}
              onNav={navClick}
              newCount={newCount}
              restaurantName={settings.restaurantName}
              onLogout={logout}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-ink-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg hover:bg-ink-100 text-ink-700 transition-colors"
            >
              <MenuIcon size={22} />
            </button>
            <h1 className="text-lg font-bold font-display text-ink-900 capitalize">{tab === 'qr' ? 'QR Codes' : tab}</h1>
          </div>
          <div className="flex items-center gap-2">
            {newCount > 0 && (
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paprika-100 text-paprika-700 text-sm font-semibold animate-pulse">
                <Bell size={14} />
                {newCount} new order{newCount !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-ink-100 text-ink-600 transition-colors"
              title="Log out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* New order flash banner */}
        {newFlash && (
          <div className="bg-basil-500 text-white text-center text-sm font-semibold py-1.5 animate-[slideDown_0.2s_ease]">
            New order received
          </div>
        )}

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {tab === 'orders' && <OrderManagement />}
          {tab === 'tables' && <TableManagement />}
          {tab === 'menu' && <MenuManager />}
          {tab === 'qr' && <QRGenerator />}
          {tab === 'reports' && (
            <Suspense fallback={<div className="py-20 text-center text-ink-400">Loading reports…</div>}>
              <Reports />
            </Suspense>
          )}
          {tab === 'settings' && <AdminSettings />}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  tab,
  onNav,
  newCount,
  restaurantName,
  onLogout,
}: {
  tab: Tab;
  onNav: (t: Tab) => void;
  newCount: number;
  restaurantName: string;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="px-5 py-5 border-b border-ink-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-paprika-500 flex items-center justify-center">
            <UtensilsCrossed className="text-white" size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-bold font-display text-white text-sm truncate">{restaurantName}</p>
            <p className="text-xs text-ink-400">Staff Dashboard</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onNav(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active ? 'bg-paprika-500 text-white shadow-md' : 'text-ink-300 hover:bg-ink-800 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{t.label}</span>
              {t.id === 'orders' && newCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${active ? 'bg-white text-paprika-600' : 'bg-paprika-500 text-white'}`}>
                  {newCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-ink-700/50">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-300 hover:bg-ink-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Log Out
        </button>
      </div>
    </>
  );
}
