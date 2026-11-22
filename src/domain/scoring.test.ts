import { describe, expect, it } from 'vitest';
import { formatSetScores, MatchOverError, replay } from './scoring';
import { FORMAT_PRESETS, pointWinner, type MatchFormat, type Side } from './types';

const E: Side = 'elsa';
const O: Side = 'opp';

/** "EEOO E" → ['elsa','elsa','opp','opp','elsa'] (spaces ignored). */
const pts = (s: string): Side[] => [...s.replace(/\s/g, '')].map((c) => (c === 'E' ? E : O));
/** A love game won by the given side. */
const game = (w: Side) => (w === E ? 'EEEE' : 'OOOO');
/** Love games won in the given order, e.g. games('EOE'). */
const games = (order: string) => [...order].map((c) => game(c === 'E' ? E : O)).join('');
const times = (s: string, n: number) => s.repeat(n);

const BO3 = FORMAT_PRESETS.bo3.format;
const BO3_MTB = FORMAT_PRESETS.bo3mtb.format;
const ONE_SET = FORMAT_PRESETS.oneSet.format;
const NO_AD: MatchFormat = { ...BO3, noAd: true };
const FAST4: MatchFormat = { ...BO3, gamesPerSet: 4, tiebreakAt: 3 };

describe('pointWinner', () => {
  it('ace / service winner / winner go to the player who hit the last ball', () => {
    expect(pointWinner('ace', E)).toBe(E);
    expect(pointWinner('service_winner', O)).toBe(O);
    expect(pointWinner('winner', E)).toBe(E);
  });
  it('double fault and errors go to the other player', () => {
    expect(pointWinner('double_fault', E)).toBe(O);
    expect(pointWinner('unforced_error', E)).toBe(O);
    expect(pointWinner('forced_error', O)).toBe(E);
  });
});

describe('standard games', () => {
  it('love game: score display, then server changes', () => {
    const r = replay(BO3, E, pts('EEE'));
    expect(r.contexts.map((c) => c.pointDisplay)).toEqual([
      { elsa: '0', opp: '0' },
      { elsa: '15', opp: '0' },
      { elsa: '30', opp: '0' },
    ]);
    expect(r.next?.pointDisplay).toEqual({ elsa: '40', opp: '0' });
    expect(r.next?.gamePoint).toEqual({ elsa: true, opp: false });
    expect(r.next?.isBreakPoint).toBe(false);

    const r2 = replay(BO3, E, pts('EEEE'));
    expect(r2.final.games).toEqual({ elsa: 1, opp: 0 });
    expect(r2.next?.server).toBe(O);
    expect(r2.next?.pointDisplay).toEqual({ elsa: '0', opp: '0' });
  });

  it('deuce and advantage', () => {
    const atDeuce = replay(BO3, E, pts('EEEOOO'));
    expect(atDeuce.next?.isDeuce).toBe(true);
    expect(atDeuce.next?.pointDisplay).toEqual({ elsa: '40', opp: '40' });

    const advOpp = replay(BO3, E, pts('EEEOOOO'));
    expect(advOpp.next?.pointDisplay).toEqual({ elsa: '40', opp: 'AD' });
    expect(advOpp.next?.isBreakPoint).toBe(true);
    expect(advOpp.next?.gamePoint).toEqual({ elsa: false, opp: true });

    const backToDeuce = replay(BO3, E, pts('EEEOOOOE'));
    expect(backToDeuce.next?.isDeuce).toBe(true);
    expect(backToDeuce.final.games).toEqual({ elsa: 0, opp: 0 });

    const won = replay(BO3, E, pts('EEEOOOOEEE'));
    expect(won.final.games).toEqual({ elsa: 1, opp: 0 });
  });

  it('break points: 0-40 and 30-40 for the receiver', () => {
    const r = replay(BO3, E, pts('OOO'));
    expect(r.next?.isBreakPoint).toBe(true);
    expect(r.next?.gamePoint).toEqual({ elsa: false, opp: true });

    const r2 = replay(BO3, E, pts('OOOEE'));
    expect(r2.next?.pointDisplay).toEqual({ elsa: '30', opp: '40' });
    expect(r2.next?.isBreakPoint).toBe(true);
  });

  it('no-ad: 40-40 is a deciding point that ends the game', () => {
    const r = replay(NO_AD, E, pts('EEEOOO'));
    expect(r.next?.isDecidingPoint).toBe(true);
    expect(r.next?.isDeuce).toBe(false);
    expect(r.next?.isBreakPoint).toBe(true);
    expect(r.next?.gamePoint).toEqual({ elsa: true, opp: true }); // either side wins the game

    const done = replay(NO_AD, E, pts('EEEOOOO'));
    expect(done.final.games).toEqual({ elsa: 0, opp: 1 });
    expect(done.next?.server).toBe(O);
  });
});

