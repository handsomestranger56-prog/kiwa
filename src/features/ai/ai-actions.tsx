import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { AiError, strictSchema } from '@/core/ai';
import {
  type AiCheck,
  type AiExplanation,
  FEEDBACK_SYSTEM,
  buildCheckPrompt,
  buildExplainPrompt,
  checkResultSchema,
  readCheck,
} from '@/core/quiz/ai-feedback';
import type { Answer } from '@/core/quiz/answers';
import type { Question } from '@/core/schema';
import type { ModelChoice } from '@/data/providers-repository';
import { useData } from '@/data/provider';
import { Button, Tag } from '@/ui/controls';
import { Markdown } from '@/ui/markdown';
import { ActionSheet } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

import { callModel } from './call';
import { NoProvider, formatUsage, sameChoice, useModelChoices } from './model-picker';

type Props = {
  question: Question;
  answer: Answer | undefined;
  /** Whether the learner's answer was right, which changes what the explanation focuses on. */
  correct: boolean;
  /** Offer "Check with AI". Only for written answers. */
  allowCheck: boolean;
  check?: AiCheck;
  explanation?: AiExplanation;
  onCheck: (check: AiCheck) => void;
  onExplain: (explanation: AiExplanation) => void;
};

const checkJsonSchema = strictSchema(z.toJSONSchema(checkResultSchema, { io: 'input' }) as Record<string, unknown>);

/** "Explain deeper" and "Check with AI" for one answered question, and what they returned. */
export function AiActions({ question, answer, correct, allowCheck, check, explanation, onCheck, onExplain }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { providers } = useData();
  const models = useModelChoices();
  const [picked, setPicked] = useState<ModelChoice | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<'check' | 'explain' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsProvider, setNeedsProvider] = useState(false);

  const model = picked ?? models?.fallback ?? null;

  const run = async (kind: 'check' | 'explain') => {
    setError(null);
    if (!model) {
      setNeedsProvider(true);
      return;
    }
    setBusy(kind);
    try {
      const source = { model: model.label, provider: model.providerLabel };
      if (kind === 'check') {
        const reply = await callModel(providers, model, { system: FEEDBACK_SYSTEM, prompt: buildCheckPrompt(question, answer), schema: checkJsonSchema, maxTokens: 2000 });
        const result = readCheck(reply.text);
        if (!result) throw new AiError('badRequest', t('ai.unreadable'));
        onCheck({ ...result, ...source, usage: reply.usage });
      } else {
        const reply = await callModel(providers, model, { system: FEEDBACK_SYSTEM, prompt: buildExplainPrompt(question, answer, correct), maxTokens: 1500 });
        onExplain({ text: reply.text.trim(), ...source, usage: reply.usage });
      }
    } catch (failure) {
      const kindOfError = failure instanceof AiError ? failure.kind : 'network';
      setError(failure instanceof AiError && failure.message === t('ai.unreadable') ? failure.message : t(`ai.error.${kindOfError}`));
    } finally {
      setBusy(null);
    }
  };

  const showCheck = allowCheck && !check;
  const showExplain = !explanation;

  return (
    <View style={styles.wrap}>
      {check ? (
        <View style={[styles.box, { backgroundColor: colors.accentSoft }]}>
          <View style={styles.row}>
            <Tag tone="accent" label={t('ai.checked')} />
            <AppText variant="bodyStrong">{t('ai.score', { percent: Math.round(check.score * 100) })}</AppText>
          </View>
          <AppText>{check.verdict}</AppText>
          {check.strengths.length > 0 ? <Points title={t('ai.strengths')} items={check.strengths} /> : null}
          {check.missing.length > 0 ? <Points title={t('ai.missing')} items={check.missing} /> : null}
          {check.suggestion ? <AppText color="textSecondary">{check.suggestion}</AppText> : null}
          <AppText variant="small" color="textSecondary">
            {check.model} · {formatUsage(check.usage)}
          </AppText>
        </View>
      ) : null}

      {explanation ? (
        <View style={[styles.box, { backgroundColor: colors.surfaceAlt }]}>
          <AppText variant="label" color="textSecondary">
            {t('ai.explanationBy', { model: explanation.model })}
          </AppText>
          <Markdown source={explanation.text} />
          <AppText variant="small" color="textSecondary">
            {formatUsage(explanation.usage)}
          </AppText>
        </View>
      ) : null}

      {showCheck || showExplain ? (
        <View style={styles.row}>
          {showExplain ? (
            <Button kind="secondary" icon="ai" label={busy === 'explain' ? t('ai.working', { model: model?.label ?? '' }) : t('ai.explain')} disabled={busy !== null} onPress={() => void run('explain')} />
          ) : null}
          {showCheck ? (
            <Button kind="secondary" icon="ai" label={busy === 'check' ? t('ai.working', { model: model?.label ?? '' }) : t('ai.check')} disabled={busy !== null} onPress={() => void run('check')} />
          ) : null}
        </View>
      ) : null}

      {(showCheck || showExplain) && models && models.choices.length > 1 && model ? (
        <Button kind="plain" label={t('ai.changeModel', { model: model.label })} onPress={() => setChoosing(true)} />
      ) : null}
      {needsProvider && !model ? <NoProvider /> : null}
      {error ? (
        <AppText color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}

      <ActionSheet
        visible={choosing}
        title={t('ai.pickModel')}
        onClose={() => setChoosing(false)}
        actions={(models?.choices ?? []).map((choice) => ({
          key: `${choice.providerId}:${choice.model}`,
          icon: sameChoice(choice, model) ? 'checkCircle' : 'circle',
          label: choice.label,
          hint: choice.providerLabel,
          onPress: () => setPicked(choice),
        }))}
      />
    </View>
  );
}

function Points({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.points}>
      <AppText variant="label" color="textSecondary">
        {title}
      </AppText>
      {items.map((item, index) => (
        <AppText key={index}>• {item}</AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  box: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  points: { gap: 2 },
});
