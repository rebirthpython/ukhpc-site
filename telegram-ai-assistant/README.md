# Персональный Telegram AI Assistant

Этап 1 (MVP): диалог с ИИ, история в SQLite, доступ только по Telegram ID, лимиты запросов.

## AI-провайдер

Работает с любым OpenAI-совместимым API. Провайдер меняется в `.env` (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODELS`).

- **OpenRouter** (по умолчанию) — модели с суффиксом `:free`. Лимиты бесплатного режима могут меняться, проверяй их на openrouter.ai.
- **Gemini** — `https://generativelanguage.googleapis.com/v1beta/openai`, ключ в Google AI Studio.

Если первая модель из `AI_MODELS` недоступна (429/5xx/таймаут), бот пробует следующую.

⚠️ Тексты сообщений отправляются выбранному AI-провайдеру — это нужно для генерации ответа.

## Запуск

```bash
cd telegram-ai-assistant
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # заполнить BOT_TOKEN, ALLOWED_USER_IDS, AI_API_KEY
python main.py
```

1. `BOT_TOKEN` — создать бота у @BotFather.
2. `ALLOWED_USER_IDS` — свой ID можно узнать у @userinfobot. Сообщения от чужих бот молча игнорирует и пишет их ID в лог.
3. `AI_API_KEY` — https://openrouter.ai/keys

## Проверка

- `/start` → приветствие.
- Написать «меня зовут Аня», затем «как меня зовут?» → бот помнит контекст.
- Перезапустить бота и повторить вопрос → история сохранилась (`bot.db`).
- `/clear` → история удалена.
- Написать с другого аккаунта → ответа нет, в логе `Доступ запрещён`.

Тесты: `pip install pytest && python -m pytest -q`

## Защита квоты

- `RATE_LIMIT_PER_MINUTE` — не больше N сообщений в минуту.
- `DAILY_REQUEST_LIMIT` — не больше N запросов к ИИ в сутки (UTC). Счётчик хранится в БД и не сбрасывается при перезапуске.
- `HISTORY_LIMIT` / `HISTORY_MAX_CHARS` — сколько истории отправляется модели.
