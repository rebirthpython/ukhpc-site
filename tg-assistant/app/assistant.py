"""Ядро ассистента: запросы к Claude API, история, лимиты расходов.

Используется и Telegram-чатом, и HTML5 мини-приложением — у одного
пользователя одна общая история, где бы он ни писал.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator

import anthropic

from .config import WEB_SEARCH_PRICE, Config
from .storage import Storage

log = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # лимит API на одно изображение
MAX_CONTINUATIONS = 4  # сколько раз продолжать ответ после pause_turn (веб-поиск)

# Серверный fallback (beta): если классификатор безопасности отклонит запрос,
# API сам повторит его на подходящей модели, а не вернёт отказ.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}

WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]


class AssistantError(Exception):
    """Ошибка, текст которой можно показать пользователю."""


class BudgetExceeded(AssistantError):
    pass


@dataclass
class Event:
    kind: str  # "delta" | "status" | "done"
    text: str = ""
    meta: dict[str, Any] = field(default_factory=dict)


class Assistant:
    def __init__(self, cfg: Config, storage: Storage) -> None:
        self.cfg = cfg
        self.storage = storage
        self.client = anthropic.AsyncAnthropic(api_key=cfg.anthropic_api_key)
        self._locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)
        self.system = self._build_system_prompt()

    # ------------------------------------------------------------------ prompt
    def _build_system_prompt(self) -> str:
        c = self.cfg
        lines = [
            f"Ты — {c.assistant_name}, личный ИИ-ассистент в Telegram. "
            "С тобой общаются в обычном чате бота и в его мини-приложении; история общая.",
        ]
        if c.user_name:
            lines.append(f"Основной пользователь — {c.user_name}. Обращайся по имени, когда это звучит естественно.")
        if c.owner_name:
            lines.append(f"Этого ассистента настроил {c.owner_name} — как подарок и помощника на каждый день.")
        if c.user_city:
            lines.append(f"Пользователь живёт в городе {c.user_city} (если не сказано другое).")
        lines.append(
            """
Как общаться:
- Отвечай на языке собеседника (по умолчанию — по-русски), тепло и по-дружески, но без приторности и лишних комплиментов.
- Сначала суть, потом детали. На простой вопрос — коротко; когда просят подробно — подробно.
- Оформление: короткие абзацы, списки, **жирный** для главного, `код` для кода. Не используй таблицы — в Telegram они не отображаются; вместо них списки.
- Если запрос неоднозначный и от этого сильно зависит ответ — задай один уточняющий вопрос.
- Если чего-то не знаешь или нет уверенности — скажи честно, не выдумывай факты.
- Про здоровье, деньги и право помогай по существу, а в серьёзных случаях советуй обратиться к специалисту.
- Можешь поддержать, если человеку грустно или тревожно: выслушай, без шаблонных фраз.

С чем помогаешь: вопросы и объяснения, учёба и работа, тексты, письма и переводы, идеи подарков и свиданий, рецепты, планы и списки дел, тренировки, разбор фотографий (одежда, еда, документы, скриншоты) и многое другое.

