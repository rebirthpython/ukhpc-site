'use strict';
const { all, get, run, tx } = require('./db');
const auth = require('./auth');
const U = require('./util');
const { fail, str, int, date, oneOf } = U;

const routes = [];
/** Регистрирует маршрут. roles = null — доступен всем, [] — любому вошедшему, иначе — перечисленным ролям. */
function route(method, pattern, roles, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
  routes.push({ method, re, keys, roles, handler });
}
const ANY = [];
const STUDENT = ['student'];
const TEACHER = ['teacher', 'admin'];
const ADMIN = ['admin'];

// ---------------------------------------------------------------- общие запросы

const groupOf = (id) => get('SELECT id, name, specialty, course, curator_id FROM groups WHERE id = ?', id);

function scheduleRows(where, ...params) {
  return all(
    `SELECT s.id, s.weekday, s.pair_no, s.room, s.assignment_id,
            sub.name AS subject, t.full_name AS teacher, g.name AS group_name, g.id AS group_id
       FROM schedule s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN subjects sub  ON sub.id = a.subject_id
       JOIN groups g      ON g.id = a.group_id
  LEFT JOIN users t       ON t.id = a.teacher_id
      WHERE ${where}
   ORDER BY s.weekday, s.pair_no`,
    ...params,
  ).map((r) => ({ ...r, time: U.BELLS[r.pair_no] }));
}

/** Проверяет, что преподаватель ведёт эту нагрузку (админ — может всё). */
function assignmentFor(user, id) {
  const a = get(
    `SELECT a.id, a.group_id, a.subject_id, a.teacher_id, g.name AS group_name, sub.name AS subject,
            t.full_name AS teacher
       FROM assignments a JOIN groups g ON g.id = a.group_id JOIN subjects sub ON sub.id = a.subject_id
  LEFT JOIN users t ON t.id = a.teacher_id
      WHERE a.id = ?`,
    id,
  );
  if (!a) fail(404, 'Нагрузка не найдена');
  if (user.role !== 'admin' && a.teacher_id !== user.id) fail(403, 'Это не ваша группа/предмет');
  return a;
}

function lessonFor(user, id) {
  const l = get('SELECT * FROM lessons WHERE id = ?', id);
  if (!l) fail(404, 'Занятие не найдено');
  return { lesson: l, asg: assignmentFor(user, l.assignment_id) };
}

