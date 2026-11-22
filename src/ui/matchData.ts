import { repo, type LoadedMatch } from '../db';
import type { Opponent, Point, PointDetails } from '../domain/types';

export type Loaded =
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: LoadedMatch; opponent?: Opponent };

/** Load a match with its points, replay and opponent, for useLiveQuery. */
export async function loadMatchView(id: string): Promise<Loaded> {
  const match = await repo.getMatch(id);
  if (!match) return { kind: 'missing' };
  try {
    const [data, opponent] = await Promise.all([repo.loadMatch(id), repo.getOpponent(match.opponentId)]);
    return { kind: 'ok', data, opponent };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** The details originally entered for a point, so it can be re-saved with changes. */
export function detailsOf(p: Point): PointDetails {
  const { winner, firstServeIn, ending, endedBy, rallyLength, stroke, note } = p;
  return ending
    ? { firstServeIn, ending, endedBy, rallyLength, stroke, note }
    : { winner, firstServeIn, rallyLength, stroke, note };
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
