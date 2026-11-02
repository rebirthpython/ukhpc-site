import asyncio

import httpx

from ai.client import AIClient, AIError
from ai.context import build_messages
from bot.text import split_text


def test_split_short():
    assert split_text("привет") == ["привет"]


def test_split_long_respects_limit():
    text = ("слово " * 2000).strip()
    parts = split_text(text, limit=100)
    assert all(len(p) <= 100 for p in parts)
    assert " ".join(parts) == text


def test_context_trims_old_messages():
    history = [{"role": "user", "content": "a" * 50}, {"role": "assistant", "content": "b" * 50},
               {"role": "user", "content": "c" * 10}, {"role": "assistant", "content": "d" * 10}]
    msgs = build_messages("sys", history, "q", max_chars=40)
    assert msgs[0]["role"] == "system" and msgs[-1]["content"] == "q"
    assert [m["content"] for m in msgs[1:-1]] == ["c" * 10, "d" * 10]


def _client(handler) -> AIClient:
    c = AIClient("https://example.test/v1", "key", ("m1", "m2"))
    c._http = httpx.AsyncClient(base_url="https://example.test/v1", transport=httpx.MockTransport(handler))
    return c


def test_client_falls_back_to_next_model():
    def handler(request: httpx.Request):
        assert request.url.path == "/v1/chat/completions"
        if b'"m1"' in request.content:
            return httpx.Response(429)
        return httpx.Response(200, json={"choices": [{"message": {"content": " ok "}}]})

    assert asyncio.run(_client(handler).chat([])) == "ok"


def test_client_reports_error():
    c = _client(lambda r: httpx.Response(503))
    try:
        asyncio.run(c.chat([]))
    except AIError as e:
        assert "503" in str(e)
    else:
        raise AssertionError("expected AIError")
