const db = require('../config/database');
const { characterSchema } = require('../utils/validation');
const { sanitizeInput } = require('../utils/helpers');

class CharacterController {
  // Получить всех персонажей пользователя
  async getMyCharacters(req, res) {
    try {
      const result = await db.query(
        `SELECT c.*, cam.name as campaign_name, cam.id as campaign_id 
         FROM characters c 
         LEFT JOIN campaign_members cm ON c.id = cm.character_id 
         LEFT JOIN campaigns cam ON cm.campaign_id = cam.id 
         WHERE c.user_id = $1 
         ORDER BY c.created_at DESC`,
        [req.session.userId]
      );
      
      res.json({ characters: result.rows });
    } catch (err) {
      console.error('Get characters error:', err);
      res.status(500).json({ error: 'Ошибка получения персонажей' });
    }
  }

  // Получить одного персонажа
  async getCharacter(req, res) {
    try {
      const { id } = req.params;
      
      const result = await db.query(
        `SELECT c.*, u.username as owner_name 
         FROM characters c 
         JOIN users u ON c.user_id = u.id 
         WHERE c.id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Персонаж не найден' });
      }
      
      const character = result.rows[0];
      
      // Проверка доступа (свой персонаж или DM)
      if (character.user_id !== req.session.userId && req.session.role !== 'dm') {
        return res.status(403).json({ error: 'Нет доступа' });
      }
      
      res.json({ character });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // Создать персонажа
  async createCharacter(req, res) {
    try {
      const data = characterSchema.parse(req.body);
      
      const result = await db.query(
        `INSERT INTO characters (
          user_id, name, race, class, background, alignment, level, experience,
          hp_current, hp_max, ac, speed, stats, inventory, spells, features, appearance, backstory
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
        RETURNING *`,
        [
          req.session.userId,
          sanitizeInput(data.name),
          data.race,
          data.class,
          data.background,
          data.alignment,
          data.level || 1,
          data.experience || 0,
          data.hp_current || 10,
          data.hp_max || 10,
          data.ac || 10,
          data.speed || 30,
          JSON.stringify(data.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
          JSON.stringify(data.inventory || []),
          JSON.stringify(data.spells || []),
          JSON.stringify(data.features || []),
          sanitizeInput(data.appearance),
          sanitizeInput(data.backstory)
        ]
      );
      
      res.status(201).json({ character: result.rows[0] });
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      console.error('Create character error:', err);
      res.status(500).json({ error: 'Ошибка создания персонажа' });
    }
  }

  // Обновить персонажа
  async updateCharacter(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Проверка владельца
      const check = await db.query(
        'SELECT user_id FROM characters WHERE id = $1',
        [id]
      );
      
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Персонаж не найден' });
      }
      
      if (check.rows[0].user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Нет прав на редактирование' });
      }
      
      // Формирование запроса обновления
      const allowedFields = ['name', 'race', 'class', 'level', 'hp_current', 'hp_max', 'stats', 'inventory', 'spells'];
      const setClauses = [];
      const values = [];
      let paramCount = 1;
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = $${paramCount}`);
          values.push(typeof value === 'object' ? JSON.stringify(value) : sanitizeInput(value));
          paramCount++;
        }
      }
      
      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'Нет данных для обновления' });
      }
      
      values.push(id);
      
      const result = await db.query(
        `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );
      
      res.json({ character: result.rows[0] });
    } catch (err) {
      console.error('Update character error:', err);
      res.status(500).json({ error: 'Ошибка обновления' });
    }
  }

  // Удалить персонажа
  async deleteCharacter(req, res) {
    try {
      const { id } = req.params;
      
      // Каскадное удаление настроено в БД
      const result = await db.query(
        'DELETE FROM characters WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.session.userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Персонаж не найден или нет прав' });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка удаления' });
    }
  }
}

module.exports = new CharacterController();