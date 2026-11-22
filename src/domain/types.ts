// Core domain types shared by the scoring engine, stats engine and storage.

export type Side = 'elsa' | 'opp';

export const other = (s: Side): Side => (s === 'elsa' ? 'opp' : 'elsa');

export type Pair = Record<Side, number>;

export const zeroPair = (): Pair => ({ elsa: 0, opp: 0 });

export interface MatchFormat {
  /** 1 = one set, 2 = best of three. */
  setsToWin: 1 | 2;
  /** Games needed to win a set (with a 2-game lead): 4 short set, 6 standard, 8 pro set. */
  gamesPerSet: 4 | 6 | 8;
  /** A tiebreak is played at tiebreakAt-tiebreakAt (e.g. 6 → 6-6, Fast4 uses 3 with 4-game sets). */
  tiebreakAt: number;
  /** Points to win a set tiebreak (win by 2). */
  tiebreakPoints: 7 | 10;
  /** Deciding set: a full set, or a 10-point match tiebreak in its place. */
  finalSet: 'full' | 'matchTiebreak10';
  /** No-ad scoring: at 40-40 the next point wins the game. */
  noAd: boolean;
}

export type PointEnding =
  | 'ace' // serve not touched by the receiver
  | 'service_winner' // serve touched but not returned
  | 'double_fault'
  | 'winner'
  | 'unforced_error'
  | 'forced_error';

/** Endings where the player who hit the last ball wins the point. */
const WINNING_ENDINGS: ReadonlySet<PointEnding> = new Set(['ace', 'service_winner', 'winner']);

/** Who won the point, given how it ended and who hit the last ball. */
export function pointWinner(ending: PointEnding, endedBy: Side): Side {
  return WINNING_ENDINGS.has(ending) ? endedBy : other(endedBy);
}

export const FORMAT_PRESETS: Record<string, { label: string; format: MatchFormat }> = {
  bo3: {
    label: '三盘两胜（决胜盘打满）',
    format: { setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, finalSet: 'full', noAd: false },
  },
  bo3mtb: {
    label: '三盘两胜（决胜盘抢十）',
    format: { setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, finalSet: 'matchTiebreak10', noAd: false },
  },
  oneSet: {
    label: '一盘定胜负',
    format: { setsToWin: 1, gamesPerSet: 6, tiebreakAt: 6, tiebreakPoints: 7, finalSet: 'full', noAd: false },
  },
  proSet: {
    label: '8 局 Pro set',
    format: { setsToWin: 1, gamesPerSet: 8, tiebreakAt: 8, tiebreakPoints: 7, finalSet: 'full', noAd: false },
  },
  shortSets: {
    label: '短盘三盘两胜（4 局，4-4 抢七，决胜盘抢十，金球）',
    format: { setsToWin: 2, gamesPerSet: 4, tiebreakAt: 4, tiebreakPoints: 7, finalSet: 'matchTiebreak10', noAd: true },
  },
};
