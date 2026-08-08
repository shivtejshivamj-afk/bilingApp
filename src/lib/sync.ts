import type { Order } from '@/types';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Database helpers — orders now live in Supabase, not localStorage.
// ---------------------------------------------------------------------------

function rowToOrder(row: any): Order {
  return {
    id: row.id,
    tableNumber: row.table_number,
    items: row.items,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    status: row.status,
    createdAt: Number(row.created_at),
    customerNote: row.customer_note ?? undefined,
  };
}

function orderToRow(order: Order) {
  return {
    id: order.id,
    table_number: order.tableNumber,
    items: order.items,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    status: order.status,
    customer_note: order.customerNote ?? null,
    created_at: order.createdAt,
  };
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToOrder);
}

export async function insertOrder(order: Order): Promise<void> {
  const { error } = await supabase.from('orders').insert(orderToRow(order));
  if (error) throw error;
}

export async function updateOrder(order: Order): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update(orderToRow(order))
    .eq('id', order.id);
  if (error) throw error;
}

export async function deleteOrdersByTable(tableNumber: number): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('table_number', tableNumber);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Realtime subscription
// ---------------------------------------------------------------------------

export type OrderEvent =
  | { type: 'INSERT'; order: Order }
  | { type: 'UPDATE'; order: Order }
  | { type: 'DELETE'; tableNumber: number };

export function subscribeToOrderEvents(onEvent: (e: OrderEvent) => void): () => void {
  const channel = supabase
    .channel('orders-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      onEvent({ type: 'INSERT', order: rowToOrder(payload.new) });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
      onEvent({ type: 'UPDATE', order: rowToOrder(payload.new) });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
      onEvent({ type: 'DELETE', tableNumber: (payload.old as any).table_number });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Cross-tab/cross-device full sync — kept for menu/settings localStorage sync.
// These still use BroadcastChannel + storage events for same-browser tabs.
// ---------------------------------------------------------------------------

const CHANNEL = 'rbs_full_sync_channel';

let fullSyncChannel: BroadcastChannel | null = null;

function getFullSyncChannel(): BroadcastChannel | null {
  if (fullSyncChannel) return fullSyncChannel;
  if (typeof BroadcastChannel === 'undefined') return null;
  fullSyncChannel = new BroadcastChannel(CHANNEL);
  return fullSyncChannel;
}

export function subscribeToFullSync(listener: () => void): () => void {
  const ch = getFullSyncChannel();
  const handler = () => listener();
  if (ch) ch.addEventListener('message', handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === 'rbs_full_sync') listener();
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    if (ch) ch.removeEventListener('message', handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function broadcastFullSync(): void {
  const ch = getFullSyncChannel();
  if (ch) ch.postMessage({ type: 'FULL_SYNC' });
  localStorage.setItem('rbs_full_sync', String(Date.now()));
}
