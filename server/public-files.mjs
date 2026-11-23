/** Explicit public surface shared by production and the local preview server.
 * Keep private data and source outside this allowlist, regardless of DATA_DIR.
 */
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const MODULES = new Set([
  '/assets/ui.js', '/assets/engine.js', '/assets/net.js',
  '/assets/config.js', '/assets/token.js', '/assets/styles.css',
]);
const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', webp: 'image/webp', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif',
};
const failure = (status) => ({ status, body: status === 400 ? 'bad request' : 'not found', contentType: 'text/plain; charset=utf-8' });

export async function publicAsset(root, encodedPath) {
  let path;
  try { path = decodeURIComponent(encodedPath); } catch { return failure(400); }
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return failure(400);
  if (path.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.'))) return failure(404);
  if (path === '/') path = '/index.html';
  const artwork = /^\/assets\/art\/[A-Za-z0-9][A-Za-z0-9_-]*\.(webp|png|jpe?g|svg|gif)$/.test(path);
  if (path !== '/index.html' && !MODULES.has(path) && !artwork) return failure(404);
  try {
    const canonicalRoot = await realpath(root);
    const file = join(canonicalRoot, path.slice(1));
    // An allowed-looking symlink must not expose a private file, even inside root.
    if (await realpath(file) !== file) return failure(404);
    return { status: 200, body: await readFile(file), contentType: MIME[path.split('.').pop()] };
  } catch { return failure(404); }
}
