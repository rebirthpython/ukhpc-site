'use strict';
const crypto = require('node:crypto');
const { get, run } = require('./db');

const COOKIE = 'sid';
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 дней
const SECURE = process.env.COOKIE_SECURE === '1';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(value, maxAgeSec) {
  return [
    `${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`,
    SECURE ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + TTL_MS);
  return cookieHeader(token, TTL_MS / 1000);
}

function sessionUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.login, u.role, u.full_name, u.email, u.phone, u.group_id, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha(token),
  );
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
    return null;
  }
  delete row.expires_at;
  return row;
}

function destroySession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
  return cookieHeader('', 0);
}

function purgeExpired() {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}

// Простейшая защита от перебора паролей: не более 10 неудачных попыток за 15 минут с одного IP
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
function loginAllowed(ip) {
  const a = attempts.get(ip);
  if (!a || a.until < Date.now()) return true;
  return a.count < 10;
}
function loginFailed(ip) {
  const a = attempts.get(ip);
  if (!a || a.until < Date.now()) attempts.set(ip, { count: 1, until: Date.now() + WINDOW });
  else a.count++;
}
const loginOk = (ip) => attempts.delete(ip);

module.exports = { createSession, sessionUser, destroySession, purgeExpired, loginAllowed, loginFailed, loginOk };
