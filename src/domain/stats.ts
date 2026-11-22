// Per-match statistics, computed from the stored points plus the scoring
// engine's replay (which supplies server, break points, etc. for every point).
//
// Every percentage is kept as a Ratio (num/den) so the UI can show
// "62% (31/50)" and the cross-match analysis can sum numerators and
// denominators instead of averaging percentages.

import type { ReplayResult } from './scoring';
import { other, type Point, type RallyLength, type Side } from './types';

export interface Ratio {
  num: number;
  den: number;
}

const r = (): Ratio => ({ num: 0, den: 0 });
const tally = (x: Ratio, hit: boolean) => {
  x.den++;
  if (hit) x.num++;
};

export const pct = (x: Ratio): number | null => (x.den ? x.num / x.den : null);

export interface SideStats {
  pointsWon: Ratio;
  // Serve (only points with serve info count toward first/second-serve ratios)
  servePointsWon: Ratio;
  firstServeIn: Ratio;
  firstServeWon: Ratio;
  secondServeWon: Ratio;
  aces: number;
  serviceWinners: number;
  doubleFaults: number;
  serviceGamesHeld: Ratio;
  breakPointsSaved: Ratio;
  // Return
  returnPointsWon: Ratio;
  firstReturnWon: Ratio;
  secondReturnWon: Ratio;
  breakPointsConverted: Ratio;
  /** Games won on the other player's serve (not counting tiebreaks). */
  breaks: Ratio;
  // Point endings (by who hit the last ball)
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
  /** Points with a recorded ending, i.e. denominator for ending ratios. */
  endingsTracked: number;
  // Pressure
  gamePointsConverted: Ratio;
  deucePointsWon: Ratio;
  tiebreakPointsWon: Ratio;
  // Rally length
  rally: Record<RallyLength, Ratio>;
  longestStreak: number;
}

export interface MomentumPoint {
  index: number;
  /** Elsa's points won minus the opponent's, after this point. */
  diff: number;
  setIndex: number;
  winner: Side;
  breakPoint: boolean;
  /** The point ended a game; gameWinner holds who won it. */
  gameWinner: Side | null;
}

export interface MatchStats {
  elsa: SideStats;
  opp: SideStats;
  totalPoints: number;
  /** Points with standard-mode detail (an ending). */
  detailedPoints: number;
  momentum: MomentumPoint[];
}

function emptySide(): SideStats {
  return {
    pointsWon: r(),
    servePointsWon: r(),
    firstServeIn: r(),
    firstServeWon: r(),
    secondServeWon: r(),
    aces: 0,
    serviceWinners: 0,
    doubleFaults: 0,
    serviceGamesHeld: r(),
    breakPointsSaved: r(),
    returnPointsWon: r(),
    firstReturnWon: r(),
    secondReturnWon: r(),
    breakPointsConverted: r(),
    breaks: r(),
    winners: 0,
    unforcedErrors: 0,
    forcedErrors: 0,
    endingsTracked: 0,
    gamePointsConverted: r(),
    deucePointsWon: r(),
    tiebreakPointsWon: r(),
    rally: { short: r(), medium: r(), long: r() },
    longestStreak: 0,
  };
}

export function computeMatchStats(points: readonly Point[], rep: ReplayResult): MatchStats {
  if (points.length !== rep.contexts.length) throw new Error('points and replay are out of sync');
  const s: Record<Side, SideStats> = { elsa: emptySide(), opp: emptySide() };
  const streak: Record<Side, number> = { elsa: 0, opp: 0 };
  const gameEndAt = new Map<number, Side>();
  for (const g of rep.games) if (g.winner) gameEndAt.set(g.lastPoint, g.winner);

  const momentum: MomentumPoint[] = [];
  let diff = 0;
  let detailedPoints = 0;

  points.forEach((p, i) => {
    const ctx = rep.contexts[i];
    const srv = ctx.server;
    const rcv = ctx.receiver;
    const w = p.winner;

    for (const side of ['elsa', 'opp'] as const) {
      tally(s[side].pointsWon, w === side);
      if (ctx.gamePoint[side]) tally(s[side].gamePointsConverted, w === side);
      if (ctx.isDeuce || ctx.isDecidingPoint) tally(s[side].deucePointsWon, w === side);
      if (ctx.inTiebreak) tally(s[side].tiebreakPointsWon, w === side);
      if (p.rallyLength) tally(s[side].rally[p.rallyLength], w === side);
    }

    // Serve and return
    tally(s[srv].servePointsWon, w === srv);
    tally(s[rcv].returnPointsWon, w === rcv);
    if (p.firstServeIn !== undefined) {
      tally(s[srv].firstServeIn, p.firstServeIn);
      if (p.firstServeIn) {
        tally(s[srv].firstServeWon, w === srv);
        tally(s[rcv].firstReturnWon, w === rcv);
      } else {
        tally(s[srv].secondServeWon, w === srv);
        tally(s[rcv].secondReturnWon, w === rcv);
      }
    }
    if (ctx.isBreakPoint) {
      tally(s[srv].breakPointsSaved, w === srv);
      tally(s[rcv].breakPointsConverted, w === rcv);
    }

    // Endings
    if (p.ending && p.endedBy) {
      detailedPoints++;
      s.elsa.endingsTracked++;
      s.opp.endingsTracked++;
      const by = s[p.endedBy];
      switch (p.ending) {
        case 'ace':
          by.aces++;
          break;
        case 'service_winner':
          by.serviceWinners++;
          break;
        case 'double_fault':
          by.doubleFaults++;
          break;
        case 'winner':
          by.winners++;
          break;
        case 'unforced_error':
          by.unforcedErrors++;
          break;
        case 'forced_error':
          by.forcedErrors++;
          break;
      }
    }

    // Streaks
    streak[w]++;
    streak[other(w)] = 0;
    s[w].longestStreak = Math.max(s[w].longestStreak, streak[w]);

    diff += w === 'elsa' ? 1 : -1;
    momentum.push({
      index: i,
      diff,
      setIndex: ctx.setIndex,
      winner: w,
      breakPoint: ctx.isBreakPoint,
      gameWinner: gameEndAt.get(i) ?? null,
    });
  });

  // Games
  for (const g of rep.games) {
    if (!g.winner || g.isTiebreak) continue;
    tally(s[g.server].serviceGamesHeld, g.winner === g.server);
    tally(s[other(g.server)].breaks, g.winner !== g.server);
  }

  return { elsa: s.elsa, opp: s.opp, totalPoints: points.length, detailedPoints, momentum };
}
