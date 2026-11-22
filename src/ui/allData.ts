import { db } from '../db';
import { matchResult, type MatchRecord } from '../domain/analysis';
import { formatSetScores, replay } from '../domain/scoring';
import { computeMatchStats } from '../domain/stats';
import type { Opponent, Point } from '../domain/types';

export interface AllData {
  records: MatchRecord[];
  opponents: Opponent[];
  /** Matches whose stored points could not be replayed (should not happen). */
  broken: string[];
}

/** Every match with its stats, for the analysis and opponent pages. */
export async function loadAllData(): Promise<AllData> {
  const [matches, opponents, points] = await Promise.all([
    db.matches.toArray(),
    db.opponents.orderBy('name').toArray(),
    db.points.toArray(),
  ]);
  const byMatch = new Map<string, Point[]>();
  for (const p of points) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);
  const oppById = new Map(opponents.map((o) => [o.id, o]));
  const records: MatchRecord[] = [];
  const broken: string[] = [];
  for (const match of matches) {
    const ps = (byMatch.get(match.id) ?? []).sort((a, b) => a.seq - b.seq);
    try {
      const r = replay(match.format, match.firstServer, ps.map((p) => p.winner));
      records.push({
        match,
        opponent: oppById.get(match.opponentId),
        stats: computeMatchStats(ps, r),
        result: matchResult(match, r.final.winner),
        score: formatSetScores(r.final.completedSets, r.final) || '0-0',
      });
    } catch {
      broken.push(match.id);
    }
  }
  return { records, opponents, broken };
}
