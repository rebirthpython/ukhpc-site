import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Не задана переменная окружения {name} (см. .env.example)")
    return value


@dataclass(frozen=True)
class Settings:
    bot_token: str
    allowed_user_ids: frozenset[int]
    ai_base_url: str
    ai_api_key: str
    ai_models: tuple[str, ...]
    ai_max_tokens: int
    ai_timeout: float
    history_limit: int
    history_max_chars: int
    rate_limit_per_minute: int
    daily_request_limit: int
    database_url: str


def load_settings() -> Settings:
    ids = frozenset(int(x) for x in _required("ALLOWED_USER_IDS").split(",") if x.strip())
    models = tuple(m.strip() for m in _required("AI_MODELS").split(",") if m.strip())
    return Settings(
        bot_token=_required("BOT_TOKEN"),
        allowed_user_ids=ids,
        ai_base_url=os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1"),
        ai_api_key=_required("AI_API_KEY"),
        ai_models=models,
        ai_max_tokens=int(os.getenv("AI_MAX_TOKENS", "1500")),
        ai_timeout=float(os.getenv("AI_TIMEOUT", "60")),
        history_limit=int(os.getenv("HISTORY_LIMIT", "30")),
        history_max_chars=int(os.getenv("HISTORY_MAX_CHARS", "12000")),
        rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "10")),
        daily_request_limit=int(os.getenv("DAILY_REQUEST_LIMIT", "45")),
        database_url=os.getenv("DATABASE_URL", "sqlite+aiosqlite:///bot.db"),
    )


settings = load_settings()
