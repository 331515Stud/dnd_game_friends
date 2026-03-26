const express = require('express');
const { pool } = require('../config/database');
const { requireAuth, requireDM } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/validation');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const generateAccessCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    let campaigns;
    if (req.session.role === 'dm') {
      campaigns = await pool.query(
        'SELECT * FROM campaigns WHERE dm_id = $1 ORDER BY created_at DESC',
        [req.session.userId]
      );
    } else {
      campaigns = await pool.query(
        `SELECT c.* FROM campaigns c
         JOIN campaign_members cm ON c.id = cm.campaign_id
         JOIN characters ch ON cm.character_id = ch.id
         WHERE ch.user_id = $1 AND c.is_active = true
         ORDER BY c.created_at DESC`,
        [req.session.userId]
      );
    }
    res.json({ campaigns: campaigns.rows });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/', requireDM, async (req, res) => {
  try {
    const { name, description, player_limit, map_data, grid_size } = sanitizeInput(req.body);
    
    if (!name || name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Название кампании от 1 до 100 символов' });
    }
    
    const limit = player_limit ? Math.min(Math.max(player_limit, 2), 10) : 5;
    const gridSize = grid_size ? Math.min(Math.max(grid_size, 20), 200) : 50;
    let accessCode = generateAccessCode();
    
    let codeExists = await pool.query('SELECT 1 FROM campaigns WHERE access_code = $1', [accessCode]);
    while (codeExists.rows.length > 0) {
      accessCode = generateAccessCode();
      codeExists = await pool.query('SELECT 1 FROM campaigns WHERE access_code = $1', [accessCode]);
    }
    
    const campaignId = uuidv4();
    const result = await pool.query(
      `INSERT INTO campaigns 
       (id, dm_id, name, description, access_code, player_limit, map_data, grid_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [campaignId, req.session.userId, name, description, accessCode, limit, map_data, gridSize]
    );
    
    res.status(201).json({ campaign: result.rows[0] });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { access_code, character_id } = sanitizeInput(req.body);
    
    if (!access_code || access_code.length !== 6) {
      return res.status(400).json({ error: 'Некорректный код доступа' });
    }
    
    const campaign = await pool.query(
      'SELECT * FROM campaigns WHERE access_code = $1 AND is_active = true',
      [access_code.toUpperCase()]
    );
    
    if (campaign.rows.length === 0) {
      return res.status(404).json({ error: 'Кампания не найдена или неактивна' });
    }
    
    const character = await pool.query(
      'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
      [character_id, req.session.userId]
    );
    
    if (character.rows.length === 0) {
      return res.status(404).json({ error: 'Персонаж не найден' });
    }
    
    const memberCount = await pool.query(
      'SELECT COUNT(*) FROM campaign_members WHERE campaign_id = $1',
      [campaign.rows[0].id]
    );
    
    if (parseInt(memberCount.rows[0].count) >= campaign.rows[0].player_limit) {
      return res.status(400).json({ error: 'В кампании нет свободных мест' });
    }
    
    const existing = await pool.query(
      'SELECT 1 FROM campaign_members WHERE campaign_id = $1 AND character_id = $2',
      [campaign.rows[0].id, character_id]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Вы уже участвуете в этой кампании' });
    }
    
    await pool.query(
      'INSERT INTO campaign_members (campaign_id, character_id) VALUES ($1, $2)',
      [campaign.rows[0].id, character_id]
    );
    
    res.json({ 
      message: 'Вы присоединились к кампании',
      campaign: campaign.rows[0]
    });
  } catch (err) {
    console.error('Join campaign error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const campaign = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1',
      [req.params.id]
    );
    
    if (campaign.rows.length === 0) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }
    
    const members = await pool.query(
      `SELECT ch.*, cm.joined_at FROM campaign_members cm
       JOIN characters ch ON cm.character_id = ch.id
       WHERE cm.campaign_id = $1`,
      [req.params.id]
    );
    
    res.json({ campaign: campaign.rows[0], members: members.rows });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/:id', requireDM, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM campaigns WHERE id = $1 AND dm_id = $2 RETURNING id',
      [req.params.id, req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }
    
    res.json({ message: 'Кампания удалена' });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;