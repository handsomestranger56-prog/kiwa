// Wraps site/index.html (written as a page fragment) into docs/index.html for GitHub Pages.
// The screenshots it shows are in docs/screens, made by tools/capture-screens.js.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fragment = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
// The fragment opens with its title, meta and link tags (favicon included). They go in <head>:
// browsers only look for the favicon there.
const split = fragment.indexOf('<style>');
const head = fragment.slice(0, split);
const body = fragment.slice(split);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
${head}</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), html);
console.log('wrote docs/index.html');
