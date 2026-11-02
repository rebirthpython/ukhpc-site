"""HTTP-сервер мини-приложения: отдаёт HTML5-интерфейс и API для чата.

Авторизация — через initData, которую Telegram передаёт в мини-приложение
и подписывает токеном бота. Подделать её без токена нельзя.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from typing import Any
from urllib.parse import parse_qsl

from aiohttp import web

from .assistant import Assistant, AssistantError, Event
from .config import BASE_DIR, Config
from .storage import Storage

log = logging.getLogger(__name__)

WEBAPP_DIR = BASE_DIR / "webapp"
INIT_DATA_MAX_AGE = 24 * 3600

CFG = web.AppKey("cfg", Config)
ASSISTANT = web.AppKey("assistant", Assistant)
STORAGE = web.AppKey("storage", Storage)
TASKS = web.AppKey("tasks", set)


class InitDataError(Exception):
    pass


def validate_init_data(init_data: str, bot_token: str, max_age: int = INIT_DATA_MAX_AGE) -> dict[str, Any]:
    """Проверка подписи Telegram WebApp initData. Возвращает объект user."""
    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError as e:
        raise InitDataError("bad format") from e
    data = dict(pairs)
    received = data.pop("hash", "")
    if not received:
        raise InitDataError("no hash")
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise InitDataError("bad signature")
    try:
        auth_date = int(data.get("auth_date", "0"))
    except ValueError as e:
        raise InitDataError("bad auth_date") from e
    if max_age and time.time() - auth_date > max_age:
        raise InitDataError("expired")
    try:
        user = json.loads(data["user"])
        int(user["id"])
    except (KeyError, ValueError, TypeError) as e:
        raise InitDataError("no user") from e
    return user


def _auth(request: web.Request) -> dict[str, Any]:
    cfg = request.app[CFG]
    header = request.headers.get("Authorization", "")
    if header.startswith("tma "):
        try:
            user = validate_init_data(header[4:], cfg.telegram_token)
        except InitDataError as e:
            raise web.HTTPUnauthorized(text=json.dumps({"error": f"initData: {e}"}), content_type="application/json")
    elif cfg.dev_user_id:
        user = {"id": cfg.dev_user_id, "first_name": "Dev"}
    else:
        raise web.HTTPUnauthorized(
            text=json.dumps({"error": "Открой приложение из Telegram"}), content_type="application/json"
        )
    if not cfg.is_allowed(int(user["id"])):
        raise web.HTTPForbidden(
            text=json.dumps({"error": f"Нет доступа. Твой Telegram ID: {user['id']}"}),
            content_type="application/json",
        )
    return user


def _history_for_ui(storage: Storage, user_id: int) -> list[dict[str, Any]]:
    out = []
    for m in storage.history(user_id):
        text = "\n".join(b.get("text", "") for b in m["content"] if b.get("type") == "text")
        has_image = any(b.get("type") == "image" for b in m["content"])
        out.append({"role": m["role"], "text": text, "image": has_image})
    return out


async def index(request: web.Request) -> web.StreamResponse:
    return web.FileResponse(WEBAPP_DIR / "index.html", headers={"Cache-Control": "no-cache"})


async def health(request: web.Request) -> web.Response:
    return web.json_response({"ok": True})


async def api_state(request: web.Request) -> web.Response:
    user = _auth(request)
    cfg, storage, assistant = request.app[CFG], request.app[STORAGE], request.app[ASSISTANT]
    uid = int(user["id"])
    return web.json_response(
        {
            "user": {"id": uid, "first_name": user.get("first_name", "")},
            "assistant_name": cfg.assistant_name,
            "user_name": cfg.user_name or user.get("first_name", ""),
            "model": cfg.model,
            "history": _history_for_ui(storage, uid),
            "budget": assistant.budget_status(uid),
        }
    )


async def api_reset(request: web.Request) -> web.Response:
    user = _auth(request)
    request.app[STORAGE].clear(int(user["id"]))
    return web.json_response({"ok": True})


async def api_chat(request: web.Request) -> web.StreamResponse:
    user = _auth(request)
    uid = int(user["id"])
    assistant = request.app[ASSISTANT]
    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise web.HTTPBadRequest(text=json.dumps({"error": "bad json"}), content_type="application/json")

    image = None
    img = body.get("image")
    if isinstance(img, dict) and img.get("data"):
        image = (str(img.get("media_type", "")), str(img["data"]))
    try:
        content = Assistant.make_user_content(body.get("text"), image)
    except AssistantError as e:
        return web.json_response({"error": str(e)}, status=400)

    # Генерация идёт в отдельной задаче: если мини-приложение закрыли посреди ответа,
    # ответ всё равно допишется и сохранится в истории.
    queue: asyncio.Queue[Event | Exception | None] = asyncio.Queue()

    async def produce() -> None:
        try:
            async for ev in assistant.reply(uid, content):
                queue.put_nowait(ev)
        except Exception as e:  # noqa: BLE001 — передаём ошибку клиенту
            if not isinstance(e, AssistantError):
                log.exception("chat failed")
            queue.put_nowait(e)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(produce())
    tasks = request.app[TASKS]
    tasks.add(task)
    task.add_done_callback(tasks.discard)

    resp = web.StreamResponse(
        headers={
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
    await resp.prepare(request)

    async def send(obj: dict[str, Any]) -> None:
        await resp.write((json.dumps(obj, ensure_ascii=False) + "\n").encode())

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, AssistantError):
                await send({"type": "error", "text": str(item)})
            elif isinstance(item, Exception):
                await send({"type": "error", "text": "Что-то пошло не так 😕 Попробуй ещё раз."})
            elif item.kind == "delta":
                await send({"type": "delta", "text": item.text})
            elif item.kind == "status":
                await send({"type": "status", "text": item.text})
            elif item.kind == "done":
                await send(
                    {
                        "type": "done",
                        "text": item.text,
                        "refused": bool(item.meta.get("refused")),
                        "budget": assistant.budget_status(uid),
                    }
                )
    except ConnectionResetError:
        log.info("client disconnected; the answer will still be saved")
        return resp
    await resp.write_eof()
    return resp


@web.middleware
async def security_headers(request: web.Request, handler):
    resp = await handler(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    return resp


def create_web_app(cfg: Config, assistant: Assistant, storage: Storage) -> web.Application:
    app = web.Application(client_max_size=8 * 1024 * 1024, middlewares=[security_headers])
    app[CFG] = cfg
    app[ASSISTANT] = assistant
    app[STORAGE] = storage
    app[TASKS] = set()
    app.router.add_get("/", index)
    app.router.add_get("/healthz", health)
    app.router.add_static("/vendor/", WEBAPP_DIR / "vendor", append_version=False)
    app.router.add_get("/api/state", api_state)
    app.router.add_post("/api/chat", api_chat)
    app.router.add_post("/api/reset", api_reset)
    return app

