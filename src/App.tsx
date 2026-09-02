import { useEffect, useState } from 'react';
import { Utensils, QrCode, ClipboardList, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { getSlugFromPath, useResolveRestaurant, RestaurantProvider, signUpRestaurant, slugify } from '@/lib/restaurantContext';
import { getCurrentUserId, onAuthChange, signOut } from '@/lib/sync';
import { useSettings } from '@/lib/useLocalData';
import type { RestaurantRecord } from '@/lib/sync';
import AdminLogin from '@/admin/AdminLogin';
import AdminDashboard from '@/admin/AdminDashboard';
import CustomerApp from '@/customer/CustomerApp';

function isCustomerRoute(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('table');
}

export default function App() {
  const slug = getSlugFromPath();

  // No slug in the URL at all -> this is the platform's own landing page,
  // where a new restaurant can sign up.
  if (!slug) return <PlatformLanding />;

  return <ResolvedRestaurant slug={slug} />;
}

function ResolvedRestaurant({ slug }: { slug: string }) {
  const { status, restaurant, refresh } = useResolveRestaurant(slug);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-parchment-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-ink-400" size={32} />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="min-h-screen bg-ink-900 text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-paprika-500 flex items-center justify-center mb-6">
          <Utensils size={30} />
        </div>
        <h1 className="text-2xl font-display font-semibold mb-2">No restaurant found at "{slug}"</h1>
        <p className="text-ink-400 max-w-sm mb-6">
          This link doesn't match any restaurant on this platform. Double-check the QR code or link you used.
        </p>
        <a href="/" className="text-paprika-300 hover:text-paprika-200 font-medium underline underline-offset-4">
          Go to the homepage
        </a>
      </div>
    );
  }

  return (
    <RestaurantProvider restaurantId={restaurant.id}>
      <RestaurantRouter restaurant={restaurant} onClaimed={refresh} />
    </RestaurantProvider>
  );
}

function RestaurantRouter({ restaurant, onClaimed }: { restaurant: RestaurantRecord; onClaimed: () => void }) {
  const { settings } = useSettings();
  const [route, setRoute] = useState<'customer' | 'admin' | 'landing'>(() => {
    if (isCustomerRoute()) return 'customer';
    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin') return 'admin';
    return 'landing';
  });

  // Real auth state, sourced from Supabase's own session — not a flag we
  // invent ourselves. Also checks the signed-in user actually OWNS this
  // specific restaurant (someone logged into Restaurant A's account
  // shouldn't be treated as logged into Restaurant B just because a
  // session exists — sessions are shared across the whole site).
  const [authState, setAuthState] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    let cancelled = false;
    getCurrentUserId().then((uid) => {
      if (cancelled) return;
      setAuthState(uid && restaurant.ownerId && uid === restaurant.ownerId ? 'in' : 'out');
    });
    const unsub = onAuthChange((uid) => {
      setAuthState(uid && restaurant.ownerId && uid === restaurant.ownerId ? 'in' : 'out');
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [restaurant.ownerId]);

  useEffect(() => {
    const onHash = () => {
      if (isCustomerRoute()) return;
      const hash = window.location.hash.replace('#', '');
      setRoute(hash === 'admin' ? 'admin' : 'landing');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'customer') return <CustomerApp />;

  if (route === 'admin') {
    if (authState === 'checking') {
      return (
        <div className="min-h-screen bg-ink-900 flex items-center justify-center">
          <Loader2 className="animate-spin text-ink-500" size={28} />
        </div>
      );
    }
    if (authState === 'out') {
      return (
        <AdminLogin
          settings={settings}
          restaurantId={restaurant.id}
          ownerId={restaurant.ownerId}
          onSuccess={() => {
            setAuthState('in');
            onClaimed(); // refetches the restaurant record so ownerId is current
          }}
        />
      );
    }
    return (
      <AdminDashboard
        onLogout={async () => {
          await signOut();
          setAuthState('out');
        }}
      />
    );

  }

  return <RestaurantLanding onEnterAdmin={() => { window.location.hash = 'admin'; setRoute('admin'); }} />;
}

function RestaurantLanding({ onEnterAdmin }: { onEnterAdmin: () => void }) {
  const { settings } = useSettings();
  return (
    <div className="min-h-screen bg-ink-900 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-paprika-500 mb-6">
            <Utensils className="text-white" size={32} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-semibold tracking-tight mb-4">{settings.restaurantName}</h1>
          <p className="text-lg text-ink-300 mb-8 max-w-md mx-auto">
            Self-order and billing, powered by a QR code. Customers scan, order, and you bill — all in one place.
          </p>
          <button
            onClick={onEnterAdmin}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 hover:-translate-y-0.5 transition-all group shadow-md hover:shadow-lg"
          >
            Staff Dashboard
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition" />
          </button>
        </div>
      </div>
      <div className="px-6 pb-16">
        <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-4">
          <FeatureCard icon={ClipboardList} title="Live Orders" desc="Instant customer orders with audio alerts." />
          <FeatureCard icon={QrCode} title="QR Table Codes" desc="Generate printable QR codes per table." />
          <FeatureCard icon={Sparkles} title="Live Reports" desc="Interactive revenue charts, always up to date." />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: typeof Utensils; title: string; desc: string }) {
  return (
    <div className="bg-ink-800/50 rounded-2xl p-5 border border-ink-700/50">
      <div className="w-10 h-10 rounded-xl bg-ink-700 flex items-center justify-center mb-3">
        <Icon size={20} className="text-white" />
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-ink-400">{desc}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform landing — shown at the root domain with no restaurant slug.
// Where new restaurants sign up.
// ---------------------------------------------------------------------------

function PlatformLanding() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !effectiveSlug || !email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signUpRestaurant(effectiveSlug, name.trim(), email.trim(), password);
      if (typeof result === 'string') {
        setError(result);
        setSubmitting(false);
        return;
      }
      window.location.href = `/${result.slug}#admin`;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong creating your restaurant. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-900 text-white flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-paprika-500 mb-5">
            <Utensils className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-display font-semibold mb-3">Get your restaurant online</h1>
          <p className="text-ink-400">QR self-ordering and billing — set up in under a minute.</p>
        </div>

        <form onSubmit={submit} className="bg-ink-800 rounded-2xl p-6 border border-ink-700 shadow-ticket-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-300 mb-1.5">Restaurant name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bella Cucina"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-300 mb-1.5">Your URL</label>
            <div className="flex items-center rounded-lg bg-ink-700 focus-within:ring-2 focus-within:ring-paprika-400 overflow-hidden">
              <span className="pl-3.5 text-ink-500 text-sm whitespace-nowrap">{window.location.host}/</span>
              <input
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="bella-cucina"
                className="flex-1 min-w-0 py-2.5 pr-3.5 bg-transparent text-white placeholder-ink-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-300 mb-1.5">Your email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-300 mb-1.5">Choose a password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3.5 py-2.5 rounded-lg bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
            />
          </div>
          {error && <p className="text-paprika-300 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim() || !effectiveSlug || !email.trim() || !password}
            className="w-full py-3.5 rounded-xl bg-paprika-500 hover:bg-paprika-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
            {submitting ? 'Creating your restaurant…' : 'Create my restaurant'}
          </button>
        </form>

        <p className="text-center text-ink-500 text-xs mt-6">
          Already have a restaurant here? Go to <span className="font-mono">{window.location.host}/your-restaurant-name</span>
        </p>
      </div>
    </div>
  );
}
