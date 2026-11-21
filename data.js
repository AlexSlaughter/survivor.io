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
      name: 'Disco Retornante', icon: '🥏', desc: 'Un disco que va hacia el enemigo más cercano y vuelve atravesándolo todo.',
      up: ['Más daño', '+1 disco', 'Más daño y recarga más rápida', '+1 disco'],
      evo: 'poder', evoName: 'Eclipse Giratorio',
    },
    dagas: {
      name: 'Dagas Arrojadizas', icon: '🔪', desc: 'Lanza dagas rápidas hacia donde miras.',
      up: ['+1 daga', 'Más daño y cadencia', 'Atraviesan a un enemigo', '+1 daga'],
      evo: 'botas', evoName: 'Tormenta de Acero',
    },
    latigo: {
      name: 'Látigo de Espinas', icon: '🪢', desc: 'Azota en línea hacia el enemigo más cercano.',
      up: ['Más daño y alcance', 'Azota también hacia atrás', 'Más daño y rapidez', 'Más daño y alcance'],
      evo: 'coraza', evoName: 'Látigo Vampírico',
    },
    meteoro: {
      name: 'Lluvia de Meteoros', icon: '☄️', desc: 'Meteoros caen sobre los enemigos y explotan en área.',
      up: ['Más daño', '+1 meteoro', 'Más daño y explosión más grande', '+1 meteoro'],
      evo: 'pergamino', evoName: 'Apocalipsis',
    },
    hielo: {
      name: 'Nova Helada', icon: '❄️', desc: 'Onda de hielo a tu alrededor que daña y ralentiza.',
      up: ['Más radio y daño', 'Ralentiza más tiempo', 'Más radio y daño', 'Más daño y recarga más rápida'],
      evo: 'iman', evoName: 'Cero Absoluto',
    },
    veneno: {
      name: 'Frasco Tóxico', icon: '🧪', desc: 'Lanza frascos que dejan charcos de veneno en el suelo.',
      up: ['Más daño', 'Charco más grande y duradero', '+1 frasco', 'Más daño y charco más grande'],
      evo: 'lupa', evoName: 'Pantano Pestilente',
    },
  },

  // Armas principales: el ataque principal de cualquier personaje. Todos empiezan con el básico;
  // las demás salen en la ruleta de cofres y se equipan en el hueco de arma.
  MAIN_WEAPONS: {
    basico: {
      name: 'Pistola', icon: '🔫', desc: 'Ataque básico: dispara al enemigo más cercano.',
      up: ['Más daño y cadencia', '+1 bala', 'Más daño y cadencia', '+1 bala'],
    },
    revolver: {
      name: 'Revólver', icon: '🤠', desc: 'Balas pesadas que atraviesan a un enemigo.',
      up: ['Más daño y cadencia', 'Más daño y cadencia', '+1 bala', 'Más daño y cadencia'],
    },
    escopeta: {
      name: 'Escopeta', icon: '💥', desc: 'Ráfaga de perdigones a corta distancia que empuja a los enemigos.',
      up: ['Más daño y cadencia', '+1 perdigón', 'Más daño y cadencia', '+1 perdigón'],
    },
    subfusil: {
      name: 'Subfusil', icon: '🎇', desc: 'Lluvia de balas rápidas con algo de dispersión.',
      up: ['Más daño y cadencia', 'Más daño y cadencia', 'Más daño y cadencia', 'Más daño y cadencia'],
    },
    francotirador: {
      name: 'Francotirador', icon: '🔭', desc: 'Disparo lento y devastador que atraviesa a todos. Apunta a los más duros.',
      up: ['Más daño y cadencia', 'Más daño y cadencia', 'Más daño y cadencia', 'Más daño y cadencia'],
    },
    katana: {
      name: 'Katana', icon: '🗡️', desc: 'Tajo en arco a los enemigos cercanos.',
      up: ['Más daño y rapidez', 'Más alcance', 'Más daño y rapidez', 'Más alcance'],
    },
    lanzacohetes: {
      name: 'Lanzacohetes', icon: '🚀', desc: 'Cohetes que explotan y dañan en área.',
      up: ['Más daño y cadencia', 'Explosión más grande', '+1 cohete', 'Más daño y explosión más grande'],
    },
    espada_pixel: {
      name: 'Espada de Steve', icon: '⚔️', desc: 'Tajos rápidos al frente con un 20% de golpe crítico (daño doble).',
      up: ['Más daño y rapidez', 'Más alcance', 'Más daño y rapidez', 'Más alcance'],
    },
    shuriken: {
      name: 'Shurikens de Naruto', icon: '✴️', desc: 'Abanico de estrellas ninja que atraviesan a dos enemigos.',
      up: ['Más daño y cadencia', '+1 shuriken', 'Más daño y cadencia', '+1 shuriken'],
    },
    escudo: {
      name: 'Escudo del Capitán América', icon: '🛡️', desc: 'Escudo que se lanza, atraviesa todo y vuelve a tu mano.',
      up: ['Más daño', 'Más daño y cadencia', '+1 escudo', 'Más daño y cadencia'],
    },
    martillo: {
      name: 'Martillo de Mordekaiser', icon: '🔨', desc: 'Golpe al suelo que daña y aparta a todo lo que te rodea.',
      up: ['Más daño y rapidez', 'Más radio', 'Más daño y rapidez', 'Más radio'],
    },
    onda_ki: {
      name: 'Kamehameha', icon: '🔆', desc: 'Gran onda de energía que atraviesa toda la pantalla.',
      up: ['Más daño y cadencia', 'Rayo más ancho', 'Más daño y cadencia', 'Rayo más ancho'],
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
    coraza:  { name: 'Coraza de Hierro', icon: '🛡️', desc: '+1 armadura (menos daño recibido).', max: 5, apply: p => { p.stats.armor += 1; } },
    pergamino: { name: 'Pergamino Sabio', icon: '📜', desc: '+10% de experiencia.',             max: 5, apply: p => { p.stats.xp += 0.10; } },
  },

  ETYPES: {
    slime:      { hp: 12, speed: 55,  dmg: 8,  r: 12, xp: 1 },
    murcielago: { hp: 7,  speed: 105, dmg: 6,  r: 9,  xp: 1 },
    espectro:   { hp: 24, speed: 75,  dmg: 10, r: 13, xp: 2 },
    bruto:      { hp: 60, speed: 42,  dmg: 15, r: 18, xp: 4 },
    // Enemigos a distancia: se quedan lejos y disparan proyectiles que se pueden esquivar.
    escupidor:  { hp: 16, speed: 52,  dmg: 6,  r: 12, xp: 2, color: '#a6e05a',
      ranged: { range: 230, cd: 4.2, spd: 140, dmg: 7, n: 1, spread: 0, color: '#c8ff6a' } },
    brujo:      { hp: 48, speed: 46,  dmg: 10, r: 15, xp: 4, color: '#c47bff',
      ranged: { range: 260, cd: 5.0, spd: 130, dmg: 10, n: 2, spread: 0.3, color: '#e3a6ff' } },
    // Rápida y en zigzag, pero muy frágil.
    arana:      { hp: 9,  speed: 118, dmg: 6,  r: 10, xp: 1, color: '#cfd2e0', zigzag: true },
    // Se para, avisa (brilla en rojo) y embiste en línea recta: apártate de su camino.
    lobo:       { hp: 34, speed: 66,  dmg: 13, r: 14, xp: 3, color: '#a9b3c9',
      charge: { range: 270, cd: 3.6, wind: 0.65, speed: 440, time: 0.55 } },
    // Corre hacia ti y, al llegar, parpadea y explota: aléjate antes de que estalle.
    calabaza:   { hp: 22, speed: 84,  dmg: 4,  r: 13, xp: 2, color: '#ff9a3c',
      bomb: { range: 48, fuse: 0.9, R: 72, dmg: 20 } },
    // Lento, enorme y muy resistente; casi no se le puede empujar.
    golem:      { hp: 260, speed: 30, dmg: 24, r: 24, xp: 10, color: '#9b97ad', heavy: true },
    // Se queda lejos e invoca arañas cada pocos segundos: ve a por él.
    invocador:  { hp: 80, speed: 44,  dmg: 10, r: 15, xp: 6, color: '#5fe0c0',
      summon: { range: 290, cd: 6, n: 3, type: 'arana' } },
  },

  // Qué enemigos aparecen y desde qué segundo (con su peso en el sorteo).
  SPAWNS: [
    ['slime', 0, 3], ['murcielago', 40, 2], ['escupidor', 70, 1], ['arana', 95, 2], ['espectro', 130, 2],
    ['lobo', 160, 1], ['calabaza', 190, 1], ['bruto', 220, 1], ['brujo', 250, 1], ['golem', 330, 1], ['invocador', 360, 1],
  ],

  // ai: 'ring' (anillos de proyectiles), 'summon' (invoca crías y lanza telarañas que ralentizan),
  // 'charge' (embiste tras avisar y escupe fuego en abanico), 'king' (anillos y ráfagas dirigidas).
  BOSSES: [
    { at: 150, name: 'Reina Araña',         hp: 1200,  r: 32, speed: 68, dmg: 18, color: '#cfd2e0', shots: 8,  ai: 'summon', final: false },
    { at: 300, name: 'Coloso de Obsidiana', hp: 5000,  r: 38, speed: 52, dmg: 25, color: '#8a5cff', shots: 12, ai: 'ring',   final: false },
    { at: 450, name: 'Dragón de Hueso',     hp: 10000, r: 42, speed: 56, dmg: 30, color: '#ff9a3d', shots: 7,  ai: 'charge', final: false },
    { at: 600, name: 'Rey del Abismo',      hp: 20000, r: 48, speed: 60, dmg: 35, color: '#ff3d7f', shots: 18, ai: 'king',   final: true },
  ],

  // Los personajes solo cambian estadísticas: el ataque principal lo da el arma equipada.
  CHARS: [
    {
      id: 'marc', name: 'Marc', title: 'del Barco', cost: 0,
      desc: 'El personaje inicial: ni suma ni resta nada.', mods: {},
      body: '#f0c8a0', hood: '#f4f6fb', cloak: '#1f3f7a', acc: 'sailor',
    },
    {
      id: 'salim', name: 'Salim', title: 'el Inútil', cost: 100,
      desc: '-25% daño, -10% velocidad. La suerte del inútil: +40% oro y +25% experiencia.',
      mods: { dmg: -0.25, speed: -0.10, gold: 0.40, xp: 0.25 },
      body: '#d9b48a', hood: '#9aa3ad', cloak: '#5b4a3a', acc: 'bucket',
    },
    {
      id: 'alex', name: 'Alex', title: 'el Guapo', cost: 350,
      desc: 'Tan guapo que todo va hacia él: +40% recogida y +15% experiencia. Además, +10% daño y +5% velocidad.',
      mods: { magnet: 0.40, xp: 0.15, dmg: 0.10, speed: 0.05 },
      body: '#f1c27d', hood: '#3b2a20', cloak: '#1f3a93', acc: 'cool',
    },
    {
      id: 'pol', name: 'Pol', title: 'el Flaco', cost: 500,
      desc: '+30% velocidad, -10% recarga y difícil de alcanzar, pero solo 60 de vida.',
      mods: { hp: -40, speed: 0.30, cd: 0.90, size: 0.75 },
      body: '#ffe0b8', hood: '#2bd4a0', cloak: '#1d5c4a', acc: 'cap', wide: 0.7,
    },
    {
      id: 'igor', name: 'Igor', title: 'el Alto', cost: 550,
      desc: 'Llega a todo: +20% área, +40% recogida, +5% velocidad y +20 vida. Torpe (-10% daño) y es un blanco grande.',
      mods: { area: 0.20, magnet: 0.40, speed: 0.05, hp: 20, dmg: -0.10, size: 1.15 },
      body: '#c8e6c9', hood: '#2b2d42', cloak: '#4a3f6b', acc: 'tophat', wide: 0.75, tall: 1.45,
    },
    {
      id: 'ivan', name: 'Iván', title: 'el Tanque', cost: 700,
      desc: '+80 vida, +2 armadura, +1 vida/s. Lento (-20%) y grande: le dan más fácil.',
      mods: { hp: 80, armor: 2, regen: 1, speed: -0.20, size: 1.3 },
      body: '#e0a46b', hood: '#7b8794', cloak: '#3a2a1a', acc: 'viking', wide: 1.15,
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
    {
      id: 'bloques', name: 'Mundo de Minecraft', emoji: '⛏️', desc: 'Todo está hecho de cubos, y los enemigos parecen creepers y zombis.',
      bg: '#0b100d', grid: '#152019', accent: '#2f6b3a', decor: ['block', 'grassblock', 'ore'],
      colors: { slime: '#6fdc7a', murcielago: '#9a86e8', espectro: '#c7d3e6', bruto: '#58b06a' },
      hp: 1.15, speed: 1.0, gold: 1.25, unlock: { map: 'bosque', time: 180 },
    },
    {
      id: 'aldea', name: 'Aldea de Konoha', emoji: '🍃', desc: 'La aldea oculta de la Hoja, de Naruto.',
      bg: '#0c120f', grid: '#18241c', accent: '#b5652a', decor: ['leaf', 'kunai', 'spiral'],
      colors: { slime: '#ffb072', murcielago: '#7f8cff', espectro: '#bfe3f0', bruto: '#d98a6a' },
      hp: 1.3, speed: 1.08, gold: 1.45, unlock: { map: 'bloques', time: 300 },
    },
    {
      id: 'champi', name: 'Reino Champiñón', emoji: '🍄', desc: 'Tuberías, champiñones y bloques con interrogante, como en Super Mario.',
      bg: '#0b0f22', grid: '#171e3e', accent: '#a83a5a', decor: ['pipe', 'mushroom', 'qblock'],
      colors: { slime: '#d39a6a', murcielago: '#ff7a9a', espectro: '#eef0ff', bruto: '#6fdc7a' },
      hp: 1.5, speed: 1.08, gold: 1.7, unlock: { map: 'aldea', time: 300 },
    },
    {
      id: 'grieta', name: 'Grieta del Invocador', emoji: '🔮', desc: 'El campo de batalla de League of Legends.',
      bg: '#0a1116', grid: '#14242b', accent: '#1f8fa0', decor: ['rune', 'crystal', 'brush'],
      colors: { slime: '#6fd6ff', murcielago: '#c08cff', espectro: '#9ff0ee', bruto: '#ff7a6b' },
      hp: 2.0, speed: 1.12, gold: 2.6, unlock: { map: 'cripta', time: 300 },
    },
  ],

  // ---------- Equipo ----------
  // Cada objeto da bonificaciones (valor a nivel 1); suben un 50% del valor base por nivel hasta el 5.
  // Las armas equipadas sustituyen al arma inicial del personaje.
  RARITY: {
    comun:      { name: 'Común',      color: '#8e8aa8', price: 150,  w: 50 },
    raro:       { name: 'Raro',       color: '#4f9fd1', price: 400,  w: 30 },
    epico:      { name: 'Épico',      color: '#9a74e0', price: 900,  w: 15 },
    legendario: { name: 'Legendario', color: '#c99a2e', price: 2000, w: 5 },
  },
  EQUIP_SLOTS: [
    { id: 'arma',    name: 'Arma',    icon: '⚔️' },
    { id: 'casco',   name: 'Casco',   icon: '🪖' },
    { id: 'pecho',   name: 'Pecho',   icon: '🦺' },
    { id: 'botas',   name: 'Botas',   icon: '🥾' },
    { id: 'amuleto', name: 'Amuleto', icon: '📿' },
  ],
  ITEMS: [
    // Armas principales (sustituyen al ataque básico)
    { id: 'revolver',      slot: 'arma', rarity: 'comun',      icon: '🤠', name: 'Revólver',      weapon: 'revolver',      stats: { dmg: 0.05 } },
    { id: 'escopeta',      slot: 'arma', rarity: 'raro',       icon: '💥', name: 'Escopeta',      weapon: 'escopeta',      stats: { hp: 20 } },
    { id: 'subfusil',      slot: 'arma', rarity: 'raro',       icon: '🎇', name: 'Subfusil',      weapon: 'subfusil',      stats: { speed: 0.08, hp: 8 } },
    { id: 'katana',        slot: 'arma', rarity: 'epico',      icon: '🗡️', name: 'Katana',        weapon: 'katana',        stats: { speed: 0.10, dmg: 0.08 } },
    { id: 'francotirador', slot: 'arma', rarity: 'epico',      icon: '🔭', name: 'Francotirador', weapon: 'francotirador', stats: { xp: 0.15, dmg: 0.08 } },
    { id: 'lanzacohetes',  slot: 'arma', rarity: 'legendario', icon: '🚀', name: 'Lanzacohetes',  weapon: 'lanzacohetes',  stats: { dmg: 0.15, area: 0.18 } },
    { id: 'espada_pixel',  slot: 'arma', rarity: 'raro',       icon: '⚔️', name: 'Espada de Steve',             weapon: 'espada_pixel', stats: { hp: 10, dmg: 0.05 },               ref: 'Minecraft' },
    { id: 'shuriken',      slot: 'arma', rarity: 'raro',       icon: '✴️', name: 'Shurikens de Naruto',         weapon: 'shuriken',     stats: { speed: 0.08, dmg: 0.04 },          ref: 'Naruto' },
    { id: 'escudo',        slot: 'arma', rarity: 'epico',      icon: '🛡️', name: 'Escudo del Capitán América',  weapon: 'escudo',       stats: { armor: 1, hp: 20 },             ref: 'Capitán América' },
    { id: 'martillo',      slot: 'arma', rarity: 'epico',      icon: '🔨', name: 'Martillo de Mordekaiser',     weapon: 'martillo',    stats: { hp: 20, area: 0.12 },               ref: 'Mordekaiser (League of Legends)' },
    { id: 'onda_ki',       slot: 'arma', rarity: 'legendario', icon: '🔆', name: 'Kamehameha de Goku',          weapon: 'onda_ki',      stats: { dmg: 0.15, xp: 0.18 },  ref: 'Dragon Ball' },
    // Cascos
    { id: 'capucha',  slot: 'casco', rarity: 'comun',      icon: '🧢', name: 'Capucha de Viaje', stats: { hp: 10 } },
    { id: 'yelmo',    slot: 'casco', rarity: 'raro',       icon: '⛑️', name: 'Yelmo de Hierro',  stats: { armor: 1, hp: 8 } },
    { id: 'corona',   slot: 'casco', rarity: 'legendario', icon: '👑', name: 'Corona del Sabio', stats: { xp: 0.20, hp: 18, dmg: 0.05 } },
    { id: 'gorra_fontanero', slot: 'casco', rarity: 'comun',  icon: '🧢', name: 'Gorra de Mario',           stats: { hp: 6, gold: 0.05 },   ref: 'Super Mario' },
    { id: 'bandana_ninja',   slot: 'casco', rarity: 'raro',   icon: '🥷', name: 'Bandana de Naruto',    stats: { speed: 0.07, dmg: 0.05 }, ref: 'Naruto' },
    { id: 'sombrero_paja',   slot: 'casco', rarity: 'epico',  icon: '👒', name: 'Sombrero de Paja de Luffy',              stats: { hp: 18, regen: 0.5, gold: 0.05 }, ref: 'One Piece' },
    // Pecho
    { id: 'tunica',        slot: 'pecho', rarity: 'comun', icon: '👕', name: 'Túnica Reforzada', stats: { hp: 11 } },
    { id: 'cota',          slot: 'pecho', rarity: 'raro',  icon: '🥋', name: 'Cota de Malla',    stats: { hp: 8, armor: 1 } },
    { id: 'manto_estelar', slot: 'pecho', rarity: 'epico', icon: '🧥', name: 'Manto Estelar',    stats: { hp: 22, regen: 0.5 } },
    { id: 'tunica_heroe',  slot: 'pecho', rarity: 'raro',       icon: '🧝', name: 'Túnica de Link',  stats: { hp: 14, speed: 0.04 }, ref: 'The Legend of Zelda' },
    { id: 'gi_naranja',    slot: 'pecho', rarity: 'epico',      icon: '🟠', name: 'Gi de Goku', stats: { hp: 20, dmg: 0.06 }, ref: 'Dragon Ball' },
    { id: 'armadura_vibranio', slot: 'pecho', rarity: 'legendario', icon: '🦾', name: 'Armadura de Iron Man', stats: { hp: 20, armor: 1.5, dmg: 0.05 }, ref: 'Iron Man' },
    // Botas
    { id: 'sandalias',    slot: 'botas', rarity: 'comun', icon: '🩴', name: 'Sandalias Ligeras', stats: { speed: 0.07 } },
    { id: 'botas_viento', slot: 'botas', rarity: 'raro',  icon: '👢', name: 'Botas del Viento',  stats: { speed: 0.10, magnet: 0.15 } },
    { id: 'botas_fase',   slot: 'botas', rarity: 'epico', icon: '👟', name: 'Botas de Fase',     stats: { speed: 0.12, armor: 1, hp: 3 } },
    { id: 'zapas_azules', slot: 'botas', rarity: 'epico',      icon: '💨', name: 'Zapatillas de Sonic', stats: { speed: 0.21 },             ref: 'Sonic' },
    { id: 'botas_del_10', slot: 'botas', rarity: 'legendario', icon: '⚽', name: 'Botas de Leo Messi',            stats: { speed: 0.14, dmg: 0.08, gold: 0.15 }, ref: 'Leo Messi' },
    // Amuletos
    { id: 'colgante',   slot: 'amuleto', rarity: 'comun',      icon: '📿', name: 'Colgante de la Suerte', stats: { gold: 0.13 } },
    { id: 'ojo_dragon', slot: 'amuleto', rarity: 'epico',      icon: '🧿', name: 'Ojo de Dragón',         stats: { dmg: 0.16 } },
    { id: 'reliquia',   slot: 'amuleto', rarity: 'legendario', icon: '💠', name: 'Reliquia Antigua',      stats: { dmg: 0.12, area: 0.12, gold: 0.12 } },
    { id: 'champinon',     slot: 'amuleto', rarity: 'comun',      icon: '🍄', name: 'Superchampiñón de Mario',  stats: { hp: 10 },                       ref: 'Super Mario' },
    { id: 'esfera_dragon', slot: 'amuleto', rarity: 'epico',      icon: '🔮', name: 'Bola de Dragón de 4 Estrellas', stats: { xp: 0.20, gold: 0.15 },     ref: 'Dragon Ball' },
    { id: 'anillo_unico',  slot: 'amuleto', rarity: 'legendario', icon: '💍', name: 'El Anillo Único',    stats: { dmg: 0.20, area: 0.12, cd: 0.03, hp: -10 }, ref: 'El Señor de los Anillos' },
    { id: 'trifuerza',     slot: 'amuleto', rarity: 'legendario', icon: '🔺', name: 'Trifuerza',   stats: { dmg: 0.10, speed: 0.10, xp: 0.13 }, ref: 'The Legend of Zelda' },
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
