// Servidor apenas para conhecer o portal localmente. Produção: GitHub Pages.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('./docs/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml'};
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, {'Allow':'GET, HEAD'}).end();
    return;
  }
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(resolve(root) + sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    response.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('Arquivo não encontrado.');
  }
});
server.on('error', error => {
  console.error('Não foi possível abrir a prévia:', error.message);
  process.exitCode = 1;
});
server.listen(8080, '127.0.0.1', () => console.log('Abra http://127.0.0.1:8080 e clique em Abrir demonstração. Para encerrar: Ctrl+C.'));
