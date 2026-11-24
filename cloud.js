'use strict';
/*
 * Cuentas y guardado en la nube con Firebase (Auth + Firestore).
 * El SDK solo se descarga si firebase-config.js tiene un proyecto configurado.
 * Avisa a game.js con los eventos de ventana 'cloud' (cambio de estado) y 'cloud-login'.
 */
window.Cloud = (() => {
  const cfg = window.FIREBASE_CONFIG || {};
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const C = { configured: !!(cfg.apiKey && cfg.projectId), ready: false, user: null, error: '' };
  let fb = null, auth = null, db = null;
  const emit = () => dispatchEvent(new CustomEvent('cloud'));

  const MSG = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/missing-password': 'Escribe una contraseña.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Pulsa «Entrar».',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No existe ninguna cuenta con ese correo.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un poco y vuelve a probar.',
    'auth/popup-closed-by-user': 'Has cerrado la ventana de Google antes de terminar.',
    'auth/cancelled-popup-request': 'Has cerrado la ventana de Google antes de terminar.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication → Settings → Dominios autorizados).',
    'auth/operation-not-allowed': 'Este método de inicio de sesión no está activado en Firebase.',
    'auth/network-request-failed': 'Sin conexión a Internet.',
    'permission-denied': 'El servidor rechazó el guardado. Revisa las reglas de Firestore.',
    'unavailable': 'Sin conexión con el servidor. Se reintentará más tarde.',
    'room/not-found': 'No existe ninguna sala con ese código.',
    'room/full': 'Esa sala ya está completa (4 jugadores).',
  };
  C.message = e => MSG[e && e.code] || ('Error: ' + ((e && (e.code || e.message)) || 'desconocido'));

  async function init() {
    if (!C.configured) { C.ready = true; emit(); return; }
    try {
      const [app, a, f] = await Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-auth.js'),
        import(SDK + 'firebase-firestore.js'),
      ]);
      fb = Object.assign({}, a, f);
      const inst = app.initializeApp(cfg);
      auth = a.getAuth(inst);
      db = f.getFirestore(inst);
      a.getRedirectResult(auth).catch(e => { C.error = C.message(e); emit(); });
      a.onAuthStateChanged(auth, u => {
        const was = C.user && C.user.uid;
        C.user = u ? { uid: u.uid, name: u.displayName || u.email || 'Jugador', email: u.email || '' } : null;
        C.ready = true;
        emit();
        if (u && u.uid !== was) dispatchEvent(new CustomEvent('cloud-login'));
      });
    } catch (e) {
      C.error = 'No se pudo conectar con el servidor de cuentas.';
      C.ready = true;
      emit();
    }
  }

  C.loginGoogle = async () => {
    const p = new fb.GoogleAuthProvider();
    try { await fb.signInWithPopup(auth, p); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return fb.signInWithRedirect(auth, p);
      throw e;
    }
  };
  C.loginEmail = (email, pass) => fb.signInWithEmailAndPassword(auth, email, pass);
  C.register = (email, pass) => fb.createUserWithEmailAndPassword(auth, email, pass);
  C.logout = () => fb.signOut(auth);

  C.load = async () => {
    const snap = await fb.getDoc(fb.doc(db, 'players', C.user.uid));
    return snap.exists() ? snap.data().save || null : null;
  };
  C.store = save => fb.setDoc(fb.doc(db, 'players', C.user.uid), {
    save: JSON.parse(JSON.stringify(save)),
    name: C.user.name,
    updatedAt: fb.serverTimestamp(),
  });

  // Salas para el cooperativo online: solo guardan la "presentación" WebRTC (oferta y respuesta).
  const room = code => fb.doc(db, 'rooms', code);
  C.rooms = {
    create: (code, data) => fb.setDoc(room(code), Object.assign({}, data, { host: C.user.uid, created: fb.serverTimestamp() })),
    get: async code => { const s = await fb.getDoc(room(code)); return s.exists() ? s.data() : null; },
    // Ocupa una plaza de forma atómica (dos invitados no pueden quedarse la misma). Si este
    // jugador ya tenía una plaza (un intento anterior que falló), la reutiliza en vez de gastar otra.
    claim: code => fb.runTransaction(db, async tx => {
      const snap = await tx.get(room(code));
      if (!snap.exists()) throw Object.assign(new Error('No existe esa sala'), { code: 'room/not-found' });
      const slots = snap.data().slots || {};
      const k = ['1', '2', '3'].find(n => slots[n] && slots[n].guest === C.user.uid)
        || ['1', '2', '3'].find(n => slots[n] && !slots[n].guest);
      if (!k) throw Object.assign(new Error('Sala llena'), { code: 'room/full' });
      tx.update(room(code), { [`slots.${k}`]: { guest: C.user.uid } });
      return { slot: k };
    }),
    offer: (code, slot, offer) => fb.updateDoc(room(code), { [`slots.${slot}.offer`]: offer }),
    answer: (code, slot, answer, to) => fb.updateDoc(room(code), { [`slots.${slot}.answer`]: answer, [`slots.${slot}.answerTo`]: to }),
    watch: (code, cb) => fb.onSnapshot(room(code), s => cb(s.exists() ? s.data() : null), err => cb(null, err)),
    remove: code => fb.deleteDoc(room(code)),
  };

  init();
  return C;
})();
