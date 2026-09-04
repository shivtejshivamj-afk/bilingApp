import { useEffect, useRef, useState } from 'react';
import { Utensils, QrCode, ClipboardList, ArrowRight, Sparkles, Loader2, Eye, EyeOff, BarChart3, Bell, Smartphone, ShieldCheck } from 'lucide-react';
import { getSlugFromPath, useResolveRestaurant, RestaurantProvider, signUpRestaurant, slugify } from '@/lib/restaurantContext';
import { getCurrentUserId, onAuthChange, onPasswordRecovery, signOut } from '@/lib/sync';
import { useSettings } from '@/lib/useLocalData';
import type { RestaurantRecord } from '@/lib/sync';
import AdminLogin, { SetNewPassword } from '@/admin/AdminLogin';
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
  const result = useResolveRestaurant(slug);

  if (result.status === 'loading') {
    return (
      <div className="min-h-screen bg-parchment-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-ink-400" size={32} />
      </div>
    );
  }

  if (result.status === 'not-found') {
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
    <RestaurantProvider restaurantId={result.restaurant.id}>
      <RestaurantRouter restaurant={result.restaurant} onClaimed={result.refresh} />
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

  // If this page load is the result of clicking a "reset your password"
  // email link, Supabase fires this event once it's set up a temporary
  // recovery session from the link's token — override normal routing to
  // show the "set a new password" screen instead, regardless of which
  // tab/hash the link happened to redirect to.
  const [recoveryMode, setRecoveryMode] = useState(false);
  useEffect(() => {
    return onPasswordRecovery(() => setRecoveryMode(true));
  }, []);

  // Real auth state, sourced from Supabase's own session — not a flag we
  // invent ourselves. Also checks the signed-in user actually OWNS this
  // specific restaurant (someone logged into Restaurant A's account
  // shouldn't be treated as logged into Restaurant B just because a
  // session exists — sessions are shared across the whole site).
  const [authState, setAuthState] = useState<'checking' | 'in' | 'out'>('checking');

  // Read through a ref rather than depending on restaurant.ownerId directly
  // below — this lets the auth check/subscription set up exactly ONCE and
  // stay put for the lifetime of this screen, instead of tearing down and
  // re-creating the listener every time the restaurant record refreshes
  // (e.g. right after logging in). Re-subscribing repeatedly opened a race
  // where an older, now-stale check could resolve AFTER a newer one and
  // incorrectly overwrite "logged in" back to "logged out".
  const ownerIdRef = useRef(restaurant.ownerId);
  useEffect(() => {
    ownerIdRef.current = restaurant.ownerId;
  }, [restaurant.ownerId]);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserId().then((uid) => {
      if (cancelled) return;
      setAuthState(uid && ownerIdRef.current && uid === ownerIdRef.current ? 'in' : 'out');
    });
    const unsub = onAuthChange((uid) => {
      setAuthState(uid && ownerIdRef.current && uid === ownerIdRef.current ? 'in' : 'out');
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // Deliberately empty — see comment above. This should run once per
    // mount of this screen, not once per restaurant-data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHash = () => {
      if (isCustomerRoute()) return;
      const hash = window.location.hash.replace('#', '');
      setRoute(hash === 'admin' ? 'admin' : 'landing');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (recoveryMode) {
    return (
      <SetNewPassword
        restaurantName={settings.restaurantName}
        onDone={() => {
          setRecoveryMode(false);
          window.location.hash = 'admin';
          setRoute('admin');
        }}
      />
    );
  }

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

// ---------------------------------------------------------------------------
// Platform landing — a proper marketing page shown at the root domain (no
// restaurant slug). New restaurants sign up from the form at the bottom.
// ---------------------------------------------------------------------------

const FEATURES = [
  { icon: Smartphone, title: 'Self-order by QR', desc: 'No app download — customers scan, browse, and order straight from their own phone.' },
  { icon: Bell, title: 'Instant order alerts', desc: 'Sound, on-screen toasts, and browser notifications the moment an order comes in.' },
  { icon: BarChart3, title: 'Live revenue reports', desc: 'Interactive charts of revenue, top items, and trends — always current, never stale.' },
  { icon: QrCode, title: 'Printable table QR codes', desc: 'Generate a unique code per table in seconds, ready to print or download.' },
  { icon: ClipboardList, title: 'One-tap billing', desc: 'Generate and print a bill the moment a table is ready to pay — no manual tallying.' },
  { icon: ShieldCheck, title: 'Your own secure login', desc: "Every restaurant gets its own account — your data is yours, and yours alone." },
];

const STEPS = [
  { n: '01', title: 'Create your restaurant', desc: 'Pick a name and a web address — takes under a minute, no credit card needed.' },
  { n: '02', title: 'Print your QR codes', desc: "Generate a code for every table straight from your dashboard, ready to print." },
  { n: '03', title: 'Start taking orders', desc: 'Customers scan, order, and you get notified instantly — billing is one tap away.' },
];

function PlatformLanding() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-ink-900 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-ink-900/80 backdrop-blur-md border-b border-ink-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-paprika-500 flex items-center justify-center">
              <Utensils size={16} className="text-white" />
            </div>
            <span className="font-display font-semibold">ScannBite</span>
          </div>
          <div className="hidden sm:flex items-center gap-8 text-sm text-ink-300">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-white transition-colors">How it works</button>
          </div>
          <button
            onClick={() => scrollTo('signup')}
            className="px-4 py-2 rounded-lg bg-paprika-500 hover:bg-paprika-600 text-sm font-semibold transition-colors"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-800 border border-ink-700 text-xs font-medium text-ink-300 mb-6">
            <Sparkles size={13} className="text-saffron-400" />
            QR ordering &amp; billing platform
          </span>
          <h1 className="text-4xl sm:text-5xl font-display font-semibold mb-5 leading-[1.1]">
            Run your restaurant's <span className="text-paprika-400">ordering &amp; billing</span> from one dashboard
          </h1>
          <p className="text-ink-400 text-lg mb-8 max-w-md">
            Customers scan a code and order from their phone. You get live orders, instant alerts, and one-tap billing — set up in minutes, not weeks.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => scrollTo('signup')}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 hover:-translate-y-0.5 transition-all group shadow-md hover:shadow-lg"
            >
              Create your restaurant
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition" />
            </button>
            <button
              onClick={() => scrollTo('how-it-works')}
              className="px-6 py-3.5 rounded-xl border border-ink-700 text-ink-200 font-semibold hover:bg-ink-800 transition-colors"
            >
              See how it works
            </button>
          </div>
          <p className="text-ink-500 text-xs mt-5">Free to start. No credit card required.</p>
        </div>

        <HeroMockup />
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20 border-t border-ink-800">
        <div className="max-w-xl mb-12">
          <h2 className="text-3xl font-display font-semibold mb-3">Everything a modern restaurant needs</h2>
          <p className="text-ink-400">No separate POS, no clunky third-party ordering apps — just one dashboard for orders, billing, and reports.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-ink-800/60 rounded-2xl p-5 border border-ink-700/60 hover:border-paprika-500/40 hover:-translate-y-0.5 transition-all">
              <div className="w-10 h-10 rounded-xl bg-ink-700 flex items-center justify-center mb-4">
                <f.icon size={19} className="text-paprika-400" />
              </div>
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-ink-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20 border-t border-ink-800">
        <div className="max-w-xl mb-12">
          <h2 className="text-3xl font-display font-semibold mb-3">Live in three steps</h2>
          <p className="text-ink-400">No installation, no hardware to buy — just a browser.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-8">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative">
              <span className="text-5xl font-display font-semibold text-ink-700">{s.n}</span>
              <h3 className="font-semibold text-lg mt-3 mb-1.5">{s.title}</h3>
              <p className="text-ink-400 text-sm">{s.desc}</p>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block absolute top-6 left-full w-8 border-t border-dashed border-ink-700 -translate-x-4" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Signup */}
      <section id="signup" className="max-w-5xl mx-auto px-6 py-20 border-t border-ink-800">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <h2 className="text-3xl font-display font-semibold mb-4 leading-tight">
              Ready to get your restaurant online?
            </h2>
            <p className="text-ink-400 text-lg max-w-md">
              Create your restaurant, print your QR codes, and start taking orders today.
            </p>
          </div>

          <div className="w-full max-w-md justify-self-center lg:justify-self-end">
            <form onSubmit={submit} className="bg-ink-800 rounded-2xl p-6 border border-ink-700 shadow-ticket-lg space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-300 mb-1.5">Restaurant name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bella Cucina"
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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3.5 py-2.5 pr-11 rounded-lg bg-ink-700 text-white placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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
            <p className="text-center text-ink-500 text-xs mt-5">
              Already have a restaurant here? Go to <span className="font-mono">{window.location.host}/your-restaurant-name</span>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-800">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-paprika-500 flex items-center justify-center">
              <Utensils size={14} className="text-white" />
            </div>
            <span className="font-display font-semibold text-sm">ScannBite</span>
          </div>
          <p className="text-ink-500 text-xs">QR ordering &amp; billing for restaurants, big or small.</p>
        </div>
      </footer>
    </div>
  );
}

