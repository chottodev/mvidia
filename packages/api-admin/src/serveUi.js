const path = require('path');
const fs = require('fs');
const express = require('express');

const WEB_PACKAGE = 'web-admin';

function resolveServeUi() {
  return process.env.SERVE_UI !== '0' && process.env.SERVE_UI !== 'false';
}

function resolveUiDist(rootDir) {
  if (process.env.UI_DIST_PATH) {
    return process.env.UI_DIST_PATH;
  }
  return path.join(rootDir, 'packages', WEB_PACKAGE, 'dist');
}

const API_PATH_PREFIXES = ['/videos', '/api-docs'];

function isApiPath(urlPath) {
  return API_PATH_PREFIXES.some((p) => urlPath === p || urlPath.startsWith(`${p}/`));
}

function mountSpa(app, distDir) {
  const resolved = path.resolve(distDir);
  if (!fs.existsSync(resolved)) {
    return false;
  }
  const indexHtml = path.join(resolved, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    return false;
  }

  app.use(express.static(resolved, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isApiPath(req.path)) return next();
    if (req.path.includes('.')) return next();
    res.sendFile(indexHtml);
  });

  return true;
}

module.exports = { mountSpa, isApiPath, resolveServeUi, resolveUiDist };
