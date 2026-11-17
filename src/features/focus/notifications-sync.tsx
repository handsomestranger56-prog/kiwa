import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

import { streak, dayKey } from '@/core/focus/days';
import { type Planned, type ReminderSettings, DEFAULT_REMINDERS, plan, reconcile } from '@/core/focus/planner';
import { type AppData, useData } from '@/data/provider';
import i18n from '@/i18n';
import { cancel, hasPermission, pendingIds, prepareNotifications, schedule } from '@/platform/notifications';

import { useFocus } from './focus-provider';

export async function readReminders(data: AppData): Promise<ReminderSettings> {
  const text = await data.settings.get('notify.settings');
  if (!text) return DEFAULT_REMINDERS;
  try {
    return { ...DEFAULT_REMINDERS, ...(JSON.parse(text) as Partial<ReminderSettings>) };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

/** The text of each kind of reminder. */
function content(entry: Planned, streakLength: number): { title: string; body: string } {
  switch (entry.kind) {
    case 'daily':
      return { title: i18n.t('notify.daily.title'), body: i18n.t('notify.daily.body') };
    case 'streak':
      return { title: i18n.t('notify.streak.title', { count: streakLength }), body: i18n.t('notify.streak.body') };
    case 'timer':
      return { title: i18n.t('notify.timer.title'), body: i18n.t('notify.timer.body') };
    case 'reviews':
      return { title: i18n.t('notify.reviews.title'), body: i18n.t('notify.reviews.body') };
  }
}

/** Brings the device's pending notifications in line with the plan. */
export async function syncNotifications(data: AppData, timer: { endsAt: number; phase: 'focus' | 'short' | 'long' } | null): Promise<void> {
  const reviewsDueAt = await data.reviews.nextDueAt();
  await prepareNotifications();
  const settings = await readReminders(data);
  const anyOn = settings.daily || settings.streak || settings.reviews || settings.timer;
  if (anyOn && !(await hasPermission())) return;

  const now = Date.now();
  const offset = new Date(now).getTimezoneOffset();
  const days = await data.focus.studyDays(offset);
  const current = streak(days, dayKey(now, offset));
  const planned = plan({ now, offsetMinutes: offset, settings, studiedToday: current.studiedToday, streakLength: current.length, timer, reviewsDueAt });

  // What this app scheduled, limited to what is still pending on the device.
  let recorded: { id: string; at: number }[] = [];
  try {
    recorded = JSON.parse((await data.settings.get('notify.scheduled')) ?? '[]') as { id: string; at: number }[];
  } catch {
    recorded = [];
  }
  const pending = await pendingIds();
  const scheduled = recorded.filter((entry) => pending.has(entry.id));

  const changes = reconcile(planned, scheduled);
  for (const id of changes.cancel) await cancel(id).catch(() => {});
  for (const entry of changes.schedule) {
    await schedule({ id: entry.id, at: entry.at, ...content(entry, current.length) }).catch(() => {});
  }
  await data.settings.setQuietly('notify.scheduled', JSON.stringify(planned.map(({ id, at }) => ({ id, at }))));
}

/** Re-plans notifications when the app opens, comes back to the front, or anything is saved. */
export function NotificationsSync() {
  const data = useData();
  const { timer } = useFocus();
  const timerKey = timer.status === 'running' && timer.endsAt ? `${timer.phase}:${timer.endsAt}` : 'none';

  const run = useEffectEvent(() => {
    const running = timer.status === 'running' && timer.endsAt ? { endsAt: timer.endsAt, phase: timer.phase } : null;
    syncNotifications(data, running).catch(() => {});
  });

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    // Writes come in bursts. One sync shortly after the last write is enough.
    const soon = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => run(), 400);
    };
    soon();
    const unsubscribe = data.changes.subscribe(soon);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') soon();
    });
    return () => {
      if (pending) clearTimeout(pending);
      unsubscribe();
      subscription.remove();
    };
  }, [data, timerKey]);

  return null;
}
