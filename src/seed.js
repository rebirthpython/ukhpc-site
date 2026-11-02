'use strict';
// Демо-данные: группы, преподаватели, студенты, расписание, журнал с оценками с 1 сентября по сегодня.
const { run, tx } = require('./db');
const U = require('./util');

// Детерминированный генератор случайных чисел — данные одинаковы при каждом пересоздании базы
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = {
  'Программирование на Python': ['Переменные и типы данных', 'Условные операторы', 'Циклы for и while', 'Функции', 'Списки и кортежи', 'Словари и множества', 'Работа с файлами', 'Исключения', 'Модули и пакеты', 'Введение в ООП', 'Классы и наследование', 'Практическая работа'],
  'Базы данных': ['Реляционная модель', 'ER-диаграммы', 'Нормализация', 'SELECT и фильтрация', 'JOIN-запросы', 'Агрегатные функции', 'Индексы', 'Транзакции', 'Проектирование БД', 'Практическая работа'],
  'Веб-разработка': ['Структура HTML-документа', 'Семантическая вёрстка', 'CSS: селекторы', 'Flexbox', 'CSS Grid', 'Адаптивная вёрстка', 'JavaScript: основы', 'DOM и события', 'Формы и валидация', 'Fetch и API'],
  'Математика': ['Пределы функций', 'Производная', 'Правила дифференцирования', 'Исследование функции', 'Неопределённый интеграл', 'Определённый интеграл', 'Матрицы', 'Определители', 'Системы линейных уравнений', 'Контрольная работа'],
  'Физика': ['Кинематика', 'Законы Ньютона', 'Работа и энергия', 'Импульс', 'Молекулярная физика', 'Термодинамика', 'Электростатика', 'Постоянный ток', 'Лабораторная работа'],
  'Казахский язык': ['Сөйлеу әдебі', 'Зат есім', 'Сын есім', 'Етістік', 'Мәтінмен жұмыс', 'Іс қағаздары', 'Түйіндеме жазу', 'Диалог құру'],
  'Английский язык': ['Present Simple vs Continuous', 'Past tenses', 'Technical vocabulary', 'Reading: Computers', 'Future forms', 'Modal verbs', 'Writing a CV', 'Presentation skills'],
  'История Казахстана': ['Древние цивилизации', 'Тюркский каганат', 'Золотая Орда', 'Казахское ханство', 'XVIII век', 'Казахстан в составе Российской империи', 'Алаш', 'Независимый Казахстан'],
  'Электротехника': ['Электрическая цепь', 'Закон Ома', 'Законы Кирхгофа', 'Мощность в цепи', 'Переменный ток', 'Трёхфазные цепи', 'Трансформаторы', 'Лабораторная работа'],
  'Электроснабжение': ['Системы электроснабжения', 'Подстанции', 'Расчёт нагрузок', 'Кабельные линии', 'Защита сетей', 'Заземление', 'Компенсация реактивной мощности', 'Курсовое проектирование'],
  'Инженерная графика': ['Форматы и шрифты', 'Геометрические построения', 'Проекционное черчение', 'Аксонометрия', 'Разрезы и сечения', 'Резьбы', 'Эскизы деталей', 'Сборочный чертёж'],
  'Технология машиностроения': ['Производственный процесс', 'Базирование заготовок', 'Точность обработки', 'Припуски', 'Токарная обработка', 'Фрезерная обработка', 'Технологический маршрут', 'Нормирование'],
  'Материаловедение': ['Строение металлов', 'Механические свойства', 'Диаграмма железо-углерод', 'Термообработка', 'Стали и чугуны', 'Цветные металлы', 'Неметаллические материалы'],
  'Физическая культура': ['Лёгкая атлетика', 'Волейбол', 'Баскетбол', 'Общая физическая подготовка', 'Футбол', 'Сдача нормативов'],
};
const HOMEWORK = ['Конспект параграфа', 'Решить задачи из практикума', 'Подготовить доклад', 'Выполнить упражнения', 'Подготовиться к опросу', 'Доделать практическую работу', 'Повторить лекцию'];

const TEACHERS = [
  ['teacher', 'Ахметова Гульнара Серикбаевна', ['Программирование на Python', 'Базы данных', 'Веб-разработка']],
  ['t.ivanov', 'Иванов Сергей Петрович', ['Математика']],
  ['t.nurlanova', 'Нурланова Динара Ерлановна', ['Казахский язык', 'История Казахстана']],
  ['t.smirnova', 'Смирнова Ольга Владимировна', ['Английский язык']],
  ['t.bekov', 'Беков Арман Маратович', ['Физика', 'Электротехника', 'Электроснабжение']],
  ['t.kuznetsov', 'Кузнецов Андрей Николаевич', ['Инженерная графика', 'Технология машиностроения', 'Материаловедение']],
  ['t.omarov', 'Омаров Данияр Касымович', ['Физическая культура']],
];

