import { useMemo, useState } from 'react';
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
import { StatusBadge, ConfirmDialog } from '@/components/ui';
import ManualOrderModal from './ManualOrderModal';

const ITEM_FLOW: OrderItemStatus[] = ['Pending', 'Cooking', 'Served'];
const ORDER_FLOW: Order['status'][] = ['New', 'Acknowledged', 'Ready', 'Billed'];

export default function OrderManagement() {
  const { orders, patchOrder, removeOrder } = useOrders();
  const { settings } = useSettings();
  // Sound preference and the new-order alert (chime/toast/OS notification)
  // itself now live one level up in AdminDashboard, since that component
  // stays mounted across every tab — this page only needs the on/off toggle
  // control here, not its own separate copy of the alert logic (which would
  // otherwise double-fire while this tab happens to be open).
  const { soundEnabled, setSoundEnabled } = useSoundPreference();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [manualOpen, setManualOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const toggleSound = () => {
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
      // No items left on this order — remove it entirely instead of
      // leaving an empty, zeroed-out row sitting in the database.
      removeOrder(orderId).catch((e) => console.error('Failed to remove empty order:', e));
      return;
    }
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const tax = subtotal * (settings.taxRate / 100);
    patchOrder({ ...order, items, subtotal, tax, total: subtotal + tax });
  };

  const cancelOrder = (orderId: string) => {
    // Cancelling now removes the order entirely rather than zeroing it out
    // and leaving an empty row behind — that empty row would otherwise sit
    // in the database forever, the same clutter problem as unbilled orders.
    setCancelError(null);
    removeOrder(orderId).catch((e) => {
      console.error('Failed to cancel order:', e);
      // Surface the failure instead of silently letting the order reappear
      // a few seconds later once the background refresh notices it's still
      // in the database — that silent revert is confusing and looks like
      // "the button doesn't work" when really the delete itself failed
      // (e.g. a permissions issue or a dropped connection).
      setCancelError(e?.message || 'Something went wrong cancelling this order. Please try again.');
    });
  };

  const visibleOrders = useMemo(() => {
    // Oldest first — a kitchen queue should be worked through in the order
    // things arrived, so nothing quietly gets left behind. Newest-first
    // (like a chat feed) actually hides how long the oldest order has been
    // waiting, buried at the bottom.
    const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
    if (filter === 'all') return sorted;
    // "Needs Attention": still has at least one item that isn't Served yet,
    // or hasn't even been acknowledged. Once every item on an order is
    // Served, it drops out of this view — it's just waiting to be billed,
    // not waiting on the kitchen — but it still shows up under "All".
    return sorted.filter(
      (o) => o.status === 'New' || o.items.some((i) => i.status !== 'Served')
    );
  }, [orders, filter]);

  const newCount = orders.filter((o) => o.status === 'New').length;
  const orderLanes = useMemo(() => {
    const lanes = { new: [] as Order[], cooking: [] as Order[], served: [] as Order[] };
    for (const order of visibleOrders) {
      if (order.status === 'New') lanes.new.push(order);
      else if (order.items.length > 0 && order.items.every((item) => item.status === 'Served')) lanes.served.push(order);
      else lanes.cooking.push(order);
    }
    return lanes;
  }, [visibleOrders]);

  return (
    <div className="space-y-4">
      {cancelError && (
        <div className="px-4 py-3 rounded-xl bg-paprika-50 border border-paprika-200 text-paprika-700 text-sm flex items-center justify-between">
          <span>{cancelError}</span>
          <button onClick={() => setCancelError(null)} className="text-paprika-500 hover:text-paprika-700 font-bold px-2">
            ×
          </button>
        </div>
      )}
      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this order?"
        message="This will permanently remove the order. This can't be undone."
        confirmLabel="Cancel Order"
        danger
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) cancelOrder(cancelTarget);
          setCancelTarget(null);
        }}
      />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold font-display text-ink-900">Live Orders</h2>
          {newCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-paprika-500 text-white text-xs font-bold animate-pulse">
              {newCount} NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-basil-500 text-white text-sm font-semibold flex items-center gap-2 hover:bg-basil-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-sm hover:shadow-md"
          >
            <Plus size={18} />
            New Manual Order
          </button>
          <div className="flex rounded-lg bg-ink-100 p-0.5">
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filter === 'active' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
            >
              Needs Attention
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
            >
              All Tables
            </button>
          </div>
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'bg-basil-100 text-basil-700' : 'bg-ink-100 text-ink-400'}`}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </div>

      {visibleOrders.length === 0 && (
        <div className="rounded-2xl border border-ink-200 bg-white px-6 py-14 text-center shadow-sm">
          <Bell size={40} className="mx-auto mb-3 text-ink-300" />
          <p className="font-semibold text-ink-700">No active orders</p>
          <p className="mt-1 text-sm text-ink-400">New customer orders will appear here.</p>
        </div>
      )}

      {visibleOrders.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-5">
          <OrderLane title="New Orders" count={orderLanes.new.length} tone="new" emptyText="No new orders" icon={<Bell size={17} />}>
            {orderLanes.new.map((order, idx) => (
              <OrderCard key={order.id} order={order} position={idx + 1} currency={settings.currency} isNew
                onAcknowledge={() => acknowledge(order.id)} onAdvanceItem={(itemIdx) => advanceItem(order.id, itemIdx)}
                onRemoveItem={(itemIdx) => removeItem(order.id, itemIdx)} onCancelOrder={() => setCancelTarget(order.id)} />
            ))}
          </OrderLane>
          <OrderLane title="Cooking" count={orderLanes.cooking.length} tone="cooking" emptyText="Nothing in preparation" icon={<ChefHat size={17} />}>
            {orderLanes.cooking.map((order, idx) => (
              <OrderCard key={order.id} order={order} position={idx + 1} currency={settings.currency} isNew={false}
                onAcknowledge={() => acknowledge(order.id)} onAdvanceItem={(itemIdx) => advanceItem(order.id, itemIdx)}
                onRemoveItem={(itemIdx) => removeItem(order.id, itemIdx)} onCancelOrder={() => setCancelTarget(order.id)} />
            ))}
          </OrderLane>
          <OrderLane title="Served" count={orderLanes.served.length} tone="served" emptyText="No served orders yet" icon={<CheckCircle2 size={17} />}>
            {orderLanes.served.map((order, idx) => (
              <OrderCard key={order.id} order={order} position={idx + 1} currency={settings.currency} isNew={false}
                onAcknowledge={() => acknowledge(order.id)} onAdvanceItem={(itemIdx) => advanceItem(order.id, itemIdx)}
                onRemoveItem={(itemIdx) => removeItem(order.id, itemIdx)} onCancelOrder={() => setCancelTarget(order.id)} />
            ))}
          </OrderLane>
        </div>
      )}

      <ManualOrderModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}

function OrderLane({
  title, count, tone, emptyText, icon, children,
}: {
  title: string;
  count: number;
  tone: 'new' | 'cooking' | 'served';
  emptyText: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneStyles = {
    new: 'border-paprika-200 bg-paprika-50 text-paprika-700',
    cooking: 'border-orange-200 bg-orange-50 text-orange-800',
    served: 'border-basil-200 bg-basil-50 text-basil-700',
  };
  return (
    <section className="min-w-0 rounded-2xl border border-ink-200 bg-ink-50/70 p-3 sm:p-4">
      <div className={`mb-3 flex items-center justify-between rounded-xl border px-3 py-3 ${toneStyles[tone]}`}>
        <div className="flex min-w-0 items-center gap-2 font-bold">
          {icon}<span>{title}</span>
        </div>
        <span className="ml-2 inline-flex min-w-7 items-center justify-center rounded-full bg-white/80 px-2 py-1 text-xs font-bold tabular-nums">{count}</span>
      </div>
      <div className="flex flex-col gap-3">
        {count === 0 ? (
          <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white px-4 py-8 text-center text-sm text-ink-400">{emptyText}</div>
        ) : children}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  position,
  currency,
  isNew,
  onAcknowledge,
  onAdvanceItem,
  onRemoveItem,
  onCancelOrder,
}: {
  order: Order;
  position: number;
  currency: string;
  isNew: boolean;
  onAcknowledge: () => void;
  onAdvanceItem: (idx: number) => void;
  onRemoveItem: (idx: number) => void;
  onCancelOrder: () => void;
}) {
  return (
    <div className={`min-w-0 w-full bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isNew ? 'border-paprika-400 ring-2 ring-paprika-200 animate-ticket-print' : 'border-ink-200'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${isNew ? 'bg-paprika-50' : 'bg-ink-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold font-display ${isNew ? 'bg-paprika-500 text-white' : 'bg-ink-900 text-white'}`}>
            T{order.tableNumber}
          </div>
          <div>
            <p className="font-bold text-ink-900 text-sm flex items-center gap-1.5">
              Table {order.tableNumber}
              <span className="text-ink-400 font-normal text-xs font-mono">#{position}</span>
            </p>
            <p className="text-xs text-ink-500 font-mono">{timeAgo(order.createdAt)} · {formatTime(order.createdAt)}</p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="divide-y divide-ink-100">
        {order.items.map((item, idx) => (
          <div key={idx} className="px-4 py-3 flex items-center gap-3 group">
            <div className="flex-1">
              <p className="font-medium text-ink-900 text-sm">
                <span className="text-ink-500">{item.quantity}×</span> {item.name}
              </p>
              <p className="text-xs text-ink-400 font-mono">{formatMoney(item.price * item.quantity, currency)}</p>
            </div>
            <button
              onClick={() => onAdvanceItem(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                item.status === 'Pending' ? 'bg-saffron-100 text-saffron-800 hover:bg-saffron-200' :
                item.status === 'Cooking' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                'bg-basil-100 text-basil-700'
              }`}
            >
              {item.status === 'Pending' && <Clock size={14} />}
              {item.status === 'Cooking' && <ChefHat size={14} />}
              {item.status === 'Served' && <CheckCircle2 size={14} />}
              {item.status}
            </button>
            <button
              onClick={() => onRemoveItem(idx)}
              className="p-1.5 rounded-lg text-ink-300 hover:text-paprika-600 hover:bg-paprika-50 transition-colors opacity-0 group-hover:opacity-100"
              title="Remove item"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      {order.customerNote && (
        <div className="px-4 py-2 bg-saffron-50 text-xs text-saffron-800 border-t border-saffron-100">
          Customer note: {order.customerNote}
        </div>
      )}

      <div className="px-4 py-3 bg-ink-50 border-t border-ink-100 flex flex-col gap-3 ticket-edge text-ink-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-400">Total</span>
          <span className="font-bold font-mono text-ink-900">{formatMoney(order.total, currency)}</span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {order.status !== 'Billed' && (
            <button
              onClick={onCancelOrder}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-paprika-50 px-3 py-2 text-sm font-semibold text-paprika-600 transition-colors hover:bg-paprika-100 sm:flex-none"
            >
              <Trash2 size={14} />
              Cancel
            </button>
          )}
          {isNew && (
            <button
              onClick={onAcknowledge}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-ink-800 sm:flex-none"
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
