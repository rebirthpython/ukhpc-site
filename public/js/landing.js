'use strict';
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtDate = (s) => new Date(s.replace(' ', 'T')).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 8 ? y : y - 1;
  document.querySelector('[data-year]').textContent = `${startYear}/${String(startYear + 1).slice(2)}`;
  document.querySelector('[data-year-now]').textContent = y;

  // Если уже вошли — кнопки ведут в кабинет
  fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((me) => {
    if (!me) return;
    document.querySelectorAll('[data-cabinet-link]').forEach((a) => {
      if (a.textContent.trim() === 'Войти') a.textContent = 'Кабинет';
    });
  }).catch(() => {});

  fetch('/api/news?limit=3').then((r) => r.json()).then((news) => {
    const box = document.querySelector('[data-news]');
    box.innerHTML = news.length
      ? news.map((n) => `<article class="card news-card"><span class="date">${esc(fmtDate(n.created_at))}</span><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></article>`).join('')
      : '<p class="empty">Новостей пока нет</p>';
  }).catch(() => (document.querySelector('[data-news]').innerHTML = '<p class="empty">Не удалось загрузить новости</p>'));

  fetch('/api/config').then((r) => r.json()).then(({ bells }) => {
    const mins = now.getHours() * 60 + now.getMinutes();
    const toMin = (t) => t.split(':').map(Number).reduce((h, m) => h * 60 + m);
    let current = null;
    let next = null;
    for (const [n, [a, b]] of Object.entries(bells)) {
      if (mins >= toMin(a) && mins < toMin(b)) current = n;
      if (!next && mins < toMin(a)) next = n;
    }
    document.querySelector('[data-bells]').innerHTML = Object.entries(bells)
      .map(([n, [a, b]]) => `<div class="card bell${n === current ? ' now' : ''}"><div class="n">${n} пара</div><div class="t">${a}</div><div class="muted small">до ${b}</div></div>`)
      .join('');
    const isSunday = now.getDay() === 0;
    const label = document.querySelector('[data-next-pair]');
    const sub = document.querySelector('[data-next-pair-sub]');
    if (isSunday) { label.textContent = 'Выходной'; sub.textContent = 'пары — с понедельника'; }
    else if (current) { label.textContent = `Идёт ${current} пара`; sub.textContent = `до ${bells[current][1]}`; }
    else if (next) { label.textContent = `${next} пара в ${bells[next][0]}`; sub.textContent = 'следующая по звонку'; }
    else { label.textContent = 'Пары окончены'; sub.textContent = 'до завтра!'; }
  }).catch(() => {});
})();
