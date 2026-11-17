import { parseDocument } from '@/core/schema';
import { sampleInputs } from '@/core/templates/samples';

import { type LibraryRepository, DuplicateItemError } from './library-repository';
import type { SettingsRepository } from './settings-repository';

/**
 * Adds the bundled samples once, on first launch. If the user later deletes
 * them they stay deleted.
 */
export async function seedSamples(library: LibraryRepository, settings: SettingsRepository): Promise<void> {
  if ((await settings.get('samples.seeded')) !== null) return;

  for (const input of sampleInputs) {
    const result = parseDocument(input);
    if (!result.ok) {
      const first = result.issues[0];
      throw new Error(`Bundled sample "${input.id}" is invalid at ${first.path}: ${first.message}`);
    }
    try {
      await library.add(result.document, 'sample');
    } catch (error) {
      if (!(error instanceof DuplicateItemError)) throw error;
    }
  }

  await settings.set('samples.seeded', '1');
}
