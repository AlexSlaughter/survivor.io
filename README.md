# Horda Nocturna

Juego original de supervivencia contra hordas (*survivors-like*) para navegador, hecho con **HTML5 Canvas + JavaScript puro**, sin dependencias.

Sobrevive 10 minutos a oleadas cada vez más grandes de monstruos y derrota al **Rey del Abismo**.

## Cómo jugar

- **Moverse:** `WASD` / flechas, o arrastrando el dedo en pantallas táctiles (joystick virtual).
- **Atacar:** automático; tus armas disparan solas.
- **Subir de nivel:** recoge los cristales que sueltan los enemigos y elige 1 de 3 mejoras.
- **Evolucionar:** lleva un arma a **Nv. 5**, consigue su objeto clave y abre un **cofre** (lo sueltan élites y jefes).
- **Pausa:** `P` / `Esc` o el botón ❚❚.

### Cooperativo local (2 jugadores)

En la pantalla de selección, elige **👥 2 jugadores (local)** y un personaje para cada uno.

| | Jugador 1 | Jugador 2 |
|---|---|---|
| Teclado | WASD | Flechas |
| Mando | Primer mando | Segundo mando |
| Pantalla táctil | Mitad izquierda | Mitad derecha |

- La **experiencia, el nivel y el oro** son compartidos. Las mejoras se eligen **por turnos**: cada subida de nivel le toca a un jugador, que mejora sus propias armas.
- La cámara sigue a los dos, y ninguno puede salirse de la pantalla.
- Si un jugador **cae**, su compañero lo reanima quedándose a su lado 3 segundos. Si el caído está fuera de la pantalla, una flecha indica dónde está. La partida termina cuando caen los dos.
- Hay más enemigos, más resistentes y con jefes más duros, pero se sube de nivel más rápido.
- Con mando: **Start** pausa y **A/B/X/Y** eligen la mejora 1-4.

### Cooperativo online

Elige **🌐 Online** en la pantalla de selección. Los dos jugadores tienen que **iniciar sesión**.

1. Uno pulsa **🏠 Crear sala**: aparece un **código de 5 letras**. Quien crea la sala elige el mapa.
2. El otro escribe ese código y pulsa **🔗 Unirse**.
3. Cuando el segundo jugador aparece en la sala, el anfitrión pulsa **¡Comenzar!**

Funciona igual que el cooperativo local (nivel y oro compartidos, mejoras por turnos y reanimar), pero cada uno juega en su dispositivo con todos los controles. **Los dos ganáis oro** para vuestras cuentas. Si alguien pierde la conexión, el anfitrión sigue jugando solo.

Cómo funciona por dentro: los dos navegadores se conectan directamente con **WebRTC**. Firebase solo se usa para intercambiar el código de la sala, y esa sala se borra al conectar. El anfitrión simula la partida y envía el estado unas 15 veces por segundo (hasta ~110 KB/s con la pantalla llena). El invitado mueve a su personaje en su propia pantalla, así no nota el retraso. Algunas redes muy restrictivas (por ejemplo, ciertas redes de empresa o universidad) no permiten la conexión directa; en ese caso, prueba con datos móviles.

### Armas

| Arma | Efecto | Objeto clave | Evolución |
|---|---|---|---|
| ✨ Chispa Arcana | Dispara al enemigo más cercano | 📘 Tomo Duplicador | Tormenta Arcana |
| 🌀 Cuchillas Orbitales | Cuchillas giran a tu alrededor | 🔍 Lente Prisma | Anillo Eterno |
| 🔥 Halo Ardiente | Daña a los enemigos cercanos | ❤️ Corazón Vivo | Sol Interior (además ralentiza) |
| ⚡ Rayo Celeste | Rayos sobre enemigos al azar | ⏳ Reloj de Arena | Juicio Tronante |
| 🥏 Disco Retornante | Disco de ida y vuelta que atraviesa | 💎 Gema de Poder | Eclipse Giratorio |