В начале каждого сообщения пользователя в квадратных скобках указано его местное время. Используй его, когда важны дата или время, но не упоминай без надобности."""
        )
        if c.enable_web_search:
            lines.append(
                "Для свежей информации (новости, погода, курсы, цены, расписания, события) используй веб-поиск "
                "и коротко указывай источник."
            )
        if c.persona_extra:
            lines.append("\nДополнительно:\n" + c.persona_extra)
        return "\n".join(lines).strip()

    # ------------------------------------------------------------------ budget
    def budget_status(self, user_id: int) -> dict[str, float]:
        return {
            "today": round(self.storage.spent_today(), 4),
            "user_today": round(self.storage.spent_today(user_id), 4),
            "month": round(self.storage.spent_month(), 4),
            "daily_limit": self.cfg.daily_budget_usd,
            "monthly_limit": self.cfg.monthly_budget_usd,
            "per_user_daily_limit": self.cfg.per_user_daily_budget_usd,
        }

    def check_budget(self, user_id: int) -> None:
        b = self.budget_status(user_id)
        if b["monthly_limit"] > 0 and b["month"] >= b["monthly_limit"]:
            raise BudgetExceeded("Лимит на этот месяц исчерпан 🙈 Он обновится 1-го числа.")
        if b["daily_limit"] > 0 and b["today"] >= b["daily_limit"]:
            raise BudgetExceeded("Лимит на сегодня исчерпан 🌙 Завтра снова смогу помогать!")
        if b["per_user_daily_limit"] > 0 and b["user_today"] >= b["per_user_daily_limit"]:
            raise BudgetExceeded("Твой лимит на сегодня исчерпан 🌙 Завтра продолжим!")

    def _cost(self, usage: Any, model: str) -> tuple[float, dict[str, int]]:
        p_in, p_out = self.cfg.price_for(model)
        tokens = {
            "input": usage.input_tokens or 0,
            "output": usage.output_tokens or 0,
            "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
            "cache_write": getattr(usage, "cache_creation_input_tokens", 0) or 0,
            "web_searches": 0,
        }
        stu = getattr(usage, "server_tool_use", None)
        if stu is not None:
            tokens["web_searches"] = getattr(stu, "web_search_requests", 0) or 0
        cost = (
            tokens["input"] * p_in
            + tokens["output"] * p_out
            + tokens["cache_write"] * p_in * 1.25
            + tokens["cache_read"] * p_in * 0.1
        ) / 1_000_000 + tokens["web_searches"] * WEB_SEARCH_PRICE
        return cost, tokens

    # ---------------------------------------------------------------- messages
    def _stamp(self, iso: str | None) -> str:
        dt = datetime.fromisoformat(iso) if iso else self.storage.now()
        return f"[{WEEKDAYS[dt.weekday()]}, {dt:%d.%m.%Y %H:%M}]"

    def _api_messages(self, history: list[dict[str, Any]], new_user: list[dict[str, Any]]) -> list[dict]:
        """История для API. Метка времени строится из сохранённого created_at,
        поэтому старые сообщения при каждом запросе байт-в-байт одинаковые —
        это сохраняет кэш промптов."""
        out: list[dict[str, Any]] = []
        for m in history:
            if m["role"] == "user":
                out.append({"role": "user", "content": [{"type": "text", "text": self._stamp(m["created_at"])}, *m["content"]]})
            else:
                out.append({"role": "assistant", "content": m["content"]})
        out.append({"role": "user", "content": [{"type": "text", "text": self._stamp(None)}, *new_user]})
        return out

    @staticmethod
    def _echo_content(content: list[Any]) -> list[Any]:
        """Подготовка ответа к повторной отправке (продолжение после pause_turn).
        После fallback посреди ответа API просит не возвращать блоки thinking /
        tool_use и непарные server_tool_use, стоящие до последнего блока fallback."""
        last_fb = max((i for i, b in enumerate(content) if b.type == "fallback"), default=-1)
        if last_fb < 0:
            return list(content)
        result_ids = {getattr(b, "tool_use_id", None) for b in content if b.type.endswith("_tool_result")}
        out = []
        for i, b in enumerate(content):
            if i < last_fb:
                if b.type in {"thinking", "redacted_thinking", "tool_use"}:
                    continue
                if b.type == "server_tool_use" and b.id not in result_ids:
                    continue
            out.append(b)
        return out

    @staticmethod
    def make_user_content(text: str | None, image: tuple[str, str] | None = None) -> list[dict[str, Any]]:
        """image = (media_type, base64_data)."""
        content: list[dict[str, Any]] = []
        if image:
            media_type, data = image
            if media_type not in ALLOWED_IMAGE_TYPES:
                raise AssistantError("Этот формат картинки не поддерживается — пришли JPG, PNG, GIF или WebP.")
            if len(data) * 3 // 4 > MAX_IMAGE_BYTES:
                raise AssistantError("Картинка слишком большая (максимум ~5 МБ).")
            content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}})
        text = (text or "").strip()
        if not text and image:
            text = "Что на этом фото?"
        if not text:
            raise AssistantError("Пустое сообщение 🙂")
        content.append({"type": "text", "text": text})
        return content

    # ------------------------------------------------------------------- reply
    async def reply(self, user_id: int, user_content: list[dict[str, Any]]) -> AsyncIterator[Event]:
        """Стримит ответ. События: delta (кусок текста), status (например, «ищу»),
        done (итоговый текст + meta). Ошибки — AssistantError с понятным текстом."""
        lock = self._locks[user_id]
        if lock.locked():
            yield Event("status", "⏳ Дописываю предыдущий ответ…")
        async with lock:
            self.check_budget(user_id)
            history = self.storage.history(user_id)
            messages = self._api_messages(history, user_content)

            parts: list[str] = []
            total_cost = 0.0
            stop_reason = None
            served_by = self.cfg.model

            for _ in range(MAX_CONTINUATIONS):
                kwargs = self._request_kwargs(messages)
                prev_block = ""
                try:
                    async with self.client.beta.messages.stream(**kwargs) as stream:
                        async for ev in stream:
                            if ev.type == "content_block_start":
                                btype = ev.content_block.type
                                if btype == "server_tool_use":
                                    yield Event("status", "🔎 Ищу в интернете…")
                                elif (
                                    btype == "text"
                                    and prev_block.endswith("_tool_result")
                                    and parts
                                    and not "".join(parts).endswith(("\n", " "))
                                ):
                                    # текст после результатов поиска — отделяем абзацем
                                    parts.append("\n\n")
                                    yield Event("delta", "\n\n")
                                prev_block = btype
                            elif ev.type == "content_block_delta" and ev.delta.type == "text_delta":
                                parts.append(ev.delta.text)
                                yield Event("delta", ev.delta.text)
                        final = await stream.get_final_message()
                except anthropic.APIError as e:
                    raise self._friendly_error(e) from e

                cost, tokens = self._cost(final.usage, final.model)
                total_cost += cost
                served_by = final.model
                self.storage.record_usage(
                    user_id, final.model, tokens["input"], tokens["output"],
                    tokens["cache_read"], tokens["cache_write"], tokens["web_searches"], cost,
                )
                stop_reason = final.stop_reason
                if stop_reason == "pause_turn":
                    # длинный серверный цикл (веб-поиск) — отправляем ход обратно, модель продолжит
                    messages.append({"role": "assistant", "content": self._echo_content(final.content)})
                    continue
                break

            text = "".join(parts).strip()
            if stop_reason == "refusal":
                yield Event("done", "", {"refused": True, "cost": total_cost, "model": served_by})
                return
            if not text:
                raise AssistantError("Ответ получился пустым 🤔 Попробуй переформулировать.")
            if stop_reason == "max_tokens":
                text += "\n\n…(ответ обрезан по длине — напиши «продолжи»)"

            self.storage.add_turn(
                user_id, user_content, text, self.cfg.max_history_messages, self.cfg.trim_to_messages
            )
            yield Event("done", text, {"refused": False, "cost": total_cost, "model": served_by})

    def _request_kwargs(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        c = self.cfg
        kwargs: dict[str, Any] = {
            "model": c.model,
            "max_tokens": c.max_tokens,
            "system": self.system,
            "messages": messages,
            "output_config": {"effort": c.effort},
            # авто-кэш: повторно отправляемая история стоит ~10% цены
            "cache_control": {"type": "ephemeral"},
        }
        if c.enable_web_search:
            tool: dict[str, Any] = {"type": "web_search_20260209", "name": "web_search", "max_uses": 5}
            loc = {"type": "approximate", "timezone": c.timezone}
            if c.user_city:
                loc["city"] = c.user_city
            tool["user_location"] = loc
            kwargs["tools"] = [tool]
        if c.enable_fallbacks and c.model in FALLBACK_MODELS:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
        return kwargs

    @staticmethod
    def _friendly_error(e: anthropic.APIError) -> AssistantError:
        log.error("Claude API error: %r", e)
        if isinstance(e, anthropic.RateLimitError):
            return AssistantError("Слишком много запросов подряд — подожди минутку 🙏")
        if isinstance(e, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
            return AssistantError("Проблема с ключом API — напиши тому, кто настраивал бота.")
        if isinstance(e, anthropic.BadRequestError):
            if "credit balance" in str(e).lower():
                return AssistantError("На API-аккаунте закончился баланс — напиши тому, кто настраивал бота 💸")
            return AssistantError("Запрос не прошёл. Попробуй /new и спроси ещё раз.")
        if isinstance(e, anthropic.APIStatusError):
            return AssistantError("Claude сейчас перегружен — попробуй через минуту.")
        if isinstance(e, anthropic.APIConnectionError):
            return AssistantError("Нет связи с сервером Claude — попробуй ещё раз чуть позже.")
        return AssistantError("Что-то пошло не так 😕 Попробуй ещё раз.")
