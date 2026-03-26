const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { authLimiter } = require('../middleware/rateLimiter');
const { sanitizeInput } = require('../middleware/validation');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// ✅ РЕГИСТРАЦИЯ — только логин, пароль, роль
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password, role } = sanitizeInput(req.body);
    
    // Валидация логина
    if (!username || username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Логин должен быть от 3 до 50 символов' });
    }
    
    // Валидация пароля
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 8 символов' });
    }
    
    // Роль
    const userRole = role === 'dm' ? 'dm' : 'player';
    
    // Хеширование
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    
    // ✅ Создаём пользователя БЕЗ email
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, username, role, created_at`,
      [userId, username, null, passwordHash, userRole]  // email = null
    );
    
    // Сессия
    req.session.userId = result.rows[0].id;
    req.session.role = result.rows[0].role;
    req.session.username = result.rows[0].username;
    
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
    
    res.status(201).json({ 
      message: 'Регистрация успешна', 
      user: result.rows[0] 
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ ВХОД — по логину (email не нужен)
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = sanitizeInput(req.body);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',  // ✅ Только по логину
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    
    res.json({ 
      message: 'Вход успешен', 
      user: { id: user.id, username: user.username, role: user.role } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Выход
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Ошибка выхода' });
    res.json({ message: 'Выход успешен' });
  });
});

// Проверка сессии
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role
    }
  });
});

module.exports = router;