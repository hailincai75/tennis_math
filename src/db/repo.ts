// Data access for opponents, matches and points.
//
// Every write that touches points re-validates the whole match by replaying it
// through the scoring engine, so the database can never hold a point sequence
// that is impossible (points after match end, an ace by the receiver, …).

import Dexie from 'dexie';
import { replay, type ReplayResult } from '../domain/scoring';
import {
  pointWinner,
  SERVE_ENDINGS,
  type Match,
  type MatchStatus,
  type Opponent,
  type Point,
  type PointDetails,
  type Side,
} from '../domain/types';
import { TennisDB } from './db';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type NewOpponent = Omit<Opponent, 'id' | 'createdAt'>;
export type NewMatch = Omit<Match, 'id' | 'status' | 'retiredSide' | 'createdAt' | 'updatedAt'>;
export type MatchInfoPatch = Partial<Omit<Match, 'id' | 'status' | 'retiredSide' | 'createdAt' | 'updatedAt'>>;

export interface LoadedMatch {
  match: Match;
  points: Point[];
  replay: ReplayResult;
}

const newId = () => crypto.randomUUID();

/**
 * Turn what the user entered for a point into the stored fields, checking that
 * it is self-consistent. `server` is who serves this point.
 */
export function resolvePointDetails(d: PointDetails, server: Side): Omit<Point, 'id' | 'matchId' | 'seq' | 'timestamp'> {
  let winner: Side;
  let firstServeIn = d.firstServeIn;
  if (d.ending) {
    if (!d.endedBy) throw new ValidationError('记录了结束方式，但没有记录是谁打的最后一拍');
    winner = pointWinner(d.ending, d.endedBy);
    if (d.winner && d.winner !== winner) throw new ValidationError('得分方和结束方式不一致');
    if (SERVE_ENDINGS.has(d.ending) && d.endedBy !== server) {
      throw new ValidationError('ACE、发球直接得分、双误只能是发球方');
    }
    if (d.ending === 'double_fault') {
      if (firstServeIn === true) throw new ValidationError('双误时一发不可能进');
      firstServeIn = false;
    }
  } else {
    if (d.endedBy) throw new ValidationError('记录了是谁打的最后一拍，但没有记录结束方式');
    if (!d.winner) throw new ValidationError('没有记录这一分谁赢');
    winner = d.winner;
  }
  const out: Omit<Point, 'id' | 'matchId' | 'seq' | 'timestamp'> = { winner };
  if (firstServeIn !== undefined) out.firstServeIn = firstServeIn;
  if (d.ending) out.ending = d.ending;
  if (d.endedBy) out.endedBy = d.endedBy;
  if (d.rallyLength) out.rallyLength = d.rallyLength;
  if (d.stroke) out.stroke = d.stroke;
  if (d.note) out.note = d.note;
  return out;
}

/** Replay a match's points and check every point against its context. */
export function checkMatch(match: Pick<Match, 'format' | 'firstServer'>, points: readonly Point[]): ReplayResult {
  let result: ReplayResult;
  try {
    result = replay(match.format, match.firstServer, points.map((p) => p.winner));
  } catch (e) {
    throw new ValidationError(e instanceof Error && e.name === 'MatchOverError' ? '比赛已经结束，后面不能再有得分' : String(e));
  }
  points.forEach((p, i) => {
    if (p.ending && SERVE_ENDINGS.has(p.ending) && p.endedBy !== result.contexts[i].server) {
      throw new ValidationError(`第 ${i + 1} 分：ACE、发球直接得分、双误只能是发球方`);
    }
  });
  return result;
}

/** Status after the points changed: completed iff the replay has a winner. */
function nextStatus(current: MatchStatus, r: ReplayResult): MatchStatus {
  if (r.final.winner) return 'completed';
  return current === 'completed' ? 'in_progress' : current;
}

export class Repo {
  constructor(readonly db: TennisDB) {}

  // ---- opponents ---------------------------------------------------------

  async addOpponent(data: NewOpponent): Promise<Opponent> {
    const name = data.name.trim();
    if (!name) throw new ValidationError('对手姓名不能为空');
    const opp: Opponent = { ...data, name, id: newId(), createdAt: Date.now() };
    await this.db.opponents.add(opp);
    return opp;
  }

