/**
 * A Pomodoro timer stored as the moment the current phase ends, never as a running count,
 * so it stays right while the app is in the background or closed.
 */

export type Phase = 'focus' | 'short' | 'long';

export type PomodoroSettings = {
  /** Minutes. */
  focus: number;
  shortBreak: number;
  longBreak: number;
  /** Focus rounds before a long break. */
  rounds: number;
};

export const DEFAULT_POMODORO: PomodoroSettings = { focus: 25, shortBreak: 5, longBreak: 15, rounds: 4 };

export type TimerState = {
  phase: Phase;
  /** Which focus round this is, from 1 to `rounds`. */
  round: number;
  status: 'idle' | 'running' | 'paused';
  /** When the running phase ends. */
  endsAt: number | null;
  /** Time left in a paused phase, in milliseconds. */
  remaining: number | null;
  /** When the current phase was first started. */
  startedAt: number | null;
  /** Times the app was left during this focus phase. */
  interruptions: number;
  /** What is being studied, if anything was chosen. */
  itemId: string | null;
};

export const initialTimer = (): TimerState => ({
  phase: 'focus',
  round: 1,
  status: 'idle',
  endsAt: null,
  remaining: null,
  startedAt: null,
  interruptions: 0,
  itemId: null,
});

export function phaseLength(phase: Phase, settings: PomodoroSettings): number {
  const minutes = phase === 'focus' ? settings.focus : phase === 'short' ? settings.shortBreak : settings.longBreak;
  return minutes * 60_000;
}

/** Milliseconds left in the current phase. */
export function timeLeft(state: TimerState, settings: PomodoroSettings, now: number): number {
  if (state.status === 'running' && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  if (state.status === 'paused' && state.remaining !== null) return state.remaining;
  return phaseLength(state.phase, settings);
}

export function start(state: TimerState, settings: PomodoroSettings, now: number): TimerState {
  if (state.status === 'running') return state;
  const left = state.status === 'paused' && state.remaining !== null ? state.remaining : phaseLength(state.phase, settings);
  return { ...state, status: 'running', endsAt: now + left, remaining: null, startedAt: state.startedAt ?? now };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running' || state.endsAt === null) return state;
  return { ...state, status: 'paused', remaining: Math.max(0, state.endsAt - now), endsAt: null };
}

/** Counts leaving the app during a running focus phase. */
export function interrupt(state: TimerState): TimerState {
  return state.status === 'running' && state.phase === 'focus' ? { ...state, interruptions: state.interruptions + 1 } : state;
}

export function next(phase: Phase, round: number, settings: PomodoroSettings): { phase: Phase; round: number } {
  if (phase === 'focus') return { phase: round >= settings.rounds ? 'long' : 'short', round };
  return { phase: 'focus', round: phase === 'long' ? 1 : round + 1 };
}

/** A focus phase that ran its full length, to be logged. */
export type CompletedFocus = { startedAt: number; endedAt: number; minutes: number; interruptions: number; itemId: string | null };

/**
 * Moves on when the running phase is over. The next phase waits for the user to start it.
 * Returns the finished focus phase so it can be logged.
 */
export function settle(state: TimerState, settings: PomodoroSettings, now: number): { state: TimerState; completed: CompletedFocus | null; ended: Phase | null } {
  if (state.status !== 'running' || state.endsAt === null || now < state.endsAt) return { state, completed: null, ended: null };
  const completed =
    state.phase === 'focus'
      ? { startedAt: state.startedAt ?? state.endsAt - phaseLength('focus', settings), endedAt: state.endsAt, minutes: settings.focus, interruptions: state.interruptions, itemId: state.itemId }
      : null;
  const upcoming = next(state.phase, state.round, settings);
  return {
    state: { ...initialTimer(), ...upcoming, itemId: state.itemId },
    completed,
    ended: state.phase,
  };
}

/** Ends the current phase early and moves to the next one. A skipped focus phase is not logged. */
export function skip(state: TimerState, settings: PomodoroSettings): TimerState {
  return { ...initialTimer(), ...next(state.phase, state.round, settings), itemId: state.itemId };
}

export function reset(state: TimerState): TimerState {
  return { ...initialTimer(), itemId: state.itemId };
}
