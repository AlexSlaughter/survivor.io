'use strict';
/*
 * Conexión online con WebRTC (canales de datos directos), hasta 4 jugadores.
 * El anfitrión tiene una conexión por cada plaza de invitado (3 plazas). La "presentación"
 * de cada plaza (oferta del invitado y respuesta del anfitrión) se intercambia con un código
 * de sala en Firestore;
 * después, la partida va directamente de un navegador a otro.
 */
window.Net = (() => {
  // STUN para la conexión directa y, si se configura (window.TURN_SERVERS en firebase-config.js),
  // un servidor TURN que hace de relé cuando alguna de las redes no permite conexión directa.
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
    .concat(Array.isArray(window.TURN_SERVERS) ? window.TURN_SERVERS : []);
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SLOTS = ['1', '2', '3'];
  const N = { role: null, code: null, slot: null, onMessage: null, onState: null };
  // Anfitrión: una conexión por plaza. Invitado: una sola conexión (con el anfitrión).
  let peers = {};
  let unwatch = null, signal = null, roomLive = false, timeout = 0;
  const emit = (st, info) => { if (N.onState) N.onState(st, info); };

  // Espera a reunir los candidatos de conexión (como mucho unos segundos).
  function waitIce(conn, ms = 4000) {
    return new Promise(res => {
      if (conn.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      conn.addEventListener('icegatheringstatechange', () => {
        if (conn.iceGatheringState === 'complete') { clearTimeout(t); res(); }
      });
    });
  }

  function newPeer(slot) {
    const p = { slot, pc: new RTCPeerConnection({ iceServers: ICE }), ch: null, open: false };
    p.pc.onconnectionstatechange = () => {
      if (peers[slot] !== p) return;
      const s = p.pc.connectionState;
      if (s === 'failed' || s === 'closed') {
        if (p.open) lost(p);
        else if (N.role === 'guest') emit('failed');
      }
    };
    peers[slot] = p;
    return p;
  }

  function lost(p) {
    if (!p.open) return;
    p.open = false;
    emit('closed', { slot: p.slot });
  }

  function setupChannel(p, c) {
    p.ch = c;
    c.onopen = () => {
      p.open = true;
      if (N.role === 'guest') { clearTimeout(timeout); stopWatching(); }
      emit('open', { slot: p.slot });
    };
    c.onclose = () => lost(p);
    c.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (N.onMessage) N.onMessage(m, p.slot);
    };
  }

  function stopWatching() {
    if (unwatch) { try { unwatch(); } catch (e) { /* nada */ } unwatch = null; }
  }
  // Borra la sala (el anfitrión, al empezar la partida o al salir). Las plazas libres se cierran.
  function closeRoom() {
    stopWatching();
    if (roomLive && N.role === 'host' && N.code && signal) signal.remove(N.code).catch(() => {});
    roomLive = false;
    if (N.role === 'host') {
      for (const k of Object.keys(peers)) {
        const p = peers[k];
        if (!p.open) { try { p.pc.close(); } catch (e) { /* nada */ } delete peers[k]; }
      }
    }
  }

  function close() {
    clearTimeout(timeout);
    closeRoom();
    for (const k of Object.keys(peers)) {
      const p = peers[k];
      if (p.ch) { p.ch.onclose = null; try { p.ch.close(); } catch (e) { /* nada */ } }
      try { p.pc.close(); } catch (e) { /* nada */ }
    }
    peers = {};
    N.role = null; N.code = null; N.slot = null;
  }

  // Anfitrión: crea la sala con 3 plazas libres. Cada invitado deja su oferta en una plaza
  // y el anfitrión le contesta en ese momento, con sus datos de red recién obtenidos (así no
  // caducan aunque el amigo tarde minutos en unirse).
  N.host = async sig => {
    close();
    signal = sig; N.role = 'host';
    const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    const slots = {};
    for (const k of SLOTS) slots[k] = { free: true };
    await sig.create(code, { slots });
    if (N.role !== 'host') return null;
    N.code = code; roomLive = true;
    emit('waiting', code);
    const busy = {};
    unwatch = sig.watch(code, async (room, err) => {
      if (err) { emit('error', err); return; }
      if (!room || !room.slots) return;
      for (const k of SLOTS) {
        const sl = room.slots[k], old = peers[k];
        if (!sl || !sl.offer || busy[k] || (old && old.offer === sl.offer)) continue;
        busy[k] = true;
        try {
          // Un invitado nuevo (o el mismo que reintenta): se descarta la conexión anterior de esa plaza.
          if (old) { lost(old); if (old.ch) old.ch.onclose = null; try { old.pc.close(); } catch (e) { /* nada */ } }
          const p = newPeer(k);
          p.offer = sl.offer;
          p.pc.ondatachannel = e => setupChannel(p, e.channel);
          await p.pc.setRemoteDescription(JSON.parse(sl.offer));
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          await waitIce(p.pc);
          if (peers[k] !== p || !roomLive) continue;
          await sig.answer(code, k, JSON.stringify(p.pc.localDescription), sl.offer);
          emit('connecting', { slot: k });
        } catch (e) { emit('error', e); }
        finally { busy[k] = false; }
      }
    });
    return code;
  };

  // Invitado: ocupa una plaza, deja su oferta y espera la respuesta del anfitrión.
  N.join = async (sig, code) => {
    close();
    signal = sig; N.role = 'guest';
    const { slot } = await sig.claim(code);
    N.slot = slot; N.code = code;
    const p = newPeer(slot);
    setupChannel(p, p.pc.createDataChannel('game', { ordered: true }));
    await p.pc.setLocalDescription(await p.pc.createOffer());
    await waitIce(p.pc);
    if (peers[slot] !== p) return;
    const offer = JSON.stringify(p.pc.localDescription);
    await sig.offer(code, slot, offer);
    emit('connecting', { slot });
    // Si en 30 s no hay conexión, se avisa (redes que no permiten conexión directa).
    timeout = setTimeout(() => { if (!p.open && peers[slot] === p) emit('failed'); }, 30000);
    unwatch = sig.watch(code, async (room, err) => {
      if (peers[slot] !== p || p.pc.currentRemoteDescription) return;
      if (err) { emit('error', err); return; }
      const sl = room && room.slots && room.slots[slot];
      if (!sl || !sl.answer || sl.answerTo !== offer) return;
      try { await p.pc.setRemoteDescription(JSON.parse(sl.answer)); }
      catch (e) { emit('error', e); }
    });
  };

  function sendPeer(p, m) {
    if (!p || !p.open || !p.ch || p.ch.readyState !== 'open') return false;
    // Si el canal va saturado, se descartan instantáneas (llegará la siguiente).
    if (m.t === 's' && p.ch.bufferedAmount > 512 * 1024) return false;
    try { p.ch.send(JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  // Anfitrión: a todos los invitados. Invitado: al anfitrión.
  N.send = m => { let ok = false; for (const k in peers) ok = sendPeer(peers[k], m) || ok; return ok; };
  N.sendTo = (slot, m) => sendPeer(peers[slot], m);
  N.sendExcept = (slot, m) => { for (const k in peers) if (k !== slot) sendPeer(peers[k], m); };
  N.openSlots = () => Object.keys(peers).filter(k => peers[k].open).sort();
  Object.defineProperty(N, 'open', { get: () => Object.values(peers).some(p => p.open) });
  N.closeRoom = closeRoom;
  N.close = close;
  N.MAX_PLAYERS = SLOTS.length + 1;
  return N;
})();
