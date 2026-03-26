const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const db = require('../config/database');

// Rate limiting для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // 5 попыток
  message: { error: 'Слишком много попыток. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Проверка аутентификации
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
};

// Проверка роли DM
const requireDM = (req, res, next) => {
  if (req.session.role !== 'dm') {
    return res.status(403).json({ error: 'Требуется роль Мастера' });
  }
  next();
};

// Проверка владельца ресурса
const requireOwnership = (table, column = 'user_id') => {
  return async (req, res, next) => {
    const resourceId = req.params.id;
    const userId = req.session.userId;
    
    try {
      const result = await db.query(
        `SELECT ${column} FROM ${table} WHERE id = $1`,
        [resourceId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ресурс не найден' });
      }
      
      if (result.rows[0][column] !== userId && req.session.role !== 'dm') {
        return res.status(403).json({ error: 'Нет доступа к ресурсу' });
      }
      
      next();
    } catch (err) {
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

module.exports = {
  authLimiter,
  requireAuth,
  requireDM,
  requireOwnership
};