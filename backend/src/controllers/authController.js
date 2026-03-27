const bcrypt = require('bcryptjs')
const db = require('../config/database');
const { registerSchema } = require('../utils/validation');
const { sanitizeInput } = require('../utils/helpers');

class AuthController {
  async register(req, res) {
    try {
      // Валидация
      const validated = registerSchema.parse(req.body);
      const { username, password, role } = validated;
      
      // Санитизация
      const cleanUsername = sanitizeInput(username);
      
      // Проверка существования
      const existing = await db.query(
        'SELECT id FROM users WHERE username = $1',
        [cleanUsername]
      );
      
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Пользователь уже существует' });
      }
      
      // Хеширование пароля (12 раундов)
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Создание пользователя
      const result = await db.query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
        [cleanUsername, hashedPassword, role]
      );
      
      const user = result.rows[0];
      
      // Создание сессии
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.username = user.username;
      
      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
      
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors[0].message });
      }
      console.error('Register error:', err);
      res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
  }

  async login(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Укажите логин и пароль' });
      }
      
      const result = await db.query(
        'SELECT id, username, password, role FROM users WHERE username = $1',
        [sanitizeInput(username)]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
      }
      
      const user = result.rows[0];
      
      // Проверка пароля
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
      }
      
      // Обновление last_login
      await db.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      // Создание сессии
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.username = user.username;
      
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
      
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
  }

  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при выходе' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  }

  async me(req, res) {
    try {
      const result = await db.query(
        'SELECT id, username, role, created_at FROM users WHERE id = $1',
        [req.session.userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      res.json({ user: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
}

module.exports = new AuthController();