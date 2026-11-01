/* Флоп: вход через Telegram и хранение прогресса.
   Яндекс Облако → Cloud Functions, среда Node.js 18+, точка входа index.handler.
   Данные лежат в бакете Object Storage: users/<telegram id>.json и коды входа login/<код>.json.
   Переменные окружения:
     BUCKET          имя бакета
     BOT_NAME        имя бота без @, например flop_login_bot
     WEBHOOK_SECRET  любая длинная случайная строка (её же передаёшь в setWebhook)
     SESSION_SECRET  другая длинная случайная строка (подпись токенов входа)
     ALLOWED_ORIGINS (необязательно) сайты, которым можно ходить в функцию, через запятую
     BOT_TOKEN       токен бота от BotFather — нужен для ежедневных напоминаний
   У функции должен быть сервисный аккаунт с ролью storage.editor на бакет.
   Напоминания: триггер-таймер раз в день вызывает эту же функцию (см. инструкцию). */
'use strict';
const crypto = require('crypto');

const BUCKET = process.env.BUCKET;
const BOT = process.env.BOT_NAME;
const WH_SECRET = process.env.WEBHOOK_SECRET || '';
const SESS = process.env.SESSION_SECRET || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SITE = 'https://poker-trener.ru/';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://poker-trener.ru,https://www.poker-trener.ru,https://omekhin.github.io,http://localhost:8765').split(',').map(s => s.trim());
const CODE_TTL = 10 * 60 * 1000;            // код входа живёт 10 минут
const TOKEN_TTL = 180 * 24 * 3600 * 1000;   // вход помнится полгода
const MAX_BODY = 3 * 1024 * 1024;

/* ---------- Object Storage через IAM-токен сервисного аккаунта функции ---------- */
async function iam(ctx) {
  const t = ctx && ctx.token;
  if (t && (t.access_token || typeof t === 'string')) return t.access_token || t;
  const r = await fetch('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  return (await r.json()).access_token;
}
async function s3(ctx, method, key, body) {
  const headers = { Authorization: 'Bearer ' + await iam(ctx) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`https://storage.yandexcloud.net/${BUCKET}/${key}`, { method, headers, body });
  if (method === 'GET' && r.status === 404) return null;
  if (!r.ok) throw new Error(`storage ${method} ${key}: ${r.status} ${await r.text()}`);
  return method === 'GET' ? r.json() : true;
}

/* ---------- токены: base64url(json).подпись ---------- */
const b64u = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SESS).update(s).digest('base64url');
function makeToken(p) { const body = b64u(JSON.stringify(p)); return body + '.' + sign(body); }
function readToken(t) {
  if (!t || typeof t !== 'string') return null;
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}

/* ---------- HTTP-помощники ---------- */
const hdr = (ev, name) => { const h = ev.headers || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? h[k] : ''; };
function cors(ev) {
  const o = hdr(ev, 'origin');
  return o && ORIGINS.includes(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Content-Type, X-Flop-Auth', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' } : {};
}
const json = (ev, code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(ev) }, body: JSON.stringify(obj) });
function bodyOf(ev) { if (!ev.body) return ''; return ev.isBase64Encoded ? Buffer.from(ev.body, 'base64').toString() : ev.body; }
const validCode = c => typeof c === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(c);

