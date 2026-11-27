/** Explicit public surface shared by production and the local preview server.
 * Keep private data and source outside this allowlist, regardless of DATA_DIR.
 */
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const MODULES = new Set([
  '/assets/ui.js', '/assets/engine.js', '/assets/net.js',
  '/assets/config.js', '/assets/token.js', '/assets/styles.css', '/assets/phenotype.js', '/assets/i18n.js',
  '/assets/race/causal.js', '/assets/race/track.js', '/assets/race/exhibition.js', '/assets/race/scene.js', '/assets/race/side-scene.js', '/assets/race/official.js',
  '/assets/coat-portrait.js', '/assets/birth-scene.js', '/assets/paddock-scene.js', '/assets/micro.js',
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
  mp4: 'video/mp4', webm: 'video/webm',
};
const failure = (status) => ({ status, body: status === 400 ? 'bad request' : 'not found', contentType: 'text/plain; charset=utf-8' });

/** A page that is not there still looks like the game, says so in Portuguese and points home. */
const NOT_FOUND_PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada · Studbook</title><style>
:root{--ink:#0e1712;--cream:#f1eee4;--gold:#d7b77d;--muted:#a6b0a2}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 30%,#1c2a1f,var(--ink) 70%);color:var(--cream);font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center}
.mark{font:600 22px Georgia,serif;letter-spacing:3px}.mark span{color:var(--gold)}
h1{font:400 clamp(40px,8vw,72px)/1 Georgia,serif;margin:28px 0 12px}p{color:var(--muted);max-width:420px;margin:0 auto 28px}
nav{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}a{display:inline-flex;min-height:46px;align-items:center;padding:0 22px;border-radius:4px;font-size:13px;font-weight:600;text-decoration:none}
.primary{color:#201c13;background:linear-gradient(120deg,#e2c58e,#c7a364)}.secondary{color:var(--cream);border:1px solid #d8dac748}
</style></head><body><main><div class="mark">STUD<span>BOOK</span></div><h1>Página não encontrada</h1><p>Este endereço não existe no Studbook. O seu estábulo continua onde estava.</p><nav><a class="primary" href="/play">Ir para o estábulo</a><a class="secondary" href="/">Página inicial</a></nav></main></body></html>`;
const notFoundPage = () => ({ status: 404, body: NOT_FOUND_PAGE, contentType: 'text/html; charset=utf-8' });
/** A navigation to a page (no extension, or .html), as opposed to a missing file. */
const isPage = (path) => !/\.[a-z0-9]+$/i.test(path) || /\.html?$/i.test(path);

export async function publicAsset(root, encodedPath) {
  let path;
  try { path = decodeURIComponent(encodedPath); } catch { return failure(400); }
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return failure(400);
  if (path.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.'))) return failure(404);
  if (path === '/') path = '/welcome.html';
  if (path === '/play') path = '/index.html';
  if (path === '/horse-3d') path = '/horse-3d.html';
  const artwork = /^\/assets\/art\/[A-Za-z0-9][A-Za-z0-9_-]*\.(webp|png|jpe?g|svg|gif|mp4|webm)$/.test(path);
  if (!['/index.html','/welcome.html','/horse-3d.html'].includes(path) && !MODULES.has(path) && !artwork) return isPage(path) ? notFoundPage() : failure(404);
  try {
    const canonicalRoot = await realpath(root);
    const file = join(canonicalRoot, path.slice(1));
    // An allowed-looking symlink must not expose a private file, even inside root.
    if (await realpath(file) !== file) return failure(404);
    return { status: 200, body: await readFile(file), contentType: MIME[path.split('.').pop()] };
  } catch { return failure(404); }
}

/**
 * Write an asset, honouring a single `Range: bytes=a-b` request. Safari will not play a video
 * served without byte ranges, so every 200 asset advertises them.
 */
export function sendAsset(req, res, asset) {
  const headers = { 'content-type': asset.contentType, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
  const head = req.method === 'HEAD';
  if (asset.status !== 200) {
    res.writeHead(asset.status, headers);
    return res.end(head ? undefined : asset.body);
  }
  const size = asset.body.length;
  headers['accept-ranges'] = 'bytes';
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers?.range ?? '').trim());
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    let end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) });
    return res.end(head ? undefined : asset.body.subarray(start, end + 1));
  }
  res.writeHead(200, { ...headers, 'content-length': String(size) });
  return res.end(head ? undefined : asset.body);
}
