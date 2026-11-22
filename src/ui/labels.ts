import type { PointContext } from '../domain/scoring';
import type { MatchStatus, Point, PointEnding, Side, Surface } from '../domain/types';

export const PLAYER_NAME = 'Elsa';

export type Names = Record<Side, string>;

export const ENDING_LABEL: Record<PointEnding, string> = {
  ace: 'ACE',
  service_winner: '发球直接得分',
  double_fault: '双误',
  winner: '制胜分',
  unforced_error: '非受迫性失误',
  forced_error: '受迫性失误',
};

export const SURFACE_LABEL: Record<Surface, string> = {
  hard: '硬地',
  clay: '红土',
  grass: '草地',
  indoor: '室内',
};

export const STATUS_LABEL: Record<MatchStatus, string> = {
  in_progress: '进行中',
  completed: '已结束',
  retired: '退赛',
  abandoned: '中止',
};

/** "二发 · Mia 非受迫性失误 → Elsa 得分" */
export function describePoint(p: Point, names: Names): string {
  if (!p.ending || !p.endedBy) return `${names[p.winner]} 得分`;
  const serve = p.firstServeIn === undefined ? '' : p.firstServeIn ? '一发 · ' : '二发 · ';
  const what = `${names[p.endedBy]} ${ENDING_LABEL[p.ending]}`;
  return p.winner === p.endedBy ? `${serve}${what}` : `${serve}${what} → ${names[p.winner]} 得分`;
}

/** The one most important situation label for the next point, if any. */
export function situationLabel(ctx: PointContext, names: Names): string | null {
  if (ctx.matchPointFor) return `${names[ctx.matchPointFor]} 赛点`;
  if (ctx.setPointFor) return `${names[ctx.setPointFor]} 盘点`;
  if (ctx.isBreakPoint && !ctx.isDecidingPoint) return `${names[ctx.receiver]} 破发点`;
  if (ctx.isDecidingPoint) return '金球（决胜分）';
  if (ctx.isDeuce) return 'Deuce';
  if (ctx.isMatchTiebreak) return '抢十';
  if (ctx.inTiebreak) return '抢七';
  return null;
}

/** Today's date in local time as YYYY-MM-DD. */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
