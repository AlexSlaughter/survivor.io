'use strict';
/*
 * Conexión online con WebRTC (canales de datos directos), hasta 4 jugadores.
 * El anfitrión abre una conexión por cada plaza de invitado (3 plazas). La "presentación"
 * de cada plaza (oferta y respuesta) se intercambia con un código de sala en Firestore;
 * después, la partida va directamente de un navegador a otro.
 */
window.Net = (() => {
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
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

  // Anfitrión: crea la sala con 3 plazas y espera las respuestas de los invitados.
  N.host = async sig => {
    close();
    signal = sig; N.role = 'host';
    const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    const slots = {};
    await Promise.all(SLOTS.map(async k => {
      const p = newPeer(k);
      setupChannel(p, p.pc.createDataChannel('game', { ordered: true }));
      await p.pc.setLocalDescription(await p.pc.createOffer());
      await waitIce(p.pc);
      slots[k] = { offer: JSON.stringify(p.pc.localDescription) };
    }));
    if (N.role !== 'host') return null;
    await sig.create(code, { slots });
    N.code = code; roomLive = true;
    emit('waiting', code);
    unwatch = sig.watch(code, async (room, err) => {
      if (err) { emit('error', err); return; }
      if (!room || !room.slots) return;
      for (const k of SLOTS) {
        const sl = room.slots[k], p = peers[k];
        if (sl && sl.answer && p && !p.pc.currentRemoteDescription) {
          try { await p.pc.setRemoteDescription(JSON.parse(sl.answer)); emit('connecting', { slot: k }); }
          catch (e) { emit('error', e); }
        }
      }
    });
    return code;
  };

  // Invitado: ocupa una plaza libre, lee su oferta y deja la respuesta.
  N.join = async (sig, code) => {
    close();
    signal = sig; N.role = 'guest';
    const { slot, offer } = await sig.claim(code);
    N.slot = slot;
    const p = newPeer(slot);
    p.pc.ondatachannel = e => setupChannel(p, e.channel);
    // Si en 25 s no hay conexión, se avisa (redes que no permiten conexión directa).
    timeout = setTimeout(() => { if (!p.open && peers[slot] === p) emit('failed'); }, 25000);
    await p.pc.setRemoteDescription(JSON.parse(offer));
    await p.pc.setLocalDescription(await p.pc.createAnswer());
    await waitIce(p.pc);
    if (peers[slot] !== p) return;
    await sig.answer(code, slot, JSON.stringify(p.pc.localDescription));
    N.code = code;
    emit('connecting', { slot });
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
