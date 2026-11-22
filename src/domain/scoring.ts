// Scoring engine.
//
// The only stored data is the ordered list of point winners. Everything else
// (score, server, break points, set/match points, game list) is derived here by
// replaying the points from the start. Undo = drop the last point; editing a
// point in the middle = replay again.

import { other, zeroPair, type MatchFormat, type Pair, type Side } from './types';

export interface SetResult {
  /** Games won in the set. A match tiebreak is recorded as 1-0. */
  games: Pair;
  /** Tiebreak points, when the set was decided by a tiebreak. */
  tiebreak?: Pair;
  matchTiebreak: boolean;
  winner: Side;
}

export interface TiebreakState {
  target: number;
  matchTiebreak: boolean;
}

export interface ScoreState {
  completedSets: SetResult[];
  setsWon: Pair;
  /** Games in the current set. */
  games: Pair;
  /** Points in the current game, or tiebreak points while in a tiebreak. */
  points: Pair;
  tiebreak: TiebreakState | null;
  /** Server of the current game; in a tiebreak, the player who served its first point. */
  gameServer: Side;
  winner: Side | null;
}

export interface PointEvents {
  gameWon?: Side;
  setWon?: Side;
  matchWon?: Side;
}

/** Everything about the situation *before* a point is played. */
export interface PointContext {
  index: number;
  /** 0-based set number. */
  setIndex: number;
  /** 0-based game number across the whole match (a tiebreak counts as one game). */
  gameIndex: number;
  server: Side;
  receiver: Side;
  score: ScoreState;
  /** Score as shown on a scoreboard: 0/15/30/40/AD, or tiebreak point counts. */
  pointDisplay: Record<Side, string>;
  inTiebreak: boolean;
  isMatchTiebreak: boolean;
  /** 40-40 (or later equal score) in an advantage game. */
  isDeuce: boolean;
  /** 40-40 in a no-ad game: next point wins the game. */
  isDecidingPoint: boolean;
  /** The receiver wins a (non-tiebreak) game if they win this point. */
  isBreakPoint: boolean;
  /**
   * Which sides win the current (non-tiebreak) game by winning this point.
   * Both are true on a no-ad deciding point.
   */
  gamePoint: Record<Side, boolean>;
  setPointFor: Side | null;
  matchPointFor: Side | null;
}

export interface GameSummary {
  index: number;
  setIndex: number;
  server: Side;
  isTiebreak: boolean;
  isMatchTiebreak: boolean;
  /** null while the game is still in progress. */
  winner: Side | null;
  firstPoint: number;
  lastPoint: number;
}

export interface ReplayResult {
  contexts: PointContext[];
  games: GameSummary[];
  final: ScoreState;
  /** Context for the next point to be played; null once the match is over. */
  next: PointContext | null;
}

export class MatchOverError extends Error {
  constructor(index: number) {
    super(`Point #${index} was played after the match had already ended`);
    this.name = 'MatchOverError';
  }
}

export function validateFormat(f: MatchFormat): void {
  if (f.tiebreakAt < 1 || f.tiebreakAt > f.gamesPerSet) {
    throw new Error(`tiebreakAt (${f.tiebreakAt}) must be between 1 and gamesPerSet (${f.gamesPerSet})`);
  }
}

export function initialState(firstServer: Side): ScoreState {
  return {
    completedSets: [],
    setsWon: zeroPair(),
    games: zeroPair(),
    points: zeroPair(),
    tiebreak: null,
    gameServer: firstServer,
    winner: null,
  };
}

function cloneState(s: ScoreState): ScoreState {
  return {
    completedSets: s.completedSets.map((r) => ({
      ...r,
      games: { ...r.games },
      tiebreak: r.tiebreak && { ...r.tiebreak },
    })),
    setsWon: { ...s.setsWon },
    games: { ...s.games },
    points: { ...s.points },
    tiebreak: s.tiebreak && { ...s.tiebreak },
    gameServer: s.gameServer,
    winner: s.winner,
  };
}

/** Who serves the next point in the given state. */
export function currentServer(s: ScoreState): Side {
  if (!s.tiebreak) return s.gameServer;
  // Tiebreak: first point by gameServer, then alternate every two points (A, BB, AA, BB…).
  const n = s.points.elsa + s.points.opp;
  return Math.floor((n + 1) / 2) % 2 === 0 ? s.gameServer : other(s.gameServer);
}

