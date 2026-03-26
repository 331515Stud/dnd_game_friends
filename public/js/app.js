/**
 * 🎲 D&D Online — Frontend Application
 * Полная версия с авторизацией, персонажами, кампаниями, сессиями,
 * чатом, кубиками, картой, боем и удобствами для игры
 */

// ============================================================================
// 🌍 Глобальные переменные
// ============================================================================
const API = '/api';
let socket = null;
let currentUser = null;
let currentCampaign = null;
let currentCharacter = null;
let characters = [];
let campaigns = [];
let sessions = [];
let combatState = null;
let mapState = { grid: true, zoom: 1, tokens: [] };

// ============================================================================
// 🚀 Инициализация
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await checkAuth();
  initSocket();
  loadLastCampaign();
});

// ============================================================================
// 🔐 Авторизация
// ============================================================================
async function checkAuth() {
  try {
    const res = await fetch(`${API}/auth/me`, { credentials: 'same-origin' });
    if (res.ok) {
      currentUser = (await res.json()).user;
      showDashboard();
      await Promise.all([loadCharacters(), loadCampaigns()]);
    } else {
      showAuthForms();
    }
  } catch (e) {
    console.error('Auth check failed:', e);
    showAuthForms();
  }
}

function showAuthForms() {
  document.getElementById('auth-section').style.display = 'flex';
  document.getElementById('user-section').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('auth-forms').style.display = 'block';
}

function showDashboard() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('user-section').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('auth-forms').style.display = 'none';
  
  document.getElementById('username').textContent = currentUser.username;
  updateUIByRole();
  updateCharacterSelect();
  updateSessionCampaignSelect();
}

// ============================================================================
// 🎛️ Управление интерфейсом по ролям
// ============================================================================
function updateUIByRole() {
  const isDM = currentUser?.role === 'dm';
  
  // ✅ Персонажей создают ВСЕ (игроки и DM)
  const createCharacterBtn = document.getElementById('create-character-btn');
  if (createCharacterBtn) createCharacterBtn.style.display = 'block';
  
  // 🔒 Только DM создаёт кампании
  const createCampaignBtn = document.getElementById('create-campaign-btn');
  if (createCampaignBtn) createCampaignBtn.style.display = isDM ? 'block' : 'none';
  
  // 🔒 Только DM создаёт сессии
  const createSessionBtn = document.getElementById('create-session-btn');
  if (createSessionBtn) createSessionBtn.style.display = isDM ? 'block' : 'none';
  
  // 🔒 Только DM управляет боем
  const combatControls = ['start-combat-btn', 'next-turn-btn', 'prev-turn-btn', 'end-combat-btn'];
  combatControls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isDM ? 'inline-block' : 'none';
  });
  
  // ✅ Игроки присоединяются к кампаниям по коду
  const joinCampaignForm = document.getElementById('join-campaign-form');
  if (joinCampaignForm) joinCampaignForm.style.display = isDM ? 'none' : 'block';
  
  // Бейдж роли
  const roleBadge = document.getElementById('user-role');
  if (roleBadge) {
    roleBadge.textContent = isDM ? '🐉 DM' : '🧙 Игрок';
    roleBadge.className = `badge ${isDM ? 'dm' : 'player'}`;
  }
}

