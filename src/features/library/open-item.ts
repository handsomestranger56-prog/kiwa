import { router } from 'expo-router';

/**
 * Opens an item that was just made (imported, generated or added to) with the library right under
 * it, so Back goes home instead of to the create, import or progress screens that led here.
 */
export function openNewItem(id: string) {
  if (router.canDismiss()) router.dismissAll();
  router.push({ pathname: '/item/[id]', params: { id } });
}
