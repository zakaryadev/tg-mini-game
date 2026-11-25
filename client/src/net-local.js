// Offlayn (serversiz) rejim: server mantiqi (Rooms + engine + bot) brauzerning o'zida ishlaydi.
import { Rooms } from '../../server/src/rooms.js';

export const tg = undefined;

const later = (fn) => setTimeout(fn, 0);

export function connect() {
  const q = new URLSearchParams(location.search);
  let id = localStorage.getItem('ludo_uid');
  if (!id) { id = Math.random().toString(36).slice(2, 8); try { localStorage.setItem('ludo_uid', id); } catch {} }
  const user = { id: 'local:' + id, name: (q.get('name') || 'Siz').slice(0, 24) };

  const handlers = {};
  const fire = (ev, ...a) => (handlers[ev] || []).forEach((h) => h(...a));
  const socket = {
    connected: true,
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return socket; },
    join() {}, leave() {},
    emit(ev, payload, cb) {
      if (typeof payload === 'function') { cb = payload; payload = {}; }
      payload = payload || {};
      let res;
      try { res = routes[ev]?.(payload) ?? { ok: true }; } catch (e) { console.error(ev, e); res = { ok: false, error: 'server_error' }; }
      if (cb) later(() => cb(res));
    }
  };
  const io = { to: () => ({ emit: (ev, data) => later(() => fire(ev, data)) }) };
  const rooms = new Rooms(io);

  const routes = {
    'room:create': () => ({ ok: true, code: rooms.createRoom(user, socket).code }),
    'room:join': ({ code }) => rooms.join(user, code, socket),
    'room:addBot': () => rooms.addBot(user.id),
    'room:removeBot': ({ botId }) => rooms.removeBot(user.id, botId),
    'room:start': () => rooms.start(user.id),
    'room:rematch': () => rooms.rematch(user.id),
    'room:leave': () => { rooms.leave(user.id, socket); return { ok: true }; },
    'match:find': () => rooms.find(user, socket),
    'match:cancel': () => ({ ok: true, cancelled: rooms.dequeue(user.id) }),
    'game:vsBots': ({ bots }) => ({ ok: true, code: rooms.vsBots(user, socket, bots).code }),
    'game:roll': () => rooms.humanRoll(user.id),
    'game:move': ({ token }) => rooms.humanMove(user.id, Number(token))
  };

  later(() => { fire('connect'); fire('hello', { user }); });
  return socket;
}

export function emit(socket, event, payload = {}) {
  return new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res || { ok: false })));
}

export async function loadConfig() { return {}; }
export function inviteLink() { return location.href; }
export function shareInvite(link) {
  return navigator.clipboard?.writeText(link).then(() => 'copied').catch(() => 'fail') || Promise.resolve('fail');
}
export const haptic = { impact() {}, notify() {} };
