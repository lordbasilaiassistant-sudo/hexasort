/* HexaSort — an original hexagon color-sorting puzzle.
   Place stacks of colored hexagon tiles onto a hex board. Adjacent tiles whose
   TOP color matches pool their tiles together with a sliding animation. Collect
   CLEAR_COUNT of one color in a single stack and it pops for points. */

(() => {
  'use strict';

  // ---- Config ----------------------------------------------------------
  const RADIUS = 2;                 // board radius (axial). 2 => 19 cells
  const CLEAR_COUNT = 10;           // tiles of one color needed to clear
  const TRAY_SIZE = 3;
  const COLORS = ['#ec3b2c', '#2f74e0', '#36b53a', '#f4c020', '#a93ed6', '#f4f4f4'];
  const ACTIVE_COLORS = 5;          // colors that actually spawn (kept solvable)
  const FILL = 0.92;                // tile footprint vs cell size -> tiles sit inside the grid lines
  const SAVE_KEY = 'hexasort.save.v1';
  const PROFILE_KEY = 'hexasort.profile';

  // flat-top axial neighbor directions
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  // animation timing (ms)
  const T_PLACE = 200, T_MERGE = 150, T_CLEAR = 320;

  // ---- Canvas / DOM ----------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let DPR = 1, viewW = 0, viewH = 0;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const comboEl = document.getElementById('combo');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ov-title');
  const ovText = document.getElementById('ov-text');
  const ovScores = document.getElementById('ov-scores');
  const ovScore = document.getElementById('ov-score');
  const ovBest = document.getElementById('ov-best');
  const ovBtn = document.getElementById('ov-btn');

  // ---- State -----------------------------------------------------------
  let board, cellKeys, tray, score, best, playing;
  let drag = null;
  let layout = { size: 30, cx: 0, cy: 0, trayY: 0, traySize: 26, slotX: [] };

  // animation state
  let anim = { active: false, queue: [], cur: null, flyers: [], parts: [], popups: [], rings: [], placePop: null, shake: 0, shakeT: 0 };
  let display = new Map(); // visual stacks during animation

  best = +(localStorage.getItem('hexasort.best') || 0);

  // ---- Helpers ---------------------------------------------------------
  const key = (q, r) => q + ',' + r;
  const top = s => s[s.length - 1];
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function topRun(s) {
    if (!s.length) return 0;
    const c = top(s); let n = 0;
    for (let i = s.length - 1; i >= 0 && s[i] === c; i--) n++;
    return n;
  }
  function neighborKeys(k) {
    const [q, r] = k.split(',').map(Number);
    const out = [];
    for (const [dq, dr] of DIRS) {
      const nk = key(q + dq, r + dr);
      if (board.has(nk)) out.push(nk);
    }
    return out;
  }

  // ---- Hex geometry (flat-top) ----------------------------------------
  function hexToPixel(q, r, size) {
    return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
  }
  function pixelToHex(px, py, size) {
    const q = (2 / 3 * px) / size;
    const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / size;
    return hexRound(q, r);
  }
  function hexRound(q, r) {
    let x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }
  function cellCenter(k) {
    const c = board.get(k);
    const p = hexToPixel(c.q, c.r, layout.size);
    return { x: layout.cx + p.x, y: layout.cy + p.y };
  }

  // ---- Board setup -----------------------------------------------------
  function makeBoard() {
    board = new Map(); cellKeys = [];
    for (let q = -RADIUS; q <= RADIUS; q++)
      for (let r = -RADIUS; r <= RADIUS; r++) {
        if (Math.abs(q + r) > RADIUS) continue;
        const k = key(q, r);
        board.set(k, { q, r, stack: [] });
        cellKeys.push(k);
      }
  }
  const randColor = () => Math.floor(Math.random() * ACTIVE_COLORS);
  function makePiece() {
    const len = 1 + Math.floor(Math.random() * 3);
    const stack = [];
    if (Math.random() < 0.62) { const c = randColor(); for (let i = 0; i < len; i++) stack.push(c); }
    else for (let i = 0; i < len; i++) stack.push(randColor());
    return stack;
  }
  function refillTray() { tray = []; for (let i = 0; i < TRAY_SIZE; i++) tray.push(makePiece()); }
  function seedBoard() {
    const sh = [...cellKeys].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 5; i++) {
      const cell = board.get(sh[i]); const c = randColor();
      const len = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < len; j++) cell.stack.push(c);
    }
  }

  // ---- Core mechanic: resolve into ordered animation events -----------
  function resolveEvents(placedKey) {
    const events = [];
    let combo = 0, changed = true, guard = 0;
    while (changed && guard++ < 300) {
      changed = false;
      const visited = new Set();
      for (const k of cellKeys) {
        const cell = board.get(k);
        if (!cell.stack.length || visited.has(k)) continue;
        const color = top(cell.stack);
        const group = []; const q = [k]; visited.add(k);
        while (q.length) {
          const ck = q.pop(); group.push(ck);
          for (const nk of neighborKeys(ck)) {
            const nc = board.get(nk);
            if (nc.stack.length && !visited.has(nk) && top(nc.stack) === color) { visited.add(nk); q.push(nk); }
          }
        }
        if (group.length >= 2) {
          let recv = group[0], recvRun = topRun(board.get(recv).stack);
          for (const g of group) {
            const run = topRun(board.get(g).stack);
            if (run > recvRun || (run === recvRun && g === placedKey)) { recv = g; recvRun = run; }
          }
          for (const g of group) {
            if (g === recv) continue;
            const dc = board.get(g), run = topRun(dc.stack);
            for (let i = 0; i < run; i++) board.get(recv).stack.push(dc.stack.pop());
            events.push({ type: 'merge', from: g, to: recv, color, count: run });
          }
          changed = true;
        }
      }
      for (const k of cellKeys) {
        const cell = board.get(k);
        while (cell.stack.length && topRun(cell.stack) >= CLEAR_COUNT) {
          combo++;
          const color = top(cell.stack);
          for (let i = 0; i < CLEAR_COUNT; i++) cell.stack.pop();
          const pts = CLEAR_COUNT * 5 * combo;
          score += pts;
          events.push({ type: 'clear', at: k, color, combo, points: pts });
          changed = true;
        }
      }
    }
    if (score > best) { best = score; localStorage.setItem('hexasort.best', best); }
    return events;
  }

  // ---- Placement -------------------------------------------------------
  const emptyCells = () => cellKeys.filter(k => board.get(k).stack.length === 0);

  function place(idx, k) {
    const cell = board.get(k);
    if (cell.stack.length || anim.active) return false;
    const piece = tray[idx].slice();
    tray[idx] = null;

    // snapshot current visual state (pre-placement)
    display = new Map();
    for (const ck of cellKeys) display.set(ck, board.get(ck).stack.slice());

    cell.stack = piece;
    const events = resolveEvents(k);

    // build timeline; display starts pre-placement, placement is first beat
    anim.queue = [{ type: 'place', at: k, piece }].concat(events);
    anim.active = true; anim.cur = null; anim.flyers = []; anim.placePop = null;
    anim.started = performance.now();

    if (tray.every(p => p === null)) refillTray();
  }

  function finishPlacement() {
    anim.active = false; anim.cur = null; anim.queue = []; anim.flyers = []; anim.placePop = null;
    updateHud();
    save();
    if (emptyCells().length === 0 && tray.some(p => p !== null)) gameOver();
  }

  // ---- Animation engine ------------------------------------------------
  function startEvent(e, now) {
    e.start = now;
    if (e.type === 'place') {
      e.dur = T_PLACE;
      display.set(e.at, e.piece.slice());
      anim.placePop = { at: e.at, start: now, dur: T_PLACE };
    } else if (e.type === 'merge') {
      e.dur = T_MERGE;
      const ds = display.get(e.from);
      ds.splice(ds.length - e.count, e.count); // tiles leave donor now
      const a = cellCenter(e.from), b = cellCenter(e.to);
      e.flyer = { color: e.color, count: e.count, ax: a.x, ay: a.y, bx: b.x, by: b.y, start: now, dur: T_MERGE };
      anim.flyers.push(e.flyer);
    } else if (e.type === 'clear') {
      e.dur = T_CLEAR;
      e.flashStart = now;
    }
  }
  function endEvent(e, now) {
    if (e.type === 'merge') {
      const ts = display.get(e.to);
      for (let i = 0; i < e.count; i++) ts.push(e.color);
      anim.flyers = anim.flyers.filter(f => f !== e.flyer);
    } else if (e.type === 'clear') {
      const ds = display.get(e.at);
      ds.splice(ds.length - CLEAR_COUNT, CLEAR_COUNT);
      spawnBurst(e.at, e.color, e.points, e.combo);
      if (e.combo >= 2) showCombo(e.combo);
    }
  }
  function updateAnim(now) {
    if (!anim.active) return;
    // watchdog: never let the board stay input-locked
    if (anim.started && now - anim.started > 5000) { finishPlacement(); return; }
    if (!anim.cur) {
      if (anim.queue.length === 0 && anim.flyers.length === 0) { finishPlacement(); return; }
      if (anim.queue.length === 0) return; // let trailing flyers/particles fade
      anim.cur = anim.queue.shift();
      startEvent(anim.cur, now);
    }
    if (anim.cur && now - anim.cur.start >= anim.cur.dur) {
      endEvent(anim.cur, now);
      anim.cur = null;
    }
  }

  function spawnBurst(k, colorIdx, points, combo) {
    const c = cellCenter(k);
    const col = COLORS[colorIdx];
    const cy = c.y - layout.size * 0.25;
    // shockwave rings
    anim.rings.push({ x: c.x, y: cy, start: performance.now(), dur: 460, col, max: layout.size * 2.3 });
    anim.rings.push({ x: c.x, y: cy, start: performance.now() + 40, dur: 420, col: '#ffffff', max: layout.size * 1.7 });
    // hexagon shards flying out
    const count = 18 + (combo || 1) * 3;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 6;
      anim.parts.push({
        x: c.x, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3.5,
        life: 1, decay: 0.018 + Math.random() * 0.02, col: Math.random() < 0.35 ? '#fff' : col,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, sz: layout.size * (0.10 + Math.random() * 0.14)
      });
    }
    anim.popups.push({ x: c.x, y: cy - layout.size * 0.4, text: '+' + points, start: performance.now(), big: (combo || 1) >= 2 });
    anim.shake = Math.min(14, 6 + (combo || 1) * 2); anim.shakeT = performance.now();
  }
  function showCombo(n) {
    comboEl.textContent = 'COMBO x' + n + '!';
    comboEl.classList.remove('hidden');
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => comboEl.classList.add('hidden'), 750);
  }

  // ---- Game flow -------------------------------------------------------
  function newGame() {
    score = 0; makeBoard(); seedBoard(); refillTray();
    anim = { active: false, queue: [], cur: null, flyers: [], parts: [], popups: [], rings: [], placePop: null, shake: 0, shakeT: 0 };
    playing = true; overlay.classList.add('hidden'); updateHud(); save();
  }
  function gameOver() {
    playing = false;
    ovTitle.textContent = 'GAME OVER';
    ovText.textContent = 'The board filled up.';
    ovScores.classList.remove('hidden');
    ovScore.textContent = score; ovBest.textContent = best;
    ovBtn.textContent = 'PLAY AGAIN';
    overlay.classList.remove('hidden');
    localStorage.removeItem(SAVE_KEY);
  }
  function updateHud() { scoreEl.textContent = score; bestEl.textContent = best; }

  // ---- Persistence -----------------------------------------------------
  function ensureProfile() {
    let id = localStorage.getItem(PROFILE_KEY);
    if (!id) { id = 'p_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36); localStorage.setItem(PROFILE_KEY, id); }
    return id;
  }
  function save() {
    if (!playing) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ score, cells: cellKeys.map(k => board.get(k).stack), tray })); } catch (e) {}
  }
  function load() {
    let raw; try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      const d = JSON.parse(raw); makeBoard();
      d.cells.forEach((s, i) => board.get(cellKeys[i]).stack = s || []);
      tray = d.tray.map(p => p === null ? null : p); score = d.score || 0; playing = true; return true;
    } catch (e) { return false; }
  }

  // ---- Layout ----------------------------------------------------------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = canvas.getBoundingClientRect();
    viewW = rect.width; viewH = rect.height;
    canvas.width = Math.round(viewW * DPR); canvas.height = Math.round(viewH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const trayH = Math.min(viewH * 0.20, 150);
    const boardH = viewH - trayH;

    // extents of unit board (size=1)
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let q = -RADIUS; q <= RADIUS; q++)
      for (let r = -RADIUS; r <= RADIUS; r++) {
        if (Math.abs(q + r) > RADIUS) continue;
        const p = hexToPixel(q, r, 1);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    const unitW = (maxX - minX) + 2;          // +2 hex half-widths
    const unitH = (maxY - minY) + 2 * 0.9;
    const headroom = 2.2;                      // extra top space for tall stacks (in size units)
    const sizeW = (viewW * 0.94) / unitW;
    const sizeH = (boardH * 0.92) / (unitH + headroom);
    layout.size = Math.min(sizeW, sizeH);
    layout.cx = viewW / 2 - (minX + maxX) / 2 * layout.size;
    layout.cy = boardH / 2 - (minY + maxY) / 2 * layout.size + layout.size * headroom * 0.32;

    layout.trayY = boardH + trayH / 2;
    layout.traySize = Math.min(trayH * 0.36, viewW / (TRAY_SIZE * 3.0));
    layout.slotX = [];
    const gap = viewW / (TRAY_SIZE + 1);
    for (let i = 0; i < TRAY_SIZE; i++) layout.slotX.push(gap * (i + 1));
  }

  // ---- Drawing ---------------------------------------------------------
  function hexVerts(cx, cy, R) {
    const v = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    return v; // flat-top: v0 right, going CCW... actually CW in screen space
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // front wall band of one tile (the scalloped lower edges extruded down)
  function drawTileWall(cx, cy, R, color, wallH, flash) {
    const v = hexVerts(cx, cy, R);
    const edges = [[0, 1], [1, 2], [2, 3]];
    const sideCols = [shade(color, -0.28), shade(color, -0.42), shade(color, -0.30)];
    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e];
      ctx.beginPath();
      ctx.moveTo(v[a][0], v[a][1]); ctx.lineTo(v[b][0], v[b][1]);
      ctx.lineTo(v[b][0], v[b][1] + wallH); ctx.lineTo(v[a][0], v[a][1] + wallH);
      ctx.closePath(); ctx.fillStyle = sideCols[e]; ctx.fill();
    }
    // seam highlight along the lower edges so plates read as distinct layers
    ctx.beginPath();
    ctx.moveTo(v[0][0], v[0][1]); ctx.lineTo(v[1][0], v[1][1]);
    ctx.lineTo(v[2][0], v[2][1]); ctx.lineTo(v[3][0], v[3][1]);
    ctx.lineWidth = Math.max(1, R * 0.045); ctx.strokeStyle = shade(color, -0.05); ctx.stroke();
    if (flash > 0) {
      for (const [a, b] of edges) {
        ctx.beginPath();
        ctx.moveTo(v[a][0], v[a][1]); ctx.lineTo(v[b][0], v[b][1]);
        ctx.lineTo(v[b][0], v[b][1] + wallH); ctx.lineTo(v[a][0], v[a][1] + wallH);
        ctx.closePath(); ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fill();
      }
    }
  }
  // bright top face of a tile
  function drawTileFace(cx, cy, R, color, flash) {
    const v = hexVerts(cx, cy, R);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) i ? ctx.lineTo(v[i][0], v[i][1]) : ctx.moveTo(v[i][0], v[i][1]);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.save(); ctx.clip();
    const grad = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    grad.addColorStop(0, shade(color, 0.30)); grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) i ? ctx.lineTo(v[i][0], v[i][1]) : ctx.moveTo(v[i][0], v[i][1]);
    ctx.closePath();
    ctx.lineWidth = Math.max(1, R * 0.04); ctx.strokeStyle = shade(color, -0.16); ctx.stroke();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fill(); }
  }

  function emptyHex(cx, cy, R) {
    const v = hexVerts(cx, cy, R * FILL);
    // recessed hole with a clear rim so the grid reads as lines containing tiles
    ctx.beginPath();
    for (let i = 0; i < 6; i++) i ? ctx.lineTo(v[i][0], v[i][1]) : ctx.moveTo(v[i][0], v[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, R * 0.05); ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.stroke();
  }

  // draw a whole stack of tiles. opts: {scale, flashTop, flashAmt, popScale, rise, shadow}
  function drawStack(cx, cy, R, stack, opts) {
    opts = opts || {};
    const n = stack.length; if (!n) return;
    const sc = opts.scale || 1;
    const r = R * sc * FILL;              // tiles drawn inside the cell footprint
    const oo = r * 0.155;                 // offset == wall height -> clean bands
    const wallH = oo + 0.5;
    const totalH = (n - 1) * oo;
    const base = cy + totalH * 0.5 - (opts.rise || 0);
    const flashTop = opts.flashTop || 0;
    const popScale = opts.popScale || 0;

    // soft contact shadow under the stack
    if (opts.shadow !== false) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, base + r * 0.86, r * 0.92, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // walls bottom->top (each tile one band)
    for (let i = 0; i < n; i++) {
      const isPop = i >= n - flashTop;
      const fl = isPop ? (opts.flashAmt || 0) : 0;
      const er = r * (isPop ? 1 + popScale : 1);
      drawTileWall(cx, base - i * oo, er, COLORS[stack[i]], wallH, fl);
    }
    // top face (only the visible crown)
    const topIsPop = flashTop > 0;
    const er = r * (topIsPop ? 1 + popScale : 1);
    drawTileFace(cx, base - (n - 1) * oo, er, COLORS[stack[n - 1]], topIsPop ? (opts.flashAmt || 0) : 0);
  }

  function drawTrayPiece(x, y, R, stack) { drawStack(x, y, R, stack); }

  function render() {
    const now = performance.now();
    updateAnim(now);
    ctx.clearRect(0, 0, viewW, viewH);

    // background radial glow behind the board for depth
    if (board) {
      const g = ctx.createRadialGradient(layout.cx, layout.cy, layout.size * 0.5, layout.cx, layout.cy, layout.size * 5.5);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, viewH);
    }

    // screen shake (decays over 360ms)
    ctx.save();
    if (anim.shake > 0) {
      const k = Math.max(0, 1 - (now - anim.shakeT) / 360);
      if (k <= 0) anim.shake = 0;
      const m = anim.shake * k;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    if (board) {
      const cells = cellKeys.map(k => { const c = cellCenter(k); return { k, x: c.x, y: c.y }; }).sort((a, b) => a.y - b.y);
      // empty holes first (all), then stacks back-to-front
      for (const d of cells) emptyHex(d.x, d.y, layout.size);
      // drop target highlight
      if (drag && !anim.active) {
        const hk = hoverKey();
        if (hk) { const c = cellCenter(hk); const v = hexVerts(c.x, c.y, layout.size * FILL);
          ctx.beginPath(); for (let i = 0; i < 6; i++) i ? ctx.lineTo(v[i][0], v[i][1]) : ctx.moveTo(v[i][0], v[i][1]); ctx.closePath();
          ctx.fillStyle = 'rgba(255,206,58,0.20)'; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,206,58,0.85)'; ctx.stroke();
        }
      }
      for (const d of cells) {
        const stack = anim.active ? (display.get(d.k) || []) : board.get(d.k).stack;
        let opts = {};
        if (anim.placePop && anim.placePop.at === d.k) {
          const t = Math.min(1, (now - anim.placePop.start) / anim.placePop.dur);
          opts.rise = (1 - easeOut(t)) * layout.size * 1.1;
          opts.popScale = (1 - t) * 0.12;
        }
        if (anim.cur && anim.cur.type === 'clear' && anim.cur.at === d.k) {
          const t = Math.min(1, (now - anim.cur.start) / anim.cur.dur);
          opts.flashTop = CLEAR_COUNT; opts.flashAmt = Math.sin(Math.min(t, 1) * Math.PI) * 0.85;
          opts.popScale = easeOut(Math.min(t * 1.4, 1)) * 0.25;
        }
        drawStack(d.x, d.y, layout.size, stack, opts);
      }
      // flyers
      for (const f of anim.flyers) {
        const t = easeOut(Math.min(1, (now - f.start) / f.dur));
        const x = f.ax + (f.bx - f.ax) * t;
        const y = f.ay + (f.by - f.ay) * t - Math.sin(t * Math.PI) * layout.size * 0.5;
        drawStack(x, y, layout.size, new Array(f.count).fill(f.color), {});
      }
      // shockwave rings
      anim.rings = anim.rings.filter(r => now - r.start < r.dur && now >= r.start);
      for (const r of anim.rings) {
        const t = (now - r.start) / r.dur; if (t < 0) continue;
        const rad = easeOut(t) * r.max;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.lineWidth = layout.size * 0.16 * (1 - t * 0.6);
        ctx.strokeStyle = r.col;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; const x = r.x + rad * Math.cos(a), y = r.y + rad * Math.sin(a) * 0.86; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // particles (spinning hex shards)
      anim.parts = anim.parts.filter(p => p.life > 0);
      for (const p of anim.parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.vx *= 0.99; p.life -= p.decay; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; i ? ctx.lineTo(p.sz * Math.cos(a), p.sz * Math.sin(a)) : ctx.moveTo(p.sz, 0); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // popups
      anim.popups = anim.popups.filter(p => now - p.start < 850);
      for (const p of anim.popups) {
        const t = (now - p.start) / 850;
        const pop = t < 0.2 ? easeBack(t / 0.2) : 1;
        ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.font = `900 ${Math.round(layout.size * (p.big ? 1.0 : 0.78) * pop)}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = layout.size * 0.08; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeText(p.text, p.x, p.y - t * layout.size * 1.3);
        ctx.fillStyle = p.big ? '#ffd23f' : '#fff';
        ctx.fillText(p.text, p.x, p.y - t * layout.size * 1.3);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore(); // end screen-shake transform

    // tray
    if (tray) for (let i = 0; i < tray.length; i++) {
      if (!tray[i] || (drag && drag.idx === i)) continue;
      drawTrayPiece(layout.slotX[i], layout.trayY, layout.traySize, tray[i]);
    }
    // dragged piece
    if (drag && tray[drag.idx]) drawStack(drag.x, drag.y, layout.size, tray[drag.idx], {});

    requestAnimationFrame(render);
  }

  // ---- Input -----------------------------------------------------------
  function pointerPos(e) {
    const t = e.touches ? e.touches[0] : e;
    const rect = canvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function trayHit(x, y) {
    for (let i = 0; i < tray.length; i++) {
      if (!tray[i]) continue;
      if (Math.hypot(x - layout.slotX[i], y - layout.trayY) < layout.traySize * 1.4) return i;
    }
    return -1;
  }
  function hoverKey() {
    if (!drag) return null;
    const h = pixelToHex(drag.x - layout.cx, drag.y - layout.cy, layout.size);
    const k = key(h.q, h.r);
    if (board.has(k) && board.get(k).stack.length === 0) return k;
    return null;
  }
  function onDown(e) {
    if (!playing) return;
    if (anim.active) finishPlacement(); // tap fast-forwards a running animation
    const p = pointerPos(e); const i = trayHit(p.x, p.y);
    if (i >= 0) { drag = { idx: i, x: p.x, y: p.y - layout.size * 0.7 }; e.preventDefault(); }
  }
  function onMove(e) { if (!drag) return; const p = pointerPos(e); drag.x = p.x; drag.y = p.y - layout.size * 0.7; e.preventDefault(); }
  function onUp(e) { if (!drag) return; const k = hoverKey(), idx = drag.idx; drag = null; if (k) place(idx, k); e.preventDefault(); }

  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp, { passive: false });
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  ovBtn.addEventListener('click', newGame);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---- Boot ------------------------------------------------------------
  ensureProfile();
  resize();
  if (load()) { overlay.classList.add('hidden'); updateHud(); }
  else { ovScores.classList.add('hidden'); ovBtn.textContent = 'PLAY'; overlay.classList.remove('hidden'); makeBoard(); }
  requestAnimationFrame(render);

  const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
  if ('serviceWorker' in navigator && !isLocal)
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  if (location.search.includes('debug')) {
    window.__hexa = {
      get board() { return board; }, get tray() { return tray; }, get anim() { return anim; },
      place, newGame, cellKeys: () => cellKeys,
      burst(k, c) { spawnBurst(k, c == null ? 2 : c, 150, 3); },
      setStack(k, arr) { board.get(k).stack = arr.slice(); save(); }
    };
  }
})();
