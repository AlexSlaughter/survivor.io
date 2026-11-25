# Horda Nocturna

Juego original de supervivencia contra hordas (*survivors-like*) para navegador, hecho con **HTML5 Canvas + JavaScript puro**, sin dependencias.

Sobrevive 10 minutos a oleadas cada vez más grandes de monstruos y derrota al **Rey del Abismo**.

## Cómo jugar

- **Moverse:** `WASD` / flechas, o arrastrando el dedo en pantallas táctiles (joystick virtual).
- **Atacar:** automático; tus armas disparan solas.
- **Subir de nivel:** recoge los cristales que sueltan los enemigos y elige 1 de 3 mejoras.
- **Evolucionar:** lleva un arma a **Nv. 5**, consigue su objeto clave y abre un **cofre** (lo sueltan élites y jefes).
- **Ulti:** cada personaje tiene una definitiva propia que se usa **una vez por partida**: `Q` o `Espacio` (J2 en local: `Intro`), LB/RB/Y en el mando o el botón redondo de abajo a la derecha.
- **Pausa:** `P` / `Esc` o el botón ❚❚. Al continuar hay una cuenta atrás de 3 segundos.
- **Jefes:** atacan a menudo y, a media vida, se enfurecen (aura roja, más rápidos y con más proyectiles).
- **Mejoras nuevas en partida:** armas ⛓️ Cadena Eléctrica (evoluciona con 🔮 Cristal de Maná), 🌪️ Torbellino (con 🦇 Capa Sombría), 💣 Minas Saltarinas (con 🌵 Cota de Espinas), 👻 Espíritus Errantes (con 🦷 Colmillo Vampírico) y 🪨 Pisotón Sísmico (con 🍀 Trébol de la Suerte).

### Cooperativo local (2 jugadores)

En la pantalla de selección, elige **👥 2 jugadores (local)** y un personaje para cada uno.

| | Jugador 1 | Jugador 2 |
|---|---|---|
| Teclado | WASD | Flechas |
| Mando | Primer mando | Segundo mando |
| Pantalla táctil | Mitad izquierda | Mitad derecha |

- La **experiencia, el nivel y el oro** son compartidos. Las mejoras se eligen **por turnos**: cada subida de nivel le toca a un jugador, que mejora sus propias armas.
- La cámara sigue a los dos, y ninguno puede salirse de la pantalla.
- Si un jugador **cae**, sale un aviso grande en rojo y su compañero lo reanima quedándose a su lado 3 segundos. Si el caído está fuera de la pantalla, una flecha indica dónde está. La partida termina cuando caen los dos.
- Hay más enemigos, más resistentes y con jefes más duros, pero se sube de nivel más rápido.
- Con mando: **Start** pausa y **A/B/X/Y** eligen la mejora 1-4.

### Cooperativo online

Elige **🌐 Online** en la pantalla de selección. **Hasta 4 jugadores**, y todos tienen que **iniciar sesión**.

1. Uno pulsa **🏠 Crear sala**: aparece un **código de 5 letras**. Quien crea la sala elige el mapa.
2. Los demás (hasta 3) escriben ese código y pulsan **🔗 Unirse**. Todos ven en la sala quién está dentro.
3. El anfitrión pulsa **¡Comenzar!** cuando quiera, con 2, 3 o 4 jugadores.

Funciona igual que el cooperativo local (nivel y oro compartidos, mejoras por turnos y reanimar), pero cada uno juega en su dispositivo con todos los controles. **Todos ganáis oro** para vuestras cuentas. Con más jugadores hay más enemigos y más resistentes, y se sube de nivel algo más rápido. Si alguien pierde la conexión, desaparece de la partida y el resto sigue.

Cómo funciona por dentro: el anfitrión se conecta directamente con cada invitado por **WebRTC** (una conexión por plaza). Firebase solo se usa para intercambiar el código de la sala, y esa sala se borra al empezar la partida. El anfitrión simula la partida y envía el estado unas 15 veces por segundo (hasta ~110 KB/s con la pantalla llena). El invitado mueve a su personaje en su propia pantalla, así no nota el retraso. Muchas redes no permiten la conexión directa: casi todos los **datos móviles** (las operadoras comparten una misma IP entre muchos clientes) y ciertas redes de empresa o universidad. En ese caso hace falta un servidor TURN (relé): configúralo en `window.TURN_SERVERS` dentro de `firebase-config.js` (por ejemplo, con el plan gratuito de metered.ca). Sin TURN, jugad conectados a una wifi.

### Ataque principal (armas)

