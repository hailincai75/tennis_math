import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORMAT_PRESETS, type PointDetails, type Side } from '../domain/types';
import { TennisDB } from './db';
import { Repo, ValidationError, type NewMatch } from './repo';

const E: Side = 'elsa';
const O: Side = 'opp';

let dbName: string;
let db: TennisDB;
let repo: Repo;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new TennisDB(dbName);
  repo = new Repo(db);
});

async function newMatch(overrides: Partial<NewMatch> = {}) {
  const opp = await repo.addOpponent({ name: 'Mia' });
  return repo.createMatch({
    date: '2026-11-20',
    opponentId: opp.id,
    format: FORMAT_PRESETS.oneSet.format,
    firstServer: E,
    recordingMode: 'standard',
    ...overrides,
  });
}

async function addWinners(matchId: string, winners: string) {
  for (const c of winners.replace(/\s/g, '')) await repo.addPoint(matchId, { winner: c === 'E' ? E : O });
}

describe('opponents', () => {
  it('trims names, rejects empty ones and lists by name', async () => {
    await repo.addOpponent({ name: '  Zoe ' });
    await repo.addOpponent({ name: 'Amy', hand: 'L' });
    await expect(repo.addOpponent({ name: '   ' })).rejects.toThrow(ValidationError);
    expect((await repo.listOpponents()).map((o) => o.name)).toEqual(['Amy', 'Zoe']);
  });

  it('cannot delete an opponent that has matches', async () => {
    const m = await newMatch();
    await expect(repo.deleteOpponent(m.opponentId)).rejects.toThrow(/1 场比赛/);
    await repo.deleteMatch(m.id);
    await repo.deleteOpponent(m.opponentId);
    expect(await repo.listOpponents()).toEqual([]);
  });
});

describe('matches', () => {
  it('creates an in-progress match', async () => {
    const m = await newMatch();
    expect(m.status).toBe('in_progress');
    expect(await repo.getMatch(m.id)).toEqual(m);
  });

  it('rejects an unknown opponent or an invalid format', async () => {
    await expect(newMatch({ opponentId: 'nope' })).rejects.toThrow(/找不到这个对手/);
    await expect(newMatch({ format: { ...FORMAT_PRESETS.oneSet.format, tiebreakAt: 9 } })).rejects.toThrow();
  });

  it('lists newest match date first', async () => {
    const a = await newMatch({ date: '2026-10-01' });
    const b = await newMatch({ date: '2026-11-01' });
    const c = await newMatch({ date: '2026-09-01' });
    expect((await repo.listMatches()).map((m) => m.id)).toEqual([b.id, a.id, c.id]);
  });

  it('deleting a match deletes its points', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'EEO');
    await repo.deleteMatch(m.id);
    expect(await db.points.count()).toBe(0);
    expect(await repo.getMatch(m.id)).toBeUndefined();
  });
});

describe('recording points', () => {
  it('quick mode stores the winner; standard mode derives it', async () => {
    const m = await newMatch();
    const p0 = await repo.addPoint(m.id, { winner: O });
    const p1 = await repo.addPoint(m.id, { firstServeIn: true, ending: 'unforced_error', endedBy: O });
    expect(p0).toMatchObject({ seq: 0, winner: O });
    expect(p1).toMatchObject({ seq: 1, winner: E, ending: 'unforced_error', endedBy: O, firstServeIn: true });
    const loaded = await repo.loadMatch(m.id);
    expect(loaded.points.map((p) => p.seq)).toEqual([0, 1]);
    expect(loaded.replay.next?.pointDisplay).toEqual({ elsa: '15', opp: '15' });
  });

  it.each<[string, PointDetails, RegExp]>([
    ['ending without endedBy', { ending: 'winner' }, /最后一拍/],
    ['endedBy without ending', { winner: E, endedBy: E }, /结束方式/],
    ['no winner at all', {}, /谁赢/],
    ['winner contradicts ending', { winner: E, ending: 'unforced_error', endedBy: E }, /不一致/],
    ['ace by the receiver', { ending: 'ace', endedBy: O }, /发球方/],
    ['double fault by the receiver', { ending: 'double_fault', endedBy: O }, /发球方/],
    ['double fault with first serve in', { ending: 'double_fault', endedBy: E, firstServeIn: true }, /一发不可能进/],
  ])('rejects %s', async (_name, details, msg) => {
    const m = await newMatch();
    await expect(repo.addPoint(m.id, details)).rejects.toThrow(msg);
    expect(await db.points.count()).toBe(0);
  });

  it('a double fault records the first serve as missed', async () => {
    const m = await newMatch();
    const p = await repo.addPoint(m.id, { ending: 'double_fault', endedBy: E });
    expect(p).toMatchObject({ winner: O, firstServeIn: false });
  });

  it('serve endings follow the server across games', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'EEEE'); // Elsa holds, opponent serves game 2
    await expect(repo.addPoint(m.id, { ending: 'ace', endedBy: E })).rejects.toThrow(/发球方/);
    await repo.addPoint(m.id, { ending: 'ace', endedBy: O });
  });

  it('marks the match completed at the last point, and undo reopens it', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'E'.repeat(24)); // 6-0 one-set match
    expect((await repo.getMatch(m.id))?.status).toBe('completed');
    await expect(repo.addPoint(m.id, { winner: E })).rejects.toThrow(/已经结束/);

    const undone = await repo.undoLastPoint(m.id);
    expect(undone?.seq).toBe(23);
    expect((await repo.getMatch(m.id))?.status).toBe('in_progress');
    await repo.addPoint(m.id, { winner: O });
    expect(await db.points.count()).toBe(24);
  });

  it('undo with no points does nothing', async () => {
    const m = await newMatch();
    expect(await repo.undoLastPoint(m.id)).toBeUndefined();
  });
});

