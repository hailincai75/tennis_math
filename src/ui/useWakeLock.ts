import { useEffect } from 'react';

/**
 * Keep the screen on while `active` (e.g. on the scoring page).
 * Silently does nothing where the Screen Wake Lock API is unavailable.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) await lock.release();
      } catch {
        // Denied or not supported in this context: ignore.
      }
    };
    // The lock is released automatically when the page is hidden; take it again on return.
    const onVisible = () => void acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