Todos empiezan con la **🔫 Pistola** (ataque básico). El arma que te equipes (conseguida en los cofres) pasa a ser el **ataque principal de cualquier personaje**. Sube de nivel durante la partida (+25% de daño por nivel) y, si el objeto está mejorado, hace un 15% más de daño por cada nivel del objeto.

| Arma | Rareza | Cómo ataca | Daño/s a una horda cercana (Nv1) |
|---|---|---|---|
| 🔫 Pistola | Básica | Dispara al enemigo más cercano | 16 |
| 🤠 Revólver | Común | Balas pesadas que atraviesan a un enemigo | 24 |
| 🎇 Subfusil | Raro | Lluvia de balas rápidas con dispersión | 37 |
| 💥 Escopeta | Raro | Perdigones a corta distancia que empujan | 38 |
| ⚔️ Espada de Steve (Minecraft) | Raro | Tajos rápidos al frente, 20% de crítico | 43 |
| ✴️ Shurikens de Naruto | Raro | Abanico de estrellas que atraviesan | 42 |
| 👊 Puño Gomu Gomu de Luffy (One Piece) | Raro | El brazo se estira y golpea todo en línea recta | 40 |
| ⚽ Balón del Mundial (Fútbol) | Raro | Chut que atraviesa a tres enemigos y los aparta | 42 |
| 🔭 Francotirador | Épico | Disparo lento que atraviesa a todos y apunta a los más duros | 65 |
| 🗡️ Katana | Épico | Tajo en arco a los enemigos cercanos | 64 |
| 🌊 Katana Nichirin de Tanjiro (Demon Slayer) | Épico | Tajo de agua muy amplio y rápido | 65 |
| 🛡️ Escudo del Capitán América | Épico | Se lanza, atraviesa y vuelve | 68 |
| 🔨 Martillo de Mordekaiser | Épico | Golpe al suelo que daña y aparta alrededor | 65 |
| 🚀 Lanzacohetes | Legendario | Cohetes que explotan en área | 92 |
| 🔆 Kamehameha de Goku | Legendario | Gran onda de energía que atraviesa la pantalla | 90 |
| 🖤 Destello Negro de Itadori (Jujutsu Kaisen) | Legendario | Golpe a tu alrededor; 1 de cada 4 hace x2,5 | 90 |

Los objetos están equilibrados por rareza: cada uno reparte sus bonificaciones de forma distinta, pero todos los de la misma rareza valen más o menos lo mismo.

### Habilidades (al subir de nivel)

Durante la partida, al subir de nivel puedes conseguir habilidades que se suman al ataque principal, y que evolucionan con su objeto clave:

| Habilidad | Efecto | Objeto clave | Evolución |
|---|---|---|---|
| ✨ Chispa Arcana | Dispara al enemigo más cercano | 📘 Tomo Duplicador | Tormenta Arcana |
| 🌀 Cuchillas Orbitales | Cuchillas giran a tu alrededor | 🔍 Lente Prisma | Anillo Eterno |
| 🔥 Halo Ardiente | Daña a los enemigos cercanos | ❤️ Corazón Vivo | Sol Interior (además ralentiza) |
| ⚡ Rayo Celeste | Rayos sobre enemigos al azar | ⏳ Reloj de Arena | Juicio Tronante |
| 🥏 Disco Retornante | Disco de ida y vuelta que atraviesa | 💎 Gema de Poder | Eclipse Giratorio |


Objetos pasivos extra: 👢 Botas Veloces (velocidad) e 🧲 Imán Lunar (radio de recogida).

### Equilibrio de daño de las habilidades

Daño por segundo aproximado a cada enemigo, sin bonificaciones. Las armas de área y cuerpo a cuerpo hacen menos por enemigo porque golpean a muchos a la vez.

| Arma | Nv1 | Nv3 | Nv5 | Evolucionada |
|---|---|---|---|---|
| ✨ Chispa (un objetivo) | 14 | 49 | 120 | 393 |
| 🥏 Disco (atraviesa) | 13 | 49 | 134 | 314 |
| ⚡ Rayo (área) | 10 | 43 | 116 | 331 |
| 🌀 Cuchillas (cuerpo a cuerpo) | 8 | 38 | 69 | 165 |
| 🔥 Halo (todo alrededor) | 10 | 22 | 34 | 102 (y ralentiza) |

