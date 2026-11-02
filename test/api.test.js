'use strict';
// Интеграционные тесты API: поднимаем сервер на базе в памяти с демо-данными.
process.env.DB_PATH = ':memory:';
process.env.TZ = 'Asia/Almaty';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');

let base;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function login(user, password = `${user}123`) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: user, password }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (path, { method = 'GET', body } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: { cookie, ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
      body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
}

test('неверный пароль отклоняется, без входа API закрыт', async () => {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"login":"student","password":"nope"}' });
  assert.equal(res.status, 401);
  assert.equal((await fetch(`${base}/api/student/diary`)).status, 401);
});

test('студент видит дневник и успеваемость, но не админку и журнал', async () => {
  const api = await login('student');
  const diary = await api('/api/student/diary');
  assert.equal(diary.status, 200);
  assert.equal(diary.data.days.length, 6);
  const grades = await api('/api/student/grades');
  assert.ok(grades.data.length > 0);
  assert.equal((await api('/api/admin/stats')).status, 403);
  assert.equal((await api('/api/teacher/journal/1')).status, 403);
});

test('преподаватель ставит оценку, студент её видит', async () => {
  const teacher = await login('teacher');
  const asg = (await teacher('/api/teacher/assignments')).data.find((a) => a.group_name === 'ПО-24');
  const lesson = await teacher('/api/teacher/lessons', { method: 'POST', body: { assignment_id: asg.id, date: '2026-06-01', pair_no: 6, topic: 'Тест', homework: 'ДЗ' } });
  assert.equal(lesson.status, 200);
  const journal = (await teacher(`/api/teacher/journal/${asg.id}`)).data;
  const studentId = journal.students.find((s) => s.full_name.startsWith('Абдрахманов')).id;
  assert.equal((await teacher('/api/teacher/marks', { method: 'PUT', body: { lesson_id: lesson.data.id, student_id: studentId, value: '5', comment: 'молодец' } })).status, 200);
  assert.equal((await teacher('/api/teacher/marks', { method: 'PUT', body: { lesson_id: lesson.data.id, student_id: studentId, value: '7' } })).status, 400);

  const student = await login('student');
  const diary = (await student('/api/student/diary?date=2026-06-01')).data;
  const item = diary.days[0].items.find((i) => i.pair_no === 6);
  assert.equal(item.mark, '5');
  assert.equal(item.comment, 'молодец');
  assert.equal(item.homework, 'ДЗ');
});

test('преподаватель не может править чужой журнал', async () => {
  const teacher = await login('teacher');
  const own = new Set((await teacher('/api/teacher/assignments')).data.map((a) => a.id));
  const admin = await login('admin');
  const foreign = (await admin('/api/admin/assignments')).data.find((a) => !own.has(a.id));
  assert.equal((await teacher(`/api/teacher/journal/${foreign.id}`)).status, 403);
  assert.equal((await teacher('/api/teacher/lessons', { method: 'POST', body: { assignment_id: foreign.id, date: '2026-06-02', pair_no: 1 } })).status, 403);
});

test('админ создаёт студента, тот входит с выданным паролем', async () => {
  const admin = await login('admin');
  const groups = (await admin('/api/admin/groups')).data;
  const r = await admin('/api/admin/users', { method: 'POST', body: { role: 'student', login: 'new.student', full_name: 'Новый Студент Тестович', group_id: groups[0].id } });
  assert.equal(r.status, 200);
  const api = await login('new.student', r.data.password);
  assert.equal((await api('/api/me')).data.group.id, groups[0].id);
});

test('заявка на справку: студент создаёт, админ меняет статус', async () => {
  const student = await login('student');
  const created = await student('/api/student/requests', { method: 'POST', body: { type: 'Справка с места учёбы', purpose: 'Тест', copies: 1 } });
  assert.equal(created.status, 200);
  const admin = await login('admin');
  assert.equal((await admin(`/api/admin/requests/${created.data.id}`, { method: 'PUT', body: { status: 'ready', answer: 'Заберите' } })).status, 200);
  const mine = (await student('/api/student/requests')).data.find((x) => x.id === created.data.id);
  assert.equal(mine.status, 'ready');
});

test('изменяющие запросы без JSON и с чужого Origin отклоняются (CSRF)', async () => {
  const res = await fetch(`${base}/api/logout`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(res.status, 415);
  const res2 = await fetch(`${base}/api/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(res2.status, 403);
});
