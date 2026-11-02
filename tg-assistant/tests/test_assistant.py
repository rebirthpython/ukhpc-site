import asyncio
from dataclasses import replace
from pathlib import Path

import pytest

from app.assistant import Assistant, AssistantError, BudgetExceeded
from app.config import Config
from app.storage import Storage

from .fakes import FakeClient, turn


def make(tmp_path: Path, turns, **over):
    cfg = Config(
        telegram_token="1:x", anthropic_api_key="sk-test", allowed_user_ids=frozenset({1}),
        admin_ids=frozenset(), webapp_url="", db_path=tmp_path / "db.sqlite",
    )
    cfg = replace(cfg, **over)
    st = Storage(cfg.db_path, cfg.timezone)
    a = Assistant(cfg, st)
    a.client = FakeClient(turns)
    return a, st


async def collect(agen):
    return [e async for e in agen]


def run(coro):
    return asyncio.run(coro)


def test_reply_streams_and_saves(tmp_path):
    a, st = make(tmp_path, [turn([["При", "вет!"]])])
    events = run(collect(a.reply(1, a.make_user_content("Привет"))))
    assert [e.text for e in events if e.kind == "delta"] == ["При", "вет!"]
    assert events[-1].kind == "done" and events[-1].text == "Привет!"
    hist = st.history(1)
    assert [m["role"] for m in hist] == ["user", "assistant"]
    assert hist[1]["content"] == [{"type": "text", "text": "Привет!"}]
    assert st.spent_today() > 0

    call = a.client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["tools"][0]["type"] == "web_search_20260209"
    assert call["cache_control"] == {"type": "ephemeral"}
    # первое сообщение начинается с метки времени
    assert call["messages"][-1]["content"][0]["text"].startswith("[")


def test_history_prefix_is_stable(tmp_path):
    """Старые сообщения должны отправляться байт-в-байт одинаково (для кэша)."""
    a, st = make(tmp_path, [turn([["Один"]]), turn([["Два"]])])
    run(collect(a.reply(1, a.make_user_content("раз"))))
    run(collect(a.reply(1, a.make_user_content("два"))))
    first, second = a.client.calls
    assert second["messages"][: len(first["messages"])] == first["messages"]


def test_pause_turn_continues(tmp_path):
    a, st = make(tmp_path, [turn([["Ищу. "]], stop="pause_turn", search=True), turn([["Нашла!"]])])
    events = run(collect(a.reply(1, a.make_user_content("погода?"))))
    assert any(e.kind == "status" for e in events)
    assert events[-1].text == "Ищу. Нашла!"
    assert len(a.client.calls) == 2
    assert a.client.calls[1]["messages"][-1]["role"] == "assistant"


def test_refusal_not_saved(tmp_path):
    a, st = make(tmp_path, [turn([["частично"]], stop="refusal")])
    events = run(collect(a.reply(1, a.make_user_content("плохое"))))
    assert events[-1].meta["refused"] is True
    assert st.history(1) == []


def test_budget_blocks(tmp_path):
    a, st = make(tmp_path, [turn([["ok"]])], daily_budget_usd=0.000001)
    st.record_usage(1, "claude-opus-5-5", 1000, 1000, 0, 0, 0, 0.5)
    with pytest.raises(BudgetExceeded):
        run(collect(a.reply(1, a.make_user_content("привет"))))


def test_no_fallbacks_for_other_models(tmp_path):
    a, _ = make(tmp_path, [turn([["ok"]], model="claude-haiku-5-5")], model="claude-haiku-5-5", enable_web_search=False)
    run(collect(a.reply(1, a.make_user_content("привет"))))
    call = a.client.calls[0]
    assert "fallbacks" not in call and "betas" not in call and "tools" not in call


def test_trim_history(tmp_path):
    turns = [turn([[f"ответ {i}"]]) for i in range(5)]
    a, st = make(tmp_path, turns, max_history_messages=6, trim_to_messages=4)
    for i in range(5):
        run(collect(a.reply(1, a.make_user_content(f"вопрос {i}"))))
    hist = st.history(1)
    assert len(hist) <= 6 and hist[0]["role"] == "user"


def test_image_validation():
    with pytest.raises(AssistantError):
        Assistant.make_user_content("x", ("image/bmp", "AAAA"))
    content = Assistant.make_user_content(None, ("image/jpeg", "AAAA"))
    assert content[0]["type"] == "image" and content[1]["text"] == "Что на этом фото?"
