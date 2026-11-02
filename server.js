'use strict';
// Часовой пояс колледжа — определяет, какой день считается «сегодня» в дневнике и расписании.
process.env.TZ = process.env.TZ || 'Asia/Almaty';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { get } = require('./src/db');
const api = require('./src/api');
const { purgeExpired } = require('./src/auth');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');

// Первый запуск — наполняем базу демо-данными (отключается SEED=0)
if (process.env.SEED !== '0' && !get('SELECT 1 FROM users LIMIT 1')) {
  require('./src/seed').seed();
  console.log('База пуста — загружены демо-данные (логины: student / teacher / admin).');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const PAGES = { '/': 'index.html', '/cabinet': 'cabinet.html', '/cabinet/': 'cabinet.html' };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function serveStatic(req, res, pathname) {
  let rel = PAGES[pathname] || pathname.slice(1);
  let file = path.resolve(PUBLIC, decodeURIComponent(rel));
  if (!file.startsWith(PUBLIC + path.sep)) file = null; // защита от ../
  fs.stat(file || '', (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
      return fs.createReadStream(path.join(PUBLIC, '404.html')).pipe(res);
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname.startsWith('/api/')) return api.handle(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  try {
    serveStatic(req, res, url.pathname);
  } catch {
    res.writeHead(400).end();
  }
});

setInterval(purgeExpired, 60 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Polytech Navigator: http://localhost:${PORT}`));
}

module.exports = server;
