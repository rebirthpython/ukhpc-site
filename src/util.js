'use strict';
const crypto = require('node:crypto');

// Расписание звонков (пары)
const BELLS = {
  1: ['07:30', '09:00'],
  2: ['09:10', '10:40'],
  3: ['11:10', '12:40'],
  4: ['13:00', '14:30'],
  5: ['14:40', '16:10'],
  6: ['16:20', '17:50'],
};
const MARKS = ['5', '4', '3', '2', 'н'];
const REQUEST_TYPES = [
  'Справка с места учёбы',
  'Справка в военкомат',
  'Справка о размере стипендии',
  'Справка для ЦОН / ГЦВП',
  'Транскрипт (выписка оценок)',
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, msg) => {
  throw new HttpError(status, msg);
};

// --- Даты: всегда строки YYYY-MM-DD, арифметика в UTC, чтобы не ловить смещения часовых поясов
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmtDate = (dt) => dt.toISOString().slice(0, 10);
const today = () => new Date().toLocaleDateString('sv-SE'); // локальная дата сервера (TZ)
const addDays = (s, n) => {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
};
const weekday = (s) => parseDate(s).getUTCDay() || 7; // 1 = пн ... 7 = вс
const mondayOf = (s) => addDays(s, 1 - weekday(s));
const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && fmtDate(parseDate(s)) === s;

// --- Валидация входных данных
function str(v, { max = 200, min = 0, name = 'Поле' } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') fail(400, `${name}: неверный формат`);
  v = String(v).trim();
  if (v.length < min) fail(400, min === 1 ? `${name}: обязательное поле` : `${name}: минимум ${min} символов`);
  if (v.length > max) fail(400, `${name}: максимум ${max} символов`);
  return v;
}
function int(v, { min = -Infinity, max = Infinity, name = 'Число', optional = false } = {}) {
  if (optional && (v === undefined || v === null || v === '')) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${name}: неверное значение`);
  return n;
}
function date(v, name = 'Дата') {
  if (!isDate(v)) fail(400, `${name}: неверная дата`);
  return v;
}
function oneOf(v, list, name = 'Значение') {
  if (!list.includes(v)) fail(400, `${name}: недопустимое значение`);
  return v;
}

// --- Пароли (scrypt)
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
function randomPassword(len = 10) {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

function average(values) {
  const nums = values.filter((v) => v !== 'н' && v != null).map(Number);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

module.exports = {
  BELLS, MARKS, REQUEST_TYPES, HttpError, fail,
  today, addDays, weekday, mondayOf, isDate,
  str, int, date, oneOf,
  hashPassword, verifyPassword, randomPassword, average,
};
