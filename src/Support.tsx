import { useState } from 'react';
import { Utensils, Mail, MessageCircle, ChevronDown, ArrowLeft } from 'lucide-react';

// Fill these in with your real contact details before launch.
const SUPPORT_EMAIL = 'shivtejtech@gmail.com';
const SUPPORT_WHATSAPP = 'https://wa.me/917208789589';

// Figures out where "back" should actually go. Support is a shared,
// restaurant-independent page (yoursite.com/_support), so on its own it
// has no idea which restaurant you came from — the links that bring
// people here pass that along as a query param so this page can send you
// back to the right place instead of always dumping you on the generic
// platform landing page.
function getBackDestination(): { url: string; label: string } {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  if (!from) return { url: '/', label: 'Back home' };
  if (params.get('admin') === '1') return { url: `/${from}#admin`, label: 'Back to dashboard' };
  return { url: `/${from}`, label: 'Back to restaurant' };
}

const FAQS = [
  {
    q: 'How does the QR ordering work?',
    a: "Each table gets its own QR code, generated from your admin dashboard under 'QR Codes'. When a customer scans it, they see your menu and can place an order directly from their phone — no app download needed.",
  },
  {
    q: 'How do I get paid / how does billing work?',
    a: "Customers pay your restaurant directly (cash, card, UPI — however you normally accept payment). ScannBite doesn't process customer payments; it just handles ordering and generates the bill for you to collect.",
  },
  {
    q: 'How do I pay for ScannBite itself?',
    a: 'Subscription payment is currently arranged directly with us — see the payment details shared with you at signup, or contact support below if you need a reminder.',
  },
  {
    q: "What happens if I don't pay on time?",
    a: "Your dashboard and customer ordering page may be temporarily paused until payment is received. Nothing is deleted — your menu, orders, and settings are all restored the moment you're reactivated.",
  },
  {
    q: 'I forgot my password. What do I do?',
    a: "On your restaurant's login page, click 'Forgot password?' and enter your email. You'll receive a reset link — check your spam folder if it doesn't arrive within a few minutes.",
  },
  {
    q: 'Can I change my restaurant name or web address later?',
    a: "Yes — go to Settings in your dashboard. You can update your restaurant name, currency, tax rate, and even your web address (URL) at any time.",
  },
  {
    q: 'Is my data shared with other restaurants on the platform?',
    a: 'No. Every restaurant on ScannBite has fully separate data — menus, orders, and settings are never visible to other restaurants.',
  },
  {
    q: 'My QR code / ordering page stopped working. What do I do?',
    a: 'First, try refreshing the page. If it persists, contact support below with your restaurant name and a description of what you\'re seeing, and we\'ll help right away.',
  },
];

export default function Support() {
  const back = getBackDestination();
  return (
    <div className="min-h-screen bg-parchment-100">
      <header className="bg-ink-900 text-white px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href={back.url} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-paprika-500 flex items-center justify-center">
              <Utensils size={16} className="text-white" />
            </div>
            <span className="font-display font-semibold">ScannBite</span>
          </a>
          <a href={back.url} className="flex items-center gap-1.5 text-sm text-ink-300 hover:text-white transition-colors">
            <ArrowLeft size={15} /> {back.label}
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-display font-semibold text-ink-900 mb-2">Support &amp; FAQ</h1>
        <p className="text-ink-500 mb-10">Answers to common questions, and how to reach us if you need more help.</p>

        {/* Contact options */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="bg-white rounded-2xl border border-ink-200 p-5 hover:border-paprika-300 hover:-translate-y-0.5 transition-all flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-paprika-100 text-paprika-600 flex items-center justify-center shrink-0">
              <Mail size={18} />
            </div>
            <div>
              <p className="font-semibold text-ink-900">Email us</p>
              <p className="text-sm text-ink-500">{SUPPORT_EMAIL}</p>
            </div>
          </a>

          {SUPPORT_WHATSAPP && (
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-2xl border border-ink-200 p-5 hover:border-basil-300 hover:-translate-y-0.5 transition-all flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-basil-100 text-basil-600 flex items-center justify-center shrink-0">
                <MessageCircle size={18} />
              </div>
              <div>
                <p className="font-semibold text-ink-900">WhatsApp</p>
                <p className="text-sm text-ink-500">Chat with us directly</p>
              </div>
            </a>
          )}
        </div>

        {/* FAQ */}
        <h2 className="text-xl font-bold font-display text-ink-900 mb-4">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {FAQS.map((item, i) => (
            <FaqItem key={i} question={item.q} answer={item.a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-ink-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-medium text-ink-900">{question}</span>
        <ChevronDown size={18} className={`text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="px-5 pb-4 text-sm text-ink-500 leading-relaxed">{answer}</p>}
    </div>
  );
}
