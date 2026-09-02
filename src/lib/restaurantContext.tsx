import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Settings } from '@/types';
import {
  fetchRestaurantBySlug,
  createRestaurant as createRestaurantRemote,
  seedMenu,
  signUp,
  type RestaurantRecord,
} from './sync';
import { SEED_MENU } from './seed';

/**
 * The first path segment is the restaurant's slug, e.g.
 * yourapp.com/bella-cucina -> "bella-cucina"
 * yourapp.com/bella-cucina?table=5 -> "bella-cucina" (customer QR link)
 * yourapp.com/ (no slug) -> null (shows the platform landing/signup page)
 */
export function getSlugFromPath(): string | null {
  const segment = window.location.pathname.split('/').filter(Boolean)[0];
  return segment || null;
}

export function buildRestaurantUrl(slug: string, opts?: { table?: number; admin?: boolean }): string {
  const origin = `${window.location.protocol}//${window.location.host}`;
  let url = `${origin}/${slug}`;
  if (opts?.table) url += `?table=${opts.table}`;
  if (opts?.admin) url += '#admin';
  return url;
}

const RestaurantIdContext = createContext<string | null>(null);

export function RestaurantProvider({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: React.ReactNode;
}) {
  return <RestaurantIdContext.Provider value={restaurantId}>{children}</RestaurantIdContext.Provider>;
}

/** Every data hook (useSettings, useOrders, useMenu, etc.) calls this internally
 * to know which restaurant's data to read/write. Throws if used outside a
 * RestaurantProvider — every screen that touches restaurant data is rendered
 * inside one once the slug has resolved, so this should never fire in practice. */
export function useRestaurantId(): string {
  const id = useContext(RestaurantIdContext);
  if (!id) {
    throw new Error('useRestaurantId() called outside a RestaurantProvider — this is a bug, not a user-facing error.');
  }
  return id;
}

type ResolveState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'found'; restaurant: RestaurantRecord };

/** Resolves a slug (from the URL) to a restaurant record. Used once, high up
 * in the tree, before rendering anything that needs restaurant data. */
export function useResolveRestaurant(slug: string) {
  const [state, setState] = useState<ResolveState>({ status: 'loading' });

  const refresh = useCallback(() => {
    setState({ status: 'loading' });
    fetchRestaurantBySlug(slug)
      .then((r) => setState(r ? { status: 'found', restaurant: r } : { status: 'not-found' }))
      .catch(() => setState({ status: 'not-found' }));
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

/** Creates a brand-new admin account AND restaurant together (a full
 * signup), seeds it with a starter menu, and returns the created record.
 * Returns a string error message on failure (bad email, slug taken, etc.),
 * or the created restaurant on success. */
export async function signUpRestaurant(
  slug: string,
  name: string,
  email: string,
  password: string
): Promise<RestaurantRecord | string> {
  const authResult = await signUp(email, password);
  if ('error' in authResult) return authResult.error;

  const created = await createRestaurantRemote(slug, name, authResult.userId);
  if (!created) return 'That URL is already taken — try a different one.';

  // Give every new restaurant a starter menu so the admin isn't staring at
  // a completely empty screen — ids are namespaced per-restaurant so two
  // different restaurants seeding at the same time never collide.
  const seeded = SEED_MENU.map((item) => ({ ...item, id: `${created.id}_${item.id}` }));
  try {
    await seedMenu(created.id, seeded);
  } catch {
    // Non-critical — the restaurant still exists even if seeding fails; the
    // admin can add menu items manually.
  }
  return created;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
