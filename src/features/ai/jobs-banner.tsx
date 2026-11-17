import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useQuery } from '@/data/provider';
import { Icon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

/** Generation runs that are going or need attention, shown at the top of the library. */
export function JobsBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const open = useQuery('jobs:open', ({ jobs }) => jobs.open());
  const jobs = open.data ?? [];
  if (jobs.length === 0) return null;

  return (
    <View style={styles.list}>
      {jobs.map((job) => (
        <Pressable
          key={job.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: job.status === 'failed' ? colors.dangerSoft : colors.accentSoft },
            pressed && styles.pressed,
          ]}>
          {job.status === 'running' ? <ActivityIndicator color={colors.accent} /> : <Icon name="ai" color={job.status === 'failed' ? 'danger' : 'accent'} />}
          <View style={styles.text}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {job.request.topic.split('\n')[0]}
            </AppText>
            <AppText variant="small" color="textSecondary">
              {t(`job.banner.${job.status as 'running' | 'outline' | 'ready' | 'failed'}`)}
            </AppText>
          </View>
          <Icon name="chevron" size={18} color="textSecondary" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { minHeight: MIN_TOUCH + 8, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  pressed: { opacity: 0.6 },
});
