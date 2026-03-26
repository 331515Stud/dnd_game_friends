const { rollDice, getAbilityModifier } = require('../utils/helpers');

class CombatEncounter {
  constructor(campaignId, participants = []) {
    this.campaignId = campaignId;
    this.participants = this.calculateInitiative(participants);
    this.currentTurn = 0;
    this.round = 1;
    this.log = [];
    this.status = 'active'; // active, paused, ended
    this.startTime = new Date();
  }

  calculateInitiative(participants) {
    return participants.map(p => ({
      ...p,
      initiative: rollDice(20) + getAbilityModifier(p.stats?.dex || 10),
      currentHP: p.hp_current || p.hp_max || 10,
      maxHP: p.hp_max || 10,
      tempHP: 0
    })).sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      // При равенстве инициативы - по ловкости
      return (b.stats?.dex || 10) - (a.stats?.dex || 10);
    });
  }

  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.participants.length;
    if (this.currentTurn === 0) {
      this.round++;
      this.addLog('system', `Начался раунд ${this.round}`);
    }
    const current = this.getCurrentParticipant();
    this.addLog('turn', `Ход: ${current.name}`);
    return this.getState();
  }

  previousTurn() {
    if (this.currentTurn === 0) {
      if (this.round > 1) {
        this.round--;
        this.currentTurn = this.participants.length - 1;
      }
    } else {
      this.currentTurn--;
    }
    return this.getState();
  }

  dealDamage(targetId, amount, source = 'unknown') {
    const target = this.participants.find(p => p.id === targetId);
    if (!target) return false;

    // Учет временных HP
    if (target.tempHP > 0) {
      if (target.tempHP >= amount) {
        target.tempHP -= amount;
        amount = 0;
      } else {
        amount -= target.tempHP;
        target.tempHP = 0;
      }
    }

    target.currentHP = Math.max(0, target.currentHP - amount);
    
    this.addLog('damage', `${source} наносит ${amount} урона ${target.name}. Осталось HP: ${target.currentHP}`);

    // Автоматическое удаление поверженных врагов (не игроков)
    if (target.currentHP === 0 && !target.is_player) {
      target.status = 'dead';
      this.addLog('death', `${target.name} повержен!`);
    }

    return this.getState();
  }

  heal(targetId, amount) {
    const target = this.participants.find(p => p.id === targetId);
    if (!target) return false;

    const oldHP = target.currentHP;
    target.currentHP = Math.min(target.maxHP, target.currentHP + amount);
    const healed = target.currentHP - oldHP;

    this.addLog('heal', `${target.name} восстанавливает ${healed} HP`);
    return this.getState();
  }

  addTempHP(targetId, amount) {
    const target = this.participants.find(p => p.id === targetId);
    if (!target) return false;
    
    target.tempHP = amount;
    this.addLog('buff', `${target.name} получает ${amount} временных HP`);
    return this.getState();
  }

  getCurrentParticipant() {
    return this.participants[this.currentTurn];
  }

  getState() {
    return {
      campaignId: this.campaignId,
      participants: this.participants,
      currentTurn: this.currentTurn,
      round: this.round,
      currentParticipant: this.getCurrentParticipant(),
      status: this.status,
      log: this.log.slice(-20) // Последние 20 записей
    };
  }

  addLog(type, message) {
    this.log.push({
      timestamp: new Date(),
      type,
      message,
      round: this.round
    });
  }

  endCombat() {
    this.status = 'ended';
    this.endTime = new Date();
    this.addLog('system', 'Бой завершен');
    return this.getState();
  }

  // Сериализация для сохранения в БД
  toJSON() {
    return {
      campaignId: this.campaignId,
      participants: this.participants,
      currentTurn: this.currentTurn,
      round: this.round,
      status: this.status,
      log: this.log,
      startTime: this.startTime,
      endTime: this.endTime || null
    };
  }

  // Десериализация из БД
  static fromJSON(data) {
    const encounter = new CombatEncounter(data.campaignId, []);
    encounter.participants = data.participants;
    encounter.currentTurn = data.currentTurn;
    encounter.round = data.round;
    encounter.status = data.status;
    encounter.log = data.log;
    encounter.startTime = new Date(data.startTime);
    if (data.endTime) encounter.endTime = new Date(data.endTime);
    return encounter;
  }
}

module.exports = CombatEncounter;