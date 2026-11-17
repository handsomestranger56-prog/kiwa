import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { type ModelInfo, type ProviderKind, AiError, OPENAI_COMPATIBLE_PRESETS, PROVIDER_KINDS, listModels } from '@/core/ai';
import type { Provider } from '@/data/providers-repository';
import { useData, useQuery } from '@/data/provider';
import { Field, SaveBar } from '@/features/editor/parts';
import { deleteApiKey, readApiKey, saveApiKey } from '@/platform/secrets';
import { Button, Chip, IconButton, TextField } from '@/ui/controls';
import { EmptyState, Loading, Page } from '@/ui/layout';
import { ConfirmDialog } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

type Loaded = { provider: Provider | null; hasKey: boolean };

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const isNew = id === 'new';

  const loaded = useQuery<Loaded | null>(`provider:${id}`, async ({ providers }) => {
    if (isNew) return { provider: null, hasKey: false };
    const provider = await providers.get(id);
    if (!provider) return null;
    return { provider, hasKey: (await readApiKey(id)) !== null };
  });

  return (
    <Page>
      <Stack.Screen options={{ title: isNew ? t('providers.add') : t('providers.edit') }} />
      {loaded.loading ? <Loading /> : loaded.data ? (
        // Keyed so the form starts from the stored values once, and keeps what is typed after.
        <ProviderForm key={loaded.data.provider?.id ?? 'new'} provider={loaded.data.provider} hasKey={loaded.data.hasKey} />
      ) : (
        <EmptyState icon="close" title={t('study.missing')} body="" />
      )}
    </Page>
  );
}

const DEFAULT_LABEL: Record<ProviderKind, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI' };

type FormProps = { provider: Provider | null; hasKey: boolean };

