import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand

from ai.client import AIClient
from bot.handlers import chat, commands
from bot.middlewares.access import AccessMiddleware
from config.settings import settings
from database.session import init_db


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    await init_db()
    ai = AIClient(settings.ai_base_url, settings.ai_api_key, settings.ai_models,
                  settings.ai_max_tokens, settings.ai_timeout)
    bot = Bot(settings.bot_token)
    dp = Dispatcher(ai=ai)  # ai попадёт в хендлеры как аргумент
    dp.message.outer_middleware(AccessMiddleware(settings.allowed_user_ids, settings.rate_limit_per_minute))
    dp.include_routers(commands.router, chat.router)

    await bot.set_my_commands([
        BotCommand(command="start", description="Приветствие"),
        BotCommand(command="help", description="Что я умею"),
        BotCommand(command="clear", description="Очистить историю"),
    ])
    try:
        await dp.start_polling(bot)
    finally:
        await ai.close()


if __name__ == "__main__":
    asyncio.run(main())
