// Which stats to show, in which order, with which labels. Shared by the match
// stats page and the cross-match analysis.
import { pct, type Ratio, type SideStats } from '../domain/stats';

export type StatValue = { kind: 'ratio'; ratio: Ratio } | { kind: 'count'; n: number };

export interface StatRow {
  key: string;
  label: string;
  get: (s: SideStats) => StatValue;
  /** Higher is better for the player (used for colouring and insights). */
  higherIsBetter: boolean;
  /** Needs standard-mode detail (serve info or endings). */
  needsDetail?: boolean;
}

const ratio = (f: (s: SideStats) => Ratio) => (s: SideStats): StatValue => ({ kind: 'ratio', ratio: f(s) });
const count = (f: (s: SideStats) => number) => (s: SideStats): StatValue => ({ kind: 'count', n: f(s) });

export const STAT_SECTIONS: { title: string; rows: StatRow[] }[] = [
  {
    title: '总体',
    rows: [{ key: 'pointsWon', label: '总得分率', get: ratio((s) => s.pointsWon), higherIsBetter: true }],
  },
  {
    title: '发球',
    rows: [
      { key: 'firstServeIn', label: '一发进球率', get: ratio((s) => s.firstServeIn), higherIsBetter: true, needsDetail: true },
      { key: 'firstServeWon', label: '一发得分率', get: ratio((s) => s.firstServeWon), higherIsBetter: true, needsDetail: true },
      { key: 'secondServeWon', label: '二发得分率', get: ratio((s) => s.secondServeWon), higherIsBetter: true, needsDetail: true },
      { key: 'servePointsWon', label: '发球局得分率', get: ratio((s) => s.servePointsWon), higherIsBetter: true },
      { key: 'aces', label: 'ACE', get: count((s) => s.aces), higherIsBetter: true, needsDetail: true },
      { key: 'doubleFaults', label: '双误', get: count((s) => s.doubleFaults), higherIsBetter: false, needsDetail: true },
      { key: 'serviceGamesHeld', label: '保发率', get: ratio((s) => s.serviceGamesHeld), higherIsBetter: true },
      { key: 'breakPointsSaved', label: '破发点挽救率', get: ratio((s) => s.breakPointsSaved), higherIsBetter: true },
    ],
  },
  {
    title: '接发',
    rows: [
      { key: 'returnPointsWon', label: '接发得分率', get: ratio((s) => s.returnPointsWon), higherIsBetter: true },
      { key: 'firstReturnWon', label: '接一发得分率', get: ratio((s) => s.firstReturnWon), higherIsBetter: true, needsDetail: true },
      { key: 'secondReturnWon', label: '接二发得分率', get: ratio((s) => s.secondReturnWon), higherIsBetter: true, needsDetail: true },
      { key: 'breakPointsConverted', label: '破发转化率', get: ratio((s) => s.breakPointsConverted), higherIsBetter: true },
      { key: 'breaks', label: '破发局数', get: ratio((s) => s.breaks), higherIsBetter: true },
    ],
  },
  {
    title: '每分结果',
    rows: [
      { key: 'winners', label: '制胜分', get: count((s) => s.winners), higherIsBetter: true, needsDetail: true },
      { key: 'unforcedErrors', label: '非受迫性失误', get: count((s) => s.unforcedErrors), higherIsBetter: false, needsDetail: true },
      { key: 'forcedErrors', label: '受迫性失误', get: count((s) => s.forcedErrors), higherIsBetter: false, needsDetail: true },
      {
        key: 'ueRate',
        label: '非受迫失误占比',
        get: ratio((s) => ({ num: s.unforcedErrors, den: s.endingsTracked })),
        higherIsBetter: false,
        needsDetail: true,
      },
      {
        key: 'netWinners',
        label: '制胜分 − 非受迫',
        get: count((s) => s.winners - s.unforcedErrors),
        higherIsBetter: true,
        needsDetail: true,
      },
    ],
  },
  {
    title: '关键分',
    rows: [
      { key: 'gamePointsConverted', label: '局点转化率', get: ratio((s) => s.gamePointsConverted), higherIsBetter: true },
      { key: 'deucePointsWon', label: 'Deuce / 金球分胜率', get: ratio((s) => s.deucePointsWon), higherIsBetter: true },
      { key: 'tiebreakPointsWon', label: '抢七分胜率', get: ratio((s) => s.tiebreakPointsWon), higherIsBetter: true },
      { key: 'longestStreak', label: '最长连续得分', get: count((s) => s.longestStreak), higherIsBetter: true },
    ],
  },
  {
    title: '回合长度（胜率）',
    rows: [
      { key: 'rallyShort', label: '短回合 1-4 拍', get: ratio((s) => s.rally.short), higherIsBetter: true },
      { key: 'rallyMedium', label: '中回合 5-8 拍', get: ratio((s) => s.rally.medium), higherIsBetter: true },
      { key: 'rallyLong', label: '长回合 9+ 拍', get: ratio((s) => s.rally.long), higherIsBetter: true },
    ],
  },
];

export const ALL_STAT_ROWS = STAT_SECTIONS.flatMap((s) => s.rows);

export function formatStat(v: StatValue, withCounts = true): string {
  if (v.kind === 'count') return String(v.n);
  const p = pct(v.ratio);
  if (p === null) return '—';
  const percent = `${Math.round(p * 100)}%`;
  return withCounts ? `${percent} (${v.ratio.num}/${v.ratio.den})` : percent;
}

/** Numeric value for comparisons: a fraction for ratios, the count otherwise. */
export function statNumber(v: StatValue): number | null {
  return v.kind === 'count' ? v.n : pct(v.ratio);
}
