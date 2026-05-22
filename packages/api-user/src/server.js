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

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mvidia';
  await connect(mongoUri);

  const uploadDirAbs = path.resolve(
    rootDir,
    (process.env.UPLOAD_DIR || 'uploads').replace(/^\.\//, '')
  );
  await fs.mkdir(uploadDirAbs, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: '*' }));

  const multipartMw = handlersModule.createMultipartMiddleware(uploadDirAbs);

  await openapi.initialize({
    app,
    apiDoc: require('./api-doc'),
    promiseMode: true,
    consumesMiddleware: {
      'multipart/form-data': multipartMw,
    },
    operations: handlersModule.operations,
    dependencies: { Video, uploadDirAbs },
    errorMiddleware,
  });

  const serveUi = resolveServeUi();
  const uiDist = resolveUiDist(rootDir, 'web');
  if (serveUi && mountSpa(app, uiDist)) {
    // eslint-disable-next-line no-console
    console.log(`user UI: ${uiDist}`);
  } else if (serveUi) {
    // eslint-disable-next-line no-console
    console.warn(`user UI не найден (${uiDist}), только API. Соберите: npm run build -w web`);
  }

  const port = parseInt(process.env.PORT || process.env.API_USER_PORT || '3001', 10);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mvidia user (API + UI) http://127.0.0.1:${port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
