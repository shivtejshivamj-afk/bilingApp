import type { SalesLog, Settings } from '@/types';
import { DEFAULT_SETTINGS } from './seed';

// Every key is namespaced by restaurantId so multiple restaurants tested on
// the same browser/device (e.g. during development, or a shared kiosk that
// somehow serves two tenants) never bleed into each other's local data.

function key(restaurantId: string, name: string): string {
  return `rbs_${name}_${restaurantId}`;
}

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(k: string): T[] {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(k: string, value: T): void {
  localStorage.setItem(k, JSON.stringify(value));
}

// Settings cache — instant paint on load, before the network round-trip to
// Supabase resolves. The database is always the source of truth; this is
// just a local mirror of "the last value we saw" for this restaurant.
export function getSettingsCache(restaurantId: string): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(key(restaurantId, 'settings'), {}) };
}

export function setSettingsCache(restaurantId: string, settings: Settings): void {
  write(key(restaurantId, 'settings'), settings);
}

// Sales log — the one piece of data that's still genuinely local-only,
// per-device. See useSales() for why (revenue history isn't yet synced
// through Supabase the way orders/menu/settings are).
export function getSales(restaurantId: string): SalesLog[] {
  return readArray<SalesLog>(key(restaurantId, 'sales'));
}

export function setSales(restaurantId: string, sales: SalesLog[]): void {
  write(key(restaurantId, 'sales'), sales);
}

export function addSale(restaurantId: string, log: SalesLog): void {
  const sales = getSales(restaurantId);
  sales.unshift(log);
  setSales(restaurantId, sales);
}

export function clearRestaurantLocalData(restaurantId: string): void {
  ['settings', 'sales'].forEach((name) => localStorage.removeItem(key(restaurantId, name)));
}
