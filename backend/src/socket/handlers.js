const db = require('../config/database');
const { sanitizeInput, rollDice, checkCampaignAccess } = require('../utils/helpers');
const CombatEncounter = require('../services/CombatService');

// Хранилище активных боев в памяти (для быстрого доступа)
const activeCombats = new Map();

function setupSocketHandlers(io) {
  // Middleware для проверки сессии
  io.use(async (socket, next) => {
    const session = socket.request.session;
    if (session && session.userId) {
      socket.userId = session.userId;
      socket.username = session.username;
      socket.role = session.role;
      next();
    } else {
      next(new Error('Требуется авторизация'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Присоединение к комнате кампании
    socket.on('join-campaign', async (campaignId) => {
      try {
        const { allowed, error, isDM } = await checkCampaignAccess(
          db, socket.userId, campaignId, null
        );
        
        if (!allowed) {
          return socket.emit('error', { message: error });
        }
        
        socket.campaignId = campaignId;
        socket.isDM = isDM;
        socket.join(`campaign-${campaignId}`);
        
        // Уведомляем других игроков
        socket.to(`campaign-${campaignId}`).emit('player-joined', {
          username: socket.username,
          timestamp: new Date()
        });
        
        // Отправляем текущее состояние боя, если он активен
        if (activeCombats.has(campaignId)) {
          socket.emit('combat-state', activeCombats.get(campaignId).getState());
        }
        
        socket.emit('joined', { success: true, isDM });
      } catch (err) {
        socket.emit('error', { message: 'Ошибка присоединения' });
      }
    });

    // Чат
    socket.on('chat-message', async (data) => {
      try {
        if (!socket.campaignId) return;
        
        let { message, type = 'text' } = data;
        
        // Валидация
        if (!message || message.length > 500) return;
        
        // Санитизация
        message = sanitizeInput(message);
        
        // Сохранение в БД
        const result = await db.query(
          `INSERT INTO chat_messages (campaign_id, user_id, message, message_type) 
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [socket.campaignId, socket.userId, message, type]
        );
        
        // Broadcast
        io.to(`campaign-${socket.campaignId}`).emit('new-message', {
          id: result.rows[0].id,
          username: socket.username,
          message,
          type,
          timestamp: new Date(),
          isDM: socket.isDM
        });
      } catch (err) {
        console.error('Chat error:', err);
      }
    });

    // Бросок кубиков
    socket.on('roll-dice', (data) => {
      try {
        if (!socket.campaignId) return;
        
        const { dice, modifier = 0, reason = '' } = data;
        const validDice = [4, 6, 8, 10, 12, 20, 100];
        
        if (!validDice.includes(dice)) return;
        
        const roll = rollDice(dice);
        const total = roll + modifier;
        
        const result = {
          username: socket.username,
          dice: `d${dice}`,
          roll,
          modifier,
          total,
          reason: sanitizeInput(reason).substring(0, 200),
          timestamp: new Date(),
          isDM: socket.isDM,
          animation: true
        };
        
        io.to(`campaign-${socket.campaignId}`).emit('dice-result', result);
      } catch (err) {
        console.error('Dice roll error:', err);
      }
    });

    // Перемещение токена
    socket.on('move-token', async (data) => {
      try {
        if (!socket.campaignId) return;
        
        const { tokenId, x, y } = data;
        
        // Валидация координат
        if (x < 0 || x > 5000 || y < 0 || y > 5000) return;
        
        // Проверка прав на перемещение
        let canMove = false;
        
        if (socket.isDM) {
          canMove = true;
        } else {
          // Игрок может двигать только свои токены
          const tokenCheck = await db.query(
            `SELECT mt.id 
             FROM map_tokens mt
             JOIN characters ch ON mt.character_id = ch.id
             WHERE mt.id = $1 AND mt.campaign_id = $2 AND ch.user_id = $3`,
            [tokenId, socket.campaignId, socket.userId]
          );
          canMove = tokenCheck.rows.length > 0;
        }
        
        if (!canMove) {
          return socket.emit('error', { message: 'Нет прав на перемещение этого токена' });
        }
        
        // Обновление в БД
        await db.query(
          'UPDATE map_tokens SET x = $1, y = $2 WHERE id = $3 AND campaign_id = $4',
          [x, y, tokenId, socket.campaignId]
        );
        
        // Broadcast
        io.to(`campaign-${socket.campaignId}`).emit('token-moved', {
          tokenId,
          x,
          y,
          movedBy: socket.username,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('Move token error:', err);
      }
    });

    // Боевая система
    socket.on('combat-start', async (data) => {
      try {
        if (!socket.campaignId || !socket.isDM) {
          return socket.emit('error', { message: 'Только DM может начинать бой' });
        }
        
        // Загружаем персонажей из БД
        const charsResult = await db.query(
          `SELECT ch.id, ch.name, ch.stats, ch.hp_current, ch.hp_max, true as is_player, u.username as controller
           FROM campaign_members cm
           JOIN characters ch ON cm.character_id = ch.id
           JOIN users u ON ch.user_id = u.id
           WHERE cm.campaign_id = $1`,
          [socket.campaignId]
        );
        
        // Добавляем NPC, если есть
        const npcResult = await db.query(
          `SELECT id, name, stats, hp_current, hp_max, false as is_player, 'DM' as controller
           FROM map_tokens 
           WHERE campaign_id = $1 AND is_player = false`,
          [socket.campaignId]
        );
        
        const participants = [...charsResult.rows, ...npcResult.rows];
        const combat = new CombatEncounter(socket.campaignId, participants);
        activeCombats.set(socket.campaignId, combat);
        
        // Сохраняем в БД
        await db.query(
          'INSERT INTO combat_sessions (campaign_id, state) VALUES ($1, $2)',
          [socket.campaignId, JSON.stringify(combat.toJSON())]
        );
        
        io.to(`campaign-${socket.campaignId}`).emit('combat-started', combat.getState());
      } catch (err) {
        console.error('Combat start error:', err);
      }
    });

    socket.on('combat-next-turn', () => {
      if (!socket.campaignId || !activeCombats.has(socket.campaignId)) return;
      if (!socket.isDM) return;
      
      const combat = activeCombats.get(socket.campaignId);
      const state = combat.nextTurn();
      
      io.to(`campaign-${socket.campaignId}`).emit('combat-update', state);
    });

    socket.on('combat-prev-turn', () => {
      if (!socket.campaignId || !activeCombats.has(socket.campaignId)) return;
      if (!socket.isDM) return;
      
      const combat = activeCombats.get(socket.campaignId);
      const state = combat.previousTurn();
      
      io.to(`campaign-${socket.campaignId}`).emit('combat-update', state);
    });

    socket.on('combat-damage', (data) => {
      if (!socket.campaignId || !activeCombats.has(socket.campaignId)) return;
      
      const { targetId, amount, source } = data;
      const combat = activeCombats.get(socket.campaignId);
      
      // Проверка что игрок бьет только по своей инициативе (если не DM)
      if (!socket.isDM) {
        const current = combat.getCurrentParticipant();
        // Здесь нужна дополнительная логика проверки, что игрок контролирует current
      }
      
      const state = combat.dealDamage(targetId, amount, source || socket.username);
      io.to(`campaign-${socket.campaignId}`).emit('combat-update', state);
    });

    socket.on('combat-end', async () => {
      if (!socket.campaignId || !socket.isDM) return;
      if (!activeCombats.has(socket.campaignId)) return;
      
      const combat = activeCombats.get(socket.campaignId);
      combat.endCombat();
      
      // Обновляем в БД
      await db.query(
        'UPDATE combat_sessions SET state = $1, is_active = false, ended_at = NOW() WHERE campaign_id = $2 AND is_active = true',
        [JSON.stringify(combat.toJSON()), socket.campaignId]
      );
      
      activeCombats.delete(socket.campaignId);
      io.to(`campaign-${socket.campaignId}`).emit('combat-ended', combat.getState());
    });

    // Отключение
    socket.on('disconnect', () => {
      if (socket.campaignId) {
        socket.to(`campaign-${socket.campaignId}`).emit('player-left', {
          username: socket.username,
          timestamp: new Date()
        });
      }
      console.log(`User disconnected: ${socket.username}`);
    });
  });
}

module.exports = setupSocketHandlers;