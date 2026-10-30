import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import {
  BOARD_THEMES,
  LIMITS,
  SCORE_PATH,
  TEAM_A_COLORS,
  TEAM_B_COLORS,
  clampCount,
  cleanText,
  countSetWins,
  createDefaultState,
  firebaseConfig,
  normalizeState,
  normalizeThemeValue,
} from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const scoreRef = ref(db, SCORE_PATH);

const ui = {
  status: document.getElementById("status"),
  statusText: document.getElementById("statusText"),
  error: document.getElementById("error"),
  tournamentName: document.getElementById("tournamentName"),
  roundName: document.getElementById("roundName"),
  nameA: document.getElementById("nameA"),
  nameB: document.getElementById("nameB"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  serveA: document.getElementById("serveA"),
  serveNone: document.getElementById("serveNone"),
  serveB: document.getElementById("serveB"),
  currentSetLabel: document.getElementById("currentSetLabel"),
  setCount: document.getElementById("setCount"),
  historyList: document.getElementById("historyList"),
};

const textInputs = {
  tournamentName: ui.tournamentName,
  roundName: ui.roundName,
  teamA: ui.nameA,
  teamB: ui.nameB,
};

const textTimers = {
  tournamentName: 0,
  roundName: 0,
  teamA: 0,
  teamB: 0,
};

const textDirty = {
  tournamentName: false,
  roundName: false,
  teamA: false,
  teamB: false,
};

const textLimits = {
  tournamentName: LIMITS.tournamentName,
  roundName: LIMITS.roundName,
  teamA: LIMITS.teamName,
  teamB: LIMITS.teamName,
};

let state = createDefaultState();
let hydrated = false;
let seeding = false;
let pendingWrites = 0;
let writeChain = Promise.resolve();
let historyTimer = 0;
let historyDirty = false;

function formatError(error) {
  const code = String(error?.code || error?.message || "").toLowerCase();
  if (code.includes("permission")) {
    return "Realtime Database のルールで拒否されました。Firebase コンソールで scoreboard の読み取りと書き込みを許可してください。";
  }
  return "通信に失敗しました。ネットワーク接続と Firebase の設定を確認してください。";
}

function showError(message) {
  ui.error.hidden = false;
  ui.error.textContent = message;
}

function clearError() {
  ui.error.hidden = true;
  ui.error.textContent = "";
}

function setEnabled(enabled) {
  document.querySelectorAll("button, input").forEach((el) => {
    el.disabled = !enabled;
  });
}

function readText(key) {
  const value = textInputs[key].value.slice(0, textLimits[key]);
  if (key === "teamA") state.teamA.name = value;
  else if (key === "teamB") state.teamB.name = value;
  else state[key] = value;
}

function shownText(key) {
  if (key === "teamA") return state.teamA.name;
  if (key === "teamB") return state.teamB.name;
  return state[key];
}

function renderHistoryEditor() {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && ui.historyList.contains(active)) return;

  ui.historyList.replaceChildren();
  if (state.setHistory.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "まだセット履歴はありません。";
    ui.historyList.append(empty);
    return;
  }

  state.setHistory.forEach((set, index) => {
    const row = document.createElement("div");
    row.className = "hist-edit";

    const label = document.createElement("span");
    label.className = "hist-index";
    label.textContent = String(index + 1);

    const inputA = document.createElement("input");
    inputA.inputMode = "numeric";
    inputA.maxLength = 2;
    inputA.autocomplete = "off";
    inputA.setAttribute("aria-label", `${index + 1}セット チームAの得点`);
    inputA.dataset.index = String(index);
    inputA.dataset.side = "teamA";
    inputA.value = String(set.teamA);

    const dash = document.createElement("span");
    dash.className = "hist-dash";
    dash.textContent = "-";

    const inputB = document.createElement("input");
    inputB.inputMode = "numeric";
    inputB.maxLength = 2;
    inputB.autocomplete = "off";
    inputB.setAttribute("aria-label", `${index + 1}セット チームBの得点`);
    inputB.dataset.index = String(index);
    inputB.dataset.side = "teamB";
    inputB.value = String(set.teamB);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-delete";
    remove.dataset.delete = String(index);
    remove.textContent = "削除";

    row.append(label, inputA, dash, inputB, remove);
    ui.historyList.append(row);
  });
}

function render() {
  ui.scoreA.textContent = String(state.teamA.score);
  ui.scoreB.textContent = String(state.teamB.score);

  for (const key of Object.keys(textInputs)) {
    const input = textInputs[key];
    if (textDirty[key] || document.activeElement === input) continue;
    const shown = shownText(key);
    if (input.value !== shown) input.value = shown;
  }

  const serveA = state.teamA.serve === true;
  const serveB = state.teamB.serve === true;
  ui.serveA.classList.toggle("is-on", serveA);
  ui.serveB.classList.toggle("is-on", serveB);
  ui.serveNone.classList.toggle("is-on", !serveA && !serveB);
  ui.serveA.setAttribute("aria-pressed", String(serveA));
  ui.serveB.setAttribute("aria-pressed", String(serveB));
  ui.serveNone.setAttribute("aria-pressed", String(!serveA && !serveB));

  const wins = countSetWins(state.setHistory);
  ui.currentSetLabel.textContent = `第${state.currentSet}セット`;
  ui.setCount.textContent = `セット ${wins.teamA} - ${wins.teamB}`;
  renderHistoryEditor();
  renderTheme();
}

