import { useState, useEffect, useCallback, useRef } from "react";

// ─── ТИПЫ ───────────────────────────────────────────────────────────────────
type GameScreen = "menu" | "playing" | "win" | "lose" | "levelComplete" | "leaderboard" | "enterName" | "achievements";
type PuzzleType = "maze" | "pattern" | "sequence" | "logic";

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
  timeLimit: number;
}

interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}

interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  secret?: boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: "first_win",     icon: "🏆", title: "ПЕРВАЯ ПОБЕДА",      desc: "Пройди все 10 уровней" },
  { id: "no_mistakes",   icon: "🎯", title: "БЕЗ ОШИБОК",         desc: "Пройди игру не потеряв ни одной жизни" },
  { id: "speed_demon",   icon: "⚡", title: "МОЛНИЯ",              desc: "Получи 500+ бонусных очков за скорость за одну игру" },
  { id: "level5",        icon: "⭐", title: "НА ПОЛПУТИ",          desc: "Дойди до 5-го уровня" },
  { id: "score10k",      icon: "💎", title: "10 000 ОЧКОВ",        desc: "Набери 10 000 очков в одной игре" },
  { id: "comeback",      icon: "🔥", title: "КАМБЭК",              desc: "Пройди игру с 1 оставшейся жизнью" },
  { id: "speedrun",      icon: "🚀", title: "СПИДРАН",             desc: "Пройди уровень за первые 5 секунд", secret: true },
  { id: "perfectionist", icon: "👑", title: "ПЕРФЕКЦИОНИСТ",       desc: "Пройди все 10 уровней без единой ошибки и с бонусом скорости", secret: true },
];

const ACH_KEY = "pq_achievements_v1";
function loadAchievements(): string[] {
  try { return JSON.parse(localStorage.getItem(ACH_KEY) || "[]"); } catch { return []; }
}
function unlockAchievement(id: string): boolean {
  try {
    const list = loadAchievements();
    if (list.includes(id)) return false;
    list.push(id);
    localStorage.setItem(ACH_KEY, JSON.stringify(list));
    return true;
  } catch { return false; }
}

// ─── УРОВНИ ─────────────────────────────────────────────────────────────────
const LEVELS: LevelConfig[] = [
  { type: "maze",     title: "ЛАБИРИНТ ТЕНЕЙ",   scoreReward: 100,  timeLimit: 60 },
  { type: "pattern",  title: "КОД МАТРИЦЫ",       scoreReward: 200,  timeLimit: 40 },
  { type: "sequence", title: "ЧИСЛОВАЯ ЦЕПЬ",     scoreReward: 150,  timeLimit: 30 },
  { type: "maze",     title: "ТЁМНЫЙ ЛАБИРИНТ",   scoreReward: 250,  timeLimit: 45 },
  { type: "pattern",  title: "ФИНАЛЬНЫЙ КОД",     scoreReward: 500,  timeLimit: 25 },
  { type: "logic",    title: "ЗЕРКАЛО РАЗУМА",    scoreReward: 300,  timeLimit: 35 },
  { type: "sequence", title: "ФИБОНАЧЧИ",         scoreReward: 350,  timeLimit: 25 },
  { type: "maze",     title: "ЛОВУШКА ХАОСА",     scoreReward: 400,  timeLimit: 35 },
  { type: "logic",    title: "БАШНЯ ЛОГИКИ",      scoreReward: 450,  timeLimit: 30 },
  { type: "pattern",  title: "АПОКАЛИПСИС",       scoreReward: 1000, timeLimit: 20 },
];

// ─── 8-BIT ЗВУКОВОЙ ДВИЖОК ───────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private bgNode: OscillatorNode | null = null;
  private bgGain: GainNode | null = null;
  private bgInterval: ReturnType<typeof setInterval> | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  toggleMute() { this.muted = !this.muted; if (this.muted) this.stopBg(); else this.playBg(); return this.muted; }
  isMuted() { return this.muted; }

  private beep(freq: number, dur: number, type: OscillatorType = "square", vol = 0.15, delay = 0) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + dur + 0.01);
    } catch (e) { console.warn(e); }
  }

  playMove() { this.beep(220, 0.05, "square", 0.08); }
  playCorrect() {
    [523, 659, 784].forEach((f, i) => this.beep(f, 0.12, "square", 0.12, i * 0.1));
  }
  playWrong() {
    [200, 150].forEach((f, i) => this.beep(f, 0.15, "sawtooth", 0.15, i * 0.12));
  }
  playLevelUp() {
    [523, 587, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.1, "square", 0.12, i * 0.08));
  }
  playGameOver() {
    [400, 350, 300, 250, 200].forEach((f, i) => this.beep(f, 0.18, "sawtooth", 0.15, i * 0.12));
  }
  playVictory() {
    const melody = [523, 523, 523, 415, 523, 659, 392];
    melody.forEach((f, i) => this.beep(f, 0.18, "square", 0.14, i * 0.16));
  }
  playTrap() {
    [440, 220, 110].forEach((f, i) => this.beep(f, 0.1, "sawtooth", 0.18, i * 0.08));
  }
  playClick() { this.beep(440, 0.04, "square", 0.07); }
  playTick() { this.beep(880, 0.03, "square", 0.05); }
  playUrgent() { this.beep(660, 0.06, "square", 0.12); }

  playBg() {
    if (this.muted) return;
    const bgMelody = [261, 293, 329, 261, 293, 349, 329, 0, 261, 293, 329, 392, 349, 329, 293, 261];
    let step = 0;
    const playNote = () => {
      const freq = bgMelody[step % bgMelody.length];
      if (freq > 0) this.beep(freq, 0.18, "square", 0.04);
      step++;
    };
    playNote();
    this.bgInterval = setInterval(playNote, 280);
  }

  stopBg() {
    if (this.bgInterval) { clearInterval(this.bgInterval); this.bgInterval = null; }
    if (this.bgGain) { this.bgGain.gain.setValueAtTime(0, this.ctx!.currentTime); }
  }
}

const sfx = new SoundEngine();

// ─── ХРАНИЛИЩЕ РЕКОРДОВ ──────────────────────────────────────────────────────
const LS_KEY = "pq_leaderboard_v2";
function loadScores(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveScore(entry: ScoreEntry) {
  try {
    const list = loadScores();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 10)));
  } catch (e) { console.warn(e); }
}

// ─── ГЕНЕРАЦИЯ ЛАБИРИНТА (DFS) ───────────────────────────────────────────────
const MAZE_SIZE = 9;

