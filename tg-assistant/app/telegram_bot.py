"""Telegram-бот (aiogram 3): чат с ассистентом прямо в переписке + кнопка мини-приложения."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import html
import io
import logging
import time

from aiogram import Bot, Dispatcher, F, Router
from aiogram.enums import ChatAction, ParseMode
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LinkPreviewOptions,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from .assistant import Assistant, AssistantError
from .config import Config
from .storage import Storage
from .tg_format import TG_LIMIT, cut_point, md_to_tg_html, open_fence

log = logging.getLogger(__name__)

EDIT_INTERVAL = 1.3  # сек между обновлениями сообщения при стриминге
NO_PREVIEW = LinkPreviewOptions(is_disabled=True)


# ---------------------------------------------------------------------------
# Стриминг ответа в Telegram через редактирование сообщения
# ---------------------------------------------------------------------------
class TelegramStreamer:
    def __init__(self, bot: Bot, chat_id: int) -> None:
        self.bot = bot
        self.chat_id = chat_id
        self.msg_id: int | None = None
        self.text = ""  # весь ответ (markdown)
        self.offset = 0  # с какого символа начинается текущее сообщение
        self.prefix = ""  # открывающий ``` если блок кода перешёл в новое сообщение
        self.status = ""
        self.last_edit = 0.0
        self.shown = ""
        self._typing: asyncio.Task | None = None

    async def start(self) -> None:
        msg = await self.bot.send_message(self.chat_id, "💭")
        self.msg_id = msg.message_id
        self._typing = asyncio.create_task(self._keep_typing())

    async def _keep_typing(self) -> None:
        with contextlib.suppress(Exception):
            while True:
                await self.bot.send_chat_action(self.chat_id, ChatAction.TYPING)
                await asyncio.sleep(4.5)

    def _stop_typing(self) -> None:
        if self._typing:
            self._typing.cancel()
            self._typing = None

    async def on_delta(self, delta: str) -> None:
        self.text += delta
        self.status = ""
        if time.monotonic() - self.last_edit >= EDIT_INTERVAL:
            await self._flush(final=False)

    async def on_status(self, status: str) -> None:
        self.status = status
        await self._flush(final=False, force=True)

    async def _rollover(self) -> None:
        """Текущее сообщение заполнено — фиксируем его и начинаем новое."""
        while len(self.prefix + self.text[self.offset :]) > TG_LIMIT:
            live = self.prefix + self.text[self.offset :]
            cut = cut_point(live)
            head = live[:cut]
            fence = open_fence(head)
            if fence:
                head = head.rstrip("\n") + "\n```"
            await self._edit(head, html_mode=True)
            self.offset += cut - len(self.prefix)
            self.prefix = fence + "\n" if fence else ""
            msg = await self.bot.send_message(self.chat_id, "…")
            self.msg_id = msg.message_id
            self.shown = ""

    async def _flush(self, final: bool, force: bool = False) -> None:
        if not force and not final and time.monotonic() - self.last_edit < EDIT_INTERVAL:
            return
        await self._rollover()
        live = (self.prefix + self.text[self.offset :]).strip()
        if final:
            await self._edit(live or "…", html_mode=True)
            return
        shown = live + (" ▌" if live else "")
        if self.status:
            shown = (shown + "\n\n" if live else "") + self.status
        if shown:
            await self._edit(shown, html_mode=False)

    async def _edit(self, md: str, html_mode: bool) -> None:
        self.last_edit = time.monotonic()
        text = md_to_tg_html(md) if html_mode else md
        if not text.strip() or (text == self.shown):
            return
        try:
            await self.bot.edit_message_text(
                text=text,
                chat_id=self.chat_id,
                message_id=self.msg_id,
                parse_mode=ParseMode.HTML if html_mode else None,
                link_preview_options=NO_PREVIEW,
            )
            self.shown = text
        except TelegramRetryAfter as e:
            if html_mode:  # финальную версию обязательно доставляем
                await asyncio.sleep(e.retry_after)
                await self._edit(md, html_mode)
        except TelegramBadRequest as e:
            msg = str(e).lower()
            if "not modified" in msg:
                return
            if html_mode and ("parse" in msg or "entit" in msg or "tag" in msg):
                # разметка не понравилась Telegram — показываем как обычный текст
                await self._edit(md, html_mode=False)
                return
            log.warning("edit_message_text failed: %s", e)

    async def finish(self, text: str) -> None:
        self._stop_typing()
        streamed = self.text.strip()
        if text.startswith(streamed):
            # дописываем только хвост (например, пометку об обрезке), не сдвигая offset
            self.text = self.text.rstrip() + text[len(streamed):]
        elif self.offset == 0:
            self.text = text
        self.status = ""
        await self._flush(final=True)

    async def fail(self, notice: str) -> None:
        self._stop_typing()
        self.status = ""
        live = (self.prefix + self.text[self.offset :]).strip()
        await self._edit((live + "\n\n" if live else "") + notice, html_mode=False)

    async def replace(self, notice: str) -> None:
        """Заменить весь (частичный) ответ на уведомление — например, при отказе модели."""
        self._stop_typing()
        await self._edit(notice, html_mode=False)


# ---------------------------------------------------------------------------
# Хендлеры
# ---------------------------------------------------------------------------
def build_dispatcher(cfg: Config, assistant: Assistant, storage: Storage) -> Dispatcher:
    router = Router()
    notified: set[int] = set()

    def webapp_keyboard() -> InlineKeyboardMarkup | None:
        if not cfg.webapp_url.startswith("https://"):
            return None
        return InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="✨ Открыть приложение", web_app=WebAppInfo(url=cfg.webapp_url))]]
        )

    async def guard(message: Message) -> bool:
        user = message.from_user
        if user and cfg.is_allowed(user.id):
            return True
        uid = user.id if user else 0
        await message.answer(
            "Это личный ассистент, доступ только по приглашению 🔒\n\n"
            f"Твой Telegram ID: <code>{uid}</code>\n"
            "Отправь его владельцу бота — он добавит тебя.",
            parse_mode=ParseMode.HTML,
        )
        if uid and uid not in notified:
            notified.add(uid)
            name = html.escape(user.full_name if user else "?")
            uname = f" @{user.username}" if user and user.username else ""
            for admin in cfg.admin_ids:
                with contextlib.suppress(Exception):
                    await message.bot.send_message(
                        admin,
                        f"🔔 Новый пользователь хочет доступ: {name}{uname}\n"
                        f"ID: <code>{uid}</code>\n"
                        "Добавь его в ALLOWED_USER_IDS в .env и перезапусти бота.",
                        parse_mode=ParseMode.HTML,
                    )
        return False

    @router.message(CommandStart())
    async def cmd_start(message: Message) -> None:
        if not await guard(message):
            return
        name = cfg.user_name or (message.from_user.first_name if message.from_user else "")
        text = (
            f"Привет{', ' + html.escape(name) if name else ''}! Я {html.escape(cfg.assistant_name)} — твой личный ассистент 💫\n\n"
            "Пиши мне прямо сюда: вопросы, тексты, переводы, идеи, рецепты, планы. "
            "Можно присылать фото — разберу, что на них.\n\n"
            "/new — начать новый диалог\n/usage — расходы и лимиты\n/app — открыть приложение"
        )
        await message.answer(text, parse_mode=ParseMode.HTML, reply_markup=webapp_keyboard())

    @router.message(Command("help"))
    async def cmd_help(message: Message) -> None:
        if await guard(message):
            await cmd_start(message)

    @router.message(Command("app"))
    async def cmd_app(message: Message) -> None:
        if not await guard(message):
            return
        kb = webapp_keyboard()
        if kb:
            await message.answer("Открывай 👇", reply_markup=kb)
        else:
            await message.answer("Приложение пока не настроено (нужен WEBAPP_URL с https). Можно писать прямо здесь!")

    @router.message(Command("new", "reset"))
    async def cmd_new(message: Message) -> None:
        if not await guard(message):
            return
        storage.clear(message.from_user.id)
        await message.answer("Начинаем с чистого листа ✨ О чём поговорим?")

    @router.message(Command("usage"))
    async def cmd_usage(message: Message) -> None:
        if not await guard(message):
            return
        b = assistant.budget_status(message.from_user.id)

        def lim(v: float) -> str:
            return f"${v:.2f}" if v > 0 else "без лимита"

        lines = [
            "📊 <b>Расходы</b>",
            f"Сегодня: ${b['today']:.3f} из {lim(b['daily_limit'])}",
            f"За месяц: ${b['month']:.2f} из {lim(b['monthly_limit'])}",
        ]
        if b["per_user_daily_limit"] > 0:
            lines.append(f"Твои сегодня: ${b['user_today']:.3f} из {lim(b['per_user_daily_limit'])}")
        lines.append(f"\nМодель: <code>{html.escape(cfg.model)}</code>")
        await message.answer("\n".join(lines), parse_mode=ParseMode.HTML)

    @router.message(Command("stats"))
    async def cmd_stats(message: Message) -> None:
        if not message.from_user or message.from_user.id not in cfg.admin_ids:
            return
        rows = storage.stats_by_user()
        if not rows:
            await message.answer("В этом месяце запросов ещё не было.")
            return
        lines = ["📈 <b>Этот месяц по пользователям</b>"]
        for r in rows:
            lines.append(f"<code>{r['user_id']}</code>: {r['requests']} запросов, ${r['cost'] or 0:.2f}")
        await message.answer("\n".join(lines), parse_mode=ParseMode.HTML)

    async def run_reply(message: Message, text: str | None, image: tuple[str, str] | None) -> None:
        streamer = TelegramStreamer(message.bot, message.chat.id)
        try:
            content = Assistant.make_user_content(text, image)
        except AssistantError as e:
            await message.answer(str(e))
            return
        await streamer.start()
        try:
            async for ev in assistant.reply(message.from_user.id, content):
                if ev.kind == "delta":
                    await streamer.on_delta(ev.text)
                elif ev.kind == "status":
                    await streamer.on_status(ev.text)
                elif ev.kind == "done":
                    if ev.meta.get("refused"):
                        await streamer.replace("Извини, с этим я помочь не могу 🙏 Давай о чём-нибудь другом?")
                    else:
                        await streamer.finish(ev.text)
        except AssistantError as e:
            await streamer.fail(f"⚠️ {e}")
        except Exception:
            log.exception("reply failed")
            await streamer.fail("⚠️ Что-то пошло не так. Попробуй ещё раз.")

    async def download_b64(message: Message, file_id: str) -> str:
        buf = io.BytesIO()
        await message.bot.download(file_id, destination=buf)
        return base64.standard_b64encode(buf.getvalue()).decode()

    @router.message(F.photo)
    async def on_photo(message: Message) -> None:
        if not await guard(message):
            return
        # самый крупный вариант, но не больше ~1600px — этого хватает модели
        fitting = [p for p in message.photo if max(p.width, p.height) <= 1600]
        photo = fitting[-1] if fitting else message.photo[0]
        data = await download_b64(message, photo.file_id)
        await run_reply(message, message.caption, ("image/jpeg", data))

    @router.message(F.document.mime_type.in_({"image/jpeg", "image/png", "image/webp", "image/gif"}))
    async def on_image_doc(message: Message) -> None:
        if not await guard(message):
            return
        if (message.document.file_size or 0) > 5 * 1024 * 1024:
            await message.answer("Файл больше 5 МБ — пришли его как фото (со сжатием).")
            return
        data = await download_b64(message, message.document.file_id)
        await run_reply(message, message.caption, (message.document.mime_type, data))

    @router.message(F.text & ~F.text.startswith("/"))
    async def on_text(message: Message) -> None:
        if not await guard(message):
            return
        await run_reply(message, message.text, None)

    @router.message(F.voice | F.video_note | F.audio)
    async def on_voice(message: Message) -> None:
        if await guard(message):
            await message.answer("Голосовые я пока не слышу 🙈 Напиши текстом, пожалуйста.")

    @router.message()
    async def on_other(message: Message) -> None:
        if await guard(message):
            await message.answer("Я понимаю текст и фото 🙂")

    dp = Dispatcher()
    dp.include_router(router)
    return dp


async def setup_bot_ui(bot: Bot, cfg: Config) -> None:
    """Команды в меню и кнопка мини-приложения слева от поля ввода."""
    await bot.set_my_commands(
        [
            BotCommand(command="new", description="Новый диалог"),
            BotCommand(command="app", description="Открыть приложение"),
            BotCommand(command="usage", description="Расходы и лимиты"),
            BotCommand(command="help", description="Что я умею"),
        ]
    )
    if cfg.webapp_url.startswith("https://"):
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=cfg.assistant_name, web_app=WebAppInfo(url=cfg.webapp_url))
        )
    elif cfg.webapp_url:
        log.warning("WEBAPP_URL должен начинаться с https:// — Telegram не откроет мини-приложение по http.")
