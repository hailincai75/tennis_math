// Backup (JSON) import/export and CSV export.
import { replay } from '../domain/scoring';
import type { Match, Opponent, Point } from '../domain/types';
import type { TennisDB } from './db';
import { checkMatch, ValidationError } from './repo';

export const BACKUP_APP = 'tennis-math';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  opponents: Opponent[];
  matches: Match[];
  points: Point[];
}

export async function exportBackup(db: TennisDB): Promise<Backup> {
  return db.transaction('r', db.opponents, db.matches, db.points, async () => ({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    opponents: await db.opponents.toArray(),
    matches: await db.matches.toArray(),
    points: await db.points.toArray(),
  }));
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Parse and check a backup file. Every match must replay cleanly. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ValidationError('文件不是有效的 JSON');
  }
  if (!isObj(data) || data.app !== BACKUP_APP) throw new ValidationError('这不是 Tennis Math 的备份文件');
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new ValidationError('备份文件来自更新版本的 app，请先更新 app');
  }
  for (const key of ['opponents', 'matches', 'points'] as const) {
    if (!Array.isArray(data[key]) || !(data[key] as unknown[]).every((x) => isObj(x) && typeof x.id === 'string')) {
      throw new ValidationError(`备份文件的 ${key} 部分格式不对`);
    }
  }
  const b = data as unknown as Backup;
  const oppIds = new Set(b.opponents.map((o) => o.id));
  const byMatch = new Map<string, Point[]>();
  for (const p of b.points) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);
  for (const m of b.matches) {
    if (!oppIds.has(m.opponentId)) throw new ValidationError(`比赛 ${m.date} 的对手不在备份里`);
    const ps = (byMatch.get(m.id) ?? []).sort((a, c) => a.seq - c.seq);
    if (ps.some((p, i) => p.seq !== i)) throw new ValidationError(`比赛 ${m.date} 的得分序号不连续`);
    try {
      checkMatch(m, ps);
    } catch (e) {
      throw new ValidationError(`比赛 ${m.date} 的数据有问题：${e instanceof Error ? e.message : e}`);
    }
  }
  const matchIds = new Set(b.matches.map((m) => m.id));
  if (b.points.some((p) => !matchIds.has(p.matchId))) throw new ValidationError('有得分记录找不到对应的比赛');
  return b;
}

export interface ImportResult {
  opponents: number;
  matches: number;
  points: number;
}

/**
 * Import a parsed backup.
 * - replace: wipe everything first.
 * - merge: add/overwrite by id; a match in the backup replaces that match's points entirely.
 */
export async function importBackup(db: TennisDB, b: Backup, mode: 'merge' | 'replace'): Promise<ImportResult> {
  await db.transaction('rw', db.opponents, db.matches, db.points, async () => {
    if (mode === 'replace') {
      await Promise.all([db.opponents.clear(), db.matches.clear(), db.points.clear()]);
    } else {
      for (const m of b.matches) await db.points.where('matchId').equals(m.id).delete();
    }
    await db.opponents.bulkPut(b.opponents);
    await db.matches.bulkPut(b.matches);
    await db.points.bulkPut(b.points);
  });
  return { opponents: b.opponents.length, matches: b.matches.length, points: b.points.length };
}

// ---- CSV -------------------------------------------------------------------

export function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (Chinese text) correctly.
  return '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/** One row per point, with the derived score context. */
export function pointsCsv(b: Pick<Backup, 'opponents' | 'matches' | 'points'>, playerName: string): string {
  const opp = new Map(b.opponents.map((o) => [o.id, o.name]));
  const rows: unknown[][] = [
    [
      'date', 'opponent', 'event', 'round', 'surface', 'match_id', 'point_no', 'set', 'game_score_before',
      'point_score_before', 'server', 'winner', 'first_serve_in', 'ending', 'ended_by', 'rally_length',
      'break_point', 'tiebreak', 'note',
    ],
  ];
  const matches = [...b.matches].sort((a, c) => a.date.localeCompare(c.date) || a.createdAt - c.createdAt);
  for (const m of matches) {
    const ps = b.points.filter((p) => p.matchId === m.id).sort((a, c) => a.seq - c.seq);
    const r = replay(m.format, m.firstServer, ps.map((p) => p.winner));
    const name = (s: string | undefined) => (s === 'elsa' ? playerName : s === 'opp' ? (opp.get(m.opponentId) ?? 'opponent') : '');
    ps.forEach((p, i) => {
      const c = r.contexts[i];
      rows.push([
        m.date, opp.get(m.opponentId), m.event, m.round, m.surface, m.id, i + 1, c.setIndex + 1,
        `${c.score.games.elsa}-${c.score.games.opp}`, `${c.pointDisplay.elsa}-${c.pointDisplay.opp}`,
        name(c.server), name(p.winner),
        p.firstServeIn === undefined ? '' : p.firstServeIn ? 'yes' : 'no',
        p.ending, name(p.endedBy), p.rallyLength, c.isBreakPoint ? 'yes' : '', c.inTiebreak ? 'yes' : '', p.note,
      ]);
    });
  }
  return toCsv(rows);
}
