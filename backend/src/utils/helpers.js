const crypto = require('crypto');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Генерация 6-символьного кода кампании
function generateAccessCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Очистка от XSS
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Расчет модификатора характеристики
function getAbilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

// Бросок кубика
function rollDice(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

// Проверка прав доступа к кампании
async function checkCampaignAccess(db, userId, campaignId, requiredRole = null) {
  const campaign = await db.query(
    'SELECT dm_id FROM campaigns WHERE id = $1',
    [campaignId]
  );
  
  if (campaign.rows.length === 0) return { allowed: false, error: 'Кампания не найдена' };
  
  const isDM = campaign.rows[0].dm_id === userId;
  
  if (requiredRole === 'dm' && !isDM) {
    return { allowed: false, error: 'Требуется права Мастера' };
  }
  
  return { allowed: true, isDM, campaign: campaign.rows[0] };
}

module.exports = {
  generateAccessCode,
  sanitizeInput,
  getAbilityModifier,
  rollDice,
  checkCampaignAccess
};