const GROUPS = [
  { name: 'ПО-24', latin: 'po24', specialty: 'Программное обеспечение (по видам)', course: 3, curator: 'teacher',
    subjects: { 'Программирование на Python': 3, 'Базы данных': 2, 'Веб-разработка': 2, 'Математика': 2, 'Английский язык': 2, 'Казахский язык': 1, 'Физическая культура': 1 } },
  { name: 'ЭС-25', latin: 'es25', specialty: 'Электроснабжение (по отраслям)', course: 2, curator: 't.bekov',
    subjects: { 'Электротехника': 3, 'Электроснабжение': 2, 'Математика': 2, 'Физика': 2, 'Инженерная графика': 2, 'Казахский язык': 1, 'Физическая культура': 1 } },
  { name: 'ТМ-26', latin: 'tm26', specialty: 'Технология машиностроения (по видам)', course: 1, curator: 't.kuznetsov',
    subjects: { 'Математика': 3, 'Физика': 2, 'Материаловедение': 2, 'Технология машиностроения': 2, 'История Казахстана': 2, 'Английский язык': 1, 'Физическая культура': 1 } },
];

const STUDENTS = {
  'ПО-24': ['Абдрахманов Ерлан Тимурович', 'Байжанова Алия Нурлановна', 'Волков Дмитрий Александрович', 'Жакенова Мадина Ерболовна', 'Ким Виктория Олеговна', 'Мухаметжанов Нурсултан Айдарович', 'Петров Илья Сергеевич', 'Сагинтаева Камила Маратовна', 'Тлеубаев Алихан Бауржанович', 'Шевченко Анастасия Игоревна'],
  'ЭС-25': ['Айтжанов Бекзат Нурланович', 'Григорьев Максим Евгеньевич', 'Ергалиев Самат Канатович', 'Исмаилова Айгерим Даулетовна', 'Козлов Никита Андреевич', 'Оспанов Дамир Серикович', 'Романова Ксения Павловна', 'Сериков Арсен Ерланович', 'Утепов Азамат Болатович'],
  'ТМ-26': ['Алимов Тимур Русланович', 'Бекмуханов Ерасыл Асетович', 'Дмитриев Артём Олегович', 'Есенова Дана Муратовна', 'Калиев Ислам Жандосович', 'Лебедев Кирилл Витальевич', 'Нурбеков Алмас Ерикович', 'Сидоренко Павел Игоревич', 'Хамитов Руслан Айбекович'],
};