const latestNews = (limit) =>
  all(
    `SELECT n.id, n.title, n.body, n.created_at, u.full_name AS author
       FROM news n LEFT JOIN users u ON u.id = n.author_id ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    limit,
  );

function studentGrades(studentId, groupId) {
  const subjects = all(
    `SELECT a.id AS assignment_id, sub.name AS subject, t.full_name AS teacher
       FROM assignments a JOIN subjects sub ON sub.id = a.subject_id LEFT JOIN users t ON t.id = a.teacher_id
      WHERE a.group_id = ? ORDER BY sub.name`,
    groupId,
  );
  const rows = all(
    `SELECT l.assignment_id, l.date, l.pair_no, l.topic, m.value, m.comment
       FROM lessons l JOIN assignments a ON a.id = l.assignment_id
  LEFT JOIN marks m ON m.lesson_id = l.id AND m.student_id = ?
      WHERE a.group_id = ? AND l.date <= ?
   ORDER BY l.date, l.pair_no`,
    studentId, groupId, U.today(),
  );
  return subjects.map((s) => {
    const lessons = rows.filter((r) => r.assignment_id === s.assignment_id);
    const marks = lessons.filter((r) => r.value).map(({ date, value, comment, topic }) => ({ date, value, comment, topic }));
    return {
      ...s,
      marks,
      average: U.average(marks.map((m) => m.value)),
      absences: marks.filter((m) => m.value === 'н').length,
      lessons: lessons.length,
    };
  });
}

// ---------------------------------------------------------------- публичное и профиль

route('GET', '/api/config', null, () => ({ demo: process.env.DEMO !== '0', bells: U.BELLS, requestTypes: U.REQUEST_TYPES }));

route('GET', '/api/news', null, ({ query }) => latestNews(int(query.get('limit') || 20, { min: 1, max: 100 })));

route('POST', '/api/login', null, ({ body, req, setCookie, ip }) => {
  if (!auth.loginAllowed(ip)) fail(429, 'Слишком много попыток. Попробуйте через 15 минут.');
  const login = str(body.login, { max: 64, min: 1, name: 'Логин' });
  const password = str(body.password, { max: 128, min: 1, name: 'Пароль' });
  const u = get('SELECT id, pass_hash FROM users WHERE login = ?', login);
  if (!u || !U.verifyPassword(password, u.pass_hash)) {
    auth.loginFailed(ip);
    fail(401, 'Неверный логин или пароль');
  }
  auth.loginOk(ip);
  setCookie(auth.createSession(u.id));
  return { ok: true };
});

route('POST', '/api/logout', null, ({ req, setCookie }) => {
  setCookie(auth.destroySession(req));
  return { ok: true };
});

route('GET', '/api/me', ANY, ({ user }) => ({ ...user, group: user.group_id ? groupOf(user.group_id) : null }));

route('PUT', '/api/me', ANY, ({ user, body }) => {
  const email = str(body.email, { max: 120, name: 'E-mail' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'E-mail: неверный формат');
  const phone = str(body.phone, { max: 30, name: 'Телефон' });
  run('UPDATE users SET email = ?, phone = ? WHERE id = ?', email, phone, user.id);
  return { ok: true };
});

route('POST', '/api/me/password', ANY, ({ user, body }) => {
  const oldPw = str(body.old, { max: 128, name: 'Текущий пароль' });
  const newPw = str(body.new, { max: 128, min: 8, name: 'Новый пароль' });
  const u = get('SELECT pass_hash FROM users WHERE id = ?', user.id);
  if (!U.verifyPassword(oldPw, u.pass_hash)) fail(400, 'Текущий пароль указан неверно');
  run('UPDATE users SET pass_hash = ? WHERE id = ?', U.hashPassword(newPw), user.id);
  return { ok: true };
});

/** Расписание: студенту — его группы, преподавателю — его пары, админу — по ?group= */
route('GET', '/api/schedule', ANY, ({ user, query }) => {
  if (user.role === 'student') return user.group_id ? scheduleRows('g.id = ?', user.group_id) : [];
  const g = query.get('group');
  if (g) return scheduleRows('g.id = ?', int(g, { min: 1 }));
  return scheduleRows('a.teacher_id = ?', user.id);
});

// ---------------------------------------------------------------- студент

route('GET', '/api/student/dashboard', STUDENT, ({ user }) => {
  const t = U.today();
  let day = t;
  if (U.weekday(day) === 7) day = U.addDays(day, 1);
  const todays = user.group_id ? scheduleRows('g.id = ? AND s.weekday = ?', user.group_id, U.weekday(day)) : [];
  const recent = all(
    `SELECT m.value, m.comment, l.date, sub.name AS subject
       FROM marks m JOIN lessons l ON l.id = m.lesson_id JOIN assignments a ON a.id = l.assignment_id
       JOIN subjects sub ON sub.id = a.subject_id
      WHERE m.student_id = ? ORDER BY l.date DESC, l.pair_no DESC LIMIT 10`,
    user.id,
  );
  const allMarks = all('SELECT value FROM marks WHERE student_id = ?', user.id).map((r) => r.value);
  const conducted = user.group_id
    ? get(
        `SELECT COUNT(*) AS n FROM lessons l JOIN assignments a ON a.id = l.assignment_id WHERE a.group_id = ? AND l.date <= ?`,
        user.group_id, t,
      ).n
    : 0;
  const absences = allMarks.filter((v) => v === 'н').length;
  const homework = user.group_id
    ? all(
        `SELECT l.date, l.homework, sub.name AS subject FROM lessons l
           JOIN assignments a ON a.id = l.assignment_id JOIN subjects sub ON sub.id = a.subject_id
          WHERE a.group_id = ? AND l.homework <> '' AND l.date BETWEEN ? AND ?
       ORDER BY l.date DESC, l.pair_no DESC LIMIT 6`,
        user.group_id, U.addDays(t, -7), t,
      )
    : [];
  const remarks = all(
    `SELECT r.kind, r.text, r.created_at, u.full_name AS author FROM remarks r LEFT JOIN users u ON u.id = r.author_id
      WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 5`,
    user.id,
  );
  return {
    day, today: t, todays, recent, homework, remarks,
    average: U.average(allMarks),
    attendance: conducted ? Math.round(((conducted - absences) / conducted) * 1000) / 10 : null,
    absences,
    openRequests: get(`SELECT COUNT(*) AS n FROM requests WHERE student_id = ? AND status IN ('new','processing','ready')`, user.id).n,
    news: latestNews(3),
  };
});

/** Электронный дневник: неделя (пн–сб) с парами, темами, ДЗ и оценками */
route('GET', '/api/student/diary', STUDENT, ({ user, query }) => {
  const anchor = query.get('date') ? date(query.get('date')) : U.today();
  const monday = U.mondayOf(anchor);
  const saturday = U.addDays(monday, 5);
  if (!user.group_id) return { week_start: monday, days: [] };
  const sched = scheduleRows('g.id = ?', user.group_id);
  const lessons = all(
    `SELECT l.id, l.assignment_id, l.date, l.pair_no, l.topic, l.homework, m.value AS mark, m.comment,
            sub.name AS subject, t.full_name AS teacher
       FROM lessons l JOIN assignments a ON a.id = l.assignment_id JOIN subjects sub ON sub.id = a.subject_id
  LEFT JOIN users t ON t.id = a.teacher_id
  LEFT JOIN marks m ON m.lesson_id = l.id AND m.student_id = ?
      WHERE a.group_id = ? AND l.date BETWEEN ? AND ?`,
    user.id, user.group_id, monday, saturday,
  );
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = U.addDays(monday, i);
    const items = new Map();
    for (const s of sched.filter((s) => s.weekday === i + 1)) {
      items.set(s.pair_no, { pair_no: s.pair_no, time: s.time, subject: s.subject, teacher: s.teacher, room: s.room, topic: '', homework: '', mark: null, comment: '' });
    }
    for (const l of lessons.filter((l) => l.date === d)) {
      const base = items.get(l.pair_no) || { pair_no: l.pair_no, time: U.BELLS[l.pair_no], room: '' };
      items.set(l.pair_no, { ...base, subject: l.subject, teacher: l.teacher, topic: l.topic, homework: l.homework, mark: l.mark, comment: l.comment || '', held: true });
    }
    days.push({ date: d, weekday: i + 1, items: [...items.values()].sort((a, b) => a.pair_no - b.pair_no) });
  }
  return { week_start: monday, today: U.today(), days };
});

route('GET', '/api/student/grades', STUDENT, ({ user }) => (user.group_id ? studentGrades(user.id, user.group_id) : []));

route('GET', '/api/student/remarks', STUDENT, ({ user }) =>
  all(
    `SELECT r.id, r.kind, r.text, r.created_at, u.full_name AS author FROM remarks r LEFT JOIN users u ON u.id = r.author_id
      WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC`,
    user.id,
  ),
);

route('GET', '/api/student/requests', STUDENT, ({ user }) =>
  all('SELECT * FROM requests WHERE student_id = ? ORDER BY created_at DESC, id DESC', user.id),
);

route('POST', '/api/student/requests', STUDENT, ({ user, body }) => {
  const type = oneOf(body.type, U.REQUEST_TYPES, 'Тип справки');
  const purpose = str(body.purpose, { max: 300, name: 'Куда предоставляется' });
  const copies = int(body.copies ?? 1, { min: 1, max: 5, name: 'Количество экземпляров' });
  const open = get(`SELECT COUNT(*) AS n FROM requests WHERE student_id = ? AND status IN ('new','processing')`, user.id).n;
  if (open >= 5) fail(400, 'У вас уже 5 заявок в работе — дождитесь их обработки');
  const r = run('INSERT INTO requests (student_id, type, purpose, copies) VALUES (?, ?, ?, ?)', user.id, type, purpose, copies);
  return { id: Number(r.lastInsertRowid) };
});

route('DELETE', '/api/student/requests/:id', STUDENT, ({ user, params }) => {
  const r = run(`DELETE FROM requests WHERE id = ? AND student_id = ? AND status = 'new'`, params.id, user.id);
  if (!r.changes) fail(400, 'Отменить можно только новую заявку');
  return { ok: true };
});

// ---------------------------------------------------------------- преподаватель (и админ)

route('GET', '/api/teacher/assignments', TEACHER, ({ user }) =>
  all(
    `SELECT a.id, g.id AS group_id, g.name AS group_name, g.course, sub.name AS subject, t.full_name AS teacher,
            (SELECT COUNT(*) FROM users s WHERE s.group_id = g.id AND s.role = 'student') AS students,
            (SELECT COUNT(*) FROM lessons l WHERE l.assignment_id = a.id) AS lessons
       FROM assignments a JOIN groups g ON g.id = a.group_id JOIN subjects sub ON sub.id = a.subject_id
  LEFT JOIN users t ON t.id = a.teacher_id
      WHERE (? = 'admin' OR a.teacher_id = ?)
   ORDER BY g.name, sub.name`,
    user.role, user.id,
  ),
);

route('GET', '/api/teacher/dashboard', TEACHER, ({ user }) => {
  let day = U.today();
  if (U.weekday(day) === 7) day = U.addDays(day, 1);
  return {
    day,
    todays: scheduleRows('a.teacher_id = ? AND s.weekday = ?', user.id, U.weekday(day)),
    curated: all('SELECT id, name, specialty, course FROM groups WHERE curator_id = ? ORDER BY name', user.id),
    news: latestNews(3),
  };
});

/** Журнал группы по предмету: студенты × занятия */
route('GET', '/api/teacher/journal/:id', TEACHER, ({ user, params, query }) => {
  const asg = assignmentFor(user, params.id);
  const from = query.get('from') ? date(query.get('from')) : '0000-01-01';
  const to = query.get('to') ? date(query.get('to')) : '9999-12-31';
  const students = all(`SELECT id, full_name FROM users WHERE role = 'student' AND group_id = ? ORDER BY full_name`, asg.group_id);
  const lessons = all(
    'SELECT id, date, pair_no, topic, homework FROM lessons WHERE assignment_id = ? AND date BETWEEN ? AND ? ORDER BY date, pair_no',
    asg.id, from, to,
  );
  const marks = all(
    `SELECT m.lesson_id, m.student_id, m.value, m.comment FROM marks m JOIN lessons l ON l.id = m.lesson_id
      WHERE l.assignment_id = ? AND l.date BETWEEN ? AND ?`,
    asg.id, from, to,
  );
  const sched = all('SELECT weekday, pair_no FROM schedule WHERE assignment_id = ? ORDER BY weekday, pair_no', asg.id);
  return { assignment: asg, students, lessons, marks, schedule: sched, today: U.today() };
});

function lessonInput(body) {
  return {
    date: date(body.date),
    pair_no: int(body.pair_no, { min: 1, max: 6, name: 'Номер пары' }),
    topic: str(body.topic, { max: 200, name: 'Тема' }),
    homework: str(body.homework, { max: 1000, name: 'Домашнее задание' }),
  };
}
const uniqueLesson = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (/UNIQUE/.test(e.message)) fail(400, 'Занятие на эту дату и пару уже есть в журнале');
    throw e;
  }
};

route('POST', '/api/teacher/lessons', TEACHER, ({ user, body }) => {
  const asg = assignmentFor(user, int(body.assignment_id, { min: 1 }));
  const l = lessonInput(body);
  const r = uniqueLesson(() =>
    run('INSERT INTO lessons (assignment_id, date, pair_no, topic, homework) VALUES (?, ?, ?, ?, ?)', asg.id, l.date, l.pair_no, l.topic, l.homework),
  );
  return { id: Number(r.lastInsertRowid) };
});

route('PUT', '/api/teacher/lessons/:id', TEACHER, ({ user, params, body }) => {
  const { lesson } = lessonFor(user, params.id);
  const l = lessonInput(body);
  uniqueLesson(() => run('UPDATE lessons SET date = ?, pair_no = ?, topic = ?, homework = ? WHERE id = ?', l.date, l.pair_no, l.topic, l.homework, lesson.id));
  return { ok: true };
});

route('DELETE', '/api/teacher/lessons/:id', TEACHER, ({ user, params }) => {
  const { lesson } = lessonFor(user, params.id);
  run('DELETE FROM lessons WHERE id = ?', lesson.id);
  return { ok: true };
});

route('PUT', '/api/teacher/marks', TEACHER, ({ user, body }) => {
  const { lesson, asg } = lessonFor(user, int(body.lesson_id, { min: 1 }));
  const studentId = int(body.student_id, { min: 1 });
  const st = get(`SELECT id FROM users WHERE id = ? AND role = 'student' AND group_id = ?`, studentId, asg.group_id);
  if (!st) fail(400, 'Студент не из этой группы');
  const value = body.value === '' || body.value == null ? '' : oneOf(String(body.value), U.MARKS, 'Оценка');
  const comment = str(body.comment, { max: 200, name: 'Комментарий' });
  if (!value) run('DELETE FROM marks WHERE lesson_id = ? AND student_id = ?', lesson.id, studentId);
  else
    run(
      `INSERT INTO marks (lesson_id, student_id, value, comment) VALUES (?, ?, ?, ?)
       ON CONFLICT (lesson_id, student_id) DO UPDATE SET value = excluded.value, comment = excluded.comment, updated_at = datetime('now')`,
      lesson.id, studentId, value, comment,
    );
  return { ok: true };
});

route('GET', '/api/teacher/students/:id', TEACHER, ({ user, params }) => {
  const st = get(
    `SELECT u.id, u.full_name, u.email, u.phone, u.group_id, g.name AS group_name, g.curator_id
       FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.id = ? AND u.role = 'student'`,
    params.id,
  );
  if (!st) fail(404, 'Студент не найден');
  if (user.role !== 'admin') {
    const teaches = get('SELECT 1 FROM assignments WHERE group_id = ? AND teacher_id = ?', st.group_id, user.id);
    if (!teaches && st.curator_id !== user.id) fail(403, 'Нет доступа к этому студенту');
  }
  return {
    student: st,
    grades: st.group_id ? studentGrades(st.id, st.group_id) : [],
    remarks: all(
      `SELECT r.id, r.kind, r.text, r.created_at, u.full_name AS author, r.author_id FROM remarks r
       LEFT JOIN users u ON u.id = r.author_id WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      st.id,
    ),
  };
});