// ============================================================================
// 🎛️ Привязка событий
// ============================================================================
function bindEvents() {
  // Переключение форм авторизации
  document.getElementById('switch-to-register')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
  });
  
  document.getElementById('switch-to-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
  });
  
  // Вход
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (res.ok) {
      location.reload();
    } else {
      showNotification('❌ ' + (data.error || 'Ошибка входа'), 'error');
    }
  });
  
  // Регистрация
  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;
    
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password, role })
    });
    
    const data = await res.json();
    if (res.ok) {
      location.reload();
    } else {
      showNotification('❌ ' + (data.error || 'Ошибка регистрации'), 'error');
    }
  });
  
  // ✅ ВЫХОД — исправленная версия
  document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch(`${API}/auth/logout`, { 
        method: 'POST',
        credentials: 'same-origin'
      });
      currentUser = null;
      window.location.href = '/';
    } catch (err) {
      console.error('Logout error:', err);
      window.location.href = '/';
    }
  });
  
  // Вкладки
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-tab`)?.classList.add('active');
      
      if (btn.dataset.tab === 'characters') loadCharacters();
      if (btn.dataset.tab === 'campaigns') loadCampaigns();
      if (btn.dataset.tab === 'sessions' && currentCampaign) loadSessions(currentCampaign.id);
    });
  });
  
  // ===== Персонажи =====
  document.getElementById('create-character-btn')?.addEventListener('click', () => showCharacterForm());
  document.getElementById('cancel-character')?.addEventListener('click', hideCharacterForm);
  document.getElementById('character-form')?.addEventListener('submit', handleCharacterSubmit);
  document.getElementById('delete-character')?.addEventListener('click', handleDeleteCharacter);
  
  // Авто-расчёт модификаторов
  document.querySelectorAll('[data-stat]').forEach(input => {
    input.addEventListener('input', () => updateModifierDisplay(input.dataset.stat, input.value));
  });
  
  // ===== Кампании =====
  document.getElementById('create-campaign-btn')?.addEventListener('click', () => showCampaignForm());
  document.getElementById('cancel-campaign')?.addEventListener('click', hideCampaignForm);
  document.getElementById('campaign-form')?.addEventListener('submit', handleCampaignSubmit);
  document.getElementById('join-campaign-btn')?.addEventListener('click', handleJoinCampaign);
  
  // ===== Сессии =====
  document.getElementById('create-session-btn')?.addEventListener('click', showSessionForm);
  document.getElementById('cancel-session')?.addEventListener('click', hideSessionForm);
  document.getElementById('session-form')?.addEventListener('submit', handleSessionSubmit);
  document.getElementById('session-campaign-select')?.addEventListener('change', handleSessionCampaignChange);
  document.getElementById('close-session-detail')?.addEventListener('click', () => {
    document.getElementById('session-detail').style.display = 'none';
  });
  
  // ===== Игра =====
  document.getElementById('send-chat-btn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  document.getElementById('roll-d20-btn')?.addEventListener('click', () => {
    const modifier = parseInt(document.getElementById('dice-modifier')?.value || 0);
    const diceType = document.getElementById('dice-select')?.value || 'd20';
    rollDice(diceType, modifier);
  });
  
  // Карта
  document.getElementById('toggle-grid-btn')?.addEventListener('click', toggleGrid);
  document.getElementById('zoom-in-btn')?.addEventListener('click', () => adjustZoom(0.2));
  document.getElementById('zoom-out-btn')?.addEventListener('click', () => adjustZoom(-0.2));
  
  // Бой
  document.getElementById('start-combat-btn')?.addEventListener('click', startCombat);
  document.getElementById('next-turn-btn')?.addEventListener('click', nextTurn);
  document.getElementById('prev-turn-btn')?.addEventListener('click', previousTurn);
  document.getElementById('end-combat-btn')?.addEventListener('click', endCombat);
  
  // Быстрые действия с персонажем
  document.getElementById('heal-btn')?.addEventListener('click', () => adjustHP(5));
  document.getElementById('damage-btn')?.addEventListener('click', () => adjustHP(-5));
  document.getElementById('roll-initiative-btn')?.addEventListener('click', rollInitiative);
  
  // ===== Горячие клавиши =====
  document.addEventListener('keydown', (e) => {
    // Игнорируем если фокус в поле ввода
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // R — бросить d20
    if (e.key === 'r' && currentCampaign) {
      rollDice('d20', 0);
    }
    // H — полечиться (+5 HP)
    if (e.key === 'h' && currentCharacter) {
      adjustHP(5);
    }
    // D — получить урон (-5 HP)
    if (e.key === 'd' && currentCharacter) {
      adjustHP(-5);
    }
    // Ctrl+Enter — отправить сообщение
    if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'chat-input') {
      sendChatMessage();
    }
  });
}

// ============================================================================
// 👤 Персонажи
// ============================================================================
async function loadCharacters() {
  try {
    const res = await fetch(`${API}/characters`, { credentials: 'same-origin' });
    const data = await res.json();
    characters = data.characters || [];
    renderCharactersList();
    updateCharacterSelect();
  } catch (err) {
    console.error('Load characters failed:', err);
    showNotification('❌ Не удалось загрузить персонажей', 'error');
  }
}

function renderCharactersList() {
  const container = document.getElementById('characters-list');
  
  if (!characters.length) {
    container.innerHTML = '<p class="empty-state">Нет персонажей. Создайте первого! 🎲</p>';
    return;
  }
  
  container.innerHTML = characters.map(c => `
    <div class="card character-card" onclick="editCharacter('${c.id}')">
      <div class="card-header">
        <h4>${c.name}</h4>
        <span class="badge level">Ур. ${c.level}</span>
      </div>
      <p class="card-subtitle">${c.race || '—'} ${c.class || '—'}</p>
      <div class="stats-mini">
        <span>❤️ ${c.hp_current}/${c.hp_max}</span>
        <span>🛡️ AC ${c.ac}</span>
        <span>⚡ ${c.speed}ft</span>
      </div>
      <div class="abilities-mini">
        <small>STR ${c.str}${formatMod(c.str_mod)} • DEX ${c.dex}${formatMod(c.dex_mod)}</small>
      </div>
    </div>
  `).join('');
}

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : mod;
}

function showCharacterForm(character = null) {
  const form = document.getElementById('character-form');
  form.style.display = 'block';
  document.getElementById('characters-list').style.display = 'none';
  
  if (character) {
    document.getElementById('char-id').value = character.id;
    document.getElementById('char-name').value = character.name;
    document.getElementById('char-race').value = character.race || '';
    document.getElementById('char-class').value = character.class || '';
    document.getElementById('char-background').value = character.background || '';
    document.getElementById('char-alignment').value = character.alignment || '';
    document.getElementById('char-level').value = character.level;
    document.getElementById('char-hp-current').value = character.hp_current;
    document.getElementById('char-hp-max').value = character.hp_max;
    document.getElementById('char-ac').value = character.ac;
    document.getElementById('char-speed').value = character.speed;
    document.getElementById('char-str').value = character.str;
    document.getElementById('char-dex').value = character.dex;
    document.getElementById('char-con').value = character.con;
    document.getElementById('char-int').value = character.int;
    document.getElementById('char-wis').value = character.wis;
    document.getElementById('char-cha').value = character.cha;
    document.getElementById('char-appearance').value = character.appearance || '';
    document.getElementById('char-backstory').value = character.backstory || '';
    
    ['str','dex','con','int','wis','cha'].forEach(stat => {
      updateModifierDisplay(stat, character[stat]);
    });
    
    document.getElementById('delete-character').style.display = 'block';
  } else {
    form.reset();
    document.getElementById('char-id').value = '';
    document.getElementById('delete-character').style.display = 'none';
    ['str','dex','con','int','wis','cha'].forEach(stat => {
      updateModifierDisplay(stat, 10);
    });
  }
  
  form.scrollIntoView({ behavior: 'smooth' });
}

function hideCharacterForm() {
  document.getElementById('character-form').style.display = 'none';
  document.getElementById('characters-list').style.display = 'grid';
  loadCharacters();
}

async function handleCharacterSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('char-id').value;
  const data = {
    name: document.getElementById('char-name').value,
    race: document.getElementById('char-race').value,
    class: document.getElementById('char-class').value,
    background: document.getElementById('char-background').value,
    alignment: document.getElementById('char-alignment').value,
    level: parseInt(document.getElementById('char-level').value),
    hp_current: parseInt(document.getElementById('char-hp-current').value),
    hp_max: parseInt(document.getElementById('char-hp-max').value),
    ac: parseInt(document.getElementById('char-ac').value),
    speed: parseInt(document.getElementById('char-speed').value),
    str: parseInt(document.getElementById('char-str').value),
    dex: parseInt(document.getElementById('char-dex').value),
    con: parseInt(document.getElementById('char-con').value),
    int: parseInt(document.getElementById('char-int').value),
    wis: parseInt(document.getElementById('char-wis').value),
    cha: parseInt(document.getElementById('char-cha').value),
    appearance: document.getElementById('char-appearance').value,
    backstory: document.getElementById('char-backstory').value
  };
  
  try {
    const url = id ? `${API}/characters/${id}` : `${API}/characters`;
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      showNotification(id ? '✅ Персонаж обновлён' : '✅ Персонаж создан', 'success');
      hideCharacterForm();
      if (currentCharacter?.id === result.character.id) {
        currentCharacter = result.character;
        updateCharacterPanel();
      }
    } else {
      showNotification('❌ ' + (result.errors?.join(', ') || result.error), 'error');
    }
  } catch (err) {
    console.error('Save character failed:', err);
    showNotification('❌ Ошибка сети', 'error');
  }
}

async function handleDeleteCharacter() {
  const id = document.getElementById('char-id').value;
  if (!id || !confirm('Удалить этого персонажа? Это действие необратимо.')) return;
  
  try {
    const res = await fetch(`${API}/characters/${id}`, { 
      method: 'DELETE',
      credentials: 'same-origin'
    });
    const data = await res.json();
    
    if (res.ok) {
      showNotification('🗑️ ' + data.message, 'success');
      hideCharacterForm();
      if (currentCharacter?.id === id) {
        currentCharacter = null;
        updateCharacterPanel();
      }
    } else {
      showNotification('❌ ' + data.error, 'error');
    }
  } catch (err) {
    console.error('Delete character failed:', err);
    showNotification('❌ Ошибка сети', 'error');
  }
}

function editCharacter(id) {
  const character = characters.find(c => c.id === id);
  if (character) showCharacterForm(character);
}

function updateModifierDisplay(stat, value) {
  const mod = Math.floor((value - 10) / 2);
  const badge = document.getElementById(`${stat}-mod`);
  if (badge) {
    badge.textContent = mod >= 0 ? `+${mod}` : mod;
  }
}

function updateCharacterSelect() {
  const select = document.getElementById('char-for-campaign');
  if (!select) return;
  
  select.innerHTML = '<option value="">Выберите персонажа</option>' + 
    characters.map(c => `<option value="${c.id}">${c.name} (${c.class || '—'})</option>`).join('');
}

// ============================================================================
// 🗡️ Кампании
// ============================================================================
async function loadCampaigns() {
  try {
    const res = await fetch(`${API}/campaigns`, { credentials: 'same-origin' });
    const data = await res.json();
    campaigns = data.campaigns || [];
    renderCampaignsList();
    updateSessionCampaignSelect();
  } catch (err) {
    console.error('Load campaigns failed:', err);
  }
}

function renderCampaignsList() {
  const container = document.getElementById('campaigns-list');
  
  if (!campaigns.length) {
    container.innerHTML = currentUser.role === 'dm' 
      ? '<p class="empty-state">Нет кампаний. Создайте новую! 🗡️</p>'
      : '<p class="empty-state">Вы пока не участвуете в кампаниях</p>';
    return;
  }
  
  container.innerHTML = campaigns.map(c => `
    <div class="card campaign-card">
      <div class="card-header">
        <h4>${c.name}</h4>
        ${c.access_code ? `<span class="badge code">${c.access_code}</span>` : ''}
      </div>
      <p class="card-subtitle">${c.description || 'Без описания'}</p>
      <div class="card-meta">
        <span>👥 ${c.player_limit} игроков</span>
        <span>🔲 Сетка ${c.grid_size}px</span>
      </div>
      <button class="btn btn-sm btn-primary" onclick="enterCampaign('${c.id}')">
        🎮 Войти в игру
      </button>
    </div>
  `).join('');
}

function showCampaignForm(campaign = null) {
  const form = document.getElementById('campaign-form');
  form.style.display = 'block';
  
  if (campaign) {
    document.getElementById('camp-id').value = campaign.id;
    document.getElementById('camp-name').value = campaign.name;
    document.getElementById('camp-description').value = campaign.description || '';
    document.getElementById('camp-player-limit').value = campaign.player_limit;
    document.getElementById('camp-grid-size').value = campaign.grid_size;
    document.getElementById('camp-map-data').value = campaign.map_data || '';
  } else {
    form.reset();
    document.getElementById('camp-id').value = '';
  }
}

function hideCampaignForm() {
  document.getElementById('campaign-form').style.display = 'none';
  loadCampaigns();
}

async function handleCampaignSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('camp-id').value;
  const data = {
    name: document.getElementById('camp-name').value,
    description: document.getElementById('camp-description').value,
    player_limit: parseInt(document.getElementById('camp-player-limit').value),
    grid_size: parseInt(document.getElementById('camp-grid-size').value),
    map_data: document.getElementById('camp-map-data').value
  };
  
  try {
    const url = id ? `${API}/campaigns/${id}` : `${API}/campaigns`;
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      showNotification(id ? '✅ Кампания обновлена' : '✅ Кампания создана', 'success');
      hideCampaignForm();
    } else {
      showNotification('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('Save campaign failed:', err);
    showNotification('❌ Ошибка сети', 'error');
  }
}

async function handleJoinCampaign() {
  const code = document.getElementById('camp-code').value.toUpperCase();
  const characterId = document.getElementById('char-for-campaign').value;
  
  if (!code || code.length !== 6) {
    showNotification('❌ Введите корректный код (6 символов)', 'error');
    return;
  }
  if (!characterId) {
    showNotification('❌ Выберите персонажа', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API}/campaigns/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ access_code: code, character_id: characterId })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showNotification('✅ Вы присоединились к кампании!', 'success');
      document.getElementById('camp-code').value = '';
      loadCampaigns();
    } else {
      showNotification('❌ ' + data.error, 'error');
    }
  } catch (err) {
    console.error('Join campaign failed:', err);
    showNotification('❌ Ошибка сети', 'error');
  }
}

function enterCampaign(campaignId) {
  currentCampaign = campaigns.find(c => c.id === campaignId);
  if (!currentCampaign) return;
  
  saveCurrentCampaign(campaignId);
  
  document.getElementById('no-game-room').style.display = 'none';
  document.getElementById('game-room').style.display = 'block';
  
  initMap();
  
  if (socket?.connected) {
    socket.emit('join_campaign', campaignId);
  }
  
  switchTab('game');
  
  showNotification(`🎮 Кампания: ${currentCampaign.name}`, 'info');
}

// ============================================================================
// 📜 Сессии
// ============================================================================
function updateSessionCampaignSelect() {
  const select = document.getElementById('session-campaign-select');
  if (!select) return;
  
  select.innerHTML = '<option value="">Выберите кампанию</option>' + 
    campaigns.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function handleSessionCampaignChange(e) {
  const campaignId = e.target.value;
  if (!campaignId) return;
  
  try {
    const res = await fetch(`${API}/sessions/campaign/${campaignId}`, { credentials: 'same-origin' });
    const data = await res.json();
    sessions = data.sessions || [];
    renderSessionsList();
    await loadParticipantsChecklist(campaignId);
  } catch (err) {
    console.error('Load sessions failed:', err);
  }
}

function renderSessionsList() {
  const container = document.getElementById('sessions-list');
  
  if (!sessions.length) {
    container.innerHTML = '<p class="empty-state">Нет сессий в этой кампании</p>';
    return;
  }
  
  container.innerHTML = sessions.map(s => `
    <div class="card session-card" onclick="showSessionDetail('${s.id}')">
      <div class="card-header">
        <h4>📜 #${s.session_number}: ${s.title}</h4>
        ${s.ended_at ? '<span class="badge done">✅</span>' : '<span class="badge active">🔴</span>'}
      </div>
      <p class="card-subtitle">${s.description || 'Без описания'}</p>
      <div class="card-meta">
        <span>🕐 ${new Date(s.started_at).toLocaleDateString()}</span>
        ${s.xp_awarded ? `<span>⭐ +${s.xp_awarded} XP</span>` : ''}
      </div>
    </div>
  `).join('');
}

function showSessionForm() {
  const campaignId = document.getElementById('session-campaign-select').value;
  if (!campaignId) {
    showNotification('❌ Выберите кампанию', 'error');
    return;
  }
  
  document.getElementById('session-campaign-id').value = campaignId;
  document.getElementById('session-form').style.display = 'block';
  document.getElementById('sessions-list').style.display = 'none';
  
  loadParticipantsChecklist(campaignId);
}

function hideSessionForm() {
  document.getElementById('session-form').reset();
  document.getElementById('session-form').style.display = 'none';
  document.getElementById('sessions-list').style.display = 'grid';
}

async function loadParticipantsChecklist(campaignId) {
  const container = document.getElementById('participants-checklist');
  
  try {
    const campRes = await fetch(`${API}/campaigns/${campaignId}`, { credentials: 'same-origin' });
    const campData = await campRes.json();
    
    if (!campData.members?.length) {
      container.innerHTML = '<p><small>Нет персонажей в кампании</small></p>';
      return;
    }
    
    container.innerHTML = campData.members.map(m => `
      <label class="checkbox-label">
        <input type="checkbox" name="participant" value="${m.id}">
        ${m.name} <small>(${m.class || '—'})</small>
      </label>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p><small>Ошибка загрузки участников</small></p>';
  }
}

