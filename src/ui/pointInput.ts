// State machine for entering one point in standard mode.
//
//   first ──in──────────────► rally ──(ending, endedBy)──► commit
//     │ ace / service winner ─────────────────────────────► commit
//     └─fault──► second ──in──► rally
//                  │ double fault / ace / service winner ──► commit

import type { PointDetails, PointEnding, Side } from '../domain/types';

export type InputState =
  | { step: 'first' }
  | { step: 'second' }
  | { step: 'rally'; firstServeIn: boolean };

export type ServeResult = 'in' | 'fault' | 'double_fault' | 'ace' | 'service_winner';
export type RallyEnding = Extract<PointEnding, 'winner' | 'unforced_error' | 'forced_error'>;

export type InputAction =
  | { type: 'serve'; result: ServeResult }
  | { type: 'end'; ending: RallyEnding; endedBy: Side };

export type InputOutcome = { state: InputState } | { commit: PointDetails };

export const START: InputState = { step: 'first' };

export function stepInput(state: InputState, action: InputAction, server: Side): InputOutcome {
  if (action.type === 'end') {
    if (state.step !== 'rally') throw new Error('Rally ending pressed before the serve was recorded');
    return { commit: { firstServeIn: state.firstServeIn, ending: action.ending, endedBy: action.endedBy } };
  }
  if (state.step === 'rally') throw new Error('Serve pressed during the rally step');
  const onFirst = state.step === 'first';
  switch (action.result) {
    case 'in':
      return { state: { step: 'rally', firstServeIn: onFirst } };
    case 'fault':
      if (!onFirst) throw new Error('Use double_fault for a second-serve fault');
      return { state: { step: 'second' } };
    case 'double_fault':
      if (onFirst) throw new Error('Double fault is only possible on the second serve');
      return { commit: { firstServeIn: false, ending: 'double_fault', endedBy: server } };
    case 'ace':
    case 'service_winner':
      return { commit: { firstServeIn: onFirst, ending: action.result, endedBy: server } };
  }
}

/** Step back inside the current point. Returns null at the start (nothing to step back). */
export function backInput(state: InputState): InputState | null {
  switch (state.step) {
    case 'first':
      return null;
    case 'second':
      return START;
    case 'rally':
      return state.firstServeIn ? START : { step: 'second' };
  }
}
