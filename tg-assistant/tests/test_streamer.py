import asyncio
from types import SimpleNamespace as NS

from aiogram.exceptions import TelegramBadRequest

from app import telegram_bot
from app.telegram_bot import TelegramStreamer
from app.tg_format import open_fence


class FakeBot:
    def __init__(self, reject_html=False):
        self.messages: dict[int, tuple[str, object]] = {}
        self.next_id = 1
        self.reject_html = reject_html

    async def send_message(self, chat_id, text, **kw):
        mid = self.next_id
        self.next_id += 1
        self.messages[mid] = (text, None)
        return NS(message_id=mid)

    async def edit_message_text(self, text, chat_id, message_id, parse_mode=None, **kw):
        if self.reject_html and parse_mode:
            raise TelegramBadRequest(method=None, message="Bad Request: can't parse entities")
        assert len(text) <= 4096
        self.messages[message_id] = (text, parse_mode)

    async def send_chat_action(self, *a, **kw):
        pass


async def stream(bot, text, step=97):
    s = TelegramStreamer(bot, chat_id=1)
    await s.start()
    for i in range(0, len(text), step):
        await s.on_delta(text[i : i + step])
    await s.finish(text)
    return s


def test_long_answer_split(monkeypatch):
    monkeypatch.setattr(telegram_bot, "EDIT_INTERVAL", 0)
    body = "\n\n".join(f"Абзац **{i}**: " + "слово " * 60 for i in range(40))
    code = "\n```python\n" + "print('x')\n" * 300 + "```\nГотово!"
    bot = FakeBot()
    asyncio.run(stream(bot, body + code))
    texts = [t for t, _ in bot.messages.values()]
    assert len(texts) >= 4
    assert all(pm == "HTML" for _, pm in bot.messages.values())
    assert texts[-1].endswith("Готово!")
    assert "<b>0</b>" in texts[0]
    joined = "".join(texts)
    assert joined.count("<pre>") == joined.count("</pre>")


def test_html_fallback_to_plain(monkeypatch):
    monkeypatch.setattr(telegram_bot, "EDIT_INTERVAL", 0)
    bot = FakeBot(reject_html=True)
    asyncio.run(stream(bot, "Привет **мир**"))
    text, pm = bot.messages[1]
    assert pm is None and text == "Привет **мир**"


def test_truncation_suffix(monkeypatch):
    monkeypatch.setattr(telegram_bot, "EDIT_INTERVAL", 0)
    bot = FakeBot()

    async def go():
        s = TelegramStreamer(bot, 1)
        await s.start()
        await s.on_delta("Длинный ответ")
        await s.finish("Длинный ответ\n\n…(обрезано)")

    asyncio.run(go())
    assert bot.messages[1][0].endswith("…(обрезано)")


def test_open_fence_helper():
    assert open_fence("a\n```js\ncode") == "```js"
    assert open_fence("a\n```js\ncode\n```") == ""