/* ---------- Telegram: бот получает /start <код> ---------- */
async function telegram(ev, ctx) {
  if (!WH_SECRET || hdr(ev, 'x-telegram-bot-api-secret-token') !== WH_SECRET) return { statusCode: 403, body: 'forbidden' };
  let u; try { u = JSON.parse(bodyOf(ev)); } catch (e) { return { statusCode: 200, body: '' }; }
  const m = u.message; if (!m || !m.from || typeof m.text !== 'string') return { statusCode: 200, body: '' };
  const reply = text => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'sendMessage', chat_id: m.chat.id, text }) });
  const f = m.from, uid = String(f.id);
  if (/^\/stop\b/.test(m.text)) {
    await s3(ctx, 'PUT', `prefs/${uid}.json`, JSON.stringify({ off: true, t: Date.now() }));
    return reply('Ок, напоминания выключены. Включить снова — /remind');
  }
  if (/^\/remind\b/.test(m.text)) {
    await s3(ctx, 'DELETE', `prefs/${uid}.json`);
    return reply('Напоминания включены: раз в день вечером, если цель дня ещё не выполнена. Выключить — /stop');
  }
  const code = (m.text.match(/^\/start\s+(\S+)/) || [])[1];
  if (!validCode(code)) return reply('Это бот сайта poker-trener.ru. Нажми «Войти» на сайте — бот пришлёт подтверждение сюда.\n\nРаз в день вечером я напоминаю про серию, если цель дня не выполнена. /stop — выключить, /remind — включить.');
  const name = [f.first_name, f.last_name].filter(Boolean).join(' ').slice(0, 60) || (f.username ? '@' + f.username : 'Игрок');
  await s3(ctx, 'PUT', `login/${code}.json`, JSON.stringify({ uid: String(f.id), name, username: f.username || null, t: Date.now() }));
  return reply(`Готово, ${f.first_name || 'вход выполнен'}! Возвращайся на сайт — прогресс теперь сохраняется в аккаунте.\n\nРаз в день вечером напомню про серию, если цель дня ещё не выполнена. Не нужно — напиши /stop`);
}

/* ---------- ежедневное напоминание ---------- */
function mskDay(offset) { const d = new Date(Date.now() + 3 * 3600 * 1000 + (offset || 0) * 86400000); return d.toISOString().slice(0, 10); }
const plural = (n, f) => { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return f[2]; if (n1 > 1 && n1 < 5) return f[1]; if (n1 === 1) return f[0]; return f[2]; };
function streakInfo(data) {
  let days = {}; try { days = JSON.parse(data.flop_days || '{}') || {}; } catch (e) {}
  const goal = +data.flop_goal || 20, tot = o => o ? (o.h || 0) + (o.o || 0) + (o.p || 0) : 0;
  const today = tot(days[mskDay(0)]);
  let streak = 0; for (let i = 1; i < 400 && tot(days[mskDay(-i)]) >= goal; i++) streak++;   // серия до вчера включительно
  let lastActive = -1; for (let i = 0; i < 15; i++) if (tot(days[mskDay(-i)]) > 0) { lastActive = i; break; }
  return { goal, today, streak, lastActive };
}
async function listKeys(ctx, prefix) {
  const keys = []; let token = '';
  do {
    const r = await fetch(`https://storage.yandexcloud.net/${BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? '&continuation-token=' + encodeURIComponent(token) : ''}`, { headers: { Authorization: 'Bearer ' + await iam(ctx) } });
    const x = await r.text(); if (!r.ok) throw new Error('list ' + r.status + ' ' + x);
    for (const m of x.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
    token = /<IsTruncated>true<\/IsTruncated>/.test(x) ? ((x.match(/<NextContinuationToken>([^<]+)</) || [])[1] || '') : '';
  } while (token);
  return keys;
}
async function remind(ctx) {
  if (!BOT_TOKEN) return { sent: 0, error: 'no BOT_TOKEN' };
  const users = await listKeys(ctx, 'users/'); let sent = 0, skipped = 0;
  for (const key of users) {
    const uid = key.replace(/^users\//, '').replace(/\.json$/, '');
    try {
      if (await s3(ctx, 'GET', `prefs/${uid}.json`)) { skipped++; continue; }      // выключил /stop
      const rec = await s3(ctx, 'GET', key); if (!rec || !rec.data) continue;
      const s = streakInfo(rec.data);
      if (s.today >= s.goal || s.lastActive < 0 || s.lastActive > 7) { skipped++; continue; }  // цель выполнена или давно не заходил
      const left = s.goal - s.today;
      const text = s.streak > 0
        ? `🔥 Серия ${s.streak} ${plural(s.streak, ['день', 'дня', 'дней'])} подряд — не прерви её! Сегодня осталось ${left} ${plural(left, ['очко', 'очка', 'очков'])}: раздачи за столом или задачи на пуш/фолд.`
        : `Сегодня ещё без тренировки. ${s.goal} ${plural(s.goal, ['очко', 'очка', 'очков'])} — и начнётся новая серия дней. Это минут 10.`;
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: uid, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: 'Открыть тренажёр', url: SITE + 'play.html?utm_source=bot&utm_medium=reminder' }], [{ text: 'Пуш/фолд — 5 минут', url: SITE + 'pushfold.html?utm_source=bot&utm_medium=reminder' }]] } }) });
      if (r.ok) sent++; else { const t = await r.text(); console.warn('send', uid, r.status, t); if (r.status === 403) await s3(ctx, 'PUT', `prefs/${uid}.json`, JSON.stringify({ off: true, blocked: true, t: Date.now() })); }
      await new Promise(res => setTimeout(res, 60));
    } catch (e) { console.error('remind', uid, e); }
  }
  console.log('remind done', { users: users.length, sent, skipped });
  return { users: users.length, sent, skipped };
}

