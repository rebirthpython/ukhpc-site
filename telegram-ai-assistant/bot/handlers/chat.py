from aiogram import Bot, F, Router
from aiogram.types import Message
from aiogram.utils.chat_action import ChatActionSender

from ai.client import AIClient, AIError
from ai.context import build_messages
from ai.prompts import SYSTEM_PROMPT
from bot.text import split_text
from config.settings import settings
from memory import repository

router = Router()


@router.message(F.text)
async def chat(message: Message, bot: Bot, ai: AIClient) -> None:
    user_id = message.from_user.id

    if await repository.count_today(user_id) >= settings.daily_request_limit:
        await message.answer("📵 Дневной лимит запросов к ИИ исчерпан, чтобы не сжечь квоту. До завтра!")
        return

    history = await repository.get_history(user_id, settings.history_limit)
    messages = build_messages(SYSTEM_PROMPT, history, message.text, settings.history_max_chars)

    try:
        async with ChatActionSender.typing(bot=bot, chat_id=message.chat.id):
            reply = await ai.chat(messages)
    except AIError as e:
        await message.answer(str(e))
        return

    await repository.add_exchange(user_id, message.text, reply)
    for part in split_text(reply):
        await message.answer(part)


@router.message()
async def unsupported(message: Message) -> None:
    await message.answer("Пока я понимаю только текст. Голос и фото добавим позже 🙂")
