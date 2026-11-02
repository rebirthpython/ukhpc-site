from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from memory import repository

router = Router()

HELP = """Что я умею сейчас:
• Просто пиши — отвечу, учитывая предыдущие сообщения.
• Помогу с учёбой, планами, идеями и вопросами.

Команды:
/start — приветствие
/help — эта справка
/clear — очистить историю диалога

Важно: я ИИ и могу ошибаться — проверяй важные факты.
Сообщения отправляются AI-провайдеру для генерации ответа."""


@router.message(CommandStart())
async def start(message: Message) -> None:
    name = message.from_user.first_name if message.from_user else ""
    await message.answer(
        f"Привет{', ' + name if name else ''}! 👋\n"
        "Я твой персональный ИИ-ассистент. Пиши о чём угодно — помогу, подскажу, поболтаю.\n\n"
        "/help — что я умею"
    )


@router.message(Command("help"))
async def help_(message: Message) -> None:
    await message.answer(HELP)


@router.message(Command("clear"))
async def clear(message: Message) -> None:
    deleted = await repository.clear_history(message.from_user.id)
    await message.answer(f"🧹 История очищена (удалено сообщений: {deleted}).")
