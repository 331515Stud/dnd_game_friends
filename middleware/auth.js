const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('../config/database');

const sessionMiddleware = session({
  store: new PgSession({ pool }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
});

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
};

const requireDM = (req, res, next) => {
  if (!req.session || !req.session.userId || req.session.role !== 'dm') {
    return res.status(403).json({ error: 'Требуется роль Dungeon Master' });
  }
  next();
};

const wrapMiddleware = (middleware) => (socket, next) => {
  middleware(socket.request, {}, next);
};

module.exports = { sessionMiddleware, requireAuth, requireDM, wrapMiddleware };