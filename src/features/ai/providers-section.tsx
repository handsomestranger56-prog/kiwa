import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useData, useQuery } from '@/data/provider';
import { Button, Chip } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

/** Settings: the providers the user added, and the model preselected when generating. */
export function ProvidersSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { providers } = useData();

  const loaded = useQuery('settings:providers', async ({ providers: repository }) => ({
    list: await repository.list(),
    choices: await repository.choices(),
    current: await repository.defaultChoice(),
  }));
  const data = loaded.data;

  return (
    <View style={styles.section}>
      <AppText variant="label" color="textSecondary">
        {t('providers.title')}
      </AppText>

      {data && data.list.length === 0 ? <AppText color="textSecondary">{t('providers.none')}</AppText> : null}
      {data?.list.map((provider) => (
        <Pressable
          key={provider.id}
          accessibilityRole="button"
          accessibilityLabel={t('providers.open', { label: provider.label })}
          onPress={() => router.push({ pathname: '/provider/[id]', params: { id: provider.id } })}
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <Icon name="ai" color="accent" />
          <View style={styles.rowText}>
            <AppText>{provider.label}</AppText>
            <AppText variant="small" color="textSecondary">
              {t(`providers.kinds.${provider.kind}`)} · {t('providers.enabledCount', { count: provider.enabled.length })}
            </AppText>
          </View>
          <Icon name="chevron" size={18} color="textSecondary" />
        </Pressable>
      ))}

      <View style={styles.start}>
        <Button kind="secondary" icon="add" label={t('providers.add')} onPress={() => router.push({ pathname: '/provider/[id]', params: { id: 'new' } })} />
      </View>

      {data && data.choices.length > 1 ? (
        <View style={styles.section}>
          <AppText variant="bodyStrong">{t('providers.default')}</AppText>
          <View style={styles.chips}>
            {data.choices.map((choice) => (
              <Chip
                key={`${choice.providerId}:${choice.model}`}
                label={data.list.length > 1 ? `${choice.label} · ${choice.providerLabel}` : choice.label}
                selected={data.current?.providerId === choice.providerId && data.current.model === choice.model}
                onPress={() => {
                  providers.setDefault(choice.providerId, choice.model).catch(() => {});
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      <AppText variant="small" color="textSecondary">
        {t('providers.privacy')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: {
    minHeight: MIN_TOUCH + 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  pressed: { opacity: 0.6 },
  start: { alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
