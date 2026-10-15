import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, Printer, Globe } from 'lucide-react';
import { useSettings } from '@/lib/useLocalData';
import { getSlugFromPath, buildRestaurantUrl } from '@/lib/restaurantContext';
import { CopyButton } from '@/components/CopyButton';

export default function QRGenerator() {
  const { settings } = useSettings();
  const [selectedTable, setSelectedTable] = useState<number>(1);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const slug = getSlugFromPath() ?? '';

  const tables = useMemo(
    () => Array.from({ length: settings.tableCount }, (_, i) => i + 1),
    [settings.tableCount],
  );

  const customerUrl = useMemo(() => buildRestaurantUrl(slug, { table: selectedTable }), [slug, selectedTable]);

  useEffect(() => {
    if (!customerUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(customerUrl, { width: 512, margin: 2, color: { dark: '#1C1917', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [customerUrl]);

  // Draws the styled QR card (dark background, white card, table badge).
  // Used by BOTH Download and Print so they always look identical.
  const renderCard = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const W = 600, H = 760;
      const canvas = document.createElement('canvas');
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no canvas'));
      ctx.scale(dpr, dpr);

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1C1917');
      bg.addColorStop(1, '#251F1B');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

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

      ctx.fillStyle = '#C1440E';
      ctx.fillRect(cardX, cardY, cardW, 8);

      ctx.fillStyle = '#1C1917';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(settings.restaurantName || 'Restaurant', W / 2, cardY + 70);

      const badgeY = cardY + 110;
      ctx.fillStyle = '#C1440E';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 90, badgeY, 180, 48, 24);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(`Table ${selectedTable}`, W / 2, badgeY + 32);

      const qrImg = new Image();
      qrImg.onerror = () => reject(new Error('qr load failed'));
      qrImg.onload = () => {
        const qrSize = 320;
        ctx.drawImage(qrImg, (W - qrSize) / 2, badgeY + 70, qrSize, qrSize);

        ctx.fillStyle = '#655C55';
        ctx.font = '18px system-ui, sans-serif';
        ctx.fillText('Scan to view our menu & order', W / 2, badgeY + 70 + qrSize + 40);

        ctx.fillStyle = '#8A8078';
        ctx.font = '13px monospace';
        ctx.fillText(customerUrl, W / 2, badgeY + 70 + qrSize + 70);

        ctx.fillStyle = '#B3ACA5';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('Powered by Restaurant Billing System', W / 2, H - 60);

        resolve(canvas.toDataURL('image/png'));
      };
      qrImg.src = qrDataUrl;
    });

  const downloadQR = async () => {
    if (!qrDataUrl) return;
    try {
      const href = await renderCard();
      const a = document.createElement('a');
      a.href = href;
      a.download = `table-${selectedTable}-qr.png`;
      a.click();
    } catch {
      /* ignore */
    }
  };

  const printQR = async () => {
    if (!qrDataUrl) return;
    // Open synchronously (inside the click) so popup blockers allow it.
    const win = window.open('', '_blank');
    if (!win) return;
    try {
      const href = await renderCard();
      win.document.write(`
        <html><head><title>Table ${selectedTable} QR Code</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; height: 100%; background: #1C1917; }
          body { display: flex; align-items: center; justify-content: center; }
          img { max-width: 100%; max-height: 100vh; width: auto; height: auto; display: block;
                -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style></head>
        <body><img id="card" src="${href}" /></body></html>
      `);
      win.document.close();
      const img = win.document.getElementById('card') as HTMLImageElement | null;
      const go = () => setTimeout(() => win.print(), 200);
      if (img && !img.complete) img.onload = go;
      else go();
    } catch {
      win.close();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold font-display text-ink-900">QR Code Generator</h2>

      <div className="bg-white rounded-2xl border border-ink-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe size={18} className="text-basil-600" />
          <h3 className="font-semibold text-ink-900">Your restaurant's link</h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-basil-50 border border-basil-200">
          <span className="flex-1 min-w-0 text-sm text-basil-800 font-mono truncate">
            {buildRestaurantUrl(slug)}
          </span>
          <CopyButton value={buildRestaurantUrl(slug)} className="text-basil-700 hover:text-basil-900 text-xs font-semibold" />
        </div>
        <p className="text-xs text-ink-400 mt-2">
          Every QR code below points to this address, with the table number added automatically.
        </p>
      </div>

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
              className={`py-3 rounded-xl font-bold text-sm transition-all ${
                selectedTable === t
                  ? 'bg-paprika-500 text-white shadow-lg scale-105'
                  : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-ink-900 to-ink-800 rounded-2xl border border-ink-700 p-6 flex flex-col items-center shadow-ticket-lg">
        <div className="text-center mb-4">
          <h3 className="font-bold font-display text-white text-lg">Table {selectedTable}</h3>
          <p className="text-sm text-ink-400">Scan to view menu &amp; order</p>
        </div>
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-paprika-400 to-saffron-400 rounded-2xl blur-md opacity-60 group-hover:opacity-100 transition duration-500" />
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
        <div className="flex items-center gap-2 mt-4 max-w-xs">
          <p className="text-xs text-ink-500 break-all text-center font-mono flex-1">{customerUrl}</p>
          <CopyButton value={customerUrl} className="text-ink-300 hover:text-white text-xs" />
        </div>
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
            className="px-5 py-2.5 rounded-xl bg-basil-500 text-white text-sm font-semibold hover:bg-basil-600 transition flex items-center gap-2 disabled:opacity-40"
          >
            <Printer size={16} />
            Print QR
          </button>
        </div>
      </div>
    </div>
  );
}
