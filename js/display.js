import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import {
  BOARD_THEMES,
  FALLBACK_NAMES,
  SCORE_PATH,
  TEAM_A_COLORS,
  TEAM_B_COLORS,
  countSetWins,
  firebaseConfig,
  normalizeState,
} from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const els = {
  board: document.getElementById("board"),
  tournamentName: document.getElementById("tournamentName"),
  roundName: document.getElementById("roundName"),
  comment: document.getElementById("comment"),
  nameA: document.getElementById("nameA"),
  nameB: document.getElementById("nameB"),
  logoA: document.getElementById("logoA"),
  logoB: document.getElementById("logoB"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  serveA: document.getElementById("serveA"),
  serveB: document.getElementById("serveB"),
  history: document.getElementById("history"),
  setLabel: document.getElementById("setLabel"),
};

let firstPaint = true;

function paintValue(el, value) {
  const next = String(value);
  const changed = el.textContent !== next;
  el.textContent = next;
  if (firstPaint || !changed) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function setServe(el, on, label) {
  el.classList.toggle("on", on);
  el.setAttribute("aria-label", on ? `${label}のサーブ権` : `${label}のサーブ権なし`);
}

function renderHistory(history) {
  els.history.replaceChildren();
  els.history.classList.toggle("is-dense", history.length >= 3 && history.length < 5);
  els.history.classList.toggle("is-packed", history.length >= 5);

  for (const set of history) {
    const row = document.createElement("div");
    row.className = "hist-row";
    const scoreA = document.createElement("span");
    const dash = document.createElement("span");
    const scoreB = document.createElement("span");
    scoreA.className = "hist-a";
    scoreA.textContent = String(set.teamA);
    dash.className = "hist-dash";
    dash.textContent = "-";
    scoreB.className = "hist-b";
    scoreB.textContent = String(set.teamB);
    row.append(scoreA, dash, scoreB);
    els.history.append(row);
  }
}

function paintLogo(img, src, label) {
  const next = src || "";
  if (next) img.alt = `${label}のロゴ`;
  if ((img.dataset.src || "") === next) return;
  img.dataset.src = next;
  if (!next) {
    img.removeAttribute("src");
    img.hidden = true;
    img.alt = "";
    return;
  }
  img.hidden = false;
  img.src = next;
}

function bindLogo(img) {
  img.addEventListener("load", () => {
    if (img.getAttribute("src") === img.dataset.src) img.hidden = false;
    fitTexts();
  });
  img.addEventListener("error", () => {
    if (!img.dataset.src || img.getAttribute("src") !== img.dataset.src) return;
    img.hidden = true;
    fitTexts();
  });
}

function applyTheme(state) {
  const board = BOARD_THEMES[state.boardBgColor] || BOARD_THEMES.dark;
  const colorA = TEAM_A_COLORS[state.teamAColor] || TEAM_A_COLORS.white;
  const colorB = TEAM_B_COLORS[state.teamBColor] || TEAM_B_COLORS.white;
  const style = els.board.style;
  style.setProperty("--board-bg", board.background);
  style.setProperty("--ink", board.ink);
  style.setProperty("--line", board.line);
  style.setProperty("--board-edge", board.edge);
  style.setProperty("--serve-idle", board.serveIdle);
  style.setProperty("--serve-on", board.serveOn);
  style.setProperty("--serve-glow", board.serveGlow);
  style.setProperty("--score-shadow", board.scoreShadow);
  style.setProperty("--color-a", colorA.color);
  style.setProperty("--color-b", colorB.color);
}

function render(raw) {
  const state = normalizeState(raw);
  const nameA = state.teamA.name || FALLBACK_NAMES.teamA;
  const nameB = state.teamB.name || FALLBACK_NAMES.teamB;

  if (els.tournamentName.textContent !== state.tournamentName) {
    els.tournamentName.textContent = state.tournamentName;
  }
  if (els.roundName.textContent !== state.roundName) els.roundName.textContent = state.roundName;
  const comment = state.activeComment === "B" ? state.commentB : state.commentA;
  if (els.comment.textContent !== comment) els.comment.textContent = comment;
  els.board.classList.toggle(
    "has-header",
    state.tournamentName !== "" || state.roundName !== "" || comment !== ""
  );
  if (els.nameA.textContent !== nameA) els.nameA.textContent = nameA;
  if (els.nameB.textContent !== nameB) els.nameB.textContent = nameB;
  paintLogo(els.logoA, state.teamA.logo, nameA);
  paintLogo(els.logoB, state.teamB.logo, nameB);

  applyTheme(state);
  paintValue(els.scoreA, state.teamA.score);
  paintValue(els.scoreB, state.teamB.score);
  setServe(els.serveA, state.teamA.serve, nameA);
  setServe(els.serveB, state.teamB.serve, nameB);
  renderHistory(state.setHistory);
  const setLabel = `SET ${state.currentSet}`;
  if (els.setLabel.textContent !== setLabel) els.setLabel.textContent = setLabel;

  const wins = countSetWins(state.setHistory);
  const serve = state.teamA.serve ? `${nameA}のサーブ` : state.teamB.serve ? `${nameB}のサーブ` : "サーブ権なし";
  els.board.setAttribute(
    "aria-label",
    `${state.tournamentName} ${state.roundName} ${comment} ${nameA} ${state.teamA.score}、${nameB} ${state.teamB.score}。${setLabel}。セット ${wins.teamA} 対 ${wins.teamB}。${serve}`
  );
  firstPaint = false;
  fitTexts();
}

function fitText(el) {
  const slot = el.parentElement;
  if (!slot || slot.clientWidth === 0) return;

  el.style.fontSize = "";
  const max = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(max) || el.textContent === "") return;

  const slotStyle = getComputedStyle(slot);
  let reserved = 0;
  const logo = slot.querySelector(".logo");
  if (logo && !logo.hidden && logo.getAttribute("src")) {
    const gap = parseFloat(slotStyle.columnGap || slotStyle.gap) || 0;
    reserved = logo.getBoundingClientRect().width + gap;
  }
  const available = slot.clientWidth
    - parseFloat(slotStyle.paddingLeft)
    - parseFloat(slotStyle.paddingRight)
    - reserved;
  let size = max;
  el.style.fontSize = `${size}px`;
  while (size > 10 && el.scrollWidth > available + 1) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

function fitTexts() {
  fitText(els.tournamentName);
  fitText(els.roundName);
  fitText(els.comment);
  fitText(els.nameA);
  fitText(els.nameB);
}

bindLogo(els.logoA);
bindLogo(els.logoB);

new ResizeObserver(() => fitTexts()).observe(els.board);
window.addEventListener("resize", fitTexts);
if (document.fonts?.ready) document.fonts.ready.then(fitTexts);

if (location.protocol !== "file:") {
  onValue(ref(db, SCORE_PATH), (snap) => {
    render(snap.val() || {});
  });
}
