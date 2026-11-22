import { formatSetScores, replay } from '../domain/scoring';
import type { Match, Opponent, Side } from '../domain/types';
import { repo } from '../db';

export interface MatchSummary {
  match: Match;
  opponent?: Opponent;
  /** "6-4 3-6 [10-8]", or the score so far. */
  score: string;
  winner: Side | null;
  pointCount: number;
  error?: string;
}

/** All matches with opponent and score, newest first. */
export async function loadMatchSummaries(): Promise<MatchSummary[]> {
  const [matches, opponents] = await Promise.all([repo.listMatches(), repo.listOpponents()]);
  const byId = new Map(opponents.map((o) => [o.id, o]));
  return Promise.all(
    matches.map(async (match) => {
      const points = await repo.getPoints(match.id);
      const base = { match, opponent: byId.get(match.opponentId), pointCount: points.length };
      try {
        const r = replay(match.format, match.firstServer, points.map((p) => p.winner));
        return { ...base, score: formatSetScores(r.final.completedSets, r.final), winner: r.final.winner };
      } catch (e) {
        return { ...base, score: '?', winner: null, error: String(e) };
      }
    }),
  );
}
