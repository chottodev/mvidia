const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const cors = require('cors');
const openapi = require('express-openapi');
const {
  connect,
  migrateVideosWithoutStatus,
  User,
  Video,
  videoPaths,
  createLogger,
  refreshLogLevel,
} = require('db');
const handlersModule = require('./handlers');
const { bearerAuthSecurityHandler } = require('./authMiddleware');
const { mountSpa, resolveServeUi, resolveUiDist } = require('./serveUi');

function errorMiddleware(err, req, res, _next) {
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  const body = {
    message: err.message || 'Внутренняя ошибка',
  };
  if (err.errors) body.errors = err.errors;
  res.status(typeof status === 'number' ? status : 500).json(body);
}

async function main() {
  const rootDir = path.join(__dirname, '../../..');
  require('dotenv').config({ path: path.join(rootDir, '.env') });
  require('dotenv').config();
  refreshLogLevel();

  const log = createLogger('user');
  const port = parseInt(process.env.API_USER_PORT || '3001', 10);

  log.info('api-user: запуск', {
    port,
    logLevel: process.env.MVIDIA_LOG_LEVEL || 'info',
    redis: process.env.REDIS_URL ? 'configured' : 'missing',
  });

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mvidia';
  await connect(mongoUri);
  await migrateVideosWithoutStatus();
  log.info('api-user: MongoDB подключена');

  const uploadDirAbs = path.resolve(
    rootDir,
    (process.env.UPLOAD_DIR || 'uploads').replace(/^\.\//, '')
  );
  await fs.mkdir(uploadDirAbs, { recursive: true });
  await fs.mkdir(path.join(uploadDirAbs, videoPaths.SOURCES_SUBDIR), { recursive: true });
  await fs.mkdir(path.join(uploadDirAbs, videoPaths.POSTERS_SUBDIR), { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '32kb' }));

  const dependencies = { User, Video, uploadDirAbs };
  const multipartMw = handlersModule.createMultipartMiddleware(uploadDirAbs, dependencies);

  await openapi.initialize({
    app,
    apiDoc: require('./api-doc'),
    promiseMode: true,
    consumesMiddleware: {
      'multipart/form-data': multipartMw,
    },
    operations: handlersModule.operations,
    dependencies,
    securityHandlers: {
      bearerAuth: bearerAuthSecurityHandler(dependencies),
    },
    errorMiddleware,
  });

  const serveUi = resolveServeUi();
  const uiDist = resolveUiDist();
  if (serveUi && mountSpa(app, uiDist, dependencies)) {
    // eslint-disable-next-line no-console
    console.log(`[api-user] UI: ${uiDist}`);
  } else if (serveUi) {
    // eslint-disable-next-line no-console
    console.warn(`user UI не найден (${uiDist}), только API. Соберите: npm run build -w web`);
  }

  app.listen(port, () => {
    log.info('api-user: слушает', { url: `http://127.0.0.1:${port}` });
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
