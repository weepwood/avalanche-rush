import { AudioEngine } from './audio.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const ui = {
  distance: document.querySelector('#distance'),
  score: document.querySelector('#score'),
  combo: document.querySelector('#combo'),
  dangerFill: document.querySelector('#dangerFill'),
  dangerText: document.querySelector('#dangerText'),
  statusChips: document.querySelector('#statusChips'),
  menu: document.querySelector('#menu'),
  pause: document.querySelector('#pause'),
  gameOver: document.querySelector('#gameOver'),
  startBtn: document.querySelector('#startBtn'),
  pauseBtn: document.querySelector('#pauseBtn'),
  resumeBtn: document.querySelector('#resumeBtn'),
  restartPauseBtn: document.querySelector('#restartPauseBtn'),
  restartBtn: document.querySelector('#restartBtn'),
  backMenuBtn: document.querySelector('#backMenuBtn'),
  touchAction: document.querySelector('#touchAction'),
  bestDistance: document.querySelector('#bestDistance'),
  bestScore: document.querySelector('#bestScore'),
  finalDistance: document.querySelector('#finalDistance'),
  finalScore: document.querySelector('#finalScore'),
  finalCombo: document.querySelector('#finalCombo'),
  finalSupplies: document.querySelector('#finalSupplies'),
  resultTitle: document.querySelector('#resultTitle'),
  resultNote: document.querySelector('#resultNote'),
};

const audio = new AudioEngine();
const TAU = Math.PI * 2;
const WORLD_SCALE = 0.92;
const GRAVITY = 1800;
const PLAYER_SCREEN_X = 360;
const STORAGE_KEY = 'avalanche-rush-records-v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const palette = {
  skyTop: '#07182a', skyBottom: '#68adc8', sun: '#fff1b8', far: '#285570',
  mid: '#397995', snow: '#ecf8ff', dark: '#0a1c2b', accent: '#74efff',
  gold: '#ffd66e', red: '#ff776b',
};

const records = loadRecords();
updateRecordsUI();

let state = 'menu';
let lastTime = performance.now();
let accumulator = 0;
let gameTime = 0;
let cameraX = 0;
let shake = 0;
let flash = 0;
let inputHeld = false;
let terrain = [];
let entities = [];
let particles = [];
let floatingTexts = [];
let mountainSeed = Math.random() * 1000;
let nextEntityX = 850;
let nextCheckpoint = 1400;

const run = {
  distance: 0, score: 0, supplies: 0, combo: 1, bestCombo: 1, comboTimer: 0,
  danger: 0.15, stage: 1, stageName: '松林雪谷', message: '', messageTimer: 0,
  nearMisses: 0, perfectLandings: 0,
};

const player = {
  x: 370, y: 280, vx: 430, vy: 0, radius: 20, angle: 0, angularVelocity: 0,
  grounded: true, crouched: false, crashed: false, crashTimer: 0, jumpGrace: 0,
  airTime: 0, lastAngle: 0, shield: 0, boost: 0, companion: null,
  companionTimer: 0, vehicle: null, vehicleTimer: 0, invulnerable: 0, trailTimer: 0,
};

const avalanche = { x: -150, speed: 310, wave: 0 };

function loadRecords() {
  try {
    return { bestDistance: 0, bestScore: 0, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { bestDistance: 0, bestScore: 0 };
  }
}

function saveRecords() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* optional */ }
}