function ProviderForm({ provider, hasKey }: FormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { providers } = useData();

  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? 'claude');
  const [label, setLabel] = useState(provider?.label ?? DEFAULT_LABEL.claude);
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [key, setKey] = useState('');
  const [replacingKey, setReplacingKey] = useState(!hasKey);
  const [models, setModels] = useState<ModelInfo[]>(provider?.models ?? []);
  const [enabled, setEnabled] = useState<string[]>(provider?.enabled ?? []);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const labelIsDefault = Object.values(DEFAULT_LABEL).includes(label) || OPENAI_COMPATIBLE_PRESETS.some((preset) => preset.label === label);

  const chooseKind = (next: ProviderKind) => {
    setKind(next);
    if (labelIsDefault) setLabel(DEFAULT_LABEL[next]);
    if (next === 'openai' && !baseUrl) setBaseUrl(OPENAI_COMPATIBLE_PRESETS[0].baseUrl);
    if (next !== 'openai') setBaseUrl('');
    setModels([]);
    setEnabled([]);
    setStatus(null);
  };

  /** The key typed now, or the stored one when it is not being replaced. */
  const currentKey = async () => (replacingKey ? key.trim() : ((provider ? await readApiKey(provider.id) : null) ?? ''));
  const keyRequired = kind !== 'openai';

  const detect = async () => {
    setStatus(null);
    setProblem(null);
    const apiKey = await currentKey();
    if (keyRequired && !apiKey) {
      setStatus({ ok: false, text: t('providers.needKey') });
      return;
    }
    setTesting(true);
    try {
      const found = await listModels({ kind, apiKey, baseUrl: baseUrl.trim() || undefined });
      setModels(found);
      // Keep earlier ticks that still exist. With nothing ticked yet, tick the first model.
      const kept = enabled.filter((model) => found.some((info) => info.id === model));
      setEnabled(kept.length > 0 ? kept : found.slice(0, 1).map((info) => info.id));
      setStatus({ ok: true, text: t('providers.found', { count: found.length }) });
    } catch (error) {
      const kindOfError = error instanceof AiError ? error.kind : 'network';
      setStatus({ ok: false, text: t(`ai.error.${kindOfError}`) + (error instanceof Error && error.message ? ` (${error.message})` : '') });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setProblem(null);
    if (!label.trim()) return setProblem(t('providers.needLabel'));
    if (kind === 'openai' && !/^https?:\/\//.test(baseUrl.trim())) return setProblem(t('providers.needUrl'));
    if (keyRequired && replacingKey && !key.trim()) return setProblem(t('providers.needKey'));
    try {
      const id = await providers.save({ id: provider?.id, kind, label, baseUrl: baseUrl.trim() || null, models, enabled });
      if (replacingKey) {
        if (key.trim()) await saveApiKey(id, key.trim());
        else await deleteApiKey(id);
      }
      router.back();
    } catch {
      setProblem(t('errors.generic'));
    }
  };

  const remove = async () => {
    if (!provider) return;
    try {
      await deleteApiKey(provider.id);
      await providers.remove(provider.id);
      router.back();
    } catch {
      setProblem(t('errors.generic'));
    }
  };

  const toggle = (model: string) => setEnabled(enabled.includes(model) ? enabled.filter((entry) => entry !== model) : [...enabled, model]);

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Field label={t('providers.kind')}>
          <View style={styles.chips}>
            {PROVIDER_KINDS.map((option) => (
              <Chip key={option} label={t(`providers.kinds.${option}`)} selected={kind === option} onPress={() => chooseKind(option)} />
            ))}
          </View>
          <AppText variant="small" color="textSecondary">
            {t(`providers.kindHint.${kind}`)}
          </AppText>
        </Field>

        {kind === 'openai' ? (
          <Field label={t('providers.baseUrl')} hint={t('providers.baseUrlHint')}>
            <View style={styles.chips}>
              {OPENAI_COMPATIBLE_PRESETS.map((preset) => (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  selected={baseUrl === preset.baseUrl}
                  onPress={() => {
                    setBaseUrl(preset.baseUrl);
                    if (labelIsDefault) setLabel(preset.label);
                  }}
                />
              ))}
            </View>
            <TextField value={baseUrl} onChangeText={setBaseUrl} accessibilityLabel={t('providers.baseUrl')} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          </Field>
        ) : null}

        <Field label={t('providers.label')}>
          <TextField value={label} onChangeText={setLabel} accessibilityLabel={t('providers.label')} maxLength={60} />
        </Field>

        <Field label={t('providers.key')} hint={kind === 'openai' ? t('providers.keyOptional') : t('providers.keyHint')}>
          {replacingKey ? (
            <TextField
              value={key}
              onChangeText={setKey}
              accessibilityLabel={t('providers.key')}
              placeholder={t('providers.keyPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />
          ) : (
            <View style={styles.row}>
              <AppText style={styles.grow}>{t('providers.keySaved')}</AppText>
              <Button kind="secondary" label={t('providers.replaceKey')} onPress={() => setReplacingKey(true)} />
            </View>
          )}
        </Field>

        <View style={styles.row}>
          <Button kind="secondary" icon="search" label={testing ? t('providers.testing') : t('providers.detect')} disabled={testing} onPress={() => void detect()} />
        </View>
        {status ? (
          <AppText color={status.ok ? 'accent' : 'danger'} accessibilityLiveRegion="polite">
            {status.text}
          </AppText>
        ) : null}

        {models.length > 0 ? (
          <Field label={t('providers.models')} hint={t('providers.modelsHint')}>
            <View style={[styles.models, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {models.map((model) => {
                const on = enabled.includes(model.id);
                return (
                  <View key={model.id} style={styles.model}>
                    <IconButton
                      icon={on ? 'checkboxOn' : 'checkboxOff'}
                      color={on ? 'accent' : 'textSecondary'}
                      selected={on}
                      label={t('providers.useModel', { model: model.label })}
                      onPress={() => toggle(model.id)}
                    />
                    <View style={styles.grow}>
                      <AppText>{model.label}</AppText>
                      {model.label !== model.id ? (
                        <AppText variant="small" color="textSecondary">
                          {model.id}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </Field>
        ) : null}

        {provider ? (
          <View style={styles.row}>
            <Button kind="plain" icon="trash" label={t('providers.remove')} onPress={() => setConfirmingRemove(true)} />
          </View>
        ) : null}
      </ScrollView>

      <SaveBar onSave={() => void save()} issues={problem ? [{ path: '', message: problem }] : []} />
      <ConfirmDialog
        visible={confirmingRemove}
        danger
        title={t('providers.removeTitle', { label: provider?.label ?? '' })}
        body={t('providers.removeBody')}
        confirmLabel={t('providers.remove')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void remove()}
        onClose={() => setConfirmingRemove(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  models: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.xs },
  model: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md },
});