/* ---------- рейтинг: ники и таблица lb/board.json ---------- */
function weekStart() {                         // понедельник 00:00 по Москве, в мс UTC
  const d = new Date(Date.now() + 3 * 3600 * 1000); const dow = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - 3 * 3600 * 1000;
}
function summary(data) {
  let st = null; try { st = JSON.parse(data.flop_stats || 'null'); } catch (e) {}
  const ss = (st && Array.isArray(st.sessions)) ? st.sessions : [], ws = weekStart();
  const r = { cashAll: 0, cashWeek: 0, winsAll: 0, winsWeek: 0, toursAll: 0, toursWeek: 0, week: ws };
  for (const x of ss) {
    const t = x.end || x.start || 0, wk = t >= ws;
    if (x.mode === 'cash') { const n = Math.max(-100000, Math.min(100000, Math.round(+x.net || 0))); r.cashAll += n; if (wk) r.cashWeek += n; }
    if (x.mode === 'tour' && x.place) { r.toursAll++; if (wk) r.toursWeek++; if (x.place === 1) { r.winsAll++; if (wk) r.winsWeek++; } }
  }
  return r;
}
const NICK_RE = /^[A-Za-zА-Яа-яЁё0-9_\- ]{3,16}$/;
async function board(ctx) { return (await s3(ctx, 'GET', 'lb/board.json')) || {}; }
async function updateBoard(ctx, uid, patch) {
  const b = await board(ctx);
  if (patch === null) delete b[uid]; else b[uid] = Object.assign({}, b[uid] || {}, patch, { t: Date.now() });
  await s3(ctx, 'PUT', 'lb/board.json', JSON.stringify(b));
}
function top(b, me) {
  const ws = weekStart(), rows = Object.entries(b).filter(([, v]) => v.nick);
  const make = (val, filt) => {
    const list = rows.map(([uid, v]) => ({ uid, nick: v.nick, v: val(v), n: v })).filter(filt).sort((a, c) => c.v - a.v);
    const out = list.slice(0, 50).map((x, i) => ({ p: i + 1, nick: x.nick, v: x.v, me: x.uid === me, tours: x.n.toursAll }));
    const mi = list.findIndex(x => x.uid === me);
    return { rows: out, mine: mi >= 0 ? { p: mi + 1, v: list[mi].v } : null, total: list.length };
  };
  const wk = v => v.week === ws;
  return {
    cashAll: make(v => v.cashAll || 0, x => x.n.cashAll),
    cashWeek: make(v => wk(v) ? v.cashWeek || 0 : 0, x => wk(x.n) && x.n.cashWeek),
    winsAll: make(v => v.winsAll || 0, x => x.n.winsAll > 0),
    winsWeek: make(v => wk(v) ? v.winsWeek || 0 : 0, x => wk(x.n) && x.n.winsWeek > 0)
  };
}

