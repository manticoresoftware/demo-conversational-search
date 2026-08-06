from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from conversational_search import create_chat_handler

BASE_DIR = Path(__file__).parent
MANTICORE_HTTP = "http://manticore:9308"
DEFAULT_TABLE = "convapparel_products"
CHAT_DEFAULT_MODEL = "assistant_gpt41mini"
VECTOR_FIELDS = "embedding_vector"
CHAT_MODEL_OPTIONS = {
    "model": "openrouter:openai/gpt-4.1-mini",
    "timeout": 60,
    "retrieval_limit": 5,
    "max_document_length": 0,
}
DEFAULT_CUSTOM_PROMPT = """You are a context-only answer writer for a shopping product search demo.

Answer using only the provided context. Do not use outside knowledge, memory, assumptions, or unsupported facts.

Write concise, helpful shopping recommendations. Prefer product details that are directly supported by the retrieved context.

Citation rules:
- Every recommendation or factual item must end with a citation.
- Never include a reference ID within the item itself.
- At the end of the item, append the reference context ID (`context[].id`) in the format `[ref:<id>]`.
- Do not duplicate the references at the end of the whole answer."""
SUPPORTED_SORTS = {"relevance", "title"}
INIT_MESSAGE = "Manticore is not initialized. Run ./scripts/init_manticore.sh, then reload the app."

app = FastAPI(title="ConvApparel Conversational Product Search", version="0.1.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def manticore_sql(query: str) -> dict[str, Any] | list[Any]:
    payload = urllib.parse.urlencode({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        f"{MANTICORE_HTTP.rstrip('/')}/sql",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except Exception:
            raise RuntimeError(f"Manticore HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(INIT_MESSAGE) from exc


@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


app.post("/api/assistant/chat")(
    create_chat_handler(
        manticore_sql=manticore_sql,
        sql_quote=sql_quote,
        default_table=DEFAULT_TABLE,
        default_model=CHAT_DEFAULT_MODEL,
        vector_fields=VECTOR_FIELDS,
        init_message=INIT_MESSAGE,
        default_prompt=DEFAULT_CUSTOM_PROMPT,
        chat_model_options=CHAT_MODEL_OPTIONS,
    )
)
