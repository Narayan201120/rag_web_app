/**
 * Inline the built stylesheet into index.html.
 *
 * The app ships one small stylesheet. Keeping it as a separate render-blocking
 * request costs a full round trip before first paint, which hurts most on slow
 * connections. Inlining removes that request; the HTML is already uncached.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const indexPath = join(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');

const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)];
for (const [tag] of links) {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  if (!href) continue;
  const file = join(dist, href.replace(/^\//, ''));
  const css = await readFile(file, 'utf8');
  html = html.replace(tag, `<style>${css}</style>`);
  await unlink(file);
}

await writeFile(indexPath, html);
console.log(`inlined ${links.length} stylesheet(s) into dist/index.html`);