function seed() {
  const rand = rng(20260901);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const today = U.today();
  const [y, m] = today.split('-').map(Number);
  const semesterStart = `${m >= 9 ? y : y - 1}-09-01`;

  tx(() => {
    const userId = {};
    const addUser = (login, password, role, name, groupId = null) => {
      const r = run('INSERT INTO users (login, pass_hash, role, full_name, group_id, email) VALUES (?, ?, ?, ?, ?, ?)',
        login, U.hashPassword(password), role, name, groupId, '');
      return (userId[login] = Number(r.lastInsertRowid));
    };

    addUser('admin', 'admin123', 'admin', 'Жумабаева Айгерим Канатовна');
    for (const [login, name] of TEACHERS) addUser(login, 'teacher123', 'teacher', name);

    const subjectId = {};
    for (const name of Object.keys(TOPICS)) subjectId[name] = Number(run('INSERT INTO subjects (name) VALUES (?)', name).lastInsertRowid);
    const teacherOf = (subject) => userId[TEACHERS.find((t) => t[2].includes(subject))[0]];

    const teacherBusy = new Set(); // `${teacher}:${weekday}:${pair}`
    const slots = []; // { assignment, weekday, pair, subject }
    const students = {};

    GROUPS.forEach((g, gi) => {
      const groupId = Number(run('INSERT INTO groups (name, specialty, course, curator_id) VALUES (?, ?, ?, ?)', g.name, g.specialty, g.course, userId[g.curator]).lastInsertRowid);
      students[g.name] = STUDENTS[g.name].map((name, i) =>
        addUser(g.name === 'ПО-24' && i === 0 ? 'student' : `st.${g.latin}.${i + 1}`, 'student123', 'student', name, groupId),
      );

      // Нагрузка и расписание: раскладываем пары по дням, не допуская накладок у преподавателей
      const groupBusy = new Set();
      const queue = [];
      for (const [subject, perWeek] of Object.entries(g.subjects)) {
        const teacher = teacherOf(subject);
        const asg = Number(run('INSERT INTO assignments (group_id, subject_id, teacher_id) VALUES (?, ?, ?)', groupId, subjectId[subject], teacher).lastInsertRowid);
        for (let k = 0; k < perWeek; k++) queue.push({ asg, teacher, subject, k });
      }
      queue.sort((a, b) => a.k - b.k); // сначала по одной паре каждого предмета — равномернее по неделе
      let cursor = gi;
      for (const item of queue) {
        for (let tries = 0; tries < 30; tries++, cursor++) {
          const weekday = (cursor % 5) + 1;
          const pair = (Math.floor(cursor / 5) % 4) + 1 + (gi === 2 ? 1 : 0);
          if (groupBusy.has(`${weekday}:${pair}`) || teacherBusy.has(`${item.teacher}:${weekday}:${pair}`)) continue;
          groupBusy.add(`${weekday}:${pair}`);
          teacherBusy.add(`${item.teacher}:${weekday}:${pair}`);
          const room = item.subject === 'Физическая культура' ? 'Спортзал' : String(100 + gi * 100 + (Object.keys(TOPICS).indexOf(item.subject) % 20) + 1);
          run('INSERT INTO schedule (assignment_id, weekday, pair_no, room) VALUES (?, ?, ?, ?)', item.asg, weekday, pair, room);
          slots.push({ asg: item.asg, weekday, pair, subject: item.subject, group: g.name });
          cursor++;
          break;
        }
      }
    });

    // Журнал: занятия с 1 сентября по сегодня + оценки
    const ability = {};
    for (const list of Object.values(students)) for (const id of list) ability[id] = 3.1 + rand() * 1.8;
    const topicIdx = {};
    for (let d = semesterStart; d <= today; d = U.addDays(d, 1)) {
      const wd = U.weekday(d);
      if (wd > 6) continue;
      for (const s of slots.filter((x) => x.weekday === wd)) {
        const list = TOPICS[s.subject];
        const n = (topicIdx[s.asg] = (topicIdx[s.asg] ?? -1) + 1);
        const topic = list[n % list.length];
        const homework = rand() < 0.6 && s.subject !== 'Физическая культура' ? pick(HOMEWORK) : '';
        const lessonId = Number(run('INSERT INTO lessons (assignment_id, date, pair_no, topic, homework) VALUES (?, ?, ?, ?, ?)', s.asg, d, s.pair, topic, homework).lastInsertRowid);
        if (d === today) continue; // сегодняшние оценки ещё не выставлены
        const isTest = /Контрольная|Лабораторная|Практическая|нормативов/.test(topic);
        for (const st of students[s.group]) {
          const r = rand();
          let value = null;
          if (r < 0.04) value = 'н';
          else if (isTest || r < 0.34) value = String(Math.max(2, Math.min(5, Math.round(ability[st] + (rand() - 0.5) * 1.6))));
          if (value) run('INSERT INTO marks (lesson_id, student_id, value) VALUES (?, ?, ?)', lessonId, st, value);
        }
      }
    }

    const me = userId.student;
    const daysAgo = (n) => `${U.addDays(today, -n)} 10:00:00`;
    run(`INSERT INTO remarks (student_id, author_id, kind, text, created_at) VALUES (?, ?, 'praise', ?, ?)`, me, userId.teacher, 'Отличная защита практической работы по базам данных!', daysAgo(5));
    run(`INSERT INTO remarks (student_id, author_id, kind, text, created_at) VALUES (?, ?, 'remark', ?, ?)`, me, userId['t.ivanov'], 'Опоздание на пару без уважительной причины.', daysAgo(12));
    run(`INSERT INTO requests (student_id, type, purpose, copies, status, answer, created_at, updated_at) VALUES (?, ?, ?, 1, 'ready', ?, ?, ?)`,
      me, 'Справка с места учёбы', 'По месту требования', 'Готова, получить в каб. 104 с 9:00 до 17:00', daysAgo(3), daysAgo(2));
    run(`INSERT INTO requests (student_id, type, purpose, copies, status, created_at) VALUES (?, ?, ?, 2, 'new', ?)`,
      me, 'Справка в военкомат', 'Военкомат', daysAgo(0));

    const news = [
      ['Старт осеннего семестра', 'Дорогие студенты! Расписание на осенний семестр опубликовано в личном кабинете. Следите за изменениями в разделе «Расписание».', 60],
      ['Электронный дневник — теперь онлайн', 'Оценки, посещаемость и домашние задания доступны в личном кабинете в разделе «Дневник». Преподаватели заполняют журнал после каждой пары.', 20],
      ['Заказ справок без очереди', 'Справки с места учёбы, в военкомат и о размере стипендии можно заказать в личном кабинете. Когда справка будет готова, статус заявки сменится на «Готова».', 9],
      ['Неделя профессионального мастерства', 'На следующей неделе пройдут конкурсы профмастерства по специальностям. Регистрация — у кураторов групп.', 2],
    ];
    for (const [title, body, ago] of news) run('INSERT INTO news (title, body, author_id, created_at) VALUES (?, ?, ?, ?)', title, body, userId.admin, daysAgo(ago));
  });
}

module.exports = { seed };

if (require.main === module) {
  // npm run seed — пересоздать базу с демо-данными
  const { db } = require('./db');
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['marks', 'lessons', 'schedule', 'assignments', 'remarks', 'requests', 'news', 'sessions', 'subjects', 'users', 'groups']) db.exec(`DELETE FROM ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
  seed();
  console.log('Демо-данные загружены. Студент: student / student123, преподаватель: teacher / teacher123, админ: admin / admin123');
}
