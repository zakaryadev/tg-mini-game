# Ludo — Telegram Mini App

Telegram ichida ishlaydigan onlayn Ludo (2–4 o'yinchi, botlar, tasodifiy raqib, do'stlarni havola bilan taklif qilish).

- **Mijoz:** Vite + oddiy JavaScript (~65 KB, kutubxonasiz), 3D zar, har bir o'yinchi uchun o'z rangi pastki-chapda turadigan taxta.
- **Server:** Node.js + Express + Socket.IO. Barcha qoidalar va tasodifiy zar **serverda** (aldab bo'lmaydi).
- **Telegram:** `initData` HMAC bilan tekshiriladi, havola orqali xonaga kirish (`startapp`), ulashish, tebranish (haptic).

## Tuzilma

```
shared/rules.js        taxta geometriyasi va konstantalar (server va mijoz uchun umumiy)
server/src/engine.js   sof o'yin qoidalari (urish, xavfsiz kataklar, 6 va 3 ta oltilik, g'alaba)
server/src/bot.js      bot strategiyasi
server/src/rooms.js    xonalar, navbat taymeri, matchmaking, qayta ulanish
server/src/telegram.js initData tekshiruvi
server/src/index.js    HTTP + Socket.IO
client/                Vite ilova (bosh menyu, xona, o'yin)
```

## Qoidalar

- Tokenni uydan chiqarish uchun **6** kerak. 6 tushsa yana zar tashlanadi; ketma-ket **3 ta 6** navbatni yoqotadi.
- Raqib tokenini urish yoki tokenni uyga olib kirish ham qo'shimcha navbat beradi.
- Boshlang'ich kataklar va yulduzchali kataklar **xavfsiz** (urib bo'lmaydi).
- Uyga kirish uchun **aniq son** kerak.
- Navbatda 25 soniya; ikki marta o'tkazib yuborilsa, o'yinchi o'rniga bot o'ynaydi. Ulanish uzilsa ham o'yin to'xtamaydi, qayta ulangach holat tiklanadi.
- O'yin n−1 o'yinchi tugatganda yakunlanadi.

## Mahalliy ishga tushirish

```bash
npm install
npm run dev
```

Brauzerda ikkita oyna oching (har bir oynada alohida foydalanuvchi bo'lishi uchun):

- http://localhost:5173/?name=Ali&uid=a
- http://localhost:5173/?name=Vali&uid=b

Bot token bo'lmasa, faqat shu "dev-kirish" ishlaydi (production'da avtomatik o'chiq).

## Telegramga ulash

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token oling.
2. Ilovani **HTTPS** manzilga joylang (server `client/dist` ni o'zi uzatadi, WebSocket ochiq bo'lishi kerak):
   ```bash
   cp .env.example .env   # BOT_TOKEN, BOT_USERNAME, APP_SHORT_NAME ni to'ldiring, NODE_ENV=production
   npm run build
   npm start
   ```
   Sinov uchun `cloudflared tunnel --url http://localhost:3001` yoki `ngrok http 3001` ishlatish mumkin.
3. BotFather → `/newapp` → botni tanlang → Web App URL: sizning HTTPS manzilingiz, qisqa nomni (`APP_SHORT_NAME`) kiriting.
4. Taklif havolasi: `https://t.me/<BOT_USERNAME>/<APP_SHORT_NAME>?startapp=<KOD>`. Do'st bosganda xonaga o'zi kiradi.

## Testlar

```bash
npm test
```

Dvigatel (qoidalar, 2/3/4 kishilik bot o'yinlari oxirigacha), Telegram imzo tekshiruvi va Socket.IO orqali to'liq o'yin (xona, matchmaking, uzilish va qayta ulanish, aldashga urinishlar) tekshiriladi.

## Cheklovlar (hozircha)

- Holat serverning xotirasida: server qayta ishga tushsa, faol o'yinlar yo'qoladi. Bitta server nusxasi uchun mo'ljallangan (bir nechta nusxa uchun Redis adapteri va saqlash kerak).
- Reyting, tanga, do'kon, ovoz yo'q.
- Bloklar (ikki token bitta katakda) qoidasi yo'q: bir katakdagi barcha raqib tokenlari uriladi.
