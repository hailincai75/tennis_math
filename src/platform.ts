// Small helpers about how the app is running on the device.

/** True when opened from the home-screen icon (not a Safari tab). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export type StorageStatus = {
  persisted: boolean | null; // null = API not available
  usageBytes?: number;
  quotaBytes?: number;
};

/**
 * Ask the browser not to evict our IndexedDB data under storage pressure,
 * and report the current state.
 */
export async function ensurePersistentStorage(): Promise<StorageStatus> {
  const sm = navigator.storage;
  if (!sm?.persisted) return { persisted: null };
  let persisted = await sm.persisted();
  if (!persisted && sm.persist) persisted = await sm.persist();
  const est = sm.estimate ? await sm.estimate() : undefined;
  return { persisted, usageBytes: est?.usage, quotaBytes: est?.quota };
}
