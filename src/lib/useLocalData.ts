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
  fetchSettings,
  saveSettingsRemote,
  subscribeToSettingsEvents,
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

  // Subscribe to realtime changes — primary source of cross-device sync
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

  // Safety-net polling: re-fetches every few seconds so orders still show up
  // promptly even if realtime hiccups for any reason (e.g. a dropped
  // websocket, or a Supabase project setting) — without this, a missed
  // realtime event would otherwise require a manual page refresh to notice.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchOrders();
        const current = currentRef.current;
        const changed =
          data.length !== current.length ||
          data.some((o, i) => o.id !== current[i]?.id || o.status !== current[i]?.status ||
            JSON.stringify(o.items) !== JSON.stringify(current[i]?.items));
        if (changed) updateState(data);
      } catch {
        // Silently skip this poll — realtime or the next poll will catch up.
      }
    }, 8000);
    return () => clearInterval(interval);
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

// Sound preference is intentionally per-device (not synced through Supabase
// like the rest of Settings) — whether staff want a chime on THIS terminal
// is a local choice, not a restaurant-wide one. Storing it any other way
// means one device muting itself would mute every other device too.
const SOUND_PREF_KEY = 'rbs_sound_enabled';

export function useSoundPreference() {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(SOUND_PREF_KEY);
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });

  const setSoundEnabled = useCallback((next: boolean) => {
    setSoundEnabledState(next);
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(next));
    } catch {
      // Ignore write failures (e.g. private browsing) — the in-memory
      // state for this session still works.
    }
  }, []);

  return { soundEnabled, setSoundEnabled };
}

export function useSettings() {
  // Start from the local cache immediately (so the UI has something to show
  // right away), then reconcile with Supabase — the shared source of truth
  // that every device (admin, kitchen, customer QR menu) reads from.
  const [settings, setSettingsState] = useState<Settings>(() => storage.getSettings());

  // Load the shared settings from Supabase on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchSettings();
        if (!cancelled && remote) {
          storage.setSettings(remote);
          setSettingsState(remote);
        } else if (!cancelled && !remote) {
          // No row yet (e.g. migration hasn't run) — push our local settings
          // up so Supabase becomes the shared baseline going forward.
          const local = storage.getSettings();
          await saveSettingsRemote(local);
        }
      } catch {
        // Offline or Supabase unreachable — keep using the local cache.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live updates from any other device (admin changes currency -> customer
  // phones update instantly without a refresh).
  useEffect(() => {
    return subscribeToSettingsEvents((remote) => {
      storage.setSettings(remote);
      setSettingsState(remote);
    });
  }, []);

  // Same-browser/tab fallback (kept for instant same-device feedback before
  // the network round-trip completes).
  useEffect(() => {
    return subscribeToFullSync(() => setSettingsState(storage.getSettings()));
  }, []);

  const save = useCallback((next: Settings) => {
    storage.setSettings(next);
    setSettingsState(next);
    broadcastFullSync();
    saveSettingsRemote(next).catch(() => {
      // If this fails (offline), the local change still applies on this
      // device; it'll be overwritten by the next successful remote fetch.
    });
  }, []);

  return { settings, setSettings: save };
}

export function useSales() {
  const [sales, setSalesState] = useState<SalesLog[]>(() => storage.getSales());

  const refresh = useCallback(() => setSalesState(storage.getSales()), []);

  useEffect(() => {
    return subscribeToFullSync(() => setSalesState(storage.getSales()));
  }, []);

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
