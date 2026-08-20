/**
 * Post-processes the exported web build.
 *
 * Expo generates the <head> itself and offers no hook for adding tags, so the
 * home-screen metadata is injected here. Without an apple-touch-icon, iOS draws
 * a letter instead of the mark when you "Add to Home Screen".
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'docs';
const base = '/art-club';
const file = join(dir, 'index.html');

if (!existsSync(file)) {
  console.error(`  ${file} not found — run the export first`);
  process.exit(1);
}

const tags = [
  `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png" />`,
  `<link rel="manifest" href="${base}/manifest.webmanifest" />`,
  `<meta name="apple-mobile-web-app-capable" content="yes" />`,
  `<meta name="apple-mobile-web-app-title" content="Art Club" />`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`,
  `<meta name="theme-color" content="#FBF9F6" />`,
];

let html = readFileSync(file, 'utf8');
const missing = tags.filter((t) => !html.includes(t.match(/(?:rel|name)="([^"]+)"/)[1]));

if (missing.length) {
  html = html.replace('</head>', `  ${missing.join('\n  ')}\n</head>`);
  writeFileSync(file, html);
}

// GitHub Pages runs Jekyll otherwise, which skips the _expo folder entirely.
writeFileSync(join(dir, '.nojekyll'), '');

console.log(`  injected ${missing.length} tag(s), wrote .nojekyll`);
