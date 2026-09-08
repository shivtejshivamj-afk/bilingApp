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
import type { RestaurantRecord } from './sync';

// Shared, reference-counted realtime subscription for the restaurant's own
// row — used by both useSettings() and useCategories() below. Without this,
// each of those hooks would open its own separate realtime channel to the
// exact same row, doubling the number of simultaneous connections for no
// benefit. Fewer concurrent channels means less connection/auth overhead
// overall.
const restaurantListeners = new Map<string, Set<(r: RestaurantRecord) => void>>();
const restaurantUnsubscribers = new Map<string, () => void>();

function subscribeToRestaurantShared(restaurantId: string, listener: (r: RestaurantRecord) => void): () => void {
  if (!restaurantListeners.has(restaurantId)) {
    restaurantListeners.set(restaurantId, new Set());
  }
  const listeners = restaurantListeners.get(restaurantId)!;
  listeners.add(listener);

  if (!restaurantUnsubscribers.has(restaurantId)) {
    const unsub = subscribeToRestaurantEvents(restaurantId, (record) => {
      restaurantListeners.get(restaurantId)?.forEach((l) => l(record));
    });
    restaurantUnsubscribers.set(restaurantId, unsub);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      restaurantUnsubscribers.get(restaurantId)?.();
      restaurantUnsubscribers.delete(restaurantId);
      restaurantListeners.delete(restaurantId);
    }
  };
}


// ---------------------------------------------------------------------------
// Menu — a real shared table now (previously local-storage-only), scoped to
// the current restaurant.
// ---------------------------------------------------------------------------

// Same shared-store approach as useOrders() below — useMenu() is called
// from several places at once (CustomerApp, MenuManager, ManualOrderModal),
// so this avoids each one opening its own separate realtime connection.
interface MenuStore {
  menu: MenuItem[];
  loading: boolean;
  listeners: Set<() => void>;
  refCount: number;
  teardown: () => void;
}

const menuStores = new Map<string, MenuStore>();

function getOrCreateMenuStore(restaurantId: string): MenuStore {
  let store = menuStores.get(restaurantId);
  if (store) return store;

  store = { menu: [], loading: true, listeners: new Set(), refCount: 0, teardown: () => {} };
  menuStores.set(restaurantId, store);

  const notify = () => store!.listeners.forEach((l) => l());

  const refresh = async () => {
    try {
      const data = await fetchMenu(restaurantId);
      store!.menu = data;
    } catch (e) {
      console.error('Failed to load menu:', e);
    } finally {
      store!.loading = false;
      notify();
    }
  };

  refresh();
  const unsub = subscribeToMenuEvents(restaurantId, refresh);

  store.teardown = () => {
    unsub();
    menuStores.delete(restaurantId);
  };

  return store;
}

export function useMenu() {
  const restaurantId = useRestaurantId();
  const [, forceRender] = useState(0);
  const storeRef = useRef<MenuStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = getOrCreateMenuStore(restaurantId);
  }

  useEffect(() => {
    const store = getOrCreateMenuStore(restaurantId);
    storeRef.current = store;
    store.refCount++;
    const listener = () => forceRender((n) => n + 1);
    store.listeners.add(listener);
    forceRender((n) => n + 1);

    return () => {
      store.listeners.delete(listener);
      store.refCount--;
      if (store.refCount <= 0) {
        setTimeout(() => {
          if (store.refCount <= 0) store.teardown();
        }, 2000);
      }
    };
  }, [restaurantId]);

  const store = storeRef.current;

  // Callers pass the FULL next array (same shape as the old local-storage
  // API, to avoid touching every call site) — we diff against what we had
  // and turn that into the right upsert/delete calls against Supabase.
  const save = useCallback(
    (next: MenuItem[]) => {
      const s = getOrCreateMenuStore(restaurantId);
      const prevIds = new Set(s.menu.map((m) => m.id));
      const nextIds = new Set(next.map((m) => m.id));
      const toDelete = [...prevIds].filter((id) => !nextIds.has(id));
      s.menu = next;
      s.listeners.forEach((l) => l());

      Promise.all([
        ...toDelete.map((id) =>
          deleteMenuItem(restaurantId, id).catch((e) => console.error('Failed to delete menu item:', e))
        ),
        ...next.map((m) =>
          upsertMenuItem(restaurantId, m).catch((e) => console.error('Failed to save menu item:', e))
        ),
      ]);
    },
    [restaurantId]
  );

  return { menu: store.menu, loading: store.loading, setMenu: save };
}

// ---------------------------------------------------------------------------
// Orders — scoped to the current restaurant.
// ---------------------------------------------------------------------------

// Shared, reference-counted store: every component that calls useOrders()
// for the same restaurant shares ONE underlying fetch, ONE realtime
// connection, and ONE polling timer, instead of each caller independently
// opening its own (this hook is called from several places at once —
// AdminDashboard, OrderManagement, TableManagement — and duplicating all of
// that per-caller was real, unnecessary load, contributing to hitting
// Supabase's rate limits under normal use).
interface OrdersStore {
  orders: Order[];
  loading: boolean;
  error: string | null;
  listeners: Set<() => void>;
  refCount: number;
  teardown: () => void;
}

