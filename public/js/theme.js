// Применяем сохранённую тему до отрисовки, чтобы не было «мигания»
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* хранилище недоступно — используем системную тему */ }
