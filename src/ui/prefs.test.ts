import { describe, expect, it } from 'vitest';
import { backupReminder } from './prefs';

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const done = (updatedAt: number) => ({ status: 'completed' as const, updatedAt });

describe('backupReminder', () => {
  it('never backed up: nudge after 3 finished matches', () => {
    expect(backupReminder([done(1), done(2)], {}, now)).toEqual({ due: false, pending: 2 });
    expect(backupReminder([done(1), done(2), done(3)], {}, now).due).toBe(true);
  });

  it('ignores matches still in progress', () => {
    const live = { status: 'in_progress' as const, updatedAt: 5 };
    expect(backupReminder([done(1), done(2), live], {}, now)).toEqual({ due: false, pending: 2 });
  });

  it('after a backup: 10 new finished matches, or any after 30 days', () => {
    const last = now - 5 * DAY;
    const nine = Array.from({ length: 9 }, (_, i) => done(last + i + 1));
    expect(backupReminder(nine, { lastBackupAt: last }, now).due).toBe(false);
    expect(backupReminder([...nine, done(last + 50)], { lastBackupAt: last }, now).due).toBe(true);

    const old = now - 31 * DAY;
    expect(backupReminder([done(old + 1)], { lastBackupAt: old }, now).due).toBe(true);
    expect(backupReminder([done(old - 1)], { lastBackupAt: old }, now)).toEqual({ due: false, pending: 0 });
  });

  it('respects snooze', () => {
    expect(backupReminder([done(1), done(2), done(3)], { backupSnoozeUntil: now + 1 }, now).due).toBe(false);
  });
});