const orderStores = new Map<string, OrdersStore>();

function getOrCreateOrderStore(restaurantId: string): OrdersStore {
  let store = orderStores.get(restaurantId);
  if (store) return store;

  store = {
    orders: [],
    loading: true,
    error: null,
    listeners: new Set(),
    refCount: 0,
    teardown: () => {},
  };
  orderStores.set(restaurantId, store);

  const notify = () => store!.listeners.forEach((l) => l());

  const setOrders = (next: Order[]) => {
    store!.orders = next;
    notify();
  };

  let cancelled = false;

  fetchOrders(restaurantId)
    .then((data) => {
      if (cancelled) return;
      store!.orders = data;
      store!.loading = false;
      store!.error = null;
      notify();
    })
    .catch((e: any) => {
      if (cancelled) return;
      store!.loading = false;
      store!.error = e?.message ?? 'Failed to load orders';
      notify();
    });

  const unsubRealtime = subscribeToOrderEvents(restaurantId, (event) => {
    const current = store!.orders;
    if (event.type === 'INSERT') {
      if (!current.find((o) => o.id === event.order.id)) {
        setOrders([event.order, ...current]);
      }
    } else if (event.type === 'UPDATE') {
      setOrders(current.map((o) => (o.id === event.order.id ? event.order : o)));
    } else if (event.type === 'DELETE') {
      setOrders(current.filter((o) => o.id !== event.orderId));
    }
  });

  // Safety-net polling: re-fetches periodically so orders still show up
  // promptly even if realtime hiccups for any reason — skipped while the
  // tab isn't visible, since no one's watching it anyway.
  const interval = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await fetchOrders(restaurantId);
      const current = store!.orders;
      const changed =
        data.length !== current.length ||
        data.some((o, i) => o.id !== current[i]?.id || o.status !== current[i]?.status ||
          JSON.stringify(o.items) !== JSON.stringify(current[i]?.items));
      if (changed) setOrders(data);
    } catch {
      // Silently skip this poll — realtime or the next poll will catch up.
    }
  }, 15000);

  store.teardown = () => {
    cancelled = true;
    unsubRealtime();
    clearInterval(interval);
    orderStores.delete(restaurantId);
  };

  return store;
}

export function useOrders() {
  const restaurantId = useRestaurantId();
  const [, forceRender] = useState(0);
  const storeRef = useRef<OrdersStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = getOrCreateOrderStore(restaurantId);
  }

  useEffect(() => {
    const store = getOrCreateOrderStore(restaurantId);
    storeRef.current = store;
    store.refCount++;
    const listener = () => forceRender((n) => n + 1);
    store.listeners.add(listener);
    forceRender((n) => n + 1); // pick up anything that arrived before this effect ran

    return () => {
      store.listeners.delete(listener);
      store.refCount--;
      if (store.refCount <= 0) {
        // Give a brief grace period before tearing down — avoids a
        // pointless disconnect+reconnect when e.g. switching tabs quickly
        // causes one consumer to unmount right as another is about to
        // mount for the same restaurant.
        setTimeout(() => {
          if (store.refCount <= 0) store.teardown();
        }, 2000);
      }
    };
  }, [restaurantId]);

  const store = storeRef.current;

  const addOrder = useCallback(async (order: Order): Promise<void> => {
    const s = getOrCreateOrderStore(restaurantId);
    s.orders = [order, ...s.orders];
    s.listeners.forEach((l) => l());
    await insertOrder(restaurantId, order);
  }, [restaurantId]);

  const patchOrder = useCallback(async (order: Order): Promise<void> => {
    const s = getOrCreateOrderStore(restaurantId);
    s.orders = s.orders.map((o) => (o.id === order.id ? order : o));
    s.listeners.forEach((l) => l());
    await updateOrder(restaurantId, order);
  }, [restaurantId]);

  const removeOrdersByTable = useCallback(async (tableNumber: number): Promise<void> => {
    const s = getOrCreateOrderStore(restaurantId);
    s.orders = s.orders.filter((o) => o.tableNumber !== tableNumber);
    s.listeners.forEach((l) => l());
    await deleteOrdersByTable(restaurantId, tableNumber);
  }, [restaurantId]);

  const removeOrder = useCallback(async (orderId: string): Promise<void> => {
    const s = getOrCreateOrderStore(restaurantId);
    s.orders = s.orders.filter((o) => o.id !== orderId);
    s.listeners.forEach((l) => l());
    await deleteOrderById(restaurantId, orderId);
  }, [restaurantId]);

  return {
    orders: store.orders,
    loading: store.loading,
    error: store.error,
    addOrder,
    patchOrder,
    removeOrdersByTable,
    removeOrder,
  };
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

