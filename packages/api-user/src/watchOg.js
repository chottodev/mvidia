const fs = require('fs');
const path = require('path');

const PUBLIC_ID_PATTERN = /^[0-9A-Za-z]{20}$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolvePublicSiteUrl(req) {
  const fromEnv = process.env.USER_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = req.get('host');
  if (!host) return '';
  const proto = req.protocol || 'http';
  return `${proto}://${host}`;
}

function buildOgMetaTags({ title, pageUrl, imageUrl }) {
  const lines = [
    '<meta property="og:type" content="video.other" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
  ];
  if (imageUrl) {
    lines.push(`<meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
    lines.push(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`);
  }
  return lines.join('\n    ');
}

function injectOgIntoIndexHtml(indexHtml, { documentTitle, ogMeta }) {
  let html = indexHtml;
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeHtml(documentTitle)}</title>`
  );
  html = html.replace('</head>', `    ${ogMeta}\n  </head>`);
  return html;
}

function mountWatchOg(app, { Video, uploadDirAbs, indexHtmlPath, posterExists }) {
  if (!Video || !indexHtmlPath || !fs.existsSync(indexHtmlPath)) {
    return false;
  }

  const indexTemplate = fs.readFileSync(indexHtmlPath, 'utf8');

  app.get('/v/:publicId', async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const { publicId } = req.params;
    if (!PUBLIC_ID_PATTERN.test(publicId)) return next();
    let doc;
    try {
      doc = await Video.findOne({ publicId }).lean();
    } catch (e) {
      return next(e);
    }

    if (!doc) {
      res.status(404).type('text/plain; charset=utf-8').send('Видео не найдено');
      return undefined;
    }

    const siteBase = resolvePublicSiteUrl(req);
    const pageUrl = `${siteBase}/v/${publicId}`;
    let imageUrl = '';
    if (siteBase && (await posterExists(uploadDirAbs, doc.storageFileName))) {
      imageUrl = `${siteBase}/videos/${encodeURIComponent(publicId)}/poster`;
    }

    const ogMeta = buildOgMetaTags({
      title: doc.title,
      pageUrl,
      imageUrl: imageUrl || undefined,
    });
    const html = injectOgIntoIndexHtml(indexTemplate, {
      documentTitle: `${doc.title} — mvidia`,
      ogMeta,
    });

    res.status(200).type('text/html; charset=utf-8');
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
      return res.end();
    }
    return res.send(html);
  });

  return true;
}

module.exports = {
  PUBLIC_ID_PATTERN,
  mountWatchOg,
  escapeHtml,
  resolvePublicSiteUrl,
};
