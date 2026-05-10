from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from conversational_search import create_chat_handler, parse_chat_result

BASE_DIR = Path(__file__).parent
MANTICORE_HTTP = "http://manticore:9308"
DEFAULT_TABLE = "fiqa_docs"
CHAT_DEFAULT_MODEL = "assistant"
VECTOR_FIELDS = "embedding_vector"
logger = logging.getLogger(__name__)

app = FastAPI(title="FIQA Comments Conversational Search", version="0.1.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
SUPPORTED_SORTS = {"relevance", "title"}
INIT_MESSAGE = "Manticore is not initialized. Run ./scripts/init_manticore.sh, then reload the app."


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def is_missing_fiqa_table_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return DEFAULT_TABLE in text and (
        "unknown local table" in text
        or "unknown table" in text
        or "table not found" in text
        or "doesn't exist" in text
    )


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


def comment_from_source(src: dict[str, Any], hit_id: Any = None) -> dict[str, Any]:
    comment_id = str(src.get("document_id") or src.get("id") or hit_id or "")
    content = src.get("content") or src.get("text") or ""
    return {
        "id": comment_id,
        "document_id": src.get("document_id") or comment_id,
        "title": src.get("title") or "",
        "description": content,
        "text": content,
        "url": src.get("url") or "",
        "source": src.get("source") or "",
    }


def rows_from_manticore(payload: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("hits"), dict):
        hits = payload.get("hits", {}).get("hits", [])
        return [
            comment_from_source(hit.get("_source", {}), hit.get("_id"))
            for hit in hits
            if isinstance(hit, dict) and isinstance(hit.get("_source"), dict)
        ]

    blocks = [payload] if isinstance(payload, dict) else [p for p in payload if isinstance(p, dict)]
    rows: list[dict[str, Any]] = []
    for block in blocks:
        if "columns" not in block or "data" not in block:
            continue
        columns = [
            next(iter(col.keys())) if isinstance(col, dict) and col else col
            for col in block.get("columns", [])
            if isinstance(col, (dict, str))
        ]
        for row in block.get("data", []):
            if isinstance(row, list):
                rows.append(comment_from_source(dict(zip(columns, row))))
            elif isinstance(row, dict):
                rows.append(comment_from_source(row))
    return rows


def query_comments_from_manticore(
    q: str,
    sort: str,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    base = f"FROM {DEFAULT_TABLE}"
    if q:
        where_sql = f" WHERE MATCH({sql_quote(q)})"
        order_sql = " ORDER BY WEIGHT() DESC, id DESC"
    elif sort == "title":
        where_sql = ""
        order_sql = " ORDER BY title ASC, id DESC"
    else:
        where_sql = ""
        order_sql = " ORDER BY id DESC"

    count_sql = f"SELECT COUNT(*) AS c {base}{where_sql}"
    rows_sql = (
        "SELECT id, document_id, title, content, source "
        + base
        + where_sql
        + order_sql
        + f" LIMIT {limit} OFFSET {offset}"
    )
    count_payload = parse_chat_result(manticore_sql(count_sql))
    total = int(count_payload.get("c", 0) or 0)
    items = rows_from_manticore(manticore_sql(rows_sql))
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "backend": "manticore",
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/comments")
def list_comments(
    q: str = Query(default="", description="Free-text query"),
    sort: str = Query(default="relevance", description="relevance|title"),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    q = q.strip()
    sort = sort if sort in SUPPORTED_SORTS else "relevance"
    try:
        return query_comments_from_manticore(q=q, sort=sort, limit=limit, offset=offset)
    except ValueError as exc:
        if is_missing_fiqa_table_error(exc):
            raise HTTPException(status_code=503, detail=INIT_MESSAGE) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if is_missing_fiqa_table_error(exc):
            raise HTTPException(status_code=503, detail=INIT_MESSAGE) from exc
        logger.exception("Manticore search failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Manticore search unavailable: {exc}") from exc


app.post("/api/assistant/chat")(
    create_chat_handler(
        manticore_sql=manticore_sql,
        sql_quote=sql_quote,
        default_table=DEFAULT_TABLE,
        default_model=CHAT_DEFAULT_MODEL,
        vector_fields=VECTOR_FIELDS,
    )
)
