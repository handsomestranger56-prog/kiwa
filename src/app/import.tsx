import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Course, COURSE_FORMAT, kindOf, unitCount } from '@/core/schema';
import { type ImportOutcome, appendLesson, asCopy, readImport } from '@/core/transfer/files';
import { buildFixPrompt } from '@/core/transfer/prompt';
import type { Fix } from '@/core/transfer/repair';
import { useData, useQuery } from '@/data/provider';
import { FileTooLargeError, copyText, pickTextFile, readClipboardText } from '@/platform/files';
import { Button, Chip, Tag, TextField } from '@/ui/controls';
import { Page } from '@/ui/layout';
import { ConfirmDialog } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { monoFont, radius, spacing, useTheme } from '@/ui/theme';

type Checked = { outcome: ImportOutcome; existing: boolean };
type Success = Extract<ImportOutcome, { ok: true }>;
type Failure = Extract<ImportOutcome, { ok: false }>;

export default function ImportScreen() {
  const params = useLocalSearchParams<{ course?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const data = useData();

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [conflict, setConflict] = useState<'replace' | 'copy'>('replace');
  const [courseId, setCourseId] = useState<string | null>(params.course ?? null);
  const [message, setMessage] = useState<{ tone: 'danger' | 'accent'; text: string } | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [working, setWorking] = useState(false);

  const courses = useQuery('import:courses', async ({ library }) =>
    (await library.list({ kind: 'course' })).map((item) => ({ id: item.id, title: item.title })),
  );

  const fail = (error?: unknown) =>
    setMessage({ tone: 'danger', text: error instanceof FileTooLargeError ? t('import.tooLarge') : t('errors.generic') });

  const check = async (source: string) => {
    setMessage(null);
    const outcome = readImport(source);
    const existing = outcome.ok && outcome.kind === 'document' ? await data.library.exists(outcome.document.id) : false;
    setConflict('replace');
    if (outcome.ok && outcome.kind === 'lesson' && !courseId) {
      const suggested = outcome.courseId && (await data.library.exists(outcome.courseId)) ? outcome.courseId : null;
      setCourseId(suggested ?? courses.data?.[0]?.id ?? null);
    }
    setChecked({ outcome, existing });
  };

  const chooseFile = () => {
    pickTextFile()
      .then((file) => {
        if (!file) return;
        setFileName(file.name);
        setText(file.text.length > 20_000 ? '' : file.text);
        return check(file.text);
      })
      .catch(fail);
  };

  const pasteClipboard = () => {
    readClipboardText()
      .then((clip) => {
        if (!clip.trim()) {
          setMessage({ tone: 'danger', text: t('import.clipboardEmpty') });
          return;
        }
        setFileName(null);
        setText(clip);
        return check(clip);
      })
      .catch(fail);
  };

  const run = (work: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setMessage(null);
    work()
      .catch(fail)
      .finally(() => setWorking(false));
  };

  const addDocument = (outcome: Extract<Success, { kind: 'document' }>, existing: boolean) =>
    run(async () => {
      const item = !existing
        ? await data.library.add(outcome.document, 'imported')
        : conflict === 'replace'
          ? await data.library.replace(outcome.document, 'imported')
          : await data.library.add(asCopy(outcome.document, t('import.copySuffix')), 'imported');
      router.replace({ pathname: '/item/[id]', params: { id: item.id } });
    });

  const addLesson = (outcome: Extract<Success, { kind: 'lesson' }>) =>
    run(async () => {
      if (!courseId) return;
      const course = await data.library.getDocument(courseId);
      if (!course || course.format !== COURSE_FORMAT) throw new Error('course missing');
      await data.library.replace(appendLesson(course as Course, outcome.lesson));
      router.replace({ pathname: '/item/[id]', params: { id: courseId } });
    });

  const restore = (outcome: Extract<Success, { kind: 'backup' }>) =>
    run(async () => {
      const result = await data.backups.restore(outcome.backup);
      setChecked(null);
      setText('');
      setFileName(null);
      setMessage({ tone: 'accent', text: t('import.restored', { count: result.items }) });
    });

  const outcome = checked?.outcome ?? null;

  return (
    <Page>
      <Stack.Screen options={{ title: t('import.title') }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <AppText color="textSecondary">{t('import.intro')}</AppText>

        <View style={styles.row}>
          <Button kind="secondary" icon="file" label={t('import.chooseFile')} onPress={chooseFile} />
          <Button kind="secondary" icon="paste" label={t('import.pasteClipboard')} onPress={pasteClipboard} />
        </View>

        <View style={styles.block}>
          <TextField
            value={text}
            onChangeText={(value) => {
              setText(value);
              setFileName(null);
              setChecked(null);
            }}
            placeholder={t('import.pastePlaceholder')}
            accessibilityLabel={t('import.pastePlaceholder')}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.paste, { fontFamily: monoFont }]}
          />
          {fileName ? (
            <AppText variant="small" color="textSecondary">
              {t('import.fromFile', { name: fileName })}
            </AppText>
          ) : null}
          <View style={styles.row}>
            <Button label={t('import.check')} disabled={text.trim() === ''} onPress={() => void check(text).catch(fail)} />
          </View>
        </View>

        {message ? (
          <AppText color={message.tone} accessibilityLiveRegion="polite">
            {message.text}
          </AppText>
        ) : null}

        {outcome && !outcome.ok ? <Problems failure={outcome} /> : null}

        {outcome?.ok && outcome.kind === 'document' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Tag tone="accent" label={t(`kind.${kindOf(outcome.document)}`)} />
            <AppText variant="heading">{outcome.document.title}</AppText>
            <AppText variant="small" color="textSecondary">
              {t(`units.${kindOf(outcome.document)}`, { count: unitCount(outcome.document) })}
              {outcome.document.level ? ` · ${t(`level.${outcome.document.level}`)}` : ''}
            </AppText>
            {outcome.document.description ? <AppText>{outcome.document.description}</AppText> : null}
            <Fixes fixes={outcome.fixes} />

            {checked?.existing ? (
              <View style={styles.block}>
                <AppText variant="bodyStrong">{t('import.conflict.title')}</AppText>
                <View style={styles.row}>
                  <Chip label={t('import.conflict.replace')} selected={conflict === 'replace'} onPress={() => setConflict('replace')} />
                  <Chip label={t('import.conflict.copy')} selected={conflict === 'copy'} onPress={() => setConflict('copy')} />
                </View>
                <AppText variant="small" color="textSecondary">
                  {t(`import.conflict.${conflict}Hint`)}
                </AppText>
              </View>
            ) : null}

            <View style={styles.row}>
              <Button
                icon="add"
                label={checked?.existing && conflict === 'replace' ? t('import.replace') : t('import.add')}
                disabled={working}
                onPress={() => addDocument(outcome, checked?.existing ?? false)}
              />
            </View>
          </View>
        ) : null}

        {outcome?.ok && outcome.kind === 'lesson' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Tag tone="accent" label={t('create.kind.lesson')} />
            <AppText variant="heading">{outcome.lesson.title}</AppText>
            {outcome.lesson.summary ? <AppText color="textSecondary">{outcome.lesson.summary}</AppText> : null}
            <Fixes fixes={outcome.fixes} />
            <AppText variant="bodyStrong">{t('import.lessonCourse')}</AppText>
            {(courses.data ?? []).length === 0 ? (
              <AppText color="textSecondary">{t('create.noCourses')}</AppText>
            ) : (
              <View style={styles.row}>
                {(courses.data ?? []).map((course) => (
                  <Chip key={course.id} label={course.title} selected={courseId === course.id} onPress={() => setCourseId(course.id)} />
                ))}
              </View>
            )}
            <View style={styles.row}>
              <Button icon="add" label={t('import.addLesson')} disabled={working || !courseId} onPress={() => addLesson(outcome)} />
            </View>
          </View>
        ) : null}

        {outcome?.ok && outcome.kind === 'backup' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Tag tone="warm" label={t('import.backup.tag')} />
            <AppText variant="heading">{t('import.backup.items', { count: outcome.backup.items.length })}</AppText>
            <AppText variant="small" color="textSecondary">
              {t('import.backup.created', { date: new Date(outcome.backup.createdAt).toLocaleDateString() })}
            </AppText>
            <AppText color="textSecondary">{t('import.backup.hint')}</AppText>
            <View style={styles.row}>
              <Button icon="restore" label={t('import.backup.restore')} disabled={working} onPress={() => setConfirmingRestore(true)} />
            </View>
            <ConfirmDialog
              visible={confirmingRestore}
              title={t('import.backup.confirmTitle')}
              body={t('import.backup.hint')}
              confirmLabel={t('import.backup.restore')}
              cancelLabel={t('common.cancel')}
              onConfirm={() => restore(outcome)}
              onClose={() => setConfirmingRestore(false)}
            />
          </View>
        ) : null}
      </ScrollView>
    </Page>
  );
}

