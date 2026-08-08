import { useEffect, useState } from 'react';
import { Utensils, QrCode, ClipboardList, ArrowRight, Wifi } from 'lucide-react';
import { useSettings } from '@/lib/useLocalData';
import AdminLogin from '@/admin/AdminLogin';
import AdminDashboard from '@/admin/AdminDashboard';
import CustomerApp from '@/customer/CustomerApp';

function isCustomerRoute(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('table');
}

export default function App() {
  const { settings } = useSettings();
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('rbs_admin_auth') === '1');
  const [route, setRoute] = useState<'customer' | 'admin' | 'landing'>(() => {
    if (isCustomerRoute()) return 'customer';
    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin') return 'admin';
    return 'landing';
  });

  // Listen for hash changes (back/forward navigation)
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
    if (!authed) return <AdminLogin settings={settings} onSuccess={() => setAuthed(true)} />;
    return <AdminDashboard onLogout={() => setAuthed(false)} />;
  }

  return <Landing onEnterAdmin={() => { window.location.hash = 'admin'; setRoute('admin'); }} />;
}

function Landing({ onEnterAdmin }: { onEnterAdmin: () => void }) {
  const { settings } = useSettings();
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white mb-6">
            <Utensils className="text-slate-900" size={32} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">{settings.restaurantName}</h1>
          <p className="text-lg text-slate-300 mb-8 max-w-md mx-auto">
            Local Wi-Fi restaurant billing & self-ordering. Customers scan, order, and you bill — all on your local network.
          </p>
          <button
            onClick={onEnterAdmin}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 transition group"
          >
            Staff Dashboard
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition" />
          </button>
          <p className="text-xs text-slate-500 mt-4">Protected by master PIN · Default: 1234</p>
        </div>
      </div>

      {/* Features */}
      <div className="px-6 pb-16">
        <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-4">
          <FeatureCard icon={ClipboardList} title="Live Orders" desc="Instant customer orders with audio alerts." />
          <FeatureCard icon={QrCode} title="QR Table Codes" desc="Generate printable QR codes per table." />
          <FeatureCard icon={Wifi} title="100% Local" desc="Runs on your Wi-Fi. No internet needed to operate." />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: typeof Wifi; title: string; desc: string }) {
  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center mb-3">
        <Icon size={20} className="text-white" />
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-slate-400">{desc}</p>
    </div>
  );
}
