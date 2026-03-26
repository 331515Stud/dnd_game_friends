const { z } = require('zod');

// Валидация регистрации
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: z.enum(['player', 'dm'])
});

// Валидация персонажа
const characterSchema = z.object({
  name: z.string().min(1).max(100),
  race: z.string().max(50).optional(),
  class: z.string().max(50).optional(),
  level: z.number().int().min(1).max(20).optional(),
  stats: z.object({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30)
  }).optional(),
  hp_current: z.number().int().min(0).optional(),
  hp_max: z.number().int().min(1).optional()
});

// Валидация кампании
const campaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  max_players: z.number().int().min(2).max(10)
});

// Валидация броска кубика
const rollSchema = z.object({
  dice: z.enum([4, 6, 8, 10, 12, 20, 100]),
  modifier: z.number().int().optional(),
  reason: z.string().max(200).optional()
});

module.exports = {
  registerSchema,
  characterSchema,
  campaignSchema,
  rollSchema
};