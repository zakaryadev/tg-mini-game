// Telegram Bot API: menyu tugmasi, /start buyrug'i va "O'ynash" tugmasi bilan javob.
// Havola: https://t.me/<bot>?start=<XONA_KODI> — Mini App BotFather'da /newapp qilinmagan bo'lsa ham ishlaydi.
const API = 'https://api.telegram.org';

export class TelegramBot {
  constructor(token, publicUrl, log = console) {
    this.token = token;
    this.publicUrl = publicUrl.replace(/\/$/, '');
    this.log = log;
    this.running = false;
    this.username = '';
  }

  async api(method, body = {}, signal) {
    const res = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`${method}: ${data.description || res.status}`);
    return data.result;
  }

  async setup() {
    const me = await this.api('getMe');
    this.username = me.username;
    await this.api('deleteWebhook'); // getUpdates uchun
    await this.api('setMyCommands', { commands: [{ command: 'start', description: 'Ludo o\'yinini ochish' }] });
    await this.api('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'O\'ynash', web_app: { url: this.publicUrl } }
    });
    return me;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    this.loop();
  }

  stop() { this.running = false; this.abort?.abort(); }

  async loop() {
    let offset = 0;
    while (this.running) {
      try {
        const updates = await this.api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, this.abort.signal);
        for (const u of updates) {
          offset = u.update_id + 1;
          await this.onMessage(u.message).catch((e) => this.log.error('bot:', e.message));
        }
      } catch (e) {
        if (!this.running) return;
        this.log.error('bot poll:', e.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async onMessage(m) {
    if (!m?.text || !m.text.startsWith('/start')) return;
    const code = (m.text.split(/\s+/)[1] || '').toUpperCase();
    const valid = /^[A-Z2-9]{6}$/.test(code);
    const url = valid ? `${this.publicUrl}/?room=${code}` : this.publicUrl;
    await this.api('sendMessage', {
      chat_id: m.chat.id,
      text: valid ? `Ludo xonasiga taklif: ${code}\nQo'shilish uchun tugmani bosing.` : 'Ludo o\'ynashga tayyormisiz? Tugmani bosing.',
      reply_markup: { inline_keyboard: [[{ text: valid ? 'Xonaga qo\'shilish' : 'O\'ynash', web_app: { url } }]] }
    });
  }
}
