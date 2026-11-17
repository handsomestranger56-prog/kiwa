/**
 * Works out which local notifications should be waiting, so one place decides and the device
 * is brought in line with it. iOS keeps at most 64 pending local notifications per app.
 */

export type ReminderSettings = {
  daily: boolean;
  /** Local time of the daily reminder. */
  hour: number;
  minute: number;
  /** Warn in the evening when a streak would break today. */
  streak: boolean;
  /** Say when review questions are due. */
  reviews: boolean;
  /** Ring when a Pomodoro phase ends. */
  timer: boolean;
};

export const DEFAULT_REMINDERS: ReminderSettings = { daily: false, hour: 19, minute: 0, streak: false, reviews: false, timer: true };

export type PlannerInput = {
  now: number;
  /** Minutes, as from `Date#getTimezoneOffset`. */
  offsetMinutes: number;
  settings: ReminderSettings;
  studiedToday: boolean;
  streakLength: number;
  /** When the running Pomodoro phase ends, if one is running. */
  timer: { endsAt: number; phase: 'focus' | 'short' | 'long' } | null;
  /** When the next review falls due, if any are scheduled. */
  reviewsDueAt: number | null;
};

export type Planned = { id: string; at: number; kind: 'daily' | 'streak' | 'timer' | 'reviews'; dayOffset?: number };

/** Days ahead the daily reminder is scheduled. Reconciling on each app start keeps it topped up. */
export const DAILY_HORIZON = 7;

/** The hour the streak warning goes out. */
export const STREAK_HOUR = 20;

/** The timestamp of a local time on the day `dayOffset` days from `now`. */
export function localTime(now: number, offsetMinutes: number, dayOffset: number, hour: number, minute: number): number {
  const local = new Date(now - offsetMinutes * 60_000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset);
  return midnight + (hour * 60 + minute) * 60_000 + offsetMinutes * 60_000;
}

export function plan(input: PlannerInput): Planned[] {
  const { now, offsetMinutes, settings } = input;
  const planned: Planned[] = [];

  if (settings.daily) {
    for (let day = 0; day < DAILY_HORIZON; day += 1) {
      // Today's reminder is dropped once there has been study today.
      if (day === 0 && input.studiedToday) continue;
      const at = localTime(now, offsetMinutes, day, settings.hour, settings.minute);
      if (at > now) planned.push({ id: `daily-${day === 0 ? 'today' : localDayId(at, offsetMinutes)}`, at, kind: 'daily', dayOffset: day });
    }
  }

  if (settings.streak && input.streakLength > 0 && !input.studiedToday) {
    const at = localTime(now, offsetMinutes, 0, STREAK_HOUR, 0);
    if (at > now) planned.push({ id: 'streak', at, kind: 'streak' });
  }

  if (settings.timer && input.timer && input.timer.endsAt > now) {
    planned.push({ id: 'timer', at: input.timer.endsAt, kind: 'timer' });
  }

  if (settings.reviews && input.reviewsDueAt !== null) {
    // Due now or overdue: remind at the daily time, or in an hour if that has passed.
    const reminderToday = localTime(now, offsetMinutes, 0, settings.hour, settings.minute);
    const at = input.reviewsDueAt > now ? input.reviewsDueAt : reminderToday > now ? reminderToday : now + 60 * 60_000;
    planned.push({ id: 'reviews', at, kind: 'reviews' });
  }

  return planned.sort((a, b) => a.at - b.at).slice(0, 60);
}

function localDayId(at: number, offsetMinutes: number): string {
  return new Date(at - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** What to cancel and what to schedule so the device matches the plan. */
export function reconcile(planned: Planned[], scheduled: { id: string; at: number }[]): { cancel: string[]; schedule: Planned[] } {
  const wanted = new Map(planned.map((entry) => [entry.id, entry]));
  const have = new Map(scheduled.map((entry) => [entry.id, entry]));
  const cancel = scheduled.filter((entry) => wanted.get(entry.id)?.at !== entry.at).map((entry) => entry.id);
  const schedule = planned.filter((entry) => have.get(entry.id)?.at !== entry.at);
  return { cancel, schedule };
}
