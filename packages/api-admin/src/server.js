const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const cors = require('cors');
const openapi = require('express-openapi');
const { connect, Video } = require('db');
const handlersModule = require('./handlers');
const { mountSpa, resolveServeUi, resolveUiDist } = require('./serveUi');

function errorMiddleware(err, req, res, _next) {
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  const body = { message: err.message || 'Внутренняя ошибка' };
  if (err.errors) body.errors = err.errors;
  res.status(typeof status === 'number' ? status : 500).json(body);
}

// express-openapi securityHandlers: (req, scopes, definition) => Promise
function basicAuthSecurityHandler(req) {
  const header = req.headers.authorization || '';
  const m = /^Basic\s+(.+)$/i.exec(header);
  if (!m) {
    const err = new Error('Требуется авторизация');
    err.status = 401;
    return Promise.reject(err);
  }
  let decoded;
  try {
    decoded = Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    const err = new Error('Неверная авторизация');
    err.status = 401;
    return Promise.reject(err);
  }
  const sep = decoded.indexOf(':');
  const user = sep >= 0 ? decoded.slice(0, sep) : '';
  const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
  const okUser = process.env.ADMIN_USERNAME || 'admin';
  const okPass = process.env.ADMIN_PASSWORD || '';
  if (!okPass || user !== okUser || pass !== okPass) {
    const err = new Error('Неверный логин или пароль');
    err.status = 401;
    return Promise.reject(err);
  }
  return Promise.resolve({});
}

async function main() {
  const rootDir = path.join(__dirname, '../../..');
  require('dotenv').config({ path: path.join(rootDir, '.env') });
  require('dotenv').config();

  if (!(process.env.ADMIN_PASSWORD && String(process.env.ADMIN_PASSWORD).length > 0)) {
    // eslint-disable-next-line no-console
    console.warn('api-admin: ADMIN_PASSWORD не задан в .env — используйте .env.example');
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mvidia';
  await connect(mongoUri);

  const uploadDirAbs = path.resolve(
    rootDir,
    (process.env.UPLOAD_DIR || 'uploads').replace(/^\.\//, '')
  );
  await fs.mkdir(uploadDirAbs, { recursive: true });

  const app = express();
  app.disable('x-powered-by');

  const serveUi = resolveServeUi();
  if (!serveUi) {
    const adminOrigin = process.env.ADMIN_CORS_ORIGIN || 'http://localhost:5174';
    app.use(cors({ origin: adminOrigin }));
  }

  await openapi.initialize({
    app,
    apiDoc: require('./api-doc'),
    promiseMode: true,
    operations: handlersModule.operations,
    dependencies: { Video, uploadDirAbs },
    securityHandlers: {
      basicAuth: basicAuthSecurityHandler,
    },
    errorMiddleware,
  });

  const uiDist = resolveUiDist(rootDir);
  if (serveUi && mountSpa(app, uiDist)) {
    // eslint-disable-next-line no-console
    console.log(`[api-admin] UI: ${uiDist}`);
  } else if (serveUi) {
    // eslint-disable-next-line no-console
    console.warn(`admin UI не найден (${uiDist}), только API. Соберите: npm run build -w web-admin`);
  }

  const port = parseInt(process.env.API_ADMIN_PORT || '3002', 10);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mvidia admin (API + UI) http://127.0.0.1:${port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
