// Timing constants (in seconds). FAST TEST BRANCH — production uses 30*60 / 60*60.
// Chosen so eye fires at 5s (first-half end) and eye+move co-fire at 10s
// (hour mark) — same cadence as production, just compressed 360x.
const EYE_INTERVAL = 5;    // 5s instead of 30 min
const MOVE_INTERVAL = 10;  // 10s instead of 60 min
const PHASE1_MS = 1000;  // dot expansion
// phase 2 (running UI fade-in) is CSS-driven, ~1000ms
const BREAK_BELL_INTERVAL_MS = 30000;  // re-ring every 30s while waiting for ack

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
// false = first 30-min of the hour (dock dot grows 0 -> 1)
// true  = second 30-min of the hour (dock dot shrinks 1 -> 0)
let secondHalf = false;

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
    document.body.classList.add('paused');
  } else {
    statusDot.classList.remove('paused');
    statusText.textContent = '运行中';
    pauseBtn.textContent = '暂停';
    document.body.classList.remove('paused');
  }
}

function togglePauseResume() {
  if (current === state.RUNNING) {
    current = state.PAUSED;
    stopTicking();
  } else if (current === state.PAUSED) {
    current = state.RUNNING;
    startTicking();
  } else {
    return;
  }
  render();
  if (document.body.classList.contains('docked')) updateDock();
}

// ---- Bell synthesis (Web Audio) ----
// Round, soft cathedral-bell character: sub-octave hum gives body, classic
// struck-bell partials (hum / prime / minor 3rd / 5th / nominal / upper),
// per-partial decay (low partials sustain longest — bloom), slight detune
// for liveness, and a short procedural reverb for room around the strike.
let audioCtx = null;
let bellInput = null;        // lazily-built signal chain entry node
const BELL_GAP_MS = 1400;    // bells breathe instead of clang

function makeReverbIR(ctx, duration = 1.0, decay = 3.0) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function ensureBellChain() {
  if (bellInput) return bellInput;
  const ctx = audioCtx;

  // Warmth lowpass — softens the edge of upper partials without dulling them.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.Q.value = 0.6;

  // Subtle small-room reverb — depth without smearing the bell.
  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbIR(ctx, 1.0, 3.0);
  const wet = ctx.createGain();
  wet.gain.value = 0.18;

  filter.connect(ctx.destination);   // dry
  filter.connect(convolver);
  convolver.connect(wet);
  wet.connect(ctx.destination);      // wet

  bellInput = filter;
  return bellInput;
}

function playSingleBell() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const ctx = audioCtx;
    const now = ctx.currentTime;
    const fundamental = 392;  // G4
    const attack = 0.18;       // ~180ms soft onset
    const input = ensureBellChain();

    // Classic struck-bell partial structure. Each row gets its own decay so
    // the hum sustains long after upper partials fade — that staggered fall
    // is what gives a bell its rounded, blooming quality. Slight detune
    // adds beating/liveness without sounding out of tune.
    const partials = [
      // ratio,   gain,   decay(s), detune(cents)
      { ratio: 0.500, gain: 0.13, decay: 6.5, detune:  0 },  // hum (sub-octave) — body
      { ratio: 1.000, gain: 0.16, decay: 5.5, detune: -2 },  // prime
      { ratio: 1.193, gain: 0.05, decay: 4.5, detune: +3 },  // minor third (tierce)
      { ratio: 1.500, gain: 0.05, decay: 4.0, detune: -1 },  // perfect fifth (quint)
      { ratio: 2.000, gain: 0.06, decay: 3.5, detune: +2 },  // nominal / octave
      { ratio: 2.520, gain: 0.020, decay: 2.5, detune:  0 }, // upper, faster
      { ratio: 3.010, gain: 0.012, decay: 2.0, detune:  0 }, // sparkle, briefest
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = fundamental * p.ratio;
      osc.detune.value = p.detune;
      osc.connect(gain).connect(input);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(p.gain, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + p.decay);
      osc.start(now);
      osc.stop(now + attack + p.decay + 0.1);
    });
  } catch (_) { /* audio not available */ }
}

