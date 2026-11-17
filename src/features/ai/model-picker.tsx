import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ModelChoice } from '@/data/providers-repository';
import i18n from '@/i18n';
import { useQuery } from '@/data/provider';
import { Button, Chip } from '@/ui/controls';
import { AppText } from '@/ui/text';
import { spacing } from '@/ui/theme';

export type ModelOptions = { choices: ModelChoice[]; fallback: ModelChoice | null };

/** Every model the user turned on, and the default one. */
export function useModelChoices() {
  const loaded = useQuery('ai:choices', async ({ providers }) => ({
    choices: await providers.choices(),
    fallback: await providers.defaultChoice(),
  }));
  return loaded.data ?? null;
}

export const sameChoice = (a: Pick<ModelChoice, 'providerId' | 'model'> | null, b: Pick<ModelChoice, 'providerId' | 'model'> | null) =>
  !!a && !!b && a.providerId === b.providerId && a.model === b.model;

type Props = { options: ModelOptions; value: ModelChoice | null; onChange: (choice: ModelChoice) => void };

/** Picks one model. Shown only when there is more than one to choose from. */
export function ModelPicker({ options, value, onChange }: Props) {
  const { t } = useTranslation();
  const manyProviders = new Set(options.choices.map((choice) => choice.providerId)).size > 1;
  if (options.choices.length < 2) return null;
  return (
    <View style={styles.chips}>
      {options.choices.map((choice) => (
        <Chip
          key={`${choice.providerId}:${choice.model}`}
          label={manyProviders ? `${choice.label} · ${choice.providerLabel}` : choice.label}
          selected={sameChoice(value, choice)}
          onPress={() => onChange(choice)}
        />
      ))}
      <AppText variant="small" color="textSecondary" style={styles.full}>
        {t('ai.pickHint')}
      </AppText>
    </View>
  );
}

/** Shown where an AI action would go when no provider is set up yet. */
export function NoProvider() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={styles.none}>
      <AppText variant="small" color="textSecondary">
        {t('ai.noProvider')}
      </AppText>
      <View style={styles.start}>
        <Button kind="plain" icon="ai" label={t('ai.addProvider')} onPress={() => router.push({ pathname: '/provider/[id]', params: { id: 'new' } })} />
      </View>
    </View>
  );
}

/** Tokens a request used, in a form people read. */
export function formatUsage(usage: { inputTokens: number; outputTokens: number }): string {
  const format = (value: number) => (value >= 10000 ? `${Math.round(value / 1000)}k` : value.toLocaleString());
  return i18n.t('ai.usage', {
    total: format(usage.inputTokens + usage.outputTokens),
    input: format(usage.inputTokens),
    output: format(usage.outputTokens),
  });
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  full: { width: '100%' },
  none: { gap: spacing.xs },
  start: { alignItems: 'flex-start' },
});
