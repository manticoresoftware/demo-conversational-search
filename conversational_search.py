from __future__ import annotations

import json
import logging
from typing import Any, Callable, Optional

from fastapi import HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    conversation_uuid: Optional[str] = None
    table: Optional[str] = None
    model: Optional[str] = None
    fields: Optional[str] = None


def parse_chat_result(payload: dict[str, Any] | list[Any]) -> dict[str, Any]:
    if isinstance(payload, dict):
        if payload.get("error"):
            raise ValueError(str(payload["error"]))
        if "hits" in payload:
            hits = payload.get("hits", {}).get("hits", [])
            if hits:
                return hits[0].get("_source", {})
        return payload

    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict) and first.get("error"):
            raise ValueError(str(first["error"]))
        if isinstance(first, dict) and "columns" in first and "data" in first:
            columns = []
            for col in first.get("columns", []):
                if isinstance(col, dict) and col:
                    columns.append(next(iter(col.keys())))
            data = first.get("data", [])
            if data and columns:
                row0 = data[0]
                if isinstance(row0, list):
                    return dict(zip(columns, row0))
                if isinstance(row0, dict):
                    return row0
        if isinstance(first, dict):
            return first

    return {}


def parse_sources(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return []
    return []


def build_chat_sql(
    message: str,
    table: str,
    model: str,
    conversation_uuid: str | None,
    fields: str | None,
    quote: Callable[[str], str],
) -> str:
    args = [quote(message), quote(table), quote(model)]
    if conversation_uuid is not None or fields is not None:
        args.append(quote(conversation_uuid or ""))
    if fields is not None:
        args.append(quote(fields))
    return f"CALL CHAT({', '.join(args)})"


def create_chat_handler(
    *,
    manticore_sql: Callable[[str], dict[str, Any] | list[Any]],
    sql_quote: Callable[[str], str],
    default_table: str,
    default_model: str,
    vector_fields: str,
):
    def assistant_chat(req: ChatRequest) -> dict[str, Any]:
        message = req.message.strip()
        if not message:
            raise HTTPException(status_code=400, detail="message is required")

        table = (req.table or default_table).strip() or default_table
        model = (req.model or default_model).strip() or default_model
        fields = req.fields.strip() if isinstance(req.fields, str) else (vector_fields or None)
        if isinstance(fields, str) and not fields.strip():
            fields = None
        conversation_uuid = req.conversation_uuid.strip() if req.conversation_uuid else None

        def execute_chat(call_fields: str | None) -> dict[str, Any]:
            sql = build_chat_sql(
                message=message,
                table=table,
                model=model,
                conversation_uuid=conversation_uuid,
                fields=call_fields,
                quote=sql_quote,
            )
            return parse_chat_result(manticore_sql(sql))

        try:
            row = execute_chat(fields)
        except ValueError as exc:
            error_text = str(exc)
            if fields is not None and "expects query, table, model, optional conversation_uuid" in error_text:
                row = execute_chat(None)
            else:
                raise HTTPException(status_code=400, detail=error_text) from exc
        except Exception as exc:
            logger.exception("Conversational search call failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"Conversational search backend unavailable: {exc}") from exc

        if not row:
            raise HTTPException(status_code=500, detail="Empty conversational search response")

        return {
            "conversation_uuid": row.get("conversation_uuid") or conversation_uuid,
            "user_query": row.get("user_query") or message,
            "search_query": row.get("search_query") or "",
            "response": row.get("response") or "",
            "sources": parse_sources(row.get("sources")),
            "items": [],
            "model": model,
            "table": table,
        }

    return assistant_chat
