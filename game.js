'use strict';
/*
 * Horda Nocturna — un juego original de supervivencia contra hordas.
 * HTML5 Canvas + JavaScript puro, sin dependencias.
 */
(() => {
  const { WEAPONS, PASSIVES, ETYPES, BOSSES, CHARS, MAPS, SHOP } = window.HN_DATA;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById('game');
  const mainCtx = canvas.getContext('2d');
  let ctx = mainCtx;

  // ---------- Pantalla adaptable ----------
  let W = 0, H = 0;      // tamaño de la pantalla en píxeles CSS
  let ZOOM = 1;          // escala del mundo
  let VW = 0, VH = 0;    // tamaño visible del mundo
  let JR = 50;           // radio del joystick
  const SAFE = { t: 0, r: 0, b: 0, l: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Escala el mundo según el área de pantalla para que en móvil y escritorio se vea una zona parecida.
    ZOOM = Math.max(0.72, Math.min(1.35, Math.sqrt(W * H) / 900));
    VW = W / ZOOM; VH = H / ZOOM;
    JR = Math.max(40, Math.min(60, Math.min(W, H) * 0.12));
    const cs = getComputedStyle(document.getElementById('safeProbe'));
    SAFE.t = parseFloat(cs.paddingTop) || 0; SAFE.r = parseFloat(cs.paddingRight) || 0;
    SAFE.b = parseFloat(cs.paddingBottom) || 0; SAFE.l = parseFloat(cs.paddingLeft) || 0;
  }
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 150));
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
  const isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  // ---------- Guardado ----------
  const SAVE_KEY = 'hn_save_v1';
  const defaultSave = () => ({ gold: 0, up: {}, chars: ['aria'], char: 'aria', map: 'bosque', best: {}, wins: {}, sfx: true, music: true });
  function loadSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* sin almacenamiento */ }
    const d = defaultSave();
    if (s && typeof s === 'object') return Object.assign(d, s);
    try { const b = +localStorage.getItem('hn_best'); if (b) d.best.bosque = b; } catch (e) { /* nada */ }
    return d;
  }
  const S = loadSave();
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }
  const upLvl = id => S.up[id] || 0;
  const shopCost = it => Math.round(it.cost * (1 + upLvl(it.id) * 0.75));
  const mapUnlocked = m => !m.unlock || (S.best[m.unlock.map] || 0) >= m.unlock.time;
  const mapById = id => MAPS.find(m => m.id === id) || MAPS[0];
  const charById = id => CHARS.find(c => c.id === id) || CHARS[0];
  Sound.setSfx(S.sfx); Sound.setMusic(S.music);

  // ---------- Estado ----------
  const WMAX = 5, SLOTS = 4, MAX_ENEMIES = 380;
  let G = null;
  let state = 'menu'; // menu | play | levelup | paused | over | win

  function newGame() {
    const ch = charById(S.char), map = mapById(S.map), m = ch.mods;
    const p = {
      x: 0, y: 0, r: 14, hp: 100, maxHp: 100, inv: 0, face: { x: 1, y: 0 }, walk: 0, ch,
      level: 1, xp: 0, xpNext: 5, kills: 0,
      stats: { dmg: 1, cd: 1, speed: 1, regen: 0, magnet: 1, area: 1, proj: 0, armor: 0, xp: 1, gold: 1 },
      weapons: [], passives: {},
    };
    const s = p.stats;
    // Personaje
    p.maxHp += m.hp || 0; s.armor += m.armor || 0; s.speed += m.speed || 0; s.magnet += m.magnet || 0;
    s.dmg += m.dmg || 0; s.area += m.area || 0; s.cd *= m.cd || 1; s.regen += m.regen || 0;
    // Tienda
    s.dmg += 0.05 * upLvl('poder');
    p.maxHp += 10 * upLvl('vida');
    s.armor += upLvl('armadura');
    s.speed += 0.04 * upLvl('agilidad');
    s.cd *= Math.pow(0.97, upLvl('recarga'));
    s.magnet += 0.10 * upLvl('magnetismo');
    s.xp += 0.08 * upLvl('sabiduria');
    s.gold += 0.10 * upLvl('codicia');
    p.hp = p.maxHp;

    G = {
      time: 0, spawnAcc: 0, nextElite: 60, nextSwarm: 45, bossIdx: 0, shake: 0, pending: 0,
      boss: null, opts: [], map, gold: 0, bossKills: 0,
      revives: upLvl('renacer'), choices: 3 + upLvl('vision'),
      p, enemies: [], bullets: [], ebullets: [], gems: [], pickups: [], particles: [], texts: [], effects: [],
    };
    addWeapon(ch.weapon);
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
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0 && G.opts[i]) choose(G.opts[i]);
    }
    if ((state === 'over' || state === 'win') && e.code === 'Enter') start();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; joy.active = false; });
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'play') return;
    joy.active = true; joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (!joy.active || e.pointerId !== joy.id) return;
    joy.x = e.clientX; joy.y = e.clientY;
    // El joystick sigue al dedo si se aleja demasiado.
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy);
    if (l > JR * 1.6) { joy.ox = joy.x - dx / l * JR * 1.6; joy.oy = joy.y - dy / l * JR * 1.6; }
  });
  const endJoy = e => { if (e.pointerId === joy.id) joy.active = false; };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function inputDir() {
    let dx = 0, dy = 0;
    if (keys.KeyW || keys.ArrowUp) dy -= 1;
    if (keys.KeyS || keys.ArrowDown) dy += 1;
    if (keys.KeyA || keys.ArrowLeft) dx -= 1;
    if (keys.KeyD || keys.ArrowRight) dx += 1;
    if (joy.active) {
      const jx = joy.x - joy.ox, jy = joy.y - joy.oy, l = Math.hypot(jx, jy);
      if (l > 6) { const m = Math.min(l, JR) / JR; dx += jx / l * m; dy += jy / l * m; }
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
    Sound.play('hit', 0.05);
    if (e.hp <= 0) kill(e);
  }

  function kill(e) {
    e.dead = true;
    G.p.kills++;
    Sound.play('kill', 0.04);
    burst(e.x, e.y, e.color, e.boss ? 50 : e.elite ? 20 : 6, e.boss ? 260 : 120);
    dropGem(e.x, e.y, e.xp);
    if (e.elite || e.boss) G.pickups.push({ type: 'cofre', x: e.x, y: e.y, t: 0 });
    else {
      const r = Math.random();
      if (r < 0.010) G.pickups.push({ type: 'carne', x: e.x, y: e.y, t: 0 });
      else if (r < 0.014) G.pickups.push({ type: 'iman', x: e.x, y: e.y, t: 0 });
      else if (r < 0.05) G.pickups.push({ type: 'moneda', x: e.x, y: e.y, t: 0, mag: false, sp: 0 });
    }
    if (e.boss) {
      G.boss = null; G.shake = 14; G.bossKills++;
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
    p.xp += v * p.stats.xp;
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
    const dmg = Math.max(1, d - p.stats.armor);
    p.hp -= dmg; p.inv = 0.5;
    G.shake = Math.max(G.shake, 6);
    addText(p.x, p.y - 26, '-' + Math.round(dmg), '#ff5c6c');
    burst(p.x, p.y, '#ff5c6c', 8);
    Sound.play('hurt', 0.15);
    if (p.hp <= 0) {
      if (G.revives > 0) {
        G.revives--;
        p.hp = p.maxHp * 0.5; p.inv = 2.5;
        query(p.x, p.y, 260, e => { if (!e.boss) hurt(e, 99999); });
        for (const b of G.ebullets) b.dead = true;
        burst(p.x, p.y, '#fff7c2', 60, 320);
        G.shake = 12;
        Sound.play('revive');
        toast('🕊️ ¡Renaces de tus cenizas!');
      } else {
        p.hp = 0;
        endGame(false);
      }
    }
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
      Sound.play('shoot', 0.08);
    },
    orbe(w, dt, p, s) {
      const lv = w.lvl, ev = w.evolved;
      w.n = (ev ? 6 : [1, 2, 3, 3, 4][lv - 1]) + s.proj;
      w.R = (ev ? 100 : 66 + lv * 4 + (lv >= 4 ? 8 : 0)) * s.area;
      w.br = (ev ? 13 : 10) * Math.sqrt(s.area);
      w.angle += (ev ? 4.2 : 3.2) * dt;
      const dmg = (8 + 3 * lv) * (ev ? 2 : 1) * s.dmg;
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
      const vis = G.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < VW / 2 + 20 && Math.abs(e.y - p.y) < VH / 2 + 20);
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
      Sound.play('zap', 0.1);
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
      Sound.play('disc', 0.1);
    },
  };

  // ---------- Subida de nivel ----------
  function buildOptions(count) {
    const p = G.p, o = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) o.push({ k: 'w', id: w.id });
    if (p.weapons.length < SLOTS) for (const id in WEAPONS) if (!hasWeapon(id)) o.push({ k: 'nw', id });
    const owned = Object.keys(p.passives);
    for (const id of owned) if (p.passives[id] < PASSIVES[id].max) o.push({ k: 'p', id });
    if (owned.length < SLOTS) for (const id in PASSIVES) if (!p.passives[id]) o.push({ k: 'np', id });
    const r = shuffle(o).slice(0, count);
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
    Sound.play('level');
    G.opts = buildOptions(G.choices);
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
    // Evita elegir sin querer con un toque que venía del juego.
    box.style.pointerEvents = 'none';
    setTimeout(() => { box.style.pointerEvents = ''; }, 250);
    showOnly('levelup');
  }

  function choose(o) {
    if (state !== 'levelup') return;
    Sound.play('click');
    applyOption(o);
    G.pending--;
    if (G.pending > 0) openLevelUp();
    else { state = 'play'; showOnly(null); }
  }

  function openChest() {
    const p = G.p;
    const goldBonus = 10;
    G.gold += goldBonus;
    const ev = p.weapons.find(canEvolve);
    if (ev) {
      ev.evolved = true;
      G.shake = 8;
      burst(p.x, p.y, '#ffd75e', 40, 260);
      Sound.play('evolve');
      toast(`¡EVOLUCIÓN! ${WEAPONS[ev.id].icon} ${WEAPONS[ev.id].evoName}`);
      return;
    }
    Sound.play('chest');
    const ups = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) ups.push({ k: 'w', id: w.id });
    for (const id in p.passives) if (p.passives[id] < PASSIVES[id].max) ups.push({ k: 'p', id });
    if (ups.length) {
      const o = pick(ups), d = describe(o);
      applyOption(o);
      toast(`Cofre: ${d.icon} ${d.title} ${d.lvl} · +${goldBonus} 🪙`);
    } else {
      heal(50);
      toast(`Cofre: +50 de vida · +${goldBonus} 🪙`);
    }
  }

  // ---------- Aparición de enemigos ----------
  function spawnPos() {
    const a = rand(0, TAU), d = Math.hypot(VW, VH) / 2 + rand(40, 120);
    return [G.p.x + Math.cos(a) * d, G.p.y + Math.sin(a) * d];
  }

  function spawnEnemy(type, m = {}) {
    const t = ETYPES[type], map = G.map;
    const [x, y] = m.pos || spawnPos();
    const hs = (1 + G.time / 60 * 0.45) * map.hp;
    const e = {
      x, y, type, r: t.r * (m.size || 1), hp: t.hp * hs * (m.hp || 1), speed: t.speed * map.speed * (m.speed || 1),
      dmg: t.dmg * (m.dmg || 1), xp: t.xp * (m.xp || 1), color: map.colors[type],
      flash: 0, kx: 0, ky: 0, slow: 0, elite: !!m.elite, boss: false, wob: rand(0, TAU),
    };
    e.maxHp = e.hp;
    G.enemies.push(e);
    return e;
  }

  function spawnBoss(b) {
    const [x, y] = spawnPos();
    const hp = b.hp * G.map.hp;
    const e = {
      x, y, type: 'boss', r: b.r, hp, maxHp: hp, speed: b.speed * G.map.speed, dmg: b.dmg, xp: 60, color: b.color,
      flash: 0, kx: 0, ky: 0, slow: 0, boss: true, final: b.final, name: b.name, shots: b.shots,
      shotT: 3, wob: 0, phase: 0,
    };
    G.enemies.push(e);
    G.boss = e;
    G.shake = 10;
    Sound.play('boss');
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
      if (!G.boss) { toast('¡Ha aparecido un enemigo élite!'); Sound.play('warn'); }
    }
    if (t >= G.nextSwarm) {
      G.nextSwarm += 45;
      const n = 16 + Math.floor(t / 30);
      const type = t > 240 ? 'espectro' : 'murcielago';
      const d = Math.hypot(VW, VH) / 2 + 40;
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
    const p = G.p, far = Math.hypot(VW, VH) * 0.9 + 200;
    const damp = Math.min(1, dt * 10);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (!e.boss && !e.elite && d > far) {
        // Reubica enemigos que quedaron muy atrás delante del jugador.
        const a = Math.atan2(dy, dx), nd = Math.hypot(VW, VH) / 2 + 60;
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

  function attract(g, dt, p, mr2) {
    if (!g.mag && dist2(g.x, g.y, p.x, p.y) < mr2) g.mag = true;
    if (!g.mag) return Infinity;
    const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
    g.sp += 1100 * dt;
    const step = Math.min(d, (180 + g.sp) * dt);
    g.x += dx / d * step; g.y += dy / d * step;
    return d;
  }

  function updateGems(dt) {
    const p = G.p, mr = 80 * p.stats.magnet, mr2 = mr * mr;
    for (const g of G.gems) {
      if (attract(g, dt, p, mr2) < p.r + 6) { g.dead = true; gainXp(g.v); Sound.play('gem', 0.035); }
    }
  }

  function updatePickups(dt) {
    const p = G.p, mr = 80 * p.stats.magnet, mr2 = mr * mr;
    for (const k of G.pickups) {
      k.t += dt;
      if (k.type === 'moneda') attract(k, dt, p, mr2);
      if (dist2(k.x, k.y, p.x, p.y) > (p.r + 16) ** 2) continue;
      k.dead = true;
      if (k.type === 'carne') { heal(30); Sound.play('coin'); }
      else if (k.type === 'iman') {
        for (const g of G.gems) g.mag = true;
        for (const c of G.pickups) if (c.type === 'moneda') c.mag = true;
        Sound.play('chest');
        toast('🧲 ¡Todos los cristales vienen a ti!');
      } else if (k.type === 'cofre') openChest();
      else if (k.type === 'moneda') { G.gold++; Sound.play('coin', 0.05); }
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
    Sound.setMode(G.boss ? 'boss' : 'calm');
    if (G.pending > 0 && state === 'play') openLevelUp();
  }

  // ---------- Dibujo ----------
  let camX = 0, camY = 0;
  const inView = (x, y, m) => x > camX - m && x < camX + VW + m && y > camY - m && y < camY + VH + m;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDecor(kind, x, y, h) {
    switch (kind) {
      case 'grass':
        ctx.strokeStyle = '#1f3b3a'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x - 5, y); ctx.lineTo(x - 7, y - 8); ctx.moveTo(x, y); ctx.lineTo(x, y - 11); ctx.moveTo(x + 5, y); ctx.lineTo(x + 7, y - 8);
        ctx.stroke(); break;
      case 'stone':
        ctx.fillStyle = '#1b2040'; ctx.beginPath(); ctx.ellipse(x, y, 10, 6, 0, 0, TAU); ctx.fill(); break;
      case 'shroom':
        ctx.fillStyle = 'rgba(120, 90, 255, .3)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.arc(x + 7, y + 4, 2, 0, TAU); ctx.fill(); break;
      case 'cactus':
        ctx.fillStyle = '#2d4527'; rr(x - 3, y - 18, 6, 18, 3); ctx.fill();
        rr(x - 10, y - 13, 5, 8, 2); ctx.fill(); rr(x + 5, y - 15, 5, 8, 2); ctx.fill(); break;
      case 'bones':
        ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x + 8, y - 4); ctx.stroke(); break;
      case 'rock':
        ctx.fillStyle = '#2a1a14'; ctx.beginPath();
        ctx.moveTo(x - 12, y + 4); ctx.lineTo(x - 6, y - 7); ctx.lineTo(x + 5, y - 9); ctx.lineTo(x + 12, y + 4); ctx.closePath(); ctx.fill(); break;
      case 'crystal':
        ctx.fillStyle = 'rgba(120, 200, 255, .28)'; ctx.beginPath();
        ctx.moveTo(x, y - 18); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 6, y); ctx.closePath();
        ctx.moveTo(x + 9, y - 9); ctx.lineTo(x + 13, y + 1); ctx.lineTo(x + 7, y + 2); ctx.closePath(); ctx.fill(); break;
      case 'tomb':
        ctx.fillStyle = '#16263a'; rr(x - 8, y - 16, 16, 20, 7); ctx.fill();
        ctx.fillStyle = '#22385a'; ctx.fillRect(x - 1, y - 12, 2, 8); ctx.fillRect(x - 4, y - 9, 8, 2); break;
      case 'snow':
        ctx.fillStyle = 'rgba(220, 240, 255, .14)'; ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU); ctx.arc(x + 9, y + 3, 1.5, 0, TAU); ctx.arc(x + 3, y + 9, 2.5, 0, TAU); ctx.fill(); break;
    }
  }

  function drawGround() {
    const map = G.map, S_ = 96;
    ctx.strokeStyle = map.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(camX / S_) * S_; x < camX + VW; x += S_) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + VH); }
    for (let y = Math.floor(camY / S_) * S_; y < camY + VH; y += S_) { ctx.moveTo(camX, y); ctx.lineTo(camX + VW, y); }
    ctx.stroke();
    const T = 150;
    for (let tx = Math.floor(camX / T) - 1; tx <= Math.floor((camX + VW) / T) + 1; tx++) {
      for (let ty = Math.floor(camY / T) - 1; ty <= Math.floor((camY + VH) / T) + 1; ty++) {
        const h = hash(tx, ty), kind = h % 7;
        if (kind > 2) continue;
        drawDecor(map.decor[kind], tx * T + (h >>> 8) % T, ty * T + (h >>> 16) % T, h);
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

  /* Dibuja a un personaje; se usa en el juego y en los retratos del menú. */
  function drawHero(x, y, r, ch, face, bob, glow = true) {
    // capa
    ctx.fillStyle = ch.cloak;
    ctx.beginPath();
    ctx.moveTo(x - face.x * 4 - r * 0.85, y + 4 + bob);
    ctx.lineTo(x - face.x * 10, y + r * 1.3);
    ctx.lineTo(x - face.x * 4 + r * 0.85, y + 4 + bob);
    ctx.closePath(); ctx.fill();
    // cuerpo
    if (glow) { ctx.shadowColor = ch.body; ctx.shadowBlur = 16; }
    ctx.fillStyle = ch.body;
    ctx.beginPath(); ctx.arc(x, y + bob, r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    // accesorio
    const cy = y + bob;
    ctx.fillStyle = ch.hood;
    switch (ch.acc) {
      case 'hood':
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); break;
      case 'helm':
        ctx.beginPath(); ctx.arc(x, cy - 1, r + 1.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#c9d1e0'; ctx.fillRect(x - 1.5, cy - r - 6, 3, 7); break;
      case 'band':
        ctx.fillRect(x - r, cy - r * 0.55, r * 2, r * 0.3);
        ctx.beginPath(); ctx.moveTo(x - face.x * r, cy - r * 0.45); ctx.lineTo(x - face.x * (r + 9), cy - r * 0.1); ctx.lineTo(x - face.x * (r + 7), cy - r * 0.7); ctx.fill(); break;
      case 'flame': {
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
        const fl = Math.sin(performance.now() / 90) * 2;
        ctx.fillStyle = '#ffb02e';
        ctx.beginPath(); ctx.moveTo(x - 5, cy - r + 1); ctx.quadraticCurveTo(x, cy - r - 14 - fl, x + 5, cy - r + 1); ctx.fill();
        break;
      }
      case 'spark':
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath(); ctx.moveTo(x + 2, cy - r - 12); ctx.lineTo(x - 4, cy - r - 3); ctx.lineTo(x, cy - r - 3); ctx.lineTo(x - 2, cy - r + 4); ctx.lineTo(x + 4, cy - r - 6); ctx.lineTo(x, cy - r - 6); ctx.closePath(); ctx.fill();
        break;
    }
    eyes(x + face.x * r * 0.35, cy + 1 + face.y * 3, r * 0.25);
  }

  function drawPlayer() {
    const p = G.p;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    shadow(p.x, p.y, p.r);
    drawHero(p.x, p.y, p.r, p.ch, p.face, Math.sin(p.walk) * 1.5);
    ctx.globalAlpha = 1;
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
      ctx.moveTo(f.x, f.y - 400);
      for (let i = 1; i <= 8; i++) {
        const h = hash(f.seed, i);
        ctx.lineTo(f.x + (i < 8 ? ((h % 40) - 20) : 0), f.y - 400 + i * 50);
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
      } else if (k.type === 'moneda') {
        const sx = Math.abs(Math.cos(k.t * 5));
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath(); ctx.ellipse(k.x, k.y + bob * 0.5, 6 * sx + 1, 6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c99a2e';
        ctx.beginPath(); ctx.ellipse(k.x, k.y + bob * 0.5, 3 * sx + 0.5, 3, 0, 0, TAU); ctx.fill();
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
    const p = G.p, st = SAFE.t, sl = SAFE.l, sb = SAFE.b;
    const small = W < 420;
    // Barra de experiencia
    ctx.fillStyle = '#161a36'; ctx.fillRect(0, 0, W, st + 8);
    const xg = ctx.createLinearGradient(0, 0, W, 0);
    xg.addColorStop(0, '#4b6cff'); xg.addColorStop(1, '#5ad1ff');
    ctx.fillStyle = xg; ctx.fillRect(0, st, W * Math.min(1, p.xp / p.xpNext), 8);

    // Tiempo, muertes y oro
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = `bold ${small ? 20 : 24}px system-ui`;
    ctx.fillText(fmtTime(G.time), W / 2, st + 36);
    ctx.font = `${small ? 12 : 13}px system-ui`; ctx.fillStyle = '#b9bee6';
    ctx.fillText(`☠ ${p.kills}   🪙 ${G.gold}`, W / 2, st + 54);

    // Nivel e inventario
    ctx.textAlign = 'left'; ctx.font = `bold ${small ? 14 : 15}px system-ui`; ctx.fillStyle = '#ffd75e';
    ctx.fillText(`Nv. ${p.level}`, sl + 10, st + 28);
    const sz = small ? 22 : 26, gap = sz + 4, fs = small ? 13 : 16;
    const slot = (x, y, icon, label, bg) => {
      ctx.fillStyle = bg; rr(x, y, sz, sz, 6); ctx.fill();
      ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, x + sz / 2, y + sz / 2 + 1);
      ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(label, x + sz - 4, y + sz - 4);
    };
    p.weapons.forEach((w, i) => slot(sl + 10 + i * gap, st + 36, WEAPONS[w.id].icon, w.evolved ? '★' : w.lvl, w.evolved ? 'rgba(255,215,94,.35)' : 'rgba(40,46,100,.7)'));
    Object.keys(p.passives).forEach((id, i) => slot(sl + 10 + i * gap, st + 36 + gap, PASSIVES[id].icon, p.passives[id], 'rgba(40,46,100,.5)'));
    if (G.revives > 0) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `${fs}px system-ui`;
      ctx.fillText('🕊️', sl + 10, st + 36 + gap * 2 + sz / 2);
    }

    // Barra del jefe
    if (G.boss && !G.boss.dead) {
      const b = G.boss, bw = Math.min(520, W - 40), x = (W - bw) / 2, y = H - sb - 34;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(x - 2, y - 2, bw + 4, 16, 6); ctx.fill();
      ctx.fillStyle = b.color; rr(x, y, Math.max(1, bw * Math.max(0, b.hp / b.maxHp)), 12, 5); ctx.fill();
      ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
      ctx.fillText(b.name, W / 2, y - 8);
    }

    // Joystick táctil
    if (joy.active && state === 'play') {
      const jx = joy.x - joy.ox, jy = joy.y - joy.oy, l = Math.hypot(jx, jy), m = Math.min(l, JR);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(joy.ox + (l ? jx / l * m : 0), joy.oy + (l ? jy / l * m : 0), JR * 0.4, 0, TAU); ctx.fill();
    }

    // Viñeta roja con poca vida
    const hpk = p.hp / p.maxHp;
    if (hpk < 0.3) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(255,0,40,0)');
      v.addColorStop(1, `rgba(255,0,40,${(0.3 - hpk) * (0.8 + Math.sin(G.time * 6) * 0.2)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  // Fondo animado del menú
  let menuT = 0;
  function renderMenuBg(dt) {
    menuT += dt;
    const map = mapById(S.map);
    ctx.fillStyle = map.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = map.grid; ctx.lineWidth = 1; ctx.beginPath();
    const off = (menuT * 20) % 96;
    for (let x = -off; x < W; x += 96) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -off; y < H; y += 96) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function render(dt) {
    ctx = mainCtx;
    if (!G) { renderMenuBg(dt); return; }
    ctx.fillStyle = G.map.bg;
    ctx.fillRect(0, 0, W, H);
    const p = G.p;
    const sx = G.shake > 0 ? rand(-G.shake, G.shake) : 0, sy = G.shake > 0 ? rand(-G.shake, G.shake) : 0;
    camX = p.x - VW / 2 + sx; camY = p.y - VH / 2 + sy;
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
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

  // ---------- Menús ----------
  const overlays = ['menu', 'help', 'select', 'shop', 'levelup', 'pause', 'end'];
  function showOnly(id) { for (const o of overlays) $(o).classList.toggle('hidden', o !== id); }

  function refreshGold() { document.querySelectorAll('.goldAmt').forEach(el => { el.textContent = S.gold; }); }

  function syncToggles() {
    document.querySelectorAll('.tgl').forEach(b => {
      const on = b.dataset.t === 'sfx' ? S.sfx : S.music;
      b.textContent = b.dataset.t === 'sfx' ? (on ? '🔊' : '🔇') : '🎵';
      b.classList.toggle('off', !on);
      b.title = (b.dataset.t === 'sfx' ? 'Efectos: ' : 'Música: ') + (on ? 'sí' : 'no');
    });
  }
  document.querySelectorAll('.tgl').forEach(b => b.addEventListener('click', () => {
    Sound.init();
    if (b.dataset.t === 'sfx') { S.sfx = !S.sfx; Sound.setSfx(S.sfx); }
    else { S.music = !S.music; Sound.setMusic(S.music); }
    save(); syncToggles(); Sound.play('click');
  }));

  function portrait(ch) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const pc = c.getContext('2d');
    pc.scale(4, 4);
    ctx = pc;
    drawHero(16, 15, 9, ch, { x: 0.4, y: 0.6 }, 0, false);
    ctx = mainCtx;
    return c;
  }

  function bump(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); Sound.play('error'); }

  function renderSelect() {
    refreshGold();
    const cbox = $('chars');
    cbox.innerHTML = '';
    for (const ch of CHARS) {
      const owned = S.chars.includes(ch.id);
      const b = document.createElement('button');
      b.className = 'sel' + (S.char === ch.id ? ' on' : '') + (owned ? '' : ' locked');
      b.appendChild(portrait(ch));
      const w = WEAPONS[ch.weapon];
      b.insertAdjacentHTML('beforeend',
        `<div class="nm">${ch.name}</div><div class="tt">${ch.title}</div>` +
        `<div class="wp">${w.icon} ${w.name}</div><div class="ds">${ch.desc}</div>` +
        (owned ? '' : `<div class="cost${S.gold >= ch.cost ? '' : ' no'}">🔒 🪙 ${ch.cost}</div>`));
      b.addEventListener('click', () => {
        if (!owned) {
          if (S.gold < ch.cost) { bump(b); return; }
          S.gold -= ch.cost; S.chars.push(ch.id);
          Sound.play('buy');
        } else Sound.play('click');
        S.char = ch.id; save(); renderSelect();
      });
      cbox.appendChild(b);
    }
    const mbox = $('maps');
    mbox.innerHTML = '';
    for (const m of MAPS) {
      const open = mapUnlocked(m);
      const b = document.createElement('button');
      b.className = 'sel' + (S.map === m.id ? ' on' : '') + (open ? '' : ' locked');
      const best = S.best[m.id] || 0;
      const req = m.unlock ? `🔒 Sobrevive ${fmtTime(m.unlock.time)} en ${mapById(m.unlock.map).name}` : '';
      const diff = m.hp > 1 ? `Enemigos +${Math.round((m.hp - 1) * 100)}% vida · Oro ×${m.gold}` : 'Dificultad normal · Oro ×1';
      b.innerHTML =
        `<div class="preview" style="background:linear-gradient(135deg, ${m.bg}, ${m.accent})">${m.emoji}</div>` +
        `<div class="nm">${m.name}</div><div class="ds">${m.desc}</div><div class="wp">${diff}</div>` +
        (open ? `<div class="tt">${best ? `Mejor: ${fmtTime(best)}${S.wins[m.id] ? ' 👑' : ''}` : 'Sin jugar'}</div>` : `<div class="cost no">${req}</div>`);
      b.addEventListener('click', () => {
        if (!open) { bump(b); return; }
        Sound.play('click');
        S.map = m.id; save(); renderSelect();
      });
      mbox.appendChild(b);
    }
  }

  function renderShop() {
    refreshGold();
    const box = $('shopGrid');
    box.innerHTML = '';
    for (const it of SHOP) {
      const l = upLvl(it.id), maxed = l >= it.max, cost = shopCost(it);
      const d = document.createElement('div');
      d.className = 'sel shopitem';
      let pips = '';
      for (let i = 0; i < it.max; i++) pips += `<span class="pip${i < l ? ' full' : ''}"></span>`;
      d.innerHTML = `<div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div><div class="pips">${pips}</div>`;
      const b = document.createElement('button');
      b.textContent = maxed ? 'MÁX' : `🪙 ${cost}`;
      b.disabled = maxed;
      if (!maxed && S.gold < cost) b.style.opacity = '.6';
      b.addEventListener('click', () => {
        if (maxed) return;
        if (S.gold < cost) { bump(d); return; }
        S.gold -= cost; S.up[it.id] = l + 1; save();
        Sound.play('buy');
        renderShop();
      });
      d.appendChild(b);
      box.appendChild(d);
    }
  }

  function updateBest() {
    const b = S.best[S.map] || 0;
    $('bestTime').textContent = b > 0 ? `Mejor tiempo en ${mapById(S.map).name}: ${fmtTime(b)}` : '';
  }

  function openMenu() { refreshGold(); syncToggles(); updateBest(); showOnly('menu'); }

  // ---------- Flujo de partida ----------
  function start() {
    Sound.init();
    newGame();
    showOnly(null);
    $('pauseBtn').classList.remove('hidden');
    $('toast').classList.add('hidden');
    state = 'play';
    Sound.startMusic();
    if (isTouch) toast('Arrastra el dedo para moverte');
  }

  function toMenu() {
    G = null; state = 'menu';
    Sound.stopMusic(); Sound.resume();
    $('pauseBtn').classList.add('hidden');
    $('toast').classList.add('hidden');
    openMenu();
  }

  function togglePause() {
    if (state === 'play') {
      state = 'paused';
      joy.active = false;
      renderBuild(); syncToggles();
      showOnly('pause');
      Sound.suspend();
    } else if (state === 'paused') {
      state = 'play';
      Sound.resume();
      showOnly(null);
    }
  }

  function renderBuild() {
    const p = G.p;
    let h = `<div class="row">🗺️ ${G.map.name} · ${p.ch.name}</div>` +
      `<div class="row">⏱ ${fmtTime(G.time)} · Nv. ${p.level} · ☠ ${p.kills} · 🪙 ${G.gold} · ❤ ${Math.ceil(p.hp)}/${p.maxHp}</div><h3>Armas</h3>`;
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
    Sound.stopMusic();
    Sound.play(win ? 'win' : 'lose');
    const t = G.time, map = G.map;
    const lockedBefore = MAPS.filter(m => !mapUnlocked(m)).map(m => m.id);
    let record = false;
    if (t > (S.best[map.id] || 0)) { S.best[map.id] = t; record = true; }
    if (win) S.wins[map.id] = (S.wins[map.id] || 0) + 1;
    const base = G.gold + Math.floor(t / 10) + G.bossKills * 50 + (win ? 150 : 0);
    const earned = Math.round(base * map.gold * G.p.stats.gold);
    S.gold += earned;
    save();
    const newMaps = MAPS.filter(m => lockedBefore.includes(m.id) && mapUnlocked(m));

    $('endTitle').textContent = win ? '¡Victoria!' : 'Has caído';
    $('endTitle').style.color = win ? '#6fffb0' : '#ff5c7a';
    $('endStats').innerHTML =
      (win ? 'El Rey del Abismo ha sido derrotado.<br>' : '') +
      `Tiempo: <b>${fmtTime(t)}</b>${record ? ' 🏆' : ''}<br>Nivel: <b>${G.p.level}</b> · Enemigos: <b>${G.p.kills}</b><br>` +
      `Oro ganado: <b>🪙 ${earned}</b> (total ${S.gold})` +
      newMaps.map(m => `<br><span class="unlock">¡Nuevo mapa desbloqueado: ${m.emoji} ${m.name}!</span>`).join('');
    $('pauseBtn').classList.add('hidden');
    showOnly('end');
  }

  // Botones
  const click = (id, fn) => $(id).addEventListener('click', () => { Sound.init(); Sound.play('click'); fn(); });
  click('playBtn', () => { renderSelect(); showOnly('select'); });
  click('shopBtn', () => { renderShop(); showOnly('shop'); });
  click('helpBtn', () => showOnly('help'));
  click('startBtn', start);
  click('retryBtn', start);
  click('menuBtn', toMenu);
  click('quitBtn', toMenu);
  $('resumeBtn').addEventListener('click', togglePause);
  $('pauseBtn').addEventListener('click', togglePause);
  document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => { Sound.play('click'); openMenu(); }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
  openMenu();

  // ---------- Bucle principal ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'play') update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Acceso para depuración desde la consola.
  window.hordaNocturna = { get state() { return state; }, get game() { return G; }, save: S };
})();
