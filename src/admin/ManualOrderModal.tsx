import { useMemo, useState } from 'react';
import { Plus, Minus, X, Search, ShoppingBag, Send, UtensilsCrossed } from 'lucide-react';
import type { MenuItem, Order, OrderItem, OrderItemStatus } from '@/types';
import { useCategories, useMenu, useOrders, useSettings } from '@/lib/useLocalData';
import { computeSubtotal, computeTax, computeTotal, formatMoney } from '@/lib/billing';
import { Modal } from '@/components/ui';

interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export default function ManualOrderModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { menu } = useMenu();
  const { addOrder } = useOrders();
  const { settings } = useSettings();
  const { categories } = useCategories();

  const [tableNumber, setTableNumber] = useState<number>(1);
  const [activeCategory, setActiveCategory] = useState<string | 'All'>('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [confirming, setConfirming] = useState(false);

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

  const tables = useMemo(
    () => Array.from({ length: settings.tableCount }, (_, i) => i + 1),
    [settings.tableCount],
  );

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const subtotal = computeSubtotal(
    cart.map((c) => ({ ...c, status: 'Pending' as OrderItemStatus })),
  );
  const tax = computeTax(subtotal, settings.taxRate);
  const total = computeTotal(subtotal, tax);

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
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((l) => l.menuItemId !== id));
  };

  const reset = () => {
    setCart([]);
    setSearch('');
    setActiveCategory('All');
    setTableNumber(1);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const confirmOrder = () => {
    if (cart.length === 0) return;
    const items: OrderItem[] = cart.map((c) => ({
      menuItemId: c.menuItemId,
      name: c.name,
      price: c.price,
      quantity: c.quantity,
      status: 'Pending',
    }));
    const order: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tableNumber,
      items,
      subtotal,
      tax,
      total,
      status: 'New',
      createdAt: Date.now(),
    };
    addOrder(order).catch((e) => console.error('addOrder failed:', e));
    setConfirming(false);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Manual Order" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Table selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Table:</label>
          <select
            value={tableNumber}
            onChange={(e) => setTableNumber(Number(e.target.value))}
            className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          >
            {tables.map((t) => (
              <option key={t} value={t}>
                Table {t}
              </option>
            ))}
          </select>
          {cartCount > 0 && (
            <span className="ml-auto px-3 py-1.5 rounded-full bg-slate-900 text-white text-sm font-semibold flex items-center gap-1.5">
              <ShoppingBag size={14} />
              {cartCount} item{cartCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Search + categories */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {(['All', ...categories] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                activeCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-slate-400 py-10 text-sm">
              No dishes found.
            </div>
          )}
          {filtered.map((item) => {
            const inCart = cart.find((l) => l.menuItemId === item.id);
            return (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className={`relative text-left bg-white rounded-xl border overflow-hidden transition hover:shadow-md active:scale-[0.98] ${
                  inCart ? 'border-slate-900 ring-2 ring-slate-900 ring-offset-1' : 'border-slate-200'
                }`}
              >
                <div className="h-20 bg-slate-100">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <UtensilsCrossed size={20} />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="font-semibold text-slate-900 text-xs leading-tight line-clamp-2">{item.name}</p>
                  <p className="text-xs font-bold text-slate-900 mt-1">{formatMoney(item.price, settings.currency)}</p>
                </div>
                {inCart && (
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                    {inCart.quantity}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Cart */}
        {cart.length > 0 && (
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Order Items</p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {cart.map((line) => (
                <div key={line.menuItemId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-slate-900 font-medium">{line.name}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => changeQty(line.menuItemId, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-semibold">{line.quantity}</span>
                    <button
                      onClick={() => changeQty(line.menuItemId, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="w-16 text-right font-semibold text-slate-900">
                    {formatMoney(line.price * line.quantity, settings.currency)}
                  </span>
                  <button
                    onClick={() => removeLine(line.menuItemId)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, settings.currency)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax ({settings.taxRate}%)</span>
                <span>{formatMoney(tax, settings.currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900">
                <span>Total</span>
                <span>{formatMoney(total, settings.currency)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={cart.length === 0}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            Confirm Manual Order
          </button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirming(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Send order to Table {tableNumber}?</h3>
            <p className="text-sm text-slate-600 mb-5">
              This will add {cartCount} item{cartCount !== 1 ? 's' : ''} ({formatMoney(total, settings.currency)}) to Table {tableNumber}'s bill, just like a customer order.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Back
              </button>
              <button
                onClick={confirmOrder}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
              >
                Send Order
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
