// Cross-match analysis: filters, totals, trends, win/loss comparison,
// grouping and rule-based insights. Pure functions over per-match stats.
//
// Ratios are aggregated by summing numerators and denominators (so a match
// with 80 serve points weighs more than one with 20). Counts are averaged
// per match.

import type { MatchStats, Ratio, SideStats } from './stats';
import { pct } from './stats';
import { other, type Match, type Opponent, type Side, type Surface } from './types';

export interface MatchRecord {
  match: Match;
  opponent?: Opponent;
  stats: MatchStats;
  /** Who won: completed → replay winner; retired → the side that didn't retire; else null. */
  result: Side | null;
  /** "6-4 3-6 [10-8]" */
  score: string;
}

export function matchResult(match: Match, replayWinner: Side | null): Side | null {
  if (match.status === 'completed') return replayWinner;
  if (match.status === 'retired' && match.retiredSide) return other(match.retiredSide);
  return null;
}

// ---- filtering --------------------------------------------------------------

export interface AnalysisFilter {
  /** Only the N most recent matches (after other filters). */
  last?: number;
  /** YYYY-MM-DD inclusive. */
  from?: string;
  surface?: Surface;
  opponentId?: string;
}

/** Oldest first, so trends read left to right. */
export function sortChronological(records: readonly MatchRecord[]): MatchRecord[] {
  return [...records].sort((a, b) => a.match.date.localeCompare(b.match.date) || a.match.createdAt - b.match.createdAt);
}

export function filterRecords(records: readonly MatchRecord[], f: AnalysisFilter): MatchRecord[] {
  let out = sortChronological(records).filter(
    (r) =>
      r.stats.totalPoints > 0 &&
      (!f.from || r.match.date >= f.from) &&
      (!f.surface || r.match.surface === f.surface) &&
      (!f.opponentId || r.match.opponentId === f.opponentId),
  );
  if (f.last) out = out.slice(-f.last);
  return out;
}

// ---- totals -----------------------------------------------------------------

const addRatio = (a: Ratio, b: Ratio): Ratio => ({ num: a.num + b.num, den: a.den + b.den });

export function sumSideStats(list: readonly SideStats[]): SideStats | null {
  if (!list.length) return null;
  return list.reduce((acc, s) => {
    const out = { ...acc } as SideStats;
    for (const key of Object.keys(s) as (keyof SideStats)[]) {
      const a = acc[key];
      const b = s[key];
      if (key === 'rally') {
        out.rally = {
          short: addRatio(acc.rally.short, s.rally.short),
          medium: addRatio(acc.rally.medium, s.rally.medium),
          long: addRatio(acc.rally.long, s.rally.long),
        };
      } else if (key === 'longestStreak') {
        out.longestStreak = Math.max(acc.longestStreak, s.longestStreak);
      } else if (typeof a === 'number' && typeof b === 'number') {
        (out[key] as number) = a + b;
      } else {
        (out[key] as Ratio) = addRatio(a as Ratio, b as Ratio);
      }
    }
    return out;
  });
}

export interface Totals {
  matches: number;
  wins: number;
  losses: number;
  elsa: SideStats | null;
  opp: SideStats | null;
  /** Matches that have standard-mode detail, for per-match averages of counts. */
  detailedMatches: number;
}

export function totals(records: readonly MatchRecord[]): Totals {
  return {
    matches: records.length,
    wins: records.filter((r) => r.result === 'elsa').length,
    losses: records.filter((r) => r.result === 'opp').length,
    elsa: sumSideStats(records.map((r) => r.stats.elsa)),
    opp: sumSideStats(records.map((r) => r.stats.opp)),
    detailedMatches: records.filter((r) => r.stats.detailedPoints > 0).length,
  };
}

// ---- metrics ----------------------------------------------------------------
// A metric turns SideStats into a number. Ratio metrics aggregate by summing;
// count metrics are averaged over matches with detail.

export interface Metric {
  key: string;
  label: string;
  kind: 'ratio' | 'count';
  higherIsBetter: boolean;
  ratio?: (s: SideStats) => Ratio;
  count?: (s: SideStats) => number;
  /** Count metric needs standard-mode detail. */
  needsDetail?: boolean;
}