function generateMaze(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: MAZE_SIZE }, (_, r) =>
    Array.from({ length: MAZE_SIZE }, (_, c) => ({
      wall: true, visited: false,
      isExit: r === MAZE_SIZE - 1 && c === MAZE_SIZE - 2,
      isTrap: false,
    }))
  );
  const carve = (r: number, c: number) => {
    grid[r][c].wall = false; grid[r][c].visited = true;
    const dirs = [[0,2],[2,0],[0,-2],[-2,0]].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < MAZE_SIZE && nc >= 0 && nc < MAZE_SIZE && !grid[nr][nc].visited) {
        grid[r + dr/2][c + dc/2].wall = false;
        carve(nr, nc);
      }
    }
  };
  carve(0, 0);
  grid[MAZE_SIZE-1][MAZE_SIZE-2].wall = false;
  grid[MAZE_SIZE-1][MAZE_SIZE-2].isExit = true;
  let traps = 0;
  for (let r = 2; r < MAZE_SIZE && traps < 4; r++)
    for (let c = 2; c < MAZE_SIZE && traps < 4; c++)
      if (!grid[r][c].wall && !grid[r][c].isExit && Math.random() < 0.06) {
        grid[r][c].isTrap = true; traps++;
      }
  return grid;
}

function generatePatternPuzzle(): PatternPuzzle {
  const patterns = [
    { grid: [[1,0,1],[0,1,0],[1,0,1]], solution: [0,2,4,6,8], description: "Нажми клетки по диагоналям (крест-накрест)" },
    { grid: [[0,1,0],[1,1,1],[0,1,0]], solution: [1,3,4,5,7], description: "Нажми клетки в форме креста" },
    { grid: [[1,1,1],[1,0,1],[1,1,1]], solution: [0,1,2,3,5,6,7,8], description: "Нажми все клетки по периметру" },
    { grid: [[1,0,0],[0,1,0],[0,0,1]], solution: [0,4,8], description: "Нажми главную диагональ" },
    { grid: [[0,0,1],[0,1,0],[1,0,0]], solution: [2,4,6], description: "Нажми побочную диагональ" },
    { grid: [[1,1,1],[0,0,0],[1,1,1]], solution: [0,1,2,6,7,8], description: "Нажми верхнюю и нижнюю строки" },
  ];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

function generateSequencePuzzle(): SequencePuzzle {
  const sequences = [
    { items: [2,4,8,16], answer: 32, description: "Каждое число умножается на 2. Что дальше?" },
    { items: [1,3,6,10], answer: 15, description: "Прибавляем 2, 3, 4... Что дальше?" },
    { items: [5,10,20,40], answer: 80, description: "Удвоение. Что дальше?" },
    { items: [3,6,9,12], answer: 15, description: "Таблица умножения на 3. Что дальше?" },
    { items: [1,4,9,16], answer: 25, description: "Квадраты чисел: 1², 2², 3², 4²... Что дальше?" },
    { items: [1,1,2,3,5], answer: 8, description: "Последовательность Фибоначчи. Что дальше?" },
    { items: [100,50,25,12], answer: 6, description: "Делим пополам (округляем). Что дальше?" },
    { items: [7,14,21,28], answer: 35, description: "Таблица умножения на 7. Что дальше?" },
    { items: [2,3,5,7,11], answer: 13, description: "Простые числа. Что дальше?" },
    { items: [1,2,4,7,11], answer: 16, description: "Прибавляем 1, 2, 3, 4... Что дальше?" },
  ];
  const chosen = sequences[Math.floor(Math.random() * sequences.length)];
  const wrongOptions = [chosen.answer+5, chosen.answer-3, chosen.answer*2].filter(n => n !== chosen.answer);
  return { ...chosen, options: [...wrongOptions.slice(0,3), chosen.answer].sort(() => Math.random()-0.5) };
}

interface LogicPuzzle {
  question: string;
  options: string[];
  answer: number;
  hint: string;
}

function generateLogicPuzzle(): LogicPuzzle {
  const puzzles: LogicPuzzle[] = [
    { question: "У Ивана 3 сестры. У каждой сестры есть 1 брат. Сколько детей в семье?", options: ["3","4","6","7"], answer: 1, hint: "У всех сестёр один общий брат — сам Иван" },
    { question: "Что тяжелее: 1 кг железа или 1 кг пуха?", options: ["Железо","Пух","Одинаково","Зависит от объёма"], answer: 2, hint: "Масса одинакова — 1 кг" },
    { question: "Петух снёс яйцо на крыше. В какую сторону оно упадёт?", options: ["На север","На юг","Никуда","Вниз"], answer: 2, hint: "Петухи не несут яиц!" },
    { question: "Если в комнате 4 угла, в каждом углу сидит кот, напротив каждого кота — 3 кота. Сколько котов?", options: ["12","16","4","8"], answer: 2, hint: "4 кота, каждый видит 3 других" },
    { question: "Врач дал 3 таблетки: принимать каждые полчаса. Через сколько минут примешь все?", options: ["90","60","45","30"], answer: 1, hint: "1я сейчас, 2я через 30 мин, 3я через 60 мин" },
    { question: "У отца 5 сыновей: Понедельник, Вторник, Среда, Четверг. Как зовут пятого?", options: ["Пятница","Воскресенье","Пятый","Читай вопрос"], answer: 3, hint: "В вопросе написано 'пятого' — это имя!" },
    { question: "Сколько месяцев в году имеют 28 дней?", options: ["1","2","6","12"], answer: 3, hint: "У всех месяцев есть хотя бы 28 дней" },
    { question: "Электричка летит на юг. Ветер дует на запад. В какую сторону дым?", options: ["На запад","На юг","На восток","Дыма нет"], answer: 3, hint: "Электрички не дымят!" },
  ];
  return puzzles[Math.floor(Math.random() * puzzles.length)];
}

// ─── ПИКСЕЛЬНЫЙ ПЕРСОНАЖ ─────────────────────────────────────────────────────
const PixelChar = ({ state }: { state: "idle"|"walk"|"win"|"dead" }) => {
  const frames: Record<string, string[]> = {
    idle: ["🧙","🧙‍♂️"], walk: ["🚶","🧍"], win: ["🎉","⭐"], dead: ["💀","☠️"],
  };
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f+1)%2), state === "walk" ? 300 : 600);
    return () => clearInterval(t);
  }, [state]);
  return (
    <span style={{
      fontSize: "2rem", display: "inline-block",
      animation: state==="win" ? "bounce 0.4s infinite alternate" : state==="walk" ? "sway 0.3s infinite alternate" : "none",
      filter: state==="dead" ? "grayscale(1)" : "none", transition: "filter 0.3s",
    }}>{frames[state][frame]}</span>
  );
};

