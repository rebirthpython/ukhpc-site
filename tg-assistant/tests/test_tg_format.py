from app.tg_format import TG_LIMIT, md_to_tg_html, open_fence, split_markdown


def test_basic_markup():
    html = md_to_tg_html("## Заголовок\n**жирный** и *курсив*, `код` и [ссылка](https://example.com)\n- пункт")
    assert "<b>Заголовок</b>" in html
    assert "<b>жирный</b>" in html
    assert "<i>курсив</i>" in html
    assert "<code>код</code>" in html
    assert '<a href="https://example.com">ссылка</a>' in html
    assert "• пункт" in html


def test_escaping_and_code_block():
    html = md_to_tg_html("a < b & c\n```python\nif x < 1:\n    print('**no bold**')\n```")
    assert "a &lt; b &amp; c" in html
    assert '<pre><code class="language-python">' in html
    assert "**no bold**" in html  # внутри кода разметка не трогается
    assert "x &lt; 1" in html


def test_snake_case_not_italic():
    assert "<i>" not in md_to_tg_html("переменная snake_case_name и 2*3*4")


def test_blockquote():
    assert "<blockquote>цитата</blockquote>" in md_to_tg_html("> цитата")


def test_split_keeps_fences_balanced():
    md = "Начало\n```\n" + ("строка кода\n" * 600) + "```\nКонец"
    chunks = split_markdown(md)
    assert len(chunks) > 1
    for c in chunks:
        assert len(c) <= TG_LIMIT + 10
        assert open_fence(c) == ""  # каждый кусок — с закрытым блоком кода
    assert chunks[-1].endswith("Конец")


def test_split_short_text():
    assert split_markdown("привет") == ["привет"]
