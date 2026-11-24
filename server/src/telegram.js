// Telegram Mini App initData tekshiruvi:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import crypto from 'node:crypto';

/**
 * @param {string} initData  Telegram.WebApp.initData (query-string ko'rinishida)
 * @param {string} botToken
 * @param {number} maxAgeSec  initData qancha vaqt amal qiladi
 * @returns {{id:string,name:string,photo?:string,startParam?:string}|null}
 */
export function validateInitData(initData, botToken, maxAgeSec = 24 * 3600, now = Date.now()) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const a = Buffer.from(calc, 'hex');
  let b;
  try { b = Buffer.from(hash, 'hex'); } catch { return null; }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || !user.id) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'O\'yinchi';
  return {
    id: 'tg:' + user.id,
    name: String(name).slice(0, 24),
    photo: user.photo_url,
    startParam: params.get('start_param') || undefined
  };
}

/** Sinov uchun to'g'ri imzolangan initData yasaydi */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return params.toString();
}