/** A stylized, non-literal preview of the dashboard — built with the app's
 * own design language (ticket-edge cards, paprika accents) rather than a
 * real screenshot, so it never goes stale as the product changes. */
function HeroMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-br from-paprika-500/20 via-transparent to-basil-500/10 blur-2xl rounded-[3rem]" />
      <div className="relative bg-ink-800 rounded-2xl border border-ink-700 shadow-ticket-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Live Orders</span>
          <span className="px-2 py-0.5 rounded-full bg-paprika-500 text-white text-[10px] font-bold animate-pulse">2 NEW</span>
        </div>
        <div className="space-y-3">
          <div className="bg-ink-900 rounded-xl border border-paprika-500/40 ring-1 ring-paprika-500/20 p-3.5 ticket-edge text-ink-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold font-display text-white">Table 4</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-paprika-500/20 text-paprika-300">New</span>
            </div>
            <p className="text-xs text-ink-400">2× Margherita Pizza</p>
            <p className="text-xs text-ink-400">1× Iced Tea</p>
          </div>
          <div className="bg-ink-900 rounded-xl border border-ink-700 p-3.5 ticket-edge text-ink-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold font-display text-white">Table 2</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-basil-500/20 text-basil-300">Cooking</span>
            </div>
            <p className="text-xs text-ink-400">1× Carbonara</p>
          </div>
        </div>
      </div>

      {/* Floating revenue chip */}
      <div className="absolute -bottom-5 -left-5 bg-white rounded-xl shadow-ticket-lg px-4 py-3 flex items-center gap-3 animate-[pop_0.5s_cubic-bezier(0.22,1,0.36,1)]">
        <div className="w-8 h-8 rounded-lg bg-basil-100 flex items-center justify-center">
          <BarChart3 size={15} className="text-basil-600" />
        </div>
        <div>
          <p className="text-[10px] text-ink-400 font-medium">Today's Revenue</p>
          <p className="text-sm font-bold text-ink-900">$1,284.50</p>
        </div>
      </div>

      {/* Floating QR chip */}
      <div className="absolute -top-5 -right-4 bg-white rounded-xl shadow-ticket-lg p-2.5 animate-[pop_0.6s_cubic-bezier(0.22,1,0.36,1)]">
        <div className="w-12 h-12 rounded-lg bg-ink-900 flex items-center justify-center">
          <QrCode size={26} className="text-white" />
        </div>
      </div>
    </div>
  );
}
