'use strict';
/*
 * Horda Nocturna — un juego original de supervivencia contra hordas.
 * HTML5 Canvas + JavaScript puro, sin dependencias.
 */
(() => {
  const TAU = Math.PI * 2;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Utilidades ----------
  const $ = id => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtTime = t => { const s = Math.floor(t); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function compact(a) { let j = 0; for (let i = 0; i < a.length; i++) if (!a[i].dead) a[j++] = a[i]; a.length = j; }
  function hash(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // ---------- Datos del juego ----------
  const WMAX = 5, SLOTS = 4, MAX_ENEMIES = 380;

  const WEAPONS = {
    chispa: {
      name: 'Chispa Arcana', icon: '✨', desc: 'Dispara al enemigo más cercano.',
      up: ['+1 proyectil', 'Más daño y recarga más rápida', 'Atraviesa enemigos', '+1 proyectil y más daño'],
      evo: 'tomo', evoName: 'Tormenta Arcana',
    },
    orbe: {
      name: 'Cuchillas Orbitales', icon: '🌀', desc: 'Cuchillas que giran a tu alrededor.',
      up: ['+1 cuchilla', '+1 cuchilla', 'Más daño y radio', '+1 cuchilla'],
      evo: 'lupa', evoName: 'Anillo Eterno',
    },
    halo: {
      name: 'Halo Ardiente', icon: '🔥', desc: 'Quema a los enemigos cercanos.',
      up: ['Más radio y daño', 'Más radio y daño', 'Más radio y daño', 'Más radio y daño'],
      evo: 'corazon', evoName: 'Sol Interior',
    },
    rayo: {
      name: 'Rayo Celeste', icon: '⚡', desc: 'Rayos caen sobre enemigos al azar.',
      up: ['Más daño y recarga más rápida', '+1 rayo', 'Más daño', '+1 rayo'],
      evo: 'reloj', evoName: 'Juicio Tronante',
    },
    disco: {
      name: 'Disco Retornante', icon: '🥏', desc: 'Un disco que va y vuelve atravesándolo todo.',
      up: ['Más daño', '+1 disco', 'Más daño y recarga más rápida', '+1 disco'],
      evo: 'poder', evoName: 'Eclipse Giratorio',
    },
  };

  const PASSIVES = {
    poder:   { name: 'Gema de Poder',   icon: '💎', desc: '+10% de daño.',                 max: 5, apply: p => { p.stats.dmg += 0.10; } },
    reloj:   { name: 'Reloj de Arena',  icon: '⏳', desc: '-8% tiempo de recarga.',        max: 5, apply: p => { p.stats.cd *= 0.92; } },
    botas:   { name: 'Botas Veloces',   icon: '👢', desc: '+10% velocidad de movimiento.', max: 5, apply: p => { p.stats.speed += 0.10; } },
    corazon: { name: 'Corazón Vivo',    icon: '❤️', desc: '+20 vida máx. y +0.5 vida/s.',  max: 5, apply: p => { p.maxHp += 20; p.hp += 20; p.stats.regen += 0.5; } },
    iman:    { name: 'Imán Lunar',      icon: '🧲', desc: '+30% radio de recogida.',       max: 5, apply: p => { p.stats.magnet += 0.30; } },
    lupa:    { name: 'Lente Prisma',    icon: '🔍', desc: '+10% área de ataque.',          max: 5, apply: p => { p.stats.area += 0.10; } },
    tomo:    { name: 'Tomo Duplicador', icon: '📘', desc: '+1 proyectil para todas las armas.', max: 2, apply: p => { p.stats.proj += 1; } },
  };

  const ETYPES = {
    slime:      { hp: 12, speed: 55,  dmg: 8,  r: 12, xp: 1, color: '#5fd068' },
    murcielago: { hp: 7,  speed: 105, dmg: 6,  r: 9,  xp: 1, color: '#a77bf3' },
    espectro:   { hp: 24, speed: 75,  dmg: 10, r: 13, xp: 2, color: '#7fd6ff' },
    bruto:      { hp: 60, speed: 42,  dmg: 15, r: 18, xp: 4, color: '#ff6b5b' },
  };

  const BOSSES = [
    { at: 300, name: 'Coloso de Obsidiana', hp: 2600, r: 38, speed: 52, dmg: 25, color: '#8a5cff', shots: 12, final: false },
    { at: 600, name: 'Rey del Abismo',      hp: 9000, r: 48, speed: 60, dmg: 35, color: '#ff3d7f', shots: 18, final: true },
  ];

  // ---------- Estado ----------
  let G = null;
  let state = 'menu'; // menu | play | levelup | paused | over | win
  let best = 0;
  try { best = +localStorage.getItem('hn_best') || 0; } catch (e) { /* sin almacenamiento */ }

  function newGame() {
    G = {
      time: 0, spawnAcc: 0, nextElite: 60, nextSwarm: 45, bossIdx: 0, shake: 0, pending: 0,
      boss: null, opts: [],
      p: {
        x: 0, y: 0, r: 14, hp: 100, maxHp: 100, inv: 0, face: { x: 1, y: 0 }, walk: 0,
        level: 1, xp: 0, xpNext: 5, kills: 0,
        stats: { dmg: 1, cd: 1, speed: 1, regen: 0, magnet: 1, area: 1, proj: 0 },
        weapons: [], passives: {},
      },
      enemies: [], bullets: [], ebullets: [], gems: [], pickups: [],
      particles: [], texts: [], effects: [],
    };
    addWeapon('chispa');
  }

  const hasWeapon = id => G.p.weapons.find(w => w.id === id);
  const addWeapon = id => G.p.weapons.push({ id, lvl: 1, t: 0.3, evolved: false, angle: 0 });
  function addPassive(id) { G.p.passives[id] = (G.p.passives[id] || 0) + 1; PASSIVES[id].apply(G.p); }
  const canEvolve = w => !w.evolved && w.lvl >= WMAX && !!G.p.passives[WEAPONS[w.id].evo];
  function heal(n) { const p = G.p; p.hp = Math.min(p.maxHp, p.hp + n); addText(p.x, p.y - 24, '+' + n, '#6fffb0'); }

  // ---------- Entrada ----------
  const keys = {};
  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (state === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0 && G.opts[i]) choose(G.opts[i]);
    }
    if ((state === 'menu' || state === 'over' || state === 'win') && e.code === 'Enter') start();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'play') return;
    joy.active = true; joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
  const endJoy = e => { if (e.pointerId === joy.id) joy.active = false; };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);

  function inputDir() {
    let dx = 0, dy = 0;
    if (keys.KeyW || keys.ArrowUp) dy -= 1;
    if (keys.KeyS || keys.ArrowDown) dy += 1;
    if (keys.KeyA || keys.ArrowLeft) dx -= 1;
    if (keys.KeyD || keys.ArrowRight) dx += 1;
    if (joy.active) {
      const jx = joy.x - joy.ox, jy = joy.y - joy.oy, l = Math.hypot(jx, jy);
      if (l > 6) { const m = Math.min(l, 50) / 50; dx += jx / l * m; dy += jy / l * m; }
    }
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    return { dx, dy };
  }

  // ---------- Rejilla espacial ----------
  const CELL = 80;
  const grid = new Map();
  const gkey = (cx, cy) => (cx + 50000) * 100000 + (cy + 50000);
  function buildGrid() {
    grid.clear();
    for (const e of G.enemies) {
      if (e.dead) continue;
      const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      let c = grid.get(k);
      if (!c) { c = []; grid.set(k, c); }
      c.push(e);
    }
  }
  function query(x, y, r, cb) {
    const R = r + 50;
    const x0 = Math.floor((x - R) / CELL), x1 = Math.floor((x + R) / CELL);
    const y0 = Math.floor((y - R) / CELL), y1 = Math.floor((y + R) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = grid.get(gkey(cx, cy));
        if (!c) continue;
        for (const e of c) {
          if (e.dead) continue;
          const rr = r + e.r, dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy < rr * rr) cb(e);
        }
      }
    }
  }
  function nearest(x, y, n, maxD) {
    const arr = [], m2 = maxD * maxD;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < m2) arr.push([d, e]);
    }
    arr.sort((a, b) => a[0] - b[0]);
    return arr.slice(0, n).map(a => a[1]);
  }

  // ---------- Efectos ----------
  function addText(x, y, txt, color) {
    if (G.texts.length < 90) G.texts.push({ x, y, txt, color, life: 0.7 });
  }
  function burst(x, y, color, n, speed = 120) {
    for (let i = 0; i < n && G.particles.length < 400; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, color, size: rand(2, 4) });
    }
  }
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ---------- Combate ----------
  function hurt(e, dmg, kx = 0, ky = 0, kb = 0) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.08;
    if (kb && !e.boss) { const f = e.elite ? 0.3 : 1; e.kx += kx * kb * f; e.ky += ky * kb * f; }
    addText(e.x + rand(-6, 6), e.y - e.r, Math.round(dmg), dmg >= 60 ? '#ffcf4d' : '#ffffff');
    if (e.hp <= 0) kill(e);
  }

  function kill(e) {
    e.dead = true;
    G.p.kills++;
    burst(e.x, e.y, e.color, e.boss ? 50 : e.elite ? 20 : 6, e.boss ? 260 : 120);
    dropGem(e.x, e.y, e.xp);
    if (e.elite || e.boss) G.pickups.push({ type: 'cofre', x: e.x, y: e.y, t: 0 });
    else {
      const r = Math.random();
      if (r < 0.010) G.pickups.push({ type: 'carne', x: e.x, y: e.y, t: 0 });
      else if (r < 0.014) G.pickups.push({ type: 'iman', x: e.x, y: e.y, t: 0 });
    }
    if (e.boss) {
      G.boss = null; G.shake = 14;
      if (e.final) endGame(true);
      else toast(`¡Has derrotado a ${e.name}!`);
    }
  }

  function dropGem(x, y, v) {
    if (G.gems.length > 320) { pick(G.gems).v += v; return; }
    G.gems.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), v, mag: false, sp: 0 });
  }

  function gainXp(v) {
    const p = G.p;
    p.xp += v;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = Math.floor(4 + p.level * 5 + Math.pow(p.level, 1.5));
      G.pending++;
    }
  }

  function damagePlayer(d) {
    const p = G.p;
    if (p.inv > 0 || state !== 'play') return;
    p.hp -= d; p.inv = 0.5;
    G.shake = Math.max(G.shake, 6);
    addText(p.x, p.y - 26, '-' + Math.round(d), '#ff5c6c');
    burst(p.x, p.y, '#ff5c6c', 8);
    if (p.hp <= 0) { p.hp = 0; endGame(false); }
  }

  // ---------- Armas ----------
  const W_UPDATE = {
    chispa(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const n = (ev ? 4 : [1, 2, 2, 2, 3][lv - 1]) + s.proj;
      const targets = nearest(p.x, p.y, n, 520);
      if (!targets.length) { w.t = 0.15; return; }
      w.t = (ev ? 0.45 : 1.15 - lv * 0.08) * s.cd;
      const dmg = (9 + 4 * lv + (lv >= 5 ? 6 : 0)) * (ev ? 1.6 : 1) * s.dmg;
      const spd = ev ? 560 : 440;
      for (let i = 0; i < n; i++) {
        const t = targets[i % targets.length];
        const a = Math.atan2(t.y - p.y, t.x - p.x) + (i >= targets.length ? rand(-0.3, 0.3) : 0);
        G.bullets.push({
          kind: 'chispa', ev, x: p.x, y: p.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: (ev ? 7 : 5) * Math.sqrt(s.area), dmg, life: 1.4,
          pierce: ev ? 3 : (lv >= 4 ? 1 : 0), hit: new Set(),
        });
      }
    },
    orbe(w, dt, p, s) {
      const lv = w.lvl, ev = w.evolved;
      w.n = (ev ? 6 : [1, 2, 3, 3, 4][lv - 1]) + s.proj;
      w.R = (ev ? 100 : 66 + lv * 4 + (lv >= 4 ? 8 : 0)) * s.area;
      w.br = (ev ? 13 : 10) * Math.sqrt(s.area);
      w.angle += (ev ? 4.2 : 3.2) * dt;
      const dmg = (6 + 3 * lv) * (ev ? 2 : 1) * s.dmg;
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + i / w.n * TAU;
        const bx = p.x + Math.cos(a) * w.R, by = p.y + Math.sin(a) * w.R;
        query(bx, by, w.br, e => {
          if (G.time - (e.orbT || -9) < 0.4) return;
          e.orbT = G.time;
          const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
          hurt(e, dmg, kx / l, ky / l, 200);
        });
      }
    },
    halo(w, dt, p, s) {
      const lv = w.lvl, ev = w.evolved;
      w.R = (45 + 12 * lv) * s.area * (ev ? 1.5 : 1);
      if (ev) query(p.x, p.y, w.R, e => { e.slow = 0.2; });
      w.t -= dt;
      if (w.t > 0) return;
      w.t = 0.5 * s.cd;
      const dmg = (3 + 2 * lv) * (ev ? 2.2 : 1) * s.dmg;
      query(p.x, p.y, w.R, e => hurt(e, dmg));
    },
    rayo(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const vis = G.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < W / 2 + 20 && Math.abs(e.y - p.y) < H / 2 + 20);
      if (!vis.length) { w.t = 0.3; return; }
      w.t = (2.3 - lv * 0.18) * s.cd * (ev ? 0.55 : 1);
      const n = (ev ? lv + 2 : [1, 1, 2, 2, 3][lv - 1]) + s.proj;
      const dmg = (20 + 10 * lv) * (ev ? 1.6 : 1) * s.dmg;
      const R = 38 * s.area * (ev ? 1.5 : 1);
      shuffle(vis);
      for (let i = 0; i < n; i++) {
        const t = vis[i % vis.length], tx = t.x, ty = t.y;
        G.effects.push({ type: 'bolt', x: tx, y: ty, R, life: 0.3, max: 0.3, seed: Math.random() * 1000 | 0, ev });
        query(tx, ty, R, e => hurt(e, dmg));
      }
      G.shake = Math.max(G.shake, 2);
    },
    disco(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      w.t = (2.0 - lv * 0.12 - (lv >= 4 ? 0.15 : 0)) * s.cd * (ev ? 0.8 : 1);
      const n = (ev ? 4 : [1, 1, 2, 2, 3][lv - 1]) + s.proj;
      const base = Math.atan2(p.face.y, p.face.x);
      const dmg = (10 + 5 * lv) * (ev ? 1.8 : 1) * s.dmg;
      const r = 12 * s.area * (ev ? 1.5 : 1);
      for (let i = 0; i < n; i++) {
        const a = ev ? base + i / n * TAU : base + (i - (n - 1) / 2) * 0.35;
        G.bullets.push({
          kind: 'disco', ev, x: p.x, y: p.y, vx: Math.cos(a), vy: Math.sin(a), spd: ev ? 520 : 440,
          t: 0, out: 0.6, r, dmg, hits: new Map(), life: 5, rot: 0,
        });
      }
    },
  };

  // ---------- Subida de nivel ----------
  function buildOptions() {
    const p = G.p, o = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) o.push({ k: 'w', id: w.id });
    if (p.weapons.length < SLOTS) for (const id in WEAPONS) if (!hasWeapon(id)) o.push({ k: 'nw', id });
    const owned = Object.keys(p.passives);
    for (const id of owned) if (p.passives[id] < PASSIVES[id].max) o.push({ k: 'p', id });
    if (owned.length < SLOTS) for (const id in PASSIVES) if (!p.passives[id]) o.push({ k: 'np', id });
    const r = shuffle(o).slice(0, 3);
    if (!r.length) r.push({ k: 'heal' });
    return r;
  }

  function describe(o) {
    if (o.k === 'heal') return { icon: '🍖', title: 'Festín', lvl: '', isNew: false, desc: 'Recupera 40 de vida.', hint: '' };
    if (o.k === 'w' || o.k === 'nw') {
      const d = WEAPONS[o.id], w = hasWeapon(o.id), nl = w ? w.lvl + 1 : 1, ps = PASSIVES[d.evo];
      return {
        icon: d.icon, title: d.name, lvl: w ? `Nv. ${nl}` : '¡Nuevo!', isNew: !w,
        desc: w ? d.up[nl - 2] : d.desc,
        hint: nl === WMAX ? `Evoluciona con ${ps.icon} ${ps.name}` : '',
      };
    }
    const d = PASSIVES[o.id], l = G.p.passives[o.id] || 0;
    const evoW = Object.keys(WEAPONS).find(k => WEAPONS[k].evo === o.id);
    return {
      icon: d.icon, title: d.name, lvl: l ? `Nv. ${l + 1}` : '¡Nuevo!', isNew: !l, desc: d.desc,
      hint: evoW ? `Objeto clave de ${WEAPONS[evoW].icon} ${WEAPONS[evoW].name}` : '',
    };
  }

  function applyOption(o) {
    if (o.k === 'heal') heal(40);
    else if (o.k === 'nw') addWeapon(o.id);
    else if (o.k === 'w') hasWeapon(o.id).lvl++;
    else addPassive(o.id);
  }

  function openLevelUp() {
    state = 'levelup';
    joy.active = false;
    G.opts = buildOptions();
    const box = $('choices');
    box.innerHTML = '';
    G.opts.forEach((o, i) => {
      const d = describe(o);
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML =
        `<span class="key">${i + 1}</span><div class="icon">${d.icon}</div>` +
        `<div><div class="title">${d.title}<span class="lvl${d.isNew ? ' new' : ''}">${d.lvl}</span></div>` +
        `<div class="desc">${d.desc}</div>${d.hint ? `<div class="hint">${d.hint}</div>` : ''}</div>`;
      b.addEventListener('click', () => choose(o));
      box.appendChild(b);
    });
    $('levelup').classList.remove('hidden');
  }

  function choose(o) {
    if (state !== 'levelup') return;
    applyOption(o);
    G.pending--;
    $('levelup').classList.add('hidden');
    if (G.pending > 0) openLevelUp();
    else state = 'play';
  }

  function openChest() {
    const p = G.p;
    const ev = p.weapons.find(canEvolve);
    if (ev) {
      ev.evolved = true;
      G.shake = 8;
      burst(p.x, p.y, '#ffd75e', 40, 260);
      toast(`¡EVOLUCIÓN! ${WEAPONS[ev.id].icon} ${WEAPONS[ev.id].evoName}`);
      return;
    }
    const ups = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) ups.push({ k: 'w', id: w.id });
    for (const id in p.passives) if (p.passives[id] < PASSIVES[id].max) ups.push({ k: 'p', id });
    if (ups.length) {
      const o = pick(ups), d = describe(o);
      applyOption(o);
      toast(`Cofre: ${d.icon} ${d.title} ${d.lvl}`);
    } else {
      heal(50);
      toast('Cofre: +50 de vida');
    }
  }

  // ---------- Aparición de enemigos ----------
  function spawnPos() {
    const a = rand(0, TAU), d = Math.hypot(W, H) / 2 + rand(40, 120);
    return [G.p.x + Math.cos(a) * d, G.p.y + Math.sin(a) * d];
  }

  function spawnEnemy(type, m = {}) {
    const t = ETYPES[type];
    const [x, y] = m.pos || spawnPos();
    const hs = 1 + G.time / 60 * 0.45;
    const e = {
      x, y, type, r: t.r * (m.size || 1), hp: t.hp * hs * (m.hp || 1), speed: t.speed * (m.speed || 1),
      dmg: t.dmg * (m.dmg || 1), xp: t.xp * (m.xp || 1), color: t.color,
      flash: 0, kx: 0, ky: 0, slow: 0, elite: !!m.elite, boss: false, wob: rand(0, TAU),
    };
    e.maxHp = e.hp;
    G.enemies.push(e);
    return e;
  }

  function spawnBoss(b) {
    const [x, y] = spawnPos();
    const e = {
      x, y, type: 'boss', r: b.r, hp: b.hp, maxHp: b.hp, speed: b.speed, dmg: b.dmg, xp: 60, color: b.color,
      flash: 0, kx: 0, ky: 0, slow: 0, boss: true, final: b.final, name: b.name, shots: b.shots,
      shotT: 3, wob: 0, phase: 0,
    };
    G.enemies.push(e);
    G.boss = e;
    G.shake = 10;
    toast(`⚠ ${b.name} se acerca`);
  }

  function spawner(dt) {
    const t = G.time;
    if (G.bossIdx < BOSSES.length && t >= BOSSES[G.bossIdx].at) spawnBoss(BOSSES[G.bossIdx++]);

    const rate = Math.min(1.2 + t / 22, 30) * (G.boss ? 0.5 : 1);
    G.spawnAcc += rate * dt;
    const pool =
      t < 40 ? ['slime'] :
      t < 100 ? ['slime', 'slime', 'murcielago'] :
      t < 200 ? ['slime', 'murcielago', 'espectro'] :
      ['slime', 'murcielago', 'espectro', 'bruto'];
    while (G.spawnAcc >= 1) {
      G.spawnAcc--;
      if (G.enemies.length < MAX_ENEMIES) spawnEnemy(pick(pool));
    }

    if (t >= G.nextElite) {
      G.nextElite += 60;
      spawnEnemy('bruto', { hp: 8, size: 1.5, xp: 10, elite: true, speed: 1.15, dmg: 1.5 });
      if (!G.boss) toast('¡Ha aparecido un enemigo élite!');
    }
    if (t >= G.nextSwarm) {
      G.nextSwarm += 45;
      const n = 16 + Math.floor(t / 30);
      const type = t > 240 ? 'espectro' : 'murcielago';
      const d = Math.hypot(W, H) / 2 + 40;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        spawnEnemy(type, { pos: [G.p.x + Math.cos(a) * d, G.p.y + Math.sin(a) * d] });
      }
    }
  }

  // ---------- Actualización ----------
  function updatePlayer(dt) {
    const p = G.p;
    const { dx, dy } = inputDir();
    const sp = 170 * p.stats.speed;
    p.x += dx * sp * dt; p.y += dy * sp * dt;
    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      p.face = { x: dx / l, y: dy / l };
      p.walk += dt * 10;
    }
    p.inv -= dt;
    if (p.stats.regen) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
  }

  function updateEnemies(dt) {
    const p = G.p, far = Math.hypot(W, H) * 0.9 + 200;
    const damp = Math.min(1, dt * 10);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (!e.boss && !e.elite && d > far) {
        // Reubica enemigos que quedaron muy atrás delante del jugador.
        const a = Math.atan2(dy, dx), nd = Math.hypot(W, H) / 2 + 60;
        e.x = p.x + Math.cos(a) * nd; e.y = p.y + Math.sin(a) * nd;
        continue;
      }
      const sp = e.speed * (e.slow > 0 ? 0.5 : 1);
      e.slow -= dt; e.flash -= dt; e.wob += dt * 6;
      e.x += (dx / d * sp + e.kx) * dt;
      e.y += (dy / d * sp + e.ky) * dt;
      e.kx -= e.kx * damp; e.ky -= e.ky * damp;

      if (!e.boss) {
        query(e.x, e.y, e.r, o => {
          if (o === e) return;
          const sx = e.x - o.x, sy = e.y - o.y, sd = Math.hypot(sx, sy) || 0.01;
          const ov = e.r + o.r - sd;
          if (ov > 0) { const push = (o.boss ? ov : ov * 0.5) * 0.5; e.x += sx / sd * push; e.y += sy / sd * push; }
        });
      }
      if (d < e.r + p.r) damagePlayer(e.dmg);
      if (e.boss) bossAI(e, dt);
    }
  }

  function bossAI(e, dt) {
    e.shotT -= dt;
    if (e.shotT > 0) return;
    e.shotT = e.final ? 1.8 : 2.6;
    e.phase += 0.3;
    for (let i = 0; i < e.shots; i++) {
      const a = i / e.shots * TAU + e.phase;
      G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 7, dmg: 12, life: 5, color: e.color });
    }
    if (e.final) {
      const a = Math.atan2(G.p.y - e.y, G.p.x - e.x);
      for (let i = -1; i <= 1; i++) {
        G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a + i * 0.15) * 230, vy: Math.sin(a + i * 0.15) * 230, r: 8, dmg: 15, life: 4, color: '#ffd75e' });
      }
    }
  }

  function updateBullets(dt) {
    const p = G.p;
    for (const b of G.bullets) {
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      if (b.kind === 'chispa') {
        b.x += b.vx * dt; b.y += b.vy * dt;
        query(b.x, b.y, b.r, e => {
          if (b.dead || b.hit.has(e)) return;
          b.hit.add(e);
          const l = Math.hypot(b.vx, b.vy);
          hurt(e, b.dmg, b.vx / l, b.vy / l, 120);
          if (--b.pierce < 0) b.dead = true;
        });
      } else if (b.kind === 'disco') {
        b.t += dt; b.rot += dt * 18;
        if (b.t < b.out) {
          const sp = b.spd * (1 - b.t / b.out) + 40;
          b.x += b.vx * sp * dt; b.y += b.vy * sp * dt;
        } else {
          const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
          const sp = 200 + (b.t - b.out) * 700;
          b.x += dx / d * sp * dt; b.y += dy / d * sp * dt;
          if (d < p.r + b.r) { b.dead = true; continue; }
        }
        query(b.x, b.y, b.r, e => {
          if (G.time - (b.hits.get(e) ?? -9) < 0.35) return;
          b.hits.set(e, G.time);
          const kx = e.x - b.x, ky = e.y - b.y, l = Math.hypot(kx, ky) || 1;
          hurt(e, b.dmg, kx / l, ky / l, 150);
        });
      }
    }
  }

  function updateEBullets(dt) {
    const p = G.p;
    for (const b of G.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) b.dead = true;
      else if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) { damagePlayer(b.dmg); b.dead = true; }
    }
  }

  function updateGems(dt) {
    const p = G.p, mr = 80 * p.stats.magnet, mr2 = mr * mr;
    for (const g of G.gems) {
      if (!g.mag && dist2(g.x, g.y, p.x, p.y) < mr2) g.mag = true;
      if (!g.mag) continue;
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
      g.sp += 1100 * dt;
      const step = Math.min(d, (180 + g.sp) * dt);
      g.x += dx / d * step; g.y += dy / d * step;
      if (d < p.r + 6) { g.dead = true; gainXp(g.v); }
    }
  }

  function updatePickups(dt) {
    const p = G.p;
    for (const k of G.pickups) {
      k.t += dt;
      if (dist2(k.x, k.y, p.x, p.y) > (p.r + 16) ** 2) continue;
      k.dead = true;
      if (k.type === 'carne') heal(30);
      else if (k.type === 'iman') { for (const g of G.gems) g.mag = true; toast('🧲 ¡Todos los cristales vienen a ti!'); }
      else if (k.type === 'cofre') openChest();
    }
  }

  function updateFx(dt) {
    const damp = Math.min(1, dt * 4);
    for (const q of G.particles) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx -= q.vx * damp; q.vy -= q.vy * damp;
      q.life -= dt; if (q.life <= 0) q.dead = true;
    }
    for (const t of G.texts) { t.y -= 32 * dt; t.life -= dt; if (t.life <= 0) t.dead = true; }
    for (const f of G.effects) { f.life -= dt; if (f.life <= 0) f.dead = true; }
  }

  function update(dt) {
    G.time += dt;
    buildGrid();
    updatePlayer(dt);
    spawner(dt);
    updateEnemies(dt);
    buildGrid();
    for (const w of G.p.weapons) W_UPDATE[w.id](w, dt, G.p, G.p.stats);
    updateBullets(dt);
    updateEBullets(dt);
    updateGems(dt);
    updatePickups(dt);
    updateFx(dt);
    for (const a of [G.enemies, G.bullets, G.ebullets, G.gems, G.pickups, G.particles, G.texts, G.effects]) compact(a);
    G.shake = Math.max(0, G.shake - dt * 30);
    if (G.pending > 0 && state === 'play') openLevelUp();
  }

  // ---------- Dibujo ----------
  let camX = 0, camY = 0;
  const inView = (x, y, m) => x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround() {
    const S = 96;
    ctx.strokeStyle = '#151a33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(camX / S) * S; x < camX + W; x += S) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + H); }
    for (let y = Math.floor(camY / S) * S; y < camY + H; y += S) { ctx.moveTo(camX, y); ctx.lineTo(camX + W, y); }
    ctx.stroke();
    const T = 160;
    for (let tx = Math.floor(camX / T) - 1; tx <= Math.floor((camX + W) / T) + 1; tx++) {
      for (let ty = Math.floor(camY / T) - 1; ty <= Math.floor((camY + H) / T) + 1; ty++) {
        const h = hash(tx, ty), kind = h % 7;
        if (kind > 2) continue;
        const x = tx * T + (h >>> 8) % T, y = ty * T + (h >>> 16) % T;
        if (kind === 0) { // hierba
          ctx.strokeStyle = '#1f3b3a'; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(x - 5, y); ctx.lineTo(x - 7, y - 8); ctx.moveTo(x, y); ctx.lineTo(x, y - 11); ctx.moveTo(x + 5, y); ctx.lineTo(x + 7, y - 8);
          ctx.stroke();
        } else if (kind === 1) { // piedra
          ctx.fillStyle = '#1b2040'; ctx.beginPath(); ctx.ellipse(x, y, 10, 6, 0, 0, TAU); ctx.fill();
        } else { // hongos luminosos
          ctx.fillStyle = 'rgba(120, 90, 255, .25)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.arc(x + 7, y + 4, 2, 0, TAU); ctx.fill();
        }
      }
    }
  }

  function shadow(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.35, 0, 0, TAU); ctx.fill();
  }

  function eyes(ox, oy, s, glow) {
    ctx.fillStyle = glow || '#fff';
    ctx.beginPath(); ctx.arc(ox - s, oy, s * 0.8, 0, TAU); ctx.arc(ox + s, oy, s * 0.8, 0, TAU); ctx.fill();
    if (!glow) {
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(ox - s, oy, s * 0.4, 0, TAU); ctx.arc(ox + s, oy, s * 0.4, 0, TAU); ctx.fill();
    }
  }

  function drawEnemy(e) {
    shadow(e.x, e.y, e.r);
    const c = e.flash > 0 ? '#ffffff' : e.color;
    const r = e.r;
    const look = e.x > G.p.x ? -r * 0.25 : r * 0.25;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = c;
    switch (e.type) {
      case 'slime': {
        const sq = Math.sin(e.wob) * 0.1;
        ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * (1 + sq), r * (0.9 - sq), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.3, r * 0.25, r * 0.15, -0.5, 0, TAU); ctx.fill();
        eyes(look, 0, r * 0.25);
        break;
      }
      case 'murcielago': {
        const f = Math.sin(e.wob * 2.5) * 0.6;
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, 0); ctx.lineTo(-r * 2.1, -r * (0.5 + f)); ctx.lineTo(-r * 1.4, r * 0.5); ctx.closePath();
        ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 2.1, -r * (0.5 + f)); ctx.lineTo(r * 1.4, r * 0.5); ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        eyes(look * 0.5, -r * 0.1, r * 0.25, '#ffef5e');
        break;
      }
      case 'espectro': {
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, -r * 0.2, r, Math.PI, 0);
        ctx.lineTo(r, r * 0.8);
        for (let i = 0; i <= 4; i++) ctx.lineTo(r - i * (r / 2), r * 0.8 + (i % 2 ? -r * 0.3 : 0) + Math.sin(e.wob + i) * 2);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        eyes(look, -r * 0.2, r * 0.22, '#1a1440');
        break;
      }
      case 'bruto': {
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#e8d9b0';
        ctx.beginPath();
        ctx.moveTo(-r * 0.75, -r * 0.8); ctx.lineTo(-r * 1.0, -r * 1.45); ctx.lineTo(-r * 0.3, -r * 0.85);
        ctx.moveTo(r * 0.75, -r * 0.8); ctx.lineTo(r * 1.0, -r * 1.45); ctx.lineTo(r * 0.3, -r * 0.85);
        ctx.fill();
        ctx.fillStyle = c;
        rr(-r, -r, r * 2, r * 2, r * 0.4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(-r, r * 0.3, r * 2, r * 0.25);
        eyes(look, -r * 0.25, r * 0.2, '#ffe14d');
        break;
      }
      case 'boss': {
        const n = 14, rot = e.wob * 0.15;
        ctx.beginPath();
        for (let i = 0; i < n * 2; i++) {
          const a = rot + i / (n * 2) * TAU, rad = i % 2 ? r * 0.9 : r * 1.3;
          ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = e.flash > 0 ? '#fff' : 'rgba(10,8,25,.6)';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, TAU); ctx.fill();
        eyes(look, -r * 0.1, r * 0.2, '#ffd75e');
        if (e.final) {
          ctx.fillStyle = '#ffd75e';
          ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.95); ctx.lineTo(-r * 0.6, -r * 1.45); ctx.lineTo(-r * 0.3, -r * 1.15); ctx.lineTo(0, -r * 1.55); ctx.lineTo(r * 0.3, -r * 1.15); ctx.lineTo(r * 0.6, -r * 1.45); ctx.lineTo(r * 0.6, -r * 0.95); ctx.closePath(); ctx.fill();
        }
        break;
      }
    }
    if (e.elite) {
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#300'; ctx.fillRect(-r, -r - 16, r * 2, 5);
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(-r, -r - 16, r * 2 * Math.max(0, e.hp / e.maxHp), 5);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = G.p;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    shadow(p.x, p.y, p.r);
    const bob = Math.sin(p.walk) * 1.5;
    // capa
    ctx.fillStyle = '#3b2b8f';
    ctx.beginPath();
    ctx.moveTo(p.x - p.face.x * 4 - 12, p.y + 4 + bob);
    ctx.lineTo(p.x - p.face.x * 10, p.y + 18);
    ctx.lineTo(p.x - p.face.x * 4 + 12, p.y + 4 + bob);
    ctx.closePath(); ctx.fill();
    // cuerpo
    ctx.shadowColor = '#4de1ff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#4de1ff';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, p.r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    // capucha
    ctx.fillStyle = '#5a46d6';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob - 2, p.r + 1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    eyes(p.x + p.face.x * 5, p.y + bob + 1 + p.face.y * 3, 3.5);
    ctx.globalAlpha = 1;
    // vida
    const bw = 36;
    ctx.fillStyle = '#2a0d18'; ctx.fillRect(p.x - bw / 2, p.y + p.r + 8, bw, 5);
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#4dff88' : '#ff4d6a';
    ctx.fillRect(p.x - bw / 2, p.y + p.r + 8, bw * p.hp / p.maxHp, 5);
  }

  function drawWeaponsWorld() {
    const p = G.p;
    for (const w of p.weapons) {
      if (w.id === 'halo' && w.R) {
        const pulse = 0.5 + Math.sin(G.time * 6) * 0.15;
        const g = ctx.createRadialGradient(p.x, p.y, w.R * 0.2, p.x, p.y, w.R);
        g.addColorStop(0, 'rgba(255,120,40,0)');
        g.addColorStop(1, w.evolved ? `rgba(255,215,94,${0.28 * pulse})` : `rgba(255,110,40,${0.25 * pulse})`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, w.R, 0, TAU); ctx.fill();
        ctx.strokeStyle = w.evolved ? 'rgba(255,215,94,.5)' : 'rgba(255,130,60,.4)';
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, w.R, 0, TAU); ctx.stroke();
      }
    }
  }

  function drawOrbs() {
    const p = G.p;
    for (const w of p.weapons) {
      if (w.id !== 'orbe' || !w.n) continue;
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + i / w.n * TAU;
        const x = p.x + Math.cos(a) * w.R, y = p.y + Math.sin(a) * w.R;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
        ctx.shadowColor = w.evolved ? '#ff5edc' : '#9dfcff'; ctx.shadowBlur = 12;
        ctx.fillStyle = w.evolved ? '#ffb3f0' : '#d9fdff';
        ctx.beginPath();
        ctx.moveTo(0, -w.br * 1.4); ctx.quadraticCurveTo(w.br, 0, 0, w.br * 1.4); ctx.quadraticCurveTo(-w.br * 0.3, 0, 0, -w.br * 1.4);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawBullets() {
    for (const b of G.bullets) {
      if (!inView(b.x, b.y, 40)) continue;
      if (b.kind === 'chispa') {
        const col = b.ev ? '#9dffef' : '#ffe066';
        ctx.strokeStyle = col; ctx.globalAlpha = 0.4; ctx.lineWidth = b.r;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.ev ? '#ff5edc' : '#ff9f43';
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1030';
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.75, 0, 1.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.75, Math.PI, Math.PI + 1.2); ctx.stroke();
        ctx.restore();
      }
    }
    for (const b of G.ebullets) {
      if (!inView(b.x, b.y, 20)) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
    }
  }

  function drawEffects() {
    for (const f of G.effects) {
      if (f.type !== 'bolt') continue;
      const k = f.life / f.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = f.ev ? '#ffe680' : '#bfe9ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      let x = f.x, y = f.y - 400;
      ctx.moveTo(x, y);
      for (let i = 1; i <= 8; i++) {
        const h = hash(f.seed, i);
        x = f.x + (i < 8 ? ((h % 40) - 20) : 0);
        y = f.y - 400 + i * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = f.ev ? 'rgba(255,230,128,.35)' : 'rgba(170,220,255,.35)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.R * (1.2 - k * 0.4), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawGems() {
    for (const g of G.gems) {
      if (!inView(g.x, g.y, 10)) continue;
      const s = g.v >= 10 ? 7 : g.v >= 3 ? 6 : 4.5;
      ctx.fillStyle = g.v >= 10 ? '#ff5c9a' : g.v >= 3 ? '#5dff9d' : '#5ab8ff';
      ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.7, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.7, g.y); ctx.closePath(); ctx.fill();
    }
  }

  function drawPickups() {
    for (const k of G.pickups) {
      if (!inView(k.x, k.y, 30)) continue;
      const bob = Math.sin(k.t * 4) * 3;
      if (k.type === 'cofre') {
        ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = 18;
        ctx.fillStyle = '#b5762a'; rr(k.x - 13, k.y - 9 + bob, 26, 18, 4); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffd75e'; ctx.fillRect(k.x - 13, k.y - 3 + bob, 26, 3); ctx.fillRect(k.x - 2, k.y - 4 + bob, 4, 6);
      } else {
        ctx.font = '20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(k.type === 'carne' ? '🍖' : '🧲', k.x, k.y + bob);
      }
    }
  }

  function drawFx() {
    for (const q of G.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    const p = G.p;
    ctx.fillStyle = '#161a36'; ctx.fillRect(0, 0, W, 10);
    const xg = ctx.createLinearGradient(0, 0, W, 0);
    xg.addColorStop(0, '#4b6cff'); xg.addColorStop(1, '#5ad1ff');
    ctx.fillStyle = xg; ctx.fillRect(0, 0, W * Math.min(1, p.xp / p.xpNext), 10);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(fmtTime(G.time), W / 2, 38);
    ctx.font = '13px system-ui'; ctx.fillStyle = '#b9bee6';
    ctx.fillText(`☠ ${p.kills}`, W / 2, 56);

    ctx.textAlign = 'left'; ctx.font = 'bold 15px system-ui'; ctx.fillStyle = '#ffd75e';
    ctx.fillText(`Nv. ${p.level}`, 10, 30);

    ctx.font = '16px system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    p.weapons.forEach((w, i) => {
      const x = 10 + i * 30, y = 40;
      ctx.fillStyle = w.evolved ? 'rgba(255,215,94,.35)' : 'rgba(40,46,100,.7)';
      rr(x, y, 26, 26, 6); ctx.fill();
      ctx.fillText(WEAPONS[w.id].icon, x + 13, y + 13);
      ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(w.evolved ? '★' : w.lvl, x + 22, y + 22);
      ctx.font = '16px system-ui';
    });
    Object.keys(p.passives).forEach((id, i) => {
      const x = 10 + i * 30, y = 70;
      ctx.fillStyle = 'rgba(40,46,100,.5)';
      rr(x, y, 26, 26, 6); ctx.fill();
      ctx.fillText(PASSIVES[id].icon, x + 13, y + 13);
      ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(p.passives[id], x + 22, y + 22);
      ctx.font = '16px system-ui';
    });

    if (G.boss && !G.boss.dead) {
      const b = G.boss, bw = Math.min(520, W - 40), x = (W - bw) / 2, y = H - 34;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(x - 2, y - 2, bw + 4, 16, 6); ctx.fill();
      ctx.fillStyle = b.color; rr(x, y, bw * Math.max(0, b.hp / b.maxHp), 12, 5); ctx.fill();
      ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
      ctx.fillText(b.name, W / 2, y - 8);
    }

    if (joy.active && state === 'play') {
      const jx = joy.x - joy.ox, jy = joy.y - joy.oy, l = Math.hypot(jx, jy), m = Math.min(l, 50);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 50, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.arc(joy.ox + (l ? jx / l * m : 0), joy.oy + (l ? jy / l * m : 0), 20, 0, TAU); ctx.fill();
    }

    const hpk = p.hp / p.maxHp;
    if (hpk < 0.3) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(255,0,40,0)');
      v.addColorStop(1, `rgba(255,0,40,${(0.3 - hpk) * (0.8 + Math.sin(G.time * 6) * 0.2)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  function render() {
    ctx.fillStyle = '#0b0d17';
    ctx.fillRect(0, 0, W, H);
    if (!G) return;
    const p = G.p;
    const sx = G.shake > 0 ? rand(-G.shake, G.shake) : 0, sy = G.shake > 0 ? rand(-G.shake, G.shake) : 0;
    camX = p.x - W / 2 + sx; camY = p.y - H / 2 + sy;
    ctx.save();
    ctx.translate(-camX, -camY);
    drawGround();
    drawWeaponsWorld();
    drawGems();
    drawPickups();
    for (const e of G.enemies) if (inView(e.x, e.y, e.r * 2 + 20)) drawEnemy(e);
    drawPlayer();
    drawOrbs();
    drawBullets();
    drawEffects();
    drawFx();
    ctx.restore();
    drawHUD();
  }

  // ---------- Flujo de partida ----------
  const overlays = ['menu', 'levelup', 'pause', 'end'];
  function showOnly(id) { for (const o of overlays) $(o).classList.toggle('hidden', o !== id); }

  function start() {
    newGame();
    showOnly(null);
    $('pauseBtn').classList.remove('hidden');
    $('toast').classList.add('hidden');
    state = 'play';
    last = performance.now();
  }

  function toMenu() {
    G = null; state = 'menu';
    $('pauseBtn').classList.add('hidden');
    $('toast').classList.add('hidden');
    updateBest();
    showOnly('menu');
  }

  function togglePause() {
    if (state === 'play') {
      state = 'paused';
      joy.active = false;
      renderBuild();
      showOnly('pause');
    } else if (state === 'paused') {
      state = 'play';
      showOnly(null);
    }
  }

  function renderBuild() {
    const p = G.p;
    let h = `<div class="row">⏱ ${fmtTime(G.time)} · Nv. ${p.level} · ☠ ${p.kills} · ❤ ${Math.ceil(p.hp)}/${p.maxHp}</div><h3>Armas</h3>`;
    for (const w of p.weapons) {
      const d = WEAPONS[w.id];
      h += w.evolved
        ? `<div class="row evo">${d.icon} ${d.evoName} ★</div>`
        : `<div class="row">${d.icon} ${d.name} — Nv. ${w.lvl}${w.lvl >= WMAX ? ` (evoluciona con ${PASSIVES[d.evo].icon})` : ''}</div>`;
    }
    const ps = Object.keys(p.passives);
    if (ps.length) {
      h += '<h3>Objetos</h3>';
      for (const id of ps) h += `<div class="row">${PASSIVES[id].icon} ${PASSIVES[id].name} — Nv. ${p.passives[id]}</div>`;
    }
    $('build').innerHTML = h;
  }

  function endGame(win) {
    if (state === 'over' || state === 'win') return;
    state = win ? 'win' : 'over';
    joy.active = false;
    const t = G.time;
    let record = false;
    if (t > best) {
      best = t; record = true;
      try { localStorage.setItem('hn_best', String(best)); } catch (e) { /* sin almacenamiento */ }
    }
    $('endTitle').textContent = win ? '¡Victoria!' : 'Has caído';
    $('endTitle').style.color = win ? '#6fffb0' : '#ff5c7a';
    $('endStats').innerHTML =
      (win ? 'El Rey del Abismo ha sido derrotado.<br>' : '') +
      `Tiempo: <b>${fmtTime(t)}</b>${record ? ' 🏆' : ''}<br>Nivel: <b>${G.p.level}</b><br>Enemigos derrotados: <b>${G.p.kills}</b>`;
    $('pauseBtn').classList.add('hidden');
    showOnly('end');
  }

  function updateBest() {
    $('bestTime').textContent = best > 0 ? `Mejor tiempo: ${fmtTime(best)}` : '';
  }

  $('playBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  $('menuBtn').addEventListener('click', toMenu);
  $('resumeBtn').addEventListener('click', togglePause);
  $('quitBtn').addEventListener('click', toMenu);
  $('pauseBtn').addEventListener('click', togglePause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
  updateBest();

  // ---------- Bucle principal ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'play') update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Acceso para depuración desde la consola.
  window.hordaNocturna = { get state() { return state; }, get game() { return G; } };
})();
