'use strict';
/*
 * Horda Nocturna — un juego original de supervivencia contra hordas.
 * HTML5 Canvas + JavaScript puro, sin dependencias.
 */
(() => {
  const { WEAPONS, MAIN_WEAPONS, PASSIVES, ETYPES, SPAWNS, BOSSES, CHARS, MAPS, SHOP, RARITY, EQUIP_SLOTS, ITEMS, STAT_LABELS, ITEM_MAX, CHESTS, HARDCORE, RUN_CHESTS } = window.HN_DATA;
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

  const defaultSave = () => ({ gold: 0, up: {}, chars: ['marc'], char: 'marc', map: 'bosque', best: {}, wins: {}, sfx: true, music: true, t: 0, mode: 'solo', char2: 'marc', items: {}, equip: {}, comp1: true, hard: false, chests: {}, hwins: {} });
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
      const hw = Math.floor(+(o.hwins && o.hwins[m.id]) || 0);
      if (hw > 0) d.hwins[m.id] = hw;
    }
    d.hard = o.hard === true;
    d.chests = sanitizeChests(o.chests);
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

  // Cofres guardados (ganados jugando) sin abrir: entre 0 y 99 de cada tipo.
  function sanitizeChests(c) {
    const out = {};
    for (const ch of CHESTS) { const n = Math.floor(+(c && c[ch.id]) || 0); if (n > 0) out[ch.id] = Math.min(99, n); }
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
    m.best = {}; m.wins = {}; m.hwins = {};
    for (const mp of MAPS) {
      const bt = Math.max(a.best[mp.id] || 0, b.best[mp.id] || 0), w = Math.max(a.wins[mp.id] || 0, b.wins[mp.id] || 0);
      const hw = Math.max((a.hwins || {})[mp.id] || 0, (b.hwins || {})[mp.id] || 0);
      if (bt) m.best[mp.id] = bt;
      if (w) m.wins[mp.id] = w;
      if (hw) m.hwins[mp.id] = hw;
    }
    // Los cofres sin abrir, como el oro, se toman del guardado más reciente.
    m.chests = sanitizeChests(newer.chests);
    m.hard = !!newer.hard;
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
  let state = 'menu'; // menu | play | levelup | paused | countdown | over | win

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
      stats: { dmg: 1, cd: 1, speed: 1, regen: 0, magnet: 1, area: 1, proj: 0, armor: 0, xp: 1, gold: 1, dodge: 0, thorns: 0, leech: 0, luck: 0, mana: 0 },
      weapons: [], passives: {},
      // Cada jugador tiene su propia experiencia y su propio nivel.
      level: 1, xp: 0, xpNext: 5, pending: 0, opts: null, optsSent: false,
      // Una vez por partida se pueden volver a sortear las mejoras de una subida de nivel.
      rerolls: 1,
      // La definitiva se usa una sola vez por partida.
      ultUsed: false,
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
      // Con más jugadores aparecen algo más de enemigos (cada uno sube de nivel con lo que recoge),
      // un poco más resistentes, y los jefes aguantan más.
      diffHp: 1 + 0.1 * (n - 1), diffRate: 1 + 0.25 * (n - 1), diffBoss: 1 + 0.6 * (n - 1),
      maxEnemies: 380 + 40 * (n - 1),
      online: online ? 'host' : null, localIdx: 0, names: online ? online.names : null,
      remote: {}, views: online ? online.views : {}, slotOf: [], idxOf: {},
      eid: 0, netEvents: [], netT: 0,
      enemies: [], bullets: [], ebullets: [], gems: [], pickups: [], particles: [], texts: [], effects: [],
      ults: [], slowmo: 0, cutin: null,
      hard: online ? !!online.hard : !!S.hard, dmgMul: 1,
    };
    if (G.hard) {
      // Hardcore: más vida, más daño, más enemigos, jefes más duros y sin Renacer.
      G.diffHp *= HARDCORE.hp; G.diffRate *= HARDCORE.rate; G.diffBoss *= HARDCORE.boss; G.dmgMul = HARDCORE.dmg;
      for (const p of players) p.revives = 0;
    }
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
    if (G && state === 'play' && !e.repeat) {
      const two = G.coop && !G.online;
      if (e.code === 'KeyQ' || e.code === 'Space') { e.preventDefault(); tryUlt(two ? 0 : G.localIdx || 0); }
      if (['Enter', 'NumpadEnter', 'ShiftRight', 'Numpad0'].includes(e.code)) tryUlt(two ? 1 : G.localIdx || 0);
    }
    if (state === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) pickIndex(i);
      if (e.code === 'KeyR') rerollPick();
    }
    if ((state === 'over' || state === 'win') && e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) retry();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseJoys(); });
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'play' && state !== 'countdown') return;
    const ub = ultButtons.find(b => Math.hypot(e.clientX - b.x, e.clientY - b.y) < b.R);
    if (ub) { tryUlt(ub.idx); return; }
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
  // Start pausa; A/B/X/Y eligen la mejora 1-4; RB vuelve a sortearlas.
  function pollPads() {
    getPads().forEach((pad, i) => {
      const now = pad.buttons.map(b => b.pressed), prev = padPrev[i] || [];
      const hit = k => now[k] && !prev[k];
      padPrev[i] = now;
      if (hit(9)) togglePause();
      if (G && state === 'play' && (hit(3) || hit(4) || hit(5))) tryUlt(G.coop && !G.online ? i : G.localIdx || 0);
      if (state === 'levelup') {
        for (let k = 0; k < 4; k++) if (hit(k)) { pickIndex(k); break; }
        if (hit(5)) rerollPick();
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
  // Aviso grande (aparte del toast, para que no lo tape otro mensaje) cuando cae un compañero.
  let alertTimer = 0;
  function deathAlert(msg, sub, localOnly) {
    if (!localOnly) netOut(['d', msg, sub]);
    const t = $('deathAlert');
    t.innerHTML = '';
    const b = document.createElement('b'); b.textContent = msg; t.appendChild(b);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; t.appendChild(s); }
    t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => t.classList.add('hidden'), 3800);
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
    if (!e.boss) dieFx(e);
    G.kills++;
    sfx('kill', 0.04);
    burst(e.x, e.y, e.color, e.boss ? 50 : e.elite ? 20 : 6, e.boss ? 260 : 120);
    dropGem(e.x, e.y, e.xp);
    if (e.elite || e.boss) G.pickups.push({ type: 'cofre', x: e.x, y: e.y, t: 0 });
    else {
      // Trébol de la Suerte: el mejor del grupo multiplica las probabilidades de botín.
      const lk = 1 + Math.max(0, ...G.players.map(p => p.stats.luck || 0));
      const r = Math.random();
      if (r < 0.010 * lk) G.pickups.push({ type: 'carne', x: e.x, y: e.y, t: 0 });
      else if (r < 0.014 * lk) G.pickups.push({ type: 'iman', x: e.x, y: e.y, t: 0 });
      else if (r < 0.05 * lk) dropCoin(e.x, e.y);
    }
    // Colmillo Vampírico: cura a quien esté cerca.
    for (const p of G.players) {
      if (p.down || !p.stats.leech || dist2(p.x, p.y, e.x, e.y) > 450 * 450) continue;
      if (Math.random() < p.stats.leech) p.hp = Math.min(p.maxHp, p.hp + 3);
    }
    if (e.boss) {
      // Si quedaba otro jefe vivo, su barra sigue en pantalla.
      if (G.boss === e) G.boss = G.enemies.find(o => o.boss && !o.dead) || null;
      G.shake = 14; G.bossKills++;
      if (e.final) endGame(true);
      else {
        toast(`¡Has derrotado a ${e.name}!`);
      }
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
    const st = p.stats;
    // Capa Sombría: a veces esquivas el golpe.
    if (st.dodge && Math.random() < st.dodge) { p.inv = 0.3; addText(p.x, p.y - 26, '¡Esquivado!', '#b8c7ff'); return; }
    // Cristal de Maná: el escudo, si está cargado, bloquea el golpe entero.
    if (st.mana && (p.manaT || 0) <= 0) {
      p.manaT = 15 - 2 * st.mana; p.inv = 0.5;
      addText(p.x, p.y - 26, '¡Bloqueado!', '#9fd0ff');
      burst(p.x, p.y, '#9fd0ff', 14, 160);
      sfx('zap', 0.1);
      return;
    }
    // Cota de Espinas: devuelve daño a lo que te rodea.
    if (st.thorns) {
      query(p.x, p.y, 110, e => {
        const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
        // Escala con el nivel del jugador para no quedarse corta cuando los enemigos ganan vida.
        hurt(e, st.thorns * st.dmg * (1 + 0.08 * p.level), kx / l, ky / l, 260);
      });
      G.effects.push({ type: 'ring', x: p.x, y: p.y, R: 110, color: '#7bc96f', life: 0.4, max: 0.4 });
      netOut(['r', Math.round(p.x), Math.round(p.y), 110, '#7bc96f']);
    }
    // Modo Hardcore: todo pega más. La armadura resta daño, pero cada golpe hace al menos el 30%.
    d *= G.dmgMul || 1;
    const dmg = Math.max(1, d * 0.3, d - p.stats.armor);
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
      sfx('warn');
      deathAlert(`💀 ¡${(G.names && G.names[p.idx]) || pname(p)} ha muerto!`, 'Quédate a su lado para reanimarlo');
    } else {
      p.hp = 0; p.down = true;
      endGame(false);
    }
  }

  // ---------- Armas ----------
  // ---------- Armas principales ----------
  // Daño: +25% por nivel en partida y +15% por cada nivel del objeto equipado.
  const mainMul = w => (1 + 0.25 * (w.lvl - 1)) * (1 + 0.15 * ((w.ilvl || 1) - 1));
  const aimAt = (p, t) => {
    const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.face.y, p.face.x);
    // Se guarda para dibujar el arma apuntando hacia donde dispara.
    if (t) { p.aimA = a; p.aimT = G.time; }
    return a;
  };
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
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.12), { spd: 520, dmg: 13 * mainMul(w) * s.dmg, life: 1.0, color: '#ffe9a8' });
      sfx('pew', 0.08);
    },
    revolver(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 520)[0];
      if (!t) { w.t = 0.15; return; }
      w.t = (0.85 - 0.05 * (w.lvl - 1)) * s.cd;
      const n = 1 + (w.lvl >= 4 ? 1 : 0) + s.proj, a = aimAt(p, t);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.1), { spd: 620, r: 5, dmg: 19 * mainMul(w) * s.dmg, life: 1.0, pierce: 1, color: '#ffcf7a', kb: 160 });
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
          { spd: 650 * rand(0.9, 1.1), r: 3.5, dmg: 11 * mainMul(w) * s.dmg, life: 0.34, color: '#ffd27a', kb: 260 });
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
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.15) + rand(-0.14, 0.14), { spd: 650, r: 3, dmg: 7 * mainMul(w) * s.dmg, life: 0.7, color: '#bfe9ff', kb: 40 });
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
        shootBala(p, aimAt(p, t), { spd: 1400, r: 5, dmg: 98 * mainMul(w) * s.dmg, life: 0.65, pierce: 99, color: '#9dffef', kb: 220 });
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
      const arcs = 1 + s.proj, arc = 2.2, dmg = 16 * mainMul(w) * s.dmg, base = aimAt(p, t);
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
        G.bullets.push({ kind: 'cohete', x: p.x, y: p.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 6, dmg: 25 * mainMul(w) * s.dmg, R, life: 2.2 });
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
          t: 0, out: 0.55, r: 15 * Math.sqrt(s.area), dmg: 38 * mainMul(w) * s.dmg, hits: new Map(), life: 5, rot: 0,
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
      const dmg = 13 * mainMul(w) * s.dmg;
      for (let k = 0; k <= s.proj; k++) {
        // Con proyectiles extra golpea otra vez un instante después.
        later(k * 0.18, () => {
          if (p.down) return;
          query(p.x, p.y, R, e => {
            const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
            hurt(e, dmg, kx / l, ky / l, 320);
          });
          G.effects.push({ type: 'ring', x: p.x, y: p.y, R, life: 0.4, max: 0.4 });
          netOut(['r', Math.round(p.x), Math.round(p.y), Math.round(R)]);
          G.shake = Math.max(G.shake, 5);
          sfx('boom', 0.05);
        });
      }
    },
    // Katana Nichirin: tajo amplio de agua, más rápido que la katana normal.
    nichirin(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const R = (100 + (w.lvl >= 3 ? 15 : 0) + (w.lvl >= 5 ? 15 : 0)) * s.area;
      const t = nearest(p.x, p.y, 1, R + 20)[0];
      if (!t) { w.t = 0.1; return; }
      w.t = (0.7 - 0.04 * (w.lvl - 1)) * s.cd;
      const arcs = 1 + s.proj, arc = 2.6, dmg = 13 * mainMul(w) * s.dmg, base = aimAt(p, t);
      for (let k = 0; k < arcs; k++) {
        const a = base + k * TAU / arcs;
        query(p.x, p.y, R, e => {
          let da = Math.atan2(e.y - p.y, e.x - p.x) - a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > arc / 2) return;
          const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
          hurt(e, dmg, kx / l, ky / l, 200);
        });
        G.effects.push({ type: 'slash', x: p.x, y: p.y, a, R, arc, life: 0.24, max: 0.24, color: '#5ad1ff' });
        netOut(['k', Math.round(p.x), Math.round(p.y), r1(a), Math.round(R), arc, '#5ad1ff']);
      }
      sfx('slash', 0.1);
    },
    // Puño elástico: un brazo que se estira en línea recta y golpea a todo lo que hay en el camino.
    gomu(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const R = (230 + (w.lvl >= 3 ? 40 : 0) + (w.lvl >= 5 ? 40 : 0)) * s.area, hh = 18 * Math.sqrt(s.area);
      const tg = nearest(p.x, p.y, 1, R)[0];
      if (!tg) { w.t = 0.12; return; }
      w.t = (0.9 - 0.04 * (w.lvl - 1)) * s.cd;
      const dmg = 12 * mainMul(w) * s.dmg, a0 = aimAt(p, tg);
      for (let k = 0; k <= s.proj; k++) {
        const a = a0 + spreadA(k, s.proj + 1, 0.35), ux = Math.cos(a), uy = Math.sin(a);
        query(p.x + ux * R / 2, p.y + uy * R / 2, R / 2 + hh, e => {
          const rx = e.x - p.x, ry = e.y - p.y, along = rx * ux + ry * uy, across = Math.abs(rx * uy - ry * ux);
          if (along < -e.r || along > R + e.r || across > hh + e.r) return;
          hurt(e, dmg, ux, uy, 240);
        });
        G.effects.push({ type: 'punch', x: p.x, y: p.y, a, R, life: 0.28, max: 0.28 });
        netOut(['p', Math.round(p.x), Math.round(p.y), r1(a), Math.round(R)]);
      }
      sfx('slash', 0.1);
    },
    // Destello Negro: golpe a tu alrededor; uno de cada cuatro es un destello que hace daño x2,5.
    destello(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const R = (90 + (w.lvl >= 3 ? 12 : 0) + (w.lvl >= 5 ? 12 : 0)) * s.area;
      if (!nearest(p.x, p.y, 1, R)[0]) { w.t = 0.1; return; }
      w.t = (1.1 - 0.05 * (w.lvl - 1)) * s.cd;
      for (let k = 0; k <= s.proj; k++) {
        const crit = Math.random() < 0.25, dmg = 12 * mainMul(w) * s.dmg * (crit ? 2.5 : 1), col = crit ? '#ff2d55' : '#6a5acd';
        later(k * 0.16, () => {
          if (p.down) return;
          query(p.x, p.y, R, e => {
            const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
            hurt(e, dmg, kx / l, ky / l, crit ? 320 : 180);
          });
          G.effects.push({ type: 'ring', x: p.x, y: p.y, R, life: 0.35, max: 0.35, color: col });
          netOut(['r', Math.round(p.x), Math.round(p.y), Math.round(R), col]);
          if (crit) G.shake = Math.max(G.shake, 5);
          sfx('boom', 0.05);
        });
      }
    },
    // Balón: un chut potente que atraviesa a tres enemigos y los aparta mucho.
    balon(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 500)[0];
      if (!t) { w.t = 0.15; return; }
      w.t = (0.9 - 0.04 * (w.lvl - 1)) * s.cd;
      const n = 1 + (w.lvl >= 4 ? 1 : 0) + s.proj, a = aimAt(p, t);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.22), { spd: 560, r: 8, dmg: 15 * mainMul(w) * s.dmg, life: 1.1, pierce: 3, color: '#ffffff', kb: 320, shape: 'ball' });
      sfx('disc', 0.1);
    },
    onda_ki(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const t = nearest(p.x, p.y, 1, 650)[0];
      if (!t) { w.t = 0.2; return; }
      w.t = (1.5 - 0.06 * (w.lvl - 1)) * s.cd;
      const n = 1 + s.proj, a = aimAt(p, t), r = (15 + (w.lvl >= 3 ? 4 : 0) + (w.lvl >= 5 ? 4 : 0)) * Math.sqrt(s.area);
      for (let i = 0; i < n; i++) shootBala(p, a + spreadA(i, n, 0.25), { spd: 600, r, dmg: 88 * mainMul(w) * s.dmg, life: 1.4, pierce: 99, color: '#7fdbff', kb: 200, shape: 'ki' });
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
      const dmg = (12 + 5 * lv) * (ev ? 1.8 : 1) * s.dmg;
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
      const dmg = (9 + 4 * lv) * (ev ? 1.5 : 1) * s.dmg, a = Math.atan2(p.face.y, p.face.x);
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
      const dmg = (16 + 7 * lv) * (ev ? 1.8 : 1) * s.dmg, a0 = aimAt(p, tg);
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
      const R = (38 + 4 * lv + (lv >= 3 ? 8 : 0) + (lv >= 5 ? 6 : 0)) * s.area * (ev ? 1.3 : 1);
      const dmg = (4 + 2.5 * lv) * (ev ? 1.4 : 1) * s.dmg;
      for (let i = 0; i < n; i++) {
        const t = ts[i % ts.length];
        G.bullets.push({ kind: 'charco', x: t.x + rand(-20, 20), y: t.y + rand(-20, 20), vx: 0, vy: 0, r: R, dmg, life: 3 + (lv >= 3 ? 1 : 0) + (ev ? 1 : 0), tick: 0, ev });
      }
      sfx('disc', 0.15);
    },
  });

  // Armas nuevas: cadena, torbellino, minas, espíritus y pisotón.
  Object.assign(W_UPDATE, {
    cadena(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const first = nearest(p.x, p.y, 1, 420)[0];
      if (!first) { w.t = 0.2; return; }
      w.t = (1.8 - 0.1 * lv - (lv >= 5 ? 0.15 : 0)) * s.cd * (ev ? 0.65 : 1);
      const jumps = (ev ? 8 : [3, 4, 4, 5, 5][lv - 1]) + s.proj;
      const dmg = (14 + 6 * lv + (lv >= 3 ? 5 : 0)) * (ev ? 1.8 : 1) * s.dmg, hop = (150 + (lv >= 3 ? 40 : 0)) * Math.sqrt(s.area);
      const hit = new Set(), pts = [Math.round(p.x), Math.round(p.y)];
      let cur = first;
      for (let i = 0; i < jumps && cur; i++) {
        hit.add(cur); pts.push(Math.round(cur.x), Math.round(cur.y));
        const cx = cur.x, cy = cur.y;
        hurt(cur, dmg);
        // Evolucionada, aturde un instante (los jefes no).
        if (ev && !cur.boss) cur.frz = Math.max(cur.frz, 0.4);
        let nx = null, nd = hop * hop;
        query(cx, cy, hop, e => { if (hit.has(e)) return; const d = dist2(e.x, e.y, cx, cy); if (d < nd) { nd = d; nx = e; } });
        cur = nx;
      }
      G.effects.push({ type: 'chain', pts, ev, life: 0.25, max: 0.25 });
      netOut(['c', pts, ev ? 1 : 0]);
      sfx('zap', 0.1);
    },
    torbellino(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const tg = nearest(p.x, p.y, 1, 450)[0];
      if (!tg) { w.t = 0.2; return; }
      w.t = (2.8 - 0.12 * lv - (lv >= 5 ? 0.25 : 0)) * s.cd * (ev ? 0.8 : 1);
      const n = (ev ? 3 : [1, 1, 2, 2, 2][lv - 1]) + s.proj, a0 = aimAt(p, tg);
      const r = (18 + (lv >= 4 ? 6 : 0)) * Math.sqrt(s.area) * (ev ? 1.35 : 1);
      const dmg = (6 + 3 * lv) * (ev ? 1.5 : 1) * s.dmg;
      for (let i = 0; i < n; i++) {
        const a = a0 + spreadA(i, n, 0.5);
        G.bullets.push({
          kind: 'bala', x: p.x, y: p.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r, dmg,
          life: 3.2 + (lv >= 4 ? 1 : 0) + (ev ? 1 : 0), pierce: 1e9, hit: new Set(), hits: new Map(), rehit: 0.4,
          color: ev ? '#c9a3ff' : '#dff1ff', kb: 40, shape: 'tornado', ev, slow: ev ? 0.8 : 0,
        });
      }
      sfx('disc', 0.15);
    },
    minas(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      w.t = (2.4 - 0.1 * lv - (lv >= 5 ? 0.25 : 0)) * s.cd * (ev ? 0.7 : 1);
      const n = (ev ? 3 : [1, 1, 1, 2, 2][lv - 1]) + s.proj;
      const R = (60 + 5 * lv + (lv >= 3 ? 15 : 0)) * s.area * (ev ? 1.3 : 1);
      const dmg = (18 + 7 * lv) * (ev ? 1.25 : 1) * s.dmg;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = rand(25, 90);
        G.bullets.push({
          kind: 'bala', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: 0, vy: 0, r: 11, R, dmg,
          life: 10, pierce: 0, hit: new Set(), color: '#ff4d4d', kb: 0, shape: 'mine', ev, mine: true, arm: 0.5,
        });
      }
      sfx('disc', 0.2);
    },
    espiritus(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      if (!nearest(p.x, p.y, 1, 500).length) { w.t = 0.2; return; }
      w.t = (1.45 - 0.07 * lv) * s.cd * (ev ? 0.7 : 1);
      const n = (ev ? 4 : [1, 2, 2, 3, 3][lv - 1]) + s.proj;
      const dmg = (12 + 5 * lv + (lv >= 3 ? 6 : 0)) * (ev ? 1.6 : 1) * s.dmg;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rand(-0.3, 0.3);
        G.bullets.push({
          kind: 'bala', x: p.x, y: p.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, spd: 300, home: true, seek: 0,
          r: 7 * Math.sqrt(s.area), dmg, life: 3, pierce: ev ? 2 : lv >= 5 ? 1 : 0, hit: new Set(),
          color: ev ? '#ff7ab8' : '#9ff0ff', kb: 60, shape: 'wisp', ev, owner: p, leech: ev ? 1 : 0,
        });
      }
      sfx('shoot', 0.12);
    },
    terremoto(w, dt, p, s) {
      w.t -= dt;
      if (w.t > 0) return;
      const lv = w.lvl, ev = w.evolved;
      const R = (110 + 12 * lv + (lv >= 3 ? 15 : 0)) * s.area * (ev ? 1.3 : 1);
      if (!nearest(p.x, p.y, 1, R + 20).length) { w.t = 0.2; return; }
      w.t = (3.2 - 0.15 * lv - (lv >= 2 ? 0.15 : 0) - (lv >= 4 ? 0.15 : 0)) * s.cd * (ev ? 0.75 : 1);
      const dmg = (10 + 5 * lv) * (ev ? 1.5 : 1) * s.dmg;
      query(p.x, p.y, R, e => {
        const kx = e.x - p.x, ky = e.y - p.y, l = Math.hypot(kx, ky) || 1;
        hurt(e, dmg, kx / l, ky / l, 260);
        e.slow = Math.max(e.slow, 1.2);
        // Evolucionado, aturde (los jefes solo se ralentizan).
        if (ev && !e.boss) e.frz = Math.max(e.frz, 0.8);
      });
      const col = ev ? '#ffb347' : '#c58a4a';
      G.effects.push({ type: 'ring', x: p.x, y: p.y, R, color: col, life: 0.4, max: 0.4 });
      netOut(['r', Math.round(p.x), Math.round(p.y), Math.round(R), col]);
      burst(p.x, p.y, '#8b6a45', 12, 200);
      G.shake = Math.max(G.shake, 5);
      sfx('boom', 0.1);
    },
  });

  // Los espíritus giran poco a poco hacia el enemigo más cercano que aún no hayan golpeado.
  function steer(b, dt) {
    if (!b.tg || b.tg.dead || b.hit.has(b.tg)) {
      b.tg = null;
      b.seek -= dt;
      if (b.seek > 0) return;
      b.seek = 0.2;
      b.tg = nearest(b.x, b.y, 5, 420).find(e => !b.hit.has(e)) || null;
      if (!b.tg) return;
    }
    const cur = Math.atan2(b.vy, b.vx), d0 = Math.atan2(b.tg.y - b.y, b.tg.x - b.x) - cur;
    const d = Math.atan2(Math.sin(d0), Math.cos(d0)), a = cur + Math.max(-7 * dt, Math.min(7 * dt, d));
    b.vx = Math.cos(a) * b.spd; b.vy = Math.sin(a) * b.spd;
  }

  Object.assign(W_UPDATE, MAIN_UPDATE);

  // ---------- Subida de nivel ----------
  function buildOptions(p, count) {
    const o = [];
    for (const w of p.weapons) if (!w.evolved && w.lvl < WMAX) o.push({ k: 'w', id: w.id });
    if (p.weapons.length < SLOTS) for (const id in WEAPONS) if (!WEAPONS[id].main && !hasWeapon(p, id)) o.push({ k: 'nw', id });
    const owned = Object.keys(p.passives);
    for (const id of owned) if (p.passives[id] < PASSIVES[id].max) o.push({ k: 'p', id });
    if (owned.length < SLOTS) for (const id in PASSIVES) if (!p.passives[id]) o.push({ k: 'np', id });
    // Sorteo: todas pesan lo mismo; solo lo que salió en la subida anterior pesa menos,
    // para que no se repitan siempre las mismas.
    const key = q => (q.k === 'w' || q.k === 'nw' ? 'w:' : 'p:') + q.id;
    const recent = p.recentOpts || {};
    const pool = shuffle(o).map(q => ({ q, wt: recent[key(q)] ? 0.3 : 1 }));
    const r = [];
    while (r.length < count && pool.length) {
      // Todas las mejoras tienen la misma probabilidad (sin forzar la mezcla de armas y pasivas).
      const cand = pool;
      let x = Math.random() * cand.reduce((a, c) => a + c.wt, 0), ch = cand[cand.length - 1];
      for (const c of cand) { x -= c.wt; if (x <= 0) { ch = c; break; } }
      r.push(ch.q);
      pool.splice(pool.indexOf(ch), 1);
    }
    p.recentOpts = {};
    for (const q of r) p.recentOpts[key(q)] = true;
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
  function renderChoices(titleHtml, descs, onPick, rerolls = 0) {
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
    // Botón para volver a sortear (una vez por partida).
    const rb = document.createElement('button');
    rb.className = 'reroll';
    rb.disabled = !(rerolls > 0);
    rb.innerHTML = rerolls > 0 ? '🎲 Cambiar opciones <span class="key">R</span>' : '🎲 Cambio de opciones ya usado';
    if (rerolls > 0) rb.addEventListener('click', () => rerollPick());
    box.appendChild(rb);
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
          if (!p.optsSent) { p.optsSent = true; Net.sendTo(slot, { t: 'lvl', lv: p.level - p.pending + 1, opts: p.opts.map(o => describe(p, o)), rr: p.rerolls }); }
        } else Net.sendTo(slot, { t: 'wait', who });
      }
      const me = G.p;
      if (me.opts) {
        if (G.lvShown !== me.opts) { G.lvShown = me.opts; G.chooserP = me; renderChoices(lvlTitle(me), me.opts.map(o => describe(me, o)), pickIndex, me.rerolls); }
      } else {
        G.lvShown = null;
        showWaiting(`Esperando a que ${listNames(choosing.map(p => G.names[p.idx]))} ${choosing.length > 1 ? 'elijan sus mejoras' : 'elija su mejora'}…`, PTEXT[choosing[0].idx]);
      }
      return;
    }
    const p = G.chooserP = choosing[0];
    if (G.lvShown === p.opts) return;
    G.lvShown = p.opts;
    renderChoices(lvlTitle(p) + (G.coop ? ` <span class="sub">(${esc(p.ch.name)})</span>` : ''), p.opts.map(o => describe(p, o)), pickIndex, p.rerolls);
  }

  // Vuelve a sortear las mejoras que se están eligiendo en esta pantalla (si aún le queda el cambio).
  function rerollPick() {
    if (state !== 'levelup' || !G) return;
    if (G.online === 'guest') {
      if (!G.guestOpts || !(G.guestRr > 0)) return;
      Sound.play('click');
      G.guestOpts = null; G.guestRr = 0;
      Net.send({ t: 'reroll' });
      showWaiting('Cambiando opciones…');
      return;
    }
    reroll(G.online === 'host' ? G.p : G.chooserP);
  }
  function reroll(p) {
    if (state !== 'levelup' || !p || !p.opts || !(p.rerolls > 0)) return;
    if (p.idx === G.localIdx || !G.online) Sound.play('click');
    p.rerolls--;
    p.opts = buildOptions(p, p.choices);
    p.optsSent = false;
    showLevelUp();
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

  // Los cofres (de élites y jefes) mejoran a todo el equipo: cada jugador recibe su propia mejora.
  // El oro extra se cuenta una sola vez.
  function openChestTeam() {
    G.gold += 10;
    G.players.filter(p => !p.gone).forEach((p, i) => openChest(p, i === 0 ? 10 : 0));
  }
  // `goldBonus` solo sirve para el aviso: el oro ya lo suma openChestTeam una vez.
  function openChest(p, goldBonus) {
    const gt = goldBonus ? ` · +${goldBonus} 🪙` : '';
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
      toast(`${ptag(p)}Cofre: ${d.icon} ${d.title} ${d.lvl}${gt}`);
    } else {
      heal(p, 50);
      toast(`${ptag(p)}Cofre: +50 de vida${gt}`);
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
    // Vida: x1,25 al empezar, x5,4 a los 5 min y x12,5 a los 10 min. Daño: +10% por minuto.
    const mins = G.time / 60;
    const hs = 1.25 * (1 + mins * 0.4 + mins * mins * 0.05) * map.hp * G.diffHp;
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
    e.id = ++G.eid; e.born = G.time;
    G.enemies.push(e);
    return e;
  }

  const BOSS_REF_LVL = [16, 33, 54, 71];
  function spawnBoss(b) {
    // Aparece a cierta distancia del grupo, por un lado al azar.
    const al = alive(), grp = al.length ? al : G.players.filter(p => !p.gone);
    const cx = grp.reduce((s, p) => s + p.x, 0) / grp.length, cy = grp.reduce((s, p) => s + p.y, 0) / grp.length;
    const an = rand(0, TAU), dd = Math.max(260, Math.min(VW, VH) * 0.42);
    const x = cx + Math.cos(an) * dd, y = cy + Math.sin(an) * dd;
    // La vida del jefe se adapta a lo fuertes que llegáis: el nivel medio comparado con el nivel
    // habitual a esa altura de la partida (x0,9 si vais flojos, x1,5 normal, hasta x2,25 si vais sobrados).
    const lv = al.length ? al.reduce((s, p) => s + p.level, 0) / al.length : 1;
    const refLv = BOSS_REF_LVL[BOSSES.indexOf(b)] || 30;
    const hp = b.hp * G.map.hp * G.diffBoss * 1.5 * Math.max(0.6, Math.min(1.5, lv / refLv));
    const e = {
      x, y, type: 'boss', r: b.r, hp, maxHp: hp, speed: b.speed * G.map.speed, dmg: b.dmg, xp: 60, color: b.color,
      flash: 0, kx: 0, ky: 0, slow: 0, frz: 0, boss: true, final: b.final, name: b.name, shots: b.shots,
      ai: b.ai || 'ring', variant: BOSSES.indexOf(b), shotT: 3, sumT: 2, chT: 4, mode: 0, wob: 0, phase: 0,
    };
    e.id = ++G.eid; e.born = G.time;
    G.enemies.push(e);
    G.boss = e;
    G.shake = 10;
    sfx('boss');
    toast(`⚠ ¡${b.name} ha aparecido!`);
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
      // Un enjambre alrededor de cada jugador en pie (más pequeño si hay varios).
      const n = Math.round((16 + Math.floor(t / 30)) * (G.players.length > 1 ? 0.6 : 1));
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
        p.inv -= dt; p.slowT = (p.slowT || 0) - dt; p.manaT = (p.manaT || 0) - dt;
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
      p.inv -= dt; p.slowT = (p.slowT || 0) - dt; p.manaT = (p.manaT || 0) - dt;
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
      if (e.charmT > 0) {
        // Enamorado (ulti de Alex): se aleja de ti tambaleándose, sin atacar ni hacer daño al tocarte.
        e.charmT -= dt;
        const w = Math.sin(e.wob * 0.8 + e.id) * 0.9, c = Math.cos(w), s = Math.sin(w);
        const ax = -mx, ay = -my, csp = e.speed * 0.65;
        e.x += ((ax * c - ay * s) * csp + e.kx) * dt;
        e.y += ((ax * s + ay * c) * csp + e.ky) * dt;
        e.kx -= e.kx * damp; e.ky -= e.ky * damp;
        continue;
      }
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
        // Los tiradores se paran a su alcance, pero ya no huyen: si te acercas, puedes alcanzarlos.
        const R = e.ranged.range;
        if (d < R * 0.85 && d > R * 0.4) sp = 0;
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
    // Tope de balas enemigas en pantalla: con muchos tiradores juntos ya no se forma una cortina imposible.
    if (G.ebullets.length > 45) { e.shotT = Math.max(e.shotT, 1); return; }
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

  // Los jefes atacan a menudo y, con la mitad
  // de la vida, se enfurecen: aún más rápidos, más proyectiles y se mueven más deprisa.
  const BOSS_PACE = 1.35, BOSS_RAGE_PACE = 1.75;
  function bossAI(e, dt, tg, ux, uy) {
    const aim = Math.atan2(uy, ux);
    if (!e.rage && e.hp < e.maxHp * 0.5) {
      e.rage = true;
      if (e.speed) e.speed *= 1.25;
      if (e.saveSpeed) e.saveSpeed *= 1.25;
      e.flash = 0.3; G.shake = Math.max(G.shake, 8);
      burst(e.x, e.y, e.color, 30, 220);
      toast(`💢 ¡${e.name} se enfurece!`);
      sfx('warn');
    }
    const pace = e.rage ? BOSS_RAGE_PACE : BOSS_PACE, extra = e.rage ? 4 : 0;
    // Los temporizadores de ataque corren más deprisa (los avisos del dragón duran lo mismo).
    const tdt = dt * pace;
    e.shotT -= tdt;
    if (e.ai === 'summon') {
      // Reina Araña: crías cada pocos segundos y anillos de telaraña que ralentizan.
      e.sumT -= tdt;
      if (e.sumT <= 0) { e.sumT = 5; summonAround(e, 'arana', 2 + G.players.length + (e.rage ? 2 : 0)); }
      if (e.shotT <= 0) { e.shotT = 2.8; bossRing(e, e.shots + extra, 150, 10, '#e8eaf5', { web: 1, r: 8 }); }
      return;
    }
    if (e.ai === 'charge') {
      // Dragón de Hueso: se prepara (brilla), embiste y escupe fuego en abanico al acabar.
      e.chT -= tdt;
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
          bossFan(e, aim, e.shots + (e.rage ? 2 : 0), 0.16, 210, 16, '#ffb347', 9);
          G.shake = Math.max(G.shake, 6); sfx('boom', 0.1);
        }
      }
      if (e.mode === 0 && e.shotT <= 0) { e.shotT = 3.2; bossRing(e, 10 + extra, 150, 13, e.color); }
      return;
    }
    if (e.shotT > 0) return;
    e.shotT = e.final ? 1.8 : 2.6;
    bossRing(e, e.shots + extra, 160, e.final ? 18 : 12, e.color);
    // Además, todos los jefes de anillos lanzan una ráfaga dirigida (el Rey, más grande).
    if (e.ai === 'king') bossFan(e, aim, e.rage ? 5 : 3, 0.15, 230, 22, '#ffd75e');
    else bossFan(e, aim, e.rage ? 3 : 1, 0.18, 220, 14, e.color);
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
        if (b.mine) {
          // Mina: tras armarse, explota en cuanto la pisa un enemigo.
          b.arm -= dt;
          if (b.arm <= 0) query(b.x, b.y, b.r + 4, () => { if (!b.dead) { b.dead = true; explode(b); } });
          continue;
        }
        if (b.home) steer(b, dt);
        b.x += b.vx * dt; b.y += b.vy * dt;
        query(b.x, b.y, b.r, e => {
          if (b.dead) return;
          if (b.rehit) {
            // Golpea varias veces al mismo enemigo, con una pausa entre golpes.
            if (G.time - (b.hits.get(e) ?? -9) < b.rehit) return;
            b.hits.set(e, G.time);
          } else {
            if (b.hit.has(e)) return;
            b.hit.add(e);
          }
          const l = Math.hypot(b.vx, b.vy) || 1;
          hurt(e, b.dmg, b.vx / l, b.vy / l, b.kb);
          if (b.slow) e.slow = Math.max(e.slow, b.slow);
          if (b.leech && !b.owner.down) b.owner.hp = Math.min(b.owner.maxHp, b.owner.hp + b.leech);
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
      } else if (k.type === 'cofre') openChestTeam();
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

  // Acciones retrasadas con el reloj de la partida (no con setTimeout): en pausa se detienen
  // y no pueden caer en otra partida.
  function later(delay, fn) { (G.later || (G.later = [])).push({ t: G.time + delay, fn }); }
  function runLater() {
    if (!G.later || !G.later.length) return;
    const due = G.later.filter(x => x.t <= G.time);
    if (!due.length) return;
    G.later = G.later.filter(x => x.t > G.time);
    for (const x of due) x.fn();
  }

  function update(dt) {
    // Instante congelado tras un golpe fuerte de ulti.
    if (G.hitstop > 0) { G.hitstop -= dt; return; }
    // Cámara lenta un instante al lanzar una definitiva.
    if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.4; }
    G.time += dt;
    runLater();
    buildGrid();
    updatePlayers(dt);
    spawner(dt);
    updateEnemies(dt);
    buildGrid();
    for (const p of G.players) {
      if (!p.down) for (const w of p.weapons) W_UPDATE[w.id](w, dt, p, p.stats);
    }
    updateBullets(dt);
    updateUlts(dt);
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
      // Castillo Vampiro
      case 'candle': {
        ctx.fillStyle = 'rgba(80,60,70,.6)'; ctx.fillRect(x - 6, y + 2, 12, 3); ctx.fillRect(x - 1, y - 8, 2, 10);
        ctx.fillStyle = 'rgba(240,225,200,.55)'; ctx.fillRect(x - 6, y - 8, 3, 8); ctx.fillRect(x + 3, y - 8, 3, 8);
        const fl = Math.sin((G ? G.time : menuT) * 9 + x) * 1.2;
        ctx.fillStyle = 'rgba(255,180,80,.18)'; ctx.beginPath(); ctx.arc(x, y - 12, 12, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,90,.9)';
        ctx.beginPath(); ctx.ellipse(x - 4.5, y - 11 + fl * 0.3, 1.6, 3 + fl * 0.4, 0, 0, TAU); ctx.ellipse(x + 4.5, y - 11 - fl * 0.3, 1.6, 3 - fl * 0.4, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'coffin':
        ctx.fillStyle = 'rgba(70,30,40,.55)';
        ctx.beginPath(); ctx.moveTo(x - 6, y - 14); ctx.lineTo(x + 6, y - 14); ctx.lineTo(x + 9, y - 6); ctx.lineTo(x + 5, y + 12); ctx.lineTo(x - 5, y + 12); ctx.lineTo(x - 9, y - 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(200,170,90,.45)'; ctx.fillRect(x - 0.8, y - 9, 1.6, 10); ctx.fillRect(x - 3.5, y - 6, 7, 1.6);
        break;
      case 'window':
        ctx.fillStyle = 'rgba(60,40,70,.5)';
        ctx.beginPath(); ctx.moveTo(x - 8, y + 8); ctx.lineTo(x - 8, y - 6); ctx.quadraticCurveTo(x, y - 18, x + 8, y - 6); ctx.lineTo(x + 8, y + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(200,60,90,.28)'; ctx.fillRect(x - 6, y - 5, 5, 11);
        ctx.fillStyle = 'rgba(90,120,220,.28)'; ctx.fillRect(x + 1, y - 5, 5, 11);
        break;
      // Abismo Marino
      case 'coral':
        ctx.strokeStyle = 'rgba(255,120,150,.4)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 6); ctx.lineTo(x - 6, y - 12); ctx.moveTo(x, y - 2); ctx.lineTo(x + 7, y - 9); ctx.lineTo(x + 7, y - 15); ctx.moveTo(x, y - 6); ctx.lineTo(x + 2, y - 14);
        ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = 'rgba(255,190,210,.5)'; ctx.beginPath(); ctx.arc(x - 6, y - 12, 1.8, 0, TAU); ctx.arc(x + 7, y - 15, 1.8, 0, TAU); ctx.arc(x + 2, y - 14, 1.5, 0, TAU); ctx.fill();
        break;
      case 'seaweed': {
        const sw = Math.sin((G ? G.time : menuT) * 1.5 + x * 0.05) * 3;
        ctx.strokeStyle = 'rgba(60,170,110,.38)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const k of [-4, 3]) { ctx.beginPath(); ctx.moveTo(x + k, y + 6); ctx.quadraticCurveTo(x + k + sw, y - 6, x + k - sw * 0.5, y - 18 + Math.abs(k)); ctx.stroke(); }
        ctx.lineCap = 'butt';
        break;
      }
      case 'shell':
        ctx.fillStyle = 'rgba(255,215,190,.35)';
        ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.arc(x, y + 4, 8, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(160,110,90,.4)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = -2; i <= 2; i++) { ctx.moveTo(x, y + 4); ctx.lineTo(x + i * 3, y - 3); }
        ctx.stroke();
        break;
      // Volcán Infernal
      case 'lava': {
        const p = 0.6 + Math.sin((G ? G.time : menuT) * 2 + x) * 0.25;
        ctx.strokeStyle = `rgba(255,110,30,${0.45 * p})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 14, y - 2); ctx.lineTo(x - 5, y + 2); ctx.lineTo(x + 2, y - 3); ctx.lineTo(x + 12, y + 3); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x - 3, y + 9); ctx.stroke();
        ctx.strokeStyle = `rgba(255,220,120,${0.5 * p})`; ctx.lineWidth = 1; ctx.stroke(); ctx.lineCap = 'butt';
        break;
      }
      case 'basalt':
        ctx.fillStyle = 'rgba(40,24,22,.75)';
        ctx.beginPath(); ctx.moveTo(x - 11, y + 5); ctx.lineTo(x - 7, y - 8); ctx.lineTo(x - 1, y - 11); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 11, y + 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,30,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x - 1, y); ctx.lineTo(x + 3, y + 4); ctx.stroke();
        break;
      case 'skull':
        ctx.fillStyle = 'rgba(220,200,170,.28)';
        ctx.beginPath(); ctx.arc(x, y - 2, 6, 0, TAU); ctx.fill(); ctx.fillRect(x - 3.5, y + 2, 7, 4);
        ctx.fillStyle = 'rgba(22,10,8,.7)'; ctx.beginPath(); ctx.arc(x - 2.3, y - 2, 1.6, 0, TAU); ctx.arc(x + 2.3, y - 2, 1.6, 0, TAU); ctx.fill();
        break;
      // Base Lunar
      case 'crater':
        ctx.fillStyle = 'rgba(140,150,190,.14)'; ctx.beginPath(); ctx.ellipse(x, y, 14, 8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,10,.35)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 1, 10, 5.5, 0, 0, TAU); ctx.fill();
        break;
      case 'antenna': {
        ctx.strokeStyle = 'rgba(170,180,210,.45)'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(x - 6, y + 6); ctx.lineTo(x, y - 10); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 3, y - 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - 12, 5, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
        const on = Math.floor((G ? G.time : menuT) * 1.5 + x) % 2 === 0;
        ctx.fillStyle = on ? 'rgba(255,80,80,.9)' : 'rgba(255,80,80,.25)'; ctx.beginPath(); ctx.arc(x, y - 10, 1.8, 0, TAU); ctx.fill();
        break;
      }
      case 'flag':
        ctx.fillStyle = 'rgba(190,195,215,.45)'; ctx.fillRect(x - 1, y - 16, 1.8, 20);
        ctx.fillStyle = 'rgba(230,230,240,.35)'; ctx.fillRect(x + 1, y - 16, 12, 8);
        ctx.fillStyle = 'rgba(90,120,220,.45)'; ctx.fillRect(x + 1, y - 16, 5, 4);
        break;
      case 'snow':
        ctx.fillStyle = 'rgba(220, 240, 255, .14)'; ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU); ctx.arc(x + 9, y + 3, 1.5, 0, TAU); ctx.arc(x + 3, y + 9, 2.5, 0, TAU); ctx.fill(); break;
    }
  }

  function drawGround() {
    const map = G.map, S_ = 96;
    // Manchas suaves de terreno (más claras y más oscuras) para que el suelo no sea plano.
    const P = 260;
    for (let tx = Math.floor(camX / P) - 1; tx <= Math.floor((camX + CVW) / P) + 1; tx++) {
      for (let ty = Math.floor(camY / P) - 1; ty <= Math.floor((camY + CVH) / P) + 1; ty++) {
        const h = hash(tx + 911, ty - 377);
        if (h % 3 === 0) continue;
        ctx.fillStyle = h % 3 === 1 ? map.grid : 'rgba(0,0,0,.12)';
        ctx.globalAlpha = h % 3 === 1 ? 0.35 : 1;
        ctx.beginPath();
        ctx.ellipse(tx * P + (h >>> 6) % P, ty * P + (h >>> 14) % P, 60 + (h >>> 20) % 70, 30 + (h >>> 10) % 40, ((h >>> 3) % 6) * 0.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // Rejilla de puntos en lugar de líneas: da sensación de movimiento sin ensuciar.
    ctx.fillStyle = map.grid;
    for (let x = Math.floor(camX / S_) * S_; x < camX + CVW + S_; x += S_) {
      for (let y = Math.floor(camY / S_) * S_; y < camY + CVH + S_; y += S_) {
        ctx.fillRect(x - 3, y - 0.75, 6, 1.5); ctx.fillRect(x - 0.75, y - 3, 1.5, 6);
      }
    }
    const T = 150;
    for (let tx = Math.floor(camX / T) - 1; tx <= Math.floor((camX + CVW) / T) + 1; tx++) {
      for (let ty = Math.floor(camY / T) - 1; ty <= Math.floor((camY + CVH) / T) + 1; ty++) {
        const h = hash(tx, ty), kind = h % 7;
        if (kind > 2) continue;
        drawDecor(map.decor[kind], tx * T + (h >>> 8) % T, ty * T + (h >>> 16) % T, h);
      }
    }
  }

  // ---------- Estilo de dibujo: "tinta y luna" ----------
  // Todo lleva contorno de tinta y la luz de la luna llega desde arriba a la izquierda:
  // brillo arriba, sombra abajo. Así los sprites se leen bien sobre cualquier suelo oscuro.
  const INK = '#16122b';
  const FONT_D = '"Grenze Gotisch", Georgia, serif';
  const FONT_U = 'Nunito, system-ui, sans-serif';
  const _tones = new Map();
  // k > 0 aclara hacia el blanco; k < 0 oscurece hacia la tinta.
  function tone(hex, k) {
    if (typeof hex !== 'string' || hex[0] !== '#') return hex;
    const key = hex + k;
    let v = _tones.get(key);
    if (v) return v;
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16);
    let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    else { const t = -k; r += (22 - r) * t; g += (18 - g) * t; b += (43 - b) * t; }
    v = `rgb(${r | 0},${g | 0},${b | 0})`;
    _tones.set(key, v);
    return v;
  }
  // Mientras se dibuja un enemigo golpeado, todos sus colores pasan a blanco (el contorno no).
  let FLASH = false;
  const C = col => FLASH ? '#ffffff' : col;
  function ink(w = 2) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function paint(col, w = 2) { ctx.fillStyle = C(col); ctx.fill(); if (w) ink(w); }
  function gloss(x, y, rx, ry, rot = -0.5, a = 0.45) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill();
  }
  // Línea con contorno: primero el trazo de tinta, luego el color encima.
  function inkLine(col, w, draw) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); draw(); ctx.strokeStyle = INK; ctx.lineWidth = w + 2.4; ctx.stroke();
    ctx.beginPath(); draw(); ctx.strokeStyle = C(col); ctx.lineWidth = w; ctx.stroke();
  }

  function shadow(x, y, r) {
    ctx.fillStyle = 'rgba(4,3,14,.38)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.95, r * 0.32, 0, 0, TAU); ctx.fill();
  }

  // Ojos "monigote": óvalo de tinta con un brillo blanco.
  function cuteEyes(ox, oy, s, gap) {
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(ox - gap, oy, s * 0.62, s * 0.85, 0, 0, TAU); ctx.ellipse(ox + gap, oy, s * 0.62, s * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ox - gap - s * 0.18, oy - s * 0.3, s * 0.26, 0, TAU); ctx.arc(ox + gap - s * 0.18, oy - s * 0.3, s * 0.26, 0, TAU); ctx.fill();
  }
  // Ojos que brillan (monstruos): color propio con un punto blanco.
  function glowEyes(ox, oy, s, gap, col, slant = 0) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(ox - gap, oy, s, s * 0.7, slant, 0, TAU);
    ctx.ellipse(ox + gap, oy, s, s * 0.7, -slant, 0, TAU);
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.35); ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ox - gap - s * 0.25, oy - s * 0.2, s * 0.3, 0, TAU); ctx.arc(ox + gap - s * 0.25, oy - s * 0.2, s * 0.3, 0, TAU); ctx.fill();
  }
  // Compatibilidad con los dibujos antiguos (eyes(x, y, tamaño, color de brillo)).
  function eyes(ox, oy, s, glow) {
    if (glow) glowEyes(ox, oy, s * 0.8, s, glow);
    else cuteEyes(ox, oy, s, s);
  }

  // Patas articuladas de araña (enemigo y reina).
  function spiderLegs(e, r, col, w) {
    for (let i = 0; i < 4; i++) {
      const k = Math.sin(e.wob * 2 + i * 1.3) * 0.22, y0 = -r * 0.2 + i * r * 0.22;
      for (const sd of [-1, 1]) {
        const kk = sd > 0 ? k : -k;
        inkLine(col, w, () => {
          ctx.moveTo(sd * r * 0.35, y0);
          ctx.lineTo(sd * r * (1.15 + i * 0.05), y0 - r * (0.75 - i * 0.18) + kk * r);
          ctx.lineTo(sd * r * (1.75 + i * 0.08), y0 + r * (0.35 + i * 0.12) + kk * r);
        });
      }
    }
  }

  // Está avisando de un ataque (lobo o dragón preparando la embestida, calabaza con la mecha encendida).
  const isWarn = e => e.mode === 1 || (e.bomb && e.fuse >= 0);
  // Caché de sprites: cada enemigo común se dibuja una vez por fotograma de animación y luego
  // se copia como imagen. Con cientos de monstruos en pantalla, redibujar los contornos cuesta mucho.
  // ---------- Sprites generados (Hugging Face / FLUX) ----------
  // Si una imagen no carga, se usa el dibujo a mano de siempre.
  // dir: hacia dónde mira la imagen original (1 derecha, -1 izquierda).
  const HERO_IMG_DIR = { marc: 1, salim: 1, alex: 1, pol: 1, igor: -1, ivan: -1 };
  // Enemigos: tamaño en radios (alto «h» o ancho «w»), color base de la imagen (para teñirla en cada mapa) y dirección.
  // base: color de la imagen en el bosque (los demás mapas la tiñen); sin base, la imagen no se tiñe.
  const ENEMY_IMG = {
    slime: { h: 2.6, base: '#5fd068', dir: -1 },
    murcielago: { w: 4.4, base: '#a77bf3', dir: 1 },
    espectro: { h: 2.7, base: '#7fd6ff', dir: -1 },
    bruto: { h: 3.0, base: '#ff6b5b', dir: -1 },
    escupidor: { h: 2.9, dir: -1 },
    brujo: { h: 3.0, dir: -1 },
    arana: { w: 4.0, dir: 1 },
    lobo: { w: 4.3, dir: -1 },
    calabaza: { h: 2.8, dir: 1 },
    golem: { h: 2.6, dir: 1 },
    invocador: { h: 3.0, dir: -1 },
    // Jefes: Reina Araña, Coloso de Obsidiana, Dragón de Hueso y Rey del Abismo.
    boss0: { w: 3.5, dir: 1 },
    boss1: { h: 3.1, dir: 1 },
    boss2: { w: 3.8, dir: 1 },
    boss3: { h: 3.3, dir: 1 },
  };
  const imgKey = e => (e.boss ? 'boss' + (e.variant ?? 3) : e.type);
  const IMGS = {};
  function loadImg(id) {
    const im = new Image();
    im.onload = () => {
      IMGS[id] = im; sprites.clear();
      if (!G && !$('select').classList.contains('hidden')) renderSelect();
    };
    im.src = `sprites/${id}.png?v=2`;
  }
  for (const id in HERO_IMG_DIR) loadImg(id);
  for (const id in ENEMY_IMG) loadImg(id);
  function hueOf(hex) {
    const n = parseInt(hex.slice(1, 7), 16), r = (n >> 16 & 255) / 255, gg = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    return h * 60;
  }

  const SPRITE_TYPES = new Set(['slime', 'murcielago', 'espectro', 'bruto', 'brujo', 'arana', 'lobo', 'calabaza', 'golem', 'invocador']);
  const SPR_N = 32, SPR_P = 4 * Math.PI;   // todas las animaciones se repiten cada 4π de "wob"
  // Hasta dónde llega cada sprite (en radios): mitad del ancho, arriba y abajo.
  const SPR_EXT = {
    slime: [1.15, 1.05, 0.85], murcielago: [2.35, 1.4, 0.7], espectro: [1.1, 1.25, 1.35], bruto: [1.5, 1.6, 1.05],
    brujo: [1.85, 1.9, 1.15], arana: [2.0, 1.15, 1.3], lobo: [2.1, 1.5, 1.05], calabaza: [1.15, 1.35, 0.95],
    golem: [1.6, 1.1, 1.05], invocador: [1.75, 1.45, 1.55],
  };
  const sprites = new Map();
  let sprK = 0;
  function enemySprite(e, r, f, flash) {
    // Misma escala que la pantalla, para copiar el sprite píxel a píxel sin reescalarlo.
    const k = Math.min(window.devicePixelRatio || 1, 2) * ZOOM;
    if (k !== sprK) { sprites.clear(); sprK = k; }
    const im = IMGS[e.type], fit = ENEMY_IMG[e.type];
    const key = e.type + e.color + (r * 4 | 0) + '|' + (im ? 0 : f) + (flash ? 'f' : '');
    let s = sprites.get(key);
    if (s) return s;
    if (sprites.size > 1200) sprites.clear();
    if (im) {
      // Imagen: se escala una vez a la resolución de la pantalla, mirando a la derecha y teñida con el color del mapa.
      const dh = fit.h ? fit.h * r : fit.w * r * im.height / im.width, dw = dh * im.width / im.height;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(dw * k)); c.height = Math.max(1, Math.round(dh * k));
      const pc = c.getContext('2d');
      if (fit.dir < 0) { pc.translate(c.width, 0); pc.scale(-1, 1); }
      const hr = fit.base && e.color ? ((hueOf(e.color) - hueOf(fit.base)) % 360 + 360) % 360 : 0;
      if (hr > 4 && hr < 356) pc.filter = `hue-rotate(${hr | 0}deg)`;
      pc.drawImage(im, 0, 0, c.width, c.height);
      pc.filter = 'none';
      if (flash) { pc.setTransform(1, 0, 0, 1, 0, 0); pc.globalCompositeOperation = 'source-atop'; pc.fillStyle = 'rgba(255,255,255,.85)'; pc.fillRect(0, 0, c.width, c.height); }
      s = { c, x: -dw / 2, y: r * 0.95 - dh, w: dw, h: dh };
      sprites.set(key, s);
      return s;
    }
    const [ex, et, eb] = SPR_EXT[e.type], pad = 4;
    const w = Math.ceil((ex * r + pad) * k) / k, top = Math.ceil((et * r + pad) * k) / k, bot = Math.ceil((eb * r + pad) * k) / k;
    const c = document.createElement('canvas');
    c.width = Math.round(w * 2 * k); c.height = Math.round((top + bot) * k);
    const pc = c.getContext('2d');
    pc.scale(k, k); pc.translate(w, top);
    const saved = ctx;
    ctx = pc; FLASH = flash;
    drawEnemyBody({ type: e.type, color: e.color, r, wob: f * SPR_P / SPR_N, warn: false, flash: flash ? 1 : 0 }, e.color, r, r * 0.25, 1, Math.max(1.8, Math.min(4, r * 0.14)), 0);
    ctx = saved; FLASH = false;
    if (!flash) {
      // Volumen: luz arriba a la izquierda y sombra abajo a la derecha, solo sobre el dibujo.
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.globalCompositeOperation = 'source-atop';
      const sg = pc.createLinearGradient(0, 0, c.width * 0.7, c.height);
      sg.addColorStop(0, 'rgba(255,250,235,.22)'); sg.addColorStop(0.45, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(12,6,32,.35)');
      pc.fillStyle = sg; pc.fillRect(0, 0, c.width, c.height);
      pc.globalCompositeOperation = 'source-over';
    }
    s = { c, x: -w, y: -top, w: w * 2, h: top + bot };
    sprites.set(key, s);
    return s;
  }

  // Animación de muerte: el enemigo se pone blanco, se aplasta contra el suelo y se desvanece.
  function dieFx(e) {
    if (!(SPRITE_TYPES.has(e.type) || IMGS[e.type]) || G.effects.length > 260) return;
    G.effects.push({ type: 'die', x: e.x, y: e.y, et: e.type, color: e.color, r: e.r, wob: e.wob || 0, sd: e.x > G.p.x ? 1 : -1, life: 0.32, max: 0.32 });
  }
  function drawDie(f) {
    if (!inView(f.x, f.y, f.r * 3)) return;
    const k = f.life / f.max, q = 1 - k;
    const fr = Math.floor((((f.wob % SPR_P) + SPR_P) % SPR_P) / SPR_P * SPR_N) % SPR_N;
    const s = enemySprite({ type: f.et, color: f.color }, f.r, fr, k > 0.55);
    ctx.save();
    ctx.translate(f.x, f.y + f.r * 0.9);
    ctx.rotate(f.sd * q * 0.7);
    ctx.scale((1 + q * 0.5) * -f.sd, Math.max(0.05, 1 - q * 0.95));
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.c, s.x, s.y - f.r * 0.9, s.w, s.h);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e) {
    if (G && G.online !== 'guest') e.warn = isWarn(e);
    shadow(e.x, e.y, e.r);
    const c = e.color, r = e.r, lw = Math.max(1.8, Math.min(4, r * 0.14));
    const look = e.x > camX + CVW / 2 ? -r * 0.25 : r * 0.25, sd = look > 0 ? 1 : -1;
    const t = G ? G.time : menuT;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.boss && e.rage) {
      // Jefe enfurecido: aura roja que late.
      const k = 0.5 + 0.5 * Math.sin(t * 9);
      ctx.fillStyle = `rgba(255,40,60,${0.18 + 0.17 * k})`;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.35 + 0.15 * k), 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,90,${0.5 + 0.4 * k})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.2 + 0.1 * k), 0, TAU); ctx.stroke();
    }
    const ik = imgKey(e), useImg = !!(IMGS[ik] && ENEMY_IMG[ik]);
    const charmed = e.charmT > 0 || e.charm;
    if (charmed) {
      // Enamorado: brillo rosa y se tambalea mareado.
      const k = 0.5 + 0.5 * Math.sin(t * 8 + (e.id || 0));
      ctx.fillStyle = `rgba(255,95,168,${0.22 + 0.18 * k})`;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 1.2, 0, 0, TAU); ctx.fill();
      ctx.rotate(Math.sin(t * 7 + (e.id || 0)) * 0.22);
    }
    if (G && ctx === mainCtx && (useImg || (!e.boss && !e.warn && SPRITE_TYPES.has(e.type)))) {
      const f = Math.floor((((e.wob % SPR_P) + SPR_P) % SPR_P) / SPR_P * SPR_N) % SPR_N;
      const s = enemySprite(useImg ? { type: ik, color: e.boss ? null : e.color } : e, r, f, e.flash > 0);
      if (useImg && e.warn) {
        // Avisa de un ataque (embestida, mecha encendida): brillo rojo que late.
        const k = 0.5 + 0.5 * Math.sin(t * 16);
        ctx.fillStyle = `rgba(255,50,50,${0.2 + 0.25 * k})`;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 1.25, 0, 0, TAU); ctx.fill();
        if (e.type === 'calabaza') {
          ctx.strokeStyle = 'rgba(255,90,60,.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
          ctx.beginPath(); ctx.arc(0, 0, ETYPES.calabaza.bomb.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      // Animación: aparece con un saltito, se balancea al andar y se aplasta al recibir un golpe.
      const pop = Math.min(1, (t - (e.born ?? -9)) / 0.28), sp = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 - (1 - pop) * 0.9 : 1;
      const hitK = e.flash > 0 ? 1 : 0;
      let sx = sp * (1 + hitK * 0.16), sy = sp * (1 - hitK * 0.14) * (1 + Math.sin(e.wob * 2) * 0.035);
      if (useImg) {
        if (e.boss) { const q = Math.sin(t * 2.5) * 0.03; sx *= 1 - q; sy *= 1 + q; }
        // Con imagen: el slime se estira y se aplasta; el murciélago aletea.
        if (e.type === 'slime') { const q = Math.sin(e.wob * 2) * 0.09; sx *= 1 + q; sy *= 1 - q; }
        else if (e.type === 'espectro') ctx.translate(0, Math.sin(e.wob * 1.5) * r * 0.18);
        else if (e.type === 'murcielago') { sy *= 1 + Math.sin(e.wob * 5) * 0.13; ctx.translate(0, Math.sin(e.wob * 2.5) * r * 0.25); }
      }
      const pv = r * 0.9;
      ctx.translate(0, pv); ctx.rotate(Math.sin(e.wob) * 0.07); ctx.scale(sx * (sd < 0 ? -1 : 1), sy); ctx.translate(0, -pv);
      ctx.imageSmoothingEnabled = false;   // el sprite ya está a la escala de la pantalla
      ctx.drawImage(s.c, s.x, s.y, s.w, s.h);
      ctx.imageSmoothingEnabled = true;
    } else {
      FLASH = e.flash > 0;
      drawEnemyBody(e, c, r, look, sd, lw, t);
    }
    FLASH = false;
    if (charmed) {
      // Corazones que giran sobre la cabeza.
      for (let i = 0; i < 2; i++) {
        const a = t * 4 + i * Math.PI + (e.id || 0);
        heartPath(Math.cos(a) * r * 0.8, -r * 1.35 + Math.sin(a) * r * 0.25, Math.max(5, r * 0.32));
        ctx.fillStyle = '#ff5fa8'; ctx.fill(); ink(1.5);
      }
    }
    if (e.frz > 0) {
      ctx.fillStyle = 'rgba(170,230,255,.4)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(235,250,255,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI; ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(-Math.cos(a) * r * 0.5, -Math.sin(a) * r * 0.5); }
      ctx.stroke();
    }
    if (e.elite) {
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const bw = Math.max(28, r * 2);
      ctx.fillStyle = INK; rr(-bw / 2 - 2, -r - 20, bw + 4, 8, 4); ctx.fill();
      ctx.fillStyle = '#ffd34d'; rr(-bw / 2, -r - 18, Math.max(2, bw * Math.max(0, e.hp / e.maxHp)), 4, 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemyBody(e, c, r, look, sd, lw, t) {
    switch (e.type) {
      case 'slime': {
        const sq = Math.sin(e.wob) * 0.1, w = r * (1.05 + sq), h = r * (0.95 - sq);
        ctx.beginPath();
        ctx.moveTo(-w, r * 0.6);
        ctx.quadraticCurveTo(-w * 1.02, -h * 0.95, 0, -h);
        ctx.quadraticCurveTo(w * 1.02, -h * 0.95, w, r * 0.6);
        ctx.quadraticCurveTo(w * 0.5, r * 0.78, 0, r * 0.66);
        ctx.quadraticCurveTo(-w * 0.5, r * 0.78, -w, r * 0.6);
        paint(c, lw);
        ctx.fillStyle = C(tone(c, -0.28));
        ctx.beginPath(); ctx.ellipse(0, r * 0.5, w * 0.72, r * 0.12, 0, 0, TAU); ctx.fill();
        gloss(-w * 0.45, -h * 0.4, r * 0.24, r * 0.14);
        gloss(-w * 0.15, -h * 0.62, r * 0.07, r * 0.07, 0, 0.7);
        cuteEyes(look * 0.7, r * 0.02, r * 0.26, r * 0.3);
        ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.7;
        ctx.beginPath(); ctx.arc(look * 0.7, r * 0.22, r * 0.12, 0.2, Math.PI - 0.2); ctx.stroke();
        break;
      }
      case 'murcielago': {
        const f = Math.sin(e.wob * 2) * 0.6, wc = tone(c, -0.3);
        for (const s of [-1, 1]) {
          const tip = [s * r * 2.25, -r * (0.75 + f)];
          const pts = [[s * r * 1.75, r * 0.45], [s * r * 1.15, r * 0.2], [s * r * 0.55, r * 0.45]];
          ctx.beginPath();
          ctx.moveTo(s * r * 0.5, -r * 0.35);
          ctx.quadraticCurveTo(s * r * 1.3, -r * (0.9 + f * 0.8), tip[0], tip[1]);
          let px = tip[0], py = tip[1];
          for (const [qx, qy] of pts) { ctx.quadraticCurveTo((px + qx) / 2, (py + qy) / 2 - r * 0.38, qx, qy); px = qx; py = qy; }
          ctx.closePath();
          paint(wc, lw * 0.85);
          ctx.strokeStyle = C(tone(c, 0.25)); ctx.lineWidth = 1;
          ctx.beginPath();
          for (const [qx, qy] of pts.slice(0, 2)) { ctx.moveTo(s * r * 0.6, -r * 0.3); ctx.lineTo(qx, qy - r * 0.05); }
          ctx.stroke();
        }
        // orejas
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.4); ctx.lineTo(-r * 0.55, -r * 1.25); ctx.lineTo(-r * 0.15, -r * 0.75);
        ctx.moveTo(r * 0.7, -r * 0.4); ctx.lineTo(r * 0.55, -r * 1.25); ctx.lineTo(r * 0.15, -r * 0.75);
        paint(c, lw * 0.85);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); paint(c, lw);
        ctx.fillStyle = C(tone(c, 0.3)); ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.5, r * 0.4, 0, 0, TAU); ctx.fill();
        gloss(-r * 0.45, -r * 0.45, r * 0.22, r * 0.12);
        glowEyes(look * 0.5, -r * 0.15, r * 0.22, r * 0.34, '#ffef5e', 0.3);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(look * 0.5 - r * 0.22, r * 0.3); ctx.lineTo(look * 0.5 - r * 0.12, r * 0.55); ctx.lineTo(look * 0.5 - r * 0.02, r * 0.3);
        ctx.moveTo(look * 0.5 + r * 0.02, r * 0.3); ctx.lineTo(look * 0.5 + r * 0.12, r * 0.55); ctx.lineTo(look * 0.5 + r * 0.22, r * 0.3); ctx.fill();
        break;
      }
      case 'espectro': {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(0, -r * 0.2, r, Math.PI, 0);
        ctx.lineTo(r, r * 0.7);
        for (let i = 1; i <= 4; i++) {
          const x0 = r - (i - 0.5) * (r / 2), x1 = r - i * (r / 2), wv = Math.sin(e.wob + i) * r * 0.12;
          ctx.quadraticCurveTo(x0, r * (1.15 + (i % 2) * 0.1) + wv, x1, r * 0.75);
        }
        ctx.closePath();
        paint(tone(c, 0.12), lw);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C(tone(c, -0.15));
        ctx.beginPath(); ctx.ellipse(r * 0.35, r * 0.35, r * 0.35, r * 0.5, 0.3, 0, TAU); ctx.fill();
        gloss(-r * 0.45, -r * 0.65, r * 0.25, r * 0.13);
        // ojos huecos y boca
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(look - r * 0.32, -r * 0.2, r * 0.17, r * 0.27, 0, 0, TAU);
        ctx.ellipse(look + r * 0.32, -r * 0.2, r * 0.17, r * 0.27, 0, 0, TAU);
        ctx.ellipse(look, r * 0.3, r * 0.12, r * 0.17, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#bfe8ff';
        ctx.beginPath(); ctx.arc(look - r * 0.32, -r * 0.22, r * 0.06, 0, TAU); ctx.arc(look + r * 0.32, -r * 0.22, r * 0.06, 0, TAU); ctx.fill();
        break;
      }
      case 'bruto': {
        const bone = '#efe3c2';
        // brazos
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 1.05, r * 0.35 + Math.sin(e.wob + s) * r * 0.08, r * 0.38, 0, TAU); paint(tone(c, -0.15), lw); }
        // cuernos
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(s * r * 0.75, -r * 0.7);
          ctx.quadraticCurveTo(s * r * 1.25, -r * 1.0, s * r * 1.0, -r * 1.55);
          ctx.quadraticCurveTo(s * r * 0.75, -r * 1.05, s * r * 0.3, -r * 0.9);
          paint(bone, lw * 0.8);
        }
        rr(-r, -r, r * 2, r * 2, r * 0.55); paint(c, lw);
        ctx.fillStyle = C(tone(c, 0.25)); ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.6, r * 0.45, 0, 0, TAU); ctx.fill();
        // cinturón
        ctx.fillStyle = C('#4a2f22'); ctx.fillRect(-r * 0.98, r * 0.45, r * 1.96, r * 0.24);
        ctx.fillStyle = C('#e8b84a'); rr(-r * 0.16, r * 0.42, r * 0.32, r * 0.3, 2); ctx.fill();
        gloss(-r * 0.55, -r * 0.6, r * 0.25, r * 0.12);
        // cejas, ojos y colmillos
        glowEyes(look, -r * 0.3, r * 0.17, r * 0.32, '#ffe14d');
        ctx.strokeStyle = INK; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(look - r * 0.6, -r * 0.62); ctx.lineTo(look - r * 0.12, -r * 0.45); ctx.moveTo(look + r * 0.6, -r * 0.62); ctx.lineTo(look + r * 0.12, -r * 0.45); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(look - r * 0.38, r * 0.05); ctx.lineTo(look - r * 0.28, -r * 0.22); ctx.lineTo(look - r * 0.18, r * 0.05);
        ctx.moveTo(look + r * 0.18, r * 0.05); ctx.lineTo(look + r * 0.28, -r * 0.22); ctx.lineTo(look + r * 0.38, r * 0.05);
        paint(bone, lw * 0.6);
        break;
      }
      case 'escupidor': {
        // Planta carnívora con un tubo que apunta al jugador más cercano.
        const tg = (G && nearestPlayer(e.x, e.y)) || (G && G.p), a = tg ? Math.atan2(tg.y - e.y, tg.x - e.x) : 0;
        // hojas de la base
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(0, r * 0.6);
          ctx.quadraticCurveTo(s * r * 1.5, r * 0.2, s * r * 1.6, r * 0.95);
          ctx.quadraticCurveTo(s * r * 0.8, r * 1.05, 0, r * 0.6);
          paint('#3f7a2a', lw * 0.8);
        }
        ctx.save(); ctx.rotate(a);
        rr(r * 0.3, -r * 0.3, r * 1.05, r * 0.6, r * 0.2); paint('#5a8a2a', lw);
        ctx.beginPath(); ctx.ellipse(r * 1.35, 0, r * 0.18, r * 0.4, 0, 0, TAU); paint('#7fae3a', lw * 0.8);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(r * 1.38, 0, r * 0.08, r * 0.22, 0, 0, TAU); ctx.fill();
        ctx.restore();
        const sq = Math.sin(e.wob) * 0.06;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + sq), r * (1 - sq), 0, 0, TAU); paint(c, lw);
        ctx.strokeStyle = C(tone(c, -0.3)); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 0.95, 0, 0.6, Math.PI - 0.6); ctx.ellipse(0, 0, r * 0.45, r * 0.95, 0, Math.PI + 0.6, -0.6); ctx.stroke();
        ctx.fillStyle = C(tone(c, -0.25));
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.4 + i * r * 0.4, r * 0.55, r * 0.11, 0, TAU); ctx.fill(); }
        gloss(-r * 0.45, -r * 0.5, r * 0.22, r * 0.12);
        glowEyes(look * 0.6, -r * 0.2, r * 0.18, r * 0.3, '#fff36b');
        break;
      }
      case 'brujo': {
        // Hechicero encapuchado con un orbe brillante.
        const tip = -r * 1.75 + Math.sin(e.wob) * 2;
        ctx.beginPath();
        ctx.moveTo(-r * 1.05, r);
        ctx.quadraticCurveTo(-r * 0.95, -r * 0.2, -r * 0.2, -r * 1.1);
        ctx.quadraticCurveTo(-sd * r * 0.2, tip - r * 0.1, sd * r * 0.55, tip);
        ctx.quadraticCurveTo(r * 0.3, -r * 0.9, r * 0.95, -r * 0.2);
        ctx.quadraticCurveTo(r * 1.05, r * 0.4, r * 1.05, r);
        ctx.quadraticCurveTo(0, r * 1.2, -r * 1.05, r);
        paint(c, lw);
        ctx.fillStyle = C(tone(c, -0.35));
        ctx.beginPath(); ctx.moveTo(-r * 1.02, r * 0.75); ctx.quadraticCurveTo(0, r * 1.0, r * 1.02, r * 0.75); ctx.lineTo(r * 1.05, r); ctx.quadraticCurveTo(0, r * 1.2, -r * 1.05, r); ctx.fill();
        ctx.fillStyle = C('#ffe9a8');
        for (const [sx, sy] of [[-0.45, 0.45], [0.5, 0.2]]) { ctx.beginPath(); ctx.arc(sx * r, sy * r, r * 0.07, 0, TAU); ctx.fill(); }
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(look * 0.3, -r * 0.2, r * 0.5, r * 0.45, 0, 0, TAU); ctx.fill();
        glowEyes(look * 0.4, -r * 0.2, r * 0.12, r * 0.18, '#ff9df5', 0.25);
        gloss(-r * 0.55, -r * 0.55, r * 0.18, r * 0.1);
        const ox = sd * r * 1.15, oy = -r * 0.15 + Math.sin(e.wob * 1.5) * 2;
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#e3a6ff';
        ctx.beginPath(); ctx.arc(ox, oy, r * 0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(ox, oy, r * 0.32, 0, TAU); paint('#f2d2ff', lw * 0.8);
        gloss(ox - r * 0.1, oy - r * 0.1, r * 0.1, r * 0.06, -0.5, 0.8);
        break;
      }
      case 'arana': {
        spiderLegs(e, r, tone(c, -0.45), Math.max(1.4, r * 0.13));
        ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.85, r * 0.75, 0, 0, TAU); paint(tone(c, -0.55), lw);
        ctx.fillStyle = C('#ff4d6a');
        ctx.beginPath(); ctx.moveTo(0, r * 0.15); ctx.lineTo(r * 0.18, r * 0.4); ctx.lineTo(0, r * 0.65); ctx.lineTo(-r * 0.18, r * 0.4); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -r * 0.4, r * 0.55, 0, TAU); paint(c, lw);
        gloss(-r * 0.2, -r * 0.65, r * 0.16, r * 0.09);
        ctx.fillStyle = '#ff4d6a';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(look * 0.5 - r * 0.3 + i * r * 0.2, -r * 0.42 + (i === 0 || i === 3 ? r * 0.06 : 0), r * 0.08, 0, TAU); ctx.fill(); }
        break;
      }
      case 'lobo': {
        const run = Math.sin(e.wob * 2), fur = e.warn ? '#ff8f8f' : c;
        if (e.warn) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff3d3d'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 1.3, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        // patas
        for (const [lx, ph] of [[-0.7, 0], [-0.35, 1], [0.35, 1], [0.7, 0]]) {
          const k = (ph ? run : -run) * r * 0.18;
          inkLine(tone(fur, -0.25), r * 0.22, () => { ctx.moveTo(sd * lx * r, r * 0.3); ctx.lineTo(sd * lx * r + k, r * 0.9); });
        }
        // cola
        ctx.beginPath(); ctx.moveTo(-sd * r * 0.95, -r * 0.05);
        ctx.quadraticCurveTo(-sd * r * 1.7, -r * 0.4 + Math.sin(e.wob) * 3, -sd * r * 1.9, -r * 0.9);
        ctx.quadraticCurveTo(-sd * r * 1.35, -r * 0.4, -sd * r * 0.9, r * 0.3);
        paint(tone(fur, -0.1), lw);
        ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 1.15, r * 0.68, 0, 0, TAU); paint(fur, lw);
        ctx.fillStyle = C(tone(fur, 0.35)); ctx.beginPath(); ctx.ellipse(sd * r * 0.2, r * 0.38, r * 0.7, r * 0.22, 0, 0, TAU); ctx.fill();
        // cabeza, hocico y orejas
        ctx.beginPath();
        ctx.moveTo(sd * r * 0.75, -r * 0.85); ctx.lineTo(sd * r * 0.85, -r * 1.45); ctx.lineTo(sd * r * 1.1, -r * 0.95);
        ctx.moveTo(sd * r * 1.15, -r * 0.9); ctx.lineTo(sd * r * 1.35, -r * 1.4); ctx.lineTo(sd * r * 1.45, -r * 0.7);
        paint(tone(fur, -0.15), lw * 0.8);
        ctx.beginPath(); ctx.arc(sd * r * 1.0, -r * 0.45, r * 0.58, 0, TAU); paint(fur, lw);
        ctx.beginPath(); ctx.ellipse(sd * r * 1.55, -r * 0.3, r * 0.42, r * 0.25, 0, 0, TAU); paint(tone(fur, 0.3), lw * 0.8);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(sd * r * 1.92, -r * 0.36, r * 0.1, 0, TAU); ctx.fill();
        gloss(sd * r * 0.8, -r * 0.75, r * 0.16, r * 0.08, sd * -0.5);
        glowEyes(sd * r * 1.15, -r * 0.55, r * 0.12, 0, e.warn ? '#ff3d3d' : '#ffe14d');
        break;
      }
      case 'calabaza': {
        const blink = e.warn && Math.floor(t * 12) % 2 === 0;
        const body = blink ? '#fff4c2' : c;
        for (const k of [-0.48, 0.48, 0]) { ctx.beginPath(); ctx.ellipse(k * r, r * 0.05, r * (k ? 0.62 : 0.66), r * 0.85, 0, 0, TAU); paint(k ? tone(body, -0.12) : body, lw); }
        // tallo y hoja
        ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.7); ctx.quadraticCurveTo(-r * 0.1, -r * 1.2, r * 0.25, -r * 1.3); ctx.lineTo(r * 0.28, -r * 1.1); ctx.quadraticCurveTo(r * 0.1, -r * 1.05, r * 0.12, -r * 0.7);
        paint('#4f7a2a', lw * 0.8);
        ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.95, r * 0.3, r * 0.13, -0.5, 0, TAU); paint('#6aa23a', lw * 0.7);
        gloss(-r * 0.25, -r * 0.45, r * 0.12, r * 0.22, 0.2, 0.35);
        // cara tallada: brilla por dentro
        ctx.fillStyle = e.warn ? '#fff36b' : '#ffb347';
        ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.7;
        ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.12); ctx.lineTo(-r * 0.28, -r * 0.45); ctx.lineTo(-r * 0.08, -r * 0.12); ctx.closePath();
        ctx.moveTo(r * 0.55, -r * 0.12); ctx.lineTo(r * 0.28, -r * 0.45); ctx.lineTo(r * 0.08, -r * 0.12); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.2);
        for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.55 + i * r * 1.1 / 6, r * (i % 2 ? 0.42 : 0.24));
        ctx.lineTo(r * 0.45, r * 0.58); ctx.lineTo(-r * 0.45, r * 0.58); ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (e.warn) {
          ctx.strokeStyle = 'rgba(255,90,60,.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
          ctx.beginPath(); ctx.arc(0, 0, ETYPES.calabaza.bomb.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        break;
      }
      case 'golem': {
        // puños de piedra
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(s * r * 0.95, -r * 0.1); ctx.lineTo(s * r * 1.5, r * 0.05); ctx.lineTo(s * r * 1.45, r * 0.65); ctx.lineTo(s * r * 0.95, r * 0.6); ctx.closePath();
          paint(tone(c, -0.2), lw);
        }
        ctx.beginPath(); ctx.moveTo(-r, r); ctx.lineTo(-r * 1.05, -r * 0.3); ctx.lineTo(-r * 0.6, -r); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r * 1.05, -r * 0.3); ctx.lineTo(r, r); ctx.closePath();
        paint(c, lw);
        // cara iluminada y lado en sombra
        ctx.fillStyle = C(tone(c, -0.2));
        ctx.beginPath(); ctx.moveTo(r * 0.6, -r); ctx.lineTo(r * 1.05, -r * 0.3); ctx.lineTo(r, r); ctx.lineTo(r * 0.45, r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C(tone(c, 0.2));
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r * 0.45, -r * 0.75); ctx.lineTo(-r * 0.5, -r * 0.75); ctx.closePath(); ctx.fill();
        // musgo
        ctx.fillStyle = C('#6aa86a');
        ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.92, r * 0.16, 0, TAU); ctx.arc(-r * 0.12, -r * 0.98, r * 0.12, 0, TAU); ctx.arc(r * 0.3, -r * 0.95, r * 0.1, 0, TAU); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.7); ctx.lineTo(-r * 0.1, -r * 0.3); ctx.lineTo(-r * 0.4, r * 0.4); ctx.moveTo(r * 0.5, r * 0.1); ctx.lineTo(r * 0.2, r * 0.7); ctx.stroke();
        // núcleo de cristal
        const pulse = 0.7 + Math.sin(e.wob) * 0.3;
        ctx.globalAlpha = 0.35 * pulse; ctx.fillStyle = '#7fffd4';
        ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.45, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(0, r * 0.02); ctx.lineTo(r * 0.18, r * 0.25); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r * 0.18, r * 0.25); ctx.closePath();
        paint('#7fffd4', lw * 0.6);
        ctx.fillStyle = '#7fffd4'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
        ctx.fillRect(-r * 0.55 + look * 0.4, -r * 0.5, r * 0.35, r * 0.14); ctx.strokeRect(-r * 0.55 + look * 0.4, -r * 0.5, r * 0.35, r * 0.14);
        ctx.fillRect(r * 0.2 + look * 0.4, -r * 0.5, r * 0.35, r * 0.14); ctx.strokeRect(r * 0.2 + look * 0.4, -r * 0.5, r * 0.35, r * 0.14);
        break;
      }
      case 'invocador': {
        // círculo de invocación en el suelo
        ctx.save(); ctx.scale(1, 0.4); ctx.rotate(e.wob * 0.15);
        ctx.strokeStyle = 'rgba(127,255,224,.45)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(0, r * 2.2, r * 1.6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(-r * 0.95, r); ctx.lineTo(-r * 0.6, -r * 0.6); ctx.quadraticCurveTo(0, -r * 1.5, r * 0.6, -r * 0.6); ctx.lineTo(r * 0.95, r); ctx.quadraticCurveTo(0, r * 1.15, -r * 0.95, r);
        paint(c, lw);
        ctx.fillStyle = C(tone(c, -0.3));
        ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.2); ctx.lineTo(r * 0.12, -r * 0.2); ctx.lineTo(r * 0.2, r * 1.05); ctx.lineTo(-r * 0.2, r * 1.05); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(look * 0.3, -r * 0.3, r * 0.45, r * 0.4, 0, 0, TAU); ctx.fill();
        glowEyes(look * 0.4, -r * 0.3, r * 0.11, r * 0.18, '#7fffe0');
        gloss(-r * 0.45, -r * 0.6, r * 0.15, r * 0.08);
        // runas que giran a su alrededor
        for (let i = 0; i < 3; i++) {
          const a = e.wob * 0.5 + i / 3 * TAU, rx = Math.cos(a) * r * 1.55, ry = Math.sin(a) * r * 1.1 - r * 0.2;
          ctx.beginPath(); ctx.moveTo(rx, ry - 5); ctx.lineTo(rx + 3.5, ry); ctx.lineTo(rx, ry + 5); ctx.lineTo(rx - 3.5, ry); ctx.closePath();
          paint('#7fffe0', 1.4);
        }
        break;
      }
      case 'boss': {
        if (e.variant === 0) { drawQueen(e, c, r, look, lw); break; }
        if (e.variant === 2) { drawDragon(e, c, r, look, lw); break; }
        drawCrystalBoss(e, c, r, look, lw, t);
        break;
      }
    }
  }

  // Jefes con aspecto propio.
  function drawQueen(e, c, r, look, lw) {
    spiderLegs(e, r * 1.15, tone(c, -0.4), r * 0.12);
    ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 1.05, r * 0.92, 0, 0, TAU); paint('#2c2640', lw);
    ctx.fillStyle = C(tone('#2c2640', 0.15));
    ctx.beginPath(); ctx.ellipse(-r * 0.4, r * 0.1, r * 0.3, r * 0.2, -0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.05); ctx.lineTo(-r * 0.32, r * 0.42); ctx.lineTo(0, r * 0.8); ctx.lineTo(r * 0.32, r * 0.42); ctx.closePath();
    paint('#ff4d6a', lw * 0.7);
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.6, 0, TAU); paint(c, lw);
    gloss(-r * 0.25, -r * 0.8, r * 0.18, r * 0.1);
    for (let i = 0; i < 6; i++) glowEyes(-r * 0.35 + i * r * 0.14 + look * 0.3, -r * 0.55 + (i % 2) * r * 0.12, r * 0.06, 0, '#ff4d6a');
    // colmillos
    ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.1); ctx.lineTo(-r * 0.12, r * 0.15); ctx.lineTo(-r * 0.04, -r * 0.08);
    ctx.moveTo(r * 0.2, -r * 0.1); ctx.lineTo(r * 0.12, r * 0.15); ctx.lineTo(r * 0.04, -r * 0.08);
    paint('#efe3c2', lw * 0.5);
    crown(0, -r * 1.0, r * 0.45, lw);
  }
  function crown(x, y, w, lw) {
    ctx.beginPath();
    ctx.moveTo(x - w, y + w * 0.15); ctx.lineTo(x - w * 0.85, y - w * 0.7); ctx.lineTo(x - w * 0.4, y - w * 0.2);
    ctx.lineTo(x, y - w * 0.95); ctx.lineTo(x + w * 0.4, y - w * 0.2); ctx.lineTo(x + w * 0.85, y - w * 0.7); ctx.lineTo(x + w, y + w * 0.15);
    ctx.closePath(); paint('#ffd75e', lw * 0.8);
    ctx.fillStyle = C('#ff4d6a'); ctx.beginPath(); ctx.arc(x, y - w * 0.15, w * 0.15, 0, TAU); ctx.fill();
    gloss(x - w * 0.55, y - w * 0.2, w * 0.15, w * 0.08, 0, 0.6);
  }
  // Coloso de Obsidiana y Rey del Abismo: una estrella de cristal con facetas.
  function drawCrystalBoss(e, c, r, look, lw, t) {
    const n = 14, rot = e.wob * 0.15;
    if (e.final) {
      const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2);
      g.addColorStop(0, 'rgba(255,61,127,.35)'); g.addColorStop(1, 'rgba(255,61,127,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, TAU); ctx.fill();
    }
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i / (n * 2) * TAU, rad = i % 2 ? r * 0.88 : r * (1.3 + (i % 4 === 0 ? 0.1 : 0));
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    ctx.beginPath(); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.closePath();
    paint(tone(c, -0.15), lw);
    // facetas: cada punta tiene una cara clara y otra oscura según la luz
    for (let i = 0; i < n * 2; i += 2) {
      const [px, py] = pts[i], [qx, qy] = pts[(i + 1) % (n * 2)];
      const lit = (px - py) < 0;
      ctx.fillStyle = C(lit ? tone(c, 0.3) : tone(c, -0.4));
      ctx.beginPath(); ctx.moveTo(px * 0.62, py * 0.62); ctx.lineTo(px, py); ctx.lineTo(qx, qy); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, TAU); paint(e.final ? '#2a0a1e' : '#140e2a', lw);
    const pulse = 0.6 + Math.sin(t * 3) * 0.4;
    ctx.strokeStyle = C(tone(c, 0.2)); ctx.globalAlpha = 0.5 * pulse; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    glowEyes(look, -r * 0.1, r * 0.17, r * 0.24, '#ffd75e', 0.35);
    // boca
    ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(look - r * 0.3, r * 0.3);
    for (let i = 1; i <= 6; i++) ctx.lineTo(look - r * 0.3 + i * r * 0.1, r * (i % 2 ? 0.4 : 0.3));
    ctx.stroke();
    if (e.final) crown(0, -r * 1.15, r * 0.55, lw);
  }
  function drawDragon(e, c, r, look, lw) {
    const flap = Math.sin(e.wob * 0.8) * 0.3, sd = look > 0 ? 1 : -1, bone = '#e8dcc4';
    if (e.warn) {
      // Aviso de embestida: línea roja hacia donde va a cargar.
      ctx.strokeStyle = 'rgba(255,60,60,.5)'; ctx.lineWidth = r * 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(e.ca || 0) * 390, Math.sin(e.ca || 0) * 390); ctx.stroke(); ctx.lineCap = 'butt';
    }
    for (const w of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(w * r * 0.4, -r * 0.2);
      ctx.lineTo(w * r * 2.3, -r * (1.25 + flap));
      ctx.quadraticCurveTo(w * r * 2.0, -r * 0.3, w * r * 2.25, r * 0.5);
      ctx.quadraticCurveTo(w * r * 1.6, r * 0.05, w * r * 1.4, r * 0.55);
      ctx.quadraticCurveTo(w * r * 1.0, r * 0.15, w * r * 0.6, r * 0.45);
      ctx.closePath();
      paint('#3c2a26', lw);
      ctx.globalAlpha = 0.6; ctx.fillStyle = C(tone(c, -0.2));
      ctx.beginPath(); ctx.moveTo(w * r * 0.6, -r * 0.1); ctx.lineTo(w * r * 2.1, -r * (1.05 + flap)); ctx.lineTo(w * r * 1.6, r * 0.1); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      inkLine(bone, r * 0.08, () => { ctx.moveTo(w * r * 0.45, -r * 0.2); ctx.lineTo(w * r * 2.3, -r * (1.25 + flap)); });
    }
    ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 0.85, r * 0.95, 0, 0, TAU); paint(bone, lw);
    ctx.strokeStyle = C('#6b5444'); ctx.lineWidth = lw * 0.9;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, r * (0.05 + i * 0.28), r * (0.62 - i * 0.08), r * 0.12, 0, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 1.0); ctx.stroke();
    // cráneo con cuernos
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * r * 0.35, -r * 1.0); ctx.quadraticCurveTo(s * r * 0.9, -r * 1.3, s * r * 0.75, -r * 1.75); ctx.quadraticCurveTo(s * r * 0.55, -r * 1.3, s * r * 0.1, -r * 1.15);
      paint('#5a4a3a', lw * 0.8);
    }
    ctx.beginPath(); ctx.ellipse(sd * r * 0.2, -r * 0.75, r * 0.6, r * 0.5, 0, 0, TAU); paint('#f2e8d2', lw);
    ctx.beginPath(); ctx.ellipse(sd * r * 0.55, -r * 0.55, r * 0.38, r * 0.25, 0, 0, TAU); paint('#f2e8d2', lw * 0.8);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(sd * r * 0.1, -r * 0.8, r * 0.2, r * 0.17, 0, 0, TAU); ctx.ellipse(sd * r * 0.45, -r * 0.8, r * 0.16, r * 0.15, 0, 0, TAU); ctx.fill();
    glowEyes(sd * r * 0.1, -r * 0.8, r * 0.09, 0, e.warn ? '#ff3d3d' : c);
    glowEyes(sd * r * 0.45, -r * 0.8, r * 0.08, 0, e.warn ? '#ff3d3d' : c);
  }

  // ---------- Armas en la mano ----------
  // Dibuja el arma principal en coordenadas locales: el cañón apunta hacia +x y `u` es la unidad de tamaño.
  function drawHeldWeapon(id, u, t) {
    const lw = Math.max(1.2, u * 0.35);
    const box = (x, y, w, h, col, rad = u * 0.4) => { rr(x * u, y * u, w * u, h * u, rad); paint(col, lw); };
    switch (id) {
      case 'revolver':
        box(0, -1.1, 10, 2.2, '#c9ced8');
        ctx.beginPath(); ctx.arc(2.6 * u, 0, 2.1 * u, 0, TAU); paint('#8a909e', lw);
        box(-2.2, -0.4, 3, 4.2, '#7a4b2a', u * 0.9);
        break;
      case 'escopeta':
        box(-5, -1.2, 6, 3, '#7a4b2a', u);
        box(0, -1.3, 14, 2.1, '#3b4050');
        box(4, 0.5, 5, 1.8, '#9a6a3a');
        break;
      case 'subfusil':
        box(-1, -1.6, 10, 3.2, '#2f4858');
        box(4, 1.2, 2, 4.2, '#1c2b35', u * 0.3);
        box(-1, 1, 2.4, 3.2, '#1c2b35', u * 0.3);
        box(9, -0.8, 3, 1.6, '#5a6a78', u * 0.3);
        break;
      case 'francotirador':
        box(-5, -1.2, 7, 3, '#4a3a2a', u);
        box(1, -1, 17, 2, '#3b4050');
        box(3, -3.6, 7, 2.2, '#22252e', u * 0.8);
        ctx.fillStyle = '#9dffef'; ctx.beginPath(); ctx.arc(10 * u, -2.5 * u, u * 0.8, 0, TAU); ctx.fill();
        break;
      case 'katana':
        box(-4, -0.9, 5, 1.8, '#7a1f2b', u * 0.5);
        ctx.beginPath(); ctx.ellipse(1.2 * u, 0, u * 0.7, u * 2.1, 0, 0, TAU); paint('#e8b84a', lw);
        ctx.beginPath(); ctx.moveTo(1.8 * u, -0.8 * u); ctx.quadraticCurveTo(10 * u, -1.6 * u, 18 * u, -2.8 * u); ctx.quadraticCurveTo(10 * u, 0.4 * u, 1.8 * u, 0.8 * u); ctx.closePath();
        paint('#e8eef8', lw);
        ctx.strokeStyle = 'rgba(160,190,230,.9)'; ctx.lineWidth = u * 0.4;
        ctx.beginPath(); ctx.moveTo(3 * u, -0.1 * u); ctx.quadraticCurveTo(10 * u, -0.6 * u, 16 * u, -2.2 * u); ctx.stroke();
        break;
      case 'lanzacohetes':
        box(-4, -2.4, 16, 4.8, '#5d6b3a', u * 1.2);
        box(2, 2, 2.2, 3.4, '#3a4226', u * 0.4);
        ctx.beginPath(); ctx.moveTo(12 * u, -1.8 * u); ctx.lineTo(16 * u, 0); ctx.lineTo(12 * u, 1.8 * u); ctx.closePath(); paint('#e74c3c', lw);
        ctx.fillStyle = '#ffe14d'; ctx.fillRect(-1 * u, -2.4 * u, 1.2 * u, 4.8 * u);
        break;
      case 'espada_pixel': {
        const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x * u * 1.6, y * u * 1.6, u * 1.6 + 0.5, u * 1.6 + 0.5); };
        ctx.save(); ctx.rotate(-0.6);
        for (let i = -2; i <= 0; i++) px(i, -0.5, '#6b4a2a');
        px(1, -1.5, '#3a3a3a'); px(1, -0.5, '#3a3a3a'); px(1, 0.5, '#3a3a3a');
        for (let i = 2; i <= 8; i++) { px(i, -0.5, '#4de1ff'); if (i < 8) px(i, i % 2 ? -1.5 : 0.5, '#a8f5ff'); }
        ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.strokeRect(-2 * u * 1.6, -1.5 * u * 1.6, 11 * u * 1.6, 3 * u * 1.6);
        ctx.restore();
        break;
      }
      case 'shuriken':
        ctx.save(); ctx.translate(3 * u, 0); ctx.rotate(t * 8);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const rad = i % 2 ? u * 1.2 : u * 4, a = i / 8 * TAU; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); paint('#cfd8dc', lw);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, u * 0.8, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      case 'escudo': {
        ctx.save(); ctx.translate(2.5 * u, 0);
        const rs = [[4.2, "#c62828"], [3.2, "#f5f5f5"], [2.2, "#c62828"], [1.4, "#1565c0"]];
        rs.forEach(([k, col], i) => { ctx.beginPath(); ctx.arc(0, 0, k * u, 0, TAU); ctx.fillStyle = col; ctx.fill(); if (!i) ink(lw); });
        ctx.fillStyle = '#fff'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const rad = i % 2 ? u * 0.6 : u * 1.4, a = -Math.PI / 2 + i / 10 * TAU; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.fill();
        gloss(-2.5 * u, -2.5 * u, u * 1.2, u * 0.6, -0.7, 0.4);
        ctx.restore();
        break;
      }
      case 'martillo':
        box(-3, -0.8, 13, 1.6, '#3a2a22', u * 0.4);
        box(8, -4.2, 6, 8.4, '#3c3f4a', u * 0.8);
        ctx.beginPath(); ctx.moveTo(14 * u, -3 * u); ctx.lineTo(16.5 * u, 0); ctx.lineTo(14 * u, 3 * u); paint('#3c3f4a', lw);
        ctx.fillStyle = '#6fffb0'; ctx.fillRect(10 * u, -2.6 * u, 2 * u, 1 * u); ctx.fillRect(10 * u, 1.6 * u, 2 * u, 1 * u);
        break;
      case 'onda_ki': {
        const p = 0.75 + Math.sin(t * 10) * 0.25;
        ctx.globalAlpha = 0.45; ctx.fillStyle = '#7fdbff';
        ctx.beginPath(); ctx.arc(3 * u, 0, 5 * u * p, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(3 * u, 0, 2.6 * u * p, 0, TAU); paint('#e8fbff', lw);
        break;
      }
      case 'nichirin':
        box(-4, -0.9, 5, 1.8, '#1f2a44', u * 0.5);
        ctx.beginPath(); ctx.arc(1.2 * u, 0, u * 1.6, 0, TAU); paint('#2a2a2a', lw);
        ctx.beginPath(); ctx.moveTo(1.8 * u, -0.8 * u); ctx.quadraticCurveTo(10 * u, -1.4 * u, 18 * u, -2.4 * u); ctx.quadraticCurveTo(10 * u, 0.4 * u, 1.8 * u, 0.8 * u); ctx.closePath();
        paint('#3fa7e8', lw);
        ctx.strokeStyle = 'rgba(220,245,255,.9)'; ctx.lineWidth = u * 0.4;
        ctx.beginPath(); ctx.moveTo(3 * u, -0.5 * u); ctx.quadraticCurveTo(10 * u, -1 * u, 16 * u, -2 * u); ctx.stroke();
        break;
      case 'gomu':
        ctx.beginPath(); ctx.arc(3 * u, 0, u * 3, 0, TAU); paint('#f0c8a0', lw);
        ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.moveTo(4 * u, -2 * u); ctx.lineTo(4 * u, 2 * u); ctx.stroke();
        break;
      case 'destello': {
        const p = 0.7 + Math.sin(t * 12) * 0.3;
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff2d55';
        ctx.beginPath(); ctx.arc(3 * u, 0, 4.5 * u * p, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(3 * u, 0, u * 2.8, 0, TAU); paint('#1a1024', lw);
        ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = u * 0.6;
        ctx.beginPath(); ctx.moveTo(1 * u, -2 * u); ctx.lineTo(3.5 * u, 0); ctx.lineTo(2 * u, 0.5 * u); ctx.lineTo(4.5 * u, 2.5 * u); ctx.stroke();
        break;
      }
      case 'balon':
        ctx.save(); ctx.translate(3.5 * u, 0); ctx.rotate(t * 3);
        ctx.beginPath(); ctx.arc(0, 0, 3.4 * u, 0, TAU); paint('#ffffff', lw);
        ctx.fillStyle = INK; ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i / 5 * TAU; ctx.lineTo(Math.cos(a) * u * 1.3, Math.sin(a) * u * 1.3); }
        ctx.fill(); ctx.restore();
        break;
      default: // pistola
        box(0, -1.4, 8.5, 2.8, '#3b4050');
        box(0.3, 0.6, 2.6, 4, '#7a4b2a', u * 0.6);
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(7 * u, -1.4 * u, 1 * u, 1 * u);
    }
  }

  /* Dibuja a un personaje; se usa en el juego y en los retratos del menú.
     face: { x, y, side, walk, wpn (id del arma principal), aim (ángulo) }. */
  function drawHero(x, y, r, ch, face, bob, glow = true) {
    if (IMGS[ch.id]) { drawHeroImg(x, y, r, ch, face, glow); return; }
    drawHeroVector(x, y, r, ch, face, bob, glow);
  }
  // Personaje con imagen: salta al andar, se inclina hacia donde va, respira quieto y lleva el arma en la mano.
  function drawHeroImg(x, y, r, ch, face, glow) {
    const im = IMGS[ch.id], tt = G ? G.time : menuT;
    const sd = face.side || (face.x >= 0 ? 1 : -1), walk = face.walk || 0, mv = face.mv ? 1 : 0;
    const H_ = r * 4.1 * (ch.tall ? 1.15 : 1), W_ = H_ * im.width / im.height;
    const feet = y + r * 0.95;
    if (glow) {
      const lg = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
      lg.addColorStop(0, 'rgba(255,236,190,.16)'); lg.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
    }
    const hop = mv * Math.abs(Math.sin(walk)) * r * 0.22;
    const land = mv * (1 - Math.abs(Math.sin(walk))) * 0.06;
    const breath = (1 - mv) * Math.sin(tt * 2.4 + ch.id.length) * 0.025;
    const sy = 1 + breath - land, sx = 1 - breath * 0.6 + land * 0.8;
    const tilt = mv * (sd * 0.07 + Math.sin(walk) * 0.06);
    const wpn = face.wpn, aim = face.aim ?? Math.atan2(face.y || 0, face.x || 1);
    const drawWpn = () => {
      const hx = x + Math.cos(aim) * r * 0.85, hy = feet - hop - H_ * 0.36 + Math.sin(aim) * r * 0.35;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(aim);
      if (Math.cos(aim) < 0) ctx.scale(1, -1);
      drawHeldWeapon(wpn, r * 0.12, tt);
      ctx.restore();
    };
    if (wpn && Math.sin(aim) < -0.3) drawWpn();
    ctx.save();
    ctx.translate(x, feet - hop);
    ctx.rotate(tilt);
    ctx.scale(sx * sd * (HERO_IMG_DIR[ch.id] || 1), sy);
    ctx.drawImage(im, -W_ / 2, -H_, W_, H_);
    ctx.restore();
    if (wpn && Math.sin(aim) >= -0.3) drawWpn();
  }

  function drawHeroVector(x, y, r, ch, face, bob, glow = true) {
    const sd = face.side || (face.x >= 0 ? 1 : -1);
    const wide = ch.wide || 1, tall = ch.tall || 1, lw = Math.max(1.4, r * 0.13);
    const walk = face.walk || 0, stepA = Math.sin(walk) * r * 0.22;
    const hr = r * 0.78;                          // radio de la cabeza
    const bodyH = r * 0.85 * tall, bodyW = r * 0.78 * wide;
    const feetY = y + r * 0.92;
    const bodyTop = feetY - r * 0.18 - bodyH + bob * 0.5;
    const cy = bodyTop - hr * 0.55 + bob;        // centro de la cabeza
    const skin = ch.body, cloth = ch.cloak, hat = ch.hood;
    const tt = G ? G.time : menuT;
    if (glow) {
      // luz de farol alrededor del héroe
      const lg = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
      lg.addColorStop(0, 'rgba(255,236,190,.16)'); lg.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
    }
    // capa que ondea por detrás
    ctx.beginPath();
    ctx.moveTo(x - bodyW * 0.85, bodyTop + r * 0.1);
    ctx.quadraticCurveTo(x - sd * r * 0.9, feetY - r * 0.1 + Math.sin(walk * 0.5) * 2, x - sd * r * 0.6 - stepA * 0.3, feetY + r * 0.05);
    ctx.lineTo(x + bodyW * 0.85 - sd * r * 0.3, feetY - r * 0.05);
    ctx.lineTo(x + bodyW * 0.85, bodyTop + r * 0.1);
    ctx.closePath(); paint(tone(cloth, -0.35), lw);
    // pies
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(x + s * bodyW * 0.45 + s * stepA * 0.5 * sd, feetY - Math.max(0, s * Math.sin(walk)) * r * 0.12, r * 0.26, r * 0.17, 0, 0, TAU);
      paint('#2b2238', lw * 0.8);
    }
    // cuerpo (túnica)
    ctx.beginPath();
    ctx.moveTo(x - bodyW * 0.7, bodyTop);
    ctx.quadraticCurveTo(x - bodyW * 1.08, bodyTop + bodyH * 0.6, x - bodyW, bodyTop + bodyH);
    ctx.quadraticCurveTo(x, bodyTop + bodyH * 1.12, x + bodyW, bodyTop + bodyH);
    ctx.quadraticCurveTo(x + bodyW * 1.08, bodyTop + bodyH * 0.6, x + bodyW * 0.7, bodyTop);
    ctx.closePath(); paint(cloth, lw);
    ctx.fillStyle = tone(cloth, -0.3);
    ctx.fillRect(x - bodyW * 0.98, bodyTop + bodyH * 0.55, bodyW * 1.96, Math.max(1.5, bodyH * 0.14));
    ctx.fillStyle = '#e8b84a'; ctx.fillRect(x - r * 0.1, bodyTop + bodyH * 0.53, r * 0.2, Math.max(1.5, bodyH * 0.18));
    gloss(x - bodyW * 0.45, bodyTop + bodyH * 0.25, bodyW * 0.2, bodyH * 0.12, -0.3, 0.25);
    // arma principal: detrás de la cabeza si apunta hacia arriba
    const wpn = face.wpn, aim = face.aim ?? Math.atan2(face.y || 0, face.x || 1);
    const drawWpn = () => {
      const hx = x + Math.cos(aim) * r * 0.8, hy = bodyTop + bodyH * 0.45 + Math.sin(aim) * r * 0.35;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(aim);
      if (Math.cos(aim) < 0) ctx.scale(1, -1);
      drawHeldWeapon(wpn, r * 0.12, tt);
      ctx.restore();
      ctx.beginPath(); ctx.arc(hx, hy, r * 0.2, 0, TAU); paint(skin, lw * 0.8);
    };
    if (wpn && Math.sin(aim) < -0.3) drawWpn();
    // cabeza
    ctx.beginPath(); ctx.ellipse(x, cy, hr * Math.min(1.15, wide * 1.05), hr, 0, 0, TAU); paint(skin, lw);
    gloss(x - hr * 0.4, cy - hr * 0.45, hr * 0.25, hr * 0.14, -0.5, 0.4);
    ctx.fillStyle = 'rgba(255,120,140,.35)';
    ctx.beginPath(); ctx.ellipse(x + face.x * hr * 0.3 - hr * 0.5, cy + hr * 0.35, hr * 0.18, hr * 0.1, 0, 0, TAU); ctx.ellipse(x + face.x * hr * 0.3 + hr * 0.5, cy + hr * 0.35, hr * 0.18, hr * 0.1, 0, 0, TAU); ctx.fill();
    drawHat(ch, x, cy, hr, sd, face, lw, hat);
    const ex = x + face.x * hr * 0.35, ey = cy + hr * 0.1 + (face.y || 0) * hr * 0.15;
    cuteEyes(ex, ey, hr * 0.3, hr * 0.3);
    if (ch.acc === 'cool') {
      const e = hr * 0.3;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(ex - e, ey, e * 1.1, e * 0.8, 0, 0, TAU); ctx.ellipse(ex + e, ey, e * 1.1, e * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillRect(ex - e * 0.3, ey - e * 0.35, e * 0.6, e * 0.3);
      ctx.fillStyle = 'rgba(160,220,255,.7)';
      ctx.fillRect(ex - e * 1.5, ey - e * 0.45, e * 0.5, e * 0.22);
      ctx.fillRect(ex + e * 0.55, ey - e * 0.45, e * 0.5, e * 0.22);
    }
    if (wpn && Math.sin(aim) >= -0.3) drawWpn();
  }

  // Sombreros y accesorios. r aquí es el radio de la cabeza; cy, su centro.
  function drawHat(ch, x, cy, r, sd, face, lw, hat) {
    const w = r * Math.min(1.15, (ch.wide || 1) * 1.05);
    switch (ch.acc) {
      case 'hood':
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.05, Math.PI * 1.95); paint(hat, lw); break;
      case 'helm':
        ctx.beginPath(); ctx.arc(x, cy - 1, r + 1.5, Math.PI, 0); ctx.closePath(); paint(hat, lw);
        ctx.fillStyle = '#c9d1e0'; ctx.fillRect(x - 1.5, cy - r - 6, 3, 7); break;
      case 'band': {
        ctx.beginPath(); ctx.rect(x - w, cy - r * 0.55, w * 2, r * 0.3); paint(hat, lw * 0.8);
        ctx.beginPath(); ctx.moveTo(x - sd * w, cy - r * 0.45); ctx.lineTo(x - sd * (w + 9), cy - r * 0.1); ctx.lineTo(x - sd * (w + 7), cy - r * 0.7); ctx.closePath(); paint(hat, lw * 0.8); break;
      }
      case 'flame': {
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.1, Math.PI * 1.9); paint(hat, lw);
        const fl = Math.sin(performance.now() / 90) * 2;
        ctx.beginPath(); ctx.moveTo(x - 5, cy - r + 1); ctx.quadraticCurveTo(x, cy - r - 14 - fl, x + 5, cy - r + 1); paint('#ffb02e', lw * 0.7);
        break;
      }
      case 'spark':
        ctx.beginPath(); ctx.arc(x, cy - 2, r + 1, Math.PI * 1.05, Math.PI * 1.95); paint(hat, lw);
        ctx.beginPath(); ctx.moveTo(x + 2, cy - r - 12); ctx.lineTo(x - 4, cy - r - 3); ctx.lineTo(x, cy - r - 3); ctx.lineTo(x - 2, cy - r + 4); ctx.lineTo(x + 4, cy - r - 6); ctx.lineTo(x, cy - r - 6); ctx.closePath(); paint('#ffe14d', lw * 0.6);
        break;
      case 'bucket': {
        // Un cubo puesto del revés, algo torcido.
        ctx.save(); ctx.translate(x, cy - r * 0.55); ctx.rotate(-0.18);
        ctx.beginPath();
        ctx.moveTo(-r * 1.0, r * 0.2); ctx.lineTo(-r * 0.72, -r * 0.85); ctx.lineTo(r * 0.72, -r * 0.85); ctx.lineTo(r * 1.0, r * 0.2);
        ctx.closePath(); paint(hat, lw);
        ctx.fillStyle = tone(hat, -0.25); ctx.fillRect(r * 0.3, -r * 0.8, r * 0.35, r * 0.95);
        ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.moveTo(-r * 0.88, -r * 0.2); ctx.lineTo(r * 0.88, -r * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -r * 0.85, r * 0.5, Math.PI, 0); ctx.strokeStyle = '#6b737c'; ctx.lineWidth = lw * 0.8; ctx.stroke();
        gloss(-r * 0.45, -r * 0.5, r * 0.1, r * 0.25, 0.2, 0.5);
        ctx.restore();
        break;
      }
      case 'viking': {
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(x + s * w * 0.8, cy - r * 0.55);
          ctx.quadraticCurveTo(x + s * w * 1.55, cy - r * 1.05, x + s * w * 1.3, cy - r * 1.75);
          ctx.quadraticCurveTo(x + s * w * 1.15, cy - r * 1.1, x + s * w * 0.45, cy - r * 0.85);
          paint('#f2e6c9', lw * 0.8);
        }
        ctx.beginPath(); ctx.ellipse(x, cy - 2, w + 1.5, r + 1, 0, Math.PI, 0); ctx.closePath(); paint(hat, lw);
        ctx.beginPath(); ctx.rect(x - w - 1.5, cy - 4, (w + 1.5) * 2, 4); paint(tone(hat, -0.2), lw * 0.7);
        ctx.fillStyle = '#e8b84a'; ctx.beginPath(); ctx.arc(x, cy - r * 0.55, r * 0.12, 0, TAU); ctx.fill();
        gloss(x - w * 0.45, cy - r * 0.65, r * 0.25, r * 0.1, -0.3, 0.45);
        break;
      }
      case 'tophat': {
        // Chistera alta para parecer aún más alto.
        ctx.beginPath(); ctx.rect(x - w * 0.8, cy - r * 2.05, w * 1.6, r * 1.15); paint(hat, lw);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - w * 0.8, cy - r * 1.15, w * 1.6, r * 0.22);
        ctx.beginPath(); ctx.ellipse(x, cy - r * 0.85, w * 1.3, r * 0.16, 0, 0, TAU); paint(hat, lw);
        gloss(x - w * 0.45, cy - r * 1.7, r * 0.08, r * 0.3, 0, 0.3);
        break;
      }
      case 'sailor': {
        // Gorro de marinero blanco con cinta azul.
        ctx.beginPath(); ctx.ellipse(x, cy - r * 0.6, w * 0.92, r * 0.52, 0, Math.PI, 0); ctx.closePath(); paint(hat, lw);
        ctx.beginPath(); ctx.rect(x - w * 1.05, cy - r * 0.68, w * 2.1, r * 0.26); paint(hat, lw * 0.8);
        ctx.fillStyle = '#1f3f7a'; ctx.fillRect(x - w * 0.95, cy - r * 0.86, w * 1.9, r * 0.15);
        ctx.fillStyle = '#e5536b'; ctx.beginPath(); ctx.arc(x, cy - r * 1.12, r * 0.12, 0, TAU); ctx.fill();
        break;
      }
      case 'cool': {
        // Tupé.
        ctx.beginPath();
        ctx.ellipse(x, cy - r * 0.32, w + 0.5, r * 0.72, 0, Math.PI, 0);
        ctx.moveTo(x - sd * w * 0.6, cy - r * 0.9);
        ctx.quadraticCurveTo(x + sd * w * 0.2, cy - r * 1.8, x + sd * w * 1.2, cy - r * 1.05);
        ctx.quadraticCurveTo(x + sd * w * 0.4, cy - r * 1.05, x + sd * w * 0.1, cy - r * 0.6);
        paint(hat, lw);
        gloss(x + sd * w * 0.3, cy - r * 1.15, r * 0.25, r * 0.08, sd * -0.4, 0.35);
        break;
      }
      case 'cap': {
        // Gorra con visera hacia donde mira.
        ctx.beginPath(); ctx.ellipse(x + sd * w * 0.9, cy - r * 0.36, w * 0.75, r * 0.17, 0, 0, TAU); paint(tone(hat, -0.2), lw * 0.8);
        ctx.beginPath(); ctx.ellipse(x, cy - r * 0.35, w + 1, r * 0.75, 0, Math.PI, 0); ctx.closePath(); paint(hat, lw);
        ctx.fillStyle = tone(hat, 0.4); ctx.beginPath(); ctx.arc(x, cy - r * 1.08, r * 0.12, 0, TAU); ctx.fill();
        break;
      }
    }
  }

  // Arma principal de un jugador (para dibujarla en su mano).
  const mainWeaponOf = p => {
    const w = p.weapons && p.weapons.find(w => WEAPONS[w.id] && WEAPONS[w.id].main);
    return w ? w.id : p.startWeapon || 'basico';
  };

  function drawPlayers() {
    for (const p of G.players) {
      if (p.gone) continue;
      const bob = Math.sin(p.walk) * 1.5;
      const aim = p.aimA !== undefined && G.time - (p.aimT || 0) < 1.2 ? p.aimA : Math.atan2(p.face.y, p.face.x);
      const now = performance.now();
      if (p.walk !== p._lw) { p._lw = p.walk; p._mvT = now; }
      const face = { x: p.face.x, y: p.face.y, side: p.side, walk: p.walk, wpn: mainWeaponOf(p), aim, mv: now - (p._mvT || 0) < 120 };
      if (p.down) {
        // Jugador caído: fantasma con el anillo de reanimación.
        ctx.globalAlpha = 0.4;
        drawHero(p.x, p.y, p.r, p.ch, { x: face.x, y: face.y, side: face.side }, 0, false);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, 0, TAU); ctx.stroke();
        if (p.reviveT > 0) {
          ctx.strokeStyle = '#6fffb0';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.reviveT / REVIVE_TIME)); ctx.stroke();
        }
        ctx.font = `800 12px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText('💀 ' + pname(p), p.x, p.y - p.r - 26);
        ctx.fillStyle = '#fff'; ctx.fillText('💀 ' + pname(p), p.x, p.y - p.r - 26);
        continue;
      }
      if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.45;
      // anillo de color del jugador a sus pies
      if (G.coop) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.globalAlpha *= 0.8;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.95, p.r * 1.1, p.r * 0.38, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0 ? 0.45 : 1;
      }
      shadow(p.x, p.y, p.r);
      drawHero(p.x, p.y, p.r, p.ch, face, bob);
      if (p.slowT > 0) {
        ctx.strokeStyle = 'rgba(240,242,255,.75)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI + 0.3; ctx.moveTo(p.x + Math.cos(a) * p.r * 1.2, p.y + Math.sin(a) * p.r * 1.2); ctx.lineTo(p.x - Math.cos(a) * p.r * 1.2, p.y - Math.sin(a) * p.r * 1.2); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const bw = 38, by = p.y + p.r + 10, k = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = INK; rr(p.x - bw / 2 - 2, by - 2, bw + 4, 9, 4); ctx.fill();
      ctx.fillStyle = k > 0.3 ? '#5ef08f' : '#ff4d6a'; rr(p.x - bw / 2, by, Math.max(2, bw * k), 5, 2.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(p.x - bw / 2 + 2, by + 1, Math.max(0, bw * k - 4), 1.5);
      if (G.coop) {
        ctx.font = `800 11px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = INK;
        const ny = p.y - p.r * (1.5 + (p.ch.tall ? 0.9 : 0)) - 12;
        ctx.strokeText(pname(p), p.x, ny);
        ctx.fillStyle = p.color; ctx.fillText(pname(p), p.x, ny);
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
    const now = G.time;
    for (const b of G.bullets) {
      if (!inView(b.x, b.y, 40)) continue;
      if (b.kind === 'bala' && b.shape === 'ball') {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05);
        ctx.globalAlpha = 0.3; ctx.strokeStyle = '#fff'; ctx.lineWidth = b.r * 1.4; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(performance.now() / 80);
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); paint('#ffffff', 1.8);
        ctx.fillStyle = INK;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i / 5 * TAU; ctx.lineTo(Math.cos(a) * b.r * 0.38, Math.sin(a) * b.r * 0.38); }
        ctx.fill();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i + 0.5) / 5 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * b.r * 0.95, Math.sin(a) * b.r * 0.95, b.r * 0.28, 0, TAU); ctx.fill(); }
        ctx.restore();
        gloss(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.3, b.r * 0.15, -0.5, 0.5);
      } else if (b.kind === 'bala' && b.shape === 'star') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(performance.now() / 50);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? b.r * 0.45 : b.r * 1.6, a = i / 8 * TAU; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        ctx.closePath(); paint(b.color, 1.6);
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b.r * 1.6, 0); ctx.lineTo(b.r * 0.32, -b.r * 0.32); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.32, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'bala' && b.shape === 'knife') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.globalAlpha = 0.35; ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-26, 0); ctx.stroke(); ctx.globalAlpha = 1;
        rr(-12, -2.2, 7, 4.4, 2); paint('#7a5230', 1.4);
        rr(-5.5, -4, 2.5, 8, 1); paint('#e8b84a', 1.2);
        ctx.beginPath(); ctx.moveTo(-3, -2.8); ctx.lineTo(10, 0); ctx.lineTo(-3, 2.8); ctx.closePath(); paint(b.color, 1.4);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(-3, -1.8); ctx.lineTo(8, -0.3); ctx.lineTo(-3, 0); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'meteoro') {
        // La roca cae en diagonal hasta su sombra.
        const k = Math.max(0, b.t / (b.max || 0.6)), hx = b.x + 160 * k, hy = b.y - 340 * k, rr2 = 9 + b.R * 0.12;
        const trail = ctx.createLinearGradient(hx, hy, hx + 48, hy - 100);
        trail.addColorStop(0, b.ev ? 'rgba(255,120,220,.85)' : 'rgba(255,170,70,.85)'); trail.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.strokeStyle = trail; ctx.lineWidth = rr2 * 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 48, hy - 100); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(hx, hy, rr2 * 1.25, 0, TAU); ctx.fillStyle = b.ev ? 'rgba(255,138,216,.45)' : 'rgba(255,138,61,.45)'; ctx.fill();
        ctx.beginPath(); ctx.arc(hx, hy, rr2, 0, TAU); paint('#5a3a2a', 2);
        ctx.fillStyle = b.ev ? '#ff8ad8' : '#ff8a3d';
        ctx.beginPath(); ctx.arc(hx + rr2 * 0.25, hy - rr2 * 0.25, rr2 * 0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a2418';
        ctx.beginPath(); ctx.arc(hx - rr2 * 0.35, hy + rr2 * 0.3, rr2 * 0.22, 0, TAU); ctx.arc(hx + rr2 * 0.1, hy + rr2 * 0.5, rr2 * 0.14, 0, TAU); ctx.fill();
      } else if (b.kind === 'charco') {
        continue;
      } else if (b.kind === 'bala' && b.shape === 'ki') {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.7);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#c8f3ff'); g.addColorStop(0.6, b.color); g.addColorStop(1, 'rgba(127,219,255,0)');
        ctx.strokeStyle = 'rgba(127,219,255,.35)'; ctx.lineWidth = b.r * 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.14, b.y - b.vy * 0.14); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = b.r * 0.6;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.1, b.y - b.vy * 0.1); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.7, 0, TAU); ctx.fill();
      } else if (b.kind === 'disco' && b.skin === 'shield') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        const rs = [[1, '#c62828'], [0.75, '#f5f5f5'], [0.52, '#c62828'], [0.34, '#1565c0']];
        rs.forEach(([k, c], i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, b.r * k, 0, TAU); ctx.fill(); if (!i) ink(2); });
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const rr2 = i % 2 ? b.r * 0.13 : b.r * 0.32, a = -Math.PI / 2 + i / 10 * TAU; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
        gloss(b.x - b.r * 0.45, b.y - b.r * 0.45, b.r * 0.3, b.r * 0.14, -0.7, 0.4);
      } else if (b.kind === 'bala' && b.shape === 'tornado') {
        const r = b.r, t = now * 9 + b.x * 0.03;
        ctx.save(); ctx.translate(b.x, b.y);
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.beginPath(); ctx.ellipse(0, r * 0.9, r * 0.8, r * 0.3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = b.ev ? '#c9a3ff' : '#e6f4ff'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const k = i / 4, y = r * 0.9 - k * r * 2.3, wd = r * (0.3 + k * 0.95), st = (t + i * 1.3) % TAU;
          ctx.globalAlpha = 0.9 - 0.1 * i;
          ctx.beginPath(); ctx.ellipse(Math.sin(t * 0.7 + i) * r * 0.22, y, wd, wd * 0.3, 0, st, st + 4.2); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        ctx.restore();
      } else if (b.kind === 'bala' && b.shape === 'mine') {
        const r = b.r, on = Math.sin(now * 9 + b.x) > 0;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(b.x, b.y + r * 0.6, r, r * 0.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2f36';
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.785; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r * 0.85, b.y + Math.sin(a) * r * 0.85, 2.5, 0, TAU); ctx.fill(); }
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.8, 0, TAU); paint(b.ev ? '#5a3470' : '#454b55', 2);
        ctx.fillStyle = on ? (b.ev ? '#ff7ae0' : '#ff3b3b') : '#6a1f1f';
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.3, 0, TAU); ctx.fill();
        if (on) { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.75, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      } else if (b.kind === 'bala' && b.shape === 'wisp') {
        const r = b.r;
        ctx.lineCap = 'round';
        ctx.strokeStyle = b.color; ctx.globalAlpha = 0.35; ctx.lineWidth = r * 1.5;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.07, b.y - b.vy * 0.07); ctx.stroke();
        ctx.lineCap = 'butt';
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 2.2);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, b.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.9; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 2.2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = '#20304a';
        ctx.beginPath(); ctx.arc(b.x - r * 0.3, b.y - r * 0.15, r * 0.16, 0, TAU); ctx.arc(b.x + r * 0.3, b.y - r * 0.15, r * 0.16, 0, TAU); ctx.fill();
      } else if (b.kind === 'bala') {
        // Trazadora: estela del color del arma, halo y punta blanca.
        const tl = 0.035;
        ctx.lineCap = 'round';
        ctx.strokeStyle = b.color; ctx.globalAlpha = 0.35; ctx.lineWidth = b.r * 2.2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * tl, b.y - b.vy * tl); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = b.r;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * tl * 0.7, b.y - b.vy * tl * 0.7); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.7, 0, TAU); ctx.fill();
      } else if (b.kind === 'cohete') {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
        const fl = Math.random() * 6;
        ctx.fillStyle = 'rgba(255,90,40,.5)';
        ctx.beginPath(); ctx.moveTo(-8, -4.5); ctx.lineTo(-20 - fl, 0); ctx.lineTo(-8, 4.5); ctx.fill();
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath(); ctx.moveTo(-8, -2.5); ctx.lineTo(-14 - fl * 0.6, 0); ctx.lineTo(-8, 2.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-11, -7); ctx.lineTo(-4, -4); ctx.closePath(); paint('#e74c3c', 1.2);
        ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-11, 7); ctx.lineTo(-4, 4); ctx.closePath(); paint('#e74c3c', 1.2);
        rr(-9, -4, 16, 8, 3.5); paint('#d9dde8', 1.6);
        ctx.beginPath(); ctx.moveTo(6, -4); ctx.quadraticCurveTo(13, -1, 13, 0); ctx.quadraticCurveTo(13, 1, 6, 4); ctx.closePath(); paint('#e74c3c', 1.6);
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-7, -2.8, 11, 1.5);
        ctx.restore();
      } else if (b.kind === 'chispa') {
        const col = b.ev ? '#9dffef' : '#ffe066';
        ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = b.r * 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035); ctx.stroke();
        ctx.globalAlpha = 0.3; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        // estrellita de cuatro puntas
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(now * 6);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const rad = i % 2 ? b.r * 0.4 : b.r * 1.35, a = i / 8 * TAU; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        // Disco retornante
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        const col = b.ev ? '#ff5edc' : '#ff9f43';
        ctx.globalAlpha = 0.3; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 1.35, -0.4, 1.6); ctx.lineTo(0, 0); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); paint(col, 2);
        ctx.fillStyle = tone(col, -0.3);
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.72, 0, TAU); ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.3, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.82, 0, 1.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.82, Math.PI, Math.PI + 1.2); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.restore();
      }
    }
    // Proyectiles enemigos: aro de tinta para que se distingan bien de los tuyos.
    for (const b of G.ebullets) {
      if (!inView(b.x, b.y, 20)) continue;
      if (b.web) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(now * 2);
        ctx.fillStyle = 'rgba(240,242,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, b.r * 1.3, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#f0f2ff'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI; ctx.moveTo(Math.cos(a) * b.r * 1.3, Math.sin(a) * b.r * 1.3); ctx.lineTo(-Math.cos(a) * b.r * 1.3, -Math.sin(a) * b.r * 1.3); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.8, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.4, 0, TAU); ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = 0.35; ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.7, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); paint(b.color, 2);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.15, b.y - b.r * 0.15, b.r * 0.42, 0, TAU); ctx.fill();
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
      if (f.type === 'die') { drawDie(f); continue; }
      if (f.type === 'chain') {
        // Relámpago en zigzag que une a los enemigos alcanzados.
        const k = f.life / f.max, P = f.pts;
        ctx.globalAlpha = k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const path = [];
        for (let i = 2; i < P.length; i += 2) {
          const x0 = P[i - 2], y0 = P[i - 1], x1 = P[i], y1 = P[i + 1];
          for (let j = 1; j <= 4; j++) { const t = j / 4, jt = j < 4 ? 9 : 0; path.push(x0 + (x1 - x0) * t + rand(-jt, jt), y0 + (y1 - y0) * t + rand(-jt, jt)); }
        }
        for (const [lw, col] of [[8, f.ev ? 'rgba(255,120,240,.45)' : 'rgba(120,200,255,.45)'], [2.5, '#ffffff']]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(P[0], P[1]);
          for (let i = 0; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]);
          ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        continue;
      }
      if (f.type === 'ring') {
        const k = f.life / f.max, R = f.R * (1.05 - 0.6 * k);
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color || '#b0bec5'; ctx.lineWidth = 10 * k + 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.stroke();
        ctx.fillStyle = f.color ? 'rgba(20,10,30,.22)' : 'rgba(120,130,150,.18)';
        ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (f.type === 'punch') {
        // Brazo elástico que sale y vuelve, con el puño al final.
        const k = f.life / f.max, ext = Math.sin((1 - k) * Math.PI), L = Math.max(14, f.R * ext);
        const ex = f.x + Math.cos(f.a) * L, ey = f.y + Math.sin(f.a) * L;
        inkLine('#f0c8a0', 7, () => { ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); });
        ctx.beginPath(); ctx.arc(ex, ey, 11, 0, TAU); paint('#f0c8a0', 2.5);
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 16 + 10 * (1 - k), f.a - 0.9, f.a + 0.9); ctx.stroke();
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

  // Cristales de experiencia tallados: cara iluminada a la izquierda y en sombra a la derecha.
  const GEM_COL = [['#5ab8ff', '#bfe6ff', '#2f6fb8'], ['#5dff9d', '#c8ffdc', '#249a5c'], ['#ff5c9a', '#ffc2d9', '#b02a62']];
  function drawGems() {
    const tt = G.time;
    for (const g of G.gems) {
      if (!inView(g.x, g.y, 10)) continue;
      const tier = g.v >= 10 ? 2 : g.v >= 3 ? 1 : 0, s = [5, 6.5, 8][tier], [base, lit, dark] = GEM_COL[tier];
      const y = g.y + Math.sin(tt * 3 + g.x * 0.05) * 1.2;
      ctx.beginPath(); ctx.moveTo(g.x, y - s); ctx.lineTo(g.x + s * 0.7, y); ctx.lineTo(g.x, y + s); ctx.lineTo(g.x - s * 0.7, y); ctx.closePath();
      paint(base, 1.5);
      ctx.fillStyle = lit; ctx.beginPath(); ctx.moveTo(g.x, y - s + 1.5); ctx.lineTo(g.x - s * 0.7 + 1.5, y); ctx.lineTo(g.x, y); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(g.x, y + s - 1.5); ctx.lineTo(g.x + s * 0.7 - 1.5, y); ctx.lineTo(g.x, y); ctx.fill();
    }
  }

  function drawPickups() {
    for (const k of G.pickups) {
      if (!inView(k.x, k.y, 30)) continue;
      const bob = Math.sin(k.t * 4) * 3;
      if (k.type === 'cofre') {
        const x = k.x, y = k.y + bob;
        ctx.globalAlpha = 0.35 + Math.sin(k.t * 5) * 0.12; ctx.fillStyle = '#ffd75e';
        ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        shadow(x, k.y + 4, 13);
        rr(x - 14, y - 4, 28, 14, 3); paint('#a8652a', 2);
        ctx.beginPath(); ctx.moveTo(x - 14, y - 3); ctx.lineTo(x - 14, y - 9); ctx.quadraticCurveTo(x, y - 18, x + 14, y - 9); ctx.lineTo(x + 14, y - 3); ctx.closePath(); paint('#c47a34', 2);
        ctx.fillStyle = '#ffd75e';
        ctx.fillRect(x - 10, y - 13, 3, 23); ctx.fillRect(x + 7, y - 13, 3, 23);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(x - 10, y - 13, 3, 23); ctx.strokeRect(x + 7, y - 13, 3, 23);
        rr(x - 3.5, y - 6, 7, 8, 2); paint('#ffd75e', 1.4);
        ctx.fillStyle = INK; ctx.fillRect(x - 0.8, y - 3.5, 1.6, 3);
        gloss(x - 6, y - 11, 4, 1.5, -0.2, 0.5);
      } else if (k.type === 'moneda') {
        const sx = Math.abs(Math.cos(k.t * 5)), y = k.y + bob * 0.5;
        ctx.beginPath(); ctx.ellipse(k.x, y, 6.5 * sx + 1, 6.5, 0, 0, TAU); paint('#ffd75e', 1.5);
        ctx.fillStyle = '#c99a2e';
        ctx.beginPath(); ctx.ellipse(k.x, y, 3.5 * sx + 0.5, 3.5, 0, 0, TAU); ctx.fill();
        if (sx > 0.4) gloss(k.x - 2.5 * sx, y - 3, 1.6 * sx, 1, 0, 0.7);
      } else if (k.type === 'carne') {
        ctx.save(); ctx.translate(k.x, k.y + bob); ctx.rotate(-0.6);
        rr(2, -2, 10, 4, 2); paint('#f2e6c9', 1.5);
        ctx.beginPath(); ctx.arc(12, -2.5, 2.6, 0, TAU); ctx.arc(12, 2.5, 2.6, 0, TAU); paint('#f2e6c9', 1.5);
        ctx.beginPath(); ctx.ellipse(-2, 0, 9, 7.5, 0, 0, TAU); paint('#b5532f', 1.8);
        ctx.fillStyle = '#d9774a'; ctx.beginPath(); ctx.ellipse(-4, -2.5, 5, 3, -0.3, 0, TAU); ctx.fill();
        gloss(-5, -3.5, 2.5, 1.2, -0.3, 0.6);
        ctx.restore();
      } else {
        // Imán
        ctx.save(); ctx.translate(k.x, k.y + bob); ctx.rotate(0.5);
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(0, -1, 7, Math.PI, 0); ctx.lineTo(7, 6); ctx.lineTo(3, 6); ctx.lineTo(3, -1); ctx.arc(0, -1, 3, 0, Math.PI, true); ctx.lineTo(-3, 6); ctx.lineTo(-7, 6); ctx.closePath();
        paint('#e5394b', 1.6);
        ctx.fillStyle = '#e8eef8'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
        ctx.fillRect(-7, 3, 4, 4); ctx.strokeRect(-7, 3, 4, 4); ctx.fillRect(3, 3, 4, 4); ctx.strokeRect(3, 3, 4, 4);
        gloss(-4, -5, 2.5, 1, -0.6, 0.55);
        ctx.restore();
      }
    }
  }

  function drawFx() {
    for (const q of G.particles) {
      const k = Math.max(0, q.life / q.max);
      ctx.globalAlpha = k;
      ctx.fillStyle = q.color;
      const s = q.size * (0.5 + 0.5 * k);
      ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `900 14px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // Panel de un jugador: nivel, armas, pasivas y renacimientos.
  function drawPanel(p, ax, y0, right) {
    const small = W < 420, sz = small ? 24 : 28, gap = sz + 5, fs = small ? 13 : 16;
    const xAt = i => right ? ax - sz - i * gap : ax + i * gap;
    ctx.globalAlpha = p.down ? 0.45 : 1;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = right ? 'right' : 'left';
    ctx.font = `800 ${small ? 14 : 16}px ${FONT_U}`;
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const label = `${G.coop ? pname(p) + ' · ' : ''}Nv. ${p.level}${p.down ? ' 💀' : ''}`;
    ctx.strokeText(label, ax, y0 - 9);
    ctx.fillStyle = G.coop ? p.color : '#ffd75e';
    ctx.fillText(label, ax, y0 - 9);
    const slot = (x, y, icon, label, bg, edge) => {
      ctx.fillStyle = 'rgba(14,11,32,.78)'; rr(x, y, sz, sz, 8); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.stroke();
      if (bg) { ctx.fillStyle = bg; rr(x + 2, y + 2, sz - 4, sz - 4, 6); ctx.fill(); }
      ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(icon, x + sz / 2, y + sz / 2 + 1);
      ctx.font = `900 10px ${FONT_U}`; ctx.lineWidth = 3; ctx.strokeStyle = INK;
      ctx.strokeText(label, x + sz - 3, y + sz - 3);
      ctx.fillStyle = edge === '#ffd75e' ? '#ffd75e' : '#fff';
      ctx.fillText(label, x + sz - 3, y + sz - 3);
    };
    p.weapons.forEach((w, i) => slot(xAt(i), y0, WEAPONS[w.id].icon, w.evolved ? '★' : w.lvl,
      w.evolved ? 'rgba(255,215,94,.22)' : null, w.evolved ? '#ffd75e' : 'rgba(200,190,255,.45)'));
    Object.keys(p.passives).forEach((id, i) => slot(xAt(i), y0 + gap, PASSIVES[id].icon, p.passives[id], null, 'rgba(200,190,255,.22)'));
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
      ctx.fillStyle = 'rgba(22,18,43,.85)'; ctx.strokeStyle = q.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 27, y + Math.sin(a) * 27);
      ctx.lineTo(x + Math.cos(a + 0.4) * 18, y + Math.sin(a + 0.4) * 18);
      ctx.lineTo(x + Math.cos(a - 0.4) * 18, y + Math.sin(a - 0.4) * 18);
      ctx.fill();
      ctx.font = `900 10px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(q.down ? '💀' : pname(q), x, y);
    }
  }

  function drawHUD(vs) {
    const st = SAFE.t, sl = SAFE.l, sr = SAFE.r, sb = SAFE.b;
    const small = W < 420, split = vs.length > 1, side = split && vs[1].x > 0;
    // Barra de experiencia de cada jugador, arriba de su vista.
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, st + 10);
    for (const v of vs) {
      const p = v.p, y = v.y === 0 ? st : v.y, h = v.y === 0 ? 10 : 7;
      if (v.y > 0) { ctx.fillStyle = INK; ctx.fillRect(v.x, y, v.w, h); }
      const fw = v.w * Math.min(1, p.xp / p.xpNext);
      const xg = ctx.createLinearGradient(v.x, 0, v.x + v.w, 0);
      xg.addColorStop(0, '#3f6bff'); xg.addColorStop(1, '#5ff0ff');
      ctx.fillStyle = xg; ctx.fillRect(v.x, y + 1, fw, h - 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(v.x, y + 1, fw, 2);
      // marcas cada 10% para leer cuánto falta
      ctx.fillStyle = 'rgba(22,18,43,.55)';
      for (let i = 1; i < 10; i++) ctx.fillRect(v.x + v.w * i / 10, y + 1, 1, h - 2);
    }

    // Tiempo, muertes y oro
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = `700 ${small ? 30 : 36}px ${FONT_D}`;
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(fmtTime(G.time), W / 2, st + 44);
    ctx.fillStyle = '#f4ecd8'; ctx.fillText(fmtTime(G.time), W / 2, st + 44);
    ctx.font = `800 ${small ? 12 : 13}px ${FONT_U}`;
    ctx.lineWidth = 3; ctx.strokeText(`☠ ${G.kills}   🪙 ${G.gold}`, W / 2, st + 62);
    ctx.fillStyle = '#cfc8f0'; ctx.fillText(`☠ ${G.kills}   🪙 ${G.gold}`, W / 2, st + 62);

    // Paneles: el de cada vista; en online, además, un resumen de los compañeros a la derecha.
    vs.forEach((v, i) => {
      if (split && side && i === 1) drawPanel(v.p, W - sr - 10, st + 92, true);
      else drawPanel(v.p, (v.x === 0 ? sl : v.x) + 10, (v.y === 0 ? st : v.y) + 40, false);
    });
    if (!split && G.coop) {
      let y = st + 84;
      for (const q of G.players) {
        if (q === G.p || q.gone) continue;
        const bw = small ? 70 : 90, x1 = W - sr - 10;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.font = `800 ${small ? 11 : 12}px ${FONT_U}`;
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
      const b = G.boss, bw = Math.min(520, W - 40), x = (W - bw) / 2, y = H - sb - 34, k = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = INK; rr(x - 4, y - 4, bw + 8, 20, 8); ctx.fill();
      ctx.strokeStyle = tone(b.color, 0.2); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = tone(b.color, -0.2); rr(x, y, Math.max(2, bw * k), 12, 5); ctx.fill();
      ctx.fillStyle = b.color; rr(x, y, Math.max(2, bw * k), 8, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x + 4, y + 2, Math.max(0, bw * k - 8), 2);
      ctx.fillStyle = 'rgba(22,18,43,.5)';
      for (let i = 1; i < 4; i++) ctx.fillRect(x + bw * i / 4 - 1, y, 2, 12);
      ctx.font = `700 ${small ? 20 : 24}px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(b.name, W / 2, y - 10);
      ctx.fillStyle = tone(b.color, 0.55); ctx.fillText(b.name, W / 2, y - 10);
    }

    // Joysticks táctiles
    if (state === 'play' || state === 'countdown') {
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
        ctx.font = `800 14px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        vs.forEach((v, i) => { ctx.fillStyle = PCOLORS[i]; ctx.fillText(`${pname(v.p)}: toca aquí para moverte`, v.x + v.w / 2, v.y + v.h - (i === vs.length - 1 ? sb + 70 : 40)); });
      }
    }
  }

  // Claro de luna: los bordes de cada vista se oscurecen y el centro queda iluminado.
  // Ambiente de cada mapa temático: burbujas, ascuas, murciélagos lejanos o estrellas fugaces.
  function drawAmbient(map) {
    const kind = map.ambient;
    if (!kind) return;
    const t = G.time, A = 220;
    for (let tx = Math.floor(camX / A); tx <= Math.floor((camX + CVW) / A); tx++) {
      for (let ty = Math.floor(camY / A); ty <= Math.floor((camY + CVH) / A); ty++) {
        const h = hash(tx * 7 + 3, ty * 13 + 5), bx = tx * A + h % A, by = ty * A + (h >>> 9) % A, ph = (h >>> 18) % 100 / 100;
        if (kind === 'bubbles') {
          const k = (t * 0.25 + ph) % 1, y = by - k * A, x = bx + Math.sin(t * 2 + ph * 9) * 6;
          ctx.globalAlpha = 0.5 * Math.sin(k * Math.PI);
          ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 3 + (h % 4), 0, TAU); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 1, 0, TAU); ctx.fill();
        } else if (kind === 'embers') {
          const k = (t * 0.35 + ph) % 1, y = by - k * A * 0.8, x = bx + Math.sin(t * 3 + ph * 7) * 10;
          ctx.globalAlpha = 0.8 * Math.sin(k * Math.PI);
          ctx.fillStyle = k < 0.5 ? '#ffd36b' : '#ff6a2a';
          ctx.fillRect(x, y, 2.5, 2.5);
        } else if (kind === 'bats') {
          if (h % 3) continue;
          const k = (t * 0.08 + ph) % 1, x = bx + (k - 0.5) * A * 2, y = by + Math.sin(t * 2 + ph * 5) * 12, f = Math.sin(t * 14 + ph * 20) * 3;
          ctx.globalAlpha = 0.35; ctx.strokeStyle = '#05030a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x - 8, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 8, y - f); ctx.stroke();
        } else if (kind === 'stars') {
          ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + ph * 10));
          ctx.fillStyle = '#e8ecff'; ctx.fillRect(bx, by, 1.6, 1.6);
          const k = (t * 0.15 + ph) % 3;
          if (h % 5 === 0 && k < 0.25) {
            const sx = bx + k * 400, sy = by + k * 200;
            ctx.globalAlpha = 1 - k * 4; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 26, sy - 13); ctx.stroke();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Se dibuja una vez en un lienzo pequeño y se estira: un degradado a pantalla completa cada fotograma es caro.
  let moonC = null, moonKey = '';
  function drawMoonlight(v) {
    const key = Math.round(v.w) + 'x' + Math.round(v.h);
    if (key !== moonKey) {
      moonKey = key;
      const s = 160 / Math.max(v.w, v.h), w = Math.ceil(v.w * s), h = Math.ceil(v.h * s);
      moonC = document.createElement('canvas'); moonC.width = w; moonC.height = h;
      const mc = moonC.getContext('2d'), R = Math.hypot(w, h) * 0.62;
      const g = mc.createRadialGradient(w / 2, h * 0.45, R * 0.35, w / 2, h * 0.45, R);
      g.addColorStop(0, 'rgba(10,8,26,0)'); g.addColorStop(1, 'rgba(10,8,26,.55)');
      mc.fillStyle = g; mc.fillRect(0, 0, w, h);
    }
    ctx.drawImage(moonC, v.x, v.y, v.w, v.h);
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

  // ---------- Portal: escena animada detrás de los menús ----------
  // Cielo de noche con luna, colinas del mapa elegido y tu personaje defendiéndose de una fila de monstruos.
  let menuT = 0;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PORTAL = { mobs: [], shots: [], bits: [], spawnT: 0.6, fireT: 0, aim: 0, sky: null, skyKey: '' };
  const PARADE = ['slime', 'slime', 'murcielago', 'espectro', 'arana', 'lobo', 'calabaza', 'bruto', 'murcielago'];

  function portalSky(map) {
    const key = W + 'x' + H + map.id;
    if (PORTAL.skyKey === key) return PORTAL.sky;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr);
    const sc = c.getContext('2d');
    sc.scale(dpr, dpr);
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e0b22'); g.addColorStop(0.55, tone(map.accent, -0.55)); g.addColorStop(1, tone(map.accent, -0.25));
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    // Luna con halo y cráteres
    const m = PORTAL.moon = { x: W * (W > H ? 0.8 : 0.78), y: H * (W > H ? 0.22 : 0.14), R: Math.min(W, H) * (W > H ? 0.11 : 0.13) };
    const halo = sc.createRadialGradient(m.x, m.y, m.R * 0.8, m.x, m.y, m.R * 4);
    halo.addColorStop(0, 'rgba(244,236,216,.35)'); halo.addColorStop(0.3, 'rgba(200,180,255,.12)'); halo.addColorStop(1, 'rgba(200,180,255,0)');
    sc.fillStyle = halo; sc.fillRect(0, 0, W, H);
    if (map.id === 'luna') {
      // Desde la Base Lunar se ve la Tierra.
      const eg = sc.createRadialGradient(m.x - m.R * 0.3, m.y - m.R * 0.3, m.R * 0.1, m.x, m.y, m.R);
      eg.addColorStop(0, '#7fc8ff'); eg.addColorStop(1, '#2a5fb8');
      sc.fillStyle = eg; sc.beginPath(); sc.arc(m.x, m.y, m.R, 0, TAU); sc.fill();
      sc.save(); sc.beginPath(); sc.arc(m.x, m.y, m.R, 0, TAU); sc.clip();
      sc.fillStyle = '#5fbf6a';
      for (const [dx, dy, rx, ry] of [[-0.3, -0.2, 0.35, 0.25], [0.35, 0.25, 0.3, 0.4], [-0.1, 0.55, 0.2, 0.12]]) { sc.beginPath(); sc.ellipse(m.x + dx * m.R, m.y + dy * m.R, rx * m.R, ry * m.R, 0.4, 0, TAU); sc.fill(); }
      sc.fillStyle = 'rgba(255,255,255,.7)';
      for (const [dx, dy] of [[0.1, -0.5], [-0.45, 0.3], [0.5, -0.1]]) { sc.beginPath(); sc.ellipse(m.x + dx * m.R, m.y + dy * m.R, m.R * 0.28, m.R * 0.07, -0.2, 0, TAU); sc.fill(); }
      sc.fillStyle = 'rgba(5,8,25,.45)'; sc.beginPath(); sc.arc(m.x + m.R * 0.45, m.y + m.R * 0.3, m.R * 1.05, 0, TAU); sc.fill();
      sc.restore();
    } else {
      const mg = sc.createRadialGradient(m.x - m.R * 0.3, m.y - m.R * 0.3, m.R * 0.1, m.x, m.y, m.R);
      mg.addColorStop(0, '#fffdf4'); mg.addColorStop(1, '#efe0b8');
      sc.fillStyle = mg; sc.beginPath(); sc.arc(m.x, m.y, m.R, 0, TAU); sc.fill();
      sc.fillStyle = 'rgba(190,170,130,.28)';
      for (const [dx, dy, k] of [[0.3, -0.2, 0.22], [-0.35, 0.25, 0.16], [0.1, 0.45, 0.12], [-0.2, -0.45, 0.1]]) {
        sc.beginPath(); sc.arc(m.x + dx * m.R, m.y + dy * m.R, k * m.R, 0, TAU); sc.fill();
      }
    }
    PORTAL.sky = c; PORTAL.skyKey = key;
    return c;
  }

  // Colina con siluetas del mapa (pinos, cactus, tumbas o bloques) que se desplaza en paralaje.
  function portalHill(map, base, amp, col, speed, seed, deco) {
    const off = reduceMotion ? 0 : menuT * speed;
    const y = x => base - amp * (0.55 + 0.45 * Math.sin((x + off) * 0.004 + seed) * Math.sin((x + off) * 0.0017 + seed * 2));
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, y(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    if (!deco) return;
    const step = 46, kind = { desierto: 'cactus', cripta: 'tomb', bloques: 'block', castillo: 'tower', abismo: 'coral', volcan: 'spire', luna: 'dome' }[map.id] || 'pine';
    for (let i = Math.floor(off / step) - 1; i < (off + W) / step + 1; i++) {
      const h = hash(i, seed * 100 | 0);
      if (h % 3 === 0) continue;
      const x = i * step - off + (h >>> 8) % 30, gy = y(x) + 4, s = amp * (0.35 + ((h >>> 4) % 10) / 22);
      ctx.beginPath();
      if (kind === 'pine') {
        ctx.moveTo(x, gy - s * 1.6); ctx.lineTo(x + s * 0.45, gy - s * 0.6); ctx.lineTo(x + s * 0.3, gy - s * 0.6);
        ctx.lineTo(x + s * 0.6, gy); ctx.lineTo(x - s * 0.6, gy); ctx.lineTo(x - s * 0.3, gy - s * 0.6); ctx.lineTo(x - s * 0.45, gy - s * 0.6);
      } else if (kind === 'cactus') {
        ctx.rect(x - s * 0.12, gy - s * 1.2, s * 0.24, s * 1.2); ctx.rect(x - s * 0.45, gy - s * 0.8, s * 0.18, s * 0.45); ctx.rect(x + s * 0.27, gy - s * 0.95, s * 0.18, s * 0.5);
      } else if (kind === 'tomb') {
        ctx.moveTo(x - s * 0.3, gy); ctx.lineTo(x - s * 0.3, gy - s * 0.6); ctx.arc(x, gy - s * 0.6, s * 0.3, Math.PI, 0); ctx.lineTo(x + s * 0.3, gy);
      } else if (kind === 'tower') {
        ctx.rect(x - s * 0.25, gy - s * 1.5, s * 0.5, s * 1.5);
        ctx.moveTo(x - s * 0.35, gy - s * 1.5); ctx.lineTo(x, gy - s * 2.2); ctx.lineTo(x + s * 0.35, gy - s * 1.5);
      } else if (kind === 'coral') {
        ctx.rect(x - s * 0.08, gy - s * 1.1, s * 0.16, s * 1.1); ctx.rect(x - s * 0.45, gy - s * 0.8, s * 0.12, s * 0.5); ctx.rect(x + s * 0.3, gy - s * 1.0, s * 0.12, s * 0.6);
        ctx.rect(x - s * 0.45, gy - s * 0.42, s * 0.9, s * 0.12);
      } else if (kind === 'spire') {
        ctx.moveTo(x - s * 0.5, gy); ctx.lineTo(x - s * 0.1, gy - s * 1.4); ctx.lineTo(x + s * 0.15, gy - s * 0.9); ctx.lineTo(x + s * 0.3, gy - s * 1.2); ctx.lineTo(x + s * 0.55, gy);
      } else if (kind === 'dome') {
        ctx.moveTo(x - s * 0.6, gy); ctx.arc(x, gy, s * 0.6, Math.PI, 0); ctx.rect(x - s * 0.04, gy - s * 1.1, s * 0.08, s * 0.5);
      } else {
        ctx.rect(x - s * 0.4, gy - s * 0.8, s * 0.8, s * 0.8);
      }
      ctx.fill();
    }
  }

  function renderMenuBg(dt) {
    menuT += dt;
    const map = mapById(S.map), P = PORTAL;
    ctx.drawImage(portalSky(map), 0, 0, W, H);
    // Estrellas que titilan
    for (let i = 0; i < 90; i++) {
      const h = hash(i, 17), x = (h % 1000) / 1000 * W, y = ((h >>> 10) % 1000) / 1000 * H * 0.6;
      const tw = reduceMotion ? 0.7 : 0.5 + 0.5 * Math.sin(menuT * (1 + (h >>> 20) % 3) + i);
      ctx.globalAlpha = 0.25 + 0.6 * tw;
      ctx.fillStyle = '#f4ecd8';
      const s = (h >>> 5) % 4 === 0 ? 2 : 1.2;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
    const gy = H * (W > H ? 0.8 : 0.84);    // línea del suelo
    portalHill(map, gy - H * 0.14, H * 0.12, tone(map.accent, -0.42), 6, 1.3, true);
    portalHill(map, gy - H * 0.04, H * 0.09, tone(map.accent, -0.62), 14, 4.1, true);
    // niebla al pie de las colinas
    const fog = ctx.createLinearGradient(0, gy - H * 0.12, 0, gy + 10);
    fog.addColorStop(0, 'rgba(200,190,255,0)'); fog.addColorStop(1, 'rgba(200,190,255,.14)');
    ctx.fillStyle = fog; ctx.fillRect(0, gy - H * 0.12, W, H * 0.12 + 10);
    // suelo
    const gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, tone(map.accent, -0.7)); gg.addColorStop(1, map.bg);
    ctx.fillStyle = gg; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = tone(map.accent, -0.35); ctx.fillRect(0, gy, W, 2);
    // decorado del mapa en el suelo, desplazándose
    const goff = reduceMotion ? 0 : menuT * 30;
    for (let i = Math.floor(goff / 70) - 1; i < (goff + W) / 70 + 1; i++) {
      const h = hash(i, 55);
      drawDecor(map.decor[h % 3], i * 70 - goff + (h >>> 8) % 40, gy + 12 + (h >>> 12) % Math.max(8, (H - gy - 20) | 0), h);
    }

    // La batalla: escala según la pantalla para que se lea bien en móvil y en escritorio.
    const s = Math.max(1.3, Math.min(2.2, Math.min(W, H * 0.75) / 270));
    const groundY = gy + Math.min(H - gy - 10, 26 * s);
    const hx = Math.max(70, W * (W > H ? 0.2 : 0.18)), hy = groundY - 14 * s;
    if (!reduceMotion) {
      P.spawnT -= dt;
      if (P.spawnT <= 0 && P.mobs.length < 8) {
        P.spawnT = 0.9 + Math.random() * 0.9;
        const type = PARADE[(Math.random() * PARADE.length) | 0], et = ETYPES[type];
        const color = (map.colors && map.colors[type]) || et.color || '#ccc';
        P.mobs.push({ type, color, r: et.r, x: W + 60, y: groundY - (type === 'murcielago' ? 70 * s : et.r * s) - Math.random() * 8 * s,
          vx: -(type === 'lobo' ? 95 : type === 'murcielago' ? 80 : 45 + Math.random() * 25) * s, hp: type === 'bruto' ? 4 : 2, wob: Math.random() * TAU, flash: 0, frz: 0 });
      }
      P.fireT -= dt;
      const tgt = P.mobs.filter(m => m.hp > 0 && m.x < W - 20).sort((a, b) => a.x - b.x)[0];
      if (tgt) P.aim = Math.atan2(tgt.y - (hy - 2 * s), tgt.x - hx);
      if (tgt && P.fireT <= 0) {
        P.fireT = 0.42;
        const sp = 700;
        P.shots.push({ x: hx + Math.cos(P.aim) * 18 * s, y: hy - 2 * s + Math.sin(P.aim) * 18 * s, vx: Math.cos(P.aim) * sp, vy: Math.sin(P.aim) * sp, life: 1.2 });
      }
      for (const m of P.mobs) {
        m.x += m.vx * dt; m.wob += dt * 6; m.flash -= dt;
        if (m.type === 'murcielago') m.y += Math.sin(m.wob * 0.8) * 30 * s * dt;
        if (m.x < hx + 40 * s) m.hp = 0;
      }
      for (const b of P.shots) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        for (const m of P.mobs) {
          if (m.hp > 0 && Math.hypot(m.x - b.x, m.y - b.y) < m.r * s + 4) { m.hp--; m.flash = 0.1; m.x += 10 * s; b.life = 0; break; }
        }
      }
      for (const m of P.mobs) if (m.hp <= 0 && !m.dead) {
        m.dead = true;
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * TAU, v = (60 + Math.random() * 160) * s;
          P.bits.push({ x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * s, life: 0.6, max: 0.6, color: i % 3 ? m.color : '#fff', gem: false });
        }
        P.bits.push({ x: m.x, y: m.y, vx: 0, vy: -120 * s, life: 1.4, max: 1.4, color: '#5ab8ff', gem: true });
      }
      for (const q of P.bits) {
        q.life -= dt;
        if (q.gem) { const k = 1 - q.life / q.max; q.x += (hx - q.x) * Math.min(1, dt * 3 * k * 3); q.y += q.vy * dt * (1 - k) + (hy - q.y) * Math.min(1, dt * 3 * k * 3); }
        else { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * s * dt; }
      }
      P.mobs = P.mobs.filter(m => !m.dead && m.x > -100);
      P.shots = P.shots.filter(b => b.life > 0 && b.x < W + 50);
      P.bits = P.bits.filter(q => q.life > 0);
    }

    // Luz de farol del héroe sobre el suelo
    ctx.save(); ctx.beginPath(); ctx.rect(0, gy, W, H - gy); ctx.clip();
    const lg = ctx.createRadialGradient(hx, groundY, 10, hx, groundY, 150 * s);
    lg.addColorStop(0, 'rgba(255,220,150,.24)'); lg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(hx, groundY, 150 * s, 50 * s, 0, 0, TAU); ctx.fill();
    ctx.restore();

    // Monstruos (de lejos a cerca), dibujados en directo y mirando hacia el héroe
    const saved = [camX, CVW];
    camX = -1e6; CVW = 0;
    for (const m of P.mobs) {
      ctx.save(); ctx.translate(m.x, m.y); ctx.scale(s, s);
      drawEnemy({ ...m, x: 0, y: 0 });
      ctx.restore();
    }
    [camX, CVW] = saved;

    // Héroe con su arma equipada
    const ch = charById(S.char), wpn = gearStats(myGear()).weapon || 'basico';
    ctx.save(); ctx.translate(hx, hy); ctx.scale(s, s);
    shadow(0, 0, 14);
    drawHero(0, 0, 14, ch, { x: Math.cos(P.aim) || 1, y: Math.sin(P.aim) * 0.5, side: 1, walk: 0, wpn, aim: P.aim }, Math.sin(menuT * 3) * 1);
    ctx.restore();

    // Disparos, chispas y cristales
    ctx.lineCap = 'round';
    for (const b of P.shots) {
      ctx.strokeStyle = 'rgba(255,233,168,.45)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
    }
    ctx.lineCap = 'butt';
    for (const q of P.bits) {
      ctx.globalAlpha = Math.min(1, q.life / q.max * 1.5);
      if (q.gem) {
        const g = 6 * s / 1.4;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - g); ctx.lineTo(q.x + g * 0.7, q.y); ctx.lineTo(q.x, q.y + g); ctx.lineTo(q.x - g * 0.7, q.y); ctx.closePath();
        paint('#5ab8ff', 1.5);
      } else { ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5 * s, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    // Luciérnagas
    for (let i = 0; i < 16; i++) {
      const h = hash(i, 91), t = reduceMotion ? i : menuT * (0.2 + (h % 7) / 30) + i;
      const x = ((h % 1000) / 1000 * W + Math.sin(t) * 40 + menuT * 6) % (W + 40) - 20;
      const y = gy - H * 0.2 + ((h >>> 10) % 1000) / 1000 * H * 0.3 + Math.cos(t * 1.3) * 20;
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
      ctx.globalAlpha = a * 0.22; ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Vistas de la pantalla: en cooperativo local, una por jugador (lado a lado en horizontal,
  // una encima de otra en vertical); si no, una sola centrada en el jugador de esta pantalla.
  const splitSide = () => W >= H;
  // ---------- Ultis ----------
  // Cada personaje tiene una definitiva propia que se usa una sola vez por partida (Q / Espacio, Intro para J2,
  // LB/RB/Y en el mando o el botón redondo de la pantalla). El anfitrión calcula el daño; el invitado solo ve la
  // animación. Efectos de cine (zoom, franjas negras, fotogramas de impacto, congelado) y partículas propias,
  // siempre con un número limitado de formas por fotograma para no bajar el rendimiento.
  const ULT_DUR = { kraken: 3.2, jackpot: 3.6, charm: 2.8, blitz: 2.5, hole: 3.5, odin: 2.8 };
  // La acción empieza cuando se va el cartel (antes, solo se carga el aura).
  const ULT_DELAY = 0.9;
  const ULT_COL = { kraken: '#4fc3ff', jackpot: '#ffd23f', charm: '#ff6fb5', blitz: '#7ff6ff', hole: '#a86bff', odin: '#ffb347' };
  function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const ultDmg = p => (180 + 1.6 * G.time) * (p.stats.dmg || 1);
  // Los jefes reciben como mucho un 7% de su vida por golpe de definitiva.
  function ultHit(e, dmg, kx = 0, ky = 0, kb = 0) { hurt(e, e.boss ? Math.min(dmg, e.maxHp * 0.07) : dmg, kx, ky, kb); }
  const once = (u, k, t) => (u.t >= t && !u.f[k] ? (u.f[k] = true) : false);
  const inScreen = (e, x, y) => !e.dead && Math.abs(e.x - x) < VW / 2 + 40 && Math.abs(e.y - y) < VH / 2 + 40;
  const ease = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  const backOut = k => { k = Math.min(1, Math.max(0, k)); const s = 2.2; return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); };

  // Golpe fuerte: fotograma de impacto (colores invertidos y líneas radiales), temblor y un instante congelado.
  function uImpact(x, y, power) {
    G.impact = { t: 0, x, y, p: power, seed: Math.random() * 1e6 | 0 };
    G.shake = Math.max(G.shake, 8 + 10 * power);
    if (power >= 0.8) G.hitstop = Math.max(G.hitstop || 0, 0.045 + 0.04 * power);
  }
  // Partículas de las ultis (con tope para no saturar).
  function upart(o) { const a = G.uparts || (G.uparts = []); if (a.length < 380) { o.max = o.life; a.push(o); } }
  function upBurst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = o.a0 != null ? o.a0 + rand(-o.spread, o.spread) : rand(0, TAU), s = rand(o.s0, o.s1);
      upart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.up || 0), g: o.g || 0, life: rand(o.l0, o.l1), size: rand(o.z0, o.z1),
        shape: o.shape, color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color, rot: rand(0, TAU), vr: rand(-12, 12), drag: o.drag || 0 });
    }
  }

  function tryUlt(idx) {
    if (!G || state !== 'play') return;
    const p = G.players[idx];
    if (!p || p.down || p.gone || p.ultUsed) return;
    if (G.online === 'guest') {
      if (idx === G.localIdx && !p.ultReq) { p.ultReq = true; Net.send({ t: 'ult' }); }
      return;
    }
    castUlt(p);
  }

  function castUlt(p) {
    if (p.ultUsed || p.down || p.gone || !p.ch.ult) return;
    p.ultUsed = true;
    p.inv = Math.max(p.inv, ULT_DUR[p.ch.ult.id] + ULT_DELAY + 0.5);
    const seed = Math.random() * 1e9 | 0;
    startUlt(p.ch.ult.id, p.idx, p.x, p.y, seed, p.face.x, p.face.y, true);
    netOut(['U', p.ch.ult.id, p.idx, Math.round(p.x), Math.round(p.y), seed, r1(p.face.x), r1(p.face.y)]);
    G.slowmo = 0.6;
  }

  function startUlt(kind, idx, x, y, seed, fx, fy, host) {
    const p = G.players[idx], rnd = seeded(seed);
    const u = { kind, idx, x, y, t: -ULT_DELAY, dur: ULT_DUR[kind], f: {}, host, fx: fx || 1, fy: fy || 0, seed, col: ULT_COL[kind] };
    const near = G.enemies.filter(e => inScreen(e, x, y));
    if (kind === 'kraken') {
      u.tents = [];
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + rnd() * 0.5, d = 150 + rnd() * 180, tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d;
        u.tents.push({ x: tx, y: ty, ox: Math.cos(a), oy: Math.sin(a), t0: 0.35 + i * 0.16, len: 125 + rnd() * 55, ph: rnd() * 6 });
      }
    } else if (kind === 'jackpot') {
      u.coins = [];
      for (let i = 0; i < 70; i++) u.coins.push({ x: x + (rnd() - 0.5) * VW * 0.95, y: y + (rnd() - 0.5) * VH * 0.95, t0: 1.1 + i * 0.03, sp: rnd() * 6 });
    } else if (kind === 'charm') {
      u.hearts = near.slice(0, 50).map(e => ({ x: e.x, y: e.y, d: rnd() * 0.4, s: 0.7 + rnd() * 0.6 }));
    } else if (kind === 'blitz') {
      const pts = [[x, y]], pool = near.slice();
      for (let i = 0; i < 9; i++) {
        if (pool.length) { const e = pool.splice(rnd() * pool.length | 0, 1)[0]; pts.push([e.x, e.y]); }
        else pts.push([x + (rnd() - 0.5) * VW * 0.8, y + (rnd() - 0.5) * VH * 0.8]);
      }
      pts.push([x, y]);
      u.pts = pts; u.seg = 1.8 / (pts.length - 1);
      // Rayos que salen de cada punto al pasar el fantasma.
      u.forks = pts.map(() => [0, 1, 2].map(() => ({ a: rnd() * TAU, l: 50 + rnd() * 70 })));
    } else if (kind === 'hole') {
      u.cx = x + u.fx * 170; u.cy = y + u.fy * 170;
      u.stars = Array.from({ length: 22 }, () => ({ a: rnd() * TAU, d: rnd(), s: 0.6 + rnd() }));
    }
    G.ults.push(u);
    G.cutin = { idx, t: 0, ch: p.ch, color: p.color, col: u.col };
    G.camFx = { t: 0, dur: u.dur + ULT_DELAY, amt: kind === 'blitz' || kind === 'charm' ? 0.12 : 0.2 };
    Sound.play('ult', 0.1);
    G.shake = Math.max(G.shake, 6);
    upBurst(x, y - 20, 26, { s0: 120, s1: 380, l0: 0.4, l1: 0.9, z0: 2, z1: 5, shape: 'spark', color: [u.col, '#ffffff'], drag: 3 });
  }

  function updateUlts(dt) {
    if (G.uparts && G.uparts.length) {
      for (const q of G.uparts) {
        if (q.drag) { const k = Math.max(0, 1 - q.drag * dt); q.vx *= k; q.vy *= k; }
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.life -= dt;
        if (q.to && Math.hypot(q.to[0] - q.x, q.to[1] - q.y) < 18) q.life = 0;
      }
      G.uparts = G.uparts.filter(q => q.life > 0);
    }
    if (!G.ults || !G.ults.length) return;
    for (const u of G.ults) {
      u.t += dt;
      if (u.t >= u.dur) { u.dead = true; continue; }
      const p = G.players[u.idx];
      if (p && !p.down) { u.px = p.x; u.py = p.y; }
      if (u.t >= 0) ULT_TICK[u.kind](u, p, dt);
      // Aura del que lanza la ulti: chispas que suben.
      if (p && !p.down && Math.random() < dt * 30) upart({ x: p.x + rand(-14, 14), y: p.y + rand(-4, 10), vx: rand(-15, 15), vy: rand(-140, -70), g: 0, life: rand(0.4, 0.7), size: rand(2, 4), shape: 'spark', color: u.col, rot: 0, vr: 0 });
    }
    G.ults = G.ults.filter(u => !u.dead);
  }

  const ULT_TICK = {
    kraken(u, p) {
      u.tents.forEach((k, i) => {
        if (!once(u, 's' + i, k.t0 + 0.45)) return;
        const hx = k.x + k.ox * k.len * 0.55, hy = k.y + k.oy * k.len * 0.4;
        if (i === 0 || i === u.tents.length - 1) uImpact(hx, hy, 0.8); else G.shake = Math.max(G.shake, 9);
        upBurst(hx, hy, 16, { a0: -Math.PI / 2, spread: 1.1, s0: 200, s1: 480, g: 1100, l0: 0.5, l1: 0.9, z0: 3, z1: 6, shape: 'drop', color: ['#bff0ff', '#7fd3ff', '#ffffff'] });
        if (!u.host) return;
        query(hx, hy, 105, e => ultHit(e, ultDmg(p), k.ox, k.oy, 320));
        sfx('boom', 0.06);
      });
    },
    jackpot(u, p) {
      const mx = u.px ?? u.x, my = (u.py ?? u.y) - 130;
      if (once(u, 'win', 1.0)) {
        uImpact(mx, my, 1);
        upBurst(mx, my, 90, { a0: -Math.PI / 2, spread: 1.4, s0: 250, s1: 620, g: 700, l0: 1.0, l1: 1.8, z0: 4, z1: 8, shape: 'confetti', color: ['#ff4d6a', '#ffd23f', '#5ef08f', '#4fc3ff', '#c38bff', '#ffffff'], drag: 1.2 });
        upBurst(mx, my, 26, { a0: -Math.PI / 2, spread: 0.8, s0: 300, s1: 560, g: 900, l0: 0.9, l1: 1.4, z0: 7, z1: 10, shape: 'coin', color: '#ffd23f' });
        if (u.host) sfx('evolve', 0.2);
      }
      for (let i = 0; i < u.coins.length; i++) {
        const c = u.coins[i];
        if (!once(u, 'c' + i, c.t0 + 0.45)) continue;
        if (i % 2 === 0) upBurst(c.x, c.y, 4, { a0: -Math.PI / 2, spread: 1.3, s0: 90, s1: 200, g: 500, l0: 0.25, l1: 0.45, z0: 2, z1: 3, shape: 'spark', color: '#fff3a0' });
        if (!u.host) continue;
        query(c.x, c.y, 55, e => ultHit(e, ultDmg(p) * 0.55));
        if (i % 6 === 0) sfx('gem', 0.03);
      }
      if (u.host && once(u, 'gold', 3.1)) for (let i = 0; i < 18; i++) dropCoin(u.x + rand(-160, 160), u.y + rand(-120, 120));
    },
    charm(u, p) {
      if (!once(u, 'hit', 0.2)) return;
      const cx = u.px ?? u.x, cy = u.py ?? u.y;
      uImpact(cx, cy, 1.1);
      upBurst(cx, cy - 20, 50, { s0: 200, s1: 700, l0: 0.6, l1: 1.1, z0: 5, z1: 10, shape: 'star', color: ['#ffffff', '#ffe4f2', '#ffd75e'], drag: 2 });
      upBurst(cx, cy - 20, 24, { s0: 150, s1: 450, l0: 0.8, l1: 1.3, z0: 8, z1: 14, shape: 'heart', color: ['#ff5fa8', '#ff8cc6'], drag: 2, up: -60 });
      if (!u.host) return;
      let pops = 0;
      for (const e of G.enemies) {
        if (!inScreen(e, u.x, u.y)) continue;
        const raw = ultDmg(p) * 1.2, d = e.boss ? Math.min(raw, e.maxHp * 0.07) : raw;
        hurt(e, d, 0, 0, 0, true);
        addText(e.x + rand(-6, 6), e.y - e.r - 8, '💖' + Math.round(d), '#ff6fb5');
        if (e.dead) {
          // Los que caen estallan en corazones.
          if (pops++ < 45) upBurst(e.x, e.y, 3, { s0: 80, s1: 220, l0: 0.6, l1: 1.0, z0: 6, z1: 10, shape: 'heart', color: ['#ff5fa8', '#ff8cc6'], up: -80, drag: 2 });
        } else if (e.boss) e.slow = Math.max(e.slow, 3);
        else { e.charmT = 5; e.frz = 0; e.fuse = -1; e.mode = 0; e.dashT = 0; }
      }
    },
    blitz(u, p) {
      for (let i = 1; i < u.pts.length; i++) {
        if (!once(u, 'g' + i, 0.15 + i * u.seg)) continue;
        const [x0, y0] = u.pts[i - 1], [x1, y1] = u.pts[i];
        upBurst(x1, y1, 14, { s0: 150, s1: 420, l0: 0.25, l1: 0.5, z0: 2, z1: 4, shape: 'spark', color: ['#ffffff', '#9ff7ff', '#5ad1ff'], drag: 2 });
        G.shake = Math.max(G.shake, 6);
        if (!u.host) continue;
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        query((x0 + x1) / 2, (y0 + y1) / 2, L / 2 + 40, e => {
          const rx = e.x - x0, ry = e.y - y0, along = rx * ux + ry * uy, across = rx * uy - ry * ux;
          if (along < -30 || along > L + 30 || Math.abs(across) > 48 + e.r) return;
          ultHit(e, ultDmg(p) * 0.7, Math.sign(across) * uy, -Math.sign(across) * ux, 260);
        });
        sfx('zap', 0.05);
      }
      // Tajo final: todo lo que tocó el rayo estalla a la vez.
      if (once(u, 'cut', 2.0)) {
        uImpact(u.x, u.y, 1.2);
        for (let i = 1; i < u.pts.length - 1; i++) upBurst(u.pts[i][0], u.pts[i][1], 6, { s0: 100, s1: 300, l0: 0.3, l1: 0.6, z0: 2, z1: 4, shape: 'spark', color: '#ffffff', drag: 2 });
        if (u.host) {
          for (let i = 1; i < u.pts.length - 1; i++) query(u.pts[i][0], u.pts[i][1], 70, e => ultHit(e, ultDmg(p) * 0.5));
          sfx('slash', 0.05);
        }
      }
    },
    hole(u, p, dt) {
      if (u.t > 0.2 && u.t < 2.6) {
        // Rocas y restos que se traga el agujero.
        if (Math.random() < dt * 22) {
          const a = rand(0, TAU), d = rand(300, 420), sx = u.cx + Math.cos(a) * d, sy = u.cy + Math.sin(a) * d;
          const sp = rand(260, 420), dx = u.cx - sx, dy = u.cy - sy, l = Math.hypot(dx, dy);
          upart({ x: sx, y: sy, vx: dx / l * sp - dy / l * 120, vy: dy / l * sp + dx / l * 120, g: 0, life: 1.6, size: rand(4, 8), shape: 'rock', color: '#6b5a7a', rot: rand(0, TAU), vr: rand(-8, 8), to: [u.cx, u.cy] });
        }
        if (u.host) {
          query(u.cx, u.cy, 440, e => {
            if (e.boss) return;
            const dx = u.cx - e.x, dy = u.cy - e.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(d, (120 + 420 * (1 - d / 460)) * dt);
            e.x += dx / d * sp; e.y += dy / d * sp;
          });
          u.tick = (u.tick || 0) - dt;
          if (u.tick <= 0) { u.tick = 0.25; query(u.cx, u.cy, 95, e => ultHit(e, ultDmg(p) * 0.12)); }
        }
      }
      if (once(u, 'boom', 2.75)) {
        uImpact(u.cx, u.cy, 1.3);
        upBurst(u.cx, u.cy, 70, { s0: 250, s1: 900, l0: 0.6, l1: 1.2, z0: 3, z1: 7, shape: 'star', color: ['#ffffff', '#ff9a3d', '#ff5fd2', '#8f6bff', '#7ff6ff'], drag: 1.5 });
        if (!u.host) return;
        query(u.cx, u.cy, 320, e => {
          const kx = e.x - u.cx, ky = e.y - u.cy, l = Math.hypot(kx, ky) || 1;
          ultHit(e, ultDmg(p) * 1.3, kx / l, ky / l, 520);
        });
        sfx('boom', 0.05);
      }
    },
    odin(u, p) {
      if (once(u, 'slam', 0.85)) {
        uImpact(u.x, u.y, 1.4);
        upBurst(u.x, u.y, 40, { a0: -Math.PI / 2, spread: 1.3, s0: 300, s1: 700, g: 1300, l0: 0.7, l1: 1.2, z0: 5, z1: 11, shape: 'rock', color: ['#8a7560', '#6b5a48', '#a8927a'] });
        upBurst(u.x, u.y, 30, { s0: 200, s1: 500, l0: 0.6, l1: 1.0, z0: 10, z1: 18, shape: 'dust', color: '#cbb89c', drag: 3 });
        upBurst(u.x, u.y, 24, { s0: 300, s1: 800, l0: 0.3, l1: 0.6, z0: 2, z1: 4, shape: 'spark', color: ['#ffffff', '#ffd27a'], drag: 2 });
        if (u.host) {
          query(u.x, u.y, 360, e => {
            const kx = e.x - u.x, ky = e.y - u.y, l = Math.hypot(kx, ky) || 1;
            ultHit(e, ultDmg(p) * 1.3, kx / l, ky / l, 600);
            if (!e.boss) e.frz = Math.max(e.frz, 1.2);
          });
          sfx('boom', 0.05);
        }
      }
      for (let i = 0; i < 6; i++) {
        if (!once(u, 'b' + i, 1.0 + i * 0.09) || !u.host) continue;
        const t = nearest(u.x, u.y, 8, 420)[i];
        if (!t) continue;
        const seed = Math.random() * 1000 | 0, R = 60;
        G.effects.push({ type: 'bolt', x: t.x, y: t.y, R, life: 0.3, max: 0.3, seed, ev: true });
        netOut(['z', Math.round(t.x), Math.round(t.y), R, seed, 1]);
        query(t.x, t.y, R, e => ultHit(e, ultDmg(p) * 0.5));
        sfx('zap', 0.05);
      }
    },
  };

  // ----- Dibujo de las ultis -----
  // Rayo en zigzag (determinista con la semilla para que no tiemble demasiado).
  function jagged(x0, y0, x1, y1, n, amp, rnd) {
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const k = i / n; ctx.lineTo(x0 + (x1 - x0) * k + (rnd() - 0.5) * amp, y0 + (y1 - y0) * k + (rnd() - 0.5) * amp); }
    ctx.lineTo(x1, y1);
  }
  function magicCircle(x, y, R, t, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55);
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, TAU); ctx.stroke();
    ctx.rotate(t * 0.8);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a0 = i / 6 * TAU, a1 = ((i + 2) % 6) / 6 * TAU; ctx.moveTo(Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86); ctx.lineTo(Math.cos(a1) * R * 0.86, Math.sin(a1) * R * 0.86); }
    ctx.stroke();
    ctx.rotate(-t * 1.6);
    ctx.fillStyle = col; ctx.font = `900 ${R * 0.13}px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; ctx.save(); ctx.translate(Math.cos(an) * R * 0.93, Math.sin(an) * R * 0.93); ctx.rotate(an + Math.PI / 2); ctx.fillText(runes[i], 0, 0); ctx.restore(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawUltsGround() {
    if (!G.ults) return;
    for (const u of G.ults) {
      const t = u.t, p = G.players[u.idx];
      // Aura bajo el que lanza la ulti.
      if (p && !p.down) {
        const k = Math.max(0, Math.min(1, (t + ULT_DELAY) * 4, (u.dur - t) * 3)), pu = 0.5 + 0.5 * Math.sin(t * 14);
        ctx.globalAlpha = 0.55 * k; ctx.strokeStyle = u.col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.95, p.r * (1.6 + pu * 0.3), p.r * (0.55 + pu * 0.1), 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.18 * k; ctx.fillStyle = u.col;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.95, p.r * 2.2, p.r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (t < 0) continue;
      if (u.kind === 'kraken') {
        const a = Math.min(1, t * 3, (u.dur - t) * 2);
        ctx.save(); ctx.translate(u.x, u.y); ctx.scale(1, 0.55);
        ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#0a3352';
        ctx.beginPath(); ctx.arc(0, 0, 170, 0, TAU); ctx.fill();
        ctx.rotate(-t * 4);
        ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 4; ctx.globalAlpha = 0.75 * a;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(0, 0, 36 + i * 28, i, i + 3.4); ctx.stroke(); }
        ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(0, 0, 50 + i * 28, i + 3.6, i + 4.6); ctx.stroke(); }
        ctx.restore();
        // Ojo gigante del kraken que se abre en el centro del remolino.
        const open = Math.min(ease((t - 0.25) / 0.35), Math.max(0, (u.dur - 0.3 - t) / 0.3)) * (t > 0.25 ? 1 : 0);
        if (open > 0.02) {
          const ew = 70, eh = 34 * open, look = Math.sin(t * 2) * 14;
          ctx.save(); ctx.translate(u.x, u.y);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.ellipse(0, 0, ew, eh, 0, 0, TAU); ctx.fill(); ink(4);
          ctx.fillStyle = '#ff9a1a'; ctx.beginPath(); ctx.ellipse(look, 0, ew * 0.42, Math.min(eh, 30), 0, 0, TAU); ctx.fill();
          ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(look, 0, 7, Math.min(eh * 0.9, 26), 0, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(look - 12, -eh * 0.35, 5, 0, TAU); ctx.fill();
          ctx.restore(); ctx.globalAlpha = 1;
        }
        for (const k of u.tents) {
          const lt = t - k.t0 + 0.2;
          if (lt < 0) continue;
          const pa = Math.min(1, lt * 4, (u.dur - t) * 3);
          ctx.globalAlpha = 0.75 * pa; ctx.fillStyle = '#0b2f4a';
          ctx.beginPath(); ctx.ellipse(k.x, k.y, 48, 19, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#9fe2ff'; ctx.lineWidth = 2;
          for (let i = 0; i < 2; i++) { const rp = ((lt * 50 + i * 15) % 30); ctx.beginPath(); ctx.ellipse(k.x, k.y, 48 + rp, 19 + rp * 0.4, 0, 0, TAU); ctx.stroke(); }
          ctx.globalAlpha = 1;
        }
      } else if (u.kind === 'hole') {
        const a = Math.min(1, t * 2), R = 280 * a * (t < 2.75 ? 1 : Math.max(0, 1 - (t - 2.75) * 3));
        ctx.globalAlpha = 0.4; ctx.fillStyle = '#12051f';
        ctx.beginPath(); ctx.arc(u.cx, u.cy, R, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        // Anillos de gravedad que se cierran hacia el centro.
        if (t < 2.75) for (let i = 0; i < 4; i++) {
          const k = 1 - ((t * 0.9 + i / 4) % 1);
          ctx.strokeStyle = `rgba(190,140,255,${0.5 * (1 - k)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(u.cx, u.cy, 60 + k * 320, (60 + k * 320) * 0.7, 0, 0, TAU); ctx.stroke();
        }
      } else if (u.kind === 'odin') {
        magicCircle(u.x, u.y, 230, t, '#ffcf6a', Math.min(1, t * 3, (u.dur - t) * 2) * 0.8);
        if (t > 0.85) {
          // Grietas de fuego en el suelo que se van apagando.
          const k = 1 - (t - 0.85) / (u.dur - 0.85), rnd = seeded(7);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const [w, c] of [[9 * k + 2, `rgba(255,90,30,${0.5 * k})`], [4 * k + 1, `rgba(255,220,120,${0.95 * k})`]]) {
            const r2 = seeded(7);
            ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
            for (let i = 0; i < 14; i++) {
              let a = i / 14 * TAU + r2() * 0.3, x = u.x, y = u.y;
              ctx.moveTo(x, y);
              for (let j = 0; j < 6; j++) { a += (r2() - 0.5) * 0.7; x += Math.cos(a) * 58; y += Math.sin(a) * 58 * 0.6; ctx.lineTo(x, y); }
            }
            ctx.stroke();
          }
          void rnd;
          ctx.lineCap = 'butt';
          ctx.fillStyle = `rgba(40,25,15,${0.55 * k})`;
          ctx.beginPath(); ctx.ellipse(u.x, u.y, 100, 44, 0, 0, TAU); ctx.fill();
        } else {
          const k = t / 0.85;
          ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.4 * k})`;
          ctx.beginPath(); ctx.ellipse(u.x, u.y, 40 + 80 * k, (40 + 80 * k) * 0.4, 0, 0, TAU); ctx.fill();
        }
      }
    }
  }

  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.4, x - s * 0.5, y - s * 1.1, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 1.1, x + s * 1.1, y - s * 0.4, x, y + s * 0.35);
  }

  function drawTentacle(k, t, dur) {
    const lt = t - k.t0;
    if (lt < 0) return;
    // Sube (0-0.35 s), se retuerce y golpea el suelo hacia fuera (0.45 s) y se hunde al final.
    const rise = backOut(lt / 0.35), slam = ease((lt - 0.3) / 0.15), sink = Math.max(0, 1 - (dur - t) * 3);
    const L = k.len * rise * (1 - sink), N = 12, phi = slam * Math.PI / 2;
    const pts = [];
    let x = k.x, y = k.y;
    for (let i = 0; i <= N; i++) {
      const s = i / N, a = phi * Math.pow(s, 0.6) + Math.sin(t * 9 + s * 5 + k.ph) * 0.35 * (1 - slam) * s;
      const vx = k.ox * Math.sin(a), vy = -Math.cos(a) + k.oy * Math.sin(a) * 0.7;
      pts.push([x, y, (1 - s) * 14 + 3]);
      x += vx * L / N; y += vy * L / N;
    }
    ctx.fillStyle = INK;
    for (const [px, py, r] of pts) { ctx.beginPath(); ctx.arc(px, py, r + 2.4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#8e3fc2';
    for (const [px, py, r] of pts) { ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#c98af0';
    for (const [px, py, r] of pts) { ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.45, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ffe1f7';
    for (let i = 1; i < pts.length - 1; i += 2) { const [px, py, r] = pts[i]; ctx.beginPath(); ctx.arc(px + r * 0.35, py + r * 0.2, r * 0.3, 0, TAU); ctx.fill(); }
    if (lt > 0.42 && lt < 0.75) {
      const s = (lt - 0.42) / 0.33;
      ctx.strokeStyle = `rgba(200,245,255,${1 - s})`; ctx.lineWidth = 8 * (1 - s) + 1;
      ctx.beginPath(); ctx.ellipse(k.x + k.ox * k.len * 0.55, k.y + k.oy * k.len * 0.4, 30 + 110 * s, (30 + 110 * s) * 0.5, 0, 0, TAU); ctx.stroke();
    }
  }

  function drawSlot(x, y, t) {
    const w = 160, h = 98;
    ctx.save(); ctx.translate(x, y);
    const pop = backOut(t / 0.35) * (t > 3.25 ? Math.max(0, 1 - (t - 3.25) * 4) : 1);
    const jig = t > 0.95 && t < 1.3 ? Math.sin(t * 90) * 0.06 : 0;
    ctx.rotate(jig); ctx.scale(pop, pop);
    // Rayos dorados detrás cuando sale el premio.
    if (t > 1.0) {
      const k = Math.min(1, (t - 1.0) * 3);
      ctx.save(); ctx.rotate(t * 1.2);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = i % 2 ? `rgba(255,220,90,${0.35 * k})` : `rgba(255,255,255,${0.22 * k})`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 260, i / 14 * TAU, (i + 0.45) / 14 * TAU); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = INK; rr(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 16); ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#c47a12');
    ctx.fillStyle = g; rr(-w / 2, -h / 2, w, h, 13); ctx.fill();
    const syms = ['🍒', '💎', '🔔', '🍋', '7'];
    for (let i = 0; i < 3; i++) {
      const cx = -50 + i * 50, stop = 0.5 + i * 0.2, land = t - stop;
      ctx.fillStyle = '#fffaf0'; rr(cx - 21, -28, 42, 56, 7); ctx.fill();
      ctx.font = `900 32px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (land < 0) {
        const s = syms[Math.floor(t * 22 + i * 2) % syms.length];
        ctx.globalAlpha = 0.85; ctx.fillStyle = INK; ctx.fillText(s, cx, ((t * 640 + i * 40) % 56) - 28 + 10); ctx.globalAlpha = 1;
      } else {
        const b = 1 + Math.max(0, 0.4 - land) * 1.5;
        ctx.save(); ctx.translate(cx, 2); ctx.scale(b, b);
        ctx.fillStyle = t > 1.0 ? `hsl(${(t * 400 + i * 60) % 360},90%,50%)` : '#e0222f'; ctx.fillText('7', 0, 0);
        ctx.restore();
      }
    }
    ctx.fillStyle = '#e0222f'; rr(-w / 2 + 8, -h / 2 - 24, w - 16, 22, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 14px ${FONT_U}`;
    ctx.fillText(t > 0.95 ? '¡¡JACKPOT!!' : 'SUERTE…', 0, -h / 2 - 13);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, on = (Math.floor(t * (t > 1 ? 24 : 12)) + i) % 2;
      ctx.fillStyle = on ? '#fff6b0' : '#a35a10';
      ctx.beginPath(); ctx.arc(Math.cos(a) * (w / 2 + 2), Math.sin(a) * (h / 2 + 2), 3.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // Letrero «777» que salta encima.
    if (t > 1.0 && t < 3.3) {
      const k = backOut((t - 1.0) / 0.3), fade = Math.min(1, (3.3 - t) * 3);
      ctx.save(); ctx.translate(x, y - 105 - Math.sin(t * 6) * 6); ctx.scale(k, k); ctx.rotate(Math.sin(t * 7) * 0.08);
      ctx.globalAlpha = fade; ctx.font = `700 58px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.strokeText('777!', 0, 0);
      ctx.fillStyle = `hsl(${(t * 300) % 360},95%,60%)`; ctx.fillText('777!', 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function drawHammer(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = INK; rr(-11, -190, 22, 175, 8); ctx.fill();
    ctx.fillStyle = '#7a4a26'; rr(-8, -188, 16, 171, 6); ctx.fill();
    ctx.fillStyle = '#4e2e16';
    for (let i = 0; i < 8; i++) ctx.fillRect(-8, -175 + i * 18, 16, 5);
    ctx.fillStyle = '#e8b84a'; ctx.beginPath(); ctx.arc(0, -196, 12, 0, TAU); ctx.fill(); ink(3);
    ctx.fillStyle = INK; rr(-74, -34, 148, 76, 12); ctx.fill();
    const g = ctx.createLinearGradient(0, -30, 0, 38); g.addColorStop(0, '#e6ebf5'); g.addColorStop(0.5, '#8a93a6'); g.addColorStop(1, '#4b5263');
    ctx.fillStyle = g; rr(-70, -30, 140, 68, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-64, -25, 128, 6);
    ctx.strokeStyle = '#7fe9ff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-40, -12); ctx.lineTo(-30, 18); ctx.lineTo(-22, -12);
    ctx.moveTo(-6, -14); ctx.lineTo(-6, 22); ctx.moveTo(-6, 4); ctx.lineTo(8, -8);
    ctx.moveTo(26, -12); ctx.lineTo(40, 4); ctx.lineTo(26, 20);
    ctx.stroke(); ctx.lineCap = 'butt';
    ctx.restore();
  }

  function drawUparts() {
    if (!G.uparts) return;
    for (const q of G.uparts) {
      if (!inView(q.x, q.y, 30)) continue;
      const a = Math.min(1, q.life / q.max * 2.2);
      ctx.globalAlpha = a; ctx.fillStyle = q.color; ctx.strokeStyle = q.color;
      const s = q.size;
      switch (q.shape) {
        case 'spark':
          ctx.lineWidth = s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke(); ctx.lineCap = 'butt';
          break;
        case 'drop': {
          const an = Math.atan2(q.vy, q.vx);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, s * 1.8, s * 0.8, an, 0, TAU); ctx.fill();
          break;
        }
        case 'confetti':
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(Math.cos(q.rot * 1.7), 1);
          ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6); ctx.restore();
          break;
        case 'coin':
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.abs(Math.cos(q.rot)) * s + 1.5, s, 0, 0, TAU); ctx.fill(); ink(1.6);
          break;
        case 'rock':
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
          ctx.beginPath(); ctx.moveTo(-s, -s * 0.6); ctx.lineTo(s * 0.4, -s); ctx.lineTo(s, s * 0.3); ctx.lineTo(-s * 0.2, s); ctx.closePath();
          paint(q.color, 1.6); ctx.restore();
          break;
        case 'dust':
          ctx.globalAlpha = a * 0.35; ctx.beginPath(); ctx.arc(q.x, q.y, s * (1.6 - q.life / q.max * 0.6), 0, TAU); ctx.fill();
          break;
        case 'star':
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? s * 0.3 : s, an = i / 8 * TAU + q.rot; ctx.lineTo(q.x + Math.cos(an) * rr2, q.y + Math.sin(an) * rr2); }
          ctx.closePath(); ctx.fill();
          break;
        case 'heart':
          heartPath(q.x, q.y, s); ctx.fill(); ink(1.6);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawUlts() {
    if (!G.ults) return;
    for (const u of G.ults) {
      const t = u.t;
      if (t < 0) continue;
      if (u.kind === 'kraken') {
        for (const k of u.tents) drawTentacle(k, t, u.dur);
      } else if (u.kind === 'jackpot') {
        drawSlot(u.px ?? u.x, (u.py ?? u.y) - 130, t);
        for (const c of u.coins) {
          const lt = t - c.t0;
          if (lt < 0 || lt > 0.8) continue;
          if (lt < 0.45) {
            const k = lt / 0.45, cy = c.y - 380 * (1 - k * k), w = Math.abs(Math.cos(t * 10 + c.sp)) * 12 + 2;
            ctx.strokeStyle = 'rgba(255,220,90,.4)'; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(c.x, cy - 46); ctx.lineTo(c.x, cy); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(c.x, cy, w, 13, 0, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(2);
            ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.ellipse(c.x - w * 0.3, cy - 4, w * 0.25, 3, 0, 0, TAU); ctx.fill();
          } else {
            const k = (lt - 0.45) / 0.35;
            ctx.strokeStyle = `rgba(255,230,120,${1 - k})`; ctx.lineWidth = 5 * (1 - k) + 1;
            ctx.beginPath(); ctx.ellipse(c.x, c.y, 10 + 55 * k, (10 + 55 * k) * 0.5, 0, 0, TAU); ctx.stroke();
          }
        }
      } else if (u.kind === 'charm') {
        const cx = u.px ?? u.x, cy = u.py ?? u.y, a = Math.max(0, 1 - t / u.dur);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.9);
        const L = Math.max(VW, VH) * 0.9;
        for (let i = 0; i < 18; i++) {
          ctx.fillStyle = i % 2 ? `rgba(255,150,210,${0.3 * a})` : `rgba(255,240,180,${0.3 * a})`;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L, i / 18 * TAU, (i + 0.5) / 18 * TAU); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        // Corazón gigante que sale como onda expansiva (dos veces).
        for (let i = 0; i < 2; i++) {
          const w = ease((t - 0.15 - i * 0.25) / 0.9);
          if (w <= 0 || w >= 1) continue;
          heartPath(cx, cy - 10 + w * 60, 40 + w * L * 0.55);
          ctx.strokeStyle = `rgba(255,110,190,${1 - w})`; ctx.lineWidth = 16 * (1 - w) + 2; ctx.stroke();
        }
        // Destello en forma de estrella y destellos de lente.
        const s = (t < 0.3 ? backOut(t / 0.3) : a) * 130;
        ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? s * 0.1 : s, an = i / 8 * TAU + t * 1.5; ctx.lineTo(cx + Math.cos(an) * rr2, cy - 24 + Math.sin(an) * rr2); }
        ctx.closePath(); ctx.fill();
        for (let i = 1; i <= 5; i++) {
          ctx.fillStyle = `rgba(${i % 2 ? '255,180,230' : '180,220,255'},${0.25 * a})`;
          ctx.beginPath(); ctx.arc(cx + i * 55, cy - 24 + i * 32, 8 + (i % 3) * 10, 0, TAU); ctx.fill();
        }
        // Corazón que late sobre la cabeza.
        const beat = 1 + Math.max(0, Math.sin(t * 12)) * 0.25;
        heartPath(cx, cy - 70, 22 * beat * Math.min(1, t * 5) * (a > 0.15 ? 1 : a / 0.15));
        ctx.fillStyle = '#ff3d8b'; ctx.fill(); ink(3);
        for (const h of u.hearts) {
          const lt = t - 0.2 - h.d;
          if (lt < 0) continue;
          const k = Math.min(1, lt / 1.6);
          ctx.globalAlpha = 1 - k;
          heartPath(h.x + Math.sin(lt * 6) * 8, h.y - 20 - k * 80, 13 * h.s * (0.6 + backOut(lt / 0.25) * 0.4));
          ctx.fillStyle = '#ff5fa8'; ctx.fill(); ink(2);
        }
        ctx.globalAlpha = 1;
      } else if (u.kind === 'blitz') {
        const p = G.players[u.idx], head = (t - 0.15) / u.seg;
        if (head <= 0) continue;
        const n = Math.min(u.pts.length - 1, head), i0 = Math.floor(n), fr = n - i0;
        const pos = i0 >= u.pts.length - 1 ? u.pts[u.pts.length - 1]
          : [u.pts[i0][0] + (u.pts[i0 + 1][0] - u.pts[i0][0]) * fr, u.pts[i0][1] + (u.pts[i0 + 1][1] - u.pts[i0][1]) * fr];
        const fade = t < 2.0 ? 1 : Math.max(0, 1 - (t - 2.0) * 2.2), flash = t >= 2.0 && t < 2.15 ? 1 : 0;
        const rnd = seeded(u.seed + Math.floor(t * 20));
        const trail = () => {
          ctx.beginPath(); ctx.moveTo(u.pts[0][0], u.pts[0][1]);
          for (let i = 1; i <= i0 && i < u.pts.length; i++) ctx.lineTo(u.pts[i][0] + (rnd() - 0.5) * 8, u.pts[i][1] + (rnd() - 0.5) * 8);
          ctx.lineTo(pos[0], pos[1]);
        };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = flash ? '#ffffff' : `rgba(60,200,255,${0.35 * fade})`; ctx.lineWidth = flash ? 40 : 30; trail(); ctx.stroke();
        ctx.strokeStyle = `rgba(160,245,255,${0.85 * fade})`; ctx.lineWidth = 11; trail(); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.lineWidth = 4; trail(); ctx.stroke();
        // Rayos ramificados en cada punto alcanzado.
        ctx.strokeStyle = `rgba(200,250,255,${0.9 * fade})`; ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 1; i <= Math.min(i0, u.pts.length - 1); i++) {
          const age = t - (0.15 + i * u.seg);
          if (age > 0.35 && t < 2.0) continue;
          for (const fk of u.forks[i]) {
            const [px, py] = u.pts[i];
            jagged(px, py, px + Math.cos(fk.a) * fk.l, py + Math.sin(fk.a) * fk.l, 5, 22, rnd);
          }
        }
        ctx.stroke();
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        if (p && head < u.pts.length - 1) {
          const prev = u.pts[Math.max(0, i0)], dirx = pos[0] - prev[0], sd = dirx >= 0 ? 1 : -1;
          for (let k = 4; k >= 1; k--) {
            const nn = Math.max(0, n - k * 0.1), j0 = Math.floor(nn), jf = nn - j0;
            if (j0 >= u.pts.length - 1) continue;
            const qx = u.pts[j0][0] + (u.pts[j0 + 1][0] - u.pts[j0][0]) * jf, qy = u.pts[j0][1] + (u.pts[j0 + 1][1] - u.pts[j0][1]) * jf;
            ctx.globalAlpha = 0.12 * (5 - k);
            drawHero(qx, qy, p.r, p.ch, { x: sd, y: 0, side: sd, walk: t * 30, mv: true }, 0, false);
          }
          // Separación de colores (cian y magenta) alrededor del fantasma principal.
          ctx.globalAlpha = 0.35; drawHero(pos[0] - 5, pos[1], p.r, p.ch, { x: sd, y: 0, side: sd, walk: t * 30, mv: true }, 0, false);
          ctx.globalAlpha = 0.35; drawHero(pos[0] + 5, pos[1], p.r, p.ch, { x: sd, y: 0, side: sd, walk: t * 30, mv: true }, 0, false);
          ctx.globalAlpha = 0.95; drawHero(pos[0], pos[1], p.r, p.ch, { x: sd, y: 0, side: sd, walk: t * 30, mv: true }, 0, false);
          ctx.globalAlpha = 1;
        }
        // Tajo de anime que cruza la pantalla al final.
        if (t > 1.95 && t < 2.45) {
          const k = (t - 1.95) / 0.5, L = Math.max(VW, VH);
          ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(-0.5);
          for (let i = -1; i <= 1; i++) {
            const w = (i ? 5 : 12) * (1 - k);
            ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
            ctx.beginPath(); ctx.moveTo(-L * ease(k * 3), i * 26 - w); ctx.lineTo(L * ease(k * 3), i * 26); ctx.lineTo(-L * ease(k * 3), i * 26 + w); ctx.fill();
          }
          ctx.restore();
        }
      } else if (u.kind === 'hole') {
        const grow = backOut(t / 0.45), shrink = t < 2.6 ? 1 : t < 2.75 ? 1 - (t - 2.6) / 0.15 : 0, R = 62 * grow * shrink;
        ctx.strokeStyle = 'rgba(210,170,255,.75)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const ph = (t * 0.9 + i / 28) % 1, d = (1 - ph) * 330 * Math.min(1, shrink + 0.01) + R, a = i * 2.4 + ph * 5;
          const x = u.cx + Math.cos(a) * d, y = u.cy + Math.sin(a) * d * 0.75;
          ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(a) * 16, y + Math.cos(a) * 11);
        }
        ctx.stroke(); ctx.lineCap = 'butt';
        if (R > 1) {
          ctx.save(); ctx.translate(u.cx, u.cy); ctx.scale(1, 0.42); ctx.rotate(t * 3.2);
          for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = ['#ffb35a', '#ff5fd2', '#8f6bff', '#7ff6ff'][i]; ctx.lineWidth = 10 - i * 2;
            ctx.beginPath(); ctx.arc(0, 0, R * (1.6 + i * 0.35), i * 1.7, i * 1.7 + 4.4); ctx.stroke();
          }
          ctx.restore();
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(u.cx, u.cy, R, 0, TAU); ctx.fill();
          // Estrellas dentro del agujero.
          ctx.fillStyle = '#ffffff';
          for (const s of u.stars) {
            const a = s.a + t * (1 + s.d), d = s.d * R * 0.85;
            ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 4 + s.a));
            ctx.beginPath(); ctx.arc(u.cx + Math.cos(a) * d, u.cy + Math.sin(a) * d, s.s, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#f2e6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.cx, u.cy, R + 3, 0, TAU); ctx.stroke();
          // Chistera mágica flotando encima, del revés.
          const hy = u.cy - R - 50 + Math.sin(t * 5) * 7;
          ctx.save(); ctx.translate(u.cx, hy); ctx.rotate(Math.PI + Math.sin(t * 3) * 0.25); ctx.scale(grow, grow);
          ctx.beginPath(); ctx.rect(-24, -32, 48, 40); paint('#22202e', 3);
          ctx.fillStyle = '#c0392b'; ctx.fillRect(-24, -2, 48, 8);
          ctx.beginPath(); ctx.ellipse(0, 8, 36, 8, 0, 0, TAU); paint('#22202e', 3);
          ctx.restore();
        }
        if (t >= 2.75) {
          // Supernova: destello y anillos de arcoíris.
          const k = (t - 2.75) / 0.75;
          ctx.fillStyle = `rgba(255,245,255,${Math.max(0, 0.9 - k * 1.3)})`;
          ctx.beginPath(); ctx.arc(u.cx, u.cy, 40 + 320 * ease(k), 0, TAU); ctx.fill();
          const cols = ['#ff4d6a', '#ff9a3d', '#ffd23f', '#5ef08f', '#4fc3ff', '#a86bff'];
          for (let i = 0; i < cols.length; i++) {
            const kk = ease(k * 1.2 - i * 0.05);
            ctx.strokeStyle = cols[i]; ctx.globalAlpha = Math.max(0, 1 - k); ctx.lineWidth = 8;
            ctx.beginPath(); ctx.arc(u.cx, u.cy, 60 + 360 * kk + i * 10, 0, TAU); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      } else if (u.kind === 'odin') {
        if (t < 0.85) {
          const k = t / 0.85, y = u.y - 680 * (1 - k * k * k);
          // Rayos que caen alrededor antes del golpe.
          const rnd = seeded(u.seed + Math.floor(t * 12));
          ctx.strokeStyle = 'rgba(170,235,255,.9)'; ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) { const bx = u.x + (rnd() - 0.5) * 380, by = u.y + (rnd() - 0.5) * 200; jagged(bx + (rnd() - 0.5) * 60, by - 420, bx, by, 7, 40, rnd); }
          ctx.stroke();
          // Estela del martillo.
          ctx.fillStyle = 'rgba(255,230,160,.25)';
          ctx.beginPath(); ctx.moveTo(u.x - 70, y - 40); ctx.lineTo(u.x + 70, y - 40); ctx.lineTo(u.x + 30, y - 360); ctx.lineTo(u.x - 30, y - 360); ctx.fill();
          drawHammer(u.x, y - 40, 1.15);
        } else {
          const k = (t - 0.85) / (u.dur - 0.85);
          ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.5) * 2);
          drawHammer(u.x, u.y - 30 - 26 * Math.max(0, Math.sin(Math.min(1, k * 5) * Math.PI)) * (1 - k), 1.15);
          ctx.globalAlpha = 1;
          for (let i = 0; i < 3; i++) {
            const kk = k * 1.6 - i * 0.2;
            if (kk <= 0 || kk >= 1) continue;
            ctx.strokeStyle = `rgba(255,220,140,${1 - kk})`; ctx.lineWidth = 18 * (1 - kk) + 2;
            ctx.beginPath(); ctx.ellipse(u.x, u.y, 60 + 400 * kk, (60 + 400 * kk) * 0.6, 0, 0, TAU); ctx.stroke();
          }
        }
      }
    }
    drawUparts();
  }

  // Efectos de pantalla: franjas negras, tinte, oscurecer, truenos y fotograma de impacto.
  function camZoom() {
    const c = G.camFx;
    if (!c) return 1;
    const k = c.t / c.dur;
    const env = k < 0.1 ? ease(k / 0.1) : k > 0.78 ? 1 - ease((k - 0.78) / 0.22) : 1;
    return 1 + c.amt * env;
  }
  function drawUltScreen(dt, vs) {
    if (G.camFx) { G.camFx.t += dt; if (G.camFx.t >= G.camFx.dur) G.camFx = null; }
    const u = G.ults && G.ults[G.ults.length - 1];
    if (u) {
      const t = Math.max(0, u.t), env = Math.max(0, Math.min(1, (u.t + ULT_DELAY) * 5, (u.dur - u.t) * 3));
      // Oscurecer según la ulti (el rayo «para el tiempo»; el martillo nubla el cielo; el agujero se come la luz).
      let dark = 0, tint = null, ta = 0;
      if (u.kind === 'blitz') dark = t < 2.0 ? 0.5 : Math.max(0, 0.5 - (t - 2.0) * 2);
      else if (u.kind === 'odin') dark = t < 0.85 ? 0.45 * Math.min(1, t * 3) : 0.45 * Math.max(0, 1 - (t - 0.85) * 1.2);
      else if (u.kind === 'hole') dark = 0.45 * env;
      else if (u.kind === 'kraken') { tint = '30,120,200'; ta = 0.14 * env; }
      else if (u.kind === 'charm') { tint = '255,110,190'; ta = (0.12 + 0.08 * Math.sin(t * 10)) * env; }
      else if (u.kind === 'jackpot' && t > 1) { tint = '255,210,60'; ta = 0.1 * env * (0.6 + 0.4 * Math.sin(t * 16)); }
      if (dark) { ctx.fillStyle = `rgba(4,2,16,${dark})`; ctx.fillRect(0, 0, W, H); }
      if (ta > 0) { ctx.fillStyle = `rgba(${tint},${ta})`; ctx.fillRect(0, 0, W, H); }
      // Truenos que parpadean tras el martillazo.
      if (u.kind === 'odin' && t > 0.85 && t < 1.5 && Math.floor(t * 30) % 5 === 0) { ctx.fillStyle = 'rgba(220,240,255,.35)'; ctx.fillRect(0, 0, W, H); }
      // Franjas de cine.
      const bh = H * 0.075 * env;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    }
    const im = G.impact;
    if (im) {
      im.t += dt;
      if (im.t > 0.26) G.impact = null;
      else {
        if (im.t < 0.05) {
          ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'source-over';
        } else if (im.t < 0.09) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0, 0, W, H); }
        // Líneas radiales desde el punto del golpe.
        const v = vs[0], Z = ZOOM * camZoom(), sx = v.x + (im.x - G.scrCam[0]) * Z, sy = v.y + (im.y - G.scrCam[1]) * Z;
        const k = im.t / 0.26, rnd = seeded(im.seed), Lm = Math.hypot(W, H);
        ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.9})`; ctx.lineCap = 'round';
        for (let i = 0; i < 32; i++) {
          const a = rnd() * TAU, r0 = 70 + k * 260 + rnd() * 80;
          ctx.lineWidth = 1.5 + rnd() * 4 * im.p;
          ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0); ctx.lineTo(sx + Math.cos(a) * (r0 + Lm * 0.5), sy + Math.sin(a) * (r0 + Lm * 0.5)); ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
    }
  }

  // Cartel de la definitiva (estilo anime): fondo con líneas de velocidad, dos franjas, el personaje brillando
  // por encima de la franja y el nombre del ataque que cae de golpe.
  function drawCutin(dt) {
    const c = G.cutin;
    if (!c) return;
    c.t += dt;
    const D = 1.0;
    if (c.t > D) { G.cutin = null; return; }
    const inK = ease(c.t / 0.14), outK = c.t > D - 0.18 ? ease((c.t - (D - 0.18)) / 0.18) : 0;
    const cy = H * 0.42, bh = Math.min(180, H * 0.3), off = (1 - inK) * W - outK * W * 1.3;
    ctx.save();
    // Destello al empezar y fondo oscuro con líneas de velocidad radiales.
    ctx.fillStyle = `rgba(0,0,0,${0.45 * (1 - outK)})`; ctx.fillRect(0, 0, W, H);
    if (c.t < 0.07) { ctx.fillStyle = `rgba(255,255,255,${1 - c.t / 0.07})`; ctx.fillRect(0, 0, W, H); }
    const rnd = seeded(Math.floor(c.t * 24) + 3);
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * (1 - outK)})`; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) { const a = rnd() * TAU, r0 = 80 + rnd() * 200; ctx.moveTo(W / 2 + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * W, cy + Math.sin(a) * W); }
    ctx.stroke();
    // Franja de acento (entra desde el otro lado).
    ctx.save(); ctx.translate(-off * 0.8, 0);
    ctx.fillStyle = c.col;
    ctx.beginPath(); ctx.moveTo(-40, cy - bh / 2 + 6); ctx.lineTo(W + 40, cy - bh / 2 - 66); ctx.lineTo(W + 40, cy - bh / 2 - 48); ctx.lineTo(-40, cy - bh / 2 + 24); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-40, cy + bh / 2 + 44); ctx.lineTo(W + 40, cy + bh / 2 - 28); ctx.lineTo(W + 40, cy + bh / 2 - 14); ctx.lineTo(-40, cy + bh / 2 + 58); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.translate(off, 0);
    ctx.beginPath(); ctx.moveTo(-40, cy - bh / 2 + 30); ctx.lineTo(W + 40, cy - bh / 2 - 30); ctx.lineTo(W + 40, cy + bh / 2 - 30); ctx.lineTo(-40, cy + bh / 2 + 30); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill();
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, c.ch.cloak); g.addColorStop(0.6, c.color); g.addColorStop(1, c.col);
    ctx.fillStyle = g; ctx.globalAlpha = 0.9; ctx.fillRect(-40, cy - bh, W + 80, bh * 2); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) { const y = cy - bh / 2 + ((i * 37 + c.t * 900) % bh), x = ((i * 173 + c.t * 2600) % (W + 300)) - 150; ctx.moveTo(x, y); ctx.lineTo(x + 120 + (i % 3) * 70, y - 6); }
    ctx.stroke();
    // Icono gigante y translúcido de la ulti.
    ctx.globalAlpha = 0.18; ctx.font = `${bh * 1.1}px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.ch.ult.icon, W * 0.78, cy - 10); ctx.globalAlpha = 1;
    ctx.restore();
    // Personaje: sale por encima de la franja, brillando.
    const im = IMGS[c.ch.id], ph = bh * 1.45, pop = backOut(Math.min(1, c.t / 0.25));
    ctx.save();
    ctx.translate(W * 0.17, cy + bh * 0.5); ctx.scale(pop, pop); ctx.rotate(-0.06 + Math.sin(c.t * 3) * 0.02);
    if (im) {
      const pw = ph * im.width / im.height, dir = HERO_IMG_DIR[c.ch.id] || 1;
      ctx.scale(dir, 1);
      ctx.shadowColor = c.col; ctx.shadowBlur = 24;
      ctx.drawImage(im, -pw / 2, -ph, pw, ph);
      ctx.shadowBlur = 0;
    } else drawHero(0, -bh * 0.3, bh * 0.26, c.ch, { x: 1, y: 0, side: 1, walk: 0 }, 0, false);
    ctx.restore();
    // Nombre del ataque: cae de golpe con temblor.
    const u = c.ch.ult, slam = c.t < 0.26 ? 1 + (1 - ease((c.t - 0.1) / 0.16)) * 1.6 : 1;
    const shk = c.t > 0.24 && c.t < 0.42 ? (Math.random() - 0.5) * 8 : 0;
    const fs = Math.min(58, W * 0.075);
    if (c.t > 0.1) {
      ctx.save(); ctx.translate(W * 0.36 + shk, cy - fs * 0.15 + shk); ctx.scale(slam, slam);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.font = `700 ${fs}px ${FONT_D}`;
      ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.strokeText(u.name.toUpperCase(), 0, 0);
      ctx.fillStyle = '#fff6d8'; ctx.fillText(u.name.toUpperCase(), 0, 0);
      ctx.restore();
      const subA = Array.from(`${u.icon} ${c.ch.name} ${c.ch.title}`);
      const sub = { slice: (a, b) => subA.slice(a, b).join(''), length: subA.length }, nch = Math.max(0, Math.floor(Math.min(1, (c.t - 0.24) / 0.25) * sub.length));
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.max(13, fs * 0.34)}px ${FONT_U}`;
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(sub.slice(0, nch), W * 0.36, cy + fs * 0.62);
      ctx.fillStyle = '#ffd75e'; ctx.fillText(sub.slice(0, nch), W * 0.36, cy + fs * 0.62);
    }
    ctx.restore();
  }

  // Botón de la definitiva (uno por jugador de esta pantalla).
  let ultButtons = [];
  function drawUltButtons(vs) {
    ultButtons = [];
    if (state !== 'play' && state !== 'countdown') return;
    for (const v of vs) {
      const p = v.p;
      if (!p.ch.ult || p.gone) continue;
      const R = 30, x = v.x + v.w - R - 18 - SAFE.r, y = v.y + v.h - R - 18 - (v.y + v.h >= H ? SAFE.b : 0) - 40;
      const ready = !p.ultUsed && !p.down, pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      ctx.save();
      if (ready) {
        const now = performance.now() / 1000;
        ctx.fillStyle = `rgba(255,200,80,${0.25 + 0.25 * pulse})`;
        ctx.beginPath(); ctx.arc(x, y, R + 8 + pulse * 4, 0, TAU); ctx.fill();
        // Chispas que giran alrededor del botón.
        ctx.fillStyle = '#fff3b0';
        for (let i = 0; i < 3; i++) { const a = now * 3 + i / 3 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (R + 10), y + Math.sin(a) * (R + 10), 2.5, 0, TAU); ctx.fill(); }
      }
      ctx.fillStyle = ready ? '#3a1d5c' : 'rgba(22,18,43,.7)'; ctx.strokeStyle = ready ? '#ffd75e' : 'rgba(200,190,255,.3)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = ready ? 1 : 0.35;
      ctx.font = `${R}px ${FONT_U}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.ch.ult.icon, x, y + 2);
      ctx.globalAlpha = 1;
      ctx.font = `900 10px ${FONT_U}`; ctx.lineWidth = 3; ctx.strokeStyle = INK;
      const lab = ready ? (isTouch ? 'ULTI' : (G.coop && !G.online && p.idx === 1 ? 'ULTI · Intro' : 'ULTI · Q')) : 'USADA';
      ctx.strokeText(lab, x, y + R + 10); ctx.fillStyle = ready ? '#ffd75e' : '#aaa'; ctx.fillText(lab, x, y + R + 10);
      ctx.restore();
      ultButtons.push({ x, y, R: R + 8, idx: p.idx });
    }
  }

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
      // Zoom de cine durante las ultis.
      const Z = ZOOM * camZoom();
      CVW = v.w / Z; CVH = v.h / Z;
      camX = v.p.x - CVW / 2 + sx; camY = v.p.y - CVH / 2 + sy;
      if (v === vs[0]) G.scrCam = [camX, camY];
      ctx.save();
      if (vs.length > 1) { ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip(); }
      ctx.translate(v.x, v.y);
      ctx.scale(Z, Z);
      ctx.translate(-camX, -camY);
      drawGround();
      drawGroundFx();
      drawUltsGround();
      drawWeaponsWorld();
      drawGems();
      drawPickups();
      for (const e of G.enemies) if (inView(e.x, e.y, e.r * 2 + 20)) drawEnemy(e);
      drawPlayers();
      drawOrbs();
      drawBullets();
      drawEffects();
      drawUlts();
      drawFx();
      drawAmbient(G.map);
      ctx.restore();
      drawMoonlight(v);
      drawMates(v);
      drawVignette(v);
    }
    if (vs.length > 1) {
      ctx.fillStyle = 'rgba(8,8,20,.95)';
      if (vs[1].x > 0) ctx.fillRect(W / 2 - 3, 0, 6, H); else ctx.fillRect(0, H / 2 - 3, W, 6);
      ctx.fillStyle = 'rgba(200,190,255,.35)';
      if (vs[1].x > 0) ctx.fillRect(W / 2 - 1, 0, 2, H); else ctx.fillRect(0, H / 2 - 1, W, 2);
    }
    drawUltScreen(dt, vs);
    drawHUD(vs);
    drawUltButtons(vs);
    drawCutin(dt);
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
    // Escenario nocturno: un claro de luna detrás del personaje, como en la partida.
    const g = pc.createRadialGradient(13, 10, 2, 16, 16, 22);
    g.addColorStop(0, '#3a3270'); g.addColorStop(1, '#16122b');
    pc.fillStyle = g; rr(0, 0, 32, 32, 7); pc.fill();
    pc.fillStyle = 'rgba(244,236,216,.9)'; pc.beginPath(); pc.arc(26.5, 5.5, 1.7, 0, TAU); pc.fill();
    pc.fillStyle = '#2a2350'; pc.beginPath(); pc.ellipse(16, 28.5, 14, 4, 0, 0, TAU); pc.fill();
    if (ch.tall) { shadow(16, 20, 6.5); drawHero(16, 20, 6.5, ch, { x: 0.4, y: 0.6 }, 0, false); }
    else { shadow(16, 18.5, 8.8); drawHero(16, 18.5, 8.8, ch, { x: 0.4, y: 0.6 }, 0, false); }
    ctx = mainCtx;
    return c;
  }

  // Vista previa de un mapa: su suelo, su decorado y tres de sus monstruos, a la luz de la luna.
  const previews = new Map();
  function mapPreview(m) {
    let src = previews.get(m.id);
    if (!src) {
      src = document.createElement('canvas');
      const w = 240, h = 80, k = 2;
      src.width = w * k; src.height = h * k;
      const pc = src.getContext('2d');
      pc.scale(k, k);
      const saved = [ctx, camX, camY, CVW, CVH];
      ctx = pc; camX = 0; camY = 0; CVW = w; CVH = h;
      pc.fillStyle = m.bg; pc.fillRect(0, 0, w, h);
      pc.fillStyle = m.grid;
      for (let x = 24; x < w; x += 48) for (let y = 16; y < h; y += 48) { pc.fillRect(x - 3, y - 0.75, 6, 1.5); pc.fillRect(x - 0.75, y - 3, 1.5, 6); }
      [[30, 60, 0], [90, 20, 1], [200, 66, 2], [160, 16, 0], [222, 30, 1]].forEach(([x, y, d], i) => drawDecor(m.decor[d], x, y, hash(i, 7)));
      const mobs = [['slime', 70, 52, 12], ['espectro', 125, 46, 13], ['murcielago', 178, 34, 9]];
      for (const [type, x, y, r] of mobs) {
        const col = (m.colors && m.colors[type]) || '#ccc';
        drawEnemy({ type, x, y, r, color: col, wob: x * 0.1, flash: 0, frz: 0, elite: false, hp: 1, maxHp: 1 });
      }
      const g = pc.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.6);
      g.addColorStop(0, 'rgba(10,8,26,0)'); g.addColorStop(1, 'rgba(10,8,26,.6)');
      pc.fillStyle = g; pc.fillRect(0, 0, w, h);
      pc.fillStyle = 'rgba(244,236,216,.9)'; pc.beginPath(); pc.arc(w - 20, 16, 7, 0, TAU); pc.fill();
      pc.fillStyle = m.bg; pc.beginPath(); pc.arc(w - 16, 13, 6, 0, TAU); pc.fill();
      [ctx, camX, camY, CVW, CVH] = saved;
      previews.set(m.id, src);
    }
    const c = document.createElement('canvas');
    c.className = 'preview'; c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  function resetGfx() {
    sprites.clear(); sprK = 0;
    moonC = null; moonKey = '';
    PORTAL.sky = null; PORTAL.skyKey = '';
    previews.clear();
    resize();
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
        (ch.ult ? `<div class="ds"><b>${ch.ult.icon} Ulti: ${ch.ult.name}.</b> ${ch.ult.desc}</div>` : '') +
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
    const hb = $('hardBtn');
    hb.classList.toggle('on', !!S.hard);
    hb.textContent = S.hard ? '💀 Hardcore: ACTIVADO' : '💀 Hardcore: desactivado';
    $('hardInfo').innerHTML = (S.hard
      ? `Enemigos +${Math.round((HARDCORE.hp - 1) * 100)}% vida y +${Math.round((HARDCORE.dmg - 1) * 100)}% daño, más numerosos, jefes más duros y <b>sin Renacer</b>.`
      : 'Actívalo para un reto mucho más difícil.') +
      ` Recompensa: <b>oro ×${HARDCORE.gold}</b>, ${Math.round(RUN_CHESTS.hard.bossChance * 100)}% de 🎁 Cofre de Plata por jefe y <b>👑 Cofre Legendario</b> al ganar.` +
      (mode === 'online' ? ' En online lo decide quien crea la sala.' : '');
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
        `<div class="nm">${m.name}</div><div class="ds">${m.desc}</div><div class="wp">${diff}</div>` +
        (open ? `<div class="tt">${best ? `Mejor: ${fmtTime(best)}${S.wins[m.id] ? ' 👑' : ''}${(S.hwins || {})[m.id] ? ' 💀' : ''}` : 'Sin jugar'}</div>` : `<div class="cost no">${req}</div>`);
      b.prepend(mapPreview(m));
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
  // Filtros del catálogo y de "Mis objetos" (se recuerdan mientras la página está abierta).
  const eqFilter = { rarity: 'all', slot: 'all', own: 'all' };
  function filterBar(catalog, shown, total) {
    const bar = document.createElement('div');
    bar.className = 'filters';
    const row = (label, key, opts) => {
      const r = document.createElement('div');
      r.className = 'frow';
      r.innerHTML = `<span class="flabel">${label}</span>`;
      for (const [val, text, color] of opts) {
        const b = document.createElement('button');
        b.className = 'chip' + (eqFilter[key] === val ? ' on' : '');
        if (color) b.style.setProperty('--rc', color);
        b.innerHTML = (color ? '<i class="dot"></i>' : '') + text;
        b.setAttribute('aria-pressed', eqFilter[key] === val);
        b.addEventListener('click', () => { eqFilter[key] = val; Sound.play('click'); renderEquip(); });
        r.appendChild(b);
      }
      bar.appendChild(r);
    };
    row('Rareza', 'rarity', [['all', 'Todas'], ...Object.entries(RARITY).map(([k, r]) => [k, r.name, r.color])]);
    row('Tipo', 'slot', [['all', 'Todos'], ...EQUIP_SLOTS.map(sl => [sl.id, `${sl.icon} ${sl.name}`])]);
    if (catalog) row('Colección', 'own', [['all', 'Todos'], ['have', '✔ Los tengo'], ['miss', '🔒 Me faltan']]);
    const n = document.createElement('p');
    n.className = 'fcount';
    n.textContent = shown === total ? `${total} objetos` : `Mostrando ${shown} de ${total} objetos`;
    bar.appendChild(n);
    return bar;
  }
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
    // Aviso de cofres ganados sin abrir en la pestaña de cofres.
    const pend = Object.values(S.chests || {}).reduce((x, n) => x + n, 0);
    document.querySelector('#eqTabs button[data-t="chests"]').textContent = '🎰 Cofres' + (pend ? ` (${pend} 🎁)` : '');

    const box = $('eqList');
    box.innerHTML = '';
    if (eqTab === 'chests') { renderChests(box); return; }
    const order = it => EQUIP_SLOTS.findIndex(sl => sl.id === it.slot) * 10 + Object.keys(RARITY).indexOf(it.rarity);
    const catalog = eqTab === 'catalog';
    const base = ITEMS.filter(it => catalog || !!S.items[it.id]);
    const list = base.filter(it =>
      (eqFilter.rarity === 'all' || it.rarity === eqFilter.rarity) &&
      (eqFilter.slot === 'all' || it.slot === eqFilter.slot) &&
      (!catalog || eqFilter.own === 'all' || (eqFilter.own === 'have') === !!S.items[it.id])
    ).sort((a, b) => order(a) - order(b));
    if (catalog) {
      const owned = ITEMS.filter(it => S.items[it.id]).length;
      box.innerHTML = `<p class="sub" style="grid-column:1/-1">Todos los objetos del juego. Tienes <b>${owned}/${ITEMS.length}</b>. Los que no tienes salen en los 🎰 Cofres o como botín de los jefes.</p>`;
    }
    if (!base.length) {
      box.innerHTML = '<p class="sub">Aún no tienes objetos. Ábrelos en los 🎰 Cofres o derrota jefes para conseguir botín.</p>';
    } else {
      box.appendChild(filterBar(catalog, list.length, base.length));
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'sub'; p.style.gridColumn = '1 / -1';
        p.innerHTML = 'Ningún objeto cumple estos filtros. ';
        const b = document.createElement('button');
        b.textContent = 'Quitar filtros';
        b.addEventListener('click', () => { eqFilter.rarity = eqFilter.slot = eqFilter.own = 'all'; renderEquip(); });
        p.appendChild(b); box.appendChild(p);
      }
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
        const chests = 'Sale en ' + CHESTS.filter(c => c.rates[it.rarity] > 0).map(c => c.icon).join(' ');
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
      const own = (S.chests || {})[ch.id] || 0;
      if (own) {
        // Cofres ganados jugando: se abren gratis.
        const f = document.createElement('button');
        f.className = 'primary';
        f.textContent = `🎁 Abrir gratis (tienes ${own})`;
        f.addEventListener('click', () => openChestRoulette(ch, d, true));
        d.appendChild(f);
      }
      if (ch.hardOnly) {
        if (!own) d.insertAdjacentHTML('beforeend', '<div class="cost no">🔒 Se gana al completar una partida en 💀 Hardcore</div>');
      } else {
        const b = document.createElement('button');
        if (!own) b.className = 'primary';
        b.textContent = `Abrir · 🪙 ${ch.price}`;
        if (S.gold < ch.price) b.style.opacity = '.6';
        b.addEventListener('click', () => openChestRoulette(ch, d));
        d.appendChild(b);
      }
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
  function openChestRoulette(ch, card, free) {
    if (rou && !rou.done) return;
    S.chests = S.chests || {};
    if (free && !S.chests[ch.id]) { bump(card); eqMsg('No te quedan cofres de este tipo.', true); return; }
    if (!free && (ch.hardOnly || S.gold < ch.price)) { bump(card); eqMsg('No tienes oro suficiente para este cofre.', true); return; }
    Sound.init();
    // El resultado se decide y se guarda antes de la animación: cerrar a medias no pierde nada.
    if (free) { if (--S.chests[ch.id] <= 0) delete S.chests[ch.id]; } else S.gold -= ch.price;
    const it = rollItem(ch.rates), res = grantItem(it);
    save();
    refreshGold();
    rou = { ch, it, res, done: false, free };
    $('rouTitle').textContent = `${ch.icon} ${ch.name}`;
    $('rouResult').innerHTML = '';
    $('rouAgain').disabled = true;
    $('rouAgain').textContent = rouAgainLabel(ch);
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

  // «Abrir otro»: gratis mientras queden cofres ganados de ese tipo; si no, con oro.
  const rouAgainLabel = ch => {
    const left = (S.chests || {})[ch.id] || 0;
    return left ? `🎁 Abrir otro gratis (quedan ${left})` : ch.hardOnly ? 'No te quedan más' : `Abrir otro · 🪙 ${ch.price}`;
  };
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
    const left = (S.chests || {})[ch.id] || 0;
    $('rouAgain').textContent = rouAgainLabel(ch);
    $('rouAgain').disabled = !left && !!ch.hardOnly;
    $('rouAgain').style.opacity = left || S.gold >= ch.price ? '' : '.6';
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
        p.passives, p.gone ? 1 : 0, p.level, r1(p.xp), p.xpNext, p.slowT > 0 ? 1 : 0, p.ultUsed ? 1 : 0]),
      e: [], bu: [], eb: [], gm: [], pk: [], ev: G.netEvents.splice(0),
    };
    for (const e of G.enemies) {
      if (e.dead || !near(e)) continue;
      // Formato compacto: id, tipo, x, y, banderas (golpeado, élite, jefe, final) y, solo para élites y jefes, radio y vida.
      const f = (e.flash > 0 ? 1 : 0) | (e.elite ? 2 : 0) | (e.boss ? 4 : 0) | (e.final ? 8 : 0) | (isWarn(e) ? 16 : 0) | (e.rage ? 32 : 0) | (e.charmT > 0 ? 64 : 0);
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
      online: 'guest', localIdx: m.you || 1, coop: true, map: mapById(m.map), names: m.names, hard: !!m.hard,
      time: 0, kills: 0, gold: 0, shake: 0, boss: null, cx: 0, cy: 0,
      players: m.chars.map((c, i) => viewPlayer(charById(c), i, (i - (n - 1) / 2) * 60)),
      ults: [], cutin: null,
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
      const [x, y, hp, maxHp, down, reviveT, fx, fy, side, walk, inv, revives, speed, weapons, passives, gone, level, xp, xpNext, slowed, ultUsed] = v;
      p.ultUsed = !!ultUsed;
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
      if (!e) { e = { id, x, y, wob: rand(0, TAU), flash: 0, born: sn.time }; G.emap.set(id, e); }
      e.px = e.x; e.py = e.y; e.tx = x; e.ty = y;
      if (dist2(e.x, e.y, x, y) > 300 * 300) { e.px = x; e.py = y; }
      e.type = ETYPE_IDS[ti]; e.elite = !!(f & 2); e.boss = !!(f & 4); e.final = !!(f & 8); e.warn = !!(f & 16); e.rage = !!(f & 32); e.charm = !!(f & 64);
      e.variant = variant ?? -1; e.ca = ca || 0;
      e.r = r || ETYPES[e.type].r;
      if (f & 1) e.flash = 0.08;
      e.hp = hpk ?? 1; e.maxHp = 1;
      e.color = e.boss ? (G.boss ? G.boss.color : '#8a5cff') : G.map.colors[e.type] || ETYPES[e.type].color;
      seen.add(id); list.push(e);
    }
    const me = G.players[G.localIdx];
    for (const [id, e] of [...G.emap]) {
      if (seen.has(id)) continue;
      // Si desaparece cerca de nosotros, es que ha muerto: animación de muerte.
      if (me && !e.boss && Math.abs(e.x - me.x) < VW / 2 && Math.abs(e.y - me.y) < VH / 2) dieFx(e);
      G.emap.delete(id);
    }
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
      case 'd': deathAlert(ev[1], ev[2], true); break;
      case 'z': G.effects.push({ type: 'bolt', x: ev[1], y: ev[2], R: ev[3], life: 0.3, max: 0.3, seed: ev[4], ev: !!ev[5] }); break;
      case 'k': G.effects.push({ type: 'slash', x: ev[1], y: ev[2], a: ev[3], R: ev[4], arc: ev[5], color: ev[6], life: 0.22, max: 0.22 }); break;
      case 'r': G.effects.push({ type: 'ring', x: ev[1], y: ev[2], R: ev[3], color: ev[4], life: 0.4, max: 0.4 }); break;
      case 'p': G.effects.push({ type: 'punch', x: ev[1], y: ev[2], a: ev[3], R: ev[4], life: 0.28, max: 0.28 }); break;
      case 'x': G.effects.push({ type: 'boom', x: ev[1], y: ev[2], R: ev[3], life: 0.35, max: 0.35 }); break;
      case 'w': G.effects.push({ type: 'whip', x: ev[1], y: ev[2], a: ev[3], R: ev[4], h: ev[5], ev: !!ev[6], life: 0.25, max: 0.25 }); break;
      case 'U': startUlt(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], ev[7], false); break;
      case 'c': G.effects.push({ type: 'chain', pts: ev[1], ev: !!ev[2], life: 0.25, max: 0.25 }); break;
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
    updateUlts(dt);
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
    const r = recordRun(m.win, m.time, map, m.base, 1 + 0.1 * upLvl('codicia') + (gearStats(myGear()).st.gold || 0), Math.min(BOSSES.length, +m.bossKills || 0), !!m.hard);
    r.hard = !!m.hard;
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
          G.guestOpts = m.opts; G.guestRr = +m.rr || 0;
          renderChoices(`¡<span style="color:${PTEXT[G.localIdx]}">Subes al nivel ${m.lv || ''}</span>!`, m.opts, pickIndex, G.guestRr);
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
        case 'resume': if (state === 'paused') startCountdown(); break;
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
        case 'reroll': reroll(G.players[idx]); break;
        case 'ult': if (state === 'play') castUlt(G.players[idx]); break;
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
      lobbyStatus(Array.isArray(window.TURN_SERVERS) && window.TURN_SERVERS.length
        ? 'No se ha podido conectar. Revisad vuestra conexión a Internet y volved a intentarlo.'
        : 'No se ha podido conectar: vuestras redes no permiten la conexión directa (pasa casi siempre con datos móviles). Probad los dos con wifi, o configurad un servidor TURN (ver README).', true);
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
      hard: !!S.hard,
      views: Object.fromEntries(slots.map(k => [k, { vw: lobby.remotes[k].vw, vh: lobby.remotes[k].vh }])),
    };
    Sound.init();
    newGame(online);
    G.slotOf = [null, ...slots];
    G.idxOf = Object.fromEntries(slots.map((k, i) => [k, i + 1]));
    lastOnline = 'host';
    slots.forEach((k, i) => Net.sendTo(k, { t: 'start', map: online.map, chars: online.chars, names: online.names, you: i + 1, hard: online.hard }));
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
    if (G.hard) toast('💀 Modo Hardcore: sin Renacer y enemigos mucho más duros. ¡Suerte!', true);
    else if (G.coop) toast(isTouch ? (splitSide() ? 'J1: mitad izquierda · J2: mitad derecha' : 'J1: mitad de arriba · J2: mitad de abajo') : 'J1: WASD · J2: flechas (o un mando cada uno)', true);
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
    G = null; state = 'menu'; showCountdown(0);
    Sound.stopMusic(); Sound.resume();
    $('pauseBtn').classList.add('hidden');
    $('retryBtn').classList.remove('hidden');
    $('toast').classList.add('hidden');
    openMenu();
  }

  // Al reanudar hay una cuenta atrás de 3 s con el juego congelado, para poder recolocarse.
  const COUNTDOWN = 3;
  let cdT = 0, cdShown = 0;
  function showCountdown(n) {
    const el = $('countdown');
    if (!n) { el.classList.add('hidden'); cdShown = 0; return; }
    if (n === cdShown) return;
    cdShown = n;
    el.textContent = n;
    el.classList.remove('hidden', 'tick'); void el.offsetWidth; el.classList.add('tick');
    Sound.play('click');
  }
  function enterPause() {
    state = 'paused';
    cdT = 0; showCountdown(0);
    releaseJoys();
    renderBuild(); syncToggles();
    showOnly('pause');
    Sound.suspend();
  }
  function startCountdown() {
    state = 'countdown';
    cdT = COUNTDOWN;
    showOnly(null);
    Sound.resume();
    showCountdown(COUNTDOWN);
  }
  function tickCountdown(dt) {
    cdT -= dt;
    if (cdT > 0) { showCountdown(Math.ceil(cdT)); return; }
    showCountdown(0);
    state = 'play';
    if (G && G.online === 'host') Net.send({ t: 'paused', on: false });
  }
  function togglePause() {
    if (G && G.online === 'guest') {
      if (state === 'play' || state === 'paused' || state === 'countdown') Net.send({ t: 'pausereq' });
      return;
    }
    if (state === 'play' || state === 'countdown') {
      enterPause();
      if (G && G.online === 'host') Net.send({ t: 'paused', on: true });
    } else if (state === 'paused') {
      startCountdown();
      if (G && G.online === 'host') Net.send({ t: 'resume' });
    }
  }
  function guestSetPaused(on) {
    if (on && (state === 'play' || state === 'countdown')) enterPause();
    else if (!on && (state === 'paused' || state === 'countdown')) { showCountdown(0); if (state === 'paused') { showOnly(null); Sound.resume(); } state = 'play'; }
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
  // Botín de la partida: ya no da objetos sueltos, sino cofres que se abren en Equipo → Cofres.
  function rollChests(bossKills, win, hard) {
    const R = hard ? RUN_CHESTS.hard : RUN_CHESTS.normal, got = [];
    // El jefe final cuenta para la victoria, no para la probabilidad de cofre.
    const kills = win ? Math.max(0, bossKills - 1) : bossKills;
    for (let i = 0; i < kills; i++) if (Math.random() < R.bossChance) got.push(R.boss);
    if (win) got.push(R.win);
    S.chests = S.chests || {};
    for (const id of got) S.chests[id] = Math.min(99, (S.chests[id] || 0) + 1);
    return got.map(id => CHESTS.find(c => c.id === id));
  }

  function recordRun(win, t, map, base, goldMult, bossKills = 0, hard = false) {
    const lockedBefore = MAPS.filter(m => !mapUnlocked(m)).map(m => m.id);
    let record = false;
    if (t > (S.best[map.id] || 0)) { S.best[map.id] = t; record = true; }
    if (win) S.wins[map.id] = (S.wins[map.id] || 0) + 1;
    if (win && hard) { S.hwins = S.hwins || {}; S.hwins[map.id] = (S.hwins[map.id] || 0) + 1; }
    const earned = Math.round(base * map.gold * goldMult * (hard ? HARDCORE.gold : 1));
    S.gold += earned;
    const loot = rollChests(bossKills, win, hard);
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
      (r.hard ? `<br><span class="unlock">💀 Hardcore: oro ×${HARDCORE.gold}</span>` : '') +
      (r.loot || []).map(c => `<br><span class="unlock">🎁 Has ganado: ${c.icon} ${c.name}</span>`).join('') +
      ((r.loot || []).length ? '<br><span class="sub">Ábrelos gratis en 🎒 Equipo → Cofres.</span>' : '') +
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
    const r = recordRun(win, t, map, base, G.players[0].stats.gold, G.bossKills, G.hard);
    r.hard = G.hard;
    if (G.online === 'host') Net.send({ t: 'end', win, time: t, levels: G.players.map(p => p.level), kills: G.kills, base, map: map.id, bossKills: G.bossKills, hard: G.hard });
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
  click('rouAgain', () => { if (rou) openChestRoulette(rou.ch, $('rouAgain'), !!(S.chests || {})[rou.ch.id]); });
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
  click('hardBtn', () => { S.hard = !S.hard; save(); renderSelect(); });
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
      if (state === 'play' || state === 'countdown') togglePause();
      else if (state === 'levelup') Sound.suspend();
    } else {
      resetGfx();
      if (state === 'levelup') Sound.resume();
    }
  });
  // En móvil, al volver de otra app el navegador puede haber descartado el lienzo: se reinician
  // su escala y todas las imágenes guardadas (sprites de enemigos, luz de luna, cielo del portal…).
  canvas.addEventListener('contextrestored', resetGfx);
  addEventListener('pageshow', resetGfx);
  addEventListener('focus', resetGfx);
  openMenu();
  if (pendingComp) showComp(pendingComp);

  // ---------- Bucle principal ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPads();
    if (state === 'countdown') tickCountdown(dt);
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
