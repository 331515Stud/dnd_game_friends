const xss = require('xss');

const sanitizeInput = (input) => {
  if (typeof input === 'string') return xss(input.trim());
  if (Array.isArray(input)) return input.map(sanitizeInput);
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }
  return input;
};

const validateCharacter = (data) => {
  const errors = [];
  if (!data.name || data.name.length < 1 || data.name.length > 100) {
    errors.push('Имя персонажа должно быть от 1 до 100 символов');
  }
  if (data.level && (data.level < 1 || data.level > 20)) {
    errors.push('Уровень должен быть от 1 до 20');
  }
  if (data.hp_current !== undefined && data.hp_current < 0) {
    errors.push('Текущие HP не могут быть отрицательными');
  }
  const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  for (const stat of stats) {
    if (data[stat] !== undefined && (data[stat] < 1 || data[stat] > 30)) {
      errors.push(`${stat.toUpperCase()} должен быть от 1 до 30`);
    }
  }
  return { isValid: errors.length === 0, errors };
};

const validateMessage = (message) => {
  if (!message || typeof message !== 'string') return false;
  if (message.length > 500) return false;
  return true;
};

const validateDice = (diceType) => {
  const validDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
  return validDice.includes(diceType);
};

const validateCoordinates = (x, y) => {
  return x >= 0 && x <= 5000 && y >= 0 && y <= 5000;
};
// Валидация и авто-расчёт характеристик
const calculateModifier = (score) => Math.floor((score - 10) / 2);

const validateAndProcessCharacter = (data) => {
  const errors = [];
  const processed = { ...data };
  
  // Валидация уровня
  if (processed.level && (processed.level < 1 || processed.level > 20)) {
    errors.push('Уровень должен быть от 1 до 20');
  }
  
  // Валидация характеристик и авто-расчёт модификаторов
  const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  for (const stat of stats) {
    if (processed[stat] !== undefined) {
      if (processed[stat] < 1 || processed[stat] > 30) {
        errors.push(`${stat.toUpperCase()} должен быть от 1 до 30`);
      }
      // Добавляем поле-модификатор
      processed[`${stat}_mod`] = calculateModifier(processed[stat]);
    }
  }
  
  // Авто-расчёт бонусов, если есть навыки
  if (Array.isArray(processed.abilities)) {
    processed.abilities = processed.abilities.map(ability => {
      if (ability.ability_check && processed[ability.ability_check]) {
        return {
          ...ability,
          modifier: calculateModifier(processed[ability.ability_check])
        };
      }
      return ability;
    });
  }
  
  return { isValid: errors.length === 0, errors, processed };
};

module.exports = {
    calculateModifier, 
    validateAndProcessCharacter,
    sanitizeInput,
    validateCharacter,
    validateMessage,
    validateDice,
    validateCoordinates
};
