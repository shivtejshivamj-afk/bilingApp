import { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuItem, Order, SalesLog, Settings } from '@/types';
import * as storage from './storage';
import { broadcastFullSync, subscribeToFullSync } from './sync';
import {
  fetchOrders,
  insertOrder,
  updateOrder,
  deleteOrdersByTable,
  deleteOrderById,
  subscribeToOrderEvents,
  saveSettingsRemote,
  fetchCategories,
  saveCategoriesRemote,
  fetchRestaurantById,
  subscribeToRestaurantEvents,
  fetchMenu,
  upsertMenuItem,
  deleteMenuItem,
  subscribeToMenuEvents,
} from './sync';
import { useRestaurantId } from './restaurantContext';

// ---------------------------------------------------------------------------
// Menu — a real shared table now (previously local-storage-only), scoped to
// the current restaurant.
// ---------------------------------------------------------------------------

export function useMenu() {
  const restaurantId = useRestaurantId();
  const [menu, setMenuState] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const currentRef = useRef<MenuItem[]>([]);

  const updateState = useCallback((next: MenuItem[]) => {
    currentRef.current = next;
    setMenuState(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMenu(restaurantId);
      updateState(data);
    } catch (e) {
      console.error('Failed to load menu:', e);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, updateState]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeToMenuEvents(restaurantId, refresh);
  }, [restaurantId, refresh]);

  // Callers pass the FULL next array (same shape as the old local-storage
  // API, to avoid touching every call site) — we diff against what we had
  // and turn that into the right upsert/delete calls against Supabase.
  const save = useCallback(
    (next: MenuItem[]) => {
      const prevIds = new Set(currentRef.current.map((m) => m.id));
      const nextIds = new Set(next.map((m) => m.id));
      const toDelete = [...prevIds].filter((id) => !nextIds.has(id));
      updateState(next);

      Promise.all([
        ...toDelete.map((id) =>
          deleteMenuItem(restaurantId, id).catch((e) => console.error('Failed to delete menu item:', e))
        ),
        ...next.map((m) =>
          upsertMenuItem(restaurantId, m).catch((e) => console.error('Failed to save menu item:', e))
        ),
      ]);
    },
    [restaurantId, updateState]
  );

  return { menu, loading, setMenu: save };
}

// ---------------------------------------------------------------------------
// Orders — scoped to the current restaurant.
// ---------------------------------------------------------------------------

export function useOrders() {
  const restaurantId = useRestaurantId();
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef<Order[]>([]);

  const updateState = useCallback((next: Order[]) => {
    currentRef.current = next;
    setOrdersState(next);
  }, []);

  // Load from Supabase on mount / whenever the restaurant changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchOrders(restaurantId);
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
  }, [restaurantId, updateState]);

  // Subscribe to realtime changes — primary source of cross-device sync
  useEffect(() => {
    const unsub = subscribeToOrderEvents(restaurantId, (event) => {
      const current = currentRef.current;
      if (event.type === 'INSERT') {
        if (!current.find((o) => o.id === event.order.id)) {
          updateState([event.order, ...current]);
        }
      } else if (event.type === 'UPDATE') {
        updateState(current.map((o) => (o.id === event.order.id ? event.order : o)));
      } else if (event.type === 'DELETE') {
        updateState(current.filter((o) => o.id !== event.orderId));
      }
    });
    return unsub;
  }, [restaurantId, updateState]);

  // Safety-net polling: re-fetches every few seconds so orders still show up
  // promptly even if realtime hiccups for any reason (e.g. a dropped
  // websocket, or a Supabase project setting) — without this, a missed
  // realtime event would otherwise require a manual page refresh to notice.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchOrders(restaurantId);
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
  }, [restaurantId, updateState]);

  const addOrder = useCallback(async (order: Order): Promise<void> => {
    updateState([order, ...currentRef.current]);
    await insertOrder(restaurantId, order);
  }, [restaurantId, updateState]);

  const patchOrder = useCallback(async (order: Order): Promise<void> => {
    updateState(currentRef.current.map((o) => (o.id === order.id ? order : o)));
    await updateOrder(restaurantId, order);
  }, [restaurantId, updateState]);

  const removeOrdersByTable = useCallback(async (tableNumber: number): Promise<void> => {
    updateState(currentRef.current.filter((o) => o.tableNumber !== tableNumber));
    await deleteOrdersByTable(restaurantId, tableNumber);
  }, [restaurantId, updateState]);

  const removeOrder = useCallback(async (orderId: string): Promise<void> => {
    updateState(currentRef.current.filter((o) => o.id !== orderId));
    await deleteOrderById(restaurantId, orderId);
  }, [restaurantId, updateState]);

  return { orders, loading, error, addOrder, patchOrder, removeOrdersByTable, removeOrder };
}

