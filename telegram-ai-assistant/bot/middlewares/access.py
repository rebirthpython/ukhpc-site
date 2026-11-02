import logging
import time
from collections import defaultdict, deque

from aiogram import BaseMiddleware
from aiogram.types import Message

log = logging.getLogger(__name__)


class AccessMiddleware(BaseMiddleware):
    """Пускает только разрешённых пользователей и ограничивает частоту сообщений."""

    def __init__(self, allowed_ids: frozenset[int], per_minute: int) -> None:
        self.allowed_ids = allowed_ids
        self.per_minute = per_minute
        self.hits: dict[int, deque[float]] = defaultdict(deque)

    async def __call__(self, handler, event: Message, data: dict):
        user = event.from_user
        if user is None or user.id not in self.allowed_ids:
            log.warning("Доступ запрещён: user_id=%s", user.id if user else None)
            return None

        now = time.monotonic()
        q = self.hits[user.id]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            await event.answer("⏳ Слишком много сообщений подряд. Подожди минутку.")
            return None
        q.append(now)
        return await handler(event, data)