function playBell(count = 1) {
  for (let i = 0; i < count; i++) {
    setTimeout(playSingleBell, i * BELL_GAP_MS);
  }
}

// ---- Break state (timer paused at 0, awaiting user ack) ----
let inBreak = false;
const breakNeeds = { eye: false, move: false };
let breakBellInterval = null;

function bellCountForBreak() {
  return breakNeeds.move ? 3 : 1;
}

function startBreak() {
  if (inBreak) return;
  inBreak = true;
  document.body.classList.add('break');
  if (breakNeeds.move) document.body.classList.add('break-move');
  playBell(bellCountForBreak());
  if (breakBellInterval) clearInterval(breakBellInterval);
  breakBellInterval = setInterval(() => {
    if (inBreak) playBell(bellCountForBreak());
  }, BREAK_BELL_INTERVAL_MS);
}

function triggerEyeBreak() {
  breakNeeds.eye = true;
  eyeCount += 1;
  notify('看一眼窗外', '把目光放到最远处，半秒钟就好');
}

function triggerMoveBreak() {
  breakNeeds.move = true;
  moveCount += 1;
  notify('起来动一下', '站起来，喝口水，伸展一下身体');
}

function acknowledgeBreak() {
  if (!inBreak) return;
  inBreak = false;
  document.body.classList.remove('break');
  document.body.classList.remove('break-move');
  if (breakBellInterval) {
    clearInterval(breakBellInterval);
    breakBellInterval = null;
  }
  // Decide which half comes next BEFORE we clear the need flags.
  // move ack -> hour done -> next cycle is first half (dot grows from 0)
  // eye-only ack -> first half done -> next cycle is second half (dot starts full, shrinks)
  if (breakNeeds.move) {
    secondHalf = false;
  } else if (breakNeeds.eye) {
    secondHalf = true;
  }
  if (breakNeeds.eye) {
    eyeRemaining = EYE_INTERVAL;
    breakNeeds.eye = false;
  }
  if (breakNeeds.move) {
    moveRemaining = MOVE_INTERVAL;
    breakNeeds.move = false;
  }
  render();
  if (document.body.classList.contains('docked')) {
    updateDock(true);
  }
}

function clearBreak() {
  if (breakBellInterval) {
    clearInterval(breakBellInterval);
    breakBellInterval = null;
  }
  inBreak = false;
  breakNeeds.eye = false;
  breakNeeds.move = false;
  document.body.classList.remove('break');
  document.body.classList.remove('break-move');
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
  if (inBreak) return;  // both timers freeze until user acks

  incrementFocusToday();
  eyeRemaining -= 1;
  moveRemaining -= 1;

  let needsBreak = false;
  if (eyeRemaining <= 0) {
    eyeRemaining = 0;
    triggerEyeBreak();
    needsBreak = true;
  }
  if (moveRemaining <= 0) {
    moveRemaining = 0;
    triggerMoveBreak();
    needsBreak = true;
  }
  // start the break AFTER both needs are set so bell count / overlay
  // reflect "is this an hour mark?" correctly.
  if (needsBreak) startBreak();

  render();

  if (document.body.classList.contains('docked')) {
    updateDock();
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

  // unlock audio while we still have a user gesture
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) {}

  document.body.classList.add('transitioning');

  setTimeout(() => {
    document.body.classList.remove('transitioning');
    document.body.classList.add('running');

    eyeRemaining = EYE_INTERVAL;
    moveRemaining = MOVE_INTERVAL;
    eyeCount = 0;
    moveCount = 0;
    secondHalf = false;
    current = state.RUNNING;
    render();
    startTicking();
  }, PHASE1_MS);
});

pauseBtn.addEventListener('click', togglePauseResume);

stopBtn.addEventListener('click', () => {
  current = state.IDLE;
  stopTicking();
  clearBreak();
  document.body.classList.remove('running');
  eyeRemaining = EYE_INTERVAL;
  moveRemaining = MOVE_INTERVAL;
  secondHalf = false;
});

