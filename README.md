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

### Personajes

Se desbloquean con oro en la pantalla de selección.

| Personaje | Arma inicial | Bonus | Precio |
|---|---|---|---|
| Aria, Hechicera | ✨ Chispa Arcana | Equilibrada | Gratis |
| Bruno, Guardián | 🌀 Cuchillas Orbitales | +40 vida, +1 armadura, -10% velocidad | 🪙 250 |
| Kira, Exploradora | 🥏 Disco Retornante | +15% velocidad, +25% recogida | 🪙 400 |
| Vulcan, Piromante | 🔥 Halo Ardiente | +15% daño, +10% área, -20 vida | 🪙 600 |
| Nova, Tormenta | ⚡ Rayo Celeste | -12% recarga, +1 vida/s | 🪙 900 |

### Mapas

| Mapa | Dificultad | Oro | Cómo se desbloquea |
|---|---|---|---|
| 🌲 Bosque Sombrío | Normal | ×1 | Disponible desde el principio |
| 🏜️ Desierto Carmesí | +35% vida enemiga, más rápidos | ×1.5 | Sobrevive 5:00 en el Bosque |
| ❄️ Cripta Helada | +80% vida enemiga, más rápidos | ×2.2 | Sobrevive 7:00 en el Desierto |

### Tienda

Al terminar cada partida ganas oro: las monedas recogidas, más un extra por tiempo y por jefes derrotados, multiplicado por el mapa. En la **tienda** compras mejoras permanentes: Poder, Vitalidad, Armadura, Agilidad, Celeridad, Magnetismo, Sabiduría (experiencia), Codicia (oro), **Visión** (una cuarta opción al subir de nivel) y **Renacer** (revives una vez por partida). El progreso se guarda en el navegador.

### Sonido

Los efectos y la música se generan en tiempo real con Web Audio, sin archivos de audio. La música se acelera durante los jefes. Puedes activarlos o desactivarlos desde el menú o la pausa.

### Enemigos y eventos

- Babosas, murciélagos, espectros y brutos que se desbloquean con el tiempo.
- Un **élite** cada minuto (suelta un cofre) y **enjambres** que te rodean cada 45 s.
- Jefes: **Coloso de Obsidiana** (5:00) y **Rey del Abismo** (10:00).

## Diseño adaptable

- Funciona en escritorio, tablet y móvil, en vertical y en horizontal.
- El zoom del mundo se ajusta al tamaño de la pantalla, para que en todos los dispositivos se vea una zona parecida.
- En pantallas táctiles aparece un joystick virtual allí donde pongas el dedo.
- Se respetan las zonas seguras de móviles con *notch*.
- Los menús se reorganizan según el ancho y el alto disponibles.

## Ejecutar

Abre `index.html` en el navegador, o sirve la carpeta:

```bash
python3 -m http.server 8000
```

y visita <http://localhost:8000>.

Para publicarlo gratis, activa **GitHub Pages** en *Settings → Pages* con esta rama como origen.

## Estructura

- `index.html`: página y menús.
- `style.css`: estilos adaptables de la interfaz.
- `data.js`: datos de armas, objetos, enemigos, personajes, mapas y tienda.
- `audio.js`: efectos de sonido y música procedural.
- `game.js`: motor del juego (entrada, aparición de enemigos, armas, colisiones con rejilla espacial, renderizado, menús y guardado).
