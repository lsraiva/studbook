/** Explicit public surface shared by production and the local preview server.
 * Keep private data and source outside this allowlist, regardless of DATA_DIR.
 */
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const MODULES = new Set([
  '/assets/ui.js', '/assets/engine.js', '/assets/net.js',
  '/assets/config.js', '/assets/token.js', '/assets/styles.css', '/assets/phenotype.js',
  '/assets/welcome.css', '/assets/welcome.js',
  '/assets/horse-viewer-v033.js', '/assets/horse-viewer-v033.css',
  '/assets/models/horse-lite-v03.glb', '/assets/models/horse-high-v03.glb',
  '/assets/models/NOTICE.txt',
]);
const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', webp: 'image/webp', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif',
  glb: 'model/gltf-binary', txt: 'text/plain; charset=utf-8',
};
const failure = (status) => ({ status, body: status === 400 ? 'bad request' : 'not found', contentType: 'text/plain; charset=utf-8' });

export async function publicAsset(root, encodedPath) {
  let path;
  try { path = decodeURIComponent(encodedPath); } catch { return failure(400); }
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return failure(400);
  if (path.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.'))) return failure(404);
  if (path === '/') path = '/welcome.html';
  if (path === '/play') path = '/index.html';
  if (path === '/horse-3d') path = '/horse-3d.html';
  const artwork = /^\/assets\/art\/[A-Za-z0-9][A-Za-z0-9_-]*\.(webp|png|jpe?g|svg|gif)$/.test(path);
  if (!['/index.html','/welcome.html','/horse-3d.html'].includes(path) && !MODULES.has(path) && !artwork) return failure(404);
  try {
    const canonicalRoot = await realpath(root);
    const file = join(canonicalRoot, path.slice(1));
    // An allowed-looking symlink must not expose a private file, even inside root.
    if (await realpath(file) !== file) return failure(404);
    return { status: 200, body: await readFile(file), contentType: MIME[path.split('.').pop()] };
  } catch { return failure(404); }
}
