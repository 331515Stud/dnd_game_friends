const express = require('express');
const { pool } = require('../config/database');
const { requireAuth, requireDM } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/validation');

const router = express.Router();
router.use(requireAuth);

// 📋 Получить все сессии кампании
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Проверка доступа
    const access = await pool.query(
      `SELECT 1 FROM campaigns c
       LEFT JOIN campaign_members cm ON c.id = cm.campaign_id
       LEFT JOIN characters ch ON cm.character_id = ch.id
       WHERE c.id = $1 AND (c.dm_id = $2 OR ch.user_id = $2)`,
      [campaignId, req.session.userId]
    );
    
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к кампании' });
    }
    
    const sessions = await pool.query(
      `SELECT gs.*, 
              ARRAY_AGG(sp.character_id) FILTER (WHERE sp.character_id IS NOT NULL) as participants
       FROM game_sessions gs
       LEFT JOIN session_participants sp ON gs.id = sp.session_id
       WHERE gs.campaign_id = $1
       GROUP BY gs.id
       ORDER BY gs.session_number DESC`,
      [campaignId]
    );
    
    res.json({ sessions: sessions.rows });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✨ Создать новую сессию (только DM)
router.post('/', requireDM, async (req, res) => {
  try {
    const { campaign_id, title, description, session_number, participants } = sanitizeInput(req.body);
    
    if (!campaign_id || !title) {
      return res.status(400).json({ error: 'Укажите campaign_id и название сессии' });
    }
    
    // Проверка, что кампания принадлежит этому DM
    const campaign = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND dm_id = $2',
      [campaign_id, req.session.userId]
    );
    
    if (campaign.rows.length === 0) {
      return res.status(403).json({ error: 'Нет прав для создания сессии в этой кампании' });
    }
    
    const result = await pool.query(
      `INSERT INTO game_sessions 
       (campaign_id, dm_id, title, description, session_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [campaign_id, req.session.userId, title, description, session_number || 1]
    );
    
    // Добавляем участников, если указаны
    if (Array.isArray(participants) && participants.length > 0) {
      for (const characterId of participants) {
        await pool.query(
          `INSERT INTO session_participants (session_id, character_id)
           VALUES ($1, $2)
           ON CONFLICT (session_id, character_id) DO NOTHING`,
          [result.rows[0].id, characterId]
        );
      }
    }
    
    res.status(201).json({ session: result.rows[0] });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 📝 Обновить сессию (только DM)
router.put('/:id', requireDM, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, ended_at, xp_awarded, loot_notes, dm_notes } = sanitizeInput(req.body);
    
    // Проверка прав
    const session = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1 AND dm_id = $2',
      [id, req.session.userId]
    );
    
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    const result = await pool.query(
      `UPDATE game_sessions SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       ended_at = COALESCE($3, ended_at),
       xp_awarded = COALESCE($4, xp_awarded),
       loot_notes = COALESCE($5, loot_notes),
       dm_notes = COALESCE($6, dm_notes)
       WHERE id = $7
       RETURNING *`,
      [title, description, ended_at, xp_awarded, loot_notes, dm_notes, id]
    );
    
    res.json({ session: result.rows[0] });
  } catch (err) {
    console.error('Update session error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 👥 Управление участниками сессии
router.post('/:id/participants', requireDM, async (req, res) => {
  try {
    const { id } = req.params;
    const { character_id, xp_earned, notes, attended } = sanitizeInput(req.body);
    
    if (!character_id) {
      return res.status(400).json({ error: 'Укажите character_id' });
    }
    
    // Проверка, что сессия принадлежит этому DM
    const session = await pool.query(
      'SELECT 1 FROM game_sessions WHERE id = $1 AND dm_id = $2',
      [id, req.session.userId]
    );
    
    if (session.rows.length === 0) {
      return res.status(403).json({ error: 'Нет прав' });
    }
    
    const result = await pool.query(
      `INSERT INTO session_participants 
       (session_id, character_id, xp_earned, notes, attended)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, character_id) 
       DO UPDATE SET 
         xp_earned = EXCLUDED.xp_earned,
         notes = EXCLUDED.notes,
         attended = EXCLUDED.attended
       RETURNING *`,
      [id, character_id, xp_earned || 0, notes, attended !== false]
    );
    
    res.json({ participant: result.rows[0] });
  } catch (err) {
    console.error('Add participant error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 📊 Получить детали сессии
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await pool.query(
      `SELECT gs.*, c.name as campaign_name, u.username as dm_name
       FROM game_sessions gs
       JOIN campaigns c ON gs.campaign_id = c.id
       JOIN users u ON gs.dm_id = u.id
       WHERE gs.id = $1`,
      [id]
    );
    
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    const participants = await pool.query(
      `SELECT sp.*, ch.name as character_name, ch.user_id
       FROM session_participants sp
       JOIN characters ch ON sp.character_id = ch.id
       WHERE sp.session_id = $1`,
      [id]
    );
    
    res.json({ 
      session: session.rows[0], 
      participants: participants.rows 
    });
  } catch (err) {
    console.error('Get session details error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🗑️ Удалить сессию (только DM)
router.delete('/:id', requireDM, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM game_sessions WHERE id = $1 AND dm_id = $2 RETURNING id',
      [req.params.id, req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    res.json({ message: 'Сессия удалена' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;