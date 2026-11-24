#!/usr/bin/env node
/** Local preview; shares the production asset allowlist. */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { publicAsset } from '../server/public-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.argv[2] ?? 8080);

createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  const asset = await publicAsset(root, (req.url ?? '/').split('?')[0]);
  res.writeHead(asset.status, { 'content-type': asset.contentType, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : asset.body);
}).listen(port, '127.0.0.1', () => console.log(`studbook on http://127.0.0.1:${port}`));
