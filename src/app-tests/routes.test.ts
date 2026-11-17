import fs from 'fs';
import path from 'path';

/**
 * Loads every screen file the way the router does and checks it has a component as its default
 * export. A module that throws while loading (for example a dependency that breaks under React
 * Native's bundler) makes every route look like it has no default export, so this catches both.
 */
const appDir = path.join(__dirname, '..', 'app');

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('routes', () => {
  const files = routeFiles(appDir);

  it('finds the screens', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files.map((file) => [path.relative(appDir, file), file]))('%s loads and exports a component', (_name, file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require(file);
    expect(typeof route.default).toBe('function');
  });
});
