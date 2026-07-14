// Port of TowerTap/Sources/TowerTapCore/GameEngine.swift -- keep the two in sync.
class GameEngine {
  static perfectTolerance = 6;
  static minPlayableWidth = 8;
  static baseSpeed = 120;
  static speedRampPerBlock = 4;
  static maxSpeed = 320;

  constructor(boundsWidth = 360, startWidth = 140) {
    this.bounds = [0, boundsWidth];
    this.stack = [{ x: boundsWidth / 2, width: startWidth }];
    this.speed = GameEngine.baseSpeed;
    this.current = { x: startWidth / 2, width: startWidth };
    this.direction = 1;
    this.score = 0;
    this.combo = 0;
    this.state = "playing";
  }

  update(dt) {
    if (this.state !== "playing") return;
    this.current.x += this.direction * this.speed * dt;
    const minX = this.bounds[0] + this.current.width / 2;
    const maxX = this.bounds[1] - this.current.width / 2;
    if (this.current.x >= maxX) { this.current.x = maxX; this.direction = -1; }
    if (this.current.x <= minX) { this.current.x = minX; this.direction = 1; }
  }

  static resolvePlacement(current, top, minPlayableWidth = GameEngine.minPlayableWidth, perfectTolerance = GameEngine.perfectTolerance) {
    const curLeft = current.x - current.width / 2;
    const curRight = current.x + current.width / 2;
    const topLeft = top.x - top.width / 2;
    const topRight = top.x + top.width / 2;
    const overlapLeft = Math.max(curLeft, topLeft);
    const overlapRight = Math.min(curRight, topRight);
    const overlapWidth = overlapRight - overlapLeft;
    if (overlapWidth < minPlayableWidth) return { outcome: "missed", block: null };
    const smallerWidth = Math.min(current.width, top.width);
    const isPerfect = (smallerWidth - overlapWidth) <= perfectTolerance;
    return { outcome: "placed", perfect: isPerfect, block: { x: (overlapLeft + overlapRight) / 2, width: overlapWidth } };
  }

  drop() {
    if (this.state !== "playing") return { outcome: "missed" };
    const top = this.stack[this.stack.length - 1];
    const result = GameEngine.resolvePlacement(this.current, top);
    if (result.outcome === "missed") {
      this.state = "gameOver";
    } else {
      this.stack.push(result.block);
      this.combo = result.perfect ? this.combo + 1 : 0;
      this.score += 1 + this.combo;
      this.speed = Math.min(GameEngine.maxSpeed, GameEngine.baseSpeed + this.stack.length * GameEngine.speedRampPerBlock);
      this.current = { x: this.bounds[0] + result.block.width / 2, width: result.block.width };
      this.direction = 1;
    }
    return result;
  }

  reset() {
    const startWidth = this.stack[0]?.width ?? 140;
    this.stack = [{ x: (this.bounds[0] + this.bounds[1]) / 2, width: startWidth }];
    this.current = { x: this.bounds[0] + startWidth / 2, width: startWidth };
    this.direction = 1;
    this.speed = GameEngine.baseSpeed;
    this.score = 0;
    this.combo = 0;
    this.state = "playing";
  }
}

// -- self-check, mirrors GameEngineSelfCheck/main.swift --
(function selfCheck() {
  const results = [];
  const check = (cond, msg) => results.push([cond, msg]);

  {
    const top = { x: 180, width: 140 }, current = { x: 182, width: 140 };
    const r = GameEngine.resolvePlacement(current, top);
    check(r.outcome === "placed" && r.perfect, "near-full overlap should be perfect");
    check(Math.abs(r.block.width - 138) < 0.001, "placed width should equal overlap width");
  }
  {
    const engine = new GameEngine(200, 20);
    const targetX = engine.bounds[1] - engine.current.width / 2;
    engine.update((targetX - engine.current.x) / engine.speed);
    check(engine.drop().outcome === "missed", "off-tower drop should miss");
    check(engine.state === "gameOver", "a miss should end the game");
  }

  const failed = results.filter(([cond]) => !cond);
  if (failed.length) {
    console.error("GameEngine self-check FAILED:", failed.map(([, m]) => m));
  } else {
    console.log(`GameEngine self-check passed (${results.length} checks).`);
  }
})();

// -- rendering + input --
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const finalScoreEl = document.getElementById("finalScore");
const BLOCK_HEIGHT = 32;
const VISIBLE_BLOCKS = 8;
const COLORS = ["#2EC4B6", "#FF5D8F", "#FFC93C", "#FF7A45"];

let best = parseInt(localStorage.getItem("towertap.best") || "0", 10);
bestEl.textContent = `BEST ${best}`;

let engine;
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  engine = new GameEngine(canvas.width);
}
window.addEventListener("resize", resize);
resize();

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  ctx.fillStyle = "#0b0e1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const baseY = canvas.height - 120;
  const startIndex = Math.max(0, engine.stack.length - VISIBLE_BLOCKS);

  engine.stack.slice(startIndex).forEach((block, offset) => {
    const y = baseY - offset * BLOCK_HEIGHT;
    ctx.fillStyle = COLORS[(startIndex + offset) % COLORS.length];
    roundedRect(block.x - block.width / 2, y - BLOCK_HEIGHT, block.width, BLOCK_HEIGHT - 2, 4);
    ctx.fill();
  });

  if (engine.state === "playing") {
    const y = baseY - (engine.stack.length - startIndex) * BLOCK_HEIGHT;
    ctx.fillStyle = "#FF7A45";
    roundedRect(engine.current.x - engine.current.width / 2, y - BLOCK_HEIGHT, engine.current.width, BLOCK_HEIGHT - 2, 4);
    ctx.fill();
  }

  scoreEl.textContent = engine.score;
}

let lastTime = null;
function loop(t) {
  if (lastTime != null) {
    const dt = Math.min((t - lastTime) / 1000, 1 / 30);
    engine.update(dt);
  }
  lastTime = t;
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function drop() {
  const result = engine.drop();
  if (result.outcome === "missed") {
    if (engine.score > best) {
      best = engine.score;
      localStorage.setItem("towertap.best", String(best));
      bestEl.textContent = `BEST ${best}`;
    }
    finalScoreEl.textContent = `Score ${engine.score}`;
    overlay.classList.add("show");
  }
  if (navigator.vibrate) navigator.vibrate(result.perfect ? 20 : 8);
}

canvas.addEventListener("pointerdown", () => {
  if (engine.state === "playing") drop();
});

document.getElementById("retry").addEventListener("click", () => {
  overlay.classList.remove("show");
  lastTime = null;
  engine.reset();
});
