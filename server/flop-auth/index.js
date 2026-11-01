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
/* ---------- Telegram без вебхука: функция сама забирает сообщения бота (входящие запросы из Telegram в РФ тормозят) ---------- */
let lastPull = 0;
async function tgApi(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
async function botReply(ctx, m) {
  if (!m || !m.from || typeof m.text !== 'string') return null;
  const f = m.from, uid = String(f.id), say = text => ({ chat_id: m.chat.id, text });
  if (/^\/stop\b/.test(m.text)) { await s3(ctx, 'PUT', `prefs/${uid}.json`, JSON.stringify({ off: true, t: Date.now() })); return say('Ок, напоминания выключены. Включить снова — /remind'); }
  if (/^\/remind\b/.test(m.text)) { await s3(ctx, 'DELETE', `prefs/${uid}.json`); return say('Напоминания включены: раз в день вечером, если цель дня ещё не выполнена. Выключить — /stop'); }
  const code = (m.text.match(/^\/start\s+(\S+)/) || [])[1];
  if (!validCode(code)) return say('Это бот сайта poker-trener.ru. Нажми «Войти» на сайте — бот пришлёт подтверждение сюда.\n\nРаз в день вечером я напоминаю про серию, если цель дня не выполнена. /stop — выключить, /remind — включить.');
  const name = [f.first_name, f.last_name].filter(Boolean).join(' ').slice(0, 60) || (f.username ? '@' + f.username : 'Игрок');
  await s3(ctx, 'PUT', `login/${code}.json`, JSON.stringify({ uid, name, username: f.username || null, t: Date.now() }));
  return say(`Готово, ${f.first_name || 'вход выполнен'}! Возвращайся на сайт — прогресс теперь сохраняется в аккаунте.\n\nРаз в день вечером напомню про серию, если цель дня ещё не выполнена. Не нужно — напиши /stop`);
}
async function pullTelegram(ctx) {
  if (!BOT_TOKEN || Date.now() - lastPull < 1500) return 0;
  lastPull = Date.now();
  const st = (await s3(ctx, 'GET', 'tg/offset.json')) || { o: 0 };
  let r = await tgApi('getUpdates', { offset: st.o, timeout: 0, allowed_updates: ['message'] });
  if (r && r.error_code === 409) { await tgApi('deleteWebhook', { drop_pending_updates: false }); r = await tgApi('getUpdates', { offset: st.o, timeout: 0, allowed_updates: ['message'] }); }
  if (!r || !r.ok || !r.result.length) return 0;
  let max = st.o - 1;
  for (const u of r.result) { max = Math.max(max, u.update_id); try { const msg = await botReply(ctx, u.message); if (msg) await tgApi('sendMessage', msg); } catch (e) { console.error('bot', e); } }
  await s3(ctx, 'PUT', 'tg/offset.json', JSON.stringify({ o: max + 1 }));
  return r.result.length;
}

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
  try { lastPull = 0; await pullTelegram(ctx); } catch (e) { console.error('pull', e); }
  const users = await listKeys(ctx, 'users/'); let sent = 0, skipped = 0;
  for (const key of users) {
    const uid = key.replace(/^users\//, '').replace(/\.json$/, '');
    if (!/^\d+$/.test(uid)) continue;                                   // напоминания только тем, кто входил через Telegram
    try {
      if (!/^\d+$/.test(uid)) { skipped++; continue; }                               // вошёл не через Telegram — писать некуда
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

/* ---------- «Поделиться»: своя ссылка с картинкой результата для превью в Telegram ---------- */
const SITE_URL = 'https://poker-trener.ru/';
const escH = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function s3bin(ctx, method, key, buf, type) {
  const headers = { Authorization: 'Bearer ' + await iam(ctx) };
  if (buf) headers['Content-Type'] = type;
  const r = await fetch(`https://storage.yandexcloud.net/${BUCKET}/${key}`, { method, headers, body: buf });
  if (method === 'GET' && r.status === 404) return null;
  if (!r.ok) throw new Error(`storage ${method} ${key}: ${r.status}`);
  return method === 'GET' ? Buffer.from(await r.arrayBuffer()) : true;
}
function selfUrl(ctx) { return process.env.PUBLIC_URL || (ctx && ctx.functionName ? `https://functions.yandexcloud.net/${ctx.functionName}` : 'https://functions.yandexcloud.net/d4ec4fhnffjodos3c9ki'); }
async function shareCard(ev, ctx) {
  let p; try { p = JSON.parse(bodyOf(ev)); } catch (e) { return json(ev, 400, { error: 'bad_json' }); }
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(p && p.img || '');
  if (!m) return json(ev, 400, { error: 'bad_img' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 600 * 1024 || buf[0] !== 0xFF || buf[1] !== 0xD8) return json(ev, 400, { error: 'bad_img' });
  const id = crypto.randomBytes(6).toString('base64url');
  const meta = { t: String(p.t || 'Мой результат').slice(0, 90), d: String(p.d || '').slice(0, 200), k: String(p.k || 'card').replace(/[^a-z_]/g, '').slice(0, 20), at: Date.now() };
  await s3bin(ctx, 'PUT', `s/${id}.jpg`, buf, 'image/jpeg');
  await s3(ctx, 'PUT', `s/${id}.json`, JSON.stringify(meta));
  return json(ev, 200, { id, url: `${selfUrl(ctx)}?s=${id}` });
}
async function sharePage(ev, ctx, id) {
  const meta = await s3(ctx, 'GET', `s/${id}.json`);
  const dest = SITE_URL + '?utm_source=share&utm_medium=' + encodeURIComponent((meta && meta.k) || 'card');
  const t = meta ? meta.t : 'Флоп — покерный тренажёр с тренером';
  const d = meta && meta.d ? meta.d : 'Бесплатный покерный тренажёр: стол на 9 игроков, тренер объясняет каждое решение.';
  const img = meta ? `${selfUrl(ctx)}?si=${id}` : SITE_URL + 'og.png';
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(t)} — Флоп</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Флоп"><meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${escH(t)}"><meta property="og:description" content="${escH(d)}">
<meta property="og:image" content="${escH(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escH(img)}">
<meta http-equiv="refresh" content="0;url=${escH(dest)}"></head><body style="font-family:system-ui;padding:24px"><p><a href="${escH(dest)}">Открыть Флоп — покерный тренажёр</a></p><script>location.replace(${JSON.stringify(dest)})</script></body></html>`;
  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body: html };
}
async function shareImage(ev, ctx, id) {
  const buf = await s3bin(ctx, 'GET', `s/${id}.jpg`);
  if (!buf) return { statusCode: 302, headers: { Location: SITE_URL + 'og.png' }, body: '' };
  return { statusCode: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }, body: buf.toString('base64'), isBase64Encoded: true };
}

/* ---------- вход через Яндекс ID: сайт присылает токен, проверяем его у Яндекса ---------- */
async function yaLogin(ev) {
  let p; try { p = JSON.parse(bodyOf(ev)); } catch (e) { return json(ev, 400, { error: 'bad_json' }); }
  const tok = String(p && p.token || '');
  if (!/^[A-Za-z0-9_.\-]{20,500}$/.test(tok)) return json(ev, 400, { error: 'bad_token' });
  const r = await fetch('https://login.yandex.ru/info?format=json', { headers: { Authorization: 'OAuth ' + tok } });
  if (!r.ok) return json(ev, 401, { error: 'yandex_rejected' });
  const u = await r.json();
  const want = process.env.YA_CLIENT_ID || '';
  if (want && u.client_id && u.client_id !== want) return json(ev, 401, { error: 'wrong_client' });
  const uid = 'y' + String(u.id);
  const name = String(u.first_name || u.display_name || u.real_name || u.login || 'Игрок').slice(0, 60);
  return json(ev, 200, { token: makeToken({ uid, name, u: null, exp: Date.now() + TOKEN_TTL }), name });
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
    if (a === 'diag') {                        // проверка, как быстро Telegram доставляет сообщения боту
      const t0 = Date.now(); let w = {}; try { w = ((await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)).json()).result) || {}; } catch (e) { w = { err: String(e) }; }
      return json(ev, 200, { tgMs: Date.now() - t0, pending: w.pending_update_count, lastErrorAgoSec: w.last_error_date ? Math.round(Date.now() / 1000 - w.last_error_date) : null, lastError: w.last_error_message || null, err: w.err || null });
    }
    if (a === 'ya' && ev.httpMethod === 'POST') {    // вход через Яндекс ID
      let p; try { p = JSON.parse(bodyOf(ev)); } catch (e) { return json(ev, 400, { error: 'bad_json' }); }
      const r = await fetch('https://login.yandex.ru/info?format=json', { headers: { Authorization: 'OAuth ' + String(p && p.token || '') } });
      if (!r.ok) return json(ev, 401, { error: 'ya_denied' });
      const u = await r.json(); if (!u || !u.id) return json(ev, 401, { error: 'ya_denied' });
      const name = String(u.first_name || u.display_name || u.real_name || u.login || 'Игрок').slice(0, 60);
      const token = makeToken({ uid: 'ya' + u.id, name, u: null, exp: Date.now() + TOKEN_TTL });
      return json(ev, 200, { token, name });
    }
    const sid = typeof q.s === 'string' && /^[A-Za-z0-9_-]{6,12}$/.test(q.s) ? q.s : null, siid = typeof q.si === 'string' && /^[A-Za-z0-9_-]{6,12}$/.test(q.si) ? q.si : null;
    if (sid) return await sharePage(ev, ctx, sid);
    if (siid) return await shareImage(ev, ctx, siid);
    if (a === 'card' && ev.httpMethod === 'POST') return await shareCard(ev, ctx);
    if (a === 'ya' && ev.httpMethod === 'POST') return await yaLogin(ev);
    if (a === 'tg') return await telegram(ev, ctx);
    if (a === 'tgping') { const t0 = Date.now(); let me = null, wh = null; try { me = (await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`)).json()).ok; } catch (e) { me = 'ERR ' + e.message; } const t1 = Date.now(); try { const w = (await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)).json()).result || {}; wh = { pending: w.pending_update_count, lastError: w.last_error_message || null, lastErrorAgoSec: w.last_error_date ? Math.round(Date.now() / 1000 - w.last_error_date) : null, maxConn: w.max_connections, ip: w.ip_address }; } catch (e) { wh = 'ERR ' + e.message; } return json(ev, 200, { me, getMeMs: t1 - t0, wh, whMs: Date.now() - t1 }); }
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
      let rec = await s3(ctx, 'GET', `login/${q.code}.json`);
      if (!rec) { try { if (await pullTelegram(ctx)) rec = await s3(ctx, 'GET', `login/${q.code}.json`); } catch (e) { console.error('pull', e); } }
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
