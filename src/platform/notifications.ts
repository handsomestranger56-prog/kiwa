import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local notifications only: nothing is sent from a server. On the web, which is only used for
 * development, scheduling is recorded in memory so the browser checks can see what would ring.
 */

export type Scheduled = { id: string; at: number; title: string; body: string };

type WebRecord = { scheduled: Scheduled[]; shown: { title: string; body: string }[] };

function webRecord(): WebRecord {
  const holder = globalThis as unknown as { __notifications?: WebRecord };
  holder.__notifications ??= { scheduled: [], shown: [] };
  return holder.__notifications;
}

const CHANNEL = 'study';
let prepared = false;

/** Shows notifications while the app is open too, and creates the Android channel. Safe to call often. */
export async function prepareNotifications(): Promise<void> {
  if (prepared || Platform.OS === 'web') return;
  prepared = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    // Exported through a wildcard re-export that the import lint rule cannot follow.
    // eslint-disable-next-line import/namespace
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Study', importance: Notifications.AndroidImportance.DEFAULT });
  }
}

/** Asks once. Android 13 and later, and iOS, show nothing without this. */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function hasPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Identifiers of notifications still waiting to be shown. */
export async function pendingIds(): Promise<Set<string>> {
  if (Platform.OS === 'web') {
    const now = Date.now();
    return new Set(webRecord().scheduled.filter((entry) => entry.at > now).map((entry) => entry.id));
  }
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return new Set(requests.map((request) => request.identifier));
}

export async function schedule(entry: Scheduled): Promise<void> {
  if (Platform.OS === 'web') {
    const record = webRecord();
    record.scheduled = [...record.scheduled.filter((existing) => existing.id !== entry.id), entry];
    return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: entry.id,
    content: { title: entry.title, body: entry.body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: entry.at, channelId: CHANNEL },
  });
}

export async function cancel(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const record = webRecord();
    record.scheduled = record.scheduled.filter((entry) => entry.id !== id);
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(id);
}

/** Shows a notification straight away, for example when generation finishes in the background. */
export async function showNow(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') {
    webRecord().shown.push({ title, body });
    return;
  }
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
}