function updateRecordsUI() {
  ui.bestDistance.textContent = `${Math.floor(records.bestDistance)} m`;
  ui.bestScore.textContent = Math.floor(records.bestScore).toLocaleString('zh-CN');
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(640, Math.floor(rect.width * ratio));
  canvas.height = Math.max(360, Math.floor(rect.height * ratio));
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function resetGame() {
  gameTime = 0; cameraX = 0; shake = 0; flash = 0;
  terrain = []; entities = []; particles = []; floatingTexts = [];
  nextEntityX = 760; nextCheckpoint = 1400; mountainSeed = Math.random() * 1000;
  Object.assign(run, {
    distance: 0, score: 0, supplies: 0, combo: 1, bestCombo: 1, comboTimer: 0,
    danger: 0.14, stage: 1, stageName: '松林雪谷', message: '冲在雪崩之前',
    messageTimer: 2.4, nearMisses: 0, perfectLandings: 0,
  });
  Object.assign(player, {
    x: 370, y: 280, vx: 430, vy: 0, angle: 0, angularVelocity: 0,
    grounded: true, crouched: false, crashed: false, crashTimer: 0, jumpGrace: 0,
    airTime: 0, lastAngle: 0, shield: 0, boost: 0, companion: null,
    companionTimer: 0, vehicle: null, vehicleTimer: 0, invulnerable: 0, trailTimer: 0,
  });
  Object.assign(avalanche, { x: -260, speed: 310, wave: 0 });
  generateTerrainUntil(2400);
  player.y = groundY(player.x) - player.radius - 4;
  ui.statusChips.innerHTML = '';
  updateUI();
}

function startGame() {
  audio.init();
  resetGame();
  state = 'running';
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameOver.classList.add('hidden');
}

function backToMenu() {
  state = 'menu';
  ui.gameOver.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  updateRecordsUI();
}

function togglePause() {
  if (state === 'running') {
    state = 'paused'; inputHeld = false; ui.pause.classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'running'; ui.pause.classList.add('hidden'); lastTime = performance.now();
  }
}

function finishGame(reason = 'avalanche') {
  if (state !== 'running') return;
  state = 'gameover'; inputHeld = false;
  const distance = Math.floor(run.distance);
  const score = Math.floor(run.score);
  const isRecord = distance > records.bestDistance || score > records.bestScore;
  records.bestDistance = Math.max(records.bestDistance, distance);
  records.bestScore = Math.max(records.bestScore, score);
  saveRecords(); updateRecordsUI();
  ui.finalDistance.textContent = `${distance} m`;
  ui.finalScore.textContent = score.toLocaleString('zh-CN');
  ui.finalCombo.textContent = `×${run.bestCombo.toFixed(1)}`;
  ui.finalSupplies.textContent = String(run.supplies);
  ui.resultTitle.textContent = reason === 'crash' ? '雪板失去了控制' : '雪浪吞没了路线';
  ui.resultNote.textContent = isRecord ? '新纪录。营地已经点亮了你的信号灯。' : getRunComment();
  ui.gameOver.classList.remove('hidden');
}

function getRunComment() {
  if (run.perfectLandings >= 8) return '落地很稳定。下一次可以尝试更长的空翻连击。';
  if (run.supplies >= 12) return '物资收集充足，但速度路线仍有提升空间。';
  if (run.nearMisses >= 5) return '你多次擦过障碍，风险路线带来了不少分数。';
  return '利用下坡加速，并尽量以板面贴合坡度落地。';
}

function terrainNoise(x) {
  return 460 + Math.sin(x * 0.0012 + mountainSeed) * 70
    + Math.sin(x * 0.0038 + 1.7) * 42 + Math.sin(x * 0.011 + 0.4) * 14;
}

function generateTerrainUntil(targetX) {
  const step = 38;
  let x = terrain.length ? terrain[terrain.length - 1].x + step : -500;
  while (x < targetX) {
    let y = terrainNoise(x);
    const stage = Math.max(1, Math.floor(x / 2500) + 1);
    if (stage % 3 === 2) y += Math.sin(x * 0.018) * 18;
    if (stage % 3 === 0) y += Math.max(0, Math.sin(x * 0.006)) * 45;
    terrain.push({ x, y }); x += step;
  }
}

function groundY(worldX) {
  if (worldX > terrain[terrain.length - 2]?.x) generateTerrainUntil(worldX + 1800);
  let low = 0; let high = terrain.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (terrain[mid].x <= worldX) low = mid; else high = mid;
  }
  const a = terrain[low]; const b = terrain[Math.min(low + 1, terrain.length - 1)];
  if (!a || !b) return 500;
  const t = (worldX - a.x) / Math.max(1, b.x - a.x);
  return a.y + (b.y - a.y) * t;
}

function groundSlope(worldX) {
  return Math.atan2(groundY(worldX + 10) - groundY(worldX - 10), 20);
}

function spawnEntitiesUntil(targetX) {
  while (nextEntityX < targetX) {
    const difficulty = Math.min(1, nextEntityX / 9000);
    const roll = Math.random();
    let type;
    if (roll < 0.36) type = 'supply';
    else if (roll < 0.58) type = Math.random() < 0.62 ? 'tree' : 'rock';
    else if (roll < 0.73) type = 'jump';
    else if (roll < 0.83) type = Math.random() < 0.52 ? 'dog' : 'penguin';
    else if (roll < 0.9) type = 'snowmobile';
    else type = 'supplyLine';

    nextEntityX += 120 + Math.random() * (210 - difficulty * 55);
    const y = groundY(nextEntityX);
    if (type === 'supplyLine') {
      for (let i = 0; i < 5; i += 1) {
        const x = nextEntityX + i * 48;
        entities.push({ type: 'supply', x, y: groundY(x) - 70 - Math.sin(i / 4 * Math.PI) * 45, active: true, bob: Math.random() * TAU });
      }
      nextEntityX += 220;
    } else {
      entities.push({ type, x: nextEntityX, y: type === 'supply' ? y - 68 - Math.random() * 40 : y, active: true, bob: Math.random() * TAU, nearMiss: false });
    }
  }
}