// ---------------------------------------------------------------------------
// Sound preference — genuinely per-device, not tied to any restaurant.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Settings — scoped to the current restaurant (lives on its `restaurants`
// row now, not a singleton `app_settings` table).
// ---------------------------------------------------------------------------

export function useSettings() {
  const restaurantId = useRestaurantId();
  const [settings, setSettingsState] = useState<Settings>(() => storage.getSettingsCache(restaurantId));

  // Initial load — the local cache gives instant paint, but the database is
  // always the real source of truth, so fetch it fresh on mount too.
  useEffect(() => {
    let cancelled = false;
    fetchRestaurantById(restaurantId)
      .then((record) => {
        if (cancelled || !record) return;
        storage.setSettingsCache(restaurantId, record.settings);
        setSettingsState(record.settings);
      })
      .catch(() => {
        // Offline or unreachable — keep using the local cache.
      });
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Live updates whenever this restaurant's row changes (from any device —
  // admin changes currency -> customer phones update instantly).
  useEffect(() => {
    return subscribeToRestaurantEvents(restaurantId, (record) => {
      storage.setSettingsCache(restaurantId, record.settings);
      setSettingsState(record.settings);
    });
  }, [restaurantId]);

  const save = useCallback((next: Settings) => {
    storage.setSettingsCache(restaurantId, next);
    setSettingsState(next);
    broadcastFullSync();
    saveSettingsRemote(restaurantId, next).catch(() => {
      // If this fails (offline), the local change still applies on this
      // device; it'll be overwritten by the next successful remote fetch.
    });
  }, [restaurantId]);

  return { settings, setSettings: save };
}

// ---------------------------------------------------------------------------
// Sales log — still local-only per device (see storage.ts for why); scoped
// per restaurant so different restaurants on the same browser don't mix.
// ---------------------------------------------------------------------------

export function useSales() {
  const restaurantId = useRestaurantId();
  const [sales, setSalesState] = useState<SalesLog[]>(() => storage.getSales(restaurantId));

  const refresh = useCallback(() => setSalesState(storage.getSales(restaurantId)), [restaurantId]);

  useEffect(() => {
    setSalesState(storage.getSales(restaurantId));
  }, [restaurantId]);

  useEffect(() => {
    return subscribeToFullSync(() => setSalesState(storage.getSales(restaurantId)));
  }, [restaurantId]);

  return { sales, refresh };
}

// ---------------------------------------------------------------------------
// Categories — a column on the restaurant's own row.
// ---------------------------------------------------------------------------

export function useCategories() {
  const restaurantId = useRestaurantId();
  const [categories, setCategoriesState] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCategories(restaurantId)
      .then((data) => { if (!cancelled) setCategoriesState(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => {
    return subscribeToRestaurantEvents(restaurantId, () => {
      fetchCategories(restaurantId).then(setCategoriesState).catch(() => {});
    });
  }, [restaurantId]);

  const save = useCallback((next: string[]) => {
    setCategoriesState(next);
    saveCategoriesRemote(restaurantId, next).catch((e) => console.error('Failed to save categories:', e));
  }, [restaurantId]);

  return { categories, setCategories: save };
}