describe('editing points', () => {
  it('editing a middle point changes the score after it', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'EEEE EEE');
    const first = (await repo.getPoints(m.id))[0];
    await repo.updatePoint(first.id, { winner: O });
    const { replay } = await repo.loadMatch(m.id);
    // Game 1 is now O,E,E,E,E (Elsa wins it a point later); game 2 is 30-0 to Elsa.
    expect(replay.final.games).toEqual({ elsa: 1, opp: 0 });
    expect(replay.next?.pointDisplay).toEqual({ elsa: '30', opp: '0' });
  });

  it('rejects an edit that makes a later ace come from the receiver, and keeps the data', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'EEEE');
    await repo.addPoint(m.id, { ending: 'ace', endedBy: O }); // opponent serving game 2
    const first = (await repo.getPoints(m.id))[0];
    // Game 1 would then still be going at point 5, where Elsa serves.
    await expect(repo.updatePoint(first.id, { winner: O })).rejects.toThrow(/第 5 分/);
    expect((await repo.getPoints(m.id))[0].winner).toBe(E);
  });

  it('changing the first server re-validates recorded serves', async () => {
    const m = await newMatch();
    await repo.addPoint(m.id, { ending: 'ace', endedBy: E });
    await expect(repo.updateMatchInfo(m.id, { firstServer: O })).rejects.toThrow(/发球方/);
    const ok = await repo.updateMatchInfo(m.id, { event: 'Winter Open', round: 'QF' });
    expect(ok).toMatchObject({ event: 'Winter Open', round: 'QF', firstServer: E });
  });
});

describe('retired / abandoned', () => {
  it('blocks recording until resumed', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'EE');
    await expect(repo.endMatch(m.id, 'retired')).rejects.toThrow(/退赛/);
    await repo.endMatch(m.id, 'retired', O);
    expect(await repo.getMatch(m.id)).toMatchObject({ status: 'retired', retiredSide: O });
    await expect(repo.addPoint(m.id, { winner: E })).rejects.toThrow(/恢复/);

    await repo.resumeMatch(m.id);
    const resumed = await repo.getMatch(m.id);
    expect(resumed?.status).toBe('in_progress');
    expect(resumed?.retiredSide).toBeUndefined();
    await repo.addPoint(m.id, { winner: E });
  });

  it('a completed match cannot be marked retired', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'E'.repeat(24));
    await expect(repo.endMatch(m.id, 'abandoned')).rejects.toThrow(/正常结束/);
  });
});

describe('persistence', () => {
  it('data survives closing and reopening the database', async () => {
    const m = await newMatch();
    await addWinners(m.id, 'EEO');
    db.close();
    const reopened = new Repo(new TennisDB(dbName));
    const { match, points, replay } = await reopened.loadMatch(m.id);
    expect(match.id).toBe(m.id);
    expect(points.map((p) => p.winner)).toEqual([E, E, O]);
    expect(replay.next?.pointDisplay).toEqual({ elsa: '30', opp: '15' });
  });
});
