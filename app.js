const defaults = { focus: 25, break: 5 };
const storageKey = "little-by-little-settings";
const countKey = "little-by-little-sessions";
const ringLength = 2 * Math.PI * 128;

const elements = {
  time: document.querySelector("#timer-time"),
  label: document.querySelector("#timer-label"),
  hint: document.querySelector("#timer-hint"),
  face: document.querySelector("#timer-face"),
  progress: document.querySelector("#progress-value"),
  start: document.querySelector("#start-button"),
  reset: document.querySelector("#reset-button"),
  status: document.querySelector("#status-note"),
  count: document.querySelector("#session-count"),
  dots: document.querySelector("#session-dots"),
  focusLength: document.querySelector("#focus-length"),
  breakLength: document.querySelector("#break-length"),
  settingsNote: document.querySelector("#settings-note"),
  modeTabs: [...document.querySelectorAll(".mode-tab")],
};

function readSavedSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      focus: validLength(saved?.focus, defaults.focus, 180),
      break: validLength(saved?.break, defaults.break, 60),
    };
  } catch {
    elements.settingsNote.textContent = "Couldn’t read saved settings; using the defaults.";
    return { ...defaults };
  }
}

function validLength(value, fallback, max) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= max
    ? minutes
    : fallback;
}

const settings = readSavedSettings();
let completedSessions = readSessionCount();
let sessionDate = today();
let mode = "work";
let running = false;
let remaining = settings.focus * 60;
let endsAt = null;
let tickId = null;

elements.focusLength.value = settings.focus;
elements.breakLength.value = settings.break;

function readSessionCount() {
  try {
    const saved = JSON.parse(localStorage.getItem(countKey));
    if (saved?.date !== today()) return 0;
    return Number.isSafeInteger(saved.count) && saved.count > 0 ? saved.count : 0;
  } catch {
    elements.status.textContent = "Couldn’t read today’s session count; starting at zero.";
    return 0;
  }
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function durationFor(nextMode) {
  return settings[nextMode === "work" ? "focus" : "break"] * 60;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function render() {
  elements.time.textContent = formatTime(remaining);
  elements.face.dataset.mode = mode;
  elements.label.textContent = mode === "work" ? "Time to focus" : "Time to pause";
  elements.hint.textContent = mode === "work"
    ? "One thing at a time."
    : "Step away for a little while.";
  elements.start.textContent = running
    ? "Pause"
    : mode === "work" ? "Start focus" : "Start break";
  elements.start.setAttribute("aria-label", running ? "Pause timer" : elements.start.textContent);

  const progress = 1 - remaining / durationFor(mode);
  elements.progress.style.strokeDasharray = ringLength;
  elements.progress.style.strokeDashoffset = ringLength * progress;

  elements.modeTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  document.title = `${formatTime(remaining)} · ${mode === "work" ? "Focus" : "Break"}`;
  renderSessions();
}

function renderSessions() {
  if (today() !== sessionDate) {
    sessionDate = today();
    completedSessions = 0;
  }

  elements.count.textContent = completedSessions;
  elements.dots.replaceChildren();
  const shownDots = Math.min(completedSessions, 12);

  for (let index = 0; index < shownDots; index += 1) {
    const dot = document.createElement("span");
    dot.className = "session-dot";
    dot.setAttribute("aria-hidden", "true");
    elements.dots.append(dot);
  }

  elements.dots.setAttribute(
    "aria-label",
    `${completedSessions} focus ${completedSessions === 1 ? "session" : "sessions"} finished`,
  );
}

function stopTicking() {
  window.clearInterval(tickId);
  tickId = null;
}

function startTimer() {
  if (running) {
    running = false;
    remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    endsAt = null;
    stopTicking();
    elements.status.textContent = "Paused. Pick it up whenever you like.";
    render();
    return;
  }

  running = true;
  endsAt = Date.now() + remaining * 1000;
  elements.status.textContent = mode === "work" ? "You’re doing fine. Keep going." : "Enjoy the breather.";
  stopTicking();
  tickId = window.setInterval(updateTimer, 250);
  render();
}

function updateTimer() {
  remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  if (remaining === 0) {
    finishTimer();
    return;
  }
  render();
}

function finishTimer() {
  const finishedMode = mode;
  running = false;
  endsAt = null;
  stopTicking();
  renderSessions();
  let countSaved = true;

  if (finishedMode === "work") {
    completedSessions += 1;
    try {
      localStorage.setItem(countKey, JSON.stringify({ date: today(), count: completedSessions }));
    } catch {
      countSaved = false;
    }
  }

  mode = finishedMode === "work" ? "break" : "work";
  remaining = durationFor(mode);
  if (finishedMode === "work") {
    elements.status.textContent = countSaved
      ? "Focus time is over. Your break is ready."
      : "Break is ready, but today's count couldn't be saved.";
  } else {
    elements.status.textContent = "Break’s over. Ready for another focus?";
  }

  notify(finishedMode);
  render();
}

function notify(finishedMode) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const title = finishedMode === "work" ? "Focus session finished" : "Break is over";
  const body = finishedMode === "work"
    ? "Take a few minutes away from your screen."
    : "Come back when you're ready.";
  new Notification(title, { body });
}

function selectMode(nextMode) {
  if (mode === nextMode) return;
  running = false;
  endsAt = null;
  stopTicking();
  mode = nextMode;
  remaining = durationFor(mode);
  elements.status.textContent = "Timer reset for a fresh start.";
  render();
}

function resetTimer() {
  running = false;
  endsAt = null;
  stopTicking();
  remaining = durationFor(mode);
  elements.status.textContent = "Ready when you are.";
  render();
}

function saveSettings() {
  const focus = validLength(elements.focusLength.value, settings.focus, 180);
  const breakLength = validLength(elements.breakLength.value, settings.break, 60);

  settings.focus = focus;
  settings.break = breakLength;
  elements.focusLength.value = focus;
  elements.breakLength.value = breakLength;

  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
    elements.settingsNote.textContent = "Changes are saved on this device.";
  } catch {
    elements.settingsNote.textContent = "Couldn’t save settings in this browser.";
  }

  if (!running) {
    remaining = durationFor(mode);
    render();
  }
}

elements.start.addEventListener("click", () => {
  const askForPermission = !running
    && "Notification" in window
    && Notification.permission === "default";
  startTimer();
  if (askForPermission) {
    Notification.requestPermission().catch(() => {
      elements.status.textContent = "Timer started. Notifications aren’t available right now.";
    });
  }
});

elements.reset.addEventListener("click", resetTimer);
elements.modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => selectMode(tab.dataset.mode));
});
elements.focusLength.addEventListener("change", saveSettings);
elements.breakLength.addEventListener("change", saveSettings);

document.addEventListener("visibilitychange", () => {
  if (running && !document.hidden) updateTimer();
});

render();
