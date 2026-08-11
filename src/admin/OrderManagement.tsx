import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChefHat,
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Utensils,
  Plus,
  X,
  Trash2,
} from 'lucide-react';
import type { Order, OrderItem, OrderItemStatus } from '@/types';
import { useOrders, useSettings, useSoundPreference } from '@/lib/useLocalData';
import { playNewOrderChime, playStatusChime } from '@/lib/audio';
import { formatMoney, formatTime, timeAgo } from '@/lib/billing';
import { StatusBadge } from '@/components/ui';
import { OrderToastStack, ensureNotificationPermission, showOsNotification, type OrderToast } from '@/components/OrderToast';
import ManualOrderModal from './ManualOrderModal';

const ITEM_FLOW: OrderItemStatus[] = ['Pending', 'Cooking', 'Served'];
const ORDER_FLOW: Order['status'][] = ['New', 'Acknowledged', 'Ready', 'Billed'];

export default function OrderManagement() {
  const { orders, patchOrder } = useOrders();
  const { settings } = useSettings();
  const { soundEnabled, setSoundEnabled } = useSoundPreference();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [manualOpen, setManualOpen] = useState(false);
  const [toasts, setToasts] = useState<OrderToast[]>([]);
  const audioReady = useRef(false);
  // Orders created before this component mounted are "old" — we only ever
  // alert for orders whose createdAt is after this timestamp. This avoids
  // any race with the initial load (which can update state more than once
  // as the fetch and the realtime subscription both resolve) incorrectly
  // treating existing orders as new.
  const mountedAt = useRef(Date.now());
  // Guards against alerting twice for the same order, in case a realtime
  // event or a state update happens to fire more than once for it.
  const alertedIds = useRef<Set<string>>(new Set());

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  // Ask for OS notification permission once, so alerts still show if this
  // tab isn't focused (e.g. staff on a different app/screen).
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Unlock audio on first user interaction with the page
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

  // Alert (sound + toast + OS notification) only for orders placed after
  // this component mounted, and only once per order id.
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

  const toggleSound = () => {
    audioReady.current = true;
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) playNewOrderChime();
  };

  const advanceItem = (orderId: string, itemIdx: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const items = order.items.map((it, i) => {
      if (i !== itemIdx) return it;
      const next = ITEM_FLOW[(ITEM_FLOW.indexOf(it.status) + 1) % ITEM_FLOW.length];
      return { ...it, status: next };
    });
    const allServed = items.every((i) => i.status === 'Served');
    const allCookingOrBeyond = items.every((i) => i.status !== 'Pending');
    let status = order.status;
    if (order.status === 'New') status = 'Acknowledged';
    if (allServed && status !== 'Billed') status = 'Ready';
    else if (allCookingOrBeyond && status === 'Acknowledged') status = 'Acknowledged';
    playStatusChime();
    patchOrder({ ...order, items, status });
  };

  const acknowledge = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    patchOrder({ ...order, status: 'Acknowledged' });
    playStatusChime();
  };

  const removeItem = (orderId: string, itemIdx: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const removed = order.items[itemIdx];
    if (!removed) return;
    const items = order.items.filter((_, i) => i !== itemIdx);
    if (items.length === 0) {
      patchOrder({ ...order, items, status: 'Billed', total: 0, subtotal: 0, tax: 0 });
      return;
    }
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const tax = subtotal * (settings.taxRate / 100);
    patchOrder({ ...order, items, subtotal, tax, total: subtotal + tax });
  };

  const cancelOrder = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    patchOrder({ ...order, status: 'Billed', items: [], total: 0, subtotal: 0, tax: 0 });
  };

  const visibleOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === 'all') return sorted;
    return sorted.filter((o) => o.status !== 'Billed');
  }, [orders, filter]);

  const newCount = orders.filter((o) => o.status === 'New').length;

  return (
    <div className="space-y-4">
      <OrderToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900">Live Orders</h2>
          {newCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold animate-pulse">
              {newCount} NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 transition shadow-sm"
          >
            <Plus size={18} />
            New Manual Order
          </button>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${filter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              All
            </button>
          </div>
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg transition ${soundEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </div>

      {visibleOrders.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <Bell size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No active orders right now.</p>
          <p className="text-slate-400 text-sm mt-1">New customer orders will appear here instantly.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            currency={settings.currency}
            isNew={order.status === 'New'}
            onAcknowledge={() => acknowledge(order.id)}
            onAdvanceItem={(idx) => advanceItem(order.id, idx)}
            onRemoveItem={(idx) => removeItem(order.id, idx)}
            onCancelOrder={() => cancelOrder(order.id)}
          />
        ))}
      </div>

      <ManualOrderModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}

function OrderCard({
  order,
  currency,
  isNew,
  onAcknowledge,
  onAdvanceItem,
  onRemoveItem,
  onCancelOrder,
}: {
  order: Order;
  currency: string;
  isNew: boolean;
  onAcknowledge: () => void;
  onAdvanceItem: (idx: number) => void;
  onRemoveItem: (idx: number) => void;
  onCancelOrder: () => void;
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${isNew ? 'border-rose-400 ring-2 ring-rose-200 animate-[pop_0.3s_ease]' : 'border-slate-200'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${isNew ? 'bg-rose-50' : 'bg-slate-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${isNew ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white'}`}>
            T{order.tableNumber}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">Table {order.tableNumber}</p>
            <p className="text-xs text-slate-500">{timeAgo(order.createdAt)} · {formatTime(order.createdAt)}</p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="divide-y divide-slate-100">
        {order.items.map((item, idx) => (
          <div key={idx} className="px-4 py-3 flex items-center gap-3 group">
            <div className="flex-1">
              <p className="font-medium text-slate-900 text-sm">
                <span className="text-slate-500">{item.quantity}×</span> {item.name}
              </p>
              <p className="text-xs text-slate-400">{formatMoney(item.price * item.quantity, currency)}</p>
            </div>
            <button
              onClick={() => onAdvanceItem(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                item.status === 'Pending' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                item.status === 'Cooking' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                'bg-emerald-100 text-emerald-700'
              }`}
            >
              {item.status === 'Pending' && <Clock size={14} />}
              {item.status === 'Cooking' && <ChefHat size={14} />}
              {item.status === 'Served' && <CheckCircle2 size={14} />}
              {item.status}
            </button>
            <button
              onClick={() => onRemoveItem(idx)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition opacity-0 group-hover:opacity-100"
              title="Remove item"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      {order.customerNote && (
        <div className="px-4 py-2 bg-amber-50 text-xs text-amber-800 border-t border-amber-100">
          Customer note: {order.customerNote}
        </div>
      )}

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Total</span>
          <span className="font-bold text-slate-900">{formatMoney(order.total, currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          {order.status !== 'Billed' && (
            <button
              onClick={onCancelOrder}
              className="px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-sm font-semibold hover:bg-rose-100 transition flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Cancel
            </button>
          )}
          {isNew && (
            <button
              onClick={onAcknowledge}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition flex items-center gap-1.5"
            >
              <Utensils size={14} />
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
