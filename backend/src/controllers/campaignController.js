const db = require('../config/database');
const { campaignSchema } = require('../utils/validation');
const { generateAccessCode, sanitizeInput, checkCampaignAccess } = require('../utils/helpers');

class CampaignController {
  // Создать кампанию (только DM)
  async createCampaign(req, res) {
    try {
      if (req.session.role !== 'dm') {
        return res.status(403).json({ error: 'Только Мастер может создавать кампании' });
      }
      
      const data = campaignSchema.parse(req.body);
      const code = generateAccessCode();
      
      const result = await db.query(
        `INSERT INTO campaigns (dm_id, name, description, access_code, max_players) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          req.session.userId,
          sanitizeInput(data.name),
          sanitizeInput(data.description),
          code,
          data.max_players
        ]
      );
      
      res.status(201).json({ 
        campaign: result.rows[0],
        accessCode: code 
      });
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors });
      }
      console.error('Create campaign error:', err);
      res.status(500).json({ error: 'Ошибка создания кампании' });
    }
  }

  // Получить кампании пользователя (DM или игрока)
  async getMyCampaigns(req, res) {
    try {
      const userId = req.session.userId;
      const role = req.session.role;
      
      let campaigns;
      
      if (role === 'dm') {
        // Кампании где пользователь DM
        const result = await db.query(
          `SELECT c.*, 
            (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id) as player_count
          FROM campaigns c 
          WHERE c.dm_id = $1 
          ORDER BY c.created_at DESC`,
          [userId]
        );
        campaigns = result.rows;
      } else {
        // Кампании где есть персонаж игрока
        const result = await db.query(
          `SELECT c.*, ch.name as character_name, ch.id as character_id
          FROM campaigns c
          JOIN campaign_members cm ON c.id = cm.campaign_id
          JOIN characters ch ON cm.character_id = ch.id
          WHERE ch.user_id = $1
          ORDER BY c.created_at DESC`,
          [userId]
        );
        campaigns = result.rows;
      }
      
      res.json({ campaigns });
    } catch (err) {
      console.error('Get campaigns error:', err);
      res.status(500).json({ error: 'Ошибка получения кампаний' });
    }
  }

  // Присоединиться к кампании по коду
  async joinCampaign(req, res) {
    try {
      const { code, characterId } = req.body;
      
      if (!code || !characterId) {
        return res.status(400).json({ error: 'Укажите код и персонажа' });
      }
      
      // Проверка персонажа
      const charCheck = await db.query(
        'SELECT user_id FROM characters WHERE id = $1',
        [characterId]
      );
      
      if (charCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Персонаж не найден' });
      }
      
      if (charCheck.rows[0].user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Это не ваш персонаж' });
      }
      
      // Поиск кампании
      const campaignResult = await db.query(
        'SELECT * FROM campaigns WHERE access_code = $1 AND is_active = true',
        [code.toUpperCase().trim()]
      );
      
      if (campaignResult.rows.length === 0) {
        return res.status(404).json({ error: 'Кампания не найдена или неактивна' });
      }
      
      const campaign = campaignResult.rows[0];
      
      // Проверка лимита
      const countResult = await db.query(
        'SELECT COUNT(*) FROM campaign_members WHERE campaign_id = $1',
        [campaign.id]
      );
      
      if (parseInt(countResult.rows[0].count) >= campaign.max_players) {
        return res.status(400).json({ error: 'Достигнут лимит игроков' });
      }
      
      // Проверка что персонаж еще не в кампании
      const existingResult = await db.query(
        'SELECT id FROM campaign_members WHERE campaign_id = $1 AND character_id = $2',
        [campaign.id, characterId]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(409).json({ error: 'Персонаж уже в этой кампании' });
      }
      
      // Транзакция добавления
      await db.query('BEGIN');
      
      try {
        await db.query(
          'INSERT INTO campaign_members (campaign_id, character_id) VALUES ($1, $2)',
          [campaign.id, characterId]
        );
        
        // Создание токена на карте
        await db.query(
          `INSERT INTO map_tokens (campaign_id, character_id, name, x, y, is_player) 
           VALUES ($1, $2, (SELECT name FROM characters WHERE id = $2), 100, 100, true)`,
          [campaign.id, characterId]
        );
        
        await db.query('COMMIT');
        
        res.json({ 
          success: true, 
          campaignId: campaign.id,
          message: 'Вы присоединились к кампании'
        });
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
      
    } catch (err) {
      console.error('Join campaign error:', err);
      res.status(500).json({ error: 'Ошибка присоединения к кампании' });
    }
  }

  // Получить детали кампании
  async getCampaignDetails(req, res) {
    try {
      const { id } = req.params;
      
      // Основная информация
      const campaignResult = await db.query(
        `SELECT c.*, u.username as dm_name 
         FROM campaigns c 
         JOIN users u ON c.dm_id = u.id 
         WHERE c.id = $1`,
        [id]
      );
      
      if (campaignResult.rows.length === 0) {
        return res.status(404).json({ error: 'Кампания не найдена' });
      }
      
      const campaign = campaignResult.rows[0];
      
      // Проверка доступа
      const isDM = campaign.dm_id === req.session.userId;
      
      if (!isDM) {
        // Проверяем, есть ли персонаж игрока в кампании
        const memberCheck = await db.query(
          `SELECT cm.id 
           FROM campaign_members cm 
           JOIN characters ch ON cm.character_id = ch.id 
           WHERE cm.campaign_id = $1 AND ch.user_id = $2`,
          [id, req.session.userId]
        );
        
        if (memberCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Нет доступа к кампании' });
        }
      }
      
      // Участники
      const membersResult = await db.query(
        `SELECT ch.id, ch.name, ch.race, ch.class, ch.level, ch.stats, 
                u.username as player_name, mt.x, mt.y, mt.color
         FROM campaign_members cm
         JOIN characters ch ON cm.character_id = ch.id
         JOIN users u ON ch.user_id = u.id
         LEFT JOIN map_tokens mt ON mt.character_id = ch.id AND mt.campaign_id = cm.campaign_id
         WHERE cm.campaign_id = $1`,
        [id]
      );
      
      // Токены врагов (NPC)
      const npcResult = await db.query(
        `SELECT * FROM map_tokens WHERE campaign_id = $1 AND is_player = false`,
        [id]
      );
      
      res.json({
        campaign,
        members: membersResult.rows,
        npcs: npcResult.rows,
        isDM
      });
      
    } catch (err) {
      console.error('Get campaign details error:', err);
      res.status(500).json({ error: 'Ошибка получения данных кампании' });
    }
  }

  // Обновить карту (только DM)
  async updateMap(req, res) {
    try {
      const { id } = req.params;
      const { imageBase64, gridSize } = req.body;
      
      // Проверка прав DM
      const campaign = await db.query(
        'SELECT dm_id FROM campaigns WHERE id = $1',
        [id]
      );
      
      if (campaign.rows.length === 0) {
        return res.status(404).json({ error: 'Кампания не найдена' });
      }
      
      if (campaign.rows[0].dm_id !== req.session.userId) {
        return res.status(403).json({ error: 'Только DM может менять карту' });
      }
      
      // Валидация размера изображения (base64 примерно на 30% больше бинарного размера)
      if (imageBase64 && imageBase64.length > 7 * 1024 * 1024) { // ~5MB limit
        return res.status(400).json({ error: 'Изображение слишком большое (макс. 5MB)' });
      }
      
      await db.query(
        'UPDATE campaigns SET map_image = $1, grid_size = $2 WHERE id = $3',
        [imageBase64, gridSize, id]
      );
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка обновления карты' });
    }
  }

  // Удалить кампанию
  async deleteCampaign(req, res) {
    try {
      const { id } = req.params;
      
      const result = await db.query(
        'DELETE FROM campaigns WHERE id = $1 AND dm_id = $2 RETURNING id',
        [id, req.session.userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Кампания не найдена или нет прав' });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка удаления' });
    }
  }
}

module.exports = new CampaignController();