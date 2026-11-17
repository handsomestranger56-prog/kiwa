import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ReminderSettings } from '@/core/focus/planner';
import { useData, useQuery } from '@/data/provider';
import { ensurePermission } from '@/platform/notifications';
import { Chip, Stepper } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, spacing } from '@/ui/theme';

import { readReminders } from './notifications-sync';

type Toggle = 'daily' | 'streak' | 'reviews' | 'timer';
const TOGGLES: Toggle[] = ['daily', 'streak', 'reviews', 'timer'];

/** Settings: which reminders the app may show, and when the daily one comes. */
export function RemindersSection() {
  const { t } = useTranslation();
  const data = useData();
  const loaded = useQuery('settings:reminders', (current) => readReminders(current));
  const [denied, setDenied] = useState(false);
  const settings = loaded.data;
  if (!settings) return null;

  const save = (next: ReminderSettings) => {
    data.settings.set('notify.settings', JSON.stringify(next)).catch(() => {});
  };

  const toggle = async (key: Toggle) => {
    const on = !settings[key];
    if (on) {
      const granted = await ensurePermission().catch(() => false);
      setDenied(!granted);
      if (!granted) return;
    }
    save({ ...settings, [key]: on });
  };

  return (
    <View style={styles.section}>
      <AppText variant="label" color="textSecondary">
        {t('reminders.title')}
      </AppText>
      {TOGGLES.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="switch"
          aria-checked={settings[key]}
          accessibilityLabel={t(`reminders.${key}.label`)}
          onPress={() => void toggle(key)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
          <Icon name={settings[key] ? 'checkboxOn' : 'checkboxOff'} color={settings[key] ? 'accent' : 'textSecondary'} />
          <View style={styles.text}>
            <AppText>{t(`reminders.${key}.label`)}</AppText>
            <AppText variant="small" color="textSecondary">
              {t(`reminders.${key}.hint`)}
            </AppText>
          </View>
        </Pressable>
      ))}
      {settings.daily ? (
        <View style={styles.time}>
          <Stepper label={t('reminders.hour')} value={settings.hour} min={0} max={23} onChange={(hour) => save({ ...settings, hour })} />
          <View style={styles.chips}>
            {[0, 15, 30, 45].map((minute) => (
              <Chip key={minute} label={`:${String(minute).padStart(2, '0')}`} selected={settings.minute === minute} onPress={() => save({ ...settings, minute })} />
            ))}
          </View>
          <AppText variant="small" color="textSecondary">
            {t('reminders.at', { time: `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}` })}
          </AppText>
        </View>
      ) : null}
      {denied ? <AppText color="danger">{t('reminders.denied')}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  toggle: { minHeight: MIN_TOUCH + 8, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  time: { gap: spacing.sm, paddingLeft: spacing.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