route('POST', '/api/teacher/remarks', TEACHER, ({ user, body }) => {
  const studentId = int(body.student_id, { min: 1 });
  const st = get(`SELECT u.group_id, g.curator_id FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.id = ? AND u.role = 'student'`, studentId);
  if (!st) fail(404, 'Студент не найден');
  if (user.role !== 'admin' && st.curator_id !== user.id && !get('SELECT 1 FROM assignments WHERE group_id = ? AND teacher_id = ?', st.group_id, user.id))
    fail(403, 'Нет доступа к этому студенту');
  const kind = oneOf(body.kind || 'remark', ['remark', 'praise'], 'Тип');
  const text = str(body.text, { max: 500, min: 1, name: 'Текст' });
  run('INSERT INTO remarks (student_id, author_id, kind, text) VALUES (?, ?, ?, ?)', studentId, user.id, kind, text);
  return { ok: true };
});

route('DELETE', '/api/teacher/remarks/:id', TEACHER, ({ user, params }) => {
  const r = run('DELETE FROM remarks WHERE id = ? AND (author_id = ? OR ? = \'admin\')', params.id, user.id, user.role);
  if (!r.changes) fail(403, 'Удалить можно только свою запись');
  return { ok: true };
});

// ---------------------------------------------------------------- администратор

