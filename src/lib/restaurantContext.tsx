import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Settings } from '@/types';
import {
  fetchRestaurantBySlug,
  seedMenu,
  signUp,
  subscribeToRestaurantEvents,
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

  // Deliberately does NOT reset status back to 'loading' — doing so would
  // unmount the whole restaurant tree below it (since 'loading' renders a
  // completely different subtree), wiping out any local component state
  // (like "am I logged in?") that lives further down. A silent in-place
  // update avoids that remount entirely.
  const refresh = useCallback(() => {
    fetchRestaurantBySlug(slug)
      .then((r) => {
        if (r) setState({ status: 'found', restaurant: r });
        // If the restaurant genuinely disappeared, leave the current state
        // alone rather than yanking the user to a "not found" screen mid-session.
      })
      .catch(() => {
        // Network hiccup — keep showing what we already have.
      });
  }, [slug]);

  useEffect(() => {
    setState({ status: 'loading' });
    fetchRestaurantBySlug(slug)
      .then((r) => setState(r ? { status: 'found', restaurant: r } : { status: 'not-found' }))
      .catch(() => setState({ status: 'not-found' }));
  }, [slug]);

  // Live updates to the restaurant's own row — this is what makes a
  // suspend/reject/approve from Platform Admin take effect immediately for
  // anyone already using this restaurant's dashboard, instead of only on
  // their next page load.
  const restaurantId = state.status === 'found' ? state.restaurant.id : null;
  useEffect(() => {
    if (!restaurantId) return;
    return subscribeToRestaurantEvents(restaurantId, (updated) => {
      setState({ status: 'found', restaurant: updated });
    });
  }, [restaurantId]);

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
  // Send the confirmation email straight to this restaurant's own admin
  // login (not the generic homepage) — so clicking "Confirm" in the email
  // lands the owner exactly where they need to sign in, not on the
  // marketing/intro page.
  const authResult = await signUp(email, password, buildRestaurantUrl(slug, { admin: true }), { restaurantSlug: slug, restaurantName: name });
  if ('error' in authResult) return authResult.error;

  // The database trigger creates the tenant row from the authenticated
  // user's signup metadata. This works even when email confirmation is
  // enabled, because the browser no longer needs to insert a row as anon.
  const created = await fetchRestaurantBySlug(slug);
  if (!created) return 'Your account was created, but the restaurant setup did not finish. Please try again or contact support.';

  // Give every new restaurant a starter menu when a live session is already
  // available. If Supabase requires email confirmation first, this insert can
  // be completed later by the owner from the dashboard.
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
