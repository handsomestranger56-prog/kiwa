import { type AndroidSymbol, type SFSymbol, SymbolView } from 'expo-symbols';

import { type ColorName, useTheme } from './theme';

type Glyph = { ios: SFSymbol; material: AndroidSymbol };

const glyphs = {
  course: { ios: 'book.closed', material: 'menu_book' },
  quiz: { ios: 'checklist', material: 'checklist' },
  deck: { ios: 'rectangle.on.rectangle', material: 'style' },
  star: { ios: 'star', material: 'star' },
  starFilled: { ios: 'star.fill', material: 'star' },
  bookmark: { ios: 'bookmark', material: 'bookmark' },
  bookmarkFilled: { ios: 'bookmark.fill', material: 'bookmark' },
  circle: { ios: 'circle', material: 'radio_button_unchecked' },
  checkCircle: { ios: 'checkmark.circle.fill', material: 'check_circle' },
  more: { ios: 'ellipsis', material: 'more_horiz' },
  add: { ios: 'plus', material: 'add' },
  search: { ios: 'magnifyingglass', material: 'search' },
  close: { ios: 'xmark', material: 'close' },
  edit: { ios: 'pencil', material: 'edit' },
  trash: { ios: 'trash', material: 'delete' },
  restore: { ios: 'arrow.uturn.backward', material: 'restore_from_trash' },
  chevron: { ios: 'chevron.right', material: 'chevron_right' },
  radioOn: { ios: 'largecircle.fill.circle', material: 'radio_button_checked' },
  checkboxOff: { ios: 'square', material: 'check_box_outline_blank' },
  checkboxOn: { ios: 'checkmark.square.fill', material: 'check_box' },
  check: { ios: 'checkmark', material: 'check' },
  hint: { ios: 'lightbulb', material: 'lightbulb' },
  timer: { ios: 'timer', material: 'timer' },
  play: { ios: 'play.fill', material: 'play_arrow' },
  ai: { ios: 'sparkles', material: 'auto_awesome' },
  importFile: { ios: 'square.and.arrow.down', material: 'download' },
  share: { ios: 'square.and.arrow.up', material: 'ios_share' },
  copy: { ios: 'doc.on.doc', material: 'content_copy' },
  paste: { ios: 'doc.on.clipboard', material: 'content_paste' },
  file: { ios: 'doc', material: 'description' },
  minus: { ios: 'minus', material: 'remove' },
  up: { ios: 'chevron.up', material: 'keyboard_arrow_up' },
  down: { ios: 'chevron.down', material: 'keyboard_arrow_down' },
  drag: { ios: 'line.3.horizontal', material: 'drag_indicator' },
  folder: { ios: 'folder', material: 'folder' },
  image: { ios: 'photo', material: 'image' },
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;

type Props = { name: IconName; size?: number; color?: ColorName };

export function Icon({ name, size = 22, color = 'text' }: Props) {
  const { colors } = useTheme();
  const glyph = glyphs[name];
  return (
    <SymbolView
      name={{ ios: glyph.ios, android: glyph.material, web: glyph.material }}
      size={size}
      tintColor={colors[color]}
      style={{ width: size, height: size }}
    />
  );
}