async function handleSessionSubmit(e) {
  e.preventDefault();
  
  const data = {
    campaign_id: document.getElementById('session-campaign-id').value,
    title: document.getElementById('session-title').value,
    description: document.getElementById('session-description').value,
    session_number: parseInt(document.getElementById('session-number').value),
    xp_awarded: parseInt(document.getElementById('session-xp').value),
    dm_notes: document.getElementById('session-dm-notes').value,
    participants: Array.from(
      document.querySelectorAll('input[name="participant"]:checked')
    ).map(cb => cb.value)
  };
  
  try {
    const res = await fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      showNotification('✅ Сессия создана', 'success');
      hideSessionForm();
      handleSessionCampaignChange({ target: { value: data.campaign_id }});
    } else {
      showNotification('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('Create session failed:', err);
    showNotification('❌ Ошибка сети', 'error');
  }
}

async function showSessionDetail(sessionId) {
  try {
    const res = await fetch(`${API}/sessions/${sessionId}`, { credentials: 'same-origin' });
    const data = await res.json();
    
    document.getElementById('detail-title').textContent = data.session.title;
    document.getElementById('detail-date').textContent = 
      `${new Date(data.session.started_at).toLocaleString()} — ${
        data.session.ended_at ? new Date(data.session.ended_at).toLocaleString() : 'активна'
      }`;
    document.getElementById('detail-desc').textContent = data.session.description || '—';
    document.getElementById('detail-xp').textContent = data.session.xp_awarded || '—';
    
    const dmSection = document.getElementById('detail-dm-notes-section');
    if (currentUser.role === 'dm' && data.session.dm_notes) {
      dmSection.style.display = 'block';
      document.getElementById('detail-dm-notes').textContent = data.session.dm_notes;
    } else {
      dmSection.style.display = 'none';
    }
    
    document.getElementById('detail-participants').innerHTML = 
      data.participants?.map(p => `
        <div class="participant-item">
          👤 ${p.character_name} — 
          ${p.attended ? '✅' : '❌'} 
          ${p.xp_earned ? `⭐ +${p.xp_earned}` : ''}
        </div>
      `).join('') || '<p><small>Нет участников</small></p>';
    
    document.getElementById('session-detail').style.display = 'block';
  } catch (err) {
    console.error('Show session detail failed:', err);
    showNotification('❌ Не удалось загрузить сессию', 'error');
  }
}

// ============================================================================
// ⚔️ Игра — Карта, Чат, Кубики, Бой
// ============================================================================
function initMap() {
  const canvas = document.getElementById('game-map');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * window.devicePixelRatio;
  canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  canvas.onmousemove = (e) => updateCoordsDisplay(e, canvas);
  
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  
  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / mapState.zoom;
    const y = (e.clientY - rect.top) / mapState.zoom;
    
    const token = mapState.tokens.find(t => {
      const dx = x - t.x, dy = y - t.y;
      return Math.sqrt(dx*dx + dy*dy) < 20;
    });
    
    if (token && (currentUser.role === 'dm' || token.owner === currentUser.username)) {
      dragging = token;
      dragOffset = { x: x - token.x, y: y - token.y };
      canvas.style.cursor = 'grabbing';
    }
  };
  
  canvas.onmousemove = (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / mapState.zoom - dragOffset.x;
    const y = (e.clientY - rect.top) / mapState.zoom - dragOffset.y;
    
    dragging.x = Math.max(0, Math.min(5000, x));
    dragging.y = Math.max(0, Math.min(5000, y));
    
    if (socket?.connected) {
      socket.emit('move_token', {
        characterId: dragging.characterId,
        x: dragging.x,
        y: dragging.y
      });
    }
    
    drawMap(ctx, canvas);
  };
  
  canvas.onmouseup = () => {
    dragging = null;
    canvas.style.cursor = 'default';
  };
  
  drawMap(ctx, canvas);
}

