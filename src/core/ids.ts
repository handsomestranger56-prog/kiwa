const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * A short id such as `c_k3f9x2ab7q`. Ids only need to be unique on one device,
 * so this avoids a dependency on a platform random source.
 */
export function newId(prefix: string, random: () => number = Math.random): string {
  let body = '';
  for (let index = 0; index < 10; index += 1) {
    body += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return `${prefix}_${body}`;
}