route('GET', '/api/admin/stats', ADMIN, () => {
  const roles = Object.fromEntries(all('SELECT role, COUNT(*) AS n FROM users GROUP BY role').map((r) => [r.role, r.n]));
  return {
    students: roles.student || 0,
    teachers: roles.teacher || 0,
    admins: roles.admin || 0,
    groups: get('SELECT COUNT(*) AS n FROM groups').n,
    subjects: get('SELECT COUNT(*) AS n FROM subjects').n,
    newRequests: get(`SELECT COUNT(*) AS n FROM requests WHERE status = 'new'`).n,
    average: U.average(all('SELECT value FROM marks').map((r) => r.value)),
    groupStats: all(
      `SELECT g.id, g.name, g.course,
              (SELECT COUNT(*) FROM users u WHERE u.group_id = g.id AND u.role = 'student') AS students,
              (SELECT ROUND(AVG(CAST(m.value AS REAL)), 2) FROM marks m JOIN users u ON u.id = m.student_id
                WHERE u.group_id = g.id AND m.value <> 'н') AS average,
              (SELECT COUNT(*) FROM marks m JOIN users u ON u.id = m.student_id WHERE u.group_id = g.id AND m.value = 'н') AS absences
         FROM groups g ORDER BY g.name`,
    ),
  };
});