Los enemigos ganan vida cada vez más rápido (×1,25 al empezar, ×5,4 a los 5 minutos y ×12,5 a los 10) y +10% de daño por minuto. Jefes (vida base): Reina Araña 1000, Coloso de Obsidiana 6000, Dragón de Hueso 12000 y Rey del Abismo 20000; se multiplica entre ×0,9 y ×2,25 según vuestro nivel al llegar (×1,5 con el nivel habitual). Enfurecidos, los jefes brillan en rojo.

### Personajes

Los personajes **solo cambian estadísticas**: el ataque principal lo da el arma equipada. Se desbloquean con oro en la pantalla de selección.

| Personaje | Bonificaciones | Precio |
|---|---|---|
| ⚓ Marc, del Barco | Personaje inicial: ni suma ni resta nada | Gratis |
| 🪣 Salim, el Inútil | -25% daño, -10% velocidad; +40% oro y +25% experiencia | 🪙 100 |
| 😎 Alex, el Guapo | +40% recogida, +15% experiencia, +10% daño, +5% velocidad | 🪙 350 |
| 🧢 Pol, el Flaco | +30% velocidad, -10% recarga, más pequeño; solo 60 de vida | 🪙 500 |
| 🎩 Igor, el Alto | +20% área, +40% recogida, +5% velocidad, +20 vida; -10% daño y blanco grande | 🪙 550 |
| 🪖 Iván, el Tanque | +80 vida, +2 armadura, +1 vida/s; -20% velocidad y más grande | 🪙 700 |

### Equipo y cofres

En **🎒 Equipo** tienes 5 huecos: **arma**, **casco**, **pecho**, **botas** y **amuleto**.

- **El arma equipada es el ataque principal** de cualquier personaje (ver tabla de armas) y además da una pequeña bonificación.
- Los objetos tienen rareza (**común**, **raro**, **épico** y **legendario**) y se **mejoran con oro** hasta nivel 5. Cada nivel añade un 50% de la bonificación base.
- **No se compran directamente**: salen en **🎰 cofres con ruleta**, que se compran con oro, o como **🎁 botín** (cada jefe derrotado tiene un 50% de soltar un objeto; los legendarios solo si ganas la partida). Si te toca uno que ya tienes, sube de nivel, y si ya estaba al máximo recibes oro.

| Cofre | Precio | Común | Raro | Épico | Legendario |
|---|---|---|---|---|---|
| 📦 Madera | 200 | 70% | 25% | 5% | — |
| 🎁 Plata | 600 | 30% | 50% | 17% | 3% |
| 💰 Dorado | 1500 | — | 40% | 45% | 15% |
- En cooperativo local el equipo lo lleva J1. En online, cada jugador lleva el suyo.

| Hueco | Objetos |
|---|---|
| ⚔️ Arma | Revólver, Escopeta, Subfusil, Espada de Steve, Shurikens de Naruto, Puño Gomu Gomu, Balón del Mundial, Katana, Katana Nichirin, Francotirador, Escudo del Capitán América, Martillo de Mordekaiser, Lanzacohetes, Kamehameha de Goku, Destello Negro |
| 🪖 Casco | Capucha de Viaje, Gorra de Mario, Yelmo de Hierro, Bandana de Naruto, Sombrero de Paja de Luffy, Corona del Sabio, Gorro de Chopper, Máscara de Jabalí de Inosuke, Sombrero de Rabadon, Venda de Gojo |
| 🦺 Pecho | Túnica Reforzada, Cota de Malla, Túnica de Link, Manto Estelar, Gi de Goku, Armadura de Iron Man, Camiseta del 10, Uniforme del Colegio Jujutsu, Haori de Tanjiro, Malla de Espinas, Capa de Almirante |
| 🥾 Botas | Sandalias Ligeras, Botas del Viento, Botas de Fase, Zapatillas de Sonic, Botas de Leo Messi, Tacos de FIFA, Botas de Mercurio, Sandalias de Zenitsu, Bota de Oro |
| 📿 Amuleto | Colgante de la Suerte, Superchampiñón de Mario, Ojo de Dragón, Bola de Dragón de 4 Estrellas, Reliquia Antigua, El Anillo Único, Trifuerza, Pendientes Hanafuda, Poké Ball, Filo Infinito, Fruta Gomu Gomu, Llavero de la Llave Espada, Dedo de Sukuna, Balón de Oro, Varita de Saúco |

**Más beneficios, más rareza:** cada bonificación vale unos puntos (por ejemplo, 10 de vida = 10 puntos; +5% de daño = 10 puntos) y cada rareza tiene su presupuesto: común ~10, raro ~20, épico ~32 y legendario ~48. Con las armas pasa igual con el daño que hacen.

En **📖 Catálogo** puedes ver todos los objetos, también los que aún no tienes, con sus bonificaciones y en qué cofres salen.

