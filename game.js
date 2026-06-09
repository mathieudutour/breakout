/* ============================================================
   BRICK SURVIVORS  —  Breakout × Vampire Survivors
   Core game engine, physics, waves, weapons & evolutions.
   ============================================================ */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---- Screens / DOM ----
  const $ = (id) => document.getElementById(id);
  const startScreen = $("start-screen");
  const levelupScreen = $("levelup-screen");
  const gameoverScreen = $("gameover-screen");
  const pauseScreen = $("pause-screen");
  const cardRow = $("card-row");
  const wrap = $("game-wrap");

  // ---- Logical sizing (DPR-aware) ----
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    // Use the *visual* viewport so we exclude iOS Safari's toolbars; this
    // keeps the canvas and the HTML overlays sized to the truly visible area.
    const vv = window.visualViewport;
    W = (vv && vv.width) || window.innerWidth;
    H = (vv && vv.height) || window.innerHeight;
    // Pin the wrapper (and thus the overlays) to the visible height so the
    // bottom buttons never hide behind the browser toolbar.
    if (wrap) { wrap.style.width = W + "px"; wrap.style.height = H + "px"; }
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (paddle) paddle.y = H - 46;
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

  // ---- Constants ----
  const PADDLE_BASE_W = 120;
  const PADDLE_H = 14;
  const BALL_R = 8;
  const BALL_BASE_SPEED = 430;
  const BRICK_W = 56, BRICK_H = 22, CELL = 64, ROW_H = 30;
  const SPAWN_TOP_Y = 54;

  // ---- Game state ----
  const STATE = { START: 0, PLAY: 1, LEVELUP: 2, PAUSE: 3, OVER: 4 };
  let state = STATE.START;

  let paddle, balls, bricks, bullets, gems, particles, explosions, orbitals;
  let run, stats;
  let mouseX = null, keyLeft = false, keyRight = false;
  let shake = 0, flash = 0;
  let lastT = 0, accGameTime = 0;
  let breachCD = 0, dmgBuff = 0;
  let cannonTimer = 0, ballstormTimer = 0;

  // ---- Helpers ----
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function freshRun() {
    const me = window.metaEffects ? metaEffects() : {
      bonusLives: 0, startDamage: 0, hotStart: 0, xpMult: 1, coreMult: 1,
      rerolls: 0, banishes: 0, paddleMult: 1,
    };
    run = {
      up: {},          // upgradeId -> level
      evo: {},         // evolutionId -> true
      level: 1,
      xp: 0,
      need: xpNeeded(1),
      lives: 3,
      maxLives: 3,
      score: 0,
      bricksBroken: 0,
      pending: 0,
      metaEff: me,
      rerolls: me.rerolls,
      banishes: me.banishes,
    };
    // Hot Start: begin with random weapons already leveled.
    const weapons = UPGRADES.filter((u) => u.kind === "weapon");
    for (let i = 0; i < me.hotStart; i++) {
      const w = weapons[(Math.random() * weapons.length) | 0];
      run.up[w.id] = Math.min((run.up[w.id] || 0) + 1, w.max);
    }
    recompute();
    run.lives = stats.maxLives;
  }

  function xpNeeded(level) {
    return Math.floor(5 + level * 3 + level * level * 0.7);
  }

  function recompute() {
    const u = run.up, evo = run.evo, me = run.metaEff;
    const L = (id) => u[id] || 0;
    stats = {
      extraBalls: L("multiball") + (evo.ballstorm ? 1 : 0),
      pierce: L("pierce"),
      cannonLvl: L("cannons"),
      orbitCount: L("orbit") + (evo.ballstorm ? 1 : 0),
      fireLvl: L("fireball"),
      ballDamage: 1 + L("power") + L("bounce") * 0.5 + me.startDamage,
      ballSpeedMult: 1 + L("bounce") * 0.08,
      paddleMult: (1 + L("wide") * 0.16) * me.paddleMult,
      magnetRange: 78 * (1 + L("magnet") * 0.4) + (evo.singularity ? 5000 : 0),
      xpMult: (1 + L("xpgain") * 0.15) * me.xpMult,
      slowMult: 1 - L("slowfall") * 0.18,
      maxLives: 3 + L("life") + me.bonusLives,
      evo,
    };
  }

  // ============================================================
  //  SETUP / RESET
  // ============================================================
  function startGame() {
    freshRun();
    paddle = { x: W / 2, y: H - 46, w: PADDLE_BASE_W, vis: PADDLE_BASE_W };
    balls = [];
    bricks = [];
    bullets = [];
    gems = [];
    particles = [];
    explosions = [];
    orbitals = [];
    accGameTime = 0;
    breachCD = 0; dmgBuff = 0; cannonTimer = 0; ballstormTimer = 0;
    shake = 0; flash = 0;
    spawnDistSinceRow = 0;
    // a couple starting rows so there's something to hit
    for (let i = 0; i < 4; i++) spawnRow(SPAWN_TOP_Y - i * ROW_H, i * 0.4);
    stickNewBalls();
    hide(startScreen); hide(gameoverScreen); hide(levelupScreen); hide(pauseScreen);
    state = STATE.PLAY;
  }

  // Balls stuck to paddle waiting to launch
  function stickNewBalls() {
    balls = [];
    const n = 1 + stats.extraBalls;
    for (let i = 0; i < n; i++) {
      balls.push(makeBall(true, i, n));
    }
  }

  function makeBall(stuck, idx = 0, n = 1) {
    return {
      x: paddle.x + (idx - (n - 1) / 2) * 16,
      y: paddle.y - BALL_R - 2,
      vx: 0, vy: 0,
      r: BALL_R,
      stuck: !!stuck,
      pierceLeft: stats.pierce,
      trail: [],
    };
  }

  function launchBalls() {
    const speed = BALL_BASE_SPEED * stats.ballSpeedMult;
    let any = false;
    balls.forEach((b, i) => {
      if (b.stuck) {
        any = true;
        const spread = (balls.length > 1 ? (i / (balls.length - 1) - 0.5) : 0) * 0.7;
        const ang = -Math.PI / 2 + spread;
        b.vx = Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
        b.stuck = false;
        b.pierceLeft = stats.pierce;
      }
    });
    if (any) spawnBurst(paddle.x, paddle.y - 10, "#5ef2c8", 10);
  }

  // ============================================================
  //  BRICK SWARM (the "survival" pressure)
  // ============================================================
  let spawnDistSinceRow = 0;

  function brickColor(hp, maxHp) {
    const t = clamp(hp / maxHp, 0, 1);
    // hot (low hp -> cooler? ) use hue from red(tough) to cyan(weak)
    const hue = 170 - (1 - t) * 0 + (maxHp - 1) * -8;
    const h = clamp(190 - (maxHp - 1) * 22, 0, 200);
    return `hsl(${h}, 80%, ${42 + t * 14}%)`;
  }

  function spawnRow(y, jitterChance = 0) {
    const cols = Math.max(4, Math.floor((W - 24) / CELL));
    const totalW = cols * CELL - (CELL - BRICK_W);
    const startX = (W - totalW) / 2;
    const baseHp = 1 + Math.floor(accGameTime / 16);
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.08 + jitterChance) continue; // gaps
      let hp = baseHp;
      const roll = Math.random();
      if (roll > 0.9) hp += 2;      // armored
      else if (roll > 0.72) hp += 1;
      bricks.push({
        x: startX + c * CELL,
        y,
        w: BRICK_W, h: BRICK_H,
        hp, maxHp: hp,
        flash: 0,
      });
    }
  }

  function updateSwarm(dt) {
    const speed = (7 + accGameTime * 0.32) * stats.slowMult;
    const dy = speed * dt;
    for (const b of bricks) b.y += dy;
    spawnDistSinceRow += dy;
    if (spawnDistSinceRow >= ROW_H) {
      spawnDistSinceRow -= ROW_H;
      spawnRow(SPAWN_TOP_Y);
    }
    // Breach check
    const dangerY = paddle.y - 18;
    let breached = false;
    for (let i = bricks.length - 1; i >= 0; i--) {
      if (bricks[i].y + bricks[i].h >= dangerY) {
        spawnBurst(bricks[i].x + BRICK_W / 2, bricks[i].y, "#ff5e9c", 8);
        bricks.splice(i, 1);
        breached = true;
      }
    }
    if (breached && breachCD <= 0) {
      loseLife();
      breachCD = 1.4;
    }
  }

  // ============================================================
  //  DAMAGE / DEATH
  // ============================================================
  function damageBrick(brick, dmg, fromX, fromY) {
    brick.hp -= dmg;
    brick.flash = 0.12;
    if (brick.hp <= 0) {
      destroyBrick(brick);
      return true;
    }
    return false;
  }

  function destroyBrick(brick) {
    const i = bricks.indexOf(brick);
    if (i === -1) return;
    bricks.splice(i, 1);
    run.score += 10;
    run.bricksBroken++;
    const cx = brick.x + brick.w / 2, cy = brick.y + brick.h / 2;
    spawnBurst(cx, cy, brickColor(brick.maxHp, brick.maxHp), 7 + brick.maxHp * 2);
    // drop gem(s)
    const val = 1 + Math.floor(brick.maxHp / 2);
    gems.push({ x: cx, y: cy, vx: rand(-40, 40), vy: rand(-60, -10), value: val, r: 5, t: 0 });
  }

  function explode(x, y, radius, dmg, color) {
    explosions.push({ x, y, r: 6, max: radius, t: 0, color: color || "#ff8a3d" });
    shake = Math.max(shake, radius * 0.06);
    for (let i = bricks.length - 1; i >= 0; i--) {
      const b = bricks[i];
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      if (Math.hypot(bx - x, by - y) <= radius) damageBrick(b, dmg);
    }
  }

  function loseLife() {
    run.lives--;
    shake = Math.max(shake, 14);
    flash = 0.5;
    if (run.lives <= 0) return gameOver();
  }

  function gameOver() {
    state = STATE.OVER;
    let earnedLine = "";
    if (window.bankRun) {
      const earned = bankRun(run, accGameTime);
      const total = loadMeta().cores;
      earnedLine = `<div class="earned">◈ Salvaged <b>${earned}</b> Cores &nbsp;·&nbsp; <span>${total} total</span></div>`;
    }
    $("stats").innerHTML =
      `<div>Reached Level <b>${run.level}</b></div>` +
      `<div>Bricks smashed <b>${run.bricksBroken}</b></div>` +
      `<div>Survived <b>${Math.floor(accGameTime)}s</b></div>` +
      `<div>Score <b>${run.score.toLocaleString()}</b></div>` +
      earnedLine;
    show(gameoverScreen);
  }

  // ============================================================
  //  XP / LEVEL UP
  // ============================================================
  function gainXp(v) {
    run.xp += v * stats.xpMult;
    while (run.xp >= run.need) {
      run.xp -= run.need;
      run.level++;
      run.need = xpNeeded(run.level);
      run.pending = (run.pending || 0) + 1;
    }
    if (run.pending > 0 && state === STATE.PLAY) openLevelUp();
  }

  function openLevelUp() {
    state = STATE.LEVELUP;
    renderChoices();
    show(levelupScreen);
  }

  function renderChoices() {
    const choices = rollChoices(run, 3);
    cardRow.innerHTML = "";
    for (const ch of choices) {
      const card = document.createElement("div");
      card.className = "card" + (ch.evo ? " evo" : "");
      if (ch.evo) {
        card.innerHTML =
          `<div class="icon">${ch.def.icon}</div>` +
          `<div class="name">${ch.def.name}</div>` +
          `<div class="lvl">Evolution</div>` +
          `<div class="desc">${ch.def.blurb}</div>` +
          `<div class="evo-tag">★ EVOLVE</div>`;
        card.onclick = () => pickEvolution(ch.def);
      } else {
        const cur = run.up[ch.def.id] || 0;
        card.innerHTML =
          `<div class="icon">${ch.def.icon}</div>` +
          `<div class="name">${ch.def.name}</div>` +
          `<div class="lvl">${ch.filler ? "Bonus" : (cur === 0 ? "New!" : "Lv " + (cur + 1) + " / " + ch.def.max)}</div>` +
          `<div class="desc">${ch.def.desc(ch.filler ? 1 : ch.level)}</div>` +
          `<div class="evo-tag">&nbsp;</div>`;
        card.onclick = () => pickUpgrade(ch.def);
      }
      cardRow.appendChild(card);
    }
    renderLevelUpActions();
  }

  function renderLevelUpActions() {
    const wrap = $("levelup-actions");
    wrap.innerHTML = "";
    const reroll = document.createElement("button");
    reroll.className = "mini-btn";
    reroll.textContent = `🎲 Reroll (${run.rerolls})`;
    reroll.disabled = run.rerolls <= 0;
    reroll.onclick = () => { if (run.rerolls > 0) { run.rerolls--; renderChoices(); } };
    wrap.appendChild(reroll);

    const skip = document.createElement("button");
    skip.className = "mini-btn";
    skip.textContent = `🚫 Skip (${run.banishes})`;
    skip.disabled = run.banishes <= 0;
    skip.onclick = () => { if (run.banishes > 0) { run.banishes--; closeLevelUp(); } };
    wrap.appendChild(skip);
  }

  function pickUpgrade(def) {
    const before = run.up[def.id] || 0;
    run.up[def.id] = before + 1;
    applyImmediate(def, before + 1);
    recompute();
    closeLevelUp();
  }

  function pickEvolution(def) {
    run.evo[def.id] = true;
    recompute();
    spawnBurst(paddle.x, paddle.y - 30, "#ffd35e", 26);
    closeLevelUp();
  }

  function applyImmediate(def, level) {
    // Repair Kit heals a life; the cap is enforced in closeLevelUp after recompute.
    if (def.id === "life") run.lives += 1;
    // Extra balls / orbitals are derived live from stats, no action needed here.
  }

  function closeLevelUp() {
    run.pending = Math.max(0, (run.pending || 0) - 1);
    syncOrbitals();
    run.lives = Math.min(run.lives, stats.maxLives); // keep within new max
    if (run.pending > 0) {
      renderChoices(); // more level-ups queued — show the next set of cards
    } else {
      hide(levelupScreen);
      state = STATE.PLAY;
    }
  }

  // ============================================================
  //  WEAPONS: orbitals, cannons
  // ============================================================
  function syncOrbitals() {
    const want = stats.orbitCount;
    while (orbitals.length < want) orbitals.push({ ang: orbitals.length * 1.7, hitCD: new Map() });
    while (orbitals.length > want) orbitals.pop();
  }

  function updateCannons(dt) {
    if (stats.cannonLvl <= 0) return;
    cannonTimer -= dt;
    const interval = Math.max(0.18, 0.85 - stats.cannonLvl * 0.13);
    if (cannonTimer <= 0) {
      cannonTimer = interval;
      const barrels = 1 + Math.floor(stats.cannonLvl / 2);
      for (let i = 0; i < barrels; i++) {
        const off = (i - (barrels - 1) / 2) * 22;
        bullets.push({
          x: paddle.x + off, y: paddle.y - 8,
          vy: -640, r: 4,
          dmg: 1 + (run.up.power || 0) * 0.5,
          arty: !!run.evo.artillery,
        });
      }
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y += b.vy * dt;
      if (b.y < -10) { bullets.splice(i, 1); continue; }
      for (let j = bricks.length - 1; j >= 0; j--) {
        const k = bricks[j];
        if (b.x >= k.x && b.x <= k.x + k.w && b.y >= k.y && b.y <= k.y + k.h) {
          if (b.arty) explode(b.x, b.y, 60, b.dmg, "#ffb14d");
          else damageBrick(k, b.dmg);
          spawnBurst(b.x, b.y, "#ffd35e", 4);
          bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  function updateOrbitals(dt) {
    if (orbitals.length === 0) return;
    const cx = paddle.x, cy = paddle.y - 4;
    const radius = 78;
    const dmg = 0.5 + stats.ballDamage * 0.35;
    for (const o of orbitals) {
      o.ang += dt * 2.6;
      const ox = cx + Math.cos(o.ang) * radius;
      const oy = cy + Math.sin(o.ang) * radius * 0.65;
      o.x = ox; o.y = oy;
      for (let j = bricks.length - 1; j >= 0; j--) {
        const k = bricks[j];
        if (ox >= k.x - 8 && ox <= k.x + k.w + 8 && oy >= k.y - 8 && oy <= k.y + k.h + 8) {
          const last = o.hitCD.get(k) || 0;
          if (accGameTime - last > 0.25) {
            o.hitCD.set(k, accGameTime);
            damageBrick(k, dmg);
            spawnBurst(ox, oy, "#9d7bff", 3);
          }
        }
      }
    }
    // Ball Storm evo: orbitals occasionally fling a ball outward
    if (run.evo.ballstorm) {
      ballstormTimer -= dt;
      if (ballstormTimer <= 0 && orbitals.length) {
        ballstormTimer = 2.2;
        const o = orbitals[(Math.random() * orbitals.length) | 0];
        const sp = BALL_BASE_SPEED * stats.ballSpeedMult;
        const ang = o.ang;
        if (balls.length < 12) {
          balls.push({
            x: o.x, y: o.y,
            vx: Math.cos(ang) * sp, vy: -Math.abs(Math.sin(ang) * sp) - 120,
            r: BALL_R - 1, stuck: false, pierceLeft: stats.pierce, trail: [], temp: true,
          });
        }
      }
    }
  }

  // ============================================================
  //  BALLS
  // ============================================================
  function updateBalls(dt) {
    const speedTarget = BALL_BASE_SPEED * stats.ballSpeedMult;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.stuck) {
        b.x = paddle.x + (i - (balls.length - 1) / 2) * 16;
        b.y = paddle.y - b.r - 2;
        continue;
      }
      // trail
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // walls
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }

      // bottom -> lost
      if (b.y - b.r > H) {
        balls.splice(i, 1);
        continue;
      }

      // paddle
      if (b.vy > 0 && b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + PADDLE_H &&
          b.x >= paddle.x - paddle.w / 2 - b.r && b.x <= paddle.x + paddle.w / 2 + b.r) {
        b.y = paddle.y - b.r;
        const rel = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
        const ang = -Math.PI / 2 + rel * 1.05;
        b.vx = Math.cos(ang) * speedTarget;
        b.vy = Math.sin(ang) * speedTarget;
        b.pierceLeft = stats.pierce;
        spawnBurst(b.x, paddle.y, "#5ef2c8", 4);
      }

      // bricks
      collideBallBricks(b);

      // normalize speed
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const f = speedTarget / sp;
        b.vx *= f; b.vy *= f;
      }
    }
  }

  function collideBallBricks(b) {
    for (let j = bricks.length - 1; j >= 0; j--) {
      const k = bricks[j];
      const nx = clamp(b.x, k.x, k.x + k.w);
      const ny = clamp(b.y, k.y, k.y + k.h);
      const dx = b.x - nx, dy = b.y - ny;
      if (dx * dx + dy * dy <= b.r * b.r) {
        const dmg = stats.ballDamage * (dmgBuff > 0 ? 1.6 : 1);
        const killed = damageBrick(k, dmg);
        if (stats.fireLvl > 0) {
          let rad = 26 + stats.fireLvl * 13;
          let edmg = dmg * 0.55;
          if (run.evo.meteor) { rad *= 1.6; edmg *= 1.4; }
          explode(b.x, b.y, rad, edmg, run.evo.meteor ? "#ff5e3d" : "#ff8a3d");
        }
        // bounce unless piercing
        if (b.pierceLeft > 0 && !killed) {
          b.pierceLeft--;
        } else if (b.pierceLeft > 0 && killed) {
          b.pierceLeft--; // keep going through gap
        } else {
          // resolve bounce by smallest penetration axis
          const overlapX = b.r - Math.abs(dx);
          const overlapY = b.r - Math.abs(dy);
          if (Math.abs(dx) > Math.abs(dy)) {
            b.vx = dx >= 0 ? Math.abs(b.vx) : -Math.abs(b.vx);
          } else {
            b.vy = dy >= 0 ? Math.abs(b.vy) : -Math.abs(b.vy);
          }
          b.pierceLeft = stats.pierce;
        }
        break;
      }
    }
  }

  // ============================================================
  //  GEMS / PARTICLES / EXPLOSIONS
  // ============================================================
  function updateGems(dt) {
    const px = paddle.x, py = paddle.y;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.t += dt;
      const dx = px - g.x, dy = py - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < stats.magnetRange) {
        const pull = 1 - dist / stats.magnetRange;
        const f = 600 * pull * dt;
        g.vx += (dx / dist) * f;
        g.vy += (dy / dist) * f;
      } else {
        g.vy += 120 * dt; // gravity
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      // collect
      if (dist < 26) {
        gainXp(g.value);
        if (run.evo.singularity) dmgBuff = Math.max(dmgBuff, 1.5);
        spawnBurst(g.x, g.y, "#5ef2c8", 4);
        gems.splice(i, 1);
        continue;
      }
      if (g.y > H + 40) gems.splice(i, 1);
    }
  }

  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(40, 220);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.25, 0.6), t: 0, color, r: rand(1.5, 3.5),
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.t += dt;
      e.r += (e.max - e.r) * Math.min(1, dt * 14);
      if (e.t > 0.4) explosions.splice(i, 1);
    }
  }

  // ============================================================
  //  UPDATE LOOP
  // ============================================================
  function update(dt) {
    if (state !== STATE.PLAY) return;
    accGameTime += dt;
    if (breachCD > 0) breachCD -= dt;
    if (dmgBuff > 0) dmgBuff -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);

    // paddle movement
    paddle.w += (PADDLE_BASE_W * stats.paddleMult - paddle.w) * Math.min(1, dt * 8);
    if (mouseX != null) paddle.x = mouseX;
    const kspeed = 720 * dt;
    if (keyLeft) paddle.x -= kspeed;
    if (keyRight) paddle.x += kspeed;
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

    updateSwarm(dt);
    updateCannons(dt);
    updateBullets(dt);
    syncOrbitals();
    updateOrbitals(dt);
    updateBalls(dt);
    updateGems(dt);
    updateParticles(dt);

    // out of balls -> lose a life and re-stick
    if (balls.length === 0) {
      loseLife();
      if (state === STATE.PLAY) stickNewBalls();
    }
  }

  // ============================================================
  //  RENDER
  // ============================================================
  function render() {
    ctx.clearRect(0, 0, W, H);
    // No run in progress yet (START screen): nothing to draw on the canvas.
    if (!paddle) return;
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    drawDangerLine();
    drawBricks();
    drawGems();
    drawOrbitals();
    drawBullets();
    drawBalls();
    drawPaddle();
    drawParticles();
    drawExplosions();

    ctx.restore();
    drawHUD();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,60,110,${flash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawDangerLine() {
    const y = paddle.y - 18;
    ctx.save();
    ctx.strokeStyle = "rgba(255,94,156,0.25)";
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBricks() {
    for (const b of bricks) {
      const col = brickColor(b.hp, b.maxHp);
      ctx.fillStyle = b.flash > 0 ? "#ffffff" : col;
      if (b.flash > 0) b.flash -= 0.016;
      roundRect(b.x, b.y, b.w, b.h, 5);
      ctx.fill();
      // top highlight
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(b.x, b.y, b.w, b.h * 0.4, 5);
      ctx.fill();
      if (b.maxHp > 1) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = "bold 11px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText(Math.ceil(b.hp), b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }

  function drawPaddle() {
    const x = paddle.x - paddle.w / 2;
    ctx.save();
    ctx.shadowColor = "#5ef2c8";
    ctx.shadowBlur = 18;
    const grad = ctx.createLinearGradient(x, 0, x + paddle.w, 0);
    grad.addColorStop(0, "#3fd9b0");
    grad.addColorStop(0.5, "#7dffd8");
    grad.addColorStop(1, "#3fd9b0");
    ctx.fillStyle = grad;
    roundRect(x, paddle.y, paddle.w, PADDLE_H, 7);
    ctx.fill();
    ctx.restore();
  }

  function drawBalls() {
    for (const b of balls) {
      // trail
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const a = (i / b.trail.length) * 0.4;
        ctx.fillStyle = `rgba(125,255,216,${a})`;
        ctx.beginPath(); ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, 7); ctx.fill();
      }
      ctx.save();
      ctx.shadowColor = "#7dffd8";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#eafff8";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function drawOrbitals() {
    for (const o of orbitals) {
      if (o.x == null) continue;
      ctx.save();
      ctx.shadowColor = "#9d7bff"; ctx.shadowBlur = 12;
      ctx.fillStyle = "#c9b6ff";
      ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.fillStyle = "#ffd35e";
    for (const b of bullets) {
      ctx.save();
      ctx.shadowColor = "#ffd35e"; ctx.shadowBlur = 8;
      roundRect(b.x - 2, b.y - 7, 4, 12, 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawGems() {
    for (const g of gems) {
      const pulse = 1 + Math.sin(g.t * 8) * 0.12;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = "#5ef2c8"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#5ef2c8";
      const s = g.r * pulse;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawExplosions() {
    for (const e of explosions) {
      const a = 1 - e.t / 0.4;
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.stroke();
      ctx.globalAlpha = a * 0.25;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function drawHUD() {
    // top bar background
    ctx.fillStyle = "rgba(5,5,12,0.55)";
    ctx.fillRect(0, 0, W, 42);

    // lives (hearts)
    ctx.font = "20px Trebuchet MS";
    ctx.textAlign = "left";
    let hx = 14;
    for (let i = 0; i < stats.maxLives; i++) {
      ctx.globalAlpha = i < run.lives ? 1 : 0.22;
      ctx.fillText("❤", hx, 30);
      hx += 26;
    }
    ctx.globalAlpha = 1;

    // level + xp bar (center)
    const barW = Math.min(360, W * 0.4);
    const bx = (W - barW) / 2, by = 14;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(bx, by, barW, 14, 7); ctx.fill();
    const frac = clamp(run.xp / run.need, 0, 1);
    ctx.fillStyle = "#5ef2c8";
    roundRect(bx, by, Math.max(2, barW * frac), 14, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("LV " + run.level, W / 2, by + 11);

    // score + time (right)
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd35e";
    ctx.font = "bold 16px Trebuchet MS";
    ctx.fillText(run.score.toLocaleString(), W - 14, 20);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "12px Trebuchet MS";
    ctx.fillText(Math.floor(accGameTime) + "s", W - 14, 36);

    // launch hint
    if (state === STATE.PLAY && balls.some((b) => b.stuck)) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "16px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText("Tap / Click / Space to launch", W / 2, paddle.y - 60);
    }
  }

  // ============================================================
  //  MAIN LOOP
  // ============================================================
  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0);
    lastT = t;
    // Never let a single bad frame kill the loop — always reschedule.
    try {
      update(dt);
      render();
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(loop);
  }

  // ============================================================
  //  INPUT
  // ============================================================
  const canvasX = (clientX) => clientX;

  window.addEventListener("mousemove", (e) => { mouseX = canvasX(e.clientX); });

  // Touch: drag anywhere to move the paddle while playing; tap to launch.
  let touchMoved = false;
  canvas.addEventListener("touchstart", (e) => {
    if (!e.touches[0]) return;
    mouseX = canvasX(e.touches[0].clientX);
    touchMoved = false;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!e.touches[0]) return;
    mouseX = canvasX(e.touches[0].clientX);
    touchMoved = true;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    // A tap (no significant drag) launches the ball.
    if (!touchMoved && state === STATE.PLAY) launchBalls();
    e.preventDefault();
  }, { passive: false });

  function primaryAction() {
    if (state === STATE.PLAY) launchBalls();
  }
  canvas.addEventListener("mousedown", primaryAction);

  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keyLeft = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keyRight = true;
    if (e.code === "Space") {
      e.preventDefault();
      if (state === STATE.START) startGame();
      else if (state === STATE.OVER) startGame();
      else primaryAction();
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === STATE.PLAY) { state = STATE.PAUSE; show(pauseScreen); }
      else if (state === STATE.PAUSE) { state = STATE.PLAY; hide(pauseScreen); }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keyLeft = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keyRight = false;
  });

  $("start-btn").addEventListener("click", startGame);
  $("restart-btn").addEventListener("click", startGame);

  // Forge (meta shop) open/close
  let forgeReturn = startScreen;
  function openForge(returnTo) {
    forgeReturn = returnTo;
    if (window.renderForge) renderForge($("forge-body"), null);
    hide(startScreen); hide(gameoverScreen);
    show($("forge-screen"));
  }
  $("forge-btn").addEventListener("click", () => openForge(startScreen));
  $("forge-btn2").addEventListener("click", () => openForge(gameoverScreen));
  $("forge-back").addEventListener("click", () => {
    hide($("forge-screen"));
    show(forgeReturn);
  });

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // ============================================================
  //  BOOT
  // ============================================================
  resize();
  requestAnimationFrame(loop);
})();