export const METRICS: Metric[] = [
  { key: 'pointsWon', label: '总得分率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.pointsWon },
  { key: 'firstServeIn', label: '一发进球率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.firstServeIn },
  { key: 'firstServeWon', label: '一发得分率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.firstServeWon },
  { key: 'secondServeWon', label: '二发得分率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.secondServeWon },
  { key: 'serviceGamesHeld', label: '保发率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.serviceGamesHeld },
  { key: 'breakPointsSaved', label: '破发点挽救率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.breakPointsSaved },
  { key: 'returnPointsWon', label: '接发得分率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.returnPointsWon },
  { key: 'breakPointsConverted', label: '破发转化率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.breakPointsConverted },
  {
    key: 'ueRate',
    label: '非受迫失误占比',
    kind: 'ratio',
    higherIsBetter: false,
    ratio: (s) => ({ num: s.unforcedErrors, den: s.endingsTracked }),
  },
  {
    key: 'winnerRate',
    label: '制胜分占比',
    kind: 'ratio',
    higherIsBetter: true,
    ratio: (s) => ({ num: s.winners, den: s.endingsTracked }),
  },
  { key: 'deucePointsWon', label: 'Deuce / 金球分胜率', kind: 'ratio', higherIsBetter: true, ratio: (s) => s.deucePointsWon },
  { key: 'aces', label: '每场 ACE', kind: 'count', higherIsBetter: true, count: (s) => s.aces, needsDetail: true },
  { key: 'doubleFaults', label: '每场双误', kind: 'count', higherIsBetter: false, count: (s) => s.doubleFaults, needsDetail: true },
];

export const metricByKey = (key: string) => METRICS.find((m) => m.key === key)!;

/** Value of a metric for one match's (or a total's) side stats. */
export function metricValue(m: Metric, s: SideStats | null, matchesForCounts = 1): number | null {
  if (!s) return null;
  if (m.kind === 'ratio') return pct(m.ratio!(s));
  return matchesForCounts > 0 ? m.count!(s) / matchesForCounts : null;
}

/** Metric over a set of matches (ratio: pooled; count: per detailed match). */
export function metricOver(m: Metric, records: readonly MatchRecord[], side: Side = 'elsa'): number | null {
  const t = totals(records);
  const n = m.needsDetail ? t.detailedMatches : t.matches;
  return metricValue(m, t[side], n);
}

/** Denominator behind a ratio metric (for "is there enough data" checks). */
export function metricSample(m: Metric, records: readonly MatchRecord[]): number {
  const t = totals(records);
  if (m.kind === 'count') return m.needsDetail ? t.detailedMatches : t.matches;
  return t.elsa ? m.ratio!(t.elsa).den : 0;
}

// ---- trends -----------------------------------------------------------------

export interface TrendPoint {
  record: MatchRecord;
  value: number;
}

export function trend(records: readonly MatchRecord[], m: Metric): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const record of sortChronological(records)) {
    if (m.needsDetail && record.stats.detailedPoints === 0) continue;
    const v = metricValue(m, record.stats.elsa);
    if (v !== null) out.push({ record, value: v });
  }
  return out;
}

// ---- win / loss comparison --------------------------------------------------

export interface WinLossRow {
  metric: Metric;
  inWins: number;
  inLosses: number;
  /** inWins − inLosses, signed so that positive = "better when winning". */
  gap: number;
}

export function winLossComparison(records: readonly MatchRecord[]): WinLossRow[] {
  const wins = records.filter((r) => r.result === 'elsa');
  const losses = records.filter((r) => r.result === 'opp');
  if (!wins.length || !losses.length) return [];
  const rows: WinLossRow[] = [];
  for (const metric of METRICS) {
    const w = metricOver(metric, wins);
    const l = metricOver(metric, losses);
    if (w === null || l === null) continue;
    const gap = metric.higherIsBetter ? w - l : l - w;
    rows.push({ metric, inWins: w, inLosses: l, gap });
  }
  // Ratio metrics first by gap size; counts are on another scale so they go last.
  return rows.sort((a, b) =>
    a.metric.kind !== b.metric.kind ? (a.metric.kind === 'ratio' ? -1 : 1) : Math.abs(b.gap) - Math.abs(a.gap),
  );
}

// ---- grouping ---------------------------------------------------------------

export interface Group {
  key: string;
  records: MatchRecord[];
  wins: number;
  losses: number;
}

export function groupBy(records: readonly MatchRecord[], keyOf: (r: MatchRecord) => string | undefined): Group[] {
  const map = new Map<string, MatchRecord[]>();
  for (const r of records) {
    const k = keyOf(r);
    if (k === undefined) continue;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([key, rs]) => ({
      key,
      records: rs,
      wins: rs.filter((r) => r.result === 'elsa').length,
      losses: rs.filter((r) => r.result === 'opp').length,
    }))
    .sort((a, b) => b.records.length - a.records.length);
}

// ---- insights ---------------------------------------------------------------

export interface Insight {
  tone: 'good' | 'bad' | 'info';
  text: string;
}

const P = (x: number) => `${Math.round(x * 100)}%`;

/** Minimum denominator for a ratio to be trusted in an insight. */
const MIN_SAMPLE = 15;

export function insights(records: readonly MatchRecord[], recentN = 5): Insight[] {
  const out: Insight[] = [];
  const sorted = sortChronological(records);

  // 1. Recent form vs before, for each ratio metric.
  if (sorted.length >= recentN + 1) {
    const recent = sorted.slice(-recentN);
    const before = sorted.slice(0, -recentN);
    for (const m of METRICS) {
      if (m.kind !== 'ratio') continue;
      if (metricSample(m, recent) < MIN_SAMPLE || metricSample(m, before) < MIN_SAMPLE) continue;
      const a = metricOver(m, recent);
      const b = metricOver(m, before);
      if (a === null || b === null || Math.abs(a - b) < 0.08) continue;
      const better = m.higherIsBetter ? a > b : a < b;
      out.push({
        tone: better ? 'good' : 'bad',
        text: `最近 ${recentN} 场${m.label} ${P(a)}，之前 ${P(b)}（${a > b ? '上升' : '下降'} ${Math.round(Math.abs(a - b) * 100)} 个百分点）`,
      });
    }
  }

  // 2. Serving under pressure vs serving overall.
  const t = totals(sorted);
  if (t.elsa && t.elsa.breakPointsSaved.den >= 10) {
    const bp = pct(t.elsa.breakPointsSaved)!;
    const serve = pct(t.elsa.servePointsWon)!;
    if (bp < serve - 0.1) {
      out.push({
        tone: 'bad',
        text: `面对破发点时只赢了 ${P(bp)}，明显低于平时发球得分率 ${P(serve)}：关键分发球可以多练`,
      });
    } else if (bp > serve + 0.05) {
      out.push({ tone: 'good', text: `破发点挽救率 ${P(bp)}，比平时发球得分率 ${P(serve)} 还高：关键分很顶得住` });
    }
  }

  // 3. Converting break points vs winning return points.
  if (t.elsa && t.elsa.breakPointsConverted.den >= 10) {
    const bp = pct(t.elsa.breakPointsConverted)!;
    const ret = pct(t.elsa.returnPointsWon)!;
    if (bp < ret - 0.1) {
      out.push({ tone: 'bad', text: `破发点只转化了 ${P(bp)}，低于平时接发得分率 ${P(ret)}：有机会时容易保守或着急` });
    }
  }

  // 4. Second serve gap.
  if (t.elsa && t.elsa.secondServeWon.den >= MIN_SAMPLE && t.elsa.firstServeWon.den >= MIN_SAMPLE) {
    const first = pct(t.elsa.firstServeWon)!;
    const second = pct(t.elsa.secondServeWon)!;
    if (first - second > 0.2) {
      out.push({ tone: 'info', text: `一发得分率 ${P(first)}，二发只有 ${P(second)}：提高一发进球率或二发质量收益最大` });
    }
  }

  // 5. What separates wins from losses.
  const wl = winLossComparison(sorted).filter((r) => r.metric.kind === 'ratio' && r.metric.key !== 'pointsWon');
  const top = wl[0];
  if (top && top.gap > 0.05) {
    out.push({
      tone: 'info',
      text: `赢球和输球差别最大的是${top.metric.label}：赢球时 ${P(top.inWins)}，输球时 ${P(top.inLosses)}`,
    });
  }

  return out;
}

// ---- opponents --------------------------------------------------------------

export interface HeadToHead {
  opponent: Opponent;
  records: MatchRecord[];
  wins: number;
  losses: number;
  lastDate?: string;
}

export function headToHead(opponents: readonly Opponent[], records: readonly MatchRecord[]): HeadToHead[] {
  return opponents
    .map((opponent) => {
      const rs = sortChronological(records.filter((r) => r.match.opponentId === opponent.id));
      return {
        opponent,
        records: rs,
        wins: rs.filter((r) => r.result === 'elsa').length,
        losses: rs.filter((r) => r.result === 'opp').length,
        lastDate: rs[rs.length - 1]?.match.date,
      };
    })
    .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '') || a.opponent.name.localeCompare(b.opponent.name));
}