// ─── HUD ──────────────────────────────────────────────────────────────────────
const HUD = ({ score, lives, level, levelTitle, muted, onToggleMute, timeLeft, timeLimit }: {
  score: number; lives: number; level: number; levelTitle: string;
  muted: boolean; onToggleMute: () => void; timeLeft: number; timeLimit: number;
}) => {
  const pct = timeLeft / timeLimit;
  const urgent = timeLeft <= 10;
  const timerColor = timeLeft <= 5 ? "#ff0033" : timeLeft <= 10 ? "#ff6600" : "#00ff41";
  return (
    <div style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: "10px", color: "#00ff41",
      background: "#0a0a0a", border: "3px solid #00ff41", padding: "10px 14px",
      display: "flex", flexDirection: "column", gap: "8px",
      marginBottom: "12px", boxShadow: "0 0 12px #00ff4140",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#666", fontSize: "6px", marginBottom: "3px" }}>ОЧКИ</div>
          <div style={{ color: "#FFD700", fontSize: "13px" }}>{String(score).padStart(6, "0")}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#666", fontSize: "6px", marginBottom: "3px" }}>УРОВЕНЬ {level}/10</div>
          <div style={{ color: "#00ff41", fontSize: "6px" }}>{levelTitle}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#666", fontSize: "6px", marginBottom: "3px" }}>ЖИЗНИ</div>
            <div style={{ fontSize: "15px", letterSpacing: "2px" }}>
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} style={{ opacity: i < lives ? 1 : 0.2, transition: "opacity 0.4s" }}>❤️</span>
              ))}
            </div>
          </div>
          <button onClick={onToggleMute} title="Звук" style={{
            background: "transparent", border: "2px solid #00ff4160", color: "#00ff41",
            width: "30px", height: "30px", cursor: "pointer", fontSize: "14px",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>{muted ? "🔇" : "🔊"}</button>
        </div>
      </div>
      {/* Таймер */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: "11px",
          color: timerColor, minWidth: "36px", textAlign: "right",
          animation: urgent ? "pulse 0.5s infinite" : "none",
          textShadow: urgent ? `0 0 8px ${timerColor}` : "none",
        }}>
          {String(timeLeft).padStart(2, "0")}s
        </div>
        <div style={{ flex: 1, height: "8px", background: "#0a0a0a", border: `1px solid ${timerColor}40`, position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${pct * 100}%`,
            background: timerColor,
            boxShadow: `0 0 6px ${timerColor}`,
            transition: "width 1s linear, background 0.3s",
          }} />
        </div>
        <div style={{ color: "#333", fontSize: "6px", minWidth: "20px" }}>⏱</div>
      </div>
    </div>
  );
};

// ─── ЛАБИРИНТ ────────────────────────────────────────────────────────────────
const MazePuzzle = ({ onWin, onLose, addScore }: { onWin:()=>void; onLose:()=>void; addScore:(n:number)=>void }) => {
  const [maze] = useState(generateMaze);
  const [pos, setPos] = useState({ r:0, c:0 });
  const [charState, setCharState] = useState<"idle"|"walk"|"win"|"dead">("idle");
  const [trail, setTrail] = useState<Set<string>>(new Set(["0,0"]));
  const [message, setMessage] = useState("Найди выход! Избегай ловушек ⚡");

  const move = useCallback((dr: number, dc: number) => {
    setPos(prev => {
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nr >= MAZE_SIZE || nc < 0 || nc >= MAZE_SIZE) return prev;
      if (maze[nr][nc].wall) return prev;
      sfx.playMove();
      setCharState("walk");
      setTimeout(() => setCharState("idle"), 300);
      setTrail(t => new Set([...t, `${nr},${nc}`]));
      if (maze[nr][nc].isTrap) {
        setCharState("dead");
        setMessage("💀 ЛОВУШКА! Теряешь жизнь!");
        sfx.playTrap();
        setTimeout(() => onLose(), 700);
        return { r: nr, c: nc };
      }
      if (maze[nr][nc].isExit) {
        setCharState("win");
        setMessage("🎉 ВЫХОД НАЙДЕН!");
        sfx.playCorrect();
        addScore(50);
        setTimeout(() => onWin(), 700);
        return { r: nr, c: nc };
      }
      return { r: nr, c: nc };
    });
  }, [maze, onWin, onLose, addScore]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, [number,number]> = {
        ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1],
        w:[-1,0], s:[1,0], a:[0,-1], d:[0,1],
      };
      if (map[e.key]) { e.preventDefault(); move(...map[e.key]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [move]);

  const cellSize = 36;
  return (
    <div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#FFD700", fontSize:"18px", marginBottom:"10px", textAlign:"center", minHeight:"26px" }}>{message}</div>
      <div style={{ display:"flex", justifyContent:"center" }}>
        <div style={{ display:"grid", gridTemplateColumns:`repeat(${MAZE_SIZE}, ${cellSize}px)`, border:"3px solid #00ff41", boxShadow:"0 0 20px #00ff4130", background:"#050505" }}>
          {maze.map((row, r) => row.map((cell, c) => {
            const isPlayer = pos.r===r && pos.c===c;
            const isTrail = trail.has(`${r},${c}`) && !isPlayer;
            return (
              <div key={`${r},${c}`} style={{
                width:cellSize, height:cellSize,
                background: cell.wall ? "linear-gradient(135deg,#1a1a2e 30%,#0f0f1a 70%)" : "#050505",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize: isPlayer ? "20px" : "15px",
                border: cell.wall ? "1px solid #0a0a1a" : "1px solid #001200",
              }}>
                {!cell.wall && (isPlayer ? <PixelChar state={charState} />
                  : cell.isExit ? <span style={{ animation:"pulse 1s infinite" }}>🚪</span>
                  : cell.isTrap ? <span>⚡</span>
                  : isTrail ? <div style={{ width:"4px", height:"4px", background:"#00ff4150", borderRadius:"50%" }} />
                  : null)}
              </div>
            );
          }))}
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"center", marginTop:"14px", gap:"6px", flexWrap:"wrap" }}>
        {[{label:"↑",dr:-1,dc:0},{label:"↓",dr:1,dc:0},{label:"←",dr:0,dc:-1},{label:"→",dr:0,dc:1}].map(({label,dr,dc}) => (
          <button key={label} onClick={() => move(dr,dc)} style={{
            fontFamily:"'Press Start 2P',monospace", fontSize:"12px",
            background:"#0a1f0a", color:"#00ff41", border:"2px solid #00ff41",
            padding:"10px 14px", cursor:"pointer", boxShadow:"0 0 6px #00ff4140",
          }}>{label}</button>
        ))}
      </div>
      <div style={{ textAlign:"center", marginTop:"8px", fontFamily:"'VT323',monospace", color:"#333", fontSize:"14px" }}>WASD или стрелки на клавиатуре</div>
    </div>
  );
};

// ─── ПАТТЕРН ─────────────────────────────────────────────────────────────────
const PatternPuzzleComp = ({ onWin, onLose, addScore }: { onWin:()=>void; onLose:()=>void; addScore:(n:number)=>void }) => {
  const [puzzle] = useState(generatePatternPuzzle);
  const [playerAnswer, setPlayerAnswer] = useState<number[]>([]);
  const [charState, setCharState] = useState<"idle"|"walk"|"win"|"dead">("idle");
  const [message, setMessage] = useState(puzzle.description);
  const [showHint, setShowHint] = useState(false);
  const [shakeGrid, setShakeGrid] = useState(false);

  const toggle = (idx: number) => {
    sfx.playClick();
    setPlayerAnswer(prev => prev.includes(idx) ? prev.filter(i=>i!==idx) : [...prev, idx]);
  };
  const check = () => {
    const sorted = [...playerAnswer].sort((a,b)=>a-b);
    const correct = [...puzzle.solution].sort((a,b)=>a-b);
    if (JSON.stringify(sorted)===JSON.stringify(correct)) {
      setCharState("win"); setMessage("🎉 ПРАВИЛЬНО! Паттерн разгадан!");
      sfx.playCorrect(); addScore(80); setTimeout(onWin, 900);
    } else {
      setCharState("dead"); setShakeGrid(true); setMessage("❌ НЕВЕРНО! Попробуй снова...");
      sfx.playWrong();
      setTimeout(() => { setShakeGrid(false); setCharState("idle"); setMessage(puzzle.description); onLose(); }, 800);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:"12px" }}><PixelChar state={charState} /></div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#FFD700", fontSize:"18px", marginBottom:"16px", textAlign:"center" }}>{message}</div>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:"16px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 80px)", gap:"6px", animation: shakeGrid?"shake 0.1s 4":"none" }}>
          {Array.from({length:9},(_,i) => {
            const isActive = playerAnswer.includes(i);
            const isSolution = puzzle.solution.includes(i);
            return (
              <button key={i} onClick={()=>toggle(i)} style={{
                width:"80px", height:"80px",
                background: isActive?"#00ff41":"#0a1f0a",
                border:`3px solid ${isActive?"#00ff41":"#1a4a1a"}`,
                cursor:"pointer", transition:"all 0.15s",
                boxShadow: isActive?"0 0 12px #00ff41":"none",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:"22px", color: isActive?"#000":"#00ff41",
              }}>{showHint&&isSolution?"✓":isActive?"■":"□"}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:"10px", flexWrap:"wrap" }}>
        <button onClick={check} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"9px", background:"#00ff41", color:"#000", border:"none", padding:"12px 18px", cursor:"pointer", boxShadow:"0 0 12px #00ff4180" }}>ПРОВЕРИТЬ</button>
        <button onClick={()=>setPlayerAnswer([])} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"9px", background:"transparent", color:"#00ff41", border:"2px solid #00ff41", padding:"12px 18px", cursor:"pointer" }}>СБРОСИТЬ</button>
        <button onClick={()=>setShowHint(h=>!h)} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"8px", background:"transparent", color:"#FFD700", border:"2px solid #FFD700", padding:"12px 14px", cursor:"pointer" }}>💡 ПОДСКАЗКА</button>
      </div>
    </div>
  );
};

// ─── ПОСЛЕДОВАТЕЛЬНОСТЬ ──────────────────────────────────────────────────────
const SequencePuzzleComp = ({ onWin, onLose, addScore }: { onWin:()=>void; onLose:()=>void; addScore:(n:number)=>void }) => {
  const [puzzle] = useState(generateSequencePuzzle);
  const [charState, setCharState] = useState<"idle"|"walk"|"win"|"dead">("idle");
  const [message, setMessage] = useState(puzzle.description);
  const [selected, setSelected] = useState<number|null>(null);

  const choose = (option: number) => {
    setSelected(option);
    if (option === puzzle.answer) {
      setCharState("win"); setMessage("🎉 ВЕРНО! Ты разгадал последовательность!");
      sfx.playCorrect(); addScore(60); setTimeout(onWin, 900);
    } else {
      setCharState("dead"); setMessage(`❌ Неверно! Правильный ответ: ${puzzle.answer}`);
      sfx.playWrong(); setTimeout(onLose, 1000);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:"16px" }}><PixelChar state={charState} /></div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#FFD700", fontSize:"18px", marginBottom:"24px", textAlign:"center" }}>{message}</div>
      <div style={{ display:"flex", justifyContent:"center", gap:"10px", marginBottom:"28px", flexWrap:"wrap" }}>
        {puzzle.items.map((n,i) => (
          <div key={i} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"18px", color:"#00ff41", background:"#0a1f0a", border:"3px solid #00ff41", padding:"14px 18px", minWidth:"60px", textAlign:"center", boxShadow:"0 0 8px #00ff4140", animation:`fadeIn 0.3s ${i*0.1}s both` }}>{n}</div>
        ))}
        <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"18px", color:"#444", background:"#0a0a0a", border:"3px dashed #333", padding:"14px 18px", minWidth:"60px", textAlign:"center" }}>?</div>
      </div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#888", fontSize:"16px", textAlign:"center", marginBottom:"12px" }}>ВЫБЕРИ ПРАВИЛЬНЫЙ ОТВЕТ:</div>
      <div style={{ display:"flex", justifyContent:"center", gap:"12px", flexWrap:"wrap" }}>
        {puzzle.options.map((opt,i) => (
          <button key={i} onClick={()=>choose(opt)} disabled={selected!==null} style={{
            fontFamily:"'Press Start 2P',monospace", fontSize:"16px",
            background: selected===opt ? (opt===puzzle.answer?"#00ff41":"#ff0033") : "#0a1f0a",
            color: selected===opt?"#000":"#00ff41",
            border:`3px solid ${selected===opt?(opt===puzzle.answer?"#00ff41":"#ff0033"):"#1a4a1a"}`,
            padding:"14px 22px", cursor: selected!==null?"default":"pointer",
            transition:"all 0.2s", minWidth:"70px",
            boxShadow: selected===opt&&opt===puzzle.answer?"0 0 16px #00ff41":"none",
          }}>{opt}</button>
        ))}
      </div>
    </div>
  );
};

// ─── ЛОГИЧЕСКАЯ ЗАДАЧА ───────────────────────────────────────────────────────
const LogicPuzzleComp = ({ onWin, onLose, addScore }: { onWin:()=>void; onLose:()=>void; addScore:(n:number)=>void }) => {
  const [puzzle] = useState(generateLogicPuzzle);
  const [charState, setCharState] = useState<"idle"|"walk"|"win"|"dead">("idle");
  const [message, setMessage] = useState("Подумай хорошенько! 🧠");
  const [selected, setSelected] = useState<number|null>(null);
  const [showHint, setShowHint] = useState(false);

  const choose = (idx: number) => {
    setSelected(idx);
    if (idx === puzzle.answer) {
      setCharState("win"); setMessage("🎉 ВЕРНО! Блестящая логика!");
      sfx.playCorrect(); addScore(90); setTimeout(onWin, 900);
    } else {
      setCharState("dead"); setMessage("❌ Неверно! Думай нестандартно...");
      sfx.playWrong(); setTimeout(onLose, 1100);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:"12px" }}><PixelChar state={charState} /></div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#FFD700", fontSize:"18px", marginBottom:"20px", textAlign:"center", lineHeight:"1.5" }}>{message}</div>

      <div style={{
        fontFamily:"'VT323',monospace", color:"#00ff41", fontSize:"20px",
        background:"#050f05", border:"2px solid #00ff4140", padding:"16px",
        marginBottom:"20px", textAlign:"center", lineHeight:"1.6",
        boxShadow:"inset 0 0 20px #00ff4108",
      }}>
        {puzzle.question}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"16px" }}>
        {puzzle.options.map((opt, i) => (
          <button key={i} onClick={()=>choose(i)} disabled={selected!==null} style={{
            fontFamily:"'VT323',monospace", fontSize:"18px", textAlign:"left",
            background: selected===i ? (i===puzzle.answer?"#003300":"#330000") : "#0a0a0a",
            color: selected===i ? (i===puzzle.answer?"#00ff41":"#ff0033") : "#aaa",
            border:`2px solid ${selected===i?(i===puzzle.answer?"#00ff41":"#ff0033"):"#1a1a1a"}`,
            padding:"10px 16px", cursor: selected!==null?"default":"pointer",
            transition:"all 0.2s",
            boxShadow: selected===i&&i===puzzle.answer?"0 0 12px #00ff4160":"none",
          }}>
            <span style={{ color:"#555", marginRight:"10px" }}>{["A","B","C","D"][i]}.</span>
            {opt}
            {selected===i && i===puzzle.answer && <span style={{ float:"right" }}>✓</span>}
            {selected===i && i!==puzzle.answer && <span style={{ float:"right" }}>✗</span>}
          </button>
        ))}
      </div>

      {!selected && (
        <div style={{ display:"flex", justifyContent:"center" }}>
          <button onClick={()=>setShowHint(h=>!h)} style={{
            fontFamily:"'Press Start 2P',monospace", fontSize:"8px",
            background:"transparent", color:"#FFD700", border:"2px solid #FFD700",
            padding:"10px 16px", cursor:"pointer",
          }}>💡 ПОДСКАЗКА (-20 ОЧК)</button>
        </div>
      )}
      {showHint && (
        <div style={{ fontFamily:"'VT323',monospace", color:"#FFD700", fontSize:"16px", textAlign:"center", marginTop:"12px", padding:"10px", border:"1px solid #FFD70030", background:"#0a0800" }}>
          {puzzle.hint}
        </div>
      )}
    </div>
  );
};

// ─── ЭКРАН ВВОДА ИМЕНИ ────────────────────────────────────────────────────────
const EnterNameScreen = ({ score, onSubmit }: { score: number; onSubmit: (name: string) => void }) => {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const trimmed = name.trim() || "АНОНИМ";
    sfx.playLevelUp();
    onSubmit(trimmed.toUpperCase().slice(0, 10));
  };

  return (
    <div style={{ textAlign:"center", padding:"20px 0" }}>
      <div style={{ fontSize:"48px", marginBottom:"12px", animation:"bounce 0.5s infinite alternate" }}>🏆</div>
      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"13px", color:"#FFD700", textShadow:"0 0 16px #FFD700", marginBottom:"8px" }}>ПОБЕДА!</div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#00ff41", fontSize:"20px", marginBottom:"6px" }}>ИТОГОВЫЙ СЧЁТ</div>
      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"18px", color:"#FFD700", marginBottom:"24px" }}>{String(score).padStart(6, "0")}</div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#aaa", fontSize:"18px", marginBottom:"12px" }}>ВВЕДИ СВОЁ ИМЯ ДЛЯ ТАБЛИЦЫ РЕКОРДОВ:</div>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        maxLength={10}
        placeholder="ГЕРОЙ"
        style={{
          fontFamily:"'Press Start 2P',monospace", fontSize:"14px",
          background:"#0a1f0a", color:"#00ff41", border:"3px solid #00ff41",
          padding:"12px 16px", outline:"none", textAlign:"center",
          width:"200px", marginBottom:"20px", caretColor:"#00ff41",
          boxShadow:"0 0 10px #00ff4140",
        }}
      />
      <br />
      <button onClick={submit} style={{
        fontFamily:"'Press Start 2P',monospace", fontSize:"10px",
        background:"#00ff41", color:"#000", border:"none",
        padding:"14px 28px", cursor:"pointer", boxShadow:"0 0 16px #00ff41",
      }}>✓ СОХРАНИТЬ</button>
    </div>
  );
};

// ─── ТАБЛИЦА РЕКОРДОВ ─────────────────────────────────────────────────────────
const LeaderboardScreen = ({ onBack, currentScore }: { onBack:()=>void; currentScore?: number }) => {
  const scores = loadScores();
  const medals = ["🥇","🥈","🥉"];

  return (
    <div style={{ padding:"10px 0" }}>
      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"13px", color:"#FFD700", textShadow:"0 0 12px #FFD700", textAlign:"center", marginBottom:"20px" }}>
        🏆 ТАБЛИЦА РЕКОРДОВ
      </div>
      {scores.length === 0 ? (
        <div style={{ fontFamily:"'VT323',monospace", color:"#444", fontSize:"18px", textAlign:"center", padding:"30px 0" }}>
          ЕЩЁ НЕТ РЕКОРДОВ.<br />СТАНЬ ПЕРВЫМ!
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {scores.map((entry, i) => (
            <div key={i} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              background: currentScore===entry.score&&i===0 ? "#001a00" : "#0a0a0a",
              border:`2px solid ${i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#1a3a1a"}`,
              padding:"10px 14px",
              boxShadow: i===0?"0 0 10px #FFD70030":"none",
              animation: currentScore===entry.score&&i===0 ? "pulse 1s infinite" : "none",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <span style={{ fontSize:"18px", minWidth:"24px" }}>{medals[i] || `${i+1}.`}</span>
                <span style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"9px", color: i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#00ff41" }}>
                  {entry.name}
                </span>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"11px", color:"#FFD700" }}>{String(entry.score).padStart(6,"0")}</div>
                <div style={{ fontFamily:"'VT323',monospace", fontSize:"12px", color:"#444", marginTop:"2px" }}>{entry.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"center", marginTop:"20px" }}>
        <button onClick={onBack} style={{
          fontFamily:"'Press Start 2P',monospace", fontSize:"9px",
          background:"transparent", color:"#00ff41", border:"2px solid #00ff41",
          padding:"12px 20px", cursor:"pointer",
        }}>⌂ МЕНЮ</button>
      </div>
    </div>
  );
};

