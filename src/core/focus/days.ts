/** A local calendar day as `YYYY-MM-DD`. `offsetMinutes` is the time zone, as returned by `Date#getTimezoneOffset`. */
export function dayKey(timestamp: number, offsetMinutes: number): string {
  return new Date(timestamp - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** The local day before `key`. */
export function previousDay(key: string): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive days studied, ending today. A streak still counts while today has no study yet,
 * as long as yesterday had some: it only breaks at the end of today.
 */
export function streak(days: ReadonlySet<string>, today: string): { length: number; studiedToday: boolean } {
  const studiedToday = days.has(today);
  let cursor = studiedToday ? today : previousDay(today);
  let length = 0;
  while (days.has(cursor)) {
    length += 1;
    cursor = previousDay(cursor);
  }
  return { length, studiedToday };
}