function drawMap(ctx, canvas) {
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  if (mapState.grid && currentCampaign?.grid_size) {
    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = 1;
    const gridSize = currentCampaign.grid_size * mapState.zoom;
    
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
  
  if (currentCampaign?.map_data) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = currentCampaign.map_data;
  }
  
  mapState.tokens.forEach(token => {
    const x = token.x * mapState.zoom;
    const y = token.y * mapState.zoom;
    
    ctx.beginPath();
    ctx.arc(x, y, 20 * mapState.zoom, 0, Math.PI * 2);
    ctx.fillStyle = token.isDM ? '#e94560' : '#4ecca3';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(token.name, x, y + 35);
    
    if (token.hp_current !== undefined) {
      const hpPercent = token.hp_current / token.hp_max;
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 15, y - 30, 30, 5);
      ctx.fillStyle = hpPercent > 0.5 ? '#4ecca3' : hpPercent > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(x - 15, y - 30, 30 * hpPercent, 5);
    }
  });
}

function updateCoordsDisplay(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / mapState.zoom);
  const y = Math.floor((e.clientY - rect.top) / mapState.zoom);
  document.getElementById('map-coords').textContent = `X: ${x}, Y: ${y}`;
}

function toggleGrid() {
  mapState.grid = !mapState.grid;
  const canvas = document.getElementById('game-map');
  if (canvas) drawMap(canvas.getContext('2d'), canvas);
}