function setInput(value) {
  if (state !== 'running') return;
  if (!value && inputHeld) attemptJump();
  inputHeld = value;
  ui.touchAction.classList.toggle('active', value);
}

function attemptJump() {
  if (state !== 'running' || player.crashed) return;
  if (player.grounded || player.jumpGrace > 0) {
    const slope = groundSlope(player.x);
    const launch = 455 + Math.max(0, player.vx - 430) * 0.17;
    player.vy = -launch - Math.max(0, Math.sin(slope)) * 70;
    player.grounded = false; player.jumpGrace = 0; player.airTime = 0; player.lastAngle = player.angle;
    audio.jump(); emitSnow(player.x, player.y + 18, 10, 0.8);
  }
}

function addCombo(amount, text, x = player.x, y = player.y - 70) {
  run.combo = Math.min(8, run.combo + amount);
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  run.comboTimer = 3.2;
  run.score += 80 * amount * run.combo;
  floatingTexts.push({ x, y, text, life: 1.1, maxLife: 1.1 });
}

function crash(source) {
  if (player.invulnerable > 0 || player.crashed) return;
  if (player.shield > 0) {
    player.shield = 0; player.invulnerable = 1.2; flash = 0.35; shake = 9;
    addCombo(0.2, '护盾破裂'); return;
  }
  if (player.vehicle) {
    player.vehicle = null; player.vehicleTimer = 0; player.invulnerable = 1.5;
    player.vy = -260; player.grounded = false; player.vx *= 0.72;
    shake = 12; flash = 0.4; audio.crash();
    floatingTexts.push({ x: player.x, y: player.y - 70, text: '载具损坏', life: 1.4, maxLife: 1.4 });
    return;
  }
  player.crashed = true; player.crashTimer = 1.35; player.angularVelocity = 8;
  player.vy = -220; player.vx *= 0.5; run.combo = 1; run.comboTimer = 0; shake = 16;
  audio.crash(); emitSnow(player.x, player.y, 24, 1.7);
  if (source === 'avalanche') finishGame('avalanche');
}

function collectEntity(entity) {
  entity.active = false;
  if (entity.type === 'supply') {
    run.supplies += 1; run.score += 120 * run.combo; run.comboTimer = Math.max(run.comboTimer, 2.4);
    audio.pickup(); floatingTexts.push({ x: entity.x, y: entity.y - 30, text: '+物资', life: 0.8, maxLife: 0.8 });
    emitSpark(entity.x, entity.y, palette.gold, 10);
  } else if (entity.type === 'dog') {
    player.companion = 'dog'; player.companionTimer = 11; player.boost = Math.max(player.boost, 2.2);
    audio.companion(); showMessage('雪橇犬加入：地面加速'); addCombo(0.5, '伙伴接力');
  } else if (entity.type === 'penguin') {
    player.companion = 'penguin'; player.companionTimer = 13; player.shield = 1;
    audio.companion(); showMessage('企鹅加入：获得一次护盾'); addCombo(0.5, '伙伴接力');
  } else if (entity.type === 'snowmobile') {
    player.vehicle = 'snowmobile'; player.vehicleTimer = 10; player.boost = 2.8; player.invulnerable = 1;
    audio.boost(); showMessage('雪地摩托：高速突破'); addCombo(0.7, '载具接管');
  }
}

function showMessage(text) { run.message = text; run.messageTimer = 2.3; }

