const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток, попробуйте через 15 минут' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Слишком много запросов' },
  standardHeaders: true,
  legacyHeaders: false
});

const socketLimiter = new Map();
const SOCKET_RATE_LIMIT = 50;
const SOCKET_WINDOW_MS = 60000;

const checkSocketRateLimit = (userId) => {
  const now = Date.now();
  const userLimit = socketLimiter.get(userId) || { count: 0, resetTime: now + SOCKET_WINDOW_MS };
  
  if (now > userLimit.resetTime) {
    userLimit.count = 1;
    userLimit.resetTime = now + SOCKET_WINDOW_MS;
  } else {
    userLimit.count++;
  }
  
  socketLimiter.set(userId, userLimit);
  return userLimit.count <= SOCKET_RATE_LIMIT;
};

module.exports = { authLimiter, apiLimiter, checkSocketRateLimit };