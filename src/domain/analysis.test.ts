import { describe, expect, it } from 'vitest';
import {
  filterRecords,
  headToHead,
  insights,
  matchResult,
  metricByKey,
  metricOver,
  sumSideStats,
  totals,
  trend,
  winLossComparison,
  type MatchRecord,
} from './analysis';
import { emptySide, type SideStats } from './stats';
import { FORMAT_PRESETS, type Match, type Side, type Surface } from './types';

let n = 0;
function rec(opts: {
  date: string;
  result?: Side | null;
  surface?: Surface;
  opponentId?: string;
  elsa?: Partial<SideStats>;
  detailed?: boolean;
  points?: number;
}): MatchRecord {
  n++;
  const match: Match = {
    id: `m${n}`,
    date: opts.date,
    opponentId: opts.opponentId ?? 'o1',
    format: FORMAT_PRESETS.bo3.format,
    firstServer: 'elsa',
    status: 'completed',
    recordingMode: 'standard',
    surface: opts.surface,
    createdAt: n,
    updatedAt: n,
  };
  const total = opts.points ?? 100;
  return {
    match,
    result: opts.result === undefined ? 'elsa' : opts.result,
    score: '6-0 6-0',
    stats: {
      elsa: { ...emptySide(), pointsWon: { num: 50, den: total }, ...opts.elsa },
      opp: emptySide(),
      totalPoints: total,
      detailedPoints: opts.detailed === false ? 0 : total,
      momentum: [],
    },
  };
}

describe('matchResult', () => {
  const base = rec({ date: '2026-01-01' }).match;
  it('completed uses the replay winner; retired goes to the other side; others none', () => {
    expect(matchResult(base, 'opp')).toBe('opp');
    expect(matchResult({ ...base, status: 'retired', retiredSide: 'opp' }, null)).toBe('elsa');
    expect(matchResult({ ...base, status: 'abandoned' }, null)).toBeNull();
    expect(matchResult({ ...base, status: 'in_progress' }, null)).toBeNull();
  });
});

