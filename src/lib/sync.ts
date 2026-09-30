import type { MenuItem, Order, SalesLog, Settings } from '@/types';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Authentication — each restaurant admin gets a real account. See the
// 20260901000000_restaurant_auth.sql migration for the security model this
// backs (ownership-based RLS instead of a shared PIN with an open API key).
// ---------------------------------------------------------------------------

export async function signUp(
  email: string,
  password: string,
  emailRedirectTo?: string,
  restaurantMeta?: { restaurantSlug: string; restaurantName: string },
): Promise<{ userId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      ...(restaurantMeta
        ? { data: { restaurant_slug: restaurantMeta.restaurantSlug, restaurant_name: restaurantMeta.restaurantName } }
        : {}),
    },
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'Account creation did not return a user. Please try again.' };
  return { userId: data.user.id };
}

export async function signIn(email: string, password: string): Promise<{ userId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'Sign in did not return a user. Please try again.' };
  return { userId: data.user.id };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Ensures the customer has an anonymous Supabase session.
 *
 * Order access is scoped by `orders.customer_id = auth.uid()` in the database,
 * so there is no client-writable table-session mapping that can be abused to
 * unlock another restaurant's orders.
 */
export async function ensureTableSession(_restaurantId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) return;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Failed to start anonymous session:', error.message);
  }
}

export async function requestPasswordReset(email: string, redirectTo: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { error: error.message };
  return {};
}

export async function updatePassword(newPassword: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return {};
}

/** Fires when the user arrives via a password-reset email link. Supabase
 * establishes a temporary recovery session and emits this event once it
 * detects the token in the URL — from there, updatePassword() can be used
 * to actually change it. */
