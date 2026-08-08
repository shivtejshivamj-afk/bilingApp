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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-4 shadow-lg">
            <Utensils className="text-slate-900" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">{settings.restaurantName}</h1>
          <p className="text-slate-400 text-sm mt-1">Staff Dashboard</p>
        </div>
        <form onSubmit={submit} className="bg-slate-800 rounded-2xl p-6 shadow-xl">
          <label className="block text-sm font-medium text-slate-300 mb-2">Master PIN</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type={show ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              inputMode="numeric"
              placeholder="Enter PIN"
              className={`w-full pl-10 pr-12 py-3.5 rounded-xl bg-slate-700 text-white text-lg tracking-widest placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white transition ${error ? 'ring-2 ring-rose-500 animate-[shake_0.4s]' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p className="text-rose-400 text-sm mt-2">Incorrect PIN. Try again.</p>}
          <button
            type="submit"
            className="w-full mt-5 py-3.5 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 transition"
          >
            Unlock Dashboard
          </button>
          <p className="text-center text-slate-500 text-xs mt-4">Default PIN: 1234 (change in Settings)</p>
        </form>
      </div>
    </div>
  );
}
