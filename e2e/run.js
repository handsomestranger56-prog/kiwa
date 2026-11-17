// Runs every check in this folder against the web build in dist/ and fails if any step fails.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const skip = new Set(['harness.js', 'run.js', 'mock-ai.js']);
const files = fs.readdirSync(__dirname).filter((file) => file.endsWith('.js') && !skip.has(file)).sort();
let failed = false;

for (const file of files) {
  console.log(`\n== ${file}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed = true;
    // A script that crashes outside a step prints no FAIL line of its own.
    console.log(`FAIL ${file} exited with code ${result.status}`);
  }
}
process.exit(failed ? 1 : 0);
