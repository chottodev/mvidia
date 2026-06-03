const LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel() {
  const raw = (process.env.MVIDIA_LOG_LEVEL || 'info').toLowerCase();
  return LEVEL_RANK[raw] ?? LEVEL_RANK.info;
}

let minLevel = resolveMinLevel();

function refreshLogLevel() {
  minLevel = resolveMinLevel();
}

/**
 * @param {string} scope — user | queue | worker | transcode | …
 */
function createLogger(scope) {
  function write(level, message, fields) {
    const rank = LEVEL_RANK[level] ?? LEVEL_RANK.info;
    if (rank < minLevel) return;

    const payload = {
      ts: new Date().toISOString(),
      level,
      scope,
      msg: message,
      ...(fields && typeof fields === 'object' ? fields : {}),
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(line);
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}

module.exports = { createLogger, refreshLogLevel };