// Shared store — same reasoning as useOrders()/useMenu() above. Even though
// the realtime subscription was already deduped via
// subscribeToRestaurantShared, this hook is called from around a dozen
// places at once, and each one was independently doing its own initial
// fetch on mount — up to several simultaneous authenticated requests every
// time more than one admin screen/component happened to mount together.
interface SettingsStore {
  settings: Settings;
  listeners: Set<() => void>;
  refCount: number;
  teardown: () => void;
}

const settingsStores = new Map<string, SettingsStore>();

function getOrCreateSettingsStore(restaurantId: string): SettingsStore {
  let store = settingsStores.get(restaurantId);
  if (store) return store;

  store = {
    settings: storage.getSettingsCache(restaurantId),
    listeners: new Set(),
    refCount: 0,
    teardown: () => {},
  };
  settingsStores.set(restaurantId, store);

  const notify = () => store!.listeners.forEach((l) => l());

  fetchRestaurantById(restaurantId)
    .then((record) => {
      if (!record) return;
      storage.setSettingsCache(restaurantId, record.settings);
      store!.settings = record.settings;
      notify();
    })
    .catch(() => {
      // Offline or unreachable — keep using the local cache.
    });

  const unsub = subscribeToRestaurantShared(restaurantId, (record) => {
    storage.setSettingsCache(restaurantId, record.settings);
    store!.settings = record.settings;
    notify();
  });

  store.teardown = () => {
    unsub();
    settingsStores.delete(restaurantId);
  };

  return store;
}

export function useSettings() {
  const restaurantId = useRestaurantId();
  const [, forceRender] = useState(0);
  const storeRef = useRef<SettingsStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = getOrCreateSettingsStore(restaurantId);
  }

  useEffect(() => {
    const store = getOrCreateSettingsStore(restaurantId);
    storeRef.current = store;
    store.refCount++;
    const listener = () => forceRender((n) => n + 1);
    store.listeners.add(listener);
    forceRender((n) => n + 1);

    return () => {
      store.listeners.delete(listener);
      store.refCount--;
      if (store.refCount <= 0) {
        setTimeout(() => {
          if (store.refCount <= 0) store.teardown();
        }, 2000);
      }
    };
  }, [restaurantId]);

  const store = storeRef.current;

  const save = useCallback((next: Settings) => {
    const s = getOrCreateSettingsStore(restaurantId);
    storage.setSettingsCache(restaurantId, next);
    s.settings = next;
    s.listeners.forEach((l) => l());
    broadcastFullSync();
    saveSettingsRemote(restaurantId, next).catch(() => {
      // If this fails (offline), the local change still applies on this
      // device; it'll be overwritten by the next successful remote fetch.
    });
  }, [restaurantId]);

  return { settings: store.settings, setSettings: save };
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

interface CategoriesStore {
  categories: string[];
  listeners: Set<() => void>;
  refCount: number;
  teardown: () => void;
}

const categoriesStores = new Map<string, CategoriesStore>();

function getOrCreateCategoriesStore(restaurantId: string): CategoriesStore {
  let store = categoriesStores.get(restaurantId);
  if (store) return store;

  store = { categories: [], listeners: new Set(), refCount: 0, teardown: () => {} };
  categoriesStores.set(restaurantId, store);

  const notify = () => store!.listeners.forEach((l) => l());

  fetchCategories(restaurantId)
    .then((data) => {
      store!.categories = data;
      notify();
    })
    .catch(() => {});

  const unsub = subscribeToRestaurantShared(restaurantId, () => {
    fetchCategories(restaurantId)
      .then((data) => {
        store!.categories = data;
        notify();
      })
      .catch(() => {});
  });

  store.teardown = () => {
    unsub();
    categoriesStores.delete(restaurantId);
  };

  return store;
}

export function useCategories() {
  const restaurantId = useRestaurantId();
  const [, forceRender] = useState(0);
  const storeRef = useRef<CategoriesStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = getOrCreateCategoriesStore(restaurantId);
  }

  useEffect(() => {
    const store = getOrCreateCategoriesStore(restaurantId);
    storeRef.current = store;
    store.refCount++;
    const listener = () => forceRender((n) => n + 1);
    store.listeners.add(listener);
    forceRender((n) => n + 1);

    return () => {
      store.listeners.delete(listener);
      store.refCount--;
      if (store.refCount <= 0) {
        setTimeout(() => {
          if (store.refCount <= 0) store.teardown();
        }, 2000);
      }
    };
  }, [restaurantId]);

  const store = storeRef.current;

  const save = useCallback((next: string[]) => {
    const s = getOrCreateCategoriesStore(restaurantId);
    s.categories = next;
    s.listeners.forEach((l) => l());
    saveCategoriesRemote(restaurantId, next).catch((e) => console.error('Failed to save categories:', e));
  }, [restaurantId]);

  return { categories: store.categories, setCategories: save };
}
