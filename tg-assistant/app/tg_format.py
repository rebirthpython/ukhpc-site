"""Конвертация Markdown (как пишет Claude) в HTML-разметку Telegram
и нарезка длинных ответов на сообщения до 4096 символов."""

from __future__ import annotations

import html
import re

TG_LIMIT = 3800  # с запасом до 4096

_FENCE_RE = re.compile(r"^\s*```")
_CODE_BLOCK_RE = re.compile(r"```([\w#+.-]*)[ \t]*\n?(.*?)(?:```|\Z)", re.S)
_INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")
_LINK_RE = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)")
_BOLD_RE = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__", re.S)
_ITALIC_STAR_RE = re.compile(r"(?<![*\w])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![*\w])")
_ITALIC_UND_RE = re.compile(r"(?<![_\w])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![_\w])")
_STRIKE_RE = re.compile(r"~~(?=\S)(.+?)(?<=\S)~~")
_HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$", re.M)
_BULLET_RE = re.compile(r"^(\s*)[-*+]\s+", re.M)
_HR_RE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$", re.M)


def _esc(s: str) -> str:
    return html.escape(s, quote=False)


def _inline(text: str) -> str:
    """Форматирование обычного текста (вне блоков кода)."""
    stash: list[str] = []

    def keep(fragment: str) -> str:
        stash.append(fragment)
        return f"\x00{len(stash) - 1}\x00"

    text = _INLINE_CODE_RE.sub(lambda m: keep(f"<code>{_esc(m.group(1))}</code>"), text)
    text = _LINK_RE.sub(
        lambda m: keep(f'<a href="{html.escape(m.group(2), quote=True)}">{_esc(m.group(1))}</a>'), text
    )
    text = _esc(text)
    text = _HR_RE.sub("———", text)
    text = _HEADING_RE.sub(lambda m: f"<b>{m.group(1).replace('**', '')}</b>", text)
    text = _BULLET_RE.sub(lambda m: f"{m.group(1)}• ", text)
    text = _BOLD_RE.sub(lambda m: f"<b>{m.group(1) or m.group(2)}</b>", text)
    text = _STRIKE_RE.sub(lambda m: f"<s>{m.group(1)}</s>", text)
    text = _ITALIC_STAR_RE.sub(lambda m: f"<i>{m.group(1)}</i>", text)
    text = _ITALIC_UND_RE.sub(lambda m: f"<i>{m.group(1)}</i>", text)
    text = _blockquotes(text)
    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)


def _blockquotes(text: str) -> str:
    out: list[str] = []
    quote: list[str] = []
    for line in text.split("\n"):
        if line.startswith("&gt; ") or line == "&gt;":
            quote.append(line[5:])
            continue
        if quote:
            out.append("<blockquote>" + "\n".join(quote) + "</blockquote>")
            quote = []
        out.append(line)
    if quote:
        out.append("<blockquote>" + "\n".join(quote) + "</blockquote>")
    return "\n".join(out)


def md_to_tg_html(md: str) -> str:
    out: list[str] = []
    pos = 0
    for m in _CODE_BLOCK_RE.finditer(md):
        out.append(_inline(md[pos : m.start()]))
        lang, code = m.group(1), m.group(2).rstrip("\n")
        cls = f' class="language-{_esc(lang)}"' if lang else ""
        out.append(f"<pre><code{cls}>{_esc(code)}</code></pre>")
        pos = m.end()
    out.append(_inline(md[pos:]))
    return "".join(out).strip()


def open_fence(md: str) -> str:
    """Если текст обрывается внутри ```блока```, вернуть строку-открыватель."""
    opener = ""
    for line in md.split("\n"):
        if _FENCE_RE.match(line):
            opener = "" if opener else line.strip()
    return opener


def cut_point(md: str, limit: int = TG_LIMIT) -> int:
    """Где разрезать текст длиннее limit: по абзацу, строке, пробелу — что найдётся."""
    if len(md) <= limit:
        return len(md)
    window = md[:limit]
    for sep in ("\n\n", "\n", ". ", " "):
        i = window.rfind(sep)
        if i > limit // 3:
            return i + len(sep)
    return limit


def split_markdown(md: str, limit: int = TG_LIMIT) -> list[str]:
    """Нарезка на куски ≤ limit, не ломая блоки кода (закрываем и открываем заново)."""
    chunks: list[str] = []
    rest = md
    while rest:
        cut = cut_point(rest, limit)
        head, rest = rest[:cut], rest[cut:]
        fence = open_fence(head)
        if fence and rest:
            head = head.rstrip("\n") + "\n```"
            rest = fence + "\n" + rest
        if head.strip():
            chunks.append(head.strip("\n"))
    return chunks or [""]