/** Apply one point won by `w`. Returns a new state; the input is not modified. */
export function applyPoint(
  state: ScoreState,
  w: Side,
  format: MatchFormat,
): { state: ScoreState; events: PointEvents } {
  if (state.winner) throw new MatchOverError(-1);
  const s = cloneState(state);
  const l = other(w);
  const events: PointEvents = {};
  s.points[w]++;

  const finishSet = (result: SetResult) => {
    s.completedSets.push(result);
    s.setsWon[w]++;
    s.games = zeroPair();
    s.points = zeroPair();
    s.tiebreak = null;
    events.setWon = w;
    if (s.setsWon[w] === format.setsToWin) {
      s.winner = w;
      events.matchWon = w;
    } else if (
      format.finalSet === 'matchTiebreak10' &&
      format.setsToWin > 1 &&
      s.setsWon.elsa === format.setsToWin - 1 &&
      s.setsWon.opp === format.setsToWin - 1
    ) {
      s.tiebreak = { target: 10, matchTiebreak: true };
    }
  };

  if (s.tiebreak) {
    const tb = s.tiebreak;
    if (s.points[w] >= tb.target && s.points[w] - s.points[l] >= 2) {
      events.gameWon = w;
      const games = tb.matchTiebreak ? { [w]: 1, [l]: 0 } as Pair : { ...s.games, [w]: s.games[w] + 1 };
      const tiebreak = { ...s.points };
      // The player who received first in the tiebreak serves the next game.
      s.gameServer = other(s.gameServer);
      finishSet({ games, tiebreak, matchTiebreak: tb.matchTiebreak, winner: w });
    }
  } else {
    const p = s.points[w];
    const q = s.points[l];
    const gameWon = format.noAd ? p >= 4 : p >= 4 && p - q >= 2;
    if (gameWon) {
      events.gameWon = w;
      s.games[w]++;
      s.points = zeroPair();
      s.gameServer = other(s.gameServer);
      const g = s.games;
      if (g[w] >= format.gamesPerSet && g[w] - g[l] >= 2) {
        finishSet({ games: { ...g }, matchTiebreak: false, winner: w });
      } else if (g.elsa === format.tiebreakAt && g.opp === format.tiebreakAt) {
        s.tiebreak = { target: format.tiebreakPoints, matchTiebreak: false };
      }
    }
  }
  return { state: s, events };
}

const GAME_POINT_LABELS = ['0', '15', '30', '40'];

export function pointDisplay(s: ScoreState): Record<Side, string> {
  const { elsa, opp } = s.points;
  if (s.tiebreak) return { elsa: String(elsa), opp: String(opp) };
  if (elsa >= 3 && opp >= 3) {
    if (elsa === opp) return { elsa: '40', opp: '40' };
    return elsa > opp ? { elsa: 'AD', opp: '40' } : { elsa: '40', opp: 'AD' };
  }
  return { elsa: GAME_POINT_LABELS[elsa], opp: GAME_POINT_LABELS[opp] };
}

function describe(s: ScoreState, format: MatchFormat, index: number, gameIndex: number): PointContext {
  const server = currentServer(s);
  const receiver = other(server);
  const inTiebreak = s.tiebreak !== null;

  const gamePoint: Record<Side, boolean> = { elsa: false, opp: false };
  // Only one side can be one point from the set or match (a set-ending game
  // always gives the other side no set), so a single side is enough here.
  let setPointFor: Side | null = null;
  let matchPointFor: Side | null = null;
  for (const side of ['elsa', 'opp'] as const) {
    const { events } = applyPoint(s, side, format);
    if (!inTiebreak && events.gameWon === side) gamePoint[side] = true;
    if (events.setWon === side) setPointFor = side;
    if (events.matchWon === side) matchPointFor = side;
  }

  const bothAtForty = !inTiebreak && s.points.elsa >= 3 && s.points.opp >= 3 && s.points.elsa === s.points.opp;
  return {
    index,
    setIndex: s.completedSets.length,
    gameIndex,
    server,
    receiver,
    score: s,
    pointDisplay: pointDisplay(s),
    inTiebreak,
    isMatchTiebreak: s.tiebreak?.matchTiebreak ?? false,
    isDeuce: bothAtForty && !format.noAd,
    isDecidingPoint: bothAtForty && format.noAd,
    isBreakPoint: gamePoint[receiver],
    gamePoint,
    setPointFor,
    matchPointFor,
  };
}

/** Replay a whole match from its ordered list of point winners. */
export function replay(format: MatchFormat, firstServer: Side, winners: readonly Side[]): ReplayResult {
  validateFormat(format);
  let state = initialState(firstServer);
  let gameIndex = 0;
  const contexts: PointContext[] = [];
  const games: GameSummary[] = [];

  winners.forEach((w, i) => {
    if (state.winner) throw new MatchOverError(i);
    const ctx = describe(state, format, i, gameIndex);
    contexts.push(ctx);

    let game = games[games.length - 1];
    if (!game || game.winner !== null) {
      game = {
        index: gameIndex,
        setIndex: ctx.setIndex,
        server: state.gameServer,
        isTiebreak: ctx.inTiebreak,
        isMatchTiebreak: ctx.isMatchTiebreak,
        winner: null,
        firstPoint: i,
        lastPoint: i,
      };
      games.push(game);
    }
    game.lastPoint = i;

    const { state: nextState, events } = applyPoint(state, w, format);
    if (events.gameWon) {
      game.winner = events.gameWon;
      gameIndex++;
    }
    state = nextState;
  });

  return {
    contexts,
    games,
    final: state,
    next: state.winner ? null : describe(state, format, winners.length, gameIndex),
  };
}

/** "6-4 3-6 [10-8]" style summary, from Elsa's point of view. */
export function formatSetScores(sets: readonly SetResult[], current?: ScoreState): string {
  const parts = sets.map((r) => {
    if (r.matchTiebreak && r.tiebreak) return `[${r.tiebreak.elsa}-${r.tiebreak.opp}]`;
    const base = `${r.games.elsa}-${r.games.opp}`;
    if (!r.tiebreak) return base;
    const loserPoints = Math.min(r.tiebreak.elsa, r.tiebreak.opp);
    return `${base}(${loserPoints})`;
  });
  if (current && !current.winner && (current.games.elsa || current.games.opp || current.points.elsa || current.points.opp)) {
    parts.push(
      current.tiebreak?.matchTiebreak
        ? `[${current.points.elsa}-${current.points.opp}]`
        : `${current.games.elsa}-${current.games.opp}`,
    );
  }
  return parts.join(' ');
}
