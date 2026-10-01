import { supabase } from './supabase';

const PUBLIC_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  return navigator.serviceWorker.register('/scannbite-sw.js', { scope: '/' });
}

export async function enableOrderPushNotifications(restaurantId: string): Promise<{ ok: boolean; message?: string }> {
  if (!PUBLIC_VAPID_KEY) return { ok: false, message: 'Push notifications are not configured yet.' };
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, message: 'This browser does not support background notifications.' };
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') return { ok: false, message: 'Notification permission was not granted.' };

  const registration = await registerPushServiceWorker();
  if (!registration) return { ok: false, message: 'Service worker registration failed.' };

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { ok: false, message: 'The browser did not return a valid push subscription.' };

  const { error } = await supabase.from('push_subscriptions').upsert({
    restaurant_id: restaurantId,
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function disableOrderPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

export async function hasOrderPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}
