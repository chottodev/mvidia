const path = require('path');
const fs = require('fs');
const express = require('express');

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

module.exports = { mountSpa, isApiPath };
