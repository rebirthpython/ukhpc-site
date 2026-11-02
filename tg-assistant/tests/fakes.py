"""Поддельный клиент Anthropic для тестов — без сети и без расходов."""
from types import SimpleNamespace as NS


def usage(inp=100, out=50, searches=0):
    return NS(
        input_tokens=inp, output_tokens=out, cache_read_input_tokens=0, cache_creation_input_tokens=0,
        server_tool_use=NS(web_search_requests=searches),
    )


def turn(texts, stop="end_turn", search=False, model="claude-opus-5-5"):
    """Описание одного ответа API: список текстовых блоков (каждый блок — список дельт)."""
    events, content = [], []
    if search:
        events.append(NS(type="content_block_start", content_block=NS(type="server_tool_use")))
        events.append(NS(type="content_block_start", content_block=NS(type="web_search_tool_result")))
        content += [NS(type="server_tool_use", id="s1"), NS(type="web_search_tool_result", tool_use_id="s1")]
    for deltas in texts:
        events.append(NS(type="content_block_start", content_block=NS(type="text")))
        for d in deltas:
            events.append(NS(type="content_block_delta", delta=NS(type="text_delta", text=d)))
        content.append(NS(type="text", text="".join(deltas)))
    final = NS(content=content, usage=usage(searches=int(search)), model=model, stop_reason=stop)
    return events, final


class FakeStream:
    def __init__(self, events, final):
        self.events, self.final = events, final

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def __aiter__(self):
        async def gen():
            for e in self.events:
                yield e
        return gen()

    async def get_final_message(self):
        return self.final


class FakeClient:
    def __init__(self, turns):
        self.turns = list(turns)
        self.calls = []
        self.beta = NS(messages=NS(stream=self._stream))

    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(*self.turns.pop(0))
