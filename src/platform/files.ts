import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { TextFile } from '@/core/transfer/files';

/** Larger than any course is likely to be, small enough to read into memory safely. */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor() {
    super('The file is too large to import.');
    this.name = 'FileTooLargeError';
  }
}

/** Lets the user choose a file and returns its text. Resolves to null if they cancel. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  // On Android, read the picker's content:// address directly. Its copy in the cache folder is refused
  // in Expo Go ("Missing 'READ' permission"), and the file is read once, right away, so no copy is needed.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: Platform.OS !== 'android', multiple: false });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (asset.size !== undefined && asset.size > MAX_IMPORT_BYTES) throw new FileTooLargeError();

  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return { name: asset.name, text };
}

export type ShareResult = 'shared' | 'downloaded' | 'unavailable';

/**
 * Hands a text file to the system share sheet, so the user can save it or send it to another app.
 * In a browser the file is downloaded instead.
 */
export async function shareTextFile(file: TextFile): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([file.text], { type: file.mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return 'downloaded';
  }

  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  const target = new File(Paths.cache, file.name);
  target.create({ overwrite: true });
  await target.write(file.text);
  await Sharing.shareAsync(target.uri, { mimeType: file.mimeType, dialogTitle: file.name });
  return 'shared';
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

export async function readClipboardText(): Promise<string> {
  return Clipboard.getStringAsync();
}
