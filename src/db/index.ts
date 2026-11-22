import { TennisDB } from './db';
import { Repo } from './repo';

/** The app-wide database and repository. */
export const db = new TennisDB();
export const repo = new Repo(db);

export { ValidationError, type LoadedMatch } from './repo';