// ─── ЭКРАН МЕНЮ ──────────────────────────────────────────────────────────────
const MenuScreen = ({ onStart, onLeaderboard, onAchievements, highScore, muted, onToggleMute }: {
  onStart:()=>void; onLeaderboard:()=>void; onAchievements:()=>void; highScore:number; muted:boolean; onToggleMute:()=>void;
}) => {
  const [blink, setBlink] = useState(true);
  useEffect(() => { const t = setInterval(()=>setBlink(b=>!b), 600); return ()=>clearInterval(t); }, []);

  return (
    <div style={{ textAlign:"center", padding:"20px 0" }}>
      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"26px", color:"#00ff41", textShadow:"0 0 20px #00ff41", marginBottom:"6px", animation:"glow 2s infinite alternate" }}>PIXEL</div>
      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"26px", color:"#FFD700", textShadow:"0 0 16px #FFD700", marginBottom:"28px" }}>QUEST</div>
      <div style={{ marginBottom:"20px", fontSize:"2.5rem" }}><PixelChar state="idle" /></div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#888", fontSize:"16px", marginBottom:"28px", lineHeight:"1.7" }}>
        10 УРОВНЕЙ • ЛАБИРИНТЫ • ПАТТЕРНЫ • ЛОГИКА<br />
        3 ЖИЗНИ • СИСТЕМА ОЧКОВ • ТАБЛИЦА РЕКОРДОВ
      </div>
      {highScore > 0 && (
        <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"8px", color:"#FFD700", marginBottom:"20px" }}>
          РЕКОРД: {String(highScore).padStart(6,"0")}
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
        <button onClick={()=>{sfx.playClick();onStart();}} style={{
          fontFamily:"'Press Start 2P',monospace", fontSize:"12px",
          background:"#00ff41", color:"#000", border:"none",
          padding:"16px 32px", cursor:"pointer", boxShadow:"0 0 20px #00ff41",
          opacity: blink?1:0.5, transition:"opacity 0.3s",
        }}>▶ НАЧАТЬ ИГРУ</button>
        <button onClick={()=>{sfx.playClick();onLeaderboard();}} style={{
          fontFamily:"'Press Start 2P',monospace", fontSize:"9px",
          background:"transparent", color:"#FFD700", border:"2px solid #FFD700",
          padding:"12px 24px", cursor:"pointer",
        }}>🏆 РЕКОРДЫ</button>
        <button onClick={()=>{sfx.playClick();onAchievements();}} style={{
          fontFamily:"'Press Start 2P',monospace", fontSize:"9px",
          background:"transparent", color:"#aaa", border:"2px solid #333",
          padding:"12px 24px", cursor:"pointer",
        }}>🏅 ДОСТИЖЕНИЯ ({loadAchievements().length}/{ACHIEVEMENTS.length})</button>
        <button onClick={onToggleMute} style={{
          fontFamily:"'Press Start 2P',monospace", fontSize:"8px",
          background:"transparent", color:"#555", border:"2px solid #333",
          padding:"10px 20px", cursor:"pointer",
        }}>{muted?"🔇 ЗВУК ВЫКЛ":"🔊 ЗВУК ВКЛ"}</button>
      </div>
      <div style={{ fontFamily:"'VT323',monospace", color:"#222", fontSize:"12px", marginTop:"28px" }}>© 2084 PIXEL QUEST CORP.</div>
    </div>
  );
};

