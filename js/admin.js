import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import {
  LIMITS,
  SCORE_PATH,
  STORAGE_KEYS,
  clampCount,
  cleanText,
  countSetWins,
  createDefaultState,
  firebaseConfig,
  normalizeCommentStocks,
  normalizeLogo,
  normalizeLogoStocks,
  normalizeState,
  normalizeThemeValue,
  themePickerValue,
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
  comment: document.getElementById("comment"),
  draftComment: document.getElementById("draftComment"),
  applyComment: document.getElementById("applyComment"),
  clearComment: document.getElementById("clearComment"),
  saveCommentStock: document.getElementById("saveCommentStock"),
  pickCommentStock: document.getElementById("pickCommentStock"),
  commentStockCount: document.getElementById("commentStockCount"),
  commentStocks: document.getElementById("commentStocks"),
  logoStockA: document.getElementById("logoStockA"),
  logoStockB: document.getElementById("logoStockB"),
  nameA: document.getElementById("nameA"),
  nameB: document.getElementById("nameB"),
  logoPreviewA: document.getElementById("logoPreviewA"),
  logoPreviewB: document.getElementById("logoPreviewB"),
  logoFileA: document.getElementById("logoFileA"),
  logoFileB: document.getElementById("logoFileB"),
  logoPickA: document.getElementById("logoPickA"),
  logoPickB: document.getElementById("logoPickB"),
  logoClearA: document.getElementById("logoClearA"),
  logoClearB: document.getElementById("logoClearB"),
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

let commentDraftDirty = false;

function readStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showError("この端末に保存できませんでした。空き容量を確認してください。");
    return false;
  }
}

let commentStocks = normalizeCommentStocks(readStorage(STORAGE_KEYS.commentStocks));
let commentStockOpen = false;
let commentEditIndex = -1;
function loadSharedLogoStocks() {
  const shared = normalizeLogoStocks(readStorage(STORAGE_KEYS.logoStocks));
  const legacyA = normalizeLogoStocks(readStorage(STORAGE_KEYS.logoStocksA));
  const legacyB = normalizeLogoStocks(readStorage(STORAGE_KEYS.logoStocksB));
  const merged = normalizeLogoStocks([...shared, ...legacyA, ...legacyB]);
  if (legacyA.length || legacyB.length) {
    if (writeStorage(STORAGE_KEYS.logoStocks, merged)) {
      try {
        localStorage.removeItem(STORAGE_KEYS.logoStocksA);
        localStorage.removeItem(STORAGE_KEYS.logoStocksB);
      } catch {
        /* 古いキーが残っても、次回も同じ内容にまとまる */
      }
    }
  }
  return merged;
}

let logoStocks = loadSharedLogoStocks();
const logoStockOpen = { A: false, B: false };

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
  if (location.protocol === "file:") return;
  ui.error.hidden = false;
  ui.error.textContent = message;
}

function clearError() {
  ui.error.hidden = true;
  ui.error.textContent = "";
}

