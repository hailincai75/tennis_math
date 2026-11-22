// Small per-device preferences in localStorage. Everything here is a
// convenience: the app works the same if storage is unavailable.
import type { Match, RecordingMode, Side } from '../domain/types';

export interface Prefs {
  defaultPreset: string;
  defaultMode: RecordingMode;
  defaultFirstServer: Side;
  /** ms since epoch of the last successful backup export. */
  lastBackupAt?: number;
  /** Reminder snoozed until this time. */
  backupSnoozeUntil?: number;
}

const KEY = 'tennis-math.prefs';
const DEFAULTS: Prefs = { defaultPreset: 'bo3mtb', defaultMode: 'standard', defaultFirstServer: 'elsa' };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore: private mode or storage blocked
  }
  return next;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Remind to back up when finished matches have piled up since the last backup:
 * 10 or more, or any at all after 30 days. Never-backed-up users get a nudge
 * after 3 finished matches.
 */
export function backupReminder(
  matches: readonly Pick<Match, 'status' | 'updatedAt'>[],
  prefs: Pick<Prefs, 'lastBackupAt' | 'backupSnoozeUntil'>,
  now: number,
): { due: boolean; pending: number } {
  const finished = matches.filter((m) => m.status !== 'in_progress');
  const since = prefs.lastBackupAt ?? 0;
  const pending = finished.filter((m) => m.updatedAt > since).length;
  if (prefs.backupSnoozeUntil && now < prefs.backupSnoozeUntil) return { due: false, pending };
  if (!prefs.lastBackupAt) return { due: pending >= 3, pending };
  const due = pending >= 10 || (pending > 0 && now - prefs.lastBackupAt >= 30 * DAY);
  return { due, pending };
}

export const SNOOZE_MS = 7 * DAY;