function update(dt) {
  gameTime += dt; flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt * 18);
  run.messageTimer = Math.max(0, run.messageTimer - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.jumpGrace = Math.max(0, player.jumpGrace - dt);
  player.boost = Math.max(0, player.boost - dt);
  player.companionTimer = Math.max(0, player.companionTimer - dt);
  player.vehicleTimer = Math.max(0, player.vehicleTimer - dt);
  if (player.companionTimer === 0) player.companion = null;
  if (player.vehicleTimer === 0) player.vehicle = null;

  const worldDifficulty = Math.min(1, run.distance / 9000);
  run.stage = Math.min(5, Math.floor(run.distance / 1500) + 1);
  run.stageName = ['松林雪谷', '冰封湖区', '废弃观测站', '极光峰顶', '极限逃亡'][run.stage - 1];
  if (run.distance > nextCheckpoint) {
    showMessage(`${run.stageName} · 雪崩加速`); avalanche.speed += 12;
    player.boost = Math.max(player.boost, 1.3); nextCheckpoint += 1500;
  }

  if (player.crashed) {
    player.crashTimer -= dt; player.vy += GRAVITY * dt; player.y += player.vy * dt;
    player.x += player.vx * dt; player.angle += player.angularVelocity * dt;
    const gy = groundY(player.x) - player.radius;
    if (player.y > gy) { player.y = gy; player.vy *= -0.18; player.vx *= 0.95; emitSnow(player.x, player.y + 15, 4, 0.6); }
    if (player.crashTimer <= 0) finishGame('crash');
    updateAvalanche(dt, worldDifficulty); updateParticles(dt); updateUI(); return;
  }

  const slope = groundSlope(player.x);
  const slopeForce = Math.sin(slope) * 430;
  const baseTarget = 425 + worldDifficulty * 95 + (player.vehicle ? 210 : 0)
    + (player.companion === 'dog' && player.grounded ? 65 : 0) + (player.boost > 0 ? 160 : 0);

  if (player.grounded) {
    player.crouched = inputHeld;
    const crouchBonus = inputHeld ? 90 : 0;
    player.vx += (baseTarget + crouchBonus - player.vx) * Math.min(1, dt * 1.7);
    player.vx += slopeForce * dt;
    player.vx = Math.max(250, Math.min(player.vehicle ? 840 : 680, player.vx));
    player.x += player.vx * dt;
    const nextGround = groundY(player.x) - player.radius - (player.vehicle ? 7 : 2);
    const drop = nextGround - player.y;
    if (drop > 17 && slope < -0.05) {
      player.grounded = false; player.jumpGrace = 0.11; player.vy = 0;
    } else {
      player.y += (nextGround - player.y) * Math.min(1, dt * 18);
      player.angle = lerpAngle(player.angle, slope, Math.min(1, dt * 12));
      player.angularVelocity *= 0.7;
      player.trailTimer -= dt;
      if (player.trailTimer <= 0) {
        emitSnow(player.x - 14, player.y + 17, inputHeld ? 3 : 1, inputHeld ? 0.75 : 0.35);
        player.trailTimer = inputHeld ? 0.035 : 0.075;
      }
    }
  } else {
    player.airTime += dt; player.vy += GRAVITY * dt; player.x += player.vx * dt; player.y += player.vy * dt;
    if (inputHeld) player.angularVelocity += 6.8 * dt; else player.angularVelocity *= Math.pow(0.6, dt);
    player.angularVelocity = Math.min(6.2, player.angularVelocity); player.angle += player.angularVelocity * dt;
    const gy = groundY(player.x) - player.radius - (player.vehicle ? 7 : 2);
    if (player.y >= gy && player.vy > 0) land(gy);
  }

  run.distance = Math.max(run.distance, (player.x - 370) * 0.1);
  run.score += player.vx * dt * 0.012 * run.combo;
  if (run.comboTimer > 0) run.comboTimer -= dt; else run.combo += (1 - run.combo) * Math.min(1, dt * 1.7);
  cameraX += (player.x - PLAYER_SCREEN_X / WORLD_SCALE - cameraX) * Math.min(1, dt * 8);
  generateTerrainUntil(player.x + 1900); spawnEntitiesUntil(player.x + 1700);
  updateEntities(); updateAvalanche(dt, worldDifficulty); updateParticles(dt);
  audio.setIntensity(player.vx, run.danger); updateUI();
}

function land(ground) {
  const slope = groundSlope(player.x);
  const difference = Math.abs(normalizeAngle(normalizeAngle(player.angle) - slope));
  const completedRotations = Math.floor(Math.abs(player.angle - player.lastAngle) / TAU);
  const perfect = difference < 0.5;
  player.y = ground; player.grounded = true; player.vy = 0; player.angle = slope;
  player.angularVelocity = 0; player.jumpGrace = 0;
  if (!perfect && difference > 1.25 && player.airTime > 0.22) { crash('landing'); return; }
  if (player.airTime > 0.34) {
    if (perfect) {
      const bonus = 0.35 + completedRotations * 0.55 + Math.min(0.5, player.airTime * 0.12);
      addCombo(bonus, completedRotations ? `${completedRotations}× 空翻 · 完美落地` : '完美落地');
      run.perfectLandings += 1; player.boost = Math.max(player.boost, 0.55 + completedRotations * 0.2);
      audio.land(true); emitSpark(player.x, player.y, palette.accent, 8 + completedRotations * 4);
    } else {
      floatingTexts.push({ x: player.x, y: player.y - 60, text: '安全落地', life: 0.8, maxLife: 0.8 });
      audio.land(false);
    }
  }
  player.airTime = 0;
}

