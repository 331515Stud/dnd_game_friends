const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// ============================================================================
// Таблица сессий (для connect-pg-simple)
// ============================================================================
const initSessionTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      sid VARCHAR NOT NULL,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
    
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
};

// ============================================================================
// Основная инициализация БД
// ============================================================================
const initDB = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Таблица пользователей (email опционально)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'player' CHECK (role IN ('player', 'dm')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    // 2. Таблица персонажей
    await client.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        race VARCHAR(50),
        class VARCHAR(50),
        background VARCHAR(100),
        alignment VARCHAR(50),
        level INTEGER CHECK (level BETWEEN 1 AND 20) DEFAULT 1,
        xp INTEGER DEFAULT 0,
        hp_current INTEGER DEFAULT 1,
        hp_max INTEGER DEFAULT 1,
        ac INTEGER DEFAULT 10,
        speed INTEGER DEFAULT 30,
        str INTEGER DEFAULT 10,
        dex INTEGER DEFAULT 10,
        con INTEGER DEFAULT 10,
        int INTEGER DEFAULT 10,
        wis INTEGER DEFAULT 10,
        cha INTEGER DEFAULT 10,
        inventory JSONB DEFAULT '[]'::jsonb,
        abilities JSONB DEFAULT '[]'::jsonb,
        spells JSONB DEFAULT '[]'::jsonb,
        features JSONB DEFAULT '[]'::jsonb,
        appearance TEXT,
        backstory TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Таблица кампаний
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dm_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        access_code VARCHAR(6) UNIQUE NOT NULL,
        player_limit INTEGER CHECK (player_limit BETWEEN 2 AND 10) DEFAULT 5,
        map_data TEXT,
        map_metadata JSONB DEFAULT '{}'::jsonb,
        grid_size INTEGER CHECK (grid_size BETWEEN 20 AND 200) DEFAULT 50,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Таблица участников кампании
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, character_id)
      )
    `);

    // 5. Таблица сообщений чата
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'player',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Таблица логов боя
    await client.query(`
      CREATE TABLE IF NOT EXISTS combat_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        encounter_data JSONB,
        log_entries JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Таблица игровых сессий
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        dm_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        session_number INTEGER DEFAULT 1,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        xp_awarded INTEGER DEFAULT 0,
        loot_notes TEXT,
        dm_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Таблица участников сессии
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
        character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
        xp_earned INTEGER DEFAULT 0,
        notes TEXT,
        attended BOOLEAN DEFAULT true,
        UNIQUE(session_id, character_id)
      )
    `);

    // 9. Индексы (БЕЗ email!)
    await client.query(`
      -- Пользователи
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      
      -- Персонажи
      CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
      CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
      
      -- Кампании
      CREATE INDEX IF NOT EXISTS idx_campaigns_dm ON campaigns(dm_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_code ON campaigns(access_code);
      CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active) WHERE is_active = true;
      
      -- Участники кампании
      CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign ON campaign_members(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_members_character ON campaign_members(character_id);
      
      -- Чат
      CREATE INDEX IF NOT EXISTS idx_chat_campaign ON chat_messages(campaign_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);
      
      -- Сессии
      CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON game_sessions(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_dm ON game_sessions(dm_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_number ON game_sessions(campaign_id, session_number);
      
      -- Участники сессии
      CREATE INDEX IF NOT EXISTS idx_participants_session ON session_participants(session_id);
      CREATE INDEX IF NOT EXISTS idx_participants_character ON session_participants(character_id);
      
      -- Боевые логи
      CREATE INDEX IF NOT EXISTS idx_combat_campaign ON combat_logs(campaign_id, created_at DESC);
    `);

    // 10. Функция обновления timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 11. Триггеры
    await client.query(`
      DROP TRIGGER IF EXISTS trg_users_updated ON users;
      CREATE TRIGGER trg_users_updated 
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      
      DROP TRIGGER IF EXISTS trg_characters_updated ON characters;
      CREATE TRIGGER trg_characters_updated 
        BEFORE UPDATE ON characters
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      
      DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
      CREATE TRIGGER trg_campaigns_updated 
        BEFORE UPDATE ON campaigns
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      
      DROP TRIGGER IF EXISTS trg_sessions_updated ON game_sessions;
      CREATE TRIGGER trg_sessions_updated 
        BEFORE UPDATE ON game_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    // 12. Таблица сессий Express
    await initSessionTable(client);

    await client.query('COMMIT');
    console.log('✅ Database initialized successfully');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

// ============================================================================
// Вспомогательные функции
// ============================================================================
const safeQuery = async (query, params = []) => {
  try {
    const result = await pool.query(query, params);
    return result;
  } catch (err) {
    console.error('Query error:', err.message);
    throw err;
  }
};

const checkConnection = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
};

const closePool = async () => {
  await pool.end();
  console.log('🔌 Database pool closed');
};

// ============================================================================
// Экспорт
// ============================================================================
module.exports = {
  pool,
  initDB,
  initSessionTable,
  safeQuery,
  checkConnection,
  closePool
};