// ─── ТОСТ ДОСТИЖЕНИЯ ─────────────────────────────────────────────────────────
const AchievementToast = ({ achievement, onDone }: { achievement: Achievement; onDone: () => void }) => {
  useEffect(() => {
    sfx.playVictory();
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: "24px", right: "24px", zIndex: 999,
      background: "#0a0a0a", border: "3px solid #FFD700",
      padding: "14px 18px", maxWidth: "260px",
      boxShadow: "0 0 20px #FFD70060",
      animation: "slideInRight 0.4s ease-out",
    }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: "7px", color: "#FFD700", marginBottom: "6px", letterSpacing: "1px" }}>
        🏅 ДОСТИЖЕНИЕ ОТКРЫТО!
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "28px" }}>{achievement.icon}</span>
        <div>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: "8px", color: "#FFD700" }}>{achievement.title}</div>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: "14px", color: "#888", marginTop: "3px" }}>{achievement.desc}</div>
        </div>
      </div>
    </div>
  );
};

// ─── ЭКРАН ДОСТИЖЕНИЙ ─────────────────────────────────────────────────────────
const AchievementsScreen = ({ onBack }: { onBack: () => void }) => {
  const unlocked = loadAchievements();
  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: "12px", color: "#FFD700", textShadow: "0 0 12px #FFD700", textAlign: "center", marginBottom: "20px" }}>
        🏅 ДОСТИЖЕНИЯ
      </div>
      <div style={{ fontFamily: "'VT323',monospace", fontSize: "14px", color: "#444", textAlign: "center", marginBottom: "16px" }}>
        {unlocked.length}/{ACHIEVEMENTS.length} ОТКРЫТО
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {ACHIEVEMENTS.map(ach => {
          const done = unlocked.includes(ach.id);
          const isSecret = ach.secret && !done;
          return (
            <div key={ach.id} style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: done ? "#0a1500" : "#0a0a0a",
              border: `2px solid ${done ? "#FFD700" : "#1a1a1a"}`,
              padding: "10px 14px",
              opacity: done ? 1 : 0.5,
              transition: "all 0.2s",
              boxShadow: done ? "0 0 8px #FFD70030" : "none",
            }}>
              <span style={{ fontSize: "24px", filter: done ? "none" : "grayscale(1)" }}>
                {isSecret ? "❓" : ach.icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: "7px", color: done ? "#FFD700" : "#333" }}>
                  {isSecret ? "???????????" : ach.title}
                </div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: "13px", color: done ? "#888" : "#2a2a2a", marginTop: "3px" }}>
                  {isSecret ? "Секретное достижение" : ach.desc}
                </div>
              </div>
              {done && <span style={{ color: "#00ff41", fontSize: "16px" }}>✓</span>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
        <button onClick={onBack} style={{ fontFamily: "'Press Start 2P',monospace", fontSize: "9px", background: "transparent", color: "#00ff41", border: "2px solid #00ff41", padding: "12px 20px", cursor: "pointer" }}>⌂ МЕНЮ</button>
      </div>
    </div>
  );
};