function updateEntities() {
  const px = player.x; const py = player.y;
  for (const e of entities) {
    if (!e.active) continue;
    if (e.type === 'supply') e.y += Math.sin(gameTime * 3 + e.bob) * 0.18;
    const dx = e.x - px; const baseY = e.type === 'supply' ? e.y : groundY(e.x); const dy = baseY - py;
    if (Math.abs(dx) > 90) continue;
    if (['supply', 'dog', 'penguin', 'snowmobile'].includes(e.type)) {
      const radius = e.type === 'supply' ? 31 : 40;
      if (dx * dx + dy * dy < radius * radius) collectEntity(e);
      continue;
    }
    if (e.type === 'jump') {
      if (player.grounded && dx > -15 && dx < 34) {
        player.vy = -510 - Math.min(100, player.vx * 0.09); player.grounded = false;
        player.airTime = 0; player.lastAngle = player.angle; e.active = false;
        audio.jump(); emitSnow(player.x, player.y + 15, 14, 1);
      }
      continue;
    }
    const height = e.type === 'tree' ? 72 : 36;
    const width = e.type === 'tree' ? 27 : 42;
    const hit = Math.abs(dx) < width && player.y + player.radius > baseY - height;
    if (hit) {
      if (player.vehicle) {
        e.active = false; run.score += 180 * run.combo; addCombo(0.18, '强行突破', e.x, baseY - height);
        emitSpark(e.x, baseY - 30, palette.gold, 18); shake = 6;
      } else crash(e.type);
    } else if (!e.nearMiss && dx < -18 && dx > -75 && Math.abs(player.y - (baseY - height * 0.5)) < 75) {
      e.nearMiss = true; run.nearMisses += 1; addCombo(0.15, '擦身而过', e.x, baseY - height);
    }
  }
  entities = entities.filter((e) => e.active && e.x > cameraX - 500);
}

function updateAvalanche(dt, difficulty) {
  avalanche.speed = 315 + difficulty * 115 + Math.sin(gameTime * 0.34) * 16;
  if (run.stage >= 4) avalanche.speed += 24;
  avalanche.x += avalanche.speed * dt;
  const idealGap = 1120 - difficulty * 360;
  const gap = player.x - avalanche.x;
  if (gap > idealGap) avalanche.x += (gap - idealGap) * dt * 0.07;
  if (player.crashed) avalanche.x += 155 * dt;
  run.danger = Math.max(0, Math.min(1, 1 - (gap - 80) / 920));
  avalanche.wave += dt * (2.5 + run.danger * 3);
  if (gap < 120 && !player.crashed) crash('avalanche');
  if (gap < 40) finishGame('avalanche');
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.gravity ?? 400) * dt; p.vx *= Math.pow(0.18, dt);
  }
  particles = particles.filter((p) => p.life > 0);
  for (const t of floatingTexts) { t.life -= dt; t.y -= 38 * dt; }
  floatingTexts = floatingTexts.filter((t) => t.life > 0);
}

function emitSnow(x, y, count, power = 1) {
  if (reduceMotion) count = Math.ceil(count * 0.4);
  for (let i = 0; i < count; i += 1) particles.push({
    x: x + Math.random() * 22 - 11, y: y + Math.random() * 10 - 5,
    vx: -60 - Math.random() * 150 * power, vy: -30 - Math.random() * 180 * power,
    size: 2 + Math.random() * 6, life: 0.35 + Math.random() * 0.55,
    maxLife: 0.9, color: '#e9fbff', gravity: 260,
  });
}

function emitSpark(x, y, color, count) {
  if (reduceMotion) count = Math.ceil(count * 0.5);
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * TAU; const speed = 80 + Math.random() * 220;
    particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      size: 2 + Math.random() * 4, life: 0.35 + Math.random() * 0.5, maxLife: 0.85, color, gravity: 140 });
  }
}

function updateUI() {
  ui.distance.textContent = `${Math.floor(run.distance)} m`;
  ui.score.textContent = Math.floor(run.score).toLocaleString('zh-CN');
  ui.combo.textContent = `×${run.combo.toFixed(1)}`;
  ui.dangerFill.style.width = `${Math.max(4, run.danger * 100)}%`;
  ui.dangerText.textContent = run.danger < 0.3 ? '安全' : run.danger < 0.58 ? '警戒' : run.danger < 0.82 ? '危险' : '极近';
  const chips = [`<span class="status-chip">${run.stageName}</span>`];
  if (player.companion) chips.push(`<span class="status-chip"><b>${player.companion === 'dog' ? '雪橇犬' : '企鹅'}</b> ${Math.ceil(player.companionTimer)}s</span>`);
  if (player.vehicle) chips.push(`<span class="status-chip"><b>雪地摩托</b> ${Math.ceil(player.vehicleTimer)}s</span>`);
  if (player.shield) chips.push('<span class="status-chip"><b>护盾</b> 可抵挡一次碰撞</span>');
  ui.statusChips.innerHTML = chips.join('');
}

