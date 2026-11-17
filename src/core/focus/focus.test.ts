import { dayKey, previousDay, streak } from './days';
import { DEFAULT_REMINDERS, type PlannerInput, localTime, plan, reconcile } from './planner';
import { type TimerState, DEFAULT_POMODORO, initialTimer, interrupt, next, pause, reset, settle, skip, start, timeLeft } from './pomodoro';

const MIN = 60_000;
const settings = DEFAULT_POMODORO;

describe('Pomodoro', () => {
  it('runs on the end time, so time away from the app still counts', () => {
    const running = start(initialTimer(), settings, 1000);
    expect(running).toMatchObject({ status: 'running', endsAt: 1000 + 25 * MIN, startedAt: 1000 });
    expect(timeLeft(running, settings, 1000 + 10 * MIN)).toBe(15 * MIN);
    expect(timeLeft(running, settings, 1000 + 99 * MIN)).toBe(0);
    expect(timeLeft(initialTimer(), settings, 0)).toBe(25 * MIN);
  });

  it('pauses and resumes with the same time left', () => {
    const paused = pause(start(initialTimer(), settings, 0), 10 * MIN);
    expect(paused).toMatchObject({ status: 'paused', remaining: 15 * MIN, endsAt: null });
    expect(timeLeft(paused, settings, 999 * MIN)).toBe(15 * MIN);
    const resumed = start(paused, settings, 100 * MIN);
    expect(resumed).toMatchObject({ endsAt: 115 * MIN, startedAt: 0 });
  });

  it('logs a finished focus phase and waits at the break', () => {
    let state: TimerState = { ...start(initialTimer(), settings, 0), itemId: 'course-1' };
    state = interrupt(interrupt(state));
    expect(settle(state, settings, 24 * MIN).completed).toBeNull();

    const done = settle(state, settings, 30 * MIN);
    expect(done.completed).toEqual({ startedAt: 0, endedAt: 25 * MIN, minutes: 25, interruptions: 2, itemId: 'course-1' });
    expect(done.ended).toBe('focus');
    expect(done.state).toMatchObject({ phase: 'short', round: 1, status: 'idle', interruptions: 0, itemId: 'course-1' });

    const breakDone = settle(start(done.state, settings, 40 * MIN), settings, 45 * MIN);
    expect(breakDone.completed).toBeNull();
    expect(breakDone.state).toMatchObject({ phase: 'focus', round: 2 });
  });

  it('takes a long break after the last round, then starts over', () => {
    expect(next('focus', 3, settings)).toEqual({ phase: 'short', round: 3 });
    expect(next('focus', 4, settings)).toEqual({ phase: 'long', round: 4 });
    expect(next('long', 4, settings)).toEqual({ phase: 'focus', round: 1 });
  });

  it('only counts interruptions while focusing', () => {
    expect(interrupt(initialTimer()).interruptions).toBe(0);
    const onBreak = start({ ...initialTimer(), phase: 'short' }, settings, 0);
    expect(interrupt(onBreak).interruptions).toBe(0);
  });

  it('skips without logging and resets to the first round', () => {
    const skipped = skip(start(initialTimer(), settings, 0), settings);
    expect(skipped).toMatchObject({ phase: 'short', status: 'idle' });
    expect(reset({ ...skipped, round: 3, itemId: 'x' })).toEqual({ ...initialTimer(), itemId: 'x' });
  });
});

