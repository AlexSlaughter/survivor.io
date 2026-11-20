'use strict';
/*
 * Conexión online entre dos navegadores con WebRTC (canal de datos directo).
 * La "presentación" inicial (oferta y respuesta) se intercambia con un código de sala
 * guardado en Firestore; después, la partida va directamente de un navegador a otro.
 */
window.Net = (() => {
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const N = { role: null, code: null, open: false, onMessage: null, onState: null };
  let pc = null, ch = null, unwatch = null, signal = null, roomLive = false, timeout = 0;
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

  function lost() {
    if (!N.open) return;
    N.open = false;
    emit('closed');
  }

  function setupChannel(c) {
    ch = c;
    ch.onopen = () => {
      N.open = true;
      clearTimeout(timeout);
      removeRoom();
      emit('open');
    };
    ch.onclose = lost;
    ch.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (N.onMessage) N.onMessage(m);
    };
  }

  function newConnection() {
    const c = new RTCPeerConnection({ iceServers: ICE });
    c.onconnectionstatechange = () => {
      if (c !== pc) return;
      const s = c.connectionState;
      if (s === 'failed' || s === 'closed') { if (N.open) lost(); else emit('failed'); }
    };
    // Si en 25 s no hay conexión, se avisa (redes que no permiten conexión directa).
    timeout = setTimeout(() => { if (!N.open && c === pc) emit('failed'); }, 25000);
    return c;
  }

  function removeRoom() {
    if (unwatch) { try { unwatch(); } catch (e) { /* nada */ } unwatch = null; }
    if (roomLive && N.role === 'host' && N.code && signal) signal.remove(N.code).catch(() => {});
    roomLive = false;
  }

  function close() {
    clearTimeout(timeout);
    removeRoom();
    const wasOpen = N.open;
    N.open = false;
    if (ch) { ch.onclose = null; try { ch.close(); } catch (e) { /* nada */ } }
    if (pc) { try { pc.close(); } catch (e) { /* nada */ } }
    pc = null; ch = null;
    N.role = null; N.code = null;
    return wasOpen;
  }

  // Anfitrión: crea la sala y espera la respuesta del invitado.
  N.host = async sig => {
    close();
    signal = sig; N.role = 'host';
    const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    const conn = pc = newConnection();
    setupChannel(conn.createDataChannel('game', { ordered: true }));
    await conn.setLocalDescription(await conn.createOffer());
    await waitIce(conn);
    if (conn !== pc) return null;
    await sig.create(code, { offer: JSON.stringify(conn.localDescription) });
    N.code = code; roomLive = true;
    emit('waiting', code);
    unwatch = sig.watch(code, async (room, err) => {
      if (err) { emit('error', err); return; }
      if (room && room.answer && conn === pc && !conn.currentRemoteDescription) {
        try { await conn.setRemoteDescription(JSON.parse(room.answer)); emit('connecting'); }
        catch (e) { emit('error', e); }
      }
    });
    return code;
  };

  // Invitado: lee la oferta de la sala y deja su respuesta.
  N.join = async (sig, code) => {
    close();
    signal = sig; N.role = 'guest';
    const room = await sig.get(code);
    if (!room || !room.offer) throw Object.assign(new Error('No existe esa sala'), { code: 'room/not-found' });
    if (room.answer) throw Object.assign(new Error('Sala llena'), { code: 'room/full' });
    const conn = pc = newConnection();
    conn.ondatachannel = e => setupChannel(e.channel);
    await conn.setRemoteDescription(JSON.parse(room.offer));
    await conn.setLocalDescription(await conn.createAnswer());
    await waitIce(conn);
    if (conn !== pc) return;
    await sig.answer(code, JSON.stringify(conn.localDescription));
    N.code = code;
    emit('connecting');
  };

  N.send = m => {
    if (!N.open || !ch || ch.readyState !== 'open') return false;
    // Si el canal va saturado, se descartan instantáneas (llegará la siguiente).
    if (m.t === 's' && ch.bufferedAmount > 512 * 1024) return false;
    try { ch.send(JSON.stringify(m)); return true; } catch (e) { return false; }
  };
  N.close = close;
  return N;
})();