describe('filterRecords', () => {
  const rs = [
    rec({ date: '2026-03-01', surface: 'clay' }),
    rec({ date: '2026-01-01', surface: 'hard' }),
    rec({ date: '2026-02-01', surface: 'hard', opponentId: 'o2' }),
    rec({ date: '2026-04-01', points: 0 }),
  ];
  it('sorts oldest first and drops matches without points', () => {
    expect(filterRecords(rs, {}).map((r) => r.match.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
  it('applies surface, opponent, from and last', () => {
    expect(filterRecords(rs, { surface: 'hard' })).toHaveLength(2);
    expect(filterRecords(rs, { opponentId: 'o2' })).toHaveLength(1);
    expect(filterRecords(rs, { from: '2026-02-01' })).toHaveLength(2);
    expect(filterRecords(rs, { last: 1 }).map((r) => r.match.date)).toEqual(['2026-03-01']);
  });
});

describe('totals and metrics', () => {
  const a = rec({ date: '2026-01-01', elsa: { firstServeIn: { num: 10, den: 10 }, aces: 4, longestStreak: 5 } });
  const b = rec({ date: '2026-01-02', result: 'opp', elsa: { firstServeIn: { num: 0, den: 30 }, aces: 0, longestStreak: 8 } });
  const quick = rec({ date: '2026-01-03', detailed: false });

  it('sums ratios and counts, keeps the max streak', () => {
    const s = sumSideStats([a.stats.elsa, b.stats.elsa])!;
    expect(s.firstServeIn).toEqual({ num: 10, den: 40 });
    expect(s.aces).toBe(4);
    expect(s.longestStreak).toBe(8);
    expect(s.pointsWon).toEqual({ num: 100, den: 200 });
    expect(sumSideStats([])).toBeNull();
  });

  it('counts wins and losses', () => {
    expect(totals([a, b, quick])).toMatchObject({ matches: 3, wins: 2, losses: 1, detailedMatches: 2 });
  });

  it('pools ratios instead of averaging percentages', () => {
    expect(metricOver(metricByKey('firstServeIn'), [a, b])).toBeCloseTo(0.25); // not 0.5
  });

  it('averages count metrics over matches that have detail', () => {
    expect(metricOver(metricByKey('aces'), [a, b, quick])).toBe(2);
  });

  it('trend is chronological and skips matches without the data', () => {
    const t = trend([b, quick, a], metricByKey('firstServeIn'));
    expect(t.map((p) => [p.record.match.date, p.value])).toEqual([
      ['2026-01-01', 1],
      ['2026-01-02', 0],
    ]);
  });
});

describe('winLossComparison', () => {
  const win = (fsi: number, ue: number) =>
    rec({
      date: '2026-01-01',
      result: 'elsa',
      elsa: { firstServeIn: { num: fsi, den: 50 }, unforcedErrors: ue, endingsTracked: 100 },
    });
  const loss = (fsi: number, ue: number) =>
    rec({
      date: '2026-01-02',
      result: 'opp',
      elsa: { firstServeIn: { num: fsi, den: 50 }, unforcedErrors: ue, endingsTracked: 100 },
    });

  it('ranks the metric that differs most between wins and losses first', () => {
    const rows = winLossComparison([win(40, 20), win(40, 22), loss(20, 25), loss(22, 24)]);
    expect(rows[0].metric.key).toBe('firstServeIn');
    expect(rows[0].inWins).toBeCloseTo(0.8);
    expect(rows[0].inLosses).toBeCloseTo(0.42);
    const ue = rows.find((r) => r.metric.key === 'ueRate')!;
    expect(ue.gap).toBeGreaterThan(0); // fewer errors when winning is "better when winning"
  });

  it('needs both wins and losses', () => {
    expect(winLossComparison([win(40, 20)])).toEqual([]);
  });
});

describe('insights', () => {
  it('flags a recent drop in first-serve percentage', () => {
    const old = Array.from({ length: 5 }, (_, i) => rec({ date: `2026-01-0${i + 1}`, elsa: { firstServeIn: { num: 35, den: 50 } } }));
    const recent = Array.from({ length: 5 }, (_, i) => rec({ date: `2026-02-0${i + 1}`, elsa: { firstServeIn: { num: 25, den: 50 } } }));
    const out = insights([...old, ...recent]);
    expect(out).toContainEqual({ tone: 'bad', text: expect.stringContaining('一发进球率 50%，之前 70%（下降 20') });
  });

  it('flags weak serving on break points', () => {
    const r = rec({
      date: '2026-01-01',
      elsa: { breakPointsSaved: { num: 3, den: 12 }, servePointsWon: { num: 60, den: 100 } },
    });
    expect(insights([r]).some((i) => i.tone === 'bad' && i.text.includes('破发点'))).toBe(true);
  });

  it('says nothing without enough data', () => {
    expect(insights([rec({ date: '2026-01-01' })])).toEqual([]);
  });
});

describe('headToHead', () => {
  it('summarises each opponent, most recent first', () => {
    const rs = [
      rec({ date: '2026-01-01', opponentId: 'a', result: 'elsa' }),
      rec({ date: '2026-03-01', opponentId: 'a', result: 'opp' }),
      rec({ date: '2026-02-01', opponentId: 'b', result: 'elsa' }),
    ];
    const h = headToHead(
      [
        { id: 'b', name: 'Bea', createdAt: 0 },
        { id: 'a', name: 'Amy', createdAt: 0 },
        { id: 'c', name: 'Cat', createdAt: 0 },
      ],
      rs,
    );
    expect(h.map((x) => [x.opponent.name, x.wins, x.losses, x.lastDate])).toEqual([
      ['Amy', 1, 1, '2026-03-01'],
      ['Bea', 1, 0, '2026-02-01'],
      ['Cat', 0, 0, undefined],
    ]);
  });
});
