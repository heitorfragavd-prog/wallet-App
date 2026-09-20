const http = require('http');
const fs = require('fs');
const path = require('path');

function createSpaServer(staticDir, port, label) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
  };

  const server = http.createServer((req, res) => {
    let cleanUrl = req.url.split('?')[0];
    let filePath = path.join(staticDir, cleanUrl);

    // Se o arquivo existir e for arquivo regular, serve diretamente
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Caso contrário, fallback SPA para index.html
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      return fs.createReadStream(indexPath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`[DUAL-SERVER] ${label} rodando em http://localhost:${port} -> ${staticDir}`);
  });

  return server;
}

const legacyDir = path.resolve(__dirname, '../dist-legacy');
const newDir = path.resolve(__dirname, '../dist');

const s1 = createSpaServer(legacyDir, 4173, 'LEGACY_BUILD (SHA 8ae7c04)');
const s2 = createSpaServer(newDir, 4174, 'NEW_BUILD (HARDENED)');

// Mantém o processo ativo
process.on('SIGINT', () => {
  s1.close();
  s2.close();
  process.exit(0);
});
