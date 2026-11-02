"""Краткосрочная память: история диалога в SQLite (переживает перезапуск)."""
from datetime import datetime, time

from sqlalchemy import delete, func, select

from database.models import Message, utcnow
from database.session import Session


async def get_history(user_id: int, limit: int) -> list[dict]:
    async with Session() as s:
        rows = await s.scalars(
            select(Message).where(Message.user_id == user_id)
            .order_by(Message.id.desc()).limit(limit)
        )
        return [{"role": m.role, "content": m.content} for m in reversed(rows.all())]


async def add_exchange(user_id: int, user_text: str, reply: str) -> None:
    async with Session() as s:
        s.add_all([
            Message(user_id=user_id, role="user", content=user_text),
            Message(user_id=user_id, role="assistant", content=reply),
        ])
        await s.commit()


async def clear_history(user_id: int) -> int:
    async with Session() as s:
        result = await s.execute(delete(Message).where(Message.user_id == user_id))
        await s.commit()
        return result.rowcount or 0


async def count_today(user_id: int) -> int:
    """Сколько успешных запросов к ИИ было сегодня (UTC) — для защиты квоты."""
    midnight = datetime.combine(utcnow().date(), time.min)
    async with Session() as s:
        return await s.scalar(
            select(func.count()).select_from(Message).where(
                Message.user_id == user_id,
                Message.role == "user",
                Message.created_at >= midnight,
            )
        ) or 0