describe('sets', () => {
  it('6-4 set', () => {
    const r = replay(BO3, E, pts(games('EOEOEOEOEE')));
    expect(r.final.completedSets).toEqual([{ games: { elsa: 6, opp: 4 }, matchTiebreak: false, winner: E }]);
    expect(r.final.setsWon).toEqual({ elsa: 1, opp: 0 });
    expect(r.final.games).toEqual({ elsa: 0, opp: 0 });
  });

  it('6-5 does not end the set; 7-5 does', () => {
    const at65 = replay(BO3, E, pts(games('EOEOEOEOEOE')));
    expect(at65.final.completedSets).toHaveLength(0);
    expect(at65.final.games).toEqual({ elsa: 6, opp: 5 });
    const r = replay(BO3, E, pts(games('EOEOEOEOEOEE')));
    expect(r.final.completedSets[0].games).toEqual({ elsa: 7, opp: 5 });
  });

  it('set point and match point flags', () => {
    // One-set match, Elsa leads 5-0 and leads 40-0 in game 6.
    const r = replay(ONE_SET, E, pts(games('EEEEE') + 'EEE'));
    expect(r.next?.setPointFor).toBe(E);
    expect(r.next?.matchPointFor).toBe(E);
    const r2 = replay(ONE_SET, E, pts(games('EEEEE')));
    expect(r2.next?.setPointFor).toBeNull();
    // Best of three: a set point in set 1 is not a match point.
    const r3 = replay(BO3, E, pts(games('EEEEE') + 'EEE'));
    expect(r3.next?.setPointFor).toBe(E);
    expect(r3.next?.matchPointFor).toBeNull();
  });
});

