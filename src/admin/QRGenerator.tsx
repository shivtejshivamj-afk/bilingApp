import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, Printer, Wifi, RefreshCw, Globe } from 'lucide-react';
import { useSettings } from '@/lib/useLocalData';

function getSiteOrigin(): string {
  return `${window.location.protocol}//${window.location.host}`;
}

export default function QRGenerator() {
  const { settings, setSettings } = useSettings();
  const [selectedTable, setSelectedTable] = useState<number>(1);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Determine the effective base URL:
  // If the admin has saved a custom LAN override, use that.
  // Otherwise fall back to the current site's origin (works on Vercel automatically).
  const [lanUrl, setLanUrl] = useState(settings.lanUrl || getSiteOrigin());

  useEffect(() => {
    setLanUrl(settings.lanUrl || getSiteOrigin());
  }, [settings.lanUrl]);

  const tables = useMemo(
    () => Array.from({ length: settings.tableCount }, (_, i) => i + 1),
    [settings.tableCount],
  );

  const customerUrl = useMemo(() => {
    const base = lanUrl.replace(/\/$/, '');
    return `${base}?table=${selectedTable}`;
  }, [lanUrl, selectedTable]);

  useEffect(() => {
    if (!customerUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(customerUrl, { width: 512, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [customerUrl]);

  const saveLanUrl = () => {
    setSettings({ ...settings, lanUrl });
  };

  const clearOverride = () => {
    const origin = getSiteOrigin();
    setLanUrl(origin);
    setSettings({ ...settings, lanUrl: '' });
  };

  const printQR = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Table ${selectedTable} QR Code</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { text-align: center; border: 2px solid #0f172a; border-radius: 16px; padding: 24px; }
        h1 { margin: 0 0 8px; font-size: 28px; }
        p { margin: 4px 0; color: #475569; }
        img { width: 300px; height: 300px; }
        .url { margin-top: 12px; font-size: 12px; color: #94a3b8; word-break: break-all; max-width: 320px; }
      </style></head>
      <body>
        <div class="card">
          <h1>Table ${selectedTable}</h1>
          <p>Scan to view our menu &amp; order</p>
          <img src="${qrDataUrl}" />
          <p class="url">${customerUrl}</p>
        </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const downloadQR = async () => {
    if (!qrDataUrl) return;
    const W = 600, H = 760;
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Inner card
    const cardX = 40, cardY = 40, cardW = W - 80, cardH = H - 80;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 24);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Accent bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cardX, cardY, cardW, 8);

    // Restaurant name
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(settings.restaurantName || 'Restaurant', W / 2, cardY + 70);

    // Table number badge
    const badgeY = cardY + 110;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 90, badgeY, 180, 48, 24);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`Table ${selectedTable}`, W / 2, badgeY + 32);

    // QR code
    const qrImg = new Image();
    qrImg.onload = () => {
      const qrSize = 320;
      ctx.drawImage(qrImg, (W - qrSize) / 2, badgeY + 70, qrSize, qrSize);

      // Instruction text
      ctx.fillStyle = '#475569';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Scan to view our menu & order', W / 2, badgeY + 70 + qrSize + 40);

      // URL
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px monospace';
      ctx.fillText(customerUrl, W / 2, badgeY + 70 + qrSize + 70);

      // Footer
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Powered by Restaurant Billing System', W / 2, H - 60);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `table-${selectedTable}-qr.png`;
      a.click();
    };
    qrImg.src = qrDataUrl;
  };

  const isUsingOverride = !!settings.lanUrl;
  const autoOrigin = getSiteOrigin();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-ink-900">QR Code Generator</h2>

      {/* URL config */}
      <div className="bg-white rounded-2xl border border-ink-200 p-4">
        {/* Auto-detected URL badge */}
        <div className="flex items-center gap-2 mb-1">
          <Globe size={18} className="text-basil-600" />
          <h3 className="font-semibold text-ink-900">Site URL (auto-detected)</h3>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="flex-1 px-3 py-2 rounded-lg bg-basil-50 border border-basil-200 text-sm text-basil-800 font-mono truncate">
            {autoOrigin}
          </span>
          {isUsingOverride && (
            <button
              onClick={clearOverride}
              className="px-3 py-2 rounded-lg bg-basil-600 text-white text-sm font-semibold hover:bg-basil-700 transition"
            >
              Use This
            </button>
          )}
        </div>
        <p className="text-xs text-ink-400 mb-4">
          {isUsingOverride
            ? 'You have a custom LAN override active (see below). Click "Use This" to switch back to the auto-detected URL.'
            : 'QR codes are using this URL automatically — perfect for your Vercel deployment.'}
        </p>

        {/* LAN override */}
        <div className="border-t border-ink-100 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={16} className="text-ink-500" />
            <h4 className="text-sm font-semibold text-ink-700">Local Wi-Fi Override (optional)</h4>
          </div>
          <p className="text-xs text-ink-400 mb-3">
            Only fill this in if customers order over a local Wi-Fi network instead of the internet. Run <code className="bg-ink-100 px-1.5 py-0.5 rounded">ipconfig</code> (Windows) or <code className="bg-ink-100 px-1.5 py-0.5 rounded">ifconfig</code> (Mac/Linux) to find your LAN IP, e.g. <code className="bg-ink-100 px-1.5 py-0.5 rounded">http://192.168.1.10:5173</code>.
          </p>
          <div className="flex gap-2">
            <input
              value={isUsingOverride ? lanUrl : ''}
              onChange={(e) => setLanUrl(e.target.value || autoOrigin)}
              placeholder="http://192.168.1.10:5173"
              className="flex-1 px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
            />
            <button
              onClick={saveLanUrl}
              disabled={!isUsingOverride && lanUrl === autoOrigin}
              className="px-4 py-2.5 rounded-lg bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 transition flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw size={15} />
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Table selector */}
      <div className="bg-white rounded-2xl border border-ink-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <QrCode size={18} className="text-ink-700" />
          <h3 className="font-semibold text-ink-900">Select Table</h3>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
          {tables.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTable(t)}
              className={`py-3 rounded-xl font-bold text-sm transition ${
                selectedTable === t
                  ? 'bg-ink-900 text-white shadow-lg scale-105'
                  : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* QR preview */}
      <div className="bg-gradient-to-br from-ink-900 to-ink-800 rounded-2xl border border-ink-700 p-6 flex flex-col items-center shadow-xl">
        <div className="text-center mb-4">
          <h3 className="font-bold text-white text-lg">Table {selectedTable}</h3>
          <p className="text-sm text-ink-400">Scan to view menu &amp; order</p>
        </div>
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-basil-400 to-cyan-400 rounded-2xl blur-md opacity-60 group-hover:opacity-100 transition duration-500" />
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR code for table ${selectedTable}`}
              className="relative w-64 h-64 rounded-2xl border-2 border-white/20 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="relative w-64 h-64 rounded-2xl bg-ink-700 flex items-center justify-center text-ink-400 text-sm text-center px-4">
              Generating QR code...
            </div>
          )}
        </div>
        <p className="text-xs text-ink-500 mt-4 break-all max-w-xs text-center font-mono">{customerUrl}</p>
        <div className="flex gap-3 mt-5">
          <button
            onClick={downloadQR}
            disabled={!qrDataUrl}
            className="px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition flex items-center gap-2 disabled:opacity-40"
          >
            <Download size={16} />
            Download
          </button>
          <button
            onClick={printQR}
            disabled={!qrDataUrl}
            className="px-5 py-2.5 rounded-xl bg-basil-600 text-white text-sm font-semibold hover:bg-basil-500 transition flex items-center gap-2 disabled:opacity-40"
          >
            <Printer size={16} />
            Print QR
          </button>
        </div>
      </div>
    </div>
  );
}
