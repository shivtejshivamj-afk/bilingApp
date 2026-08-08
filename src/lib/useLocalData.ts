import { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuItem, Order, SalesLog, Settings } from '@/types';
import * as storage from './storage';
import { broadcastFullSync, subscribeToFullSync } from './sync';
import {
  fetchOrders,
  insertOrder,
  updateOrder,
  deleteOrdersByTable,
  subscribeToOrderEvents,
} from './sync';
import { DEFAULT_SETTINGS, SEED_MENU } from './seed';

function init() {
  if (localStorage.getItem('rbs_menu') === null) {
    localStorage.setItem('rbs_menu', JSON.stringify(SEED_MENU));
  }
  if (localStorage.getItem('rbs_settings') === null) {
    localStorage.setItem('rbs_settings', JSON.stringify(DEFAULT_SETTINGS));
  }
  repairArrayKey('rbs_orders');
  repairArrayKey('rbs_sales');
  repairArrayKey('rbs_menu');
}

function repairArrayKey(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(key, '[]');
    }
  } catch {
    localStorage.setItem(key, '[]');
  }
}

init();

export function useMenu() {
  const [menu, setMenuState] = useState<MenuItem[]>(() => storage.getMenu());

  const save = useCallback((next: MenuItem[]) => {
    storage.setMenu(next);
    setMenuState(next);
    broadcastFullSync();
  }, []);

  useEffect(() => {
    return subscribeToFullSync(() => setMenuState(storage.getMenu()));
  }, []);

  return { menu, setMenu: save };
}

export function useOrders() {
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef<Order[]>([]);

  const updateState = useCallback((next: Order[]) => {
    currentRef.current = next;
    setOrdersState(next);
  }, []);

  // Load from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchOrders();
        if (!cancelled) {
          updateState(data);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load orders');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [updateState]);

  // Subscribe to realtime changes — single source of truth for cross-device sync
  useEffect(() => {
    const unsub = subscribeToOrderEvents((event) => {
      const current = currentRef.current;
      if (event.type === 'INSERT') {
        if (!current.find((o) => o.id === event.order.id)) {
          updateState([event.order, ...current]);
        }
      } else if (event.type === 'UPDATE') {
        updateState(current.map((o) => (o.id === event.order.id ? event.order : o)));
      } else if (event.type === 'DELETE') {
        updateState(current.filter((o) => o.tableNumber !== event.tableNumber));
      }
    });
    return unsub;
  }, [updateState]);

  // Direct async operations — callers use these instead of setOrders diffing
  const addOrder = useCallback(async (order: Order): Promise<void> => {
    updateState([order, ...currentRef.current]);
    await insertOrder(order);
  }, [updateState]);

  const patchOrder = useCallback(async (order: Order): Promise<void> => {
    updateState(currentRef.current.map((o) => (o.id === order.id ? order : o)));
    await updateOrder(order);
  }, [updateState]);

  const removeOrdersByTable = useCallback(async (tableNumber: number): Promise<void> => {
    updateState(currentRef.current.filter((o) => o.tableNumber !== tableNumber));
    await deleteOrdersByTable(tableNumber);
  }, [updateState]);

  return { orders, loading, error, addOrder, patchOrder, removeOrdersByTable };
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(() => storage.getSettings());

  const save = useCallback((next: Settings) => {
    storage.setSettings(next);
    setSettingsState(next);
    broadcastFullSync();
  }, []);

  useEffect(() => {
    return subscribeToFullSync(() => setSettingsState(storage.getSettings()));
  }, []);

  return { settings, setSettings: save };
}

export function useSales() {
  const [sales, setSalesState] = useState<SalesLog[]>(() => storage.getSales());

  const refresh = useCallback(() => setSalesState(storage.getSales()), []);
  return { sales, refresh };
}

export function useCategories() {
  const [categories, setCategoriesState] = useState<string[]>(() => storage.getCategories());

  const save = useCallback((next: string[]) => {
    storage.setCategories(next);
    setCategoriesState(next);
    broadcastFullSync();
  }, []);

  useEffect(() => {
    return subscribeToFullSync(() => setCategoriesState(storage.getCategories()));
  }, []);

  return { categories, setCategories: save };
}