export function onPasswordRecovery(callback: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
  return () => data.subscription.unsubscribe();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export function onAuthChange(callback: (userId: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Supabase fires an 'INITIAL_SESSION' event immediately on subscribe,
    // sometimes before it's fully finished reading the persisted session
    // from storage — trusting it here could momentarily (and incorrectly)
    // report "not logged in" right after a real login, racing against an
    // explicit getCurrentUserId() check done elsewhere for the same
    // purpose. Only forward genuine transitions.
    if (event === 'INITIAL_SESSION') return;
    callback(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Restaurants — the tenant registry. Every other table is scoped to one of
// these via restaurant_id.
// ---------------------------------------------------------------------------

export type RestaurantStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface RestaurantRecord {
  id: string;
  slug: string;
  ownerId: string | null;
  status: RestaurantStatus;
  settings: Settings;
}

function rowToRestaurant(row: any): RestaurantRecord {
  return {
    id: row.id,
    slug: row.slug,
    ownerId: row.owner_id ?? null,
    status: (row.status ?? 'approved') as RestaurantStatus,
    settings: {
      restaurantName: row.name,
      taxRate: Number(row.tax_rate),
      currency: row.currency,
      tableCount: row.table_count,
    },
  };
}

const RESTAURANT_PUBLIC_COLUMNS = 'id, slug, owner_id, status, name, tax_rate, currency, table_count, categories, created_at';

export async function fetchRestaurantById(id: string): Promise<RestaurantRecord | null> {
  const { data, error } = await supabase.from('restaurants').select(RESTAURANT_PUBLIC_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToRestaurant(data) : null;
}

export async function fetchRestaurantBySlug(slug: string): Promise<RestaurantRecord | null> {
  const { data, error } = await supabase
    .from('restaurants')
    .select(RESTAURANT_PUBLIC_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRestaurant(data) : null;
}

/** Creates a restaurant for the currently authenticated user. The actual
 * insert happens in a SECURITY DEFINER function that takes auth.uid(), so the
 * client cannot choose another user's owner_id. */
export async function createRestaurant(slug: string, name: string): Promise<RestaurantRecord | null> {
  const { data, error } = await supabase.rpc('create_restaurant', {
    new_slug: slug,
    new_name: name,
  });
  if (error) {
    if ((error as any).code === '23505') return null;
    throw error;
  }
  const restaurantId = data as string | null;
  if (!restaurantId) return null;
  return fetchRestaurantById(restaurantId);
}

// ---------------------------------------------------------------------------
// Platform admin — approving/rejecting new restaurant signups. Access is
// controlled by Supabase Auth plus the platform_admins allow-list.
// ---------------------------------------------------------------------------

export async function isPlatformAdmin(): Promise<boolean> {
  // Force the persisted Supabase session to be restored before checking the
  // database allow-list (important on a fresh page load).
  await supabase.auth.getSession();
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) return false;
  return data === true;
}

export async function fetchAllRestaurants(): Promise<RestaurantRecord[]> {
  const { data, error } = await supabase.from('restaurants').select(RESTAURANT_PUBLIC_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToRestaurant);
}

export async function setRestaurantStatus(restaurantId: string, status: RestaurantStatus): Promise<void> {
  const { error } = await supabase.rpc('set_restaurant_status', { target_id: restaurantId, new_status: status });
  if (error) throw error;
}

export async function fetchCategories(restaurantId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('categories')
    .eq('id', restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data?.categories ?? [];
}

export async function saveCategoriesRemote(restaurantId: string, categories: string[]): Promise<void> {
  const { error } = await supabase.from('restaurants').update({ categories }).eq('id', restaurantId);
  if (error) throw error;
}

export async function saveSettingsRemote(restaurantId: string, settings: Settings): Promise<void> {
  const { error } = await supabase
    .from('restaurants')
    .update({
      name: settings.restaurantName,
      tax_rate: settings.taxRate,
      currency: settings.currency,
      table_count: settings.tableCount,
    })
    .eq('id', restaurantId);
  if (error) throw error;
}

/** Returns false if the new slug is already taken by another restaurant. */
export async function changeRestaurantSlug(restaurantId: string, newSlug: string): Promise<boolean> {
  const { error } = await supabase.from('restaurants').update({ slug: newSlug }).eq('id', restaurantId);
  if (error) {
    if ((error as any).code === '23505') return false; // unique_violation
    throw error;
  }
  return true;
}

export function subscribeToRestaurantEvents(restaurantId: string, onChange: (r: RestaurantRecord) => void): () => void {
  const channel = supabase
    .channel(`restaurant-realtime-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'restaurants', filter: `id=eq.${restaurantId}` },
      (payload) => {
        if (payload.new) onChange(rowToRestaurant(payload.new));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Orders — scoped to a restaurant.
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

async function orderToRow(restaurantId: string, order: Order) {
  const { data } = await supabase.auth.getSession();
  return {
    id: order.id,
    restaurant_id: restaurantId,
    customer_id: data.session?.user.id ?? null,
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

export async function fetchOrders(restaurantId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToOrder);
}

export async function insertOrder(restaurantId: string, order: Order): Promise<void> {
  const { error } = await supabase.from('orders').insert(await orderToRow(restaurantId, order));
  if (error) throw error;
}

export async function updateOrder(restaurantId: string, order: Order): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update(await orderToRow(restaurantId, order))
    .eq('id', order.id)
    .eq('restaurant_id', restaurantId);
  if (error) throw error;
}

export async function deleteOrdersByTable(restaurantId: string, tableNumber: number): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber);
  if (error) throw error;
}

export async function deleteOrderById(restaurantId: string, orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)
    .eq('restaurant_id', restaurantId);
  if (error) throw error;
}

export type OrderEvent =
  | { type: 'INSERT'; order: Order }
  | { type: 'UPDATE'; order: Order }
  | { type: 'DELETE'; orderId: string };

export function subscribeToOrderEvents(restaurantId: string, onEvent: (e: OrderEvent) => void): () => void {
  const filter = `restaurant_id=eq.${restaurantId}`;
  const channel = supabase
    .channel(`orders-realtime-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter }, (payload) => {
      onEvent({ type: 'INSERT', order: rowToOrder(payload.new) });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter }, (payload) => {
      onEvent({ type: 'UPDATE', order: rowToOrder(payload.new) });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders', filter }, (payload) => {
      // Postgres only guarantees the primary key ("id") is present in the
      // old-row data for DELETE events by default — other columns are NOT
      // reliably included unless REPLICA IDENTITY FULL is set (which we do
      // set for `orders`, but filtering by id is the robust choice either way).
      const deletedId = (payload.old as any).id;
      if (deletedId) onEvent({ type: 'DELETE', orderId: deletedId });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Menu items — scoped to a restaurant. Previously local-storage-only; now a
// real shared table, synced the same way orders are.
// ---------------------------------------------------------------------------

function rowToMenuItem(row: any): MenuItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    category: row.category,
    image: row.image,
    available: row.available,
    isVeg: row.is_veg ?? true,
  };
}

function menuItemToRow(restaurantId: string, item: MenuItem) {
  return {
    id: item.id,
    restaurant_id: restaurantId,
    name: item.name,
    description: item.description,
    price: item.price,
    category: item.category,
    image: item.image,
    available: item.available,
    is_veg: item.isVeg,
  };
}

export async function fetchMenu(restaurantId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId);
  if (error) throw error;
  return (data ?? []).map(rowToMenuItem);
}

export async function upsertMenuItem(restaurantId: string, item: MenuItem): Promise<void> {
  const { error } = await supabase.from('menu_items').upsert(menuItemToRow(restaurantId, item));
  if (error) throw error;
}

export async function deleteMenuItem(restaurantId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId)
    .eq('restaurant_id', restaurantId);
  if (error) throw error;
}

export async function seedMenu(restaurantId: string, items: MenuItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await supabase.from('menu_items').insert(items.map((i) => menuItemToRow(restaurantId, i)));
  if (error) throw error;
}

export function subscribeToMenuEvents(restaurantId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`menu-realtime-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function resetRestaurantData(restaurantId: string): Promise<void> {
  const { error: menuError } = await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
  if (menuError) throw menuError;
  const { error: ordersError } = await supabase.from('orders').delete().eq('restaurant_id', restaurantId);
  if (ordersError) throw ordersError;
}

/** Permanently deletes the restaurant itself — menu items and orders cascade
 * delete automatically via the database's foreign key setup. There is no
 * undo. */
export async function deleteRestaurant(restaurantId: string): Promise<void> {
  const { error } = await supabase.from('restaurants').delete().eq('id', restaurantId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Cross-tab/cross-device full sync — kept for any remaining same-browser
// local-only state (currently just the sales log).
// ---------------------------------------------------------------------------

const CHANNEL = 'rbs_full_sync_channel';

let fullSyncChannel: BroadcastChannel | null = null;

function getFullSyncChannel(): BroadcastChannel | null {
  if (fullSyncChannel) return fullSyncChannel;
  if (typeof BroadcastChannel === 'undefined') return null;
  fullSyncChannel = new BroadcastChannel(CHANNEL);
  return fullSyncChannel;
}

// ---------------------------------------------------------------------------
// Sales — the permanent record of every settled bill, including how it was
// paid. Saved per restaurant in Supabase (see 20261001000000_sales_table.sql)
// so revenue history survives a cleared browser or a change of device.
// ---------------------------------------------------------------------------

function rowToSale(row: any): SalesLog {
  return {
    id: row.id,
    tableNumber: row.table_number,
    items: row.items ?? [],
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    paidAt: Number(row.paid_at),
    paymentMethod: row.payment_method ?? undefined,
  };
}

function saleToRow(restaurantId: string, sale: SalesLog) {
  return {
    id: sale.id,
    restaurant_id: restaurantId,
    table_number: sale.tableNumber,
    items: sale.items,
    subtotal: sale.subtotal,
    tax: sale.tax,
    total: sale.total,
    payment_method: sale.paymentMethod ?? null,
    paid_at: sale.paidAt,
  };
}

// Supabase returns at most 1,000 rows per request, so a busy cafe's history
// has to be read in pages — otherwise older bills would be silently cut off
// and Reports would under-report revenue with no warning.
const SALES_PAGE_SIZE = 1000;
const SALES_MAX_ROWS = 100000; // safety ceiling, far beyond any realistic cafe

export async function fetchSales(restaurantId: string): Promise<SalesLog[]> {
  const all: SalesLog[] = [];
  for (let from = 0; from < SALES_MAX_ROWS; from += SALES_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('paid_at', { ascending: false })
      .range(from, from + SALES_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []).map(rowToSale);
    all.push(...page);
    if (page.length < SALES_PAGE_SIZE) break;
  }
  return all;
}

// ignoreDuplicates: a sale that's already saved is left exactly as it is —
// so retrying an upload (or backfilling old local history) can never
// overwrite or double-count anything.
export async function insertSales(restaurantId: string, sales: SalesLog[]): Promise<void> {
  if (sales.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < sales.length; i += CHUNK) {
    const rows = sales.slice(i, i + CHUNK).map((s) => saleToRow(restaurantId, s));
    const { error } = await supabase
      .from('sales')
      .upsert(rows, { onConflict: 'restaurant_id,id', ignoreDuplicates: true });
    if (error) throw error;
  }
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