/* ---------- основной обработчик ---------- */
module.exports.handler = async function (ev, ctx) {
  try {
    if (ev.messages && ev.messages[0] && ev.messages[0].event_metadata && /Timer/i.test(ev.messages[0].event_metadata.event_type || '')) {
      return { statusCode: 200, body: JSON.stringify(await remind(ctx)) };      // вызов от триггера-таймера
    }
    if (ev.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(ev), body: '' };
    const q = ev.queryStringParameters || {};
    const a = q.a || '';
    if (a === 'tg') return await telegram(ev, ctx);
    if (a === 'remind') {                      // ручная проверка напоминаний: ?a=remind&key=WEBHOOK_SECRET
      if (!WH_SECRET || q.key !== WH_SECRET) return json(ev, 403, { error: 'forbidden' });
      return json(ev, 200, await remind(ctx));
    }
    if (!BUCKET || !BOT || SESS.length < 16) return json(ev, 500, { error: 'not_configured' });

    if (a === 'start') {                       // сайт просит код входа
      const code = crypto.randomBytes(18).toString('base64url');
      return json(ev, 200, { code, link: `https://t.me/${BOT}?start=${code}`, bot: BOT });
    }
    if (a === 'poll') {                        // сайт ждёт, пока человек нажмёт Start в боте
      if (!validCode(q.code)) return json(ev, 400, { error: 'bad_code' });
      const rec = await s3(ctx, 'GET', `login/${q.code}.json`);
      if (!rec) return json(ev, 200, { wait: true });
      await s3(ctx, 'DELETE', `login/${q.code}.json`);
      if (Date.now() - rec.t > CODE_TTL) return json(ev, 200, { expired: true });
      const token = makeToken({ uid: rec.uid, name: rec.name, u: rec.username, exp: Date.now() + TOKEN_TTL });
      return json(ev, 200, { token, name: rec.name, username: rec.username });
    }

    const auth = readToken(hdr(ev, 'x-flop-auth') || q.t || (hdr(ev, 'authorization') || '').replace(/^Bearer\s+/i, ''));
    if (a === 'top') return json(ev, 200, top(await board(ctx), auth && auth.uid));   // рейтинг виден всем
    if (!auth) return json(ev, 401, { error: 'unauthorized' });
    const key = `users/${auth.uid}.json`;

    if (a === 'me') {
      const meta = await s3(ctx, 'GET', `meta/${auth.uid}.json`);
      return json(ev, 200, { name: auth.name, nick: meta && meta.nick || null });
    }
    if (a === 'nick' && ev.httpMethod === 'POST') {
      let p; try { p = JSON.parse(bodyOf(ev)); } catch (e) { return json(ev, 400, { error: 'bad_json' }); }
      const nick = String(p.nick || '').trim().replace(/\s+/g, ' ');
      if (!NICK_RE.test(nick)) return json(ev, 400, { error: 'bad_nick' });
      const b = await board(ctx);
      if (Object.entries(b).some(([uid, v]) => uid !== auth.uid && v.nick && v.nick.toLowerCase() === nick.toLowerCase())) return json(ev, 409, { error: 'taken' });
      await s3(ctx, 'PUT', `meta/${auth.uid}.json`, JSON.stringify({ nick }));
      const rec = await s3(ctx, 'GET', key);
      await updateBoard(ctx, auth.uid, Object.assign({ nick }, rec && rec.data ? summary(rec.data) : {}));
      return json(ev, 200, { ok: true, nick });
    }
    if (a === 'load') {
      const rec = await s3(ctx, 'GET', key);
      return json(ev, 200, rec || { data: {}, updated: 0 });
    }
    if (a === 'save' && ev.httpMethod === 'POST') {
      const raw = bodyOf(ev);
      if (raw.length > MAX_BODY) return json(ev, 413, { error: 'too_big' });
      let p; try { p = JSON.parse(raw); } catch (e) { return json(ev, 400, { error: 'bad_json' }); }
      if (!p || typeof p.data !== 'object') return json(ev, 400, { error: 'bad_data' });
      const rec = { uid: auth.uid, name: auth.name, data: p.data, updated: Date.now() };
      await s3(ctx, 'PUT', key, JSON.stringify(rec));
      try { const meta = await s3(ctx, 'GET', `meta/${auth.uid}.json`); if (meta && meta.nick) await updateBoard(ctx, auth.uid, Object.assign({ nick: meta.nick }, summary(p.data))); } catch (e) { console.error('board', e); }
      return json(ev, 200, { ok: true, updated: rec.updated });
    }
    if (a === 'delete' && ev.httpMethod === 'POST') {
      await s3(ctx, 'DELETE', key);
      await s3(ctx, 'DELETE', `meta/${auth.uid}.json`);
      await updateBoard(ctx, auth.uid, null);
      return json(ev, 200, { ok: true });
    }
    return json(ev, 404, { error: 'unknown_action' });
  } catch (e) {
    console.error(e);
    return json(ev, 500, { error: 'server' });
  }
};