function render() {
  const sx = canvas.width / 1280; const sy = canvas.height / 720;
  ctx.save(); ctx.scale(sx, sy);
  ctx.translate(shake ? (Math.random() - 0.5) * shake : 0, shake ? (Math.random() - 0.5) * shake * 0.6 : 0);
  drawSky(); drawMountains(); drawTerrain(); drawAvalanche(); drawEntities();
  drawParticles(); drawPlayer(); drawFloatingTexts(); drawMessage(); drawScreenEffects();
  ctx.restore();
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, palette.skyTop); gradient.addColorStop(0.62, palette.skyBottom); gradient.addColorStop(1, '#bfe1e8');
  ctx.fillStyle = gradient; ctx.fillRect(-40, -40, 1360, 800);
  ctx.globalAlpha = 0.72; ctx.fillStyle = palette.sun; ctx.beginPath(); ctx.arc(1010, 150, 45, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 54; i += 1) {
    const x = ((i * 173 + gameTime * (14 + (i % 4) * 3)) % 1400) - 60;
    const y = (i * 83 + Math.sin(i * 4.2) * 50) % 500;
    ctx.globalAlpha = 0.2 + (i % 5) * 0.08; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMountains() {
  drawMountainLayer(0.08, 390, 120, palette.far, 0.7);
  drawMountainLayer(0.18, 445, 92, palette.mid, 0.95);
  drawMountainLayer(0.32, 500, 62, '#7eb0bf', 1);
}

function drawMountainLayer(parallax, baseY, amplitude, color, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-20, 720);
  for (let x = -20; x <= 1320; x += 40) {
    const wx = x + cameraX * parallax;
    const y = baseY + Math.sin(wx * 0.0031 + parallax * 20) * amplitude * 0.4 + Math.sin(wx * 0.0087) * amplitude * 0.28;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(1320, 720); ctx.closePath(); ctx.fill(); ctx.restore();
}

function drawTerrain() {
  ctx.save(); ctx.translate(-cameraX * WORLD_SCALE, 0);
  const left = cameraX - 100; const right = cameraX + 1600;
  ctx.beginPath(); let started = false;
  for (const p of terrain) {
    if (p.x < left - 100 || p.x > right + 100) continue;
    const x = p.x * WORLD_SCALE;
    if (!started) { ctx.moveTo(x, p.y); started = true; } else ctx.lineTo(x, p.y);
  }
  ctx.lineTo(right * WORLD_SCALE + 100, 760); ctx.lineTo((left - 100) * WORLD_SCALE, 760); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 400, 0, 720);
  gradient.addColorStop(0, palette.snow); gradient.addColorStop(1, '#a9d5df');
  ctx.fillStyle = gradient; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.globalAlpha = 0.18; ctx.strokeStyle = '#2e7894'; ctx.lineWidth = 2;
  for (let offset = 22; offset < 95; offset += 24) {
    ctx.beginPath(); started = false;
    for (const p of terrain) {
      if (p.x < left || p.x > right) continue;
      const x = p.x * WORLD_SCALE; const y = p.y + offset + Math.sin(p.x * 0.02 + offset) * 3;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAvalanche() {
  const screenX = (avalanche.x - cameraX) * WORLD_SCALE;
  ctx.save();
  const gradient = ctx.createLinearGradient(screenX - 140, 0, screenX + 130, 0);
  gradient.addColorStop(0, 'rgba(239,250,255,0.98)'); gradient.addColorStop(0.7, 'rgba(207,238,247,0.88)'); gradient.addColorStop(1, 'rgba(194,230,240,0)');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(screenX - 220, 720);
  for (let y = 720; y >= 65; y -= 24) {
    const wobble = Math.sin(y * 0.038 + avalanche.wave) * 28 + Math.sin(y * 0.12 - avalanche.wave * 1.7) * 12;
    ctx.lineTo(screenX + wobble + (720 - y) * 0.12, y);
  }
  ctx.lineTo(screenX - 220, 0); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 26; i += 1) {
    const x = screenX + Math.sin(i * 7.8 + gameTime * 5) * 125 + (i % 4) * 22;
    const y = (i * 59 + gameTime * (75 + i % 5 * 12)) % 760;
    ctx.fillStyle = '#f3fcff'; ctx.beginPath(); ctx.arc(x, y, 6 + (i % 5) * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawEntities() {
  ctx.save();
  for (const e of entities) {
    if (!e.active) continue;
    const x = (e.x - cameraX) * WORLD_SCALE;
    if (x < -100 || x > 1380) continue;
    const gy = groundY(e.x);
    if (e.type === 'tree') drawTree(x, gy);
    else if (e.type === 'rock') drawRock(x, gy);
    else if (e.type === 'jump') drawJump(x, gy);
    else if (e.type === 'supply') drawSupply(x, e.y);
    else if (e.type === 'dog') drawDog(x, gy - 15);
    else if (e.type === 'penguin') drawPenguin(x, gy - 22);
    else if (e.type === 'snowmobile') drawSnowmobile(x, gy - 16, 0, 0.86);
  }
  ctx.restore();
}

function drawTree(x, y) {
  ctx.fillStyle = '#503c32'; ctx.fillRect(x - 5, y - 54, 10, 54); ctx.fillStyle = '#123f43';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath(); ctx.moveTo(x, y - 103 + i * 24); ctx.lineTo(x - 34 + i * 4, y - 44 + i * 16);
    ctx.lineTo(x + 34 - i * 4, y - 44 + i * 16); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#eefbff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 25, y - 69); ctx.lineTo(x, y - 98); ctx.lineTo(x + 24, y - 69); ctx.stroke();
}

function drawRock(x, y) {
  ctx.fillStyle = '#385263'; ctx.beginPath(); ctx.moveTo(x - 28, y); ctx.lineTo(x - 20, y - 30); ctx.lineTo(x + 4, y - 43); ctx.lineTo(x + 30, y - 12); ctx.lineTo(x + 24, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d9f0f6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 18, y - 28); ctx.lineTo(x + 4, y - 43); ctx.lineTo(x + 13, y - 31); ctx.stroke();
}

function drawJump(x, y) {
  ctx.fillStyle = '#8bd9e6'; ctx.beginPath(); ctx.moveTo(x - 55, y); ctx.quadraticCurveTo(x, y - 44, x + 58, y - 63); ctx.lineTo(x + 58, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 55, y); ctx.quadraticCurveTo(x, y - 44, x + 58, y - 63); ctx.stroke();
}

function drawSupply(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(gameTime * 0.5); ctx.fillStyle = palette.gold;
  roundedRect(-13, -13, 26, 26, 6); ctx.fill(); ctx.strokeStyle = '#6f5722'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff5c8'; ctx.fillRect(-3, -9, 6, 18); ctx.fillRect(-9, -3, 18, 6); ctx.restore();
}

function drawDog(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#8d5b3c';
  ctx.beginPath(); ctx.ellipse(0, 0, 25, 14, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(22, -7, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f7e6cf'; ctx.beginPath(); ctx.ellipse(27, -4, 7, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = palette.dark; ctx.beginPath(); ctx.arc(26, -10, 2, 0, TAU); ctx.fill();
  ctx.fillStyle = palette.accent; ctx.fillRect(-6, 10, 8, 13); ctx.fillRect(13, 9, 8, 13);
  ctx.strokeStyle = '#8d5b3c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-22, -2); ctx.quadraticCurveTo(-36, -18, -26, -25); ctx.stroke(); ctx.restore();
}

function drawPenguin(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#132b3a'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 26, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f5fbff'; ctx.beginPath(); ctx.ellipse(3, 6, 10, 16, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = palette.gold; ctx.beginPath(); ctx.moveTo(13, -8); ctx.lineTo(25, -3); ctx.lineTo(13, 1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-7, 24, 10, 4, 0, 0, TAU); ctx.fill(); ctx.restore();
}

function drawSnowmobile(x, y, angle = 0, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  ctx.strokeStyle = '#112a3a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-38, 12); ctx.quadraticCurveTo(-8, 28, 31, 14); ctx.stroke();
  ctx.fillStyle = palette.red; roundedRect(-25, -12, 48, 25, 8); ctx.fill();
  ctx.fillStyle = '#d7f8ff'; ctx.beginPath(); ctx.moveTo(10, -12); ctx.lineTo(29, -26); ctx.lineTo(33, -9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d7f8ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(25, 8); ctx.lineTo(43, 16); ctx.lineTo(56, 13); ctx.stroke(); ctx.restore();
}

function drawPlayer() {
  const x = (player.x - cameraX) * WORLD_SCALE; const y = player.y;
  ctx.save(); ctx.translate(x, y); ctx.rotate(player.angle);
  if (player.invulnerable > 0 && Math.floor(gameTime * 12) % 2 === 0) ctx.globalAlpha = 0.42;
  if (player.vehicle) { drawSnowmobile(0, 8, 0, 1.12); ctx.translate(-2, -24); }
  if (player.shield) {
    ctx.strokeStyle = 'rgba(116,239,255,0.8)'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.arc(0, -8, 35 + Math.sin(gameTime * 5) * 2, 0, TAU); ctx.stroke();
  }
  if (!player.vehicle) {
    ctx.strokeStyle = palette.dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-27, 21); ctx.lineTo(32, 21); ctx.stroke();
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-29, 18); ctx.lineTo(31, 18); ctx.stroke();
  }
  const crouch = player.crouched && player.grounded ? 8 : 0;
  ctx.strokeStyle = '#132431'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-2, -5 + crouch); ctx.lineTo(-13, 13); ctx.lineTo(-23, 17);
  ctx.moveTo(-1, -5 + crouch); ctx.lineTo(12, 12); ctx.lineTo(22, 17); ctx.stroke();
  ctx.fillStyle = palette.red; roundedRect(-14, -31 + crouch, 28, 31, 9); ctx.fill();
  ctx.strokeStyle = palette.dark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-10, -19 + crouch); ctx.lineTo(-27, -5 + crouch); ctx.moveTo(10, -19 + crouch); ctx.lineTo(25, -1 + crouch); ctx.stroke();
  ctx.fillStyle = '#f0c7a9'; ctx.beginPath(); ctx.arc(0, -41 + crouch, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = '#153b55'; ctx.beginPath(); ctx.arc(0, -45 + crouch, 13, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = palette.accent; ctx.fillRect(-13, -43 + crouch, 26, 6);
  if (player.companion === 'dog') drawDog(-57, 1);
  if (player.companion === 'penguin') drawPenguin(-48, 4);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const x = (p.x - cameraX) * WORLD_SCALE; ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, p.y, p.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  ctx.textAlign = 'center'; ctx.font = '700 16px system-ui';
  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.min(1, t.life * 2); ctx.fillStyle = '#f7fdff';
    ctx.fillText(t.text, (t.x - cameraX) * WORLD_SCALE, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawMessage() {
  if (run.messageTimer <= 0 || state !== 'running') return;
  const alpha = Math.min(1, run.messageTimer, (2.3 - run.messageTimer) * 3);
  ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.font = '700 22px system-ui'; ctx.fillStyle = '#fff';
  ctx.fillText(run.message, 640, 180); ctx.font = '500 12px system-ui'; ctx.fillStyle = palette.accent;
  ctx.fillText(`第 ${run.stage} 阶段`, 640, 203); ctx.globalAlpha = 1;
}

function drawScreenEffects() {
  if (run.danger > 0.6) {
    const alpha = (run.danger - 0.6) * 0.55 * (0.75 + Math.sin(gameTime * 8) * 0.25);
    const gradient = ctx.createLinearGradient(0, 0, 360, 0);
    gradient.addColorStop(0, `rgba(255, 244, 230, ${alpha})`); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 420, 720);
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, 1280, 720); }
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function normalizeAngle(angle) {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  if (value < -Math.PI) value += TAU;
  return value;
}
function lerpAngle(a, b, t) { return a + normalizeAngle(b - a) * t; }

function loop(now) {
  const elapsed = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
  if (state === 'running') {
    accumulator += elapsed; const step = 1 / 120;
    while (accumulator >= step) { update(step); accumulator -= step; }
  }
  render(); requestAnimationFrame(loop);
}

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowDown', 'KeyS'].includes(event.code)) { event.preventDefault(); setInput(true); }
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  if (event.code === 'Enter' && (state === 'menu' || state === 'gameover')) startGame();
});
window.addEventListener('keyup', (event) => {
  if (['Space', 'ArrowDown', 'KeyS'].includes(event.code)) { event.preventDefault(); setInput(false); }
});
canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); setInput(true); });
window.addEventListener('pointerup', () => setInput(false));
window.addEventListener('pointercancel', () => setInput(false));
ui.touchAction.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); setInput(true); });
ui.touchAction.addEventListener('pointerup', (event) => { event.preventDefault(); event.stopPropagation(); setInput(false); });
ui.startBtn.addEventListener('click', startGame);
ui.pauseBtn.addEventListener('click', togglePause);
ui.resumeBtn.addEventListener('click', togglePause);
ui.restartPauseBtn.addEventListener('click', startGame);
ui.restartBtn.addEventListener('click', startGame);
ui.backMenuBtn.addEventListener('click', backToMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'running') togglePause(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

resetGame();
requestAnimationFrame(loop);
