"""Клиент для любого OpenAI-совместимого API (OpenRouter, Gemini, Groq, Ollama...)."""
import logging

import httpx

log = logging.getLogger(__name__)


class AIError(Exception):
    """Ошибка с понятным пользователю текстом."""


class AIClient:
    def __init__(self, base_url: str, api_key: str, models: tuple[str, ...],
                 max_tokens: int = 1500, timeout: float = 60) -> None:
        self.models = models
        self.max_tokens = max_tokens
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}", "X-Title": "Personal Assistant"},
            timeout=timeout,
        )

    async def chat(self, messages: list[dict]) -> str:
        """Пробует модели по очереди; первая успешная возвращает ответ."""
        problem = "неизвестная ошибка"
        for model in self.models:
            try:
                r = await self._http.post("/chat/completions", json={
                    "model": model, "messages": messages, "max_tokens": self.max_tokens,
                })
            except httpx.TimeoutException:
                problem = "модель слишком долго отвечает"
                log.warning("AI timeout: model=%s", model)
                continue
            except httpx.HTTPError as e:
                problem = "нет связи с AI-сервисом"
                log.warning("AI network error: model=%s err=%s", model, type(e).__name__)
                continue

            if r.status_code in (401, 403):
                raise AIError("⚠️ AI-сервис отклонил ключ доступа. Проверь AI_API_KEY в .env.")
            if r.status_code == 429:
                problem = "исчерпан лимит запросов у AI-провайдера"
                log.warning("AI rate limited: model=%s", model)
                continue
            if r.status_code != 200:
                problem = f"AI-сервис вернул ошибку {r.status_code}"
                log.warning("AI HTTP %s: model=%s body=%s", r.status_code, model, r.text[:300])
                continue

            try:
                data = r.json()
                text = (data["choices"][0]["message"].get("content") or "").strip()
            except (ValueError, KeyError, IndexError, TypeError):
                problem = "AI-сервис прислал некорректный ответ"
                log.warning("AI bad payload: model=%s body=%s", model, r.text[:300])
                continue
            if text:
                return text
            problem = "модель вернула пустой ответ"

        raise AIError(f"😔 Не получилось получить ответ: {problem}. Попробуй чуть позже.")

    async def close(self) -> None:
        await self._http.aclose()
