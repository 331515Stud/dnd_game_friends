class CombatEncounter {
  constructor(campaignId) {
    this.campaignId = campaignId;
    this.isActive = false;
    this.round = 0;
    this.turnIndex = 0;
    this.initiative = [];
    this.logs = [];
    this.tokenPositions = new Map();
  }

  calculateInitiative(characters) {
    this.initiative = characters.map(char => ({
      characterId: char.id,
      name: char.name,
      initiative: Math.floor(Math.random() * 20) + 1 + Math.floor((char.dex - 10) / 2),
      dex: char.dex,
      hp_current: char.hp_current,
      hp_max: char.hp_max
    }));
    
    this.initiative.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.dex - a.dex;
    });
    
    this.logs.push({
      type: 'combat_start',
      timestamp: new Date().toISOString(),
      message: 'Бой начался!'
    });
  }

  nextTurn() {
    if (!this.isActive || this.initiative.length === 0) return null;
    
    const current = this.initiative[this.turnIndex];
    this.turnIndex = (this.turnIndex + 1) % this.initiative.length;
    
    if (this.turnIndex === 0) {
      this.round++;
      this.logs.push({
        type: 'round',
        timestamp: new Date().toISOString(),
        round: this.round,
        message: `Раунд ${this.round}`
      });
    }
    
    const next = this.initiative[this.turnIndex];
    this.logs.push({
      type: 'turn',
      timestamp: new Date().toISOString(),
      characterId: next.characterId,
      message: `Ход: ${next.name}`
    });
    
    return { current, next, round: this.round };
  }

  previousTurn() {
    if (!this.isActive || this.initiative.length === 0) return null;
    
    this.turnIndex = this.turnIndex === 0 ? this.initiative.length - 1 : this.turnIndex - 1;
    if (this.turnIndex === this.initiative.length - 1) {
      this.round = Math.max(0, this.round - 1);
    }
    
    const current = this.initiative[this.turnIndex];
    return { current, round: this.round };
  }

  updateHP(characterId, newHP) {
    const character = this.initiative.find(c => c.characterId === characterId);
    if (!character) return null;
    
    const oldHP = character.hp_current;
    character.hp_current = Math.max(0, newHP);
    
    this.logs.push({
      type: 'hp_change',
      timestamp: new Date().toISOString(),
      characterId,
      oldHP,
      newHP: character.hp_current,
      message: `${character.name}: ${oldHP} → ${character.hp_current} HP`
    });
    
    return { character, defeated: character.hp_current === 0 };
  }

  removeDefeated() {
    const defeated = this.initiative.filter(c => c.hp_current === 0);
    this.initiative = this.initiative.filter(c => c.hp_current > 0);
    
    if (this.turnIndex >= this.initiative.length) {
      this.turnIndex = 0;
    }
    
    return defeated;
  }

  endCombat() {
    this.isActive = false;
    this.logs.push({
      type: 'combat_end',
      timestamp: new Date().toISOString(),
      message: 'Бой завершён'
    });
    
    return {
      round: this.round,
      logs: this.logs,
      survivors: this.initiative.filter(c => c.hp_current > 0)
    };
  }

  getState() {
    return {
      isActive: this.isActive,
      round: this.round,
      turnIndex: this.turnIndex,
      currentTurn: this.initiative[this.turnIndex] || null,
      initiative: this.initiative,
      logs: this.logs.slice(-50)
    };
  }
}

const combatEncounters = new Map();

module.exports = { CombatEncounter, combatEncounters };