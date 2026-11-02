"""SQLite: история диалогов и учёт расходов."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    role        TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);

CREATE TABLE IF NOT EXISTS usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    day           TEXT    NOT NULL,
    month         TEXT    NOT NULL,
    model         TEXT    NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cache_read    INTEGER NOT NULL,
    cache_write   INTEGER NOT NULL,
    web_searches  INTEGER NOT NULL,
    cost_usd      REAL    NOT NULL,
    created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_day ON usage(day);
CREATE INDEX IF NOT EXISTS idx_usage_month ON usage(month);
"""


class Storage:
    def __init__(self, path: Path, timezone: str = "Europe/Moscow") -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.tz = ZoneInfo(timezone)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        self.db.commit()

    # ---------- время ----------
    def now(self) -> datetime:
        return datetime.now(self.tz)

    def today(self) -> str:
        return self.now().strftime("%Y-%m-%d")

    def this_month(self) -> str:
        return self.now().strftime("%Y-%m")

    # ---------- история ----------
    def history(self, user_id: int) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY id", (user_id,)
        ).fetchall()
        return [
            {"role": r["role"], "content": json.loads(r["content"]), "created_at": r["created_at"]}
            for r in rows
        ]

    def add_turn(
        self,
        user_id: int,
        user_content: list[dict[str, Any]],
        assistant_text: str,
        max_messages: int,
        trim_to: int,
    ) -> None:
        ts = self.now().isoformat(timespec="seconds")
        with self.db:
            self.db.execute(
                "INSERT INTO messages(user_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
                (user_id, json.dumps(user_content, ensure_ascii=False), ts),
            )
            self.db.execute(
                "INSERT INTO messages(user_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)",
                (user_id, json.dumps([{"type": "text", "text": assistant_text}], ensure_ascii=False), ts),
            )
        self._trim(user_id, max_messages, trim_to)

    def _trim(self, user_id: int, max_messages: int, trim_to: int) -> None:
        """Обрезает старую историю пачкой (а не по одному сообщению), чтобы
        префикс диалога менялся редко и кэш промптов продолжал работать."""
        count = self.db.execute(
            "SELECT COUNT(*) FROM messages WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        if count <= max_messages:
            return
        keep = self.db.execute(
            "SELECT id, role FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, trim_to),
        ).fetchall()
        keep = list(reversed(keep))
        # история для API должна начинаться с сообщения пользователя
        while keep and keep[0]["role"] != "user":
            keep.pop(0)
        if not keep:
            return
        with self.db:
            self.db.execute(
                "DELETE FROM messages WHERE user_id = ? AND id < ?", (user_id, keep[0]["id"])
            )

    def clear(self, user_id: int) -> None:
        with self.db:
            self.db.execute("DELETE FROM messages WHERE user_id = ?", (user_id,))

    # ---------- расходы ----------
    def record_usage(
        self,
        user_id: int,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cache_read: int,
        cache_write: int,
        web_searches: int,
        cost_usd: float,
    ) -> None:
        with self.db:
            self.db.execute(
                """INSERT INTO usage(user_id, day, month, model, input_tokens, output_tokens,
                                     cache_read, cache_write, web_searches, cost_usd, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id, self.today(), self.this_month(), model, input_tokens, output_tokens,
                    cache_read, cache_write, web_searches, cost_usd,
                    self.now().isoformat(timespec="seconds"),
                ),
            )

    def spent_today(self, user_id: int | None = None) -> float:
        if user_id is None:
            row = self.db.execute("SELECT SUM(cost_usd) FROM usage WHERE day = ?", (self.today(),))
        else:
            row = self.db.execute(
                "SELECT SUM(cost_usd) FROM usage WHERE day = ? AND user_id = ?", (self.today(), user_id)
            )
        return float(row.fetchone()[0] or 0.0)

    def spent_month(self) -> float:
        row = self.db.execute("SELECT SUM(cost_usd) FROM usage WHERE month = ?", (self.this_month(),))
        return float(row.fetchone()[0] or 0.0)

    def stats_by_user(self) -> list[sqlite3.Row]:
        return self.db.execute(
            """SELECT user_id, COUNT(*) AS requests, SUM(cost_usd) AS cost
               FROM usage WHERE month = ? GROUP BY user_id ORDER BY cost DESC""",
            (self.this_month(),),
        ).fetchall()