function setEnabled(enabled) {
  document.querySelectorAll("button, input").forEach((el) => {
    if (el.id === "previewToggle") return;
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

  const input = ui.comment;
  const shown = onAirComment();
  if (!commentDraftDirty && document.activeElement !== input && input.value !== shown) {
    input.value = shown;
  }
  ui.draftComment.hidden = !commentDraftDirty;
  input.closest(".comment-row").classList.toggle("is-draft", commentDraftDirty);
  syncCommentStockControls();

  const serveA = state.teamA.serve === true;
  const serveB = state.teamB.serve === true;
  ui.serveA.classList.toggle("is-on", serveA);
  ui.serveB.classList.toggle("is-on", serveB);
  ui.serveNone.classList.toggle("is-on", !serveA && !serveB);
  ui.serveA.setAttribute("aria-pressed", String(serveA));
  ui.serveB.setAttribute("aria-pressed", String(serveB));
  ui.serveNone.setAttribute("aria-pressed", String(!serveA && !serveB));

  renderLogos();

  const wins = countSetWins(state.setHistory);
  ui.currentSetLabel.textContent = `第${state.currentSet}セット`;
  ui.setCount.textContent = `セット ${wins.teamA} - ${wins.teamB}`;
  renderHistoryEditor();
  renderTheme();
}

function renderLogos() {
  for (const side of ["A", "B"]) {
    const logo = state[side === "A" ? "teamA" : "teamB"].logo || "";
    const preview = ui[`logoPreview${side}`];
    const clearButton = ui[`logoClear${side}`];
    if (logo) {
      if (preview.getAttribute("src") !== logo) preview.src = logo;
      preview.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
    clearButton.disabled = !hydrated || logo === "";
  }
  markLogoStocks();
  rememberDisplayedLogos();
}

const colorInputs = {
  boardBgColor: document.getElementById("colorBoard"),
  teamAColor: document.getElementById("colorA"),
  teamBColor: document.getElementById("colorB"),
};

function renderTheme() {
  for (const key of Object.keys(colorInputs)) {
    const input = colorInputs[key];
    if (document.activeElement === input) continue;
    const next = themePickerValue(key, state[key]);
    if (input.value.toLowerCase() !== next) input.value = next;
  }
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
    commentA: cleanText(snapshot.commentA, LIMITS.comment),
    commentB: cleanText(snapshot.commentB, LIMITS.comment),
    activeComment: snapshot.activeComment === "B" ? "B" : "A",
    teamA: {
      name: cleanText(snapshot.teamA.name, LIMITS.teamName),
      score: clampCount(snapshot.teamA.score),
      serve: serveA,
      logo: normalizeLogo(snapshot.teamA.logo),
    },
    teamB: {
      name: cleanText(snapshot.teamB.name, LIMITS.teamName),
      score: clampCount(snapshot.teamB.score),
      serve: serveB,
      logo: normalizeLogo(snapshot.teamB.logo),
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
  if (delta > 0 && (state.teamA.serve || state.teamB.serve)) applyServe(team);
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

function onAirComment() {
  return state.activeComment === "B" ? state.commentB : state.commentA;
}

function writeCommentStocks() {
  return writeStorage(STORAGE_KEYS.commentStocks, commentStocks);
}

function writeLogoStocks() {
  return writeStorage(STORAGE_KEYS.logoStocks, logoStocks);
}

function syncCommentStockControls() {
  ui.commentStockCount.textContent = `${commentStocks.length}/${LIMITS.commentStocks}`;
  ui.saveCommentStock.disabled = !hydrated || commentStocks.length >= LIMITS.commentStocks;
  ui.clearComment.disabled = !hydrated || (onAirComment() === "" && ui.comment.value.trim() === "");
  if (commentStocks.length === 0) commentStockOpen = false;
  ui.commentStocks.hidden = !commentStockOpen;
  ui.pickCommentStock.classList.toggle("is-on", commentStockOpen);
  ui.pickCommentStock.setAttribute("aria-expanded", String(commentStockOpen));
  ui.pickCommentStock.disabled = !hydrated;
  const active = onAirComment();
  ui.commentStocks.querySelectorAll(".stock-apply").forEach((button) => {
    const on = button.dataset.text === active && active !== "";
    button.classList.toggle("is-current", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function renderCommentStocks() {
  const root = ui.commentStocks;
  root.replaceChildren();
  if (commentStocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint stock-empty";
    empty.textContent = "まだストックはありません。";
    root.append(empty);
  }

  commentStocks.forEach((text, index) => {
    const cell = document.createElement("div");
    cell.className = "stock-cell";
    if (commentEditIndex === index) {
      cell.classList.add("is-editing");
      const input = document.createElement("input");
      input.className = "stock-edit";
      input.maxLength = LIMITS.comment;
      input.autocomplete = "off";
      input.enterKeyHint = "done";
      input.setAttribute("aria-label", `ストック${index + 1}を編集`);
      input.value = text;

      const save = document.createElement("button");
      save.type = "button";
      save.className = "stock-save";
      save.textContent = "保存";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "stock-cancel";
      cancel.textContent = "取消";

      const commit = () => {
        const next = cleanText(input.value, LIMITS.comment);
        if (!next) {
          window.alert("コメントを入力してください。");
          return;
        }
        if (commentStocks.some((item, itemIndex) => itemIndex !== index && item === next)) {
          window.alert("同じコメントはすでにストックされています。");
          return;
        }
        const previous = commentStocks[index];
        commentStocks[index] = next;
        if (!writeCommentStocks()) {
          commentStocks[index] = previous;
          return;
        }
        commentEditIndex = -1;
        clearError();
        renderCommentStocks();
      };

      save.addEventListener("click", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      });
      cancel.addEventListener("click", () => {
        commentEditIndex = -1;
        renderCommentStocks();
      });
      cell.append(input, save, cancel);
    } else {
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "stock-apply";
      apply.textContent = text;
      apply.dataset.text = text;
      apply.disabled = !hydrated;
      apply.setAttribute("aria-label", `「${text}」をいまの表示コメントにする`);
      apply.addEventListener("click", () => applyCommentStock(text));

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "stock-icon";
      edit.textContent = "編集";
      edit.disabled = !hydrated;
      edit.setAttribute("aria-label", `「${text}」を編集`);
      edit.addEventListener("click", () => {
        commentEditIndex = index;
        renderCommentStocks();
        const field = root.querySelector(".stock-edit");
        if (field) field.focus();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "stock-icon stock-del";
      del.textContent = "×";
      del.disabled = !hydrated;
      del.setAttribute("aria-label", `「${text}」をストックから削除`);
      del.addEventListener("click", () => deleteCommentStock(index));
      cell.append(apply, edit, del);
    }
    root.append(cell);
  });
  syncCommentStockControls();
}

function publishComment(text) {
  if (!hydrated) return;
  const next = cleanText(text, LIMITS.comment);
  ui.comment.value = next;
  commentDraftDirty = false;
  if (onAirComment() === next) {
    render();
    return;
  }
  state.commentA = next;
  state.commentB = "";
  state.activeComment = "A";
  render();
  persist();
}

function applyCommentStock(text) {
  commentStockOpen = false;
  publishComment(text);
  syncCommentStockControls();
}

function toggleCommentStock() {
  if (!hydrated) return;
  if (!commentStockOpen && commentStocks.length === 0) {
    window.alert("ストックがありません。コメントを入力して「ストック」を押すと追加されます。");
    return;
  }
  commentStockOpen = !commentStockOpen;
  syncCommentStockControls();
}

function saveActiveCommentToStock() {
  if (!hydrated) return;
  if (commentStocks.length >= LIMITS.commentStocks) {
    window.alert(`コメントストックは${LIMITS.commentStocks}個までです。不要なものを削除してください。`);
    return;
  }
  const text = cleanText(ui.comment.value, LIMITS.comment);
  if (!text) {
    window.alert("コメント欄に、保存したい文字を入力してください。");
    return;
  }
  if (commentStocks.includes(text)) {
    window.alert("同じコメントはすでにストックされています。");
    return;
  }
  commentStocks.push(text);
  if (!writeCommentStocks()) {
    commentStocks.pop();
    return;
  }
  clearError();
  commentStockOpen = true;
  renderCommentStocks();
}

function deleteCommentStock(index) {
  const text = commentStocks[index];
  if (text == null) return;
  const ok = window.confirm(`「${text}」をストックから削除しますか？`);
  if (!ok) return;
  commentStocks.splice(index, 1);
  if (!writeCommentStocks()) {
    commentStocks.splice(index, 0, text);
    return;
  }
  if (commentEditIndex === index) commentEditIndex = -1;
  else if (commentEditIndex > index) commentEditIndex -= 1;
  renderCommentStocks();
}

function rememberDisplayedLogos() {
  const live = [];
  for (const logo of [state.teamA.logo, state.teamB.logo]) {
    const next = normalizeLogo(logo);
    if (next && !live.includes(next)) live.push(next);
  }
  const missing = live.filter((logo) => !logoStocks.includes(logo) && !logoStockRememberFailed.has(logo));
  if (missing.length === 0) return;

  const next = logoStocks.slice();
  const added = [];
  for (const logo of missing) {
    if (next.includes(logo)) continue;
    while (next.length >= LIMITS.logoStocks) {
      const drop = next.findIndex((item) => !live.includes(item));
      if (drop < 0) break;
      next.splice(drop, 1);
    }
    if (next.length >= LIMITS.logoStocks) continue;
    next.push(logo);
    added.push(logo);
  }
  if (added.length === 0) {
    for (const logo of missing) logoStockRememberFailed.add(logo);
    return;
  }

  const previous = logoStocks;
  logoStocks = next;
  if (!writeLogoStocks()) {
    logoStocks = previous;
    for (const logo of added) logoStockRememberFailed.add(logo);
    return;
  }
  renderLogoStocks();
}

const logoStockRememberFailed = new Set();

function markLogoStocks() {
  for (const side of ["A", "B"]) {
    const current = state[side === "A" ? "teamA" : "teamB"].logo || "";
    ui[`logoStock${side}`].querySelectorAll(".logo-stock-pick").forEach((button) => {
      const index = Number(button.dataset.logoIndex);
      const on = logoStocks[index] === current && current !== "";
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }
}

function renderLogoStocks() {
  for (const side of ["A", "B"]) {
    const root = ui[`logoStock${side}`];
    const current = state[side === "A" ? "teamA" : "teamB"].logo || "";
    root.replaceChildren();
    logoStocks.forEach((logo, index) => {
      const item = document.createElement("div");
      item.className = "logo-stock-item";

      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "logo-stock-pick";
      pick.disabled = !hydrated;
      pick.dataset.logoIndex = String(index);
      const on = logo === current && current !== "";
      pick.classList.toggle("is-current", on);
      pick.setAttribute("aria-pressed", String(on));
      pick.setAttribute("aria-label", `ストック${index + 1}をチーム${side}に配信`);

      const img = document.createElement("img");
      img.alt = "";
      img.src = logo;
      pick.append(img);
      pick.addEventListener("click", () => {
        if (!hydrated) return;
        clearError();
        logoStockOpen[side] = false;
        setLogo(side, logo);
        syncLogoStockPanel(side);
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "logo-stock-del";
      del.disabled = !hydrated;
      del.textContent = "ストック削除";
      del.setAttribute("aria-label", `ストック${index + 1}を削除`);
      del.addEventListener("click", () => deleteLogoStock(index));

      item.append(pick, del);
      root.append(item);
    });
    syncLogoStockPanel(side);
  }
}

function syncLogoStockPanel(side) {
  if (logoStocks.length === 0) logoStockOpen[side] = false;
  const open = logoStockOpen[side];
  ui[`logoStock${side}`].hidden = !open;
  const button = ui[`logoPick${side}`];
  button.classList.toggle("is-on", open);
  button.setAttribute("aria-expanded", String(open));
}

function toggleLogoStock(side) {
  if (!hydrated) return;
  if (!logoStockOpen[side] && logoStocks.length === 0) {
    window.alert("ストックがありません。端末から選択すると追加されます。");
    return;
  }
  logoStockOpen[side] = !logoStockOpen[side];
  syncLogoStockPanel(side);
}

function deleteLogoStock(index) {
  const logo = logoStocks[index];
  if (!logo) return;
  const ok = window.confirm("このロゴを共通ストックから削除しますか？\nいま配信中のロゴはそのまま残ります。");
  if (!ok) return;
  logoStocks.splice(index, 1);
  if (!writeLogoStocks()) {
    logoStocks.splice(index, 0, logo);
    return;
  }
  renderLogoStocks();
}

function addLogoStock(side, logo) {
  if (logoStocks.includes(logo)) {
    window.alert("この画像はすでにストックされています。");
    logoStockOpen[side] = true;
    syncLogoStockPanel(side);
    return;
  }
  if (logoStocks.length >= LIMITS.logoStocks) {
    window.alert(`ロゴのストックは${LIMITS.logoStocks}個までです。不要な画像を削除してください。`);
    return;
  }
  logoStocks.push(logo);
  if (!writeLogoStocks()) {
    logoStocks.pop();
    return;
  }
  clearError();
  logoStockOpen[side] = true;
  renderLogoStocks();
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
  const ok = window.confirm("得点、セット履歴、サーブ権をリセットします。\n大会名・回戦名・チーム名・ロゴは残ります。");
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
function readLogoFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return Promise.reject(new Error("画像ファイルを選んでください。"));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("画像が大きすぎます。8MB以下のファイルを選んでください。"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    reader.onload = () => {
      const data = String(reader.result || "");
      const direct = normalizeLogo(data);
      if (direct) {
        resolve(direct);
        return;
      }
      shrinkDataUrl(data).then((logo) => {
        if (!logo) reject(new Error("画像が大きすぎます。より小さい画像を選んでください。"));
        else resolve(logo);
      }).catch(() => reject(new Error("画像を読み込めませんでした。")));
    };
    reader.readAsDataURL(file);
  });
}

function shrinkDataUrl(data) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(shrinkLogo(img));
    img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    img.src = data;
  });
}

function shrinkLogo(img) {
  for (const max of [160, 112, 80]) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const data = canvas.toDataURL("image/png");
    if (normalizeLogo(data)) return data;
  }
  return "";
}

function setLogo(side, logo) {
  const team = side === "A" ? "teamA" : "teamB";
  const next = normalizeLogo(logo);
  if (state[team].logo === next) {
    render();
    return;
  }
  state[team].logo = next;
  render();
  persist();
}

async function onLogoFile(side, input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file || !hydrated) return;
  try {
    const logo = await readLogoFile(file);
    addLogoStock(side, logo);
  } catch (error) {
    showError(error.message || "画像を読み込めませんでした。");
  }
}

for (const side of ["A", "B"]) {
  ui[`logoFile${side}`].addEventListener("change", (event) => {
    onLogoFile(side, event.currentTarget);
  });
  ui[`logoPick${side}`].addEventListener("click", () => toggleLogoStock(side));
  ui[`logoClear${side}`].addEventListener("click", () => {
    if (!hydrated) return;
    clearError();
    setLogo(side, "");
  });
}

document.getElementById("confirmSet").addEventListener("click", confirmSet);
document.getElementById("resetAll").addEventListener("click", resetAll);

for (const [key, input] of Object.entries(colorInputs)) {
  input.addEventListener("change", () => setTheme(key, input.value));
}

const previewToggle = document.getElementById("previewToggle");
const previewFrame = document.getElementById("previewFrame");
let previewObserver = null;

function fitPreviewFrame() {
  if (previewFrame.hidden) return;
  const doc = previewFrame.contentDocument;
  if (!doc?.body) return;
  const height = Math.ceil(doc.body.getBoundingClientRect().height);
  if (height > 0) previewFrame.style.height = `${height}px`;
}

function watchPreviewFrame() {
  fitPreviewFrame();
  const doc = previewFrame.contentDocument;
  if (!doc?.body) return;
  previewObserver?.disconnect();
  previewObserver = new ResizeObserver(() => fitPreviewFrame());
  previewObserver.observe(doc.body);
}

function setPreview(on) {
  previewToggle.checked = on;
  previewFrame.hidden = !on;
  if (on) {
    if (!previewFrame.getAttribute("src")) previewFrame.src = "index.html";
    else fitPreviewFrame();
  } else {
    previewObserver?.disconnect();
    previewObserver = null;
    previewFrame.removeAttribute("src");
    previewFrame.style.height = "";
  }
  try {
    localStorage.setItem("scoreboard-preview", on ? "1" : "0");
  } catch {
    /* 保存できない環境では、この画面を開いているあいだだけ切り替える */
  }
}

previewFrame.addEventListener("load", watchPreviewFrame);
previewToggle.addEventListener("change", () => setPreview(previewToggle.checked));

let previewOn = false;
try {
  previewOn = localStorage.getItem("scoreboard-preview") === "1";
} catch {
  previewOn = false;
}
setPreview(previewOn);

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
  comment: false,
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

const commentInput = ui.comment;
commentInput.addEventListener("compositionstart", () => {
  composing.comment = true;
});
commentInput.addEventListener("compositionend", () => {
  composing.comment = false;
  commentDraftDirty = commentInput.value !== onAirComment();
  render();
});
commentInput.addEventListener("input", () => {
  commentDraftDirty = commentInput.value !== onAirComment();
  ui.draftComment.hidden = !commentDraftDirty;
  commentInput.closest(".comment-row").classList.toggle("is-draft", commentDraftDirty);
  ui.clearComment.disabled = !hydrated || (onAirComment() === "" && commentInput.value.trim() === "");
});
commentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !composing.comment) {
    event.preventDefault();
    publishComment(commentInput.value);
  }
});

ui.applyComment.addEventListener("click", () => publishComment(ui.comment.value));
ui.clearComment.addEventListener("click", () => publishComment(""));
ui.saveCommentStock.addEventListener("click", saveActiveCommentToStock);
ui.pickCommentStock.addEventListener("click", toggleCommentStock);

renderCommentStocks();
renderLogoStocks();

if (location.protocol !== "file:") {
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
}
