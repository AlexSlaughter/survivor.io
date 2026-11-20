# Horda Nocturna

Juego original de supervivencia contra hordas (*survivors-like*) para navegador, hecho con **HTML5 Canvas + JavaScript puro**, sin dependencias.

Sobrevive 10 minutos a oleadas cada vez más grandes de monstruos y derrota al **Rey del Abismo**.

## Cómo jugar

- **Moverse:** `WASD` / flechas, o arrastrando el dedo en pantallas táctiles (joystick virtual).
- **Atacar:** automático; tus armas disparan solas.
- **Subir de nivel:** recoge los cristales que sueltan los enemigos y elige 1 de 3 mejoras.
- **Evolucionar:** lleva un arma a **Nv. 5**, consigue su objeto clave y abre un **cofre** (lo sueltan élites y jefes).
- **Pausa:** `P` / `Esc` o el botón ❚❚.

### Armas

| Arma | Efecto | Objeto clave | Evolución |
|---|---|---|---|
| ✨ Chispa Arcana | Dispara al enemigo más cercano | 📘 Tomo Duplicador | Tormenta Arcana |
| 🌀 Cuchillas Orbitales | Cuchillas giran a tu alrededor | 🔍 Lente Prisma | Anillo Eterno |
| 🔥 Halo Ardiente | Daña a los enemigos cercanos | ❤️ Corazón Vivo | Sol Interior (además ralentiza) |
| ⚡ Rayo Celeste | Rayos sobre enemigos al azar | ⏳ Reloj de Arena | Juicio Tronante |
| 🥏 Disco Retornante | Disco de ida y vuelta que atraviesa | 💎 Gema de Poder | Eclipse Giratorio |

Objetos pasivos extra: 👢 Botas Veloces (velocidad) e 🧲 Imán Lunar (radio de recogida).

### Enemigos y eventos

- Babosas, murciélagos, espectros y brutos que se desbloquean con el tiempo.
- Un **élite** cada minuto (suelta un cofre) y **enjambres** que te rodean cada 45 s.
- Jefes: **Coloso de Obsidiana** (5:00) y **Rey del Abismo** (10:00).

## Ejecutar

Abre `index.html` en el navegador, o sirve la carpeta:

```bash
python3 -m http.server 8000
```

y visita <http://localhost:8000>.

Para publicarlo gratis, activa **GitHub Pages** en *Settings → Pages* con esta rama como origen.

## Estructura

- `index.html`: página y menús.
- `style.css`: estilos de la interfaz.
- `game.js`: motor del juego (entrada, aparición de enemigos, armas, colisiones con rejilla espacial y renderizado).
