import { useMemo, useState } from 'react';
import { Table2, Users, Clock, Wallet, Printer, X, CheckCircle2, Download, Receipt } from 'lucide-react';
import type { Order, SalesLog } from '@/types';
import { useOrders, useSettings } from '@/lib/useLocalData';
import { addSale } from '@/lib/storage';
import { computeSubtotal, computeTax, computeTotal, formatMoney } from '@/lib/billing';
import { Modal, ConfirmDialog } from '@/components/ui';

interface TableInfo {
  number: number;
  orders: Order[];
  subtotal: number;
  tax: number;
  total: number;
  pendingItems: number;
}

export default function TableManagement() {
  const { orders, patchOrder, removeOrdersByTable } = useOrders();
  const { settings } = useSettings();
  const [billTable, setBillTable] = useState<number | null>(null);
  const [clearTable, setClearTable] = useState<number | null>(null);

  const tables: TableInfo[] = useMemo(() => {
    const map = new Map<number, TableInfo>();
    orders.forEach((o) => {
      if (o.status === 'Billed') return;
      let info = map.get(o.tableNumber);
      if (!info) {
        info = { number: o.tableNumber, orders: [], subtotal: 0, tax: 0, total: 0, pendingItems: 0 };
        map.set(o.tableNumber, info);
      }
      info.orders.push(o);
      const sub = computeSubtotal(o.items);
      info.subtotal += sub;
      info.tax += computeTax(sub, settings.taxRate);
      info.total += computeTotal(sub, computeTax(sub, settings.taxRate));
      info.pendingItems += o.items.filter((i) => i.status !== 'Served').length;
    });
    return Array.from(map.values()).sort((a, b) => a.number - b.number);
  }, [orders, settings.taxRate]);

  const activeTables = tables.length;
  const grandTotal = tables.reduce((s, t) => s + t.total, 0);
  const totalPending = tables.reduce((s, t) => s + t.pendingItems, 0);

  const billOrder = tables.find((t) => t.number === billTable);

  const generateBill = () => {
    if (!billOrder) return;
    billOrder.orders.forEach((o) => {
      patchOrder({ ...o, status: 'Billed' as const }).catch((e) => console.error('patchOrder failed:', e));
    });

    const log: SalesLog = {
      id: `sale_${Date.now()}`,
      tableNumber: billOrder.number,
      items: billOrder.orders.flatMap((o) => o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price }))),
      subtotal: billOrder.subtotal,
      tax: billOrder.tax,
      total: billOrder.total,
      paidAt: Date.now(),
    };
    addSale(log);
    setBillTable(null);
  };

  const clearTableConfirm = () => {
    if (clearTable == null) return;
    removeOrdersByTable(clearTable).catch((e) => console.error('removeOrdersByTable failed:', e));
    setClearTable(null);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Users size={16} />
            <span className="text-xs font-medium">Active Tables</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{activeTables}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Clock size={16} />
            <span className="text-xs font-medium">Pending Items</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{totalPending}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Wallet size={16} />
            <span className="text-xs font-medium">Open Bills</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatMoney(grandTotal, settings.currency)}</p>
        </div>
      </div>

      {tables.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <Table2 size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No active tables.</p>
          <p className="text-slate-400 text-sm mt-1">Tables with open orders will appear here.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <div key={t.number} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-bold">
                  {t.number}
                </div>
                <div>
                  <p className="font-bold">Table {t.number}</p>
                  <p className="text-xs text-slate-300">{t.orders.length} order{t.orders.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {t.pendingItems > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {t.pendingItems} pending
                </span>
              )}
            </div>
            <div className="px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatMoney(t.subtotal, settings.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax ({settings.taxRate}%)</span>
                <span>{formatMoney(t.tax, settings.currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-base pt-1 border-t border-slate-100 mt-1">
                <span>Total</span>
                <span>{formatMoney(t.total, settings.currency)}</span>
              </div>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={() => setBillTable(t.number)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Receipt size={16} />
                Generate Bill
              </button>
              <button
                onClick={() => setClearTable(t.number)}
                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 transition"
                title="Clear table"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bill modal with printable receipt */}
      <Modal open={billTable != null} onClose={() => setBillTable(null)} title={`Bill — Table ${billTable ?? ''}`} maxWidth="max-w-md">
        {billOrder && (
          <BillReceipt table={billOrder} currency={settings.currency} restaurantName={settings.restaurantName} taxRate={settings.taxRate} onPay={generateBill} />
        )}
      </Modal>

      <ConfirmDialog
        open={clearTable != null}
        title={`Clear Table ${clearTable ?? ''}?`}
        message="This will remove all open orders for this table. This cannot be undone."
        confirmLabel="Clear Table"
        danger
        onConfirm={clearTableConfirm}
        onCancel={() => setClearTable(null)}
      />
    </div>
  );
}

function BillReceipt({
  table,
  currency,
  restaurantName,
  taxRate,
  onPay,
}: {
  table: TableInfo;
  currency: string;
  restaurantName: string;
  taxRate: number;
  onPay: () => void;
}) {
  const allItems = table.orders.flatMap((o) => o.items);
  const print = () => {
    const itemsHtml = allItems.map((item) => `<tr><td>${item.quantity}&times; ${item.name}</td><td style="text-align:right">${formatMoney(item.price * item.quantity, currency)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill - Table ${table.number}</title>
      <style>
        body{font-family:'Courier New',monospace;max-width:320px;margin:0 auto;padding:16px;}
        h1{font-size:18px;text-align:center;margin:0;}
        .sub{text-align:center;font-size:12px;color:#555;margin:4px 0;}
        hr{border:none;border-top:1px dashed #999;margin:8px 0;}
        table{width:100%;font-size:13px;border-collapse:collapse;}
        td{padding:2px 0;}
        .total td{font-size:16px;font-weight:bold;}
        .thank{text-align:center;font-size:11px;color:#888;margin-top:12px;}
      </style></head>
      <body>
        <h1>${restaurantName}</h1>
        <p class="sub">Table ${table.number}</p>
        <p class="sub">${new Date().toLocaleString()}</p>
        <hr/>
        <table>${itemsHtml}</table>
        <hr/>
        <table>
          <tr><td>Subtotal</td><td style="text-align:right">${formatMoney(table.subtotal, currency)}</td></tr>
          <tr><td>Tax (${taxRate}%)</td><td style="text-align:right">${formatMoney(table.tax, currency)}</td></tr>
        </table>
        <hr/>
        <table><tr class="total"><td>TOTAL</td><td style="text-align:right">${formatMoney(table.total, currency)}</td></tr></table>
        <p class="thank">Thank you for dining with us!</p>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);
    const iDoc = iframe.contentWindow?.document;
    if (!iDoc) { document.body.removeChild(iframe); return; }
    iDoc.open();
    iDoc.write(html);
    iDoc.close();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
    onPay();
  };
  return (
    <div>
      <div id="printable-receipt" className="bg-white border border-dashed border-slate-300 rounded-xl p-4 font-mono text-sm">
        <div className="text-center mb-3">
          <p className="font-bold text-base">{restaurantName}</p>
          <p className="text-xs text-slate-500">Table {table.number}</p>
          <p className="text-xs text-slate-500">{new Date().toLocaleString()}</p>
        </div>
        <div className="border-t border-dashed border-slate-300 my-2" />
        {allItems.map((item, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span>{item.quantity}× {item.name}</span>
            <span>{formatMoney(item.price * item.quantity, currency)}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-slate-300 my-2" />
        <div className="flex justify-between py-0.5 text-slate-600">
          <span>Subtotal</span>
          <span>{formatMoney(table.subtotal, currency)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-slate-600">
          <span>Tax ({taxRate}%)</span>
          <span>{formatMoney(table.tax, currency)}</span>
        </div>
        <div className="border-t border-dashed border-slate-300 my-2" />
        <div className="flex justify-between font-bold text-base">
          <span>TOTAL</span>
          <span>{formatMoney(table.total, currency)}</span>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">Thank you for dining with us!</p>
      </div>
      <button
        onClick={print}
        className="w-full mt-4 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 transition"
      >
        <Printer size={18} />
        Generate Bill & Print Receipt
      </button>
    </div>
  );
}
