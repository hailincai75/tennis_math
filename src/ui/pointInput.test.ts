import { describe, expect, it } from 'vitest';
import { backInput, START, stepInput, type InputAction, type InputState } from './pointInput';

function run(actions: InputAction[], server: 'elsa' | 'opp' = 'elsa') {
  let s: InputState = START;
  for (const a of actions) {
    const out = stepInput(s, a, server);
    if ('commit' in out) return out.commit;
    s = out.state;
  }
  return s;
}

describe('point input', () => {
  it('first serve in, then a rally ending: 2 taps', () => {
    expect(run([{ type: 'serve', result: 'in' }, { type: 'end', ending: 'winner', endedBy: 'opp' }])).toEqual({
      firstServeIn: true,
      ending: 'winner',
      endedBy: 'opp',
    });
  });

  it('first serve fault, second in, rally ending: 3 taps', () => {
    expect(
      run([
        { type: 'serve', result: 'fault' },
        { type: 'serve', result: 'in' },
        { type: 'end', ending: 'unforced_error', endedBy: 'elsa' },
      ]),
    ).toEqual({ firstServeIn: false, ending: 'unforced_error', endedBy: 'elsa' });
  });

  it('ace on first or second serve is credited to the server', () => {
    expect(run([{ type: 'serve', result: 'ace' }], 'opp')).toEqual({ firstServeIn: true, ending: 'ace', endedBy: 'opp' });
    expect(run([{ type: 'serve', result: 'fault' }, { type: 'serve', result: 'service_winner' }])).toEqual({
      firstServeIn: false,
      ending: 'service_winner',
      endedBy: 'elsa',
    });
  });

  it('double fault', () => {
    expect(run([{ type: 'serve', result: 'fault' }, { type: 'serve', result: 'double_fault' }], 'opp')).toEqual({
      firstServeIn: false,
      ending: 'double_fault',
      endedBy: 'opp',
    });
  });

  it('rejects impossible sequences', () => {
    expect(() => stepInput(START, { type: 'end', ending: 'winner', endedBy: 'elsa' }, 'elsa')).toThrow();
    expect(() => stepInput(START, { type: 'serve', result: 'double_fault' }, 'elsa')).toThrow();
    expect(() => stepInput({ step: 'second' }, { type: 'serve', result: 'fault' }, 'elsa')).toThrow();
  });

  it('back steps out of the current point', () => {
    expect(backInput(START)).toBeNull();
    expect(backInput({ step: 'second' })).toEqual(START);
    expect(backInput({ step: 'rally', firstServeIn: true })).toEqual(START);
    expect(backInput({ step: 'rally', firstServeIn: false })).toEqual({ step: 'second' });
  });
});