### Mapas

| Mapa | Dificultad | Oro | Cómo se desbloquea |
|---|---|---|---|
| 🌲 Bosque Sombrío | Normal | ×1 | Disponible desde el principio |
| 🏜️ Desierto Carmesí | +35% vida enemiga, más rápidos | ×1.5 | Sobrevive 5:00 en el Bosque |
| ❄️ Cripta Helada | +80% vida enemiga, más rápidos | ×2.2 | Sobrevive 7:00 en el Desierto |
| ⛏️ Mundo de Minecraft | +15% vida enemiga | ×1.25 | Sobrevive 3:00 en el Bosque |
| 🍃 Aldea de Konoha | +30% vida enemiga, más rápidos | ×1.45 | Sobrevive 5:00 en Minecraft |
| 🍄 Reino Champiñón | +50% vida enemiga, más rápidos | ×1.7 | Sobrevive 5:00 en Konoha |
| 🔮 Grieta del Invocador | +100% vida enemiga, más rápidos | ×2.6 | Sobrevive 5:00 en la Cripta |
| 🧛 Castillo Vampiro | +60% vida enemiga, más rápidos | ×1.9 | Sobrevive 5:00 en la Cripta |
| 🐙 Abismo Marino | +75% vida enemiga | ×2.1 | Sobrevive 5:00 en el Castillo |
| 🌋 Volcán Infernal | +120% vida enemiga, más rápidos | ×2.9 | Sobrevive 5:00 en la Grieta |
| 🚀 Base Lunar | +150% vida enemiga, mucho más rápidos | ×3.3 | Sobrevive 7:00 en el Volcán |

### Tienda

Al terminar cada partida ganas oro: las monedas recogidas, más un extra por tiempo y por jefes derrotados, multiplicado por el mapa. En la **tienda** compras mejoras permanentes: Poder, Vitalidad, Armadura, Agilidad, Celeridad, Magnetismo, Sabiduría (experiencia), Codicia (oro), **Visión** (una cuarta opción al subir de nivel) y **Renacer** (revives una vez por partida). El progreso se guarda en el navegador.

### Cuentas y guardado del progreso

- **Sin cuenta:** el progreso (oro, tienda, personajes, mapas y récords) se guarda en el navegador de ese dispositivo.
- **Con cuenta:** puedes iniciar sesión con **Google** o con **correo y contraseña**. El progreso se sube a la nube automáticamente y se recupera al entrar desde cualquier dispositivo. Si ya tenías progreso en el dispositivo, se combina con el de la cuenta.
- **Copia de seguridad sin cuenta:** en *Cuenta → Copia de seguridad* tienes un código para copiar y pegar en otro navegador o dispositivo.
- La partida en curso no se guarda: el oro de una partida se suma al terminarla.

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

## Configurar el inicio de sesión (Firebase)

El juego no incluye servidor propio. Las cuentas usan **Firebase**, el servicio gratuito de Google. Hasta que lo configures, el juego funciona igual, pero sin cuentas.

1. Entra en <https://console.firebase.google.com>, pulsa **Crear un proyecto** y sigue los pasos (Google Analytics no hace falta).
2. En la página del proyecto, pulsa el icono **Web** (`</>`) para registrar una app web. Copia los valores de `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `appId`) en **`firebase-config.js`**.
3. Ve a **Authentication → Comenzar** y, en *Método de inicio de sesión*, activa **Google** y **Correo electrónico/contraseña**.
4. En **Authentication → Configuración → Dominios autorizados**, añade el dominio donde publiques el juego (por ejemplo `alexslaughter.github.io`).
5. Ve a **Firestore Database → Crear base de datos** (modo producción). En la pestaña **Reglas**, pega el contenido de **`firestore.rules`** y pulsa **Publicar**. Así cada jugador solo puede leer y escribir su propio progreso, y las salas online solo las gestionan sus jugadores.

Los valores de `firebase-config.js` no son secretos y se pueden subir al repositorio; la seguridad la dan las reglas del paso 5. El plan gratuito de Firebase es de sobra para este juego.

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
- `cloud.js`: inicio de sesión, guardado en la nube y salas online con Firebase.
- `net.js`: conexión directa entre jugadores (WebRTC) para el cooperativo online.
- `firebase-config.js`: configuración de tu proyecto de Firebase.
- `firestore.rules`: reglas de seguridad de la base de datos.
- `game.js`: motor del juego (entrada, aparición de enemigos, armas, colisiones con rejilla espacial, renderizado, menús y guardado).