// Пользователи
route('GET', '/api/admin/users', ADMIN, ({ query }) => {
  const role = query.get('role') || '';
  const group = query.get('group') || '';
  const q = (query.get('q') || '').trim();
  return all(
    `SELECT u.id, u.login, u.role, u.full_name, u.email, u.phone, u.group_id, g.name AS group_name, u.created_at
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE (? = '' OR u.role = ?) AND (? = '' OR u.group_id = ?) AND (? = '' OR u.full_name LIKE ? OR u.login LIKE ?)
   ORDER BY u.role, u.full_name LIMIT 500`,
    role, role, group, group ? Number(group) : null, q, `%${q}%`, `%${q}%`,
  );
});

function userInput(body, isNew) {
  const out = {
    full_name: str(body.full_name, { max: 120, min: 3, name: 'ФИО' }),
    email: str(body.email, { max: 120, name: 'E-mail' }),
    phone: str(body.phone, { max: 30, name: 'Телефон' }),
  };
  if (isNew) {
    out.role = oneOf(body.role, ['student', 'teacher', 'admin'], 'Роль');
    out.login = str(body.login, { max: 64, min: 3, name: 'Логин' });
    if (!/^[a-zA-Z0-9._-]+$/.test(out.login)) fail(400, 'Логин: только латиница, цифры, точка, дефис и подчёркивание');
  }
  out.group_id = int(body.group_id, { min: 1, optional: true, name: 'Группа' });
  if (out.group_id && !groupOf(out.group_id)) fail(400, 'Группа не найдена');
  return out;
}

