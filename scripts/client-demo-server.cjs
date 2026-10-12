const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');

const crmRoot = path.resolve(__dirname, '..');
const crmRequire = createRequire(path.join(crmRoot, 'crm-backend/package.json'));
const origin = process.argv[2];
const parsedOrigin = new URL(origin);
if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin ||
    !parsedOrigin.hostname.endsWith('.devtunnels.ms') ||
    parsedOrigin.username || parsedOrigin.password || parsedOrigin.port) {
  throw new Error('Use the exact HTTPS origin returned by the demo forwarder.');
}

crmRequire('dotenv').config({ path: path.join(crmRoot, 'crm-backend/.env') });
process.env.NODE_ENV = 'production';
process.env.APP_ORIGIN = origin;
process.env.PORT = '4001';

const app = crmRequire('./src/app.js');
const prisma = crmRequire('./src/config/prisma.js');
const server = http.createServer((req, res) => {
  // The relay rewrites its own Origin to localhost. Restore only that exact
  // same-origin rewrite; all other requests retain normal CRM protection.
  if (req.socket.remoteAddress === '127.0.0.1' &&
      req.headers['x-forwarded-host'] === parsedOrigin.host &&
      req.headers['x-forwarded-proto'] === 'https' &&
      req.headers['sec-fetch-site'] === 'same-origin' &&
      req.headers.origin === 'http://localhost:4001') {
    req.headers.origin = origin;
  }
  app(req, res);
});

const close = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000).unref();
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
server.on('error', () => {
  console.error('The demo could not listen on local port 4001.');
  process.exit(1);
});

(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    server.listen(4001, '127.0.0.1', () => {
      console.log(`CRM demo backend ready: ${origin}`);
    });
  } catch {
    console.error('The CRM database is unavailable. Check that PostgreSQL is running.');
    await prisma.$disconnect();
    process.exit(1);
  }
})();