// ─── ЭКРАНЫ ───────────────────────────────────────────────────────────────────
const LoseScreen = ({ onRestart, onRetry }: { onRestart:()=>void; onRetry:()=>void }) => (
  <div style={{ textAlign:"center", padding:"20px 0" }}>
    <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"20px", color:"#ff0033", textShadow:"0 0 20px #ff0033", marginBottom:"12px" }}>GAME OVER</div>
    <div style={{ fontSize:"48px", marginBottom:"12px" }}>💀</div>
    <div style={{ fontFamily:"'VT323',monospace", color:"#888", fontSize:"18px", marginBottom:"28px" }}>У ТЕБЯ КОНЧИЛИСЬ ЖИЗНИ</div>
    <div style={{ display:"flex", justifyContent:"center", gap:"14px" }}>
      <button onClick={()=>{sfx.playClick();onRetry();}} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"9px", background:"#ff0033", color:"#fff", border:"none", padding:"14px 20px", cursor:"pointer", boxShadow:"0 0 10px #ff003380" }}>↺ СНОВА</button>
      <button onClick={()=>{sfx.playClick();onRestart();}} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"9px", background:"transparent", color:"#00ff41", border:"2px solid #00ff41", padding:"14px 20px", cursor:"pointer" }}>⌂ МЕНЮ</button>
    </div>
  </div>
);