function adjustZoom(delta) {
  mapState.zoom = Math.max(0.5, Math.min(3, mapState.zoom + delta));
  const canvas = document.getElementById('game-map');
  if (canvas) drawMap(canvas.getContext('2d'), canvas);
}

// ============================================================================
// 💬 Чат и Кубики
// ============================================================================
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  
  if (!message || !socket?.connected) return;
  
  socket.emit('chat_message', { message });
  input.value = '';
}

function rollDice(diceType, modifier = 0) {
  if (!socket?.connected) return;
  
  socket.emit('roll_dice', { 
    diceType, 
    modifier,
    characterName: currentCharacter?.name || currentUser?.username
  });
}

function addChatMessage(data) {
  const container = document.getElementById('chat-messages');
  const time = new Date(data.timestamp).toLocaleTimeString();
  
  const msgEl = document.createElement('div');
  msgEl.className = `message ${data.role}`;
  msgEl.innerHTML = `
    <strong>${data.username}</strong> 
    <small>${time}</small>: 
    ${escapeHtml(data.message)}
  `;
  
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function addDiceRoll(data) {
  const container = document.getElementById('chat-messages');
  
  const msgEl = document.createElement('div');
  msgEl.className = 'message dice-roll';
  msgEl.innerHTML = `
    🎲 <strong>${data.username}</strong> бросил ${data.diceType}: 
    <strong>${data.result}</strong>${data.modifier ? ` (${data.modifier >= 0 ? '+' : ''}${data.modifier})` : ''} 
    = <strong>${data.total}</strong>
  `;
  
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  
  if (data.animate) {
    msgEl.style.animation = 'pulse 0.5s ease';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// ⚔️ Боевая система
// ============================================================================
function startCombat() {
  if (!socket?.connected || currentUser.role !== 'dm') return;
  socket.emit('start_combat', { campaignId: currentCampaign?.id });
}

function nextTurn() {
  if (!socket?.connected || currentUser.role !== 'dm') return;
  socket.emit('next_turn');
}

function previousTurn() {
  if (!socket?.connected || currentUser.role !== 'dm') return;
  socket.emit('previous_turn');
}

function endCombat() {
  if (!socket?.connected || currentUser.role !== 'dm') return;
  if (confirm('Завершить бой?')) {
    socket.emit('end_combat');
  }
}

function updateCombatDisplay(state) {
  combatState = state;
  
  document.getElementById('combat-round').textContent = state.round;
  
  const container = document.getElementById('initiative-order');
  container.innerHTML = state.initiative.map((c, i) => `
    <div class="initiative-item ${i === state.turnIndex ? 'active' : ''} ${c.hp_current <= 0 ? 'defeated' : ''}">
      <strong>${c.name}</strong> 
      <span class="badge">${c.initiative}</span>
      <span class="hp">${c.hp_current}/${c.hp_max} ❤️</span>
    </div>
  `).join('');
}

function updateCharacterPanel() {
  const container = document.getElementById('current-character-info');
  if (!currentCharacter) {
    container.innerHTML = '<p><small>Выберите персонажа</small></p>';
    return;
  }
  
  container.innerHTML = `
    <h4>${currentCharacter.name}</h4>
    <p><small>${currentCharacter.race || '—'} ${currentCharacter.class || '—'}, Ур. ${currentCharacter.level}</small></p>
    <div class="quick-stats">
      <span>🛡️ ${currentCharacter.ac}</span>
      <span>⚡ ${currentCharacter.speed}ft</span>
      <span>🎯 +${Math.floor((currentCharacter.dex - 10) / 2)}</span>
    </div>
  `;
  
  const hpPercent = (currentCharacter.hp_current / currentCharacter.hp_max) * 100;
  document.getElementById('hp-fill').style.width = `${hpPercent}%`;
  document.getElementById('hp-fill').className = hpPercent > 50 ? 'full' : hpPercent > 25 ? 'half' : 'low';
  document.getElementById('hp-text').textContent = `${currentCharacter.hp_current}/${currentCharacter.hp_max} HP`;
}

function adjustHP(amount) {
  if (!currentCharacter) {
    showNotification('❌ Выберите персонажа', 'error');
    return;
  }
  
  const newHP = Math.max(0, Math.min(currentCharacter.hp_max, currentCharacter.hp_current + amount));
  
  fetch(`${API}/characters/${currentCharacter.id}/hp`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ hp_current: newHP })
  })
  .then(res => res.json())
  .then(data => {
    if (data.hp) {
      currentCharacter.hp_current = data.hp.current;
      updateCharacterPanel();
      showNotification(`${amount > 0 ? '❤️' : '⚔️'} HP: ${currentCharacter.hp_current}/${currentCharacter.hp_max}`, 'info');
    }
  });
}

