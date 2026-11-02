"""Точка входа: python -m app"""

import asyncio
import logging

from aiogram import Bot
from aiohttp import web

from .assistant import Assistant
from .config import load_config
from .storage import Storage
from .telegram_bot import build_dispatcher, setup_bot_ui
from .webapp_server import create_web_app


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log = logging.getLogger("app")

    cfg = load_config()
    if not cfg.allowed_user_ids and not cfg.admin_ids:
        log.warning("ALLOWED_USER_IDS и ADMIN_IDS пусты — бот никому не будет отвечать. "
                    "Напиши боту /start, он покажет твой ID.")

    storage = Storage(cfg.db_path, cfg.timezone)
    assistant = Assistant(cfg, storage)
    bot = Bot(cfg.telegram_token)
    dp = build_dispatcher(cfg, assistant, storage)

    runner = web.AppRunner(create_web_app(cfg, assistant, storage))
    await runner.setup()
    await web.TCPSite(runner, cfg.host, cfg.port).start()
    log.info("Мини-приложение: http://%s:%s (публичный адрес: %s)", cfg.host, cfg.port, cfg.webapp_url or "не задан")

    try:
        await setup_bot_ui(bot, cfg)
        me = await bot.get_me()
        log.info("Бот @%s запущен, модель %s", me.username, cfg.model)
        await dp.start_polling(bot)
    finally:
        await runner.cleanup()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
