import { io } from 'socket.io-client';

export const tg = window.Telegram?.WebApp;
const hasTelegram = !!(tg && tg.initData);

function devIdentity() {
  const q = new URLSearchParams(location.search);
  let id = q.get('uid') || sessionStorage.getItem('dev_uid');
  if (!id) { id = Math.random().toString(36).slice(2, 8); }
  sessionStorage.setItem('dev_uid', id);
  const name = q.get('name') || sessionStorage.getItem('dev_name') || 'Mehmon ' + id.slice(0, 3);
  sessionStorage.setItem('dev_name', name);
  return { id, name };
}

export function connect() {
  const auth = hasTelegram ? { initData: tg.initData } : { dev: devIdentity() };
  return io({ auth, transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
}

export function emit(socket, event, payload = {}) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'offline' });
    const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000);
    socket.emit(event, payload, (res) => { clearTimeout(t); resolve(res || { ok: false }); });
  });
}

export async function loadConfig() {
  try { return await (await fetch('/api/config')).json(); } catch { return {}; }
}

export function inviteLink(cfg, code) {
  if (cfg.botUsername && cfg.appShortName) return `https://t.me/${cfg.botUsername}/${cfg.appShortName}?startapp=${code}`;
  if (cfg.botUsername) return `https://t.me/${cfg.botUsername}?startapp=${code}`;
  return `${location.origin}/?room=${code}`;
}

export function shareInvite(link) {
  const text = 'Ludo o\'ynaymizmi? Xonaga qo\'shiling!';
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    return Promise.resolve('telegram');
  }
  if (navigator.share) return navigator.share({ text, url: link }).then(() => 'share').catch(() => 'cancel');
  return navigator.clipboard?.writeText(link).then(() => 'copied').catch(() => 'fail') || Promise.resolve('fail');
}

export const haptic = {
  impact: (s = 'light') => tg?.HapticFeedback?.impactOccurred?.(s),
  notify: (t = 'success') => tg?.HapticFeedback?.notificationOccurred?.(t)
};
