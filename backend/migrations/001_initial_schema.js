exports.up = async (pgm) => {
  // Триггер для автообновления updated_at
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    `
  );

  // Таблица пользователей
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    username: { type: 'varchar(50)', notNull: true, unique: true },
    password: { type: 'varchar(255)', notNull: true },
    role: { type: 'varchar(20)', notNull: true, check: "role IN ('player', 'dm')" },
    last_login: { type: 'timestamp' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });

  // Таблица сессий (для connect-pg-simple)
  pgm.createTable('user_sessions', {
    sid: { type: 'varchar(255)', notNull: true, primaryKey: true },
    sess: { type: 'json', notNull: true },
    expire: { type: 'timestamp(6)', notNull: true }
  });
  pgm.createIndex('user_sessions', 'expire');

  // Таблица персонажей
  pgm.createTable('characters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(100)', notNull: true },
    race: { type: 'varchar(50)' },
    class: { type: 'varchar(50)' },
    background: { type: 'varchar(100)' },
    alignment: { type: 'varchar(50)' },
    level: { type: 'integer', default: 1, check: 'level BETWEEN 1 AND 20' },
    experience: { type: 'integer', default: 0 },
    hp_current: { type: 'integer', default: 10 },
    hp_max: { type: 'integer', default: 10 },
    ac: { type: 'integer', default: 10 },
    speed: { type: 'integer', default: 30 },
    stats: { type: 'jsonb', notNull: true, default: '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}' },
    inventory: { type: 'jsonb', default: '[]' },
    spells: { type: 'jsonb', default: '[]' },
    features: { type: 'jsonb', default: '[]' },
    appearance: { type: 'text' },
    backstory: { type: 'text' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });
  pgm.createIndex('characters', 'user_id');

  // Таблица кампаний
  pgm.createTable('campaigns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    dm_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(200)', notNull: true },
    description: { type: 'text' },
    access_code: { type: 'varchar(6)', notNull: true, unique: true },
    max_players: { type: 'integer', notNull: true, default: 6, check: 'max_players BETWEEN 2 AND 10' },
    map_image: { type: 'text' },
    grid_size: { type: 'integer', default: 50, check: 'grid_size BETWEEN 20 AND 200' },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });
  pgm.createIndex('campaigns', 'access_code');
  pgm.createIndex('campaigns', 'dm_id');

  // Таблица участников кампаний
  pgm.createTable('campaign_members', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    campaign_id: { type: 'uuid', notNull: true, references: 'campaigns(id)', onDelete: 'CASCADE' },
    character_id: { type: 'uuid', notNull: true, references: 'characters(id)', onDelete: 'CASCADE' },
    joined_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });
  pgm.createIndex('campaign_members', 'campaign_id');
  pgm.createIndex('campaign_members', 'character_id');

  // Таблица игровых сессий (боев)
  pgm.createTable('combat_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    campaign_id: { type: 'uuid', notNull: true, references: 'campaigns(id)', onDelete: 'CASCADE' },
    state: { type: 'jsonb', notNull: true },
    is_active: { type: 'boolean', default: true },
    started_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    ended_at: { type: 'timestamp' },
    log: { type: 'jsonb', default: '[]' }
  });

  // Таблица сообщений чата
  pgm.createTable('chat_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    campaign_id: { type: 'uuid', notNull: true, references: 'campaigns(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    character_id: { type: 'uuid', references: 'characters(id)', onDelete: 'SET NULL' },
    message: { type: 'text', notNull: true },
    message_type: { type: 'varchar(20)', default: 'text', check: "message_type IN ('text', 'roll', 'system')" },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });
  pgm.createIndex('chat_messages', 'campaign_id');

  // Таблица токенов на карте
  pgm.createTable('map_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    campaign_id: { type: 'uuid', notNull: true, references: 'campaigns(id)', onDelete: 'CASCADE' },
    character_id: { type: 'uuid', references: 'characters(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(100)' },
    x: { type: 'integer', notNull: true, check: 'x BETWEEN 0 AND 5000' },
    y: { type: 'integer', notNull: true, check: 'y BETWEEN 0 AND 5000' },
    color: { type: 'varchar(7)', default: '#FF0000' },
    is_player: { type: 'boolean', default: true },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });

  // Триггеры для updated_at
  pgm.createTrigger('characters', 'update_characters_modtime', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });
  
  pgm.createTrigger('campaigns', 'update_campaigns_modtime', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });
  
  pgm.createTrigger('map_tokens', 'update_tokens_modtime', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('map_tokens');
  pgm.dropTable('chat_messages');
  pgm.dropTable('combat_sessions');
  pgm.dropTable('campaign_members');
  pgm.dropTable('campaigns');
  pgm.dropTable('characters');
  pgm.dropTable('user_sessions');
  pgm.dropTable('users');
  pgm.dropFunction('update_updated_at_column');
};