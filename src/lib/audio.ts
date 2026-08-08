let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(freq: number, start: number, duration: number, gain = 0.15): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration);
}

export function playNewOrderChime(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    tone(880, 0, 0.18);
    tone(1320, 0.16, 0.22);
  } catch {
    /* ignore */
  }
}

export function playStatusChime(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    tone(660, 0, 0.12);
  } catch {
    /* ignore */
  }
}
