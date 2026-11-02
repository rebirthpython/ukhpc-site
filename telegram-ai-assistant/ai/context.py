"""Сборка контекста для модели с ограничением размера окна."""


def build_messages(system: str, history: list[dict], user_text: str, max_chars: int) -> list[dict]:
    """Берёт самые свежие сообщения истории, пока суммарный объём не превысит max_chars."""
    budget = max_chars - len(system) - len(user_text)
    picked: list[dict] = []
    for msg in reversed(history):
        budget -= len(msg["content"])
        if budget < 0:
            break
        picked.append(msg)
    picked.reverse()
    # История должна начинаться с реплики пользователя — так понятнее большинству моделей.
    while picked and picked[0]["role"] != "user":
        picked.pop(0)
    return [{"role": "system", "content": system}, *picked, {"role": "user", "content": user_text}]
