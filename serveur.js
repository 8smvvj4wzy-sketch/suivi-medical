/**
 * Petit serveur statique pour tester l'application en local :
 *   node serveur.js  →  http://localhost:8080
 * Les modules ES ont besoin d'être servis en HTTP (file:// les bloque).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const RACINE = process.cwd();
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chemin = url.pathname === '/' ? '/index.html' : url.pathname;
  const cible = join(RACINE, normalize(chemin).replace(/^(\.\.[/\\])+/, ''));
  if (!cible.startsWith(RACINE)) {
    res.writeHead(403).end('Interdit');
    return;
  }
  try {
    const contenu = await readFile(cible);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(cible)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).listen(PORT, () => {
  console.log(`Application servie sur http://localhost:${PORT}`);
});