function themeSwatch(key, value) {
  if (key === "boardBgColor") return (BOARD_THEMES[value] || BOARD_THEMES.dark).swatch;
  if (key === "teamAColor") return (TEAM_A_COLORS[value] || TEAM_A_COLORS.white).color;
  return (TEAM_B_COLORS[value] || TEAM_B_COLORS.white).color;
}

function renderTheme() {
  document.querySelectorAll("[data-theme]").forEach((button) => {
    const key = button.dataset.theme;
    const value = button.dataset.value;
    const on = state[key] === value;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
    const chip = button.querySelector(".chip");
    if (chip) chip.style.background = themeSwatch(key, value);
  });
}

function applyServer(raw) {
  const next = normalizeState(raw);
  if (next.seq < state.seq) return;

  for (const key of Object.keys(textInputs)) {
    if (textDirty[key] || document.activeElement === textInputs[key]) {
      const value = textInputs[key].value.slice(0, textLimits[key]);
      if (key === "teamA") next.teamA.name = value;
      else if (key === "teamB") next.teamB.name = value;
      else next[key] = value;
    }
  }

  if (historyDirty) {
    next.setHistory = state.setHistory.map((item) => ({
      teamA: clampCount(item.teamA),
      teamB: clampCount(item.teamB),
    }));
    next.currentSet = next.setHistory.length + 1;
  }

  state = next;
  hydrated = true;
  setEnabled(true);
  render();
  clearError();
}

function payloadFrom(snapshot) {
  const history = snapshot.setHistory.map((item) => ({
    teamA: clampCount(item.teamA),
    teamB: clampCount(item.teamB),
  }));
  let serveA = snapshot.teamA.serve === true;
  let serveB = snapshot.teamB.serve === true;
  if (serveA && serveB) serveB = false;

  return {
    tournamentName: cleanText(snapshot.tournamentName, LIMITS.tournamentName),
    roundName: cleanText(snapshot.roundName, LIMITS.roundName),
    teamA: {
      name: cleanText(snapshot.teamA.name, LIMITS.teamName),
      score: clampCount(snapshot.teamA.score),
      serve: serveA,
    },
    teamB: {
      name: cleanText(snapshot.teamB.name, LIMITS.teamName),
      score: clampCount(snapshot.teamB.score),
      serve: serveB,
    },
    setHistory: history,
    currentSet: history.length + 1,
    boardBgColor: normalizeThemeValue("boardBgColor", snapshot.boardBgColor),
    teamAColor: normalizeThemeValue("teamAColor", snapshot.teamAColor),
    teamBColor: normalizeThemeValue("teamBColor", snapshot.teamBColor),
    seq: snapshot.seq,
  };
}

function persist() {
  for (const key of Object.keys(textInputs)) {
    if (textDirty[key]) readText(key);
  }

  state.currentSet = state.setHistory.length + 1;
  state.seq += 1;
  const snapshot = payloadFrom(state);
  const dirtyAtWrite = { ...textDirty };
  const historyDirtyAtWrite = historyDirty;
  pendingWrites += 1;
  writeChain = writeChain
    .then(() => set(scoreRef, snapshot))
    .then(() => {
      for (const key of Object.keys(textInputs)) {
        if (!dirtyAtWrite[key]) continue;
        const written = key === "teamA"
          ? snapshot.teamA.name
          : key === "teamB"
            ? snapshot.teamB.name
            : snapshot[key];
        if (cleanText(textInputs[key].value, textLimits[key]) === written) {
          textDirty[key] = false;
        }
      }
      if (historyDirtyAtWrite) {
        const current = state.setHistory.map((item) => `${clampCount(item.teamA)}-${clampCount(item.teamB)}`).join(",");
        const written = snapshot.setHistory.map((item) => `${item.teamA}-${item.teamB}`).join(",");
        if (current === written) historyDirty = false;
      }
    })
    .catch((error) => {
      showError(formatError(error));
    })
    .finally(() => {
      pendingWrites -= 1;
    });
}

function seedIfEmpty() {
  if (seeding || hydrated) return;
  seeding = true;
  persist();
}

function applyServe(which) {
  state.teamA.serve = which === "teamA";
  state.teamB.serve = which === "teamB";
}

function bump(team, delta) {
  if (!hydrated) return;
  const next = clampCount(state[team].score + delta);
  if (next === state[team].score) return;
  state[team].score = next;
  if (delta > 0) applyServe(team);
  render();
  persist();
}

