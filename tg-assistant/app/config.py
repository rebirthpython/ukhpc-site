"""Настройки бота. Всё берётся из переменных окружения (или файла .env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "да"}


def _float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    return float(raw) if raw else default


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


def _ids(name: str) -> frozenset[int]:
    raw = os.getenv(name, "")
    return frozenset(int(x) for x in raw.replace(";", ",").split(",") if x.strip())


# Цены за 1M токенов (USD): input, output. Кэш: запись 1.25x input, чтение 0.1x input.
# Нужны только для подсчёта расходов и лимитов внутри бота — реальный счёт
# всегда смотри в console.anthropic.com.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5-1": (10.0, 50.0),
    "claude-fable-5": (10.0, 50.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
}
WEB_SEARCH_PRICE = 0.01  # $10 за 1000 поисков


@dataclass(frozen=True)
class Config:
    telegram_token: str
    anthropic_api_key: str
    allowed_user_ids: frozenset[int]
    admin_ids: frozenset[int]
    webapp_url: str

    host: str = "0.0.0.0"
    port: int = 8080

    model: str = "claude-opus-5-5"
    effort: str = "medium"
    max_tokens: int = 16000
    enable_web_search: bool = True
    enable_fallbacks: bool = True

    daily_budget_usd: float = 1.0
    monthly_budget_usd: float = 20.0
    per_user_daily_budget_usd: float = 0.0  # 0 = без отдельного лимита на человека

    assistant_name: str = "Луна"
    user_name: str = ""
    owner_name: str = ""
    persona_extra: str = ""
    user_city: str = ""
    timezone: str = "Europe/Moscow"

    max_history_messages: int = 60
    trim_to_messages: int = 30
    db_path: Path = field(default_factory=lambda: BASE_DIR / "data" / "assistant.db")

    dev_user_id: int = 0  # только для локальной отладки Mini App в обычном браузере

    def price_for(self, model: str) -> tuple[float, float]:
        for name, price in MODEL_PRICES.items():
            if model == name or model.startswith(name + "-"):
                return price
        return MODEL_PRICES.get(self.model, (5.0, 25.0))

    def is_allowed(self, user_id: int) -> bool:
        return user_id in self.allowed_user_ids or user_id in self.admin_ids


def load_config() -> Config:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    missing = [n for n, v in (("TELEGRAM_BOT_TOKEN", token), ("ANTHROPIC_API_KEY", api_key)) if not v]
    if missing:
        raise SystemExit(
            "Не заданы переменные: " + ", ".join(missing) + ". Скопируй .env.example в .env и заполни."
        )

    persona_file = BASE_DIR / "persona.txt"
    persona_extra = os.getenv("PERSONA_EXTRA", "").strip()
    if persona_file.exists():
        lines = persona_file.read_text(encoding="utf-8").splitlines()
        text = "\n".join(line for line in lines if not line.lstrip().startswith("#"))
        persona_extra = (persona_extra + "\n" + text).strip()

    max_hist = max(_int("MAX_HISTORY_MESSAGES", 60), 4)
    db_path = os.getenv("DB_PATH", "").strip()

    return Config(
        telegram_token=token,
        anthropic_api_key=api_key,
        allowed_user_ids=_ids("ALLOWED_USER_IDS"),
        admin_ids=_ids("ADMIN_IDS"),
        webapp_url=os.getenv("WEBAPP_URL", "").strip().rstrip("/"),
        host=os.getenv("HOST", "0.0.0.0").strip(),
        port=_int("PORT", 8080),
        model=os.getenv("CLAUDE_MODEL", "claude-opus-5-5").strip(),
        effort=os.getenv("CLAUDE_EFFORT", "medium").strip(),
        max_tokens=_int("MAX_TOKENS", 16000),
        enable_web_search=_bool("ENABLE_WEB_SEARCH", True),
        enable_fallbacks=_bool("ENABLE_FALLBACKS", True),
        daily_budget_usd=_float("DAILY_BUDGET_USD", 1.0),
        monthly_budget_usd=_float("MONTHLY_BUDGET_USD", 20.0),
        per_user_daily_budget_usd=_float("PER_USER_DAILY_BUDGET_USD", 0.0),
        assistant_name=os.getenv("ASSISTANT_NAME", "Луна").strip() or "Луна",
        user_name=os.getenv("USER_NAME", "").strip(),
        owner_name=os.getenv("OWNER_NAME", "").strip(),
        persona_extra=persona_extra,
        user_city=os.getenv("USER_CITY", "").strip(),
        timezone=os.getenv("TIMEZONE", "Europe/Moscow").strip(),
        max_history_messages=max_hist,
        trim_to_messages=min(max(_int("TRIM_TO_MESSAGES", max_hist // 2), 2), max_hist),
        db_path=Path(db_path) if db_path else BASE_DIR / "data" / "assistant.db",
        dev_user_id=_int("DEV_USER_ID", 0),
    )
