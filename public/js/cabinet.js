'use strict';
// Личный кабинет Polytech Navigator — одностраничное приложение без зависимостей.
(() => {
  // ================================================================ утилиты
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /** Безопасные HTML-шаблоны: все подставленные значения экранируются, кроме результатов h`` и raw(). */
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(s);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const fmt = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : v == null || v === false ? '' : esc(v));
  const h = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + fmt(vals[i - 1]) + s));

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2v-.5zM19 19v3H6"/><path d="M9 7h6M9 11h4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 18h4"/>',
    news: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    journal: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  };
  const icon = (n) => raw(`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`);

  // ---- даты: сервер присылает YYYY-MM-DD
  const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtD = (s, o) => parseD(s).toLocaleDateString('ru-RU', o);
  const dShort = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const dLong = (s) => fmtD(s, { day: 'numeric', month: 'long' });
  const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const localToday = () => new Date().toLocaleDateString('sv-SE');
  // datetime('now') в SQLite — UTC
  const dtFmt = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const dtDate = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const toMin = (t) => t.split(':').map(Number).reduce((a, b) => a * 60 + b);
  const isNow = (time) => { const m = new Date().getHours() * 60 + new Date().getMinutes(); return m >= toMin(time[0]) && m < toMin(time[1]); };

  const avgCls = (a) => (a == null ? '' : a >= 4.5 ? 'a5' : a >= 3.5 ? 'a4' : a >= 2.5 ? 'a3' : 'a2');
  const avgFmt = (a) => (a == null ? '—' : a.toFixed(2).replace('.', ','));
  const average = (vals) => { const n = vals.filter((v) => v && v !== 'н').map(Number); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
  const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  const firstName = (name) => name.split(/\s+/)[1] || name;
  const shortName = (name) => { const [f, i, o] = name.split(/\s+/); return [f, i && `${i[0]}.`, o && `${o[0]}.`].filter(Boolean).join(' '); };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const ROLE = { student: 'Студент', teacher: 'Преподаватель', admin: 'Администратор' };
  const STATUS = { new: 'Новая', processing: 'В работе', ready: 'Готова', issued: 'Выдана', rejected: 'Отклонена' };
  const markEl = (v, title = '') => h`<span class="mark m${v}" title="${title}">${v}</span>`;
  const bar = (pct, color) => h`<div class="subj-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></i></div>`;
  const avgColor = (a) => ({ a5: 'var(--m5)', a4: 'var(--m4)', a3: 'var(--m3)', a2: 'var(--m2)' })[avgCls(a)] || 'var(--line)';

  // ================================================================ состояние, API, уведомления
  const state = { me: null, config: null };

  async function api(path, { method = 'GET', body } = {}) {
    const opts = { method, headers: {} };
    if (method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body ?? {});
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch { /* пустой ответ */ }
    if (res.status === 401 && path !== '/api/login') {
      state.me = null;
      renderLogin();
      throw new Error('Сессия истекла — войдите снова');
    }
    if (!res.ok) throw new Error((data && data.error) || `Ошибка ${res.status}`);
    return data;
  }

  function toast(msg, err = false) {
    const t = document.createElement('div');
    t.className = `toast${err ? ' err' : ''}`;
    t.textContent = msg;
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 3500);
  }

  const formData = (form) => Object.fromEntries(new FormData(form));

  /** Модальное окно с формой. onSubmit(data, dlg) — может вернуть false, чтобы окно не закрывалось. */
  function dialog({ title, body, submit = 'Сохранить', extra = '', onSubmit = () => {}, cancel = 'Отмена' }) {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = h`<form novalidate>
      <div class="dlg-head"><h2>${title}</h2><button type="button" class="x-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <div class="dlg-body">${body}<div class="form-error" data-err role="alert"></div></div>
      <div class="dlg-foot">${extra}${cancel ? h`<button type="button" class="btn ghost" data-close>${cancel}</button>` : ''}${submit ? h`<button class="btn" type="submit">${submit}</button>` : ''}</div>
    </form>`.s;
    document.body.append(dlg);
    const form = $('form', dlg);
    dlg.addEventListener('close', () => dlg.remove());
    $$('[data-close]', dlg).forEach((b) => (b.onclick = () => dlg.close()));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[type=submit]', form);
      if (btn) btn.disabled = true;
      try {
        if ((await onSubmit(formData(form), dlg)) !== false) dlg.close();
      } catch (err) {
        $('[data-err]', dlg).textContent = err.message;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    dlg.showModal();
    return dlg;
  }

  const confirmDlg = (text, ok = 'Удалить') =>
    new Promise((resolve) => {
      let yes = false;
      const d = dialog({ title: 'Подтверждение', body: h`<p>${text}</p>`, submit: ok, onSubmit: () => { yes = true; } });
      d.addEventListener('close', () => resolve(yes));
    });

  const showSecret = (title, text, secret) =>
    dialog({ title, body: h`<p class="muted">${text}</p><p class="secret" style="margin-top:12px">${secret}</p>`, submit: 'Готово', cancel: '' });

  const options = (list, selected, { empty } = {}) =>
    h`${empty != null ? h`<option value="">${empty}</option>` : ''}${list.map(([v, label]) => h`<option value="${v}" ${String(v) === String(selected ?? '') ? raw('selected') : ''}>${label}</option>`)}`;

  // ================================================================ вход
  async function renderLogin() {
    document.title = 'Вход — Polytech Navigator';
    const demo = state.config?.demo;
    $('#root').innerHTML = h`<div class="auth">
      <section class="auth-side">
        <div class="blob b1"></div><div class="blob b2"></div>
        <a class="logo" href="/"><span class="logo-mark">${icon('compass')}</span><span>Polytech Navigator<small>Студенческий портал УКВПК</small></span></a>
        <div>
          <h1>Добро пожаловать в личный кабинет</h1>
          <p>Электронный дневник, расписание, оценки, справки и новости колледжа — в одном месте.</p>
          <img src="/img/college.jpg" alt="">
        </div>
        <p class="small side-foot" style="opacity:.6">© УКВПК</p>
      </section>
      <main class="auth-main">
        <form class="auth-box" novalidate>
          <h2>Вход в кабинет</h2>
          <p class="muted">Используйте логин и пароль, выданные учебной частью.</p>
          <label for="login">Логин</label>
          <input id="login" name="login" autocomplete="username" autocapitalize="off" spellcheck="false" required>
          <label for="password">Пароль</label>
          <div class="pw-field">
            <input id="password" name="password" type="password" autocomplete="current-password" required>
            <button type="button" data-toggle-pw aria-label="Показать пароль">${icon('eye')}</button>
          </div>
          <div class="form-error" data-err role="alert"></div>
          <button class="btn" type="submit">Войти</button>
          ${demo ? h`<div class="demo"><p>Демо-доступ — нажмите, чтобы подставить логин и пароль:</p><div class="chips">
            <button type="button" class="btn ghost sm" data-demo="student">Студент</button>
            <button type="button" class="btn ghost sm" data-demo="teacher">Преподаватель</button>
            <button type="button" class="btn ghost sm" data-demo="admin">Администратор</button></div></div>` : ''}
          <p class="small muted" style="margin-top:22px"><a href="/">← На главную</a></p>
        </form>
      </main>
    </div>`.s;
    const form = $('.auth-box');
    $('[data-toggle-pw]').onclick = () => { const i = $('#password'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $$('[data-demo]').forEach((b) => (b.onclick = () => {
      $('#login').value = b.dataset.demo;
      $('#password').value = `${b.dataset.demo}123`;
      form.requestSubmit();
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[type=submit]', form);
      const err = $('[data-err]', form);
      err.textContent = '';
      const { login, password } = formData(form);
      if (!login || !password) { err.textContent = 'Введите логин и пароль'; return; }
      btn.disabled = true;
      try {
        await api('/api/login', { method: 'POST', body: { login, password } });
        await boot();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
    $('#login').focus();
  }

  // ================================================================ каркас и маршрутизация
  const ROUTES = {
    student: [
      ['', 'Главная', 'home', studentHome],
      ['diary', 'Дневник', 'book', diaryPage],
      ['grades', 'Успеваемость', 'chart', gradesPage],
      ['schedule', 'Расписание', 'calendar', schedulePage],
      ['requests', 'Справки', 'file', studentRequests],
      ['news', 'Новости', 'news', newsPage],
      ['profile', 'Профиль', 'user', profilePage],
    ],
    teacher: [
      ['', 'Главная', 'home', teacherHome],
      ['journal', 'Журнал', 'journal', journalList],
      ['schedule', 'Расписание', 'calendar', schedulePage],
      ['news', 'Новости', 'news', newsPage],
      ['profile', 'Профиль', 'user', profilePage],
    ],
    admin: [
      ['', 'Главная', 'home', adminHome],
      ['users', 'Пользователи', 'users', adminUsers],
      ['groups', 'Группы и предметы', 'layers', adminGroups],
      ['schedule', 'Расписание', 'calendar', adminSchedule],
      ['journal', 'Журналы', 'journal', journalList],
      ['requests', 'Справки', 'file', adminRequests],
      ['news', 'Новости', 'news', newsPage],
      ['profile', 'Профиль', 'user', profilePage],
    ],
  };
  // Скрытые маршруты с параметром
  const SUBROUTES = { journal: ['journal', 'Журнал', journalPage], student: ['journal', 'Карточка студента', studentCard] };

  function setTitle(t) {
    $('#page-title').textContent = t;
    document.title = `${t} — Polytech Navigator`;
  }

  function renderShell() {
    const me = state.me;
    const sub = me.role === 'student' ? `${ROLE.student}${me.group ? ` · ${me.group.name}` : ''}` : ROLE[me.role];
    $('#root').innerHTML = h`<div class="app" id="app">
      <aside class="sidebar" aria-label="Меню кабинета">
        <a class="logo" href="#/"><span class="logo-mark">${icon('compass')}</span><span>Polytech Navigator<small>Личный кабинет</small></span></a>
        <nav class="nav">${ROUTES[me.role].map(([path, title, ic]) => h`<a href="#/${path}" data-path="${path}">${icon(ic)}<span>${title}</span></a>`)}</nav>
        <div class="side-user">
          <span class="avatar">${initials(me.full_name)}</span>
          <div class="who"><b title="${me.full_name}">${shortName(me.full_name)}</b><span>${sub}</span></div>
          <button type="button" data-logout title="Выйти" aria-label="Выйти">${icon('logout')}</button>
        </div>
      </aside>
      <div class="backdrop" data-close-nav></div>
      <div class="main">
        <header class="topbar">
          <button type="button" class="btn ghost icon-only menu-btn" data-menu aria-label="Меню">${icon('menu')}</button>
          <h1 id="page-title"></h1>
          <a class="btn ghost sm" href="/" title="Главная страница сайта">${icon('globe')}<span class="hide-sm">Сайт</span></a>
          <button type="button" class="btn ghost icon-only" data-theme-toggle aria-label="Сменить тему"></button>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`.s;
    const app = $('#app');
    $('[data-menu]').onclick = () => app.classList.add('nav-open');
    $('[data-close-nav]').onclick = () => app.classList.remove('nav-open');
    $('[data-logout]').onclick = async () => {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
      state.me = null;
      location.hash = '';
      renderLogin();
    };
    const themeBtn = $('[data-theme-toggle]');
    const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const paintTheme = () => (themeBtn.innerHTML = icon(isDark() ? 'sun' : 'moon').s);
    paintTheme();
    themeBtn.onclick = () => {
      const t = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('theme', t); } catch { /* не критично */ }
      paintTheme();
    };
    if (me.role === 'admin') refreshAdminBadge();
  }

  async function refreshAdminBadge() {
    try {
      const s = await api('/api/admin/stats');
      const a = $('.nav a[data-path="requests"]');
      if (!a) return;
      $('.count', a)?.remove();
      if (s.newRequests) a.insertAdjacentHTML('beforeend', `<span class="count">${s.newRequests}</span>`);
    } catch { /* не критично */ }
  }

  let renderSeq = 0;
  async function route() {
    if (!state.me) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const [head = '', param] = parts;
    const list = ROUTES[state.me.role];
    let entry = list.find(([p]) => p === head);
    let navPath = head;
    let render;
    let arg;
    if (param && SUBROUTES[head] && state.me.role !== 'student') {
      const [nav, title, fn] = SUBROUTES[head];
      navPath = nav;
      entry = [head, title];
      render = fn;
      arg = Number(param);
    } else if (!entry) {
      entry = list[0];
      navPath = '';
    }
    render = render || entry[3];
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === navPath));
    $('#app').classList.remove('nav-open');
    setTitle(entry[1]);
    const el = $('#content');
    const seq = ++renderSeq;
    el.innerHTML = '<div class="loader"></div>';
    try {
      const tmp = document.createElement('main');
      tmp.className = 'content';
      tmp.id = 'content';
      await render(tmp, arg);
      if (seq !== renderSeq) return; // пользователь уже ушёл на другую страницу
      el.replaceWith(tmp);
      window.scrollTo(0, 0);
    } catch (e) {
      if (seq !== renderSeq || !state.me) return;
      el.innerHTML = h`<div class="card"><p class="empty">${e.message}</p></div>`.s;
    }
  }
  const rerender = () => route();

  async function boot() {
    try {
      state.config = state.config || (await api('/api/config'));
      state.me = await fetch('/api/me').then((r) => (r.ok ? r.json() : null));
    } catch {
      $('#root').innerHTML = '<div class="loader"></div>';
      setTimeout(boot, 3000);
      return;
    }
    if (!state.me) return renderLogin();
    renderShell();
    route();
  }
  window.addEventListener('hashchange', route);

  // ================================================================ общие блоки
  function pairsList(items, { now = false, showGroup = false, journal = false } = {}) {
    if (!items.length) return h`<p class="empty">Пар нет — можно отдохнуть</p>`;
    return h`<ul class="list">${items.map((p) => h`<li class="${now && isNow(p.time) ? 'pair-now' : ''}">
      <span class="pair-no">${p.pair_no}<small>${p.time[0]}</small></span>
      <div class="grow">
        <div class="title">${p.subject}${now && isNow(p.time) ? h` <span class="badge new">идёт сейчас</span>` : ''}</div>
        <div class="muted small">${[showGroup ? `группа ${p.group_name}` : p.teacher, p.room && `ауд. ${p.room}`, `${p.time[0]}–${p.time[1]}`].filter(Boolean).join(' · ')}</div>
      </div>
      ${journal ? h`<a class="btn ghost sm" href="#/journal/${p.assignment_id}">Журнал</a>` : ''}
    </li>`)}</ul>`;
  }

  function newsList(news, { admin = false } = {}) {
    if (!news.length) return h`<p class="empty">Новостей пока нет</p>`;
    return h`<ul class="list">${news.map((n) => h`<li><div class="grow">
      <div class="small" style="color:var(--link);font-weight:700">${dtDate(n.created_at)}</div>
      <div class="title">${n.title}</div>
      <p class="muted" style="white-space:pre-line;margin-top:4px">${n.body}</p></div>
      ${admin ? h`<button class="btn danger sm" data-del-news="${n.id}" aria-label="Удалить новость">${icon('trash')}</button>` : ''}
    </li>`)}</ul>`;
  }

  function remarksList(list, { canDelete } = {}) {
    if (!list.length) return h`<p class="empty">Записей нет</p>`;
    return h`<div class="grid" style="gap:10px">${list.map((r) => h`<div class="remark ${r.kind}">
      <div class="k">${r.kind === 'praise' ? 'Благодарность' : 'Замечание'}</div>
      <p>${r.text}</p>
      <div class="small muted" style="display:flex;gap:8px;align-items:center">${r.author || ''} · ${dtDate(r.created_at)}
        ${canDelete && canDelete(r) ? h`<button class="btn ghost sm" style="margin-left:auto" data-del-remark="${r.id}">Удалить</button>` : ''}</div>
    </div>`)}</div>`;
  }

  /** Таблица успеваемости по предметам; month — 'YYYY-MM' или '' */
  function gradesTable(subjects, month = '') {
    if (!subjects.length) return h`<p class="empty">Предметы ещё не назначены</p>`;
    const rows = subjects.map((s) => {
      const marks = month ? s.marks.filter((m) => m.date.startsWith(month)) : s.marks;
      return { ...s, marks, avg: average(marks.map((m) => m.value)), abs: marks.filter((m) => m.value === 'н').length };
    });
    const total = average(rows.flatMap((r) => r.marks.map((m) => m.value)));
    return h`<div class="table-wrap"><table>
      <thead><tr><th>Предмет</th><th>Оценки</th><th class="num">Средний</th><th class="num">Пропуски</th></tr></thead>
      <tbody>${rows.map((r) => h`<tr>
        <td style="min-width:200px"><b>${r.subject}</b><div class="small muted">${r.teacher || 'преподаватель не назначен'}</div></td>
        <td style="min-width:220px"><div class="marks-line">${r.marks.filter((m) => m.value !== 'н').length ? r.marks.filter((m) => m.value !== 'н').map((m) => markEl(m.value, `${dLong(m.date)}${m.topic ? ` — ${m.topic}` : ''}${m.comment ? `: ${m.comment}` : ''}`)) : h`<span class="muted small">нет оценок</span>`}</div></td>
        <td class="num" style="min-width:110px"><span class="avg ${avgCls(r.avg)}">${avgFmt(r.avg)}</span>${r.avg != null ? bar(((r.avg - 2) / 3) * 100, avgColor(r.avg)) : ''}</td>
        <td class="num">${r.abs || h`<span class="muted">0</span>`}</td>
      </tr>`)}</tbody>
      <tfoot><tr><td><b>Итого</b></td><td></td><td class="num"><span class="avg ${avgCls(total)}">${avgFmt(total)}</span></td><td class="num"><b>${rows.reduce((a, r) => a + r.abs, 0)}</b></td></tr></tfoot>
    </table></div>`;
  }

  /** Сетка расписания. who: что показывать в ячейке — 'group' (для преподавателя) или 'teacher'. */
  function scheduleGrid(rows, { who = 'teacher', editable = false } = {}) {
    if (!rows.length) return h`<div class="card"><p class="empty">Расписание пока не составлено</p></div>`;
    const days = rows.some((r) => r.weekday === 6) ? 6 : 5;
    const maxPair = Math.max(4, ...rows.map((r) => r.pair_no));
    const todayWd = new Date().getDay() || 7;
    const bells = state.config.bells;
    const cell = (r) => h`<div class="slot filled"><div class="s">${r.subject}</div><div class="r">${who === 'group' ? `гр. ${r.group_name}` : r.teacher ? shortName(r.teacher) : ''}${r.room ? ` · ${r.room}` : ''}</div>
      ${editable ? h`<button class="del" data-del-slot="${r.id}" title="Убрать пару" aria-label="Убрать пару">×</button>` : ''}</div>`;
    const desktop = h`<div class="card sched-desktop" style="padding:12px"><div class="table-wrap"><table class="sched">
      <thead><tr><th class="time"></th>${WEEKDAYS.slice(0, days).map((d, i) => h`<th class="${i + 1 === todayWd ? 'today-col' : ''}">${d}</th>`)}</tr></thead>
      <tbody>${Array.from({ length: maxPair }, (_, i) => i + 1).map((p) => h`<tr>
        <td class="time"><b>${p}</b>${bells[p][0]}<br>${bells[p][1]}</td>
        ${Array.from({ length: days }, (_, d) => d + 1).map((d) => { const r = rows.find((x) => x.weekday === d && x.pair_no === p); return h`<td>${r ? cell(r) : h`<div class="slot"></div>`}</td>`; })}
      </tr>`)}</tbody></table></div></div>`;
    const mobile = h`<div class="grid sched-mobile">${Array.from({ length: days }, (_, d) => d + 1).map((d) => {
      const items = rows.filter((r) => r.weekday === d);
      return h`<section class="card day ${d === todayWd ? 'today' : ''}"><div class="day-head"><b>${WEEKDAYS[d - 1]}</b><span class="muted small">${items.length} ${plural(items.length, 'пара', 'пары', 'пар')}</span></div>
        ${items.length ? items.map((r) => h`<div class="lesson"><span class="pair-no">${r.pair_no}<small>${r.time[0]}</small></span><div><div class="subj">${r.subject}</div><div class="meta">${who === 'group' ? `группа ${r.group_name}` : r.teacher || ''}${r.room ? ` · ауд. ${r.room}` : ''}</div></div>
          ${editable ? h`<button class="btn danger sm" data-del-slot="${r.id}" aria-label="Убрать пару">${icon('trash')}</button>` : h`<span></span>`}</div>`) : h`<p class="empty">Нет пар</p>`}</section>`;
    })}</div>`;
    return h`${desktop}${mobile}`;
  }

  // ================================================================ студент
  function greeting() {
    const hr = new Date().getHours();
    return hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  async function studentHome(el) {
    const d = await api('/api/student/dashboard');
    const me = state.me;
    const isToday = d.day === d.today;
    el.innerHTML = h`
      <div class="greet"><div><h2>${greeting()}, ${firstName(me.full_name)}!</h2>
        <p>${fmtD(d.today, { weekday: 'long', day: 'numeric', month: 'long' })}${me.group ? ` · группа ${me.group.name}, ${me.group.course} курс` : ''}</p></div></div>
      <div class="grid kpi">
        <div class="card kpi-tile"><span class="label">Средний балл</span><span class="value avg ${avgCls(d.average)}">${avgFmt(d.average)}</span><span class="hint">по всем предметам за семестр</span></div>
        <div class="card kpi-tile"><span class="label">Посещаемость</span><span class="value">${d.attendance == null ? '—' : `${String(d.attendance).replace('.', ',')}%`}</span><div class="bar"><i style="width:${d.attendance ?? 0}%"></i></div></div>
        <div class="card kpi-tile"><span class="label">Пропуски</span><span class="value">${d.absences}</span><span class="hint">${plural(d.absences, 'пара', 'пары', 'пар')} за семестр</span></div>
        <div class="card kpi-tile"><span class="label">Справки</span><span class="value">${d.openRequests}</span><span class="hint"><a href="#/requests">${d.openRequests ? 'в работе или готовы' : 'заказать справку'}</a></span></div>
      </div>
      <div class="grid two">
        <section class="card"><h2 class="card-title">${isToday ? 'Пары сегодня' : `Пары в ${WEEKDAYS[0].toLowerCase()}`}<a class="btn ghost sm" href="#/diary">Дневник</a></h2>${pairsList(d.todays, { now: isToday })}</section>
        <section class="card"><h2 class="card-title">Последние оценки<a class="btn ghost sm" href="#/grades">Все</a></h2>
          ${d.recent.length ? h`<ul class="list">${d.recent.slice(0, 6).map((m) => h`<li>${markEl(m.value)}<div class="grow"><div class="title">${m.subject}</div><div class="small muted">${m.value === 'н' ? 'пропуск · ' : ''}${dLong(m.date)}${m.comment ? ` · ${m.comment}` : ''}</div></div></li>`)}</ul>` : h`<p class="empty">Оценок пока нет</p>`}</section>
        <section class="card"><h2 class="card-title">Домашние задания</h2>
          ${d.homework.length ? h`<ul class="list">${d.homework.map((w) => h`<li><span class="pair-no" style="width:auto;padding:6px 10px;color:var(--m3)">${icon('task')}</span><div class="grow"><div class="title">${w.subject}</div><div class="small">${w.homework}</div><div class="small muted">задано ${dLong(w.date)}</div></div></li>`)}</ul>` : h`<p class="empty">Заданий за неделю нет</p>`}</section>
        <section class="card"><h2 class="card-title">Замечания и благодарности</h2>${remarksList(d.remarks)}</section>
      </div>
      <section class="card"><h2 class="card-title">Новости колледжа<a class="btn ghost sm" href="#/news">Все новости</a></h2>${newsList(d.news)}</section>`.s;
  }

  let diaryAnchor = null;
  async function diaryPage(el) {
    diaryAnchor = diaryAnchor || localToday();
    const d = await api(`/api/student/diary?date=${diaryAnchor}`);
    const end = addDays(d.week_start, 5);
    const isCurrent = d.today >= d.week_start && d.today <= end;
    el.innerHTML = h`
      <div class="toolbar">
        <div class="week-nav">
          <button class="btn ghost icon-only" data-week="-7" aria-label="Предыдущая неделя">${icon('left')}</button>
          <span class="range">${dLong(d.week_start)} — ${dLong(end)}</span>
          <button class="btn ghost icon-only" data-week="7" aria-label="Следующая неделя">${icon('right')}</button>
        </div>
        ${isCurrent ? h`<span class="badge new">текущая неделя</span>` : h`<button class="btn ghost sm" data-week="0">К текущей неделе</button>`}
        <span class="spacer"></span>
        <span class="legend"><span>${markEl('5')} отлично</span><span>${markEl('н')} пропуск</span></span>
      </div>
      <div class="diary">${d.days.map((day) => h`<section class="card day ${day.date === d.today ? 'today' : ''}">
        <div class="day-head"><b>${WEEKDAYS[day.weekday - 1]}</b><span class="muted small">${dLong(day.date)}</span></div>
        ${day.items.length ? day.items.map((it) => h`<div class="lesson">
          <span class="pair-no">${it.pair_no}<small>${it.time ? it.time[0] : ''}</small></span>
          <div style="min-width:0">
            <div class="subj">${it.subject}</div>
            <div class="meta">${[it.teacher && shortName(it.teacher), it.room && `ауд. ${it.room}`].filter(Boolean).join(' · ')}</div>
            ${it.topic ? h`<div class="topic"><span class="muted">Тема:</span> ${it.topic}</div>` : ''}
            ${it.homework ? h`<div class="hw">${icon('task')}<span>${it.homework}</span></div>` : ''}
            ${it.comment ? h`<div class="small muted" style="margin-top:4px">${icon('chat')} ${it.comment}</div>` : ''}
          </div>
          <div>${it.mark ? markEl(it.mark, it.mark === 'н' ? 'Пропуск' : '') : ''}</div>
        </div>`) : h`<p class="empty">Нет занятий</p>`}
      </section>`)}</div>`.s;
    $$('[data-week]', el).forEach((b) => (b.onclick = () => {
      const n = Number(b.dataset.week);
      diaryAnchor = n ? addDays(d.week_start, n) : localToday();
      rerender();
    }));
  }

  async function gradesPage(el) {
    const subjects = await api('/api/student/grades');
    const months = [...new Set(subjects.flatMap((s) => s.marks.map((m) => m.date.slice(0, 7))))].sort();
    let month = '';
    const draw = () => {
      el.innerHTML = h`
        <div class="toolbar"><div class="tabs" role="tablist">
          <button role="tab" data-m="" aria-selected="${month === ''}">Весь семестр</button>
          ${months.map((m) => h`<button role="tab" data-m="${m}" aria-selected="${month === m}">${MONTHS[Number(m.slice(5)) - 1]}</button>`)}
        </div></div>
        <section class="card">${gradesTable(subjects, month)}</section>
        <p class="small muted">Наведите на оценку, чтобы увидеть дату и тему занятия. Средний балл считается без учёта пропусков.</p>`.s;
      $$('[data-m]', el).forEach((b) => (b.onclick = () => { month = b.dataset.m; draw(); }));
    };
    draw();
  }

  async function schedulePage(el) {
    const rows = await api('/api/schedule');
    const bells = state.config.bells;
    el.innerHTML = h`
      ${scheduleGrid(rows, { who: state.me.role === 'student' ? 'teacher' : 'group' })}
      <section class="card"><h2 class="card-title">Расписание звонков</h2>
        <div class="bells">${Object.entries(bells).map(([n, [a, b]]) => h`<div class="card bell ${isNow([a, b]) ? 'now' : ''}" style="box-shadow:none"><div class="n">${n} пара</div><div class="t">${a}</div><div class="muted small">до ${b}</div></div>`)}</div>
      </section>`.s;
  }

  async function studentRequests(el) {
    const list = await api('/api/student/requests');
    const types = state.config.requestTypes;
    el.innerHTML = h`
      <div class="grid two" style="align-items:start">
        <section class="card"><h2 class="card-title">Заказать справку</h2>
          <form data-req novalidate>
            <label for="rq-type">Вид справки</label>
            <select id="rq-type" name="type">${options(types.map((t) => [t, t]), types[0])}</select>
            <label for="rq-purpose">Куда предоставляется</label>
            <input id="rq-purpose" name="purpose" maxlength="300" placeholder="Например: по месту работы родителей">
            <label for="rq-copies">Количество экземпляров</label>
            <select id="rq-copies" name="copies">${options([1, 2, 3, 4, 5].map((n) => [n, n]), 1)}</select>
            <div class="form-error" data-err></div>
            <button class="btn" type="submit">${icon('plus')} Отправить заявку</button>
          </form>
        </section>
        <section class="card"><h2 class="card-title">Как получить справку</h2>
          <ol style="padding-left:20px;display:grid;gap:8px" class="muted">
            <li>Оформите заявку в форме слева.</li>
            <li>Учебная часть возьмёт её в работу — статус сменится на «В работе».</li>
            <li>Когда статус станет «Готова», заберите справку в учебной части с документом, удостоверяющим личность.</li>
          </ol>
        </section>
      </div>
      <section class="card"><h2 class="card-title">Мои заявки</h2>
        ${list.length ? h`<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Справка</th><th>Куда</th><th class="num">Экз.</th><th>Статус</th><th></th></tr></thead><tbody>
          ${list.map((r) => h`<tr><td class="nowrap">${dtDate(r.created_at)}</td><td><b>${r.type}</b>${r.answer ? h`<div class="small muted">${r.answer}</div>` : ''}</td><td>${r.purpose || '—'}</td><td class="num">${r.copies}</td>
            <td><span class="badge ${r.status}">${STATUS[r.status]}</span></td>
            <td>${r.status === 'new' ? h`<button class="btn ghost sm" data-cancel="${r.id}">Отменить</button>` : ''}</td></tr>`)}
        </tbody></table></div>` : h`<p class="empty">Заявок пока нет</p>`}
      </section>`.s;
    $('[data-req]', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('/api/student/requests', { method: 'POST', body: formData(f) });
        toast('Заявка отправлена');
        rerender();
      } catch (ex) { $('[data-err]', f).textContent = ex.message; }
    });
    $$('[data-cancel]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDlg('Отменить эту заявку?', 'Отменить заявку'))) return;
      try { await api(`/api/student/requests/${b.dataset.cancel}`, { method: 'DELETE' }); toast('Заявка отменена'); rerender(); } catch (ex) { toast(ex.message, true); }
    }));
  }

  // ================================================================ новости и профиль (все роли)
  async function newsPage(el) {
    const news = await api('/api/news?limit=50');
    const admin = state.me.role === 'admin';
    el.innerHTML = h`
      ${admin ? h`<section class="card"><h2 class="card-title">Опубликовать новость</h2><form data-news novalidate>
        <label for="n-title">Заголовок</label><input id="n-title" name="title" maxlength="160" required>
        <label for="n-body">Текст</label><textarea id="n-body" name="body" rows="4" maxlength="5000" required></textarea>
        <div class="form-error" data-err></div><button class="btn" type="submit">Опубликовать</button></form></section>` : ''}
      <section class="card">${newsList(news, { admin })}</section>`.s;
    if (!admin) return;
    $('[data-news]', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/admin/news', { method: 'POST', body: formData(e.target) }); toast('Новость опубликована'); rerender(); }
      catch (ex) { $('[data-err]', e.target).textContent = ex.message; }
    });
    $$('[data-del-news]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDlg('Удалить эту новость?'))) return;
      await api(`/api/admin/news/${b.dataset.delNews}`, { method: 'DELETE' }).catch((ex) => toast(ex.message, true));
      rerender();
    }));
  }

  async function profilePage(el) {
    const me = await api('/api/me');
    state.me = me;
    el.innerHTML = h`
      <section class="card profile-head">
        <span class="avatar lg">${initials(me.full_name)}</span>
        <div><h2>${me.full_name}</h2><p class="muted">${ROLE[me.role]}${me.group ? ` · группа ${me.group.name}` : ''}</p></div>
      </section>
      <div class="grid two" style="align-items:start">
        <section class="card"><h2 class="card-title">Учётная запись</h2>
          <dl class="info">
            <dt>Логин</dt><dd>${me.login}</dd>
            <dt>Роль</dt><dd>${ROLE[me.role]}</dd>
            ${me.group ? h`<dt>Группа</dt><dd>${me.group.name}, ${me.group.course} курс</dd><dt>Специальность</dt><dd>${me.group.specialty}</dd>` : ''}
          </dl>
          <form data-contacts novalidate style="margin-top:8px">
            <div class="row"><div><label for="p-email">E-mail</label><input id="p-email" name="email" type="email" value="${me.email}" maxlength="120"></div>
            <div><label for="p-phone">Телефон</label><input id="p-phone" name="phone" type="tel" value="${me.phone}" maxlength="30" placeholder="+7"></div></div>
            <div class="form-error" data-err></div><button class="btn" type="submit">Сохранить контакты</button>
          </form>
        </section>
        <section class="card"><h2 class="card-title">Смена пароля</h2>
          <form data-pw novalidate>
            <label for="pw-old">Текущий пароль</label><input id="pw-old" name="old" type="password" autocomplete="current-password" required>
            <label for="pw-new">Новый пароль</label><input id="pw-new" name="new" type="password" autocomplete="new-password" minlength="8" required>
            <label for="pw-new2">Повторите новый пароль</label><input id="pw-new2" name="new2" type="password" autocomplete="new-password" required>
            <p class="small muted" style="margin-top:6px">Не меньше 8 символов.</p>
            <div class="form-error" data-err></div><button class="btn" type="submit">${icon('key')} Сменить пароль</button>
          </form>
        </section>
      </div>`.s;
    $('[data-contacts]', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/me', { method: 'PUT', body: formData(e.target) }); $('[data-err]', e.target).textContent = ''; toast('Контакты сохранены'); }
      catch (ex) { $('[data-err]', e.target).textContent = ex.message; }
    });
    $('[data-pw]', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const d = formData(f);
      const err = $('[data-err]', f);
      if (d.new !== d.new2) { err.textContent = 'Новые пароли не совпадают'; return; }
      try { await api('/api/me/password', { method: 'POST', body: { old: d.old, new: d.new } }); f.reset(); err.textContent = ''; toast('Пароль изменён'); }
      catch (ex) { err.textContent = ex.message; }
    });
  }

  // ================================================================ преподаватель
  async function teacherHome(el) {
    const [d, asg] = await Promise.all([api('/api/teacher/dashboard'), api('/api/teacher/assignments')]);
    const isToday = d.day === localToday();
    const groups = [...new Set(asg.map((a) => a.group_name))];
    el.innerHTML = h`
      <div class="greet"><div><h2>${greeting()}, ${state.me.full_name.split(/\s+/).slice(1).join(' ') || state.me.full_name}!</h2>
        <p>${fmtD(localToday(), { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      <div class="grid kpi">
        <div class="card kpi-tile"><span class="label">Пар ${isToday ? 'сегодня' : 'в понедельник'}</span><span class="value">${d.todays.length}</span></div>
        <div class="card kpi-tile"><span class="label">Групп</span><span class="value">${groups.length}</span><span class="hint">${groups.join(', ')}</span></div>
        <div class="card kpi-tile"><span class="label">Предметов</span><span class="value">${new Set(asg.map((a) => a.subject)).size}</span></div>
        <div class="card kpi-tile"><span class="label">Кураторство</span><span class="value">${d.curated.length ? d.curated.map((g) => g.name).join(', ') : '—'}</span></div>
      </div>
      <div class="grid two">
        <section class="card"><h2 class="card-title">${isToday ? 'Мои пары сегодня' : 'Пары в понедельник'}<a class="btn ghost sm" href="#/schedule">Расписание</a></h2>${pairsList(d.todays, { now: isToday, showGroup: true, journal: true })}</section>
        <section class="card"><h2 class="card-title">Мои журналы<a class="btn ghost sm" href="#/journal">Все</a></h2>
          ${asg.length ? h`<ul class="list">${asg.map((a) => h`<li><span class="pair-no" style="width:auto;padding:6px 10px">${a.group_name}</span><div class="grow"><div class="title">${a.subject}</div><div class="small muted">${a.students} студ. · ${a.lessons} ${plural(a.lessons, 'занятие', 'занятия', 'занятий')}</div></div><a class="btn ghost sm" href="#/journal/${a.id}">Открыть</a></li>`)}</ul>` : h`<p class="empty">Нагрузка ещё не назначена учебной частью</p>`}
        </section>
      </div>
      <section class="card"><h2 class="card-title">Новости колледжа</h2>${newsList(d.news)}</section>`.s;
  }

  async function journalList(el) {
    const asg = await api('/api/teacher/assignments');
    const admin = state.me.role === 'admin';
    const byGroup = {};
    asg.forEach((a) => (byGroup[a.group_name] = byGroup[a.group_name] || []).push(a));
    el.innerHTML = h`
      ${admin ? h`<div class="toolbar"><input type="search" placeholder="Поиск по группе, предмету, преподавателю" data-filter style="max-width:420px"></div>` : ''}
      ${asg.length ? h`<div class="grid three">${Object.entries(byGroup).map(([g, list]) => h`<section class="card" data-card="${`${g} ${list.map((a) => `${a.subject} ${a.teacher || ''}`).join(' ')}`.toLowerCase()}">
        <h2 class="card-title">Группа ${g}<span class="badge">${list[0].course} курс · ${list[0].students} студ.</span></h2>
        <ul class="list">${list.map((a) => h`<li><div class="grow"><a class="title" href="#/journal/${a.id}" style="color:inherit">${a.subject}</a><div class="small muted">${admin ? `${a.teacher || 'без преподавателя'} · ` : ''}${a.lessons} ${plural(a.lessons, 'занятие', 'занятия', 'занятий')}</div></div><a class="btn ghost sm" href="#/journal/${a.id}">Открыть</a></li>`)}</ul>
      </section>`)}</div>` : h`<div class="card"><p class="empty">Журналов пока нет — учебная часть ещё не назначила вам нагрузку</p></div>`}`.s;
    const f = $('[data-filter]', el);
    if (f) f.oninput = () => $$('[data-card]', el).forEach((c) => (c.hidden = !c.dataset.card.includes(f.value.toLowerCase().trim())));
  }

  function lessonDialog({ asgId, lesson, defaults, onDone }) {
    const bells = state.config.bells;
    const l = lesson || defaults;
    const del = lesson ? h`<button type="button" class="btn danger left" data-del-lesson>${icon('trash')} Удалить</button>` : '';
    const dlg = dialog({
      title: lesson ? `Занятие ${dLong(lesson.date)}` : 'Новое занятие',
      body: h`<div class="row">
          <div><label for="ls-date">Дата</label><input id="ls-date" name="date" type="date" value="${l.date}" required></div>
          <div><label for="ls-pair">Пара</label><select id="ls-pair" name="pair_no">${options(Object.entries(bells).map(([n, [a, b]]) => [n, `${n} пара (${a}–${b})`]), l.pair_no)}</select></div>
        </div>
        <label for="ls-topic">Тема занятия</label><input id="ls-topic" name="topic" maxlength="200" value="${l.topic || ''}" placeholder="Например: Циклы for и while">
        <label for="ls-hw">Домашнее задание</label><textarea id="ls-hw" name="homework" maxlength="1000" rows="3" placeholder="Что задано к следующему занятию">${l.homework || ''}</textarea>
        ${lesson ? h`<p class="small muted" style="margin-top:8px">Удаление занятия удалит и все оценки за него.</p>` : ''}`,
      extra: del,
      submit: lesson ? 'Сохранить' : 'Добавить',
      onSubmit: async (data) => {
        if (lesson) await api(`/api/teacher/lessons/${lesson.id}`, { method: 'PUT', body: data });
        else await api('/api/teacher/lessons', { method: 'POST', body: { ...data, assignment_id: asgId } });
        toast(lesson ? 'Занятие сохранено' : 'Занятие добавлено');
        onDone();
      },
    });
    const delBtn = $('[data-del-lesson]', dlg);
    if (delBtn) delBtn.onclick = async () => {
      dlg.close();
      if (!(await confirmDlg(`Удалить занятие ${dLong(lesson.date)} вместе с оценками?`))) return;
      try { await api(`/api/teacher/lessons/${lesson.id}`, { method: 'DELETE' }); toast('Занятие удалено'); onDone(); } catch (ex) { toast(ex.message, true); }
    };
  }

  async function journalPage(el, id) {
    const data = await api(`/api/teacher/journal/${id}`);
    const { assignment: a, students, lessons, today } = data;
    const marks = new Map(data.marks.map((m) => [`${m.lesson_id}:${m.student_id}`, m]));
    const cellCls = (m) => `cell${m ? ` m${m.value}` : ''}${m && m.comment ? ' has-comment' : ''}`;
    const rowStats = (sid) => {
      const vals = lessons.map((l) => marks.get(`${l.id}:${sid}`)?.value).filter(Boolean);
      return { avg: average(vals), abs: vals.filter((v) => v === 'н').length };
    };
    setTitle(`Журнал · ${a.group_name}`);
    el.innerHTML = h`
      <div class="toolbar">
        <a class="btn ghost sm" href="#/journal">${icon('left')} Журналы</a>
        <div style="min-width:0"><b>${a.subject}</b> <span class="muted">· группа ${a.group_name}${state.me.role === 'admin' && a.teacher ? ` · ${a.teacher}` : ''}</span></div>
        <span class="spacer"></span>
        <button class="btn" data-add>${icon('plus')} Занятие</button>
      </div>
      ${!students.length ? h`<div class="card"><p class="empty">В группе нет студентов</p></div>` : !lessons.length ? h`<div class="card"><p class="empty">В журнале пока нет занятий — нажмите «Занятие», чтобы добавить первое.</p></div>` : h`
      <div class="journal-wrap"><table class="journal">
        <thead><tr><th class="stu">Студент</th>
          ${lessons.map((l) => h`<th><button class="lhead ${l.date === today ? 'today' : ''}" data-lesson="${l.id}" title="${l.topic || 'Тема не указана'}${l.homework ? `\nДЗ: ${l.homework}` : ''}"><b>${dShort(l.date)}</b><span>${l.pair_no} п.</span></button></th>`)}
          <th class="sum">Ср.</th><th class="sum">Н</th></tr></thead>
        <tbody>${students.map((s, i) => { const st = rowStats(s.id); return h`<tr>
          <th class="stu" scope="row"><span class="n">${i + 1}</span><a href="#/student/${s.id}">${s.full_name}</a></th>
          ${lessons.map((l, j) => { const m = marks.get(`${l.id}:${s.id}`); return h`<td><button class="${cellCls(m)}" data-l="${l.id}" data-s="${s.id}" data-r="${i}" data-c="${j}" title="${m && m.comment ? m.comment : ''}" aria-label="${s.full_name}, ${dShort(l.date)}">${m ? m.value : ''}</button></td>`; })}
          <td class="sum"><span class="avg ${avgCls(st.avg)}" data-avg="${s.id}">${avgFmt(st.avg)}</span></td><td class="sum" data-abs="${s.id}">${st.abs || ''}</td>
        </tr>`; })}</tbody>
      </table></div>
      <div class="legend"><span>Щелчок по клетке — выбор оценки.</span><span><kbd>5</kbd> <kbd>4</kbd> <kbd>3</kbd> <kbd>2</kbd> оценка</span><span><kbd>Н</kbd> пропуск</span><span><kbd>Del</kbd> очистить</span><span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> перемещение</span><span>Щелчок по дате — тема и ДЗ</span></div>`}
      ${lessons.length ? h`<section class="card"><h2 class="card-title">Темы и домашние задания</h2><div class="table-wrap"><table>
        <thead><tr><th>Дата</th><th class="num">Пара</th><th>Тема</th><th>Домашнее задание</th><th></th></tr></thead>
        <tbody>${[...lessons].reverse().map((l) => h`<tr><td class="nowrap">${fmtD(l.date, { day: 'numeric', month: 'short', weekday: 'short' })}</td><td class="num">${l.pair_no}</td><td>${l.topic || h`<span class="muted">—</span>`}</td><td>${l.homework || h`<span class="muted">—</span>`}</td>
          <td><button class="btn ghost sm" data-lesson="${l.id}" aria-label="Изменить">${icon('edit')}</button></td></tr>`)}</tbody></table></div></section>` : ''}`.s;

    const reload = () => rerender();
    const todaySlot = data.schedule.find((s) => s.weekday === (new Date().getDay() || 7));
    $('[data-add]', el).onclick = () => lessonDialog({ asgId: a.id, defaults: { date: today, pair_no: todaySlot ? todaySlot.pair_no : 1 }, onDone: reload });
    $$('[data-lesson]', el).forEach((b) => (b.onclick = () => lessonDialog({ asgId: a.id, lesson: lessons.find((l) => l.id === Number(b.dataset.lesson)), onDone: reload })));

    const wrap = $('.journal-wrap', el);
    if (!wrap) return;
    requestAnimationFrame(() => (wrap.scrollLeft = wrap.scrollWidth)); // к последним занятиям

    async function setMark(cell, value, comment = '') {
      const key = `${cell.dataset.l}:${cell.dataset.s}`;
      const prev = marks.get(key);
      if ((prev?.value || '') === value && (prev?.comment || '') === comment) return;
      const next = value ? { value, comment } : null;
      const paint = (m) => { cell.className = cellCls(m); cell.textContent = m ? m.value : ''; cell.title = m && m.comment ? m.comment : ''; };
      const stats = () => {
        const st = rowStats(Number(cell.dataset.s));
        const av = $(`[data-avg="${cell.dataset.s}"]`, el);
        av.textContent = avgFmt(st.avg);
        av.className = `avg ${avgCls(st.avg)}`;
        $(`[data-abs="${cell.dataset.s}"]`, el).textContent = st.abs || '';
      };
      next ? marks.set(key, next) : marks.delete(key);
      paint(next);
      stats();
      cell.classList.add('saving');
      try {
        await api('/api/teacher/marks', { method: 'PUT', body: { lesson_id: Number(cell.dataset.l), student_id: Number(cell.dataset.s), value, comment } });
      } catch (ex) {
        prev ? marks.set(key, prev) : marks.delete(key);
        paint(prev);
        stats();
        toast(ex.message, true);
      } finally {
        cell.classList.remove('saving');
      }
    }

    const cellAt = (r, c) => $(`.cell[data-r="${r}"][data-c="${c}"]`, wrap);
    let picker = null;
    const closePicker = () => { picker?.remove(); picker = null; };
    function openPicker(cell) {
      closePicker();
      const rect = cell.getBoundingClientRect();
      picker = document.createElement('div');
      picker.className = 'picker';
      picker.setAttribute('role', 'menu');
      picker.innerHTML = h`${['5', '4', '3', '2', 'н'].map((v) => h`<button type="button" class="m${v}" data-v="${v}" title="${v === 'н' ? 'Пропуск' : `Оценка ${v}`}">${v.toUpperCase()}</button>`)}
        <button type="button" data-v="" title="Очистить">${icon('x')}</button><button type="button" data-comment title="Комментарий">${icon('chat')}</button>`.s;
      document.body.append(picker);
      const pw = picker.offsetWidth;
      picker.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, rect.left + rect.width / 2 - pw / 2))}px`;
      picker.style.top = `${rect.bottom + 6 + 50 > window.innerHeight ? rect.top - 56 : rect.bottom + 6}px`;
      picker.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-comment')) { closePicker(); return commentDialog(cell); }
        setMark(cell, b.dataset.v, b.dataset.v ? marks.get(`${cell.dataset.l}:${cell.dataset.s}`)?.comment || '' : '');
        closePicker();
        cell.focus();
      };
      $('button', picker).focus();
      picker.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePicker(); cell.focus(); } });
    }
    function commentDialog(cell) {
      const m = marks.get(`${cell.dataset.l}:${cell.dataset.s}`);
      dialog({
        title: 'Оценка с комментарием',
        body: h`<label for="mc-v">Оценка</label><select id="mc-v" name="value">${options([['5', '5 — отлично'], ['4', '4 — хорошо'], ['3', '3 — удовлетворительно'], ['2', '2 — неудовлетворительно'], ['н', 'Н — пропуск']], m ? m.value : '5')}</select>
          <label for="mc-c">Комментарий (виден студенту)</label><input id="mc-c" name="comment" maxlength="200" value="${m ? m.comment : ''}" placeholder="Например: контрольная работа">`,
        onSubmit: (d) => setMark(cell, d.value, d.comment.trim()),
      });
    }
    document.addEventListener('click', function outside(e) {
      if (!document.body.contains(wrap)) { document.removeEventListener('click', outside); closePicker(); return; }
      if (picker && !picker.contains(e.target) && !e.target.closest('.cell')) closePicker();
    });
    wrap.addEventListener('scroll', closePicker, { passive: true });
    wrap.addEventListener('click', (e) => { const c = e.target.closest('.cell'); if (c) openPicker(c); });
    wrap.addEventListener('keydown', (e) => {
      const c = e.target.closest('.cell');
      if (!c || e.ctrlKey || e.metaKey || e.altKey) return;
      const r = Number(c.dataset.r), col = Number(c.dataset.c);
      const move = (dr, dc) => { const n = cellAt(r + dr, col + dc); if (n) { n.focus(); n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } };
      const k = e.key.toLowerCase();
      let v = null;
      if (['2', '3', '4', '5'].includes(k)) v = k;
      else if (k === 'н' || k === 'n' || e.code === 'KeyY') v = 'н';
      else if (k === 'delete' || k === 'backspace' || k === '0') v = '';
      if (v !== null) { e.preventDefault(); closePicker(); setMark(c, v); move(1, 0); return; }
      const arrows = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
      if (arrows[k]) { e.preventDefault(); closePicker(); move(...arrows[k]); }
    });
  }

  async function studentCard(el, id) {
    const d = await api(`/api/teacher/students/${id}`);
    const s = d.student;
    setTitle(shortName(s.full_name));
    el.innerHTML = h`
      <div class="toolbar"><button class="btn ghost sm" data-back>${icon('left')} Назад</button></div>
      <section class="card profile-head">
        <span class="avatar lg">${initials(s.full_name)}</span>
        <div style="flex:1;min-width:200px"><h2>${s.full_name}</h2><p class="muted">Студент · группа ${s.group_name || '—'}</p></div>
        <dl class="info">${s.email ? h`<dt>E-mail</dt><dd><a href="mailto:${s.email}">${s.email}</a></dd>` : ''}${s.phone ? h`<dt>Телефон</dt><dd>${s.phone}</dd>` : ''}</dl>
      </section>
      <section class="card"><h2 class="card-title">Успеваемость</h2>${gradesTable(d.grades)}</section>
      <div class="grid two" style="align-items:start">
        <section class="card"><h2 class="card-title">Замечания и благодарности</h2>${remarksList(d.remarks, { canDelete: (r) => state.me.role === 'admin' || r.author_id === state.me.id })}</section>
        <section class="card"><h2 class="card-title">Новая запись</h2>
          <form data-remark novalidate>
            <label for="rm-kind">Тип</label><select id="rm-kind" name="kind">${options([['praise', 'Благодарность'], ['remark', 'Замечание']], 'praise')}</select>
            <label for="rm-text">Текст (увидит студент)</label><textarea id="rm-text" name="text" maxlength="500" rows="3" required></textarea>
            <div class="form-error" data-err></div><button class="btn" type="submit">Добавить</button>
          </form>
        </section>
      </div>`.s;
    $('[data-back]', el).onclick = () => history.back();
    $('[data-remark]', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/teacher/remarks', { method: 'POST', body: { ...formData(e.target), student_id: s.id } }); toast('Запись добавлена'); rerender(); }
      catch (ex) { $('[data-err]', e.target).textContent = ex.message; }
    });
    $$('[data-del-remark]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDlg('Удалить эту запись?'))) return;
      try { await api(`/api/teacher/remarks/${b.dataset.delRemark}`, { method: 'DELETE' }); rerender(); } catch (ex) { toast(ex.message, true); }
    }));
  }

  // ================================================================ администратор
  async function adminHome(el) {
    const s = await api('/api/admin/stats');
    el.innerHTML = h`
      <div class="greet"><div><h2>${greeting()}, ${firstName(state.me.full_name)}!</h2><p>Панель учебной части</p></div></div>
      <div class="grid kpi">
        <a class="card kpi-tile" href="#/users" style="text-decoration:none;color:inherit"><span class="label">Студенты</span><span class="value">${s.students}</span><span class="hint">в ${s.groups} ${plural(s.groups, 'группе', 'группах', 'группах')}</span></a>
        <a class="card kpi-tile" href="#/users" style="text-decoration:none;color:inherit"><span class="label">Преподаватели</span><span class="value">${s.teachers}</span><span class="hint">${s.subjects} ${plural(s.subjects, 'предмет', 'предмета', 'предметов')}</span></a>
        <div class="card kpi-tile"><span class="label">Средний балл</span><span class="value avg ${avgCls(s.average)}">${avgFmt(s.average)}</span><span class="hint">по колледжу</span></div>
        <a class="card kpi-tile" href="#/requests" style="text-decoration:none;color:inherit"><span class="label">Новые заявки</span><span class="value">${s.newRequests}</span><span class="hint">на справки</span></a>
      </div>
      <section class="card"><h2 class="card-title">Успеваемость по группам</h2>
        ${s.groupStats.length ? h`<div class="table-wrap"><table><thead><tr><th>Группа</th><th class="num">Курс</th><th class="num">Студентов</th><th>Средний балл</th><th class="num">Пропуски</th></tr></thead><tbody>
          ${s.groupStats.map((g) => h`<tr><td><b>${g.name}</b></td><td class="num">${g.course}</td><td class="num">${g.students}</td>
            <td style="min-width:160px"><span class="avg ${avgCls(g.average)}">${avgFmt(g.average)}</span>${g.average != null ? bar(((g.average - 2) / 3) * 100, avgColor(g.average)) : ''}</td><td class="num">${g.absences}</td></tr>`)}
        </tbody></table></div>` : h`<p class="empty">Групп пока нет</p>`}
      </section>`.s;
  }

  const loadGroups = () => api('/api/admin/groups');
  const loadTeachers = () => api('/api/admin/users?role=teacher');

  async function adminUsers(el) {
    const groups = await loadGroups();
    const f = { role: '', group: '', q: '' };
    el.innerHTML = h`
      <div class="toolbar">
        <div class="tabs" role="tablist">${[['', 'Все'], ['student', 'Студенты'], ['teacher', 'Преподаватели'], ['admin', 'Администраторы']].map(([v, t]) => h`<button role="tab" data-role="${v}" aria-selected="${v === ''}">${t}</button>`)}</div>
        <select data-group aria-label="Группа">${options(groups.map((g) => [g.id, g.name]), '', { empty: 'Все группы' })}</select>
        <input type="search" data-q placeholder="Поиск по ФИО или логину" aria-label="Поиск">
        <span class="spacer"></span>
        <button class="btn" data-new>${icon('plus')} Пользователь</button>
      </div>
      <section class="card" data-table><div class="loader"></div></section>`.s;
    let users = [];
    const load = async () => {
      users = await api(`/api/admin/users?role=${f.role}&group=${f.group}&q=${encodeURIComponent(f.q)}`);
      const box = $('[data-table]', el);
      box.innerHTML = (users.length ? h`<div class="table-wrap"><table>
        <thead><tr><th>ФИО</th><th>Логин</th><th>Роль</th><th>Группа</th><th>Контакты</th><th></th></tr></thead>
        <tbody>${users.map((u) => h`<tr>
          <td><b>${u.full_name}</b></td><td class="nowrap">${u.login}</td><td><span class="badge role-${u.role}">${ROLE[u.role]}</span></td>
          <td>${u.group_name || h`<span class="muted">—</span>`}</td>
          <td class="small">${[u.email, u.phone].filter(Boolean).join(', ') || h`<span class="muted">—</span>`}</td>
          <td class="nowrap" style="text-align:right">
            ${u.role === 'student' ? h`<a class="btn ghost sm" href="#/student/${u.id}" title="Карточка студента">${icon('chart')}</a>` : ''}
            <button class="btn ghost sm" data-edit="${u.id}" title="Изменить" aria-label="Изменить">${icon('edit')}</button>
            <button class="btn ghost sm" data-reset="${u.id}" title="Сбросить пароль" aria-label="Сбросить пароль">${icon('key')}</button>
            ${u.id !== state.me.id ? h`<button class="btn danger sm" data-del="${u.id}" title="Удалить" aria-label="Удалить">${icon('trash')}</button>` : ''}
          </td></tr>`)}</tbody></table></div><p class="small muted" style="margin-top:12px">Найдено: ${users.length}</p>` : h`<p class="empty">Никого не найдено</p>`).s;
      $$('[data-edit]', box).forEach((b) => (b.onclick = () => userDialog(groups, users.find((u) => u.id === Number(b.dataset.edit)), load)));
      $$('[data-reset]', box).forEach((b) => (b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.reset));
        if (!(await confirmDlg(`Сбросить пароль пользователя ${u.full_name}? Старый пароль перестанет работать.`, 'Сбросить'))) return;
        try { const r = await api(`/api/admin/users/${u.id}/password`, { method: 'POST' }); showSecret('Новый пароль', `Передайте пользователю ${u.full_name} (логин ${u.login}) новый пароль:`, r.password); }
        catch (ex) { toast(ex.message, true); }
      }));
      $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.del));
        if (!(await confirmDlg(`Удалить пользователя ${u.full_name}? Все его оценки и заявки будут удалены.`))) return;
        try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); toast('Пользователь удалён'); load(); } catch (ex) { toast(ex.message, true); }
      }));
    };
    $$('[data-role]', el).forEach((b) => (b.onclick = () => {
      f.role = b.dataset.role;
      $$('[data-role]', el).forEach((x) => x.setAttribute('aria-selected', x === b));
      load();
    }));
    $('[data-group]', el).onchange = (e) => { f.group = e.target.value; load(); };
    let t;
    $('[data-q]', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 250); };
    $('[data-new]', el).onclick = () => userDialog(groups, null, load);
    await load();
  }

  function userDialog(groups, user, onDone) {
    const isNew = !user;
    const u = user || { role: 'student', full_name: '', login: '', email: '', phone: '', group_id: '' };
    const dlg = dialog({
      title: isNew ? 'Новый пользователь' : 'Редактирование',
      body: h`
        ${isNew ? h`<label for="u-role">Роль</label><select id="u-role" name="role">${options(Object.entries(ROLE), u.role)}</select>` : h`<p class="muted">${ROLE[u.role]} · логин <b>${u.login}</b></p>`}
        <label for="u-name">ФИО</label><input id="u-name" name="full_name" value="${u.full_name}" maxlength="120" required placeholder="Фамилия Имя Отчество">
        ${isNew ? h`<label for="u-login">Логин</label><input id="u-login" name="login" maxlength="64" required autocapitalize="off" spellcheck="false" placeholder="латиница, цифры, точка">` : ''}
        <div data-group-field ${u.role !== 'student' ? raw('hidden') : ''}><label for="u-group">Группа</label><select id="u-group" name="group_id">${options(groups.map((g) => [g.id, g.name]), u.group_id, { empty: '— выберите —' })}</select></div>
        <div class="row"><div><label for="u-email">E-mail</label><input id="u-email" name="email" type="email" value="${u.email}" maxlength="120"></div>
        <div><label for="u-phone">Телефон</label><input id="u-phone" name="phone" value="${u.phone}" maxlength="30"></div></div>
        ${isNew ? h`<label for="u-pw">Пароль</label><input id="u-pw" name="password" type="text" autocomplete="off" placeholder="оставьте пустым — сгенерируем">` : ''}`,
      submit: isNew ? 'Создать' : 'Сохранить',
      onSubmit: async (d) => {
        if (isNew) {
          const r = await api('/api/admin/users', { method: 'POST', body: d });
          showSecret('Пользователь создан', `Логин: ${d.login}. Передайте пользователю пароль:`, r.password);
        } else {
          await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: d });
          toast('Сохранено');
        }
        onDone();
      },
    });
    const role = $('#u-role', dlg);
    if (role) role.onchange = () => ($('[data-group-field]', dlg).hidden = role.value !== 'student');
  }

  async function adminGroups(el) {
    const [groups, subjects, teachers] = await Promise.all([loadGroups(), api('/api/admin/subjects'), loadTeachers()]);
    const tab = adminGroups.tab || 'groups';
    const tOpts = teachers.map((t) => [t.id, t.full_name]);
    el.innerHTML = h`
      <div class="tabs" role="tablist">${[['groups', 'Группы'], ['load', 'Нагрузка'], ['subjects', 'Предметы']].map(([v, t]) => h`<button role="tab" data-tab="${v}" aria-selected="${v === tab}">${t}</button>`)}</div>
      <div data-pane></div>`.s;
    $$('[data-tab]', el).forEach((b) => (b.onclick = () => { adminGroups.tab = b.dataset.tab; rerender(); }));
    const pane = $('[data-pane]', el);

    if (tab === 'groups') {
      pane.innerHTML = h`<section class="card"><h2 class="card-title">Учебные группы<button class="btn sm" data-new-group>${icon('plus')} Группа</button></h2>
        ${groups.length ? h`<div class="table-wrap"><table><thead><tr><th>Группа</th><th>Специальность</th><th class="num">Курс</th><th>Куратор</th><th class="num">Студентов</th><th></th></tr></thead><tbody>
          ${groups.map((g) => h`<tr><td><b>${g.name}</b></td><td>${g.specialty || '—'}</td><td class="num">${g.course}</td><td>${g.curator || h`<span class="muted">—</span>`}</td><td class="num">${g.students}</td>
            <td class="nowrap" style="text-align:right"><button class="btn ghost sm" data-edit-group="${g.id}" aria-label="Изменить">${icon('edit')}</button><button class="btn danger sm" data-del-group="${g.id}" aria-label="Удалить">${icon('trash')}</button></td></tr>`)}
        </tbody></table></div>` : h`<p class="empty">Групп пока нет</p>`}</section>`.s;
      const groupDlg = (g) => dialog({
        title: g ? `Группа ${g.name}` : 'Новая группа',
        body: h`<div class="row"><div><label for="g-name">Название</label><input id="g-name" name="name" value="${g ? g.name : ''}" maxlength="30" required placeholder="ПО-26"></div>
          <div class="grow-0" style="width:110px"><label for="g-course">Курс</label><select id="g-course" name="course">${options([1, 2, 3, 4].map((n) => [n, n]), g ? g.course : 1)}</select></div></div>
          <label for="g-spec">Специальность</label><input id="g-spec" name="specialty" value="${g ? g.specialty : ''}" maxlength="150">
          <label for="g-cur">Куратор</label><select id="g-cur" name="curator_id">${options(tOpts, g ? g.curator_id : '', { empty: '— не назначен —' })}</select>`,
        onSubmit: async (d) => {
          await api(g ? `/api/admin/groups/${g.id}` : '/api/admin/groups', { method: g ? 'PUT' : 'POST', body: d });
          toast('Сохранено');
          rerender();
        },
      });
      $('[data-new-group]', pane).onclick = () => groupDlg(null);
      $$('[data-edit-group]', pane).forEach((b) => (b.onclick = () => groupDlg(groups.find((g) => g.id === Number(b.dataset.editGroup)))));
      $$('[data-del-group]', pane).forEach((b) => (b.onclick = async () => {
        if (!(await confirmDlg('Удалить группу вместе с её нагрузкой, расписанием и журналами?'))) return;
        try { await api(`/api/admin/groups/${b.dataset.delGroup}`, { method: 'DELETE' }); toast('Группа удалена'); rerender(); } catch (ex) { toast(ex.message, true); }
      }));
    }

    if (tab === 'subjects') {
      pane.innerHTML = h`<section class="card"><h2 class="card-title">Предметы</h2>
        <form data-new-subject class="row" novalidate><div><label for="s-name" class="sr-only">Название</label><input id="s-name" name="name" maxlength="120" placeholder="Название нового предмета" required></div><button class="btn" type="submit">${icon('plus')} Добавить</button></form>
        <div class="form-error" data-err></div>
        <ul class="list" style="margin-top:6px">${subjects.map((s) => h`<li style="align-items:center"><div class="grow title">${s.name}</div><button class="btn danger sm" data-del-subject="${s.id}" aria-label="Удалить">${icon('trash')}</button></li>`)}</ul></section>`.s;
      $('[data-new-subject]', pane).addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api('/api/admin/subjects', { method: 'POST', body: formData(e.target) }); toast('Предмет добавлен'); rerender(); }
        catch (ex) { $('[data-err]', pane).textContent = ex.message; }
      });
      $$('[data-del-subject]', pane).forEach((b) => (b.onclick = async () => {
        if (!(await confirmDlg('Удалить предмет?'))) return;
        try { await api(`/api/admin/subjects/${b.dataset.delSubject}`, { method: 'DELETE' }); rerender(); } catch (ex) { toast(ex.message, true); }
      }));
    }

    if (tab === 'load') {
      if (!groups.length) { pane.innerHTML = h`<div class="card"><p class="empty">Сначала создайте группу</p></div>`.s; return; }
      const gid = adminGroups.group && groups.some((g) => g.id === adminGroups.group) ? adminGroups.group : groups[0].id;
      const asg = await api(`/api/admin/assignments?group=${gid}`);
      const free = subjects.filter((s) => !asg.some((a) => a.subject_id === s.id));
      pane.innerHTML = h`<section class="card">
        <h2 class="card-title">Нагрузка группы<select data-load-group style="width:auto">${options(groups.map((g) => [g.id, g.name]), gid)}</select></h2>
        <p class="small muted" style="margin-bottom:12px">Какие предметы изучает группа и кто их ведёт. Преподаватель получает доступ к журналу по своим предметам.</p>
        ${asg.length ? h`<div class="table-wrap"><table><thead><tr><th>Предмет</th><th>Преподаватель</th><th></th></tr></thead><tbody>
          ${asg.map((a) => h`<tr><td><b>${a.subject}</b></td><td style="min-width:240px"><select data-teacher="${a.id}" aria-label="Преподаватель">${options(tOpts, a.teacher_id, { empty: '— не назначен —' })}</select></td>
            <td class="nowrap" style="text-align:right"><a class="btn ghost sm" href="#/journal/${a.id}">Журнал</a> <button class="btn danger sm" data-del-asg="${a.id}" aria-label="Убрать">${icon('trash')}</button></td></tr>`)}
        </tbody></table></div>` : h`<p class="empty">Предметы не назначены</p>`}
        ${free.length ? h`<form data-new-asg class="row" style="margin-top:16px" novalidate>
          <div><label for="a-sub">Предмет</label><select id="a-sub" name="subject_id">${options(free.map((s) => [s.id, s.name]))}</select></div>
          <div><label for="a-t">Преподаватель</label><select id="a-t" name="teacher_id">${options(tOpts, '', { empty: '— не назначен —' })}</select></div>
          <button class="btn" type="submit">${icon('plus')} Добавить</button></form><div class="form-error" data-err></div>` : ''}
      </section>`.s;
      $('[data-load-group]', pane).onchange = (e) => { adminGroups.group = Number(e.target.value); rerender(); };
      $$('[data-teacher]', pane).forEach((s) => (s.onchange = async () => {
        try { await api(`/api/admin/assignments/${s.dataset.teacher}`, { method: 'PUT', body: { teacher_id: s.value } }); toast('Преподаватель назначен'); } catch (ex) { toast(ex.message, true); }
      }));
      $$('[data-del-asg]', pane).forEach((b) => (b.onclick = async () => {
        if (!(await confirmDlg('Убрать предмет из нагрузки группы? Пары в расписании по нему тоже исчезнут.', 'Убрать'))) return;
        try { await api(`/api/admin/assignments/${b.dataset.delAsg}`, { method: 'DELETE' }); rerender(); } catch (ex) { toast(ex.message, true); }
      }));
      const nf = $('[data-new-asg]', pane);
      if (nf) nf.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api('/api/admin/assignments', { method: 'POST', body: { ...formData(nf), group_id: gid } }); toast('Предмет добавлен'); rerender(); }
        catch (ex) { $('[data-err]', pane).textContent = ex.message; }
      });
    }
  }

  async function adminSchedule(el) {
    const groups = await loadGroups();
    if (!groups.length) { el.innerHTML = h`<div class="card"><p class="empty">Сначала создайте группу</p></div>`.s; return; }
    const gid = adminSchedule.group && groups.some((g) => g.id === adminSchedule.group) ? adminSchedule.group : groups[0].id;
    const [rows, asg] = await Promise.all([api(`/api/schedule?group=${gid}`), api(`/api/admin/assignments?group=${gid}`)]);
    const bells = state.config.bells;
    el.innerHTML = h`
      <div class="toolbar"><label for="sc-g" style="margin:0">Группа</label><select id="sc-g" data-group>${options(groups.map((g) => [g.id, g.name]), gid)}</select></div>
      <section class="card"><h2 class="card-title">Добавить пару</h2>
        ${asg.length ? h`<form data-add-slot class="row" novalidate>
          <div style="flex:2 1 220px"><label for="sl-a">Предмет</label><select id="sl-a" name="assignment_id">${options(asg.map((a) => [a.id, `${a.subject}${a.teacher ? ` — ${shortName(a.teacher)}` : ''}`]))}</select></div>
          <div><label for="sl-d">День</label><select id="sl-d" name="weekday">${options(WEEKDAYS.slice(0, 6).map((d, i) => [i + 1, d]))}</select></div>
          <div><label for="sl-p">Пара</label><select id="sl-p" name="pair_no">${options(Object.entries(bells).map(([n, [a]]) => [n, `${n} (${a})`]))}</select></div>
          <div style="flex:0 1 120px"><label for="sl-r">Аудитория</label><input id="sl-r" name="room" maxlength="20"></div>
          <button class="btn" type="submit">${icon('plus')} Добавить</button>
        </form><div class="form-error" data-err></div>` : h`<p class="muted">У группы нет предметов — добавьте их в разделе «Группы и предметы → Нагрузка».</p>`}
      </section>
      ${scheduleGrid(rows, { who: 'teacher', editable: true })}`.s;
    $('[data-group]', el).onchange = (e) => { adminSchedule.group = Number(e.target.value); rerender(); };
    const f = $('[data-add-slot]', el);
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/admin/schedule', { method: 'POST', body: formData(f) }); toast('Пара добавлена'); adminSchedule.group = gid; rerender(); }
      catch (ex) { $('[data-err]', el).textContent = ex.message; }
    });
    $$('[data-del-slot]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDlg('Убрать эту пару из расписания?', 'Убрать'))) return;
      try { await api(`/api/admin/schedule/${b.dataset.delSlot}`, { method: 'DELETE' }); rerender(); } catch (ex) { toast(ex.message, true); }
    }));
  }

  async function adminRequests(el) {
    const status = adminRequests.status ?? 'new';
    const list = await api(`/api/admin/requests?status=${status}`);
    el.innerHTML = h`
      <div class="tabs" role="tablist">${[['new', 'Новые'], ['processing', 'В работе'], ['ready', 'Готовы'], ['issued', 'Выданы'], ['rejected', 'Отклонены'], ['', 'Все']].map(([v, t]) => h`<button role="tab" data-st="${v}" aria-selected="${v === status}">${t}</button>`)}</div>
      <section class="card">${list.length ? h`<div class="table-wrap"><table>
        <thead><tr><th>Дата</th><th>Студент</th><th>Справка</th><th>Куда</th><th class="num">Экз.</th><th>Статус</th><th></th></tr></thead>
        <tbody>${list.map((r) => h`<tr><td class="nowrap">${dtFmt(r.created_at)}</td><td><b>${r.student}</b><div class="small muted">${r.group_name || ''}</div></td>
          <td>${r.type}${r.answer ? h`<div class="small muted">${r.answer}</div>` : ''}</td><td>${r.purpose || '—'}</td><td class="num">${r.copies}</td>
          <td><span class="badge ${r.status}">${STATUS[r.status]}</span></td>
          <td class="nowrap" style="text-align:right">${r.status === 'new' ? h`<button class="btn sm" data-quick="${r.id}">Взять в работу</button> ` : ''}<button class="btn ghost sm" data-edit-req="${r.id}" aria-label="Изменить">${icon('edit')}</button></td></tr>`)}
        </tbody></table></div>` : h`<p class="empty">Заявок нет</p>`}</section>`.s;
    $$('[data-st]', el).forEach((b) => (b.onclick = () => { adminRequests.status = b.dataset.st; rerender(); }));
    const save = async (id, body) => { await api(`/api/admin/requests/${id}`, { method: 'PUT', body }); toast('Статус обновлён'); refreshAdminBadge(); rerender(); };
    $$('[data-quick]', el).forEach((b) => (b.onclick = () => save(b.dataset.quick, { status: 'processing', answer: '' }).catch((ex) => toast(ex.message, true))));
    $$('[data-edit-req]', el).forEach((b) => (b.onclick = () => {
      const r = list.find((x) => x.id === Number(b.dataset.editReq));
      dialog({
        title: r.type,
        body: h`<p class="muted">${r.student}, ${r.group_name || ''} · ${r.copies} экз.${r.purpose ? ` · ${r.purpose}` : ''}</p>
          <label for="rq-s">Статус</label><select id="rq-s" name="status">${options(Object.entries(STATUS), r.status)}</select>
          <label for="rq-a">Комментарий для студента</label><input id="rq-a" name="answer" maxlength="300" value="${r.answer}" placeholder="Например: получить в каб. 104 с 9:00 до 17:00">`,
        onSubmit: (d) => save(r.id, d),
      });
    }));
  }

  boot();
})();
