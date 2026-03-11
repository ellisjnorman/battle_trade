/**
 * Register the Battle Trade service worker.
 * Call once from a client component (e.g. in Providers or layout).
 * Safe to call on the server — it's a no-op outside the browser.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] registered', reg.scope);

        // When a new SW is available, tell it to activate immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready — activate it
              newWorker.postMessage({ type: 'BT_SKIP_WAITING' });
            }
          });
        });
      })
      .catch((err) => console.warn('[SW] registration failed', err));
  });
}