Objetos pasivos extra: 👢 Botas Veloces (velocidad) e 🧲 Imán Lunar (radio de recogida).

### Equilibrio de daño

Daño por segundo aproximado a cada enemigo, sin bonificaciones. Las armas de área y cuerpo a cuerpo hacen menos por enemigo porque golpean a muchos a la vez.

| Arma | Nv1 | Nv3 | Nv5 | Evolucionada |
|---|---|---|---|---|
| ✨ Chispa (un objetivo) | 14 | 49 | 120 | 393 |
| 🥏 Disco (atraviesa) | 13 | 49 | 134 | 314 |
| ⚡ Rayo (área) | 10 | 43 | 116 | 331 |
| 🌀 Cuchillas (cuerpo a cuerpo) | 8 | 38 | 69 | 165 |
| 🔥 Halo (todo alrededor) | 10 | 22 | 34 | 102 (y ralentiza) |

Los enemigos ganan vida cada vez más rápido (×4 a los 5 minutos y ×10 a los 10) y +10% de daño por minuto. Jefes: Coloso de Obsidiana 5000 de vida y Rey del Abismo 20000.

### Personajes

Se desbloquean con oro en la pantalla de selección.

| Personaje | Arma inicial | Bonus | Precio |
|---|---|---|---|
| Aria, Hechicera | ✨ Chispa Arcana | Equilibrada | Gratis |
| Bruno, Guardián | 🌀 Cuchillas Orbitales | +40 vida, +1 armadura, -10% velocidad | 🪙 250 |
| Kira, Exploradora | 🥏 Disco Retornante | +15% velocidad, +25% recogida | 🪙 400 |
| Vulcan, Piromante | 🔥 Halo Ardiente | +15% daño, +10% área, -20 vida | 🪙 600 |
| Nova, Tormenta | ⚡ Rayo Celeste | -12% recarga, +1 vida/s | 🪙 900 |
| Salim, el Inútil | ✨ Chispa Arcana | -25% daño, -10% velocidad; +40% oro y +25% experiencia | 🪙 100 |
| Iván, el Tanque | 🔥 Halo Ardiente | +80 vida, +2 armadura, +1 vida/s; -20% velocidad y más grande | 🪙 700 |
| Pol, el Flaco | ✨ Chispa Arcana | +30% velocidad, -10% recarga, más pequeño; solo 60 de vida | 🪙 500 |
| Igor, el Alto | ⚡ Rayo Celeste | +20% área, +40% recogida, +5% velocidad, +20 vida; -10% daño y blanco grande | 🪙 550 |

### Equipo y cofres

En **🎒 Equipo** tienes 5 huecos: **arma**, **casco**, **pecho**, **botas** y **amuleto**.

- **El arma equipada sustituye al ataque básico** del personaje (por ejemplo, Aria con el *Cetro de Tormenta* empieza con Rayo Celeste) y además da una bonificación.
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
| ⚔️ Arma | Varita Arcana, Cuchillas Gemelas, Disco de Bronce, Brasero de Mano, Cetro de Tormenta, Filo del Eclipse |
| 🪖 Casco | Capucha de Viaje, Yelmo de Hierro, Corona del Sabio |
| 🦺 Pecho | Túnica Reforzada, Cota de Malla, Manto Estelar |
| 🥾 Botas | Sandalias Ligeras, Botas del Viento, Botas de Fase |
| 📿 Amuleto | Colgante de la Suerte, Ojo de Dragón, Reliquia Antigua |

### Mapas

| Mapa | Dificultad | Oro | Cómo se desbloquea |
|---|---|---|---|
| 🌲 Bosque Sombrío | Normal | ×1 | Disponible desde el principio |
| 🏜️ Desierto Carmesí | +35% vida enemiga, más rápidos | ×1.5 | Sobrevive 5:00 en el Bosque |
| ❄️ Cripta Helada | +80% vida enemiga, más rápidos | ×2.2 | Sobrevive 7:00 en el Desierto |

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
