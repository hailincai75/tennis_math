import { describe, expect, it } from 'vitest';
import { replay } from './scoring';
import { computeMatchStats, pct } from './stats';
import { FORMAT_PRESETS, pointWinner, type Point, type PointDetails, type Side } from './types';

const E: Side = 'elsa';
const O: Side = 'opp';
const BO3 = FORMAT_PRESETS.bo3.format;

function build(details: PointDetails[], firstServer: Side = E) {
  const points: Point[] = details.map((d, i) => ({
    ...d,
    id: `p${i}`,
    matchId: 'm',
    seq: i,
    winner: d.ending && d.endedBy ? pointWinner(d.ending, d.endedBy) : d.winner!,
    timestamp: i,
  }));
  const rep = replay(BO3, firstServer, points.map((p) => p.winner));
  return computeMatchStats(points, rep);
}

// Hand-charted two games. Game 1: Elsa serves and holds. Game 2: Elsa breaks.
const TWO_GAMES: PointDetails[] = [
  // Game 1, Elsa serving
  { firstServeIn: true, ending: 'winner', endedBy: E }, //            15-0
  { firstServeIn: false, ending: 'unforced_error', endedBy: O }, //   30-0
  { ending: 'double_fault', endedBy: E, firstServeIn: false }, //     30-15
  { firstServeIn: true, ending: 'ace', endedBy: E }, //               40-15
  { firstServeIn: true, ending: 'unforced_error', endedBy: E }, //    40-30
  { firstServeIn: true, ending: 'forced_error', endedBy: O }, //      game Elsa
  // Game 2, opponent serving
  { winner: O }, //                                                   0-15 (quick, no detail)
  { firstServeIn: true, ending: 'winner', endedBy: E, rallyLength: 'long' }, // 15-15
  { firstServeIn: false, ending: 'double_fault', endedBy: O }, //     30-15 to Elsa
  { firstServeIn: true, ending: 'unforced_error', endedBy: O }, //    40-15 to Elsa: break points
  { firstServeIn: true, ending: 'winner', endedBy: O }, //            BP saved
  { firstServeIn: false, ending: 'winner', endedBy: E }, //           BP converted
];

describe('computeMatchStats', () => {
  const st = build(TWO_GAMES);

  it('counts totals and detail coverage', () => {
    expect(st.totalPoints).toBe(12);
    expect(st.detailedPoints).toBe(11);
    expect(st.elsa.pointsWon).toEqual({ num: 8, den: 12 });
    expect(st.opp.pointsWon).toEqual({ num: 4, den: 12 });
  });

  it('serve stats for Elsa', () => {
    const e = st.elsa;
    expect(e.servePointsWon).toEqual({ num: 4, den: 6 });
    expect(e.firstServeIn).toEqual({ num: 4, den: 6 });
    expect(e.firstServeWon).toEqual({ num: 3, den: 4 });
    expect(e.secondServeWon).toEqual({ num: 1, den: 2 });
    expect(e.aces).toBe(1);
    expect(e.doubleFaults).toBe(1);
    expect(e.serviceGamesHeld).toEqual({ num: 1, den: 1 });
    expect(e.breakPointsSaved).toEqual({ num: 0, den: 0 });
    expect(pct(e.breakPointsSaved)).toBeNull();
  });

  it('return stats for Elsa', () => {
    const e = st.elsa;
    expect(e.returnPointsWon).toEqual({ num: 4, den: 6 });
    expect(e.firstReturnWon).toEqual({ num: 2, den: 3 }); // quick point has no serve info
    expect(e.secondReturnWon).toEqual({ num: 2, den: 2 });
    expect(e.breakPointsConverted).toEqual({ num: 1, den: 2 });
    expect(e.breaks).toEqual({ num: 1, den: 1 });
  });

  it('opponent mirrors: held 0/1, saved 1 of 2 break points', () => {
    expect(st.opp.serviceGamesHeld).toEqual({ num: 0, den: 1 });
    expect(st.opp.breakPointsSaved).toEqual({ num: 1, den: 2 });
    expect(st.opp.doubleFaults).toBe(1);
  });

  it('point endings are credited to who hit the last ball', () => {
    expect([st.elsa.winners, st.elsa.unforcedErrors, st.elsa.forcedErrors]).toEqual([3, 1, 0]);
    expect([st.opp.winners, st.opp.unforcedErrors, st.opp.forcedErrors]).toEqual([1, 2, 1]);
    expect(st.elsa.endingsTracked).toBe(11);
  });

  it('pressure, rally and streaks', () => {
    expect(st.elsa.gamePointsConverted).toEqual({ num: 2, den: 4 });
    expect(st.opp.gamePointsConverted).toEqual({ num: 0, den: 0 });
    expect(st.elsa.rally.long).toEqual({ num: 1, den: 1 });
    expect(st.elsa.rally.short).toEqual({ num: 0, den: 0 });
    expect(st.elsa.longestStreak).toBe(3);
    expect(st.opp.longestStreak).toBe(1);
  });

  it('momentum: running difference, break points and game ends', () => {
    expect(st.momentum.map((m) => m.diff)).toEqual([1, 2, 1, 2, 1, 2, 1, 2, 3, 4, 3, 4]);
    expect(st.momentum.filter((m) => m.breakPoint).map((m) => m.index)).toEqual([10, 11]);
    expect(st.momentum.filter((m) => m.gameWinner).map((m) => [m.index, m.gameWinner])).toEqual([
      [5, E],
      [11, E],
    ]);
  });

  it('deuce and tiebreak points', () => {
    const deuce = build(['E', 'E', 'E', 'O', 'O', 'O', 'E', 'O', 'O'].map((c) => ({ winner: c === 'E' ? E : O })));
    // Deuce points: index 6 (won by Elsa) and index 8 (back at deuce, won by opp)
    expect(deuce.elsa.deucePointsWon).toEqual({ num: 1, den: 2 });

    const sixAll = 'EOEOEOEOEOEO'.split('').flatMap((c) => Array(4).fill({ winner: c === 'E' ? E : O }));
    const tb = build([...sixAll, { winner: E }, { winner: O }, { winner: E }]);
    expect(tb.elsa.tiebreakPointsWon).toEqual({ num: 2, den: 3 });
    expect(tb.elsa.serviceGamesHeld).toEqual({ num: 6, den: 6 });
  });

  it('rejects points that do not match the replay', () => {
    const rep = replay(BO3, E, [E]);
    expect(() => computeMatchStats([], rep)).toThrow();
  });
});