const LevelCompleteScreen = ({ level, score, speedBonus, onNext }: { level:number; score:number; speedBonus:number; onNext:()=>void }) => {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(()=>setVis(true),80); sfx.playLevelUp(); }, []);
  return (
    <div style={{ textAlign:"center", padding:"20px 0", opacity:vis?1:0, transition:"opacity 0.4s" }}>
      <div style={{ fontSize:"48px", marginBottom:"10px", animation:"bounce 0.4s infinite alternate" }}>⭐</div>
      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"13px", color:"#00ff41", textShadow:"0 0 12px #00ff41", marginBottom:"12px" }}>УРОВЕНЬ {level} ПРОЙДЕН!</div>
      {speedBonus > 0 && (
        <div style={{ animation:"fadeIn 0.4s 0.3s both" }}>
          <div style={{ fontFamily:"'VT323',monospace", color:"#aaa", fontSize:"15px", marginBottom:"4px" }}>БОНУС ЗА СКОРОСТЬ</div>
          <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"14px", color:"#FFD700", textShadow:"0 0 10px #FFD700", marginBottom:"8px", animation:"glow 1s infinite alternate" }}>
            +{speedBonus} ⚡
          </div>
        </div>
      )}
      <div style={{ fontFamily:"'VT323',monospace", color:"#FFD700", fontSize:"20px", marginBottom:"24px" }}>ОЧКИ: {String(score).padStart(6,"0")}</div>
      <button onClick={()=>{sfx.playClick();onNext();}} style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"10px", background:"#00ff41", color:"#000", border:"none", padding:"14px 24px", cursor:"pointer", boxShadow:"0 0 14px #00ff41", animation:"pulse 1s infinite" }}>
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
  const [muted, setMuted] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [speedBonus, setSpeedBonus] = useState(0);
  const timeLeftRef = useRef(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toastAch, setToastAch] = useState<Achievement | null>(null);
  const [highScore, setHighScore] = useState(() => {
    try { return Math.max(0, ...loadScores().map(s => s.score)); } catch { return 0; }
  });
  // трекинг для достижений за сессию
  const sessionRef = useRef({ mistakes: 0, totalSpeedBonus: 0, minTimeOnLevel: 999 });

  const currentLevel = LEVELS[Math.min(level, LEVELS.length - 1)];

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const addScore = useCallback((n: number) => setScore(s => s + n), []);

  const tryUnlock = useCallback((id: string) => {
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (ach && unlockAchievement(id)) setToastAch(ach);
  }, []);

  const handleLose = useCallback(() => {
    stopTimer();
    sessionRef.current.mistakes += 1;
    setLives(l => {
      const next = l - 1;
      if (next <= 0) { sfx.stopBg(); sfx.playGameOver(); setScreen("lose"); }
      else { setPuzzleKey(k => k + 1); }
      return next;
    });
  }, [stopTimer]);

  const handleWin = useCallback(() => {
    stopTimer();
    const levelCfg = LEVELS[level];
    const bonus = levelCfg.scoreReward;
    const remaining = timeLeftRef.current;
    const sb = Math.floor(remaining * (levelCfg.scoreReward / levelCfg.timeLimit));
    setSpeedBonus(sb);
    sessionRef.current.totalSpeedBonus += sb;
    if (remaining > levelCfg.timeLimit - 5) sessionRef.current.minTimeOnLevel = Math.min(sessionRef.current.minTimeOnLevel, levelCfg.timeLimit - remaining);

    // достижение: спидран (уровень пройден за первые 5 секунд)
    if (levelCfg.timeLimit - remaining <= 5) tryUnlock("speedrun");
    // достижение: на полпути
    if (level + 1 >= 5) tryUnlock("level5");

    setScore(s => {
      const next = s + bonus + sb;
      setFinalScore(next);
      if (next > highScore) setHighScore(next);
      // достижение: 10 000 очков
      if (next >= 10000) tryUnlock("score10k");
      return next;
    });

    if (level >= LEVELS.length - 1) {
      // финал — проверяем итоговые достижения
      tryUnlock("first_win");
      if (sessionRef.current.mistakes === 0) tryUnlock("no_mistakes");
      if (sessionRef.current.totalSpeedBonus >= 500) tryUnlock("speed_demon");
      setLives(l => { if (l === 1) { tryUnlock("comeback"); } return l; });
      if (sessionRef.current.mistakes === 0 && sessionRef.current.totalSpeedBonus >= 500) tryUnlock("perfectionist");
      sfx.stopBg(); sfx.playVictory();
      setTimeout(() => setScreen("enterName"), 400);
    } else {
      setScreen("levelComplete");
    }
  }, [level, highScore, stopTimer, tryUnlock]);

  // Запуск таймера при каждом новом пазле
  useEffect(() => {
    if (screen !== "playing") { stopTimer(); return; }
    const limit = currentLevel.timeLimit;
    setTimeLeft(limit);
    timeLeftRef.current = limit;
    stopTimer();
    let t = limit;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      timeLeftRef.current = t;
      if (t <= 10 && t > 0) sfx.playTick();
      if (t <= 5 && t > 0) sfx.playUrgent();
      if (t <= 0) {
        stopTimer();
        sfx.playWrong();
        handleLose();
      }
    }, 1000);
    return stopTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, puzzleKey, level]);

  const handleNameSubmit = (name: string) => {
    saveScore({ name, score: finalScore, date: new Date().toLocaleDateString("ru-RU") });
    setHighScore(Math.max(highScore, finalScore));
    setScreen("leaderboard");
  };

  const startGame = () => {
    setLevel(0); setLives(3); setScore(0); setFinalScore(0);
    sessionRef.current = { mistakes: 0, totalSpeedBonus: 0, minTimeOnLevel: 999 };
    setPuzzleKey(k => k + 1); setScreen("playing");
    sfx.stopBg(); setTimeout(() => sfx.playBg(), 100);
  };

  const nextLevel = () => { setLevel(l => l + 1); setPuzzleKey(k => k + 1); setScreen("playing"); };
  const restart = () => { stopTimer(); sfx.stopBg(); setLevel(0); setLives(3); setScore(0); setPuzzleKey(k => k + 1); setScreen("menu"); };
  const retryLevel = () => { setLives(3); setScore(0); setLevel(0); setPuzzleKey(k => k + 1); setScreen("playing"); sfx.playBg(); };
  const toggleMute = () => { const m = sfx.toggleMute(); setMuted(m); };

  const renderPuzzle = () => {
    const props = { onWin: handleWin, onLose: handleLose, addScore };
    if (currentLevel.type === "maze") return <MazePuzzle key={puzzleKey} {...props} />;
    if (currentLevel.type === "pattern") return <PatternPuzzleComp key={puzzleKey} {...props} />;
    if (currentLevel.type === "logic") return <LogicPuzzleComp key={puzzleKey} {...props} />;
    return <SequencePuzzleComp key={puzzleKey} {...props} />;
  };

  return (
    <div style={{
      minHeight:"100vh", background:"#050505",
      backgroundImage:"radial-gradient(ellipse at 20% 20%,#001a0030 0%,transparent 50%),radial-gradient(ellipse at 80% 80%,#1a000030 0%,transparent 50%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start",
      padding:"24px 16px",
    }}>
      <div style={{
        position:"fixed", top:0, left:0, right:0, bottom:0,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.12) 2px,rgba(0,0,0,0.12) 4px)",
        pointerEvents:"none", zIndex:100,
      }} />

      <div style={{ width:"100%", maxWidth:"520px", position:"relative", zIndex:1 }}>
        {screen !== "menu" && screen !== "leaderboard" && (
          <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:"7px", color:"#00ff4150", textAlign:"center", marginBottom:"8px", letterSpacing:"4px" }}>
            ▓▓ PIXEL QUEST ▓▓
          </div>
        )}

        {screen === "playing" && (
          <HUD score={score} lives={lives} level={level+1} levelTitle={currentLevel.title}
            muted={muted} onToggleMute={toggleMute}
            timeLeft={timeLeft} timeLimit={currentLevel.timeLimit}
          />
        )}

        <div style={{
          background:"#080808", border:"3px solid #00ff4130",
          padding:"24px", boxShadow:"0 0 30px #00ff4110,inset 0 0 30px #00000080",
        }}>
          {screen === "menu" && <MenuScreen onStart={startGame} onLeaderboard={()=>setScreen("leaderboard")} onAchievements={()=>setScreen("achievements")} highScore={highScore} muted={muted} onToggleMute={toggleMute} />}
          {screen === "achievements" && <AchievementsScreen onBack={()=>setScreen("menu")} />}
          {screen === "playing" && renderPuzzle()}
          {screen === "levelComplete" && <LevelCompleteScreen level={level+1} score={score} speedBonus={speedBonus} onNext={nextLevel} />}
          {screen === "enterName" && <EnterNameScreen score={finalScore} onSubmit={handleNameSubmit} />}
          {screen === "win" && <LeaderboardScreen onBack={restart} />}
          {screen === "leaderboard" && <LeaderboardScreen onBack={()=>setScreen("menu")} />}
          {screen === "lose" && <LoseScreen onRestart={restart} onRetry={retryLevel} />}
        </div>
      </div>

      {toastAch && <AchievementToast achievement={toastAch} onDone={() => setToastAch(null)} />}

      <style>{`
        @keyframes glow { from{text-shadow:0 0 10px #00ff41,0 0 20px #00ff4180} to{text-shadow:0 0 20px #00ff41,0 0 50px #00ff41,0 0 70px #00ff4180} }
        @keyframes bounce { from{transform:translateY(0)} to{transform:translateY(-8px)} }
        @keyframes sway { from{transform:translateX(-2px)} to{transform:translateX(2px)} }
        @keyframes shake { from{transform:translateX(-5px)} to{transform:translateX(5px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideInRight { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; }
        button:hover { opacity:0.85; }
        input::placeholder { color: #00ff4150; }
      `}</style>
    </div>
  );
}