import { describe, expect, it } from 'vitest';
import { replay } from '../domain/scoring';
import { computeMatchStats } from '../domain/stats';
import { FORMAT_PRESETS, pointWinner, type Match, type Point, type PointDetails } from '../domain/types';
import { buildShareModel, formatDateEn, shareFileName } from './shareImage';

const match: Match = {
  id: 'm1',
  date: '2026-11-22',
  opponentId: 'o1',
  event: 'Winter Open',
  round: 'QF',
  surface: 'hard',
  format: FORMAT_PRESETS.oneSet.format,
  firstServer: 'elsa',
  status: 'completed',
  recordingMode: 'standard',
  createdAt: 0,
  updatedAt: 0,
};
const names = { elsa: 'Elsa', opp: 'Mia' };

function build(details: PointDetails[], m: Match = match) {
  const points: Point[] = details.map((d, i) => ({
    ...d,
    id: `p${i}`,
    matchId: m.id,
    seq: i,
    winner: d.ending && d.endedBy ? pointWinner(d.ending, d.endedBy) : d.winner!,
    timestamp: i,
  }));
  const r = replay(m.format, m.firstServer, points.map((p) => p.winner));
  return buildShareModel(m, r, computeMatchStats(points, r), names);
}

const ace: PointDetails = { firstServeIn: true, ending: 'ace', endedBy: 'elsa' };
const oppAce: PointDetails = { firstServeIn: true, ending: 'ace', endedBy: 'opp' };

describe('buildShareModel', () => {
  // Elsa wins 6-0: Elsa holds with aces, breaks with opponent double faults.
  const df: PointDetails = { ending: 'double_fault', endedBy: 'opp' };
  const sixLove = Array.from({ length: 3 }, () => [ace, ace, ace, ace, df, df, df, df]).flat();
  const model = build(sixLove);

  it('header is in English', () => {
    expect(model.title).toBe('Elsa vs Mia');
    expect(model.subtitle).toBe('Nov 22, 2026 · Winter Open · QF · Hard');
    expect(model.result).toBe('Elsa won');
    expect(model.score).toBe('6-0');
  });

  it('uses English section and row labels only', () => {
    const titles = model.sections.map((s) => s.title);
    expect(titles).toContain('Serve');
    expect(titles).toContain('Return');
    const all = model.sections.flatMap((s) => [s.title, ...s.rows.map((r) => r.label)]).join(' ');
    expect(all).not.toMatch(/[一-鿿]/); // no Chinese characters
    const serve = model.sections.find((s) => s.title === 'Serve')!;
    expect(serve.rows.find((r) => r.label === 'Aces')).toMatchObject({ elsa: '12', opp: '0', better: 'elsa' });
    expect(serve.rows.find((r) => r.label === 'Double faults')).toMatchObject({ elsa: '0', opp: '12', better: 'elsa' });
  });

  it('footer counts points and flags quick-mode points', () => {
    expect(model.footer).toBe('24 points charted · Tennis Math');
    const mixed = build([ace, { winner: 'elsa' }]);
    expect(mixed.footer).toBe('2 points charted (1 without serve/shot detail) · Tennis Math');
    expect(mixed.result).toBe('In progress'); // no winner in the score yet
  });

  it('describes losses, retirements and abandoned matches', () => {
    const lost = build(Array(24).fill(oppAce).map((p, i) => (i % 8 < 4 ? { ...ace, ending: 'double_fault' as const } : p)));
    expect(lost.result).toBe('Elsa lost');
    expect(lost.score).toBe('0-6');
    expect(build([ace], { ...match, status: 'retired', retiredSide: 'opp' }).result).toBe('Mia retired');
    expect(build([ace], { ...match, status: 'abandoned' }).result).toBe('Match abandoned');
    expect(build([ace], { ...match, status: 'in_progress' }).result).toBe('In progress');
  });
});

describe('helpers', () => {
  it('formats dates in English', () => {
    expect(formatDateEn('2026-01-05')).toBe('Jan 5, 2026');
    expect(formatDateEn('bad')).toBe('bad');
  });
  it('builds a safe file name', () => {
    expect(shareFileName(match, { elsa: 'Elsa', opp: 'Mia Lee' })).toBe('Elsa-vs-Mia-Lee-2026-11-22.png');
  });
});