function scheduleText(key) {
  textDirty[key] = true;
  readText(key);
  window.clearTimeout(textTimers[key]);
  textTimers[key] = window.setTimeout(() => {
    if (!hydrated) return;
    persist();
  }, 300);
}

function commitHistory() {
  window.clearTimeout(historyTimer);
  historyDirty = false;
}

function setServe(which) {
  if (!hydrated) return;
  applyServe(which);
  render();
  persist();
}

function setTheme(key, value) {
  if (!hydrated) return;
  const next = normalizeThemeValue(key, value);
  if (state[key] === next) return;
  state[key] = next;
  render();
  persist();
}

function confirmSet() {
  if (!hydrated) return;
  if (state.setHistory.length >= LIMITS.history) {
    window.alert(`セット履歴は${LIMITS.history}件までです。`);
    return;
  }

  const scoreA = state.teamA.score;
  const scoreB = state.teamB.score;
  const ok = window.confirm(
    `このセットを確定します。\nチームA ${scoreA} - ${scoreB} チームB\n得点は0に戻り、次のセットになります。`
  );
  if (!ok) return;

  commitHistory();
  state.setHistory.push({ teamA: scoreA, teamB: scoreB });
  state.teamA.score = 0;
  state.teamB.score = 0;
  state.currentSet = state.setHistory.length + 1;
  render();
  persist();
}

function resetAll() {
  if (!hydrated) return;
  const ok = window.confirm("得点、セット履歴、サーブ権をリセットします。\n大会名・回戦名・チーム名は残ります。");
  if (!ok) return;

  commitHistory();
  state.teamA.score = 0;
  state.teamB.score = 0;
  state.teamA.serve = false;
  state.teamB.serve = false;
  state.setHistory = [];
  state.currentSet = 1;
  render();
  persist();
}

function scheduleHistory() {
  historyDirty = true;
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    if (!hydrated) return;
    state.currentSet = state.setHistory.length + 1;
    persist();
  }, 300);
}

renderTheme();

document.getElementById("scoreA-plus").addEventListener("click", () => bump("teamA", 1));
document.getElementById("scoreA-minus").addEventListener("click", () => bump("teamA", -1));
document.getElementById("scoreB-plus").addEventListener("click", () => bump("teamB", 1));
document.getElementById("scoreB-minus").addEventListener("click", () => bump("teamB", -1));
ui.serveA.addEventListener("click", () => setServe("teamA"));
ui.serveNone.addEventListener("click", () => setServe("none"));
ui.serveB.addEventListener("click", () => setServe("teamB"));
document.getElementById("confirmSet").addEventListener("click", confirmSet);
document.getElementById("resetAll").addEventListener("click", resetAll);
document.querySelector(".theme-panel").addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme]");
  if (!button) return;
  setTheme(button.dataset.theme, button.dataset.value);
});

ui.historyList.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.dataset.index == null) return;
  const index = Number(input.dataset.index);
  const side = input.dataset.side;
  if (!state.setHistory[index] || (side !== "teamA" && side !== "teamB")) return;
  state.setHistory[index][side] = clampCount(input.value);
  const wins = countSetWins(state.setHistory);
  ui.setCount.textContent = `セット ${wins.teamA} - ${wins.teamB}`;
  scheduleHistory();
});

ui.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button || !hydrated) return;
  const index = Number(button.dataset.delete);
  const row = state.setHistory[index];
  if (!row) return;
  const ok = window.confirm(`${index + 1}セット（${row.teamA} - ${row.teamB}）を削除しますか？`);
  if (!ok) return;
  commitHistory();
  state.setHistory.splice(index, 1);
  state.currentSet = state.setHistory.length + 1;
  render();
  persist();
});

const composing = {
  tournamentName: false,
  roundName: false,
  teamA: false,
  teamB: false,
};

for (const key of Object.keys(textInputs)) {
  const input = textInputs[key];
  input.addEventListener("compositionstart", () => {
    composing[key] = true;
  });
  input.addEventListener("compositionend", (event) => {
    composing[key] = false;
    scheduleText(key);
    event.target.value = event.target.value.slice(0, textLimits[key]);
  });
  input.addEventListener("input", () => {
    if (composing[key]) {
      readText(key);
      textDirty[key] = true;
      return;
    }
    scheduleText(key);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.currentTarget.blur();
  });
}

onValue(ref(db, ".info/connected"), (snap) => {
  const online = snap.val() === true;
  ui.status.classList.toggle("online", online);
  ui.status.classList.toggle("offline", !online);
  ui.statusText.textContent = online ? "接続中" : "オフライン（復帰後に同期）";
});

onValue(
  scoreRef,
  (snap) => {
    const raw = snap.val();
    if (!raw) {
      seedIfEmpty();
      return;
    }
    if (pendingWrites > 0 && Number(raw.seq || 0) < state.seq) return;
    applyServer(raw);
  },
  (error) => {
    showError(formatError(error));
  }
);
