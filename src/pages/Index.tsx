import { useState, useEffect, useCallback } from "react";

// ─── ТИПЫ ───────────────────────────────────────────────────────────────────
type GameScreen = "menu" | "playing" | "win" | "lose" | "levelComplete";
type PuzzleType = "maze" | "pattern" | "sequence";

interface Cell {
  wall: boolean;
  visited: boolean;
  isExit: boolean;
  isTrap: boolean;
}

interface PatternPuzzle {
  grid: number[][];
  solution: number[];
  description: string;
}

interface SequencePuzzle {
  items: number[];
  answer: number;
  options: number[];
  description: string;
}

interface LevelConfig {
  type: PuzzleType;
  title: string;
  scoreReward: number;
}

// ─── УРОВНИ ─────────────────────────────────────────────────────────────────
const LEVELS: LevelConfig[] = [
  { type: "maze", title: "ЛАБИРИНТ ТЕНЕЙ", scoreReward: 100 },
  { type: "pattern", title: "КОД МАТРИЦЫ", scoreReward: 200 },
  { type: "sequence", title: "ЧИСЛОВАЯ ЦЕПЬ", scoreReward: 150 },
  { type: "maze", title: "ТЁМНЫЙ ЛАБИРИНТ", scoreReward: 250 },
  { type: "pattern", title: "ФИНАЛЬНЫЙ КОД", scoreReward: 500 },
];

// ─── ГЕНЕРАЦИЯ ЛАБИРИНТА (DFS) ───────────────────────────────────────────────
const MAZE_SIZE = 9;

function generateMaze(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: MAZE_SIZE }, (_, r) =>
    Array.from({ length: MAZE_SIZE }, (_, c) => ({
      wall: true,
      visited: false,
      isExit: r === MAZE_SIZE - 1 && c === MAZE_SIZE - 2,
      isTrap: false,
    }))
  );

  const carve = (r: number, c: number) => {
    grid[r][c].wall = false;
    grid[r][c].visited = true;
    const dirs = [[0, 2], [2, 0], [0, -2], [-2, 0]].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < MAZE_SIZE && nc >= 0 && nc < MAZE_SIZE && !grid[nr][nc].visited) {
        grid[r + dr / 2][c + dc / 2].wall = false;
        carve(nr, nc);
      }
    }
  };

  carve(0, 0);
  grid[MAZE_SIZE - 1][MAZE_SIZE - 2].wall = false;
  grid[MAZE_SIZE - 1][MAZE_SIZE - 2].isExit = true;

  let traps = 0;
  for (let r = 2; r < MAZE_SIZE && traps < 4; r++) {
    for (let c = 2; c < MAZE_SIZE && traps < 4; c++) {
      if (!grid[r][c].wall && !grid[r][c].isExit) {
        if (Math.random() < 0.06) {
          grid[r][c].isTrap = true;
          traps++;
        }
      }
    }
  }

  return grid;
}

// ─── ГЕНЕРАЦИЯ ПАТТЕРН-ПАЗЛА ─────────────────────────────────────────────────
function generatePatternPuzzle(): PatternPuzzle {
  const patterns = [
    {
      grid: [[1,0,1],[0,1,0],[1,0,1]],
      solution: [0, 2, 4, 6, 8],
      description: "Нажми клетки по диагоналям (крест-накрест)",
    },
    {
      grid: [[0,1,0],[1,1,1],[0,1,0]],
      solution: [1, 3, 4, 5, 7],
      description: "Нажми клетки в форме креста",
    },
    {
      grid: [[1,1,1],[1,0,1],[1,1,1]],
      solution: [0, 1, 2, 3, 5, 6, 7, 8],
      description: "Нажми все клетки по периметру",
    },
  ];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

// ─── ГЕНЕРАЦИЯ ПОСЛЕДОВАТЕЛЬНОСТИ ───────────────────────────────────────────
function generateSequencePuzzle(): SequencePuzzle {
  const sequences = [
    { items: [2, 4, 8, 16], answer: 32, description: "Каждое число умножается на 2. Что дальше?" },
    { items: [1, 3, 6, 10], answer: 15, description: "Прибавляем 2, 3, 4... Что дальше?" },
    { items: [5, 10, 20, 40], answer: 80, description: "Удвоение. Что дальше?" },
    { items: [3, 6, 9, 12], answer: 15, description: "Таблица умножения на 3. Что дальше?" },
    { items: [1, 4, 9, 16], answer: 25, description: "Квадраты чисел: 1², 2², 3², 4²... Что дальше?" },
  ];
  const chosen = sequences[Math.floor(Math.random() * sequences.length)];
  const wrongOptions = [chosen.answer + 5, chosen.answer - 3, chosen.answer * 2].filter(n => n !== chosen.answer);
  const options = [...wrongOptions.slice(0, 3), chosen.answer].sort(() => Math.random() - 0.5);
  return { ...chosen, options };
}

// ─── ПИКСЕЛЬНЫЙ ПЕРСОНАЖ ─────────────────────────────────────────────────────
const PixelChar = ({ state }: { state: "idle" | "walk" | "win" | "dead" }) => {
  const frames: Record<string, string[]> = {
    idle: ["🧙", "🧙‍♂️"],
    walk: ["🚶", "🧍"],
    win: ["🎉", "⭐"],
    dead: ["💀", "☠️"],
  };
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % 2), state === "walk" ? 300 : 600);
    return () => clearInterval(interval);
  }, [state]);

  return (
    <span
      style={{
        fontSize: "2rem",
        display: "inline-block",
        animation: state === "win" ? "bounce 0.4s infinite alternate" : state === "walk" ? "sway 0.3s infinite alternate" : "none",
        filter: state === "dead" ? "grayscale(1)" : "none",
        transition: "filter 0.3s",
      }}
    >
      {frames[state][frame]}
    </span>
  );
};

