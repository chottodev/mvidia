const { verifyToken } = require('./jwt');

function parseBearer(req) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  return m ? m[1] : null;
}

async function loadUserById(User, userId) {
  return User.findById(userId).lean();
}

async function attachOptionalUser(req, dependencies) {
  const { User } = dependencies;
  req.mvidiaUser = null;
  const token = parseBearer(req);
  if (!token) return;
  const userId = verifyToken(token);
  if (!userId) return;
  const user = await loadUserById(User, userId);
  if (user) req.mvidiaUser = user;
}

function optionalAuth(dependencies) {
  return async function optionalAuthMw(req, res, next) {
    try {
      await attachOptionalUser(req, dependencies);
      next();
    } catch (e) {
      next(e);
    }
  };
}

function requireAuth(dependencies) {
  return async function requireAuthMw(req, res, next) {
    try {
      await attachOptionalUser(req, dependencies);
      if (!req.mvidiaUser) {
        return res.status(401).json({ message: 'Требуется авторизация' });
      }
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/** Для express-openapi securityHandlers */
function bearerAuthSecurityHandler(dependencies) {
  return function bearerAuthHandler(req) {
    return attachOptionalUser(req, dependencies).then(() => {
      if (!req.mvidiaUser) {
        const err = new Error('Требуется авторизация');
        err.status = 401;
        return Promise.reject(err);
      }
      return {};
    });
  };
}

module.exports = {
  parseBearer,
  attachOptionalUser,
  optionalAuth,
  requireAuth,
  bearerAuthSecurityHandler,
};