describe('tiebreaks', () => {
  const toSixAll = games('EOEOEOEOEOEO'); // 12 games, Elsa served first

  it('starts at 6-6 with 1-2-2 serve rotation', () => {
    const r = replay(BO3, E, pts(toSixAll + 'EEEEEE'));
    const tb = r.contexts.slice(48);
    expect(tb.every((c) => c.inTiebreak)).toBe(true);
    expect(tb.map((c) => c.server)).toEqual([E, O, O, E, E, O]);
    expect(tb.map((c) => c.pointDisplay.elsa)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(r.next?.server).toBe(O);
    expect(r.next?.setPointFor).toBe(E);
    expect(r.next?.gamePoint).toEqual({ elsa: false, opp: false }); // tiebreaks have set points, not game points
    expect(r.next?.isBreakPoint).toBe(false);
  });

  it('7-0 tiebreak gives 7-6 and the tiebreak receiver serves next', () => {
    const r = replay(BO3, E, pts(toSixAll + 'EEEEEEE'));
    expect(r.final.completedSets[0]).toEqual({
      games: { elsa: 7, opp: 6 },
      tiebreak: { elsa: 7, opp: 0 },
      matchTiebreak: false,
      winner: E,
    });
    expect(r.next?.server).toBe(O);
    expect(r.next?.inTiebreak).toBe(false);
  });

  it('must be won by two points', () => {
    const at66 = toSixAll + times('EO', 6);
    const notYet = replay(BO3, E, pts(at66 + 'E'));
    expect(notYet.final.completedSets).toHaveLength(0);
    expect(notYet.final.points).toEqual({ elsa: 7, opp: 6 });
    const r = replay(BO3, E, pts(at66 + 'EOEE'));
    expect(r.final.completedSets[0].tiebreak).toEqual({ elsa: 9, opp: 7 });
  });

  it('Fast4-style short set: tiebreak at 3-3, set to 4', () => {
    const r = replay(FAST4, E, pts(games('EOEOEO')));
    expect(r.next?.inTiebreak).toBe(true);
    const r2 = replay(FAST4, E, pts(games('EOEOEE')));
    expect(r2.final.completedSets[0].games).toEqual({ elsa: 4, opp: 2 });
  });

  it('short set with tiebreak at 4-4', () => {
    const r = replay(FORMAT_PRESETS.shortSets.format, E, pts(games('EOEOEOEO')));
    expect(r.next?.inTiebreak).toBe(true);
    expect(r.next?.isMatchTiebreak).toBe(false);
  });
});

describe('match tiebreak in place of the final set', () => {
  const oneAll = times('E', 24) + times('O', 24); // 6-0, 0-6

  it('starts at one set all and is played to 10', () => {
    const r = replay(BO3_MTB, E, pts(oneAll));
    expect(r.final.setsWon).toEqual({ elsa: 1, opp: 1 });
    expect(r.next?.inTiebreak).toBe(true);
    expect(r.next?.isMatchTiebreak).toBe(true);
    expect(r.next?.server).toBe(E); // 12 games played, so Elsa serves game 13

    const at97 = replay(BO3_MTB, E, pts(oneAll + times('E', 9) + times('O', 7)));
    expect(at97.next?.matchPointFor).toBe(E);
    expect(at97.final.winner).toBeNull();
  });

  it('is won by two (11-9) and is recorded as 1-0 [11-9]', () => {
    const r = replay(BO3_MTB, E, pts(oneAll + times('EO', 9) + 'EE'));
    expect(r.final.winner).toBe(E);
    expect(r.next).toBeNull();
    expect(r.final.completedSets[2]).toEqual({
      games: { elsa: 1, opp: 0 },
      tiebreak: { elsa: 11, opp: 9 },
      matchTiebreak: true,
      winner: E,
    });
    expect(formatSetScores(r.final.completedSets)).toBe('6-0 0-6 [11-9]');
  });

  it('a full third set is played when finalSet is "full"', () => {
    const r = replay(BO3, E, pts(oneAll));
    expect(r.next?.inTiebreak).toBe(false);
  });
});

describe('match end and replay', () => {
  it('best of three ends after two sets', () => {
    const r = replay(BO3, E, pts(times('E', 48)));
    expect(r.final.winner).toBe(E);
    expect(r.next).toBeNull();
    expect(formatSetScores(r.final.completedSets)).toBe('6-0 6-0');
  });

  it('throws if points are recorded after the match ended', () => {
    expect(() => replay(BO3, E, pts(times('E', 49)))).toThrow(MatchOverError);
  });

  it('undo = drop the last point', () => {
    const seq = pts('EEEOOOO');
    const undone = replay(BO3, E, seq.slice(0, -1));
    expect(undone.next?.isDeuce).toBe(true);
  });

  it('editing a point in the middle changes everything after it', () => {
    const seq = pts(games('EE'));
    expect(replay(BO3, E, seq).final.games).toEqual({ elsa: 2, opp: 0 });
    const edited = [...seq];
    edited[0] = O; // game 1 becomes O,E,E,E,E (Elsa wins it a point later), game 2 is at 40-0
    const r = replay(BO3, E, edited);
    expect(r.final.games).toEqual({ elsa: 1, opp: 0 });
    expect(r.next?.pointDisplay).toEqual({ elsa: '40', opp: '0' });
  });

  it('game summaries give server and winner (holds and breaks)', () => {
    const r = replay(BO3, E, pts(games('EE') + 'O'));
    expect(r.games.map(({ server, winner, firstPoint, lastPoint }) => ({ server, winner, firstPoint, lastPoint }))).toEqual([
      { server: E, winner: E, firstPoint: 0, lastPoint: 3 }, // hold
      { server: O, winner: E, firstPoint: 4, lastPoint: 7 }, // break
      { server: E, winner: null, firstPoint: 8, lastPoint: 8 }, // in progress
    ]);
  });

  it('tiebreak shows up as one game in the summaries', () => {
    const r = replay(BO3, E, pts(games('EOEOEOEOEOEO') + times('E', 7)));
    const last = r.games[r.games.length - 1];
    expect(r.games).toHaveLength(13);
    expect(last).toMatchObject({ isTiebreak: true, server: E, winner: E, setIndex: 0 });
  });

  it('formatSetScores shows tiebreak loser points and the current set', () => {
    const r = replay(BO3, E, pts(games('EOEOEOEOEOEO') + times('EO', 5) + 'EE' + 'EEEE'));
    expect(formatSetScores(r.final.completedSets, r.final)).toBe('7-6(5) 1-0');
  });

  it('rejects an invalid format', () => {
    expect(() => replay({ ...BO3, tiebreakAt: 7 }, E, [])).toThrow();
  });
});