// ─── HUD ──────────────────────────────────────────────────────────────────────
const HUD = ({ score, lives, level, levelTitle }: { score: number; lives: number; level: number; levelTitle: string }) => (
  <div style={{
    fontFamily: "'Press Start 2P', monospace",
    fontSize: "10px",
    color: "#00ff41",
    background: "#0a0a0a",
    border: "3px solid #00ff41",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
    boxShadow: "0 0 12px #00ff4140",
  }}>
    <div>
      <div style={{ color: "#666", fontSize: "7px", marginBottom: "4px" }}>ОЧКИ</div>
      <div style={{ color: "#FFD700", fontSize: "14px" }}>{String(score).padStart(6, "0")}</div>
    </div>
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#666", fontSize: "7px", marginBottom: "4px" }}>УРОВЕНЬ {level}/5</div>
      <div style={{ color: "#00ff41", fontSize: "7px" }}>{levelTitle}</div>
    </div>
    <div style={{ textAlign: "right" }}>
      <div style={{ color: "#666", fontSize: "7px", marginBottom: "4px" }}>ЖИЗНИ</div>
      <div style={{ fontSize: "16px", letterSpacing: "2px" }}>
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} style={{ opacity: i < lives ? 1 : 0.2, transition: "opacity 0.4s" }}>❤️</span>
        ))}
      </div>
    </div>
  </div>
);

