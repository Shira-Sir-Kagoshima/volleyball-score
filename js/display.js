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
  nameA: document.getElementById("nameA"),
  nameB: document.getElementById("nameB"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  serveA: document.getElementById("serveA"),
  serveB: document.getElementById("serveB"),
  history: document.getElementById("history"),
  setLabel: document.getElementById("setLabel"),
  lead: document.getElementById("lead"),
  mid: document.getElementById("mid"),
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

function renderLead(history) {
  const wins = countSetWins(history);
  els.lead.replaceChildren();
  if (wins.teamA === wins.teamB) return;

  const tri = document.createElement("span");
  tri.className = wins.teamA > wins.teamB ? "tri tri-a" : "tri tri-b";
  tri.setAttribute("aria-hidden", "true");
  els.lead.style.setProperty("--lead", wins.teamA > wins.teamB ? "var(--color-a)" : "var(--color-b)");
  els.lead.append(tri);
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
  els.board.classList.toggle("has-header", state.tournamentName !== "" || state.roundName !== "");
  if (els.nameA.textContent !== nameA) els.nameA.textContent = nameA;
  if (els.nameB.textContent !== nameB) els.nameB.textContent = nameB;

  applyTheme(state);
  paintValue(els.scoreA, state.teamA.score);
  paintValue(els.scoreB, state.teamB.score);
  setServe(els.serveA, state.teamA.serve, nameA);
  setServe(els.serveB, state.teamB.serve, nameB);
  renderHistory(state.setHistory);
  renderLead(state.setHistory);
  const setLabel = `SET ${state.currentSet}`;
  if (els.setLabel.textContent !== setLabel) els.setLabel.textContent = setLabel;

  const wins = countSetWins(state.setHistory);
  const serve = state.teamA.serve ? `${nameA}のサーブ` : state.teamB.serve ? `${nameB}のサーブ` : "サーブ権なし";
  els.board.setAttribute(
    "aria-label",
    `${state.tournamentName} ${state.roundName} ${nameA} ${state.teamA.score}、${nameB} ${state.teamB.score}。${setLabel}。セット ${wins.teamA} 対 ${wins.teamB}。${serve}`
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
  const available = slot.clientWidth
    - parseFloat(slotStyle.paddingLeft)
    - parseFloat(slotStyle.paddingRight);
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
  fitText(els.nameA);
  fitText(els.nameB);
}

new ResizeObserver(() => fitTexts()).observe(els.board);
window.addEventListener("resize", fitTexts);
if (document.fonts?.ready) document.fonts.ready.then(fitTexts);

onValue(ref(db, SCORE_PATH), (snap) => {
  render(snap.val() || {});
});
