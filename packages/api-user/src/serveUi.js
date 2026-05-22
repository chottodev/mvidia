const path = require('path');
const fs = require('fs');
const express = require('express');

/** Статика UI в Docker-образе (см. Dockerfile) */
const DOCKER_UI_DIST = '/app/ui';

/** По умолчанию UI включён; отключить: SERVE_UI=0 */
function resolveServeUi() {
  return process.env.SERVE_UI !== '0' && process.env.SERVE_UI !== 'false';
}

/** Docker: /app/ui; локально: packages/<webPackage>/dist */
function resolveUiDist(rootDir, webPackage) {
  if (process.env.UI_DIST_PATH) {
    return process.env.UI_DIST_PATH;
  }
  const dockerIndex = path.join(DOCKER_UI_DIST, 'index.html');
  if (fs.existsSync(dockerIndex)) {
    return DOCKER_UI_DIST;
  }
  return path.join(rootDir, 'packages', webPackage, 'dist');
}

/** Пути API — не отдаём index.html для них */
const API_PATH_PREFIXES = ['/videos', '/api-docs'];

function isApiPath(urlPath) {
  return API_PATH_PREFIXES.some((p) => urlPath === p || urlPath.startsWith(`${p}/`));
}

/**
 * Раздача собранного Vue (SPA) с того же хоста, что и API.
 * @param {import('express').Express} app
 * @param {string} distDir абсолютный путь к dist
 * @returns {boolean}
 */
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