// ─── ЛАБИРИНТ ────────────────────────────────────────────────────────────────
const MazePuzzle = ({ onWin, onLose, addScore }: { onWin: () => void; onLose: () => void; addScore: (n: number) => void }) => {
  const [maze] = useState(generateMaze);
  const [pos, setPos] = useState({ r: 0, c: 0 });
  const [charState, setCharState] = useState<"idle" | "walk" | "win" | "dead">("idle");
  const [trail, setTrail] = useState<Set<string>>(new Set(["0,0"]));
  const [message, setMessage] = useState("Найди выход! Избегай ловушек ⚡");

  const move = useCallback((dr: number, dc: number) => {
    setPos(prev => {
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nr >= MAZE_SIZE || nc < 0 || nc >= MAZE_SIZE) return prev;
      if (maze[nr][nc].wall) return prev;

      setCharState("walk");
      setTimeout(() => setCharState("idle"), 300);
      setTrail(t => new Set([...t, `${nr},${nc}`]));

      if (maze[nr][nc].isTrap) {
        setCharState("dead");
        setMessage("💀 ЛОВУШКА! Теряешь жизнь!");
        setTimeout(() => onLose(), 700);
        return { r: nr, c: nc };
      }
      if (maze[nr][nc].isExit) {
        setCharState("win");
        setMessage("🎉 ВЫХОД НАЙДЕН!");
        addScore(50);
        setTimeout(() => onWin(), 700);
        return { r: nr, c: nc };
      }
      return { r: nr, c: nc };
    });
  }, [maze, onWin, onLose, addScore]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
      };
      if (map[e.key]) { e.preventDefault(); move(...map[e.key]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [move]);

  const cellSize = 36;

  return (
    <div>
      <div style={{ fontFamily: "'VT323', monospace", color: "#FFD700", fontSize: "18px", marginBottom: "10px", textAlign: "center", minHeight: "26px" }}>
        {message}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${MAZE_SIZE}, ${cellSize}px)`, border: "3px solid #00ff41", boxShadow: "0 0 20px #00ff4130", background: "#050505" }}>
          {maze.map((row, r) => row.map((cell, c) => {
            const isPlayer = pos.r === r && pos.c === c;
            const isTrail = trail.has(`${r},${c}`) && !isPlayer;
            return (
              <div key={`${r},${c}`} style={{
                width: cellSize, height: cellSize,
                background: cell.wall ? "linear-gradient(135deg, #1a1a2e 30%, #0f0f1a 70%)" : "#050505",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: isPlayer ? "20px" : "15px",
                border: cell.wall ? "1px solid #0a0a1a" : "1px solid #001200",
                transition: "background 0.1s",
              }}>
                {!cell.wall && (isPlayer ? (
                  <PixelChar state={charState} />
                ) : cell.isExit ? (
                  <span style={{ animation: "pulse 1s infinite" }}>🚪</span>
                ) : cell.isTrap ? (
                  <span>⚡</span>
                ) : isTrail ? (
                  <div style={{ width: "4px", height: "4px", background: "#00ff4150", borderRadius: "50%" }} />
                ) : null)}
              </div>
            );
          }))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: "14px", gap: "6px", flexWrap: "wrap" }}>
        {[{ label: "↑", dr: -1, dc: 0 }, { label: "↓", dr: 1, dc: 0 }, { label: "←", dr: 0, dc: -1 }, { label: "→", dr: 0, dc: 1 }].map(({ label, dr, dc }) => (
          <button key={label} onClick={() => move(dr, dc)} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: "12px",
            background: "#0a1f0a", color: "#00ff41", border: "2px solid #00ff41",
            padding: "10px 14px", cursor: "pointer", boxShadow: "0 0 6px #00ff4140",
          }}>{label}</button>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: "8px", fontFamily: "'VT323', monospace", color: "#333", fontSize: "14px" }}>
        WASD или стрелки на клавиатуре
      </div>
    </div>
  );
};

// ─── ПАТТЕРН ─────────────────────────────────────────────────────────────────
const PatternPuzzleComp = ({ onWin, onLose, addScore }: { onWin: () => void; onLose: () => void; addScore: (n: number) => void }) => {
  const [puzzle] = useState(generatePatternPuzzle);
  const [playerAnswer, setPlayerAnswer] = useState<number[]>([]);
  const [charState, setCharState] = useState<"idle" | "walk" | "win" | "dead">("idle");
  const [message, setMessage] = useState(puzzle.description);
  const [showHint, setShowHint] = useState(false);
  const [shakeGrid, setShakeGrid] = useState(false);

  const toggle = (idx: number) => {
    setPlayerAnswer(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const check = () => {
    const sorted = [...playerAnswer].sort((a, b) => a - b);
    const correct = [...puzzle.solution].sort((a, b) => a - b);
    if (JSON.stringify(sorted) === JSON.stringify(correct)) {
      setCharState("win");
      setMessage("🎉 ПРАВИЛЬНО! Паттерн разгадан!");
      addScore(80);
      setTimeout(onWin, 900);
    } else {
      setCharState("dead");
      setShakeGrid(true);
      setMessage("❌ НЕВЕРНО! Попробуй снова...");
      setTimeout(() => { setShakeGrid(false); setCharState("idle"); setMessage(puzzle.description); onLose(); }, 800);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><PixelChar state={charState} /></div>
      <div style={{ fontFamily: "'VT323', monospace", color: "#FFD700", fontSize: "18px", marginBottom: "16px", textAlign: "center" }}>{message}</div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 80px)", gap: "6px", animation: shakeGrid ? "shake 0.1s 4" : "none" }}>
          {Array.from({ length: 9 }, (_, i) => {
            const isActive = playerAnswer.includes(i);
            const isSolution = puzzle.solution.includes(i);
            return (
              <button key={i} onClick={() => toggle(i)} style={{
                width: "80px", height: "80px",
                background: isActive ? "#00ff41" : "#0a1f0a",
                border: `3px solid ${isActive ? "#00ff41" : "#1a4a1a"}`,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: isActive ? "0 0 12px #00ff41" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "22px", color: isActive ? "#000" : "#00ff41",
              }}>
                {showHint && isSolution ? "✓" : isActive ? "■" : "□"}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
        <button onClick={check} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "9px", background: "#00ff41", color: "#000", border: "none", padding: "12px 18px", cursor: "pointer", boxShadow: "0 0 12px #00ff4180" }}>ПРОВЕРИТЬ</button>
        <button onClick={() => setPlayerAnswer([])} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "9px", background: "transparent", color: "#00ff41", border: "2px solid #00ff41", padding: "12px 18px", cursor: "pointer" }}>СБРОСИТЬ</button>
        <button onClick={() => setShowHint(h => !h)} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "8px", background: "transparent", color: "#FFD700", border: "2px solid #FFD700", padding: "12px 14px", cursor: "pointer" }}>💡 ПОДСКАЗКА</button>
      </div>
    </div>
  );
};

// ─── ПОСЛЕДОВАТЕЛЬНОСТЬ ──────────────────────────────────────────────────────
const SequencePuzzleComp = ({ onWin, onLose, addScore }: { onWin: () => void; onLose: () => void; addScore: (n: number) => void }) => {
  const [puzzle] = useState(generateSequencePuzzle);
  const [charState, setCharState] = useState<"idle" | "walk" | "win" | "dead">("idle");
  const [message, setMessage] = useState(puzzle.description);
  const [selected, setSelected] = useState<number | null>(null);

  const choose = (option: number) => {
    setSelected(option);
    if (option === puzzle.answer) {
      setCharState("win");
      setMessage("🎉 ВЕРНО! Ты разгадал последовательность!");
      addScore(60);
      setTimeout(onWin, 900);
    } else {
      setCharState("dead");
      setMessage(`❌ Неверно! Правильный ответ: ${puzzle.answer}`);
      setTimeout(onLose, 1000);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><PixelChar state={charState} /></div>
      <div style={{ fontFamily: "'VT323', monospace", color: "#FFD700", fontSize: "18px", marginBottom: "24px", textAlign: "center" }}>{message}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "28px", flexWrap: "wrap" }}>
        {puzzle.items.map((n, i) => (
          <div key={i} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "18px", color: "#00ff41", background: "#0a1f0a", border: "3px solid #00ff41", padding: "14px 18px", minWidth: "60px", textAlign: "center", boxShadow: "0 0 8px #00ff4140", animation: `fadeIn 0.3s ${i * 0.1}s both` }}>{n}</div>
        ))}
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "18px", color: "#444", background: "#0a0a0a", border: "3px dashed #333", padding: "14px 18px", minWidth: "60px", textAlign: "center" }}>?</div>
      </div>
      <div style={{ fontFamily: "'VT323', monospace", color: "#888", fontSize: "16px", textAlign: "center", marginBottom: "12px" }}>ВЫБЕРИ ПРАВИЛЬНЫЙ ОТВЕТ:</div>
      <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
        {puzzle.options.map((opt, i) => (
          <button key={i} onClick={() => choose(opt)} disabled={selected !== null} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: "16px",
            background: selected === opt ? (opt === puzzle.answer ? "#00ff41" : "#ff0033") : "#0a1f0a",
            color: selected === opt ? "#000" : "#00ff41",
            border: `3px solid ${selected === opt ? (opt === puzzle.answer ? "#00ff41" : "#ff0033") : "#1a4a1a"}`,
            padding: "14px 22px", cursor: selected !== null ? "default" : "pointer",
            transition: "all 0.2s", minWidth: "70px",
            boxShadow: selected === opt && opt === puzzle.answer ? "0 0 16px #00ff41" : "none",
          }}>{opt}</button>
        ))}
      </div>
    </div>
  );
};

// ─── ЭКРАН МЕНЮ ──────────────────────────────────────────────────────────────
const MenuScreen = ({ onStart, highScore }: { onStart: () => void; highScore: number }) => {
  const [blink, setBlink] = useState(true);
  useEffect(() => { const t = setInterval(() => setBlink(b => !b), 600); return () => clearInterval(t); }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "26px", color: "#00ff41", textShadow: "0 0 20px #00ff41", marginBottom: "6px", animation: "glow 2s infinite alternate" }}>PIXEL</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "26px", color: "#FFD700", textShadow: "0 0 16px #FFD700", marginBottom: "28px" }}>QUEST</div>
      <div style={{ marginBottom: "20px", fontSize: "2.5rem" }}><PixelChar state="idle" /></div>
      <div style={{ fontFamily: "'VT323', monospace", color: "#888", fontSize: "16px", marginBottom: "28px", lineHeight: "1.7" }}>
        5 УРОВНЕЙ • ЛАБИРИНТЫ • ПАТТЕРНЫ • ПОСЛЕДОВАТЕЛЬНОСТИ<br />
        3 ЖИЗНИ • СИСТЕМА ОЧКОВ • ЛОГИЧЕСКИЕ ЗАДАЧИ
      </div>
      {highScore > 0 && (
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "8px", color: "#FFD700", marginBottom: "20px" }}>
          РЕКОРД: {String(highScore).padStart(6, "0")}
        </div>
      )}
      <button onClick={onStart} style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: "12px",
        background: "#00ff41", color: "#000", border: "none",
        padding: "16px 32px", cursor: "pointer",
        boxShadow: "0 0 20px #00ff41",
        opacity: blink ? 1 : 0.5, transition: "opacity 0.3s",
        display: "block", margin: "0 auto",
      }}>▶ НАЧАТЬ ИГРУ</button>
      <div style={{ fontFamily: "'VT323', monospace", color: "#222", fontSize: "12px", marginTop: "28px" }}>© 2084 PIXEL QUEST CORP.</div>
    </div>
  );
};

// ─── ЭКРАНЫ ПОБЕДЫ / ПОРАЖЕНИЯ / УРОВЕНЬ ПРОЙДЕН ──────────────────────────────
const WinScreen = ({ score, onRestart }: { score: number; onRestart: () => void }) => (
  <div style={{ textAlign: "center", padding: "20px 0" }}>
    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "20px", color: "#FFD700", textShadow: "0 0 20px #FFD700", marginBottom: "12px", animation: "bounce 0.5s infinite alternate" }}>ПОБЕДА!</div>
    <div style={{ fontSize: "48px", marginBottom: "12px" }}>🏆</div>
    <div style={{ fontFamily: "'VT323', monospace", color: "#00ff41", fontSize: "20px", marginBottom: "8px" }}>ТЫ ПРОШЁЛ ВСЕ 5 УРОВНЕЙ!</div>
    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "13px", color: "#FFD700", marginBottom: "28px" }}>ИТОГ: {String(score).padStart(6, "0")}</div>
    <button onClick={onRestart} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "10px", background: "#FFD700", color: "#000", border: "none", padding: "14px 28px", cursor: "pointer", boxShadow: "0 0 16px #FFD700" }}>▶ ИГРАТЬ СНОВА</button>
  </div>
);

const LoseScreen = ({ onRestart, onRetry }: { onRestart: () => void; onRetry: () => void }) => (
  <div style={{ textAlign: "center", padding: "20px 0" }}>
    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "20px", color: "#ff0033", textShadow: "0 0 20px #ff0033", marginBottom: "12px" }}>GAME OVER</div>
    <div style={{ fontSize: "48px", marginBottom: "12px" }}>💀</div>
    <div style={{ fontFamily: "'VT323', monospace", color: "#888", fontSize: "18px", marginBottom: "28px" }}>У ТЕБЯ КОНЧИЛИСЬ ЖИЗНИ</div>
    <div style={{ display: "flex", justifyContent: "center", gap: "14px" }}>
      <button onClick={onRetry} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "9px", background: "#ff0033", color: "#fff", border: "none", padding: "14px 20px", cursor: "pointer", boxShadow: "0 0 10px #ff003380" }}>↺ СНОВА</button>
      <button onClick={onRestart} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "9px", background: "transparent", color: "#00ff41", border: "2px solid #00ff41", padding: "14px 20px", cursor: "pointer" }}>⌂ МЕНЮ</button>
    </div>
  </div>
);

const LevelCompleteScreen = ({ level, score, onNext }: { level: number; score: number; onNext: () => void }) => {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), 80); }, []);
  return (
    <div style={{ textAlign: "center", padding: "20px 0", opacity: vis ? 1 : 0, transition: "opacity 0.4s" }}>
      <div style={{ fontSize: "48px", marginBottom: "10px", animation: "bounce 0.4s infinite alternate" }}>⭐</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "13px", color: "#00ff41", textShadow: "0 0 12px #00ff41", marginBottom: "8px" }}>УРОВЕНЬ {level} ПРОЙДЕН!</div>
      <div style={{ fontFamily: "'VT323', monospace", color: "#FFD700", fontSize: "20px", marginBottom: "24px" }}>ОЧКИ: {String(score).padStart(6, "0")}</div>
      <button onClick={onNext} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "10px", background: "#00ff41", color: "#000", border: "none", padding: "14px 24px", cursor: "pointer", boxShadow: "0 0 14px #00ff41", animation: "pulse 1s infinite" }}>
        СЛЕДУЮЩИЙ УРОВЕНЬ ▶
      </button>
    </div>
  );
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Index() {
  const [screen, setScreen] = useState<GameScreen>("menu");
  const [level, setLevel] = useState(0);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [puzzleKey, setPuzzleKey] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem("pq_hs") || "0"); } catch { return 0; }
  });

  const addScore = useCallback((n: number) => setScore(s => s + n), []);

  const handleWin = useCallback(() => {
    const bonus = LEVELS[level].scoreReward;
    setScore(s => {
      const next = s + bonus;
      if (next > highScore) {
        setHighScore(next);
        try { localStorage.setItem("pq_hs", String(next)); } catch (e) { console.warn(e); }
      }
      return next;
    });
    if (level >= LEVELS.length - 1) setScreen("win");
    else setScreen("levelComplete");
  }, [level, highScore]);

  const handleLose = useCallback(() => {
    setLives(l => {
      const next = l - 1;
      if (next <= 0) setScreen("lose");
      else setPuzzleKey(k => k + 1);
      return next;
    });
  }, []);

  const nextLevel = () => { setLevel(l => l + 1); setPuzzleKey(k => k + 1); setScreen("playing"); };
  const restart = () => { setLevel(0); setLives(3); setScore(0); setPuzzleKey(k => k + 1); setScreen("menu"); };
  const retryLevel = () => { setLives(3); setScore(0); setLevel(0); setPuzzleKey(k => k + 1); setScreen("playing"); };

  const currentLevel = LEVELS[Math.min(level, LEVELS.length - 1)];

  const renderPuzzle = () => {
    const props = { onWin: handleWin, onLose: handleLose, addScore };
    if (currentLevel.type === "maze") return <MazePuzzle key={puzzleKey} {...props} />;
    if (currentLevel.type === "pattern") return <PatternPuzzleComp key={puzzleKey} {...props} />;
    return <SequencePuzzleComp key={puzzleKey} {...props} />;
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050505",
      backgroundImage: "radial-gradient(ellipse at 20% 20%, #001a0030 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #1a000030 0%, transparent 50%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: "24px 16px",
    }}>
      {/* Сканлайны */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)",
        pointerEvents: "none", zIndex: 100,
      }} />

      <div style={{ width: "100%", maxWidth: "520px", position: "relative", zIndex: 1 }}>
        {screen !== "menu" && (
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "7px", color: "#00ff4150", textAlign: "center", marginBottom: "8px", letterSpacing: "4px" }}>
            ▓▓ PIXEL QUEST ▓▓
          </div>
        )}

        {screen === "playing" && (
          <HUD score={score} lives={lives} level={level + 1} levelTitle={currentLevel.title} />
        )}

        <div style={{
          background: "#080808",
          border: "3px solid #00ff4130",
          padding: "24px",
          boxShadow: "0 0 30px #00ff4110, inset 0 0 30px #00000080",
        }}>
          {screen === "menu" && <MenuScreen onStart={() => setScreen("playing")} highScore={highScore} />}
          {screen === "playing" && renderPuzzle()}
          {screen === "levelComplete" && <LevelCompleteScreen level={level + 1} score={score} onNext={nextLevel} />}
          {screen === "win" && <WinScreen score={score} onRestart={restart} />}
          {screen === "lose" && <LoseScreen onRestart={restart} onRetry={retryLevel} />}
        </div>
      </div>

      <style>{`
        @keyframes glow {
          from { text-shadow: 0 0 10px #00ff41, 0 0 20px #00ff4180; }
          to   { text-shadow: 0 0 20px #00ff41, 0 0 50px #00ff41, 0 0 70px #00ff4180; }
        }
        @keyframes bounce {
          from { transform: translateY(0); }
          to   { transform: translateY(-8px); }
        }
        @keyframes sway {
          from { transform: translateX(-2px); }
          to   { transform: translateX(2px); }
        }
        @keyframes shake {
          from { transform: translateX(-5px); }
          to   { transform: translateX(5px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
        button:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}