// Click anywhere (except system buttons) to acknowledge a pending break
document.body.addEventListener('click', (e) => {
  if (!inBreak) return;
  if (e.target.closest('.win-btn, .undock-btn, #pause-btn, #stop-btn, #start-btn')) return;
  acknowledgeBreak();
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
  // First half: dot grows 0 -> 1 as eyeRemaining drains.
  // Second half: dot shrinks 1 -> 0 as eyeRemaining drains, so each
  //              hour interval is two distinct shapes back-to-back.
  const raw = secondHalf
    ? eyeRemaining / EYE_INTERVAL
    : 1 - eyeRemaining / EYE_INTERVAL;
  return Math.max(0, Math.min(1, raw));
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

// Center of the docked panel is a no-drag overlay button — clicks fire
// reliably there (a -webkit-app-region: drag area swallows mousedown on
// Windows). The ~14px rim around it stays drag for window repositioning.
document.getElementById('dock-toggle-btn').addEventListener('click', () => {
  if (!document.body.classList.contains('docked')) return;
  if (inBreak) return;  // body click handler acks the break instead
  togglePauseResume();
});

// ---- Daily focus accumulator ----
const FOCUS_KEY_PREFIX = 'focus-seconds-';

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getFocusSeconds(key) {
  const v = localStorage.getItem(FOCUS_KEY_PREFIX + key);
  return v ? parseInt(v, 10) || 0 : 0;
}

function incrementFocusToday() {
  const k = dateKey();
  const next = getFocusSeconds(k) + 1;
  localStorage.setItem(FOCUS_KEY_PREFIX + k, String(next));
}

function formatFocusDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} 小时 ${m} 分 ${s} 秒`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

// Returns the Monday-of-this-week as a Date at local 00:00:00.
// JS getDay(): Sunday=0, Monday=1 ... Saturday=6.
function startOfThisWeek(d = new Date()) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay();
  const offset = (day === 0) ? -6 : (1 - day);  // shift back to Monday
  out.setDate(out.getDate() + offset);
  return out;
}

function getWeekFocusSeconds(now = new Date()) {
  const monday = startOfThisWeek(now);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    total += getFocusSeconds(dateKey(d));
  }
  return total;
}

// ---- Stats panel ----
const statsBtn = document.getElementById('open-stats');
const statsPanel = document.getElementById('stats-panel');
const statsClose = document.getElementById('stats-close');
const datePicker = document.getElementById('focus-date-picker');
const pickerTrigger = document.getElementById('picker-trigger');
const todayFocusEl = document.getElementById('today-focus-time');
const weekFocusEl = document.getElementById('week-focus-time');
const pickedFocusEl = document.getElementById('picked-focus-time');
const pickedDateLabel = document.getElementById('picked-date-label');

function refreshStatsPanel() {
  const today = dateKey();
  todayFocusEl.textContent = formatFocusDuration(getFocusSeconds(today));
  weekFocusEl.textContent = formatFocusDuration(getWeekFocusSeconds());
  if (!datePicker.value) datePicker.value = today;
  const picked = datePicker.value;
  pickedDateLabel.textContent = picked;
  pickedFocusEl.textContent = formatFocusDuration(getFocusSeconds(picked));
}

statsBtn.addEventListener('click', () => {
  refreshStatsPanel();
  statsPanel.classList.add('visible');
});

statsClose.addEventListener('click', () => {
  statsPanel.classList.remove('visible');
});

statsPanel.addEventListener('click', (e) => {
  if (e.target === statsPanel) statsPanel.classList.remove('visible');
});

datePicker.addEventListener('change', refreshStatsPanel);

pickerTrigger.addEventListener('click', () => {
  if (typeof datePicker.showPicker === 'function') {
    try { datePicker.showPicker(); } catch (_) { datePicker.focus(); }
  } else {
    datePicker.focus();
  }
});
