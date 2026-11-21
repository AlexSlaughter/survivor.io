'use strict';
/*
 * Horda Nocturna — un juego original de supervivencia contra hordas.
 * HTML5 Canvas + JavaScript puro, sin dependencias.
 */
(() => {
  const { WEAPONS, MAIN_WEAPONS, PASSIVES, ETYPES, SPAWNS, BOSSES, CHARS, MAPS, SHOP, RARITY, EQUIP_SLOTS, ITEMS, STAT_LABELS, ITEM_MAX, CHESTS } = window.HN_DATA;
  // Las armas principales se tratan como armas (suben de nivel en partida), pero no salen como armas nuevas ni evolucionan.
  for (const k in MAIN_WEAPONS) WEAPONS[k] = Object.assign({ main: true }, MAIN_WEAPONS[k]);
  const itemById = id => ITEMS.find(it => it.id === id);
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
  // Compensación única por lo que se retiró del juego: personajes antiguos (su precio) y
  // armas antiguas de la ruleta (su valor según la rareza más lo invertido en mejorarlas).
  const LEGACY_CHARS = { bruno: ['Bruno', 250], kira: ['Kira', 400], vulcan: ['Vulcan', 600], nova: ['Nova', 900] };
  const LEGACY_ITEMS = {
    varita: ['Varita Arcana', 'comun'], cuchillas: ['Cuchillas Gemelas', 'raro'], disco_bronce: ['Disco de Bronce', 'raro'],
    brasero: ['Brasero de Mano', 'raro'], cetro: ['Cetro de Tormenta', 'epico'], filo_eclipse: ['Filo del Eclipse', 'legendario'],
  };
  function legacyRefund(o) {
    let gold = 0;
    const names = [];
    const chars = Array.isArray(o.chars) ? o.chars : [];
    for (const id in LEGACY_CHARS) if (chars.includes(id)) { gold += LEGACY_CHARS[id][1]; names.push(LEGACY_CHARS[id][0]); }
    for (const id in LEGACY_ITEMS) {
      const lvl = Math.min(ITEM_MAX, Math.floor(+(o.items && o.items[id]) || 0));
      if (lvl <= 0) continue;
      const price = RARITY[LEGACY_ITEMS[id][1]].price;
      let v = price;
      for (let k = 1; k < lvl; k++) v += Math.round(price * 0.4 * k);
      gold += v;
      names.push(LEGACY_ITEMS[id][0] + (lvl > 1 ? ` Nv. ${lvl}` : ''));
    }
    return { gold, names };
  }

  const defaultSave = () => ({ gold: 0, up: {}, chars: ['marc'], char: 'marc', map: 'bosque', best: {}, wins: {}, sfx: true, music: true, t: 0, mode: 'solo', char2: 'marc', items: {}, equip: {}, comp1: true });
  function loadSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* sin almacenamiento */ }
    const d = defaultSave();
    if (s && typeof s === 'object') {
      try {
        const v = sanitize(s);
        // Guardados de versiones anteriores sin fecha: más recientes que uno vacío, más antiguos que cualquier otro.
        if (!v.t && (v.gold || v.chars.length > 1 || Object.keys(v.up).length || Object.keys(v.best).length)) v.t = 1;
        return v;
      } catch (e) { /* guardado dañado */ }
    }
    try { const b = +localStorage.getItem('hn_best'); if (b) d.best.bosque = b; } catch (e) { /* nada */ }
    return d;
  }
  const S = loadSave();
  let pendingComp = null;
  if (S.compNote) { pendingComp = S.compNote; delete S.compNote; try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* nada */ } }
  function saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }
  function save() { S.t = Date.now(); saveLocal(); queueCloud(); }

  // Limpia un guardado de origen externo (nube, código o localStorage) para que solo tenga valores válidos.
  function sanitize(o) {
    if (!o || typeof o !== 'object') throw new Error('guardado no válido');
    const d = defaultSave();
    d.gold = Number.isFinite(+o.gold) ? Math.max(0, Math.floor(+o.gold)) : 0;
    for (const it of SHOP) {
      const l = Math.floor(+(o.up && o.up[it.id]) || 0);
      if (l > 0) d.up[it.id] = Math.min(it.max, l);
    }
    const chars = Array.isArray(o.chars) ? o.chars : [];
    for (const c of CHARS) if (c.id !== 'marc' && chars.includes(c.id)) d.chars.push(c.id);
    for (const m of MAPS) {
      const b = +(o.best && o.best[m.id]) || 0, w = Math.floor(+(o.wins && o.wins[m.id]) || 0);
      if (b > 0) d.best[m.id] = b;
      if (w > 0) d.wins[m.id] = w;
    }
    if (d.chars.includes(o.char)) d.char = o.char;
    if (d.chars.includes(o.char2)) d.char2 = o.char2;
    d.mode = ['solo', 'local', 'online'].includes(o.mode) ? o.mode : (o.coop === true ? 'local' : 'solo');
    if (MAPS.some(m => m.id === o.map)) d.map = o.map;
    d.sfx = o.sfx !== false; d.music = o.music !== false;
    d.t = Number.isFinite(+o.t) ? +o.t : 0;
    Object.assign(d, sanitizeGear(o.items, o.equip));
    // Guardados de antes del cambio de personajes y armas: se compensa una sola vez.
    if (!o.comp1) {
      const c = legacyRefund(o);
      if (c.gold > 0) { d.gold += c.gold; d.compNote = c; }
    }
    d.comp1 = true;
    return d;
  }

  // Combina dos guardados: los desbloqueos se suman y el oro se toma del guardado más reciente.
  // Equipo válido: niveles entre 1 y el máximo, y solo objetos que se tienen en el hueco correcto.
  function sanitizeGear(items, equip) {
    const out = { items: {}, equip: {} };
    for (const it of ITEMS) {
      const l = Math.floor(+(items && items[it.id]) || 0);
      if (l > 0) out.items[it.id] = Math.min(ITEM_MAX, l);
    }
    for (const sl of EQUIP_SLOTS) {
      const id = equip && equip[sl.id], it = itemById(id);
      if (it && it.slot === sl.id && out.items[id]) out.equip[sl.id] = id;
    }
    return out;
  }

  function mergeSaves(a, b) {
    const ta = a.t || 0, tb = b.t || 0;
    // Con la misma fecha (p. ej. guardados sin fecha) se conserva el que tenga más oro.
    const newer = tb > ta ? b : tb < ta ? a : (b.gold > a.gold ? b : a);
    const m = Object.assign(defaultSave(), a);
    m.gold = newer.gold;
    m.up = {};
    for (const it of SHOP) { const l = Math.max(a.up[it.id] || 0, b.up[it.id] || 0); if (l) m.up[it.id] = l; }
    m.chars = CHARS.map(c => c.id).filter(id => a.chars.includes(id) || b.chars.includes(id));
    m.best = {}; m.wins = {};
    for (const mp of MAPS) {
      const bt = Math.max(a.best[mp.id] || 0, b.best[mp.id] || 0), w = Math.max(a.wins[mp.id] || 0, b.wins[mp.id] || 0);
      if (bt) m.best[mp.id] = bt;
      if (w) m.wins[mp.id] = w;
    }
    m.t = Math.max(a.t || 0, b.t || 0);
    m.items = {};
    for (const it of ITEMS) { const l = Math.max(a.items[it.id] || 0, b.items[it.id] || 0); if (l) m.items[it.id] = l; }
    m.equip = sanitizeGear(m.items, Object.keys(a.equip).length ? a.equip : b.equip).equip;
    if (!m.chars.includes(m.char)) m.char = 'marc';
    if (!m.chars.includes(m.char2)) m.char2 = 'marc';
    return m;
  }
  function replaceSave(m) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, m); }

  // ---------- Nube (ver cloud.js) ----------
  const Cloud = window.Cloud || { configured: false, ready: true, user: null };
  let cloudTimer = 0, cloudBusy = false, lastPull = 0, cloudErr = '';
  function queueCloud() {
    if (!Cloud.user) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(pushCloud, 1500);
  }
  async function pushCloud() {
    if (!Cloud.user) return false;
    try { await Cloud.store(S); cloudErr = ''; return true; }
    catch (e) { cloudErr = Cloud.message(e); return false; }
    finally { renderAccount(); }
  }
  async function pullCloud(force) {
    if (!Cloud.user || cloudBusy) return;
    if (!force && Date.now() - lastPull < 30000) return;
    cloudBusy = true; lastPull = Date.now();
    try {
      const remote = await Cloud.load();
      if (remote) {
        const rs = sanitize(remote);
        if (rs.compNote) { showComp(rs.compNote); delete rs.compNote; }
        replaceSave(mergeSaves(S, rs)); saveLocal();
      }
      await Cloud.store(S);
      cloudErr = '';
    } catch (e) {
      cloudErr = Cloud.message(e);
    } finally {
      cloudBusy = false;
    }
    if (state === 'menu') {
      refreshGold(); updateBest(); renderAccount();
      if (!$('select').classList.contains('hidden')) renderSelect();
      if (!$('shop').classList.contains('hidden')) renderShop();
    }
  }
  const upLvl = id => S.up[id] || 0;
  const shopCost = it => Math.round(it.cost * (1 + upLvl(it.id) * 0.75));
  const mapUnlocked = m => !m.unlock || (S.best[m.unlock.map] || 0) >= m.unlock.time;
  const mapById = id => MAPS.find(m => m.id === id) || MAPS[0];
  const charById = id => CHARS.find(c => c.id === id) || CHARS[0];
  Sound.setSfx(S.sfx); Sound.setMusic(S.music);

  // ---------- Estado ----------
  const WMAX = 5, SLOTS = 4;
  const PCOLORS = ['#4de1ff', '#ff6fb5', '#ffd166', '#7dff9a'];
  // Versiones más oscuras de los colores de jugador para los textos de los menús (fondo claro).
  const PTEXT = ['#3f8fb3', '#c9628f', '#b0841f', '#3a9a6c'];
  let G = null;
  let state = 'menu'; // menu | play | levelup | paused | over | win

  // Suma las bonificaciones del equipo puesto. Cada nivel añade un 50% del valor base.
  const itemValue = (v, lvl) => v * (1 + 0.5 * (lvl - 1));
  function gearStats(gear) {
    const st = {};
    let weapon = null, weaponLvl = 1;
    if (!gear) return { st, weapon, weaponLvl };
    for (const sl of EQUIP_SLOTS) {
      const it = itemById(gear.equip[sl.id]);
      if (!it) continue;
      const lvl = gear.items[it.id] || 1;
      for (const k in it.stats) st[k] = (st[k] || 0) + itemValue(it.stats[k], lvl);
      if (it.weapon) { weapon = it.weapon; weaponLvl = lvl; }
    }
    return { st, weapon, weaponLvl };
  }
  const myGear = () => ({ items: S.items, equip: S.equip });

  // `up` son las mejoras de la tienda de quien controla al personaje (en online, las del invitado).
  function makePlayer(ch, idx, x, up = S.up, gear = null) {
    const ul = id => Math.floor(+up[id] || 0);
    const m = ch.mods;
    const p = {
      idx, x, y: 0, r: 14 * (ch.mods.size || 1), hp: 100, maxHp: 100, inv: 0, face: { x: 1, y: 0 }, side: 1, walk: 0, ch,
      color: PCOLORS[idx], down: false, reviveT: 0, revives: ul('renacer'), choices: 3 + ul('vision'),
      stats: { dmg: 1, cd: 1, speed: 1, regen: 0, magnet: 1, area: 1, proj: 0, armor: 0, xp: 1, gold: 1 },
      weapons: [], passives: {},
      // Cada jugador tiene su propia experiencia y su propio nivel.
      level: 1, xp: 0, xpNext: 5, pending: 0, opts: null, optsSent: false,
    };
    const s = p.stats;
    // Personaje
    p.maxHp += m.hp || 0; s.armor += m.armor || 0; s.speed += m.speed || 0; s.magnet += m.magnet || 0;
    s.dmg += m.dmg || 0; s.area += m.area || 0; s.cd *= m.cd || 1; s.regen += m.regen || 0;
    s.gold += m.gold || 0; s.xp += m.xp || 0;
    // Tienda
    s.dmg += 0.05 * ul('poder');
    p.maxHp += 10 * ul('vida');
    s.armor += ul('armadura');
    s.speed += 0.04 * ul('agilidad');
    s.cd *= Math.pow(0.97, ul('recarga'));
    s.magnet += 0.10 * ul('magnetismo');
    s.xp += 0.08 * ul('sabiduria');
    s.gold += 0.10 * ul('codicia');
    // Equipo
    const g = gearStats(gear), q = g.st;
    p.maxHp += q.hp || 0; s.armor += q.armor || 0; s.speed += q.speed || 0; s.dmg += q.dmg || 0;
    s.cd *= 1 - (q.cd || 0); s.area += q.area || 0; s.magnet += q.magnet || 0; s.xp += q.xp || 0;
    s.gold += q.gold || 0; s.regen += q.regen || 0;
    // El ataque principal lo da el arma equipada; sin arma, la pistola básica.
    p.startWeapon = g.weapon || 'basico';
    p.startWeaponLvl = g.weapon ? g.weaponLvl : 1;
    p.maxHp = Math.max(1, Math.round(p.maxHp));
    p.hp = p.maxHp;
    return p;
  }

  // `online` (solo el anfitrión): { map, chars, ups, names, vw, vh } acordados en la sala.
  function newGame(online) {
    const map = mapById(online ? online.map : S.map), coop = !!online || S.mode === 'local';
    const chars = online ? online.chars : [S.char, S.char2], ups = online ? online.ups : [S.up, S.up];
    // En cooperativo local el equipo de la cuenta lo lleva J1; en online, cada uno el suyo.
    const gears = online ? online.gears : [myGear(), null];
    const n = coop ? chars.length : 1;
    const players = [];
    for (let i = 0; i < n; i++) players.push(makePlayer(charById(chars[i]), i, coop ? (i - (n - 1) / 2) * 60 : 0, ups[i], gears[i]));
    G = {
      time: 0, spawnAcc: 0, nextElite: 60, nextSwarm: 45, bossIdx: 0, shake: 0, pending: 0,
      boss: null, opts: [], map, gold: 0, coins: 0, bossKills: 0,
      coop, players, p: players[0], cx: 0, cy: 0,
      kills: 0, chooserP: null, lvShown: null,
      // Con más jugadores aparecen bastantes más enemigos (cada uno sube de nivel con lo que recoge),
      // algo más resistentes, y los jefes aguantan más.
      diffHp: 1 + 0.1 * (n - 1), diffRate: 1 + 0.55 * (n - 1), diffBoss: 1 + 0.6 * (n - 1),
      maxEnemies: 380 + 100 * (n - 1),
      online: online ? 'host' : null, localIdx: 0, names: online ? online.names : null,
      remote: {}, views: online ? online.views : {}, slotOf: [], idxOf: {},
      eid: 0, netEvents: [], netT: 0,
      enemies: [], bullets: [], ebullets: [], gems: [], pickups: [], particles: [], texts: [], effects: [],
    };
    for (const p of players) addWeapon(p, p.startWeapon, p.startWeaponLvl);
  }

  const alive = () => G.players.filter(p => !p.down);
  function nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of G.players) {
      if (p.down) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  const hasWeapon = (p, id) => p.weapons.find(w => w.id === id);
  const addWeapon = (p, id, ilvl = 1) => p.weapons.push({ id, lvl: 1, t: 0.3, evolved: false, angle: 0, ilvl });
  function addPassive(p, id) { p.passives[id] = (p.passives[id] || 0) + 1; PASSIVES[id].apply(p); }
  const canEvolve = (p, w) => !w.evolved && w.lvl >= WMAX && !!p.passives[WEAPONS[w.id].evo];
  function heal(p, n) { p.hp = Math.min(p.maxHp, p.hp + n); addText(p.x, p.y - 24, '+' + n, '#6fffb0'); }
  const pname = p => `J${p.idx + 1}`;
  const ptag = p => (G.coop ? pname(p) + ': ' : '');

  // ---------- Entrada ----------
  // Teclado: en solitario WASD y flechas; en cooperativo J1 usa WASD y J2 las flechas.
  // Táctil: en cooperativo, la mitad izquierda de la pantalla es de J1 y la derecha de J2.
  // Mandos: el primero es de J1 y el segundo de J2.
  const keys = {};
  const newJoy = () => ({ active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 });
  const joys = [newJoy(), newJoy()];
  const releaseJoys = () => { for (const j of joys) j.active = false; };
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (state === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) pickIndex(i);
    }
    if ((state === 'over' || state === 'win') && e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) retry();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseJoys(); });
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'play') return;
    // En cooperativo local, cada jugador usa su mitad de la pantalla partida.
    const second = splitSide() ? e.clientX >= W / 2 : e.clientY >= H / 2;
    const j = joys[G.coop && !G.online && second ? 1 : 0];
    if (j.active) return;
    j.active = true; j.id = e.pointerId;
    j.ox = j.x = e.clientX; j.oy = j.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
  });
  canvas.addEventListener('pointermove', e => {
    const j = joys.find(q => q.active && q.id === e.pointerId);
    if (!j) return;
    j.x = e.clientX; j.y = e.clientY;
    // El joystick sigue al dedo si se aleja demasiado.
    const dx = j.x - j.ox, dy = j.y - j.oy, l = Math.hypot(dx, dy);
    if (l > JR * 1.6) { j.ox = j.x - dx / l * JR * 1.6; j.oy = j.y - dy / l * JR * 1.6; }
  });
  const endJoy = e => { for (const j of joys) if (j.id === e.pointerId) j.active = false; };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const getPads = () => Array.from((navigator.getGamepads && navigator.getGamepads()) || []).filter(Boolean);
  const padPrev = [];
  // Start pausa; A/B/X/Y eligen la mejora 1-4.
  function pollPads() {
    getPads().forEach((pad, i) => {
      const now = pad.buttons.map(b => b.pressed), prev = padPrev[i] || [];
      const hit = k => now[k] && !prev[k];
      padPrev[i] = now;
      if (hit(9)) togglePause();
      if (state === 'levelup') {
        for (let k = 0; k < 4; k++) if (hit(k)) { pickIndex(k); break; }
      }
    });
  }

  function inputDir(idx) {
    let dx = 0, dy = 0;
    // En solitario y en online, el jugador de esta pantalla usa todos los controles.
    const solo = !G.coop || !!G.online;
    if (solo || idx === 0) {
      if (keys.KeyW) dy -= 1;
      if (keys.KeyS) dy += 1;
      if (keys.KeyA) dx -= 1;
      if (keys.KeyD) dx += 1;
    }
    if (solo || idx === 1) {
      if (keys.ArrowUp) dy -= 1;
      if (keys.ArrowDown) dy += 1;
      if (keys.ArrowLeft) dx -= 1;
      if (keys.ArrowRight) dx += 1;
    }
    const j = joys[solo ? 0 : idx];
    if (j.active) {
      const jx = j.x - j.ox, jy = j.y - j.oy, l = Math.hypot(jx, jy);
      if (l > 6) { const m = Math.min(l, JR) / JR; dx += jx / l * m; dy += jy / l * m; }
    }
    const pads = getPads(), pad = solo ? pads[0] : pads[idx];
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.2) { dx += ax; dy += ay; }
      const b = k => pad.buttons[k] && pad.buttons[k].pressed;
      if (b(12)) dy -= 1;
      if (b(13)) dy += 1;
      if (b(14)) dx -= 1;
      if (b(15)) dx += 1;
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
  // En online, el anfitrión apunta los efectos (sonidos, textos, partículas, avisos) para enviarlos al invitado.
  function netOut(ev) { if (G && G.online === 'host' && G.netEvents.length < 300) G.netEvents.push(ev); }
  const sfxLast = {};
  function sfx(name, gap = 0.03) {
    Sound.play(name, gap);
    if (G && G.online === 'host') {
      const t = performance.now() / 1000;
      if (t - (sfxLast[name] || 0) >= gap) { sfxLast[name] = t; netOut(['s', name, gap]); }
    }
  }
  function addText(x, y, txt, color) {
    if (G.texts.length < 90) G.texts.push({ x, y, txt, color, life: 0.7 });
    // Como mucho 30 números de daño por instantánea para no saturar la conexión.
    if (G.online === 'host' && (G.netTexts = (G.netTexts || 0) + 1) <= 30) netOut(['t', Math.round(x), Math.round(y), txt, color]);
  }
  function burst(x, y, color, n, speed = 120) {
    netOut(['b', Math.round(x), Math.round(y), color, n, speed]);
    for (let i = 0; i < n && G.particles.length < 400; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, color, size: rand(2, 4) });
    }
  }
  let toastTimer = 0;
  function toast(msg, localOnly) {
    if (!localOnly) netOut(['m', msg]);
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ---------- Combate ----------
  function hurt(e, dmg, kx = 0, ky = 0, kb = 0, quiet = false) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.08;
    if (kb && !e.boss && !e.dashT) { const f = e.heavy ? 0.2 : e.elite ? 0.3 : 1; e.kx += kx * kb * f; e.ky += ky * kb * f; }
    if (!quiet) {
      addText(e.x + rand(-6, 6), e.y - e.r, Math.round(dmg), dmg >= 60 ? '#ffcf4d' : '#ffffff');
      sfx('hit', 0.05);
    }
    if (e.hp <= 0) kill(e);
  }

  function kill(e) {
    e.dead = true;
    G.kills++;
    sfx('kill', 0.04);
    burst(e.x, e.y, e.color, e.boss ? 50 : e.elite ? 20 : 6, e.boss ? 260 : 120);
    dropGem(e.x, e.y, e.xp);
    if (e.elite || e.boss) G.pickups.push({ type: 'cofre', x: e.x, y: e.y, t: 0 });
    else {
      const r = Math.random();
      if (r < 0.010) G.pickups.push({ type: 'carne', x: e.x, y: e.y, t: 0 });
      else if (r < 0.014) G.pickups.push({ type: 'iman', x: e.x, y: e.y, t: 0 });
      else if (r < 0.05) dropCoin(e.x, e.y);
    }
    if (e.boss) {
      // Si quedaba otro jefe vivo, su barra sigue en pantalla.
      if (G.boss === e) G.boss = G.enemies.find(o => o.boss && !o.dead) || null;
      G.shake = 14; G.bossKills++;
      if (e.final) endGame(true);
      else toast(`¡Has derrotado a ${e.name}!`);
    }
  }

  // Limita las monedas en el suelo: si hay demasiadas, suma su valor a una existente.
  function dropCoin(x, y) {
    if (G.coins >= 120) {
      const c = G.pickups.find(k => k.type === 'moneda' && !k.dead);
      if (c) { c.v++; return; }
    }
    G.coins++;
    G.pickups.push({ type: 'moneda', x, y, t: 0, mag: false, sp: 0, v: 1 });
  }

  function dropGem(x, y, v) {
    if (G.gems.length > 320) { pick(G.gems).v += v; return; }
    G.gems.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), v, mag: false, sp: 0 });
  }

  // Cada jugador sube de nivel con la experiencia que recoge él mismo.
  const xpFor = lvl => Math.floor(4 + lvl * 5 + Math.pow(lvl, 1.5));
  function gainXp(v, p) {
    if (p.gone) return;
    p.xp += v * p.stats.xp;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpFor(p.level);
      p.pending++;
    }
  }

  function damagePlayer(p, d) {
    if (p.down || p.inv > 0 || state !== 'play') return;
    const dmg = Math.max(1, d - p.stats.armor);
    p.hp -= dmg; p.inv = 0.5;
    G.shake = Math.max(G.shake, 6);
    addText(p.x, p.y - 26, '-' + Math.round(dmg), '#ff5c6c');
    burst(p.x, p.y, '#ff5c6c', 8);
    sfx('hurt', 0.15);
    if (p.hp > 0) return;
    if (p.revives > 0) {
      p.revives--;
      p.hp = p.maxHp * 0.5; p.inv = 2.5;
      query(p.x, p.y, 260, e => { if (!e.boss) hurt(e, 99999, 0, 0, 0, true); });
      for (const b of G.ebullets) b.dead = true;
      burst(p.x, p.y, '#fff7c2', 60, 320);
      G.shake = 12;
      sfx('revive');
      toast(`🕊️ ${ptag(p)}¡Renaces de tus cenizas!`);
    } else if (G.coop && alive().length > 1) {
      // En cooperativo, el jugador cae y su compañero puede reanimarlo.
      p.hp = 0; p.down = true; p.reviveT = 0;
      burst(p.x, p.y, p.color, 30, 200);
      toast(`💀 ${pname(p)} ha caído. ¡Quédate a su lado para reanimarlo!`);
    } else {
      p.hp = 0; p.down = true;
      endGame(false);
    }
  }

  // ---------- Armas ----------
  // ---------- Armas principales ----------
  // Daño: +25% por nivel en partida y +15% por cada nivel del objeto equipado.
  const mainMul = w => (1 + 0.25 * (w.lvl - 1)) * (1 + 0.15 * ((w.ilvl || 1) - 1));
  const aimAt = (p, t) => t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.face.y, p.face.x);
  const spreadA = (i, n, step) => (i - (n - 1) / 2) * step;
  function shootBala(p, a, o) {
    G.bullets.push({
      kind: 'bala', x: p.x, y: p.y, vx: Math.cos(a) * o.spd, vy: Math.sin(a) * o.spd, r: o.r || 4,
      dmg: o.dmg, life: o.life, pierce: o.pierce || 0, hit: new Set(), color: o.color, kb: o.kb ?? 100, shape: o.shape,
    });
  }
  function explode(b) {
    query(b.x, b.y, b.R, e => {
      const kx = e.x - b.x, ky = e.y - b.y, l = Math.hypot(kx, ky) || 1;
      hurt(e, b.dmg, kx / l, ky / l, 160);
    });
    G.effects.push({ type: 'boom', x: b.x, y: b.y, R: b.R, life: 0.35, max: 0.35 });
    netOut(['x', Math.round(b.x), Math.round(b.y), Math.round(b.R)]);
    G.shake = Math.max(G.shake, 3);
    sfx('boom', 0.05);
  }

  const MAIN_UPDATE = {
    basico(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 480)[0];
      if (!t) { w.t = 0.15; return; }
      w.t = (0.95 - 0.05 * (w.lvl - 1)) * s.cd;
      const n = 1 + (w.lvl >= 3 ? 1 : 0) + (w.lvl >= 5 ? 1 : 0) + s.proj, a = aimAt(p, t);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.12), { spd: 520, dmg: 12 * mainMul(w) * s.dmg, life: 1.0, color: '#ffe9a8' });
      sfx('pew', 0.08);
    },
    revolver(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 520)[0];
      if (!t) { w.t = 0.15; return; }
      w.t = (0.85 - 0.05 * (w.lvl - 1)) * s.cd;
      const n = 1 + (w.lvl >= 4 ? 1 : 0) + s.proj, a = aimAt(p, t);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.1), { spd: 620, r: 5, dmg: 18 * mainMul(w) * s.dmg, life: 1.0, pierce: 1, color: '#ffcf7a', kb: 160 });
      sfx('pew', 0.08);
    },
    escopeta(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 280)[0];
      if (!t) { w.t = 0.12; return; }
      w.t = (1.15 - 0.05 * (w.lvl - 1)) * s.cd;
      const n = 5 + (w.lvl >= 3 ? 1 : 0) + (w.lvl >= 5 ? 1 : 0) + s.proj * 2, a = aimAt(p, t);
      for (let i = 0; i < n; i++) {
        shootBala(p, a + spreadA(i, n, 0.6 / (n - 1)) + rand(-0.04, 0.04),
          { spd: 650 * rand(0.9, 1.1), r: 3.5, dmg: 9 * mainMul(w) * s.dmg, life: 0.34, color: '#ffd27a', kb: 260 });
      }
      G.shake = Math.max(G.shake, 2);
      sfx('shotgun', 0.1);
    },
    subfusil(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 430)[0];
      if (!t) { w.t = 0.1; return; }
      w.t = (0.13 - 0.008 * (w.lvl - 1)) * s.cd;
      const n = 1 + s.proj, a = aimAt(p, t);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.15) + rand(-0.14, 0.14), { spd: 650, r: 3, dmg: 4 * mainMul(w) * s.dmg, life: 0.7, color: '#bfe9ff', kb: 40 });
      sfx('smg', 0.07);
    },
    francotirador(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      // Apunta primero a los enemigos más resistentes (élites y jefes).
      const cand = [];
      for (const e of G.enemies) if (!e.dead && dist2(p.x, p.y, e.x, e.y) < 780 * 780) cand.push(e);
      if (!cand.length) { w.t = 0.15; return; }
      cand.sort((a, b) => b.maxHp - a.maxHp || dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y));
      w.t = (1.9 - 0.1 * (w.lvl - 1)) * s.cd;
      const n = 1 + s.proj;
      for (let i = 0; i < n; i++) {
        const t = cand[i % cand.length];
        shootBala(p, aimAt(p, t), { spd: 1400, r: 5, dmg: 95 * mainMul(w) * s.dmg, life: 0.65, pierce: 99, color: '#9dffef', kb: 220 });
      }
      G.shake = Math.max(G.shake, 3);
      sfx('sniper', 0.1);
    },
    katana(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const R = (95 + (w.lvl >= 3 ? 15 : 0) + (w.lvl >= 5 ? 15 : 0)) * s.area;
      const t = nearest(p.x, p.y, 1, R + 20)[0];
      if (!t) { w.t = 0.1; return; }
      w.t = (0.75 - 0.04 * (w.lvl - 1)) * s.cd;
      const arcs = 1 + s.proj, arc = 2.2, dmg = 18 * mainMul(w) * s.dmg, base = aimAt(p, t);
      for (let k = 0; k < arcs; k++) {
        const a = base + k * TAU / arcs;
        query(p.x, p.y, R, e => {
          let da = Math.atan2(e.y - p.y, e.x - p.x) - a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > arc / 2) return;
          const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
          hurt(e, dmg, kx / l, ky / l, 220);
        });
        G.effects.push({ type: 'slash', x: p.x, y: p.y, a, R, arc, life: 0.22, max: 0.22 });
        netOut(['k', Math.round(p.x), Math.round(p.y), r1(a), Math.round(R), arc]);
      }
      sfx('slash', 0.1);
    },
    lanzacohetes(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const n = 1 + (w.lvl >= 4 ? 1 : 0) + s.proj;
      const targets = nearest(p.x, p.y, n, 650);
      if (!targets.length) { w.t = 0.2; return; }
      w.t = (2.1 - 0.1 * (w.lvl - 1)) * s.cd;
      const R = 70 * s.area * (1 + (w.lvl >= 3 ? 0.2 : 0) + (w.lvl >= 5 ? 0.2 : 0));
      for (let i = 0; i < n; i++) {
        const a = aimAt(p, targets[i % targets.length]) + (i >= targets.length ? rand(-0.3, 0.3) : 0);
        G.bullets.push({ kind: 'cohete', x: p.x, y: p.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 6, dmg: 34 * mainMul(w) * s.dmg, R, life: 2.2 });
      }
      sfx('launch', 0.1);
    },
    espada_pixel(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const R = (85 + (w.lvl >= 3 ? 12 : 0) + (w.lvl >= 5 ? 12 : 0)) * s.area;
      const t = nearest(p.x, p.y, 1, R + 20)[0];
      if (!t) { w.t = 0.1; return; }
      w.t = (0.55 - 0.03 * (w.lvl - 1)) * s.cd;
      const arcs = 1 + s.proj, arc = 1.6, base = aimAt(p, t), dmg = 7.5 * mainMul(w) * s.dmg;
      for (let k = 0; k < arcs; k++) {
        const a = base + k * TAU / arcs;
        query(p.x, p.y, R, e => {
          let da = Math.atan2(e.y - p.y, e.x - p.x) - a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > arc / 2) return;
          const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
          hurt(e, Math.random() < 0.2 ? dmg * 2 : dmg, kx / l, ky / l, 180);  // 20% crítico
        });
        G.effects.push({ type: 'slash', x: p.x, y: p.y, a, R, arc, life: 0.18, max: 0.18, color: '#7fe8ff' });
        netOut(['k', Math.round(p.x), Math.round(p.y), r1(a), Math.round(R), arc, '#7fe8ff']);
      }
      sfx('slash', 0.1);
    },
    shuriken(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 480)[0];
      if (!t) { w.t = 0.15; return; }
      w.t = (0.95 - 0.05 * (w.lvl - 1)) * s.cd;
      const n = 3 + (w.lvl >= 3 ? 1 : 0) + (w.lvl >= 5 ? 1 : 0) + s.proj, a = aimAt(p, t);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.18), { spd: 470, r: 6, dmg: 7 * mainMul(w) * s.dmg, life: 1.1, pierce: 2, color: '#cfd8dc', kb: 80, shape: 'star' });
      sfx('slash', 0.1);
    },
    escudo(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 450)[0];
      if (!t) { w.t = 0.15; return; }
      w.t = (1.3 - 0.06 * (w.lvl - 1)) * s.cd;
      const n = 1 + (w.lvl >= 4 ? 1 : 0) + s.proj, base = aimAt(p, t);
      for (let i = 0; i < n; i++) {
        const a = base + spreadA(i, n, 0.5);
        G.bullets.push({
          kind: 'disco', skin: 'shield', ev: false, owner: p, x: p.x, y: p.y, vx: Math.cos(a), vy: Math.sin(a), spd: 560,
          t: 0, out: 0.55, r: 15 * Math.sqrt(s.area), dmg: 45 * mainMul(w) * s.dmg, hits: new Map(), life: 5, rot: 0,
        });
      }
      sfx('disc', 0.1);
    },
    martillo(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const R = (105 + (w.lvl >= 3 ? 15 : 0) + (w.lvl >= 5 ? 15 : 0)) * s.area;
      if (!nearest(p.x, p.y, 1, R)[0]) { w.t = 0.1; return; }
      w.t = (1.55 - 0.07 * (w.lvl - 1)) * s.cd;
      const dmg = 16 * mainMul(w) * s.dmg;
      for (let k = 0; k <= s.proj; k++) {
        // Con proyectiles extra golpea otra vez un instante después.
        setTimeout(() => {
          if (!G || p.down) return;
          query(p.x, p.y, R, e => {
            const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
            hurt(e, dmg, kx / l, ky / l, 320);
          });
          G.effects.push({ type: 'ring', x: p.x, y: p.y, R, life: 0.4, max: 0.4 });
          netOut(['r', Math.round(p.x), Math.round(p.y), Math.round(R)]);
          G.shake = Math.max(G.shake, 5);
          sfx('boom', 0.05);
        }, k * 180);
      }
    },
    onda_ki(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 650)[0];
      if (!t) { w.t = 0.2; return; }
      w.t = (1.5 - 0.06 * (w.lvl - 1)) * s.cd;
      const n = 1 + s.proj, a = aimAt(p, t), r = (15 + (w.lvl >= 3 ? 4 : 0) + (w.lvl >= 5 ? 4 : 0)) * Math.sqrt(s.area);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.25), { spd: 600, r, dmg: 160 * mainMul(w) * s.dmg, life: 1.4, pierce: 99, color: '#7fdbff', kb: 200, shape: 'ki' });
      G.shake = Math.max(G.shake, 3);
      sfx('sniper', 0.1);
    },
  };

  const W_UPDATE = {
    chispa(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const n = (ev ? 4 : [1, 2, 2, 2, 3][lv - 1]) + s.proj;
      const targets = nearest(p.x, p.y, n, 520);
      if (!targets.length) { w.t = 0.15; return; }
      w.t = (ev ? 0.55 : 1.1 - lv * 0.07) * s.cd;
      const dmg = (10 + 4 * lv) * (ev ? 1.8 : 1) * s.dmg;
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
      sfx('shoot', 0.08);
    },
    orbe(w, dt, p, s) {
      const lv = w.lvl, ev = w.evolved;
      w.n = (ev ? 6 : [1, 2, 3, 3, 4][lv - 1]) + s.proj;
      w.R = (ev ? 100 : 66 + lv * 4 + (lv >= 4 ? 8 : 0)) * s.area;
      w.br = (ev ? 13 : 10) * Math.sqrt(s.area);
      w.angle += (ev ? 4.4 : 3.6) * dt;
      const dmg = (10 + 4 * lv) * (ev ? 2.2 : 1) * s.dmg;
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
      const dmg = (2 + 3 * lv) * (ev ? 3 : 1) * s.dmg;
      query(p.x, p.y, w.R, e => hurt(e, dmg));
    },
    rayo(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const vis = G.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < VW / 2 + 20 && Math.abs(e.y - p.y) < VH / 2 + 20);
      if (!vis.length) { w.t = 0.3; return; }
      w.t = (2.3 - lv * 0.18) * s.cd * (ev ? 0.7 : 1);
      const n = (ev ? 5 : [1, 1, 2, 2, 3][lv - 1]) + s.proj;
      const dmg = (14 + 8 * lv) * (ev ? 1.2 : 1) * s.dmg;
      const R = 38 * s.area * (ev ? 1.5 : 1);
      shuffle(vis);
      for (let i = 0; i < n; i++) {
        const t = vis[i % vis.length], tx = t.x, ty = t.y;
        const seed = Math.random() * 1000 | 0;
        G.effects.push({ type: 'bolt', x: tx, y: ty, R, life: 0.3, max: 0.3, seed, ev });
        netOut(['z', Math.round(tx), Math.round(ty), R, seed, ev ? 1 : 0]);
        query(tx, ty, R, e => hurt(e, dmg));
      }
      G.shake = Math.max(G.shake, 2);
      sfx('zap', 0.1);
    },
    disco(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      // Se lanza hacia el enemigo más cercano.
      const tg = nearest(p.x, p.y, 1, 480)[0];
      if (!tg) { w.t = 0.15; return; }
      w.t = (2.0 - lv * 0.12 - (lv >= 4 ? 0.15 : 0)) * s.cd * (ev ? 0.8 : 1);
      const n = (ev ? 4 : [1, 1, 2, 2, 3][lv - 1]) + s.proj;
      const base = aimAt(p, tg);
      const dmg = (8 + 4 * lv) * (ev ? 1.4 : 1) * s.dmg;
      const r = 12 * s.area * (ev ? 1.5 : 1);
      for (let i = 0; i < n; i++) {
        const a = ev ? base + i / n * TAU : base + (i - (n - 1) / 2) * 0.35;
        G.bullets.push({
          kind: 'disco', ev, owner: p, x: p.x, y: p.y, vx: Math.cos(a), vy: Math.sin(a), spd: ev ? 520 : 440,
          t: 0, out: 0.6, r, dmg, hits: new Map(), life: 5, rot: 0,
        });
      }
      sfx('disc', 0.1);
    },
  };

  // Enemigos en la pantalla de un jugador.
  const visibleTo = p => G.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) < VW / 2 + 20 && Math.abs(e.y - p.y) < VH / 2 + 20);

  Object.assign(W_UPDATE, {
    dagas(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      w.t = (ev ? 0.32 : 0.62 - lv * 0.04) * s.cd;
      const n = (ev ? 5 : [1, 2, 2, 2, 3][lv - 1]) + s.proj;
      const dmg = (7 + 3 * lv) * (ev ? 1.5 : 1) * s.dmg, a = Math.atan2(p.face.y, p.face.x);
      for (let i = 0; i < n; i++) {
        // Las dagas salen en paralelo, separadas unos píxeles, hacia donde mira el jugador.
        const off = spreadA(i, n, 9), ox = -Math.sin(a) * off, oy = Math.cos(a) * off;
        G.bullets.push({
          kind: 'bala', x: p.x + ox, y: p.y + oy, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, r: 4,
          dmg, life: 0.85, pierce: ev ? 2 : lv >= 4 ? 1 : 0, hit: new Set(), color: '#dfe7f0', kb: 60, shape: 'knife',
        });
      }
      sfx('shoot', 0.1);
    },
    latigo(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const R = (95 + 12 * lv) * s.area * (ev ? 1.35 : 1), hh = 26 * Math.sqrt(s.area) * (ev ? 1.3 : 1);
      // Azota hacia el enemigo más cercano a su alcance (y, desde Nv. 3, también en sentido contrario).
      const tg = nearest(p.x, p.y, 1, R + 20)[0];
      if (!tg) { w.t = 0.12; return; }
      w.t = (1.35 - lv * 0.07 - (lv >= 4 ? 0.1 : 0)) * s.cd * (ev ? 0.85 : 1);
      const dmg = (14 + 6 * lv) * (ev ? 1.6 : 1) * s.dmg, a0 = aimAt(p, tg);
      const dirs = ev || lv >= 3 ? [a0, a0 + Math.PI] : [a0];
      let healed = 0;
      for (const a of dirs) {
        const ux = Math.cos(a), uy = Math.sin(a);
        query(p.x + ux * R / 2, p.y + uy * R / 2, R / 2 + hh, e => {
          const rx = e.x - p.x, ry = e.y - p.y, along = rx * ux + ry * uy, across = Math.abs(rx * uy - ry * ux);
          if (along < -e.r || along > R + e.r || across > hh + e.r) return;
          hurt(e, dmg, ux, uy, 140);
          // Evolucionado, cura un poco por cada enemigo azotado.
          if (ev && healed < 5) { healed++; p.hp = Math.min(p.maxHp, p.hp + 1); }
        });
        G.effects.push({ type: 'whip', x: p.x, y: p.y, a, R, h: hh, ev, life: 0.25, max: 0.25 });
        netOut(['w', Math.round(p.x), Math.round(p.y), Math.round(a * 100) / 100, Math.round(R), Math.round(hh), ev ? 1 : 0]);
      }
      sfx('slash', 0.1);
    },
    meteoro(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const vis = visibleTo(p);
      if (!vis.length) { w.t = 0.3; return; }
      w.t = (3.0 - lv * 0.2) * s.cd * (ev ? 0.9 : 1);
      const n = (ev ? 4 : [1, 1, 2, 2, 2][lv - 1]) + s.proj;
      const R = (55 + 5 * lv + (lv >= 4 ? 10 : 0)) * s.area * (ev ? 1.25 : 1);
      const dmg = (20 + 8 * lv) * (ev ? 1.2 : 1) * s.dmg;
      shuffle(vis);
      for (let i = 0; i < n; i++) {
        const t = vis[i % vis.length];
        G.bullets.push({ kind: 'meteoro', x: t.x + rand(-15, 15), y: t.y + rand(-15, 15), vx: 0, vy: 0, r: R, R, dmg, t: 0.6, max: 0.6, life: 9, ev });
      }
    },
    hielo(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      w.t = (3.2 - lv * 0.15 - (lv >= 5 ? 0.3 : 0)) * s.cd * (ev ? 0.8 : 1);
      const R = (85 + 10 * lv + (lv >= 3 ? 10 : 0)) * s.area * (ev ? 1.4 : 1);
      const dmg = (8 + 5 * lv) * (ev ? 2 : 1) * s.dmg, slow = 1.5 + (lv >= 2 ? 1 : 0) + 0.2 * lv;
      query(p.x, p.y, R, e => {
        hurt(e, dmg);
        e.slow = Math.max(e.slow, slow);
        // Evolucionada, congela del todo (los jefes solo se ralentizan).
        if (ev && !e.boss) e.frz = Math.max(e.frz, 1.2);
      });
      G.effects.push({ type: 'ice', x: p.x, y: p.y, R, life: 0.45, max: 0.45 });
      netOut(['i', Math.round(p.x), Math.round(p.y), Math.round(R)]);
      sfx('zap', 0.1);
    },
    veneno(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const ts = nearest(p.x, p.y, 6, 380);
      if (!ts.length) { w.t = 0.3; return; }
      w.t = (2.6 - lv * 0.12) * s.cd * (ev ? 0.8 : 1);
      const n = (ev ? 3 : [1, 1, 1, 2, 2][lv - 1]) + s.proj;
      const R = (38 + 4 * lv + (lv >= 3 ? 8 : 0) + (lv >= 5 ? 6 : 0)) * s.area * (ev ? 1.5 : 1);
      const dmg = (5 + 3 * lv) * (ev ? 1.6 : 1) * s.dmg;
      for (let i = 0; i < n; i++) {
        const t = ts[i % ts.length];
        G.bullets.push({ kind: 'charco', x: t.x + rand(-20, 20), y: t.y + rand(-20, 20), vx: 0, vy: 0, r: R, dmg, life: 3 + (lv >= 3 ? 1 : 0) + (ev ? 1 : 0), tick: 0, ev });
      }
      sfx('disc', 0.15);
    },
  });

  Object.assign(W_UPDATE, MAIN_UPDATE);

  // ---------- Subida de nivel ----------
  function buildOptions(p, count) {
    const o = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) o.push({ k: 'w', id: w.id });
    if (p.weapons.length < SLOTS) for (const id in WEAPONS) if (!WEAPONS[id].main && !hasWeapon(p, id)) o.push({ k: 'nw', id });
    const owned = Object.keys(p.passives);
    for (const id of owned) if (p.passives[id] < PASSIVES[id].max) o.push({ k: 'p', id });
    if (owned.length < SLOTS) for (const id in PASSIVES) if (!p.passives[id]) o.push({ k: 'np', id });
    const r = shuffle(o).slice(0, count);
    if (!r.length) r.push({ k: 'heal' });
    return r;
  }

  function describe(p, o) {
    if (o.k === 'heal') return { icon: '🍖', title: 'Festín', lvl: '', isNew: false, desc: 'Recupera 40 de vida.', hint: '' };
    if (o.k === 'w' || o.k === 'nw') {
      const d = WEAPONS[o.id], w = hasWeapon(p, o.id), nl = w ? w.lvl + 1 : 1, ps = d.evo && PASSIVES[d.evo];
      return {
        icon: d.icon, title: d.name, lvl: w ? `Nv. ${nl}` : '¡Nuevo!', isNew: !w,
        desc: w ? d.up[nl - 2] : d.desc,
        hint: nl === WMAX && ps ? `Evoluciona con ${ps.icon} ${ps.name}` : d.main ? 'Ataque principal' : '',
      };
    }
    const d = PASSIVES[o.id], l = p.passives[o.id] || 0;
    const evoW = Object.keys(WEAPONS).filter(k => WEAPONS[k].evo === o.id);
    return {
      icon: d.icon, title: d.name, lvl: l ? `Nv. ${l + 1}` : '¡Nuevo!', isNew: !l, desc: d.desc,
      hint: evoW.length ? `Objeto clave de ${evoW.map(k => WEAPONS[k].icon + ' ' + WEAPONS[k].name).join(' y ')}` : '',
    };
  }

  function applyOption(p, o) {
    if (o.k === 'heal') heal(p, 40);
    else if (o.k === 'nw') addWeapon(p, o.id);
    else if (o.k === 'w') hasWeapon(p, o.id).lvl++;
    else addPassive(p, o.id);
  }

  // Pinta las tarjetas de mejora (las usan el anfitrión y el invitado).
  function renderChoices(titleHtml, descs, onPick) {
    $('lvTitle').innerHTML = titleHtml;
    const box = $('choices');
    box.innerHTML = '';
    descs.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML =
        `<span class="key">${i + 1}</span><div class="icon">${d.icon}</div>` +
        `<div><div class="title">${d.title}<span class="lvl${d.isNew ? ' new' : ''}">${d.lvl}</span></div>` +
        `<div class="desc">${d.desc}</div>${d.hint ? `<div class="hint">${d.hint}</div>` : ''}</div>`;
      b.addEventListener('click', () => onPick(i));
      box.appendChild(b);
    });
    // Evita elegir sin querer con un toque que venía del juego.
    box.style.pointerEvents = 'none';
    setTimeout(() => { box.style.pointerEvents = ''; }, 250);
    showOnly('levelup');
  }
  function showWaiting(text, color) {
    $('lvTitle').innerHTML = `<span style="color:${color || '#6c62c4'}">${text}</span>`;
    $('choices').innerHTML = '<p class="sub waiting">⏳</p>';
    showOnly('levelup');
  }

  // Al subir de nivel la partida se detiene y cada jugador con mejoras pendientes elige las suyas
  // (en online, todos a la vez, cada uno en su pantalla; en local, por orden en la pantalla compartida).
  function openLevelUp() {
    state = 'levelup';
    releaseJoys();
    sfx('level');
    for (const p of G.players) if (!p.gone && p.pending > 0 && !p.opts) p.opts = buildOptions(p, p.choices);
    showLevelUp();
  }

  function showLevelUp() {
    const choosing = G.players.filter(p => p.opts && !p.gone);
    if (!choosing.length) {
      state = 'play'; showOnly(null); G.lvShown = null;
      if (G.online === 'host') Net.send({ t: 'go' });
      return;
    }
    const lvlTitle = p => `¡${G.coop ? `<span style="color:${PTEXT[p.idx]}">${G.online ? 'Subes' : pname(p) + ' sube'}</span>` : 'Subes'} al nivel ${p.level - p.pending + 1}!`;
    if (G.online === 'host') {
      const who = choosing.map(p => p.idx);
      for (const p of G.players) {
        if (p.idx === G.localIdx || p.gone) continue;
        const slot = G.slotOf[p.idx];
        if (p.opts) {
          if (!p.optsSent) { p.optsSent = true; Net.sendTo(slot, { t: 'lvl', lv: p.level - p.pending + 1, opts: p.opts.map(o => describe(p, o)) }); }
        } else Net.sendTo(slot, { t: 'wait', who });
      }
      const me = G.p;
      if (me.opts) {
        if (G.lvShown !== me.opts) { G.lvShown = me.opts; G.chooserP = me; renderChoices(lvlTitle(me), me.opts.map(o => describe(me, o)), pickIndex); }
      } else {
        G.lvShown = null;
        showWaiting(`Esperando a que ${listNames(choosing.map(p => G.names[p.idx]))} ${choosing.length > 1 ? 'elijan sus mejoras' : 'elija su mejora'}…`, PTEXT[choosing[0].idx]);
      }
      return;
    }
    const p = G.chooserP = choosing[0];
    if (G.lvShown === p.opts) return;
    G.lvShown = p.opts;
    renderChoices(lvlTitle(p) + (G.coop ? ` <span class="sub">(${esc(p.ch.name)})</span>` : ''), p.opts.map(o => describe(p, o)), pickIndex);
  }

  // Elige la mejora i (teclas 1-4, botones del mando o toque), si le toca a esta pantalla.
  function pickIndex(i) {
    if (state !== 'levelup' || !G) return;
    if (G.online === 'guest') { if (G.guestOpts && G.guestOpts[i]) guestChoose(i); return; }
    const p = G.online === 'host' ? G.p : G.chooserP;
    if (p) choose(p, i);
  }

  function choose(p, i) {
    if (state !== 'levelup' || !p || !p.opts || !p.opts[i]) return;
    if (p.idx === G.localIdx || !G.online) Sound.play('click');
    applyOption(p, p.opts[i]);
    p.opts = null; p.optsSent = false;
    p.pending--;
    if (p.pending > 0 && !p.gone) p.opts = buildOptions(p, p.choices);
    showLevelUp();
  }

  function openChest(p) {
    const goldBonus = 10;
    G.gold += goldBonus;
    const ev = p.weapons.find(w => canEvolve(p, w));
    if (ev) {
      ev.evolved = true;
      G.shake = 8;
      burst(p.x, p.y, '#ffd75e', 40, 260);
      sfx('evolve');
      toast(`${ptag(p)}¡EVOLUCIÓN! ${WEAPONS[ev.id].icon} ${WEAPONS[ev.id].evoName}`);
      return;
    }
    sfx('chest');
    const ups = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) ups.push({ k: 'w', id: w.id });
    for (const id in p.passives) if (p.passives[id] < PASSIVES[id].max) ups.push({ k: 'p', id });
    if (ups.length) {
      const o = pick(ups), d = describe(p, o);
      applyOption(p, o);
      toast(`${ptag(p)}Cofre: ${d.icon} ${d.title} ${d.lvl} · +${goldBonus} 🪙`);
    } else {
      heal(p, 50);
      toast(`${ptag(p)}Cofre: +50 de vida · +${goldBonus} 🪙`);
    }
  }

  // ---------- Aparición de enemigos ----------
  // Los enemigos aparecen fuera de la pantalla de un jugador en pie al azar (cada uno ve su zona).
  function spawnAround() { const al = alive(); return al.length ? pick(al) : G.players[0]; }
  function spawnPos(c = spawnAround()) {
    const a = rand(0, TAU), d = Math.hypot(VW, VH) / 2 + rand(40, 120);
    return [c.x + Math.cos(a) * d, c.y + Math.sin(a) * d];
  }

  function spawnEnemy(type, m = {}) {
    const t = ETYPES[type], map = G.map;
    const [x, y] = m.pos || spawnPos();
    // Vida: x4,3 a los 5 min y x10 a los 10 min. Daño: +10% por minuto.
    const mins = G.time / 60;
    const hs = (1 + mins * 0.4 + mins * mins * 0.05) * map.hp * G.diffHp;
    const ds = 1 + mins * 0.1;
    const e = {
      x, y, type, r: t.r * (m.size || 1), hp: t.hp * hs * (m.hp || 1), speed: t.speed * map.speed * (m.speed || 1),
      dmg: t.dmg * ds * (m.dmg || 1), xp: t.xp * (m.xp || 1), color: map.colors[type] || t.color,
      flash: 0, kx: 0, ky: 0, slow: 0, frz: 0, elite: !!m.elite, boss: false, wob: rand(0, TAU),
    };
    if (t.ranged) { e.ranged = t.ranged; e.shotT = rand(1, t.ranged.cd); e.sdmg = t.ranged.dmg * ds; }
    if (t.charge) { e.charge = t.charge; e.shotT = rand(1.5, t.charge.cd); e.mode = 0; }
    if (t.bomb) { e.bomb = t.bomb; e.fuse = -1; e.sdmg = t.bomb.dmg * ds; }
    if (t.summon) { e.summon = t.summon; e.shotT = rand(2, t.summon.cd); }
    if (t.zigzag) e.zig = true;
    if (t.heavy) e.heavy = true;
    e.maxHp = e.hp;
    e.id = ++G.eid;
    G.enemies.push(e);
    return e;
  }

  function spawnBoss(b) {
    const [x, y] = spawnPos();
    const hp = b.hp * G.map.hp * G.diffBoss;
    const e = {
      x, y, type: 'boss', r: b.r, hp, maxHp: hp, speed: b.speed * G.map.speed, dmg: b.dmg, xp: 60, color: b.color,
      flash: 0, kx: 0, ky: 0, slow: 0, frz: 0, boss: true, final: b.final, name: b.name, shots: b.shots,
      ai: b.ai || 'ring', variant: BOSSES.indexOf(b), shotT: 3, sumT: 2, chT: 4, mode: 0, wob: 0, phase: 0,
    };
    e.id = ++G.eid;
    G.enemies.push(e);
    G.boss = e;
    G.shake = 10;
    sfx('boss');
    toast(`⚠ ${b.name} se acerca`);
  }

  function spawner(dt) {
    const t = G.time;
    if (G.bossIdx < BOSSES.length && t >= BOSSES[G.bossIdx].at) spawnBoss(BOSSES[G.bossIdx++]);

    const rate = Math.min(1.2 + t / 22, 30) * (G.boss ? 0.5 : 1) * G.diffRate;
    G.spawnAcc += rate * dt;
    // Sorteo ponderado entre los enemigos que ya han aparecido (ver SPAWNS en data.js).
    const pool = SPAWNS.filter(r => t >= r[1]);
    const total = pool.reduce((a, r) => a + r[2], 0);
    const pickType = () => { let r = Math.random() * total; for (const q of pool) { r -= q[2]; if (r <= 0) return q[0]; } return pool[0][0]; };
    while (G.spawnAcc >= 1) {
      G.spawnAcc--;
      if (G.enemies.length < G.maxEnemies) spawnEnemy(pickType());
    }

    if (t >= G.nextElite) {
      G.nextElite += 60;
      // Con 3 o más jugadores salen dos élites.
      const ne = G.players.length >= 3 ? 2 : 1;
      // Desde el minuto 6, los élites son gólems.
      for (let i = 0; i < ne; i++) {
        if (t >= 360) spawnEnemy('golem', { hp: 4, size: 1.35, xp: 6, elite: true, speed: 1.3, dmg: 1.3 });
        else spawnEnemy('bruto', { hp: 8, size: 1.5, xp: 10, elite: true, speed: 1.15, dmg: 1.5 });
      }
      if (!G.boss) { toast('¡Ha aparecido un enemigo élite!'); sfx('warn'); }
    }
    if (t >= G.nextSwarm) {
      G.nextSwarm += 45;
      // Un enjambre alrededor de cada jugador en pie.
      const n = 16 + Math.floor(t / 30);
      const type = t > 240 ? 'espectro' : 'murcielago';
      const d = Math.hypot(VW, VH) / 2 + 40;
      for (const c of alive()) {
        for (let i = 0; i < n && G.enemies.length < G.maxEnemies; i++) {
          const a = i / n * TAU;
          spawnEnemy(type, { pos: [c.x + Math.cos(a) * d, c.y + Math.sin(a) * d] });
        }
      }
    }
  }

  // ---------- Actualización ----------
  const REVIVE_TIME = 3;
  // Cada jugador tiene su cámara centrada en su personaje (en local, con la pantalla partida),
  // así que pueden separarse libremente.
  function updatePlayers(dt) {
    for (const p of G.players) {
      if (p.gone) continue;
      if (p.down) {
        const helper = G.players.find(q => q !== p && !q.down && dist2(q.x, q.y, p.x, p.y) < 55 * 55);
        if (helper) {
          p.reviveT += dt;
          if (p.reviveT >= REVIVE_TIME) {
            p.down = false; p.reviveT = 0; p.hp = p.maxHp * 0.4; p.inv = 2;
            burst(p.x, p.y, '#b6ffcf', 40, 260);
            sfx('revive');
            toast(`💚 ${pname(helper)} ha reanimado a ${pname(p)}`);
          }
        } else p.reviveT = Math.max(0, p.reviveT - dt * 0.5);
        continue;
      }
      if (G.online === 'host' && p.idx !== G.localIdx) {
        // El invitado mueve a su personaje en su propia pantalla y nos envía la posición.
        const r = G.remote[p.idx];
        if (r) { p.x = r.x; p.y = r.y; p.face = { x: r.fx, y: r.fy }; p.side = r.side; p.walk = r.walk; }
        p.inv -= dt; p.slowT = (p.slowT || 0) - dt;
        if (p.stats.regen) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
        continue;
      }
      const { dx, dy } = inputDir(p.idx);
      // Las telarañas de la Reina Araña ralentizan un rato.
      const sp = 170 * p.stats.speed * (p.slowT > 0 ? 0.55 : 1);
      p.x += dx * sp * dt; p.y += dy * sp * dt;
      if (dx || dy) {
        const l = Math.hypot(dx, dy);
        p.face = { x: dx / l, y: dy / l };
        if (Math.abs(dx) > 0.1) p.side = Math.sign(dx);
        p.walk += dt * 10;
      }
      p.inv -= dt; p.slowT = (p.slowT || 0) - dt;
      if (p.stats.regen) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
    }
    // Punto de referencia (para la mirada de los enemigos): el jugador de esta pantalla.
    G.cx = G.p.x; G.cy = G.p.y;
  }

  function updateEnemies(dt) {
    const far = Math.hypot(VW, VH) * 0.9 + 200;
    const damp = Math.min(1, dt * 10);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const tg = nearestPlayer(e.x, e.y) || G.players[0];
      const dx = tg.x - e.x, dy = tg.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (!e.boss && !e.elite && d > far) {
        // Reubica enemigos que quedaron muy lejos de todos los jugadores delante de uno de ellos.
        const c = spawnAround(), a = Math.atan2(c.y - e.y, c.x - e.x), nd = Math.hypot(VW, VH) / 2 + 60;
        e.x = c.x + Math.cos(a) * nd; e.y = c.y + Math.sin(a) * nd;
        continue;
      }
      let sp = e.speed * (e.frz > 0 ? 0 : e.slow > 0 ? 0.5 : 1);
      e.slow -= dt; e.frz -= dt; e.flash -= dt; e.wob += dt * 6;
      let mx = dx / d, my = dy / d;
      if (e.zig) {
        // Zigzag: el rumbo oscila a los lados.
        const z = Math.sin(e.wob * 0.7) * 0.9, c = Math.cos(z), sn = Math.sin(z);
        [mx, my] = [mx * c - my * sn, mx * sn + my * c];
      }
      if (e.charge) {
        // Embestida: 0 = persigue, 1 = se prepara (brilla), 2 = embiste en línea recta.
        const C = e.charge;
        e.shotT -= dt;
        if (e.mode === 0 && e.shotT <= 0 && d < C.range && e.frz <= 0) { e.mode = 1; e.modeT = C.wind; e.ca = Math.atan2(dy, dx); }
        if (e.mode === 1) {
          sp = 0; e.modeT -= dt;
          if (e.modeT <= 0) { e.mode = 2; e.modeT = C.time; e.dashT = 1; }
        } else if (e.mode === 2) {
          sp = e.frz > 0 ? 0 : C.speed; mx = Math.cos(e.ca); my = Math.sin(e.ca); e.modeT -= dt;
          if (e.modeT <= 0) { e.mode = 0; e.dashT = 0; e.shotT = C.cd * rand(0.85, 1.15); }
        }
      }
      if (e.bomb) {
        // Bomba: al llegar a tu lado enciende la mecha; explota aunque te alejes.
        const B = e.bomb;
        if (e.fuse < 0 && d < B.range + tg.r) { e.fuse = B.fuse; sfx('warn', 0.3); }
        if (e.fuse >= 0) {
          sp *= 0.35; e.fuse -= dt;
          if (e.fuse <= 0) { bombBlast(e); continue; }
        }
      }
      if (e.summon) {
        const S_ = e.summon;
        if (d < S_.range * 0.6) sp = -sp * 0.6; else if (d < S_.range * 0.9) sp = 0;
        e.shotT -= dt;
        if (e.shotT <= 0 && d < S_.range + 120) { e.shotT = S_.cd * rand(0.85, 1.15); summonAround(e, S_.type, S_.n); }
      }
      if (e.ranged) {
        // Los tiradores mantienen la distancia: se acercan hasta su alcance y retroceden si te pegas.
        const R = e.ranged.range;
        if (d < R * 0.6) sp = -sp * 0.6; else if (d < R * 0.85) sp = 0;
        e.shotT -= dt;
        if (e.shotT <= 0 && d < R + 60 && e.frz <= 0) {
          e.shotT = e.ranged.cd * rand(0.85, 1.15);
          enemyShoot(e, Math.atan2(dy, dx));
        }
      }
      e.x += (mx * sp + e.kx) * dt;
      e.y += (my * sp + e.ky) * dt;
      e.kx -= e.kx * damp; e.ky -= e.ky * damp;

      if (!e.boss) {
        query(e.x, e.y, e.r, o => {
          if (o === e) return;
          const sx = e.x - o.x, sy = e.y - o.y, sd = Math.hypot(sx, sy) || 0.01;
          const ov = e.r + o.r - sd;
          if (ov > 0) { const push = (o.boss ? ov : ov * 0.5) * 0.5; e.x += sx / sd * push; e.y += sy / sd * push; }
        });
      }
      for (const p of G.players) {
        if (!p.down && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) ** 2) damagePlayer(p, e.dmg);
      }
      if (e.boss) bossAI(e, dt, tg, dx / d, dy / d, d);
    }
  }

  function bombBlast(e) {
    const R = e.bomb.R;
    for (const p of G.players) if (!p.down && dist2(e.x, e.y, p.x, p.y) < (R + p.r) ** 2) damagePlayer(p, e.sdmg);
    G.effects.push({ type: 'boom', x: e.x, y: e.y, R, life: 0.35, max: 0.35 });
    netOut(['x', Math.round(e.x), Math.round(e.y), R]);
    G.shake = Math.max(G.shake, 5);
    sfx('boom', 0.05);
    // Se destruye sin dar experiencia ni botín.
    e.dead = true;
    burst(e.x, e.y, e.color, 14, 200);
  }

  function summonAround(e, type, n) {
    for (let i = 0; i < n && G.enemies.length < G.maxEnemies; i++) {
      const a = rand(0, TAU);
      const m = spawnEnemy(type, { pos: [e.x + Math.cos(a) * (e.r + 14), e.y + Math.sin(a) * (e.r + 14)] });
      m.xp = 0.5;
    }
    burst(e.x, e.y, '#5fe0c0', 10, 140);
    sfx('warn', 0.3);
  }

  function enemyShoot(e, a) {
    const r = e.ranged, n = r.n;
    if (G.ebullets.length > 260) return;
    for (let i = 0; i < n; i++) {
      const ang = a + spreadA(i, n, r.spread);
      G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * r.spd, vy: Math.sin(ang) * r.spd, r: 5, dmg: e.sdmg * (e.elite ? 1.5 : 1), life: 3, color: r.color });
    }
    e.flash = 0.06;
    sfx('pew', 0.12);
  }

  function bossRing(e, n, spd, dmg, color, extra) {
    e.phase += 0.3;
    for (let i = 0; i < n && G.ebullets.length < 300; i++) {
      const a = i / n * TAU + e.phase;
      G.ebullets.push(Object.assign({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7, dmg, life: 5, color }, extra));
    }
  }
  function bossFan(e, a, n, step, spd, dmg, color, r = 8) {
    for (let i = 0; i < n && G.ebullets.length < 300; i++) {
      const ang = a + spreadA(i, n, step);
      G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, dmg, life: 4, color });
    }
  }

  function bossAI(e, dt, tg, ux, uy) {
    const aim = Math.atan2(uy, ux);
    e.shotT -= dt;
    if (e.ai === 'summon') {
      // Reina Araña: crías cada pocos segundos y anillos de telaraña que ralentizan.
      e.sumT -= dt;
      if (e.sumT <= 0) { e.sumT = 5; summonAround(e, 'arana', 2 + G.players.length); }
      if (e.shotT <= 0) { e.shotT = 2.8; bossRing(e, e.shots, 150, 10, '#e8eaf5', { web: 1, r: 8 }); }
      return;
    }
    if (e.ai === 'charge') {
      // Dragón de Hueso: se prepara (brilla), embiste y escupe fuego en abanico al acabar.
      e.chT -= dt;
      if (e.mode === 0 && e.chT <= 0) { e.mode = 1; e.modeT = 0.9; e.ca = aim; e.saveSpeed = e.saveSpeed || e.speed; e.speed = 0; }
      else if (e.mode === 1) {
        e.modeT -= dt;
        if (e.modeT <= 0) { e.mode = 2; e.modeT = 0.75; }
      } else if (e.mode === 2) {
        const sp = e.frz > 0 ? 0 : 520;
        // Contrarresta el movimiento normal (velocidad 0) y avanza recto.
        e.x += Math.cos(e.ca) * sp * dt; e.y += Math.sin(e.ca) * sp * dt;
        e.modeT -= dt;
        if (e.modeT <= 0) {
          e.mode = 0; e.chT = 4.5; e.speed = e.saveSpeed;
          bossFan(e, aim, e.shots, 0.16, 210, 16, '#ffb347', 9);
          G.shake = Math.max(G.shake, 6); sfx('boom', 0.1);
        }
      }
      if (e.mode === 0 && e.shotT <= 0) { e.shotT = 3.2; bossRing(e, 10, 150, 13, e.color); }
      return;
    }
    if (e.shotT > 0) return;
    e.shotT = e.final ? 1.8 : 2.6;
    bossRing(e, e.shots, 160, e.final ? 18 : 12, e.color);
    if (e.ai === 'king') bossFan(e, aim, 3, 0.15, 230, 22, '#ffd75e');
  }

  function updateBullets(dt) {
    for (const b of G.bullets) {
      b.life -= dt;
      if (b.life <= 0) { if (b.kind === 'cohete') explode(b); b.dead = true; continue; }
      if (b.kind === 'meteoro') {
        b.t -= dt;
        if (b.t <= 0) { b.dead = true; explode(b); }
        continue;
      }
      if (b.kind === 'charco') {
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick = 0.5;
          // Los charcos no se acumulan: cada enemigo recibe veneno como mucho cada 0,45 s.
          query(b.x, b.y, b.r, e => {
            if (G.time - (e.poisT || -9) < 0.45) return;
            e.poisT = G.time;
            hurt(e, b.dmg, 0, 0, 0, true); e.flash = 0.08; if (b.ev) e.slow = Math.max(e.slow, 0.6);
          });
        }
        continue;
      }
      if (b.kind === 'bala') {
        b.x += b.vx * dt; b.y += b.vy * dt;
        query(b.x, b.y, b.r, e => {
          if (b.dead || b.hit.has(e)) return;
          b.hit.add(e);
          const l = Math.hypot(b.vx, b.vy) || 1;
          hurt(e, b.dmg, b.vx / l, b.vy / l, b.kb);
          if (--b.pierce < 0) b.dead = true;
        });
      } else if (b.kind === 'cohete') {
        b.x += b.vx * dt; b.y += b.vy * dt;
        query(b.x, b.y, b.r, () => { if (!b.dead) { b.dead = true; explode(b); } });
      } else if (b.kind === 'chispa') {
        b.x += b.vx * dt; b.y += b.vy * dt;
        query(b.x, b.y, b.r, e => {
          if (b.dead || b.hit.has(e)) return;
          b.hit.add(e);
          const l = Math.hypot(b.vx, b.vy);
          hurt(e, b.dmg, b.vx / l, b.vy / l, 120);
          if (--b.pierce < 0) b.dead = true;
        });
      } else if (b.kind === 'disco') {
        const p = b.owner;
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
    for (const b of G.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      for (const p of G.players) {
        if (!p.down && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) {
          if (b.web && p.inv <= 0) p.slowT = 1.6;
          damagePlayer(p, b.dmg); b.dead = true; break;
        }
      }
    }
  }

  // Atrae un objeto hacia el jugador en pie más cercano (según su radio de recogida).
  function attract(g, dt) {
    const p = nearestPlayer(g.x, g.y);
    if (!p) return;
    const mr = 80 * p.stats.magnet;
    if (!g.mag && dist2(g.x, g.y, p.x, p.y) < mr * mr) g.mag = true;
    if (!g.mag) return;
    const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
    g.sp += 1100 * dt;
    const step = Math.min(d, (180 + g.sp) * dt);
    g.x += dx / d * step; g.y += dy / d * step;
  }
  const touching = (k, reach) => G.players.find(p => !p.down && dist2(k.x, k.y, p.x, p.y) < (p.r + reach) ** 2);

  function updateGems(dt) {
    for (const g of G.gems) {
      attract(g, dt);
      const p = touching(g, 6);
      if (p) { g.dead = true; gainXp(g.v, p); sfx('gem', 0.035); }
    }
  }

  function updatePickups(dt) {
    for (const k of G.pickups) {
      k.t += dt;
      if (k.type === 'moneda') attract(k, dt);
      const p = touching(k, 16);
      if (!p) continue;
      k.dead = true;
      if (k.type === 'carne') { heal(p, 30); sfx('coin'); }
      else if (k.type === 'iman') {
        for (const g of G.gems) g.mag = true;
        for (const c of G.pickups) if (c.type === 'moneda') c.mag = true;
        sfx('chest');
        toast('🧲 ¡Todos los cristales vienen a ti!');
      } else if (k.type === 'cofre') openChest(p);
      else if (k.type === 'moneda') { G.gold += k.v; G.coins--; sfx('coin', 0.05); }
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
    updatePlayers(dt);
    spawner(dt);
    updateEnemies(dt);
    buildGrid();
    for (const p of G.players) {
      if (!p.down) for (const w of p.weapons) W_UPDATE[w.id](w, dt, p, p.stats);
    }
    updateBullets(dt);
    updateEBullets(dt);
    updateGems(dt);
    updatePickups(dt);
    updateFx(dt);
    for (const a of [G.enemies, G.bullets, G.ebullets, G.gems, G.pickups, G.particles, G.texts, G.effects]) compact(a);
    G.shake = Math.max(0, G.shake - dt * 30);
    Sound.setMode(G.boss ? 'boss' : 'calm');
    if (state === 'play' && G.players.some(p => p.pending > 0 && !p.gone)) openLevelUp();
  }

  // ---------- Dibujo ----------
  // camX/camY: esquina de la cámara que se está dibujando; CVW/CVH: tamaño de esa vista en el mundo.
  let camX = 0, camY = 0, CVW = 0, CVH = 0;
  const inView = (x, y, m) => x > camX - m && x < camX + CVW + m && y > camY - m && y < camY + CVH + m;

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
      // Mundo de Minecraft (de noche): cubos apagados y mineral que brilla un poco
      case 'block':
        ctx.fillStyle = 'rgba(93,64,55,.35)'; ctx.fillRect(x - 10, y - 10, 20, 20);
        ctx.fillStyle = 'rgba(120,85,72,.3)'; ctx.fillRect(x - 10, y - 10, 10, 10); ctx.fillRect(x, y, 10, 10);
        break;
      case 'grassblock':
        ctx.fillStyle = 'rgba(93,64,55,.35)'; ctx.fillRect(x - 10, y - 10, 20, 20);
        ctx.fillStyle = 'rgba(76,175,80,.35)'; ctx.fillRect(x - 10, y - 10, 20, 6);
        ctx.fillRect(x - 6, y - 4, 3, 3); ctx.fillRect(x + 3, y - 4, 3, 4);
        break;
      case 'ore':
        ctx.fillStyle = 'rgba(97,97,110,.35)'; ctx.fillRect(x - 10, y - 10, 20, 20);
        ctx.shadowColor = '#4dd0e1'; ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(77,208,225,.7)'; ctx.fillRect(x - 6, y - 5, 3, 3); ctx.fillRect(x + 2, y + 1, 3, 3); ctx.fillRect(x - 3, y + 4, 3, 3);
        ctx.shadowBlur = 0;
        break;
      // Aldea de Konoha (de noche)
      case 'leaf':
        ctx.fillStyle = 'rgba(102,187,106,.22)';
        ctx.beginPath(); ctx.ellipse(x, y, 9, 4, 0.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(102,187,106,.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 7, y - 5); ctx.lineTo(x + 7, y + 5); ctx.stroke();
        break;
      case 'kunai':
        ctx.save(); ctx.translate(x, y); ctx.rotate(0.8); ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(4, -2); ctx.lineTo(-4, -2); ctx.fill();
        ctx.fillStyle = '#455a64'; ctx.fillRect(-1.5, -2, 3, 9);
        ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 9, 2.5, 0, TAU); ctx.stroke();
        ctx.restore();
        break;
      case 'spiral':
        ctx.strokeStyle = 'rgba(255,160,90,.22)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 30; i++) { const a = i * 0.45, rr2 = 1 + i * 0.4; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
        ctx.stroke();
        break;
      // Reino Champiñón (de noche): siluetas suaves y un leve brillo en los bloques "?"
      case 'pipe':
        ctx.fillStyle = 'rgba(46,125,50,.35)'; ctx.fillRect(x - 9, y - 12, 18, 18);
        ctx.fillStyle = 'rgba(67,160,71,.4)'; ctx.fillRect(x - 12, y - 18, 24, 7);
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x - 6, y - 12, 3, 18);
        break;
      case 'mushroom':
        ctx.fillStyle = 'rgba(245,230,200,.35)'; ctx.fillRect(x - 3, y - 4, 6, 8);
        ctx.fillStyle = 'rgba(255,122,154,.45)'; ctx.beginPath(); ctx.arc(x, y - 4, 8, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(x - 3, y - 8, 1.8, 0, TAU); ctx.arc(x + 4, y - 6, 1.5, 0, TAU); ctx.fill();
        break;
      case 'qblock':
        ctx.shadowColor = '#ffc23d'; ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255,194,61,.28)'; ctx.fillRect(x - 9, y - 9, 18, 18);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,194,61,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 9, y - 9, 18, 18);
        ctx.fillStyle = 'rgba(255,226,150,.65)'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y + 1);
        break;
      // Grieta del Invocador
      case 'rune':
        ctx.strokeStyle = 'rgba(38,198,218,.3)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.stroke();
        break;
      case 'brush':
        ctx.fillStyle = 'rgba(56,142,60,.25)';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x - 8 + i * 4, y, 2.5, 8, (i - 2) * 0.2, 0, TAU); ctx.fill(); }
        break;
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
    for (let x = Math.floor(camX / S_) * S_; x < camX + CVW; x += S_) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + CVH); }
    for (let y = Math.floor(camY / S_) * S_; y < camY + CVH; y += S_) { ctx.moveTo(camX, y); ctx.lineTo(camX + CVW, y); }
    ctx.stroke();
    const T = 150;
    for (let tx = Math.floor(camX / T) - 1; tx <= Math.floor((camX + CVW) / T) + 1; tx++) {
      for (let ty = Math.floor(camY / T) - 1; ty <= Math.floor((camY + CVH) / T) + 1; ty++) {
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

  // Está avisando de un ataque (lobo o dragón preparando la embestida, calabaza con la mecha encendida).
  const isWarn = e => e.mode === 1 || (e.bomb && e.fuse >= 0);
  function drawEnemy(e) {
    if (G.online !== 'guest') e.warn = isWarn(e);
    shadow(e.x, e.y, e.r);
    const c = e.flash > 0 ? '#ffffff' : e.color;
    const r = e.r;
    const look = e.x > camX + CVW / 2 ? -r * 0.25 : r * 0.25;
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
      case 'escupidor': {
        // Planta carnívora con un tubo que apunta al jugador más cercano.
        const tg = nearestPlayer(e.x, e.y) || G.p, a = Math.atan2(tg.y - e.y, tg.x - e.x);
        ctx.save(); ctx.rotate(a);
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#5a7a2a';
        rr(r * 0.3, -r * 0.32, r * 1.05, r * 0.64, r * 0.2); ctx.fill();
        ctx.fillStyle = '#1b2410'; ctx.beginPath(); ctx.arc(r * 1.35, 0, r * 0.26, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.fillStyle = c;
        const sq = Math.sin(e.wob) * 0.06;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + sq), r * (1 - sq), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.4 + i * r * 0.4, r * 0.45, r * 0.13, 0, TAU); ctx.fill(); }
        eyes(look * 0.6, -r * 0.2, r * 0.22, '#fff36b');
        break;
      }
      case 'brujo': {
        // Hechicero encapuchado con un orbe brillante.
        ctx.beginPath();
        ctx.moveTo(-r, r); ctx.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r * 1.7 + Math.sin(e.wob) * 2); ctx.quadraticCurveTo(r * 0.9, -r * 0.2, r, r);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(10,6,25,.75)';
        ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.5, r * 0.42, 0, 0, TAU); ctx.fill();
        eyes(look * 0.4, -r * 0.18, r * 0.15, '#ff9df5');
        const ox = (look > 0 ? 1 : -1) * r * 1.05, oy = -r * 0.1 + Math.sin(e.wob * 1.3) * 2;
        ctx.shadowColor = '#e3a6ff'; ctx.shadowBlur = 12;
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#f2d2ff';
        ctx.beginPath(); ctx.arc(ox, oy, r * 0.32, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'arana': {
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const k = Math.sin(e.wob * 2 + i) * 0.25;
          for (const sd of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(sd * r * 1.3, -r * 0.6 + i * r * 0.45 + k * r, sd * r * 1.8, -r * 0.2 + i * r * 0.5 + k * r);
            ctx.stroke();
          }
        }
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#3a3550';
        ctx.beginPath(); ctx.ellipse(0, r * 0.25, r * 0.85, r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -r * 0.45, r * 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff4d6a';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-r * 0.3 + i * r * 0.2, -r * 0.5, r * 0.08, 0, TAU); ctx.fill(); }
        break;
      }
      case 'lobo': {
        if (e.warn) { ctx.shadowColor = '#ff4d4d'; ctx.shadowBlur = 16; }
        const sd = look > 0 ? 1 : -1;
        ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 1.15, r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(sd * r * 0.85, -r * 0.35, r * 0.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sd * r * 0.55, -r * 0.8); ctx.lineTo(sd * r * 0.7, -r * 1.35); ctx.lineTo(sd * r * 0.95, -r * 0.85); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sd * r * 1.0, -r * 0.8); ctx.lineTo(sd * r * 1.2, -r * 1.3); ctx.lineTo(sd * r * 1.35, -r * 0.6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-sd * r * 1.0, 0); ctx.lineTo(-sd * r * 1.7, -r * 0.5 + Math.sin(e.wob) * 3); ctx.lineTo(-sd * r * 1.05, r * 0.3); ctx.fill();
        ctx.shadowBlur = 0;
        eyes(sd * r * 0.95, -r * 0.4, r * 0.13, e.warn ? '#ff4d4d' : '#ffe14d');
        break;
      }
      case 'calabaza': {
        const blink = e.warn && Math.floor(G.time * 12) % 2 === 0;
        ctx.fillStyle = blink ? '#fff4c2' : c;
        for (const k of [-0.45, 0.45, 0]) { ctx.beginPath(); ctx.ellipse(k * r, r * 0.05, r * (k ? 0.65 : 0.7), r * 0.85, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#3f7a2a'; ctx.fillRect(-r * 0.1, -r * 1.15, r * 0.2, r * 0.4);
        ctx.fillStyle = e.warn ? '#fff36b' : '#3a1a05';
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.2); ctx.lineTo(-r * 0.25, -r * 0.45); ctx.lineTo(-r * 0.05, -r * 0.2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.2); ctx.lineTo(r * 0.25, -r * 0.45); ctx.lineTo(r * 0.05, -r * 0.2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.2); for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.5 + i * r / 6, r * (i % 2 ? 0.45 : 0.25)); ctx.lineTo(r * 0.5, r * 0.55); ctx.lineTo(-r * 0.5, r * 0.55); ctx.fill();
        if (e.warn) {
          ctx.strokeStyle = 'rgba(255,90,60,.6)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.arc(0, 0, ETYPES.calabaza.bomb.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        break;
      }
      case 'golem': {
        ctx.fillStyle = e.flash > 0 ? '#fff' : c;
        ctx.beginPath(); ctx.moveTo(-r, r); ctx.lineTo(-r * 1.05, -r * 0.3); ctx.lineTo(-r * 0.6, -r); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r * 1.05, -r * 0.3); ctx.lineTo(r, r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.beginPath(); ctx.arc(-r * 1.15, r * 0.2, r * 0.38, 0, TAU); ctx.arc(r * 1.15, r * 0.2, r * 0.38, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.9); ctx.lineTo(-r * 0.1, -r * 0.3); ctx.lineTo(-r * 0.4, r * 0.4); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 0.2, r * 0.7); ctx.stroke();
        ctx.fillStyle = '#7fffd4'; ctx.fillRect(-r * 0.55 + look * 0.4, -r * 0.5, r * 0.35, r * 0.16); ctx.fillRect(r * 0.2 + look * 0.4, -r * 0.5, r * 0.35, r * 0.16);
        break;
      }
      case 'invocador': {
        ctx.beginPath(); ctx.moveTo(-r * 0.95, r); ctx.lineTo(-r * 0.6, -r * 0.6); ctx.lineTo(0, -r * 1.2); ctx.lineTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 0.95, r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(5,20,20,.8)'; ctx.beginPath(); ctx.ellipse(0, -r * 0.25, r * 0.45, r * 0.4, 0, 0, TAU); ctx.fill();
        eyes(look * 0.4, -r * 0.3, r * 0.14, '#7fffe0');
        // Runas que giran a su alrededor.
        ctx.fillStyle = '#7fffe0';
        for (let i = 0; i < 3; i++) { const a = e.wob * 0.5 + i / 3 * TAU; ctx.fillRect(Math.cos(a) * r * 1.5 - 2, Math.sin(a) * r * 1.5 - 2, 4, 4); }
        break;
      }
      case 'boss': {
        if (e.variant === 0) { drawQueen(e, c, r, look); break; }
        if (e.variant === 2) { drawDragon(e, c, r, look); break; }
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
    if (e.frz > 0) {
      ctx.fillStyle = 'rgba(170,230,255,.45)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, TAU); ctx.fill();
    }
    if (e.elite) {
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#300'; ctx.fillRect(-r, -r - 16, r * 2, 5);
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(-r, -r - 16, r * 2 * Math.max(0, e.hp / e.maxHp), 5);
    }
    ctx.restore();
  }

  // Jefes con aspecto propio.
  function drawQueen(e, c, r, look) {
    ctx.strokeStyle = c; ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const k = Math.sin(e.wob + i) * 0.2;
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(sd * r * 1.5, -r * 0.9 + i * r * 0.5 + k * r, sd * r * 2.1, -r * 0.1 + i * r * 0.55 + k * r);
        ctx.stroke();
      }
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#2c2640';
    ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 1.0, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ff4d6a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, r * 0.05); ctx.lineTo(-r * 0.3, r * 0.4); ctx.lineTo(0, r * 0.75); ctx.lineTo(r * 0.3, r * 0.4); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = e.flash > 0 ? '#fff' : c;
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff4d6a';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-r * 0.35 + i * r * 0.14 + look * 0.3, -r * 0.6 + (i % 2) * r * 0.12, r * 0.07, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.95); ctx.lineTo(-r * 0.3, -r * 1.3); ctx.lineTo(-r * 0.1, -r * 1.05); ctx.lineTo(0, -r * 1.4); ctx.lineTo(r * 0.1, -r * 1.05); ctx.lineTo(r * 0.3, -r * 1.3); ctx.lineTo(r * 0.4, -r * 0.95); ctx.closePath(); ctx.fill();
  }
  function drawDragon(e, c, r, look) {
    const flap = Math.sin(e.wob * 0.8) * 0.3, sd = look > 0 ? 1 : -1;
    if (e.warn) {
      // Aviso de embestida: línea roja hacia donde va a cargar.
      ctx.strokeStyle = 'rgba(255,60,60,.55)'; ctx.lineWidth = r * 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(e.ca || 0) * 390, Math.sin(e.ca || 0) * 390); ctx.stroke(); ctx.lineCap = 'butt';
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : 'rgba(60,40,30,.85)';
    for (const w of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(w * r * 0.4, -r * 0.2);
      ctx.lineTo(w * r * 2.2, -r * (1.2 + flap)); ctx.lineTo(w * r * 1.9, -r * 0.1); ctx.lineTo(w * r * 2.1, r * 0.6); ctx.lineTo(w * r * 0.6, r * 0.4);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#e8dcc4';
    ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 0.85, r * 0.95, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,30,.6)'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.6, r * (0.1 + i * 0.3)); ctx.lineTo(r * 0.6, r * (0.1 + i * 0.3)); ctx.stroke(); }
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#f2e8d2';
    ctx.beginPath(); ctx.ellipse(sd * r * 0.2, -r * 0.75, r * 0.6, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath(); ctx.moveTo(-r * 0.35, -r * 1.0); ctx.lineTo(-r * 0.7, -r * 1.65); ctx.lineTo(-r * 0.1, -r * 1.15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 1.0); ctx.lineTo(r * 0.7, -r * 1.65); ctx.lineTo(r * 0.1, -r * 1.15); ctx.fill();
    eyes(sd * r * 0.2, -r * 0.8, r * 0.15, e.warn ? '#ff3d3d' : c);
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
    // Los personajes altos crecen hacia arriba: los pies se quedan en el mismo sitio.
    const ry = r * (ch.tall || 1), lift = ry - r;
    ctx.beginPath(); ctx.ellipse(x, y + bob - lift, r * (ch.wide || 1), ry, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    // accesorio (cy es el centro de la "cabeza")
    const cy = y + bob - lift * 2;
    ctx.fillStyle = ch.hood;
    switch (ch.acc) {
      case 'hood':
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); break;
      case 'helm':
        ctx.beginPath(); ctx.arc(x, cy - 1, r + 1.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#c9d1e0'; ctx.fillRect(x - 1.5, cy - r - 6, 3, 7); break;
      case 'band': {
        // La cola de la cinta va hacia atrás según el último lado al que se miró.
        const sd = face.side || (face.x >= 0 ? 1 : -1);
        ctx.fillRect(x - r, cy - r * 0.55, r * 2, r * 0.3);
        ctx.beginPath(); ctx.moveTo(x - sd * r, cy - r * 0.45); ctx.lineTo(x - sd * (r + 9), cy - r * 0.1); ctx.lineTo(x - sd * (r + 7), cy - r * 0.7); ctx.fill(); break;
      }
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
      case 'bucket': {
        // Un cubo puesto del revés, algo torcido.
        ctx.save(); ctx.translate(x, cy - r * 0.55); ctx.rotate(-0.18);
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, r * 0.15); ctx.lineTo(-r * 0.7, -r * 0.85); ctx.lineTo(r * 0.7, -r * 0.85); ctx.lineTo(r * 0.95, r * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6b737c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.2); ctx.lineTo(r * 0.85, -r * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -r * 0.85, r * 0.5, Math.PI, 0); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'viking': {
        const w = r * (ch.wide || 1);
        ctx.beginPath(); ctx.ellipse(x, cy - 2, w + 1.5, r + 1, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(x - w - 1.5, cy - 3, (w + 1.5) * 2, 3);
        ctx.fillStyle = '#f2e6c9';
        ctx.beginPath(); ctx.moveTo(x - w * 0.8, cy - r * 0.6); ctx.quadraticCurveTo(x - w * 1.5, cy - r * 1.1, x - w * 1.25, cy - r * 1.7); ctx.lineTo(x - w * 0.5, cy - r * 0.85); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + w * 0.8, cy - r * 0.6); ctx.quadraticCurveTo(x + w * 1.5, cy - r * 1.1, x + w * 1.25, cy - r * 1.7); ctx.lineTo(x + w * 0.5, cy - r * 0.85); ctx.fill();
        break;
      }
      case 'tophat': {
        // Chistera alta para parecer aún más alto.
        const w = r * (ch.wide || 1);
        ctx.fillRect(x - w * 1.25, cy - r * 0.95, w * 2.5, r * 0.22);
        ctx.fillRect(x - w * 0.8, cy - r * 2.05, w * 1.6, r * 1.15);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - w * 0.8, cy - r * 1.15, w * 1.6, r * 0.22);
        break;
      }
      case 'sailor': {
        // Gorro de marinero blanco con cinta azul.
        const w = r * (ch.wide || 1);
        ctx.beginPath(); ctx.ellipse(x, cy - r * 0.62, w * 0.95, r * 0.5, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(x - w * 1.05, cy - r * 0.68, w * 2.1, r * 0.22);
        ctx.fillStyle = '#1f3f7a';
        ctx.fillRect(x - w * 0.95, cy - r * 0.8, w * 1.9, r * 0.14);
        break;
      }
      case 'cool': {
        // Tupé.
        const sd = face.side || (face.x >= 0 ? 1 : -1), w = r * (ch.wide || 1);
        ctx.beginPath(); ctx.ellipse(x, cy - r * 0.35, w + 0.5, r * 0.72, 0, Math.PI, 0); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - sd * w * 0.6, cy - r * 0.9);
        ctx.quadraticCurveTo(x + sd * w * 0.2, cy - r * 1.75, x + sd * w * 1.15, cy - r * 1.05);
        ctx.quadraticCurveTo(x + sd * w * 0.4, cy - r * 1.05, x + sd * w * 0.1, cy - r * 0.6);
        ctx.fill();
        break;
      }
      case 'cap': {
        // Gorra con visera hacia donde mira.
        const sd = face.side || (face.x >= 0 ? 1 : -1), w = r * (ch.wide || 1);
        ctx.beginPath(); ctx.ellipse(x, cy - r * 0.35, w + 1, r * 0.75, 0, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + sd * w * 0.9, cy - r * 0.38, w * 0.75, r * 0.16, 0, 0, TAU); ctx.fill();
        break;
      }
    }
    eyes(x + face.x * r * 0.35, cy + 1 + face.y * 3, r * 0.25);
    if (ch.acc === 'cool') {
      // Gafas de sol encima de los ojos.
      const ex = x + face.x * r * 0.35, ey = cy + 1 + face.y * 3, e = r * 0.25;
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(ex - e, ey, e * 1.15, e * 0.85, 0, 0, TAU); ctx.ellipse(ex + e, ey, e * 1.15, e * 0.85, 0, 0, TAU); ctx.fill();
      ctx.fillRect(ex - e * 0.3, ey - e * 0.35, e * 0.6, e * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillRect(ex - e * 1.4, ey - e * 0.45, e * 0.45, e * 0.2);
      ctx.fillRect(ex + e * 0.6, ey - e * 0.45, e * 0.45, e * 0.2);
    }
  }

  function drawPlayers() {
    for (const p of G.players) {
      if (p.gone) continue;
      const bob = Math.sin(p.walk) * 1.5, face = { x: p.face.x, y: p.face.y, side: p.side };
      if (p.down) {
        // Jugador caído: fantasma con el anillo de reanimación.
        ctx.globalAlpha = 0.4;
        drawHero(p.x, p.y, p.r, p.ch, face, 0, false);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, 0, TAU); ctx.stroke();
        if (p.reviveT > 0) {
          ctx.strokeStyle = '#6fffb0';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.reviveT / REVIVE_TIME)); ctx.stroke();
        }
        ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('💀 ' + pname(p), p.x, p.y - p.r - 22);
        continue;
      }
      if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.45;
      shadow(p.x, p.y, p.r);
      drawHero(p.x, p.y, p.r, p.ch, face, bob);
      if (p.slowT > 0) {
        ctx.strokeStyle = 'rgba(240,242,255,.75)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI + 0.3; ctx.moveTo(p.x + Math.cos(a) * p.r * 1.2, p.y + Math.sin(a) * p.r * 1.2); ctx.lineTo(p.x - Math.cos(a) * p.r * 1.2, p.y - Math.sin(a) * p.r * 1.2); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const bw = 36;
      ctx.fillStyle = '#2a0d18'; ctx.fillRect(p.x - bw / 2, p.y + p.r + 8, bw, 5);
      ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#4dff88' : '#ff4d6a';
      ctx.fillRect(p.x - bw / 2, p.y + p.r + 8, bw * p.hp / p.maxHp, 5);
      if (G.coop) {
        ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.strokeText(pname(p), p.x, p.y - p.r - 16);
        ctx.fillStyle = p.color; ctx.fillText(pname(p), p.x, p.y - p.r - 16);
      }
    }
  }

  function drawWeaponsWorld() {
    for (const p of G.players) {
      if (p.down) continue;
      for (const w of p.weapons) {
        if (w.id !== 'halo' || !w.R) continue;
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
    for (const p of G.players) {
      if (p.down) continue;
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
  }

  function drawBullets() {
    for (const b of G.bullets) {
      if (!inView(b.x, b.y, 40)) continue;
      if (b.kind === 'bala' && b.shape === 'star') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(performance.now() / 50);
        ctx.fillStyle = b.color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? b.r * 0.4 : b.r * 1.5, a = i / 8 * TAU; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.3, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'bala' && b.shape === 'knife') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-11, -2, 6, 4);
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(-5, -3.5, 2, 7);
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.moveTo(-3, -2.5); ctx.lineTo(9, 0); ctx.lineTo(-3, 2.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'meteoro') {
        // La roca cae en diagonal hasta su sombra.
        const k = Math.max(0, b.t / (b.max || 0.6)), hx = b.x + 160 * k, hy = b.y - 340 * k, rr2 = 9 + b.R * 0.12;
        ctx.strokeStyle = b.ev ? 'rgba(255,120,220,.5)' : 'rgba(255,150,60,.5)'; ctx.lineWidth = rr2 * 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 40, hy - 85); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = b.ev ? '#ff8ad8' : '#ff8a3d';
        ctx.beginPath(); ctx.arc(hx, hy, rr2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a3a2a';
        ctx.beginPath(); ctx.arc(hx - rr2 * 0.2, hy + rr2 * 0.1, rr2 * 0.6, 0, TAU); ctx.fill();
      } else if (b.kind === 'charco') {
        continue;
      } else if (b.kind === 'bala' && b.shape === 'ki') {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.6);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, b.color); g.addColorStop(1, 'rgba(127,219,255,0)');
        ctx.strokeStyle = 'rgba(127,219,255,.35)'; ctx.lineWidth = b.r * 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.12, b.y - b.vy * 0.12); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.6, 0, TAU); ctx.fill();
      } else if (b.kind === 'disco' && b.skin === 'shield') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        const rs = [[1, '#c62828'], [0.75, '#f5f5f5'], [0.52, '#c62828'], [0.34, '#1565c0']];
        for (const [k, c] of rs) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, b.r * k, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const rr2 = i % 2 ? b.r * 0.13 : b.r * 0.32, a = -Math.PI / 2 + i / 10 * TAU; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'bala') {
        // Trazadora: estela del color del arma y punta blanca.
        ctx.strokeStyle = b.color; ctx.lineWidth = b.r; ctx.lineCap = 'round'; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, TAU); ctx.fill();
      } else if (b.kind === 'cohete') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#ffb02e';
        ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-15 - Math.random() * 6, 0); ctx.lineTo(-8, 3); ctx.fill();
        ctx.fillStyle = '#d9dde8'; rr(-8, -4, 14, 8, 3); ctx.fill();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(11, 0); ctx.lineTo(6, 4); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'chispa') {
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
      if (b.web) {
        ctx.strokeStyle = '#f0f2ff'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI; ctx.moveTo(b.x + Math.cos(a) * b.r * 1.3, b.y + Math.sin(a) * b.r * 1.3); ctx.lineTo(b.x - Math.cos(a) * b.r * 1.3, b.y - Math.sin(a) * b.r * 1.3); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
    }
  }

  function drawEffects() {
    for (const f of G.effects) {
      if (f.type === 'slash') {
        const k = f.life / f.max;
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color || '#eef6ff'; ctx.lineWidth = 3 + 7 * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.R * (0.75 + 0.25 * (1 - k)), f.a - f.arc / 2, f.a + f.arc / 2); ctx.stroke();
        ctx.strokeStyle = '#9dd6ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.R * (0.55 + 0.25 * (1 - k)), f.a - f.arc / 2.6, f.a + f.arc / 2.6); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        continue;
      }
      if (f.type === 'ring') {
        const k = f.life / f.max, R = f.R * (1.05 - 0.6 * k);
        ctx.globalAlpha = k;
        ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 10 * k + 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(120,130,150,.18)';
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (f.type === 'whip') {
        const k = f.life / f.max;
        ctx.save();
        ctx.translate(f.x, f.y); ctx.rotate(f.a);
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.ev ? '#ff5c7a' : '#c9a0ff'; ctx.lineWidth = f.h * 0.5 * (0.5 + k); ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.quadraticCurveTo(f.R * 0.5, -f.h * (1.6 * k - 0.4), f.R, f.h * 0.2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (f.type === 'ice') {
        const k = f.life / f.max, R = f.R * (1.05 - 0.5 * k);
        ctx.globalAlpha = k;
        ctx.fillStyle = 'rgba(150,220,255,.22)';
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 3 + 6 * k;
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU;
          ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * R * 0.85, f.y + Math.sin(a) * R * 0.85); ctx.lineTo(f.x + Math.cos(a) * R * 1.08, f.y + Math.sin(a) * R * 1.08); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      if (f.type === 'boom') {
        const k = f.life / f.max, R = f.R * (1.1 - 0.5 * k);
        ctx.globalAlpha = k;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
        g.addColorStop(0, 'rgba(255,240,180,.95)'); g.addColorStop(0.5, 'rgba(255,140,40,.7)'); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
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

  // Lo que va pegado al suelo (debajo de los enemigos): charcos de veneno y sombras de meteoros.
  function drawGroundFx() {
    for (const b of G.bullets) {
      if (b.kind !== 'charco' && b.kind !== 'meteoro') continue;
      if (!inView(b.x, b.y, b.r + 10)) continue;
      if (b.kind === 'charco') {
        const fade = Math.min(1, b.life * 2);
        ctx.globalAlpha = 0.45 * fade;
        ctx.fillStyle = b.ev ? '#7dff6a' : '#8be04a';
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8 * fade;
        ctx.fillStyle = '#d9ff9e';
        const t = G.time * 2 + b.x * 0.01;
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + b.y * 0.01, d = b.r * 0.55 * ((i * 37) % 10) / 10;
          ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.7, 2 + 2 * Math.abs(Math.sin(t + i)), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        const k = Math.max(0, b.t / (b.max || 0.6));
        ctx.strokeStyle = `rgba(255,90,60,${0.25 + 0.5 * (1 - k)})`; ctx.lineWidth = 2;
        ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.25 * (1 - k)})`;
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.R * (1 - 0.5 * k), b.R * 0.6 * (1 - 0.5 * k), 0, 0, TAU); ctx.fill(); ctx.stroke();
      }
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

  // Panel de un jugador: nivel, armas, pasivas y renacimientos.
  function drawPanel(p, ax, y0, right) {
    const small = W < 420, sz = small ? 22 : 26, gap = sz + 4, fs = small ? 13 : 16;
    const xAt = i => right ? ax - sz - i * gap : ax + i * gap;
    ctx.globalAlpha = p.down ? 0.45 : 1;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = right ? 'right' : 'left';
    ctx.font = `bold ${small ? 14 : 15}px system-ui`;
    ctx.fillStyle = G.coop ? p.color : '#ffd75e';
    ctx.fillText(`${G.coop ? pname(p) + ' · ' : ''}Nv. ${p.level}${p.down ? ' 💀' : ''}`, ax, y0 - 8);
    const slot = (x, y, icon, label, bg) => {
      ctx.fillStyle = bg; rr(x, y, sz, sz, 6); ctx.fill();
      ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, x + sz / 2, y + sz / 2 + 1);
      ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(label, x + sz - 4, y + sz - 4);
    };
    p.weapons.forEach((w, i) => slot(xAt(i), y0, WEAPONS[w.id].icon, w.evolved ? '★' : w.lvl, w.evolved ? 'rgba(255,215,94,.35)' : 'rgba(40,46,100,.7)'));
    Object.keys(p.passives).forEach((id, i) => slot(xAt(i), y0 + gap, PASSIVES[id].icon, p.passives[id], 'rgba(40,46,100,.5)'));
    if (p.revives > 0) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${fs}px system-ui`;
      ctx.fillText('🕊️', xAt(0) + sz / 2, y0 + gap * 2 + sz / 2);
    }
    ctx.globalAlpha = 1;
  }

  // Flechas en el borde de una vista hacia los compañeros que quedan fuera de ella.
  function drawMates(v) {
    const st = SAFE.t, sb = SAFE.b;
    for (const q of G.players) {
      if (q === v.p || q.gone || inView(q.x, q.y, -10)) continue;
      const sx = v.x + (q.x - camX) * ZOOM, sy = v.y + (q.y - camY) * ZOOM;
      const m = 30, top = v.y === 0 ? st + 100 : v.y + 60, bot = v.y + v.h - (v.y + v.h >= H ? sb + 50 : 30);
      const x = Math.max(v.x + m, Math.min(v.x + v.w - m, sx)), y = Math.max(top, Math.min(bot, sy));
      const a = Math.atan2(sy - y, sx - x);
      ctx.fillStyle = 'rgba(10,12,30,.75)'; ctx.strokeStyle = q.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 27, y + Math.sin(a) * 27);
      ctx.lineTo(x + Math.cos(a + 0.4) * 18, y + Math.sin(a + 0.4) * 18);
      ctx.lineTo(x + Math.cos(a - 0.4) * 18, y + Math.sin(a - 0.4) * 18);
      ctx.fill();
      ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(q.down ? '💀' : pname(q), x, y);
    }
  }

  function drawHUD(vs) {
    const st = SAFE.t, sl = SAFE.l, sr = SAFE.r, sb = SAFE.b;
    const small = W < 420, split = vs.length > 1, side = split && vs[1].x > 0;
    // Barra de experiencia de cada jugador, arriba de su vista.
    ctx.fillStyle = '#161a36'; ctx.fillRect(0, 0, W, st + 8);
    for (const v of vs) {
      const p = v.p, y = v.y === 0 ? st : v.y, h = v.y === 0 ? 8 : 6;
      if (v.y > 0) { ctx.fillStyle = '#161a36'; ctx.fillRect(v.x, y, v.w, h); }
      const xg = ctx.createLinearGradient(v.x, 0, v.x + v.w, 0);
      xg.addColorStop(0, '#4b6cff'); xg.addColorStop(1, '#5ad1ff');
      ctx.fillStyle = xg; ctx.fillRect(v.x, y, v.w * Math.min(1, p.xp / p.xpNext), h);
    }

    // Tiempo, muertes y oro
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = `bold ${small ? 20 : 24}px system-ui`;
    ctx.fillText(fmtTime(G.time), W / 2, st + 36);
    ctx.font = `${small ? 12 : 13}px system-ui`; ctx.fillStyle = '#b9bee6';
    ctx.fillText(`☠ ${G.kills}   🪙 ${G.gold}`, W / 2, st + 54);

    // Paneles: el de cada vista; en online, además, un resumen de los compañeros a la derecha.
    vs.forEach((v, i) => {
      if (split && side && i === 1) drawPanel(v.p, W - sr - 10, st + 90, true);
      else drawPanel(v.p, (v.x === 0 ? sl : v.x) + 10, (v.y === 0 ? st : v.y) + 36, false);
    });
    if (!split && G.coop) {
      let y = st + 84;
      for (const q of G.players) {
        if (q === G.p || q.gone) continue;
        const bw = small ? 70 : 90, x1 = W - sr - 10;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.font = `bold ${small ? 11 : 12}px system-ui`;
        ctx.fillStyle = q.color;
        const nm = (G.names && G.names[q.idx]) || q.ch.name;
        ctx.fillText(`${pname(q)} ${nm.length > 10 ? nm.slice(0, 9) + '…' : nm} · Nv. ${q.level}${q.down ? ' 💀' : ''}`, x1, y);
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x1 - bw, y + 4, bw, 4);
        ctx.fillStyle = q.hp / q.maxHp > 0.3 ? '#4dff88' : '#ff4d6a';
        ctx.fillRect(x1 - bw, y + 4, bw * Math.max(0, q.hp / q.maxHp), 4);
        y += 26;
      }
    }

    // Barra del jefe
    if (G.boss && !G.boss.dead) {
      const b = G.boss, bw = Math.min(520, W - 40), x = (W - bw) / 2, y = H - sb - 34;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(x - 2, y - 2, bw + 4, 16, 6); ctx.fill();
      ctx.fillStyle = b.color; rr(x, y, Math.max(1, bw * Math.max(0, b.hp / b.maxHp)), 12, 5); ctx.fill();
      ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
      ctx.fillText(b.name, W / 2, y - 8);
    }

    // Joysticks táctiles
    if (state === 'play') {
      joys.forEach((j, i) => {
        if (!j.active) return;
        const jx = j.x - j.ox, jy = j.y - j.oy, l = Math.hypot(jx, jy), m = Math.min(l, JR);
        ctx.strokeStyle = G.coop && !G.online ? PCOLORS[i] : 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.beginPath(); ctx.arc(j.ox, j.oy, JR, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.arc(j.ox + (l ? jx / l * m : 0), j.oy + (l ? jy / l * m : 0), JR * 0.4, 0, TAU); ctx.fill();
      });
      if (split && isTouch && G.time < 6) {
        ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        vs.forEach((v, i) => { ctx.fillStyle = PCOLORS[i]; ctx.fillText(`${pname(v.p)}: toca aquí para moverte`, v.x + v.w / 2, v.y + v.h - (i === vs.length - 1 ? sb + 70 : 40)); });
      }
    }
  }

  // Viñeta roja cuando el jugador de esa vista tiene poca vida.
  function drawVignette(v) {
    const p = v.p, hpk = p.down ? 0 : p.hp / p.maxHp;
    if (hpk >= 0.3 || p.gone) return;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(v.w, v.h) * 0.35, cx, cy, Math.max(v.w, v.h) * 0.7);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, `rgba(255,0,40,${(0.3 - hpk) * (0.8 + Math.sin(G.time * 6) * 0.2)})`);
    ctx.fillStyle = g; ctx.fillRect(v.x, v.y, v.w, v.h);
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

  // Vistas de la pantalla: en cooperativo local, una por jugador (lado a lado en horizontal,
  // una encima de otra en vertical); si no, una sola centrada en el jugador de esta pantalla.
  const splitSide = () => W >= H;
  function screenViews() {
    if (G.coop && !G.online && G.players.length > 1) {
      const sd = splitSide();
      return G.players.map((p, i) => sd ? { x: i * W / 2, y: 0, w: W / 2, h: H, p } : { x: 0, y: i * H / 2, w: W, h: H / 2, p });
    }
    return [{ x: 0, y: 0, w: W, h: H, p: G.p }];
  }

  function render(dt) {
    ctx = mainCtx;
    if (!G) { renderMenuBg(dt); return; }
    ctx.fillStyle = G.map.bg;
    ctx.fillRect(0, 0, W, H);
    const sx = G.shake > 0 ? rand(-G.shake, G.shake) : 0, sy = G.shake > 0 ? rand(-G.shake, G.shake) : 0;
    const vs = screenViews();
    for (const v of vs) {
      CVW = v.w / ZOOM; CVH = v.h / ZOOM;
      camX = v.p.x - CVW / 2 + sx; camY = v.p.y - CVH / 2 + sy;
      ctx.save();
      if (vs.length > 1) { ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip(); }
      ctx.translate(v.x, v.y);
      ctx.scale(ZOOM, ZOOM);
      ctx.translate(-camX, -camY);
      drawGround();
      drawGroundFx();
      drawWeaponsWorld();
      drawGems();
      drawPickups();
      for (const e of G.enemies) if (inView(e.x, e.y, e.r * 2 + 20)) drawEnemy(e);
      drawPlayers();
      drawOrbs();
      drawBullets();
      drawEffects();
      drawFx();
      ctx.restore();
      drawMates(v);
      drawVignette(v);
    }
    if (vs.length > 1) {
      ctx.fillStyle = 'rgba(8,8,20,.95)';
      if (vs[1].x > 0) ctx.fillRect(W / 2 - 3, 0, 6, H); else ctx.fillRect(0, H / 2 - 3, W, 6);
      ctx.fillStyle = 'rgba(200,190,255,.35)';
      if (vs[1].x > 0) ctx.fillRect(W / 2 - 1, 0, 2, H); else ctx.fillRect(0, H / 2 - 1, W, 2);
    }
    drawHUD(vs);
  }

  // ---------- Menús ----------
  const overlays = ['menu', 'help', 'account', 'select', 'shop', 'equip', 'roulette', 'lobby', 'levelup', 'pause', 'end'];
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
    // En pausa el audio está suspendido: no reactivarlo al cambiar los ajustes.
    if (state !== 'paused') Sound.init();
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
    // Los personajes altos se dibujan algo más pequeños y más abajo para que quepan enteros.
    if (ch.tall) drawHero(16, 21.5, 7, ch, { x: 0.4, y: 0.6 }, 0, false);
    else drawHero(16, 15, 9, ch, { x: 0.4, y: 0.6 }, 0, false);
    ctx = mainCtx;
    return c;
  }

  function bump(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); Sound.play('error'); }

  // Rejilla de personajes para un jugador ('char' = J1, 'char2' = J2).
  function renderCharGrid(boxId, slotKey) {
    const cbox = $(boxId);
    cbox.innerHTML = '';
    for (const ch of CHARS) {
      const owned = S.chars.includes(ch.id);
      const b = document.createElement('button');
      b.className = 'sel' + (S[slotKey] === ch.id ? ' on' : '') + (owned ? '' : ' locked');
      b.appendChild(portrait(ch));
      b.insertAdjacentHTML('beforeend',
        `<div class="nm">${ch.name}</div><div class="tt">${ch.title}</div>` +
        `<div class="ds">${ch.desc}</div>` +
        (owned ? '' : `<div class="cost${S.gold >= ch.cost ? '' : ' no'}">🔒 🪙 ${ch.cost}</div>`));
      b.addEventListener('click', () => {
        if (!owned) {
          if (S.gold < ch.cost) { bump(b); return; }
          S.gold -= ch.cost; S.chars.push(ch.id);
          Sound.play('buy');
        } else Sound.play('click');
        S[slotKey] = ch.id; save(); renderSelect();
      });
      cbox.appendChild(b);
    }
  }

  function renderSelect() {
    refreshGold();
    const mode = S.mode;
    document.querySelectorAll('#modeRow button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    $('p1Title').textContent = mode === 'local' ? 'Jugador 1' : mode === 'online' ? 'Tu personaje' : 'Elige personaje';
    $('p1Title').classList.toggle('p1', mode === 'local');
    $('p2Wrap').classList.toggle('hidden', mode !== 'local');
    $('onlineBox').classList.toggle('hidden', mode !== 'online');
    $('startBtn').classList.toggle('hidden', mode === 'online');
    $('mapTitle').textContent = mode === 'online' ? 'Elige mapa (lo decide quien crea la sala)' : 'Elige mapa';
    renderEqNote();
    renderCharGrid('chars', 'char');
    if (mode === 'local') renderCharGrid('chars2', 'char2');
    if (mode === 'online') {
      const ok = Cloud.configured && !!Cloud.user;
      $('onlineNeedLogin').classList.toggle('hidden', ok);
      $('onlineActions').classList.toggle('hidden', !ok);
      $('onlineMsg').textContent = '';
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

  // ---------- Equipo y cofres ----------
  let eqTab = 'inv', eqReturn = 'menu';
  const upCost = (it, lvl) => Math.round(RARITY[it.rarity].price * 0.4 * lvl);
  function fmtStats(stats, lvl) {
    return Object.keys(stats).map(k => `${STAT_LABELS[k][1](itemValue(stats[k], lvl))} ${STAT_LABELS[k][0]}`).join(' · ');
  }
  function eqMsg(text, err) { $('eqMsg').textContent = text; $('eqMsg').classList.toggle('err', !!err); }

  function renderEquip() {
    refreshGold();
    // Huecos equipados
    $('eqSlots').innerHTML = '';
    for (const sl of EQUIP_SLOTS) {
      const it = itemById(S.equip[sl.id]);
      const b = document.createElement('button');
      b.className = 'eqslot' + (it ? ' full' : '');
      if (it) b.style.borderColor = RARITY[it.rarity].color;
      b.title = it ? `Quitar ${it.name}` : sl.name;
      b.innerHTML = it
        ? `<span class="ic">${it.icon}</span><span class="lb">${sl.name}</span><span class="lv" style="color:${RARITY[it.rarity].color}">Nv. ${S.items[it.id]}</span>`
        : `<span class="ic empty">${sl.icon}</span><span class="lb">${sl.name}</span><span class="lv">—</span>`;
      b.addEventListener('click', () => {
        if (!it) { eqTab = 'inv'; renderEquip(); return; }
        delete S.equip[sl.id]; save(); Sound.play('click'); renderEquip();
      });
      $('eqSlots').appendChild(b);
    }
    // Resumen
    const g = gearStats(myGear());
    const total = Object.keys(g.st).map(k => `${STAT_LABELS[k][1](g.st[k])} ${STAT_LABELS[k][0]}`).join(' · ');
    $('eqSummary').innerHTML = (g.weapon ? `Ataque principal: <b>${WEAPONS[g.weapon].icon} ${WEAPONS[g.weapon].name}</b><br>` : `Sin arma equipada: ataque principal <b>${WEAPONS.basico.icon} ${WEAPONS.basico.name}</b> (el básico).<br>`) +
      (total ? `Bonificaciones: ${total}` : 'Sin bonificaciones de equipo.');
    document.querySelectorAll('#eqTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === eqTab));

    const box = $('eqList');
    box.innerHTML = '';
    if (eqTab === 'chests') { renderChests(box); return; }
    const order = it => EQUIP_SLOTS.findIndex(sl => sl.id === it.slot) * 10 + Object.keys(RARITY).indexOf(it.rarity);
    const catalog = eqTab === 'catalog';
    const list = ITEMS.filter(it => catalog || !!S.items[it.id]).sort((a, b) => order(a) - order(b));
    if (catalog) {
      const owned = ITEMS.filter(it => S.items[it.id]).length;
      box.innerHTML = `<p class="sub" style="grid-column:1/-1">Todos los objetos del juego. Tienes <b>${owned}/${ITEMS.length}</b>. Los que no tienes salen en los 🎰 Cofres o como botín de los jefes.</p>`;
    }
    if (!list.length) {
      box.innerHTML = '<p class="sub">Aún no tienes objetos. Ábrelos en los 🎰 Cofres o derrota jefes para conseguir botín.</p>';
    }
    for (const it of list) {
      const rar = RARITY[it.rarity], lvl = S.items[it.id] || 0, slot = EQUIP_SLOTS.find(sl => sl.id === it.slot);
      const on = S.equip[it.slot] === it.id;
      const d = document.createElement('div');
      d.className = 'sel item' + (on ? ' equipped' : '');
      d.style.setProperty('--rc', rar.color);
      d.innerHTML =
        `<div class="ic" style="font-size:30px">${it.icon}</div><div class="nm">${it.name}</div>` +
        `<div class="rar"><span class="badge">${rar.name}</span> ${slot.name}${lvl ? ` · Nv. ${lvl}` : ''}</div>` +
        (it.ref ? `<div class="ref">🎮 ${it.ref}</div>` : '') +
        (it.weapon ? `<div class="wp">Ataque principal: ${WEAPONS[it.weapon].desc}</div>` : '') +
        `<div class="st">${fmtStats(it.stats, Math.max(1, lvl))}</div>`;
      if (catalog) {
        // Catálogo: solo información, también de lo que aún no tienes.
        const chests = 'Sale en ' + CHESTS.filter(c => c.rates[it.rarity] > 0).map(c => c.icon).join(' ') + ' y como botín';
        if (!lvl) d.classList.add('missing');
        d.insertAdjacentHTML('beforeend', lvl
          ? `<div class="own">✔ Lo tienes · Nv. ${lvl}${on ? ' · equipado' : ''}</div>`
          : `<div class="own no">🔒 ${chests}</div>`);
        box.appendChild(d);
        continue;
      }
      const btns = document.createElement('div');
      btns.className = 'btns';
      const mk = (text, cls, fn) => { const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.addEventListener('click', fn); btns.appendChild(b); return b; };
      {
        mk(on ? 'Quitar' : 'Equipar', on ? '' : 'primary', () => {
          if (on) delete S.equip[it.slot]; else S.equip[it.slot] = it.id;
          save(); Sound.play('click'); eqMsg(''); renderEquip();
        });
        if (lvl < ITEM_MAX) {
          const cost = upCost(it, lvl);
          const b = mk(`⬆ 🪙 ${cost}`, '', () => {
            if (S.gold < cost) { bump(d); eqMsg('No tienes oro suficiente.', true); return; }
            S.gold -= cost; S.items[it.id] = lvl + 1; save(); Sound.play('buy');
            eqMsg(`✔ ${it.name} sube a nivel ${lvl + 1}: ${fmtStats(it.stats, lvl + 1)}`);
            renderEquip();
          });
          b.title = `Mejorar a nivel ${lvl + 1}: ${fmtStats(it.stats, lvl + 1)}`;
          if (S.gold < cost) b.style.opacity = '.6';
        } else mk('MÁX', '', () => {}).disabled = true;
      }
      d.appendChild(btns);
      box.appendChild(d);
    }
  }
  // Pestaña de cofres: los objetos solo se consiguen al azar, nunca comprándolos directamente.
  function renderChests(box) {
    const owned = ITEMS.filter(it => S.items[it.id]).length;
    const col = document.createElement('div');
    col.className = 'collection';
    col.style.gridColumn = '1 / -1';
    col.innerHTML = `Colección: <b>${owned}/${ITEMS.length}</b> objetos` +
      `<div class="icons">${ITEMS.map(it => `<span class="${S.items[it.id] ? '' : 'no'}" style="border-color:${RARITY[it.rarity].color}" title="${it.name}">${it.icon}</span>`).join('')}</div>`;
    box.appendChild(col);
    for (const ch of CHESTS) {
      const d = document.createElement('div');
      d.className = 'sel chest';
      d.innerHTML = `<div class="cic">${ch.icon}</div><div class="nm">${ch.name}</div><div class="rates">` +
        Object.keys(ch.rates).filter(r => ch.rates[r] > 0).map(r => `<span style="color:${RARITY[r].color}">${RARITY[r].name} ${ch.rates[r]}%</span>`).join('') + '</div>';
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = `Abrir · 🪙 ${ch.price}`;
      if (S.gold < ch.price) b.style.opacity = '.6';
      b.addEventListener('click', () => openChestRoulette(ch, d));
      d.appendChild(b);
      box.appendChild(d);
    }
    const note = document.createElement('p');
    note.className = 'sub';
    note.style.gridColumn = '1 / -1';
    note.textContent = 'Si te toca un objeto que ya tienes, sube de nivel. Si ya estaba al máximo, recibes oro a cambio.';
    box.appendChild(note);
  }

  function rollRarity(rates) {
    const keys = Object.keys(rates).filter(k => rates[k] > 0);
    let r = Math.random() * keys.reduce((a, k) => a + rates[k], 0);
    for (const k of keys) { r -= rates[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
  }
  function rollItem(rates) {
    const rar = rollRarity(rates);
    return pick(ITEMS.filter(it => it.rarity === rar));
  }
  // Añade el objeto: nuevo (y se equipa si el hueco estaba libre), sube de nivel o, si ya está al máximo, da oro.
  function grantItem(it) {
    const had = S.items[it.id] || 0;
    if (had >= ITEM_MAX) {
      const gold = Math.round(RARITY[it.rarity].price * 0.25);
      S.gold += gold;
      return { kind: 'gold', gold };
    }
    S.items[it.id] = had + 1;
    let equipped = false;
    if (!had && !S.equip[it.slot]) { S.equip[it.slot] = it.id; equipped = true; }
    return { kind: had ? 'up' : 'new', lvl: had + 1, equipped };
  }

  // ---------- Ruleta ----------
  const ROU_CELL = 98, ROU_N = 42, ROU_WIN = 36;
  let rou = null;
  function openChestRoulette(ch, card) {
    if (rou && !rou.done) return;
    if (S.gold < ch.price) { bump(card); eqMsg('No tienes oro suficiente para este cofre.', true); return; }
    Sound.init();
    // El resultado se decide y se guarda antes de la animación: cerrar a medias no pierde nada.
    S.gold -= ch.price;
    const it = rollItem(ch.rates), res = grantItem(it);
    save();
    refreshGold();
    rou = { ch, it, res, done: false };
    $('rouTitle').textContent = `${ch.icon} ${ch.name}`;
    $('rouResult').innerHTML = '';
    $('rouAgain').disabled = true;
    $('rouAgain').textContent = `Abrir otro · 🪙 ${ch.price}`;
    const strip = $('rouStrip');
    strip.innerHTML = '';
    for (let i = 0; i < ROU_N; i++) {
      const c = i === ROU_WIN ? it : rollItem(ch.rates);
      const el = document.createElement('div');
      el.className = 'rou-cell';
      el.style.borderColor = RARITY[c.rarity].color;
      el.style.boxShadow = `inset 0 0 18px ${RARITY[c.rarity].color}33`;
      el.innerHTML = `<span class="i">${c.icon}</span><span class="n">${c.name}</span>`;
      strip.appendChild(el);
    }
    showOnly('roulette');
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0px)';
    void strip.offsetWidth;
    const w = $('rouWin').clientWidth;
    rou.target = w / 2 - (ROU_WIN * ROU_CELL + ROU_CELL / 2) + rand(-32, 32);
    strip.style.transition = 'transform 4.2s cubic-bezier(.1,.72,.12,1)';
    strip.style.transform = `translateX(${rou.target}px)`;
    // Un "tic" cada vez que una casilla pasa por la flecha.
    let lastCell = -1;
    const tick = () => {
      if (!rou || rou.done) return;
      const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
      const cell = Math.floor((w / 2 - x) / ROU_CELL);
      if (cell !== lastCell) { lastCell = cell; Sound.play('tick', 0.02); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    rou.timer = setTimeout(revealRoulette, 4300);
    strip.addEventListener('transitionend', revealRoulette, { once: true });
  }

  function revealRoulette() {
    if (!rou || rou.done) return;
    rou.done = true;
    clearTimeout(rou.timer);
    const strip = $('rouStrip');
    strip.style.transition = 'none';
    strip.style.transform = `translateX(${rou.target}px)`;
    const { it, res, ch } = rou, rar = RARITY[it.rarity];
    const cells = strip.children;
    if (cells[ROU_WIN]) { cells[ROU_WIN].style.transform = 'scale(1.08)'; cells[ROU_WIN].style.boxShadow = `0 0 24px ${rar.color}`; }
    const status = res.kind === 'new' ? `¡NUEVO!${res.equipped ? ' Te lo has equipado.' : ''}`
      : res.kind === 'up' ? `Ya lo tenías: sube a nivel ${res.lvl}`
      : `Ya estaba al máximo: recibes 🪙 ${res.gold}`;
    $('rouResult').innerHTML = `<div class="big">${it.icon}</div><div class="rn" style="color:${rar.color}">${it.name}</div>` +
      `<div class="rs"><b style="color:${rar.color}">${rar.name}</b> · ${status}</div>` +
      (it.ref ? `<div class="rs ref">🎮 ${it.ref}</div>` : '') +
      `<div class="rs">${fmtStats(it.stats, Math.max(1, S.items[it.id] || 1))}${it.weapon ? `<br>Ataque principal: ${WEAPONS[it.weapon].desc}` : ''}</div>`;
    Sound.play(it.rarity === 'legendario' || it.rarity === 'epico' ? 'evolve' : 'chest');
    $('rouAgain').disabled = false;
    $('rouAgain').style.opacity = S.gold >= ch.price ? '' : '.6';
    refreshGold();
  }

  function openEquip(from) { eqReturn = from; eqMsg(''); renderEquip(); showOnly('equip'); }

  function renderEqNote() {
    const g = gearStats(myGear());
    const extra = S.mode === 'local' ? ' (lo lleva J1)' : '';
    $('eqNote').innerHTML = (g.weapon
      ? `🎒 Ataque principal${extra}: <b>${WEAPONS[g.weapon].icon} ${WEAPONS[g.weapon].name}</b>.`
      : `🎒 Ataque principal: <b>${WEAPONS.basico.icon} ${WEAPONS.basico.name}</b> (el básico). Consigue armas en los cofres.`) + ' <button id="eqNoteBtn">Cambiar equipo</button>';
    $('eqNoteBtn').addEventListener('click', () => { Sound.play('click'); openEquip('select'); });
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

  function showComp(c) {
    const el = $('compNote');
    el.innerHTML = `🎁 <b>Compensación:</b> has recibido <b>🪙 ${c.gold}</b> por lo que se retiró del juego (${c.names.map(esc).join(', ')}).`;
    el.classList.remove('hidden');
  }

  function openMenu() { refreshGold(); syncToggles(); updateBest(); renderAccount(); showOnly('menu'); pullCloud(false); }

  // ---------- Pantalla de cuenta ----------
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function setMsg(text, err) { const m = $('accMsg'); m.textContent = text; m.classList.toggle('err', !!err); }
  const exportCode = () => 'HN1.' + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  function parseCode(str) {
    const c = str.trim().replace(/\s+/g, '');
    if (!c.startsWith('HN1.')) throw new Error('código no válido');
    return sanitize(JSON.parse(decodeURIComponent(escape(atob(c.slice(4))))));
  }

  function renderAccount() {
    const st = $('accStatus'), badge = $('accBadge');
    $('accLogin').classList.toggle('hidden', !(Cloud.configured && Cloud.ready && !Cloud.user));
    $('accUser').classList.toggle('hidden', !Cloud.user);
    if (!Cloud.configured) {
      st.textContent = 'El inicio de sesión todavía no está configurado en este juego. Mientras tanto, puedes usar la copia de seguridad de abajo.';
      badge.textContent = '';
    } else if (!Cloud.ready) {
      st.textContent = 'Conectando…';
      badge.textContent = '';
    } else if (Cloud.user) {
      const u = Cloud.user;
      st.innerHTML = `Conectado como <b>${esc(u.name)}</b>` + (u.email && u.email !== u.name ? `<br><small>${esc(u.email)}</small>` : '') +
        '<br>Tu progreso se guarda en la nube automáticamente.';
      badge.textContent = `☁️ ${u.name}` + (cloudErr ? ' · ⚠ sin sincronizar' : ' · progreso en la nube');
    } else {
      st.textContent = 'Inicia sesión para guardar tu progreso en la nube y seguir jugando desde cualquier dispositivo.';
      badge.textContent = '👤 Sin sesión: el progreso solo se guarda en este dispositivo';
    }
    if (Cloud.error) { setMsg(Cloud.error, true); Cloud.error = ''; }
    $('saveCode').value = exportCode();
  }

  async function authAction(fn, okText) {
    setMsg('Conectando…');
    try { await fn(); setMsg(okText || ''); }
    catch (e) { setMsg(Cloud.message ? Cloud.message(e) : String(e), true); Sound.play('error'); }
  }
  $('googleBtn').addEventListener('click', () => authAction(() => Cloud.loginGoogle()));
  $('emailForm').addEventListener('submit', e => {
    e.preventDefault();
    authAction(() => Cloud.loginEmail($('accEmail').value.trim(), $('accPass').value));
  });
  $('registerBtn').addEventListener('click', () => {
    if (!$('emailForm').reportValidity()) return;
    authAction(() => Cloud.register($('accEmail').value.trim(), $('accPass').value));
  });
  $('syncBtn').addEventListener('click', async () => {
    setMsg('Sincronizando…');
    await pullCloud(true);
    setMsg(cloudErr || '✔ Progreso sincronizado', !!cloudErr);
  });
  $('logoutBtn').addEventListener('click', () => authAction(async () => {
    clearTimeout(cloudTimer);
    // Sube el progreso antes de salir; si falla, no se cierra la sesión para no perder nada.
    if (!(await pushCloud())) throw new Error(cloudErr);
    await Cloud.logout();
    // Este dispositivo vuelve a empezar: el progreso queda guardado en la cuenta.
    const prefs = { sfx: S.sfx, music: S.music };
    replaceSave(Object.assign(defaultSave(), prefs));
    saveLocal();
    refreshGold(); updateBest(); renderAccount();
  }, 'Sesión cerrada. Tu progreso sigue guardado en tu cuenta.'));
  $('copyCode').addEventListener('click', () => {
    const ta = $('saveCode');
    ta.value = exportCode();
    const done = () => setMsg('✔ Código copiado');
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
    else { ta.select(); document.execCommand('copy'); done(); }
  });
  $('importBtn').addEventListener('click', () => {
    try {
      const imp = parseCode($('importCode').value);
      if (imp.compNote) { showComp(imp.compNote); delete imp.compNote; }
      replaceSave(mergeSaves(S, imp));
      save();
      $('importCode').value = '';
      refreshGold(); updateBest(); renderAccount();
      Sound.play('buy');
      setMsg('✔ Progreso cargado y combinado con el actual');
    } catch (e) {
      Sound.play('error');
      setMsg('El código no es válido. Cópialo completo, empieza por «HN1.».', true);
    }
  });
  addEventListener('cloud', renderAccount);
  addEventListener('cloud-login', async () => {
    await pullCloud(true);
    setMsg(cloudErr || '✔ Sesión iniciada. Progreso sincronizado.', !!cloudErr);
  });

  // ---------- Online ----------
  // El anfitrión simula la partida y envía instantáneas ~20 veces por segundo.
  // El invitado mueve a su personaje en su pantalla, envía su posición y dibuja el resto interpolado.
  const ETYPE_IDS = ['slime', 'murcielago', 'espectro', 'bruto', 'boss', 'escupidor', 'brujo', 'arana', 'lobo', 'calabaza', 'golem', 'invocador'];
  const ETYPE_IDX = Object.fromEntries(ETYPE_IDS.map((k, i) => [k, i]));
  const PICK_IDS = ['cofre', 'carne', 'iman', 'moneda'];
  const BULLET_IDS = ['chispa', 'disco', 'bala', 'cohete', 'meteoro', 'charco'];
  const BULLET_IDX = Object.fromEntries(BULLET_IDS.map((k, i) => [k, i]));
  const PICK_IDX = { cofre: 0, carne: 1, iman: 2, moneda: 3 };
  const r1 = v => Math.round(v * 10) / 10;
  let lobby = null;      // { role, remotes: {plaza: datos}, roster: [...] } mientras se prepara la sala
  let lastOnline = null; // 'host' | 'guest' tras una partida online (para la revancha)
  const listNames = names => {
    const n = names.map(esc);
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n.join('');
  };

  function makeSnapshot() {
    // Se envía todo lo que pueda verse alrededor de cualquier jugador (con la pantalla más grande de todos).
    const vs = Object.values(G.views || {});
    const hw = Math.max(VW, ...vs.map(v => v.vw || 0)) / 2 + 160, hh = Math.max(VH, ...vs.map(v => v.vh || 0)) / 2 + 160;
    const cs = G.players.filter(p => !p.gone);
    const near = o => cs.some(p => Math.abs(o.x - p.x) < hw && Math.abs(o.y - p.y) < hh);
    const R = Math.round;
    const snap = {
      t: 's', time: G.time, k: G.kills, g: G.gold, sh: r1(G.shake),
      b: G.boss && !G.boss.dead ? [G.boss.name, R(G.boss.hp), R(G.boss.maxHp), G.boss.color] : 0,
      p: G.players.map(p => [r1(p.x), r1(p.y), r1(p.hp), p.maxHp, p.down ? 1 : 0, r1(p.reviveT), r1(p.face.x), r1(p.face.y),
        p.side, r1(p.walk), r1(p.inv), p.revives, Math.round(p.stats.speed * (p.slowT > 0 ? 0.55 : 1) * 100) / 100,
        p.weapons.map(w => [w.id, w.lvl, w.evolved ? 1 : 0, Math.round(w.angle * 100) / 100, w.n || 0, r1(w.R || 0), r1(w.br || 0)]),
        p.passives, p.gone ? 1 : 0, p.level, r1(p.xp), p.xpNext, p.slowT > 0 ? 1 : 0]),
      e: [], bu: [], eb: [], gm: [], pk: [], ev: G.netEvents.splice(0),
    };
    for (const e of G.enemies) {
      if (e.dead || !near(e)) continue;
      // Formato compacto: id, tipo, x, y, banderas (golpeado, élite, jefe, final) y, solo para élites y jefes, radio y vida.
      const f = (e.flash > 0 ? 1 : 0) | (e.elite ? 2 : 0) | (e.boss ? 4 : 0) | (e.final ? 8 : 0) | (isWarn(e) ? 16 : 0);
      const row = [e.id, ETYPE_IDX[e.type], R(e.x), R(e.y), f];
      if (e.elite || e.boss) row.push(r1(e.r), Math.round(e.hp / e.maxHp * 100) / 100);
      if (e.boss) row.push(e.variant, Math.round((e.ca || 0) * 100) / 100);
      snap.e.push(row);
    }
    G.netTexts = 0;
    for (const b of G.bullets) {
      if (b.dead || !near(b)) continue;
      const k = BULLET_IDX[b.kind];
      snap.bu.push(k === 1 ? [1, R(b.x), R(b.y), 0, 0, r1(b.r), b.ev ? 1 : 0, r1(b.rot), 0, b.skin || 0]
        : k === 4 ? [4, R(b.x), R(b.y), 0, 0, R(b.R), b.ev ? 1 : 0, Math.round(b.t * 100) / 100]
        : k === 5 ? [5, R(b.x), R(b.y), 0, 0, R(b.r), b.ev ? 1 : 0, r1(b.life)]
        : [k, R(b.x), R(b.y), R(b.vx), R(b.vy), r1(b.r), b.ev ? 1 : 0, 0, b.color || 0, b.shape || 0]);
    }
    for (const b of G.ebullets) if (!b.dead && near(b)) snap.eb.push(b.web ? [R(b.x), R(b.y), R(b.vx), R(b.vy), b.r, b.color, 1] : [R(b.x), R(b.y), R(b.vx), R(b.vy), b.r, b.color]);
    for (const g of G.gems) if (!g.dead && near(g)) snap.gm.push(g.v === 1 ? [R(g.x), R(g.y)] : [R(g.x), R(g.y), g.v]);
    for (const k of G.pickups) if (!k.dead && near(k)) snap.pk.push([PICK_IDX[k.type], R(k.x), R(k.y), r1(k.t)]);
    return snap;
  }

  function viewPlayer(ch, idx, x) {
    return {
      idx, x, y: 0, px: x, py: 0, tx: x, ty: 0, r: 14 * (ch.mods.size || 1), hp: 100, maxHp: 100, inv: 0, face: { x: 1, y: 0 }, side: 1, walk: 0,
      ch, color: PCOLORS[idx], down: false, reviveT: 0, revives: 0, stats: { speed: 1 }, weapons: [], passives: {},
      level: 1, xp: 0, xpNext: 5,
    };
  }

  function startGuest(m) {
    Sound.init();
    lastOnline = 'guest';
    const n = m.chars.length;
    G = {
      online: 'guest', localIdx: m.you || 1, coop: true, map: mapById(m.map), names: m.names,
      time: 0, kills: 0, gold: 0, shake: 0, boss: null, cx: 0, cy: 0,
      players: m.chars.map((c, i) => viewPlayer(charById(c), i, (i - (n - 1) / 2) * 60)),
      enemies: [], emap: new Map(), bullets: [], ebullets: [], gems: [], pickups: [], particles: [], texts: [], effects: [],
      snapT: performance.now(), snapDt: 0.05, sendT: 0, guestOpts: null, opts: [],
    };
    G.p = G.players[G.localIdx];
    beginPlay();
    toast(`🌐 Jugando con ${listNames(m.names.filter((_, i) => i !== G.localIdx))}` + (isTouch ? ' · arrastra el dedo para moverte' : ''), true);
  }

  function applySnapshot(sn) {
    const now = performance.now();
    G.snapDt = Math.max(0.04, Math.min(0.25, (now - G.snapT) / 1000));
    G.snapT = now;
    G.time = sn.time; G.kills = sn.k; G.gold = sn.g;
    G.shake = Math.max(G.shake, sn.sh || 0);
    G.boss = sn.b ? { name: sn.b[0], hp: sn.b[1], maxHp: sn.b[2], color: sn.b[3], dead: false } : null;
    sn.p.forEach((v, i) => {
      const p = G.players[i];
      if (!p) return;
      const [x, y, hp, maxHp, down, reviveT, fx, fy, side, walk, inv, revives, speed, weapons, passives, gone, level, xp, xpNext, slowed] = v;
      p.slowT = slowed ? 1 : 0;
      p.gone = !!gone;
      const wasDown = p.down;
      Object.assign(p, {
        hp, maxHp, down: !!down, reviveT, inv, revives, passives, level: level || 1, xp: xp || 0, xpNext: xpNext || 5,
        weapons: weapons.map(w => ({ id: w[0], lvl: w[1], evolved: !!w[2], angle: w[3], n: w[4], R: w[5], br: w[6] })),
      });
      p.stats.speed = speed;
      if (i === G.localIdx) {
        // Nuestra posición la decide esta pantalla, salvo si estamos caídos o muy desincronizados.
        if (p.down || wasDown || dist2(p.x, p.y, x, y) > 300 * 300) { p.x = x; p.y = y; }
      } else {
        p.px = p.x; p.py = p.y; p.tx = x; p.ty = y;
        if (dist2(p.x, p.y, x, y) > 400 * 400) { p.px = x; p.py = y; }
        p.face = { x: fx, y: fy }; p.side = side; p.walk = walk;
      }
    });
    const seen = new Set(), list = [];
    for (const v of sn.e) {
      const [id, ti, x, y, f, r, hpk, variant, ca] = v;
      let e = G.emap.get(id);
      if (!e) { e = { id, x, y, wob: rand(0, TAU), flash: 0 }; G.emap.set(id, e); }
      e.px = e.x; e.py = e.y; e.tx = x; e.ty = y;
      if (dist2(e.x, e.y, x, y) > 300 * 300) { e.px = x; e.py = y; }
      e.type = ETYPE_IDS[ti]; e.elite = !!(f & 2); e.boss = !!(f & 4); e.final = !!(f & 8); e.warn = !!(f & 16);
      e.variant = variant ?? -1; e.ca = ca || 0;
      e.r = r || ETYPES[e.type].r;
      if (f & 1) e.flash = 0.08;
      e.hp = hpk ?? 1; e.maxHp = 1;
      e.color = e.boss ? (G.boss ? G.boss.color : '#8a5cff') : G.map.colors[e.type] || ETYPES[e.type].color;
      seen.add(id); list.push(e);
    }
    for (const id of [...G.emap.keys()]) if (!seen.has(id)) G.emap.delete(id);
    G.enemies = list;
    G.bullets = sn.bu.map(v => {
      const b = { kind: BULLET_IDS[v[0]], x: v[1], y: v[2], vx: v[3], vy: v[4], r: v[5], ev: !!v[6], rot: v[7], color: v[8] || '#fff', shape: v[9] || null, skin: v[9] || null };
      if (b.kind === 'meteoro') { b.R = b.r; b.t = v[7]; b.max = 0.6; }
      else if (b.kind === 'charco') b.life = v[7];
      return b;
    });
    G.ebullets = sn.eb.map(v => ({ x: v[0], y: v[1], vx: v[2], vy: v[3], r: v[4], color: v[5], web: v[6] || 0 }));
    G.gems = sn.gm.map(v => ({ x: v[0], y: v[1], v: v[2] || 1 }));
    G.pickups = sn.pk.map(v => ({ type: PICK_IDS[v[0]], x: v[1], y: v[2], t: v[3] }));
    for (const ev of sn.ev) applyEvent(ev);
  }

  function applyEvent(ev) {
    switch (ev[0]) {
      case 's': Sound.play(ev[1], ev[2]); break;
      case 't': addText(ev[1], ev[2], ev[3], ev[4]); break;
      case 'b': burst(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
      case 'm': toast(ev[1]); break;
      case 'z': G.effects.push({ type: 'bolt', x: ev[1], y: ev[2], R: ev[3], life: 0.3, max: 0.3, seed: ev[4], ev: !!ev[5] }); break;
      case 'k': G.effects.push({ type: 'slash', x: ev[1], y: ev[2], a: ev[3], R: ev[4], arc: ev[5], color: ev[6], life: 0.22, max: 0.22 }); break;
      case 'r': G.effects.push({ type: 'ring', x: ev[1], y: ev[2], R: ev[3], life: 0.4, max: 0.4 }); break;
      case 'x': G.effects.push({ type: 'boom', x: ev[1], y: ev[2], R: ev[3], life: 0.35, max: 0.35 }); break;
      case 'w': G.effects.push({ type: 'whip', x: ev[1], y: ev[2], a: ev[3], R: ev[4], h: ev[5], ev: !!ev[6], life: 0.25, max: 0.25 }); break;
      case 'i': G.effects.push({ type: 'ice', x: ev[1], y: ev[2], R: ev[3], life: 0.45, max: 0.45 }); break;
    }
  }

  function updateGuest(dt) {
    const k = Math.min(1, (performance.now() - G.snapT) / 1000 / G.snapDt);
    for (const e of G.enemies) {
      e.x = e.px + (e.tx - e.px) * k; e.y = e.py + (e.ty - e.py) * k;
      e.wob += dt * 6; e.flash -= dt;
    }
    for (const p of G.players) {
      if (p.idx !== G.localIdx) { p.x = p.px + (p.tx - p.px) * k; p.y = p.py + (p.ty - p.py) * k; }
      for (const w of p.weapons) if (w.id === 'orbe') w.angle += (w.evolved ? 4.4 : 3.6) * dt;
    }
    for (const b of G.bullets) {
      if (b.kind === 'meteoro') b.t = Math.max(0, b.t - dt);
      else if (b.kind === 'charco') b.life -= dt;
      else { b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 18; }
    }
    for (const b of G.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const q of G.pickups) q.t += dt;

    const me = G.players[G.localIdx];
    if (state === 'play' && !me.down) {
      const { dx, dy } = inputDir(G.localIdx);
      const sp = 170 * me.stats.speed;
      me.x += dx * sp * dt; me.y += dy * sp * dt;
      if (dx || dy) {
        const l = Math.hypot(dx, dy);
        me.face = { x: dx / l, y: dy / l };
        if (Math.abs(dx) > 0.1) me.side = Math.sign(dx);
        me.walk += dt * 10;
      }
    }
    G.cx = me.x; G.cy = me.y;
    G.sendT -= dt;
    if (G.sendT <= 0) {
      G.sendT = 1 / 30;
      Net.send({ t: 'in', x: r1(me.x), y: r1(me.y), fx: r1(me.face.x), fy: r1(me.face.y), side: me.side, walk: r1(me.walk) });
    }
    updateFx(dt);
    for (const a of [G.particles, G.texts, G.effects]) compact(a);
    G.shake = Math.max(0, G.shake - dt * 30);
    Sound.setMode(G.boss ? 'boss' : 'calm');
  }

  function guestChoose(i) {
    Sound.play('click');
    Net.send({ t: 'pick', i });
    G.guestOpts = null;
    showWaiting('Aplicando mejora…');
  }

  function guestEnd(m) {
    state = m.win ? 'win' : 'over';
    releaseJoys();
    Sound.stopMusic();
    Sound.play(m.win ? 'win' : 'lose');
    const map = mapById(m.map);
    const r = recordRun(m.win, m.time, map, m.base, 1 + 0.1 * upLvl('codicia') + (gearStats(myGear()).st.gold || 0), Math.min(BOSSES.length, +m.bossKills || 0));
    Object.assign(r, { t: m.time, level: (m.levels && m.levels[G.localIdx]) || m.level || 1, kills: m.kills });
    $('retryBtn').classList.add('hidden');
    showEnd(m.win, m.win ? '¡Victoria!' : 'Habéis caído', '🌐 Online: ' + listNames(G.names) + '<br>', r,
      '<br><span id="endWait" class="sub">Esperando a que el anfitrión decida si jugáis otra vez…</span>');
  }

  // Mensajes recibidos. En el anfitrión, `slot` es la plaza del invitado que lo envía.
  Net.onMessage = (m, slot) => {
    if (m.t === 'hello') return onHello(m, slot);
    if (m.t === 'roster') { if (lobby) { lobby.roster = m.list; renderLobby(); } return; }
    if (m.t === 'start') return startGuest(m);
    if (!G) return;
    if (G.online === 'guest') {
      switch (m.t) {
        case 's': applySnapshot(m); break;
        case 'lvl':
          if (state !== 'levelup') Sound.play('level');
          state = 'levelup'; releaseJoys();
          G.guestOpts = m.opts;
          renderChoices(`¡<span style="color:${PTEXT[G.localIdx]}">Subes al nivel ${m.lv || ''}</span>!`, m.opts, pickIndex);
          break;
        case 'wait': {
          if (state !== 'levelup') Sound.play('level');
          state = 'levelup'; releaseJoys(); G.guestOpts = null;
          const who = [].concat(m.who).filter(i => G.names[i] != null);
          showWaiting(`Esperando a que ${listNames(who.map(i => G.names[i]))} ${who.length > 1 ? 'elijan sus mejoras' : 'elija su mejora'}…`, PTEXT[who[0] || 0]);
          break;
        }
        case 'go': if (state === 'levelup') { state = 'play'; showOnly(null); } break;
        case 'paused': guestSetPaused(m.on); break;
        case 'end': guestEnd(m); break;
      }
    } else if (G.online === 'host') {
      const idx = G.idxOf[slot];
      if (idx == null) return;
      switch (m.t) {
        case 'in': G.remote[idx] = m; break;
        case 'view': G.views[slot] = { vw: m.vw, vh: m.vh }; break;
        case 'pausereq': togglePause(); break;
        case 'pick': choose(G.players[idx], m.i); break;
      }
    }
  };

  Net.onState = (st, info) => {
    const slot = info && info.slot;
    if (st === 'waiting') lobbyStatus('Comparte este código con tus amigos (hasta 3). Esperando a que se unan…');
    else if (st === 'connecting') { if (Net.role === 'guest') lobbyStatus('Conectando…'); }
    else if (st === 'open') {
      if (Net.role === 'host') { Net.sendTo(slot, myHello()); sendRoster(); }
      else { Net.send(myHello()); lobbyStatus('Conectado. Esperando al anfitrión…'); }
    } else if (st === 'failed') {
      lobbyStatus('No se ha podido conectar. Puede que vuestras redes bloqueen la conexión directa: probad con otra red (por ejemplo, datos móviles).', true);
    } else if (st === 'error') {
      lobbyStatus('Error con la sala: ' + Cloud.message(info) + ' (revisa las reglas de Firestore, ver README).', true);
    } else if (st === 'closed') onDisconnect(slot);
  };

  addEventListener('resize', () => { if (G && G.online === 'guest') Net.send({ t: 'view', vw: VW, vh: VH }); });

  function myName() { return (Cloud.user && Cloud.user.name) || 'Jugador'; }
  function myHello() { return { t: 'hello', name: myName(), char: S.char, up: S.up, items: S.items, equip: S.equip, vw: VW, vh: VH }; }

  function lobbyStatus(text, err) {
    const el = $('lobbyStatus');
    el.textContent = text;
    el.classList.toggle('err', !!err);
  }
  // Lista de jugadores de la sala, en orden (J1 = anfitrión).
  function hostRoster() {
    const slots = Object.keys(lobby.remotes).sort();
    return [{ name: myName(), char: S.char }, ...slots.map(k => ({ name: lobby.remotes[k].name, char: lobby.remotes[k].char }))];
  }
  function sendRoster() {
    if (!lobby || lobby.role !== 'host') return;
    Net.send({ t: 'roster', list: hostRoster() });
    renderLobby();
  }
  function renderLobby() {
    if (!lobby) return;
    const host = lobby.role === 'host';
    const rows = host ? hostRoster() : (lobby.roster || []);
    const out = [];
    for (let i = 0; i < Net.MAX_PLAYERS; i++) {
      const r = rows[i];
      out.push(`<div class="lp" style="border-color:${PTEXT[i]}"><b style="color:${PTEXT[i]}">J${i + 1}${i === 0 ? ' · anfitrión' : ''}</b> ` +
        (r ? `${esc(r.name)} — ${esc(charById(r.char).name)}` : '<span class="sub">plaza libre…</span>') + '</div>');
    }
    $('lobbyPlayers').innerHTML = out.join('');
    const guests = host ? Object.keys(lobby.remotes).length : 0;
    $('lobbyStart').classList.toggle('hidden', !(host && guests > 0));
    if (host && guests > 0 && !G) lobbyStatus(`Jugadores: ${guests + 1}/${Net.MAX_PLAYERS}. Pulsa «¡Comenzar!» cuando estéis listos, o espera a más amigos.`);
  }

  function onHello(m, slot) {
    if (!lobby) lobby = { role: Net.role, remotes: {}, roster: [] };
    if (lobby.role === 'host') {
      lobby.remotes[slot] = { name: String(m.name || 'Jugador').slice(0, 40), char: m.char, up: m.up || {}, gear: sanitizeGear(m.items, m.equip), vw: +m.vw || 0, vh: +m.vh || 0 };
      sendRoster();
      if ((state === 'over' || state === 'win') && lastOnline === 'host') $('retryBtn').classList.remove('hidden');
    } else lobbyStatus(`Conectado con ${String(m.name || 'el anfitrión')}. Esperando a que empiece la partida…`);
  }

  async function hostRoom() {
    lobby = { role: 'host', remotes: {}, roster: [] };
    $('lobbyCode').classList.add('hidden');
    lobbyStatus('Creando sala…');
    renderLobby();
    showOnly('lobby');
    try {
      const code = await Net.host(Cloud.rooms);
      if (!code) return;
      $('lobbyCode').textContent = code;
      $('lobbyCode').classList.remove('hidden');
    } catch (e) {
      lobbyStatus('No se pudo crear la sala: ' + Cloud.message(e), true);
    }
  }

  async function joinRoom() {
    const code = $('joinCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      $('onlineMsg').textContent = 'Escribe el código de 5 caracteres de la sala.';
      $('onlineMsg').classList.add('err');
      Sound.play('error');
      return;
    }
    lobby = { role: 'guest', remotes: {}, roster: [] };
    $('lobbyCode').textContent = code;
    $('lobbyCode').classList.remove('hidden');
    lobbyStatus('Buscando la sala…');
    renderLobby();
    showOnly('lobby');
    try { await Net.join(Cloud.rooms, code); }
    catch (e) { lobbyStatus(Cloud.message(e), true); }
  }

  function hostStart() {
    if (!lobby) return;
    const slots = Net.openSlots().filter(k => lobby.remotes[k]);
    if (!slots.length) return;
    // Ya no entra nadie más: se borra la sala y se cierran las plazas libres.
    Net.closeRoom();
    const rs = slots.map(k => lobby.remotes[k]);
    const online = {
      map: S.map,
      chars: [S.char, ...rs.map(r => charById(r.char).id)],
      ups: [S.up, ...rs.map(r => r.up)],
      gears: [myGear(), ...rs.map(r => r.gear)],
      names: [myName(), ...rs.map(r => r.name)],
      views: Object.fromEntries(slots.map(k => [k, { vw: lobby.remotes[k].vw, vh: lobby.remotes[k].vh }])),
    };
    Sound.init();
    newGame(online);
    G.slotOf = [null, ...slots];
    G.idxOf = Object.fromEntries(slots.map((k, i) => [k, i + 1]));
    lastOnline = 'host';
    slots.forEach((k, i) => Net.sendTo(k, { t: 'start', map: online.map, chars: online.chars, names: online.names, you: i + 1 }));
    beginPlay();
    toast(`🌐 Jugando con ${listNames(rs.map(r => r.name))}` + (isTouch ? ' · arrastra el dedo para moverte' : ''), true);
  }

  function onDisconnect(slot) {
    const playing = G && G.online && !['over', 'win'].includes(state);
    if (Net.role === 'host' && lobby) delete lobby.remotes[slot];
    if (playing && G.online === 'host') {
      // Ese jugador desaparece de la partida; el resto sigue.
      const idx = G.idxOf[slot];
      const p = idx != null && G.players[idx];
      if (p && !p.gone) {
        p.gone = true; p.down = true; p.hp = 0;
        delete G.remote[idx]; delete G.views[slot];
        toast(`🔌 ${G.names[idx]} se ha desconectado.`);
        p.opts = null; p.pending = 0;
        if (!alive().length) endGame(false);
        else if (state === 'levelup') showLevelUp();
      }
      sendRoster();
    } else if (playing && G.online === 'guest') {
      state = 'over';
      releaseJoys(); Sound.stopMusic(); Sound.resume();
      $('endTitle').textContent = 'Conexión perdida';
      $('endTitle').style.color = '#d2607a';
      $('endStats').innerHTML = 'Se ha perdido la conexión con el anfitrión.';
      $('retryBtn').classList.add('hidden');
      $('pauseBtn').classList.add('hidden');
      showOnly('end');
      lastOnline = null;
    } else if (state === 'over' || state === 'win') {
      if (Net.role === 'guest') {
        const w = $('endWait');
        if (w) w.textContent = 'El anfitrión ha salido de la partida.';
        lastOnline = null;
      } else sendRoster();
    } else if (lobby) {
      if (Net.role === 'host') { sendRoster(); lobbyStatus('Un jugador ha salido de la sala.', true); }
      else lobbyStatus('Se ha perdido la conexión con la sala.', true);
    }
  }

  function leaveOnline() {
    Net.close();
    lobby = null; lastOnline = null;
  }

  // ---------- Flujo de partida ----------
  function beginPlay() {
    showOnly(null);
    $('pauseBtn').classList.remove('hidden');
    $('retryBtn').classList.remove('hidden');
    $('toast').classList.add('hidden');
    state = 'play';
    Sound.startMusic();
  }

  function start() {
    Sound.init();
    newGame();
    beginPlay();
    if (G.coop) toast(isTouch ? (splitSide() ? 'J1: mitad izquierda · J2: mitad derecha' : 'J1: mitad de arriba · J2: mitad de abajo') : 'J1: WASD · J2: flechas (o un mando cada uno)', true);
    else if (isTouch) toast('Arrastra el dedo para moverte', true);
  }

  // «Jugar otra vez»: en online, solo el anfitrión puede empezar la revancha.
  function retry() {
    if (lastOnline === 'guest') return;
    if (lastOnline === 'host') {
      if (Net.openSlots().some(k => lobby && lobby.remotes[k])) hostStart();
      else { leaveOnline(); start(); }
      return;
    }
    start();
  }

  function toMenu() {
    if (Net.role) leaveOnline();
    G = null; state = 'menu';
    Sound.stopMusic(); Sound.resume();
    $('pauseBtn').classList.add('hidden');
    $('retryBtn').classList.remove('hidden');
    $('toast').classList.add('hidden');
    openMenu();
  }

  function togglePause() {
    if (G && G.online === 'guest') {
      if (state === 'play' || state === 'paused') Net.send({ t: 'pausereq' });
      return;
    }
    if (state === 'play') {
      state = 'paused';
      releaseJoys();
      renderBuild(); syncToggles();
      showOnly('pause');
      Sound.suspend();
      if (G && G.online === 'host') Net.send({ t: 'paused', on: true });
    } else if (state === 'paused') {
      state = 'play';
      Sound.resume();
      showOnly(null);
      if (G && G.online === 'host') Net.send({ t: 'paused', on: false });
    }
  }
  function guestSetPaused(on) {
    if (on && state === 'play') {
      state = 'paused'; releaseJoys(); renderBuild(); syncToggles(); showOnly('pause'); Sound.suspend();
    } else if (!on && state === 'paused') {
      state = 'play'; Sound.resume(); showOnly(null);
    }
  }

  function renderBuild() {
    let h = `<div class="row">🗺️ ${G.map.name}${G.coop ? ' · 👥 Cooperativo' : ''}</div>` +
      `<div class="row">⏱ ${fmtTime(G.time)} · ☠ ${G.kills} · 🪙 ${G.gold}</div>`;
    for (const p of G.players) {
      if (p.gone) continue;
      h += `<h3 style="color:${G.coop ? PTEXT[p.idx] : ''}">${G.coop ? pname(p) + ' · ' : ''}${esc(p.ch.name)} · Nv. ${p.level} · ❤ ${Math.ceil(p.hp)}/${p.maxHp}${p.down ? ' · 💀 caído' : ''}</h3>`;
      for (const w of p.weapons) {
        const d = WEAPONS[w.id];
        h += w.evolved
          ? `<div class="row evo">${d.icon} ${d.evoName} ★</div>`
          : `<div class="row">${d.icon} ${d.name} — Nv. ${w.lvl}${w.lvl >= WMAX && d.evo ? ` (evoluciona con ${PASSIVES[d.evo].icon})` : ''}${d.main ? ' · ataque principal' : ''}</div>`;
      }
      for (const id of Object.keys(p.passives)) h += `<div class="row">${PASSIVES[id].icon} ${PASSIVES[id].name} — Nv. ${p.passives[id]}</div>`;
    }
    $('build').innerHTML = h;
  }

  // Guarda el resultado de una partida en el progreso de esta cuenta.
  // Botín: cada jefe derrotado (hay 4) da un 30% de conseguir un objeto nuevo (o subir uno que ya tienes).
  function rollLoot(bossKills, win) {
    const got = [];
    for (let i = 0; i < bossKills; i++) {
      if (Math.random() >= 0.3) continue;
      const pool = ITEMS.filter(it => it.rarity !== 'legendario' || win);
      const total = pool.reduce((a, it) => a + RARITY[it.rarity].w, 0);
      let r = Math.random() * total, it = pool[0];
      for (const c of pool) { r -= RARITY[c.rarity].w; if (r <= 0) { it = c; break; } }
      const res = grantItem(it);
      got.push({ it, up: res.kind === 'up', gold: res.gold });
    }
    return got;
  }

  function recordRun(win, t, map, base, goldMult, bossKills = 0) {
    const lockedBefore = MAPS.filter(m => !mapUnlocked(m)).map(m => m.id);
    let record = false;
    if (t > (S.best[map.id] || 0)) { S.best[map.id] = t; record = true; }
    if (win) S.wins[map.id] = (S.wins[map.id] || 0) + 1;
    const earned = Math.round(base * map.gold * goldMult);
    S.gold += earned;
    const loot = rollLoot(bossKills, win);
    save();
    return { earned, record, loot, newMaps: MAPS.filter(m => lockedBefore.includes(m.id) && mapUnlocked(m)) };
  }

  function showEnd(win, title, info, r, extra) {
    $('endTitle').textContent = title;
    $('endTitle').style.color = win ? '#6fffb0' : '#ff5c7a';
    $('endStats').innerHTML =
      (win ? 'El Rey del Abismo ha sido derrotado.<br>' : '') + info +
      `Tiempo: <b>${fmtTime(r.t)}</b>${r.record ? ' 🏆' : ''}<br>Nivel: <b>${r.level}</b> · Enemigos: <b>${r.kills}</b><br>` +
      `Oro ganado: <b>🪙 ${r.earned}</b> (total ${S.gold})` +
      r.newMaps.map(m => `<br><span class="unlock">¡Nuevo mapa desbloqueado: ${m.emoji} ${m.name}!</span>`).join('') +
      (r.loot || []).map(l => `<br><span class="unlock">🎁 Botín: <span style="color:${RARITY[l.it.rarity].color}">${l.it.icon} ${l.it.name}</span>${l.up ? ' (sube de nivel)' : l.gold ? ` (ya al máximo: +${l.gold} 🪙)` : ''}</span>`).join('') +
      (extra || '');
    $('pauseBtn').classList.add('hidden');
    showOnly('end');
  }

  function endGame(win) {
    if (state === 'over' || state === 'win') return;
    state = win ? 'win' : 'over';
    releaseJoys();
    Sound.stopMusic();
    Sound.play(win ? 'win' : 'lose');
    const t = G.time, map = G.map;
    const base = G.gold + Math.floor(t / 10) + G.bossKills * 50 + (win ? 150 : 0);
    const r = recordRun(win, t, map, base, G.players[0].stats.gold, G.bossKills);
    if (G.online === 'host') Net.send({ t: 'end', win, time: t, levels: G.players.map(p => p.level), kills: G.kills, base, map: map.id, bossKills: G.bossKills });
    Object.assign(r, { t, level: G.coop ? G.players.map(p => p.level).join(' / ') : G.p.level, kills: G.kills });
    const who = G.online ? '🌐 Online: ' + listNames(G.names) + '<br>'
      : G.coop ? '👥 Cooperativo: ' + G.players.map(p => esc(p.ch.name)).join(' y ') + '<br>' : '';
    showEnd(win, win ? '¡Victoria!' : (G.coop ? 'Habéis caído' : 'Has caído'), who, r);
  }

  // Botones
  const click = (id, fn) => $(id).addEventListener('click', () => { Sound.init(); Sound.play('click'); fn(); });
  click('playBtn', () => { renderSelect(); showOnly('select'); });
  click('shopBtn', () => { renderShop(); showOnly('shop'); });
  click('equipBtn', () => openEquip('menu'));
  $('rouWin').addEventListener('click', revealRoulette);
  click('rouBack', () => { revealRoulette(); eqTab = 'chests'; eqMsg(''); renderEquip(); showOnly('equip'); });
  click('rouAgain', () => { if (rou) openChestRoulette(rou.ch, $('rouAgain')); });
  click('eqBack', () => { if (eqReturn === 'select') { renderSelect(); showOnly('select'); } else openMenu(); });
  document.querySelectorAll('#eqTabs button').forEach(b => b.addEventListener('click', () => {
    Sound.play('click'); eqTab = b.dataset.t; eqMsg(''); renderEquip();
  }));
  click('helpBtn', () => showOnly('help'));
  document.querySelectorAll('#modeRow button').forEach(b => b.addEventListener('click', () => {
    Sound.init(); Sound.play('click');
    S.mode = b.dataset.m; save(); renderSelect();
  }));
  click('accountBtn', () => { setMsg(''); renderAccount(); showOnly('account'); });
  click('startBtn', start);
  click('retryBtn', retry);
  click('hostBtn', hostRoom);
  click('joinBtn', joinRoom);
  $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('joinBtn').click(); } });
  $('joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  click('onlineLoginBtn', () => { setMsg(''); renderAccount(); showOnly('account'); });
  click('lobbyStart', hostStart);
  click('lobbyCancel', () => { leaveOnline(); renderSelect(); showOnly('select'); });
  click('menuBtn', toMenu);
  click('quitBtn', toMenu);
  $('resumeBtn').addEventListener('click', togglePause);
  $('pauseBtn').addEventListener('click', togglePause);
  document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => { Sound.play('click'); openMenu(); }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state === 'play') togglePause();
      else if (state === 'levelup') Sound.suspend();
    } else if (state === 'levelup') Sound.resume();
  });
  openMenu();
  if (pendingComp) showComp(pendingComp);

  // ---------- Bucle principal ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPads();
    if (G && G.online === 'guest') {
      if (state !== 'paused' && state !== 'over' && state !== 'win') updateGuest(dt);
    } else if (state === 'play') update(dt);
    if (G && G.online === 'host' && state !== 'over' && state !== 'win') {
      G.netT -= dt;
      if (G.netT <= 0) { G.netT = 1 / 15; Net.send(makeSnapshot()); }
    }
    render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Acceso para depuración desde la consola.
  window.hordaNocturna = { get state() { return state; }, get game() { return G; }, save: S };
})();
