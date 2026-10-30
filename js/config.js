// Realtime Database のルール例（Firebase コンソールで設定）:
// {
//   "rules": {
//     "scoreboard": {
//       ".read": true,
//       ".write": true
//     }
//   }
// }
export const firebaseConfig = {
  apiKey: "AIzaSyDCZZOZc7rScR4tWuVIxSyv5sdXbZr5Vds",
  authDomain: "volleyball-scoreboard-dca9c.firebaseapp.com",
  databaseURL: "https://volleyball-scoreboard-dca9c-default-rtdb.firebaseio.com",
  projectId: "volleyball-scoreboard-dca9c",
  storageBucket: "volleyball-scoreboard-dca9c.firebasestorage.app",
  messagingSenderId: "643966323019",
  appId: "1:643966323019:web:942542bb8af2fdb0c500ce",
};

export const SCORE_PATH = "scoreboard";

export const LIMITS = {
  tournamentName: 48,
  roundName: 20,
  teamName: 20,
  comment: 20,
  history: 10,
};

export const FALLBACK_NAMES = {
  teamA: "チームA",
  teamB: "チームB",
};

export const BOARD_THEMES = {
  dark: {
    label: "ダークグレー",
    background: "rgba(8, 10, 14, 0.94)",
    ink: "#f4f6f8",
    line: "rgba(255, 255, 255, 0.22)",
    edge: "inset 0 0 0 1px rgba(255, 255, 255, 0.14)",
    serveIdle: "rgba(255, 255, 255, 0.42)",
    serveOn: "#ffffff",
    serveGlow: "rgba(255, 255, 255, 0.85)",
    scoreShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
    swatch: "#2c323a",
  },
  light: {
    label: "ホワイト",
    background: "rgba(255, 255, 255, 0.94)",
    ink: "#1a1d23",
    line: "rgba(15, 23, 42, 0.16)",
    edge: "inset 0 0 0 1px rgba(15, 23, 42, 0.16)",
    serveIdle: "rgba(15, 23, 42, 0.35)",
    serveOn: "#111827",
    serveGlow: "rgba(15, 23, 42, 0.28)",
    scoreShadow: "none",
    swatch: "#f7f8fa",
  },
  red: {
    label: "レッド",
    background: "rgba(142, 22, 32, 0.92)",
    ink: "#fff5f5",
    line: "rgba(255, 255, 255, 0.28)",
    edge: "inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
    serveIdle: "rgba(255, 255, 255, 0.45)",
    serveOn: "#ffffff",
    serveGlow: "rgba(255, 255, 255, 0.75)",
    scoreShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
    swatch: "#9b1c28",
  },
  blue: {
    label: "ブルー",
    background: "rgba(18, 58, 130, 0.92)",
    ink: "#f3f7ff",
    line: "rgba(255, 255, 255, 0.28)",
    edge: "inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
    serveIdle: "rgba(255, 255, 255, 0.45)",
    serveOn: "#ffffff",
    serveGlow: "rgba(255, 255, 255, 0.75)",
    scoreShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
    swatch: "#1a4ea8",
  },
  gold: {
    label: "ゴールド",
    background: "rgba(214, 162, 28, 0.94)",
    ink: "#1c1404",
    line: "rgba(28, 20, 4, 0.28)",
    edge: "inset 0 0 0 1px rgba(28, 20, 4, 0.22)",
    serveIdle: "rgba(28, 20, 4, 0.4)",
    serveOn: "#1c1404",
    serveGlow: "rgba(28, 20, 4, 0.28)",
    scoreShadow: "none",
    swatch: "#e0aa14",
  },
};

export const TEAM_A_COLORS = {
  white: { label: "ホワイト", color: "#ffffff" },
  blue: { label: "ブルー", color: "#3b8bff" },
  red: { label: "レッド", color: "#ff4d4d" },
  yellow: { label: "イエロー", color: "#ffd000" },
  black: { label: "ブラック", color: "#14181f" },
};

export const TEAM_B_COLORS = {
  white: { label: "ホワイト", color: "#ffffff" },
  orange: { label: "オレンジ", color: "#ff8a1e" },
  blue: { label: "ブルー", color: "#3b8bff" },
  red: { label: "レッド", color: "#ff4d4d" },
  black: { label: "ブラック", color: "#14181f" },
};

export const DEFAULT_THEME = {
  boardBgColor: "dark",
  teamAColor: "white",
  teamBColor: "white",
};

const THEME_OPTIONS = {
  boardBgColor: BOARD_THEMES,
  teamAColor: TEAM_A_COLORS,
  teamBColor: TEAM_B_COLORS,
};

export function normalizeThemeValue(key, value) {
  const options = THEME_OPTIONS[key];
  if (options && Object.prototype.hasOwnProperty.call(options, value)) return value;
  return DEFAULT_THEME[key];
}

export function clampCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(n)));
}

export function cleanText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeHistory(raw) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  return list
    .filter((item) => item && typeof item === "object")
    .slice(0, LIMITS.history)
    .map((item) => ({
      teamA: clampCount(item.teamA),
      teamB: clampCount(item.teamB),
    }));
}

export function countSetWins(history) {
  let teamA = 0;
  let teamB = 0;
  for (const set of history) {
    if (set.teamA > set.teamB) teamA += 1;
    else if (set.teamB > set.teamA) teamB += 1;
  }
  return { teamA, teamB };
}

export function createDefaultState() {
  return {
    tournamentName: "",
    roundName: "",
    commentA: "",
    commentB: "",
    activeComment: "A",
    teamA: { name: FALLBACK_NAMES.teamA, score: 0, serve: false },
    teamB: { name: FALLBACK_NAMES.teamB, score: 0, serve: false },
    setHistory: [],
    currentSet: 1,
    boardBgColor: DEFAULT_THEME.boardBgColor,
    teamAColor: DEFAULT_THEME.teamAColor,
    teamBColor: DEFAULT_THEME.teamBColor,
    seq: 0,
  };
}

export function normalizeState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== "object") return base;

  base.tournamentName = cleanText(raw.tournamentName, LIMITS.tournamentName);
  base.roundName = cleanText(raw.roundName, LIMITS.roundName);
  base.commentA = cleanText(raw.commentA, LIMITS.comment);
  base.commentB = cleanText(raw.commentB, LIMITS.comment);
  base.activeComment = raw.activeComment === "B" ? "B" : "A";
  base.setHistory = normalizeHistory(raw.setHistory);
  base.currentSet = base.setHistory.length + 1;

  for (const key of ["teamA", "teamB"]) {
    const src = raw[key] || {};
    base[key] = {
      name: cleanText(src.name, LIMITS.teamName),
      score: clampCount(src.score),
      serve: src.serve === true,
    };
  }

  if (base.teamA.serve && base.teamB.serve) base.teamB.serve = false;

  base.boardBgColor = normalizeThemeValue("boardBgColor", raw.boardBgColor);
  base.teamAColor = normalizeThemeValue("teamAColor", raw.teamAColor);
  base.teamBColor = normalizeThemeValue("teamBColor", raw.teamBColor);

  const seq = Number(raw.seq);
  base.seq = Number.isFinite(seq) && seq > 0 ? Math.trunc(seq) : 0;
  return base;
}
