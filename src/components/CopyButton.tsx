import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers/contexts where the Clipboard API is blocked
      const el = document.createElement('textarea');
      el.value = value;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } catch {
        // Give up silently — copied stays false, button just won't confirm
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 shrink-0 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={15} className="text-basil-500" /> : <Copy size={15} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
