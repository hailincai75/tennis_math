import Dexie, { type EntityTable } from 'dexie';
import type { Match, Opponent, Point } from '../domain/types';

export class TennisDB extends Dexie {
  opponents!: EntityTable<Opponent, 'id'>;
  matches!: EntityTable<Match, 'id'>;
  points!: EntityTable<Point, 'id'>;

  constructor(name = 'tennis-math') {
    super(name);
    // Only indexed fields are listed; other fields are stored as-is.
    // Never edit an existing version: add a new version() with an upgrade instead.
    this.version(1).stores({
      opponents: 'id, name',
      matches: 'id, date, opponentId, status',
      points: 'id, matchId, [matchId+seq]',
    });
  }
}
