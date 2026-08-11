import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  X,
  Utensils,
  CheckCircle2,
  Clock,
  ChefHat,
  Send,
  ArrowLeft,
  Bell,
} from 'lucide-react';
import type { MenuItem, Order, OrderItem, OrderItemStatus } from '@/types';
import { useCategories, useMenu, useSettings } from '@/lib/useLocalData';
import { fetchOrders, insertOrder, subscribeToOrderEvents } from '@/lib/sync';
import { computeSubtotal, computeTax, computeTotal, formatMoney } from '@/lib/billing';

interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

function getTableFromUrl(): number | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('table');
  const n = Number(raw);
  return raw && !isNaN(n) && n > 0 ? n : null;
}

// When multiple customers share the same device at a table (e.g. a tablet
// left at the table rather than each guest's own phone), this timestamp
// marks where the CURRENT customer's session starts. Orders placed before
// it belong to a previous customer and are hidden from view on this device
// once someone taps "New Customer" — without touching the actual order data,
// which staff still see in full for billing.
function sessionStartKey(tableNumber: number) {
  return `rbs_customer_session_start_table_${tableNumber}`;
}

function getSessionStart(tableNumber: number): number {
  try {
    const raw = localStorage.getItem(sessionStartKey(tableNumber));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function setSessionStart(tableNumber: number, value: number) {
  try {
    localStorage.setItem(sessionStartKey(tableNumber), String(value));
  } catch {
    // Ignore write failures (e.g. private browsing) — filtering just won't
    // persist across a full page reload in that case.
  }
}

export default function CustomerApp() {
  const { menu } = useMenu();
  const { settings } = useSettings();
  const { categories } = useCategories();
  const tableNumber = useMemo(() => getTableFromUrl(), []);

  const [activeCategory, setActiveCategory] = useState<string | 'All'>('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'tracking' | 'placed'>('menu');
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [sessionStart, setSessionStartState] = useState<number>(() =>
    tableNumber != null ? getSessionStart(tableNumber) : 0
  );

  // Orders visible to THIS customer session — hides a previous customer's
  // orders on shared table devices once "New Customer" has been tapped,
  // without affecting the real order data staff use for billing.
  const visibleOrders = useMemo(
    () => myOrders.filter((o) => o.createdAt >= sessionStart),
    [myOrders, sessionStart]
  );

  const startNewCustomerSession = useCallback(() => {
    if (tableNumber == null) return;
    const now = Date.now();
    setSessionStart(tableNumber, now);
    setSessionStartState(now);
    setCart([]);
    setNote('');
    setView('menu');
    showToast('Ready for a new order!');
  }, [tableNumber]);

  // Load my orders for this table from Supabase
  useEffect(() => {
    if (tableNumber == null) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchOrders();
        if (!cancelled) {
          setMyOrders(all.filter((o) => o.tableNumber === tableNumber));
        }
      } catch (e) {
        console.error('Failed to load orders:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [tableNumber]);

  // Listen for realtime status updates
  useEffect(() => {
    if (tableNumber == null) return;
    return subscribeToOrderEvents((event) => {
      if (event.type === 'DELETE' && event.tableNumber === tableNumber) {
        setMyOrders((prev) => prev.filter((o) => o.tableNumber !== event.tableNumber));
        return;
      }
      if (event.type === 'UPDATE' && event.order.tableNumber === tableNumber) {
        setMyOrders((prev) => {
          const exists = prev.find((o) => o.id === event.order.id);
          if (exists) {
            return prev.map((o) => (o.id === event.order.id ? event.order : o));
          }
          return [event.order, ...prev];
        });
        return;
      }
      if (event.type === 'INSERT' && event.order.tableNumber === tableNumber) {
        setMyOrders((prev) => {
          if (prev.find((o) => o.id === event.order.id)) return prev;
          return [event.order, ...prev];
        });
      }
    });
  }, [tableNumber]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const availableMenu = useMemo(() => menu.filter((m) => m.available), [menu]);

  const filtered = useMemo(() => {
    return availableMenu.filter((m) => {
      const matchCat = activeCategory === 'All' || m.category === activeCategory;
      const matchSearch =
        !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [availableMenu, activeCategory, search]);

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartSubtotal = computeSubtotal(
    cart.map((c) => ({ ...c, status: 'Pending' as OrderItemStatus })),
  );

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
    showToast(`${item.name} added to order`);
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((l) => l.menuItemId !== id));
  };

  const placeOrder = () => {
    if (cart.length === 0 || tableNumber == null) return;
    const items: OrderItem[] = cart.map((c) => ({
      menuItemId: c.menuItemId,
      name: c.name,
      price: c.price,
      quantity: c.quantity,
      status: 'Pending',
    }));
    const subtotal = computeSubtotal(items);
    const tax = computeTax(subtotal, settings.taxRate);
    const total = computeTotal(subtotal, tax);
    const order: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tableNumber,
      items,
      subtotal,
      tax,
      total,
      status: 'New',
      createdAt: Date.now(),
      customerNote: note.trim() || undefined,
    };
    setMyOrders((prev) => [order, ...prev]);
    insertOrder(order).catch((e) => console.error('Failed to send order:', e));
    setCart([]);
    setNote('');
    setView('placed');
    setTimeout(() => setView('tracking'), 1800);
  };

  // No table number — show scan prompt
  if (tableNumber == null) {
    return (
      <div className="min-h-screen bg-parchment-100 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-ink-900 flex items-center justify-center mb-6">
          <Utensils className="text-white" size={36} />
        </div>
        <h1 className="text-2xl font-bold font-display text-ink-900 mb-3">No Table Selected</h1>
        <p className="text-ink-600 max-w-xs">
          Please scan the QR code on your table to open the digital menu and start ordering.
        </p>
      </div>
    );
  }

  if (view === 'placed') {
    return (
      <div className="min-h-screen bg-basil-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-24 h-24 rounded-full bg-basil-500 flex items-center justify-center mb-6 animate-[pop_0.3s_cubic-bezier(0.22,1,0.36,1)]">
          <CheckCircle2 className="text-white" size={52} />
        </div>
        <h1 className="text-2xl font-bold font-display text-ink-900 mb-2">Order Sent!</h1>
        <p className="text-ink-600 max-w-xs">
          The kitchen has received your order. Tracking your food now.
        </p>
      </div>
    );
  }

  if (view === 'tracking') {
    return (
      <div className="min-h-screen bg-parchment-100 pb-10">
        <header className="sticky top-0 z-30 bg-parchment-50/95 backdrop-blur-sm border-b border-parchment-300 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setView('menu')}
            className="p-2 -ml-2 rounded-lg hover:bg-ink-100 text-ink-700 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold font-display text-ink-900">Your Orders</h1>
            <p className="text-xs text-ink-500">Table {tableNumber}</p>
          </div>
          <button
            onClick={() => setView('menu')}
            className="px-4 py-2 rounded-lg bg-paprika-500 hover:bg-paprika-600 text-white text-sm font-semibold transition-colors"
          >
            Order More
          </button>
        </header>

        <div className="max-w-md mx-auto px-4 py-4 space-y-4">
          {visibleOrders.length === 0 && (
            <div className="text-center py-20 text-ink-400">
              <Clock size={48} className="mx-auto mb-3" />
              <p>No orders yet. Start ordering from the menu.</p>
            </div>
          )}
          {visibleOrders.map((order) => (
            <OrderTrackingCard key={order.id} order={order} currency={settings.currency} />
          ))}

          {visibleOrders.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Finish this order and hand off to the next customer? Your order will still be billed by staff — this just clears the view on this screen for someone new.')) {
                  startNewCustomerSession();
                }
              }}
              className="w-full py-3 rounded-xl border border-ink-200 text-ink-500 text-sm font-medium hover:bg-ink-100 transition-colors mt-2"
            >
              My order is done — start fresh for a new customer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment-100 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-parchment-50/95 backdrop-blur-sm border-b border-parchment-300">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-medium text-paprika-600 uppercase tracking-wide">
                {settings.restaurantName}
              </p>
              <h1 className="text-2xl font-display font-semibold text-ink-900">Table {tableNumber}</h1>
            </div>
            <button
              onClick={() => setView('tracking')}
              className="relative p-2.5 rounded-xl bg-white text-ink-700 shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              <Bell size={20} />
              {visibleOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-paprika-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce-once" key={visibleOrders.length}>
                  {visibleOrders.length}
                </span>
              )}
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-sm text-ink-900 placeholder-ink-400 border border-parchment-300 focus:outline-none focus:ring-2 focus:ring-paprika-400 transition"
            />
          </div>
        </div>
        {/* Category pills */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {(['All', ...categories] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat
                  ? 'bg-paprika-500 text-white shadow-md scale-105'
                  : 'bg-white text-ink-600 hover:bg-parchment-200 border border-parchment-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Menu grid */}
      <div className="max-w-md mx-auto px-4 py-4">
        {filtered.length === 0 && (
          <div className="text-center py-20 text-ink-400">
            <Search size={40} className="mx-auto mb-3" />
            <p>No dishes found. Try a different search.</p>
          </div>
        )}
        <div className="space-y-4">
          {filtered.map((item) => (
            <MenuCard key={item.id} item={item} onAdd={() => addToCart(item)} currency={settings.currency} />
          ))}
        </div>
      </div>

      {/* Cart bar */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-ink-900 text-white rounded-2xl shadow-ticket-lg px-5 py-3.5 flex items-center justify-between animate-[slideUp_0.25s_cubic-bezier(0.22,1,0.36,1)] z-40 hover:-translate-y-0.5 transition-transform"
        >
          <span className="flex items-center gap-2 font-semibold">
            <span className="w-7 h-7 rounded-full bg-paprika-500 text-white text-sm font-bold flex items-center justify-center animate-bounce-once" key={cartCount}>
              {cartCount}
            </span>
            View Order
          </span>
          <span className="font-bold">{formatMoney(cartSubtotal, settings.currency)}</span>
        </button>
      )}

      {/* Cart sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-ticket-lg max-h-[90vh] flex flex-col animate-[slideUp_0.25s_cubic-bezier(0.22,1,0.36,1)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-parchment-300">
              <h3 className="text-lg font-bold font-display text-ink-900">Your Order</h3>
              <button onClick={() => setCartOpen(false)} className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 flex-1">
              {cart.length === 0 ? (
                <p className="text-center text-ink-400 py-10">Your order is empty.</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((line) => (
                    <div key={line.menuItemId} className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-ink-900 text-sm">{line.name}</p>
                        <p className="text-xs text-ink-500">{formatMoney(line.price, settings.currency)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeQty(line.menuItemId, -1)}
                          className="w-8 h-8 rounded-lg bg-ink-100 text-ink-700 flex items-center justify-center hover:bg-ink-200 transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="w-6 text-center font-semibold text-ink-900">{line.quantity}</span>
                        <button
                          onClick={() => changeQty(line.menuItemId, 1)}
                          className="w-8 h-8 rounded-lg bg-paprika-500 text-white flex items-center justify-center hover:bg-paprika-600 transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <span className="w-16 text-right font-semibold text-ink-900 text-sm">
                        {formatMoney(line.price * line.quantity, settings.currency)}
                      </span>
                    </div>
                  ))}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Special request? (optional)"
                    className="w-full mt-2 px-3 py-2 rounded-xl border border-parchment-300 text-sm focus:outline-none focus:ring-2 focus:ring-paprika-400 resize-none"
                    rows={2}
                  />
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="px-5 py-4 border-t border-parchment-300 space-y-3">
                <div className="flex justify-between text-sm text-ink-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(cartSubtotal, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-sm text-ink-600">
                  <span>Tax ({settings.taxRate}%)</span>
                  <span>{formatMoney(computeTax(cartSubtotal, settings.taxRate), settings.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-ink-900">
                  <span>Total</span>
                  <span>{formatMoney(computeTotal(cartSubtotal, computeTax(cartSubtotal, settings.taxRate)), settings.currency)}</span>
                </div>
                <button
                  onClick={placeOrder}
                  className="w-full py-3.5 rounded-xl bg-basil-500 hover:bg-basil-600 text-white font-bold flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-lg"
                >
                  <Send size={18} />
                  Place Order
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-ticket-lg animate-[slideDown_0.2s_cubic-bezier(0.22,1,0.36,1)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function MenuCard({ item, onAdd, currency }: { item: MenuItem; onAdd: () => void; currency: string }) {
  return (
    <div className="flex gap-3 bg-white rounded-2xl overflow-hidden shadow-sm border border-parchment-300 hover:shadow-md transition-shadow">
      <img src={item.image} alt={item.name} className="w-28 h-28 object-cover shrink-0 bg-parchment-200" loading="lazy" />
      <div className="flex-1 p-3 flex flex-col">
        <div className="flex-1">
          <h3 className="font-bold font-display text-ink-900 leading-tight">{item.name}</h3>
          <p className="text-xs text-ink-500 mt-1 line-clamp-2">{item.description}</p>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-paprika-600">{formatMoney(item.price, currency)}</span>
          <button
            onClick={onAdd}
            className="w-9 h-9 rounded-xl bg-paprika-500 text-white flex items-center justify-center hover:bg-paprika-600 active:scale-90 transition-all shadow-sm hover:shadow-md"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderTrackingCard({ order, currency }: { order: Order; currency: string }) {
  const statusOrder: OrderItemStatus[] = ['Pending', 'Cooking', 'Served'];
  return (
    <div className="bg-white rounded-2xl shadow-ticket border border-parchment-300 overflow-hidden animate-ticket-print">
      <div className="px-4 py-3 bg-parchment-100 border-b border-parchment-300 flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-500">Order placed</p>
          <p className="font-bold font-mono text-ink-900 text-sm">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          order.status === 'New' ? 'bg-paprika-100 text-paprika-700' :
          order.status === 'Acknowledged' ? 'bg-ink-100 text-ink-600' :
          order.status === 'Ready' ? 'bg-basil-100 text-basil-700' :
          'bg-ink-100 text-ink-600'
        }`}>
          {order.status === 'New' ? 'Received' : order.status}
        </span>
      </div>
      <div className="divide-y divide-parchment-200">
        {order.items.map((item, idx) => (
          <div key={idx} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium text-ink-900 text-sm">{item.quantity}× {item.name}</span>
              </div>
              <span className="text-sm font-semibold font-mono text-ink-900">{formatMoney(item.price * item.quantity, currency)}</span>
            </div>
            <div className="flex items-center gap-1">
              {statusOrder.map((s, i) => {
                const currentIdx = statusOrder.indexOf(item.status);
                const reached = i <= currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={s} className="flex items-center gap-1 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                      reached ? (isCurrent ? 'bg-paprika-500 text-white' : 'bg-basil-500 text-white') : 'bg-parchment-200 text-ink-400'
                    }`}>
                      {s === 'Pending' ? <Clock size={12} /> : s === 'Cooking' ? <ChefHat size={12} /> : <CheckCircle2 size={12} />}
                    </div>
                    <span className={`text-[10px] font-medium ${reached ? 'text-ink-700' : 'text-ink-400'}`}>{s}</span>
                    {i < statusOrder.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 rounded transition-colors ${i < currentIdx ? 'bg-basil-400' : 'bg-parchment-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {order.customerNote && (
        <div className="px-4 py-2 bg-saffron-50 border-t border-parchment-200 text-xs text-saffron-800">
          Note: {order.customerNote}
        </div>
      )}
      <div className="px-4 py-3 bg-parchment-100 border-t border-parchment-300 flex items-center justify-between ticket-edge text-ink-300">
        <span className="text-xs text-ink-500">Total</span>
        <span className="font-bold font-mono text-ink-900">{formatMoney(order.total, currency)}</span>
      </div>
    </div>
  );
}
