import type { MenuItem, Order, SalesLog, Settings } from '@/types';
import { DEFAULT_CATEGORIES } from '@/types';
import { DEFAULT_SETTINGS, SEED_MENU } from './seed';

const KEYS = {
  menu: 'rbs_menu',
  orders: 'rbs_orders',
  settings: 'rbs_settings',
  sales: 'rbs_sales',
  categories: 'rbs_categories',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getMenu(): MenuItem[] {
  const menu = readArray<MenuItem>(KEYS.menu);
  if (menu.length === 0) {
    write(KEYS.menu, SEED_MENU);
    return SEED_MENU;
  }
  return menu;
}

export function setMenu(menu: MenuItem[]): void {
  write(KEYS.menu, menu);
}

export function getOrders(): Order[] {
  return readArray<Order>(KEYS.orders);
}

export function setOrders(orders: Order[]): void {
  write(KEYS.orders, orders);
}

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) };
}

export function setSettings(settings: Settings): void {
  write(KEYS.settings, settings);
}

export function getSales(): SalesLog[] {
  return readArray<SalesLog>(KEYS.sales);
}

export function setSales(sales: SalesLog[]): void {
  write(KEYS.sales, sales);
}

export function addSale(log: SalesLog): void {
  const sales = getSales();
  sales.unshift(log);
  setSales(sales);
}

export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

export function getCategories(): string[] {
  const raw = localStorage.getItem(KEYS.categories);
  if (!raw) return DEFAULT_CATEGORIES;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function setCategories(categories: string[]): void {
  localStorage.setItem(KEYS.categories, JSON.stringify(categories));
}
