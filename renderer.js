// Timing constants (in seconds). Edit for testing — e.g. 10/20.
const EYE_INTERVAL = 30 * 60;   // every 30 minutes
const MOVE_INTERVAL = 60 * 60;  // every 60 minutes
const PHASE1_MS = 1000;  // dot expansion
// phase 2 (running UI fade-in) is CSS-driven, ~1000ms

const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const eyeEl = document.getElementById('eye-countdown');
const moveEl = document.getElementById('move-countdown');
const statsEl = document.getElementById('stats');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

const state = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused'
});

let current = state.IDLE;
let tickHandle = null;
let eyeRemaining = EYE_INTERVAL;
let moveRemaining = MOVE_INTERVAL;
let eyeCount = 0;
let moveCount = 0;

function format(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function render() {
  eyeEl.textContent = format(eyeRemaining);
  moveEl.textContent = format(moveRemaining);
  statsEl.textContent = `今日 · 看窗外 ${eyeCount} 次 · 活动 ${moveCount} 次`;

  if (current === state.PAUSED) {
    statusDot.classList.add('paused');
    statusText.textContent = '已暂停';
    pauseBtn.textContent = '继续';
  } else {
    statusDot.classList.remove('paused');
    statusText.textContent = '运行中';
    pauseBtn.textContent = '暂停';
  }
}

async function notify(title, body) {
  try {
    if (window.helper && window.helper.notify) {
      await window.helper.notify(title, body);
      return;
    }
  } catch (_) { /* fall through */ }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, silent: false });
  }
}

function tick() {
  if (current !== state.RUNNING) return;

  eyeRemaining -= 1;
  moveRemaining -= 1;

  let eyeReset = false;

  if (eyeRemaining <= 0) {
    eyeCount += 1;
    notify('看一眼窗外', '把目光放到最远处，半秒钟就好');
    eyeRemaining = EYE_INTERVAL;
    eyeReset = true;
  }

  if (moveRemaining <= 0) {
    moveCount += 1;
    notify('起来动一下', '站起来，喝口水，伸展一下身体');
    moveRemaining = MOVE_INTERVAL;
  }

  render();

  if (document.body.classList.contains('docked')) {
    updateDock(eyeReset);
  }
}

function startTicking() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
}

function stopTicking() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

startBtn.addEventListener('click', async () => {
  if (current !== state.IDLE) return;

  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (_) {}
  }

  document.body.classList.add('transitioning');

  setTimeout(() => {
    document.body.classList.remove('transitioning');
    document.body.classList.add('running');

    eyeRemaining = EYE_INTERVAL;
    moveRemaining = MOVE_INTERVAL;
    eyeCount = 0;
    moveCount = 0;
    current = state.RUNNING;
    render();
    startTicking();
  }, PHASE1_MS);
});

pauseBtn.addEventListener('click', () => {
  if (current === state.RUNNING) {
    current = state.PAUSED;
    stopTicking();
  } else if (current === state.PAUSED) {
    current = state.RUNNING;
    startTicking();
  }
  render();
});

stopBtn.addEventListener('click', () => {
  current = state.IDLE;
  stopTicking();
  document.body.classList.remove('running');
  eyeRemaining = EYE_INTERVAL;
  moveRemaining = MOVE_INTERVAL;
});

document.getElementById('win-min').addEventListener('click', () => {
  if (window.helper && window.helper.minimize) window.helper.minimize();
});
document.getElementById('win-close').addEventListener('click', () => {
  if (window.helper && window.helper.close) window.helper.close();
});

// ---- Dock mode ----
const dockBtn = document.getElementById('win-dock');
const undockBtn = document.getElementById('undock-btn');
const dockDot = document.getElementById('dock-dot');
const dockTimer = document.getElementById('dock-timer');

const MAX_DOCK_SCALE = 15;  // dot grows to fully cover the docked frame

function dockProgress() {
  return Math.max(0, Math.min(1, 1 - eyeRemaining / EYE_INTERVAL));
}

function applyDockDotScale(snap = false) {
  const scale = dockProgress() * MAX_DOCK_SCALE;
  if (snap) {
    dockDot.style.transition = 'none';
    dockDot.style.transform = `scale(${scale})`;
    void dockDot.offsetWidth;
    dockDot.style.transition = '';
  } else {
    dockDot.style.transform = `scale(${scale})`;
  }
}

function updateDock(snap = false) {
  dockTimer.textContent = format(eyeRemaining);
  applyDockDotScale(snap);
}

dockBtn.addEventListener('click', () => {
  if (current === state.IDLE) return;
  document.body.classList.add('docked');
  if (window.helper && window.helper.dock) window.helper.dock();
  updateDock(true);
});

undockBtn.addEventListener('click', () => {
  document.body.classList.remove('docked');
  if (window.helper && window.helper.undock) window.helper.undock();
});