describe('days and streaks', () => {
  // 2026-03-10 23:30 in UTC+2 is still the 10th there, but the 10th 21:30 in UTC.
  const lateEvening = Date.UTC(2026, 2, 10, 21, 30);
  it('uses the local day', () => {
    expect(dayKey(lateEvening, -120)).toBe('2026-03-10');
    expect(dayKey(lateEvening, -180)).toBe('2026-03-11');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });

  it('counts consecutive days and keeps a streak alive until today ends', () => {
    const days = new Set(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(streak(days, '2026-03-10')).toEqual({ length: 3, studiedToday: true });
    expect(streak(days, '2026-03-11')).toEqual({ length: 3, studiedToday: false });
    expect(streak(days, '2026-03-12')).toEqual({ length: 0, studiedToday: false });
    expect(streak(new Set(), '2026-03-12')).toEqual({ length: 0, studiedToday: false });
  });
});

describe('notification planner', () => {
  // 10:00 local time on 2026-03-10 in UTC-5.
  const offset = 300;
  const now = Date.UTC(2026, 2, 10, 15, 0);
  const base: PlannerInput = { now, offsetMinutes: offset, settings: { ...DEFAULT_REMINDERS, daily: true }, studiedToday: false, streakLength: 0, timer: null, reviewsDueAt: null };

  it('finds a local time on a given day', () => {
    expect(localTime(now, offset, 0, 19, 0)).toBe(Date.UTC(2026, 2, 11, 0, 0));
    expect(localTime(now, offset, 1, 7, 30)).toBe(Date.UTC(2026, 2, 11, 12, 30));
  });

  it('schedules a week of daily reminders and drops today once studied', () => {
    const daily = plan(base).filter((entry) => entry.kind === 'daily');
    expect(daily).toHaveLength(7);
    expect(daily[0]).toMatchObject({ id: 'daily-today', at: Date.UTC(2026, 2, 11, 0, 0) });
    expect(daily[1].id).toBe('daily-2026-03-11');

    const studied = plan({ ...base, studiedToday: true }).filter((entry) => entry.kind === 'daily');
    expect(studied).toHaveLength(6);
    expect(studied.some((entry) => entry.id === 'daily-today')).toBe(false);
  });

  it('skips today when the reminder time has already passed', () => {
    const evening = Date.UTC(2026, 2, 11, 2, 0); // 21:00 local on the 10th
    const daily = plan({ ...base, now: evening }).filter((entry) => entry.kind === 'daily');
    expect(daily).toHaveLength(6);
    expect(daily[0].id).toBe('daily-2026-03-11');
  });

  it('warns about a streak only when one would break today', () => {
    const settingsWithStreak = { ...base.settings, daily: false, streak: true };
    expect(plan({ ...base, settings: settingsWithStreak, streakLength: 4 })).toEqual([{ id: 'streak', at: Date.UTC(2026, 2, 11, 1, 0), kind: 'streak' }]);
    expect(plan({ ...base, settings: settingsWithStreak, streakLength: 4, studiedToday: true })).toEqual([]);
    expect(plan({ ...base, settings: settingsWithStreak, streakLength: 0 })).toEqual([]);
  });

  it('rings when the timer ends, if wanted', () => {
    const timer = { endsAt: now + 25 * MIN, phase: 'focus' as const };
    expect(plan({ ...base, settings: { ...base.settings, daily: false }, timer })).toEqual([{ id: 'timer', at: now + 25 * MIN, kind: 'timer' }]);
    expect(plan({ ...base, settings: { ...base.settings, daily: false, timer: false }, timer })).toEqual([]);
  });

  it('tells about reviews when they fall due, or soon if overdue', () => {
    const reviews = { ...base.settings, daily: false, reviews: true };
    expect(plan({ ...base, settings: reviews, reviewsDueAt: now + 3 * 60 * MIN })[0].at).toBe(now + 3 * 60 * MIN);
    expect(plan({ ...base, settings: reviews, reviewsDueAt: now - MIN })[0].at).toBe(Date.UTC(2026, 2, 11, 0, 0));
    const late = Date.UTC(2026, 2, 11, 2, 0);
    expect(plan({ ...base, now: late, settings: reviews, reviewsDueAt: late - MIN })[0].at).toBe(late + 60 * MIN);
  });

  it('changes only what differs from what is scheduled', () => {
    const planned = [
      { id: 'a', at: 1, kind: 'daily' as const },
      { id: 'b', at: 2, kind: 'daily' as const },
      { id: 'c', at: 3, kind: 'timer' as const },
    ];
    expect(reconcile(planned, [{ id: 'a', at: 1 }, { id: 'b', at: 9 }, { id: 'old', at: 5 }])).toEqual({
      cancel: ['b', 'old'],
      schedule: [planned[1], planned[2]],
    });
    expect(reconcile(planned, planned)).toEqual({ cancel: [], schedule: [] });
  });
});
