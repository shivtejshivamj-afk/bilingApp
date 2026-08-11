import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

export interface OrderToast {
  id: string;
  tableNumber: number;
  itemCount: number;
}

interface OrderToastStackProps {
  toasts: OrderToast[];
  onDismiss: (id: string) => void;
}

/**
 * Fixed-position stack of "New Order — Table X" banners. Each toast
 * auto-dismisses itself after a few seconds, or can be dismissed early
 * by clicking the X.
 */
export function OrderToastStack({ toasts, onDismiss }: OrderToastStackProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
      {toasts.map((t) => (
        <OrderToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function OrderToastCard({ toast, onDismiss }: { toast: OrderToast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-700 p-4 flex items-start gap-3 animate-[slideIn_0.2s_ease-out]">
      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
        <Bell size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">New Order — Table {toast.tableNumber}</p>
        <p className="text-slate-400 text-xs mt-0.5">
          {toast.itemCount} item{toast.itemCount !== 1 ? 's' : ''} just placed
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-white shrink-0 -mt-1 -mr-1 p-1"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/**
 * Requests permission for OS-level browser notifications (once), so staff
 * get alerted even if the admin tab isn't focused. Safe to call repeatedly —
 * it only prompts if permission hasn't been decided yet.
 */
export function ensureNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

/**
 * Fires an OS-level notification if permission was granted. No-op otherwise
 * (the in-app toast + sound chime still cover that case).
 */
export function showOsNotification(tableNumber: number, itemCount: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(`New Order — Table ${tableNumber}`, {
      body: `${itemCount} item${itemCount !== 1 ? 's' : ''} just placed`,
      tag: `order-table-${tableNumber}-${Date.now()}`,
    });
  } catch {
    // Some browsers restrict Notification outside a service worker context;
    // fail silently since the in-app toast + sound already cover this.
  }
}

const styleId = 'order-toast-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(16px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