  async updateOpponent(id: string, patch: Partial<NewOpponent>): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) throw new ValidationError('对手姓名不能为空');
    const n = await this.db.opponents.update(id, patch.name ? { ...patch, name: patch.name.trim() } : patch);
    if (!n) throw new ValidationError('找不到这个对手');
  }

  listOpponents(): Promise<Opponent[]> {
    return this.db.opponents.orderBy('name').toArray();
  }

  getOpponent(id: string): Promise<Opponent | undefined> {
    return this.db.opponents.get(id);
  }

  async deleteOpponent(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.opponents, this.db.matches, async () => {
      const used = await this.db.matches.where('opponentId').equals(id).count();
      if (used) throw new ValidationError(`这个对手还有 ${used} 场比赛记录，不能删除`);
      await this.db.opponents.delete(id);
    });
  }

  // ---- matches -----------------------------------------------------------

  async createMatch(data: NewMatch): Promise<Match> {
    checkMatch(data, []); // validates the format
    if (!(await this.db.opponents.get(data.opponentId))) throw new ValidationError('找不到这个对手');
    const now = Date.now();
    const match: Match = { ...data, id: newId(), status: 'in_progress', createdAt: now, updatedAt: now };
    await this.db.matches.add(match);
    return match;
  }

  getMatch(id: string): Promise<Match | undefined> {
    return this.db.matches.get(id);
  }

  /** Newest first (by match date, then by creation time). */
  async listMatches(): Promise<Match[]> {
    const all = await this.db.matches.toArray();
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  listMatchesAgainst(opponentId: string): Promise<Match[]> {
    return this.db.matches.where('opponentId').equals(opponentId).reverse().sortBy('date');
  }

  /** Change match info. Changing format or first server re-validates all points. */
  async updateMatchInfo(id: string, patch: MatchInfoPatch): Promise<Match> {
    return this.db.transaction('rw', this.db.matches, this.db.points, this.db.opponents, async () => {
      const match = await this.requireMatch(id);
      if (patch.opponentId && !(await this.db.opponents.get(patch.opponentId))) {
        throw new ValidationError('找不到这个对手');
      }
      const updated: Match = { ...match, ...patch, updatedAt: Date.now() };
      const r = checkMatch(updated, await this.getPoints(id));
      updated.status = nextStatus(updated.status, r);
      await this.db.matches.put(updated);
      return updated;
    });
  }

  /** Stop a match before it is finished: retirement or abandoned (rain, time…). */
  async endMatch(id: string, status: 'retired' | 'abandoned', retiredSide?: Side): Promise<void> {
    if (status === 'retired' && !retiredSide) throw new ValidationError('需要选择是谁退赛');
    await this.db.transaction('rw', this.db.matches, async () => {
      const match = await this.requireMatch(id);
      if (match.status === 'completed') throw new ValidationError('比赛已经正常结束');
      const update: Partial<Match> = { status, updatedAt: Date.now(), retiredSide: status === 'retired' ? retiredSide : undefined };
      await this.db.matches.update(id, update);
    });
  }

  /** Undo endMatch: continue recording a retired/abandoned match. */
  async resumeMatch(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.matches, async () => {
      const match = await this.requireMatch(id);
      if (match.status !== 'retired' && match.status !== 'abandoned') return;
      await this.db.matches.update(id, { status: 'in_progress', retiredSide: undefined, updatedAt: Date.now() });
    });
  }

  async deleteMatch(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.matches, this.db.points, async () => {
      await this.db.points.where('matchId').equals(id).delete();
      await this.db.matches.delete(id);
    });
  }

  // ---- points ------------------------------------------------------------

  getPoints(matchId: string): Promise<Point[]> {
    return this.db.points
      .where('[matchId+seq]')
      .between([matchId, Dexie.minKey], [matchId, Dexie.maxKey])
      .toArray();
  }

  async loadMatch(matchId: string): Promise<LoadedMatch> {
    return this.db.transaction('r', this.db.matches, this.db.points, async () => {
      const match = await this.requireMatch(matchId);
      const points = await this.getPoints(matchId);
      return { match, points, replay: checkMatch(match, points) };
    });
  }

  /** Record the next point. Marks the match completed when it ends. */
  async addPoint(matchId: string, details: PointDetails): Promise<Point> {
    return this.db.transaction('rw', this.db.matches, this.db.points, async () => {
      const match = await this.requireMatch(matchId);
      if (match.status === 'completed') throw new ValidationError('比赛已经结束');
      if (match.status !== 'in_progress') throw new ValidationError('比赛已中止，需要先恢复比赛');
      const points = await this.getPoints(matchId);
      const before = checkMatch(match, points);
      if (!before.next) throw new ValidationError('比赛已经结束');
      const point: Point = {
        ...resolvePointDetails(details, before.next.server),
        id: newId(),
        matchId,
        seq: points.length,
        timestamp: Date.now(),
      };
      const after = checkMatch(match, [...points, point]);
      await this.db.points.add(point);
      await this.db.matches.update(matchId, { status: nextStatus(match.status, after), updatedAt: Date.now() });
      return point;
    });
  }

  /** Remove the most recent point. Returns it, or undefined if there were none. */
  async undoLastPoint(matchId: string): Promise<Point | undefined> {
    return this.db.transaction('rw', this.db.matches, this.db.points, async () => {
      const match = await this.requireMatch(matchId);
      if (match.status === 'retired' || match.status === 'abandoned') {
        throw new ValidationError('比赛已中止，需要先恢复比赛');
      }
      const points = await this.getPoints(matchId);
      const last = points.pop();
      if (!last) return undefined;
      await this.db.points.delete(last.id);
      const r = checkMatch(match, points);
      await this.db.matches.update(matchId, { status: nextStatus(match.status, r), updatedAt: Date.now() });
      return last;
    });
  }

  /** Replace what was recorded for a point anywhere in the match. */
  async updatePoint(pointId: string, details: PointDetails): Promise<Point> {
    return this.db.transaction('rw', this.db.matches, this.db.points, async () => {
      const existing = await this.db.points.get(pointId);
      if (!existing) throw new ValidationError('找不到这一分');
      const match = await this.requireMatch(existing.matchId);
      const points = await this.getPoints(match.id);
      const ctx = checkMatch(match, points).contexts[existing.seq];
      const updated: Point = {
        ...resolvePointDetails(details, ctx.server),
        id: existing.id,
        matchId: existing.matchId,
        seq: existing.seq,
        timestamp: existing.timestamp,
      };
      points[existing.seq] = updated;
      const r = checkMatch(match, points);
      await this.db.points.put(updated);
      await this.db.matches.update(match.id, { status: nextStatus(match.status, r), updatedAt: Date.now() });
      return updated;
    });
  }

  private async requireMatch(id: string): Promise<Match> {
    const m = await this.db.matches.get(id);
    if (!m) throw new ValidationError('找不到这场比赛');
    return m;
  }
}
