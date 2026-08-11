import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full ${maxWidth} bg-white rounded-t-2xl sm:rounded-2xl shadow-ticket-lg max-h-[92vh] flex flex-col animate-[slideUp_0.25s_cubic-bezier(0.22,1,0.36,1)]`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 shrink-0">
          <h3 className="text-lg font-bold font-display text-ink-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: 'bg-paprika-100 text-paprika-700 ring-paprika-200',
    Pending: 'bg-saffron-100 text-saffron-800 ring-saffron-200',
    Cooking: 'bg-saffron-100 text-saffron-800 ring-saffron-200',
    Served: 'bg-basil-100 text-basil-700 ring-basil-200',
    Acknowledged: 'bg-ink-100 text-ink-600 ring-ink-200',
    Ready: 'bg-basil-100 text-basil-700 ring-basil-200',
    Billed: 'bg-ink-100 text-ink-500 ring-ink-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset transition-colors ${map[status] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}`}
    >
      {status}
    </span>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-ticket-lg p-6 animate-[pop_0.2s_ease]">
        <h3 className="text-lg font-bold font-display text-ink-900 mb-2">{title}</h3>
        <p className="text-sm text-ink-500 mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm hover:shadow-md ${danger ? 'bg-paprika-500 hover:bg-paprika-600' : 'bg-ink-900 hover:bg-ink-800'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