route('POST', '/api/admin/users', ADMIN, ({ body }) => {
  const u = userInput(body, true);
  if (u.role === 'student' && !u.group_id) fail(400, 'Для студента нужно указать группу');
  if (u.role !== 'student') u.group_id = null;
  if (get('SELECT 1 FROM users WHERE login = ?', u.login)) fail(400, 'Такой логин уже занят');
  const password = body.password ? str(body.password, { min: 8, max: 128, name: 'Пароль' }) : U.randomPassword();
  const r = run(
    'INSERT INTO users (login, pass_hash, role, full_name, email, phone, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    u.login, U.hashPassword(password), u.role, u.full_name, u.email, u.phone, u.group_id,
  );
  return { id: Number(r.lastInsertRowid), password };
});

route('PUT', '/api/admin/users/:id', ADMIN, ({ params, body }) => {
  const existing = get('SELECT id, role FROM users WHERE id = ?', params.id);
  if (!existing) fail(404, 'Пользователь не найден');
  const u = userInput(body, false);
  if (existing.role === 'student' && !u.group_id) fail(400, 'Для студента нужно указать группу');
  run('UPDATE users SET full_name = ?, email = ?, phone = ?, group_id = ? WHERE id = ?',
    u.full_name, u.email, u.phone, existing.role === 'student' ? u.group_id : null, existing.id);
  return { ok: true };
});

route('POST', '/api/admin/users/:id/password', ADMIN, ({ params }) => {
  const password = U.randomPassword();
  const r = run('UPDATE users SET pass_hash = ? WHERE id = ?', U.hashPassword(password), params.id);
  if (!r.changes) fail(404, 'Пользователь не найден');
  run('DELETE FROM sessions WHERE user_id = ?', params.id);
  return { password };
});

route('DELETE', '/api/admin/users/:id', ADMIN, ({ user, params }) => {
  if (params.id === user.id) fail(400, 'Нельзя удалить самого себя');
  const r = run('DELETE FROM users WHERE id = ?', params.id);
  if (!r.changes) fail(404, 'Пользователь не найден');
  return { ok: true };
});

// Группы
route('GET', '/api/admin/groups', ADMIN, () =>
  all(
    `SELECT g.*, c.full_name AS curator,
            (SELECT COUNT(*) FROM users u WHERE u.group_id = g.id AND u.role = 'student') AS students
       FROM groups g LEFT JOIN users c ON c.id = g.curator_id ORDER BY g.name`,
  ),
);
function groupInput(body) {
  const curator = int(body.curator_id, { min: 1, optional: true, name: 'Куратор' });
  if (curator && !get(`SELECT 1 FROM users WHERE id = ? AND role = 'teacher'`, curator)) fail(400, 'Куратор должен быть преподавателем');
  return {
    name: str(body.name, { max: 30, min: 1, name: 'Название' }),
    specialty: str(body.specialty, { max: 150, name: 'Специальность' }),
    course: int(body.course, { min: 1, max: 4, name: 'Курс' }),
    curator,
  };
}
const uniqueName = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (/UNIQUE/.test(e.message)) fail(400, 'Такая запись уже существует');
    throw e;
  }
};
route('POST', '/api/admin/groups', ADMIN, ({ body }) => {
  const g = groupInput(body);
  const r = uniqueName(() => run('INSERT INTO groups (name, specialty, course, curator_id) VALUES (?, ?, ?, ?)', g.name, g.specialty, g.course, g.curator));
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/admin/groups/:id', ADMIN, ({ params, body }) => {
  const g = groupInput(body);
  const r = uniqueName(() => run('UPDATE groups SET name = ?, specialty = ?, course = ?, curator_id = ? WHERE id = ?', g.name, g.specialty, g.course, g.curator, params.id));
  if (!r.changes) fail(404, 'Группа не найдена');
  return { ok: true };
});
route('DELETE', '/api/admin/groups/:id', ADMIN, ({ params }) => {
  if (get(`SELECT 1 FROM users WHERE group_id = ? AND role = 'student'`, params.id)) fail(400, 'В группе есть студенты — сначала переведите их');
  run('DELETE FROM groups WHERE id = ?', params.id);
  return { ok: true };
});

