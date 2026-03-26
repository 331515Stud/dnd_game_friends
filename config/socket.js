const { Server } = require('socket.io');
const { pool } = require('./database');
const { wrapMiddleware, requireAuth } = require('../middleware/auth');
const { checkSocketRateLimit } = require('../middleware/rateLimiter');
const { sanitizeInput, validateMessage, validateDice, validateCoordinates } = require('../middleware/validation');
const { CombatEncounter, combatEncounters } = require('../models/GameState');

const setupSocket = (server, sessionMiddleware) => {
  const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000' }
  });

  io.use(wrapMiddleware(sessionMiddleware));

  io.on('connection', (socket) => {
    const userId = socket.request.session?.userId;
    const role = socket.request.session?.role;
    
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.on('join_campaign', async (campaignId) => {
      if (!checkSocketRateLimit(userId)) {
        socket.emit('error', { message: 'Слишком много запросов' });
        return;
      }

      const campaign = await pool.query(
        `SELECT c.* FROM campaigns c
         LEFT JOIN campaign_members cm ON c.id = cm.campaign_id
         LEFT JOIN characters ch ON cm.character_id = ch.id
         WHERE c.id = $1 AND (c.dm_id = $2 OR ch.user_id = $2)`,
        [campaignId, userId]
      );

      if (campaign.rows.length === 0) {
        socket.emit('error', { message: 'Нет доступа к кампании' });
        return;
      }

      socket.join(`campaign:${campaignId}`);
      socket.campaignId = campaignId;
      
      const members = await pool.query(
        `SELECT ch.id, ch.name, ch.user_id FROM campaign_members cm
         JOIN characters ch ON cm.character_id = ch.id
         WHERE cm.campaign_id = $1`,
        [campaignId]
      );

      io.to(`campaign:${campaignId}`).emit('campaign_joined', {
        campaign: campaign.rows[0],
        members: members.rows,
        userId
      });
    });

    socket.on('chat_message', async (data) => {
      if (!checkSocketRateLimit(userId)) return;
      if (!socket.campaignId) return;

      const message = sanitizeInput(data.message);
      if (!validateMessage(message)) {
        socket.emit('error', { message: 'Некорректное сообщение' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO chat_messages (campaign_id, user_id, message, role)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [socket.campaignId, userId, message, role]
      );

      io.to(`campaign:${socket.campaignId}`).emit('chat_message', {
        id: result.rows[0].id,
        message: result.rows[0].message,
        username: socket.request.session.username,
        role,
        timestamp: result.rows[0].created_at
      });
    });

    socket.on('roll_dice', (data) => {
      if (!checkSocketRateLimit(userId)) return;
      if (!socket.campaignId) return;

      const diceType = data.diceType?.toLowerCase();
      if (!validateDice(diceType)) {
        socket.emit('error', { message: 'Некорректный тип кубика' });
        return;
      }

      const sides = parseInt(diceType.replace('d', ''));
      const result = Math.floor(Math.random() * sides) + 1;
      const modifier = data.modifier || 0;
      const total = result + modifier;

      io.to(`campaign:${socket.campaignId}`).emit('dice_roll', {
        username: socket.request.session.username,
        diceType,
        result,
        modifier,
        total,
        timestamp: new Date().toISOString(),
        animate: true
      });
    });

    socket.on('move_token', async (data) => {
      if (!checkSocketRateLimit(userId)) return;
      if (!socket.campaignId) return;

      const { characterId, x, y } = data;
      
      if (!validateCoordinates(x, y)) {
        socket.emit('error', { message: 'Некорректные координаты' });
        return;
      }

      const canMove = role === 'dm' || await checkTokenOwnership(characterId, userId);
      if (!canMove) {
        socket.emit('error', { message: 'Нет прав для перемещения' });
        return;
      }

      io.to(`campaign:${socket.campaignId}`).emit('token_moved', {
        characterId,
        x,
        y,
        movedBy: socket.request.session.username
      });
    });

    socket.on('start_combat', async (data) => {
      if (role !== 'dm' || !socket.campaignId) return;

      const characters = await pool.query(
        `SELECT ch.id, ch.name, ch.dex, ch.hp_current, ch.hp_max FROM campaign_members cm
         JOIN characters ch ON cm.character_id = ch.id
         WHERE cm.campaign_id = $1`,
        [socket.campaignId]
      );

      const encounter = new CombatEncounter(socket.campaignId);
      encounter.isActive = true;
      encounter.calculateInitiative(characters.rows);
      combatEncounters.set(socket.campaignId, encounter);

      await pool.query(
        `INSERT INTO combat_logs (campaign_id, encounter_data)
         VALUES ($1, $2)`,
        [socket.campaignId, JSON.stringify(encounter.getState())]
      );

      io.to(`campaign:${socket.campaignId}`).emit('combat_started', encounter.getState());
    });

    socket.on('next_turn', () => {
      if (role !== 'dm' || !socket.campaignId) return;
      const encounter = combatEncounters.get(socket.campaignId);
      if (!encounter) return;

      const state = encounter.nextTurn();
      io.to(`campaign:${socket.campaignId}`).emit('combat_update', encounter.getState());
    });

    socket.on('end_combat', async () => {
      if (role !== 'dm' || !socket.campaignId) return;
      const encounter = combatEncounters.get(socket.campaignId);
      if (!encounter) return;

      const result = encounter.endCombat();
      combatEncounters.delete(socket.campaignId);

      await pool.query(
        `UPDATE combat_logs SET log_entries = $1
         WHERE campaign_id = $2`,
        [JSON.stringify(result.logs), socket.campaignId]
      );

      io.to(`campaign:${socket.campaignId}`).emit('combat_ended', result);
    });

    socket.on('disconnect', () => {
      if (socket.campaignId) {
        socket.leave(`campaign:${socket.campaignId}`);
        io.to(`campaign:${socket.campaignId}`).emit('user_left', { userId });
      }
    });
  });

  return io;
};

const checkTokenOwnership = async (characterId, userId) => {
  const result = await pool.query(
    'SELECT 1 FROM characters WHERE id = $1 AND user_id = $2',
    [characterId, userId]
  );
  return result.rows.length > 0;
};

module.exports = { setupSocket };