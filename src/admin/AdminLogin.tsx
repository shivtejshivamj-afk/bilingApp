import { useState } from 'react';
import { Lock, Utensils, Eye, EyeOff } from 'lucide-react';
import type { Settings } from '@/types';

export default function AdminLogin({
  settings,
  onSuccess,
}: {
  settings: Settings;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === settings.masterPin) {
      sessionStorage.setItem('rbs_admin_auth', '1');
      onSuccess();
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 600);
    }
  };

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center mb-8 animate-[pop_0.4s_cubic-bezier(0.22,1,0.36,1)]">
          <div className="w-16 h-16 rounded-2xl bg-paprika-500 flex items-center justify-center mb-4 shadow-ticket-lg">
            <Utensils className="text-white" size={30} />
          </div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tight">{settings.restaurantName}</h1>
          <p className="text-ink-400 text-sm mt-1.5 tracking-wide uppercase">Staff Dashboard</p>
        </div>
        <form onSubmit={submit} className="bg-ink-800 rounded-2xl p-6 shadow-ticket-lg border border-ink-700">
          <label className="block text-sm font-medium text-ink-300 mb-2">Master PIN</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={18} />
            <input
              type={show ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              inputMode="numeric"
              placeholder="Enter PIN"
              className={`w-full pl-10 pr-12 py-3.5 rounded-xl bg-ink-700 text-white text-lg tracking-widest placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-paprika-400 transition ${error ? 'ring-2 ring-paprika-500 animate-[shake_0.4s]' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white transition-colors"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p className="text-paprika-300 text-sm mt-2">Incorrect PIN. Try again.</p>}
          <button
            type="submit"
            className="w-full mt-5 py-3.5 rounded-xl bg-paprika-500 text-white font-bold hover:bg-paprika-600 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md hover:shadow-lg"
          >
            Unlock Dashboard
          </button>
          <p className="text-center text-ink-500 text-xs mt-4">Default PIN: 1234 (change in Settings)</p>
        </form>
      </div>
    </div>
  );
}
