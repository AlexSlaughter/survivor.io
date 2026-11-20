'use strict';
/* Datos de Horda Nocturna: armas, objetos, enemigos, personajes, mapas y tienda. */
window.HN_DATA = {
  WEAPONS: {
    chispa: {
      name: 'Chispa Arcana', icon: '✨', desc: 'Dispara al enemigo más cercano.',
      up: ['+1 proyectil', 'Más daño y recarga más rápida', 'Atraviesa enemigos', '+1 proyectil'],
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
  },

  PASSIVES: {
    poder:   { name: 'Gema de Poder',   icon: '💎', desc: '+10% de daño.',                      max: 5, apply: p => { p.stats.dmg += 0.10; } },
    reloj:   { name: 'Reloj de Arena',  icon: '⏳', desc: '-8% tiempo de recarga.',             max: 5, apply: p => { p.stats.cd *= 0.92; } },
    botas:   { name: 'Botas Veloces',   icon: '👢', desc: '+10% velocidad de movimiento.',      max: 5, apply: p => { p.stats.speed += 0.10; } },
    corazon: { name: 'Corazón Vivo',    icon: '❤️', desc: '+20 vida máx. y +0.5 vida/s.',       max: 5, apply: p => { p.maxHp += 20; p.hp += 20; p.stats.regen += 0.5; } },
    iman:    { name: 'Imán Lunar',      icon: '🧲', desc: '+30% radio de recogida.',            max: 5, apply: p => { p.stats.magnet += 0.30; } },
    lupa:    { name: 'Lente Prisma',    icon: '🔍', desc: '+10% área de ataque.',               max: 5, apply: p => { p.stats.area += 0.10; } },
    tomo:    { name: 'Tomo Duplicador', icon: '📘', desc: '+1 proyectil para todas las armas.', max: 2, apply: p => { p.stats.proj += 1; } },
  },

  ETYPES: {
    slime:      { hp: 12, speed: 55,  dmg: 8,  r: 12, xp: 1 },
    murcielago: { hp: 7,  speed: 105, dmg: 6,  r: 9,  xp: 1 },
    espectro:   { hp: 24, speed: 75,  dmg: 10, r: 13, xp: 2 },
    bruto:      { hp: 60, speed: 42,  dmg: 15, r: 18, xp: 4 },
  },

  BOSSES: [
    { at: 300, name: 'Coloso de Obsidiana', hp: 5000, r: 38, speed: 52, dmg: 25, color: '#8a5cff', shots: 12, final: false },
    { at: 600, name: 'Rey del Abismo',      hp: 20000, r: 48, speed: 60, dmg: 35, color: '#ff3d7f', shots: 18, final: true },
  ],

  CHARS: [
    {
      id: 'aria', name: 'Aria', title: 'Hechicera', weapon: 'chispa', cost: 0,
      desc: 'Equilibrada. Ideal para empezar.', mods: {},
      body: '#4de1ff', hood: '#5a46d6', cloak: '#3b2b8f', acc: 'hood',
    },
    {
      id: 'bruno', name: 'Bruno', title: 'Guardián', weapon: 'orbe', cost: 250,
      desc: '+40 vida, +1 armadura, -10% velocidad.', mods: { hp: 40, armor: 1, speed: -0.10 },
      body: '#ffb84d', hood: '#8d96a8', cloak: '#5a2e12', acc: 'helm',
    },
    {
      id: 'kira', name: 'Kira', title: 'Exploradora', weapon: 'disco', cost: 400,
      desc: '+15% velocidad, +25% radio de recogida.', mods: { speed: 0.15, magnet: 0.25 },
      body: '#7dff9a', hood: '#ff4d6a', cloak: '#124a2e', acc: 'band',
    },
    {
      id: 'vulcan', name: 'Vulcan', title: 'Piromante', weapon: 'halo', cost: 600,
      desc: '+15% daño, +10% área, -20 vida.', mods: { dmg: 0.15, area: 0.10, hp: -20 },
      body: '#ff7b4d', hood: '#7a1f2e', cloak: '#4a1220', acc: 'flame',
    },
    {
      id: 'nova', name: 'Nova', title: 'Tormenta', weapon: 'rayo', cost: 900,
      desc: '-12% recarga, +1 vida/s.', mods: { cd: 0.88, regen: 1 },
      body: '#f4f0ff', hood: '#2d6bff', cloak: '#1a2a6b', acc: 'spark',
    },
  ],

  MAPS: [
    {
      id: 'bosque', name: 'Bosque Sombrío', emoji: '🌲', desc: 'Un claro maldito bajo la luna.',
      bg: '#0b0d17', grid: '#151a33', accent: '#3a2f8f', decor: ['grass', 'stone', 'shroom'],
      colors: { slime: '#5fd068', murcielago: '#a77bf3', espectro: '#7fd6ff', bruto: '#ff6b5b' },
      hp: 1, speed: 1, gold: 1, unlock: null,
    },
    {
      id: 'desierto', name: 'Desierto Carmesí', emoji: '🏜️', desc: 'Arenas ardientes llenas de huesos.',
      bg: '#170d0b', grid: '#2a1913', accent: '#a8452a', decor: ['cactus', 'bones', 'rock'],
      colors: { slime: '#e0a84d', murcielago: '#ff7a5c', espectro: '#ffd3a0', bruto: '#c43d2f' },
      hp: 1.35, speed: 1.05, gold: 1.5, unlock: { map: 'bosque', time: 300 },
    },
    {
      id: 'cripta', name: 'Cripta Helada', emoji: '❄️', desc: 'Un mausoleo congelado. Solo para veteranos.',
      bg: '#08121d', grid: '#122436', accent: '#2f7fb5', decor: ['crystal', 'tomb', 'snow'],
      colors: { slime: '#7fe0ff', murcielago: '#b0c4ff', espectro: '#e6f7ff', bruto: '#5a7dff' },
      hp: 1.8, speed: 1.12, gold: 2.2, unlock: { map: 'desierto', time: 420 },
    },
  ],

  // ---------- Equipo ----------
  // Cada objeto da bonificaciones (valor a nivel 1); suben un 50% del valor base por nivel hasta el 5.
  // Las armas equipadas sustituyen al arma inicial del personaje.
  RARITY: {
    comun:      { name: 'Común',      color: '#b9c0d8', price: 150,  w: 50 },
    raro:       { name: 'Raro',       color: '#4da3ff', price: 400,  w: 30 },
    epico:      { name: 'Épico',      color: '#c06bff', price: 900,  w: 15 },
    legendario: { name: 'Legendario', color: '#ffc23d', price: 2000, w: 5 },
  },
  EQUIP_SLOTS: [
    { id: 'arma',    name: 'Arma',    icon: '⚔️' },
    { id: 'casco',   name: 'Casco',   icon: '🪖' },
    { id: 'pecho',   name: 'Pecho',   icon: '🦺' },
    { id: 'botas',   name: 'Botas',   icon: '🥾' },
    { id: 'amuleto', name: 'Amuleto', icon: '📿' },
  ],
  ITEMS: [
    // Armas principales
    { id: 'varita',       slot: 'arma', rarity: 'comun',      icon: '🪄', name: 'Varita Arcana',       weapon: 'chispa', stats: { dmg: 0.05 } },
    { id: 'cuchillas',    slot: 'arma', rarity: 'raro',       icon: '🌀', name: 'Cuchillas Gemelas',   weapon: 'orbe',   stats: { hp: 10 } },
    { id: 'disco_bronce', slot: 'arma', rarity: 'raro',       icon: '🥏', name: 'Disco de Bronce',     weapon: 'disco',  stats: { speed: 0.05 } },
    { id: 'brasero',      slot: 'arma', rarity: 'raro',       icon: '🏮', name: 'Brasero de Mano',     weapon: 'halo',   stats: { area: 0.05 } },
    { id: 'cetro',        slot: 'arma', rarity: 'epico',      icon: '🔱', name: 'Cetro de Tormenta',   weapon: 'rayo',   stats: { cd: 0.05, dmg: 0.05 } },
    { id: 'filo_eclipse', slot: 'arma', rarity: 'legendario', icon: '🗡️', name: 'Filo del Eclipse',    weapon: 'chispa', stats: { dmg: 0.12, cd: 0.06 } },
    // Cascos
    { id: 'capucha',  slot: 'casco', rarity: 'comun',      icon: '🧢', name: 'Capucha de Viaje', stats: { hp: 10 } },
    { id: 'yelmo',    slot: 'casco', rarity: 'raro',       icon: '⛑️', name: 'Yelmo de Hierro',  stats: { armor: 1, hp: 5 } },
    { id: 'corona',   slot: 'casco', rarity: 'legendario', icon: '👑', name: 'Corona del Sabio', stats: { xp: 0.10, hp: 15 } },
    // Pecho
    { id: 'tunica',        slot: 'pecho', rarity: 'comun', icon: '👕', name: 'Túnica Reforzada', stats: { hp: 15 } },
    { id: 'cota',          slot: 'pecho', rarity: 'raro',  icon: '🥋', name: 'Cota de Malla',    stats: { hp: 20, armor: 1 } },
    { id: 'manto_estelar', slot: 'pecho', rarity: 'epico', icon: '🧥', name: 'Manto Estelar',    stats: { hp: 25, regen: 0.5 } },
    // Botas
    { id: 'sandalias',    slot: 'botas', rarity: 'comun', icon: '🩴', name: 'Sandalias Ligeras', stats: { speed: 0.05 } },
    { id: 'botas_viento', slot: 'botas', rarity: 'raro',  icon: '👢', name: 'Botas del Viento',  stats: { speed: 0.06, magnet: 0.10 } },
    { id: 'botas_fase',   slot: 'botas', rarity: 'epico', icon: '👟', name: 'Botas de Fase',     stats: { speed: 0.10, armor: 1 } },
    // Amuletos
    { id: 'colgante',   slot: 'amuleto', rarity: 'comun',      icon: '📿', name: 'Colgante de la Suerte', stats: { gold: 0.10 } },
    { id: 'ojo_dragon', slot: 'amuleto', rarity: 'epico',      icon: '🧿', name: 'Ojo de Dragón',         stats: { dmg: 0.08 } },
    { id: 'reliquia',   slot: 'amuleto', rarity: 'legendario', icon: '💠', name: 'Reliquia Antigua',      stats: { dmg: 0.08, area: 0.10, gold: 0.10 } },
  ],
  // Cómo se muestra cada bonificación.
  STAT_LABELS: {
    hp: ['vida', v => '+' + Math.round(v)],
    armor: ['armadura', v => '+' + (Math.round(v * 10) / 10)],
    speed: ['velocidad', v => '+' + Math.round(v * 100) + '%'],
    dmg: ['daño', v => '+' + Math.round(v * 100) + '%'],
    cd: ['recarga', v => '-' + Math.round(v * 100) + '%'],
    area: ['área', v => '+' + Math.round(v * 100) + '%'],
    magnet: ['recogida', v => '+' + Math.round(v * 100) + '%'],
    xp: ['experiencia', v => '+' + Math.round(v * 100) + '%'],
    gold: ['oro', v => '+' + Math.round(v * 100) + '%'],
    regen: ['vida/s', v => '+' + (Math.round(v * 10) / 10)],
  },
  ITEM_MAX: 5,
  // Cofres de la ruleta: probabilidad (en %) de cada rareza.
  CHESTS: [
    { id: 'madera', name: 'Cofre de Madera', icon: '📦', price: 200,  rates: { comun: 70, raro: 25, epico: 5,  legendario: 0 } },
    { id: 'plata',  name: 'Cofre de Plata',  icon: '🎁', price: 600,  rates: { comun: 30, raro: 50, epico: 17, legendario: 3 } },
    { id: 'oro',    name: 'Cofre Dorado',    icon: '💰', price: 1500, rates: { comun: 0,  raro: 40, epico: 45, legendario: 15 } },
  ],

  SHOP: [
    { id: 'poder',       name: 'Poder',      icon: '⚔️', desc: '+5% de daño',                  max: 5, cost: 60 },
    { id: 'vida',        name: 'Vitalidad',  icon: '❤️', desc: '+10 vida máxima',              max: 5, cost: 50 },
    { id: 'armadura',    name: 'Armadura',   icon: '🛡️', desc: '-1 daño recibido',             max: 3, cost: 120 },
    { id: 'agilidad',    name: 'Agilidad',   icon: '👟', desc: '+4% velocidad',                max: 5, cost: 50 },
    { id: 'recarga',     name: 'Celeridad',  icon: '⏱️', desc: '-3% tiempo de recarga',        max: 5, cost: 80 },
    { id: 'magnetismo',  name: 'Magnetismo', icon: '🧲', desc: '+10% radio de recogida',       max: 5, cost: 40 },
    { id: 'sabiduria',   name: 'Sabiduría',  icon: '📖', desc: '+8% experiencia',              max: 5, cost: 70 },
    { id: 'codicia',     name: 'Codicia',    icon: '🪙', desc: '+10% oro obtenido',            max: 5, cost: 60 },
    { id: 'vision',      name: 'Visión',     icon: '🔮', desc: '+1 opción al subir de nivel',  max: 1, cost: 400 },
    { id: 'renacer',     name: 'Renacer',    icon: '🕊️', desc: 'Revive una vez por partida',   max: 1, cost: 500 },
  ],
};