// Предметы
route('GET', '/api/admin/subjects', ADMIN, () => all('SELECT * FROM subjects ORDER BY name'));
route('POST', '/api/admin/subjects', ADMIN, ({ body }) => {
  const name = str(body.name, { max: 120, min: 1, name: 'Название' });
  const r = uniqueName(() => run('INSERT INTO subjects (name) VALUES (?)', name));
  return { id: Number(r.lastInsertRowid) };
});
route('DELETE', '/api/admin/subjects/:id', ADMIN, ({ params }) => {
  if (get('SELECT 1 FROM assignments WHERE subject_id = ?', params.id)) fail(400, 'Предмет используется в нагрузке групп');
  run('DELETE FROM subjects WHERE id = ?', params.id);
  return { ok: true };
});

// Нагрузка (группа + предмет + преподаватель)
route('GET', '/api/admin/assignments', ADMIN, ({ query }) => {
  const g = query.get('group');
  return all(
    `SELECT a.id, a.group_id, a.subject_id, a.teacher_id, g.name AS group_name, sub.name AS subject, t.full_name AS teacher
       FROM assignments a JOIN groups g ON g.id = a.group_id JOIN subjects sub ON sub.id = a.subject_id
  LEFT JOIN users t ON t.id = a.teacher_id
      WHERE (? IS NULL OR a.group_id = ?) ORDER BY g.name, sub.name`,
    g ? Number(g) : null, g ? Number(g) : null,
  );
});
route('POST', '/api/admin/assignments', ADMIN, ({ body }) => {
  const group = int(body.group_id, { min: 1, name: 'Группа' });
  const subject = int(body.subject_id, { min: 1, name: 'Предмет' });
  const teacher = int(body.teacher_id, { min: 1, optional: true, name: 'Преподаватель' });
  if (!groupOf(group)) fail(400, 'Группа не найдена');
  if (!get('SELECT 1 FROM subjects WHERE id = ?', subject)) fail(400, 'Предмет не найден');
  if (teacher && !get(`SELECT 1 FROM users WHERE id = ? AND role = 'teacher'`, teacher)) fail(400, 'Преподаватель не найден');
  const r = uniqueName(() => run('INSERT INTO assignments (group_id, subject_id, teacher_id) VALUES (?, ?, ?)', group, subject, teacher));
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/admin/assignments/:id', ADMIN, ({ params, body }) => {
  const teacher = int(body.teacher_id, { min: 1, optional: true, name: 'Преподаватель' });
  if (teacher && !get(`SELECT 1 FROM users WHERE id = ? AND role = 'teacher'`, teacher)) fail(400, 'Преподаватель не найден');
  run('UPDATE assignments SET teacher_id = ? WHERE id = ?', teacher, params.id);
  return { ok: true };
});
route('DELETE', '/api/admin/assignments/:id', ADMIN, ({ params }) => {
  if (get('SELECT 1 FROM lessons WHERE assignment_id = ?', params.id)) fail(400, 'По этой нагрузке уже есть занятия в журнале');
  run('DELETE FROM assignments WHERE id = ?', params.id);
  return { ok: true };
});