function Fixes({ fixes }: { fixes: Fix[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (fixes.length === 0) return null;
  return (
    <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
      <AppText variant="label" color="textSecondary">
        {t('import.fixes.title')}
      </AppText>
      {fixes.map((fix) => (
        <AppText key={fix.code} variant="small">
          {fix.code === 'inferredFormat' ? t('import.fixes.inferredFormat', { format: fix.format }) : t(`import.fixes.${fix.code}`, { count: fix.count })}
        </AppText>
      ))}
    </View>
  );
}

function Problems({ failure }: { failure: Failure }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const shown = failure.stage === 'content' ? failure.issues.slice(0, 20) : [];
  const hidden = failure.stage === 'content' ? failure.issues.length - shown.length : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
      <AppText variant="heading">{t('import.problems.title')}</AppText>
      {failure.stage === 'json' ? (
        <>
          <AppText>{t(`import.problems.json.${failure.problem}`)}</AppText>
          {failure.detail ? (
            <AppText variant="small" selectable style={{ fontFamily: monoFont }}>
              {failure.detail}
            </AppText>
          ) : null}
        </>
      ) : (
        <>
          {shown.map((issue, index) => (
            <View key={index} style={styles.issue}>
              <AppText variant="small" selectable style={{ fontFamily: monoFont }}>
                {issue.path || t('import.problems.topLevel')}
              </AppText>
              <AppText>{issue.message}</AppText>
            </View>
          ))}
          {hidden > 0 ? <AppText color="textSecondary">{t('import.problems.more', { count: hidden })}</AppText> : null}
        </>
      )}

      {failure.stage === 'json' && failure.problem === 'empty' ? null : (
        <>
          <AppText color="textSecondary">{t('import.problems.fixHint')}</AppText>
          <View style={styles.row}>
            <Button
              kind="secondary"
              icon="copy"
              label={copied ? t('import.problems.copied') : t('import.problems.copyFix')}
              onPress={() => {
                copyText(buildFixPrompt(failure))
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  block: { gap: spacing.sm },
  paste: { minHeight: 140, paddingTop: spacing.md, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  note: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  issue: { gap: 2 },
});
