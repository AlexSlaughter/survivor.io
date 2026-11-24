// Configuración de Firebase para el inicio de sesión y el guardado en la nube.
// Valores de la consola de Firebase → Configuración del proyecto → Tus apps → Web.
// Estos valores no son secretos: la seguridad la dan las reglas de Firestore (firestore.rules).
// Si se dejan vacíos, el juego funciona igual, solo que sin cuentas.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA8m_U9oemT36bFLy0vvekqjK2wfir5kFQ',
  authDomain: 'survivorio-7e387.firebaseapp.com',
  projectId: 'survivorio-7e387',
  storageBucket: 'survivorio-7e387.firebasestorage.app',
  messagingSenderId: '99029686527',
  appId: '1:99029686527:web:18859a3a7255c5bd1354ca',
  measurementId: 'G-439VXG9RSG',
};

// Opcional: servidor TURN (relé) para cuando la conexión directa entre jugadores no es posible
// (datos móviles, redes de empresa o universidad...). Sin él, esas conexiones fallan.
// Se puede conseguir uno gratuito, por ejemplo en metered.ca (plan gratuito), y copiar aquí sus datos:
// window.TURN_SERVERS = [
//   { urls: 'turn:SERVIDOR:80', username: 'USUARIO', credential: 'CLAVE' },
//   { urls: 'turn:SERVIDOR:443?transport=tcp', username: 'USUARIO', credential: 'CLAVE' },
// ];
