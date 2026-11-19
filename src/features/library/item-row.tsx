import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LibraryItem } from '@/data/library-repository';
import { IconButton, Tag } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

type Props = {
  item: LibraryItem;
  /** The folder it is in, shown when items from several folders are listed together. */
  folder?: string | null;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onMore: () => void;
};

export function ItemRow({ item, folder, onOpen, onToggleFavorite, onMore }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const meta = [t(`kind.${item.kind}`), t(`units.${item.kind}`, { count: item.unitCount }), folder].filter(Boolean).join(' · ');

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${meta}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <Icon name={item.kind} color="accent" />
        </View>
        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText variant="small" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
          {item.completed || item.source === 'sample' ? (
            <View style={styles.tags}>
              {item.completed ? <Tag tone="accent" label={t('common.completed')} /> : null}
              {item.source === 'sample' ? <Tag label={t('common.sample')} /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.buttons}>
        <IconButton
          icon={item.favorite ? 'starFilled' : 'star'}
          color={item.favorite ? 'warm' : 'textSecondary'}
          selected={item.favorite}
          label={item.favorite ? t('actions.removeFavorite') : t('actions.addFavorite')}
          onPress={onToggleFavorite}
        />
        <IconButton icon="more" label={t('actions.more')} onPress={onMore} />
      </View>
    </View>
  );
}

/** A group shown as a folder: tapping it opens the items inside. */
export function FolderRow({ name, count, onOpen }: { name: string; count: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const meta = t('groups.items', { count });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${meta}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, styles.folder, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
      <View style={styles.main}>
        <View style={[styles.badge, { backgroundColor: colors.warmSoft }]}>
          <Icon name="folder" color="warm" />
        </View>
        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {name}
          </AppText>
          <AppText variant="small" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
        <Icon name="chevron" size={20} color="textSecondary" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  folder: { paddingRight: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.lg, paddingRight: spacing.xs },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  pressed: { opacity: 0.6 },
  badge: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  buttons: { flexDirection: 'row', alignItems: 'center' },
});