// Расписание
route('POST', '/api/admin/schedule', ADMIN, ({ body }) => {
  const asg = int(body.assignment_id, { min: 1, name: 'Предмет' });
  const weekday = int(body.weekday, { min: 1, max: 6, name: 'День недели' });
  const pair = int(body.pair_no, { min: 1, max: 6, name: 'Пара' });
  const room = str(body.room, { max: 20, name: 'Аудитория' });
  const a = get('SELECT group_id, teacher_id FROM assignments WHERE id = ?', asg);
  if (!a) fail(400, 'Нагрузка не найдена');
  if (get('SELECT 1 FROM schedule s JOIN assignments x ON x.id = s.assignment_id WHERE x.group_id = ? AND s.weekday = ? AND s.pair_no = ?', a.group_id, weekday, pair))
    fail(400, 'У группы уже есть пара в это время');
  if (a.teacher_id && get('SELECT 1 FROM schedule s JOIN assignments x ON x.id = s.assignment_id WHERE x.teacher_id = ? AND s.weekday = ? AND s.pair_no = ?', a.teacher_id, weekday, pair))
    fail(400, 'Преподаватель в это время занят в другой группе');
  const r = run('INSERT INTO schedule (assignment_id, weekday, pair_no, room) VALUES (?, ?, ?, ?)', asg, weekday, pair, room);
  return { id: Number(r.lastInsertRowid) };
});
route('DELETE', '/api/admin/schedule/:id', ADMIN, ({ params }) => {
  run('DELETE FROM schedule WHERE id = ?', params.id);
  return { ok: true };
});

// Заявки на справки
route('GET', '/api/admin/requests', ADMIN, ({ query }) => {
  const status = query.get('status') || '';
  return all(
    `SELECT r.*, u.full_name AS student, g.name AS group_name
       FROM requests r JOIN users u ON u.id = r.student_id LEFT JOIN groups g ON g.id = u.group_id
      WHERE (? = '' OR r.status = ?) ORDER BY r.status = 'new' DESC, r.created_at DESC, r.id DESC LIMIT 300`,
    status, status,
  );
});
route('PUT', '/api/admin/requests/:id', ADMIN, ({ params, body }) => {
  const status = oneOf(body.status, ['new', 'processing', 'ready', 'issued', 'rejected'], 'Статус');
  const answer = str(body.answer, { max: 300, name: 'Комментарий' });
  const r = run(`UPDATE requests SET status = ?, answer = ?, updated_at = datetime('now') WHERE id = ?`, status, answer, params.id);
  if (!r.changes) fail(404, 'Заявка не найдена');
  return { ok: true };
});

// Новости
route('POST', '/api/admin/news', ADMIN, ({ user, body }) => {
  const title = str(body.title, { max: 160, min: 3, name: 'Заголовок' });
  const text = str(body.body, { max: 5000, min: 1, name: 'Текст' });
  const r = run('INSERT INTO news (title, body, author_id) VALUES (?, ?, ?)', title, text, user.id);
  return { id: Number(r.lastInsertRowid) };
});
route('DELETE', '/api/admin/news/:id', ADMIN, ({ params }) => {
  run('DELETE FROM news WHERE id = ?', params.id);
  return { ok: true };
});

// ---------------------------------------------------------------- диспетчер

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) fail(413, 'Слишком большой запрос');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : fail(400, 'Ожидался JSON-объект');
  } catch (e) {
    if (e instanceof U.HttpError) throw e;
    fail(400, 'Некорректный JSON');
  }
}

async function handle(req, res, url) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const send = (status, data) => {
    res.writeHead(status, headers);
    res.end(JSON.stringify(data));
  };
  try {
    const candidates = routes.filter((r) => r.re.test(url.pathname));
    if (!candidates.length) fail(404, 'Не найдено');
    const r = candidates.find((c) => c.method === req.method);
    if (!r) fail(405, 'Метод не поддерживается');

    if (req.method !== 'GET') {
      // Защита от CSRF: только JSON и только с нашего origin (кука и так SameSite=Strict)
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Ожидался application/json');
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) fail(403, 'Запрос с чужого сайта');
    }

    const user = r.roles ? auth.sessionUser(req) : null;
    if (r.roles) {
      if (!user) fail(401, 'Требуется вход');
      if (r.roles.length && !r.roles.includes(user.role)) fail(403, 'Недостаточно прав');
    }
    const params = {};
    const m = url.pathname.match(r.re);
    r.keys.forEach((k, i) => (params[k] = Number(m[i + 1])));
    const body = req.method === 'GET' ? {} : await readJson(req);
    const ip = req.socket.remoteAddress || '';
    const result = await r.handler({
      req, user, params, body, query: url.searchParams, ip,
      setCookie: (c) => (headers['Set-Cookie'] = c),
    });
    send(200, result ?? { ok: true });
  } catch (e) {
    if (e instanceof U.HttpError) return send(e.status, { error: e.message });
    console.error(e);
    send(500, { error: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { handle, tx };