function rollInitiative() {
  if (!currentCharacter) return;
  const mod = Math.floor((currentCharacter.dex - 10) / 2);
  rollDice('d20', mod);
}

// ============================================================================
// 🔌 Socket.IO
// ============================================================================
function initSocket() {
  socket = io();
  
  socket.on('connect', () => {
    console.log('🔌 Connected to server');
    if (currentCampaign) {
      socket.emit('join_campaign', currentCampaign.id);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Disconnected');
  });
  
  socket.on('error', (data) => {
    showNotification('⚠️ ' + data.message, 'warning');
  });
  
  socket.on('campaign_joined', (data) => {
    console.log('🎮 Joined campaign:', data.campaign.name);
    mapState.tokens = data.members?.map(m => ({
      characterId: m.id,
      name: m.name,
      x: 100, y: 100,
      owner: m.user_id === currentUser.id ? currentUser.username : null,
      isDM: false
    })) || [];
    
    const canvas = document.getElementById('game-map');
    if (canvas) drawMap(canvas.getContext('2d'), canvas);
  });
  
  socket.on('chat_message', addChatMessage);
  socket.on('dice_roll', addDiceRoll);
  
  socket.on('token_moved', (data) => {
    const token = mapState.tokens.find(t => t.characterId === data.characterId);
    if (token) {
      token.x = data.x;
      token.y = data.y;
      const canvas = document.getElementById('game-map');
      if (canvas) drawMap(canvas.getContext('2d'), canvas);
    }
  });
  
  socket.on('combat_started', updateCombatDisplay);
  socket.on('combat_update', updateCombatDisplay);
  socket.on('combat_ended', (data) => {
    document.getElementById('combat-panel').style.display = 'none';
    showNotification('⚔️ Бой завершён', 'info');
  });
  
  socket.on('user_left', (data) => {
    showNotification('👋 Игрок вышел', 'info');
  });
}

// ============================================================================
// 🎛️ Утилиты
// ============================================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabId}-tab`);
  });
  
  if (tabId === 'game' && currentCampaign) {
    document.getElementById('no-game-room').style.display = 'none';
    document.getElementById('game-room').style.display = 'block';
    initMap();
  }
}

function showNotification(message, type = 'info') {
  const container = document.getElementById('notifications');
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  
  container.appendChild(notif);
  
  setTimeout(() => {
    notif.style.opacity = '0';
    setTimeout(() => notif.remove(), 300);
  }, 4000);
}

function saveCurrentCampaign(campaignId) {
  localStorage.setItem('lastCampaign', campaignId);
}

function loadLastCampaign() {
  const last = localStorage.getItem('lastCampaign');
  if (last && campaigns.length > 0) {
    const campaign = campaigns.find(c => c.id === last);
    if (campaign) enterCampaign(last);
  }
}

// ============================================================================
// 🌍 Глобальные функции для HTML
// ============================================================================
window.editCharacter = editCharacter;
window.enterCampaign = enterCampaign;
window.showSessionDetail = showSessionDetail;
window.adjustHP = adjustHP;