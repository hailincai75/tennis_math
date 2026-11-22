import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORMAT_PRESETS } from '../domain/types';
import { csvEscape, exportBackup, importBackup, parseBackup, pointsCsv } from './backup';
import { TennisDB } from './db';
import { Repo } from './repo';

let db: TennisDB;
let repo: Repo;

beforeEach(() => {
  db = new TennisDB(`test-${crypto.randomUUID()}`);
  repo = new Repo(db);
});

async function seed() {
  const opp = await repo.addOpponent({ name: 'Mia, "the wall"' });
  const m = await repo.createMatch({
    date: '2026-11-20',
    opponentId: opp.id,
    format: FORMAT_PRESETS.oneSet.format,
    firstServer: 'elsa',
    recordingMode: 'standard',
  });
  await repo.addPoint(m.id, { firstServeIn: true, ending: 'ace', endedBy: 'elsa' });
  await repo.addPoint(m.id, { firstServeIn: false, ending: 'unforced_error', endedBy: 'elsa', note: 'net\nagain' });
  await repo.addPoint(m.id, { winner: 'opp' });
  return { opp, m };
}

describe('backup', () => {
  it('round-trips through JSON with replace', async () => {
    await seed();
    const b = await exportBackup(db);
    const text = JSON.stringify(b);
    await db.points.clear();
    await db.matches.clear();
    await db.opponents.clear();
    const res = await importBackup(db, parseBackup(text), 'replace');
    expect(res).toEqual({ opponents: 1, matches: 1, points: 3 });
    const again = await exportBackup(db);
    expect({ ...again, exportedAt: '' }).toEqual({ ...b, exportedAt: '' });
  });

  it('merge replaces the points of matches in the backup and keeps others', async () => {
    const { m } = await seed();
    const b = await exportBackup(db);
    // After the backup: one more point in the same match, and a new match.
    await repo.addPoint(m.id, { winner: 'elsa' });
    const other = await repo.createMatch({ ...m, date: '2026-11-21' });
    await repo.addPoint(other.id, { winner: 'elsa' });

    await importBackup(db, parseBackup(JSON.stringify(b)), 'merge');
    expect(await repo.getPoints(m.id)).toHaveLength(3); // back to the backup's version
    expect(await repo.getPoints(other.id)).toHaveLength(1); // untouched
    expect(await db.matches.count()).toBe(2);
  });

  it.each([
    ['not json', '{oops', /JSON/],
    ['another app', JSON.stringify({ app: 'x' }), /不是 Tennis Math/],
    ['newer version', JSON.stringify({ app: 'tennis-math', version: 99 }), /更新版本/],
    ['missing arrays', JSON.stringify({ app: 'tennis-math', version: 1, opponents: [] }), /格式不对/],
  ])('rejects %s', (_n, text, msg) => {
    expect(() => parseBackup(text)).toThrow(msg);
  });

  it('rejects a backup whose points do not replay', async () => {
    await seed();
    const b = await exportBackup(db);
    b.points[0] = { ...b.points[0], ending: 'ace', endedBy: 'opp', winner: 'opp' }; // receiver ace
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/发球方/);
  });
});

describe('csv', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('x\ny')).toBe('"x\ny"');
    expect(csvEscape(undefined)).toBe('');
    expect(csvEscape(3)).toBe('3');
  });

  it('writes one row per point with score context', async () => {
    await seed();
    const csv = pointsCsv(await exportBackup(db), 'Elsa');
    expect(csv.startsWith('﻿date,opponent')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[1].startsWith('2026-11-20,"Mia, ""the wall""",,,,')).toBe(true);
    expect(lines[1]).toContain(',1,1,0-0,0-0,Elsa,Elsa,yes,ace,Elsa,,,,');
    expect(lines[2]).toContain(',2,1,0-0,15-0,Elsa,"Mia, ""the wall""",no,unforced_error,Elsa,,,,"net\nagain"');
  });
});
