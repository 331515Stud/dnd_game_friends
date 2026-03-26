const express = require('express');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { sanitizeInput, validateAndProcessCharacter, calculateModifier } = require('../middleware/validation');

const router = express.Router();
router.use(requireAuth);

// ============================================================================
// 📋 GET /api/characters — Получить всех персонажей пользователя
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, race, class, background, alignment, level, xp, 
              hp_current, hp_max, ac, speed, str, dex, con, int, wis, cha,
              created_at, updated_at
       FROM characters 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.session.userId]
    );
    
    // Добавляем вычисляемые модификаторы на лету
    const characters = result.rows.map(char => ({
      ...char,
      str_mod: calculateModifier(char.str),
      dex_mod: calculateModifier(char.dex),
      con_mod: calculateModifier(char.con),
      int_mod: calculateModifier(char.int),
      wis_mod: calculateModifier(char.wis),
      cha_mod: calculateModifier(char.cha)
    }));
    
    res.json({ characters });
  } catch (err) {
    console.error('Get characters error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================================================
// ✨ POST /api/characters — Создать нового персонажа
// ============================================================================
router.post('/', async (req, res) => {
  try {
    const data = sanitizeInput(req.body);
    const validation = validateAndProcessCharacter(data);
    
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }
    
    const c = validation.processed;
    
    const result = await pool.query(
      `INSERT INTO characters 
       (user_id, name, race, class, background, alignment, level, xp, 
        hp_current, hp_max, ac, speed, str, dex, con, int, wis, cha,
        inventory, abilities, spells, features, appearance, backstory)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [req.session.userId, 
       c.name, c.race, c.class, c.background, c.alignment,
       c.level || 1, c.xp || 0, 
       c.hp_current || 1, c.hp_max || 1, 
       c.ac || 10, c.speed || 30,
       c.str || 10, c.dex || 10, c.con || 10, 
       c.int || 10, c.wis || 10, c.cha || 10,
       JSON.stringify(c.inventory || []),
       JSON.stringify(c.abilities || []),
       JSON.stringify(c.spells || []),
       JSON.stringify(c.features || []),
       c.appearance, c.backstory]
    );
    
    // Добавляем модификаторы в ответ
    const character = {
      ...result.rows[0],
      str_mod: calculateModifier(result.rows[0].str),
      dex_mod: calculateModifier(result.rows[0].dex),
      con_mod: calculateModifier(result.rows[0].con),
      int_mod: calculateModifier(result.rows[0].int),
      wis_mod: calculateModifier(result.rows[0].wis),
      cha_mod: calculateModifier(result.rows[0].cha)
    };
    
    res.status(201).json({ character });
  } catch (err) {
    console.error('Create character error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================================================
// 🔍 GET /api/characters/:id — Получить персонажа по ID
// ============================================================================
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM characters 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    const character = {
      ...result.rows[0],
      str_mod: calculateModifier(result.rows[0].str),
      dex_mod: calculateModifier(result.rows[0].dex),
      con_mod: calculateModifier(result.rows[0].con),
      int_mod: calculateModifier(result.rows[0].int),
      wis_mod: calculateModifier(result.rows[0].wis),
      cha_mod: calculateModifier(result.rows[0].cha)
    };
    
    res.json({ character });
  } catch (err) {
    console.error('Get character error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================================================
// ✏️ PUT /api/characters/:id — Обновить персонажа
// ============================================================================
router.put('/:id', async (req, res) => {
  try {
    // Проверяем, что персонаж принадлежит пользователю
    const check = await pool.query(
      'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    const data = sanitizeInput(req.body);
    const validation = validateAndProcessCharacter(data);
    
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }
    
    const c = validation.processed;
    
    const result = await pool.query(
      `UPDATE characters SET
       name = COALESCE($1, name),
       race = COALESCE($2, race),
       class = COALESCE($3, class),
       background = COALESCE($4, background),
       alignment = COALESCE($5, alignment),
       level = COALESCE($6, level),
       xp = COALESCE($7, xp),
       hp_current = COALESCE($8, hp_current),
       hp_max = COALESCE($9, hp_max),
       ac = COALESCE($10, ac),
       speed = COALESCE($11, speed),
       str = COALESCE($12, str),
       dex = COALESCE($13, dex),
       con = COALESCE($14, con),
       int = COALESCE($15, int),
       wis = COALESCE($16, wis),
       cha = COALESCE($17, cha),
       inventory = COALESCE($18, inventory),
       abilities = COALESCE($19, abilities),
       spells = COALESCE($20, spells),
       features = COALESCE($21, features),
       appearance = COALESCE($22, appearance),
       backstory = COALESCE($23, backstory)
       WHERE id = $24 AND user_id = $25
       RETURNING *`,
      [c.name, c.race, c.class, c.background, c.alignment,
       c.level, c.xp, c.hp_current, c.hp_max, c.ac, c.speed,
       c.str, c.dex, c.con, c.int, c.wis, c.cha,
       JSON.stringify(c.inventory),
       JSON.stringify(c.abilities),
       JSON.stringify(c.spells),
       JSON.stringify(c.features),
       c.appearance, c.backstory,
       req.params.id, req.session.userId]
    );
    
    const character = {
      ...result.rows[0],
      str_mod: calculateModifier(result.rows[0].str),
      dex_mod: calculateModifier(result.rows[0].dex),
      con_mod: calculateModifier(result.rows[0].con),
      int_mod: calculateModifier(result.rows[0].int),
      wis_mod: calculateModifier(result.rows[0].wis),
      cha_mod: calculateModifier(result.rows[0].cha)
    };
    
    res.json({ character });
  } catch (err) {
    console.error('Update character error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================================================
// 🗑️ DELETE /api/characters/:id — Удалить персонажа
// ============================================================================
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM characters WHERE id = $1 AND user_id = $2 RETURNING id, name',
      [req.params.id, req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    res.json({ 
      message: `Персонаж "${result.rows[0].name}" удалён`,
      characterId: result.rows[0].id 
    });
  } catch (err) {
    console.error('Delete character error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================================================
// ⚡ Быстрые действия с персонажем
// ============================================================================

// Обновить только HP
router.patch('/:id/hp', async (req, res) => {
  try {
    const { hp_current, hp_max } = sanitizeInput(req.body);
    
    if (hp_current !== undefined && hp_current < 0) {
      return res.status(400).json({ error: 'HP не может быть отрицательным' });
    }
    
    const result = await pool.query(
      `UPDATE characters SET 
       hp_current = COALESCE($1, hp_current),
       hp_max = COALESCE($2, hp_max)
       WHERE id = $3 AND user_id = $4
       RETURNING hp_current, hp_max`,
      [hp_current, hp_max, req.params.id, req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    res.json({ hp: result.rows[0] });
  } catch (err) {
    console.error('Update HP error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Добавить предмет в инвентарь
router.post('/:id/inventory', async (req, res) => {
  try {
    const { item } = sanitizeInput(req.body);
    
    if (!item || !item.name) {
      return res.status(400).json({ error: 'Укажите название предмета' });
    }
    
    // Получаем текущий инвентарь
    const char = await pool.query(
      'SELECT inventory FROM characters WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    
    if (char.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    const inventory = char.rows[0].inventory || [];
    inventory.push({
      id: Date.now().toString(36),
      ...item,
      added_at: new Date().toISOString()
    });
    
    const result = await pool.query(
      'UPDATE characters SET inventory = $1 WHERE id = $2 RETURNING inventory',
      [JSON.stringify(inventory), req.params.id]
    );
    
    res.json({ inventory: result.rows[0].inventory });
  } catch (err) {
    console.error('Add inventory item error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить предмет из инвентаря
router.delete('/:id/inventory/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const char = await pool.query(
      'SELECT inventory FROM characters WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    
    if (char.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    const inventory = (char.rows[0].inventory || []).filter(i => i.id !== itemId);
    
    await pool.query(
      'UPDATE characters SET inventory = $1 WHERE id = $2',
      [JSON.stringify(inventory), req.params.id]
    );
    
    res.json({ message: 'Предмет удалён', inventory });
  } catch (err) {
    console.error('Remove inventory item error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить статистику персонажа (бонусы, спасброски, навыки)
router.get('/:id/stats', async (req, res) => {
  try {
    const char = await pool.query(
      'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    
    if (char.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    const c = char.rows[0];
    const stats = {
      abilities: {
        str: { score: c.str, mod: calculateModifier(c.str) },
        dex: { score: c.dex, mod: calculateModifier(c.dex) },
        con: { score: c.con, mod: calculateModifier(c.con) },
        int: { score: c.int, mod: calculateModifier(c.int) },
        wis: { score: c.wis, mod: calculateModifier(c.wis) },
        cha: { score: c.cha, mod: calculateModifier(c.cha) }
      },
      saves: {
        str: calculateModifier(c.str),
        dex: calculateModifier(c.dex),
        con: calculateModifier(c.con),
        int: calculateModifier(c.int),
        wis: calculateModifier(c.wis),
        cha: calculateModifier(c.cha)
      },
      skills: {},
      passive: {
        perception: 10 + calculateModifier(c.wis),
        insight: 10 + calculateModifier(c.wis),
        investigation: 10 + calculateModifier(c.int)
      },
      combat: {
        ac: c.ac,
        speed: c.speed,
        initiative: calculateModifier(c.dex),
        hp: { current: c.hp_current, max: c.hp_max }
      }
    };
    
    // Добавляем бонусы профессий из abilities
    if (Array.isArray(c.abilities)) {
      c.abilities.forEach(ability => {
        if (ability.proficient) {
          const pb = Math.floor((c.level - 1) / 4) + 2; // proficiency bonus
          const baseMod = ability.ability_check ? calculateModifier(c[ability.ability_check]) : 0;
          stats.skills[ability.name] = baseMod + pb;
        }
      });
    }
    
    res.json({ stats });
  } catch (err) {
    console.error('Get character stats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;