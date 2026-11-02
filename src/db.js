'use strict';
// Хранилище на встроенном в Node.js SQLite (node:sqlite, Node >= 22.5) — без внешних зависимостей.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'portal.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  specialty  TEXT NOT NULL DEFAULT '',
  course     INTEGER NOT NULL DEFAULT 1,
  curator_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  login      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash  TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  group_id   INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
-- Учебная нагрузка: какой преподаватель ведёт какой предмет в какой группе
CREATE TABLE IF NOT EXISTS assignments (
  id         INTEGER PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (group_id, subject_id)
);
CREATE TABLE IF NOT EXISTS schedule (
  id            INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  pair_no       INTEGER NOT NULL CHECK (pair_no BETWEEN 1 AND 6),
  room          TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS lessons (
  id            INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  pair_no       INTEGER NOT NULL CHECK (pair_no BETWEEN 1 AND 6),
  topic         TEXT NOT NULL DEFAULT '',
  homework      TEXT NOT NULL DEFAULT '',
  UNIQUE (assignment_id, date, pair_no)
);
CREATE TABLE IF NOT EXISTS marks (
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value      TEXT NOT NULL CHECK (value IN ('5','4','3','2','н')),
  comment    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lesson_id, student_id)
);
CREATE TABLE IF NOT EXISTS remarks (
  id         INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'remark' CHECK (kind IN ('remark','praise')),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT '',
  copies     INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','processing','ready','issued','rejected')),
  answer     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS news (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_group   ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date  ON lessons(date);
CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_sched_asg     ON schedule(assignment_id);
`);

// node:sqlite не принимает undefined — приводим к null.
const norm = (params) => params.map((p) => (p === undefined ? null : p));
const all = (sql, ...p) => db.prepare(sql).all(...norm(p));
const get = (sql, ...p) => db.prepare(sql).get(...norm(p));
const run = (sql, ...p) => db.prepare(sql).run(...norm(p));

function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, all, get, run, tx, DB_PATH };
